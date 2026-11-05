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
    """Packaging condition and tampering observation flags."""

    torn_packaging: bool = False
    damaged_carton: bool = False
    broken_seal: bool = False
    illegible_printing: bool = False
    missing_required_labels: bool = False
    tampering_signs_observed: bool = False
    summary: str = "Packaging condition normal."
    confidence: float = 0.0


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
    created_at: Optional[datetime] = None

    @field_validator("created_at", mode="before")
    @classmethod
    def validate_created_at(cls, v):
        return normalize_datetime(v)

    @field_serializer("created_at", when_used="json")
    def serialize_created_at(self, v: Optional[datetime]) -> Optional[str]:
        return to_iso_utc(v)
