"""QR / barcode payload parser.

The frontend decodes the raw QR/barcode image into a string and sends it
to the backend.  This module normalises the decoded string into a structured
dictionary of fields that the verification engine can compare against the
medicine registry.

Supported formats (demo):
  • Plain product identifier (numeric string)
  • JSON payload  {"pid": "...", "batch": "...", "serial": "..."}
  • Pipe-delimited  PID|BATCH|SERIAL|EXPIRY
  • GS1 Digital Link style  (01)GTIN(10)BATCH(21)SERIAL(17)EXPIRY
"""

import json
import re
from typing import Optional


# GS1 Application Identifiers we care about
_GS1_AI = {
    "01": "product_identifier",  # GTIN
    "10": "batch_number",
    "21": "serial_number",
    "17": "expiry_date",
    "11": "manufacturing_date",
}

_GS1_PATTERN = re.compile(r"\((\d{2})\)([^()]+)")


def parse_identifier(raw: str) -> dict:
    """Parse a raw decoded string into a normalised field dictionary.

    Returns a dict with at minimum ``product_identifier``.  Additional
    fields are included when the payload format provides them.
    """

    raw = raw.strip()

    if not raw:
        return {}

    # ----- attempt JSON -----
    if raw.startswith("{"):
        return _parse_json(raw)

    # ----- attempt GS1 AI -----
    if "(" in raw and ")" in raw:
        parsed = _parse_gs1(raw)
        if parsed:
            return parsed

    # ----- attempt pipe-delimited -----
    if "|" in raw:
        return _parse_pipe(raw)

    # ----- fallback: treat entire string as product identifier -----
    return {"product_identifier": raw}


# ---------------------------------------------------------------------------
# Format-specific parsers
# ---------------------------------------------------------------------------

def _parse_json(raw: str) -> dict:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {"product_identifier": raw}

    mapping = {
        "pid": "product_identifier",
        "product_identifier": "product_identifier",
        "gtin": "product_identifier",
        "batch": "batch_number",
        "batch_number": "batch_number",
        "lot": "batch_number",
        "serial": "serial_number",
        "serial_number": "serial_number",
        "expiry": "expiry_date",
        "expiry_date": "expiry_date",
        "mfg_date": "manufacturing_date",
        "manufacturing_date": "manufacturing_date",
        "manufacturer": "manufacturer",
        "product_name": "product_name",
    }

    result: dict = {}
    for key, value in data.items():
        canonical = mapping.get(key.lower())
        if canonical:
            result[canonical] = str(value)

    return result if result.get("product_identifier") else {"product_identifier": raw}


def _format_gs1_date(val: str) -> str:
    if len(val) == 6 and val.isdigit():
        yy = int(val[:2])
        mm = val[2:4]
        dd = val[4:6]
        century = "19" if yy >= 50 else "20"
        day = "28" if dd == "00" else dd
        return f"{century}{val[:2]}-{mm}-{day}"
    return val


def _parse_gs1(raw: str) -> Optional[dict]:
    matches = _GS1_PATTERN.findall(raw)
    if not matches:
        return None

    result: dict = {}
    for ai, value in matches:
        field_name = _GS1_AI.get(ai)
        if field_name:
            val = value.strip()
            if ai in ("17", "11"):
                val = _format_gs1_date(val)
            result[field_name] = val

    return result if result.get("product_identifier") else None


def _parse_pipe(raw: str) -> dict:
    parts = [p.strip() for p in raw.split("|")]
    result: dict = {"product_identifier": parts[0]}

    if len(parts) > 1 and parts[1]:
        result["batch_number"] = parts[1]
    if len(parts) > 2 and parts[2]:
        result["serial_number"] = parts[2]
    if len(parts) > 3 and parts[3]:
        result["expiry_date"] = parts[3]

    return result
