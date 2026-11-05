"""FastAPI endpoints for authenticated medicine packaging image upload and retrieval."""

import uuid
from typing import List, Optional, Dict, Any
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
)
from app.services.auth_service import get_current_user
from app.services.image_service import (
    image_service,
    image_rate_limiter,
    MAX_BATCH_FILES,
)

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
