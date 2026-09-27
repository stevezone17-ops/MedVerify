# MedVerify — Comprehensive Testing & Quality Assurance Guide

## 1. Automated Test Suite Structure

MedVerify features a comprehensive automated test suite in `backend/tests/`:

- `test_api.py`: Core FastAPI endpoint integration tests.
- `test_qr_parser.py`: GS1 Application Identifier (AI), plain string, and JSON payload parsing.
- `test_scoring.py`: 6-factor deterministic confidence scoring and penalty rules.
- `test_supabase_migration.py`: End-to-end regression tests verifying Supabase data models, GS1 scanning, RBAC permissions, and timestamps.

---

## 2. Running Automated Tests

```bash
cd backend
pytest
```

**Test Coverage Summary:**
- Total Tests: **29 Passed (100%)**
- Execution Duration: **~3.7s**

---

## 3. Critical Verification Regression Scenarios

### Scenario 1: Canonical Production Medicine Scan
- **Input Payload:** `(01)89012345678901(10)BATCH-2026-001(17)280109(21)SER-PC-000001`
- **Expected Status:** `VERIFIED`
- **Expected Confidence:** `85%`
- **Expected Product:** Amoxicillin 500 mg Capsules
- **Expected Manufacturer:** PharmaCore Laboratories

### Scenario 2: Expired Product Flagging
- **Input Payload:** `89012345678908`
- **Expected Status:** `REVIEW`
- **Issue Flagged:** "Product has passed its expiry date."

### Scenario 3: Unknown / Unregistered Product
- **Input Payload:** `99999999999999`
- **Expected Status:** `NOT_FOUND`
- **Expected Confidence:** `0%`

### Scenario 4: Counterfeit Batch Mismatch
- **Input Payload:** `{"pid":"89012345678902","batch":"FAKE-BATCH-999","serial":"SER-MS-000012"}`
- **Expected Status:** `SUSPICIOUS`
- **Issue Flagged:** "Scanned batch does not match registered manufacturing batch."

### Scenario 5: Serial Number Reuse / Anti-Replay
- **Input Payload:** Re-using a previously verified unique serial number from another user.
- **Expected Status:** `SUSPICIOUS`
- **Issue Flagged:** "Serial reuse detected across unauthorized accounts."

---

## 4. Frontend Production Build Validation

```bash
cd frontend
npm run build
```

**Build Checks:**
- TypeScript strict typecheck (`tsc -b`): **Passed**
- Vite production chunking: **Passed**
- Bundle size & tree-shaking: **Optimized**
