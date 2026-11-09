"""FastAPI application entry point."""

import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import ensure_indexes, check_database_health, close_client
from app.routes import verification, history, medicines, auth, admin, user, reports, cabinet, notifications, ai, image_verification

logger = logging.getLogger("medverify")
_app_start_time = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup tasks before the app begins serving requests."""
    logger.info("Initializing MedVerify backend service...")
    db_ok = ensure_indexes()
    if db_ok:
        logger.info("Database indexes successfully verified.")
    else:
        logger.warning(
            "MongoDB unavailable during startup. MedVerify starting in degraded mode; will reconnect automatically."
        )
    yield
    logger.info("Shutting down MedVerify backend service...")
    close_client()


app = FastAPI(
    title="MedVerify — Counterfeit Medicine Detection API",
    description="QR/barcode-based medicine verification with explainable confidence scoring.",
    version="1.0.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

_raw_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
if settings.frontend_url and settings.frontend_url not in _raw_origins:
    _raw_origins.append(settings.frontend_url.strip())

app.add_middleware(
    CORSMiddleware,
    allow_origins=_raw_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    """Add defensive security headers to all HTTP responses."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(verification.router)
app.include_router(history.router)
app.include_router(medicines.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(user.router)
app.include_router(reports.router)
app.include_router(cabinet.router)
app.include_router(notifications.router)
app.include_router(ai.router)
app.include_router(ai.admin_ai_router)
app.include_router(image_verification.router)


# ---------------------------------------------------------------------------
# Health & Readiness checks
# ---------------------------------------------------------------------------

@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
def health():
    """General health status."""
    db_ok, _, _ = check_database_health()
    return {
        "status": "ok" if db_ok else "degraded",
        "service": "medverify-api",
        "version": "1.0.0",
        "database": "connected" if db_ok else "disconnected",
    }


@app.get("/health/live", tags=["Health"])
@app.get("/api/health/live", tags=["Health"])
def health_live():
    """Liveness probe: verifies process is alive and receiving HTTP traffic."""
    uptime = round(time.time() - _app_start_time, 2)
    return {
        "status": "alive",
        "service": "medverify-api",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": uptime,
    }


@app.get("/health/ready", tags=["Health"])
@app.get("/api/health/ready", tags=["Health"])
def health_ready():
    """Readiness probe: verifies database connectivity and readiness to serve traffic."""
    db_ok, db_detail, latency_ms = check_database_health()
    uptime = round(time.time() - _app_start_time, 2)
    payload = {
        "status": "ready" if db_ok else "unready",
        "service": "medverify-api",
        "version": "1.0.0",
        "database": {
            "status": "connected" if db_ok else "disconnected",
            "name": db_detail if db_ok else settings.database_name,
            "error": None if db_ok else db_detail,
            "latency_ms": latency_ms,
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": uptime,
    }
    if not db_ok:
        return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=payload)
    return payload

