"""Medicine Cabinet repository — personal medicine tracking and authenticity monitoring."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Any
from app.db.supabase_client import get_supabase_client
from app.utils.timestamps import to_iso_utc

logger = logging.getLogger("medverify.repo.cabinet")

_cabinet_store: list[dict[str, Any]] = []


class CabinetRepository:
    """Repository handling consumer medicine cabinet entries."""

    def add(self, data: dict[str, Any]) -> dict[str, Any]:
        """Save a verified medicine to user's cabinet."""
        cab_id = str(data.get("id") or f"cab_{uuid.uuid4().hex[:10]}")
        now = datetime.now(timezone.utc)
        doc = {
            "id": cab_id,
            "user_id": data["user_id"],
            "medicine_id": data.get("medicine_id"),
            "verification_id": data.get("verification_id"),
            "nickname": data.get("nickname"),
            "notes": data.get("notes"),
            "expiry_date": data.get("expiry_date"),
            "product_name": data.get("product_name"),
            "manufacturer": data.get("manufacturer"),
            "batch_number": data.get("batch_number"),
            "reminder_enabled": data.get("reminder_enabled", False),
            "created_at": to_iso_utc(now),
            "updated_at": to_iso_utc(now),
        }

        client = get_supabase_client()
        if client:
            try:
                supa_data = {**doc}
                if doc.get("user_id"):
                    try:
                        uuid.UUID(str(doc["user_id"]))
                    except ValueError:
                        supa_data["user_id"] = None
                res = client.table("medicine_cabinet").insert(supa_data).execute()
                if res.data:
                    return res.data[0]
            except Exception as exc:
                logger.warning("Supabase cabinet add failed: %s", exc)

        _cabinet_store.append(doc)
        return doc

    def list_user_cabinet(self, user_id: str) -> list[dict[str, Any]]:
        """List all cabinet medicines for a user."""
        client = get_supabase_client()
        if client:
            try:
                res = client.table("medicine_cabinet").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
                if res.data:
                    return res.data
            except Exception as exc:
                logger.warning("Supabase list_user_cabinet failed: %s", exc)

        return [c for c in _cabinet_store if c.get("user_id") == user_id]

    def update(self, cabinet_id: str, user_id: str, updates: dict[str, Any]) -> Optional[dict[str, Any]]:
        """Update a cabinet entry's nickname, notes, or reminder settings."""
        updates["updated_at"] = to_iso_utc(datetime.now(timezone.utc))

        client = get_supabase_client()
        if client:
            try:
                res = (
                    client.table("medicine_cabinet")
                    .update(updates)
                    .eq("id", cabinet_id)
                    .eq("user_id", user_id)
                    .execute()
                )
                if res.data:
                    return res.data[0]
            except Exception as exc:
                logger.warning("Supabase cabinet update failed: %s", exc)

        # Local fallback
        for c in _cabinet_store:
            if c.get("id") == cabinet_id and c.get("user_id") == user_id:
                c.update(updates)
                return c
        return None

    def remove(self, cabinet_id: str, user_id: str) -> bool:
        """Remove a medicine from user's cabinet."""
        client = get_supabase_client()
        if client:
            try:
                client.table("medicine_cabinet").delete().eq("id", cabinet_id).eq("user_id", user_id).execute()
            except Exception as exc:
                logger.warning("Supabase cabinet remove failed: %s", exc)

        global _cabinet_store
        before = len(_cabinet_store)
        _cabinet_store = [c for c in _cabinet_store if not (c.get("id") == cabinet_id and c.get("user_id") == user_id)]
        return len(_cabinet_store) < before
