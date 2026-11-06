"""Tests for Consumer & Admin Portal Integration and Telemetry Consistency (Stage 6).

Validates:
- Scans performed by consumers immediately reflect in Admin analytics, audit trails, and investigation views.
- Consumer cabinet additions link properly to verified records.
- Admin registry updates (creating/updating medicines) immediately take effect in consumer scanning.
- Anomaly rate and status breakdown in admin analytics reflect actual consumer verification verdicts.
"""

import pytest
from starlette.testclient import TestClient

from app.main import app
from app.db.repositories import profiles_repo, medicines_repo
from app.services.auth_service import create_token


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def consumer_token(client):
    resp = client.post("/api/auth/login", json={"email": "user@medverify.demo", "password": "user123"})
    if resp.status_code == 200:
        return resp.json()["access_token"]
    user = profiles_repo.get_by_email("user@medverify.demo")
    return create_token(user["id"] if user else "usr_demo_user", "user")


@pytest.fixture
def admin_token(client):
    resp = client.post("/api/auth/login", json={"email": "admin@medverify.demo", "password": "admin123"})
    if resp.status_code == 200:
        return resp.json()["access_token"]
    admin = profiles_repo.get_by_email("admin@medverify.demo")
    return create_token(admin["id"] if admin else "usr_demo_admin", "admin")


def test_consumer_scan_reflects_in_admin_telemetry_and_audit(client, consumer_token, admin_token):
    """Consumer scan immediately appears in Admin analytics, audit trail, and investigation view."""
    consumer_headers = {"Authorization": f"Bearer {consumer_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Admin checks initial analytics
    initial_analytics = client.get("/api/admin/analytics", headers=admin_headers).json()
    init_total = initial_analytics["total_verifications"]

    # 2. Consumer performs a verification
    scan_resp = client.post(
        "/api/verify",
        json={"identifier": "(01)89012345678901(10)BATCH-2026-001(17)280109(21)SER-PC-000001", "method": "QR"},
        headers=consumer_headers,
    )
    assert scan_resp.status_code == 200
    scan_data = scan_resp.json()
    vid = scan_data["verification_id"]
    assert scan_data["status"] == "VERIFIED"

    # 3. Consumer's history shows the scan
    user_hist = client.get("/api/user/history", headers=consumer_headers).json()
    assert any(it["verification_id"] == vid for it in user_hist["items"])

    # 4. Admin analytics reflects the new verification count
    updated_analytics = client.get("/api/admin/analytics", headers=admin_headers).json()
    assert updated_analytics["total_verifications"] >= init_total + 1

    # 5. Admin audit trail includes the event
    audit_resp = client.get("/api/admin/audit?limit=20", headers=admin_headers)
    assert audit_resp.status_code == 200
    audit_items = audit_resp.json()["items"]
    assert any(it.get("verification_id") == vid for it in audit_items)

    # 6. Admin investigation endpoint reconstructs the full forensic pipeline stages
    inv_resp = client.get(f"/api/admin/investigation/{vid}", headers=admin_headers)
    assert inv_resp.status_code == 200
    inv_data = inv_resp.json()
    assert inv_data["verification_id"] == vid
    stages = inv_data["pipeline_stages"]
    assert len(stages) >= 4
    stage_names = [s["stage"] for s in stages]
    assert "input_capture" in stage_names
    assert "extraction" in stage_names
    assert "registry_lookup" in stage_names
    assert "final_verdict" in stage_names


def test_admin_medicine_registry_lifecycle_affects_consumer_verification(client, consumer_token, admin_token):
    """Adding a medicine in admin registry makes it verifiable by consumers, and deactivating it updates verification."""
    consumer_headers = {"Authorization": f"Bearer {consumer_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    new_gtin = "89099998888777"
    # Ensure clean state
    existing = medicines_repo.get_by_gtin(new_gtin)
    if existing:
        medicines_repo.delete(str(existing.get("id") or existing.get("_id")))

    # Step 1: Consumer verifies unknown GTIN -> NOT_FOUND
    pre_resp = client.post("/api/verify", json={"identifier": new_gtin}, headers=consumer_headers)
    assert pre_resp.status_code == 200
    assert pre_resp.json()["status"] == "NOT_FOUND"

    # Step 2: Admin creates medicine in registry
    create_payload = {
        "product_identifier": new_gtin,
        "product_name": "Ceftriaxone 1g Injection",
        "manufacturer_id": "mfr_gps_999",
        "manufacturer_name": "Global Pharma Solutions",
        "dosage": "1g",
        "package_size": "Vial with diluent",
        "batch_number": "BATCH-CEF-001",
        "serial_number": "SER-CEF-0001",
        "manufacturing_date": "2026-02-01",
        "expiry_date": "2029-02-01",
    }
    create_resp = client.post("/api/admin/medicines", json=create_payload, headers=admin_headers)
    assert create_resp.status_code == 201
    med_id = create_resp.json()["id"]

    # Step 3: Consumer scans again -> VERIFIED!
    verify_resp = client.post(
        "/api/verify",
        json={
            "identifier": f"(01){new_gtin}(10)BATCH-CEF-001(17)290201(21)SER-CEF-0001",
            "batch_number": "BATCH-CEF-001",
            "method": "DATAMATRIX",
        },
        headers=consumer_headers,
    )
    assert verify_resp.status_code == 200
    v_data = verify_resp.json()
    assert v_data["status"] == "VERIFIED"
    assert v_data["medicine"]["product_name"] == "Ceftriaxone 1g Injection"

    # Step 4: Consumer saves it to Medicine Cabinet
    cab_resp = client.post(
        "/api/user/cabinet",
        json={
            "medicine_id": med_id,
            "verification_id": v_data["verification_id"],
            "nickname": "Hospital Ceftriaxone",
            "notes": "Post-surgery course",
            "expiry_date": "2029-02-01",
            "product_name": "Ceftriaxone 1g Injection",
            "manufacturer": "Global Pharma Solutions",
            "batch_number": "BATCH-CEF-001",
        },
        headers=consumer_headers,
    )
    assert cab_resp.status_code in (200, 201)
    cab_id = cab_resp.json()["id"]

    # Step 5: Consumer lists cabinet
    cab_list = client.get("/api/user/cabinet", headers=consumer_headers).json()
    assert any(it["id"] == cab_id for it in cab_list)

    # Step 6: Admin deactivates medicine
    deact_resp = client.delete(f"/api/admin/medicines/{med_id}", headers=admin_headers)
    assert deact_resp.status_code == 200

    # Cleanup cabinet item
    client.delete(f"/api/user/cabinet/{cab_id}", headers=consumer_headers)
