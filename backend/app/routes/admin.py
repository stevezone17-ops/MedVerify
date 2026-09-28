"""Admin-only medicine registry management, user management, audit trail + analytics."""

import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field

from app.db.repositories import (
    medicines_repo,
    verifications_repo,
    profiles_repo,
)
from app.db.supabase_client import is_supabase_configured, get_supabase_client
from app.schemas.medicine import MedicineCreate, MedicineUpdate, MedicineResponse
from app.schemas.verification import VerificationListItem, VerificationHistoryResponse
from app.services.auth_service import require_admin, hash_password
from app.utils.timestamps import to_iso_utc

router = APIRouter(prefix="/api/admin", tags=["Admin"], dependencies=[Depends(require_admin)])


# ---------------------------------------------------------------------------
# Request/Response Schemas for Admin Operations
# ---------------------------------------------------------------------------

class AdminUserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6)
    role: str = Field("user", pattern="^(user|admin)$")


class AdminUserStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(active|disabled)$")


class AdminUserRoleUpdate(BaseModel):
    role: str = Field(..., pattern="^(user|admin)$")


# ---------------------------------------------------------------------------
# Medicine Registry CRUD
# ---------------------------------------------------------------------------

@router.post("/medicines", response_model=MedicineResponse, status_code=status.HTTP_201_CREATED)
def create_medicine(body: MedicineCreate):
    """Add a new medicine to the registry."""
    if medicines_repo.get_by_gtin(body.product_identifier):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product identifier already exists.")

    doc = medicines_repo.create(body.model_dump())
    return MedicineResponse(**doc)


@router.put("/medicines/{medicine_id}", response_model=MedicineResponse)
def update_medicine(medicine_id: str, body: MedicineUpdate):
    """Update an existing medicine record."""
    existing = medicines_repo.get_by_id(medicine_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medicine not found.")

    data = body.model_dump(exclude_none=True)
    updated = medicines_repo.update(medicine_id, data)
    if not updated:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to update medicine.")

    return MedicineResponse(**updated)


@router.delete("/medicines/{medicine_id}", status_code=status.HTTP_200_OK)
def deactivate_medicine(medicine_id: str):
    """Soft-delete a medicine by setting its status to inactive."""
    success = medicines_repo.delete(medicine_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medicine not found.")
    return {"message": "Medicine deactivated."}


@router.post("/medicines/{medicine_id}/reactivate", status_code=status.HTTP_200_OK)
def reactivate_medicine(medicine_id: str):
    """Reactivate an inactive medicine."""
    success = medicines_repo.reactivate(medicine_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medicine not found.")
    return {"message": "Medicine reactivated."}


@router.get("/medicines", response_model=list[MedicineResponse])
def list_all_medicines():
    """List all medicines including inactive ones (admin view)."""
    docs = medicines_repo.list_all(active_only=False)
    result = []
    for d in docs:
        d["id"] = str(d.get("id") or d.get("_id"))
        result.append(MedicineResponse(**d))
    return result


# ---------------------------------------------------------------------------
# User Management (Admin Only)
# ---------------------------------------------------------------------------

@router.get("/users")
def list_users():
    """List all system users with their activity metrics."""
    users = profiles_repo.list_users()
    result = []
    for u in users:
        uid = str(u["id"])
        stats = verifications_repo.get_user_stats(user_id=uid, user_email=u.get("email"))
        recent = verifications_repo.get_user_recent(user_id=uid, user_email=u.get("email"), limit=1)
        last_activity = recent[0]["created_at"] if recent else None

        result.append({
            "id": uid,
            "name": u.get("name", "Unknown"),
            "email": u.get("email"),
            "role": u.get("role", "user"),
            "status": u.get("status", "active"),
            "created_at": u.get("created_at"),
            "verification_count": stats.get("total_verifications", 0),
            "last_activity": last_activity,
        })
    return {"users": result, "total": len(result)}


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(body: AdminUserCreate):
    """Admin-initiated user account creation."""
    if profiles_repo.get_by_email(body.email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered.")

    now = datetime.now(timezone.utc)
    user_doc = profiles_repo.create_user({
        "name": body.name,
        "email": body.email,
        "password_hash": hash_password(body.password),
        "role": body.role,
        "status": "active",
    })
    return {
        "id": str(user_doc["id"]),
        "name": body.name,
        "email": body.email,
        "role": body.role,
        "status": "active",
        "created_at": to_iso_utc(now),
    }


@router.patch("/users/{user_id}/status")
def update_user_status(user_id: str, body: AdminUserStatusUpdate):
    """Enable or disable a user account."""
    user = profiles_repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    profiles_repo.update_status(user_id, body.status)
    return {"id": user_id, "status": body.status, "message": f"User account {body.status}."}


@router.patch("/users/{user_id}/role")
def update_user_role(user_id: str, body: AdminUserRoleUpdate):
    """Change user role (user <-> admin)."""
    user = profiles_repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    profiles_repo.update_role(user_id, body.role)
    return {"id": user_id, "role": body.role, "message": f"User role updated to {body.role}."}


# ---------------------------------------------------------------------------
# Global Audit Trail (Admin Only)
# ---------------------------------------------------------------------------

@router.get("/audit", response_model=VerificationHistoryResponse)
def get_admin_audit(
    status_filter: str | None = Query(None, alias="status"),
    user_id: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """Return comprehensive system-wide verification audit log."""
    items_data, total = verifications_repo.list_history(
        status_filter=status_filter,
        user_id=user_id,
        search=search,
        page=page,
        limit=limit,
    )
    items = [VerificationListItem(**d) for d in items_data]
    return VerificationHistoryResponse(items=items, total=total, page=page, limit=limit)


# ---------------------------------------------------------------------------
# Real System Health (Admin Only)
# ---------------------------------------------------------------------------

@router.get("/system-health")
def get_system_health():
    """Return real-time diagnostic telemetry for core verification infrastructure."""
    db_name = "Supabase PostgreSQL" if is_supabase_configured() else "MongoDB Cluster (Fallback)"
    db_status = "operational"
    db_latency_ms = 0.0

    try:
        t0 = time.perf_counter()
        client = get_supabase_client()
        if client:
            client.table("medicines").select("id").limit(1).execute()
        else:
            from app.database import get_db
            get_db().command("ping")
        db_latency_ms = round((time.perf_counter() - t0) * 1000, 2)
    except Exception:
        db_status = "degraded"

    analytics = verifications_repo.get_admin_analytics()
    users = profiles_repo.list_users()

    return {
        "overall_status": "healthy" if db_status == "operational" else "degraded",
        "timestamp": to_iso_utc(datetime.now(timezone.utc)),
        "components": {
            "database": {
                "name": db_name,
                "status": db_status,
                "latency_ms": db_latency_ms,
                "connection": "connected" if db_status == "operational" else "failed",
                "backend": "supabase" if is_supabase_configured() else "mongodb",
            },
            "verification_engine": {
                "name": "Rules & Cryptographic Scoring Engine",
                "status": "operational",
                "scoring_model": "6-Factor Weighted Deterministic",
                "processed_count": analytics.get("total_verifications", 0),
            },
            "registry": {
                "name": "Pharmaceutical Medicine Catalog",
                "status": "healthy" if analytics.get("active_medicines", 0) > 0 else "empty",
                "total_records": analytics.get("total_medicines", 0),
                "active_records": analytics.get("active_medicines", 0),
            },
            "authentication": {
                "name": "Supabase Auth & RBAC Guard",
                "status": "operational",
                "total_accounts": len(users),
                "active_accounts": sum(1 for u in users if u.get("status") != "disabled"),
            },
            "api": {
                "name": "FastAPI Core Gateway",
                "status": "operational",
                "version": "1.0.0",
                "environment": "production",
            },
        },
        "telemetry": {
            "total_verifications": analytics.get("total_verifications", 0),
            "anomaly_rate_percent": analytics.get("anomaly_rate", 0.0),
            "active_medicines": analytics.get("active_medicines", 0),
            "system_users": len(users),
        },
    }


# ---------------------------------------------------------------------------
# Analytics & Global Command Center Data
# ---------------------------------------------------------------------------

@router.get("/analytics")
def get_analytics():
    """Return summary statistics for the admin dashboard."""
    return verifications_repo.get_admin_analytics()


@router.get("/investigation/{verification_id}")
def get_investigation(verification_id: str):
    """Return full verification record plus pipeline events for admin forensic investigation."""
    doc = verifications_repo.get_by_id(verification_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Verification not found.")

    # Try to fetch pipeline events from Supabase
    events = []
    client = get_supabase_client()
    if client:
        try:
            # Look up the Supabase UUID from the legacy_id
            v_res = client.table("verification_records").select("id").eq(
                "legacy_id", verification_id
            ).limit(1).execute()
            supa_v_id = None
            if v_res.data:
                supa_v_id = v_res.data[0]["id"]
            else:
                # Try direct UUID match
                try:
                    uuid.UUID(verification_id)
                    supa_v_id = verification_id
                except ValueError:
                    pass

            if supa_v_id:
                ev_res = client.table("verification_events").select("*").eq(
                    "verification_id", supa_v_id
                ).order("timestamp").execute()
                events = ev_res.data or []
        except Exception as exc:
            logger.warning("Failed to load pipeline events: %s", exc)

    # Build pipeline stages from the verification data itself
    pipeline_stages = _build_pipeline_stages(doc, events)

    return {
        **doc,
        "pipeline_events": events,
        "pipeline_stages": pipeline_stages,
    }


def _build_pipeline_stages(doc: dict, events: list) -> list[dict]:
    """Reconstruct pipeline stages from the verification record and any stored events."""
    stages = []
    method = (doc.get("verification_method") or doc.get("input_type") or "QR").upper()
    raw = doc.get("raw_identifier", "")

    # Stage 1: Optical Capture / Input
    stages.append({
        "stage": "input_capture",
        "label": "Input Capture",
        "status": "COMPLETE",
        "detail": f"Received {method} payload: {raw[:60]}{'...' if len(raw) > 60 else ''}",
    })

    # Stage 2: Extraction / Parsing
    parsed = doc.get("parsed_data") or {}
    stages.append({
        "stage": "extraction",
        "label": "Extraction & Normalization",
        "status": "COMPLETE",
        "detail": f"Parsed {len(parsed)} fields from {method} input",
    })

    # Stage 3: Registry Lookup
    has_match = bool(doc.get("matched_medicine_id") or (doc.get("medicine") and doc["medicine"].get("product_name")))
    stages.append({
        "stage": "registry_lookup",
        "label": "Registry Lookup",
        "status": "COMPLETE" if has_match else "NO_MATCH",
        "detail": "Product found in registry" if has_match else "No matching product in registry",
    })

    # Stage 4–6: Validations from checks
    checks = doc.get("checks") or []
    for chk in checks:
        chk_data = chk if isinstance(chk, dict) else (chk.model_dump() if hasattr(chk, "model_dump") else {})
        field = chk_data.get("field", "")
        name = chk_data.get("name", field)
        chk_status = chk_data.get("status", "SKIP")
        detail = chk_data.get("detail") or ""
        stages.append({
            "stage": f"check_{field}",
            "label": f"{name} Validation",
            "status": chk_status,
            "detail": detail,
        })

    # Final verdict
    stages.append({
        "stage": "final_verdict",
        "label": "Final Verdict",
        "status": doc.get("status", "UNKNOWN"),
        "detail": f"Confidence: {doc.get('confidence_score', 0)}%",
    })

    return stages


import logging as _logging
logger = _logging.getLogger("medverify.admin")
