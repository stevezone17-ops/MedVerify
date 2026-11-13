# MedVerify Google Gemini Service Architecture & Configuration

**Author:** MedVerify Platform Engineering Team  
**System:** MedVerify Google Gemini LLM Layer (FastAPI Backend + Google GenAI SDK)  
**Status:** Released & Validated in Production  

---

## 1. Architecture Overview

The MedVerify AI layer provides clinical-grade explanatory assistance, packaging OCR normalisation, and regulatory analytics. It acts strictly as an explanatory decision-support assistant and is explicitly forbidden from overriding the deterministic 6-factor forensic verification engine.

```
┌────────────────────────────────────────────────────────┐
│            MedVerify React Frontend Client            │
│  - AskMedVerifyDrawer / PackagingScanner              │
│  - Dedicated AI timeout: 45,000ms                      │
│  - Categorized error UI & non-duplicating retry       │
└───────────────────────────┬────────────────────────────┘
                            │ (POST /api/ai/chat)
                            ▼
┌────────────────────────────────────────────────────────┐
│                FastAPI AI Router                       │
│  - Async non-blocking endpoints                        │
│  - Concurrency Limiter: asyncio.Semaphore(10)          │
│  - Per-request deadline enforcement: asyncio.wait_for  │
└───────────────────────────┬────────────────────────────┘
                            │ (asyncio.to_thread)
                            ▼
┌────────────────────────────────────────────────────────┐
│           MedVerify LLM Service Layer                  │
│  - Bounded conversational memory (turns & chars)       │
│  - Sliding-window rate limiting                        │
│  - Deterministic failsafe fallback engine              │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│         Google GenAI SDK Client Wrapper                │
│  - Explicit HTTP timeout (HttpOptions.timeout)         │
│  - Lightweight model resolution via models.get         │
│  - Strict exception translation & quota detection      │
└───────────────────────────┬────────────────────────────┘
                            │ (HTTPS REST / RPC)
                            ▼
┌────────────────────────────────────────────────────────┐
│            Google Gemini Generative AI API             │
│  - Primary Model: gemini-3.5-flash                     │
│  - Structured JSON schema enforcement                  │
└────────────────────────────────────────────────────────┘
```

---

## 2. Environment Variables & Backend Configuration

The configuration parameters are defined in `backend/app/config.py` and sourced securely from `backend/.env` without exposing credentials:

| Environment Variable | Default Value | Description |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | *(Secret)* | Backend-only Google GenAI API key. Never sent to frontend or logged. |
| `GEMINI_MODEL` | `gemini-3.5-flash` | Configured Gemini model identifier. Validated without silent swapping. |
| `GEMINI_TIMEOUT_SECONDS` | `25.0` | Explicit HTTP request deadline passed to Google GenAI SDK `HttpOptions`. |
| `GEMINI_CONNECT_TIMEOUT_SECONDS` | `10.0` | Maximum duration to establish TCP connection with Google servers. |
| `GEMINI_OVERALL_TIMEOUT_SECONDS` | `45.0` | Route-level safety cutoff wrapping background threads. |
| `GEMINI_MAX_OUTPUT_TOKENS` | `2500` | Token generation ceiling to prevent runaway responses. |
| `GEMINI_RATE_LIMIT_PER_MINUTE` | `40` | Sliding window rate limit per user for consumer queries. |
| `GEMINI_ADMIN_RATE_LIMIT_PER_MINUTE`| `60` | Higher rate limit ceiling for regulatory administrators. |

---

## 3. Explicit HTTP Timeout Configuration

In the official Google GenAI Python SDK (`google-genai`), timeouts must be configured via `types.HttpOptions` upon client initialization:

```python
timeout_sec = float(getattr(settings, "gemini_timeout_seconds", 25.0) or 25.0)
timeout_ms = int(timeout_sec * 1000)
http_options = types.HttpOptions(timeout=timeout_ms)
_gemini_client = genai.Client(api_key=api_key, http_options=http_options)
```

> **Note:** `types.HttpOptions.timeout` expects **milliseconds** (`int`). Passing raw seconds results in premature termination (e.g., 25ms instead of 25,000ms).

---

## 4. Model Verification & Fast Failover

To prevent adding 1.5–2.5 seconds of generation overhead on queries:
1. `resolve_active_model()` verifies the configured model via `client.models.get(model=configured)` rather than generating dummy tokens.
2. The verification status is cached for 3,600 seconds (1 hour).
3. If an invalid model identifier is specified in `.env`, the system raises `GeminiModelError` immediately rather than silently substituting an unapproved model.

---

## 5. Exception Classification Hierarchy

All low-level SDK and HTTP exceptions are translated into structured, typed exceptions:

```python
class GeminiServiceError(RuntimeError):
    """Base exception for all Gemini AI service errors."""

class GeminiAuthError(GeminiServiceError):
    """Raised when API key is missing, unauthorized, or expired (401/403)."""

class GeminiQuotaError(GeminiServiceError):
    """Raised when rate limits or daily free tier quotas are exceeded (429)."""

class GeminiModelError(GeminiServiceError):
    """Raised when configured model identifier is not found or unsupported (404)."""

class GeminiTimeoutError(GeminiServiceError):
    """Raised when request exceeds client or provider deadline (504)."""

class GeminiUnavailableError(GeminiServiceError):
    """Raised when Gemini service is experiencing high demand spikes (503)."""
```

---

## 6. Asynchronous Safety & Concurrency Safeguards

1. **Non-Blocking Threadpool:** FastAPI routes execute AI inference via `asyncio.to_thread()`, keeping the main asyncio event loop responsive for concurrent requests.
2. **Concurrency Limiter:** An `asyncio.Semaphore(10)` ensures that no more than 10 simultaneous Gemini requests can execute, preventing CPU and memory exhaustion.
3. **Conversational Memory Capping:**
   - Maximum Turns: 6 dialog turns (12 messages).
   - Maximum Character Budget: 4,000 total characters.
   - Older messages are pruned automatically before payload transmission.
4. **Input Length Safeguard:** User questions exceeding 2,500 characters are rejected at the route layer with HTTP 400 Bad Request.
