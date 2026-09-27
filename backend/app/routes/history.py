"""Verification history endpoints."""

from fastapi import APIRouter, Query, HTTPException, status

from app.db.repositories import verifications_repo
from app.schemas.verification import (
    VerificationResult,
    VerificationListItem,
    VerificationHistoryResponse,
)

router = APIRouter(prefix="/api", tags=["History"])


@router.get("/verifications", response_model=VerificationHistoryResponse)
def list_verifications(
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """Return paginated verification history, optionally filtered by status."""
    items_data, total = verifications_repo.list_history(
        status_filter=status_filter,
        page=page,
        limit=limit,
    )

    items = [VerificationListItem(**d) for d in items_data]
    return VerificationHistoryResponse(items=items, total=total, page=page, limit=limit)


@router.get("/verifications/{verification_id}", response_model=VerificationResult)
def get_verification(verification_id: str):
    """Retrieve a single verification result by ID."""
    doc = verifications_repo.get_by_id(verification_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Verification not found.")

    return VerificationResult(**doc)
