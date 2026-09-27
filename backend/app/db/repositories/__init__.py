"""Database repositories for MedVerify business entities."""

from app.db.repositories.medicines import MedicinesRepository
from app.db.repositories.batches import BatchesRepository
from app.db.repositories.verifications import VerificationsRepository
from app.db.repositories.profiles import ProfilesRepository
from app.db.repositories.reports import ReportsRepository
from app.db.repositories.cabinet import CabinetRepository

medicines_repo = MedicinesRepository()
batches_repo = BatchesRepository()
verifications_repo = VerificationsRepository()
profiles_repo = ProfilesRepository()
reports_repo = ReportsRepository()
cabinet_repo = CabinetRepository()

__all__ = [
    "medicines_repo",
    "batches_repo",
    "verifications_repo",
    "profiles_repo",
    "reports_repo",
    "cabinet_repo",
]
