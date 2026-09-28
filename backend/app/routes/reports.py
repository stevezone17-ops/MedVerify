"""Verification Concern and Suspicious Medicine Reporting endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional

from app.db.repositories import reports_repo
from app.services.auth_service import get_current_user, require_admin

router = APIRouter(prefix="/api", tags=["Reports"])


class ReportCreate(BaseModel):
    verification_id: Optional[str] = None
    report_type: str = Field(
        "VERIFICATION_CONCERN",
        pattern="^(VERIFICATION_CONCERN|PACKAGING_DEFECT|EXPIRED_PRODUCT|SUSPICIOUS_SELLER|BATCH_NOT_RECOGNIZED|MANUFACTURER_MISMATCH|PRODUCT_MISMATCH|EXPIRY_MISMATCH|SERIAL_MISMATCH|SUSPICIOUS_PACKAGING|INCORRECT_BARCODE|TAMPERED_SEAL|ADVERSE_REACTION|OTHER)$",
    )
    description: str = Field(..., min_length=5, max_length=2000)


@router.post("/reports", status_code=status.HTTP_201_CREATED)
def submit_report(body: ReportCreate, current_user: dict = Depends(get_current_user)):
    """Submit a concern or report regarding a verification result."""
    user_id = str(current_user["_id"])
    report = reports_repo.create({
        "user_id": user_id,
        "verification_id": body.verification_id,
        "report_type": body.report_type,
        "description": body.description,
    })
    return report


@router.get("/user/reports")
def list_my_reports(current_user: dict = Depends(get_current_user)):
    """List reports filed by the logged-in user."""
    user_id = str(current_user["_id"])
    return reports_repo.list_reports(user_id=user_id)


@router.get("/admin/reports", dependencies=[Depends(require_admin)])
def list_all_reports():
    """List all submitted reports across the platform (admin only)."""
    return reports_repo.list_reports()
