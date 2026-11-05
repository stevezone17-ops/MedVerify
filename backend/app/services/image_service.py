"""Secure Medicine Image Processing and Evidence Management Service."""

import io
import os
import time
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple
from pathlib import Path
from PIL import Image

from app.database import uploaded_images_col
from app.db.storage import upload_packaging_evidence
from app.schemas.image_verification import UploadedImageMetadata
from app.utils.timestamps import to_iso_utc

logger = logging.getLogger("medverify.images")

# Validation limits
MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
MIN_IMAGE_DIMENSION_PX = 200
MAX_IMAGE_DIMENSION_PX = 8000
MAX_BATCH_FILES = 6

ALLOWED_MIME_TYPES = {
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/webp": [b"RIFF"],
}

# Local secure evidence directory
BASE_STORAGE_DIR = Path("storage/evidence")
BASE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


class ImageRateLimiter:
    """Sliding-window in-memory rate limiter for image processing."""

    def __init__(self, max_requests: int = 20, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._history: Dict[str, List[float]] = {}

    def check_rate_limit(self, user_id: str) -> bool:
        now = time.time()
        window_start = now - self.window_seconds
        history = self._history.get(user_id, [])
        valid_history = [t for t in history if t > window_start]
        self._history[user_id] = valid_history

        if len(valid_history) >= self.max_requests:
            return False

        valid_history.append(now)
        self._history[user_id] = valid_history
        return True


image_rate_limiter = ImageRateLimiter(max_requests=20, window_seconds=60)


class ImageService:
    """Authoritative image validation, storage, and retrieval service."""

    @staticmethod
    def validate_image_content(content: bytes, filename: str = "") -> Tuple[str, int, int]:
        """Validate raw bytes: magic bytes, PIL structure integrity, and dimensions.
        
        Returns (mime_type, width, height) or raises ValueError on validation failure.
        """
        size = len(content)
        if size == 0:
            raise ValueError("Uploaded image file is empty.")

        if size > MAX_IMAGE_SIZE_BYTES:
            size_mb = size / (1024 * 1024)
            raise ValueError(f"Image exceeds maximum allowable limit of 10 MB (provided: {size_mb:.1f} MB).")

        # 1. Magic bytes check
        detected_mime: Optional[str] = None
        for mime, signatures in ALLOWED_MIME_TYPES.items():
            for sig in signatures:
                if content.startswith(sig):
                    if mime == "image/webp":
                        # Validate RIFF header has WEBP at offset 8
                        if len(content) > 12 and content[8:12] == b"WEBP":
                            detected_mime = mime
                            break
                    else:
                        detected_mime = mime
                        break
            if detected_mime:
                break

        if not detected_mime:
            raise ValueError(
                "Invalid image format. Only authentic JPG, PNG, and WEBP packaging images are accepted."
            )

        # 2. PIL Image verify
        try:
            with Image.open(io.BytesIO(content)) as img:
                img.verify()
                width, height = img.size
        except Exception as exc:
            logger.warning("PIL image verification failed for %s: %s", filename, exc)
            raise ValueError("Image appears corrupted, truncated, or contains invalid image data.")

        # Re-open for dimension checks because verify() closes the file
        try:
            with Image.open(io.BytesIO(content)) as img:
                width, height = img.size
        except Exception:
            pass

        if width < MIN_IMAGE_DIMENSION_PX or height < MIN_IMAGE_DIMENSION_PX:
            raise ValueError(
                f"Image dimensions ({width}×{height}px) are below the minimum requirement of "
                f"{MIN_IMAGE_DIMENSION_PX}×{MIN_IMAGE_DIMENSION_PX}px for pharmaceutical OCR."
            )

        if width > MAX_IMAGE_DIMENSION_PX or height > MAX_IMAGE_DIMENSION_PX:
            raise ValueError(
                f"Image dimensions ({width}×{height}px) exceed maximum allowed resolution of "
                f"{MAX_IMAGE_DIMENSION_PX}×{MAX_IMAGE_DIMENSION_PX}px."
            )

        return detected_mime, width, height

    def save_image(
        self,
        content: bytes,
        user_id: str,
        batch_id: str,
        slot: str = "general",
        original_filename: str = "",
    ) -> UploadedImageMetadata:
        """Validate, persist securely to user-isolated storage, and index in database."""
        mime_type, width, height = self.validate_image_content(content, original_filename)

        image_id = f"img_{uuid.uuid4().hex[:14]}"
        ext = "jpg" if "jpeg" in mime_type else "png" if "png" in mime_type else "webp"
        clean_filename = f"{image_id}.{ext}"

        # Secure user-scoped storage path
        user_storage_dir = BASE_STORAGE_DIR / str(user_id) / str(batch_id)
        user_storage_dir.mkdir(parents=True, exist_ok=True)
        local_file_path = user_storage_dir / clean_filename

        with open(local_file_path, "wb") as f:
            f.write(content)

        relative_path = f"evidence/{user_id}/{batch_id}/{clean_filename}"

        # Upload to Supabase Storage if configured
        try:
            upload_packaging_evidence(content, relative_path, content_type=mime_type)
        except Exception as s_err:
            logger.warning("Failed to upload packaging evidence to external bucket: %s", s_err)

        now = datetime.now(timezone.utc)
        meta = UploadedImageMetadata(
            image_id=image_id,
            user_id=str(user_id),
            slot=slot,
            file_name=original_filename or clean_filename,
            mime_type=mime_type,
            file_size=len(content),
            width=width,
            height=height,
            storage_path=str(local_file_path.as_posix()),
            created_at=now,
        )

        doc = {
            "_id": image_id,
            "image_id": image_id,
            "user_id": str(user_id),
            "batch_id": str(batch_id),
            "slot": slot,
            "file_name": original_filename or clean_filename,
            "mime_type": mime_type,
            "file_size": len(content),
            "width": width,
            "height": height,
            "storage_path": str(local_file_path.as_posix()),
            "relative_path": relative_path,
            "created_at": now,
        }
        uploaded_images_col().insert_one(doc)
        return meta

    def get_image_for_user(
        self,
        image_id: str,
        user_id: str,
        is_admin: bool = False,
    ) -> Tuple[bytes, UploadedImageMetadata]:
        """Retrieve image bytes and metadata with strict IDOR protection."""
        doc = uploaded_images_col().find_one({"_id": image_id})
        if not doc:
            raise ValueError(f"Image record '{image_id}' not found.")

        owner_id = str(doc.get("user_id"))
        if not is_admin and owner_id != str(user_id):
            logger.warning(
                "IDOR attempt: User %s tried to access image %s owned by %s",
                user_id,
                image_id,
                owner_id,
            )
            raise PermissionError("Access denied: You are not authorized to view this packaging image.")

        storage_path = doc.get("storage_path")
        if not storage_path or not os.path.exists(storage_path):
            raise FileNotFoundError("Image file does not exist in storage.")

        with open(storage_path, "rb") as f:
            content = f.read()

        meta = UploadedImageMetadata(
            image_id=doc["image_id"],
            user_id=doc["user_id"],
            slot=doc.get("slot", "general"),
            file_name=doc.get("file_name", "image.jpg"),
            mime_type=doc.get("mime_type", "image/jpeg"),
            file_size=doc.get("file_size", len(content)),
            width=doc.get("width", 0),
            height=doc.get("height", 0),
            storage_path=storage_path,
            created_at=doc.get("created_at"),
        )
        return content, meta

    def get_batch_images(
        self,
        batch_id: str,
        user_id: str,
        is_admin: bool = False,
    ) -> List[UploadedImageMetadata]:
        """List all image metadata for a given batch, enforcing user ownership."""
        query: Dict[str, Any] = {"batch_id": batch_id}
        if not is_admin:
            query["user_id"] = str(user_id)

        docs = list(uploaded_images_col().find(query).sort("created_at", 1))
        return [
            UploadedImageMetadata(
                image_id=d["image_id"],
                user_id=d["user_id"],
                slot=d.get("slot", "general"),
                file_name=d.get("file_name", "image.jpg"),
                mime_type=d.get("mime_type", "image/jpeg"),
                file_size=d.get("file_size", 0),
                width=d.get("width", 0),
                height=d.get("height", 0),
                storage_path=d.get("storage_path", ""),
                created_at=d.get("created_at"),
            )
            for d in docs
        ]

    def cleanup_old_images(self, days: int = 7) -> int:
        """Remove temporary images older than the retention period."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        cursor = uploaded_images_col().find({"created_at": {"$lt": cutoff}})
        deleted_count = 0

        for doc in cursor:
            path = doc.get("storage_path")
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except Exception as e:
                    logger.warning("Failed to delete expired image file %s: %s", path, e)
            uploaded_images_col().delete_one({"_id": doc["_id"]})
            deleted_count += 1

        return deleted_count


image_service = ImageService()
