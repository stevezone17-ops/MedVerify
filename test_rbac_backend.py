import urllib.request
import urllib.error
import json

def api_call(path, method="GET", data=None, token=None):
    url = f"http://127.0.0.1:8000{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except:
            return e.code, body

# 1. Login Admin
status, admin_auth = api_call("/api/auth/login", "POST", {"email": "admin@medverify.demo", "password": "admin123"})
print(f"Admin Login: {status} | Role: {admin_auth.get('user', {}).get('role')}")
admin_token = admin_auth["access_token"]

# 2. Login User
status, user_auth = api_call("/api/auth/login", "POST", {"email": "user@medverify.demo", "password": "user123"})
print(f"User Login: {status} | Role: {user_auth.get('user', {}).get('role')}")
user_token = user_auth["access_token"]

# 3. Test Admin accessing Admin endpoints
status, health_data = api_call("/api/admin/system-health", token=admin_token)
print(f"Admin -> /api/admin/system-health: {status} | DB Latency: {health_data.get('components', {}).get('database', {}).get('latency_ms')}ms")

status, users_data = api_call("/api/admin/users", token=admin_token)
print(f"Admin -> /api/admin/users: {status} | Users count: {users_data.get('total')}")

status, audit_data = api_call("/api/admin/audit", token=admin_token)
print(f"Admin -> /api/admin/audit: {status} | Audit items: {audit_data.get('total')}")

# 4. Test User attempting Admin endpoints (Must receive 403 Forbidden!)
status, err = api_call("/api/admin/users", token=user_token)
print(f"User -> /api/admin/users: {status} (Expected 403) | Detail: {err}")

status, err = api_call("/api/admin/system-health", token=user_token)
print(f"User -> /api/admin/system-health: {status} (Expected 403) | Detail: {err}")

# 5. Test User accessing User endpoints
status, user_stats = api_call("/api/user/stats", token=user_token)
print(f"User -> /api/user/stats: {status} | Stats: {user_stats}")

status, user_profile = api_call("/api/user/profile", token=user_token)
print(f"User -> /api/user/profile: {status} | Profile Name: {user_profile.get('name')}")
