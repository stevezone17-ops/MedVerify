"""Medicine Cabinet endpoints for personalized consumer safety vault."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional

from app.db.repositories import cabinet_repo
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/user/cabinet", tags=["Medicine Cabinet"])


class CabinetEntryCreate(BaseModel):
    medicine_id: Optional[str] = None
    verification_id: Optional[str] = None
    nickname: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=1000)
    expiry_date: Optional[str] = None
    product_name: Optional[str] = None
    manufacturer: Optional[str] = None
    batch_number: Optional[str] = None
    reminder_enabled: bool = False


class CabinetEntryUpdate(BaseModel):
    nickname: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=1000)
    reminder_enabled: Optional[bool] = None


@router.post("", status_code=status.HTTP_201_CREATED)
def add_to_cabinet(body: CabinetEntryCreate, current_user: dict = Depends(get_current_user)):
    """Save an authenticated medicine to user's personal cabinet."""
    user_id = str(current_user["_id"])
    entry = cabinet_repo.add({
        "user_id": user_id,
        "medicine_id": body.medicine_id,
        "verification_id": body.verification_id,
        "nickname": body.nickname,
        "notes": body.notes,
        "expiry_date": body.expiry_date,
        "product_name": body.product_name,
        "manufacturer": body.manufacturer,
        "batch_number": body.batch_number,
        "reminder_enabled": body.reminder_enabled,
    })
    return entry


@router.get("")
def get_cabinet(current_user: dict = Depends(get_current_user)):
    """Retrieve all medicines in user's personal cabinet."""
    user_id = str(current_user["_id"])
    return cabinet_repo.list_user_cabinet(user_id=user_id)


@router.patch("/{cabinet_id}")
def update_cabinet_entry(cabinet_id: str, body: CabinetEntryUpdate, current_user: dict = Depends(get_current_user)):
    """Update a cabinet entry (nickname, notes, reminder settings)."""
    user_id = str(current_user["_id"])
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")
    updated = cabinet_repo.update(cabinet_id=cabinet_id, user_id=user_id, updates=updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Cabinet entry not found.")
    return updated


@router.delete("/{cabinet_id}")
def remove_from_cabinet(cabinet_id: str, current_user: dict = Depends(get_current_user)):
    """Remove a medicine from user's personal cabinet."""
    user_id = str(current_user["_id"])
    removed = cabinet_repo.remove(cabinet_id=cabinet_id, user_id=user_id)
    return {"message": "Medicine removed from cabinet.", "removed": removed}
