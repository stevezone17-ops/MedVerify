"""Official Google Gemini Python SDK client wrapper for MedVerify.

Enforces:
- Backend-only API key handling (never exposed to frontend/clients)
- Explicit HTTP timeout configuration via settings.gemini_timeout_seconds
- Model verification and configurability via GEMINI_MODEL / backend/.env (no silent switching)
- Structured JSON and streaming response support
- Safe metadata logging without secrets or PII
- Bounded retries with exponential backoff for transient errors
- Specific exception classification (auth, quota, model, timeout, unavailable)
"""

import json
import logging
import os
import re
import time
from typing import Optional, Dict, Any, List, Generator

import httpx
from google import genai
from google.genai import types
from google.genai import errors

from app.config import settings

logger = logging.getLogger("medverify.gemini")

# ---------------------------------------------------------------------------
# Specific Exception Hierarchy for Gemini Operations
# ---------------------------------------------------------------------------

class GeminiServiceError(RuntimeError):
    """Base exception for all Gemini AI service errors."""
    pass


class GeminiAuthError(GeminiServiceError):
    """Raised when the Gemini API key is missing, invalid, or unauthorized."""
    pass


class GeminiQuotaError(GeminiServiceError):
    """Raised when Gemini API quota or rate limit is exceeded."""
    pass


class GeminiModelError(GeminiServiceError):
    """Raised when the configured Gemini model is invalid, deprecated, or not found."""
    pass


class GeminiTimeoutError(GeminiServiceError):
    """Raised when Gemini generation exceeds the configured deadline."""
    pass


class GeminiUnavailableError(GeminiServiceError):
    """Raised when Gemini service is temporarily down, overloaded, or returned 503."""
    pass


# ---------------------------------------------------------------------------
# Client State and Model Caching
# ---------------------------------------------------------------------------

_gemini_client: Optional[genai.Client] = None
_client_initialized_key: Optional[str] = None
_verified_active_model: Optional[str] = None
_model_verification_timestamp: float = 0.0
_MODEL_CACHE_TTL_SECONDS = 3600.0  # 1 hour cache to avoid unnecessary calls

MAX_TRANSIENT_RETRIES = 2
INITIAL_RETRY_BACKOFF_SECONDS = 1.0


def get_gemini_client() -> Optional[genai.Client]:
    """Retrieve or initialize the singleton Google GenAI client.
    
    The API key is strictly retrieved from backend configuration / environment
    and NEVER passed to the frontend or exposed to clients.
    Configures explicit HTTP timeouts from settings.gemini_timeout_seconds.
    """
    global _gemini_client, _client_initialized_key

    api_key = (
        getattr(settings, "gemini_api_key", "").strip()
        or os.environ.get("GEMINI_API_KEY", "").strip()
    )
    if not api_key:
        return None

    if _gemini_client is None or _client_initialized_key != api_key:
        try:
            timeout_sec = float(getattr(settings, "gemini_timeout_seconds", 35.0) or 35.0)
            timeout_ms = int(timeout_sec * 1000)
            http_options = types.HttpOptions(timeout=timeout_ms)
            _gemini_client = genai.Client(api_key=api_key, http_options=http_options)
            _client_initialized_key = api_key
            logger.info("Initialized Google GenAI client with explicit timeout=%dms.", timeout_ms)
        except Exception as exc:
            logger.error("Failed to initialize Google GenAI client: %s", exc)
            return None

    return _gemini_client


def is_ai_available() -> tuple[bool, Optional[str]]:
    """Check if the real Gemini integration is available and configured."""
    api_key = (
        getattr(settings, "gemini_api_key", "").strip()
        or os.environ.get("GEMINI_API_KEY", "").strip()
    )
    if not api_key:
        return False, "GEMINI_API_KEY is not configured in backend environment."
    return True, None


def resolve_active_model(model_override: Optional[str] = None) -> str:
    """Verify and resolve the active Gemini model.
    
    Verifies that the configured model exists and is accessible.
    Strict rule: Never silently switch models if the configured model is unavailable;
    instead, report the exact configuration issue to the operator.
    """
    global _verified_active_model, _model_verification_timestamp

    if model_override:
        return model_override

    configured = (
        getattr(settings, "gemini_model", "").strip()
        or os.environ.get("GEMINI_MODEL", "").strip()
        or "gemini-3.5-flash"
    )

    now = time.time()
    if _verified_active_model == configured and (now - _model_verification_timestamp < _MODEL_CACHE_TTL_SECONDS):
        return _verified_active_model

    client = get_gemini_client()
    if not client:
        return configured

    try:
        # Lightweight metadata verification without generating tokens or spending quota
        model_info = client.models.get(model=configured)
        _verified_active_model = configured
        _model_verification_timestamp = now
        logger.info(
            "Verified configured Gemini model '%s' (%s) is active and accessible.",
            configured,
            getattr(model_info, "display_name", "Gemini Model"),
        )
        return configured
    except errors.ClientError as c_err:
        err_msg = str(c_err)
        if "401" in err_msg or "403" in err_msg or "API_KEY_INVALID" in err_msg:
            raise GeminiAuthError("Gemini authentication failed: Invalid or expired API key.") from c_err
        if "404" in err_msg or "not found" in err_msg.lower():
            raise GeminiModelError(
                f"Configured Gemini model '{configured}' was not found or is unsupported for this API key. "
                f"Please update GEMINI_MODEL in backend/.env to a valid model identifier."
            ) from c_err
        if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
            # If rate-limited on probe, trust configured model temporarily
            logger.warning("Rate-limited during model probe, using configured '%s': %s", configured, c_err)
            _verified_active_model = configured
            _model_verification_timestamp = now
            return configured
        raise GeminiServiceError(f"Gemini client error resolving model: {err_msg}") from c_err
    except errors.ServerError as s_err:
        # Transient server error on probe, trust configured model
        logger.warning("Server error during model probe for '%s': %s", configured, s_err)
        _verified_active_model = configured
        _model_verification_timestamp = now
        return configured
    except Exception as exc:
        logger.warning("Unexpected probe error for model '%s': %s", configured, exc)
        _verified_active_model = configured
        _model_verification_timestamp = now
        return configured


def clean_json_text(text: str) -> str:
    """Strip markdown code fence wrappers from model responses."""
    text = text.strip()
    if text.startswith("```"):
        pattern = r"^```(?:json)?\s*([\s\S]*?)\s*```$"
        match = re.match(pattern, text, re.IGNORECASE)
        if match:
            text = match.group(1).strip()
    return text


def _translate_gemini_error(exc: Exception, timeout_seconds: float) -> GeminiServiceError:
    """Translate raw SDK and network exceptions into categorized MedVerify exceptions."""
    if isinstance(exc, (httpx.TimeoutException, TimeoutError)):
        return GeminiTimeoutError(
            f"Gemini generation timed out after {timeout_seconds:.1f}s. Please try again."
        )

    if isinstance(exc, errors.ClientError):
        err_msg = str(exc)
        if "401" in err_msg or "403" in err_msg or "API_KEY_INVALID" in err_msg:
            return GeminiAuthError("Gemini authentication failed: Invalid or expired API key.")
        if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
            return GeminiQuotaError("Gemini API quota or rate limit exceeded. Please wait a moment.")
        if "404" in err_msg or "not found" in err_msg.lower():
            return GeminiModelError("Configured Gemini model not found or unavailable.")
        return GeminiServiceError(f"Gemini client error: {err_msg}")

    if isinstance(exc, errors.ServerError):
        err_msg = str(exc)
        if "503" in err_msg or "UNAVAILABLE" in err_msg or "high demand" in err_msg.lower():
            return GeminiUnavailableError("Gemini service is currently experiencing high demand. Please try again.")
        return GeminiUnavailableError(f"Gemini server error: {err_msg}")

    if isinstance(exc, json.JSONDecodeError):
        return GeminiServiceError("Malformed response received from AI model.")

    if isinstance(exc, GeminiServiceError):
        return exc

    return GeminiServiceError(f"Gemini service error: {exc}")


def call_gemini_json(
    system_instruction: str,
    user_prompt: str,
    history: Optional[List[Dict[str, str]]] = None,
    response_schema: Optional[Any] = None,
    model_override: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    """Call Google Gemini API enforcing structured JSON output mode with bounded retry."""
    client = get_gemini_client()
    if not client:
        raise GeminiAuthError("Gemini service unavailable: GEMINI_API_KEY is missing or invalid.")

    model = resolve_active_model(model_override)
    max_out = max_tokens or getattr(settings, "gemini_max_output_tokens", 2500) or 2500
    timeout_sec = float(getattr(settings, "gemini_timeout_seconds", 35.0) or 35.0)

    config_kwargs: Dict[str, Any] = {
        "system_instruction": system_instruction,
        "response_mime_type": "application/json",
        "temperature": temperature,
        "max_output_tokens": max_out,
    }
    if response_schema is not None:
        config_kwargs["response_schema"] = response_schema

    config = types.GenerateContentConfig(**config_kwargs)

    contents: List[types.Content] = []
    if history:
        for turn in history:
            raw_role = turn.get("role", "user")
            role = "model" if raw_role in ("assistant", "model") else "user"
            content_text = turn.get("content", "").strip()
            if content_text:
                contents.append(
                    types.Content(
                        role=role,
                        parts=[types.Part.from_text(text=content_text)],
                    )
                )

    contents.append(
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=user_prompt)],
        )
    )

    attempt = 0
    backoff = INITIAL_RETRY_BACKOFF_SECONDS
    last_err: Optional[Exception] = None

    while attempt <= MAX_TRANSIENT_RETRIES:
        attempt += 1
        start_time = time.time()
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )

            latency_ms = int((time.time() - start_time) * 1000)
            logger.info("Gemini JSON call complete. Model: %s | Latency: %dms", model, latency_ms)

            raw_content = response.text or "{}"
            cleaned = clean_json_text(raw_content)
            parsed = json.loads(cleaned)
            return parsed

        except errors.ServerError as s_err:
            last_err = s_err
            err_msg = str(s_err)
            if ("503" in err_msg or "UNAVAILABLE" in err_msg) and attempt <= MAX_TRANSIENT_RETRIES:
                logger.warning(
                    "Transient 503 from Gemini on attempt %d/%d. Backing off %.1fs...",
                    attempt,
                    MAX_TRANSIENT_RETRIES + 1,
                    backoff,
                )
                time.sleep(backoff)
                backoff *= 2.0
                continue
            raise _translate_gemini_error(s_err, timeout_sec) from s_err

        except Exception as exc:
            raise _translate_gemini_error(exc, timeout_sec) from exc

    if last_err:
        raise _translate_gemini_error(last_err, timeout_sec)
    raise GeminiServiceError("Gemini call failed after retries.")


def call_gemini_chat(
    history: List[Dict[str, str]],
    message: str,
    system_instruction: str,
    model_override: Optional[str] = None,
    temperature: float = 0.3,
    max_tokens: Optional[int] = None,
) -> str:
    """Conduct a genuine multi-turn conversational exchange with Google Gemini."""
    client = get_gemini_client()
    if not client:
        raise GeminiAuthError("Gemini service unavailable: GEMINI_API_KEY is missing or invalid.")

    model = resolve_active_model(model_override)
    max_out = max_tokens or getattr(settings, "gemini_max_output_tokens", 1500) or 1500
    timeout_sec = float(getattr(settings, "gemini_timeout_seconds", 35.0) or 35.0)

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        temperature=temperature,
        max_output_tokens=max_out,
    )

    sdk_history: List[types.Content] = []
    for turn in history:
        raw_role = turn.get("role", "user")
        role = "model" if raw_role in ("assistant", "model") else "user"
        content_text = turn.get("content", "").strip()
        if content_text:
            sdk_history.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=content_text)],
                )
            )

    attempt = 0
    backoff = INITIAL_RETRY_BACKOFF_SECONDS
    last_err: Optional[Exception] = None

    while attempt <= MAX_TRANSIENT_RETRIES:
        attempt += 1
        start_time = time.time()
        try:
            chat = client.chats.create(model=model, config=config, history=sdk_history)
            response = chat.send_message(message)

            latency_ms = int((time.time() - start_time) * 1000)
            logger.info("Gemini Chat call complete. Model: %s | Latency: %dms", model, latency_ms)
            return response.text or ""

        except errors.ServerError as s_err:
            last_err = s_err
            err_msg = str(s_err)
            if ("503" in err_msg or "UNAVAILABLE" in err_msg) and attempt <= MAX_TRANSIENT_RETRIES:
                logger.warning(
                    "Transient 503 from Gemini Chat on attempt %d/%d. Backing off %.1fs...",
                    attempt,
                    MAX_TRANSIENT_RETRIES + 1,
                    backoff,
                )
                time.sleep(backoff)
                backoff *= 2.0
                continue
            raise _translate_gemini_error(s_err, timeout_sec) from s_err

        except Exception as exc:
            raise _translate_gemini_error(exc, timeout_sec) from exc

    if last_err:
        raise _translate_gemini_error(last_err, timeout_sec)
    raise GeminiServiceError("Gemini chat failed after retries.")


def stream_gemini_chat(
    history: List[Dict[str, str]],
    message: str,
    system_instruction: str,
    model_override: Optional[str] = None,
    temperature: float = 0.3,
    max_tokens: Optional[int] = None,
) -> Generator[str, None, None]:
    """Stream response tokens chunk by chunk for real-time conversational streaming."""
    client = get_gemini_client()
    if not client:
        raise GeminiAuthError("Gemini service unavailable: GEMINI_API_KEY is missing or invalid.")

    model = resolve_active_model(model_override)
    max_out = max_tokens or getattr(settings, "gemini_max_output_tokens", 1500) or 1500
    timeout_sec = float(getattr(settings, "gemini_timeout_seconds", 35.0) or 35.0)

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        temperature=temperature,
        max_output_tokens=max_out,
    )

    sdk_history: List[types.Content] = []
    for turn in history:
        raw_role = turn.get("role", "user")
        role = "model" if raw_role in ("assistant", "model") else "user"
        content_text = turn.get("content", "").strip()
        if content_text:
            sdk_history.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=content_text)],
                )
            )

    try:
        chat = client.chats.create(model=model, config=config, history=sdk_history)
        stream = chat.send_message_stream(message)
        for chunk in stream:
            if chunk.text:
                yield chunk.text
    except Exception as exc:
        logger.error("Gemini stream error: %s", exc)
        raise _translate_gemini_error(exc, timeout_sec) from exc


def call_gemini_vision_json(
    system_instruction: str,
    user_prompt: str,
    images: List[Dict[str, Any]],
    response_schema: Optional[Any] = None,
    model_override: Optional[str] = None,
    temperature: float = 0.1,
    max_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    """Call Google Gemini multimodal model with packaging images and user instructions."""
    client = get_gemini_client()
    if not client:
        raise GeminiAuthError("Gemini service unavailable: GEMINI_API_KEY is missing or invalid.")

    model = resolve_active_model(model_override)
    max_out = max_tokens or getattr(settings, "gemini_max_output_tokens", 3000) or 3000
    timeout_sec = float(getattr(settings, "gemini_timeout_seconds", 35.0) or 35.0)

    config_kwargs: Dict[str, Any] = {
        "system_instruction": system_instruction,
        "response_mime_type": "application/json",
        "temperature": temperature,
        "max_output_tokens": max_out,
    }
    if response_schema is not None:
        config_kwargs["response_schema"] = response_schema

    config = types.GenerateContentConfig(**config_kwargs)

    parts: List[types.Part] = []
    for idx, img_info in enumerate(images):
        img_bytes = img_info.get("data")
        mime = img_info.get("mime_type", "image/jpeg")
        slot = img_info.get("slot", f"angle_{idx+1}")
        if img_bytes:
            parts.append(types.Part.from_text(text=f"--- PACKAGING PHOTOGRAPH {idx+1} [Slot: {slot}] ---"))
            parts.append(types.Part.from_bytes(data=img_bytes, mime_type=mime))

    parts.append(types.Part.from_text(text=user_prompt))
    contents = [types.Content(role="user", parts=parts)]

    attempt = 0
    backoff = INITIAL_RETRY_BACKOFF_SECONDS
    last_err: Optional[Exception] = None

    while attempt <= MAX_TRANSIENT_RETRIES:
        attempt += 1
        start_time = time.time()
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )

            latency_ms = int((time.time() - start_time) * 1000)
            logger.info(
                "Gemini Vision call complete. Model: %s | Images: %d | Latency: %dms",
                model,
                len(images),
                latency_ms,
            )

            raw_content = response.text or "{}"
            cleaned = clean_json_text(raw_content)
            parsed = json.loads(cleaned)
            return parsed

        except errors.ServerError as s_err:
            last_err = s_err
            err_msg = str(s_err)
            if ("503" in err_msg or "UNAVAILABLE" in err_msg) and attempt <= MAX_TRANSIENT_RETRIES:
                logger.warning(
                    "Transient 503 from Gemini Vision on attempt %d/%d. Backing off %.1fs...",
                    attempt,
                    MAX_TRANSIENT_RETRIES + 1,
                    backoff,
                )
                time.sleep(backoff)
                backoff *= 2.0
                continue
            raise _translate_gemini_error(s_err, timeout_sec) from s_err

        except Exception as exc:
            raise _translate_gemini_error(exc, timeout_sec) from exc

    if last_err:
        raise _translate_gemini_error(last_err, timeout_sec)
    raise GeminiServiceError("Gemini vision call failed after retries.")


# ---------------------------------------------------------------------------
# Compatibility Wrappers for Legacy Interfaces
# ---------------------------------------------------------------------------

def call_openai_json(
    messages: List[Dict[str, str]],
    model_override: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    """Compatibility adapter mapping legacy OpenAI format to Gemini JSON generator."""
    system_instruction = ""
    user_prompt = ""
    for msg in messages:
        if msg.get("role") == "system":
            system_instruction += msg.get("content", "") + "\n\n"
        elif msg.get("role") == "user":
            user_prompt += msg.get("content", "") + "\n\n"

    return call_gemini_json(
        system_instruction=system_instruction.strip(),
        user_prompt=user_prompt.strip(),
        model_override=model_override,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def call_openai_text(
    messages: List[Dict[str, str]],
    model_override: Optional[str] = None,
    temperature: float = 0.3,
    max_tokens: Optional[int] = None,
) -> str:
    """Compatibility adapter mapping legacy OpenAI format to Gemini Chat."""
    system_instruction = ""
    history: List[Dict[str, str]] = []
    last_user_message = ""

    for msg in messages:
        role = msg.get("role")
        content = msg.get("content", "")
        if role == "system":
            system_instruction += content + "\n\n"
        elif role in ("assistant", "model"):
            history.append({"role": "assistant", "content": content})
        elif role == "user":
            if last_user_message:
                history.append({"role": "user", "content": last_user_message})
            last_user_message = content

    return call_gemini_chat(
        history=history,
        message=last_user_message,
        system_instruction=system_instruction.strip(),
        model_override=model_override,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def get_openai_client():
    """Deprecated legacy accessor; returns None as Gemini is the primary engine."""
    return None
