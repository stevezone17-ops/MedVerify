"""Verification history endpoints."""

from fastapi import APIRouter, Query, HTTPException, status

from app.database import verifications_col
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
    query: dict = {}
    if status_filter:
        query["status"] = status_filter.upper()

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
        items.append(VerificationListItem(
            verification_id=str(d["_id"]),
            raw_identifier=d.get("raw_identifier", ""),
            status=d.get("status", ""),
            confidence_score=d.get("confidence_score", 0),
            product_name=med.get("product_name"),
            manufacturer=med.get("manufacturer"),
            created_at=d.get("created_at"),
        ))

    return VerificationHistoryResponse(items=items, total=total, page=page, limit=limit)


@router.get("/verifications/{verification_id}", response_model=VerificationResult)
def get_verification(verification_id: str):
    """Retrieve a single verification result by ID."""
    doc = verifications_col().find_one({"_id": verification_id})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Verification not found.")

    doc["verification_id"] = str(doc.pop("_id"))
    return VerificationResult(**doc)
