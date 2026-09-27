"""Supabase Development Seed Script.

Populates Supabase PostgreSQL with canonical test medicines, batches,
and initial demo users for testing and local development.

Usage:
    python scripts/seed_supabase.py
"""

from __future__ import annotations

import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.supabase_client import get_supabase_client, is_supabase_configured
from app.utils.timestamps import to_iso_utc


def seed_supabase():
    print("=" * 60)
    print("MEDVERIFY — SUPABASE DEVELOPMENT SEED UTILITY")
    print("NOTE: This script inserts DEVELOPMENT / DEMO DATA only.")
    print("=" * 60)

    if not is_supabase_configured():
        print("\n[ERROR] Supabase is not configured in .env!")
        print("Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding.")
        sys.exit(1)

    client = get_supabase_client()
    if not client:
        print("\n[ERROR] Could not connect to Supabase. Check credentials.\n")
        sys.exit(1)

    now = to_iso_utc(datetime.now(timezone.utc))

    # 1. Demo Profiles
    print("\n[1/3] Seeding demo user profiles...")
    demo_profiles = [
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "email": "admin@medverify.demo",
            "full_name": "Admin Officer",
            "role": "admin",
            "status": "active",
            "created_at": now,
        },
        {
            "id": "00000000-0000-0000-0000-000000000002",
            "email": "user@medverify.demo",
            "full_name": "Demo Pharmacist",
            "role": "user",
            "status": "active",
            "created_at": now,
        },
    ]

    for p in demo_profiles:
        try:
            client.table("profiles").upsert(p, on_conflict="email").execute()
            print(f"  [OK] Profile: {p['email']} ({p['role']})")
        except Exception as exc:
            print(f"  [WARN] Profile {p['email']}: {exc}")

    # 2. Canonical Demo Medicines & Batches
    print("\n[2/3] Seeding canonical medicines and authorized batches...")
    medicines_data = [
        {
            "gtin": "89012345678901",
            "name": "Amoxicillin 500 mg Capsules",
            "mfr": "PharmaCore Laboratories",
            "mfr_id": "mfr_001",
            "dosage": "500 mg",
            "pkg": "10 capsules",
            "batch": "BATCH-2026-001",
            "serial": "SER-PC-000001",
            "mfg": "2026-01-10",
            "exp": "2028-01-09",
            "status": "active",
        },
        {
            "gtin": "89012345678902",
            "name": "Metformin 850 mg Tablets",
            "mfr": "MediSafe Healthcare Pvt. Ltd.",
            "mfr_id": "mfr_002",
            "dosage": "850 mg",
            "pkg": "30 tablets",
            "batch": "BATCH-2026-042",
            "serial": "SER-MS-000012",
            "mfg": "2026-03-15",
            "exp": "2028-03-14",
            "status": "active",
        },
        {
            "gtin": "89012345678903",
            "name": "Ciprofloxacin 500 mg Tablets",
            "mfr": "GlobalRx Pharmaceuticals",
            "mfr_id": "mfr_003",
            "dosage": "500 mg",
            "pkg": "10 tablets",
            "batch": "BATCH-2026-108",
            "serial": "SER-PC-000089",
            "mfg": "2026-02-01",
            "exp": "2028-05-31",
            "status": "active",
        },
        {
            "gtin": "89012345678908",
            "name": "Pantoprazole 40 mg Gastro-resistant Tablets",
            "mfr": "MediSafe Healthcare Pvt. Ltd.",
            "mfr_id": "mfr_002",
            "dosage": "40 mg",
            "pkg": "15 tablets",
            "batch": "BATCH-2024-001",
            "serial": "SER-MS-000001",
            "mfg": "2023-01-01",
            "exp": "2025-01-01",  # Intentionally expired for test scenario
            "status": "active",
        },
    ]

    for item in medicines_data:
        med_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"medverify.medicine.{item['gtin']}"))
        med_record = {
            "id": med_uuid,
            "gtin": item["gtin"],
            "product_name": item["name"],
            "manufacturer_name": item["mfr"],
            "manufacturer_id": item["mfr_id"],
            "dosage": item["dosage"],
            "package_size": item["pkg"],
            "status": "active",
            "created_at": now,
        }
        try:
            client.table("medicines").upsert(med_record, on_conflict="gtin").execute()
            batch_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"medverify.batch.{item['gtin']}.{item['batch']}"))
            client.table("medicine_batches").upsert({
                "id": batch_uuid,
                "medicine_id": med_uuid,
                "batch_number": item["batch"],
                "serial_number": item["serial"],
                "manufacturing_date": item["mfg"],
                "expiry_date": item["exp"],
                "status": item["status"],
                "created_at": now,
            }, on_conflict="medicine_id,batch_number").execute()
            print(f"  [OK] Medicine: {item['name']} ({item['gtin']}) with Batch {item['batch']}")
        except Exception as exc:
            print(f"  [WARN] Failed to seed {item['gtin']}: {exc}")

    print("\n[3/3] Development Seed Completed Successfully.")
    print("=" * 60)


if __name__ == "__main__":
    seed_supabase()
