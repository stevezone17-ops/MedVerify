# Project Specification

## 1. Project Title

**Counterfeit Medicine Detection via Packaging & QR Verification**

## 2. Project Objective

Develop a web-based medicine verification system that allows a user to scan a medicine QR/barcode and compare the encoded product information with a trusted product/manufacturer registry.

The system should make the verification process understandable to a non-technical user while providing enough technical detail for auditing.

## 3. Target Users

- Consumers
- Pharmacists
- Healthcare workers
- Distributors
- Inspectors
- Authorized administrators

## 4. Functional Requirements

### FR-01 — Scan Identifier
The system shall allow the user to scan a QR code or barcode using a camera or upload an image.

### FR-02 — Decode Data
The system shall extract available fields such as:

- Product identifier
- Product name
- Manufacturer
- Batch/lot number
- Serial number
- Manufacturing date
- Expiry date
- GTIN/other identifier where applicable

### FR-03 — Registry Lookup
The backend shall search the configured medicine registry using the decoded identifiers.

### FR-04 — Packaging Verification
Where packaging information is available, the system shall compare:

- Product name
- Manufacturer
- Batch number
- Expiry date
- Strength/dosage description
- Package quantity

### FR-05 — Verification Score
The system shall calculate a transparent confidence score based on matching verification fields.

### FR-06 — Suspicious Record Detection
The system shall identify conditions such as:

- Identifier not found
- Manufacturer mismatch
- Batch mismatch
- Expired product
- Invalid identifier format
- Duplicate/reused serial number
- Conflicting packaging information

### FR-07 — User Result
The result page shall clearly display the verification status and the reasons behind it.

### FR-08 — History
Authenticated users shall be able to view previous verification attempts.

### FR-09 — Admin Registry
Authorized administrators shall be able to add, edit and deactivate demonstration registry records.

### FR-10 — Audit Trail
Important verification events shall be recorded with timestamps and result details.

## 5. Non-Functional Requirements

- Mobile responsive
- Fast scan-to-result flow
- Secure API communication
- Input validation
- Role-based access for administration
- Clear error handling
- Accessible UI
- No unnecessary storage of personal information
- Explainable scoring rather than an unexplained AI-only decision

## 6. Verification Logic

A prototype scoring model can use weighted checks.

Example:

| Check | Weight |
|---|---:|
| Product identifier matches | 30 |
| Manufacturer matches | 20 |
| Batch/lot matches | 20 |
| Expiry matches | 10 |
| Product/package metadata matches | 10 |
| Serial/uniqueness check | 10 |

The final score should be accompanied by the individual checks. The weights are configurable and should not be presented as a scientifically validated counterfeit probability.

## 7. Example Decision Logic

```text
IF identifier is missing
    -> REVIEW

ELSE IF identifier does not exist in registry
    -> NOT_FOUND

ELSE IF manufacturer or batch conflicts
    -> SUSPICIOUS

ELSE IF product is expired
    -> REVIEW

ELSE
    -> VERIFIED
```

## 8. Security Requirements

- Validate all QR/barcode input.
- Rate-limit public verification endpoints.
- Protect admin endpoints with authentication and authorization.
- Never trust client-side verification results.
- Keep secrets in environment variables.
- Log security-relevant events.
- Sanitize uploaded image metadata.
- Restrict file size and image type for uploads.

## 9. Ethical and Safety Considerations

The application is a screening tool. It should not claim that a medicine is clinically safe or unsafe solely from a QR/barcode match.

A suspicious result should direct the user to an appropriate pharmacist, manufacturer or regulatory authority rather than encouraging the user to consume or discard a medicine based only on the prototype's result.
