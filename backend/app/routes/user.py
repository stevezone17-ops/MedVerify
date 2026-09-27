"""User-specific routes — personal verification history, stats, and profile."""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from app.db.repositories import verifications_repo, profiles_repo
from app.schemas.verification import VerificationHistoryResponse, VerificationListItem
from app.services.auth_service import get_current_user
from app.utils.timestamps import to_iso_utc

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
    items_data, total = verifications_repo.list_history(
        status_filter=status_filter,
        user_id=user_id,
        search=search,
        page=page,
        limit=limit,
    )

    items = [VerificationListItem(**d) for d in items_data]
    return VerificationHistoryResponse(items=items, total=total, page=page, limit=limit)


@router.get("/stats")
def get_user_stats(current_user: dict = Depends(get_current_user)):
    """Return personal verification metrics strictly for the logged-in user."""
    user_id = str(current_user["_id"])
    user_email = current_user.get("email")
    stats = verifications_repo.get_user_stats(user_id=user_id, user_email=user_email)

    return {
        "user_id": user_id,
        "user_name": current_user.get("name"),
        **stats,
    }


@router.get("/profile")
def get_user_profile(current_user: dict = Depends(get_current_user)):
    """Return authenticated user profile details and activity summary."""
    user_id = str(current_user["_id"])
    user_email = current_user.get("email")
    stats = verifications_repo.get_user_stats(user_id=user_id, user_email=user_email)
    recent = verifications_repo.get_user_recent(user_id=user_id, user_email=user_email, limit=1)
    last_activity = recent[0]["created_at"] if recent else None

    return {
        "id": user_id,
        "name": current_user.get("name"),
        "email": current_user.get("email"),
        "role": current_user.get("role", "user"),
        "status": current_user.get("status", "active"),
        "created_at": to_iso_utc(current_user.get("created_at")),
        "total_verifications": stats.get("total_verifications", 0),
        "last_activity": last_activity,
    }


@router.get("/recent")
def get_user_recent(
    limit: int = Query(5, ge=1, le=20),
    current_user: dict = Depends(get_current_user),
):
    """Return the recent 5 verifications performed by this user."""
    user_id = str(current_user["_id"])
    user_email = current_user.get("email")
    recent = verifications_repo.get_user_recent(user_id=user_id, user_email=user_email, limit=limit)
    return {"recent": recent}
