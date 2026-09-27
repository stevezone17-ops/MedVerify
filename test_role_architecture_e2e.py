import urllib.request
import urllib.error
import json

BASE_URL = "http://127.0.0.1:8000"

def request(path, method="GET", data=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            return resp.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except:
            return e.code, body

print("=" * 70)
print("MEDVERIFY — END-TO-END ROLE ARCHITECTURE & RBAC VERIFICATION")
print("=" * 70)

# ---------------------------------------------------------------------------
# TEST 1: Admin Login
# ---------------------------------------------------------------------------
status, admin_auth = request("/api/auth/login", "POST", {
    "email": "admin@medverify.demo",
    "password": "admin123"
})
assert status == 200, f"Expected 200, got {status}"
admin_token = admin_auth["access_token"]
admin_user = admin_auth["user"]
assert admin_user["role"] == "admin", f"Expected admin role, got {admin_user['role']}"
print(f"TEST 1 PASSED: Admin Login -> Role: {admin_user['role']} (Token received)")

# ---------------------------------------------------------------------------
# TEST 2: User Login
# ---------------------------------------------------------------------------
status, user_auth = request("/api/auth/login", "POST", {
    "email": "user@medverify.demo",
    "password": "user123"
})
assert status == 200, f"Expected 200, got {status}"
user_token = user_auth["access_token"]
user_info = user_auth["user"]
assert user_info["role"] == "user", f"Expected user role, got {user_info['role']}"
print(f"TEST 2 PASSED: User Login -> Role: {user_info['role']} (Token received)")

# ---------------------------------------------------------------------------
# TEST 3: User attempting Admin endpoints (Strict 403 Forbidden)
# ---------------------------------------------------------------------------
admin_endpoints = [
    ("/api/admin/users", "GET"),
    ("/api/admin/system-health", "GET"),
    ("/api/admin/audit", "GET"),
    ("/api/admin/analytics", "GET"),
    ("/api/admin/medicines", "GET"),
]

for endpoint, method in admin_endpoints:
    code, res = request(endpoint, method, token=user_token)
    assert code == 403, f"Expected 403 Forbidden for user on {endpoint}, got {code}"
    print(f"TEST 3 PASSED: User -> {endpoint} => 403 Forbidden ('{res.get('detail')}')")

# ---------------------------------------------------------------------------
# TEST 4: Admin accessing Admin endpoints (All 200 OK)
# ---------------------------------------------------------------------------
code, res_health = request("/api/admin/system-health", token=admin_token)
assert code == 200
print(f"TEST 4A PASSED: Admin -> /api/admin/system-health => 200 OK (DB Latency: {res_health['components']['database']['latency_ms']}ms)")

code, res_users = request("/api/admin/users", token=admin_token)
assert code == 200
print(f"TEST 4B PASSED: Admin -> /api/admin/users => 200 OK (Total Users: {res_users['total']})")

code, res_audit = request("/api/admin/audit", token=admin_token)
assert code == 200
print(f"TEST 4C PASSED: Admin -> /api/admin/audit => 200 OK (Global Records: {res_audit['total']})")

# ---------------------------------------------------------------------------
# TEST 5: User verification scan & personal attribution
# ---------------------------------------------------------------------------
code, verif_res = request("/api/verify", "POST", {
    "identifier": "89012345678901",
    "batch_number": "BATCH-2026-001",
    "expiry_date": "2028-01-09"
}, token=user_token)
assert code == 200
assert verif_res["status"] == "VERIFIED"
print(f"TEST 5 PASSED: User Verification => 200 OK (Status: {verif_res['status']}, Score: {verif_res['confidence_score']}%)")

# ---------------------------------------------------------------------------
# TEST 6: User personal stats & history isolation
# ---------------------------------------------------------------------------
code, user_stats = request("/api/user/stats", token=user_token)
assert code == 200
assert user_stats["user_id"] == str(user_info["id"])
assert user_stats["verified_count"] >= 1
print(f"TEST 6A PASSED: User Stats => 200 OK (Personal Verifications: {user_stats['total_verifications']}, Verified: {user_stats['verified_count']})")

code, user_history = request("/api/user/history", token=user_token)
assert code == 200
assert user_history["total"] >= 1
print(f"TEST 6B PASSED: User History => 200 OK (Personal History Items: {len(user_history['items'])})")

code, user_recent = request("/api/user/recent", token=user_token)
assert code == 200
assert len(user_recent["recent"]) >= 1
print(f"TEST 6C PASSED: User Recent => 200 OK (Recent Item: {user_recent['recent'][0]['product_name']})")

# ---------------------------------------------------------------------------
# TEST 7: Admin User Management (Create user, Toggle status, Role change)
# ---------------------------------------------------------------------------
import uuid
temp_email = f"test_{uuid.uuid4().hex[:6]}@clinic.org"
code, new_user = request("/api/admin/users", "POST", {
    "name": "Dr. Automated Test",
    "email": temp_email,
    "password": "password123",
    "role": "user"
}, token=admin_token)
assert code == 201
new_user_id = new_user["id"]
print(f"TEST 7A PASSED: Admin Created User => 201 Created (ID: {new_user_id}, Email: {temp_email})")

# Disable user
code, status_res = request(f"/api/admin/users/{new_user_id}/status", "PATCH", {
    "status": "disabled"
}, token=admin_token)
assert code == 200
print(f"TEST 7B PASSED: Admin Disabled User Account => 200 OK ({status_res['message']})")

# Verify disabled user cannot access protected endpoints (403 Forbidden)
# First login with disabled user
status_login, disabled_auth = request("/api/auth/login", "POST", {
    "email": temp_email,
    "password": "password123"
})
# User token issued, but when attempting endpoint with disabled account:
code_disabled_test, disabled_err = request("/api/user/stats", token=disabled_auth["access_token"])
assert code_disabled_test == 403, f"Expected 403 for disabled user, got {code_disabled_test}"
print(f"TEST 7C PASSED: Disabled User Request => 403 Forbidden ('{disabled_err.get('detail')}')")

# Re-enable user
code, status_res = request(f"/api/admin/users/{new_user_id}/status", "PATCH", {
    "status": "active"
}, token=admin_token)
assert code == 200
print(f"TEST 7D PASSED: Admin Re-enabled User Account => 200 OK")

# ---------------------------------------------------------------------------
# TEST 8: Unauthenticated access rejection
# ---------------------------------------------------------------------------
code, unauth_err = request("/api/user/stats")
assert code == 401, f"Expected 401 Unauthorized, got {code}"
print(f"TEST 8 PASSED: Unauthenticated Request => 401 Unauthorized ('{unauth_err.get('detail')}')")

print("\n" + "=" * 70)
print("ALL 8 END-TO-END ROLE ARCHITECTURE TESTS PASSED WITH 100% SUCCESS!")
print("=" * 70)
