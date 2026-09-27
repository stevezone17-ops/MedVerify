# MedVerify — Supabase Backend Migration Plan

## 1. Executive Summary & Architecture Overview

MedVerify is a production-grade counterfeit medicine detection and verification platform utilizing GS1 2D DataMatrix/QR decoding, cryptographic cross-checking, explainable confidence scoring, role-based workflows (Admin vs Pharmacist/Consumer), and forensic auditing.

This document details the complete end-to-end migration of persistent storage and authentication from **MongoDB** to **Supabase PostgreSQL**, while preserving FastAPI as the authoritative verification engine and business logic layer.

### Target Architecture

```
[ Camera / Scanner / Manual Input ]
               ↓
    [ React / Vite Frontend ]
               ↓ (JWT Bearer Token / HTTPS)
       [ FastAPI Backend ]
        ├── GS1 & QR Parsing
        ├── Verification Engine (Confidence Scoring)
        ├── Normalized Cryptographic Cross-Check
        └── Repository Layer (db/repositories/*)
               ↓ (PostgREST / Supabase Client / Service Role)
    [ Supabase PostgreSQL + Auth + Realtime + Storage ]
        ├── PostgreSQL (Relational Tables + Strict Foreign Keys + Indexes)
        ├── Row Level Security (RLS) policies
        ├── Supabase Auth (JWT Verification)
        └── Supabase Realtime (Admin Live Activity Stream)
```

---

## 2. Current MongoDB Architecture

The existing MongoDB database (`medicine_verification`) utilizes 4 core collections:
- `medicines`: Canonical medicine specifications with embedded manufacturer subdocuments.
- `verifications`: Full forensic verification results including input payload, parsed attributes, check matrix, confidence score, medicine summary snapshot, and timestamp.
- `users`: User profiles with bcrypt hashed passwords and role flags (`admin`, `user`).
- `audit_logs`: Append-only event trail of verification actions.

### Existing Limitations of MongoDB in this Setup:
- No enforced relational constraints between medicines, batches, and verification events.
- Client-side or application-level enforcement of batch uniqueness.
- Lack of database-native Row Level Security (RLS).
- Realtime streaming required polling or custom websocket server.

---

## 3. Current Collections & Proposed PostgreSQL Tables

| MongoDB Collection | Proposed Supabase Table | Purpose |
| :--- | :--- | :--- |
| `users` | `profiles` | User identity, email, display name, role (`ADMIN`, `USER`), status. Syncs with `auth.users`. |
| `medicines` | `medicines` | Canonical drug registry (GTIN, brand name, generic name, manufacturer, dosage, form). |
| `medicines` (embedded batch) | `medicine_batches` | Relational 1-to-N batches per medicine with expiration dates, manufacturing dates, and status. |
| `verifications` | `verification_records` | Authoritative verification history, confidence score, verdict, method, check details. |
| `audit_logs` | `verification_events` | Granular telemetry events across optical capture, GS1 parsing, registry lookup, verdict. |
| *New* | `reports` | Suspicious medicine and verification concern reports flagged by users/pharmacists. |
| *New* | `medicine_cabinet` | User-scoped personal medicine tracking and authenticity monitoring. |
| *New* | `notification_preferences` | User alert and recall notification settings. |
| *New* | `admin_activity` | Audit log of administrative registry changes, user status toggles, and demo runs. |
| *New* | `benchmark_runs` | Performance and accuracy telemetry runs for regulatory certification. |

---

## 4. Comprehensive Field Mappings

### 4.1. `users` → `profiles`
```
MongoDB (users)                        Supabase PostgreSQL (profiles)
------------------------------------   -------------------------------------------------
_id (str: "user_xxx")                  id (UUID, matches auth.users.id)
email (str)                            email (TEXT UNIQUE NOT NULL)
name (str)                             full_name (TEXT NOT NULL)
role (str: "admin"|"user")             role (TEXT CHECK (role IN ('ADMIN', 'USER', 'admin', 'user')))
status (str: "active"|"disabled")      status (TEXT DEFAULT 'active')
password_hash (str)                    Managed natively via Supabase Auth (or fallback)
created_at (datetime)                  created_at (TIMESTAMPTZ DEFAULT now())
updated_at (datetime)                  updated_at (TIMESTAMPTZ DEFAULT now())
[None]                                 avatar_url (TEXT)
[None]                                 last_login_at (TIMESTAMPTZ)
```

### 4.2. `medicines` → `medicines` + `medicine_batches`
```
MongoDB (medicines)                    Supabase PostgreSQL (medicines & medicine_batches)
------------------------------------   -------------------------------------------------
_id (str: "med_xxx")                   medicines.id (UUID DEFAULT gen_random_uuid())
                                       medicines.legacy_id (TEXT, e.g. "med_001")
product_identifier (str, GTIN)         medicines.gtin (TEXT UNIQUE NOT NULL)
product_name (str)                     medicines.product_name (TEXT NOT NULL)
manufacturer.id (str)                  medicines.manufacturer_id (TEXT)
manufacturer.name (str)                medicines.manufacturer_name (TEXT NOT NULL)
dosage (str)                           medicines.dosage (TEXT)
package_size (str)                     medicines.package_size (TEXT)
status (str)                           medicines.status (TEXT DEFAULT 'active')
created_at (datetime)                  medicines.created_at (TIMESTAMPTZ DEFAULT now())
updated_at (datetime)                  medicines.updated_at (TIMESTAMPTZ DEFAULT now())

batch_number (str)             ───►    medicine_batches.batch_number (TEXT NOT NULL)
serial_number (str)            ───►    medicine_batches.serial_number (TEXT)
manufacturing_date (str)       ───►    medicine_batches.manufacturing_date (TEXT/DATE)
expiry_date (str)              ───►    medicine_batches.expiry_date (TEXT/DATE NOT NULL)
                                       medicine_batches.medicine_id (UUID -> medicines.id)
                                       UNIQUE (medicine_id, batch_number)
```

### 4.3. `verifications` → `verification_records`
```
MongoDB (verifications)                Supabase PostgreSQL (verification_records)
------------------------------------   -------------------------------------------------
_id (str: "vrf_xxx")                   id (UUID DEFAULT gen_random_uuid())
                                       legacy_id (TEXT, e.g. "vrf_53c709af05d0")
user_id (str)                          user_id (UUID REFERENCES profiles(id) ON DELETE SET NULL)
user_email (str)                       user_email (TEXT)
user_name (str)                        user_name (TEXT)
raw_identifier (str)                   raw_identifier (TEXT NOT NULL)
input_type (str: "qr"|"manual"|...)    verification_method (TEXT: 'QR'|'DATAMATRIX'|'BARCODE'|'PACKAGING_OCR'|'MANUAL'|'NFC')
status (str)                           verification_status (TEXT NOT NULL)
confidence_score (int)                 confidence (INTEGER NOT NULL)
checks (list[dict])                    checks (JSONB DEFAULT '[]')
issues (list[str])                     issues (JSONB DEFAULT '[]')
parsed_data (dict)                     parsed_data (JSONB DEFAULT '{}')
parsed_data.product_identifier (str)   gtin (TEXT)
parsed_data.batch_number (str)         batch_number (TEXT)
parsed_data.serial_number (str)        serial_number (TEXT)
parsed_data.expiry_date (str)          expiry_date (TEXT)
medicine (dict)                        medicine_summary (JSONB DEFAULT '{}')
matched_medicine_id (str)              medicine_id (UUID REFERENCES medicines(id))
created_at (datetime)                  created_at (TIMESTAMPTZ DEFAULT now())
[derived]                              processing_time_ms (INTEGER DEFAULT 45)
[derived]                              registry_match (BOOLEAN)
[derived]                              manufacturer_match (BOOLEAN)
[derived]                              batch_valid (BOOLEAN)
[derived]                              expiry_valid (BOOLEAN)
[derived]                              serial_valid (BOOLEAN)
```

---

## 5. API Changes & Compatibility Strategy

**Rule: ZERO broken frontend API contracts.**
All endpoints currently in use by React/Vite remain backwards-compatible:
- `POST /api/verify` -> returns `VerificationResult`
- `GET /api/verifications` & `GET /api/verifications/{id}` -> returns paginated history / detail
- `GET /api/user/history`, `/api/user/recent`, `/api/user/stats`, `/api/user/profile` -> return user-scoped metrics
- `GET /api/medicines` & `GET /api/medicines/{gtin}` -> returns medicines
- `GET /api/admin/analytics`, `/api/admin/system-health`, `/api/admin/audit`, `/api/admin/users` -> returns admin command center data

Behind the scenes, the FastAPI data access layer transitions from `app.database` collection accessors to repository classes in `app.db.repositories.*`, backed by the Supabase client.

---

## 6. Authentication Changes

1. **Dual-Mode Verification Support**:
   - The FastAPI backend validates both Supabase Auth JWT tokens (`aud: authenticated`, signed by Supabase JWT secret or verified against Supabase Auth API) AND native HMAC-SHA256 JWT tokens.
   - This ensures 100% uninterrupted local test suite compatibility and seamless production Supabase Auth sign-ins.
2. **Server-Side Role Enforcement**:
   - Role is resolved authoritatively from the `profiles` table or Supabase user metadata.
   - Normal users are prohibited from querying admin routes, even if tampering with client storage occurs.
3. **Security**:
   - `SUPABASE_SERVICE_ROLE_KEY` is loaded exclusively inside FastAPI (`backend/.env`).
   - The frontend Vite client receives ONLY `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

---

## 7. Row Level Security (RLS) Strategy

All user-sensitive tables have RLS enabled:
- `profiles`:
  - SELECT: authenticated users can read their own profile; admins can read all profiles.
  - UPDATE: users can update their own profile; admins can update all profiles.
- `verification_records`:
  - SELECT: users can SELECT only records where `auth.uid() = user_id`; admins can SELECT all records.
  - INSERT: authenticated users or service role can insert.
- `medicine_cabinet`:
  - ALL: users can only SELECT/INSERT/UPDATE/DELETE records where `auth.uid() = user_id`.
- `reports`:
  - SELECT: users see their own submitted reports; admins see all reports.
  - INSERT: users can create reports.
- `medicines` & `medicine_batches`:
  - SELECT: public / authenticated read access.
  - INSERT/UPDATE/DELETE: admin only.
- `admin_activity` & `benchmark_runs`:
  - ALL: admin only.

---

## 8. Migration Strategy

1. **Phase 1**: Audit existing architecture and generate migration blueprint.
2. **Phase 2**: Define comprehensive PostgreSQL relational schema with UUID primary keys and JSONB payload backups.
3. **Phase 3**: Create idempotent SQL migrations in `supabase/migrations/`.
4. **Phase 4**: Implement the repository pattern (`app/db/repositories/`) in FastAPI:
   - `profiles_repo.py`
   - `medicines_repo.py`
   - `batches_repo.py`
   - `verifications_repo.py`
   - `reports_repo.py`
   - `cabinet_repo.py`
5. **Phase 5**: Create database client provider (`app/db/supabase_client.py`) with support for both Supabase cloud / local PostgreSQL and MongoDB fallback/coexistence during transition.
6. **Phase 6**: Update FastAPI routes to use repositories.
7. **Phase 7**: Provide migration script (`backend/scripts/migrate_mongodb_to_supabase.py`) with `--dry-run` flag.
8. **Phase 8**: Validate end-to-end scanner payload:
   `(01)89012345678901(10)BATCH-2026-001(17)280109(21)SER-PC-000001`.
9. **Phase 9**: Execute full automated test suite (`pytest`) and frontend production build (`npm run build`).

---

## 9. Risk Analysis & Mitigations

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| Network latency to remote Supabase DB | Medium | Use optimized connection pooling, select only needed columns, maintain indexed queries. |
| Missing Supabase credentials in local dev | High | Implement graceful client abstraction that falls back to existing local storage or mocks safely during CI/test runs. |
| Breaking changes in GS1 scanner pipeline | Critical | Keep GS1 parser and verification engine pure Python/TS functions; do not touch barcode decoding logic. |
| Incompatible date formats | Medium | Standardize all timestamps on ISO-8601 UTC with `Z` suffix. Store as `TIMESTAMPTZ` in Postgres. |

---

## 10. Rollback Strategy

1. MongoDB collections are never deleted or truncated during migration.
2. The database client abstraction supports toggling back to MongoDB via configuration (`DATABASE_BACKEND=mongodb` vs `DATABASE_BACKEND=supabase`).
3. Verification results and history are stored with legacy IDs for full bi-directional mapping.
