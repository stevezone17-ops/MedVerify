# MedVerify — Counterfeit Medicine Detection via Packaging & GS1 Verification

MedVerify is a production-grade pharmaceutical verification platform designed to screen medicine packaging, GS1 2D DataMatrix codes, QR codes, and EAN barcodes against an authoritative manufacturer registry with explainable confidence scoring.

> **Important:** MedVerify is a digital verification and forensic screening engine. A "VERIFIED" result confirms cryptographic cross-referencing against authorized registry parameters; it is not a substitute for physical chemical laboratory testing.

---

## Architecture & Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Framer Motion, Lucide Icons, `@supabase/supabase-js`, HTML5 Camera Scanner with ZXing multi-format decoding.
- **Backend**: FastAPI, Python 3.12, Pydantic v2, `supabase` Python client, JWT Authentication with RBAC.
- **Database & Services**: Supabase PostgreSQL, Supabase Auth, Row Level Security (RLS), Supabase Storage, Supabase Realtime.
- **Verification Engine**: 6-factor weighted deterministic scoring model cross-referencing GTIN, manufacturer license, batch registry, expiration status, and serial reuse prevention.

---

## Core Verification Pipeline

```
[ Medicine Packaging (QR / 2D DataMatrix / Barcode) ]
                         ↓
               [ Browser Camera Scanner ]
                         ↓
            [ GS1 AI & Payload Parser ]
                         ↓
          [ FastAPI Verification Engine ]
                         ↓
   [ Supabase PostgreSQL Registry Cross-Check ]
                         ↓
[ Explainable Verdict & Realtime Admin Audit Stream ]
```

---

## Canonical GS1 Test Barcode

MedVerify is pre-calibrated to process the following live test specimen:

```
(01)89012345678901(10)BATCH-2026-001(17)280109(21)SER-PC-000001
```

**Expected Result:**
- **Product**: Amoxicillin 500 mg Capsules
- **Manufacturer**: PharmaCore Laboratories
- **Status**: `VERIFIED`
- **Confidence**: `85%`

---

## Project Structure

```text
counterfeit_medicine_verification_md/
├── backend/
│   ├── app/
│   │   ├── db/
│   │   │   ├── supabase_client.py    # Supabase connection manager
│   │   │   ├── storage.py            # Packaging evidence storage
│   │   │   └── repositories/         # Profiles, Medicines, Batches, Verifications
│   │   ├── routes/                   # Verification, User, History, Admin, Reports, AI
│   │   ├── schemas/                  # Pydantic data contracts
│   │   ├── services/                 # Verification Engine, GS1 Parser, Scoring, LLM Service
│   │   │   └── llm/                  # OpenAI client, prompts, schemas, service
│   │   └── utils/                    # Timezone & ISO-8601 UTC utilities
│   ├── scripts/
│   │   ├── migrate_mongodb_to_supabase.py # Production migration utility
│   │   └── seed_supabase.py               # Development seed script
│   └── tests/                        # Full test suite (45 tests including AI test suite)
├── frontend/
│   ├── src/
│   │   ├── api/                      # Centralized API client (including AI endpoints)
│   │   ├── components/               # Scanner, Badges, Modals, Results, AI Components
│   │   │   └── ai/                   # ExplainResultModal, AskMedVerifyDrawer, AdminAIAnalystModal
│   │   ├── lib/                      # Supabase client & Realtime subscriber
│   │   ├── pages/                    # Home, Scanner, History, Admin Dashboard, Result
│   │   └── utils/                    # Barcode decoding & date utilities
├── supabase/
│   └── migrations/                   # 001-004 Core Schema, 005 AI Conversations
├── AI_ARCHITECTURE.md                # Comprehensive LLM intelligence layer specification
├── SUPABASE_MIGRATION_PLAN.md        # Comprehensive migration blueprint
├── SUPABASE_SETUP.md                 # Supabase configuration guide
└── README.md
```

---

## Phase 3 — Real LLM Intelligence Layer

MedVerify features a production OpenAI intelligence layer:
- **Provider**: Official OpenAI API (`openai>=1.50.0`)
- **Default Model**: Configurable via `OPENAI_MODEL` (default: `gpt-5.6-luna`)
- **Strict Grounding**: The deterministic verification engine remains authoritative; the LLM explains verified facts without altering status or inventing records.
- **Explain My Result**: Plain-language multi-lingual explanation with Simple vs Technical tones.
- **Ask MedVerify**: Interactive chat assistant with healthcare safety boundaries and prompt injection defense.
- **OCR AI Normalization**: Intelligent packaging text normalization without hallucinating missing fields.
- **Admin AI Analyst**: High-level verification anomaly synthesis for authorized administrators.
- **Critical Failsafe**: Core verification, camera scanning, and database operations work 100% even if the LLM is offline.

For detailed design specifications, see [AI_ARCHITECTURE.md](./AI_ARCHITECTURE.md).

---

## Getting Started

### 1. Database Setup

Follow [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) to apply the SQL migrations located in `supabase/migrations/`.

### 2. Backend Setup

```bash
cd backend

# Create & activate Python virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1    # Windows PowerShell
# source .venv/bin/activate     # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment variables (add OPENAI_API_KEY, OPENAI_MODEL)
cp .env.example .env

# Start backend server
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) in your browser.

---

## Testing

```bash
# Run backend test suite (45 tests)
cd backend
pytest

# Run frontend build validation
cd frontend
npm run build
```
