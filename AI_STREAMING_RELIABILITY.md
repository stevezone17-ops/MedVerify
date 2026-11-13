# MedVerify AI Assistant Streaming Response Pipeline

**Author:** MedVerify Platform Engineering Team  
**Component:** Real-Time Token Streaming (`POST /api/ai/chat/stream`)  
**Status:** Validated & Released  

---

## 1. Overview & Objectives

In non-streaming mode, generating a multi-factor grounded response using structured JSON and Pydantic validation can take 12 to 18 seconds. Real-time token streaming reduces perceived latency to **under 1.5 seconds** by emitting text chunks progressively as Google Gemini produces tokens.

---

## 2. Protocol & Header Specifications

The streaming endpoint returns plain UTF-8 text chunks over HTTP chunked transfer encoding with zero buffering:

```http
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

- `X-Accel-Buffering: no`: Instructs reverse proxies (Nginx / Cloudflare) not to buffer tokens in transit.
- `Cache-Control: no-transform`: Prevents intermediate gateways from compressing or delaying delivery.

---

## 3. Backend Streaming Architecture

In `backend/app/services/llm/service.py`:
```python
def stream_ask_medverify(
    self,
    req: AskMedVerifyRequest,
    user_id: str = "anonymous",
) -> Generator[str, None, None]:
```

### Safety & Reliability Guarantees:
1. **Offline / Outage Fallback:** If `is_ai_available()` is False or daily quota is exhausted, the generator immediately yields the full deterministic fallback text.
2. **Atomic Memory Commitment:** Tokens are collected in a local buffer during iteration. Only when the stream finishes cleanly (`stream_completed_cleanly = True`) is the turn added to `_conversation_memory`.
3. **Mid-Stream Error Boundary:** If Google's API drops or fails midway, an error event is yielded (`\n[Stream interrupted: ...]`), and the corrupted partial response is **discarded** from memory.
4. **Client Disconnect Cleanup:** Python generator finalizers execute when the client closes the socket, releasing backend resources.

---

## 4. Frontend Client Implementation

In `frontend/src/api/client.ts`, the streaming helper uses modern Fetch API streaming primitives:

```typescript
export async function streamAskMedVerify(
  data: { question: string; verification_id?: string; conversation_id?: string; language?: string },
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const token = localStorage.getItem('medverify_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(buildEndpointUrl('/api/ai/chat/stream'), {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new MedVerifyApiError(body.detail || `HTTP ${res.status}`, 'SERVER_ERROR', { status: res.status });
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    fullText += chunk;
    onChunk(chunk);
  }

  return fullText;
}
```

---

## 5. Performance Comparison

| Metric | Non-Streaming (`/api/ai/chat`) | Streaming (`/api/ai/chat/stream`) | Improvement |
| :--- | :--- | :--- | :--- |
| **Time to First Token (TTFT)** | ~15,500ms | **~1,250ms** | **92% reduction** |
| **Client Perceived Responsiveness** | Frozen spinner for 15s | Real-time typing feedback | Immediate engagement |
| **Failure Recovery** | Abort timeout at deadline | Instant notification | Clear error boundary |
| **Memory Safety** | Schema validation | Buffer committed on completion | Zero corrupted turns |
