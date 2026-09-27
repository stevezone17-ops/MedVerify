"""Unit tests for the QR / Barcode parser."""

from app.services.qr_parser import parse_identifier


def test_parse_empty():
    assert parse_identifier("") == {}
    assert parse_identifier("   ") == {}


def test_parse_plain_identifier():
    res = parse_identifier("89012345678901")
    assert res == {"product_identifier": "89012345678901"}


def test_parse_json_payload():
    payload = '{"pid": "89012345678901", "batch": "BATCH-2026-001", "serial": "SER-001"}'
    res = parse_identifier(payload)
    assert res["product_identifier"] == "89012345678901"
    assert res["batch_number"] == "BATCH-2026-001"
    assert res["serial_number"] == "SER-001"


def test_parse_pipe_delimited():
    payload = "89012345678901|BATCH-2026-001|SER-001|2028-05-31"
    res = parse_identifier(payload)
    assert res["product_identifier"] == "89012345678901"
    assert res["batch_number"] == "BATCH-2026-001"
    assert res["serial_number"] == "SER-001"
    assert res["expiry_date"] == "2028-05-31"


def test_parse_gs1_format():
    payload = "(01)89012345678903(10)BATCH-2026-108(21)SER-PC-000089(17)2028-05-31"
    res = parse_identifier(payload)
    assert res["product_identifier"] == "89012345678903"
    assert res["batch_number"] == "BATCH-2026-108"
    assert res["serial_number"] == "SER-PC-000089"
    assert res["expiry_date"] == "2028-05-31"


def test_parse_invalid_json_falls_back():
    payload = '{"bad_json": true,'
    res = parse_identifier(payload)
    assert res == {"product_identifier": payload}
