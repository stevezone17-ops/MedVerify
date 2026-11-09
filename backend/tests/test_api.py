"""Integration tests for FastAPI endpoints."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import ensure_indexes

client = TestClient(app)


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    ensure_indexes()


def test_health_check():
    for path in ("/health", "/api/health"):
        response = client.get(path)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ("ok", "degraded")
        assert "version" in data
        assert "database" in data


def test_health_live():
    for path in ("/health/live", "/api/health/live"):
        response = client.get(path)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "alive"
        assert "uptime_seconds" in data
        assert "timestamp" in data


def test_health_ready():
    for path in ("/health/ready", "/api/health/ready"):
        response = client.get(path)
        # In test environment, returns 200 if MongoDB is up, or 503 with structured payload if down
        assert response.status_code in (200, 503)
        data = response.json()
        assert data["status"] in ("ready", "unready")
        assert "database" in data
        assert "status" in data["database"]


def test_verification_service_endpoint():
    for path in ("/api/verify", "/api/verification"):
        response = client.get(path)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "verification-service"


def test_verify_known_medicine():
    response = client.post(
        "/api/verify",
        json={"identifier": "89012345678901"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "confidence_score" in data
    assert "checks" in data
    assert "medicine" in data
    assert data["medicine"]["product_identifier"] == "89012345678901"


def test_verify_unknown_medicine():
    response = client.post(
        "/api/verify",
        json={"identifier": "00000000000000"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "NOT_FOUND"
    assert data["confidence_score"] == 0
    assert data["medicine"] is None


def test_list_medicines():
    response = client.get("/api/medicines?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0


def test_auth_login_admin():
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@medverify.demo", "password": "admin123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["role"] == "admin"


def test_auth_invalid_credentials():
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@medverify.demo", "password": "wrongpassword"},
    )
    assert response.status_code == 401


def test_admin_analytics_with_token():
    # Login as admin
    login_res = client.post(
        "/api/auth/login",
        json={"email": "admin@medverify.demo", "password": "admin123"},
    )
    token = login_res.json()["access_token"]

    # Access analytics
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/admin/analytics", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "total_verifications" in data
    assert "status_breakdown" in data


def test_auth_login_user():
    response = client.post(
        "/api/auth/login",
        json={"email": "user@medverify.demo", "password": "user123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["role"] == "user"


def test_auth_me_persistence():
    login_res = client.post(
        "/api/auth/login",
        json={"email": "user@medverify.demo", "password": "user123"},
    )
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me_res = client.get("/api/auth/me", headers=headers)
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["email"] == "user@medverify.demo"
    assert me_data["role"] == "user"


def test_verify_alias_post():
    response = client.post(
        "/api/verification",
        json={"identifier": "89012345678901"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "confidence_score" in data
    assert data["medicine"]["product_identifier"] == "89012345678901"
