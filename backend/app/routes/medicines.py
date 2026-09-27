"""Public medicine lookup endpoints."""

from fastapi import APIRouter, HTTPException, status
from app.db.repositories import medicines_repo
from app.schemas.medicine import MedicineResponse

router = APIRouter(prefix="/api", tags=["Medicines"])


@router.get("/medicines/{product_identifier}", response_model=MedicineResponse)
def get_medicine(product_identifier: str):
    """Look up a medicine by its product identifier."""
    doc = medicines_repo.get_by_gtin(product_identifier)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medicine not found.")

    doc["id"] = str(doc.get("id") or doc.get("_id"))
    return MedicineResponse(**doc)


@router.get("/medicines", response_model=list[MedicineResponse])
def list_medicines():
    """Return all active medicines in the registry."""
    docs = medicines_repo.list_all(active_only=True)
    result = []
    for d in docs:
        d["id"] = str(d.get("id") or d.get("_id"))
        result.append(MedicineResponse(**d))
    return result
