-- ============================================================================
-- 002_indexes.sql
-- MedVerify: High-Performance B-Tree & GIN Indexes
-- ============================================================================

-- Medicines Registry
CREATE INDEX IF NOT EXISTS idx_medicines_gtin ON public.medicines (gtin);
CREATE INDEX IF NOT EXISTS idx_medicines_status ON public.medicines (status);
CREATE INDEX IF NOT EXISTS idx_medicines_product_name ON public.medicines (product_name);
CREATE INDEX IF NOT EXISTS idx_medicines_legacy_id ON public.medicines (legacy_id);

-- Medicine Batches
CREATE INDEX IF NOT EXISTS idx_batches_medicine_id ON public.medicine_batches (medicine_id);
CREATE INDEX IF NOT EXISTS idx_batches_batch_number ON public.medicine_batches (batch_number);
CREATE INDEX IF NOT EXISTS idx_batches_serial_number ON public.medicine_batches (serial_number);
CREATE INDEX IF NOT EXISTS idx_batches_status ON public.medicine_batches (status);
CREATE INDEX IF NOT EXISTS idx_batches_expiry_date ON public.medicine_batches (expiry_date);

-- Verification Records (Critical for fast History and Timeline queries)
CREATE INDEX IF NOT EXISTS idx_verifications_created_at_desc ON public.verification_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verifications_user_created ON public.verification_records (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verifications_status ON public.verification_records (verification_status);
CREATE INDEX IF NOT EXISTS idx_verifications_raw_id ON public.verification_records (raw_identifier);
CREATE INDEX IF NOT EXISTS idx_verifications_gtin ON public.verification_records (gtin);
CREATE INDEX IF NOT EXISTS idx_verifications_batch_number ON public.verification_records (batch_number);
CREATE INDEX IF NOT EXISTS idx_verifications_serial_number ON public.verification_records (serial_number);
CREATE INDEX IF NOT EXISTS idx_verifications_legacy_id ON public.verification_records (legacy_id);

-- JSONB GIN Indexes for deep check / metadata search
CREATE INDEX IF NOT EXISTS idx_verifications_parsed_data ON public.verification_records USING gin (parsed_data);
CREATE INDEX IF NOT EXISTS idx_verifications_checks ON public.verification_records USING gin (checks);

-- Verification Events
CREATE INDEX IF NOT EXISTS idx_events_verification_id ON public.verification_events (verification_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON public.verification_events (timestamp DESC);

-- Reports & User Cabinet
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON public.reports (user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports (status);
CREATE INDEX IF NOT EXISTS idx_cabinet_user_id ON public.medicine_cabinet (user_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_timestamp ON public.admin_activity (timestamp DESC);
