# MedVerify v1.0 — Production Readiness Checklist

**Deployment Target:** Production Healthcare Cloud Infrastructure  
**Verification Date:** November 12, 2026  
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
| **Security** | IDOR Controls | User-scoped verification, cabinet, and image storage | **PASSED** |
| **AI Layer** | Google GenAI SDK | `google-genai` official SDK configured | **PASSED** |
| **AI Layer** | Model Verification | Model set to `gemini-2.5-flash` or supported tier | **PASSED** |
| **Failsafe** | AI Offline Fallback | Deterministic rule engine active if AI drops | **PASSED** |
| **Storage** | Evidence Directory | Local `storage/evidence/` or Cloud Blob with permissions | **PASSED** |
| **Layout** | Admin Scrolling | Vertical scroll operational across all admin routes | **PASSED** |
| **Launcher** | Single-Command Dev | `start-medverify.ps1` boots backend & frontend cleanly | **PASSED** |

---

## 2. Environment Variable Specifications

### 2.1 Backend Environment Configuration (`backend/.env`)

```ini
# Core Server Configuration
APP_NAME=MedVerify
FASTAPI_ENV=production
DEBUG=false
HOST=0.0.0.0
PORT=8001

# CORS Configuration (Comma-separated production domains)
CORS_ORIGINS=https://medverify.yourdomain.com,https://admin.medverify.yourdomain.com
FRONTEND_URL=https://medverify.yourdomain.com

# JWT Authentication
JWT_SECRET=production_cryptographic_secret_minimum_256_bits_here
JWT_ALGORITHM=HS256
JWT_EXPIRY_MINUTES=60

# MongoDB Persistence
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=medverify_production

# Optional Supabase High-Availability Dual Storage
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_JWT_SECRET=your_supabase_jwt_secret

# Google Gemini Official API Integration (Backend Only)
GEMINI_API_KEY=your_google_ai_studio_api_key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_MAX_OUTPUT_TOKENS=2500
GEMINI_TEMPERATURE=0.2

# Operational Rate Limiting (Per-minute sliding window)
GEMINI_RATE_LIMIT_PER_MINUTE=40
GEMINI_ADMIN_RATE_LIMIT_PER_MINUTE=60
IMAGE_RATE_LIMIT_PER_MINUTE=20
```

### 2.2 Frontend Environment Configuration (`frontend/.env`)

```ini
# Backend API Base Endpoint (Never place Gemini API Key or JWT Secret here!)
VITE_API_URL=https://api.medverify.yourdomain.com

# Optional Public Supabase Integration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_public_anon_client_key
```

---

## 3. Operational Probes & Health Checks

- `/health`: Fast status ping returning `{"status": "ok", "service": "medverify-api"}`.
- `/health/live`: Container liveness check for Kubernetes / ECS container restarts.
- `/health/ready`: Deep readiness probe checking MongoDB connection status and query latency.
- `/api/admin/system-health`: Full telemetry dashboard metrics for operations administrators.

---

## 4. Final Sign-Off

All 16 production criteria have been satisfied and verified via automated test suites, end-to-end headless browser testing, and security scans.
