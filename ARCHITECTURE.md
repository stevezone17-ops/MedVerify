# MedVerify — System Architecture

## 1. High-Level Production Architecture

```text
                     ┌──────────────────────────────────────────────┐
                     │          Consumer / Pharmacist / Admin       │
                     └──────────────────────┬───────────────────────┘
                                            │
                                            ▼
                     ┌──────────────────────────────────────────────┐
                     │              React 19 / Vite App             │
                     │  - Realtime Camera Scanner (ZXing / Canvas)  │
                     │  - My Activity (Isolated History)            │
                     │  - Admin Command Center & Live Telemetry     │
                     └──────────────┬───────────────────────────────┘
                                    │
                         HTTPS/REST │ Bearer Token
                                    ▼
                     ┌──────────────────────────────────────────────┐
                     │             FastAPI Core Gateway             │
                     │  - GS1 AI / Application Identifier Parser   │
                     │  - 6-Factor Deterministic Scoring Engine    │
                     │  - Serial Reuse Check & Anti-Replay Guard    │
                     │  - RBAC Middleware (User vs Admin)           │
                     └──────────────┬───────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────────────────────────┐
                     │           Repository Data Layer              │
                     │  - MedicinesRepo, BatchesRepo, Verifications │
                     │  - ProfilesRepo, ReportsRepo, CabinetRepo    │
                     └──────────────┬───────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────────────────────────┐
                     │       Supabase PostgreSQL & Cloud Suite      │
                     │  ├── PostgreSQL (Relational Tables & GIN Idx)│
                     │  ├── Row Level Security (RLS User Isolation) │
                     │  ├── Supabase Auth (JWT & Roles)             │
                     │  ├── Supabase Storage (Evidence Vault)       │
                     │  └── Supabase Realtime (Live Event Stream)   │
                     └──────────────────────────────────────────────┘
```

---

## 2. Core Architectural Principles

1. **Authoritative Backend Verification**: Sensitive verification scoring, registry comparison, and serial uniqueness checking run strictly on FastAPI. No verification decisions are made client-side.
2. **Relational Data Integrity**: Canonical drugs (`medicines`) and production batches (`medicine_batches`) are stored with strict foreign key constraints and uniqueness guarantees.
3. **Database-Native Security (RLS)**: PostgreSQL Row Level Security enforces that consumers and pharmacists can only access their own history, reports, and medicine cabinet, while administrative operations are restricted to verified `ADMIN` profiles.
4. **Timezone Accuracy**: All database timestamps are timezone-aware UTC (`TIMESTAMPTZ`) formatted as ISO-8601 with `Z`. The frontend converts timestamps to the user's local timezone for display.
5. **Realtime Event Streaming**: Administrative monitoring leverages Supabase Realtime (`postgres_changes` publication) to display live inspection feeds without polling.

---

## 3. Directory Architecture

```text
backend/
├── app/
│   ├── main.py                  # App entry point & CORS configuration
│   ├── config.py                # Environment configuration (Supabase & App)
│   ├── database.py              # Legacy MongoDB accessor (Rollback insurance)
│   ├── db/
│   │   ├── supabase_client.py   # Supabase client singleton & config
│   │   ├── storage.py           # Evidence image storage
│   │   └── repositories/        # Repository pattern modules
│   │       ├── medicines.py
│   │       ├── batches.py
│   │       ├── verifications.py
│   │       ├── profiles.py
│   │       ├── reports.py
│   │       └── cabinet.py
│   ├── routes/                  # Modular API routers
│   ├── schemas/                 # Pydantic data contracts
│   ├── services/                # Verification Engine, Scoring, GS1 Parser
│   └── utils/                   # ISO-8601 UTC timestamp normalizers
├── scripts/
│   ├── migrate_mongodb_to_supabase.py # Production migration utility
│   └── seed_supabase.py               # Development seed script
└── tests/                       # Automated pytest suite (29 tests)
```

---

## 4. Verification Data Flow

```text
Packaging Barcode (2D DataMatrix / QR / EAN)
                     ↓
              Optical Capture
                     ↓
              ZXing Decoding
                     ↓
         GS1 AI Parsing & Normalization
                     ↓
           FastAPI Verify Endpoint
                     ↓
      Supabase Registry Lookup (GTIN & Batch)
                     ↓
         Serial Reuse & Replay Inspection
                     ↓
     6-Factor Weighted Deterministic Scoring
                     ↓
        Forensic Audit Record Created
                     ↓
Supabase Realtime Broadcast to Admin Command Center
                     ↓
  Explainable Verdict & Certificate to User
```

---

## 5. Real LLM Intelligence Layer

```text
                               ┌───────────────────────────────────────┐
                               │ Deterministic Verification Verdict    │
                               │ (VERIFIED / SUSPICIOUS / EXPIRED)     │
                               └──────────────────┬────────────────────┘
                                                  │
                                                  ▼
                               ┌───────────────────────────────────────┐
                               │    FastAPI Grounded Context Builder   │
                               └──────────────────┬────────────────────┘
                                                  │
                                                  ▼
                               ┌───────────────────────────────────────┐
                               │   OpenAI Responses API (Configurable) │
                               │   Default: gpt-5.6-luna (JSON-Schema) │
                               └──────────────────┬────────────────────┘
                                                  │
                      ┌───────────────────────────┴───────────────────────────┐
                      ▼                                                       ▼
        ┌──────────────────────────┐                            ┌──────────────────────────┐
        │   Explain My Result      │                            │   Ask MedVerify Assistant│
        │   (Multilingual & Tone)  │                            │   (Grounded Interactive) │
        └──────────────────────────┘                            └──────────────────────────┘
```

1. **Grounded Explanation Layer**: The LLM is strictly an explanation and interaction layer; it is never the authenticity decision engine.
2. **Configurable Model**: Configured via `OPENAI_MODEL` environment variable (default: `gpt-5.6-luna`).
3. **Medical Safety Boundary**: Strict guardrails disallowing medical diagnosis, dosage advice, or prescription decisions.
4. **Prompt Injection Defense**: Packaging OCR text and user questions are quarantined as untrusted data blocks.
5. **Critical Failsafe**: Core verification continues working 100% when OpenAI is offline or unconfigured.

See [AI_ARCHITECTURE.md](./AI_ARCHITECTURE.md) for full architectural specifications.

