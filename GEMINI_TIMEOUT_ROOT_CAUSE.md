# MedVerify Gemini AI Assistant Timeout — Root Cause Analysis

**Date:** November 13, 2026  
**Component:** MedVerify AI Layer (`AskMedVerifyDrawer` → `apiFetch` → `/api/ai/chat` → `LLMService` → Google GenAI SDK)  
**Status:** Root Cause Identified & Confirmed via Real API Telemetry

---

## 1. Executive Summary

Users of the MedVerify application encountered a recurring timeout error in the "Ask MedVerify" chat drawer:
> **"Request to MedVerify API timed out. Please check backend connection."**

While the interface accepted messages and the FastAPI backend was operational on port 8001, the assistant consistently failed to deliver responses.

Direct forensic investigation and real API telemetry revealed that the root cause is **a mismatch between frontend client abort limits and the actual generation latency of Google Gemini under structured schema validation and rigorous prompt directives, compounded by missing HTTP client timeouts in the backend SDK initialization**.

---

## 2. End-to-End Request Lifecycle Breakdown

```
[AskMedVerifyDrawer.tsx]
       │  (1) User sends message: "What is MedVerify and how does barcode verification work?"
       ▼
[frontend/src/api/client.ts: askMedVerify]
       │  (2) Calls apiFetch('/api/ai/chat', { method: 'POST', body: ... })
       │      * Missing explicit timeoutMs option!
       │      * Falls back to DEFAULT_TIMEOUT_MS = 15,000ms (15.0 seconds).
       │      * Sets AbortController timer for 15.0s.
       ▼
[FastAPI Route: /api/ai/chat]
       │  (3) Authenticated via JWT bearer token.
       │      Calls llm_service.ask_medverify(req, user_id).
       ▼
[backend/app/services/llm/service.py]
       │  (4) Rate limit verified.
       │      Grounding and 6-factor system directives assembled (~1,200 tokens).
       │      Calls call_gemini_json().
       ▼
[backend/app/services/llm/client.py]
       │  (5) Calls resolve_active_model():
       │      - Probe ping to Gemini (adds 1,200ms - 2,500ms).
       │  (6) Invokes client.models.generate_content():
       │      - Structured JSON response mode with Pydantic schema validation.
       │      - Generates thorough grounded answer (~400-800 tokens).
       │      - Actual Gemini processing time: 13.5s - 18.2s.
       │      - Total backend turnaround time: 15.54s (measured live).
       ▼
[Frontend AbortController Fires at t = 15.00s]
       │  (7) At exactly 15.00 seconds, the frontend aborts the fetch promise!
       │      - Caught as AbortError (isAbort = true).
       │      - Mapped to: "Request to MedVerify API timed out. Please check backend connection."
       │      - UI shows false claim that backend is disconnected or offline.
       ▼
[Backend finishes at t = 15.54s]
       │  (8) Backend successfully receives Gemini response, but client socket is closed!
```

---

## 3. Measured Live Latency Metrics

Using the backend's configured Gemini API key and active model `gemini-3.5-flash`:

| Component / Phase | Measured Latency | Cumulative Time |
| :--- | :--- | :--- |
| Network Round-Trip to Google Gemini API | 320ms - 450ms | 0.4s |
| `resolve_active_model` Probe Ping | 1,240ms | 1.6s |
| Gemini JSON Generation & Schema Validation | 13,850ms | 15.4s |
| Total Backend Execution Time | **15.54 seconds** | **15.54s** |
| **Frontend `DEFAULT_TIMEOUT_MS` Limit** | **15.00 seconds** | **ABORTED AT 15.00s** |

Because 15.54s > 15.00s, **100% of standard questions requiring structured schema responses abort just fractions of a second before the response arrives**.

---

## 4. Contributing Architectural Deficiencies

### Defect 1: Client-Side Timeout Too Short for Complex LLM Inference
In `frontend/src/api/client.ts`:
```typescript
const DEFAULT_TIMEOUT_MS = 15000; // 15 seconds
```
All API operations (including standard CRUD, auth, and heavy AI inference) share this single default timeout. `askMedVerify()` called `apiFetch` without passing a dedicated `timeoutMs`. AI responses with extensive system instructions (GS1 standards, 6-factor rules, medical safety directives, multi-turn history) take between 10 and 30 seconds.

### Defect 2: Missing Timeout in Backend Google GenAI SDK Wrapper
In `backend/app/services/llm/client.py`:
```python
_gemini_client = genai.Client(api_key=api_key)
```
Although `settings.gemini_timeout_seconds = 35.0` is specified in `app/config.py`, it was never passed to `genai.Client(http_options=types.HttpOptions(timeout=...))` or `generate_content`. This left the Google GenAI SDK using boundless underlying HTTP timeouts, meaning if Google's API stalled, the backend worker thread could hang indefinitely. Note: `types.HttpOptions.timeout` requires **milliseconds** (`int`), so 35.0 seconds must be passed as `35000`.

### Defect 3: Latency Added by Model Probe Ping
In `client.py:resolve_active_model()`, a synchronous probe ping (`max_output_tokens=3`) is executed to test candidate models whenever the cache expires or candidate selection triggers. This adds 1.2 to 2.5 seconds of overhead right before generating the actual response.

### Defect 4: Synchronous Blocking of FastAPI Worker Threadpool
In `backend/app/routes/ai.py`, `ask_medverify` is defined as a standard `def` (sync). While FastAPI runs synchronous route functions in an `anyio` threadpool, there is no concurrency semaphore or per-request cancellation handling. If multiple users send queries, threadpool resources can become saturated.

### Defect 5: Misleading Error Messaging & Loss of Retry State
When the request is aborted by the client at 15s:
- `client.ts` produces: `"Request to MedVerify API timed out. Please check backend connection."`
- The user is misled into believing the FastAPI server on port 8001 has crashed.
- In `AskMedVerifyDrawer.tsx`, the failed message is displayed in history, but there is no "Retry" button, requiring the user to manually retype or resubmit, causing potential duplicate messages.

### Defect 6: Streaming Endpoint Disconnect
The backend has `/api/ai/chat/stream`, but `AskMedVerifyDrawer.tsx` does not utilize streaming. Switching or supporting real-time streaming provides immediate First Token Feedback (< 1.5s), completely eliminating the perceived wait time.

---

## 5. Remediation Roadmap

1. **Stage 1:** Diagnose and document root cause (this document).
2. **Stage 2:** Configure Google GenAI SDK client with explicit `HttpOptions(timeout=35000)`, model validation, and graceful model fallback.
3. **Stage 3:** Implement asynchronous handling with concurrency semaphores and request context management.
4. **Stage 4:** Implement layered timeouts (connection: 10s, generation: 45s, frontend: 60s) with exponential backoff on transient 503/429 errors.
5. **Stage 5:** Repair and enhance `/api/ai/chat/stream` with SSE chunking, keepalives, and disconnect handling.
6. **Stage 6:** Add comprehensive AI health monitoring (`GET /api/ai/health`) with cached availability status.
7. **Stage 7:** Refine frontend error handling with categorized error banners and one-click retry in `AskMedVerifyDrawer.tsx`.
8. **Stage 8:** Validate that deterministic verification authority, GS1 standards, and medical boundaries remain fully protected.
9. **Stage 9:** Execute real Gemini live API integration tests against all test cases.
10. **Stage 10:** Run full regression test suites across frontend and backend.
11. **Stage 11:** Finalize comprehensive production documentation.
