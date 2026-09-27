# MedVerify — Production Deployment Guide

## 1. Production Architecture Overview

```text
[ Client Devices (Mobile / Desktop) ]
                 │ HTTPS
                 ▼
[ Frontend: Vercel / Netlify ] (React 19 / Vite SPA)
                 │ REST API / JWT
                 ▼
[ Backend: Render / Railway / AWS ECS ] (FastAPI Python Gateway)
                 │ PostgREST / Postgres Connection / Service Role
                 ▼
[ Persistent Layer: Supabase ]
   ├── PostgreSQL 15+ (With Row Level Security)
   ├── Supabase Auth (Identity & Session Tokens)
   ├── Supabase Realtime (Websocket Broadcasts)
   └── Supabase Storage (Evidence Vault)
```

---

## 2. Production Environment Variables

### Backend Environment Variables (`backend/.env`)

```ini
# Core Configuration
DATABASE_BACKEND=supabase
FASTAPI_ENV=production
DEBUG=false

# Supabase Production Credentials
SUPABASE_URL=https://<your-project-id>.supabase.co
SUPABASE_ANON_KEY=<your-anon-publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-secret-key>
SUPABASE_JWT_SECRET=<your-supabase-jwt-secret>

# Security Secrets
JWT_SECRET=<generate_secure_random_key_min_64_characters>
JWT_ALGORITHM=HS256
JWT_EXPIRY_MINUTES=60

# Allowed CORS Origins (Do NOT use "*" in production)
FRONTEND_URL=https://medverify.yourdomain.com
```

### Frontend Environment Variables (`frontend/.env`)

```ini
VITE_API_URL=https://api.medverify.yourdomain.com
VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-publishable-key>
```

---

## 3. Database Deployment (Supabase)

1. Provision a production Supabase project via [Supabase Management Console](https://supabase.com).
2. Execute migrations in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_indexes.sql`
   - `supabase/migrations/003_rls.sql`
   - `supabase/migrations/004_functions.sql`
3. Verify that Row Level Security is **ENABLED** across all tables.
4. Verify Realtime publication includes `verification_records` and `admin_activity`.

---

## 4. Backend Deployment (Docker / Cloud Run / Railway / Render)

### Dockerfile (Recommended for Containerized Deployments)

```dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## 5. Frontend Deployment (Vercel / Cloudflare Pages)

1. Connect Git repository to Vercel.
2. Set Build Command: `npm run build`.
3. Set Output Directory: `dist`.
4. Configure Environment Variables:
   - `VITE_API_URL`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Ensure HTTPS is enforced (Required by modern mobile browsers for WebRTC camera access).

---

## 6. Post-Deployment Verification Checklist

- [ ] Health check responds: `GET https://api.yourdomain.com/health` returns `{"status":"ok"}`.
- [ ] Database diagnostic telemetry: `GET /api/admin/system-health` confirms Supabase connection.
- [ ] Camera scanner opens successfully on mobile device under HTTPS.
- [ ] Canonical test scan `(01)89012345678901(10)BATCH-2026-001(17)280109(21)SER-PC-000001` authenticates.
- [ ] Admin Realtime stream updates automatically on new verification events.
- [ ] RLS policies prevent normal users from querying admin routes.
- [ ] Service role key is **NEVER** exposed in client-side bundle.
