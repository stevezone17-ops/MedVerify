"""Supabase Storage helper for medicine packaging images and inspection evidence."""

from __future__ import annotations

import logging
from typing import Optional
from app.db.supabase_client import get_supabase_client

logger = logging.getLogger("medverify.storage")
PACKAGING_BUCKET = "medicine-packaging"


def ensure_packaging_bucket() -> bool:
    """Ensure the private medicine-packaging bucket exists in Supabase Storage."""
    client = get_supabase_client()
    if not client:
        return False

    try:
        buckets = client.storage.list_buckets()
        existing = [b.name for b in buckets]
        if PACKAGING_BUCKET not in existing:
            client.storage.create_bucket(
                PACKAGING_BUCKET,
                options={"public": False, "file_size_limit": 5242880},  # 5MB limit
            )
            logger.info("Created private Supabase Storage bucket: %s", PACKAGING_BUCKET)
        return True
    except Exception as exc:
        logger.warning("Supabase Storage bucket check failed: %s", exc)
        return False


def upload_packaging_evidence(
    file_bytes: bytes,
    file_path: str,
    content_type: str = "image/jpeg",
) -> Optional[str]:
    """Upload packaging image to secure Supabase Storage."""
    client = get_supabase_client()
    if not client:
        return None

    try:
        ensure_packaging_bucket()
        client.storage.from_(PACKAGING_BUCKET).upload(
            path=file_path,
            file=file_bytes,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        return file_path
    except Exception as exc:
        logger.error("Failed to upload packaging evidence to Supabase Storage: %s", exc)
        return None


def get_evidence_signed_url(file_path: str, expires_in: int = 3600) -> Optional[str]:
    """Generate a temporary signed URL for authorized viewing of evidence."""
    client = get_supabase_client()
    if not client:
        return None

    try:
        res = client.storage.from_(PACKAGING_BUCKET).create_signed_url(
            path=file_path,
            expires_in=expires_in,
        )
        return res.get("signedURL") or res.get("signedUrl")
    except Exception as exc:
        logger.error("Failed to generate signed URL for evidence: %s", exc)
        return None
