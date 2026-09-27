"""MongoDB connection and collection accessors."""

from pymongo import MongoClient, ASCENDING
from pymongo.database import Database
from pymongo.collection import Collection

from app.config import settings

_client: MongoClient | None = None
_db: Database | None = None


def get_client() -> MongoClient:
    global _client
    if _client is None:
        _client = MongoClient(settings.mongodb_uri, tz_aware=True)
    return _client


def get_db() -> Database:
    global _db
    if _db is None:
        _db = get_client()[settings.database_name]
    return _db


# ---------------------------------------------------------------------------
# Collection helpers
# ---------------------------------------------------------------------------

def medicines_col() -> Collection:
    return get_db()["medicines"]


def verifications_col() -> Collection:
    return get_db()["verifications"]


def users_col() -> Collection:
    return get_db()["users"]


def audit_col() -> Collection:
    return get_db()["audit_logs"]


# ---------------------------------------------------------------------------
# Index creation — idempotent, safe to call on every startup
# ---------------------------------------------------------------------------

def ensure_indexes() -> None:
    medicines_col().create_index([("product_identifier", ASCENDING)], unique=True)
    medicines_col().create_index([("batch_number", ASCENDING)])
    medicines_col().create_index([("serial_number", ASCENDING)])
    medicines_col().create_index([("manufacturer.id", ASCENDING)])

    verifications_col().create_index([("created_at", -1)])
    verifications_col().create_index([("user_id", ASCENDING), ("created_at", -1)])
    verifications_col().create_index([("status", ASCENDING)])
    verifications_col().create_index([("raw_identifier", ASCENDING)])

    users_col().create_index([("email", ASCENDING)], unique=True)
