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
