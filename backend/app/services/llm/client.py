"""Official OpenAI Python SDK client wrapper for MedVerify.

Enforces:
- Backend-only API key handling
- Model configurability via OPENAI_MODEL
- Structured output parsing
- Safe metadata logging without secrets
- Graceful exception translation
"""

import json
import logging
import os
import time
from typing import Optional, Dict, Any, List

from openai import (
    OpenAI,
    AuthenticationError,
    RateLimitError,
    APIConnectionError,
    APITimeoutError,
    BadRequestError,
    OpenAIError,
)

from app.config import settings

logger = logging.getLogger("medverify.ai")

_openai_client: Optional[OpenAI] = None
_client_initialized_key: Optional[str] = None


def get_openai_client() -> Optional[OpenAI]:
    """Retrieve or initialize the singleton OpenAI client.
    
    The API key is strictly retrieved from backend configuration / environment
    and NEVER passed to the frontend or exposed to clients.
    """
    global _openai_client, _client_initialized_key

    api_key = settings.openai_api_key.strip() or os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    if _openai_client is None or _client_initialized_key != api_key:
        try:
            _openai_client = OpenAI(
                api_key=api_key,
                timeout=float(settings.openai_timeout_seconds),
                max_retries=2,
            )
            _client_initialized_key = api_key
            logger.info("Initialized OpenAI client with model: %s", settings.openai_model)
        except Exception as exc:
            logger.error("Failed to initialize OpenAI client: %s", exc)
            return None

    return _openai_client


def is_ai_available() -> tuple[bool, Optional[str]]:
    """Check if the real OpenAI integration is available and configured."""
    api_key = settings.openai_api_key.strip() or os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return False, "OPENAI_API_KEY is not configured in backend environment."
    return True, None


def call_openai_json(
    messages: List[Dict[str, str]],
    model_override: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    """Call OpenAI Chat Completions API enforcing JSON output mode.
    
    Returns the parsed JSON dictionary.
    Raises RuntimeError on failure or if AI is unavailable.
    """
    client = get_openai_client()
    if not client:
        raise RuntimeError("OpenAI service unavailable: OPENAI_API_KEY is missing or invalid.")

    model = model_override or settings.openai_model or "gpt-5.6-luna"
    max_out = max_tokens or settings.openai_max_output_tokens or 1500

    start_time = time.time()
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=temperature,
            max_tokens=max_out,
        )

        latency_ms = int((time.time() - start_time) * 1000)
        usage = response.usage
        tokens_in = usage.prompt_tokens if usage else 0
        tokens_out = usage.completion_tokens if usage else 0

        # Safe observability logging — NO SECRETS
        logger.info(
            "OpenAI call complete. Model: %s | Latency: %dms | Tokens: in=%d, out=%d",
            model,
            latency_ms,
            tokens_in,
            tokens_out,
        )

        raw_content = response.choices[0].message.content or "{}"
        parsed = json.loads(raw_content)
        return parsed

    except AuthenticationError as exc:
        logger.error("OpenAI authentication failed: Invalid API key.")
        raise RuntimeError("OpenAI authentication failed: Invalid or expired API key.") from exc

    except RateLimitError as exc:
        logger.warning("OpenAI rate limit exceeded.")
        raise RuntimeError("OpenAI rate limit reached. Please try again shortly.") from exc

    except (APITimeoutError, APIConnectionError) as exc:
        logger.error("OpenAI connection / timeout error: %s", exc)
        raise RuntimeError("OpenAI service connection timed out. Please retry.") from exc

    except BadRequestError as exc:
        # e.g. unsupported model name or parameters
        logger.error("OpenAI bad request: %s", exc)
        raise RuntimeError(f"OpenAI request rejected: {exc}") from exc

    except json.JSONDecodeError as exc:
        logger.error("Failed to parse JSON response from OpenAI: %s", exc)
        raise RuntimeError("Malformed response from AI model.") from exc

    except OpenAIError as exc:
        logger.error("OpenAI general error: %s", exc)
        raise RuntimeError(f"OpenAI service error: {exc}") from exc


def call_openai_text(
    messages: List[Dict[str, str]],
    model_override: Optional[str] = None,
    temperature: float = 0.3,
    max_tokens: Optional[int] = None,
) -> str:
    """Call OpenAI Chat Completions API returning raw text response."""
    client = get_openai_client()
    if not client:
        raise RuntimeError("OpenAI service unavailable: OPENAI_API_KEY is missing or invalid.")

    model = model_override or settings.openai_model or "gpt-5.6-luna"
    max_out = max_tokens or settings.openai_max_output_tokens or 1500

    start_time = time.time()
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_out,
        )

        latency_ms = int((time.time() - start_time) * 1000)
        logger.info("OpenAI text call complete. Model: %s | Latency: %dms", model, latency_ms)

        return response.choices[0].message.content or ""

    except Exception as exc:
        logger.error("OpenAI text call error: %s", exc)
        raise RuntimeError(f"OpenAI service error: {exc}") from exc
