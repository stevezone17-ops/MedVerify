"""FastAPI endpoints for authenticated medicine packaging image upload, analysis, and verification."""

import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from fastapi import (
    APIRouter,
    Depends,
    UploadFile,
    File,
    Form,
    HTTPException,
    Response,
    status,
)

from app.schemas.image_verification import (
    UploadedImageMetadata,
    ImageUploadBatchResponse,
    ImageAnalysisResult,
    ConfirmAndVerifyImageRequest,
    ImageVerificationCombinedResult,
)
from app.schemas.verification import VerifyRequest
from app.services.verification_engine import verify_medicine
from app.database import verifications_col
from app.services.auth_service import get_current_user
from app.services.image_service import (
    image_service,
    image_rate_limiter,
    MAX_BATCH_FILES,
)
from app.services.image_analysis_service import image_analysis_service

router = APIRouter(prefix="/api/image-verification", tags=["Medicine Image Verification"])


@router.post(
    "/upload",
    response_model=ImageUploadBatchResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_packaging_images(
    files: List[UploadFile] = File(..., description="1 to 6 medicine packaging images"),
    slots: List[str] = Form(default=[], description="Slot names corresponding to uploaded files"),
    batch_id: Optional[str] = Form(default=None, description="Optional existing batch UUID"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Authenticate, validate, and securely store medicine packaging photographs.
    
    Enforces:
    - User authentication (guest users must sign in).
    - Rate limiting per user.
    - Image magic numbers, MIME types, and dimensions.
    - User data isolation (images associated strictly with authenticated user ID).
    """
    user_id = str(current_user.get("_id") or current_user.get("id"))

    # 1. Rate limiting
    if not image_rate_limiter.check_rate_limit(user_id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded for image uploads. Please wait a minute before uploading more packaging images.",
        )

    # 2. File count validation
    if not files or len(files) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one packaging image must be provided.",
        )

    if len(files) > MAX_BATCH_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Too many images. Maximum allowable images per verification batch is {MAX_BATCH_FILES}.",
        )

    resolved_batch_id = batch_id or f"batch_{uuid.uuid4().hex[:12]}"
    uploaded_metas: List[UploadedImageMetadata] = []

    # 3. Process each file
    for idx, upload_file in enumerate(files):
        slot = slots[idx] if idx < len(slots) and slots[idx] else "general"
        try:
            content = await upload_file.read()
            meta = image_service.save_image(
                content=content,
                user_id=user_id,
                batch_id=resolved_batch_id,
                slot=slot,
                original_filename=upload_file.filename or "",
            )
            uploaded_metas.append(meta)
        except ValueError as val_err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File '{upload_file.filename}': {str(val_err)}",
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to process and store image '{upload_file.filename}': {exc}",
            )

    return ImageUploadBatchResponse(
        batch_id=resolved_batch_id,
        user_id=user_id,
        uploaded_count=len(uploaded_metas),
        images=uploaded_metas,
    )


@router.get("/image/{image_id}")
def get_packaging_image(
    image_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Retrieve an authenticated user's uploaded image with strict IDOR protection."""
    user_id = str(current_user.get("_id") or current_user.get("id"))
    is_admin = str(current_user.get("role", "")).lower() == "admin"

    try:
        content, meta = image_service.get_image_for_user(
            image_id=image_id,
            user_id=user_id,
            is_admin=is_admin,
        )
    except PermissionError as p_err:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(p_err),
        )
    except ValueError as v_err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(v_err),
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Packaging image file is missing or has expired from retention.",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error retrieving image: {exc}",
        )

    headers = {
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
    }
    return Response(content=content, media_type=meta.mime_type, headers=headers)


@router.get("/batch/{batch_id}", response_model=List[UploadedImageMetadata])
def get_batch_images(
    batch_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """List all packaging images associated with a batch for the authenticated user."""
    user_id = str(current_user.get("_id") or current_user.get("id"))
    is_admin = str(current_user.get("role", "")).lower() == "admin"

    return image_service.get_batch_images(
        batch_id=batch_id,
        user_id=user_id,
        is_admin=is_admin,
    )


@router.post("/analyze/{batch_id}", response_model=ImageAnalysisResult)
def analyze_packaging_images(
    batch_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Run multimodal packaging vision and OCR extraction on an uploaded batch."""
    user_id = str(current_user.get("_id") or current_user.get("id"))
    is_admin = str(current_user.get("role", "")).lower() == "admin"

    try:
        return image_analysis_service.analyze_batch(
            batch_id=batch_id,
            user_id=user_id,
            is_admin=is_admin,
        )
    except ValueError as v_err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(v_err),
        )
    except PermissionError as p_err:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(p_err),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Image analysis error: {exc}",
        )


@router.get("/analysis/{analysis_id}", response_model=ImageAnalysisResult)
def get_analysis_result(
    analysis_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Retrieve an existing image analysis record by ID with strict user isolation."""
    user_id = str(current_user.get("_id") or current_user.get("id"))
    is_admin = str(current_user.get("role", "")).lower() == "admin"

    try:
        return image_analysis_service.get_analysis_by_id(
            analysis_id=analysis_id,
            user_id=user_id,
            is_admin=is_admin,
        )
    except ValueError as v_err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(v_err),
        )
    except PermissionError as p_err:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(p_err),
        )


@router.post("/confirm-and-verify", response_model=ImageVerificationCombinedResult)
def confirm_and_verify_image(
    req: ConfirmAndVerifyImageRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Submit user-confirmed medicine details to the authoritative 6-factor deterministic engine.
    
    CRITICAL INVARIANT: The deterministic engine is the SOLE authority for authenticity determinations.
    Gemini vision never declares authenticity; it only assists in optical extraction.
    """
    user_id = str(current_user.get("_id") or current_user.get("id"))
    is_admin = str(current_user.get("role", "")).lower() == "admin"

    # 1. Enforce IDOR protection on analysis record
    try:
        analysis = image_analysis_service.get_analysis_by_id(
            analysis_id=req.analysis_id,
            user_id=user_id,
            is_admin=is_admin,
        )
    except (ValueError, PermissionError) as err:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(err))

    # 2. Build canonical verification identifier from confirmed fields
    cf = req.confirmed_fields
    if req.raw_identifier:
        resolved_identifier = req.raw_identifier.strip()
    elif cf.gtin:
        # Assemble standard GS1 payload
        parts: List[str] = [f"(01){cf.gtin.strip()}"]
        if cf.batch_number:
            parts.append(f"(10){cf.batch_number.strip()}")
        if cf.expiry_date:
            exp_clean = cf.expiry_date.replace("-", "")
            if len(exp_clean) == 8:
                # YYYYMMDD -> YYMMDD
                exp_clean = exp_clean[2:]
            parts.append(f"(17){exp_clean}")
        if cf.serial_number:
            parts.append(f"(21){cf.serial_number.strip()}")
        resolved_identifier = "".join(parts)
    elif cf.batch_number:
        resolved_identifier = cf.batch_number.strip()
    elif cf.product_name:
        resolved_identifier = cf.product_name.strip()
    else:
        resolved_identifier = req.analysis_id

    # 3. Call authoritative deterministic 6-factor verification engine
    verify_req = VerifyRequest(
        identifier=resolved_identifier,
        batch_number=cf.batch_number,
        serial_number=cf.serial_number,
        expiry_date=cf.expiry_date,
        product_name=cf.product_name,
        manufacturer=cf.manufacturer,
        method="IMAGE_VERIFICATION",
    )

    try:
        verification_result = verify_medicine(verify_req, user=current_user)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Verification engine failure: {exc}",
        )

    # 4. Associate the verification record with image analysis & packaging observations
    verifications_col().update_one(
        {"_id": verification_result.verification_id},
        {
            "$set": {
                "image_analysis_id": req.analysis_id,
                "image_batch_id": req.batch_id,
                "packaging_condition": analysis.packaging_condition.model_dump(),
                "printed_vs_barcode_mismatch": analysis.printed_vs_barcode_mismatch,
                "mismatch_details": analysis.mismatch_details,
            }
        },
    )

    confirmed_dict = {
        "product_name": cf.product_name,
        "gtin": cf.gtin,
        "batch_number": cf.batch_number,
        "serial_number": cf.serial_number,
        "expiry_date": cf.expiry_date,
        "manufacturer": cf.manufacturer,
    }

    return ImageVerificationCombinedResult(
        verification_id=verification_result.verification_id,
        status=verification_result.status,
        confidence_score=verification_result.confidence_score,
        verification=verification_result.model_dump(),
        image_analysis=analysis,
        confirmed_parameters=confirmed_dict,
        created_at=datetime.now(timezone.utc),
    )
