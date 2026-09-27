import urllib.request
import json
import uuid

serial = f"SER-TEST-{uuid.uuid4().hex[:6]}"
payload = {
    "identifier": "89012345678901",
    "batch_number": "BATCH-2026-001",
    "expiry_date": "2028-01-09",
    "serial_number": serial
}

req = urllib.request.Request(
    "http://127.0.0.1:8000/api/verify",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)

with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode("utf-8"))
    print("Status:", data.get("status"))
    print("Confidence:", data.get("confidence_score"))
    print("Issues:", data.get("issues"))
    for c in data.get("checks", []):
        print(f"  {c.get('name')}: {c.get('status')} ({c.get('weight')} pts)")
