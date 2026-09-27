"""Public medicine lookup endpoints."""

from fastapi import APIRouter, HTTPException, status

from app.database import medicines_col
from app.schemas.medicine import MedicineResponse

router = APIRouter(prefix="/api", tags=["Medicines"])


@router.get("/medicines/{product_identifier}", response_model=MedicineResponse)
def get_medicine(product_identifier: str):
    """Look up a medicine by its product identifier."""
    doc = medicines_col().find_one({"product_identifier": product_identifier})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medicine not found.")

    doc["id"] = str(doc.pop("_id"))
    return MedicineResponse(**doc)


@router.get("/medicines", response_model=list[MedicineResponse])
def list_medicines():
    """Return all active medicines in the registry."""
    docs = list(medicines_col().find({"status": "active"}).sort("product_name", 1))
    result = []
    for d in docs:
        d["id"] = str(d.pop("_id"))
        result.append(MedicineResponse(**d))
    return result
