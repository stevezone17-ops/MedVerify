"""Tests for strict Admin vs User RBAC and access control separation."""

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


@pytest.fixture(scope="module")
def admin_token():
    """Retrieve an admin JWT token."""
    res = client.post(
        "/api/auth/login",
        json={"email": "admin@medverify.demo", "password": "admin123"},
    )
    assert res.status_code == 200, f"Admin login failed: {res.text}"
    return res.json()["access_token"]


@pytest.fixture(scope="module")
def user_a_token():
    """Register or log in user A."""
    email = "usera@medverify.demo"
    password = "password123"
    login_res = client.post("/api/auth/login", json={"email": email, "password": password})
    if login_res.status_code == 200:
        return login_res.json()["access_token"]
    
    reg_res = client.post(
        "/api/auth/register",
        json={"name": "User Alpha", "email": email, "password": password, "role": "user"},
    )
    assert reg_res.status_code == 201, f"Registration failed: {reg_res.text}"
    return reg_res.json()["access_token"]


@pytest.fixture(scope="module")
def user_b_token():
    """Register or log in user B."""
    email = "userb@medverify.demo"
    password = "password123"
    login_res = client.post("/api/auth/login", json={"email": email, "password": password})
    if login_res.status_code == 200:
        return login_res.json()["access_token"]
    
    reg_res = client.post(
        "/api/auth/register",
        json={"name": "User Beta", "email": email, "password": password, "role": "user"},
    )
    assert reg_res.status_code == 201, f"Registration failed: {reg_res.text}"
    return reg_res.json()["access_token"]


def test_unauthenticated_cannot_access_admin_endpoints():
    """Verify 401 Unauthorized for unauthenticated requests to admin endpoints."""
    endpoints = [
        ("GET", "/api/admin/analytics"),
        ("GET", "/api/admin/medicines"),
        ("GET", "/api/admin/users"),
        ("GET", "/api/admin/audit"),
        ("GET", "/api/admin/system-health"),
        ("GET", "/api/admin/reports"),
        ("GET", "/api/verifications"),
    ]
    for method, path in endpoints:
        res = client.request(method, path)
        assert res.status_code == 401, f"Expected 401 for {method} {path}, got {res.status_code}"


def test_regular_user_forbidden_from_admin_endpoints(user_a_token):
    """Verify 403 Forbidden when an ordinary user attempts to access any admin endpoint."""
    headers = {"Authorization": f"Bearer {user_a_token}"}
    admin_endpoints = [
        ("GET", "/api/admin/analytics"),
        ("GET", "/api/admin/medicines"),
        ("POST", "/api/admin/medicines"),
        ("GET", "/api/admin/users"),
        ("GET", "/api/admin/audit"),
        ("GET", "/api/admin/system-health"),
        ("GET", "/api/admin/reports"),
        ("POST", "/api/admin/ai/analyze"),
        ("GET", "/api/verifications"),
    ]
    for method, path in admin_endpoints:
        res = client.request(method, path, headers=headers)
        assert res.status_code == 403, (
            f"Security violation! User was not forbidden (403) from {method} {path}. Status: {res.status_code}"
        )


def test_admin_can_access_admin_endpoints(admin_token):
    """Verify 200 OK when an admin accesses admin endpoints."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    res = client.get("/api/admin/analytics", headers=headers)
    assert res.status_code == 200
    assert "total_verifications" in res.json()

    res = client.get("/api/admin/system-health", headers=headers)
    assert res.status_code == 200
    assert "overall_status" in res.json()

    res = client.get("/api/admin/audit", headers=headers)
    assert res.status_code == 200
    assert "items" in res.json()



def test_user_history_scoped_to_user(user_a_token, user_b_token):
    """Verify that /api/user/history returns strictly the authenticated user's verifications."""
    # User A performs a verification
    headers_a = {"Authorization": f"Bearer {user_a_token}"}
    v_res = client.post(
        "/api/verify",
        json={"identifier": "08901072000018", "batch_number": "AUG2401", "method": "QR"},
        headers=headers_a,
    )
    assert v_res.status_code == 200
    v_id = v_res.json()["verification_id"]

    # User A checks their history
    res_a = client.get("/api/user/history", headers=headers_a)
    assert res_a.status_code == 200
    items_a = res_a.json()["items"]
    ids_a = [item["verification_id"] for item in items_a]
    assert v_id in ids_a

    # User B checks their history - must NOT contain User A's verification
    headers_b = {"Authorization": f"Bearer {user_b_token}"}
    res_b = client.get("/api/user/history", headers=headers_b)
    assert res_b.status_code == 200
    items_b = res_b.json()["items"]
    ids_b = [item["verification_id"] for item in items_b]
    assert v_id not in ids_b, "IDOR: User B can see User A's verification in history!"



def test_verification_idor_access_control(user_a_token, user_b_token, admin_token):
    """Verify that single verification lookup enforces strict ownership access control."""
    headers_a = {"Authorization": f"Bearer {user_a_token}"}
    v_res = client.post(
        "/api/verify",
        json={"identifier": "08901072000018", "batch_number": "AUG2401", "method": "MANUAL"},
        headers=headers_a,
    )
    assert v_res.status_code == 200
    v_id = v_res.json()["verification_id"]

    # 1. Owner (User A) can view it
    owner_res = client.get(f"/api/verifications/{v_id}", headers=headers_a)
    assert owner_res.status_code == 200
    assert owner_res.json()["verification_id"] == v_id

    # 2. Other user (User B) is forbidden (403)
    headers_b = {"Authorization": f"Bearer {user_b_token}"}
    other_res = client.get(f"/api/verifications/{v_id}", headers=headers_b)
    assert other_res.status_code == 403, f"Expected 403 for unauthorized user, got {other_res.status_code}"

    # 3. Unauthenticated request is 401
    anon_res = client.get(f"/api/verifications/{v_id}")
    assert anon_res.status_code == 401, f"Expected 401 for anonymous access, got {anon_res.status_code}"

    # 4. Admin can view it (200)
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    admin_res = client.get(f"/api/verifications/{v_id}", headers=headers_admin)
    assert admin_res.status_code == 200
    assert admin_res.json()["verification_id"] == v_id
