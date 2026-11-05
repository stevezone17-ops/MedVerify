"""Tests for Secure Medicine Image Verification Backend (Stage 2).

Covers:
- Upload authorization & authentication enforcement
- Input validation (MIME types, magic numbers, dimensions, file size)
- Multi-image batch handling
- Rate limiting protection
- IDOR (Insecure Direct Object Reference) prevention between users
- Admin cross-tenant inspection rights
"""

import io
import pytest
from PIL import Image
from starlette.testclient import TestClient

from app.main import app
from app.db.repositories import profiles_repo
from app.services.auth_service import create_token
from app.services.image_service import image_rate_limiter, image_service


@pytest.fixture(autouse=True)
def reset_image_rate_limiter():
    image_rate_limiter._history.clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def user1_token(client):
    resp = client.post("/api/auth/login", json={"email": "user@medverify.demo", "password": "user123"})
    if resp.status_code == 200:
        return resp.json()["access_token"]
    # Fallback to seeded demo user
    user = profiles_repo.get_by_email("user@medverify.demo")
    return create_token(user["id"] if user else "usr_demo_user", "user")


@pytest.fixture
def user2_token(client):
    # Ensure second user exists in repository
    second_id = "usr_test_second_user"
    if not profiles_repo.get_by_id(second_id):
        profiles_repo.create_user({
            "id": second_id,
            "name": "Second User",
            "email": "second@medverify.demo",
            "role": "user",
            "status": "active",
        })
    return create_token(second_id, "user")


@pytest.fixture
def admin_token(client):
    resp = client.post("/api/auth/login", json={"email": "admin@medverify.demo", "password": "admin123"})
    if resp.status_code == 200:
        return resp.json()["access_token"]
    # Fallback to seeded demo admin
    admin = profiles_repo.get_by_email("admin@medverify.demo")
    return create_token(admin["id"] if admin else "usr_demo_admin", "admin")


def create_test_image_bytes(width: int = 400, height: int = 300, format: str = "JPEG") -> bytes:
    """Helper to generate valid in-memory image bytes."""
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color=(34, 139, 34))
    img.save(buf, format=format)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# 1. Authorization & Authentication
# ---------------------------------------------------------------------------

def test_image_upload_requires_auth(client):
    """Unauthenticated requests must be rejected."""
    img_bytes = create_test_image_bytes()
    resp = client.post(
        "/api/image-verification/upload",
        files=[("files", ("test.jpg", img_bytes, "image/jpeg"))],
    )
    assert resp.status_code in (401, 403)


def test_image_retrieval_requires_auth(client):
    """Unauthenticated requests to get an image must be rejected."""
    resp = client.get("/api/image-verification/image/img_fake123")
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# 2. Content & Dimension Validation
# ---------------------------------------------------------------------------

def test_reject_unsupported_file_type(client, user1_token):
    """Uploading executable, script, or non-image files must return 400 Bad Request."""
    headers = {"Authorization": f"Bearer {user1_token}"}
    fake_payload = b"MZ\x90\x00\x03\x00\x00\x00FakePEFileExecutable"
    resp = client.post(
        "/api/image-verification/upload",
        files=[("files", ("malicious.exe", fake_payload, "application/octet-stream"))],
        headers=headers,
    )
    assert resp.status_code == 400
    assert "Invalid image format" in resp.json()["detail"]


def test_reject_corrupted_image(client, user1_token):
    """Uploading corrupted or truncated image bytes must return 400 Bad Request."""
    headers = {"Authorization": f"Bearer {user1_token}"}
    corrupt_bytes = b"\xff\xd8\xff\xe0" + b"\x00" * 3000  # JPEG header followed by junk
    resp = client.post(
        "/api/image-verification/upload",
        files=[("files", ("corrupt.jpg", corrupt_bytes, "image/jpeg"))],
        headers=headers,
    )
    assert resp.status_code == 400
    assert "corrupted" in resp.json()["detail"].lower() or "invalid" in resp.json()["detail"].lower()


def test_reject_undersized_dimensions(client, user1_token):
    """Images below 200x200 px must be rejected for OCR readability."""
    headers = {"Authorization": f"Bearer {user1_token}"}
    tiny_img = create_test_image_bytes(width=64, height=64)
    resp = client.post(
        "/api/image-verification/upload",
        files=[("files", ("tiny.jpg", tiny_img, "image/jpeg"))],
        headers=headers,
    )
    assert resp.status_code == 400
    assert "below the minimum requirement" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# 3. Successful Multi-Image Upload & Batch Handling
# ---------------------------------------------------------------------------

def test_successful_multi_image_upload(client, user1_token):
    """Valid packaging images are persisted and associated with the user."""
    headers = {"Authorization": f"Bearer {user1_token}"}
    front_bytes = create_test_image_bytes(width=800, height=600, format="JPEG")
    back_bytes = create_test_image_bytes(width=800, height=600, format="PNG")

    resp = client.post(
        "/api/image-verification/upload",
        files=[
            ("files", ("front.jpg", front_bytes, "image/jpeg")),
            ("files", ("back.png", back_bytes, "image/png")),
        ],
        data={"slots": ["front", "back"]},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["uploaded_count"] == 2
    assert len(data["user_id"]) > 0
    assert len(data["images"]) == 2

    img1 = data["images"][0]
    assert img1["slot"] == "front"
    assert img1["mime_type"] == "image/jpeg"
    assert img1["width"] == 800
    assert img1["height"] == 600

    img2 = data["images"][1]
    assert img2["slot"] == "back"
    assert img2["mime_type"] == "image/png"


# ---------------------------------------------------------------------------
# 4. Strict IDOR Protection & Admin Access
# ---------------------------------------------------------------------------

def test_idor_protection_prevents_unauthorized_access(client, user1_token, user2_token, admin_token):
    """User B must NOT be able to view or download User A's uploaded medicine image."""
    # Step 1: User 1 uploads an image
    headers_u1 = {"Authorization": f"Bearer {user1_token}"}
    img_bytes = create_test_image_bytes(width=500, height=500, format="JPEG")
    upload_resp = client.post(
        "/api/image-verification/upload",
        files=[("files", ("secret_prescription.jpg", img_bytes, "image/jpeg"))],
        data={"slots": ["front"]},
        headers=headers_u1,
    )
    assert upload_resp.status_code == 201
    image_id = upload_resp.json()["images"][0]["image_id"]

    # Step 2: User 1 (owner) accesses it -> Success (200)
    resp_owner = client.get(f"/api/image-verification/image/{image_id}", headers=headers_u1)
    assert resp_owner.status_code == 200
    assert resp_owner.headers["content-type"] == "image/jpeg"
    assert len(resp_owner.content) == len(img_bytes)

    # Step 3: User 2 attempts IDOR access -> Forbidden (403)
    headers_u2 = {"Authorization": f"Bearer {user2_token}"}
    resp_attacker = client.get(f"/api/image-verification/image/{image_id}", headers=headers_u2)
    assert resp_attacker.status_code == 403
    assert "Access denied" in resp_attacker.json()["detail"]

    # Step 4: Admin accesses it -> Authorized (200)
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    resp_admin = client.get(f"/api/image-verification/image/{image_id}", headers=headers_admin)
    assert resp_admin.status_code == 200


# ---------------------------------------------------------------------------
# 5. Rate Limiting Protection
# ---------------------------------------------------------------------------

def test_image_upload_rate_limiting(client, user1_token):
    """Rapid repeated requests exceed rate limit and return 429."""
    headers = {"Authorization": f"Bearer {user1_token}"}
    img_bytes = create_test_image_bytes(width=300, height=300)

    # Exceed limit
    image_rate_limiter.max_requests = 3
    for _ in range(3):
        r = client.post(
            "/api/image-verification/upload",
            files=[("files", ("test.jpg", img_bytes, "image/jpeg"))],
            headers=headers,
        )
        assert r.status_code == 201

    # 4th request must be rejected
    r_blocked = client.post(
        "/api/image-verification/upload",
        files=[("files", ("test.jpg", img_bytes, "image/jpeg"))],
        headers=headers,
    )
    assert r_blocked.status_code == 429
    assert "Rate limit exceeded" in r_blocked.json()["detail"]


# ---------------------------------------------------------------------------
# 6. Gemini Image Understanding & OCR (Stage 3 Tests)
# ---------------------------------------------------------------------------

def test_image_analysis_endpoint_extracts_structured_fields(client, user1_token):
    """Uploaded packaging batch undergoes OCR and vision extraction."""
    headers = {"Authorization": f"Bearer {user1_token}"}
    front_bytes = create_test_image_bytes(width=600, height=500, format="JPEG")
    back_bytes = create_test_image_bytes(width=600, height=500, format="JPEG")

    # 1. Upload multi-angle batch
    upload_resp = client.post(
        "/api/image-verification/upload",
        files=[
            ("files", ("amox_front.jpg", front_bytes, "image/jpeg")),
            ("files", ("amox_back.jpg", back_bytes, "image/jpeg")),
        ],
        data={"slots": ["front", "back"]},
        headers=headers,
    )
    assert upload_resp.status_code == 201
    batch_id = upload_resp.json()["batch_id"]

    # 2. Run analysis
    anl_resp = client.post(f"/api/image-verification/analyze/{batch_id}", headers=headers)
    assert anl_resp.status_code == 200
    data = anl_resp.json()

    assert data["batch_id"] == batch_id
    assert "analysis_id" in data

    # Medicine name and fields extracted with confidence and method
    assert data["medicine_name"] is not None
    assert data["medicine_name"]["key"] == "medicine_name"
    assert data["medicine_name"]["confidence"] > 0.0
    assert data["medicine_name"]["extraction_method"] in ("ocr", "visual_interpretation")

    # Missing fields MUST remain null (e.g. serial_number was not printed in test image)
    assert data["serial_number"] is None or data["serial_number"]["value"] is None

    # Packaging condition structure
    assert "packaging_condition" in data
    assert "torn_packaging" in data["packaging_condition"]
    assert "damaged_carton" in data["packaging_condition"]
    assert "summary" in data["packaging_condition"]

    # Verification status must NOT be generated by image analysis (reserved for deterministic engine)
    assert "status" not in data or data.get("status") not in ("VERIFIED", "COUNTERFEIT")


def test_image_analysis_idor_protection(client, user1_token, user2_token):
    """User 2 must not be able to trigger or read User 1's image analysis."""
    headers_u1 = {"Authorization": f"Bearer {user1_token}"}
    img_bytes = create_test_image_bytes(width=400, height=400)

    # User 1 creates batch
    up_resp = client.post(
        "/api/image-verification/upload",
        files=[("files", ("box.jpg", img_bytes, "image/jpeg"))],
        headers=headers_u1,
    )
    batch_id = up_resp.json()["batch_id"]

    # User 1 analyzes it
    anl_resp = client.post(f"/api/image-verification/analyze/{batch_id}", headers=headers_u1)
    assert anl_resp.status_code == 200
    analysis_id = anl_resp.json()["analysis_id"]

    # User 2 attempts to analyze User 1's batch -> Forbidden or Not Found
    headers_u2 = {"Authorization": f"Bearer {user2_token}"}
    anl_attacker = client.post(f"/api/image-verification/analyze/{batch_id}", headers=headers_u2)
    assert anl_attacker.status_code in (403, 404)

    # User 2 attempts to retrieve User 1's analysis record -> Forbidden
    get_attacker = client.get(f"/api/image-verification/analysis/{analysis_id}", headers=headers_u2)
    assert get_attacker.status_code == 403


# ---------------------------------------------------------------------------
# 7. Barcode Decoding & GS1 Data Extraction (Stage 4 Tests)
# ---------------------------------------------------------------------------

def test_gs1_datamatrix_parsing_and_mismatch_detection():
    """Verify GS1 parser extracts AIs and detects mismatches against printed packaging."""
    from app.services.qr_parser import parse_identifier, compare_ocr_with_barcode

    # Case A: Standard parenthesized GS1 DataMatrix
    raw_gs1 = "(01)08901234567890(17)280109(10)BATCH-2026-001(21)SER-PC-000001"
    parsed = parse_identifier(raw_gs1)
    assert parsed.get("product_identifier") == "08901234567890"
    assert parsed.get("batch_number") == "BATCH-2026-001"
    assert parsed.get("expiry_date") == "2028-01-09"
    assert parsed.get("serial_number") == "SER-PC-000001"

    # Case B: Unparenthesized raw GS1 element string
    raw_unparenthesized = "01089012345678901728010910BATCH-2026-001^21SER-PC-000001"
    parsed_unparen = parse_identifier(raw_unparenthesized)
    assert parsed_unparen.get("product_identifier") == "08901234567890"
    assert parsed_unparen.get("batch_number") == "BATCH-2026-001"
    assert parsed_unparen.get("expiry_date") == "2028-01-09"
    assert parsed_unparen.get("serial_number") == "SER-PC-000001"

    # Case C: Perfect alignment between OCR and Barcode
    ocr_matching = {
        "gtin": "08901234567890",
        "batch_number": "BATCH-2026-001",
        "expiry_date": "2028-01-09",
        "serial_number": "SER-PC-000001",
    }
    mismatch_found, mismatches = compare_ocr_with_barcode(ocr_matching, parsed)
    assert mismatch_found is False
    assert len(mismatches) == 0

    # Case D: Mismatched Batch and Expiry
    ocr_tampered = {
        "gtin": "08901234567890",
        "batch_number": "FAKE-BATCH-999",
        "expiry_date": "2029-12-31",
        "serial_number": "SER-PC-000001",
    }
    mismatch_tampered, tampered_details = compare_ocr_with_barcode(ocr_tampered, parsed)
    assert mismatch_tampered is True
    assert len(tampered_details) >= 2
    assert any("Batch number mismatch" in d for d in tampered_details)
    assert any("Expiration date mismatch" in d for d in tampered_details)


def test_existing_live_scanner_remains_intact(client, user1_token):
    """Verify that existing deterministic scanner endpoint POST /api/verify remains intact."""
    headers = {"Authorization": f"Bearer {user1_token}"}
    payload = {
        "identifier": "(01)89012345678901(10)BATCH-2026-001(17)280109(21)SER-PC-000001",
        "method": "QR",
    }
    resp = client.post("/api/verify", json=payload, headers=headers)
    assert resp.status_code == 200
    res_data = resp.json()
    assert res_data["status"] == "VERIFIED"
    assert res_data["confidence_score"] >= 80
    assert len(res_data["checks"]) >= 4


# ---------------------------------------------------------------------------
# 8. Deterministic 6-Factor Verification Engine Integration (Stage 5 Tests)
# ---------------------------------------------------------------------------

def test_confirm_and_verify_registered_product(client, user1_token):
    """Submitting confirmed details for a registered medicine produces VERIFIED status."""
    headers = {"Authorization": f"Bearer {user1_token}"}
    img_bytes = create_test_image_bytes(width=500, height=500)

    # 1. Upload & analyze
    up = client.post(
        "/api/image-verification/upload",
        files=[("files", ("box.jpg", img_bytes, "image/jpeg"))],
        headers=headers,
    )
    batch_id = up.json()["batch_id"]
    anl = client.post(f"/api/image-verification/analyze/{batch_id}", headers=headers)
    analysis_id = anl.json()["analysis_id"]

    # 2. Confirm and submit to authoritative 6-factor engine
    confirm_payload = {
        "analysis_id": analysis_id,
        "batch_id": batch_id,
        "confirmed_fields": {
            "product_name": "Amoxicillin 500mg Capsules",
            "gtin": "89012345678901",
            "batch_number": "BATCH-2026-001",
            "serial_number": "SER-PC-000001",
            "expiry_date": "2028-01-09",
            "manufacturer": "PharmaCore Laboratories",
        },
    }
    verify_resp = client.post("/api/image-verification/confirm-and-verify", json=confirm_payload, headers=headers)
    assert verify_resp.status_code == 200
    res = verify_resp.json()

    # The deterministic engine returns VERIFIED
    assert res["status"] == "VERIFIED"
    assert res["confidence_score"] >= 80
    assert res["verification"]["matched_medicine_id"] is not None
    assert len(res["verification"]["checks"]) >= 4


def test_confirm_and_verify_unregistered_product(client, user1_token):
    """Submitting an unregistered product identifier returns NOT_FOUND status."""
    headers = {"Authorization": f"Bearer {user1_token}"}
    img_bytes = create_test_image_bytes(width=500, height=500)

    up = client.post(
        "/api/image-verification/upload",
        files=[("files", ("unknown.jpg", img_bytes, "image/jpeg"))],
        headers=headers,
    )
    batch_id = up.json()["batch_id"]
    anl = client.post(f"/api/image-verification/analyze/{batch_id}", headers=headers)
    analysis_id = anl.json()["analysis_id"]

    confirm_payload = {
        "analysis_id": analysis_id,
        "batch_id": batch_id,
        "confirmed_fields": {
            "gtin": "99999999999999",
            "batch_number": "UNKNOWN-BATCH",
        },
    }
    verify_resp = client.post("/api/image-verification/confirm-and-verify", json=confirm_payload, headers=headers)
    assert verify_resp.status_code == 200
    res = verify_resp.json()

    # Not found in registry
    assert res["status"] == "NOT_FOUND"
    assert res["confidence_score"] == 0


def test_confirm_and_verify_expired_product(client, user1_token):
    """Submitting confirmed details for an expired registered product returns EXPIRED status."""
    headers = {"Authorization": f"Bearer {user1_token}"}
    img_bytes = create_test_image_bytes(width=500, height=500)

    up = client.post(
        "/api/image-verification/upload",
        files=[("files", ("expired.jpg", img_bytes, "image/jpeg"))],
        headers=headers,
    )
    batch_id = up.json()["batch_id"]
    anl = client.post(f"/api/image-verification/analyze/{batch_id}", headers=headers)
    analysis_id = anl.json()["analysis_id"]

    # GTIN 89012345678908 has registered expiry 2025-07-09 (expired) and batch BATCH-2025-012
    confirm_payload = {
        "analysis_id": analysis_id,
        "batch_id": batch_id,
        "confirmed_fields": {
            "product_name": "Ibuprofen 400 mg Tablets",
            "gtin": "89012345678908",
            "batch_number": "BATCH-2025-012",
            "expiry_date": "2025-07-09",
        },
    }
    verify_resp = client.post("/api/image-verification/confirm-and-verify", json=confirm_payload, headers=headers)
    assert verify_resp.status_code == 200
    res = verify_resp.json()

    assert res["status"] == "EXPIRED"


def test_confirm_and_verify_duplicate_serial(client, user1_token, user2_token):
    """Submitting a duplicated serial number across users triggers reuse check and SUSPICIOUS status."""
    headers1 = {"Authorization": f"Bearer {user1_token}"}
    headers2 = {"Authorization": f"Bearer {user2_token}"}
    img_bytes = create_test_image_bytes(width=500, height=500)

    # First verification by User 1
    up1 = client.post(
        "/api/image-verification/upload",
        files=[("files", ("p1.jpg", img_bytes, "image/jpeg"))],
        headers=headers1,
    )
    batch1 = up1.json()["batch_id"]
    anl1 = client.post(f"/api/image-verification/analyze/{batch1}", headers=headers1)

    r1 = client.post(
        "/api/image-verification/confirm-and-verify",
        json={
            "analysis_id": anl1.json()["analysis_id"],
            "batch_id": batch1,
            "confirmed_fields": {
                "gtin": "89012345678901",
                "batch_number": "BATCH-2026-001",
                "serial_number": "SER-DUPE-IMAGE-TEST",
                "expiry_date": "2028-01-09",
            },
        },
        headers=headers1,
    )
    assert r1.status_code == 200

    # Second verification with exact same serial by User 2 (triggers cross-user duplicate reuse)
    up2 = client.post(
        "/api/image-verification/upload",
        files=[("files", ("p2.jpg", img_bytes, "image/jpeg"))],
        headers=headers2,
    )
    batch2 = up2.json()["batch_id"]
    anl2 = client.post(f"/api/image-verification/analyze/{batch2}", headers=headers2)

    resp2 = client.post(
        "/api/image-verification/confirm-and-verify",
        json={
            "analysis_id": anl2.json()["analysis_id"],
            "batch_id": batch2,
            "confirmed_fields": {
                "gtin": "89012345678901",
                "batch_number": "BATCH-2026-001",
                "serial_number": "SER-DUPE-IMAGE-TEST",
                "expiry_date": "2028-01-09",
            },
        },
        headers=headers2,
    )
    assert resp2.status_code == 200
    res2 = resp2.json()

    # Reuse check must be FAIL and status SUSPICIOUS
    assert res2["status"] == "SUSPICIOUS"
    checks = res2["verification"]["checks"]
    reuse_check = next((c for c in checks if c["field"] == "serial_uniqueness"), None)
    assert reuse_check is not None
    assert reuse_check["status"] == "FAIL"


# ---------------------------------------------------------------------------
# 9. Packaging Condition & Image Assessment (Stage 6 Tests)
# ---------------------------------------------------------------------------

def test_packaging_condition_clear_and_distinction_notice(client, user1_token):
    """Clean packaging results in NORMAL condition and carries the distinction disclaimer."""
    headers = {"Authorization": f"Bearer {user1_token}"}
    img_bytes1 = create_test_image_bytes(width=600, height=400)
    img_bytes2 = create_test_image_bytes(width=600, height=400)

    # Upload multi-angle images
    up = client.post(
        "/api/image-verification/upload",
        files=[
            ("files", ("front.jpg", img_bytes1, "image/jpeg")),
            ("files", ("back.jpg", img_bytes2, "image/jpeg")),
        ],
        data={"slots": ["front", "back"]},
        headers=headers,
    )
    batch_id = up.json()["batch_id"]
    anl = client.post(f"/api/image-verification/analyze/{batch_id}", headers=headers)
    assert anl.status_code == 200
    data = anl.json()

    pkg = data["packaging_condition"]
    assert pkg["photo_consistency"] == "CONSISTENT"
    assert pkg["defect_count"] >= 0
    assert "distinction_notice" in pkg
    assert "Verification status is evaluated strictly by the deterministic" in pkg["distinction_notice"]


def test_packaging_condition_incomplete_single_photo(client, user1_token):
    """Uploading only a single photo flags INCOMPLETE_COVERAGE in packaging condition."""
    headers = {"Authorization": f"Bearer {user1_token}"}
    img_bytes = create_test_image_bytes(width=600, height=400)

    up = client.post(
        "/api/image-verification/upload",
        files=[("files", ("single_front.jpg", img_bytes, "image/jpeg"))],
        data={"slots": ["front"]},
        headers=headers,
    )
    batch_id = up.json()["batch_id"]
    anl = client.post(f"/api/image-verification/analyze/{batch_id}", headers=headers)
    assert anl.status_code == 200
    data = anl.json()

    pkg = data["packaging_condition"]
    assert pkg["photo_consistency"] == "INCOMPLETE_COVERAGE"
    assert "Single photograph provided" in pkg["summary"] or "single" in pkg["summary"].lower()


def test_packaging_condition_tampering_warning_logic():
    """Verify condition assessment flags defects and sets TAMPER_WARNING without claiming counterfeiting."""
    from app.services.image_analysis_service import image_analysis_service
    from app.schemas.image_verification import UploadedImageMetadata

    mock_metas = [
        UploadedImageMetadata(
            image_id="img_1",
            user_id="u1",
            slot="front",
            file_name="f.jpg",
            mime_type="image/jpeg",
            file_size=50000,
            width=800,
            height=600,
            storage_path="path/1",
        ),
        UploadedImageMetadata(
            image_id="img_2",
            user_id="u1",
            slot="back",
            file_name="b.jpg",
            mime_type="image/jpeg",
            file_size=50000,
            width=800,
            height=600,
            storage_path="path/2",
        ),
    ]

    # Raw AI output with torn flap and broken seal
    damaged_raw = {
        "packaging_condition": {
            "torn_packaging": True,
            "broken_seal": True,
            "summary": "Torn carton flap and broken tamper seal observed on packaging.",
            "confidence": 0.95,
        }
    }
    result = image_analysis_service._build_and_persist_result("batch_test_dmg", "u1", mock_metas, damaged_raw)
    pkg = result.packaging_condition
    assert pkg.defect_count >= 2
    assert pkg.broken_seal is True
    assert pkg.torn_packaging is True
    assert pkg.assessment_status == "TAMPER_WARNING"
    assert "deterministic" in pkg.distinction_notice


def test_stage8_end_to_end_verification_flow_and_security_invariants(client, user1_token, user2_token):
    """End-to-end integration test verifying the complete Stage 8 flow and security invariants:
    1. Unauthenticated requests are rejected.
    2. Multi-slot image upload.
    3. User data isolation (IDOR protection): User 2 cannot access User 1's batch or analysis.
    4. Image analysis and GS1/OCR extraction.
    5. Final authoritative confirmation and verification through deterministic engine.
    6. Activity ledger reflects IMAGE_VERIFICATION with user isolation.
    """
    # 1. Unauthenticated requests rejected
    unauth_resp = client.get("/api/image-verification/batch/batch_fake_unauth")
    assert unauth_resp.status_code == 401

    # 2. Upload packaging images
    img1 = create_test_image_bytes(800, 600)
    img2 = create_test_image_bytes(800, 600)
    upload_resp = client.post(
        "/api/image-verification/upload",
        headers={"Authorization": f"Bearer {user1_token}"},
        files=[
            ("files", ("box_front.jpg", img1, "image/jpeg")),
            ("files", ("box_barcode.jpg", img2, "image/jpeg")),
        ],
        data={"slots": ["front", "barcode"]},
    )
    assert upload_resp.status_code == 201
    upload_data = upload_resp.json()
    batch_id = upload_data["batch_id"]
    assert len(upload_data["images"]) == 2

    # 3. IDOR protection: User 2 cannot access User 1's batch
    idor_batch_resp = client.get(
        f"/api/image-verification/batch/{batch_id}",
        headers={"Authorization": f"Bearer {user2_token}"},
    )
    assert idor_batch_resp.status_code == 403

    # 4. User 1 analyzes the batch
    analyze_resp = client.post(
        f"/api/image-verification/analyze/{batch_id}",
        headers={"Authorization": f"Bearer {user1_token}"},
    )
    assert analyze_resp.status_code == 200
    analysis = analyze_resp.json()
    analysis_id = analysis["analysis_id"]

    # IDOR protection on analysis
    idor_analysis_resp = client.get(
        f"/api/image-verification/analysis/{analysis_id}",
        headers={"Authorization": f"Bearer {user2_token}"},
    )
    assert idor_analysis_resp.status_code == 403

    # 5. Confirm and verify against authoritative engine with registered medicine
    confirm_resp = client.post(
        "/api/image-verification/confirm-and-verify",
        headers={"Authorization": f"Bearer {user1_token}"},
        json={
            "analysis_id": analysis_id,
            "batch_id": batch_id,
            "confirmed_fields": {
                "product_name": "Amoxicillin 500mg Capsules",
                "manufacturer": "PharmaCore Laboratories",
                "batch_number": "BATCH-2026-001",
                "expiry_date": "2028-01-09",
                "serial_number": f"SER-PC-E2E-{batch_id[:6]}",
                "gtin": "89012345678901",
            },
        },
    )
    assert confirm_resp.status_code == 200
    result = confirm_resp.json()
    assert result["verification_id"].startswith("vrf_")
    assert result["status"] == "VERIFIED"
    assert result["verification"]["verification_method"] == "IMAGE_VERIFICATION"
    assert "mandatory_disclaimer" in result["image_analysis"]
    assert "Image analysis and packaging verification cannot guarantee medicine authenticity" in result["image_analysis"]["mandatory_disclaimer"]

    # 6. Verify ledger / personal activity includes IMAGE_VERIFICATION
    activity_resp = client.get(
        "/api/user/history",
        headers={"Authorization": f"Bearer {user1_token}"},
    )
    assert activity_resp.status_code == 200
    items = activity_resp.json()["items"]
    matching = [it for it in items if it["verification_id"] == result["verification_id"]]
    assert len(matching) == 1
    assert matching[0]["verification_method"] == "IMAGE_VERIFICATION"





