"""MongoDB connection and collection accessors."""

import logging
import time
from pymongo import MongoClient, ASCENDING
from pymongo.database import Database
from pymongo.collection import Collection

from app.config import settings

logger = logging.getLogger("medverify.database")

_client: MongoClient | None = None
_db: Database | None = None


def get_client() -> MongoClient:
    global _client
    if _client is None:
        _client = MongoClient(
            settings.mongodb_uri,
            tz_aware=True,
            serverSelectionTimeoutMS=2000,
            connectTimeoutMS=2000,
            socketTimeoutMS=5000,
        )
    return _client


def close_client() -> None:
    """Safely terminate client connections during shutdown or reset."""
    global _client, _db
    if _client is not None:
        try:
            _client.close()
        except Exception:
            pass
        _client = None
        _db = None


def get_db() -> Database:
    global _db
    if _db is None:
        _db = get_client()[settings.database_name]
    return _db


def check_database_health() -> tuple[bool, str, float]:
    """
    Ping MongoDB to verify database connectivity.
    Returns (is_connected, db_name_or_error, latency_ms).
    """
    start = time.perf_counter()
    try:
        client = get_client()
        client.admin.command("ping")
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        return True, settings.database_name, latency_ms
    except Exception as exc:
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        return False, str(exc), latency_ms


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


def uploaded_images_col() -> Collection:
    return get_db()["uploaded_images"]


def image_analyses_col() -> Collection:
    return get_db()["image_analyses"]


def cabinet_col() -> Collection:
    return get_db()["medicine_cabinet"]


# ---------------------------------------------------------------------------
# Index creation — idempotent, safe to call on every startup
# ---------------------------------------------------------------------------

def ensure_indexes() -> bool:
    """Ensure database indexes exist. Resilient to transient startup database outages."""
    try:
        medicines_col().create_index([("product_identifier", ASCENDING)], unique=True)
        medicines_col().create_index([("batch_number", ASCENDING)])
        medicines_col().create_index([("serial_number", ASCENDING)])
        medicines_col().create_index([("manufacturer.id", ASCENDING)])

        verifications_col().create_index([("created_at", -1)])
        verifications_col().create_index([("user_id", ASCENDING), ("created_at", -1)])
        verifications_col().create_index([("status", ASCENDING)])
        verifications_col().create_index([("raw_identifier", ASCENDING)])
        verifications_col().create_index([("parsed_data.serial_number", ASCENDING), ("status", ASCENDING)])

        users_col().create_index([("email", ASCENDING)], unique=True)

        uploaded_images_col().create_index([("user_id", ASCENDING), ("created_at", -1)])
        uploaded_images_col().create_index([("batch_id", ASCENDING)])

        image_analyses_col().create_index([("user_id", ASCENDING), ("created_at", -1)])
        image_analyses_col().create_index([("batch_id", ASCENDING)])

        cabinet_col().create_index([("id", ASCENDING)], unique=True)
        cabinet_col().create_index([("user_id", ASCENDING), ("created_at", -1)])
        return True
    except Exception as exc:
        logger.warning("Could not initialize MongoDB indexes during startup: %s", exc)
        return False
