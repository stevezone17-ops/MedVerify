# MedVerify v1.0 — System Architecture & Design Specification

## 1. Executive Summary

MedVerify is a production-grade pharmaceutical verification platform engineered to detect counterfeit, unregistered, adulterated, and diverted medicines before they reach patients. It integrates deterministic cryptographic verification with multimodal AI vision to deliver verifiable, scientifically sound authentication for consumers and administrative authorities.

---

## 2. Technology Stack & Component Mapping

| Domain | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19 + TypeScript + Vite | Component-driven Single Page Application (SPA) |
| **Styling & Motion** | Vanilla CSS Design System + Framer Motion | Clinical, high-performance, responsive UI with zero bloated UI libs |
| **Barcode / OCR** | ZXing JS + Native BarcodeDetector API | Fast in-browser 2D DataMatrix and QR code decoding |
| **Backend Framework** | FastAPI (Python 3.12) | Asynchronous RESTful API Gateway |
| **Deterministic Engine** | Custom Python 6-Factor Engine | Authoritative scoring and rule-based verification |
| **AI Intelligence Layer**| Google Gemini API (`gemini-2.5-flash`) | Multimodal packaging OCR, condition assessment, explainability |
| **Primary Persistence** | MongoDB (v6.0+) / MongoDB Atlas | High-throughput document store with composite indexing |
| **Secondary Persistence**| Supabase PostgreSQL 15+ (Optional) | Relational store with Row-Level Security (RLS) |
| **Evidence Storage** | User-Scoped Local Storage / Cloud Blob | Cryptographically isolated packaging photograph vault |

---

## 3. High-Level Architecture Diagram

```text
                               +----------------------------------------+
                               |     End Users & Administrators         |
                               |  (Mobile Devices, Tablets, Desktops)   |
                               +-------------------+--------------------+
                                                   | HTTPS / TLS 1.3
                                                   v
                               +-------------------+--------------------+
                               |     MedVerify Frontend (Vite/React)    |
                               |  - Consumer Portal (/verify, /cabinet) |
                               |  - Admin Console (/admin, /audit)      |
                               |  - Client-Side ZXing Barcode Decoder   |
                               |  - Interactive Inspection Drawers      |
                               +-------------------+--------------------+
                                                   | JSON REST + Bearer JWT
                                                   v
                               +-------------------+--------------------+
                               |     FastAPI Backend API Gateway        |
                               |  - CORS & Rate Limiter (Sliding Window)|
                               |  - Auth & RBAC (Admin / User Roles)    |
                               |  - IDOR Protection Layer               |
                               |  - Liveness & Readiness Telemetry      |
                               +----+-------------------------+---------+
                                    |                         |
               +--------------------+----+       +------------+------------+
               | Deterministic 6-Factor  |       | Google Gemini Service   |
               | Verification Engine     |       | - Multimodal Packaging  |
               | (SOLE VERDICT AUTHORITY)|       |   OCR & Field Extractor |
               +------------+------------+       | - Grounded AI Assistant |
                            |                    | - Packaging Condition   |
                            v                    +------------+------------+
               +------------+------------+                    |
               | Multi-Backend Database  |<-------------------+
               | - MongoDB Atlas (Primary)
               | - Supabase PostgreSQL  |
               | - Secure Image Storage  |
               +-------------------------+
```

---

## 4. Deterministic Six-Factor Verification Engine

MedVerify adheres strictly to the scientific principle that **AI cannot independently grant or revoke medicine authenticity**. The 6-factor deterministic engine evaluates all cryptographic and registry evidence:

```text
               +----------------------------------------+
               |      Decoded Barcode or OCR Input      |
               +-------------------+--------------------+
                                   |
         +-------------------------+-------------------------+
         |                         |                         |
         v                         v                         v
+-----------------+       +-----------------+       +-----------------+
| 1. Product Reg. |       | 2. Batch Number |       | 3. Expiry Date  |
| Weight: 30 pts  |       | Weight: 20 pts  |       | Weight: 10 pts  |
+--------+--------+       +--------+--------+       +--------+--------+
         |                         |                         |
         +-------------------------+-------------------------+
         |                         |                         |
         v                         v                         v
+-----------------+       +-----------------+       +-----------------+
| 4. Manufacturer |       | 5. Metadata     |       | 6. Serial Check |
| Weight: 20 pts  |       | Weight: 10 pts  |       | Weight: 10 pts  |
+--------+--------+       +--------+--------+       +--------+--------+
         |                         |                         |
         +-------------------------+-------------------------+
                                   |
                                   v
               +-------------------+--------------------+
               | Aggregate Confidence Score (0 - 100%)  |
               | Status Verdict Assignment:             |
               | - Score >= 80%: VERIFIED               |
               | - Score 50-79%: REVIEW                 |
               | - Expired Date: EXPIRED                |
               | - Missing >=3:  REQUIRES_REVIEW        |
               | - Anomaly/Reuse:SUSPICIOUS             |
               | - Not in Reg:   NOT_FOUND              |
               +----------------------------------------+
```

### Verification Factors and Weights:
1. **Product Registration (30 pts):** Confirms the GTIN / product identifier exists in the approved regulatory database.
2. **Batch Number (20 pts):** Verifies that the lot/batch code was manufactured by the licensed entity.
3. **Manufacturer Match (20 pts):** Confirms licensing, registered address, and manufacturer identity.
4. **Expiry Date (10 pts):** Evaluates whether the medicine is within its safe clinical shelf life.
5. **Product Metadata (10 pts):** Cross-checks product name, dosage, and packaging type.
6. **Serial Uniqueness (10 pts):** Detects cloning and duplicate scans across different users.

---

## 5. GS1 Standard Decoding & DataMatrix Parsing

MedVerify decodes GS1 Application Identifiers (AIs) according to GS1 General Specifications:
- `(01)`: Global Trade Item Number (GTIN - 14 digits)
- `(10)`: Batch or Lot Number (Alphanumeric, up to 20 chars)
- `(17)`: Expiry Date (YYMMDD format)
- `(21)`: Unique Serial Number (Alphanumeric, up to 20 chars)

The engine supports unparenthesized strings separated by ASCII 29 (FNC1) delimiters or caret delimiters (`^`), converting them to canonical GS1 objects.

---

## 6. Multimodal AI & Packaging OCR Architecture

When consumers use **Medicine Photo Verification**:
1. **Image Capture & Ingestion:** Up to 3 packaging photographs (front carton, back label, 2D barcode) are uploaded via multipart form data.
2. **Security & Dimensional Validation:** Evaluates MIME types, magic numbers (JPEG `FF D8 FF`, PNG `89 50 4E 47`), minimum dimensions (400x300px), and maximum file size (10MB).
3. **Gemini Vision Extraction:** Gemini extracts structured packaging parameters without hallucinating unknown fields. Unreadable fields remain `null`.
4. **Discrepancy Cross-Checking:** Compares visual OCR text against 2D DataMatrix barcode data to detect physical relabeling or tampering.
5. **Authoritative Confirmation:** The user inspects and confirms the extracted values before submitting them to the authoritative 6-factor engine.

---

## 7. Security, Privacy & RBAC

- **Role-Based Access Control (RBAC):** Strict segregation between `user` and `admin` roles. Admin endpoints (`/api/admin/*`) return `403 Forbidden` for standard users.
- **Insecure Direct Object Reference (IDOR) Protection:** Verification records, medicine cabinets, and evidence images are strictly scoped to the authenticated `user_id`.
- **Defensive HTTP Headers:** All responses include `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, and `Referrer-Policy: strict-origin-when-cross-origin`.
- **API Key Seclusion:** Gemini API keys are never bundled into frontend assets or delivered to client browsers.
