# MedVerify Local Development Setup & Operation Guide

This document provides complete instructions for configuring, launching, and troubleshooting the MedVerify pharmaceutical verification development environment.

---

## 1. System Requirements

Ensure the following runtimes and tools are installed on your workstation:

| Component | Minimum Version | Recommended | Notes |
| :--- | :--- | :--- | :--- |
| **Node.js** | 18.0+ | 20.x LTS | Powers Vite frontend and development build tooling |
| **npm** | 9.0+ | 10.x | Bundled with Node.js |
| **Python** | 3.11+ | 3.12.x | Backend runtime with FastAPI and Pydantic v2 |
| **MongoDB** | 6.0+ | 7.0+ | Primary local database (default: `mongodb://localhost:27017`) |
| **PowerShell** | 5.1+ | 7.x (Core) | Required for unified development orchestration scripts |

---

## 2. Quick Start (Single Command)

MedVerify provides a unified launcher that eliminates desynchronization, port conflicts, and orphaned processes:

### Starting the Development Environment

From the project root directory, run:

```powershell
.\start-medverify.ps1
```
*(Alternatively, `.\start-dev.ps1` is available as a backwards-compatible alias.)*

The script performs the following automated steps:
1. **Prerequisite Discovery:** Verifies Python in `backend/.venv`, Node.js, and npm.
2. **Port Conflict Check:** Inspects ports `8001` (backend) and `5173` (frontend) and verifies that running listeners belong to MedVerify to avoid duplicate instances.
3. **Backend Service Launch:** Boots FastAPI via Uvicorn on `http://127.0.0.1:8001`.
4. **Liveness Polling:** Probes `http://127.0.0.1:8001/health/live` until the server responds.
5. **Readiness & Database Check:** Evaluates `http://127.0.0.1:8001/health/ready` to verify MongoDB connectivity and latency.
6. **Frontend Service Launch:** Starts Vite dev server on `http://localhost:5173`.
7. **Diagnostics Dashboard:** Outputs the live endpoints and access URLs.

### Stopping the Development Environment

To cleanly stop all background MedVerify processes and free ports 8001 and 5173:

```powershell
.\stop-medverify.ps1
```
*(Alternatively, `.\stop-dev.ps1` is also supported.)*

---

## 3. Manual Component Startup

If you prefer running services in separate terminal tabs:

### Terminal 1: FastAPI Backend

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

- **API Base:** `http://127.0.0.1:8001`
- **Interactive OpenAPI Docs:** `http://127.0.0.1:8001/docs`
- **Liveness Probe:** `http://127.0.0.1:8001/health/live`
- **Readiness Probe:** `http://127.0.0.1:8001/health/ready`

### Terminal 2: Vite React Frontend

```powershell
cd frontend
npm run dev
```

- **Frontend Application:** `http://localhost:5173`
- In development, Vite automatically reverse-proxies `/api` and `/health` requests to `http://127.0.0.1:8001`.

---

## 4. Environment Configuration

### Frontend Configuration (`frontend/.env`)

Copy `frontend/.env.example` to `frontend/.env`:

```env
# In development, leave VITE_API_URL empty so Vite's reverse proxy handles API calls
VITE_API_URL=

# Optional Supabase Integration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-publishable-key
```

### Backend Configuration (`backend/.env`)

Copy `backend/.env.example` to `backend/.env`:

```env
MONGODB_URI=mongodb://localhost:27017
DATABASE_NAME=medicine_verification
JWT_SECRET=dev_secret_replace_in_production_min_32_characters
JWT_ALGORITHM=HS256
JWT_EXPIRY_MINUTES=60
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000

# Google Gemini API Key for Packaging AI and Assistant
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash
```

---

## 5. Pre-Seeded Demo Accounts

The local database and seeders include default operator accounts:

| Role | Email | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **System Administrator** | `admin@medverify.demo` | `admin123` | Full administrative console, registry management, audit logs, system health |
| **Standard Operator** | `user@medverify.demo` | `user123` | Packaging verification, personal history, medicine cabinet, report submission |

On the Login page (`/login`), click the **ADMIN** or **USER** demo pill to auto-fill these credentials.

---

## 6. Troubleshooting Common Issues

### Issue 1: "AUTHENTICATION SERVICE UNAVAILABLE" on Login
- **Cause:** The frontend cannot reach the backend on port 8001.
- **Resolution:**
  1. Check the Live Connection status pill at the top of the Login form.
  2. If the pill displays "API Server Offline", run `.\start-dev.ps1` from the project root.
  3. Verify port 8001 is active in your browser at `http://127.0.0.1:8001/health/live`.
  4. Click the **"Retry Connection"** button on the Login form error banner.

### Issue 2: "DATABASE TEMPORARILY DEGRADED"
- **Cause:** The FastAPI backend is running, but MongoDB is stopped or unreachable.
- **Resolution:**
  1. Start the MongoDB local service:
     - Windows Service: `net start MongoDB`
     - Or manual daemon: `mongod --dbpath <your_db_path>`
  2. Verify readiness at `http://127.0.0.1:8001/health/ready`. Once MongoDB connects, the probe will return `200 OK` with `database.status: "connected"`.

### Issue 3: Port 8001 or 5173 Already in Use
- **Cause:** A previous development session did not release the listening socket.
- **Resolution:**
  1. Run `.\stop-dev.ps1`. This gracefully identifies and closes processes holding ports 8001 and 5173.
  2. Rerun `.\start-dev.ps1`.
