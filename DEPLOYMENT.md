# MedVerify v1.0 — Production Deployment Architecture & Guide

## 1. Production Architecture Overview

```text
[ Client Mobile & Desktop Browsers ]
                 │
                 │ HTTPS (TLS 1.3 Strict) — Required for WebRTC Camera Access
                 ▼
[ Frontend SPA: Vercel / Netlify / Cloudflare Pages ] (React 19 / Vite SPA)
                 │
                 │ HTTPS REST API + Authorization: Bearer <JWT>
                 ▼
[ Backend API Gateway: AWS ECS / Render / Railway ] (FastAPI Python 3.12 Gateway)
                 ├── Deterministic 6-Factor Verification Engine (Authoritative)
                 ├── GS1 DataMatrix / Barcode Decoder & Cross-Checker
                 ├── Rate Limiting (Sliding Window per IP/User)
                 ├── Health & Telemetry Probes (/health/live, /health/ready)
                 │
                 ├──► [ Google Gemini AI Service ] (Backend-Only API Key)
                 │       ├── Vision Multimodal OCR (Label, Batch, Expiry, Serial)
                 │       ├── Grounded Explainability Assistant
                 │       └── Packaging Condition Physical Anomaly Scanner
                 │
                 ├──► [ Persistent Database: MongoDB Atlas / Supabase PostgreSQL ]
                 │       ├── Medicines Registry & Batch Ledgers
                 │       ├── Verification Ledger (Immutable Audit Records)
                 │       ├── User Profiles & RBAC (Admin / User)
                 │       └── Personal Medicine Cabinets
                 │
                 └──► [ Persistent Image Storage: S3 / Cloud Storage / Supabase Storage ]
                         ├── Evidence Packaging Photos (JPEG / PNG)
                         └── Authenticated User-Scoped Access Control (IDOR Protected)
```

---

## 2. Production Environment Variables

### Backend Configuration (`backend/.env`)

```ini
# Core Environment
FASTAPI_ENV=production
DEBUG=false

# Database Selection (mongodb | supabase)
DATABASE_BACKEND=mongodb
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=medverify_production

# Optional Supabase Connection
SUPABASE_URL=https://<your-project-id>.supabase.co
SUPABASE_ANON_KEY=<your-anon-publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-secret-key-keep-private>
SUPABASE_JWT_SECRET=<your-supabase-jwt-secret>

# Application Security & Token Expiry
JWT_SECRET=<generate_high_entropy_secret_min_64_characters>
JWT_ALGORITHM=HS256
JWT_EXPIRY_MINUTES=60

# Production CORS & Allowed Origins (Strict HTTPS only — never "*" or localhost)
FRONTEND_URL=https://medverify.yourdomain.com
CORS_ORIGINS=https://medverify.yourdomain.com,https://admin.medverify.yourdomain.com

# Google Gemini Intelligence Layer (Backend Only — Never Expose to Client)
GEMINI_API_KEY=<your-production-google-gemini-api-key>
GEMINI_MODEL=gemini-2.5-flash
GEMINI_MAX_OUTPUT_TOKENS=2500
GEMINI_TIMEOUT_SECONDS=35.0
GEMINI_RATE_LIMIT_PER_MINUTE=40
GEMINI_ADMIN_RATE_LIMIT_PER_MINUTE=60

# Persistent Image Storage Configuration
IMAGE_STORAGE_DIR=/var/data/medverify/uploads
MAX_IMAGE_SIZE_BYTES=10485760
ALLOWED_IMAGE_MIMES=image/jpeg,image/png,image/webp
```

### Frontend Configuration (`frontend/.env`)

```ini
# Production API Base URL (Must be HTTPS; must NOT be localhost or 127.0.0.1)
VITE_API_URL=https://api.medverify.yourdomain.com

# Optional Supabase Integration
VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-publishable-key>
```

---

## 3. Containerized Backend Deployment

### Dockerfile (`backend/Dockerfile`)

```dockerfile
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install system dependencies for image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Persistent storage mount point for uploaded packaging evidence
RUN mkdir -p /var/data/medverify/uploads && chmod 750 /var/data/medverify/uploads

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8001/health/live || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "4"]
```

---

## 4. Frontend Production Build & Hosting

1. Build command: `npm run build` (`tsc -b && vite build`).
2. Output directory: `dist`.
3. Single Page Application (SPA) Routing Rewrite rule:
   - All routes (`/*`) rewrite to `/index.html` with status `200`.
4. Enforce TLS 1.3 / HTTPS: Required by modern mobile operating systems (iOS WebKit and Android Chromium) for WebRTC `getUserMedia()` camera access.

---

## 5. Health Check & Monitoring Endpoints

| Endpoint | Method | Purpose | Expected Status |
| :--- | :--- | :--- | :--- |
| `/health` | `GET` | General health ping | `200 OK` (`{"status":"ok"}`) |
| `/health/live` | `GET` | Container liveness check | `200 OK` (`{"status":"alive"}`) |
| `/health/ready` | `GET` | Deep readiness probe (Database connectivity, latency) | `200 OK` (`{"status":"ready"}`) or `503` if degraded |
| `/api/admin/system-health` | `GET` | Telemetry for system administrators | `200 OK` (Admin role required) |

---

## 6. Pre-Flight Production Readiness Checklist

- [x] Production `VITE_API_URL` uses secure `https://` domain without localhost.
- [x] CORS configuration explicitly whitelists production domain names only.
- [x] Google Gemini API keys are confined strictly to backend runtime variables.
- [x] Role-Based Access Control (RBAC) blocks unauthorized access to `/api/admin/*`.
- [x] Insecure Direct Object Reference (IDOR) controls protect user verification histories, images, and cabinets.
- [x] Deterministic 6-factor verification engine remains authoritative; Gemini OCR cannot override verification statuses.
- [x] Idempotent database indexing ensures fast query execution and enforces GTIN and user email uniqueness.
- [x] WebRTC Camera scanner functions properly under HTTPS on mobile and desktop browsers.
- [x] Graceful degraded mode handles transient database or AI service outages without application crash.
