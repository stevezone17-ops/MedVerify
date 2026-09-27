# MedVerify — Relational Data Model (Supabase PostgreSQL)

## 1. Schema Entity Relationship Diagram

```
[profiles]
   ▲
   │ 1:N
   ├────────────────────────┐
   │                        │
[verification_records]   [reports]
   │ 1:N                    │
   ▼                        ▼
[verification_events]    [medicine_cabinet]
   │                        ▲
   │                        │ 1:N
[medicines] ────────────► [medicine_batches]
```

---

## 2. Table Specifications

### 2.1. `profiles`
User identity and authorization table mapped with Supabase Auth (`auth.users`).

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY | Foreign key to `auth.users.id` or standalone UUID |
| `email` | TEXT | UNIQUE, NOT NULL | Account email |
| `full_name` | TEXT | NOT NULL | Display name |
| `role` | TEXT | CHECK IN ('USER', 'ADMIN', 'user', 'admin') | Server-enforced role |
| `status` | TEXT | DEFAULT 'active' CHECK ('active', 'disabled') | Account status |
| `avatar_url` | TEXT | NULL | Profile image link |
| `created_at` | TIMESTAMPTZ | DEFAULT now(), NOT NULL | Registration UTC timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT now(), NOT NULL | Last profile update |
| `last_login_at` | TIMESTAMPTZ | NULL | Last session activity |

### 2.2. `medicines`
Authoritative canonical pharmaceutical catalog.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY DEFAULT gen_random_uuid() | Unique medicine identifier |
| `legacy_id` | TEXT | NULL | Legacy MongoDB identifier (e.g. `med_001`) |
| `gtin` | TEXT | UNIQUE, NOT NULL | GS1 GTIN / Barcode (e.g. `89012345678901`) |
| `product_name` | TEXT | NOT NULL | Commercial drug name |
| `generic_name` | TEXT | NULL | Active pharmaceutical ingredient (API) |
| `manufacturer_name` | TEXT | NOT NULL | Licensed manufacturer |
| `manufacturer_id` | TEXT | NULL | Regulatory manufacturer registration code |
| `dosage` | TEXT | NULL | E.g. `500 mg` |
| `dosage_form` | TEXT | NULL | Capsules, Tablets, Oral Suspension |
| `strength` | TEXT | NULL | Concentration metrics |
| `package_size` | TEXT | NULL | E.g. `10 capsules per blister` |
| `status` | TEXT | DEFAULT 'active' CHECK ('active', 'inactive', 'recalled') | Regulatory approval status |
| `created_at` | TIMESTAMPTZ | DEFAULT now(), NOT NULL | Catalog creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT now(), NOT NULL | Catalog modification timestamp |

### 2.3. `medicine_batches`
Production batches registered by authorized manufacturers.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY DEFAULT gen_random_uuid() | Unique batch record ID |
| `medicine_id` | UUID | REFERENCES medicines(id) ON DELETE CASCADE | Parent medicine |
| `batch_number` | TEXT | NOT NULL | E.g. `BATCH-2026-001` |
| `serial_number` | TEXT | NULL | Expected serial template |
| `expiry_date` | TEXT | NOT NULL | E.g. `2028-01-09` |
| `manufacturing_date` | TEXT | NULL | E.g. `2026-01-10` |
| `status` | TEXT | DEFAULT 'active' CHECK ('active', 'expired', 'recalled') | Batch validity |
| `registered_quantity` | INT | DEFAULT 1000 | Number of packaging units produced |
| `CONSTRAINT` | UNIQUE | (medicine_id, batch_number) | Prevents duplicate batch numbers per drug |

### 2.4. `verification_records`
Forensic ledger of all inspection transactions.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY DEFAULT gen_random_uuid() | Unique verification ID |
| `legacy_id` | TEXT | NULL | E.g. `vrf_53c709af05d0` |
| `user_id` | UUID | REFERENCES profiles(id) ON DELETE SET NULL | Authenticated user |
| `user_email` | TEXT | NULL | User email snapshot |
| `user_name` | TEXT | DEFAULT 'Anonymous Guest' | User name snapshot |
| `medicine_id` | UUID | REFERENCES medicines(id) ON DELETE SET NULL | Matched registry drug |
| `batch_id` | UUID | REFERENCES medicine_batches(id) ON DELETE SET NULL | Matched batch |
| `raw_identifier` | TEXT | NOT NULL | Raw barcode / QR string |
| `gtin` | TEXT | NULL | Parsed GS1 GTIN |
| `batch_number` | TEXT | NULL | Parsed GS1 Batch |
| `serial_number` | TEXT | NULL | Parsed GS1 Serial |
| `expiry_date` | TEXT | NULL | Parsed GS1 Expiry Date |
| `verification_status` | TEXT | CHECK IN ('VERIFIED', 'REVIEW', 'SUSPICIOUS', 'NOT_FOUND', 'NOT_REGISTERED', 'EXPIRED', 'INVALID', 'REQUIRES_REVIEW') | Final verdict |
| `verification_method` | TEXT | DEFAULT 'QR' CHECK ('QR', 'DATAMATRIX', 'BARCODE', 'PACKAGING_OCR', 'MANUAL', 'NFC') | Scanned modality |
| `confidence` | INT | CHECK (0 to 100) | Confidence percentage |
| `checks` | JSONB | DEFAULT '[]' | Individual check items (weight, expected, actual) |
| `issues` | JSONB | DEFAULT '[]' | Flagged discrepancy reasons |
| `parsed_data` | JSONB | DEFAULT '{}' | Full parsed attribute map |
| `medicine_summary` | JSONB | DEFAULT '{}' | Immutable snapshot of matched medicine |
| `processing_time_ms` | INT | DEFAULT 45 | Execution duration |
| `created_at` | TIMESTAMPTZ | DEFAULT now(), NOT NULL | Authoritative UTC verification timestamp |

### 2.5. Additional Extended Tables

- `verification_events`: Granular pipeline telemetry (`optical_capture`, `gs1_parsing`, `registry_lookup`, `final_verdict`).
- `reports`: Consumer/pharmacist reports (`VERIFICATION_CONCERN`, `PACKAGING_DEFECT`, `EXPIRED_PRODUCT`, `SUSPICIOUS_SELLER`).
- `medicine_cabinet`: Personal medicine vault for tracking expiration and authentication history.
- `notification_preferences`: Alert preferences for recall notices.
- `admin_activity`: Administrative audit log of registry edits, demo scenario launches, and user status updates.
- `benchmark_runs`: Telemetry logs for regulatory verification accuracy and latency certifications.
