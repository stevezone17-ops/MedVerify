"""Official Google Gemini Python SDK client wrapper for MedVerify.

Enforces:
- Backend-only API key handling (never exposed to frontend/clients)
- Model verification and configurability via GEMINI_MODEL / backend/.env
- Automatic resilience and fallback if configured model is experiencing demand spikes (503)
- Strict verification safeguards (Gemini never determines authenticity)
- Structured JSON and streaming response support
- Safe metadata logging without secrets or PII
- Graceful exception translation
"""

import json
import logging
import os
import re
import time
from typing import Optional, Dict, Any, List, Generator

from google import genai
from google.genai import types
from google.genai import errors

from app.config import settings

logger = logging.getLogger("medverify.gemini")

_gemini_client: Optional[genai.Client] = None
_client_initialized_key: Optional[str] = None
_verified_active_model: Optional[str] = None
_model_verification_timestamp: float = 0.0
_MODEL_CACHE_TTL_SECONDS = 300.0  # 5 minutes

# Fallback models in order of preference if primary experiences high demand spikes (503)
FALLBACK_MODELS = [
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash",
]


def get_gemini_client() -> Optional[genai.Client]:
    """Retrieve or initialize the singleton Google GenAI client.
    
    The API key is strictly retrieved from backend configuration / environment
    and NEVER passed to the frontend or exposed to clients.
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
            _gemini_client = genai.Client(api_key=api_key)
            _client_initialized_key = api_key
            logger.info("Initialized Google GenAI client successfully.")
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
    """Verify and resolve an active, supported, and available Gemini model.
    
    If the requested model encounters a 503 high-demand spike or is deprecated,
    this seamlessly falls back to an operational model from FALLBACK_MODELS.
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
    if _verified_active_model and (now - _model_verification_timestamp < _MODEL_CACHE_TTL_SECONDS):
        return _verified_active_model

    client = get_gemini_client()
    if not client:
        return configured

    # Test candidate models to ensure availability
    candidates = [configured] + [m for m in FALLBACK_MODELS if m != configured]
    for candidate in candidates:
        try:
            # Minimal ping to test model responsiveness
            cfg = types.GenerateContentConfig(max_output_tokens=3, temperature=0.0)
            client.models.generate_content(
                model=candidate,
                contents="ping",
                config=cfg,
            )
            _verified_active_model = candidate
            _model_verification_timestamp = now
            if candidate != configured:
                logger.warning(
                    "Configured model '%s' unavailable; active model resolved to fallback '%s'",
                    configured,
                    candidate,
                )
            else:
                logger.info("Verified Gemini model '%s' is supported and active.", candidate)
            return candidate
        except errors.ServerError as s_err:
            logger.warning("Model candidate '%s' returned server error (503/demand): %s", candidate, s_err)
            continue
        except errors.ClientError as c_err:
            if "404" in str(c_err) or "not available" in str(c_err).lower():
                logger.warning("Model candidate '%s' not supported/available: %s", candidate, c_err)
                continue
            # If authentication error, raise immediately
            if "401" in str(c_err) or "403" in str(c_err) or "API_KEY_INVALID" in str(c_err):
                raise RuntimeError("Invalid or unauthorized GEMINI_API_KEY.") from c_err
            continue
        except Exception as exc:
            logger.warning("Unexpected probe error for model candidate '%s': %s", candidate, exc)
            continue

    # Fallback to configured or first default if probing was inconclusive
    _verified_active_model = configured
    _model_verification_timestamp = now
    return configured


def clean_json_text(text: str) -> str:
    """Strip markdown code fence wrappers from model responses."""
    text = text.strip()
    if text.startswith("```"):
        # Match ```json ... ``` or ``` ... ```
        pattern = r"^```(?:json)?\s*([\s\S]*?)\s*```$"
        match = re.match(pattern, text, re.IGNORECASE)
        if match:
            text = match.group(1).strip()
    return text


def call_gemini_json(
    system_instruction: str,
    user_prompt: str,
    history: Optional[List[Dict[str, str]]] = None,
    response_schema: Optional[Any] = None,
    model_override: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    """Call Google Gemini API enforcing structured JSON output mode.
    
    Supports optional conversation history for multi-turn conversational memory.
    If response_schema (Pydantic model or schema dict) is provided,
    guarantees strict schema enforcement by Google Gemini.
    Returns the parsed JSON dictionary.
    Raises RuntimeError on failure or if AI is unavailable.
    """
    client = get_gemini_client()
    if not client:
        raise RuntimeError("Gemini service unavailable: GEMINI_API_KEY is missing or invalid.")

    model = resolve_active_model(model_override)
    max_out = max_tokens or getattr(settings, "gemini_max_output_tokens", 2500) or 2500

    config_kwargs: Dict[str, Any] = {
        "system_instruction": system_instruction,
        "response_mime_type": "application/json",
        "temperature": temperature,
        "max_output_tokens": max_out,
    }
    if response_schema is not None:
        config_kwargs["response_schema"] = response_schema

    config = types.GenerateContentConfig(**config_kwargs)

    # Build contents with optional conversation history
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

    start_time = time.time()
    try:
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )

        latency_ms = int((time.time() - start_time) * 1000)
        logger.info(
            "Gemini JSON call complete. Model: %s | Latency: %dms",
            model,
            latency_ms,
        )

        raw_content = response.text or "{}"
        cleaned = clean_json_text(raw_content)
        parsed = json.loads(cleaned)
        return parsed

    except errors.ClientError as c_err:
        err_msg = str(c_err)
        if "401" in err_msg or "403" in err_msg or "API_KEY_INVALID" in err_msg:
            raise RuntimeError("Gemini authentication failed: Invalid or expired API key.") from c_err
        if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
            raise RuntimeError("Gemini API quota or rate limit exceeded. Please wait a moment.") from c_err
        raise RuntimeError(f"Gemini client error: {err_msg}") from c_err

    except errors.ServerError as s_err:
        err_msg = str(s_err)
        if "503" in err_msg or "UNAVAILABLE" in err_msg:
            # Attempt one emergency fallback with alternative model
            try:
                alt_model = "gemini-3.5-flash" if model != "gemini-3.5-flash" else "gemini-3.1-flash-lite"
                logger.info("Retrying JSON generation on alternative model '%s' after 503...", alt_model)
                retry_response = client.models.generate_content(
                    model=alt_model,
                    contents=contents,
                    config=config,
                )
                cleaned = clean_json_text(retry_response.text or "{}")
                return json.loads(cleaned)
            except Exception as retry_exc:
                logger.error("Alternative model retry failed: %s", retry_exc)
            raise RuntimeError("Gemini service is currently experiencing high demand. Please try again.") from s_err
        raise RuntimeError(f"Gemini server error: {err_msg}") from s_err
        raise RuntimeError(f"Gemini server error: {err_msg}") from s_err

    except json.JSONDecodeError as j_err:
        logger.error("Failed to parse JSON response from Gemini: %s", j_err)
        raise RuntimeError("Malformed response from AI model.") from j_err

    except Exception as exc:
        logger.error("Gemini general error: %s", exc)
        raise RuntimeError(f"Gemini service error: {exc}") from exc


def call_gemini_chat(
    history: List[Dict[str, str]],
    message: str,
    system_instruction: str,
    model_override: Optional[str] = None,
    temperature: float = 0.3,
    max_tokens: Optional[int] = None,
) -> str:
    """Conduct a genuine multi-turn conversational exchange with Google Gemini.
    
    Accepts conversation history: list of {'role': 'user' | 'assistant' | 'model', 'content': str}.
    """
    client = get_gemini_client()
    if not client:
        raise RuntimeError("Gemini service unavailable: GEMINI_API_KEY is missing or invalid.")

    model = resolve_active_model(model_override)
    max_out = max_tokens or getattr(settings, "gemini_max_output_tokens", 1500) or 1500

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        temperature=temperature,
        max_output_tokens=max_out,
    )

    # Format history into google-genai Content objects
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

    start_time = time.time()
    try:
        chat = client.chats.create(model=model, config=config, history=sdk_history)
        response = chat.send_message(message)

        latency_ms = int((time.time() - start_time) * 1000)
        logger.info("Gemini Chat call complete. Model: %s | Latency: %dms", model, latency_ms)

        return response.text or ""

    except errors.ClientError as c_err:
        err_msg = str(c_err)
        if "401" in err_msg or "403" in err_msg:
            raise RuntimeError("Gemini authentication failed: Invalid API key.") from c_err
        if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
            raise RuntimeError("Gemini rate limit exceeded. Please wait a moment.") from c_err
        raise RuntimeError(f"Gemini client error: {err_msg}") from c_err

    except errors.ServerError as s_err:
        err_msg = str(s_err)
        if "503" in err_msg or "UNAVAILABLE" in err_msg:
            # Fallback to alternate model
            try:
                alt_model = "gemini-3.5-flash" if model != "gemini-3.5-flash" else "gemini-3.1-flash-lite"
                logger.info("Retrying chat on alternative model '%s' after 503...", alt_model)
                chat = client.chats.create(model=alt_model, config=config, history=sdk_history)
                return chat.send_message(message).text or ""
            except Exception as retry_exc:
                logger.error("Alternative model retry failed: %s", retry_exc)
            raise RuntimeError("Gemini service is currently experiencing high demand. Please try again.") from s_err
        raise RuntimeError(f"Gemini server error: {err_msg}") from s_err

    except Exception as exc:
        logger.error("Gemini chat error: %s", exc)
        raise RuntimeError(f"Gemini chat error: {exc}") from exc


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
        raise RuntimeError("Gemini service unavailable: GEMINI_API_KEY is missing or invalid.")

    model = resolve_active_model(model_override)
    max_out = max_tokens or getattr(settings, "gemini_max_output_tokens", 1500) or 1500

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
        raise RuntimeError(f"Gemini streaming error: {exc}") from exc


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


def call_gemini_vision_json(
    system_instruction: str,
    user_prompt: str,
    images: List[Dict[str, Any]],
    response_schema: Optional[Any] = None,
    model_override: Optional[str] = None,
    temperature: float = 0.1,
    max_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    """Call Google Gemini multimodal model with packaging images and user instructions.
    
    Extracts visual OCR, barcodes, and packaging observations enforcing structured JSON response.
    """
    client = get_gemini_client()
    if not client:
        raise RuntimeError("Gemini service unavailable: GEMINI_API_KEY is missing or invalid.")

    model = resolve_active_model(model_override)
    max_out = max_tokens or getattr(settings, "gemini_max_output_tokens", 3000) or 3000

    config_kwargs: Dict[str, Any] = {
        "system_instruction": system_instruction,
        "response_mime_type": "application/json",
        "temperature": temperature,
        "max_output_tokens": max_out,
    }
    if response_schema is not None:
        config_kwargs["response_schema"] = response_schema

    config = types.GenerateContentConfig(**config_kwargs)

    # Build multimodal content parts
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

    except errors.ClientError as c_err:
        err_msg = str(c_err)
        if "401" in err_msg or "403" in err_msg or "API_KEY_INVALID" in err_msg:
            raise RuntimeError("Gemini authentication failed: Invalid or expired API key.") from c_err
        if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
            raise RuntimeError("Gemini API quota or rate limit exceeded. Please wait a moment.") from c_err
        raise RuntimeError(f"Gemini client error: {err_msg}") from c_err

    except errors.ServerError as s_err:
        err_msg = str(s_err)
        raise RuntimeError(f"Gemini server error: {err_msg}") from s_err

    except json.JSONDecodeError as j_err:
        logger.error("Failed to parse JSON response from Gemini Vision: %s", j_err)
        raise RuntimeError("Malformed response from AI vision model.") from j_err

    except Exception as exc:
        logger.error("Gemini vision general error: %s", exc)
        raise RuntimeError(f"Gemini vision service error: {exc}") from exc

