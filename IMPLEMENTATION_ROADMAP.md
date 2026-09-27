# Implementation Roadmap

## Phase 1 — Data & Schema

### Tasks
- Define medicine registry schema.
- Create sample manufacturer/product records.
- Define QR/barcode payload format.
- Define verification result schema.
- Create seed data.

### Deliverables
- MongoDB collections
- Seed script
- Pydantic models
- Sample QR payloads

---

## Phase 2 — Core Engine

### Tasks
- Implement identifier parser.
- Implement registry lookup.
- Implement field comparison.
- Implement confidence scoring.
- Implement suspicious-condition rules.
- Return explainable verification reasons.

### Deliverable

A backend endpoint that accepts an identifier and returns a structured verification result.

---

## Phase 3 — User Interface

### Tasks
- Build responsive landing page.
- Build scanner interface.
- Add camera permission handling.
- Add image upload fallback.
- Build verification result card.
- Add confidence visualization.
- Add "Why this result?" explanation.

### Result States

Create visually distinct states for:

- Verified
- Review required
- Suspicious
- Not found
- Scanner error

---

## Phase 4 — History & Administration

### Tasks
- Add authentication.
- Add verification history.
- Add admin dashboard.
- Add registry CRUD.
- Add audit logs.
- Add search/filter/sort.

---

## Phase 5 — Packaging Intelligence

Optional advanced module:

```text
Medicine Image
      ↓
OCR
      ↓
Extract text
      ↓
Normalize fields
      ↓
Compare with QR/registry
      ↓
Packaging consistency result
```

Potential checks:

- OCR product name vs QR product name
- OCR batch number vs QR batch
- OCR expiry vs registry expiry
- Manufacturer text consistency

---

## Phase 6 — Testing

- Unit tests
- API tests
- Scanner tests
- Registry matching tests
- Invalid-input tests
- Security tests
- UI responsiveness tests
- End-to-end verification flow

---

## Phase 7 — Deployment

Recommended deployment:

```text
Browser
   ↓
Frontend
   ↓ HTTPS
FastAPI Backend
   ↓
MongoDB
   ↓
Registry / Verification Source
```

Optional:

```text
                 ┌── OCR Service
Frontend → API ──┼── Registry
                 └── ML Anomaly Detector
```

---

## Phase 8 — Hackathon Presentation

Demonstration sequence:

1. Open the application.
2. Show the problem statement.
3. Scan a valid sample medicine.
4. Display a verified result.
5. Scan a modified/mismatched sample.
6. Display the suspicious/review result.
7. Explain the matching logic.
8. Show verification history.
9. Show admin registry.
10. Explain future integration with trusted external registries.

## Definition of Done

The MVP is complete when:

- QR/barcode scanning works.
- Registry lookup works.
- Verification status is explainable.
- Suspicious mismatches are detected.
- Results are stored.
- History can be viewed.
- Demo data can be managed.
- Application can be deployed.
