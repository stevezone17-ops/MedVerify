"""Verification history endpoints."""

from fastapi import APIRouter, Query, HTTPException, status, Depends

from app.db.repositories import verifications_repo
from app.schemas.verification import (
    VerificationResult,
    VerificationListItem,
    VerificationHistoryResponse,
)
from app.services.auth_service import require_admin, get_optional_current_user

router = APIRouter(prefix="/api", tags=["History"])


@router.get("/verifications", response_model=VerificationHistoryResponse, dependencies=[Depends(require_admin)])
def list_verifications(
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """Return paginated verification history, strictly for authorized administrators."""
    items_data, total = verifications_repo.list_history(
        status_filter=status_filter,
        page=page,
        limit=limit,
    )

    items = [VerificationListItem(**d) for d in items_data]
    return VerificationHistoryResponse(items=items, total=total, page=page, limit=limit)


@router.get("/verifications/{verification_id}", response_model=VerificationResult)
def get_verification(
    verification_id: str,
    current_user: dict | None = Depends(get_optional_current_user),
):
    """Retrieve a single verification result by ID with strict ownership/admin access control."""
    doc = verifications_repo.get_by_id(verification_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Verification not found.")

    # Access control: If record is tied to a user, enforce that requester is that user or an admin
    record_user_id = doc.get("user_id")
    if record_user_id:
        if not current_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required to view this verification record.",
            )
        current_id = str(current_user.get("_id") or current_user.get("id"))
        is_admin = str(current_user.get("role", "")).lower() == "admin"
        if not is_admin and current_id != str(record_user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this verification record.",
            )

    return VerificationResult(**doc)

