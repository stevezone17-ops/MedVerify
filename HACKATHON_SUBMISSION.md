# Hackathon Submission

## Project

**Counterfeit Medicine Detection via Packaging & QR Verification**

## Challenge

Medicine counterfeit detection is difficult when users cannot easily verify whether packaging and product identifiers correspond to a legitimate registered product.

## Proposed Solution

A digital verification platform that combines:

- QR/barcode scanning
- Product identifier extraction
- Manufacturer/product registry lookup
- Batch and serial verification
- Packaging information comparison
- Explainable confidence scoring
- Suspicious-record flagging
- Verification history
- Administrative registry management

## User Journey

```text
Scan
  ↓
Decode
  ↓
Verify
  ↓
Compare
  ↓
Score
  ↓
Explain
  ↓
Record
```

## Key Innovation

Instead of showing only a binary result, the system explains **why** a medicine record was accepted for verification, requires review, or flagged as suspicious.

Example:

```text
Verification Result

Status: REVIEW

Product identifier       ✓ Match
Manufacturer             ✓ Match
Batch number             ✗ Mismatch
Expiry date              ✓ Match

Confidence Score: 72

Reason:
The scanned batch number does not match
the configured registry record.
```

## Expected Impact

The prototype is designed to reduce friction in medicine verification by giving users a structured screening workflow and making mismatches visible.

## Future Scope

- Official registry integrations
- Manufacturer APIs
- OCR
- Computer vision for packaging consistency
- Supply-chain tracking
- Tamper-evident packaging checks
- Multi-language support
- Offline verification for selected use cases
- Mobile application

## Demonstration Script

### Demo 1 — Valid Product

1. Open scanner.
2. Scan a seeded valid QR code.
3. Show decoded details.
4. Run verification.
5. Show matching fields and result.

### Demo 2 — Tampered/Mismatched Data

1. Use a demonstration QR code with an incorrect batch.
2. Scan.
3. Show the mismatch.
4. Display the suspicious/review result.
5. Open verification history.

### Demo 3 — Unknown Product

1. Scan an identifier absent from the demo registry.
2. Show `NOT_FOUND`.
3. Explain that absence from the configured registry means the system cannot verify the record.

## Important Demo Note

Use clearly labeled **synthetic/demo medicine data** during the hackathon unless authorized real registry data is available.
