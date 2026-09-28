"""Integration and unit tests for Daily-Use verification features.

Covers:
- Verification methods (QR, PACKAGING_OCR, MANUAL)
- Medicine Cabinet entry updates (PATCH)
- Notification & expiry preferences (GET/PATCH)
- Admin analytics method breakdown
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.verification import VerifyRequest
from app.services.verification_engine import verify_medicine

client = TestClient(app)


def test_verification_method_handling():
    """Verify that different verification methods are preserved in result."""
    # Method: PACKAGING_OCR
    req_ocr = VerifyRequest(
        identifier="89012345678901",
        method="PACKAGING_OCR",
        batch_number="BATCH-2026-001",
        expiry_date="2028-01-09",
        serial_number="SER-PC-000001",
    )
    res_ocr = verify_medicine(req_ocr)
    assert res_ocr.verification_method == "PACKAGING_OCR"
    assert res_ocr.input_type == "packaging_ocr"
    assert res_ocr.status == "VERIFIED"

    # Method: MANUAL
    req_man = VerifyRequest(
        identifier="89012345678901",
        method="MANUAL",
        batch_number="BATCH-2026-001",
    )
    res_man = verify_medicine(req_man)
    assert res_man.verification_method == "MANUAL"
    assert res_man.input_type == "manual"

    # Method: QR (default)
    req_qr = VerifyRequest(
        identifier="(01)89012345678901(10)BATCH-2026-001(17)280109(21)SER-PC-000001",
    )
    res_qr = verify_medicine(req_qr)
    assert res_qr.verification_method == "QR"
    assert res_qr.status == "VERIFIED"


def test_cabinet_crud_and_patch():
    """Verify adding, updating, and removing medicines from user's cabinet."""
    # 1. Login user
    login_res = client.post(
        "/api/auth/login",
        json={"email": "user@medverify.demo", "password": "user123"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Add to cabinet
    add_res = client.post(
        "/api/user/cabinet",
        headers=headers,
        json={
            "product_name": "Amoxicillin 500 mg",
            "manufacturer": "PharmaCore Laboratories",
            "batch_number": "BATCH-2026-001",
            "expiry_date": "2028-01-09",
            "nickname": "Daily Antibiotics",
            "notes": "Take 1 capsule after breakfast",
            "reminder_enabled": True,
        },
    )
    assert add_res.status_code == 201
    entry = add_res.json()
    cabinet_id = entry.get("id") or entry.get("_id")
    assert cabinet_id is not None
    assert entry.get("nickname") == "Daily Antibiotics"

    # 3. PATCH cabinet entry
    patch_res = client.patch(
        f"/api/user/cabinet/{cabinet_id}",
        headers=headers,
        json={
            "nickname": "Updated Antibiotics",
            "notes": "Updated note: with plenty of water",
            "reminder_enabled": False,
        },
    )
    assert patch_res.status_code == 200
    updated = patch_res.json()
    assert updated.get("nickname") == "Updated Antibiotics"
    assert updated.get("reminder_enabled") is False

    # 4. List cabinet
    list_res = client.get("/api/user/cabinet", headers=headers)
    assert list_res.status_code == 200
    assert any(c.get("id") == cabinet_id or c.get("_id") == cabinet_id for c in list_res.json())

    # 5. Delete entry
    del_res = client.delete(f"/api/user/cabinet/{cabinet_id}", headers=headers)
    assert del_res.status_code == 200


def test_notification_preferences():
    """Verify getting and updating user notification preferences."""
    login_res = client.post(
        "/api/auth/login",
        json={"email": "user@medverify.demo", "password": "user123"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # GET preferences
    get_res = client.get("/api/user/notifications/preferences", headers=headers)
    assert get_res.status_code == 200
    prefs = get_res.json()
    assert "email_alerts" in prefs
    assert "expiry_reminder_days" in prefs

    # PATCH preferences
    patch_res = client.patch(
        "/api/user/notifications/preferences",
        headers=headers,
        json={
            "email_alerts": False,
            "expiry_reminder_days": 30,
        },
    )
    assert patch_res.status_code == 200
    new_prefs = patch_res.json()
    assert new_prefs["email_alerts"] is False
    assert new_prefs["expiry_reminder_days"] == 30


def test_admin_analytics_method_breakdown():
    """Verify that admin analytics returns method_breakdown with count per method."""
    login_res = client.post(
        "/api/auth/login",
        json={"email": "admin@medverify.demo", "password": "admin123"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/admin/analytics", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "method_breakdown" in data
    assert "QR" in data["method_breakdown"]
    assert "PACKAGING_OCR" in data["method_breakdown"]
    assert "MANUAL" in data["method_breakdown"]
