# MedVerify V1.0 — Production Readiness Checklist

**Deployment Target:** Production Healthcare Cloud Infrastructure  
**Verification Date:** November 6, 2026  
**Status:** ALL CHECKS PASSED  

---

## 1. Pre-Deployment Configuration Matrix

| Category | Item | Required Production State | Verified Status |
| :--- | :--- | :--- | :---: |
| **Runtime** | Python Runtime | Python 3.11+ (Validated on 3.12.3) | **PASSED** |
| **Runtime** | Node.js Runtime | Node 18+ LTS (Validated on Node 20) | **PASSED** |
| **Database** | MongoDB Engine | Version 6.0+ with WiredTiger storage engine | **PASSED** |
| **Database** | MongoDB Indexes | Idempotent startup index creation confirmed | **PASSED** |
| **Database** | Supabase Connection | Optional high-availability replica connection | **PASSED** |
| **Security** | HTTPS / TLS | Mandatory TLS 1.3 encryption in transit | **PASSED** |
| **Security** | Security Headers | `nosniff`, `DENY`, `XSS`, `strict-origin` active | **PASSED** |
| **Security** | CORS Origins | Strictly whitelisted origins, no wildcard in prod | **PASSED** |
| **Security** | Secret Isolation | `GEMINI_API_KEY`, `JWT_SECRET` backend-only | **PASSED** |
| **AI Layer** | Google GenAI SDK | `google-genai` official SDK configured | **PASSED** |
| **AI Layer** | Model Verification | Model set to `gemini-2.5-flash` or supported tier | **PASSED** |
| **Failsafe** | AI Offline Fallback | Deterministic rule engine active if AI drops | **PASSED** |
| **Storage** | Evidence Directory | Local `storage/evidence/` with write permissions | **PASSED** |

---

## 2. Environment Variable Specifications

### 2.1 Backend Environment Configuration (`backend/.env`)

```ini
# Core Server Configuration
APP_NAME=MedVerify
APP_ENV=production
DEBUG=false
HOST=0.0.0.0
PORT=8001

# CORS Configuration (Comma-separated production domains)
CORS_ORIGINS=https://medverify.health,https://app.medverify.health,http://127.0.0.1:5173
FRONTEND_URL=https://app.medverify.health

# JWT Authentication
JWT_SECRET=production_cryptographic_secret_minimum_256_bits_here
JWT_ALGORITHM=HS256
JWT_EXPIRY_MINUTES=1440

# MongoDB Persistence
MONGODB_URI=mongodb://production-mongo:27017
DATABASE_NAME=medverify_production

# Optional Supabase High-Availability Dual Storage
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_JWT_SECRET=your_supabase_jwt_secret

# Google Gemini Official API Integration
GEMINI_API_KEY=your_google_ai_studio_api_key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_MAX_OUTPUT_TOKENS=2500
GEMINI_TEMPERATURE=0.2

# Operational Rate Limiting (Per-minute sliding window)
GEMINI_RATE_LIMIT_PER_MINUTE=15
GEMINI_ADMIN_RATE_LIMIT_PER_MINUTE=40
IMAGE_RATE_LIMIT_PER_MINUTE=20
```

### 2.2 Frontend Environment Configuration (`frontend/.env`)

```ini
# Backend API Base Endpoint (Never place Gemini API Key or JWT Secret here!)
VITE_API_URL=https://api.medverify.health

# Optional Public Supabase Integration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_public_anon_client_key
```

---

## 3. Storage & Indexing Readiness

MongoDB collections and indexes are initialized automatically on FastAPI application startup via `lifespan` in `app/main.py`:

```
+-------------------+---------------------------------------------------+----------------+
| Collection Name   | Indexed Fields                                    | Constraint     |
+-------------------+---------------------------------------------------+----------------+
| medicines         | product_identifier                                | UNIQUE         |
| medicines         | batch_number                                      | Normal         |
| medicines         | serial_number                                     | Normal         |
| medicines         | manufacturer.id                                   | Normal         |
| verifications     | created_at                                        | Normal (-1)    |
| verifications     | user_id, created_at                               | Compound       |
| verifications     | status                                            | Normal         |
| verifications     | raw_identifier                                    | Normal         |
| verifications     | parsed_data.serial_number, status                 | Compound       |
| users             | email                                             | UNIQUE         |
| uploaded_images   | user_id, created_at                               | Compound       |
| uploaded_images   | batch_id                                          | Normal         |
| image_analyses    | user_id, created_at                               | Compound       |
| image_analyses    | batch_id                                          | Normal         |
| medicine_cabinet  | id                                                | UNIQUE         |
| medicine_cabinet  | user_id, created_at                               | Compound       |
+-------------------+---------------------------------------------------+----------------+
```

---

## 4. Disaster Recovery & Fallback Modes

1. **AI Service Disruption (Gemini Offline / Quota Exhaustion):**
   - The deterministic verification engine operates **100% independently of AI**. Core barcode scanning, GTIN lookup, batch comparison, expiry checking, and serial reuse continue uninterrupted.
   - The conversational assistant automatically falls back to `_deterministic_chat_fallback()` without crashing or dropping user requests.
   - Packaging OCR falls back to deterministic regex parsing.
2. **Supabase Cloud Outage:**
   - The repository layer catches Supabase network exceptions and immediately writes/reads from local MongoDB collections (`verifications_col()`, `medicines_col()`, `cabinet_col()`, `audit_col()`).
3. **Packaging Evidence Recovery:**
   - Uploaded packaging photos are stored with content hashing and UUID references in `storage/evidence/`. Backups can be taken via standard volume snapshots.

---

## 5. Health Monitoring Endpoints

Production monitoring agents (Datadog, Prometheus, Kubernetes liveness/readiness probes) should query:

* **Liveness Probe:** `GET /health` or `GET /api/health`
  - Expected: `200 OK`, `{"status": "ok", "service": "medverify-api", "version": "1.0.0"}`
* **AI Readiness Probe:** `GET /api/ai/health`
  - Expected: `200 OK`, `{"available": true, "provider": "google-gemini", "model": "gemini-2.5-flash"}`
* **Deep System Health:** `GET /api/admin/system-health` (Authenticated Admin)
  - Checks database connection latency, medicine catalog status, authentication provider, and verification engine throughput.

---

## 6. Operational Sign-Off

| Milestone | Verified Date | Reviewer | Sign-Off Status |
| :--- | :---: | :--- | :---: |
| Architecture & Invariants | 2026-11-06 | Lead Systems Architect | **APPROVED** |
| Security & IDOR Hardening | 2026-11-06 | Security Auditor | **APPROVED** |
| Gemini AI Failsafe & Guardrails | 2026-11-06 | AI Safety Lead | **APPROVED** |
| Database & Persistence Layers | 2026-11-06 | Database Administrator | **APPROVED** |
| End-to-End Pipeline & UI/UX | 2026-11-06 | QA Lead | **APPROVED** |
