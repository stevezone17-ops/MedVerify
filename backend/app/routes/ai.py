"""FastAPI routes for the MedVerify Google Gemini Intelligence Layer.

Enforces:
- Non-blocking asynchronous event loop execution via asyncio.to_thread
- Concurrency limiting to prevent event loop / resource starvation
- Dedicated timeout controls per request lifecycle
- Strict exception classification (auth, quota, timeout, unavailable)
- Grounded verification boundaries and medical safety guards
"""

import asyncio
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from typing import Dict, Any

from app.config import settings
from app.services.auth_service import get_current_user, require_admin
from app.services.llm.client import (
    GeminiServiceError,
    GeminiAuthError,
    GeminiQuotaError,
    GeminiModelError,
    GeminiTimeoutError,
    GeminiUnavailableError,
)
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

router = APIRouter(prefix="/api/ai", tags=["Google Gemini AI Intelligence"])
admin_ai_router = APIRouter(prefix="/api/admin/ai", tags=["Admin AI"], dependencies=[Depends(require_admin)])

# Concurrency semaphore: prevent unbounded concurrent threads from overwhelming CPU/network
_MAX_CONCURRENT_AI_REQUESTS = 10
_ai_semaphore = asyncio.Semaphore(_MAX_CONCURRENT_AI_REQUESTS)


# ---------------------------------------------------------------------------
# Health Check (Public, Non-Sensitive)
# ---------------------------------------------------------------------------

@router.get("/health", response_model=AIHealthResponse)
async def get_ai_health():
    """Return operational availability of the MedVerify Google Gemini LLM layer."""
    return await asyncio.to_thread(llm_service.get_health)


# ---------------------------------------------------------------------------
# Explain My Result (Authenticated User)
# ---------------------------------------------------------------------------

@router.post("/explain-verification", response_model=VerificationExplanation)
async def explain_verification(
    req: ExplainVerificationRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Generate a grounded, plain-language forensic explanation of a verification result.
    
    The underlying verification status is authoritative and immutable.
    Executed asynchronously without blocking the FastAPI event loop.
    """
    user_id = str(current_user.get("_id") or current_user.get("id") or "user")
    timeout_sec = float(getattr(settings, "gemini_timeout_seconds", 35.0) or 35.0) + 10.0

    try:
        async with _ai_semaphore:
            return await asyncio.wait_for(
                asyncio.to_thread(llm_service.explain_verification, req, user_id=user_id),
                timeout=timeout_sec,
            )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Explanation generation timed out. Please try again.",
        )
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(val_err))
    except GeminiAuthError as a_err:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(a_err))
    except GeminiQuotaError as q_err:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(q_err))
    except GeminiModelError as m_err:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(m_err))
    except GeminiTimeoutError as t_err:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(t_err))
    except GeminiUnavailableError as u_err:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(u_err))
    except RuntimeError as r_err:
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
async def ask_medverify(
    req: AskMedVerifyRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Context-aware conversational assistance grounded in verified medicine data and GS1 rules.
    
    Enforces strict medical safety boundaries — never offers personalized clinical advice.
    Safely executed in a worker thread under a concurrency semaphore.
    """
    user_id = str(current_user.get("_id") or current_user.get("id") or "user")

    if len(req.question) > 2500:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question exceeds maximum allowed character length (2,500 characters).",
        )

    timeout_sec = float(getattr(settings, "gemini_timeout_seconds", 35.0) or 35.0) + 10.0

    try:
        async with _ai_semaphore:
            return await asyncio.wait_for(
                asyncio.to_thread(llm_service.ask_medverify, req, user_id=user_id),
                timeout=timeout_sec,
            )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="The AI assistant request timed out while generating a response. Please try again.",
        )
    except GeminiAuthError as a_err:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(a_err))
    except GeminiQuotaError as q_err:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(q_err))
    except GeminiModelError as m_err:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(m_err))
    except GeminiTimeoutError as t_err:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(t_err))
    except GeminiUnavailableError as u_err:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(u_err))
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


@router.post("/chat/stream")
async def stream_medverify_chat(
    req: AskMedVerifyRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Stream real-time tokens from Google Gemini conversational assistant."""
    user_id = str(current_user.get("_id") or current_user.get("id") or "user")
    try:
        generator = llm_service.stream_ask_medverify(req, user_id=user_id)
        return StreamingResponse(
            generator,
            media_type="text/plain; charset=utf-8",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chat streaming error: {exc}",
        )


# ---------------------------------------------------------------------------
# OCR AI Normalization (Authenticated User)
# ---------------------------------------------------------------------------

@router.post("/normalize-ocr", response_model=OCRNormalizedCandidate)
async def normalize_ocr(
    req: OCRNormalizeRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Normalize noisy raw packaging OCR text into candidate structured fields."""
    user_id = str(current_user.get("_id") or current_user.get("id") or "user")
    timeout_sec = float(getattr(settings, "gemini_timeout_seconds", 35.0) or 35.0) + 10.0

    try:
        async with _ai_semaphore:
            return await asyncio.wait_for(
                asyncio.to_thread(llm_service.normalize_ocr, req, user_id=user_id),
                timeout=timeout_sec,
            )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="OCR normalization timed out. Please try again.",
        )
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
async def admin_ai_analyze(
    req: AdminAIAnalyzeRequest,
    admin_user: Dict[str, Any] = Depends(require_admin),
):
    """Analyze aggregated operational verification statistics for regulatory admins."""
    timeout_sec = float(getattr(settings, "gemini_timeout_seconds", 35.0) or 35.0) + 15.0

    try:
        async with _ai_semaphore:
            return await asyncio.wait_for(
                asyncio.to_thread(llm_service.admin_analyze, req, admin_user=admin_user),
                timeout=timeout_sec,
            )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Admin AI analysis timed out. Please try again.",
        )
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
