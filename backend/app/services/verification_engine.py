"""Core verification engine.

Orchestrates the full verification pipeline:
  1. Parse the raw identifier.
  2. Look up the registry.
  3. Run confidence scoring.
  4. Store the verification result + audit record.
  5. Return the explainable result.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.database import medicines_col, verifications_col, audit_col
from app.services.qr_parser import parse_identifier
from app.services.scoring import calculate_score, Check
from app.schemas.verification import (
    VerifyRequest,
    VerificationResult,
    VerificationCheck,
)


def verify_medicine(req: VerifyRequest, user: dict | None = None) -> VerificationResult:
    """Run the full verification pipeline and return an explainable result."""

    now = datetime.now(timezone.utc)
    verification_id = f"vrf_{uuid.uuid4().hex[:12]}"
    user_id = str(user["_id"]) if user and "_id" in user else None
    user_email = user.get("email") if user else None
    user_name = user.get("name") if user else "Anonymous Guest"

    # ----- 1. Parse -----
    parsed = parse_identifier(req.identifier)

    # Merge any extra fields the client sent explicitly
    if req.batch_number:
        parsed.setdefault("batch_number", req.batch_number)
    if req.serial_number:
        parsed.setdefault("serial_number", req.serial_number)
    if req.manufacturer:
        parsed.setdefault("manufacturer", req.manufacturer)
    if req.product_name:
        parsed.setdefault("product_name", req.product_name)
    if req.expiry_date:
        parsed.setdefault("expiry_date", req.expiry_date)

    pid = parsed.get("product_identifier", "")

    # ----- 2. Registry lookup -----
    registry_doc = None
    if pid:
        registry_doc = medicines_col().find_one({"product_identifier": pid})

    # ----- 3. Serial reuse check -----
    serial = parsed.get("serial_number", "")
    serial_seen_before = False
    if serial and registry_doc:
        prev = verifications_col().find_one({
            "parsed_data.serial_number": serial,
            "status": {"$in": ["VERIFIED", "REVIEW"]},
        })
        if prev:
            serial_seen_before = True

    # ----- 4. Score -----
    score_result = calculate_score(registry_doc, parsed, serial_seen_before)

    # ----- 5. Build medicine summary for response -----
    medicine_summary = None
    matched_id = None
    if registry_doc:
        matched_id = str(registry_doc["_id"])
        mfr = registry_doc.get("manufacturer", {})
        medicine_summary = {
            "product_identifier": registry_doc.get("product_identifier", ""),
            "product_name": registry_doc.get("product_name", ""),
            "manufacturer": mfr.get("name", "") if isinstance(mfr, dict) else str(mfr),
            "batch_number": registry_doc.get("batch_number", ""),
            "serial_number": registry_doc.get("serial_number", ""),
            "expiry_date": registry_doc.get("expiry_date", ""),
            "manufacturing_date": registry_doc.get("manufacturing_date", ""),
            "dosage": registry_doc.get("dosage", ""),
            "package_size": registry_doc.get("package_size", ""),
            "status": registry_doc.get("status", ""),
        }

    # ----- 6. Map scoring Check dataclasses → schema objects -----
    schema_checks = [
        VerificationCheck(
            name=c.name,
            field=c.field,
            status=c.status,
            weight=c.weight,
            expected=c.expected,
            actual=c.actual,
            detail=c.detail,
        )
        for c in score_result.checks
    ]

    result = VerificationResult(
        verification_id=verification_id,
        input_type="qr",
        raw_identifier=req.identifier,
        parsed_data=parsed,
        matched_medicine_id=matched_id,
        status=score_result.status,
        confidence_score=score_result.score,
        checks=schema_checks,
        issues=score_result.issues,
        medicine=medicine_summary,
        created_at=now,
    )

    # ----- 7. Persist -----
    doc_data = result.model_dump(exclude={"verification_id"})
    doc_data["user_id"] = user_id
    doc_data["user_email"] = user_email
    doc_data["user_name"] = user_name

    verifications_col().insert_one({
        "_id": verification_id,
        **doc_data,
    })

    audit_col().insert_one({
        "_id": f"aud_{uuid.uuid4().hex[:12]}",
        "event": "medicine_verification",
        "verification_id": verification_id,
        "status": score_result.status,
        "confidence_score": score_result.score,
        "user_id": user_id,
        "user_email": user_email,
        "timestamp": now,
        "metadata": {"input_type": "qr", "identifier": req.identifier, "user_name": user_name},
    })

    return result
