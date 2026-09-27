-- ============================================================================
-- 001_initial_schema.sql
-- MedVerify: Production Relational Schema for Supabase PostgreSQL
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. PROFILES (Users and Role Authorization)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('USER', 'ADMIN', 'user', 'admin')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_login_at TIMESTAMPTZ
);

-- ----------------------------------------------------------------------------
-- 2. MEDICINES (Canonical Pharmaceutical Registry)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.medicines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id TEXT,
    gtin TEXT UNIQUE NOT NULL,
    product_name TEXT NOT NULL,
    generic_name TEXT,
    manufacturer_name TEXT NOT NULL,
    manufacturer_id TEXT,
    dosage TEXT,
    dosage_form TEXT,
    strength TEXT,
    package_size TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'recalled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ----------------------------------------------------------------------------
-- 3. MEDICINE_BATCHES (Authorized Production Batches)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.medicine_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
    batch_number TEXT NOT NULL,
    serial_number TEXT,
    expiry_date TEXT NOT NULL,
    manufacturing_date TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'recalled', 'quarantined')),
    registered_quantity INTEGER NOT NULL DEFAULT 1000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_medicine_batch UNIQUE (medicine_id, batch_number)
);

-- ----------------------------------------------------------------------------
-- 4. VERIFICATION_RECORDS (Forensic Inspection Audit Ledger)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id TEXT,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    user_email TEXT,
    user_name TEXT DEFAULT 'Anonymous Guest',
    medicine_id UUID REFERENCES public.medicines(id) ON DELETE SET NULL,
    batch_id UUID REFERENCES public.medicine_batches(id) ON DELETE SET NULL,
    raw_identifier TEXT NOT NULL,
    gtin TEXT,
    batch_number TEXT,
    serial_number TEXT,
    expiry_date TEXT,
    verification_status TEXT NOT NULL CHECK (
        verification_status IN (
            'VERIFIED', 'REVIEW', 'SUSPICIOUS', 'NOT_FOUND',
            'NOT_REGISTERED', 'EXPIRED', 'INVALID', 'REQUIRES_REVIEW'
        )
    ),
    verification_method TEXT NOT NULL DEFAULT 'QR' CHECK (
        verification_method IN ('QR', 'DATAMATRIX', 'BARCODE', 'PACKAGING_OCR', 'MANUAL', 'NFC')
    ),
    confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
    qber NUMERIC(5,2) DEFAULT 0.0,
    registry_match BOOLEAN DEFAULT false,
    manufacturer_match BOOLEAN DEFAULT false,
    product_match BOOLEAN DEFAULT false,
    expiry_valid BOOLEAN DEFAULT false,
    batch_valid BOOLEAN DEFAULT false,
    serial_valid BOOLEAN DEFAULT false,
    reason_code TEXT,
    explanation TEXT,
    checks JSONB NOT NULL DEFAULT '[]'::jsonb,
    issues JSONB NOT NULL DEFAULT '[]'::jsonb,
    parsed_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    medicine_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    processing_time_ms INTEGER NOT NULL DEFAULT 45,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ----------------------------------------------------------------------------
-- 5. VERIFICATION_EVENTS (Pipeline Telemetry)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_id UUID NOT NULL REFERENCES public.verification_records(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ----------------------------------------------------------------------------
-- 6. REPORTS (Verification Concern Reports)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    verification_id UUID REFERENCES public.verification_records(id) ON DELETE SET NULL,
    report_type TEXT NOT NULL DEFAULT 'VERIFICATION_CONCERN',
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------------
-- 7. MEDICINE_CABINET (Personal Medicine Vault)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.medicine_cabinet (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    medicine_id UUID REFERENCES public.medicines(id) ON DELETE CASCADE,
    verification_id UUID REFERENCES public.verification_records(id) ON DELETE SET NULL,
    nickname TEXT,
    notes TEXT,
    reminder_enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ----------------------------------------------------------------------------
-- 8. NOTIFICATION_PREFERENCES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    email_notifications BOOLEAN NOT NULL DEFAULT true,
    push_notifications BOOLEAN NOT NULL DEFAULT false,
    safety_alerts BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ----------------------------------------------------------------------------
-- 9. ADMIN_ACTIVITY (Audit Logging)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_entity TEXT,
    target_id TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ----------------------------------------------------------------------------
-- 10. BENCHMARK_RUNS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.benchmark_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_name TEXT NOT NULL,
    scenario_count INTEGER NOT NULL DEFAULT 0,
    accuracy NUMERIC(5,2) NOT NULL DEFAULT 0.0,
    avg_latency_ms NUMERIC(6,2) NOT NULL DEFAULT 0.0,
    results JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
