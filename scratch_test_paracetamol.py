import urllib.request
import json

payload = {
    "identifier": "89012345678903",
    "batch_number": "BATCH-2026-108",
    "expiry_date": "2028-05-31"
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
    print("Medicine:", data.get("medicine", {}).get("brand_name") or data.get("medicine", {}).get("product_name"))
    print("Issues:", data.get("issues"))
    for c in data.get("checks", []):
        print(f"  {c.get('name')}: {c.get('status')} ({c.get('weight')} pts)")
