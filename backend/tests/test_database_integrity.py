"""Tests for MedVerify Database Integrity, Persistence & Indexes (Stage 5).

Validates:
- MongoDB connection and idempotent index creation across all collections.
- Unique constraints on critical fields (medicine GTIN / product_identifier, user email).
- Serial reuse tracking query performance and persistence.
- Medicine Cabinet persistent CRUD operations in MongoDB.
"""

import pytest
import pymongo
from pymongo.errors import DuplicateKeyError

from app.database import (
    ensure_indexes,
    medicines_col,
    verifications_col,
    users_col,
    cabinet_col,
    uploaded_images_col,
    image_analyses_col,
)
from app.db.repositories import cabinet_repo, verifications_repo


@pytest.fixture(autouse=True)
def init_db():
    ensure_indexes()


def test_ensure_indexes_is_idempotent():
    """Verify that calling ensure_indexes multiple times succeeds without error."""
    ensure_indexes()
    ensure_indexes()

    # Verify key indexes exist
    med_indexes = medicines_col().index_information()
    assert "product_identifier_1" in med_indexes
    assert med_indexes["product_identifier_1"].get("unique") is True

    user_indexes = users_col().index_information()
    assert "email_1" in user_indexes
    assert user_indexes["email_1"].get("unique") is True

    verif_indexes = verifications_col().index_information()
    assert any("parsed_data.serial_number" in str(idx.get("key")) for idx in verif_indexes.values())

    cab_indexes = cabinet_col().index_information()
    assert any("user_id" in str(idx.get("key")) for idx in cab_indexes.values())


def test_unique_medicine_product_identifier_constraint():
    """Attempting to insert two medicines with identical product_identifier must trigger DuplicateKeyError."""
    test_pid = "99990000111122"
    medicines_col().delete_many({"product_identifier": test_pid})

    doc1 = {
        "_id": "med_unique_test_1",
        "product_identifier": test_pid,
        "product_name": "Unique Test 1",
        "batch_number": "B1",
        "serial_number": "S1",
        "status": "active",
    }
    medicines_col().insert_one(doc1)

    doc2 = {
        "_id": "med_unique_test_2",
        "product_identifier": test_pid,
        "product_name": "Unique Test 2",
        "batch_number": "B2",
        "serial_number": "S2",
        "status": "active",
    }
    with pytest.raises(DuplicateKeyError):
        medicines_col().insert_one(doc2)

    medicines_col().delete_many({"product_identifier": test_pid})


def test_unique_user_email_constraint():
    """Attempting to insert two users with identical email must trigger DuplicateKeyError."""
    test_email = "duplicate_test@medverify.demo"
    users_col().delete_many({"email": test_email})

    users_col().insert_one({
        "_id": "usr_dupe_1",
        "email": test_email,
        "name": "User One",
        "role": "user",
    })

    with pytest.raises(DuplicateKeyError):
        users_col().insert_one({
            "_id": "usr_dupe_2",
            "email": test_email,
            "name": "User Two",
            "role": "user",
        })

    users_col().delete_many({"email": test_email})


def test_serial_reuse_tracking_query():
    """Verifications repository check_serial_reuse correctly detects duplicate serial numbers."""
    test_serial = "SER-INTEGRITY-CHECK-999"
    verifications_col().delete_many({"parsed_data.serial_number": test_serial})

    # Initially false
    assert verifications_repo.check_serial_reuse(test_serial, user_id="user_test_a") is False

    # Insert a verification record with this serial for user_test_b
    verifications_col().insert_one({
        "_id": "vrf_integrity_test_01",
        "user_id": "user_test_b",
        "status": "VERIFIED",
        "parsed_data": {
            "product_identifier": "89012345678901",
            "serial_number": test_serial,
            "batch_number": "BATCH-001",
        },
    })

    # Now user_test_a checks it -> must return True (reuse detected!)
    assert verifications_repo.check_serial_reuse(test_serial, user_id="user_test_a") is True

    # Same user checking their own verification -> False (re-checking own scan)
    assert verifications_repo.check_serial_reuse(test_serial, user_id="user_test_b") is False

    verifications_col().delete_many({"parsed_data.serial_number": test_serial})


def test_cabinet_crud_persistence_in_mongodb():
    """Cabinet operations (add, list, update, remove) are reliably persisted in MongoDB."""
    test_user = "usr_cabinet_integrity_test"
    cabinet_col().delete_many({"user_id": test_user})

    # 1. Add item
    item = cabinet_repo.add({
        "user_id": test_user,
        "medicine_id": "med_001",
        "product_name": "Amoxicillin 500mg",
        "nickname": "My Antibiotic",
        "notes": "Take with breakfast",
        "expiry_date": "2028-01-09",
    })
    cab_id = item["id"]

    # Verify directly in MongoDB
    mongo_entry = cabinet_col().find_one({"user_id": test_user, "$or": [{"id": cab_id}, {"_id": cab_id}]})
    assert mongo_entry is not None
    assert mongo_entry["nickname"] == "My Antibiotic"

    # 2. List items
    items = cabinet_repo.list_user_cabinet(test_user)
    assert len(items) >= 1
    assert any(it["id"] == cab_id for it in items)

    # 3. Update item
    updated = cabinet_repo.update(cab_id, test_user, {"nickname": "Updated Nickname", "notes": "New notes"})
    assert updated is not None
    assert updated["nickname"] == "Updated Nickname"

    # Verify update in MongoDB
    mongo_entry = cabinet_col().find_one({"user_id": test_user, "$or": [{"id": cab_id}, {"_id": cab_id}]})
    assert mongo_entry["nickname"] == "Updated Nickname"

    # 4. Remove item
    removed = cabinet_repo.remove(cab_id, test_user)
    assert removed is True

    # Verify deleted in MongoDB
    mongo_entry = cabinet_col().find_one({"user_id": test_user, "$or": [{"id": cab_id}, {"_id": cab_id}]})
    assert mongo_entry is None


def test_verification_record_persistence_and_audit():
    """Verify that verification events persist with user linkage, timestamps, and audit metrics."""
    from datetime import datetime, timezone
    test_verif_id = "vrf_persistence_test_999"
    verifications_col().delete_many({"_id": test_verif_id})

    record = {
        "_id": test_verif_id,
        "verification_id": test_verif_id,
        "user_id": "usr_audit_persist_test",
        "user_email": "auditor@medverify.demo",
        "status": "VERIFIED",
        "confidence_score": 95,
        "product_name": "Azithromycin 250mg",
        "parsed_data": {
            "product_identifier": "08901148259999",
            "batch_number": "BATCH-PERSIST-01",
            "serial_number": "SN-PERSIST-01",
        },
        "method": "IMAGE_VERIFICATION",
        "image_batch_id": "batch_img_persist_01",
        "created_at": datetime.now(timezone.utc),
    }
    verifications_col().insert_one(record)

    # Fetch via repository
    fetched = verifications_repo.get_by_id(test_verif_id)
    assert fetched is not None
    assert fetched["status"] == "VERIFIED"
    assert fetched["confidence_score"] == 95
    assert fetched.get("image_batch_id") == "batch_img_persist_01"

    # Verify audit listing picks it up
    items, total = verifications_repo.list_history(limit=50)
    assert any(it.get("verification_id") == test_verif_id for it in items)

    # Clean up
    verifications_col().delete_many({"_id": test_verif_id})

