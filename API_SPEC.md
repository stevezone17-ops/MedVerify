# API Specification

Base URL:

```text
/api
```

## 1. Verify Medicine

### Request

```http
POST /api/verify
Content-Type: application/json
```

```json
{
  "identifier": "89012345678901",
  "batch_number": "BATCH-2026-001",
  "serial_number": "SERIAL-000001"
}
```

### Response

```json
{
  "verification_id": "verification_001",
  "status": "VERIFIED",
  "confidence_score": 96,
  "medicine": {
    "product_name": "Example Medicine 500 mg",
    "manufacturer": "Example Pharma Ltd.",
    "batch_number": "BATCH-2026-001",
    "expiry_date": "2028-01-09"
  },
  "checks": [
    {
      "field": "product_identifier",
      "status": "PASS"
    },
    {
      "field": "manufacturer",
      "status": "PASS"
    },
    {
      "field": "batch_number",
      "status": "PASS"
    }
  ],
  "issues": []
}
```

## 2. Scan Image

```http
POST /api/scan
Content-Type: multipart/form-data
```

Input:

```text
image=<uploaded image>
```

Response:

```json
{
  "decoded": true,
  "identifier": "89012345678901",
  "format": "QR"
}
```

## 3. Verification History

```http
GET /api/verifications
```

Optional parameters:

```text
status=VERIFIED
limit=20
page=1
```

## 4. Get Verification

```http
GET /api/verifications/{verification_id}
```

## 5. Medicine Lookup

```http
GET /api/medicines/{product_identifier}
```

## 6. Admin — Create Medicine

```http
POST /api/admin/medicines
Authorization: Bearer <token>
```

```json
{
  "product_identifier": "89012345678901",
  "product_name": "Example Medicine 500 mg",
  "manufacturer": "Example Pharma Ltd.",
  "batch_number": "BATCH-2026-001",
  "expiry_date": "2028-01-09"
}
```

## 7. Admin — Update Medicine

```http
PUT /api/admin/medicines/{medicine_id}
Authorization: Bearer <token>
```

## 8. Admin — Delete/Deactivate Medicine

```http
DELETE /api/admin/medicines/{medicine_id}
Authorization: Bearer <token>
```

Prefer soft deletion/deactivation for auditability.

## Error Format

```json
{
  "error": {
    "code": "INVALID_IDENTIFIER",
    "message": "The supplied identifier is not valid."
  }
}
```

## HTTP Status Codes

| Code | Meaning |
|---|---|
| 200 | Successful verification |
| 201 | Resource created |
| 400 | Invalid request |
| 401 | Authentication required |
| 403 | Insufficient permissions |
| 404 | Record not found |
| 409 | Conflict |
| 413 | Uploaded file too large |
| 422 | Validation error |
| 429 | Rate limit exceeded |
| 500 | Server error |
