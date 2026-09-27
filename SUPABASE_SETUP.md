# MedVerify — Supabase Setup & Configuration Guide

This guide walks you step-by-step through configuring Supabase PostgreSQL, Authentication, Storage, and Realtime for MedVerify.

---

## 1. Create a Supabase Project

1. Navigate to [https://supabase.com](https://supabase.com) and sign in or create an account.
2. Click **New Project**.
3. Select your organization and enter project details:
   - **Name**: `medverify-production` (or `medverify-dev`)
   - **Database Password**: Generate and securely store a strong password.
   - **Region**: Choose the region closest to your users.
4. Click **Create new project** and wait ~2 minutes for provisioning to complete.

---

## 2. Apply Database Migrations

You can apply the MedVerify relational schema using either the **Supabase Dashboard SQL Editor** or the **Supabase CLI**.

### Option A: Via Supabase Web Dashboard (Recommended for Quick Setup)

1. Open your project dashboard and click **SQL Editor** in the left sidebar.
2. Run the migration files in `supabase/migrations/` sequentially:
   - **Step 1**: Open `supabase/migrations/001_initial_schema.sql` -> Paste into SQL Editor -> Click **Run**.
   - **Step 2**: Open `supabase/migrations/002_indexes.sql` -> Paste into SQL Editor -> Click **Run**.
   - **Step 3**: Open `supabase/migrations/003_rls.sql` -> Paste into SQL Editor -> Click **Run**.
   - **Step 4**: Open `supabase/migrations/004_functions.sql` -> Paste into SQL Editor -> Click **Run**.

### Option B: Via Supabase CLI

```bash
# Login to Supabase CLI
supabase login

# Link your local repo to your remote project
supabase link --project-ref <your-project-ref>

# Push all migrations
supabase db push
```

---

## 3. Configure Environment Variables

Retrieve your Project URL and API Keys from **Project Settings > API**:

### Backend Configuration (`backend/.env`)

```ini
# Database Provider Selection
DATABASE_BACKEND=supabase

# Supabase API Credentials
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-public-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-secret-key>

# JWT Secret (From Project Settings > API > JWT Settings)
SUPABASE_JWT_SECRET=<your-supabase-jwt-secret>

# Application Secret & CORS
JWT_SECRET=production_secret_key_min_32_characters
JWT_ALGORITHM=HS256
JWT_EXPIRY_MINUTES=60
FRONTEND_URL=http://localhost:5173
```

> [!WARNING]
> The `SUPABASE_SERVICE_ROLE_KEY` has full administrative database privileges and bypasses RLS.
> **Never** expose this key in the frontend or commit it to GitHub.

### Frontend Configuration (`frontend/.env`)

```ini
VITE_API_URL=http://127.0.0.1:8000
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
```

---

## 4. Run Data Migration (If Migrating Existing MongoDB Data)

If you have existing MongoDB verification records, medicines, or users, run the migration utility:

```bash
cd backend

# Test the extraction without modifying Supabase
python scripts/migrate_mongodb_to_supabase.py --dry-run

# Run the live migration
python scripts/migrate_mongodb_to_supabase.py
```

---

## 5. Seed Development Medicine Records

Populate the database with canonical test medicines (including Amoxicillin and expired test specimens):

```bash
cd backend
python scripts/seed_supabase.py
```

---

## 6. Running the Application

### Start the FastAPI Backend

```bash
cd backend
# Activate virtual environment
.\.venv\Scripts\Activate.ps1    # Windows PowerShell
# source .venv/bin/activate     # macOS/Linux

uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Start the React / Vite Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173).

---

## 7. Verify Working Scanner & Realtime Feeds

1. Open the Scanner at [http://localhost:5173/app/scanner](http://localhost:5173/app/scanner).
2. Scan the canonical GS1 test barcode:
   ```
   (01)89012345678901(10)BATCH-2026-001(17)280109(21)SER-PC-000001
   ```
3. Confirm that the verification engine authenticates against Supabase and renders:
   - **Product**: Amoxicillin 500 mg Capsules
   - **Manufacturer**: PharmaCore Laboratories
   - **Status**: `VERIFIED`
   - **Confidence**: `85%`
4. Open the Admin Command Center in another tab to observe the Realtime inspection stream without page refresh.
