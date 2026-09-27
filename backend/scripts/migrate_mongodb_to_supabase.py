"""MongoDB to Supabase PostgreSQL Migration Utility.

Safely transforms and transfers existing MongoDB data (users, medicines,
verifications, audit logs) into Supabase relational tables.

Usage:
    python scripts/migrate_mongodb_to_supabase.py [--dry-run] [--verbose]
"""

from __future__ import annotations

import argparse
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Ensure backend root is in python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import (
    users_col,
    medicines_col,
    verifications_col,
    audit_col,
)
from app.db.supabase_client import get_supabase_client, is_supabase_configured
from app.utils.timestamps import to_iso_utc, normalize_datetime


def parse_args():
    parser = argparse.ArgumentParser(description="Migrate MedVerify MongoDB data to Supabase.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the migration without writing any records to Supabase.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print verbose per-document log output.",
    )
    return parser.parse_args()


def run_migration(dry_run: bool = False, verbose: bool = False):
    print("=" * 60)
    print("MEDVERIFY — MONGODB TO SUPABASE MIGRATION PIPELINE")
    print(f"Mode: {'DRY RUN (Simulation Only)' if dry_run else 'LIVE PRODUCTION IMPORT'}")
    print("=" * 60)

    client = None
    if not dry_run:
        if not is_supabase_configured():
            print("\n[ERROR] Supabase is not configured in .env!")
            print("Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running live migration.")
            print("Tip: Run with --dry-run to validate MongoDB extraction without a Supabase connection.\n")
            sys.exit(1)
        client = get_supabase_client()
        if not client:
            print("\n[ERROR] Could not connect to Supabase. Check credentials.\n")
            sys.exit(1)
        print("[OK] Successfully connected to Supabase PostgreSQL.")
    else:
        print("[INFO] Running dry-run validation against local MongoDB...")

    stats = {
        "users": {"scanned": 0, "migrated": 0, "failed": 0},
        "medicines": {"scanned": 0, "migrated": 0, "batches": 0, "failed": 0},
        "verifications": {"scanned": 0, "migrated": 0, "failed": 0},
        "audit": {"scanned": 0, "migrated": 0, "failed": 0},
    }

    # -------------------------------------------------------------------------
    # 1. Users -> profiles
    # -------------------------------------------------------------------------
    print("\n[1/4] Migrating Users -> profiles...")
    users = list(users_col().find())
    stats["users"]["scanned"] = len(users)

    user_id_map: dict[str, str] = {}  # Map legacy mongo user_id -> UUID

    for u in users:
        legacy_id = str(u.get("_id"))
        email = (u.get("email") or "").lower().strip()
        name = u.get("name") or email.split("@")[0].capitalize()
        role = u.get("role", "user")
        status = u.get("status", "active")
        created_at = to_iso_utc(u.get("created_at") or datetime.now(timezone.utc))

        # Generate a deterministic or random UUID for profile
        try:
            profile_uuid = str(uuid.UUID(legacy_id))
        except ValueError:
            profile_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"medverify.user.{legacy_id}"))

        user_id_map[legacy_id] = profile_uuid

        record = {
            "id": profile_uuid,
            "email": email,
            "full_name": name,
            "role": role,
            "status": status,
            "created_at": created_at,
        }

        if verbose:
            print(f"  User: {email} ({role}) -> Profile UUID {profile_uuid}")

        if not dry_run and client:
            try:
                client.table("profiles").upsert(record, on_conflict="email").execute()
                stats["users"]["migrated"] += 1
            except Exception as exc:
                print(f"  [FAIL] User {email}: {exc}")
                stats["users"]["failed"] += 1
        else:
            stats["users"]["migrated"] += 1

    print(f"  Users summary: {stats['users']['migrated']}/{stats['users']['scanned']} ready.")

    # -------------------------------------------------------------------------
    # 2. Medicines -> medicines + medicine_batches
    # -------------------------------------------------------------------------
    print("\n[2/4] Migrating Medicines & Batches -> medicines & medicine_batches...")
    medicines = list(medicines_col().find())
    stats["medicines"]["scanned"] = len(medicines)

    med_id_map: dict[str, str] = {}  # legacy_id -> UUID

    for m in medicines:
        legacy_id = str(m.get("_id"))
        gtin = str(m.get("product_identifier", "")).strip()
        product_name = m.get("product_name", "Unknown Medicine")
        mfr = m.get("manufacturer") or {}
        mfr_name = mfr.get("name", "PharmaCore Laboratories") if isinstance(mfr, dict) else str(mfr)
        mfr_id = mfr.get("id", "mfr_001") if isinstance(mfr, dict) else "mfr_001"
        created_at = to_iso_utc(m.get("created_at") or datetime.now(timezone.utc))

        med_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"medverify.medicine.{gtin}"))
        med_id_map[legacy_id] = med_uuid

        med_record = {
            "id": med_uuid,
            "legacy_id": legacy_id,
            "gtin": gtin,
            "product_name": product_name,
            "manufacturer_name": mfr_name,
            "manufacturer_id": mfr_id,
            "dosage": m.get("dosage", ""),
            "package_size": m.get("package_size", ""),
            "status": m.get("status", "active"),
            "created_at": created_at,
        }

        batch_number = m.get("batch_number")
        batch_record = None
        if batch_number:
            batch_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"medverify.batch.{gtin}.{batch_number}"))
            batch_record = {
                "id": batch_uuid,
                "medicine_id": med_uuid,
                "batch_number": batch_number,
                "serial_number": m.get("serial_number", ""),
                "expiry_date": m.get("expiry_date", "2028-01-01"),
                "manufacturing_date": m.get("manufacturing_date", "2026-01-01"),
                "status": "active",
                "created_at": created_at,
            }

        if verbose:
            print(f"  Medicine: {gtin} - {product_name} (Batch: {batch_number})")

        if not dry_run and client:
            try:
                client.table("medicines").upsert(med_record, on_conflict="gtin").execute()
                stats["medicines"]["migrated"] += 1
                if batch_record:
                    client.table("medicine_batches").upsert(
                        batch_record, on_conflict="medicine_id,batch_number"
                    ).execute()
                    stats["medicines"]["batches"] += 1
            except Exception as exc:
                print(f"  [FAIL] Medicine {gtin}: {exc}")
                stats["medicines"]["failed"] += 1
        else:
            stats["medicines"]["migrated"] += 1
            if batch_record:
                stats["medicines"]["batches"] += 1

    print(f"  Medicines summary: {stats['medicines']['migrated']}/{stats['medicines']['scanned']} migrated with {stats['medicines']['batches']} batches.")

    # -------------------------------------------------------------------------
    # 3. Verifications -> verification_records
    # -------------------------------------------------------------------------
    print("\n[3/4] Migrating Verification History -> verification_records...")
    verifications = list(verifications_col().find())
    stats["verifications"]["scanned"] = len(verifications)

    for v in verifications:
        legacy_id = str(v.get("_id"))
        legacy_user = v.get("user_id")
        mapped_user_id = user_id_map.get(legacy_user) if legacy_user else None

        parsed = v.get("parsed_data") or {}
        checks = v.get("checks") or []
        checks_serialized = [c if isinstance(c, dict) else c.model_dump() for c in checks]
        check_map = {c.get("field"): c.get("status") == "PASS" for c in checks_serialized}
        created_at = to_iso_utc(v.get("created_at") or v.get("createdAt") or datetime.now(timezone.utc))

        v_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"medverify.verification.{legacy_id}"))

        matched_med_legacy = v.get("matched_medicine_id")
        mapped_med_id = med_id_map.get(matched_med_legacy) if matched_med_legacy else None

        record = {
            "id": v_uuid,
            "legacy_id": legacy_id,
            "user_id": mapped_user_id,
            "user_email": v.get("user_email"),
            "user_name": v.get("user_name", "Anonymous Guest"),
            "medicine_id": mapped_med_id,
            "raw_identifier": v.get("raw_identifier", ""),
            "gtin": parsed.get("product_identifier"),
            "batch_number": parsed.get("batch_number"),
            "serial_number": parsed.get("serial_number"),
            "expiry_date": parsed.get("expiry_date"),
            "verification_status": v.get("status", "NOT_FOUND"),
            "verification_method": (v.get("input_type") or "QR").upper(),
            "confidence": int(v.get("confidence_score", 0)),
            "registry_match": bool(v.get("matched_medicine_id")),
            "batch_valid": check_map.get("batch_number", False),
            "expiry_valid": check_map.get("expiry_date", False),
            "serial_valid": check_map.get("serial_number", False),
            "checks": checks_serialized,
            "issues": v.get("issues") or [],
            "parsed_data": parsed,
            "medicine_summary": v.get("medicine") or {},
            "processing_time_ms": 45,
            "created_at": created_at,
        }

        if verbose:
            print(f"  Verification: {legacy_id} [{v.get('status')}] - {created_at}")

        if not dry_run and client:
            try:
                client.table("verification_records").upsert(record, on_conflict="id").execute()
                stats["verifications"]["migrated"] += 1
            except Exception as exc:
                print(f"  [FAIL] Verification {legacy_id}: {exc}")
                stats["verifications"]["failed"] += 1
        else:
            stats["verifications"]["migrated"] += 1

    print(f"  Verifications summary: {stats['verifications']['migrated']}/{stats['verifications']['scanned']} records processed.")

    # -------------------------------------------------------------------------
    # 4. Audit Logs -> admin_activity
    # -------------------------------------------------------------------------
    print("\n[4/4] Migrating Audit Logs -> admin_activity...")
    audit_logs = list(audit_col().find())
    stats["audit"]["scanned"] = len(audit_logs)

    for a in audit_logs:
        legacy_id = str(a.get("_id"))
        legacy_user = a.get("user_id")
        mapped_user_id = user_id_map.get(legacy_user) if legacy_user else None
        ts = to_iso_utc(a.get("timestamp") or datetime.now(timezone.utc))

        record = {
            "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"medverify.audit.{legacy_id}")),
            "admin_id": mapped_user_id,
            "action": a.get("event", "medicine_verification"),
            "target_entity": "verification_records",
            "target_id": a.get("verification_id"),
            "details": a.get("metadata") or {},
            "timestamp": ts,
        }

        if not dry_run and client:
            try:
                client.table("admin_activity").upsert(record, on_conflict="id").execute()
                stats["audit"]["migrated"] += 1
            except Exception as exc:
                stats["audit"]["failed"] += 1
        else:
            stats["audit"]["migrated"] += 1

    print(f"  Audit summary: {stats['audit']['migrated']}/{stats['audit']['scanned']} logs processed.")

    # -------------------------------------------------------------------------
    # Final Report
    # -------------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("MIGRATION EXECUTION REPORT")
    print("=" * 60)
    print(f"Status:               {'SIMULATION SUCCESSFUL' if dry_run else 'LIVE MIGRATION COMPLETE'}")
    print(f"Users / Profiles:     {stats['users']['migrated']} / {stats['users']['scanned']} (Failures: {stats['users']['failed']})")
    print(f"Medicines:            {stats['medicines']['migrated']} / {stats['medicines']['scanned']} (Batches: {stats['medicines']['batches']}, Failures: {stats['medicines']['failed']})")
    print(f"Verifications:        {stats['verifications']['migrated']} / {stats['verifications']['scanned']} (Failures: {stats['verifications']['failed']})")
    print(f"Audit Logs:           {stats['audit']['migrated']} / {stats['audit']['scanned']} (Failures: {stats['audit']['failed']})")
    print("=" * 60)
    print("NOTE: Original MongoDB collections remain 100% intact as rollback insurance.\n")


if __name__ == "__main__":
    args = parse_args()
    run_migration(dry_run=args.dry_run, verbose=args.verbose)
