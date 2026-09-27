"""Reports repository — manages consumer & pharmacist verification concern reports."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Any
from app.db.supabase_client import get_supabase_client
from app.utils.timestamps import to_iso_utc

logger = logging.getLogger("medverify.repo.reports")

# In-memory storage for reports fallback
_reports_store: list[dict[str, Any]] = []


class ReportsRepository:
    """Repository handling suspicious reports and verification concerns."""

    def create(self, data: dict[str, Any]) -> dict[str, Any]:
        """Submit a new report."""
        report_id = str(data.get("id") or f"rep_{uuid.uuid4().hex[:10]}")
        now = datetime.now(timezone.utc)
        doc = {
            "id": report_id,
            "user_id": data.get("user_id"),
            "verification_id": data.get("verification_id"),
            "report_type": data.get("report_type", "VERIFICATION_CONCERN"),
            "description": data.get("description", ""),
            "status": "OPEN",
            "created_at": to_iso_utc(now),
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
                res = client.table("reports").insert(supa_data).execute()
                if res.data:
                    return res.data[0]
            except Exception as exc:
                logger.warning("Supabase report insert failed: %s", exc)

        _reports_store.append(doc)
        return doc

    def list_reports(self, user_id: str | None = None) -> list[dict[str, Any]]:
        """List reports, optionally scoped to a user."""
        client = get_supabase_client()
        if client:
            try:
                q = client.table("reports").select("*")
                if user_id:
                    q = q.eq("user_id", user_id)
                res = q.order("created_at", desc=True).execute()
                if res.data:
                    return res.data
            except Exception as exc:
                logger.warning("Supabase list_reports failed: %s", exc)

        if user_id:
            return [r for r in _reports_store if r.get("user_id") == user_id]
        return _reports_store
