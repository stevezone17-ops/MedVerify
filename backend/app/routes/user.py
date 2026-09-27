"""User-specific routes — personal verification history, stats, and profile."""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from app.database import verifications_col, users_col
from app.schemas.verification import VerificationHistoryResponse, VerificationListItem
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/user", tags=["User"])


@router.get("/history", response_model=VerificationHistoryResponse)
def get_user_history(
    status_filter: str | None = Query(None, alias="status"),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(15, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """Return paginated verification history scoped exclusively to the authenticated user."""
    user_id = str(current_user["_id"])
    query: dict = {"user_id": user_id}

    if status_filter:
        query["status"] = status_filter.upper()

    if search:
        s = search.strip()
        query["$or"] = [
            {"raw_identifier": {"$regex": s, "$options": "i"}},
            {"medicine.product_name": {"$regex": s, "$options": "i"}},
            {"medicine.manufacturer": {"$regex": s, "$options": "i"}},
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
                manufacturer=med.get("manufacturer"),
                created_at=d.get("created_at"),
            )
        )

    return VerificationHistoryResponse(items=items, total=total, page=page, limit=limit)


@router.get("/stats")
def get_user_stats(current_user: dict = Depends(get_current_user)):
    """Return personal verification metrics strictly for the logged-in user."""
    user_id = str(current_user["_id"])

    total = verifications_col().count_documents({"user_id": user_id})
    verified = verifications_col().count_documents({"user_id": user_id, "status": "VERIFIED"})
    review = verifications_col().count_documents({"user_id": user_id, "status": "REVIEW"})
    suspicious = verifications_col().count_documents({"user_id": user_id, "status": "SUSPICIOUS"})
    not_found = verifications_col().count_documents({"user_id": user_id, "status": "NOT_FOUND"})

    return {
        "user_id": user_id,
        "user_name": current_user.get("name"),
        "total_verifications": total,
        "verified_count": verified,
        "review_count": review,
        "suspicious_count": suspicious,
        "not_found_count": not_found,
    }


@router.get("/profile")
def get_user_profile(current_user: dict = Depends(get_current_user)):
    """Return authenticated user profile details and activity summary."""
    user_id = str(current_user["_id"])
    total = verifications_col().count_documents({"user_id": user_id})
    last_verification = verifications_col().find_one(
        {"user_id": user_id},
        sort=[("created_at", -1)],
    )

    return {
        "id": user_id,
        "name": current_user.get("name"),
        "email": current_user.get("email"),
        "role": current_user.get("role", "user"),
        "status": current_user.get("status", "active"),
        "created_at": current_user.get("created_at"),
        "total_verifications": total,
        "last_activity": last_verification.get("created_at") if last_verification else None,
    }


@router.get("/recent")
def get_user_recent(
    limit: int = Query(5, ge=1, le=20),
    current_user: dict = Depends(get_current_user),
):
    """Return the recent 5 verifications performed by this user."""
    user_id = str(current_user["_id"])
    docs = list(
        verifications_col()
        .find({"user_id": user_id})
        .sort("created_at", -1)
        .limit(limit)
    )

    recent_items = []
    for d in docs:
        med = d.get("medicine") or {}
        recent_items.append({
            "verification_id": str(d["_id"]),
            "raw_identifier": d.get("raw_identifier", ""),
            "status": d.get("status", ""),
            "confidence_score": d.get("confidence_score", 0),
            "product_name": med.get("product_name") or d.get("parsed_data", {}).get("product_identifier", "Unknown Product"),
            "manufacturer": med.get("manufacturer") or "Unspecified",
            "batch_number": d.get("parsed_data", {}).get("batch_number", "N/A"),
            "created_at": d.get("created_at"),
        })

    return {"recent": recent_items}
