"""Admin-only medicine registry management, user management, audit trail + analytics."""

import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field

from app.database import medicines_col, verifications_col, audit_col, users_col, get_db
from app.schemas.medicine import MedicineCreate, MedicineUpdate, MedicineResponse
from app.schemas.verification import VerificationListItem, VerificationHistoryResponse
from app.services.auth_service import require_admin, hash_password

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
    if medicines_col().find_one({"product_identifier": body.product_identifier}):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product identifier already exists.")

    now = datetime.now(timezone.utc)
    med_id = f"med_{uuid.uuid4().hex[:10]}"
    doc = {
        "_id": med_id,
        "product_identifier": body.product_identifier,
        "product_name": body.product_name,
        "manufacturer": {"id": body.manufacturer_id, "name": body.manufacturer_name},
        "batch_number": body.batch_number,
        "serial_number": body.serial_number,
        "manufacturing_date": body.manufacturing_date,
        "expiry_date": body.expiry_date,
        "dosage": body.dosage,
        "package_size": body.package_size,
        "status": "active",
        "created_at": now,
        "updated_at": now,
    }
    medicines_col().insert_one(doc)

    doc["id"] = doc.pop("_id")
    return MedicineResponse(**doc)


@router.put("/medicines/{medicine_id}", response_model=MedicineResponse)
def update_medicine(medicine_id: str, body: MedicineUpdate):
    """Update an existing medicine record."""
    existing = medicines_col().find_one({"_id": medicine_id})
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medicine not found.")

    updates: dict = {"updated_at": datetime.now(timezone.utc)}
    data = body.model_dump(exclude_none=True)

    if "manufacturer_id" in data or "manufacturer_name" in data:
        mfr = existing.get("manufacturer", {})
        if "manufacturer_id" in data:
            mfr["id"] = data.pop("manufacturer_id")
        if "manufacturer_name" in data:
            mfr["name"] = data.pop("manufacturer_name")
        updates["manufacturer"] = mfr

    updates.update(data)
    medicines_col().update_one({"_id": medicine_id}, {"$set": updates})

    updated = medicines_col().find_one({"_id": medicine_id})
    updated["id"] = str(updated.pop("_id"))
    return MedicineResponse(**updated)


@router.delete("/medicines/{medicine_id}", status_code=status.HTTP_200_OK)
def deactivate_medicine(medicine_id: str):
    """Soft-delete a medicine by setting its status to inactive."""
    result = medicines_col().update_one(
        {"_id": medicine_id},
        {"$set": {"status": "inactive", "updated_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medicine not found.")
    return {"message": "Medicine deactivated."}


@router.post("/medicines/{medicine_id}/reactivate", status_code=status.HTTP_200_OK)
def reactivate_medicine(medicine_id: str):
    """Reactivate an inactive medicine."""
    result = medicines_col().update_one(
        {"_id": medicine_id},
        {"$set": {"status": "active", "updated_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medicine not found.")
    return {"message": "Medicine reactivated."}


@router.get("/medicines", response_model=list[MedicineResponse])
def list_all_medicines():
    """List all medicines including inactive ones (admin view)."""
    docs = list(medicines_col().find().sort("product_name", 1))
    result = []
    for d in docs:
        d["id"] = str(d.pop("_id"))
        result.append(MedicineResponse(**d))
    return result


# ---------------------------------------------------------------------------
# User Management (Admin Only)
# ---------------------------------------------------------------------------

@router.get("/users")
def list_users():
    """List all system users with their activity metrics."""
    users = list(users_col().find().sort("created_at", -1))
    result = []
    for u in users:
        uid = str(u["_id"])
        verification_count = verifications_col().count_documents({"user_id": uid})
        last_v = verifications_col().find_one({"user_id": uid}, sort=[("created_at", -1)])
        result.append({
            "id": uid,
            "name": u.get("name", "Unknown"),
            "email": u.get("email"),
            "role": u.get("role", "user"),
            "status": u.get("status", "active"),
            "created_at": u.get("created_at"),
            "verification_count": verification_count,
            "last_activity": last_v.get("created_at") if last_v else None,
        })
    return {"users": result, "total": len(result)}


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(body: AdminUserCreate):
    """Admin-initiated user account creation."""
    if users_col().find_one({"email": body.email}):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered.")

    now = datetime.now(timezone.utc)
    user_id = f"user_{uuid.uuid4().hex[:10]}"
    doc = {
        "_id": user_id,
        "name": body.name,
        "email": body.email,
        "password_hash": hash_password(body.password),
        "role": body.role,
        "status": "active",
        "created_at": now,
        "created_by": "admin",
    }
    users_col().insert_one(doc)
    return {
        "id": user_id,
        "name": body.name,
        "email": body.email,
        "role": body.role,
        "status": "active",
        "created_at": now,
    }


@router.patch("/users/{user_id}/status")
def update_user_status(user_id: str, body: AdminUserStatusUpdate):
    """Enable or disable a user account."""
    user = users_col().find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    users_col().update_one({"_id": user_id}, {"$set": {"status": body.status}})
    return {"id": user_id, "status": body.status, "message": f"User account {body.status}."}


@router.patch("/users/{user_id}/role")
def update_user_role(user_id: str, body: AdminUserRoleUpdate):
    """Change user role (user <-> admin)."""
    user = users_col().find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    users_col().update_one({"_id": user_id}, {"$set": {"role": body.role}})
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
    query: dict = {}
    if status_filter:
        query["status"] = status_filter.upper()
    if user_id:
        query["user_id"] = user_id
    if search:
        s = search.strip()
        query["$or"] = [
            {"raw_identifier": {"$regex": s, "$options": "i"}},
            {"user_name": {"$regex": s, "$options": "i"}},
            {"user_email": {"$regex": s, "$options": "i"}},
            {"medicine.product_name": {"$regex": s, "$options": "i"}},
            {"parsed_data.batch_number": {"$regex": s, "$options": "i"}},
        ]

    total = verifications_col().count_documents(query)
    skip = (page - 1) * limit
    docs = list(
        verifications_col()
        .find(query)
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )

    items = []
    for d in docs:
        med = d.get("medicine") or {}
        items.append(
            VerificationListItem(
                verification_id=str(d["_id"]),
                raw_identifier=d.get("raw_identifier", ""),
                status=d.get("status", ""),
                confidence_score=d.get("confidence_score", 0),
                product_name=med.get("product_name"),
                manufacturer=med.get("manufacturer") or d.get("user_name"),
                created_at=d.get("created_at"),
            )
        )

    return VerificationHistoryResponse(items=items, total=total, page=page, limit=limit)


# ---------------------------------------------------------------------------
# Real System Health (Admin Only)
# ---------------------------------------------------------------------------

@router.get("/system-health")
def get_system_health():
    """Return real-time diagnostic telemetry for core verification infrastructure."""
    # 1. MongoDB check
    db_status = "operational"
    db_latency_ms = 0.0
    try:
        t0 = time.perf_counter()
        get_db().command("ping")
        db_latency_ms = round((time.perf_counter() - t0) * 1000, 2)
    except Exception:
        db_status = "degraded"

    # 2. Registry status
    total_meds = medicines_col().count_documents({})
    active_meds = medicines_col().count_documents({"status": "active"})
    registry_status = "healthy" if active_meds > 0 else "empty"

    # 3. Verification engine status
    verif_status = "operational"
    total_verifications = verifications_col().count_documents({})

    # 4. Auth & Users status
    total_users = users_col().count_documents({})
    active_users = users_col().count_documents({"status": {"$ne": "disabled"}})
    auth_status = "operational"

    # 5. Anomaly rate calculation
    anomalies = verifications_col().count_documents({"status": {"$in": ["SUSPICIOUS", "NOT_FOUND"]}})
    anomaly_rate = round((anomalies / total_verifications * 100), 1) if total_verifications > 0 else 0.0

    return {
        "overall_status": "healthy" if db_status == "operational" else "degraded",
        "timestamp": datetime.now(timezone.utc),
        "components": {
            "database": {
                "name": "MongoDB Cluster",
                "status": db_status,
                "latency_ms": db_latency_ms,
                "connection": "connected" if db_status == "operational" else "failed",
            },
            "verification_engine": {
                "name": "Rules & Cryptographic Scoring Engine",
                "status": verif_status,
                "scoring_model": "6-Factor Weighted Deterministic",
                "processed_count": total_verifications,
            },
            "registry": {
                "name": "Pharmaceutical Medicine Catalog",
                "status": registry_status,
                "total_records": total_meds,
                "active_records": active_meds,
            },
            "authentication": {
                "name": "JWT Security & RBAC Guard",
                "status": auth_status,
                "total_accounts": total_users,
                "active_accounts": active_users,
            },
            "api": {
                "name": "FastAPI Core Gateway",
                "status": "operational",
                "version": "1.0.0",
                "environment": "production",
            },
        },
        "telemetry": {
            "total_verifications": total_verifications,
            "anomaly_rate_percent": anomaly_rate,
            "active_medicines": active_meds,
            "system_users": total_users,
        },
    }


# ---------------------------------------------------------------------------
# Analytics & Global Command Center Data
# ---------------------------------------------------------------------------

@router.get("/analytics")
def get_analytics():
    """Return summary statistics for the admin dashboard."""
    total_medicines = medicines_col().count_documents({})
    active_medicines = medicines_col().count_documents({"status": "active"})
    total_verifications = verifications_col().count_documents({})

    pipeline = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    status_counts = {d["_id"]: d["count"] for d in verifications_col().aggregate(pipeline)}

    recent = list(
        verifications_col()
        .find({}, {"_id": 1, "status": 1, "confidence_score": 1, "raw_identifier": 1, "created_at": 1, "medicine": 1, "user_name": 1, "user_email": 1})
        .sort("created_at", -1)
        .limit(12)
    )
    for r in recent:
        r["verification_id"] = str(r.pop("_id"))

    # Anomalies count
    suspicious_count = status_counts.get("SUSPICIOUS", 0)
    not_found_count = status_counts.get("NOT_FOUND", 0)
    review_count = status_counts.get("REVIEW", 0)
    verified_count = status_counts.get("VERIFIED", 0)

    anomaly_total = suspicious_count + not_found_count
    anomaly_rate = round((anomaly_total / total_verifications * 100), 1) if total_verifications > 0 else 0.0

    return {
        "total_medicines": total_medicines,
        "active_medicines": active_medicines,
        "total_verifications": total_verifications,
        "anomaly_rate": anomaly_rate,
        "status_breakdown": {
            "VERIFIED": verified_count,
            "REVIEW": review_count,
            "SUSPICIOUS": suspicious_count,
            "NOT_FOUND": not_found_count,
        },
        "recent_verifications": recent,
    }
