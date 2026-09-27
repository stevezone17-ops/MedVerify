# Data Model

## Medicine Collection

```json
{
  "_id": "medicine_001",
  "product_identifier": "89012345678901",
  "product_name": "Example Medicine 500 mg",
  "manufacturer": {
    "id": "mfr_001",
    "name": "Example Pharma Ltd."
  },
  "batch_number": "BATCH-2026-001",
  "serial_number": "SERIAL-000001",
  "manufacturing_date": "2026-01-10",
  "expiry_date": "2028-01-09",
  "package_size": "10 tablets",
  "status": "active",
  "created_at": "2026-01-10T10:00:00Z",
  "updated_at": "2026-01-10T10:00:00Z"
}
```

## Verification Collection

```json
{
  "_id": "verification_001",
  "input_type": "qr",
  "raw_identifier": "89012345678901",
  "parsed_data": {
    "product_identifier": "89012345678901",
    "batch_number": "BATCH-2026-001",
    "serial_number": "SERIAL-000001"
  },
  "matched_medicine_id": "medicine_001",
  "status": "VERIFIED",
  "confidence_score": 96,
  "checks": [
    {
      "name": "Product identifier",
      "status": "PASS",
      "weight": 30
    },
    {
      "name": "Manufacturer",
      "status": "PASS",
      "weight": 20
    },
    {
      "name": "Batch",
      "status": "PASS",
      "weight": 20
    }
  ],
  "issues": [],
  "created_at": "2026-09-16T05:30:00Z"
}
```

## Users Collection

```json
{
  "_id": "user_001",
  "name": "Demo User",
  "email": "user@example.com",
  "role": "user",
  "created_at": "2026-09-16T05:30:00Z"
}
```

Roles:

- `user`
- `admin`

## Audit Log

```json
{
  "_id": "audit_001",
  "event": "medicine_verification",
  "verification_id": "verification_001",
  "actor_id": "user_001",
  "timestamp": "2026-09-16T05:30:00Z",
  "metadata": {
    "input_type": "qr"
  }
}
```

## Recommended Indexes

### Medicine

- `product_identifier`
- `batch_number`
- `serial_number`
- `manufacturer.id`

### Verification

- `created_at`
- `status`
- `raw_identifier`

### Users

- `email` unique

## Privacy

Avoid storing unnecessary personally identifiable information. Verification records should contain only the minimum user/account information required for authentication, auditing and product-support workflows.
