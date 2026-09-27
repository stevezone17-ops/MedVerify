"""Medicines repository — provides unified data access for the pharmaceutical registry."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Any

from app.db.supabase_client import get_supabase_client
from app.database import medicines_col
from app.utils.timestamps import to_iso_utc

logger = logging.getLogger("medverify.repo.medicines")


class MedicinesRepository:
    """Repository handling canonical medicines and their production batches."""

    def get_by_gtin(self, gtin: str) -> Optional[dict[str, Any]]:
        """Find a registered medicine by GTIN / product identifier."""
        gtin = str(gtin).strip()
        client = get_supabase_client()

        if client:
            try:
                # Query medicines table
                res = client.table("medicines").select("*, medicine_batches(*)").eq("gtin", gtin).limit(1).execute()
                if res.data and len(res.data) > 0:
                    row = res.data[0]
                    batches = row.get("medicine_batches") or []
                    batch = batches[0] if batches else {}

                    return {
                        "_id": row.get("legacy_id") or str(row.get("id")),
                        "id": str(row.get("id")),
                        "product_identifier": row.get("gtin"),
                        "product_name": row.get("product_name"),
                        "generic_name": row.get("generic_name"),
                        "manufacturer": {
                            "id": row.get("manufacturer_id") or "mfr_default",
                            "name": row.get("manufacturer_name"),
                        },
                        "batch_number": batch.get("batch_number", ""),
                        "serial_number": batch.get("serial_number", ""),
                        "expiry_date": batch.get("expiry_date", ""),
                        "manufacturing_date": batch.get("manufacturing_date", ""),
                        "dosage": row.get("dosage", ""),
                        "package_size": row.get("package_size", ""),
                        "status": row.get("status", "active"),
                        "created_at": row.get("created_at"),
                        "updated_at": row.get("updated_at"),
                        "batches": batches,
                    }
            except Exception as exc:
                logger.warning("Supabase get_by_gtin failed, falling back to local store: %s", exc)

        # Fallback to local MongoDB registry
        doc = medicines_col().find_one({"product_identifier": gtin})
        if doc:
            doc_id = str(doc.get("_id"))
            return {
                "_id": doc_id,
                "id": doc_id,
                **{k: v for k, v in doc.items() if k != "_id"},
            }
        return None

    def get_by_id(self, med_id: str) -> Optional[dict[str, Any]]:
        """Look up medicine by UUID or legacy ID or GTIN."""
        med_id = str(med_id).strip()
        client = get_supabase_client()

        if client:
            try:
                res = client.table("medicines").select("*, medicine_batches(*)").or_(
                    f"id.eq.{med_id},legacy_id.eq.{med_id},gtin.eq.{med_id}"
                ).limit(1).execute()
                if res.data and len(res.data) > 0:
                    row = res.data[0]
                    batches = row.get("medicine_batches") or []
                    batch = batches[0] if batches else {}
                    return {
                        "_id": row.get("legacy_id") or str(row.get("id")),
                        "id": str(row.get("id")),
                        "product_identifier": row.get("gtin"),
                        "product_name": row.get("product_name"),
                        "manufacturer": {
                            "id": row.get("manufacturer_id") or "mfr_default",
                            "name": row.get("manufacturer_name"),
                        },
                        "batch_number": batch.get("batch_number", ""),
                        "serial_number": batch.get("serial_number", ""),
                        "expiry_date": batch.get("expiry_date", ""),
                        "manufacturing_date": batch.get("manufacturing_date", ""),
                        "dosage": row.get("dosage", ""),
                        "package_size": row.get("package_size", ""),
                        "status": row.get("status", "active"),
                        "created_at": row.get("created_at"),
                        "updated_at": row.get("updated_at"),
                    }
            except Exception as exc:
                logger.warning("Supabase get_by_id failed: %s", exc)

        # Local fallback
        doc = medicines_col().find_one({"$or": [{"_id": med_id}, {"product_identifier": med_id}]})
        if doc:
            doc_id = str(doc.get("_id"))
            return {
                "_id": doc_id,
                "id": doc_id,
                **{k: v for k, v in doc.items() if k != "_id"},
            }
        return None

    def list_all(self, active_only: bool = True, limit: int = 100) -> list[dict[str, Any]]:
        """Return all medicines in the registry."""
        client = get_supabase_client()
        if client:
            try:
                q = client.table("medicines").select("*, medicine_batches(*)")
                if active_only:
                    q = q.eq("status", "active")
                res = q.order("product_name").limit(limit).execute()
                if res.data:
                    out = []
                    for row in res.data:
                        batches = row.get("medicine_batches") or []
                        batch = batches[0] if batches else {}
                        out.append({
                            "_id": row.get("legacy_id") or str(row.get("id")),
                            "id": str(row.get("id")),
                            "product_identifier": row.get("gtin"),
                            "product_name": row.get("product_name"),
                            "manufacturer": {
                                "id": row.get("manufacturer_id") or "mfr_default",
                                "name": row.get("manufacturer_name"),
                            },
                            "batch_number": batch.get("batch_number", ""),
                            "serial_number": batch.get("serial_number", ""),
                            "expiry_date": batch.get("expiry_date", ""),
                            "manufacturing_date": batch.get("manufacturing_date", ""),
                            "dosage": row.get("dosage", ""),
                            "package_size": row.get("package_size", ""),
                            "status": row.get("status", "active"),
                            "created_at": row.get("created_at"),
                            "updated_at": row.get("updated_at"),
                        })
                    return out
            except Exception as exc:
                logger.warning("Supabase list_all failed, using local store: %s", exc)

        query = {"status": "active"} if active_only else {}
        docs = list(medicines_col().find(query).sort("product_name", 1).limit(limit))
        result = []
        for d in docs:
            doc_id = str(d.pop("_id"))
            d["_id"] = doc_id
            d["id"] = doc_id
            result.append(d)
        return result

    def create(self, data: dict[str, Any]) -> dict[str, Any]:
        """Create a new medicine and its primary batch."""
        client = get_supabase_client()
        now = datetime.now(timezone.utc)
        legacy_id = f"med_{uuid.uuid4().hex[:10]}"

        # Always persist to MongoDB for local fallback consistency
        mongo_doc = {
            "_id": legacy_id,
            "product_identifier": data["product_identifier"],
            "product_name": data["product_name"],
            "manufacturer": {
                "id": data.get("manufacturer_id", "mfr_001"),
                "name": data.get("manufacturer_name", "PharmaCore Laboratories"),
            },
            "batch_number": data.get("batch_number", ""),
            "serial_number": data.get("serial_number", ""),
            "manufacturing_date": data.get("manufacturing_date", ""),
            "expiry_date": data.get("expiry_date", ""),
            "dosage": data.get("dosage", ""),
            "package_size": data.get("package_size", ""),
            "status": "active",
            "created_at": now,
            "updated_at": now,
        }
        medicines_col().insert_one(mongo_doc)

        if client:
            try:
                med_res = client.table("medicines").insert({
                    "legacy_id": legacy_id,
                    "gtin": data["product_identifier"],
                    "product_name": data["product_name"],
                    "generic_name": data.get("generic_name"),
                    "manufacturer_name": data.get("manufacturer_name", "PharmaCore Laboratories"),
                    "manufacturer_id": data.get("manufacturer_id", "mfr_001"),
                    "dosage": data.get("dosage", ""),
                    "package_size": data.get("package_size", ""),
                    "status": "active",
                }).execute()

                if med_res.data:
                    med_row = med_res.data[0]
                    medicine_id = med_row["id"]
                    if data.get("batch_number"):
                        client.table("medicine_batches").insert({
                            "medicine_id": medicine_id,
                            "batch_number": data["batch_number"],
                            "serial_number": data.get("serial_number", ""),
                            "expiry_date": data.get("expiry_date", "2028-01-01"),
                            "manufacturing_date": data.get("manufacturing_date", "2026-01-01"),
                            "status": "active",
                        }).execute()
            except Exception as exc:
                logger.error("Failed to insert medicine into Supabase: %s", exc)

        return {
            "id": legacy_id,
            "_id": legacy_id,
            "product_identifier": data["product_identifier"],
            "product_name": data["product_name"],
            "manufacturer": {
                "id": data.get("manufacturer_id", "mfr_001"),
                "name": data.get("manufacturer_name", "PharmaCore Laboratories"),
            },
            "batch_number": data.get("batch_number", ""),
            "serial_number": data.get("serial_number", ""),
            "manufacturing_date": data.get("manufacturing_date", ""),
            "expiry_date": data.get("expiry_date", ""),
            "dosage": data.get("dosage", ""),
            "package_size": data.get("package_size", ""),
            "status": "active",
            "created_at": now,
            "updated_at": now,
        }

    def update(self, med_id: str, updates: dict[str, Any]) -> Optional[dict[str, Any]]:
        """Update medicine attributes."""
        client = get_supabase_client()
        now = datetime.now(timezone.utc)

        # Update in Supabase
        if client:
            try:
                supa_payload = {}
                if "product_name" in updates:
                    supa_payload["product_name"] = updates["product_name"]
                if "dosage" in updates:
                    supa_payload["dosage"] = updates["dosage"]
                if "package_size" in updates:
                    supa_payload["package_size"] = updates["package_size"]
                if "status" in updates:
                    supa_payload["status"] = updates["status"]
                if supa_payload:
                    client.table("medicines").update(supa_payload).or_(
                        f"id.eq.{med_id},legacy_id.eq.{med_id},gtin.eq.{med_id}"
                    ).execute()
            except Exception as exc:
                logger.warning("Supabase medicine update failed: %s", exc)

        # Update in Mongo
        medicines_col().update_one(
            {"$or": [{"_id": med_id}, {"product_identifier": med_id}]},
            {"$set": {**updates, "updated_at": now}},
        )
        return self.get_by_id(med_id)

    def delete(self, med_id: str) -> bool:
        """Soft-delete (deactivate) a medicine."""
        return bool(self.update(med_id, {"status": "inactive"}))

    def reactivate(self, med_id: str) -> bool:
        """Reactivate an inactive medicine."""
        return bool(self.update(med_id, {"status": "active"}))
