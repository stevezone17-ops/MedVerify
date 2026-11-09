# MedVerify Service Health, Lifecycle & Disaster Recovery Architecture

This document specifies the health monitoring, dependency isolation, failure handling, and automated recovery mechanisms in MedVerify.

---

## 1. Architectural Philosophy

MedVerify implements **resilient decoupled services**:
1. **Separation of Liveness and Readiness:** The API server boots instantly and serves HTTP traffic even during backend database maintenance or network partition.
2. **Bounded Database Latency:** Database selection and connection timeouts are capped at 2,000 ms, preventing thread starvation and frozen HTTP worker pools.
3. **Graceful Degradation:** When the database is temporarily offline, endpoints report structured HTTP 503 errors rather than unhandled 500 exceptions, allowing frontend clients to present retry workflows.
4. **Automated Recovery:** Connection pools self-heal as soon as MongoDB or Supabase connectivity resumes without requiring application restarts.
5. **Idempotency-Safe Retries:** Frontend network retries are bounded and strictly limited to idempotent `GET` and `HEAD` operations. Non-idempotent mutations (`POST /auth/login`, `POST /api/verify`) are never silently retried.

---

## 2. Health & Diagnostic Endpoints

MedVerify exposes standardized health endpoints on both root and `/api` namespaces:

### A. Liveness Probe (`GET /health/live` and `GET /api/health/live`)
- **Purpose:** Verifies that the FastAPI process is alive, listening on its socket, and processing ASGI requests.
- **Dependencies:** None (does not query database, cache, or external APIs).
- **Latency:** `< 1 ms`.
- **Response Format:**
  ```json
  {
    "status": "alive",
    "service": "medverify-api",
    "version": "1.0.0",
    "timestamp": "2026-11-09T10:00:00.000000Z",
    "uptime_seconds": 128.4
  }
  ```
- **HTTP Status:** Always `200 OK`.
- **Orchestrator Role:** Use as the Kubernetes/Container liveness probe to detect frozen processes.

### B. Readiness Probe (`GET /health/ready` and `GET /api/health/ready`)
- **Purpose:** Verifies that the database is reachable and the application is prepared to execute operations.
- **Dependencies:** MongoDB ping command (`client.admin.command("ping")`).
- **Timeout:** 2,000 ms strict upper bound.
- **Healthy Response (HTTP 200 OK):**
  ```json
  {
    "status": "ready",
    "service": "medverify-api",
    "version": "1.0.0",
    "database": {
      "status": "connected",
      "name": "medicine_verification",
      "error": null,
      "latency_ms": 2.1
    },
    "timestamp": "2026-11-09T10:00:00.000000Z",
    "uptime_seconds": 128.4
  }
  ```
- **Degraded Response (HTTP 503 Service Unavailable):**
  ```json
  {
    "status": "unready",
    "service": "medverify-api",
    "database": {
      "status": "disconnected",
      "name": "medicine_verification",
      "error": "ServerSelectionTimeoutError: No replica set members match selector",
      "latency_ms": 2001.2
    },
    "timestamp": "2026-11-09T10:00:00.000000Z",
    "uptime_seconds": 128.4
  }
  ```
- **Orchestrator Role:** Use as the Kubernetes/Container readiness probe to control load balancer traffic routing.

### C. General Health (`GET /health` and `GET /api/health`)
- **Purpose:** Standard diagnostic check returning overall health and operational status.
- **Response Format:**
  ```json
  {
    "status": "ok",
    "service": "medverify-api",
    "version": "1.0.0",
    "database": "connected"
  }
  ```

---

## 3. Database Reconnection & Resiliency Lifecycle

```
[ Application Boot ]
         │
         ▼
[ Lifespan Handler: ensure_indexes() ]
         ├── Success ─────────► [ Serving Full Traffic (HTTP 200) ]
         └── Timeout / Drop ──► [ Running Degraded (HTTP 503 on DB routes) ]
                                            │
                                            ▼ (MongoDB reconnects)
                                [ Next Request / Ping ]
                                            │
                                            ▼
                                [ Automatic Pool Reconnect ]
                                            │
                                            ▼
                                [ Full Health Restored (HTTP 200) ]
```

### Key Safety Guarantees
1. **Non-Blocking Startup:** If MongoDB is offline during backend startup, `ensure_indexes()` catches the error, logs a warning, and yields control so FastAPI finishes booting on port 8001.
2. **Fast-Failing Timeouts:** `MongoClient` is initialized with:
   - `serverSelectionTimeoutMS=2000`
   - `connectTimeoutMS=2000`
   - `socketTimeoutMS=5000`
   - `retryWrites=True`
3. **Global Exception Handling:** Any unhandled `pymongo.errors.PyMongoError` is intercepted by the global FastAPI exception handler and transformed into a structured HTTP 503 response.
4. **Client Pool Reset:** When a health check detects a connection drop, `close_client()` resets the singleton client so the next inbound request instantiates a fresh connection pool.

---

## 4. Frontend Resilience Strategy

### Bounded Exponential Retry
In `frontend/src/api/client.ts`, `apiFetch` applies retry logic only when:
- The HTTP method is `GET` or `HEAD`.
- A transient connection drop, abort, or 502/503/504 status occurs.
- Up to 2 retries with exponential backoff (400 ms, 800 ms).

### Strict Mutation Safety
Mutations (`POST`, `PUT`, `PATCH`, `DELETE`) are **never automatically retried**. If a network failure occurs during a login attempt, `Login.tsx` surfaces the error banner with a manual "Retry Connection" action.

### Active Connection Polling on UI
The Login interface (`frontend/src/pages/Login.tsx`) features a live status indicator that probes `/health/live` and `/health/ready` via `checkBackendHealth()`. If the backend comes back online while the user is viewing the page, the offline alert banner automatically clears.

---

## 5. Verification Commands for Operations & CI

Run these commands to verify system health in any environment:

```powershell
# 1. Probe API Liveness
curl -s http://127.0.0.1:8001/health/live

# 2. Probe Deep Readiness (Database + Service)
curl -s http://127.0.0.1:8001/health/ready

# 3. Run Backend Connectivity Regression Suite
backend\.venv\Scripts\pytest.exe backend\tests\test_connectivity_and_health.py -v

# 4. Verify Frontend Production Typecheck & Bundle
npm --prefix frontend run build
```
