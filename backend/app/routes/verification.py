"""Verification endpoints — the core public API."""

from fastapi import APIRouter, HTTPException, Depends, status

from app.schemas.verification import VerifyRequest, VerificationResult
from app.services.verification_engine import verify_medicine
from app.services.auth_service import get_optional_current_user

router = APIRouter(prefix="/api", tags=["Verification"])


@router.post("/verify", response_model=VerificationResult, status_code=status.HTTP_200_OK)
def verify(req: VerifyRequest, current_user: dict | None = Depends(get_optional_current_user)):
    """Accept a scanned identifier and return an explainable verification result."""
    try:
        return verify_medicine(req, user=current_user)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
