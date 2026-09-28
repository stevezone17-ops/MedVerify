"""Unit tests for the confidence scoring and decision engine."""

from app.services.scoring import calculate_score


SAMPLE_REGISTRY = {
    "_id": "med_001",
    "product_identifier": "89012345678901",
    "product_name": "Amoxicillin 500 mg Capsules",
    "manufacturer": {"id": "mfr_001", "name": "PharmaCore Laboratories"},
    "batch_number": "BATCH-2026-001",
    "serial_number": "SER-PC-000001",
    "manufacturing_date": "2026-01-10",
    "expiry_date": "2028-01-09",
    "dosage": "500 mg",
    "package_size": "10 capsules",
    "status": "active",
}


def test_score_not_found():
    res = calculate_score(None, {"product_identifier": "99999999999999"})
    assert res.score == 0
    assert res.status == "NOT_FOUND"
    assert len(res.issues) > 0


def test_score_perfect_match():
    parsed = {
        "product_identifier": "89012345678901",
        "batch_number": "BATCH-2026-001",
        "serial_number": "SER-PC-000001",
        "expiry_date": "2028-01-09",
        "manufacturer": "PharmaCore Laboratories",
        "product_name": "Amoxicillin 500 mg Capsules",
    }
    res = calculate_score(SAMPLE_REGISTRY, parsed, serial_seen_before=False)
    assert res.score == 100
    assert res.status == "VERIFIED"
    assert len(res.issues) == 0


def test_score_batch_mismatch():
    parsed = {
        "product_identifier": "89012345678901",
        "batch_number": "FAKE-BATCH-999",
        "serial_number": "SER-PC-000001",
    }
    res = calculate_score(SAMPLE_REGISTRY, parsed, serial_seen_before=False)
    assert res.status == "SUSPICIOUS"
    assert any("Batch" in issue or "batch" in issue for issue in res.issues)


def test_score_serial_reuse():
    parsed = {
        "product_identifier": "89012345678901",
        "batch_number": "BATCH-2026-001",
        "serial_number": "SER-PC-000001",
    }
    res = calculate_score(SAMPLE_REGISTRY, parsed, serial_seen_before=True)
    assert res.status == "SUSPICIOUS"
    assert any("reuse" in issue.lower() or "seen" in issue.lower() for issue in res.issues)


def test_score_expired_medicine():
    expired_reg = dict(SAMPLE_REGISTRY)
    expired_reg["expiry_date"] = "2020-01-01"  # clearly in the past
    parsed = {
        "product_identifier": "89012345678901",
        "batch_number": "BATCH-2026-001",
        "expiry_date": "2020-01-01",
    }
    res = calculate_score(expired_reg, parsed, serial_seen_before=False)
    assert res.status == "EXPIRED"
    assert any("expiry" in issue.lower() or "expired" in issue.lower() for issue in res.issues)


def test_score_insufficient_fields():
    # Only product_identifier provided, everything else skipped
    parsed = {"product_identifier": "89012345678901"}
    res = calculate_score(SAMPLE_REGISTRY, parsed, serial_seen_before=False)
    # Skipped fields should trigger REQUIRES_REVIEW due to insufficient verification data
    assert res.status == "REQUIRES_REVIEW"
