# MedVerify — API Specification

**Base API Path:** `/api`

---

## 1. Authentication Endpoints

### 1.1 Register New User
- **POST** `/api/auth/register`
- **Request Body:**
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "secure_password_123",
    "role": "user"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "user": {
      "id": "user_abc123",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "role": "user",
      "created_at": "2026-09-28T02:52:24.000Z"
    }
  }
  ```

### 1.2 User Login
- **POST** `/api/auth/login`
- **Request Body:**
  ```json
  {
    "email": "jane@example.com",
    "password": "secure_password_123"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "user": {
      "id": "user_abc123",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "role": "user"
    }
  }
  ```

### 1.3 Current User Profile
- **GET** `/api/auth/me`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):** UserResponse object.

---

## 2. Core Verification Endpoints

### 2.1 Verify Medicine Barcode / QR
- **POST** `/api/verify`
- **Headers:** Optional `Authorization: Bearer <token>` (records user attribution if logged in)
- **Request Body:**
  ```json
  {
    "identifier": "(01)89012345678901(10)BATCH-2026-001(17)280109(21)SER-PC-000001",
    "batch_number": null,
    "serial_number": null,
    "manufacturer": null,
    "product_name": null,
    "expiry_date": null
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "verification_id": "vrf_53c709af05d0",
    "input_type": "qr",
    "raw_identifier": "(01)89012345678901(10)BATCH-2026-001(17)280109(21)SER-PC-000001",
    "status": "VERIFIED",
    "confidence_score": 85,
    "checks": [
      {
        "name": "Product identifier",
        "field": "product_identifier",
        "status": "PASS",
        "weight": 30,
        "expected": "89012345678901",
        "actual": "89012345678901",
        "detail": null
      },
      {
        "name": "Batch number",
        "field": "batch_number",
        "status": "PASS",
        "weight": 20,
        "expected": "BATCH-2026-001",
        "actual": "BATCH-2026-001",
        "detail": null
      }
    ],
    "issues": [],
    "medicine": {
      "product_identifier": "89012345678901",
      "product_name": "Amoxicillin 500 mg Capsules",
      "manufacturer": "PharmaCore Laboratories",
      "batch_number": "BATCH-2026-001",
      "serial_number": "SER-PC-000001",
      "expiry_date": "2028-01-09",
      "dosage": "500 mg",
      "package_size": "10 capsules",
      "status": "active"
    },
    "created_at": "2026-09-28T02:52:24.017000Z"
  }
  ```

---

## 3. Verification History Endpoints

### 3.1 Public / General History
- **GET** `/api/verifications?page=1&limit=20&status=VERIFIED`
- **Response (200 OK):** Paginated verification history list.

### 3.2 Single Verification Detail
- **GET** `/api/verifications/{verification_id}`
- **Response (200 OK):** Full Forensic `VerificationResult` document.

---

## 4. User Personal Scope Endpoints

- **GET** `/api/user/history?page=1&limit=15&status=VERIFIED&search=Amoxicillin`
  - Headers: `Authorization: Bearer <token>`
  - Scoped strictly to authenticated user's records. Sorted by `created_at DESC`.
- **GET** `/api/user/recent?limit=5`
  - Returns recent 5 verifications with ISO-8601 UTC timestamps.
- **GET** `/api/user/stats`
  - Returns `total_verifications`, `verified_count`, `review_count`, `suspicious_count`, `not_found_count`.
- **GET** `/api/user/profile`
  - Returns user profile with `last_activity` timestamp.

---

## 5. Consumer Safety: Reports & Medicine Cabinet

### 5.1 Submit Verification Concern
- **POST** `/api/reports`
- **Headers:** `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "verification_id": "vrf_53c709af05d0",
    "report_type": "VERIFICATION_CONCERN",
    "description": "Packaging seal was loose upon purchase."
  }
  ```

### 5.2 Medicine Cabinet
- **POST** `/api/user/cabinet` (Save medicine to personal vault)
- **GET** `/api/user/cabinet` (List personal cabinet entries)
- **DELETE** `/api/user/cabinet/{cabinet_id}` (Remove entry)

---

## 6. Medicine Registry Endpoints

- **GET** `/api/medicines` (List all active registered medicines)
- **GET** `/api/medicines/{gtin}` (Lookup medicine by GTIN)

---

## 7. Admin Command Center Endpoints (Admin Only)

*All admin endpoints require `Authorization: Bearer <admin_token>`.*

- **GET** `/api/admin/analytics`: Global metrics, anomaly rate, status breakdown, and recent verifications.
- **GET** `/api/admin/system-health`: Real-time diagnostic telemetry for Supabase PostgreSQL, Verification Engine, Registry, and Auth.
- **GET** `/api/admin/audit`: System-wide verification audit trail with filtering and search.
- **GET** `/api/admin/medicines`: List all registered medicines (including inactive).
- **POST** `/api/admin/medicines`: Register a new canonical medicine.
- **PUT** `/api/admin/medicines/{id}`: Update medicine attributes.
- **DELETE** `/api/admin/medicines/{id}`: Soft-delete/deactivate medicine.
- **POST** `/api/admin/medicines/{id}/reactivate`: Reactivate medicine.
- **GET** `/api/admin/users`: List all platform user accounts.
- **POST** `/api/admin/users`: Create user account.
- **PATCH** `/api/admin/users/{user_id}/status`: Activate or disable account.
- **PATCH** `/api/admin/users/{user_id}/role`: Update role (`user` / `admin`).
- **GET** `/api/admin/reports`: List all user concern reports.
