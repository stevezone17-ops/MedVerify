# MedVerify — Backend Connectivity & Authentication Audit Report

**Audit Date:** November 9, 2026  
**Audited System:** MedVerify Pharmaceutical Authentication Platform  
**Scope:** Frontend-to-Backend Connectivity, Service Lifecycles, Network Proxy, Authentication Failure Root Cause  

---

## 1. Issue Description

Users and automated workflows repeatedly encountered the following login failure banner:

> **AUTHENTICATION SERVICE UNAVAILABLE**  
> *"The MedVerify API server is currently unreachable. Please check that the backend server is running on port 8001."*

This investigation was conducted across all 12 operational dimensions of the stack to identify the actual root cause rather than applying cosmetic UI fixes.

---

## 2. Comprehensive 12-Point Architecture Inspection

### 2.1 Frontend Environment (`frontend/.env` and `.env.example`)
* **Finding:** Both files defined `VITE_API_URL=http://127.0.0.1:8001`.
* **Impact:** In development, setting an explicit absolute URL forces the browser to make direct cross-origin requests to port 8001, completely bypassing Vite's configured development reverse proxy.

### 2.2 Backend Configuration (`backend/app/config.py`)
* **Finding:** `Settings` defines `cors_origins` as `"http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"`.
* **Impact:** Direct cross-origin calls from browsers that resolve `localhost` to IPv6 `[::1]:5173` or custom development ports triggered CORS preflight rejections if not explicitly listed in the whitelist.

### 2.3 Vite Configuration (`frontend/vite.config.ts`)
* **Finding:** Configured with a development proxy mapping `/api` and `/health` to `http://127.0.0.1:8001` with `changeOrigin: true`.
* **Impact:** Because `client.ts` prepended `http://127.0.0.1:8001` to all paths, the browser issued absolute URL requests, rendering Vite's proxy completely dead and unused in development.

### 2.4 API Client Configuration (`frontend/src/api/client.ts`)
* **Finding:** `buildEndpointUrl(path)` resolved paths against `API_BASE_URL`. If set to `http://127.0.0.1:8001`, every request became absolute.
* **Impact:** `apiFetch` had zero retry capability, no exponential backoff, and immediately wrapped `TypeError: Failed to fetch` into `(err).isNetworkError = true`.

### 2.5 Authentication Service & Normalization (`frontend/src/pages/Login.tsx`)
* **Finding:** Lines 37–49 in `Login.tsx` captured any error where `isNetworkError` is true or message contains `Failed to fetch`, `ECONNREFUSED`, or `NetworkError`, and mapped it to:
  `title: 'AUTHENTICATION SERVICE UNAVAILABLE'`, `message: 'The MedVerify API server is currently unreachable. Please check that the backend server is running on port 8001.'`
* **Impact:** Any transient network hiccup, brief delay in backend startup, or browser preflight refusal immediately displayed this alarming banner.

### 2.6 Login & Registration Endpoints (`backend/app/routes/auth.py`)
* **Finding:** Routes are properly registered at `POST /api/auth/login` and `POST /api/auth/register`. The endpoint definitions and schemas are functional and correct.

### 2.7 FastAPI Entry Point (`backend/main.py` and `backend/app/main.py`)
* **Finding:** Running `uvicorn app.main:app` from the project root fails with `ModuleNotFoundError: No module named 'app'` because `app/` is situated inside `backend/`.
* **Impact:** Developers launching commands from the repository root rather than inside `backend/` could not start the server without setting `PYTHONPATH=backend`.

### 2.8 Router Registration & API Prefixes
* **Finding:** All 12 application routers in `backend/app/main.py` consistently use the `/api` prefix (e.g., `/api/auth`, `/api/verify`, `/api/admin`).

### 2.9 CORS Configuration & Middleware Order
* **Finding:** `CORSMiddleware` in `backend/app/main.py` is configured with `allow_origins=_raw_origins` and `allow_credentials=True`. When direct cross-origin fetches occurred, browser origin mismatches led to connection drops.

### 2.10 Backend Startup Commands & Process Orchestration
* **Finding:** No root-level startup orchestrator existed. Starting the application required manually launching two independent terminals:
  - Terminal 1: `npm run dev` in `frontend/`
  - Terminal 2: `uvicorn app.main:app --port 8001` in `backend/`
* **Impact:** When developers started the frontend first, the browser immediately opened to the login screen while the backend was still offline or uninitialized, instantly triggering connection failures.

### 2.11 Database Initialization Lifecycle (`backend/app/database.py`)
* **Finding:** In `backend/app/main.py`, `lifespan` executed `ensure_indexes()` unconditionally on startup. If MongoDB was temporarily slow to connect, PyMongo defaulted to a 30-second `serverSelectionTimeoutMS`.
* **Impact:** The backend process hung for up to 30 seconds or crashed on startup if MongoDB was momentarily unavailable, preventing the HTTP server from binding to port 8001.

### 2.12 Existing Health-Check Endpoints
* **Finding:** Only `/health` and `/api/health` existed, returning static JSON without verifying database connectivity or readiness.
* **Impact:** Monitoring and frontend clients had no mechanism to distinguish between:
  1. Backend process offline (connection refused)
  2. Backend process alive but database connecting / offline (503 Service Unavailable)
  3. Backend process fully ready for traffic (200 OK)

---

## 3. Actual Root Cause Summary

The recurring *"AUTHENTICATION SERVICE UNAVAILABLE"* failure was caused by a combination of four interrelated architectural issues:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          ROOT CAUSE BREAKDOWN                            │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Lifecycle Decoupling: No unified startup orchestrator ensured that    │
│    the backend was actually listening and ready before the frontend      │
│    dispatched login requests.                                            │
│                                                                          │
│ 2. Conflicting Absolute URLs vs. Vite Proxy: Setting VITE_API_URL to     │
│    http://127.0.0.1:8001 bypassed the Vite dev proxy, triggering direct  │
│    browser-to-port-8001 cross-origin requests prone to connection drops.│
│                                                                          │
│ 3. Database-Blocking Startup: Unbounded MongoDB index creation in the     │
│    lifespan startup hook could hang or crash the FastAPI process if the  │
│    database was not immediately reachable.                              │
│                                                                          │
│ 4. No Health/Readiness Separation: No /health/live and /health/ready     │
│    endpoints existed to verify operational readiness before requests.    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Remediation Plan

To resolve this issue permanently, the following concrete improvements are scheduled across Stages 2–10:

1. **Centralize API Configuration (Stage 2):** Use relative `/api` paths in development via the Vite proxy, and require strict HTTPS URLs in production.
2. **Reliable Communication & CORS (Stage 3):** Standardize Vite dev proxy for all `/api` and `/health` requests with appropriate origin forwarding.
3. **Dual Health & Readiness System (Stage 4):** Implement `/health/live` (liveness) and `/health/ready` (readiness with database verification and 200/503 status codes).
4. **Automated Root-Level Launcher (Stage 5):** Create `start-dev.ps1` and `stop-dev.ps1` in the project root to orchestrate Python venv detection, port checks, backend startup, readiness polling, and frontend launch in a single command.
5. **Frontend Connection Resilience (Stage 6):** Implement bounded retries with exponential backoff for transient failures, connection diagnostics, and user-driven retry actions.
6. **Authentication Flow Hardening (Stage 7):** Ensure login error normalization distinguishes between network disconnects, invalid credentials, account disabled, and server errors.
7. **Database Reconnection Resilience (Stage 8):** Add bounded connection timeouts (`serverSelectionTimeoutMS=2000`) and non-blocking startup error handling so database recovery occurs automatically.
8. **Regression Testing & Verification (Stages 9–10):** Add comprehensive automated test coverage and documentation.
