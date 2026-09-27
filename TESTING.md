# Testing Strategy

## 1. Unit Tests

Test individual components:

- QR parser
- Barcode parser
- Identifier normalization
- Registry lookup
- Field comparison
- Score calculation
- Status decision rules
- Date/expiry validation

## 2. Test Cases

### Valid Record

Input matches all registry fields.

Expected:

```text
Status: VERIFIED
No critical issues
```

### Unknown Identifier

Input identifier does not exist.

Expected:

```text
Status: NOT_FOUND
```

### Manufacturer Mismatch

Identifier exists but manufacturer data differs.

Expected:

```text
Status: SUSPICIOUS
Issue: Manufacturer mismatch
```

### Batch Mismatch

Product exists but batch does not match.

Expected:

```text
Status: SUSPICIOUS
Issue: Batch mismatch
```

### Expired Medicine

Registry record is expired.

Expected:

```text
Status: REVIEW
Issue: Product expired
```

### Missing Data

QR payload does not contain enough fields.

Expected:

```text
Status: REVIEW
Issue: Insufficient verification data
```

### Invalid Payload

Malformed QR/barcode content.

Expected:

```text
HTTP 400
```

### Duplicate Serial

The same serial appears in a scenario where uniqueness is expected.

Expected:

```text
Status: SUSPICIOUS
Issue: Serial reuse detected
```

## 3. API Tests

Test:

- Authentication
- Authorization
- Valid requests
- Invalid requests
- Missing fields
- Rate limiting
- Error responses
- Admin-only routes

## 4. Frontend Tests

Verify:

- Camera permission handling
- QR scan success
- QR scan failure
- Upload fallback
- Loading state
- Result rendering
- Mobile responsiveness
- Empty history
- API failure state

## 5. Security Tests

Check:

- Input validation
- File upload restrictions
- Authentication bypass
- Unauthorized admin access
- Injection attempts
- Excessive request rates
- Sensitive data exposure

## 6. Demo Test Matrix

| Scenario | Expected Result |
|---|---|
| Valid QR | VERIFIED |
| Unknown QR | NOT_FOUND |
| Wrong batch | SUSPICIOUS |
| Wrong manufacturer | SUSPICIOUS |
| Expired product | REVIEW |
| Broken QR | Scanner error |
| Missing fields | REVIEW |

## Acceptance Criteria

A demo build is acceptable when every scenario above produces the expected status and the UI clearly explains the reason.
