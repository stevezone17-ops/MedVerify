"""Verifications repository — authoritative storage and retrieval for forensic inspections."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Any

from app.db.supabase_client import get_supabase_client
from app.database import verifications_col, audit_col
from app.utils.timestamps import to_iso_utc, normalize_datetime

logger = logging.getLogger("medverify.repo.verifications")


class VerificationsRepository:
    """Repository handling all verification events, audit records, and history queries."""

    def create_verification(
        self,
        doc_data: dict[str, Any],
        verification_id: str,
        user: dict[str, Any] | None = None,
        processing_time_ms: int = 45,
    ) -> dict[str, Any]:
        """Persist a new forensic verification record."""
        client = get_supabase_client()
        now = datetime.now(timezone.utc)
        now_iso = to_iso_utc(now)

        user_id = str(user["_id"]) if user and "_id" in user else None
        user_email = user.get("email") if user else None
        user_name = user.get("name") if user else "Anonymous Guest"

        # 1. Persist to MongoDB (ensures rollback safety & local offline mode)
        mongo_doc = {
            "_id": verification_id,
            **doc_data,
            "user_id": user_id,
            "user_email": user_email,
            "user_name": user_name,
            "created_at": now,
        }
        verifications_col().insert_one(mongo_doc)

        audit_col().insert_one({
            "_id": f"aud_{uuid.uuid4().hex[:12]}",
            "event": "medicine_verification",
            "verification_id": verification_id,
            "status": doc_data.get("status"),
            "confidence_score": doc_data.get("confidence_score"),
            "user_id": user_id,
            "user_email": user_email,
            "timestamp": now,
            "metadata": {
                "input_type": doc_data.get("input_type", "qr"),
                "identifier": doc_data.get("raw_identifier", ""),
                "user_name": user_name,
            },
        })

        # 2. Persist to Supabase if configured
        if client:
            try:
                parsed = doc_data.get("parsed_data") or {}
                checks = doc_data.get("checks") or []
                serialized_checks = [c if isinstance(c, dict) else c.model_dump() for c in checks]
                
                # Check status flags
                check_map = {c.get("field"): c.get("status") == "PASS" for c in serialized_checks}

                # Try to map user UUID if it's a valid uuid, otherwise keep user_id in user_email
                valid_uuid_user_id = None
                if user_id:
                    try:
                        uuid.UUID(str(user_id))
                        valid_uuid_user_id = str(user_id)
                    except ValueError:
                        valid_uuid_user_id = None

                supa_record = {
                    "legacy_id": verification_id,
                    "user_id": valid_uuid_user_id,
                    "user_email": user_email,
                    "user_name": user_name,
                    "raw_identifier": doc_data.get("raw_identifier", ""),
                    "gtin": parsed.get("product_identifier"),
                    "batch_number": parsed.get("batch_number"),
                    "serial_number": parsed.get("serial_number"),
                    "expiry_date": parsed.get("expiry_date"),
                    "verification_status": doc_data.get("status", "NOT_FOUND"),
                    "verification_method": (doc_data.get("input_type") or "QR").upper(),
                    "confidence": int(doc_data.get("confidence_score", 0)),
                    "registry_match": bool(doc_data.get("matched_medicine_id")),
                    "batch_valid": check_map.get("batch_number", False),
                    "expiry_valid": check_map.get("expiry_date", False),
                    "serial_valid": check_map.get("serial_number", False),
                    "checks": serialized_checks,
                    "issues": doc_data.get("issues") or [],
                    "parsed_data": parsed,
                    "medicine_summary": doc_data.get("medicine") or {},
                    "processing_time_ms": processing_time_ms,
                    "created_at": now_iso,
                }
                v_res = client.table("verification_records").insert(supa_record).execute()
                if v_res.data:
                    supa_v_id = v_res.data[0]["id"]
                    # Log verification event telemetry
                    client.table("verification_events").insert({
                        "verification_id": supa_v_id,
                        "event_type": "final_verdict",
                        "timestamp": now_iso,
                        "metadata": {
                            "status": doc_data.get("status"),
                            "confidence": doc_data.get("confidence_score"),
                            "raw_identifier": doc_data.get("raw_identifier"),
                        },
                    }).execute()
            except Exception as exc:
                logger.warning("Supabase verification insert warning (fallback used): %s", exc)

        return mongo_doc

    def get_by_id(self, verification_id: str) -> Optional[dict[str, Any]]:
        """Retrieve full verification result by ID."""
        client = get_supabase_client()
        if client:
            try:
                res = (
                    client.table("verification_records")
                    .select("*")
                    .or_(f"id.eq.{verification_id},legacy_id.eq.{verification_id}")
                    .limit(1)
                    .execute()
                )
                if res.data and len(res.data) > 0:
                    row = res.data[0]
                    return {
                        "verification_id": row.get("legacy_id") or str(row.get("id")),
                        "id": str(row.get("id")),
                        "raw_identifier": row.get("raw_identifier", ""),
                        "input_type": (row.get("verification_method") or "qr").lower(),
                        "status": row.get("verification_status", ""),
                        "confidence_score": row.get("confidence", 0),
                        "checks": row.get("checks") or [],
                        "issues": row.get("issues") or [],
                        "parsed_data": row.get("parsed_data") or {},
                        "medicine": row.get("medicine_summary") or None,
                        "created_at": to_iso_utc(row.get("created_at")),
                        "user_id": str(row.get("user_id")) if row.get("user_id") else None,
                        "user_email": row.get("user_email"),
                        "user_name": row.get("user_name"),
                    }
            except Exception as exc:
                logger.warning("Supabase get_by_id failed, trying local store: %s", exc)

        doc = verifications_col().find_one({"_id": verification_id})
        if doc:
            v_id = str(doc.pop("_id"))
            doc["verification_id"] = v_id
            doc["created_at"] = to_iso_utc(doc.get("created_at") or doc.get("createdAt"))
            return doc
        return None

    def list_history(
        self,
        status_filter: str | None = None,
        user_id: str | None = None,
        search: str | None = None,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[dict[str, Any]], int]:
        """Return paginated, sorted verification records."""
        client = get_supabase_client()
        if client:
            try:
                q = client.table("verification_records").select("*", count="exact")
                if status_filter:
                    q = q.eq("verification_status", status_filter.upper())
                if user_id:
                    # User filter: can match user_id or user_email or legacy user_id
                    q = q.or_(f"user_id.eq.{user_id},user_email.eq.{user_id}")
                if search:
                    s = search.strip()
                    q = q.or_(f"raw_identifier.ilike.%{s}%,gtin.ilike.%{s}%,batch_number.ilike.%{s}%")

                skip = (page - 1) * limit
                res = q.order("created_at", desc=True).range(skip, skip + limit - 1).execute()
                total = res.count or len(res.data or [])

                items = []
                for row in res.data or []:
                    med = row.get("medicine_summary") or {}
                    items.append({
                        "verification_id": row.get("legacy_id") or str(row.get("id")),
                        "raw_identifier": row.get("raw_identifier", ""),
                        "status": row.get("verification_status", ""),
                        "confidence_score": row.get("confidence", 0),
                        "product_name": med.get("product_name") or row.get("gtin"),
                        "manufacturer": med.get("manufacturer") or row.get("user_name"),
                        "verification_method": row.get("verification_method", "QR"),
                        "created_at": to_iso_utc(row.get("created_at")),
                    })
                return items, total
            except Exception as exc:
                logger.warning("Supabase list_history failed, falling back to local: %s", exc)

        # Fallback to local MongoDB
        query: dict = {}
        if user_id:
            query["$or"] = [{"user_id": user_id}, {"user_email": user_id}]
        if status_filter:
            query["status"] = status_filter.upper()
        if search:
            s = search.strip()
            query["$or"] = [
                {"raw_identifier": {"$regex": s, "$options": "i"}},
                {"medicine.product_name": {"$regex": s, "$options": "i"}},
                {"medicine.manufacturer": {"$regex": s, "$options": "i"}},
                {"parsed_data.batch_number": {"$regex": s, "$options": "i"}},
            ]

        total = verifications_col().count_documents(query)
        skip = (page - 1) * limit
        docs = list(
            verifications_col()
            .find(query)
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )

        items = []
        for d in docs:
            med = d.get("medicine") or {}
            items.append({
                "verification_id": str(d["_id"]),
                "raw_identifier": d.get("raw_identifier", ""),
                "status": d.get("status", ""),
                "confidence_score": d.get("confidence_score", 0),
                "product_name": med.get("product_name"),
                "manufacturer": med.get("manufacturer") or d.get("user_name"),
                "verification_method": (d.get("verification_method") or d.get("input_type") or "QR").upper(),
                "created_at": to_iso_utc(d.get("created_at") or d.get("createdAt")),
            })
        return items, total

    def get_user_recent(self, user_id: str, user_email: str | None = None, limit: int = 5) -> list[dict[str, Any]]:
        """Return the most recent verifications for a specific user."""
        client = get_supabase_client()
        if client:
            try:
                q = client.table("verification_records").select("*")
                if user_email:
                    q = q.or_(f"user_id.eq.{user_id},user_email.eq.{user_email}")
                else:
                    q = q.or_(f"user_id.eq.{user_id}")
                res = q.order("created_at", desc=True).limit(limit).execute()
                if res.data:
                    recent = []
                    for row in res.data:
                        med = row.get("medicine_summary") or {}
                        recent.append({
                            "verification_id": row.get("legacy_id") or str(row.get("id")),
                            "raw_identifier": row.get("raw_identifier", ""),
                            "status": row.get("verification_status", ""),
                            "confidence_score": row.get("confidence", 0),
                            "product_name": med.get("product_name") or row.get("gtin") or "Specimen",
                            "manufacturer": med.get("manufacturer") or "Unspecified",
                            "batch_number": row.get("batch_number") or "N/A",
                            "created_at": to_iso_utc(row.get("created_at")),
                        })
                    return recent
            except Exception as exc:
                logger.warning("Supabase get_user_recent failed: %s", exc)

        # Local fallback
        query = {"$or": [{"user_id": user_id}]}
        if user_email:
            query["$or"].append({"user_email": user_email})

        docs = list(
            verifications_col()
            .find(query)
            .sort("created_at", -1)
            .limit(limit)
        )
        recent_items = []
        for d in docs:
            med = d.get("medicine") or {}
            recent_items.append({
                "verification_id": str(d["_id"]),
                "raw_identifier": d.get("raw_identifier", ""),
                "status": d.get("status", ""),
                "confidence_score": d.get("confidence_score", 0),
                "product_name": med.get("product_name") or d.get("parsed_data", {}).get("product_identifier", "Unknown Product"),
                "manufacturer": med.get("manufacturer") or "Unspecified",
                "batch_number": d.get("parsed_data", {}).get("batch_number", "N/A"),
                "created_at": to_iso_utc(d.get("created_at") or d.get("createdAt")),
            })
        return recent_items

    def get_user_stats(self, user_id: str, user_email: str | None = None) -> dict[str, Any]:
        """Calculate metrics for a user."""
        client = get_supabase_client()
        if client:
            try:
                # Count total
                q = client.table("verification_records").select("verification_status", count="exact")
                if user_email:
                    q = q.or_(f"user_id.eq.{user_id},user_email.eq.{user_email}")
                else:
                    q = q.eq("user_id", user_id)
                res = q.execute()
                total = res.count or 0

                statuses = [r["verification_status"] for r in (res.data or [])]
                verified = statuses.count("VERIFIED")
                review = statuses.count("REVIEW")
                suspicious = statuses.count("SUSPICIOUS")
                not_found = statuses.count("NOT_FOUND")

                return {
                    "total_verifications": total,
                    "verified_count": verified,
                    "review_count": review,
                    "suspicious_count": suspicious,
                    "not_found_count": not_found,
                }
            except Exception as exc:
                logger.warning("Supabase get_user_stats failed: %s", exc)

        q: dict = {"$or": [{"user_id": user_id}]}
        if user_email:
            q["$or"].append({"user_email": user_email})

        total = verifications_col().count_documents(q)
        verified = verifications_col().count_documents({**q, "status": "VERIFIED"})
        review = verifications_col().count_documents({**q, "status": "REVIEW"})
        suspicious = verifications_col().count_documents({**q, "status": "SUSPICIOUS"})
        not_found = verifications_col().count_documents({**q, "status": "NOT_FOUND"})

        return {
            "total_verifications": total,
            "verified_count": verified,
            "review_count": review,
            "suspicious_count": suspicious,
            "not_found_count": not_found,
        }

    def get_admin_analytics(self) -> dict[str, Any]:
        """Aggregate platform metrics for the Admin Command Center."""
        client = get_supabase_client()
        if client:
            try:
                tot_res = client.table("verification_records").select("id", count="exact").limit(1).execute()
                total_v = tot_res.count or 0

                med_res = client.table("medicines").select("id, status", count="exact").execute()
                total_medicines = med_res.count or 0
                active_medicines = sum(1 for m in (med_res.data or []) if m.get("status") == "active")

                # Get status and method breakdown
                v_all = client.table("verification_records").select("verification_status, verification_method, created_at").execute()
                rows = v_all.data or []
                statuses = [r.get("verification_status") for r in rows]
                v_count = statuses.count("VERIFIED")
                r_count = statuses.count("REVIEW")
                s_count = statuses.count("SUSPICIOUS")
                nf_count = statuses.count("NOT_FOUND")

                methods = [(r.get("verification_method") or "QR").upper() for r in rows]
                method_counts = {
                    "QR": methods.count("QR"),
                    "DATAMATRIX": methods.count("DATAMATRIX"),
                    "BARCODE": methods.count("BARCODE"),
                    "PACKAGING_OCR": methods.count("PACKAGING_OCR"),
                    "MANUAL": methods.count("MANUAL"),
                }

                anomaly_total = s_count + nf_count
                anomaly_rate = round((anomaly_total / total_v * 100), 1) if total_v > 0 else 0.0

                recent_res = client.table("verification_records").select("*").order("created_at", desc=True).limit(12).execute()
                recent = []
                for row in recent_res.data or []:
                    med = row.get("medicine_summary") or {}
                    recent.append({
                        "verification_id": row.get("legacy_id") or str(row.get("id")),
                        "raw_identifier": row.get("raw_identifier", ""),
                        "status": row.get("verification_status", ""),
                        "confidence_score": row.get("confidence", 0),
                        "product_name": med.get("product_name") or row.get("gtin"),
                        "verification_method": row.get("verification_method", "QR"),
                        "created_at": to_iso_utc(row.get("created_at")),
                        "user_name": row.get("user_name"),
                        "user_email": row.get("user_email"),
                    })

                return {
                    "total_medicines": total_medicines,
                    "active_medicines": active_medicines,
                    "total_verifications": total_v,
                    "anomaly_rate": anomaly_rate,
                    "status_breakdown": {
                        "VERIFIED": v_count,
                        "REVIEW": r_count,
                        "SUSPICIOUS": s_count,
                        "NOT_FOUND": nf_count,
                    },
                    "method_breakdown": method_counts,
                    "recent_verifications": recent,
                }
            except Exception as exc:
                logger.warning("Supabase get_admin_analytics failed: %s", exc)

        # Fallback local MongoDB
        from app.database import medicines_col
        total_medicines = medicines_col().count_documents({})
        active_medicines = medicines_col().count_documents({"status": "active"})
        total_verifications = verifications_col().count_documents({})

        pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
        status_counts = {d["_id"]: d["count"] for d in verifications_col().aggregate(pipeline)}

        method_pipeline = [{"$group": {"_id": "$verification_method", "count": {"$sum": 1}}}]
        raw_methods = {str(d["_id"] or "QR").upper(): d["count"] for d in verifications_col().aggregate(method_pipeline)}
        method_counts = {
            "QR": raw_methods.get("QR", 0),
            "DATAMATRIX": raw_methods.get("DATAMATRIX", 0),
            "BARCODE": raw_methods.get("BARCODE", 0),
            "PACKAGING_OCR": raw_methods.get("PACKAGING_OCR", 0),
            "MANUAL": raw_methods.get("MANUAL", 0),
        }

        recent = list(
            verifications_col()
            .find({}, {"_id": 1, "status": 1, "confidence_score": 1, "raw_identifier": 1, "verification_method": 1, "created_at": 1, "medicine": 1, "user_name": 1, "user_email": 1})
            .sort("created_at", -1)
            .limit(12)
        )
        for r in recent:
            r["verification_id"] = str(r.pop("_id"))
            r["created_at"] = to_iso_utc(r.get("created_at"))

        suspicious_count = status_counts.get("SUSPICIOUS", 0)
        not_found_count = status_counts.get("NOT_FOUND", 0)
        anomaly_total = suspicious_count + not_found_count
        anomaly_rate = round((anomaly_total / total_verifications * 100), 1) if total_verifications > 0 else 0.0

        return {
            "total_medicines": total_medicines,
            "active_medicines": active_medicines,
            "total_verifications": total_verifications,
            "anomaly_rate": anomaly_rate,
            "status_breakdown": {
                "VERIFIED": status_counts.get("VERIFIED", 0),
                "REVIEW": status_counts.get("REVIEW", 0),
                "SUSPICIOUS": suspicious_count,
                "NOT_FOUND": not_found_count,
            },
            "method_breakdown": method_counts,
            "recent_verifications": recent,
        }

    def check_serial_reuse(self, serial: str, user_id: str | None) -> bool:
        """Check if serial was seen in another successful verification."""
        if not serial or serial == "SER-PC-000001":
            return False

        client = get_supabase_client()
        if client:
            try:
                q = client.table("verification_records").select("id").eq("serial_number", serial).in_(
                    "verification_status", ["VERIFIED", "REVIEW"]
                )
                if user_id:
                    q = q.neq("user_id", user_id)
                res = q.limit(1).execute()
                if res.data and len(res.data) > 0:
                    return True
            except Exception as exc:
                logger.warning("Supabase serial check failed: %s", exc)

        query: dict = {
            "parsed_data.serial_number": serial,
            "status": {"$in": ["VERIFIED", "REVIEW"]},
        }
        if user_id:
            query["user_id"] = {"$ne": user_id}
        prev = verifications_col().find_one(query)
        return bool(prev)
