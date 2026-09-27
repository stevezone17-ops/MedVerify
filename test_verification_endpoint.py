import urllib.request
import json

tests = [
    {
        "name": "Verified Amoxicillin (Matching Expiry 2028-01-09)",
        "payload": {
            "identifier": "89012345678901",
            "batch_number": "BATCH-2026-001",
            "expiry_date": "2028-01-09",
            "serial_number": "SER-PC-000001"
        }
    },
    {
        "name": "Verified Amoxicillin (Batch only, no expiry)",
        "payload": {
            "identifier": "89012345678901",
            "batch_number": "BATCH-2026-001"
        }
    },
    {
        "name": "Expired Ibuprofen (Registered 2025-07-09)",
        "payload": {
            "identifier": "89012345678908",
            "batch_number": "BATCH-2025-012",
            "expiry_date": "2025-07-09"
        }
    },
    {
        "name": "Suspicious Metformin (Fake Batch)",
        "payload": {
            "identifier": "89012345678902",
            "batch_number": "FAKE-BATCH-999"
        }
    },
    {
        "name": "Unregistered Code",
        "payload": {
            "identifier": "99999999999999"
        }
    }
]

for t in tests:
    req = urllib.request.Request(
        "http://127.0.0.1:8000/api/verify",
        data=json.dumps(t["payload"]).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"=== {t['name']} ===")
            print("Status:", data.get("status"), "| Confidence:", data.get("confidence_score"))
            for c in data.get("checks", []):
                print(f"  - {c.get('name')}: {c.get('status')} ({c.get('detail')})")
    except Exception as e:
        print(f"Error {t['name']}: {e}")
