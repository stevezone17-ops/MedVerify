"""Confidence scoring engine.

Implements the weighted-check scoring model described in PROJECT_SPEC.md.
Each check produces a PASS / FAIL / WARN / SKIP status and contributes
its weight to the overall confidence score.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Optional


# ---------------------------------------------------------------------------
# Configurable weights (easy to tune from one place)
# ---------------------------------------------------------------------------

WEIGHTS = {
    "product_identifier": 30,
    "manufacturer": 20,
    "batch_number": 20,
    "expiry_date": 10,
    "product_metadata": 10,
    "serial_uniqueness": 10,
}


@dataclass
class Check:
    name: str
    field: str
    status: str  # PASS | FAIL | WARN | SKIP
    weight: int
    expected: Optional[str] = None
    actual: Optional[str] = None
    detail: Optional[str] = None


@dataclass
class ScoreResult:
    score: int
    status: str
    checks: list[Check] = field(default_factory=list)
    issues: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def calculate_score(
    registry: dict | None,
    parsed_data: dict,
    serial_seen_before: bool = False,
) -> ScoreResult:
    """Run all checks and produce a confidence score and status.

    Parameters
    ----------
    registry : dict | None
        The medicine document from MongoDB, or ``None`` if no match was found.
    parsed_data : dict
        Fields extracted from the scanned identifier.
    serial_seen_before : bool
        Whether this serial number has appeared in a previous verification.
    """

    checks: list[Check] = []
    issues: list[str] = []

    # ---- No registry match → NOT_FOUND ----
    if registry is None:
        return ScoreResult(
            score=0,
            status="NOT_FOUND",
            checks=[
                Check(
                    name="Registry lookup",
                    field="product_identifier",
                    status="FAIL",
                    weight=WEIGHTS["product_identifier"],
                    actual=parsed_data.get("product_identifier", ""),
                    detail="No matching product found in the registry.",
                )
            ],
            issues=["Product identifier not found in the configured registry."],
        )

    total_weight = 0
    earned_weight = 0
    has_critical_fail = False

    # 1. Product identifier
    c = _compare(
        "Product identifier",
        "product_identifier",
        registry.get("product_identifier", ""),
        parsed_data.get("product_identifier", ""),
        WEIGHTS["product_identifier"],
    )
    checks.append(c)
    total_weight += c.weight
    if c.status == "PASS":
        earned_weight += c.weight
    elif c.status == "FAIL":
        has_critical_fail = True
        issues.append("Product identifier mismatch.")

    # 2. Manufacturer
    mfr_expected = ""
    if isinstance(registry.get("manufacturer"), dict):
        mfr_expected = registry["manufacturer"].get("name", "")
    elif isinstance(registry.get("manufacturer"), str):
        mfr_expected = registry["manufacturer"]

    mfr_actual = parsed_data.get("manufacturer", "")
    if mfr_actual:
        c = _compare(
            "Manufacturer",
            "manufacturer",
            mfr_expected,
            mfr_actual,
            WEIGHTS["manufacturer"],
        )
        checks.append(c)
        total_weight += c.weight
        if c.status == "PASS":
            earned_weight += c.weight
        elif c.status == "FAIL":
            has_critical_fail = True
            issues.append("Manufacturer does not match the registry record.")
    else:
        checks.append(Check(
            name="Manufacturer",
            field="manufacturer",
            status="SKIP",
            weight=WEIGHTS["manufacturer"],
            expected=mfr_expected,
            detail="Not provided in scanned data.",
        ))
        total_weight += WEIGHTS["manufacturer"]
        # Give partial credit for skipped non-critical fields
        earned_weight += WEIGHTS["manufacturer"] // 2

    # 3. Batch number
    batch_expected = registry.get("batch_number", "")
    batch_actual = parsed_data.get("batch_number", "")
    if batch_actual:
        c = _compare(
            "Batch number",
            "batch_number",
            batch_expected,
            batch_actual,
            WEIGHTS["batch_number"],
        )
        checks.append(c)
        total_weight += c.weight
        if c.status == "PASS":
            earned_weight += c.weight
        elif c.status == "FAIL":
            has_critical_fail = True
            issues.append("Batch number does not match.")
    else:
        checks.append(Check(
            name="Batch number",
            field="batch_number",
            status="SKIP",
            weight=WEIGHTS["batch_number"],
            expected=batch_expected,
            detail="Not provided in scanned data.",
        ))
        total_weight += WEIGHTS["batch_number"]
        earned_weight += WEIGHTS["batch_number"] // 2

    # 4. Expiry date
    exp_expected = registry.get("expiry_date", "")
    exp_actual = parsed_data.get("expiry_date", "")
    if exp_actual:
        c = _compare(
            "Expiry date",
            "expiry_date",
            exp_expected,
            exp_actual,
            WEIGHTS["expiry_date"],
        )
        checks.append(c)
        total_weight += c.weight
        if c.status == "PASS":
            earned_weight += c.weight
        elif c.status == "FAIL":
            issues.append("Expiry date does not match.")
    else:
        checks.append(Check(
            name="Expiry date",
            field="expiry_date",
            status="SKIP",
            weight=WEIGHTS["expiry_date"],
            expected=exp_expected,
            detail="Not provided in scanned data.",
        ))
        total_weight += WEIGHTS["expiry_date"]
        earned_weight += WEIGHTS["expiry_date"] // 2

    # 5. Product metadata (name + dosage + package)
    meta_actual = parsed_data.get("product_name", "")
    meta_expected = registry.get("product_name", "")
    if meta_actual:
        c = _compare(
            "Product name",
            "product_metadata",
            meta_expected,
            meta_actual,
            WEIGHTS["product_metadata"],
        )
        checks.append(c)
        total_weight += c.weight
        if c.status == "PASS":
            earned_weight += c.weight
        elif c.status == "FAIL":
            issues.append("Product name does not match.")
    else:
        checks.append(Check(
            name="Product name",
            field="product_metadata",
            status="SKIP",
            weight=WEIGHTS["product_metadata"],
            expected=meta_expected,
            detail="Not provided in scanned data.",
        ))
        total_weight += WEIGHTS["product_metadata"]
        earned_weight += WEIGHTS["product_metadata"] // 2

    # 6. Serial uniqueness
    serial_weight = WEIGHTS["serial_uniqueness"]
    if serial_seen_before:
        checks.append(Check(
            name="Serial uniqueness",
            field="serial_uniqueness",
            status="FAIL",
            weight=serial_weight,
            detail="This serial number has been seen in a previous verification.",
        ))
        total_weight += serial_weight
        has_critical_fail = True
        issues.append("Serial number reuse detected.")
    else:
        serial_actual = parsed_data.get("serial_number", "")
        if serial_actual:
            checks.append(Check(
                name="Serial uniqueness",
                field="serial_uniqueness",
                status="PASS",
                weight=serial_weight,
                actual=serial_actual,
                detail="Serial number has not been seen before.",
            ))
            total_weight += serial_weight
            earned_weight += serial_weight
        else:
            checks.append(Check(
                name="Serial uniqueness",
                field="serial_uniqueness",
                status="SKIP",
                weight=serial_weight,
                detail="No serial number provided.",
            ))
            total_weight += serial_weight
            earned_weight += serial_weight // 2

    # ---- Check if the product is expired ----
    is_expired = _is_expired(registry.get("expiry_date", ""))
    if is_expired:
        issues.append("Product has passed its expiry date.")

    # ---- Determine final score ----
    score = round((earned_weight / total_weight) * 100) if total_weight > 0 else 0

    # ---- Determine status ----
    # Count how many fields were actually provided (not skipped)
    provided_count = sum(1 for c in checks if c.status != "SKIP")
    skipped_count = sum(1 for c in checks if c.status == "SKIP")

    if has_critical_fail:
        status = "SUSPICIOUS"
    elif is_expired:
        status = "REVIEW"
    elif skipped_count >= 3 and provided_count <= 2:
        status = "REVIEW"
        if "Insufficient verification data — several fields were not provided." not in issues:
            issues.append("Insufficient verification data — several fields were not provided.")
    elif score >= 80:
        status = "VERIFIED"
    elif score >= 50:
        status = "REVIEW"
    else:
        status = "SUSPICIOUS"

    return ScoreResult(score=score, status=status, checks=checks, issues=issues)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _compare(name: str, field: str, expected: str, actual: str, weight: int) -> Check:
    """Case-insensitive, whitespace-normalised comparison."""

    e = expected.strip().lower()
    a = actual.strip().lower()

    if e == a:
        return Check(
            name=name, field=field, status="PASS", weight=weight,
            expected=expected, actual=actual,
        )
    return Check(
        name=name, field=field, status="FAIL", weight=weight,
        expected=expected, actual=actual,
        detail=f"Expected \"{expected}\" but received \"{actual}\".",
    )


def _is_expired(expiry_str: str) -> bool:
    """Return True if the expiry date is in the past."""
    if not expiry_str:
        return False
    try:
        exp = datetime.strptime(expiry_str, "%Y-%m-%d").date()
        return exp < date.today()
    except ValueError:
        return False
