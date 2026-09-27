"""Batches repository — manages authorized production batches."""

from __future__ import annotations

import logging
from typing import Optional, Any
from app.db.supabase_client import get_supabase_client

logger = logging.getLogger("medverify.repo.batches")


class BatchesRepository:
    """Repository handling production batches."""

    def get_by_batch_number(self, medicine_id: str, batch_number: str) -> Optional[dict[str, Any]]:
        """Look up a batch for a specific medicine."""
        client = get_supabase_client()
        if client:
            try:
                res = (
                    client.table("medicine_batches")
                    .select("*")
                    .eq("medicine_id", medicine_id)
                    .eq("batch_number", batch_number)
                    .limit(1)
                    .execute()
                )
                if res.data and len(res.data) > 0:
                    return res.data[0]
            except Exception as exc:
                logger.warning("Supabase batch lookup failed: %s", exc)
        return None

    def create(self, data: dict[str, Any]) -> Optional[dict[str, Any]]:
        """Create a new batch record."""
        client = get_supabase_client()
        if client:
            try:
                res = client.table("medicine_batches").insert(data).execute()
                if res.data:
                    return res.data[0]
            except Exception as exc:
                logger.error("Failed to insert batch in Supabase: %s", exc)
        return None
