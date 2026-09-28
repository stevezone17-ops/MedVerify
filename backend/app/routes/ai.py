"""FastAPI routes for the MedVerify Real LLM Intelligence Layer."""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any

from app.services.auth_service import get_current_user, require_admin
from app.services.llm.schemas import (
    ExplainVerificationRequest,
    VerificationExplanation,
    AskMedVerifyRequest,
    AskMedVerifyResponse,
    OCRNormalizeRequest,
    OCRNormalizedCandidate,
    AdminAIAnalyzeRequest,
    AdminAIAnalyzeResponse,
    AIHealthResponse,
)
from app.services.llm.service import llm_service

router = APIRouter(prefix="/api/ai", tags=["AI Intelligence"])
admin_ai_router = APIRouter(prefix="/api/admin/ai", tags=["Admin AI"], dependencies=[Depends(require_admin)])


# ---------------------------------------------------------------------------
# Health Check (Public, Non-Sensitive)
# ---------------------------------------------------------------------------

@router.get("/health", response_model=AIHealthResponse)
def get_ai_health():
    """Return operational availability of the MedVerify OpenAI LLM layer."""
    return llm_service.get_health()


# ---------------------------------------------------------------------------
# Explain My Result (Authenticated User)
# ---------------------------------------------------------------------------

@router.post("/explain-verification", response_model=VerificationExplanation)
def explain_verification(
    req: ExplainVerificationRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Generate a grounded, plain-language forensic explanation of a verification result.
    
    The underlying verification status is authoritative and immutable.
    The LLM provides patient-friendly or technical clarification.
    """
    user_id = str(current_user.get("_id") or current_user.get("id") or "user")
    try:
        return llm_service.explain_verification(req, user_id=user_id)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(val_err))
    except RuntimeError as r_err:
        # e.g. Rate limit or connection issue
        err_msg = str(r_err)
        if "Rate limit" in err_msg:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=err_msg)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=err_msg)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate explanation: {exc}",
        )


# ---------------------------------------------------------------------------
# Ask MedVerify Assistant (Authenticated User)
# ---------------------------------------------------------------------------

@router.post("/chat", response_model=AskMedVerifyResponse)
def ask_medverify(
    req: AskMedVerifyRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Context-aware conversational assistance grounded in verified medicine data and GS1 rules.
    
    Enforces strict medical safety boundaries — never offers personalized clinical advice.
    """
    user_id = str(current_user.get("_id") or current_user.get("id") or "user")
    try:
        return llm_service.ask_medverify(req, user_id=user_id)
    except RuntimeError as r_err:
        err_msg = str(r_err)
        if "Rate limit" in err_msg:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=err_msg)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=err_msg)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chat assistant error: {exc}",
        )


# ---------------------------------------------------------------------------
# OCR AI Normalization (Authenticated User)
# ---------------------------------------------------------------------------

@router.post("/normalize-ocr", response_model=OCRNormalizedCandidate)
def normalize_ocr(
    req: OCRNormalizeRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Normalize noisy raw packaging OCR text into candidate structured fields.
    
    Unknown fields remain null to prevent hallucinated data.
    """
    user_id = str(current_user.get("_id") or current_user.get("id") or "user")
    try:
        return llm_service.normalize_ocr(req, user_id=user_id)
    except RuntimeError as r_err:
        err_msg = str(r_err)
        if "Rate limit" in err_msg:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=err_msg)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=err_msg)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OCR normalization error: {exc}",
        )


# ---------------------------------------------------------------------------
# Admin AI Verification Analyst (Admin Only)
# ---------------------------------------------------------------------------

@admin_ai_router.post("/analyze", response_model=AdminAIAnalyzeResponse)
def admin_ai_analyze(
    req: AdminAIAnalyzeRequest,
    admin_user: Dict[str, Any] = Depends(require_admin),
):
    """Analyze aggregated operational verification statistics for regulatory admins.
    
    Strictly isolated: does not allow direct SQL generation or arbitrary database access.
    """
    try:
        return llm_service.admin_analyze(req, admin_user=admin_user)
    except RuntimeError as r_err:
        err_msg = str(r_err)
        if "Rate limit" in err_msg:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=err_msg)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=err_msg)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Admin AI analysis error: {exc}",
        )
