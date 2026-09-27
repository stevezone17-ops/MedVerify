"""Pydantic schemas for the Medicine domain."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Embedded sub-documents
# ---------------------------------------------------------------------------

class ManufacturerInfo(BaseModel):
    id: str
    name: str


# ---------------------------------------------------------------------------
# Medicine — stored in MongoDB
# ---------------------------------------------------------------------------

class MedicineInDB(BaseModel):
    """Full medicine record as persisted."""

    id: str = Field(..., alias="_id")
    product_identifier: str
    product_name: str
    manufacturer: ManufacturerInfo
    batch_number: str
    serial_number: str
    manufacturing_date: str
    expiry_date: str
    dosage: Optional[str] = None
    package_size: Optional[str] = None
    status: str = "active"
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True


# ---------------------------------------------------------------------------
# API request / response schemas
# ---------------------------------------------------------------------------

class MedicineCreate(BaseModel):
    """Payload to create a medicine record (admin)."""

    product_identifier: str = Field(..., min_length=1)
    product_name: str = Field(..., min_length=1)
    manufacturer_id: str = Field(..., min_length=1)
    manufacturer_name: str = Field(..., min_length=1)
    batch_number: str = Field(..., min_length=1)
    serial_number: str = Field(..., min_length=1)
    manufacturing_date: str
    expiry_date: str
    dosage: Optional[str] = None
    package_size: Optional[str] = None


class MedicineUpdate(BaseModel):
    """Payload to update a medicine record (admin)."""

    product_name: Optional[str] = None
    manufacturer_id: Optional[str] = None
    manufacturer_name: Optional[str] = None
    batch_number: Optional[str] = None
    serial_number: Optional[str] = None
    manufacturing_date: Optional[str] = None
    expiry_date: Optional[str] = None
    dosage: Optional[str] = None
    package_size: Optional[str] = None
    status: Optional[str] = None


class MedicineResponse(BaseModel):
    """Public medicine representation returned by the API."""

    id: str
    product_identifier: str
    product_name: str
    manufacturer: ManufacturerInfo
    batch_number: str
    serial_number: str
    manufacturing_date: str
    expiry_date: str
    dosage: Optional[str] = None
    package_size: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime
