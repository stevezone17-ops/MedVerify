"""Supabase client management and initialization."""

from __future__ import annotations

import logging
from typing import Optional
from supabase import create_client, Client
from app.config import settings

logger = logging.getLogger("medverify.supabase")

_supabase_client: Optional[Client] = None


def is_supabase_configured() -> bool:
    """Return True if valid Supabase connection credentials are provided in settings."""
    url = (settings.supabase_url or "").strip()
    key = (settings.supabase_service_role_key or settings.supabase_anon_key or "").strip()
    return bool(url and key and url.startswith("http"))


def get_supabase_client() -> Optional[Client]:
    """Return the singleton Supabase client, initializing it if necessary."""
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    if not is_supabase_configured():
        return None

    try:
        url = settings.supabase_url.strip()
        # Prefer service role key for backend operations to bypass RLS for administrative verification logic
        key = (settings.supabase_service_role_key or settings.supabase_anon_key).strip()
        _supabase_client = create_client(url, key)
        logger.info("Connected to Supabase at %s", url)
        return _supabase_client
    except Exception as exc:
        logger.warning("Failed to initialize Supabase client: %s", exc)
        return None


def get_public_config() -> dict[str, str]:
    """Return public Supabase configuration safe for frontend consumption."""
    return {
        "supabase_url": settings.supabase_url,
        "supabase_anon_key": settings.supabase_anon_key,
    }
