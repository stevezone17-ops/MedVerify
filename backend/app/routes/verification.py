"""Verification endpoints — the core public API."""

from fastapi import APIRouter, HTTPException, Depends, status

from app.schemas.verification import VerifyRequest, VerificationResult
from app.services.verification_engine import verify_medicine
from app.services.auth_service import get_optional_current_user

router = APIRouter(prefix="/api", tags=["Verification"])


@router.get("/verify", status_code=status.HTTP_200_OK)
@router.get("/verification", status_code=status.HTTP_200_OK)
def verification_health():
    """Health check endpoint for the MedVerify medicine verification service."""
    return {
        "status": "ok",
        "service": "verification-service",
        "version": "1.0.0",
        "engine": "active",
        "supported_methods": ["QR", "DATAMATRIX", "MANUAL", "PACKAGING_OCR"],
    }


@router.post("/verify", response_model=VerificationResult, status_code=status.HTTP_200_OK)
@router.post("/verification", response_model=VerificationResult, status_code=status.HTTP_200_OK)
def verify(req: VerifyRequest, current_user: dict | None = Depends(get_optional_current_user)):
    """Accept a scanned identifier and return an explainable verification result."""
    try:
        return verify_medicine(req, user=current_user)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
