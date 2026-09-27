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
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data


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
