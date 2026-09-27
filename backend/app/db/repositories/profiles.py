"""Profiles repository — user account storage and role management."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Any

from app.db.supabase_client import get_supabase_client
from app.database import users_col
from app.utils.timestamps import to_iso_utc

logger = logging.getLogger("medverify.repo.profiles")


class ProfilesRepository:
    """Repository handling user profiles, roles, and status."""

    def get_by_id(self, user_id: str) -> Optional[dict[str, Any]]:
        """Look up user by ID (UUID or legacy user_xxx)."""
        client = get_supabase_client()
        if client:
            try:
                res = client.table("profiles").select("*").eq("id", user_id).limit(1).execute()
                if res.data and len(res.data) > 0:
                    row = res.data[0]
                    return {
                        "_id": str(row["id"]),
                        "id": str(row["id"]),
                        "name": row.get("full_name"),
                        "email": row.get("email"),
                        "role": row.get("role", "user"),
                        "status": row.get("status", "active"),
                        "created_at": to_iso_utc(row.get("created_at")),
                    }
            except Exception as exc:
                logger.warning("Supabase profile get_by_id failed: %s", exc)

        user = users_col().find_one({"_id": user_id})
        if user:
            uid = str(user.pop("_id"))
            user["_id"] = uid
            user["id"] = uid
            return user
        return None

    def get_by_email(self, email: str) -> Optional[dict[str, Any]]:
        """Look up user by email."""
        email = email.lower().strip()
        client = get_supabase_client()
        if client:
            try:
                res = client.table("profiles").select("*").eq("email", email).limit(1).execute()
                if res.data and len(res.data) > 0:
                    row = res.data[0]
                    # Also fetch local password_hash if present
                    local_user = users_col().find_one({"email": email})
                    pwd_hash = local_user.get("password_hash") if local_user else ""
                    return {
                        "_id": str(row["id"]),
                        "id": str(row["id"]),
                        "name": row.get("full_name"),
                        "email": row.get("email"),
                        "role": row.get("role", "user"),
                        "status": row.get("status", "active"),
                        "password_hash": pwd_hash,
                        "created_at": to_iso_utc(row.get("created_at")),
                    }
            except Exception as exc:
                logger.warning("Supabase profile get_by_email failed: %s", exc)

        user = users_col().find_one({"email": email})
        if user:
            uid = str(user.pop("_id"))
            user["_id"] = uid
            user["id"] = uid
            return user
        return None

    def create_user(self, user_data: dict[str, Any]) -> dict[str, Any]:
        """Create a new user account."""
        now = datetime.now(timezone.utc)
        user_id = str(user_data.get("id") or f"user_{uuid.uuid4().hex[:10]}")
        client = get_supabase_client()

        # Local persistence
        doc = {
            "_id": user_id,
            "name": user_data.get("name") or user_data.get("full_name"),
            "email": user_data["email"].lower().strip(),
            "password_hash": user_data.get("password_hash", ""),
            "role": user_data.get("role", "user"),
            "status": user_data.get("status", "active"),
            "created_at": now,
        }
        users_col().insert_one(doc)

        # Supabase persistence
        if client:
            try:
                # If user_id is not valid UUID, generate UUID for Supabase
                try:
                    uuid.UUID(user_id)
                    supa_id = user_id
                except ValueError:
                    supa_id = str(uuid.uuid4())

                client.table("profiles").insert({
                    "id": supa_id,
                    "email": doc["email"],
                    "full_name": doc["name"],
                    "role": doc["role"],
                    "status": doc["status"],
                }).execute()
            except Exception as exc:
                logger.warning("Supabase profile creation failed: %s", exc)

        return {
            "id": user_id,
            "_id": user_id,
            "name": doc["name"],
            "email": doc["email"],
            "role": doc["role"],
            "status": doc["status"],
            "created_at": now,
        }

    def update_status(self, user_id: str, status: str) -> Optional[dict[str, Any]]:
        """Activate or disable a user account."""
        client = get_supabase_client()
        if client:
            try:
                client.table("profiles").update({"status": status}).eq("id", user_id).execute()
            except Exception as exc:
                logger.warning("Supabase update_status failed: %s", exc)

        users_col().update_one({"_id": user_id}, {"$set": {"status": status}})
        return self.get_by_id(user_id)

    def update_role(self, user_id: str, role: str) -> Optional[dict[str, Any]]:
        """Promote or demote user role."""
        client = get_supabase_client()
        if client:
            try:
                client.table("profiles").update({"role": role}).eq("id", user_id).execute()
            except Exception as exc:
                logger.warning("Supabase update_role failed: %s", exc)

        users_col().update_one({"_id": user_id}, {"$set": {"role": role}})
        return self.get_by_id(user_id)

    def list_users(self) -> list[dict[str, Any]]:
        """List all users."""
        client = get_supabase_client()
        if client:
            try:
                res = client.table("profiles").select("*").order("created_at", desc=True).execute()
                if res.data:
                    return [
                        {
                            "id": str(r["id"]),
                            "name": r.get("full_name", "Unknown"),
                            "email": r.get("email"),
                            "role": r.get("role", "user"),
                            "status": r.get("status", "active"),
                            "created_at": to_iso_utc(r.get("created_at")),
                        }
                        for r in res.data
                    ]
            except Exception as exc:
                logger.warning("Supabase list_users failed: %s", exc)

        users = list(users_col().find().sort("created_at", -1))
        out = []
        for u in users:
            uid = str(u.pop("_id"))
            out.append({
                "id": uid,
                "name": u.get("name", "Unknown"),
                "email": u.get("email"),
                "role": u.get("role", "user"),
                "status": u.get("status", "active"),
                "created_at": to_iso_utc(u.get("created_at")),
            })
        return out
