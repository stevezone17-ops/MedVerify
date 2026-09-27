"""Seed script — populates the database with realistic demo medicines and an admin user.

Usage:
    python seed.py

The script is idempotent: it drops existing collections before inserting.
"""

import uuid
from datetime import datetime, timezone

from app.database import get_db, medicines_col, users_col, ensure_indexes
from app.services.auth_service import hash_password


def seed():
    db = get_db()

    # Drop old data
    db.drop_collection("medicines")
    db.drop_collection("verifications")
    db.drop_collection("audit_logs")
    db.drop_collection("users")

    ensure_indexes()

    now = datetime.now(timezone.utc)

    # -----------------------------------------------------------------------
    # Manufacturers
    # -----------------------------------------------------------------------
    mfr_pharmacore = {"id": "mfr_001", "name": "PharmaCore Laboratories"}
    mfr_medisafe = {"id": "mfr_002", "name": "MediSafe Healthcare Pvt. Ltd."}
    mfr_globalrx = {"id": "mfr_003", "name": "GlobalRx Pharmaceuticals"}

    # -----------------------------------------------------------------------
    # Medicines — 10 realistic demo records
    # -----------------------------------------------------------------------
    medicines = [
        {
            "_id": "med_001",
            "product_identifier": "89012345678901",
            "product_name": "Amoxicillin 500 mg Capsules",
            "manufacturer": mfr_pharmacore,
            "batch_number": "BATCH-2026-001",
            "serial_number": "SER-PC-000001",
            "manufacturing_date": "2026-01-10",
            "expiry_date": "2028-01-09",
            "dosage": "500 mg",
            "package_size": "10 capsules",
            "status": "active",
            "created_at": now,
            "updated_at": now,
        },
        {
            "_id": "med_002",
            "product_identifier": "89012345678902",
            "product_name": "Metformin 850 mg Tablets",
            "manufacturer": mfr_medisafe,
            "batch_number": "BATCH-2026-042",
            "serial_number": "SER-MS-000012",
            "manufacturing_date": "2026-03-15",
            "expiry_date": "2028-03-14",
            "dosage": "850 mg",
            "package_size": "30 tablets",
            "status": "active",
            "created_at": now,
            "updated_at": now,
        },
        {
            "_id": "med_003",
            "product_identifier": "89012345678903",
            "product_name": "Paracetamol 650 mg Tablets",
            "manufacturer": mfr_pharmacore,
            "batch_number": "BATCH-2026-108",
            "serial_number": "SER-PC-000089",
            "manufacturing_date": "2026-06-01",
            "expiry_date": "2028-05-31",
            "dosage": "650 mg",
            "package_size": "15 tablets",
            "status": "active",
            "created_at": now,
            "updated_at": now,
        },
        {
            "_id": "med_004",
            "product_identifier": "89012345678904",
            "product_name": "Atorvastatin 20 mg Tablets",
            "manufacturer": mfr_globalrx,
            "batch_number": "BATCH-2026-200",
            "serial_number": "SER-GR-000034",
            "manufacturing_date": "2026-02-20",
            "expiry_date": "2028-02-19",
            "dosage": "20 mg",
            "package_size": "30 tablets",
            "status": "active",
            "created_at": now,
            "updated_at": now,
        },
        {
            "_id": "med_005",
            "product_identifier": "89012345678905",
            "product_name": "Cetirizine 10 mg Tablets",
            "manufacturer": mfr_medisafe,
            "batch_number": "BATCH-2026-055",
            "serial_number": "SER-MS-000045",
            "manufacturing_date": "2026-04-10",
            "expiry_date": "2028-04-09",
            "dosage": "10 mg",
            "package_size": "10 tablets",
            "status": "active",
            "created_at": now,
            "updated_at": now,
        },
        {
            "_id": "med_006",
            "product_identifier": "89012345678906",
            "product_name": "Azithromycin 250 mg Tablets",
            "manufacturer": mfr_pharmacore,
            "batch_number": "BATCH-2026-310",
            "serial_number": "SER-PC-000156",
            "manufacturing_date": "2026-07-01",
            "expiry_date": "2028-06-30",
            "dosage": "250 mg",
            "package_size": "6 tablets",
            "status": "active",
            "created_at": now,
            "updated_at": now,
        },
        {
            "_id": "med_007",
            "product_identifier": "89012345678907",
            "product_name": "Omeprazole 20 mg Capsules",
            "manufacturer": mfr_globalrx,
            "batch_number": "BATCH-2026-088",
            "serial_number": "SER-GR-000078",
            "manufacturing_date": "2026-05-15",
            "expiry_date": "2028-05-14",
            "dosage": "20 mg",
            "package_size": "14 capsules",
            "status": "active",
            "created_at": now,
            "updated_at": now,
        },
        {
            "_id": "med_008",
            "product_identifier": "89012345678908",
            "product_name": "Ibuprofen 400 mg Tablets",
            "manufacturer": mfr_medisafe,
            "batch_number": "BATCH-2025-012",
            "serial_number": "SER-MS-000099",
            "manufacturing_date": "2025-01-10",
            "expiry_date": "2025-07-09",
            "dosage": "400 mg",
            "package_size": "20 tablets",
            "status": "active",
            "created_at": now,
            "updated_at": now,
        },
        {
            "_id": "med_009",
            "product_identifier": "89012345678909",
            "product_name": "Ciprofloxacin 500 mg Tablets",
            "manufacturer": mfr_globalrx,
            "batch_number": "BATCH-2026-175",
            "serial_number": "SER-GR-000112",
            "manufacturing_date": "2026-08-01",
            "expiry_date": "2028-07-31",
            "dosage": "500 mg",
            "package_size": "10 tablets",
            "status": "active",
            "created_at": now,
            "updated_at": now,
        },
        {
            "_id": "med_010",
            "product_identifier": "89012345678910",
            "product_name": "Losartan 50 mg Tablets",
            "manufacturer": mfr_pharmacore,
            "batch_number": "BATCH-2026-220",
            "serial_number": "SER-PC-000200",
            "manufacturing_date": "2026-09-01",
            "expiry_date": "2028-08-31",
            "dosage": "50 mg",
            "package_size": "28 tablets",
            "status": "active",
            "created_at": now,
            "updated_at": now,
        },
    ]

    medicines_col().insert_many(medicines)
    print(f"[OK] Inserted {len(medicines)} medicines")

    # -----------------------------------------------------------------------
    # Demo users
    # -----------------------------------------------------------------------
    users = [
        {
            "_id": "user_admin01",
            "name": "Admin User",
            "email": "admin@medverify.demo",
            "password_hash": hash_password("admin123"),
            "role": "admin",
            "created_at": now,
        },
        {
            "_id": "user_demo01",
            "name": "Demo Pharmacist",
            "email": "user@medverify.demo",
            "password_hash": hash_password("user123"),
            "role": "user",
            "created_at": now,
        },
    ]
    users_col().insert_many(users)
    print(f"[OK] Inserted {len(users)} users")

    # -----------------------------------------------------------------------
    # Print demo QR payloads for testing
    # -----------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("DEMO QR PAYLOADS FOR TESTING")
    print("=" * 60)

    print("\n-- Demo 1: VERIFIED (all fields match) --")
    print('89012345678901')
    print('  or JSON: {"pid":"89012345678901","batch":"BATCH-2026-001","serial":"SER-PC-000001"}')

    print("\n-- Demo 2: SUSPICIOUS (wrong batch) --")
    print('  JSON: {"pid":"89012345678902","batch":"FAKE-BATCH-999","serial":"SER-MS-000012"}')

    print("\n-- Demo 3: NOT_FOUND (unknown identifier) --")
    print('99999999999999')

    print("\n-- Demo 4: REVIEW (expired product) --")
    print('89012345678908')

    print("\n-- Demo 5: VERIFIED (GS1 format) --")
    print('(01)89012345678903(10)BATCH-2026-108(21)SER-PC-000089(17)2028-05-31')

    print("\n" + "=" * 60)
    print("DEMO CREDENTIALS")
    print("=" * 60)
    print("Admin:  admin@medverify.demo / admin123")
    print("User:   user@medverify.demo  / user123")
    print("=" * 60)


if __name__ == "__main__":
    seed()
