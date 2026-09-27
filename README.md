# Counterfeit Medicine Detection via Packaging & QR Verification

A hackathon-ready web application for screening medicine packages using QR/barcode data, packaging details, and manufacturer/registry information.

> **Important:** This project is a verification/screening prototype. A "verified" result means that the submitted information matched the configured verification sources; it is not a substitute for laboratory testing or an official regulatory determination.

## Problem

Counterfeit and falsified medicines can be difficult to identify from packaging alone. The goal of this project is to provide a fast digital screening workflow that helps users identify suspicious or unmatched medicine records.

## Core Workflow

1. Scan a medicine QR code or barcode.
2. Decode the product identifier and batch/serial information.
3. Cross-check the decoded information against a manufacturer/product registry.
4. Compare available packaging details such as product name, manufacturer, batch number and expiry.
5. Generate a confidence score and verification status.
6. Flag suspicious, incomplete or unmatched records.
7. Store verification history for auditing and analysis.

## Suggested Statuses

- `VERIFIED` — required fields matched the configured registry.
- `REVIEW` — some information is missing or inconsistent.
- `SUSPICIOUS` — important identifiers conflict with the registry or expected format.
- `NOT_FOUND` — no matching registry record was found.

## Suggested Stack

### Frontend
- React
- Vite
- Tailwind CSS
- QR/barcode scanner library
- Responsive dashboard UI

### Backend
- FastAPI
- Python
- Pydantic
- REST API

### Database
- MongoDB

### Optional AI/ML Layer
- Packaging image anomaly detection
- OCR for printed batch/expiry/manufacturer information
- Rule-based + ML confidence scoring

## Main Screens

- Landing / Home
- Medicine Scanner
- Verification Result
- Medicine Details
- Verification History
- Manufacturer Registry
- Admin Dashboard
- Analytics
- About / Help

## Example Result

```json
{
  "status": "VERIFIED",
  "confidence": 96,
  "product_name": "Example Medicine",
  "manufacturer": "Example Pharma Ltd.",
  "batch_number": "BATCH-2026-001",
  "expiry_date": "2028-06-30",
  "issues": []
}
```

## Project Structure

```text
counterfeit-medicine-verification/
├── frontend/
├── backend/
├── database/
├── ml/
├── docs/
├── tests/
├── .env.example
├── README.md
└── LICENSE
```

## Development

```bash
# Backend
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

See the other Markdown files in this documentation pack for the detailed specification, roadmap, data model, API, testing and deployment plan.
