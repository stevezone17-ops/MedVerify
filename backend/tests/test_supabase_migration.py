"""Comprehensive integration tests for MedVerify Supabase backend migration."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.repositories import medicines_repo, verifications_repo, profiles_repo
from app.services.verification_engine import verify_medicine
from app.schemas.verification import VerifyRequest

client = TestClient(app)


# ---------------------------------------------------------------------------
# 1. GS1 & Scanner Regression Tests
# ---------------------------------------------------------------------------

def test_gs1_canonical_regression_payload():
    """Verify that the production payload returns the verified registered medicine."""
    payload = "(01)89012345678901(10)BATCH-2026-001(17)280109(21)SER-PC-000001"
    req = VerifyRequest(identifier=payload)
    res = verify_medicine(req)

    assert res.status == "VERIFIED"
    assert res.confidence_score >= 80
    assert res.medicine is not None
    assert res.medicine["product_name"] == "Amoxicillin 500 mg Capsules"
    assert res.medicine["manufacturer"] == "PharmaCore Laboratories"
    assert res.medicine["batch_number"] == "BATCH-2026-001"
    assert res.medicine["serial_number"] == "SER-PC-000001"
    assert res.created_at is not None


def test_expired_medicine_scenario():
    """Verify that an expired medicine is flagged for review."""
    req = VerifyRequest(identifier="89012345678908")
    res = verify_medicine(req)

    assert res.status == "REVIEW"
    assert any("expiry" in issue.lower() or "expired" in issue.lower() for issue in res.issues)


def test_unregistered_medicine_scenario():
    """Verify that an unknown GTIN is flagged NOT_FOUND with 0 confidence."""
    req = VerifyRequest(identifier="99999999999999")
    res = verify_medicine(req)

    assert res.status == "NOT_FOUND"
    assert res.confidence_score == 0
    assert res.medicine is None


def test_suspicious_batch_mismatch():
    """Verify that a counterfeit batch triggers SUSPICIOUS status."""
    payload = '{"pid":"89012345678902","batch":"FAKE-BATCH-999","serial":"SER-MS-000012"}'
    req = VerifyRequest(identifier=payload)
    res = verify_medicine(req)

    assert res.status == "SUSPICIOUS"
    assert any("batch" in issue.lower() for issue in res.issues)


# ---------------------------------------------------------------------------
# 2. Database & Repository Layer Tests
# ---------------------------------------------------------------------------

def test_medicines_repository_lookup():
    """Test medicine repository GTIN lookup."""
    med = medicines_repo.get_by_gtin("89012345678901")
    assert med is not None
    assert med["product_name"] == "Amoxicillin 500 mg Capsules"
    assert med["product_identifier"] == "89012345678901"


def test_verifications_history_and_sorting():
    """Test verification history ordering by created_at DESC."""
    history, total = verifications_repo.list_history(page=1, limit=5)
    assert total >= 0
    assert isinstance(history, list)

    if len(history) >= 2:
        assert history[0]["created_at"] is not None
        assert history[1]["created_at"] is not None
        # Newest first
        assert history[0]["created_at"] >= history[1]["created_at"]


# ---------------------------------------------------------------------------
# 3. Authentication & RBAC Isolation Tests
# ---------------------------------------------------------------------------

def test_normal_user_cannot_access_admin_endpoints():
    """Verify that a normal user is denied access to admin command center."""
    login_res = client.post(
        "/api/auth/login",
        json={"email": "user@medverify.demo", "password": "user123"},
    )
    assert login_res.status_code == 200
    user_token = login_res.json()["access_token"]

    # Try admin analytics
    headers = {"Authorization": f"Bearer {user_token}"}
    admin_res = client.get("/api/admin/analytics", headers=headers)
    assert admin_res.status_code == 403


def test_admin_can_access_admin_endpoints():
    """Verify that an admin user can access admin analytics."""
    login_res = client.post(
        "/api/auth/login",
        json={"email": "admin@medverify.demo", "password": "admin123"},
    )
    assert login_res.status_code == 200
    admin_token = login_res.json()["access_token"]

    headers = {"Authorization": f"Bearer {admin_token}"}
    admin_res = client.get("/api/admin/analytics", headers=headers)
    assert admin_res.status_code == 200
    assert "total_verifications" in admin_res.json()


# ---------------------------------------------------------------------------
# 4. User Scoped APIs & Feature Modules
# ---------------------------------------------------------------------------

def test_user_history_and_stats():
    """Test user personal history and statistics endpoints."""
    login_res = client.post(
        "/api/auth/login",
        json={"email": "user@medverify.demo", "password": "user123"},
    )
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    stats_res = client.get("/api/user/stats", headers=headers)
    assert stats_res.status_code == 200
    assert "total_verifications" in stats_res.json()

    history_res = client.get("/api/user/history?limit=5", headers=headers)
    assert history_res.status_code == 200
    assert "items" in history_res.json()


def test_reports_and_cabinet():
    """Test report creation and medicine cabinet endpoints."""
    login_res = client.post(
        "/api/auth/login",
        json={"email": "user@medverify.demo", "password": "user123"},
    )
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Submit report
    rep_res = client.post(
        "/api/reports",
        headers=headers,
        json={"report_type": "VERIFICATION_CONCERN", "description": "Package seal was slightly loose."},
    )
    assert rep_res.status_code == 201

    # Add to cabinet
    cab_res = client.post(
        "/api/user/cabinet",
        headers=headers,
        json={"nickname": "My Amoxicillin", "notes": "Prescribed 3 times daily."},
    )
    assert cab_res.status_code == 201
    cab_id = cab_res.json()["id"]

    # List cabinet
    list_cab = client.get("/api/user/cabinet", headers=headers)
    assert list_cab.status_code == 200
    assert any(c["id"] == cab_id for c in list_cab.json())
