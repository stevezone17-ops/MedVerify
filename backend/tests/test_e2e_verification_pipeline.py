"""End-to-end integration and pipeline validation tests for MedVerify.

Validates:
- Complete end-to-end verification pipeline (OCR + GS1 + 6-Factor Deterministic Engine).
- Raw unparenthesized GS1 DataMatrix string parsing with FNC1 delimiters.
- Comprehensive 6-factor deterministic scoring state verification (VERIFIED, REVIEW, SUSPICIOUS, NOT_FOUND, EXPIRED, REQUIRES_REVIEW).
- Packaging upload validation boundaries (max batch count, oversize dimensions).
- Proper database linkage between verification records and image analysis artifacts.
"""

import io
import pytest
from PIL import Image
from starlette.testclient import TestClient

from app.main import app
from app.services.qr_parser import parse_identifier
from app.services.scoring import calculate_score
from app.services.auth_service import create_token
from app.db.repositories import profiles_repo, medicines_repo
from app.database import verifications_col


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def user_token(client):
    user = profiles_repo.get_by_email("user@medverify.demo")
    return create_token(user["id"] if user else "usr_demo_user", "user")


def create_in_memory_image(width: int = 500, height: int = 500, format: str = "JPEG") -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color=(50, 150, 200))
    img.save(buf, format=format)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# 1. GS1 DataMatrix Decoding & Unparenthesized Strings
# ---------------------------------------------------------------------------

def test_unparenthesized_gs1_datamatrix_with_fnc1_ascii_29():
    """Verify parsing unparenthesized GS1 DataMatrix with ASCII 29 (GS / \\x1d) FNC1 delimiter."""
    # 01 (14 digits) + 17 (6 digits) + 10 (variable batch) + \x1d + 21 (variable serial)
    raw_datamatrix = "01089012345678901728053110BATCH-999\x1d21SER-XYZ-001"
    parsed = parse_identifier(raw_datamatrix)
    assert parsed["product_identifier"] == "08901234567890"
    assert parsed["expiry_date"] == "2028-05-31"
    assert parsed["batch_number"] == "BATCH-999"
    assert parsed["serial_number"] == "SER-XYZ-001"


def test_unparenthesized_gs1_datamatrix_with_caret_delimiter():
    """Verify parsing unparenthesized GS1 DataMatrix with caret (^) delimiter."""
    raw_datamatrix = "01089012345678901728053110BATCH-ABC-123^21SERIAL-777"
    parsed = parse_identifier(raw_datamatrix)
    assert parsed["product_identifier"] == "08901234567890"
    assert parsed["expiry_date"] == "2028-05-31"
    assert parsed["batch_number"] == "BATCH-ABC-123"
    assert parsed["serial_number"] == "SERIAL-777"


# ---------------------------------------------------------------------------
# 2. Comprehensive 6-Factor Deterministic Scoring States
# ---------------------------------------------------------------------------

def test_scoring_all_six_deterministic_states():
    sample_registry = {
        "_id": "med_test_score",
        "product_identifier": "89012345678901",
        "product_name": "Amoxicillin 500 mg Capsules",
        "manufacturer": {"name": "PharmaCore Laboratories"},
        "batch_number": "BATCH-2026-001",
        "serial_number": "SER-PC-000001",
        "expiry_date": "2028-01-09",
        "status": "active",
    }

    # 1. NOT_FOUND
    res_not_found = calculate_score(None, {"product_identifier": "00000000000000"})
    assert res_not_found.status == "NOT_FOUND"
    assert res_not_found.score == 0

    # 2. VERIFIED (Score >= 80)
    res_verified = calculate_score(
        sample_registry,
        {
            "product_identifier": "89012345678901",
            "batch_number": "BATCH-2026-001",
            "manufacturer": "PharmaCore Laboratories",
            "product_name": "Amoxicillin 500 mg Capsules",
            "expiry_date": "2028-01-09",
            "serial_number": "SER-PC-000001",
        },
        serial_seen_before=False,
    )
    assert res_verified.status == "VERIFIED"
    assert res_verified.score == 100

    # 3. SUSPICIOUS (Critical mismatch on batch_number)
    res_suspicious = calculate_score(
        sample_registry,
        {
            "product_identifier": "89012345678901",
            "batch_number": "TAMPERED-BATCH",
            "manufacturer": "PharmaCore Laboratories",
        },
        serial_seen_before=False,
    )
    assert res_suspicious.status == "SUSPICIOUS"
    assert any("Batch number does not match" in issue for issue in res_suspicious.issues)

    # 4. EXPIRED
    expired_registry = dict(sample_registry)
    expired_registry["expiry_date"] = "2022-01-01"
    res_expired = calculate_score(
        expired_registry,
        {
            "product_identifier": "89012345678901",
            "batch_number": "BATCH-2026-001",
            "expiry_date": "2022-01-01",
        },
        serial_seen_before=False,
    )
    assert res_expired.status == "EXPIRED"
    assert any("passed its expiry date" in issue for issue in res_expired.issues)

    # 5. REQUIRES_REVIEW (insufficient verification data: >=3 skipped, <=2 provided)
    res_req_review = calculate_score(
        sample_registry,
        {"product_identifier": "89012345678901"},
        serial_seen_before=False,
    )
    assert res_req_review.status == "REQUIRES_REVIEW"
    assert any("Insufficient verification data" in issue for issue in res_req_review.issues)

    # 6. REVIEW (Score between 50 and 79 without critical mismatch)
    # product_identifier matches (30 earned), product_metadata matches (10 earned),
    # serial_number matches (10 earned), manufacturer skipped (10 earned),
    # batch skipped (10 earned), expiry skipped (5 earned) -> Total earned = 75 / 100 -> score 75.
    # Provided count = 3 (not <=2), skipped count = 3.
    res_review = calculate_score(
        sample_registry,
        {
            "product_identifier": "89012345678901",
            "product_name": "Amoxicillin 500 mg Capsules",
            "serial_number": "SER-PC-000001",
        },
        serial_seen_before=False,
    )
    assert res_review.status == "REVIEW"
    assert 50 <= res_review.score < 80


# ---------------------------------------------------------------------------
# 3. Packaging Upload Boundary Validations
# ---------------------------------------------------------------------------

def test_upload_exceeding_max_batch_count_rejected(client, user_token):
    """Uploading more than 6 packaging images in a batch must return 400 Bad Request."""
    headers = {"Authorization": f"Bearer {user_token}"}
    img_bytes = create_in_memory_image(300, 300)
    files = [("files", (f"img_{i}.jpg", img_bytes, "image/jpeg")) for i in range(7)]

    resp = client.post("/api/image-verification/upload", files=files, headers=headers)
    assert resp.status_code == 400
    assert "Maximum allowable images" in resp.json()["detail"]


def test_upload_oversized_dimensions_rejected(client, user_token):
    """Images exceeding 8000px maximum dimension must return 400 Bad Request."""
    headers = {"Authorization": f"Bearer {user_token}"}
    # Mock or construct an oversized metadata check
    from app.services.image_service import image_service

    oversized_bytes = create_in_memory_image(width=8001, height=500)
    with pytest.raises(ValueError, match="exceed maximum allowed resolution"):
        image_service.save_image(
            content=oversized_bytes,
            user_id="usr_oversize_test",
            batch_id="batch_oversize_test",
            slot="front",
            original_filename="oversized.jpg",
        )


# ---------------------------------------------------------------------------
# 4. End-to-End Verification Pipeline & Persistence Integration
# ---------------------------------------------------------------------------

def test_full_pipeline_multi_angle_upload_to_verification(client, user_token):
    """Full pipeline: 3-slot upload -> vision/OCR analysis -> user confirmation -> deterministic verification -> database record linkage."""
    headers = {"Authorization": f"Bearer {user_token}"}

    # Step 1: Upload front, back, and barcode images
    front = create_in_memory_image(600, 600)
    back = create_in_memory_image(600, 600)
    barcode = create_in_memory_image(600, 600)

    up_resp = client.post(
        "/api/image-verification/upload",
        files=[
            ("files", ("packaging_front.jpg", front, "image/jpeg")),
            ("files", ("packaging_back.jpg", back, "image/jpeg")),
            ("files", ("packaging_barcode.jpg", barcode, "image/jpeg")),
        ],
        data={"slots": ["front", "back", "barcode"]},
        headers=headers,
    )
    assert up_resp.status_code == 201
    up_data = up_resp.json()
    batch_id = up_data["batch_id"]
    assert len(up_data["images"]) == 3

    # Step 2: Request OCR analysis
    anl_resp = client.post(f"/api/image-verification/analyze/{batch_id}", headers=headers)
    assert anl_resp.status_code == 200
    analysis = anl_resp.json()
    analysis_id = analysis["analysis_id"]

    # Step 3: Confirm and execute deterministic verification
    confirm_payload = {
        "analysis_id": analysis_id,
        "batch_id": batch_id,
        "confirmed_fields": {
            "product_name": "Amoxicillin 500mg Capsules",
            "gtin": "89012345678901",
            "batch_number": "BATCH-2026-001",
            "serial_number": f"SER-E2E-{batch_id[:6]}",
            "expiry_date": "2028-01-09",
            "manufacturer": "PharmaCore Laboratories",
        },
    }
    verify_resp = client.post("/api/image-verification/confirm-and-verify", json=confirm_payload, headers=headers)
    assert verify_resp.status_code == 200
    res = verify_resp.json()

    # Step 4: Verify deterministic result invariants
    assert res["status"] == "VERIFIED"
    assert res["confidence_score"] >= 80
    vid = res["verification_id"]

    # Step 5: Verify verifications database collection linkage
    doc = verifications_col().find_one({"_id": vid})
    assert doc is not None
    assert doc.get("image_analysis_id") == analysis_id
    assert doc.get("image_batch_id") == batch_id
    assert doc.get("packaging_condition") is not None
