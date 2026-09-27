# Deployment Guide

## Environment Variables

Create `.env` from `.env.example`.

```env
MONGODB_URI=mongodb://localhost:27017
DATABASE_NAME=medicine_verification
JWT_SECRET=replace_with_a_secure_secret
FRONTEND_URL=http://localhost:5173
```

Never commit real credentials.

## Local Backend

```bash
cd backend

python -m venv .venv

# Windows
.venv\Scripts\activate

pip install -r requirements.txt

uvicorn app.main:app --reload
```

API:

```text
http://127.0.0.1:8000
```

## Local Frontend

```bash
cd frontend
npm install
npm run dev
```

## Production Checklist

### Backend

- Set production secrets.
- Disable debug mode.
- Configure CORS to trusted frontend domains.
- Enable HTTPS.
- Configure rate limiting.
- Configure structured logging.
- Validate uploaded images.
- Add health endpoint.
- Add database indexes.

### Database

- Use authentication.
- Restrict network access.
- Enable backups.
- Avoid exposing MongoDB directly to the public internet.

### Frontend

- Build production bundle.
- Configure production API URL.
- Verify camera permissions under HTTPS.
- Test on mobile browsers.

## Health Endpoint

```http
GET /health
```

Expected:

```json
{
  "status": "ok"
}
```

## Suggested Deployment Architecture

```text
                 HTTPS
                   │
                   ▼
          ┌────────────────┐
          │ Static Frontend│
          └───────┬────────┘
                  │
                  ▼
          ┌────────────────┐
          │ FastAPI Server │
          └───────┬────────┘
                  │
                  ▼
          ┌────────────────┐
          │    MongoDB     │
          └────────────────┘
```

## Production Data Sources

The hackathon version can use seeded demonstration data.

A production system should establish documented agreements and technical integrations with appropriate authoritative data providers before representing a record as officially verified.

## Monitoring

Track:

- API latency
- Verification success/failure rate
- Scan failure rate
- Registry lookup failures
- Database errors
- Authentication failures
- Unusual request volume

Do not expose internal error messages or secrets to end users.
