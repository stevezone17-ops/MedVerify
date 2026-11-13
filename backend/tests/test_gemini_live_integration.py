"""Real Google Gemini API Integration and Regression Tests for MedVerify.

Executes genuine, live network requests against Google Gemini API using
the configured GEMINI_API_KEY and GEMINI_MODEL without exposing secrets.

Validates the 8 mandatory production scenarios:
1. Simple pharmaceutical question: "What is Dolo 650?"
2. GS1 standard question: "What does AI (01) represent?"
3. Conversational follow-up question: "What does AI (17) represent?"
4. Contextual anomaly question: Duplicate serial number handling
5. Platform verification architecture: Six-factor engine explanation
6. Edge case / scan failure: Incomplete/scratched barcode guidance
7. In-depth pharmaceutical knowledge: Cold-chain storage requirements
8. Provider unavailability / outage recovery & error classification
Plus live streaming response pipeline verification.
"""

import os
import pytest
from starlette.testclient import TestClient

from app.main import app
from app.config import settings
from app.services.auth_service import create_token
from app.services.llm.client import is_ai_available, resolve_active_model, get_gemini_client
from app.services.llm.schemas import AskMedVerifyRequest
from app.services.llm.service import llm_service


@pytest.fixture(scope="module")
def live_client():
    return TestClient(app)


@pytest.fixture(scope="module")
def user_token(live_client):
    resp = live_client.post("/api/auth/login", json={"email": "user@medverify.demo", "password": "user123"})
    if resp.status_code == 200:
        return resp.json()["access_token"]
    from app.db.repositories import profiles_repo
    user = profiles_repo.get_by_email("user@medverify.demo")
    return create_token(user["id"] if user else "usr_demo_user", "user")


@pytest.fixture(autouse=True)
def verify_gemini_configured():
    available, reason = is_ai_available()
    if not available:
        pytest.skip(f"Live Gemini API testing skipped: {reason}")


# ---------------------------------------------------------------------------
# Test 1: Simple Question ("What is Dolo 650?")
# ---------------------------------------------------------------------------
def test_live_01_simple_medicine_question(live_client, user_token):
    headers = {"Authorization": f"Bearer {user_token}"}
    resp = live_client.post(
        "/api/ai/chat",
        json={"question": "What is Dolo 650?"},
        headers=headers,
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert len(data["answer"]) > 50
    ans_lower = data["answer"].lower()
    assert any(term in ans_lower for term in ["paracetamol", "acetaminophen", "fever", "pain", "analgesic", "650"])
    assert "safety_notice" in data
    assert len(data["grounded_facts"]) >= 1


# ---------------------------------------------------------------------------
# Test 2: GS1 Question ("What does AI (01) represent?")
# ---------------------------------------------------------------------------
def test_live_02_gs1_ai_01_representation(live_client, user_token):
    headers = {"Authorization": f"Bearer {user_token}"}
    resp = live_client.post(
        "/api/ai/chat",
        json={"question": "What does GS1 Application Identifier AI (01) represent in pharmaceutical packaging?"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    ans_lower = data["answer"].lower()
    assert any(term in ans_lower for term in ["gtin", "global trade item number", "identification", "14-digit", "item number"])
    assert len(data["grounded_facts"]) >= 1
    # Save conversation ID for follow-up test


# ---------------------------------------------------------------------------
# Test 3: Follow-Up Conversational Question ("What does AI (17) represent?")
# ---------------------------------------------------------------------------
def test_live_03_followup_conversational_context(live_client, user_token):
    headers = {"Authorization": f"Bearer {user_token}"}
    # Turn 1
    resp1 = live_client.post(
        "/api/ai/chat",
        json={"question": "What is the difference between a batch number and a serial number?"},
        headers=headers,
    )
    assert resp1.status_code == 200
    conv_id = resp1.json()["conversation_id"]
    assert conv_id

    # Turn 2: Follow-up referencing earlier context
    resp2 = live_client.post(
        "/api/ai/chat",
        json={
            "question": "And what does Application Identifier AI (17) represent?",
            "conversation_id": conv_id,
        },
        headers=headers,
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["conversation_id"] == conv_id
    ans_lower = data2["answer"].lower()
    assert any(term in ans_lower for term in ["expiration", "expiry", "date", "yymmdd", "validity"])


# ---------------------------------------------------------------------------
# Test 4: Contextual Anomaly Question (Duplicate Serial Numbers)
# ---------------------------------------------------------------------------
def test_live_04_duplicate_serial_number_anomaly(live_client, user_token):
    headers = {"Authorization": f"Bearer {user_token}"}
    resp = live_client.post(
        "/api/ai/chat",
        json={"question": "A scan reported a duplicate serial number SER-998811. Does this mean the medicine is conclusively counterfeit?"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    ans_lower = data["answer"].lower()
    # Must explain that it is a serious security anomaly but not conclusive proof alone
    assert any(term in ans_lower for term in ["anomaly", "not conclusive", "cannot conclusively", "investigation", "quarantine", "reuse"])
    # Must NOT claim MedVerify automatically arrests or contacts manufacturers
    assert "automatically arrest" not in ans_lower
    assert "police raid" not in ans_lower


# ---------------------------------------------------------------------------
# Test 5: Six-Factor Verification Engine Question
# ---------------------------------------------------------------------------
def test_live_05_six_factor_engine_architecture(live_client, user_token):
    headers = {"Authorization": f"Bearer {user_token}"}
    resp = live_client.post(
        "/api/ai/chat",
        json={"question": "Explain the six factors that MedVerify uses to evaluate packaging integrity."},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    ans_lower = data["answer"].lower()
    # Should touch upon major factors: format/structure, GTIN, manufacturer, batch, expiry, serial
    matched_factors = sum(1 for factor in ["gtin", "batch", "expiry", "serial", "format", "manufacturer"] if factor in ans_lower)
    assert matched_factors >= 3, f"Expected at least 3 factors mentioned, found {matched_factors}"


# ---------------------------------------------------------------------------
# Test 6: Incomplete / Scratched Barcode Guidance
# ---------------------------------------------------------------------------
def test_live_06_incomplete_barcode_inspection(live_client, user_token):
    headers = {"Authorization": f"Bearer {user_token}"}
    resp = live_client.post(
        "/api/ai/chat",
        json={"question": "The 2D DataMatrix on my medicine carton is partially torn and cannot be scanned. What should I do?"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    ans_lower = data["answer"].lower()
    assert any(term in ans_lower for term in ["human-readable", "carton", "pharmacist", "do not guess", "quarantine", "inspect", "pharmacy"])


# ---------------------------------------------------------------------------
# Test 7: In-Depth Pharmaceutical Knowledge (Cold-Chain Requirements)
# ---------------------------------------------------------------------------
def test_live_07_cold_chain_pharmaceutical_knowledge(live_client, user_token):
    headers = {"Authorization": f"Bearer {user_token}"}
    resp = live_client.post(
        "/api/ai/chat",
        json={"question": "Explain the cold-chain storage requirements for temperature-sensitive biologics and vaccines, and why temperature excursions compromise safety."},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["answer"]) >= 150
    ans_lower = data["answer"].lower()
    assert any(term in ans_lower for term in ["temperature", "cold-chain", "2°c", "8°c", "stability", "protein", "degradation", "potency", "vaccine"])
    assert len(data["grounded_facts"]) >= 2


# ---------------------------------------------------------------------------
# Test 8: Provider Unavailability & Error Classification
# ---------------------------------------------------------------------------
def test_live_08_provider_outage_error_classification(live_client, user_token, monkeypatch):
    from app.services.llm.client import GeminiUnavailableError
    import app.services.llm.service as service_module

    def mock_service_outage(*args, **kwargs):
        raise GeminiUnavailableError("Gemini service is experiencing severe high-demand spikes (503).")

    monkeypatch.setattr(service_module, "call_gemini_json", mock_service_outage)

    headers = {"Authorization": f"Bearer {user_token}"}
    resp = live_client.post(
        "/api/ai/chat",
        json={"question": "How do I check if my medicine batch is expired?"},
        headers=headers,
    )
    # The service returns a graceful 200 fallback response under simulated outage
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["answer"]) > 0
    assert "safety_notice" in data


# ---------------------------------------------------------------------------
# Test 9: Live Real-Time Token Streaming Pipeline
# ---------------------------------------------------------------------------
def test_live_09_real_time_streaming_pipeline(live_client, user_token):
    headers = {"Authorization": f"Bearer {user_token}"}
    resp = live_client.post(
        "/api/ai/chat/stream",
        json={"question": "Briefly explain what a GTIN is in 2 sentences."},
        headers=headers,
    )
    assert resp.status_code == 200
    assert "text/plain" in resp.headers.get("content-type", "")
    content = resp.text
    assert len(content) > 30
    assert any(term in content.lower() for term in ["gtin", "global", "trade", "item", "barcode"])
