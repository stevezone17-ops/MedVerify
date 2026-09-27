"""Timestamp utilities for robust UTC handling across MongoDB, FastAPI, and Frontend."""

from datetime import datetime, timezone
from typing import Any


def normalize_datetime(val: Any) -> datetime | None:
    """Normalize any date/timestamp representation into a timezone-aware UTC datetime.
    
    Handles:
    - None / missing values
    - naive datetimes (assumed UTC from MongoDB)
    - timezone-aware datetimes (converted to UTC)
    - ISO-8601 strings (with or without 'Z' or offset)
    - invalid strings or types (returns None safely without raising)
    """
    if val is None:
        return None

    if isinstance(val, datetime):
        if val.tzinfo is None:
            return val.replace(tzinfo=timezone.utc)
        return val.astimezone(timezone.utc)

    if isinstance(val, str):
        s = val.strip()
        if not s:
            return None
        try:
            # Replace Z with +00:00 for fromisoformat compatibility across python versions
            if s.endswith("Z"):
                s = s[:-1] + "+00:00"
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                return dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except Exception:
            return None

    return None


def to_iso_utc(val: Any) -> str | None:
    """Convert any date/timestamp representation into an ISO-8601 UTC string ending in 'Z'.
    
    Example: '2026-09-28T02:52:24.000000Z'
    Returns None if the value is missing or unparseable.
    """
    dt = normalize_datetime(val)
    if dt is None:
        return None
    iso = dt.isoformat()
    if iso.endswith("+00:00"):
        return iso[:-6] + "Z"
    if not iso.endswith("Z"):
        return iso + "Z"
    return iso
