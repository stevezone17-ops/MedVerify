# MedVerify — AI Intelligence Layer Architecture

## 1. LLM Provider
- **Provider**: Official OpenAI API
- **SDK**: `openai>=1.50.0` (Official Python SDK)
- **Execution Endpoint**: Official OpenAI Chat Completions / Responses endpoint
- **Backend Architecture**: All OpenAI calls occur strictly within the FastAPI backend service layer (`backend/app/services/llm/`). The client frontend never has direct access to or knowledge of OpenAI credentials.

---

## 2. Model Configuration
The LLM model is dynamically configurable via environment variables and does not rely on hardcoded model strings throughout application logic.

- **Config Parameter**: `OPENAI_MODEL`
- **Default Model**: `gpt-5.6-luna` (configurable to `gpt-4o`, `gpt-4o-mini`, or any compatible OpenAI model)
- **Token Limits**: `OPENAI_MAX_OUTPUT_TOKENS` (default: 800 tokens)
- **Timeout**: `OPENAI_TIMEOUT_SECONDS` (default: 20 seconds)

### Environment Setup (`backend/.env`)
```bash
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5.6-luna
OPENAI_MAX_OUTPUT_TOKENS=800
OPENAI_TIMEOUT_SECONDS=20
OPENAI_RATE_LIMIT_PER_MINUTE=10
OPENAI_ADMIN_RATE_LIMIT_PER_MINUTE=30
```

---

## 3. API Architecture
```
┌─────────────────────────────────┐
│     React / Vite Frontend       │
└────────────────┬────────────────┘
                 │ (JWT Auth / REST)
                 ▼
┌─────────────────────────────────┐
│        FastAPI Backend          │
│   ├── Auth & RBAC Guard         │
│   ├── Sliding Window Limiter    │
│   └── Verification Engine       │
└────────────────┬────────────────┘
                 │ (Server-to-Server via TLS)
                 ▼
┌─────────────────────────────────┐
│           OpenAI API            │
│  (Strict JSON-Schema Output)    │
└─────────────────────────────────┘
```

### Endpoints
- `GET /api/ai/health`: Real-time status of OpenAI client, active model name, and rate limit ceilings without exposing keys.
- `POST /api/ai/explain-verification`: Plain-language explanation of deterministic verification evidence with language and tone options.
- `POST /api/ai/chat`: Interactive "Ask MedVerify" grounded question-answering assistant with conversation memory.
- `POST /api/ai/normalize-ocr`: Intelligent normalization of noisy packaging OCR text into structured medicine candidates without hallucination.
- `POST /api/admin/ai/analyze`: Executive verification anomaly and forensic synthesis for authorized administrators.

---

## 4. Prompt Architecture & Separation of Concerns
Prompts follow an isolated delimiter pattern separating:
1. **System Persona & Behavioral Rules**: Immutable system prompt defining role, rules, and grounding mandates.
2. **Deterministic Context**: Authoritative JSON/Markdown data produced strictly by backend database queries or GS1 parsers.
3. **Untrusted User / OCR Inputs**: Explicitly labeled untrusted data blocks immune to instruction injection.

---

## 5. Grounding & Anti-Hallucination Mandates
The LLM is an **explanation, interaction, and normalization** layer. It is **NEVER the authenticity decision engine**.

```
Package Scanned / Entered
           ↓
Deterministic Verification Engine (GS1 Parser + Registry Matching)
           ↓
Authoritative Verification Status (VERIFIED, SUSPICIOUS, NOT_REGISTERED, EXPIRED)
           ↓
LLM Explanation Layer (Explains ground truth; cannot alter status or invent records)
```

- If an attribute (e.g. manufacturer, serial, batch) is missing or unverified, the LLM must explicitly report it as unverified.
- The LLM is forbidden from claiming "100% authentic", "Guaranteed safe", or inventing laboratory approvals.

---

## 6. OCR AI Normalization Layer
```
Package Image ➔ OCR Engine (Tesseract/Vision) ➔ Raw OCR Text ➔ LLM Normalization ➔ Candidate Review ➔ Verification Engine
```
- Converts raw string noise (e.g., `AMOXICILIN 500 MG CAPS`) into clean candidate values (`Amoxicillin`, `500 mg`, `Capsules`).
- Fields not present in raw OCR text **must remain null**.
- The user reviews the candidate form before any verification query is executed.

---

## 7. Explain My Result
- **Trigger**: Click `[ ✨ Explain My Result ]` on any verification result page.
- **Tones**:
  - `simple`: Accessible, consumer-friendly explanation focused on practical safety.
  - `technical`: Forensic breakdown of GS1 Application Identifiers, registry matches, and cryptography.
- **Multilingual Support**: English, Hindi (`hi`), Malayalam (`ml`), Tamil (`ta`), Kannada (`kn`). Identifiers (GTIN, batch, serial, dates) remain exact and untranslated.

---

## 8. Ask MedVerify Assistant
- **Trigger**: Floating widget or navbar button `[ ✨ Ask MedVerify ]`.
- Grounded contextual Q&A regarding medicine verifications, GS1 barcodes, batch identifiers, and tamper safety.
- Context injection: When opened from a specific verification result, the backend injects the grounded verification record.

---

## 9. Admin AI Verification Analyst
- **Location**: Admin Command Center (`/admin`).
- **Data Access Principle**: The LLM **never** runs arbitrary SQL queries on Supabase tables.
- **Pipeline**: Admin Request ➔ FastAPI authorized aggregate database query ➔ Structured JSON summary ➔ LLM synthesis ➔ Executive briefing.

---

## 10. Security & Secret Defense
- `OPENAI_API_KEY` is loaded exclusively in `app.config.Settings` via `pydantic_settings`.
- Git repository enforces `.gitignore` on all `.env` files.
- Safe logging: LLM client logs only latency, token usage, model name, and status codes. Secret keys and raw JWT tokens are never logged.

---

## 11. Rate Limiting
- **Consumer Users**: 10 requests / minute per user ID.
- **Administrators**: 30 requests / minute per admin ID.
- Exceeding limit immediately returns `HTTP 429 Too Many Requests`.

---

## 12. Cost & Token Controls
- Strict output caps (`max_tokens: 800`).
- Context truncation: Raw OCR inputs are truncated to 1,500 characters.
- Short conversation history: sliding window of the last 6 messages.
- JSON mode / Structured outputs to avoid verbose rambling.

---

## 13. Critical Failsafe
The LLM intelligence layer is **100% decoupled and non-blocking**:
- If OpenAI is down, timed out, or unconfigured (`OPENAI_API_KEY=""`), the core MedVerify platform remains **100% operational**:
  - Camera scanning continues to function.
  - GS1 barcode parsing continues to function.
  - Database registry verification and scoring continue to function.
  - Medicine Cabinet, Verification History, and Admin Console remain fully accessible.
  - AI endpoints gracefully return deterministic fallbacks or clear, non-disruptive notifications.

---

## 14. Medical Safety Boundary
The assistant strictly enforces the following healthcare boundary:
- **No Medical Advice**: Refuses dosage recommendations, treatment plans, medical diagnoses, or personal drug compatibility checks.
- **Standard Safety Directive**:
  > *"MedVerify is an authentication verification service and does not provide clinical or medical advice. Please consult a licensed physician, pharmacist, or healthcare provider for all medical decisions."*

---

## 15. Privacy & Data Minimization
- No personally identifiable information (PII) is transmitted to OpenAI.
- Verification records are anonymized to identifiers (GTIN, Batch, Status).
- Conversation history is bound by Supabase Row-Level Security (RLS) policies allowing users access only to their own chat threads.
