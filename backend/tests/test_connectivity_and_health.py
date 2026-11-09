"""Backend Connectivity and Health Verification Regression Tests.

Ensures that:
- /health/live reports process liveness immediately without database dependencies.
- /health/ready accurately reflects database readiness and returns 200 or 503.
- Database recovery and reconnection functions operate reliably.
- CORS preflight and origin headers are correctly issued.
- Transient database exceptions return 503 rather than unhandled 500 errors.
"""

from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from pymongo.errors import ServerSelectionTimeoutError

from app.main import app
from app.database import check_database_health, ensure_indexes

client = TestClient(app)


def test_health_live_endpoint():
    """Verify liveness probe returns HTTP 200 with required schema."""
    for path in ("/health/live", "/api/health/live"):
        resp = client.get(path)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "alive"
        assert data["service"] == "medverify-api"
        assert "uptime_seconds" in data
        assert isinstance(data["uptime_seconds"], (int, float))
        assert "timestamp" in data


def test_health_ready_endpoint_real():
    """Verify readiness probe returns structured payload with database status."""
    for path in ("/health/ready", "/api/health/ready"):
        resp = client.get(path)
        assert resp.status_code in (200, 503)
        data = resp.json()
        assert data["status"] in ("ready", "unready")
        assert "database" in data
        assert "status" in data["database"]
        assert data["database"]["status"] in ("connected", "disconnected")


def test_health_ready_endpoint_degraded_simulation():
    """Verify readiness probe returns 503 Service Unavailable when database is simulated down."""
    mock_failure = (False, "ServerSelectionTimeoutError: connection refused", 2001.5)
    with patch("app.main.check_database_health", return_value=mock_failure):
        resp = client.get("/health/ready")
        assert resp.status_code == 503
        data = resp.json()
        assert data["status"] == "unready"
        assert data["database"]["status"] == "disconnected"
        assert "connection refused" in data["database"]["error"]
        assert data["database"]["latency_ms"] == 2001.5


def test_cors_headers_on_api():
    """Verify CORS allow-origin headers for frontend dev origin."""
    origin = "http://localhost:5173"
    resp = client.get("/api/health", headers={"Origin": origin})
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == origin
    assert resp.headers.get("access-control-allow-credentials") == "true"


def test_check_database_health_function():
    """Verify check_database_health function contract."""
    ok, detail, latency = check_database_health()
    assert isinstance(ok, bool)
    assert isinstance(detail, str)
    assert isinstance(latency, float)
    assert latency >= 0.0


def test_resilient_ensure_indexes_on_failure():
    """Verify ensure_indexes does not crash process on database failure."""
    with patch("app.database.medicines_col", side_effect=ServerSelectionTimeoutError("Mocked DB Down")):
        success = ensure_indexes()
        assert success is False


def test_pymongo_exception_handler_returns_503():
    """Verify unhandled PyMongoError returns 503 Service Unavailable instead of 500."""
    with patch("app.db.repositories.profiles_repo.get_by_email", side_effect=ServerSelectionTimeoutError("DB offline")):
        resp = client.post(
            "/api/auth/login",
            json={"email": "nonexistent@medverify.demo", "password": "password123"},
        )
        assert resp.status_code == 503
        data = resp.json()
        assert data["error"] == "database_unavailable"
        assert "temporarily unavailable" in data["detail"].lower()
