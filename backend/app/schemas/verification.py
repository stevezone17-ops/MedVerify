"""Pydantic schemas for verification domain."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Verification check (sub-document)
# ---------------------------------------------------------------------------

class VerificationCheck(BaseModel):
    """One individual field check inside a verification result."""

    name: str
    field: str
    status: str  # PASS | FAIL | WARN | SKIP
    weight: int
    expected: Optional[str] = None
    actual: Optional[str] = None
    detail: Optional[str] = None


# ---------------------------------------------------------------------------
# Verification request
# ---------------------------------------------------------------------------

class VerifyRequest(BaseModel):
    """Payload sent by the frontend to verify a medicine."""

    identifier: str = Field(..., min_length=1, max_length=200)
    batch_number: Optional[str] = None
    serial_number: Optional[str] = None
    manufacturer: Optional[str] = None
    product_name: Optional[str] = None
    expiry_date: Optional[str] = None


# ---------------------------------------------------------------------------
# Verification response / DB record
# ---------------------------------------------------------------------------

class VerificationResult(BaseModel):
    """Full verification result returned by the API and stored in MongoDB."""

    verification_id: str
    input_type: str = "manual"
    raw_identifier: str
    parsed_data: dict = {}
    matched_medicine_id: Optional[str] = None
    status: str  # VERIFIED | REVIEW | SUSPICIOUS | NOT_FOUND
    confidence_score: int
    checks: list[VerificationCheck] = []
    issues: list[str] = []
    medicine: Optional[dict] = None
    created_at: datetime


class VerificationListItem(BaseModel):
    """Compact record for the history list view."""

    verification_id: str
    raw_identifier: str
    status: str
    confidence_score: int
    product_name: Optional[str] = None
    manufacturer: Optional[str] = None
    created_at: datetime


class VerificationHistoryResponse(BaseModel):
    """Paginated history response."""

    items: list[VerificationListItem]
    total: int
    page: int
    limit: int
