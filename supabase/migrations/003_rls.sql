-- ============================================================================
-- 003_rls.sql
-- MedVerify: Strict Row Level Security (RLS) Policies
-- ============================================================================

-- Helper function: verify if requesting user has ADMIN privileges
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'ADMIN' OR role = 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- Enable RLS across all domain tables
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicine_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicine_cabinet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_runs ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- PROFILES POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
    FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "profiles_update_own_or_admin" ON public.profiles
    FOR UPDATE USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "profiles_insert_own_or_admin" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id OR public.is_admin());

-- ----------------------------------------------------------------------------
-- MEDICINES POLICIES (Public read, admin write)
-- ----------------------------------------------------------------------------
CREATE POLICY "medicines_public_read" ON public.medicines
    FOR SELECT USING (true);

CREATE POLICY "medicines_admin_insert" ON public.medicines
    FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "medicines_admin_update" ON public.medicines
    FOR UPDATE USING (public.is_admin());

CREATE POLICY "medicines_admin_delete" ON public.medicines
    FOR DELETE USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- MEDICINE BATCHES POLICIES (Public read, admin write)
-- ----------------------------------------------------------------------------
CREATE POLICY "batches_public_read" ON public.medicine_batches
    FOR SELECT USING (true);

CREATE POLICY "batches_admin_insert" ON public.medicine_batches
    FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "batches_admin_update" ON public.medicine_batches
    FOR UPDATE USING (public.is_admin());

CREATE POLICY "batches_admin_delete" ON public.medicine_batches
    FOR DELETE USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- VERIFICATION RECORDS POLICIES (User sees only their own, admin sees all)
-- ----------------------------------------------------------------------------
CREATE POLICY "verifications_select_policy" ON public.verification_records
    FOR SELECT USING (
        auth.uid() = user_id 
        OR public.is_admin()
        OR user_id IS NULL -- Guest/public inspections
    );

CREATE POLICY "verifications_insert_policy" ON public.verification_records
    FOR INSERT WITH CHECK (true);

CREATE POLICY "verifications_admin_modify" ON public.verification_records
    FOR ALL USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- VERIFICATION EVENTS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "events_select_policy" ON public.verification_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.verification_records v
            WHERE v.id = verification_id AND (v.user_id = auth.uid() OR public.is_admin())
        )
    );

CREATE POLICY "events_insert_policy" ON public.verification_events
    FOR INSERT WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- REPORTS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "reports_select_policy" ON public.reports
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "reports_insert_policy" ON public.reports
    FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "reports_admin_update" ON public.reports
    FOR UPDATE USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- MEDICINE CABINET POLICIES (Strictly User-Isolated)
-- ----------------------------------------------------------------------------
CREATE POLICY "cabinet_user_isolation" ON public.medicine_cabinet
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- NOTIFICATION PREFERENCES POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "notif_user_isolation" ON public.notification_preferences
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- ADMIN ACTIVITY & BENCHMARKS (Admin Only)
-- ----------------------------------------------------------------------------
CREATE POLICY "admin_activity_policy" ON public.admin_activity
    FOR ALL USING (public.is_admin());

CREATE POLICY "benchmark_runs_policy" ON public.benchmark_runs
    FOR ALL USING (public.is_admin());
