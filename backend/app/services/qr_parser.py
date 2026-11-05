"""QR / barcode payload parser.

The frontend decodes the raw QR/barcode image into a string and sends it
to the backend. This module normalises the decoded string into a structured
dictionary of fields that the verification engine can compare against the
medicine registry.

Supported formats:
  • Plain product identifier (numeric string)
  • JSON payload {"pid": "...", "batch": "...", "serial": "..."}
  • Pipe-delimited PID|BATCH|SERIAL|EXPIRY
  • GS1 Digital Link style (01)GTIN(10)BATCH(21)SERIAL(17)EXPIRY
  • Raw GS1 element string 01<gtin>17<yymmdd>10<batch>^21<serial>
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

    Returns a dict with at minimum ``product_identifier``. Additional
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

    # ----- attempt unparenthesized GS1 DataMatrix (raw AI) -----
    if raw.startswith("01") and len(raw) >= 16:
        parsed_raw = _parse_raw_gs1(raw)
        if parsed_raw:
            return parsed_raw

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


def _parse_raw_gs1(raw: str) -> Optional[dict]:
    """Parse unparenthesized raw GS1 element string (e.g. from 2D DataMatrix with FNC1)."""
    s = raw.replace("\x1d", "^").replace("\x1e", "^")
    result: dict = {}
    i = 0
    n = len(s)

    while i < n:
        if s[i] == "^":
            i += 1
            continue

        prefix2 = s[i : i + 2]
        if prefix2 == "01":  # GTIN: 14 numeric digits
            val = s[i + 2 : i + 16]
            if len(val) == 14 and val.isdigit():
                result["product_identifier"] = val
                i += 16
                continue
            else:
                break
        elif prefix2 == "17":  # Expiry date: 6 numeric digits (YYMMDD)
            val = s[i + 2 : i + 8]
            if len(val) == 6 and val.isdigit():
                result["expiry_date"] = _format_gs1_date(val)
                i += 8
                continue
            else:
                break
        elif prefix2 == "11":  # Mfg date: 6 numeric digits
            val = s[i + 2 : i + 8]
            if len(val) == 6 and val.isdigit():
                result["manufacturing_date"] = _format_gs1_date(val)
                i += 8
                continue
            else:
                break
        elif prefix2 in ("10", "21"):  # Variable length up to 20 chars or until ^
            field_name = "batch_number" if prefix2 == "10" else "serial_number"
            next_sep = s.find("^", i + 2)
            if next_sep != -1:
                val = s[i + 2 : next_sep]
                i = next_sep + 1
            else:
                val = s[i + 2 : i + 22]
                i = len(s)
            result[field_name] = val.strip()
            continue
        else:
            break

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


def compare_ocr_with_barcode(ocr_fields: dict, barcode_fields: dict) -> tuple[bool, list[str]]:
    """Compare OCR-extracted printed packaging details against decoded GS1 barcode fields.
    
    Identifies discrepancies between what is printed on the physical carton and
    what is encoded in the 2D DataMatrix / QR barcode.
    Returns (has_mismatch, mismatch_descriptions).
    """
    mismatches: list[str] = []

    # 1. Compare Batch Number
    ocr_batch = str(ocr_fields.get("batch_number") or "").strip().upper()
    barcode_batch = str(barcode_fields.get("batch_number") or "").strip().upper()
    if ocr_batch and barcode_batch:
        norm_ocr_batch = re.sub(r"[\s\-_]", "", ocr_batch)
        norm_bar_batch = re.sub(r"[\s\-_]", "", barcode_batch)
        if norm_ocr_batch != norm_bar_batch:
            mismatches.append(
                f"Batch number mismatch: Printed packaging indicates '{ocr_batch}' but barcode encodes '{barcode_batch}'."
            )

    # 2. Compare GTIN / Product Identifier
    ocr_gtin = "".join(c for c in str(ocr_fields.get("gtin") or ocr_fields.get("product_identifier") or "") if c.isdigit())
    barcode_gtin = "".join(c for c in str(barcode_fields.get("product_identifier") or barcode_fields.get("gtin") or "") if c.isdigit())
    if ocr_gtin and barcode_gtin:
        pad_ocr = ocr_gtin.zfill(14)
        pad_bar = barcode_gtin.zfill(14)
        if pad_ocr != pad_bar:
            mismatches.append(
                f"GTIN mismatch: Printed packaging shows GTIN '{ocr_gtin}' but barcode encodes '{barcode_gtin}'."
            )

    # 3. Compare Expiration Date
    ocr_exp = str(ocr_fields.get("expiry_date") or "").strip()
    barcode_exp = str(barcode_fields.get("expiry_date") or "").strip()
    if ocr_exp and barcode_exp:
        ocr_digits = "".join(c for c in ocr_exp if c.isdigit())
        bar_digits = "".join(c for c in barcode_exp if c.isdigit())
        if len(ocr_digits) >= 6 and len(bar_digits) >= 6:
            if ocr_digits[:6] != bar_digits[:6]:
                mismatches.append(
                    f"Expiration date mismatch: Printed package shows '{ocr_exp}' but barcode encodes '{barcode_exp}'."
                )

    # 4. Compare Serial Number
    ocr_serial = str(ocr_fields.get("serial_number") or "").strip().upper()
    barcode_serial = str(barcode_fields.get("serial_number") or "").strip().upper()
    if ocr_serial and barcode_serial:
        norm_ocr_ser = re.sub(r"[\s\-_]", "", ocr_serial)
        norm_bar_ser = re.sub(r"[\s\-_]", "", barcode_serial)
        if norm_ocr_ser != norm_bar_ser:
            mismatches.append(
                f"Serial number mismatch: Printed serial '{ocr_serial}' does not match barcode serial '{barcode_serial}'."
            )

    return len(mismatches) > 0, mismatches
