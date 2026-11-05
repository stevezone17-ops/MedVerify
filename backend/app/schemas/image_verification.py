"""Pydantic schemas for the MedVerify Medicine Image Verification domain."""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator, field_serializer
from app.utils.timestamps import normalize_datetime, to_iso_utc


class UploadedImageMetadata(BaseModel):
    """Metadata for an authenticated, validated uploaded packaging image."""

    image_id: str
    user_id: str
    slot: str = "general"  # front | back | barcode | blister | custom | general
    file_name: str
    mime_type: str
    file_size: int
    width: int
    height: int
    storage_path: str
    created_at: Optional[datetime] = None

    @field_validator("created_at", mode="before")
    @classmethod
    def validate_created_at(cls, v):
        return normalize_datetime(v)

    @field_serializer("created_at", when_used="json")
    def serialize_created_at(self, v: Optional[datetime]) -> Optional[str]:
        return to_iso_utc(v)


class ImageUploadBatchResponse(BaseModel):
    """Response containing successfully uploaded and validated packaging images."""

    batch_id: str
    user_id: str
    uploaded_count: int
    images: List[UploadedImageMetadata]
    created_at: Optional[datetime] = None

    @field_validator("created_at", mode="before")
    @classmethod
    def validate_created_at(cls, v):
        return normalize_datetime(v)

    @field_serializer("created_at", when_used="json")
    def serialize_created_at(self, v: Optional[datetime]) -> Optional[str]:
        return to_iso_utc(v)


MANDATORY_PACKAGING_DISCLAIMER: str = (
    "Image analysis and packaging verification cannot guarantee medicine authenticity, "
    "quality, storage integrity, or clinical suitability. Consult a licensed pharmacist or physician before use when uncertain."
)


class ExtractedFieldDetail(BaseModel):
    """Structured detail for an extracted packaging field."""

    key: str
    label: str
    value: Optional[str] = None
    confidence: float = 0.0  # 0.0 to 1.0
    source_image_id: Optional[str] = None
    extraction_method: str = "visual_interpretation"  # ocr | barcode_decoding | visual_interpretation
    requires_user_confirmation: bool = False


class VisualPackagingCondition(BaseModel):
    """Packaging condition, physical integrity, and tampering observation flags."""

    assessment_status: str = "ASSESSED"  # ASSESSED | INSUFFICIENT_VISUAL_EVIDENCE | NORMAL | TAMPER_WARNING
    defect_count: int = 0
    photo_consistency: str = "CONSISTENT"  # CONSISTENT | INCONSISTENT_ANGLES | INCOMPLETE_COVERAGE | UNKNOWN
    torn_packaging: bool = False
    damaged_carton: bool = False
    broken_seal: bool = False
    illegible_printing: bool = False
    missing_required_labels: bool = False
    tampering_signs_observed: bool = False
    summary: str = "Packaging condition normal."
    confidence: float = 0.0
    distinction_notice: str = (
        "Visual packaging observations assess external physical condition only and do NOT declare "
        "medicine authenticity. Verification status is evaluated strictly by the deterministic 6-factor registry engine."
    )


class ImageAnalysisResult(BaseModel):
    """Complete image-based extraction and observation analysis result."""

    analysis_id: str
    batch_id: str
    user_id: str
    medicine_name: Optional[ExtractedFieldDetail] = None
    active_ingredient: Optional[ExtractedFieldDetail] = None
    strength: Optional[ExtractedFieldDetail] = None
    dosage_form: Optional[ExtractedFieldDetail] = None
    manufacturer: Optional[ExtractedFieldDetail] = None
    batch_number: Optional[ExtractedFieldDetail] = None
    expiry_date: Optional[ExtractedFieldDetail] = None
    manufacturing_date: Optional[ExtractedFieldDetail] = None
    gtin: Optional[ExtractedFieldDetail] = None
    serial_number: Optional[ExtractedFieldDetail] = None
    registration_number: Optional[ExtractedFieldDetail] = None

    # Barcode extraction details
    barcode_detected: bool = False
    barcode_type: Optional[str] = None  # DATA_MATRIX | QR_CODE | EAN_13 | None
    barcode_payload: Optional[str] = None
    barcode_fields: Dict[str, Any] = {}

    # Discrepancy flags
    printed_vs_barcode_mismatch: bool = False
    mismatch_details: List[str] = []

    # Visual packaging observations
    packaging_condition: VisualPackagingCondition = Field(default_factory=VisualPackagingCondition)

    # Raw OCR text collected from images
    extracted_text_blocks: List[str] = []
    observations: List[str] = []
    mandatory_disclaimer: str = MANDATORY_PACKAGING_DISCLAIMER
    created_at: Optional[datetime] = None

    @field_validator("created_at", mode="before")
    @classmethod
    def validate_created_at(cls, v):
        return normalize_datetime(v)

    @field_serializer("created_at", when_used="json")
    def serialize_created_at(self, v: Optional[datetime]) -> Optional[str]:
        return to_iso_utc(v)


class ConfirmedMedicineFields(BaseModel):
    """User-reviewed and confirmed medicine parameters prior to authoritative verification."""

    product_name: Optional[str] = None
    gtin: Optional[str] = None
    batch_number: Optional[str] = None
    serial_number: Optional[str] = None
    expiry_date: Optional[str] = None
    manufacturer: Optional[str] = None


class ConfirmAndVerifyImageRequest(BaseModel):
    """Request to submit user-confirmed parameters to the authoritative 6-factor engine."""

    analysis_id: str
    batch_id: str
    confirmed_fields: ConfirmedMedicineFields
    raw_identifier: Optional[str] = None


class ImageVerificationCombinedResult(BaseModel):
    """Authoritative response combining deterministic verification with vision evidence."""

    verification_id: str
    status: str  # VERIFIED | REVIEW | SUSPICIOUS | NOT_FOUND | EXPIRED | REQUIRES_REVIEW | INVALID
    confidence_score: int
    verification: Dict[str, Any]  # Full VerificationResult from deterministic engine
    image_analysis: ImageAnalysisResult
    confirmed_parameters: Dict[str, Optional[str]]
    mandatory_disclaimer: str = MANDATORY_PACKAGING_DISCLAIMER
    created_at: Optional[datetime] = None

    @field_validator("created_at", mode="before")
    @classmethod
    def validate_created_at(cls, v):
        return normalize_datetime(v)

    @field_serializer("created_at", when_used="json")
    def serialize_created_at(self, v: Optional[datetime]) -> Optional[str]:
        return to_iso_utc(v)
