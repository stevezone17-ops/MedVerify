"""Notification preferences endpoints for expiry reminders and alerts."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional

from app.db.supabase_client import get_supabase_client
from app.services.auth_service import get_current_user
from app.utils.timestamps import to_iso_utc
from datetime import datetime, timezone
import logging
import uuid

logger = logging.getLogger("medverify.notifications")

router = APIRouter(prefix="/api/user/notifications", tags=["Notifications"])

# Local fallback store
_prefs_store: dict[str, dict] = {}


class NotificationPrefsUpdate(BaseModel):
    email_alerts: Optional[bool] = None
    push_alerts: Optional[bool] = None
    recall_alerts: Optional[bool] = None
    verification_summaries: Optional[bool] = None
    expiry_reminder_days: Optional[int] = None  # 7, 14, or 30


@router.get("/preferences")
def get_notification_preferences(current_user: dict = Depends(get_current_user)):
    """Get notification preferences for the current user."""
    user_id = str(current_user["_id"])

    client = get_supabase_client()
    if client:
        try:
            res = client.table("notification_preferences").select("*").eq("user_id", user_id).limit(1).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
        except Exception as exc:
            logger.warning("Supabase notification prefs fetch failed: %s", exc)

    # Return from local store or default
    if user_id in _prefs_store:
        return _prefs_store[user_id]

    return {
        "user_id": user_id,
        "email_alerts": True,
        "push_alerts": False,
        "recall_alerts": True,
        "verification_summaries": False,
        "expiry_reminder_days": 14,
    }


@router.patch("/preferences")
def update_notification_preferences(body: NotificationPrefsUpdate, current_user: dict = Depends(get_current_user)):
    """Update notification preferences for the current user."""
    user_id = str(current_user["_id"])
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")

    now = to_iso_utc(datetime.now(timezone.utc))
    updates["updated_at"] = now

    client = get_supabase_client()
    if client:
        try:
            # Try to upsert (update or insert)
            existing = client.table("notification_preferences").select("id").eq("user_id", user_id).limit(1).execute()
            if existing.data and len(existing.data) > 0:
                res = client.table("notification_preferences").update(updates).eq("user_id", user_id).execute()
                if res.data:
                    return res.data[0]
            else:
                # Insert new preferences
                valid_uuid = None
                try:
                    uuid.UUID(str(user_id))
                    valid_uuid = user_id
                except ValueError:
                    pass

                insert_data = {
                    "user_id": valid_uuid,
                    "email_alerts": True,
                    "push_alerts": False,
                    "recall_alerts": True,
                    "verification_summaries": False,
                    "expiry_reminder_days": 14,
                    **updates,
                    "created_at": now,
                }
                res = client.table("notification_preferences").insert(insert_data).execute()
                if res.data:
                    return res.data[0]
        except Exception as exc:
            logger.warning("Supabase notification prefs update failed: %s", exc)

    # Local fallback
    if user_id not in _prefs_store:
        _prefs_store[user_id] = {
            "user_id": user_id,
            "email_alerts": True,
            "push_alerts": False,
            "recall_alerts": True,
            "verification_summaries": False,
            "expiry_reminder_days": 14,
        }
    _prefs_store[user_id].update(updates)
    return _prefs_store[user_id]
