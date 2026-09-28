"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import ensure_indexes
from app.routes import verification, history, medicines, auth, admin, user, reports, cabinet, notifications, ai


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup tasks before the app begins serving requests."""
    ensure_indexes()
    yield


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


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
def health():
    return {"status": "ok", "service": "medverify-api", "version": "1.0.0"}

