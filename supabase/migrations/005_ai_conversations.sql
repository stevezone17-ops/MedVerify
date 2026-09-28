-- ============================================================================
-- 005_ai_conversations.sql
-- MedVerify Phase 3: Real LLM Intelligence Layer
-- Tables for persisting AI chat conversations, messages, and usage telemetry
-- with strict Row Level Security (RLS) policies.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ai_conversations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'MedVerify Assistance',
    verification_id UUID REFERENCES public.verification_records(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON public.ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_verification_id ON public.ai_conversations(verification_id);

-- ----------------------------------------------------------------------------
-- 2. ai_messages
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    grounded_facts JSONB DEFAULT '[]'::jsonb,
    model_used TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conv_id ON public.ai_messages(conversation_id);

-- ----------------------------------------------------------------------------
-- 3. ai_usage_logs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    request_type TEXT NOT NULL CHECK (request_type IN ('explain', 'chat', 'normalize_ocr', 'admin_analyze')),
    model TEXT NOT NULL,
    tokens_prompt INTEGER DEFAULT 0,
    tokens_completion INTEGER DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON public.ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON public.ai_usage_logs(created_at DESC);

-- ----------------------------------------------------------------------------
-- Row Level Security (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Users can only view & create their own conversations
CREATE POLICY "Users can access own AI conversations"
    ON public.ai_conversations
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can only access messages belonging to their conversations
CREATE POLICY "Users can access own AI messages"
    ON public.ai_messages
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.ai_conversations c
            WHERE c.id = ai_messages.conversation_id AND c.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.ai_conversations c
            WHERE c.id = ai_messages.conversation_id AND c.user_id = auth.uid()
        )
    );

-- Only admins and service role can read usage telemetry
CREATE POLICY "Admins can view AI usage logs"
    ON public.ai_usage_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );
