# System Architecture

## High-Level Architecture

```text
                         ┌─────────────────────┐
                         │       User          │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   React Frontend    │
                         │ Scanner + Dashboard │
                         └──────────┬──────────┘
                                    │ HTTPS/JSON
                                    ▼
                         ┌─────────────────────┐
                         │    FastAPI API      │
                         └──────────┬──────────┘
                                    │
                  ┌─────────────────┼─────────────────┐
                  │                 │                 │
                  ▼                 ▼                 ▼
          ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
          │ Verification │  │ OCR / Image  │  │ Authentication│
          │    Engine    │  │   Module     │  │   & Roles     │
          └──────┬───────┘  └──────────────┘  └──────────────┘
                 │
                 ▼
          ┌──────────────────┐
          │ Medicine Registry│
          │    MongoDB       │
          └──────────────────┘
```

## Backend Modules

```text
backend/
├── app/
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── models/
│   ├── schemas/
│   ├── routes/
│   │   ├── verification.py
│   │   ├── medicines.py
│   │   ├── history.py
│   │   └── auth.py
│   ├── services/
│   │   ├── qr_parser.py
│   │   ├── verification_engine.py
│   │   ├── scoring.py
│   │   └── ocr_service.py
│   └── utils/
└── tests/
```

## Data Flow

```text
QR / Barcode
     ↓
Decode
     ↓
Normalize identifier
     ↓
Validate payload
     ↓
Registry lookup
     ↓
Compare fields
     ↓
Apply verification rules
     ↓
Calculate transparent score
     ↓
Generate result + reasons
     ↓
Store audit record
     ↓
Return result to frontend
```

## Design Principle

The system should separate:

1. **Data extraction**
2. **Data verification**
3. **Risk/suspicion rules**
4. **Presentation**

This makes the system easier to test and prevents UI logic from becoming responsible for security-sensitive decisions.

## External Registry Integration

For the hackathon prototype, use a controlled sample registry.

For a production deployment, integrate only with authorized/trusted sources and clearly identify:

- Source name
- Last synchronization time
- Data coverage
- Whether the source is official
- Whether the lookup was successful

Do not imply that a local demonstration database represents a government or manufacturer registry.

## Future Architecture

Possible future integrations:

- Manufacturer APIs
- Authorized pharmaceutical supply-chain systems
- GS1-compatible product identifiers
- OCR
- Computer vision
- Tamper-evident packaging analysis
- Blockchain/distributed ledger for selected supply-chain records
- Regulatory reporting workflows
