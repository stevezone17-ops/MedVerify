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
    reminder_enabled: bool = False


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
        "reminder_enabled": body.reminder_enabled,
    })
    return entry


@router.get("")
def get_cabinet(current_user: dict = Depends(get_current_user)):
    """Retrieve all medicines in user's personal cabinet."""
    user_id = str(current_user["_id"])
    return cabinet_repo.list_user_cabinet(user_id=user_id)


@router.delete("/{cabinet_id}")
def remove_from_cabinet(cabinet_id: str, current_user: dict = Depends(get_current_user)):
    """Remove a medicine from user's personal cabinet."""
    user_id = str(current_user["_id"])
    removed = cabinet_repo.remove(cabinet_id=cabinet_id, user_id=user_id)
    return {"message": "Medicine removed from cabinet.", "removed": removed}
