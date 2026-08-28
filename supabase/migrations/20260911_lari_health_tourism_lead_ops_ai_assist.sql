-- =========================================================================
-- MIGRATION 20260911_lari_health_tourism_lead_ops_ai_assist.sql
-- Description: Health Tourism Slice 3 — Lead Operations, AI Assist,
--              Coordinator Workflow, Human Handoff, Retention Controls
-- Target: Disposable PostgreSQL database / Supabase
-- Canonical Migration Number: 67
-- =========================================================================

-- =========================================================================
-- 1. EXTEND ht_leads WITH OPERATIONAL FIELDS
-- =========================================================================

ALTER TABLE public.ht_leads
  ADD COLUMN IF NOT EXISTS assigned_coordinator_staff_id UUID NULL,
  ADD COLUMN IF NOT EXISTS lead_score SMALLINT NULL,
  ADD COLUMN IF NOT EXISTS lead_score_band TEXT NULL,
  ADD COLUMN IF NOT EXISTS lead_score_reasons JSONB NULL,
  ADD COLUMN IF NOT EXISTS ai_summary TEXT NULL,
  ADD COLUMN IF NOT EXISTS ai_summary_updated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS handoff_state TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS handoff_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS handoff_requested_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Constraints on new columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ht_leads_lead_score_range') THEN
    ALTER TABLE public.ht_leads
      ADD CONSTRAINT chk_ht_leads_lead_score_range CHECK (lead_score IS NULL OR (lead_score >= 0 AND lead_score <= 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ht_leads_lead_score_band') THEN
    ALTER TABLE public.ht_leads
      ADD CONSTRAINT chk_ht_leads_lead_score_band CHECK (lead_score_band IS NULL OR lead_score_band IN ('cold', 'warm', 'hot'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ht_leads_handoff_state') THEN
    ALTER TABLE public.ht_leads
      ADD CONSTRAINT chk_ht_leads_handoff_state CHECK (handoff_state IN ('none', 'requested', 'acknowledged'));
  END IF;
END $$;

-- FK for assigned coordinator → staff (same tenant enforced in RPC)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ht_leads_assigned_coordinator') THEN
    ALTER TABLE public.ht_leads
      ADD CONSTRAINT fk_ht_leads_assigned_coordinator
      FOREIGN KEY (assigned_coordinator_staff_id)
      REFERENCES public.staff(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ht_leads_assigned_coordinator ON public.ht_leads(assigned_coordinator_staff_id);
CREATE INDEX IF NOT EXISTS idx_ht_leads_lead_score_band ON public.ht_leads(tenant_id, lead_score_band);
CREATE INDEX IF NOT EXISTS idx_ht_leads_handoff_state ON public.ht_leads(tenant_id, handoff_state);


-- =========================================================================
-- 2. ht_ai_conversations TABLE
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.ht_ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    lead_id UUID NULL REFERENCES public.ht_leads(id) ON DELETE SET NULL,
    session_token TEXT NOT NULL,
    preferred_language TEXT NOT NULL DEFAULT 'en',
    status TEXT NOT NULL DEFAULT 'active',
    handoff_state TEXT NOT NULL DEFAULT 'none',
    summary TEXT NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ht_ai_conversations_session_token UNIQUE (session_token),
    CONSTRAINT chk_ht_ai_conversations_status CHECK (status IN ('active', 'completed', 'expired')),
    CONSTRAINT chk_ht_ai_conversations_handoff_state CHECK (handoff_state IN ('none', 'requested', 'acknowledged'))
);

CREATE INDEX IF NOT EXISTS idx_ht_ai_conversations_tenant_id ON public.ht_ai_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ht_ai_conversations_session_token ON public.ht_ai_conversations(session_token);
CREATE INDEX IF NOT EXISTS idx_ht_ai_conversations_lead_id ON public.ht_ai_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_ht_ai_conversations_expires_at ON public.ht_ai_conversations(expires_at);

CREATE TRIGGER update_ht_ai_conversations_modtime
BEFORE UPDATE ON public.ht_ai_conversations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.ht_ai_conversations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ht_ai_conversations FROM PUBLIC, anon, authenticated;


-- =========================================================================
-- 3. ht_ai_messages TABLE
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.ht_ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.ht_ai_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
    CONSTRAINT chk_ht_ai_messages_role CHECK (role IN ('user', 'assistant', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_ht_ai_messages_conversation_id ON public.ht_ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ht_ai_messages_expires_at ON public.ht_ai_messages(expires_at);

ALTER TABLE public.ht_ai_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ht_ai_messages FROM PUBLIC, anon, authenticated;


-- =========================================================================
-- 4. RLS POLICIES (Defense in Depth)
-- =========================================================================

-- ht_ai_conversations: Only authorized HT staff can read conversations for their tenant
DROP POLICY IF EXISTS "Authorized HT staff can read ai conversations" ON public.ht_ai_conversations;
CREATE POLICY "Authorized HT staff can read ai conversations"
ON public.ht_ai_conversations
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.ht_staff_profiles hsp ON hsp.staff_id = s.id
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = ht_ai_conversations.tenant_id
          AND s.active = true
          AND (hsp.can_view_ht_leads = true OR hsp.can_manage_ht_leads = true)
    )
);

-- ht_ai_messages: Only authorized HT staff can read messages
DROP POLICY IF EXISTS "Authorized HT staff can read ai messages" ON public.ht_ai_messages;
CREATE POLICY "Authorized HT staff can read ai messages"
ON public.ht_ai_messages
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.ht_ai_conversations c
        JOIN public.staff s ON s.tenant_id = c.tenant_id
        JOIN public.ht_staff_profiles hsp ON hsp.staff_id = s.id
        WHERE c.id = ht_ai_messages.conversation_id
          AND s.user_profile_id = auth.uid()
          AND s.active = true
          AND (hsp.can_view_ht_leads = true OR hsp.can_manage_ht_leads = true)
    )
);


-- =========================================================================
-- 5. HARDEN ht_update_lead_status WITH TRANSITION MATRIX
-- =========================================================================

CREATE OR REPLACE FUNCTION public.ht_update_lead_status(
    p_lead_id UUID,
    p_status TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_hsp RECORD;
    v_lead RECORD;
    v_status TEXT := lower(trim(p_status));
    v_previous_status TEXT;
    v_valid_transition BOOLEAN := false;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    SELECT * INTO v_hsp
    FROM public.ht_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_hsp.staff_id IS NULL OR v_hsp.can_manage_ht_leads = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks can_manage_ht_leads permission.';
    END IF;

    -- Reserve 'converted' status for dedicated server-authoritative Clinic acceptance RPC (Slice 4)
    IF v_status = 'converted' THEN
        RAISE EXCEPTION 'INVALID_TRANSITION: The converted status is reserved for server-authoritative Clinic acceptance.';
    END IF;

    IF v_status NOT IN ('new', 'contacted', 'qualified', 'handoff_pending', 'closed') THEN
        RAISE EXCEPTION 'INVALID_INPUT: Invalid lead status value.';
    END IF;

    SELECT * INTO v_lead
    FROM public.ht_leads
    WHERE id = p_lead_id;

    IF v_lead.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Lead not found.';
    END IF;

    IF v_lead.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'FORBIDDEN: Cross-tenant lead mutation denied.';
    END IF;

    v_previous_status := v_lead.status;

    -- TRANSITION MATRIX ENFORCEMENT
    -- new -> contacted | closed
    -- contacted -> qualified | closed
    -- qualified -> handoff_pending | closed
    -- handoff_pending -> qualified | closed
    -- converted -> FORBIDDEN (already blocked above)
    -- closed -> no outbound transitions (terminal)

    IF v_previous_status = 'new' AND v_status IN ('contacted', 'closed') THEN
        v_valid_transition := true;
    ELSIF v_previous_status = 'contacted' AND v_status IN ('qualified', 'closed') THEN
        v_valid_transition := true;
    ELSIF v_previous_status = 'qualified' AND v_status IN ('handoff_pending', 'closed') THEN
        v_valid_transition := true;
    ELSIF v_previous_status = 'handoff_pending' AND v_status IN ('qualified', 'closed') THEN
        v_valid_transition := true;
    ELSIF v_previous_status = v_status THEN
        -- Idempotent same-status is allowed
        v_valid_transition := true;
    END IF;

    IF NOT v_valid_transition THEN
        RAISE EXCEPTION 'INVALID_TRANSITION: Status transition from % to % is not permitted.', v_previous_status, v_status;
    END IF;

    UPDATE public.ht_leads
    SET status = v_status,
        notes = COALESCE(p_notes, notes),
        last_activity_at = now(),
        updated_at = now()
    WHERE id = p_lead_id;

    INSERT INTO public.audit_events (
        tenant_id, actor_id, actor_role, action,
        resource_type, resource_id, payload
    ) VALUES (
        v_staff.tenant_id::text,
        v_caller_uid::text,
        'staff',
        'ht_lead_status_changed',
        'ht_leads',
        p_lead_id::text,
        jsonb_build_object(
            'previous_status', v_previous_status,
            'new_status', v_status
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'lead_id', p_lead_id,
        'previous_status', v_previous_status,
        'status', v_status
    );
END;
$$;


-- =========================================================================
-- 6. ht_assign_coordinator RPC
-- =========================================================================

CREATE OR REPLACE FUNCTION public.ht_assign_coordinator(
    p_lead_id UUID,
    p_coordinator_staff_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_hsp RECORD;
    v_lead RECORD;
    v_coordinator RECORD;
    v_coord_hsp RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    SELECT * INTO v_hsp
    FROM public.ht_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_hsp.staff_id IS NULL OR v_hsp.can_manage_ht_leads = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks can_manage_ht_leads permission.';
    END IF;

    -- Validate lead
    SELECT * INTO v_lead
    FROM public.ht_leads
    WHERE id = p_lead_id;

    IF v_lead.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Lead not found.';
    END IF;

    IF v_lead.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'FORBIDDEN: Cross-tenant lead assignment denied.';
    END IF;

    -- Validate coordinator is an ACTIVE staff member of the SAME tenant
    SELECT * INTO v_coordinator
    FROM public.staff
    WHERE id = p_coordinator_staff_id;

    IF v_coordinator.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Coordinator staff member not found.';
    END IF;

    IF v_coordinator.active IS NOT TRUE THEN
        RAISE EXCEPTION 'INVALID_STATE: Coordinator staff member is inactive.';
    END IF;

    IF v_coordinator.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'FORBIDDEN: Cross-tenant coordinator assignment denied.';
    END IF;

    -- Verify coordinator has HT profile
    SELECT * INTO v_coord_hsp
    FROM public.ht_staff_profiles
    WHERE staff_id = p_coordinator_staff_id;

    IF v_coord_hsp.staff_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_STATE: Target staff member has no HT profile.';
    END IF;

    UPDATE public.ht_leads
    SET assigned_coordinator_staff_id = p_coordinator_staff_id,
        last_activity_at = now(),
        updated_at = now()
    WHERE id = p_lead_id;

    INSERT INTO public.audit_events (
        tenant_id, actor_id, actor_role, action,
        resource_type, resource_id, payload
    ) VALUES (
        v_staff.tenant_id::text,
        v_caller_uid::text,
        'staff',
        'ht_lead_assigned',
        'ht_leads',
        p_lead_id::text,
        jsonb_build_object(
            'assigned_coordinator_staff_id', p_coordinator_staff_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'lead_id', p_lead_id,
        'assigned_coordinator_staff_id', p_coordinator_staff_id
    );
END;
$$;


-- =========================================================================
-- 7. ht_score_lead RPC — DETERMINISTIC + BOUNDED AI DELTA
-- =========================================================================

CREATE OR REPLACE FUNCTION public.ht_score_lead(
    p_lead_id UUID,
    p_ai_intent_delta SMALLINT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_hsp RECORD;
    v_lead RECORD;
    v_rule_score INT := 0;
    v_reasons JSONB := '[]'::jsonb;
    v_final_score INT;
    v_bounded_ai_delta INT;
    v_score_band TEXT;
    v_conv_count INT := 0;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    SELECT * INTO v_hsp
    FROM public.ht_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_hsp.staff_id IS NULL OR v_hsp.can_manage_ht_leads = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks can_manage_ht_leads permission.';
    END IF;

    SELECT * INTO v_lead
    FROM public.ht_leads
    WHERE id = p_lead_id;

    IF v_lead.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Lead not found.';
    END IF;

    IF v_lead.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'FORBIDDEN: Cross-tenant lead scoring denied.';
    END IF;

    -- DETERMINISTIC RULE-BASED SCORING (non-clinical commercial/intake signals)
    -- Email present
    IF v_lead.email IS NOT NULL AND trim(v_lead.email) <> '' THEN
        v_rule_score := v_rule_score + 10;
        v_reasons := v_reasons || '["email_present"]'::jsonb;
    END IF;

    -- Phone present
    IF v_lead.phone IS NOT NULL AND trim(v_lead.phone) <> '' THEN
        v_rule_score := v_rule_score + 10;
        v_reasons := v_reasons || '["phone_present"]'::jsonb;
    END IF;

    -- Country present
    IF v_lead.country_code IS NOT NULL AND trim(v_lead.country_code) <> '' THEN
        v_rule_score := v_rule_score + 10;
        v_reasons := v_reasons || '["country_present"]'::jsonb;
    END IF;

    -- Preferred language set (non-default)
    IF v_lead.preferred_language IS NOT NULL AND v_lead.preferred_language <> 'en' THEN
        v_rule_score := v_rule_score + 5;
        v_reasons := v_reasons || '["preferred_language_set"]'::jsonb;
    END IF;

    -- Source = agency_referral
    IF v_lead.source_channel = 'agency_referral' THEN
        v_rule_score := v_rule_score + 15;
        v_reasons := v_reasons || '["agency_referral_source"]'::jsonb;
    END IF;

    -- Agency present
    IF v_lead.referring_agency_id IS NOT NULL THEN
        v_rule_score := v_rule_score + 10;
        v_reasons := v_reasons || '["agency_present"]'::jsonb;
    END IF;

    -- Conversation engagement (>3 messages)
    SELECT count(*) INTO v_conv_count
    FROM public.ht_ai_conversations c
    JOIN public.ht_ai_messages m ON m.conversation_id = c.id
    WHERE c.lead_id = p_lead_id AND m.role = 'user';

    IF v_conv_count > 3 THEN
        v_rule_score := v_rule_score + 10;
        v_reasons := v_reasons || '["conversation_engagement"]'::jsonb;
    END IF;

    -- Full name completeness (has space = likely full name)
    IF v_lead.full_name IS NOT NULL AND position(' ' in trim(v_lead.full_name)) > 0 THEN
        v_rule_score := v_rule_score + 5;
        v_reasons := v_reasons || '["full_name_complete"]'::jsonb;
    END IF;

    -- Notes present (explicit interest)
    IF v_lead.notes IS NOT NULL AND trim(v_lead.notes) <> '' THEN
        v_rule_score := v_rule_score + 10;
        v_reasons := v_reasons || '["notes_present"]'::jsonb;
    END IF;

    -- BOUNDED AI DELTA: Clamp to [-10, +10]
    v_bounded_ai_delta := GREATEST(-10, LEAST(10, COALESCE(p_ai_intent_delta, 0)));
    IF v_bounded_ai_delta <> 0 THEN
        v_reasons := v_reasons || jsonb_build_array('ai_intent_delta_' || v_bounded_ai_delta::text);
    END IF;

    -- FINAL SCORE: clamp(RULE_SCORE + AI_DELTA, 0, 100)
    v_final_score := GREATEST(0, LEAST(100, v_rule_score + v_bounded_ai_delta));

    -- SCORE BAND
    IF v_final_score <= 33 THEN
        v_score_band := 'cold';
    ELSIF v_final_score <= 66 THEN
        v_score_band := 'warm';
    ELSE
        v_score_band := 'hot';
    END IF;

    UPDATE public.ht_leads
    SET lead_score = v_final_score,
        lead_score_band = v_score_band,
        lead_score_reasons = v_reasons,
        last_activity_at = now(),
        updated_at = now()
    WHERE id = p_lead_id;

    INSERT INTO public.audit_events (
        tenant_id, actor_id, actor_role, action,
        resource_type, resource_id, payload
    ) VALUES (
        v_staff.tenant_id::text,
        v_caller_uid::text,
        'staff',
        'ht_lead_scored',
        'ht_leads',
        p_lead_id::text,
        jsonb_build_object(
            'rule_score', v_rule_score,
            'ai_intent_delta', v_bounded_ai_delta,
            'final_score', v_final_score,
            'score_band', v_score_band,
            'reasons', v_reasons
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'lead_id', p_lead_id,
        'lead_score', v_final_score,
        'lead_score_band', v_score_band,
        'lead_score_reasons', v_reasons,
        'rule_score', v_rule_score,
        'ai_intent_delta', v_bounded_ai_delta
    );
END;
$$;


-- =========================================================================
-- 8. ht_update_ai_summary RPC
-- =========================================================================

CREATE OR REPLACE FUNCTION public.ht_update_ai_summary(
    p_lead_id UUID,
    p_summary TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_hsp RECORD;
    v_lead RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    SELECT * INTO v_hsp
    FROM public.ht_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_hsp.staff_id IS NULL OR v_hsp.can_manage_ht_leads = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks can_manage_ht_leads permission.';
    END IF;

    SELECT * INTO v_lead
    FROM public.ht_leads
    WHERE id = p_lead_id;

    IF v_lead.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Lead not found.';
    END IF;

    IF v_lead.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'FORBIDDEN: Cross-tenant AI summary update denied.';
    END IF;

    UPDATE public.ht_leads
    SET ai_summary = p_summary,
        ai_summary_updated_at = now(),
        last_activity_at = now(),
        updated_at = now()
    WHERE id = p_lead_id;

    INSERT INTO public.audit_events (
        tenant_id, actor_id, actor_role, action,
        resource_type, resource_id, payload
    ) VALUES (
        v_staff.tenant_id::text,
        v_caller_uid::text,
        'staff',
        'ht_ai_summary_updated',
        'ht_leads',
        p_lead_id::text,
        jsonb_build_object('summary_length', length(p_summary))
    );

    RETURN jsonb_build_object(
        'success', true,
        'lead_id', p_lead_id,
        'ai_summary_updated_at', now()
    );
END;
$$;


-- =========================================================================
-- 9. ht_request_handoff RPC (SERVER-INTERNAL & STAFF AUTHORIZED)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.ht_request_handoff(
    p_conversation_id UUID,
    p_reason TEXT DEFAULT 'user_requested'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_conv RECORD;
    v_lead RECORD;
    v_staff RECORD;
    v_hsp RECORD;
    v_previous_status TEXT;
    v_valid_transition BOOLEAN := false;
BEGIN
    SELECT * INTO v_conv
    FROM public.ht_ai_conversations
    WHERE id = p_conversation_id;

    IF v_conv.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Conversation not found.';
    END IF;

    -- Caller Authority Gate:
    -- If caller is authenticated user (auth.uid() IS NOT NULL):
    -- MUST be active staff for exact tenant with can_manage_ht_leads = true. View-only receives FORBIDDEN.
    IF v_caller_uid IS NOT NULL THEN
        SELECT s.* INTO v_staff
        FROM public.staff s
        WHERE s.user_profile_id = v_caller_uid
          AND s.active = true;

        IF v_staff.id IS NULL OR v_staff.tenant_id <> v_conv.tenant_id THEN
            RAISE EXCEPTION 'FORBIDDEN: Cross-tenant handoff request denied.';
        END IF;

        SELECT * INTO v_hsp
        FROM public.ht_staff_profiles
        WHERE staff_id = v_staff.id;

        IF v_hsp.staff_id IS NULL OR v_hsp.can_manage_ht_leads = false THEN
            RAISE EXCEPTION 'FORBIDDEN: Staff member lacks can_manage_ht_leads permission.';
        END IF;
    END IF;

    -- Update conversation handoff state
    UPDATE public.ht_ai_conversations
    SET handoff_state = 'requested',
        updated_at = now()
    WHERE id = p_conversation_id;

    -- If associated with a lead, update lead handoff state ALWAYS, and status ONLY IF lifecycle permits (qualified -> handoff_pending)
    IF v_conv.lead_id IS NOT NULL THEN
        SELECT * INTO v_lead FROM public.ht_leads WHERE id = v_conv.lead_id;
        IF v_lead.id IS NOT NULL THEN
            IF v_lead.tenant_id <> v_conv.tenant_id THEN
                RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Lead does not belong to conversation tenant.';
            END IF;

            v_previous_status := v_lead.status;

            -- Lifecycle transition check: ONLY qualified -> handoff_pending or idempotent handoff_pending -> handoff_pending moves status
            IF v_previous_status IN ('qualified', 'handoff_pending') THEN
                v_valid_transition := true;
            END IF;

            IF v_valid_transition THEN
                UPDATE public.ht_leads
                SET handoff_state = 'requested',
                    handoff_reason = p_reason,
                    handoff_requested_at = now(),
                    status = 'handoff_pending',
                    last_activity_at = now(),
                    updated_at = now()
                WHERE id = v_conv.lead_id;
            ELSE
                -- For 'new' or 'contacted' status: record handoff_state and reason, but DO NOT jump status to handoff_pending
                UPDATE public.ht_leads
                SET handoff_state = 'requested',
                    handoff_reason = p_reason,
                    handoff_requested_at = now(),
                    last_activity_at = now(),
                    updated_at = now()
                WHERE id = v_conv.lead_id;
            END IF;

            INSERT INTO public.audit_events (
                tenant_id, actor_id, actor_role, action,
                resource_type, resource_id, payload
            ) VALUES (
                v_conv.tenant_id::text,
                COALESCE(v_caller_uid::text, 'system'),
                CASE WHEN v_caller_uid IS NULL THEN 'system' ELSE 'staff' END,
                'ht_ai_handoff_requested',
                'ht_leads',
                v_conv.lead_id::text,
                jsonb_build_object(
                    'conversation_id', p_conversation_id,
                    'reason', p_reason,
                    'status_changed', v_valid_transition
                )
            );
        END IF;
    END IF;

    -- Audit at conversation level
    INSERT INTO public.audit_events (
        tenant_id, actor_id, actor_role, action,
        resource_type, resource_id, payload
    ) VALUES (
        v_conv.tenant_id::text,
        COALESCE(v_caller_uid::text, 'system'),
        CASE WHEN v_caller_uid IS NULL THEN 'system' ELSE 'staff' END,
        'ht_ai_handoff_requested',
        'ht_ai_conversations',
        p_conversation_id::text,
        jsonb_build_object('reason', p_reason)
    );

    RETURN jsonb_build_object(
        'success', true,
        'conversation_id', p_conversation_id,
        'handoff_state', 'requested',
        'lead_id', v_conv.lead_id
    );
END;
$$;


-- =========================================================================
-- 10. ht_acknowledge_handoff RPC
-- =========================================================================

CREATE OR REPLACE FUNCTION public.ht_acknowledge_handoff(
    p_lead_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_hsp RECORD;
    v_lead RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    SELECT * INTO v_hsp
    FROM public.ht_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_hsp.staff_id IS NULL OR v_hsp.can_manage_ht_leads = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks can_manage_ht_leads permission.';
    END IF;

    SELECT * INTO v_lead
    FROM public.ht_leads
    WHERE id = p_lead_id;

    IF v_lead.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Lead not found.';
    END IF;

    IF v_lead.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'FORBIDDEN: Cross-tenant handoff acknowledgement denied.';
    END IF;

    IF v_lead.handoff_state <> 'requested' THEN
        RAISE EXCEPTION 'INVALID_STATE: Lead handoff is not in requested state.';
    END IF;

    UPDATE public.ht_leads
    SET handoff_state = 'acknowledged',
        last_activity_at = now(),
        updated_at = now()
    WHERE id = p_lead_id;

    -- Also acknowledge any linked conversations
    UPDATE public.ht_ai_conversations
    SET handoff_state = 'acknowledged',
        updated_at = now()
    WHERE lead_id = p_lead_id
      AND handoff_state = 'requested';

    INSERT INTO public.audit_events (
        tenant_id, actor_id, actor_role, action,
        resource_type, resource_id, payload
    ) VALUES (
        v_staff.tenant_id::text,
        v_caller_uid::text,
        'staff',
        'ht_ai_handoff_acknowledged',
        'ht_leads',
        p_lead_id::text,
        jsonb_build_object(
            'acknowledged_by', v_staff.id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'lead_id', p_lead_id,
        'handoff_state', 'acknowledged'
    );
END;
$$;


-- =========================================================================
-- 11. ht_create_ai_conversation RPC (Server-authoritative, callable from Edge Function)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.ht_create_ai_conversation(
    p_tenant_id UUID,
    p_preferred_language TEXT DEFAULT 'en',
    p_lead_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_session_token TEXT;
    v_conv RECORD;
    v_tenant RECORD;
BEGIN
    -- Validate tenant exists
    SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id;
    IF v_tenant.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Tenant not found.';
    END IF;

    -- If lead_id provided, validate it belongs to the same tenant
    IF p_lead_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.ht_leads WHERE id = p_lead_id AND tenant_id = p_tenant_id) THEN
            RAISE EXCEPTION 'FORBIDDEN: Lead does not belong to this tenant.';
        END IF;
    END IF;

    -- Generate opaque session token (cryptographically random)
    v_session_token := encode(gen_random_bytes(32), 'hex');

    INSERT INTO public.ht_ai_conversations (
        tenant_id, lead_id, session_token,
        preferred_language, status, handoff_state,
        expires_at
    ) VALUES (
        p_tenant_id, p_lead_id, v_session_token,
        COALESCE(p_preferred_language, 'en'), 'active', 'none',
        now() + INTERVAL '30 days'
    )
    RETURNING * INTO v_conv;

    INSERT INTO public.audit_events (
        tenant_id, actor_id, actor_role, action,
        resource_type, resource_id, payload
    ) VALUES (
        p_tenant_id::text,
        'system',
        'system',
        'ht_ai_conversation_started',
        'ht_ai_conversations',
        v_conv.id::text,
        jsonb_build_object(
            'preferred_language', v_conv.preferred_language,
            'has_lead', p_lead_id IS NOT NULL
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'conversation_id', v_conv.id,
        'session_token', v_session_token,
        'tenant_id', p_tenant_id,
        'preferred_language', v_conv.preferred_language,
        'expires_at', v_conv.expires_at
    );
END;
$$;


-- =========================================================================
-- 12. ht_add_ai_message RPC (Server-authoritative, callable from Edge Function)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.ht_add_ai_message(
    p_session_token TEXT,
    p_role TEXT,
    p_content TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_conv RECORD;
    v_msg RECORD;
BEGIN
    IF p_session_token IS NULL OR trim(p_session_token) = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: Session token is required.';
    END IF;

    IF p_role NOT IN ('user', 'assistant', 'system') THEN
        RAISE EXCEPTION 'INVALID_INPUT: Invalid message role.';
    END IF;

    IF p_content IS NULL OR trim(p_content) = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: Message content is required.';
    END IF;

    SELECT * INTO v_conv
    FROM public.ht_ai_conversations
    WHERE session_token = p_session_token;

    IF v_conv.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Conversation not found for session token.';
    END IF;

    IF v_conv.status <> 'active' THEN
        RAISE EXCEPTION 'INVALID_STATE: Conversation is not active.';
    END IF;

    -- Check expiry
    IF v_conv.expires_at < now() THEN
        UPDATE public.ht_ai_conversations SET status = 'expired', updated_at = now() WHERE id = v_conv.id;
        RAISE EXCEPTION 'INVALID_STATE: Conversation has expired.';
    END IF;

    INSERT INTO public.ht_ai_messages (
        conversation_id, role, content, expires_at
    ) VALUES (
        v_conv.id, p_role, p_content,
        v_conv.expires_at
    )
    RETURNING * INTO v_msg;

    -- Update conversation last activity
    UPDATE public.ht_ai_conversations
    SET updated_at = now()
    WHERE id = v_conv.id;

    RETURN jsonb_build_object(
        'success', true,
        'message_id', v_msg.id,
        'conversation_id', v_conv.id,
        'role', v_msg.role,
        'tenant_id', v_conv.tenant_id
    );
END;
$$;


-- =========================================================================
-- 13. ht_get_ai_conversation_by_session RPC
-- =========================================================================

CREATE OR REPLACE FUNCTION public.ht_get_ai_conversation_by_session(
    p_session_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_conv RECORD;
    v_messages JSONB;
BEGIN
    IF p_session_token IS NULL OR trim(p_session_token) = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: Session token is required.';
    END IF;

    SELECT * INTO v_conv
    FROM public.ht_ai_conversations
    WHERE session_token = p_session_token;

    IF v_conv.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Conversation not found for session token.';
    END IF;

    -- Fetch messages
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', m.id,
            'role', m.role,
            'content', m.content,
            'created_at', m.created_at
        ) ORDER BY m.created_at ASC
    ), '[]'::jsonb) INTO v_messages
    FROM public.ht_ai_messages m
    WHERE m.conversation_id = v_conv.id;

    RETURN jsonb_build_object(
        'success', true,
        'conversation', jsonb_build_object(
            'id', v_conv.id,
            'tenant_id', v_conv.tenant_id,
            'lead_id', v_conv.lead_id,
            'preferred_language', v_conv.preferred_language,
            'status', v_conv.status,
            'handoff_state', v_conv.handoff_state,
            'summary', v_conv.summary,
            'expires_at', v_conv.expires_at,
            'created_at', v_conv.created_at,
            'updated_at', v_conv.updated_at
        ),
        'messages', v_messages
    );
END;
$$;


-- =========================================================================
-- 14. ht_cleanup_expired_ai_data RPC — RETENTION ENFORCEMENT
-- =========================================================================

CREATE OR REPLACE FUNCTION public.ht_cleanup_expired_ai_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_deleted_messages INT := 0;
    v_deleted_conversations INT := 0;
BEGIN
    -- Delete expired messages first (preserves conversations)
    WITH deleted_msgs AS (
        DELETE FROM public.ht_ai_messages
        WHERE expires_at < now()
        RETURNING id
    )
    SELECT count(*) INTO v_deleted_messages FROM deleted_msgs;

    -- Delete expired or completed conversations that have no remaining messages
    WITH deleted_convs AS (
        DELETE FROM public.ht_ai_conversations
        WHERE (expires_at < now() OR status = 'expired')
          AND NOT EXISTS (
              SELECT 1 FROM public.ht_ai_messages
              WHERE conversation_id = ht_ai_conversations.id
          )
        RETURNING id
    )
    SELECT count(*) INTO v_deleted_conversations FROM deleted_convs;

    -- NOTE: ht_leads are NEVER deleted by this function.
    -- Lead records survive transcript cleanup.

    RETURN jsonb_build_object(
        'success', true,
        'deleted_messages', v_deleted_messages,
        'deleted_conversations', v_deleted_conversations,
        'leads_deleted', 0
    );
END;
$$;


-- =========================================================================
-- 15. ht_enqueue_whatsapp_handoff RPC — COMMUNICATION_OUTBOX REUSE
-- =========================================================================

CREATE OR REPLACE FUNCTION public.ht_enqueue_whatsapp_handoff(
    p_lead_id UUID,
    p_conversation_id UUID DEFAULT NULL,
    p_handoff_reason TEXT DEFAULT 'human_handoff_requested'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_hsp RECORD;
    v_lead RECORD;
    v_outbox_id UUID;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    SELECT * INTO v_hsp
    FROM public.ht_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_hsp.staff_id IS NULL OR v_hsp.can_manage_ht_leads = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks can_manage_ht_leads permission.';
    END IF;

    SELECT * INTO v_lead
    FROM public.ht_leads
    WHERE id = p_lead_id;

    IF v_lead.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Lead not found.';
    END IF;

    IF v_lead.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'FORBIDDEN: Cross-tenant WhatsApp handoff denied.';
    END IF;

    -- Require phone for WhatsApp
    IF v_lead.phone IS NULL OR trim(v_lead.phone) = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: Lead has no phone number for WhatsApp handoff.';
    END IF;

    -- Insert into existing communication_outbox
    -- NOTE: No real external send. Status stays 'queued' for provider activation in future.
    -- NOTE: passport_number is STRICTLY EXCLUDED from metadata.
    INSERT INTO public.communication_outbox (
        tenant_id, recipient, channel, message, status, metadata
    ) VALUES (
        v_lead.tenant_id::text,
        v_lead.phone,
        'whatsapp',
        'Health tourism handoff notification — pending provider activation.',
        'queued',
        jsonb_build_object(
            'type', 'health_tourism_handoff',
            'lead_id', p_lead_id,
            'conversation_id', p_conversation_id,
            'handoff_reason', p_handoff_reason,
            'preferred_language', v_lead.preferred_language,
            'source_channel', v_lead.source_channel,
            'no_real_send', true
        )
    )
    RETURNING id INTO v_outbox_id;

    INSERT INTO public.audit_events (
        tenant_id, actor_id, actor_role, action,
        resource_type, resource_id, payload
    ) VALUES (
        v_staff.tenant_id::text,
        v_caller_uid::text,
        'staff',
        'ht_whatsapp_handoff_queued',
        'communication_outbox',
        v_outbox_id::text,
        jsonb_build_object(
            'lead_id', p_lead_id,
            'conversation_id', p_conversation_id,
            'handoff_reason', p_handoff_reason
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'outbox_id', v_outbox_id,
        'lead_id', p_lead_id,
        'channel', 'whatsapp'
    );
END;
$$;


-- =========================================================================
-- 16. EXTEND ht_get_lead TO INCLUDE OPERATIONAL FIELDS
-- =========================================================================

CREATE OR REPLACE FUNCTION public.ht_get_lead(
    p_lead_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_hsp RECORD;
    v_lead RECORD;
    v_agency RECORD;
    v_coordinator_name TEXT := NULL;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    SELECT * INTO v_hsp
    FROM public.ht_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_hsp.staff_id IS NULL OR (v_hsp.can_view_ht_leads = false AND v_hsp.can_manage_ht_leads = false) THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks HT lead view permission.';
    END IF;

    SELECT * INTO v_lead
    FROM public.ht_leads
    WHERE id = p_lead_id;

    IF v_lead.id IS NULL OR v_lead.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'NOT_FOUND: Lead not found or cross-tenant access denied.';
    END IF;

    IF v_lead.referring_agency_id IS NOT NULL THEN
        SELECT name, code INTO v_agency
        FROM public.ht_referring_agencies
        WHERE id = v_lead.referring_agency_id;
    END IF;

    IF v_lead.assigned_coordinator_staff_id IS NOT NULL THEN
        SELECT up.full_name INTO v_coordinator_name
        FROM public.staff st
        JOIN public.users_profile up ON up.id = st.user_profile_id
        WHERE st.id = v_lead.assigned_coordinator_staff_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'lead', jsonb_build_object(
            'id', v_lead.id,
            'tenant_id', v_lead.tenant_id,
            'status', v_lead.status,
            'source_channel', v_lead.source_channel,
            'referring_agency_id', v_lead.referring_agency_id,
            'agency_name', v_agency.name,
            'agency_code', v_agency.code,
            'preferred_language', v_lead.preferred_language,
            'country_code', v_lead.country_code,
            'full_name', v_lead.full_name,
            'email', v_lead.email,
            'phone', v_lead.phone,
            'notes', v_lead.notes,
            'assigned_coordinator_staff_id', v_lead.assigned_coordinator_staff_id,
            'coordinator_name', v_coordinator_name,
            'lead_score', v_lead.lead_score,
            'lead_score_band', v_lead.lead_score_band,
            'lead_score_reasons', v_lead.lead_score_reasons,
            'ai_summary', v_lead.ai_summary,
            'ai_summary_updated_at', v_lead.ai_summary_updated_at,
            'handoff_state', v_lead.handoff_state,
            'handoff_reason', v_lead.handoff_reason,
            'handoff_requested_at', v_lead.handoff_requested_at,
            'last_activity_at', v_lead.last_activity_at,
            'created_at', v_lead.created_at,
            'updated_at', v_lead.updated_at
            -- NOTE: passport_number IS STRICTLY EXCLUDED FROM GENERAL BROWSER READ CONTRACTS!
        )
    );
END;
$$;


-- =========================================================================
-- 17. EXTEND ht_list_leads WITH OPERATIONAL FIELDS + FILTERS
-- =========================================================================

CREATE OR REPLACE FUNCTION public.ht_list_leads(
    p_status TEXT DEFAULT NULL,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0,
    p_score_band TEXT DEFAULT NULL,
    p_source_channel TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_hsp RECORD;
    v_limit INT := LEAST(GREATEST(coalesce(p_limit, 50), 1), 100);
    v_offset INT := GREATEST(coalesce(p_offset, 0), 0);
    v_leads JSONB;
    v_total INT;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    SELECT * INTO v_hsp
    FROM public.ht_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_hsp.staff_id IS NULL OR (v_hsp.can_view_ht_leads = false AND v_hsp.can_manage_ht_leads = false) THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks HT lead view permission.';
    END IF;

    -- Count total for pagination
    SELECT count(*) INTO v_total
    FROM public.ht_leads l
    WHERE l.tenant_id = v_staff.tenant_id
      AND (p_status IS NULL OR l.status = lower(trim(p_status)))
      AND (p_score_band IS NULL OR l.lead_score_band = lower(trim(p_score_band)))
      AND (p_source_channel IS NULL OR l.source_channel = lower(trim(p_source_channel)));

    -- SUBQUERY PAGINATION OVER ROW RESULTS FIRST BEFORE JSON AGGREGATION
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', sub.id,
            'tenant_id', sub.tenant_id,
            'status', sub.status,
            'source_channel', sub.source_channel,
            'referring_agency_id', sub.referring_agency_id,
            'agency_name', sub.agency_name,
            'preferred_language', sub.preferred_language,
            'country_code', sub.country_code,
            'full_name', sub.full_name,
            'email', sub.email,
            'phone', sub.phone,
            'assigned_coordinator_staff_id', sub.assigned_coordinator_staff_id,
            'lead_score', sub.lead_score,
            'lead_score_band', sub.lead_score_band,
            'ai_summary', sub.ai_summary,
            'handoff_state', sub.handoff_state,
            'last_activity_at', sub.last_activity_at,
            'created_at', sub.created_at,
            'updated_at', sub.updated_at
            -- NOTE: passport_number IS EXCLUDED FROM LIST PROJECTION FOR PII SAFETY!
        ) ORDER BY sub.created_at DESC
    ), '[]'::jsonb) INTO v_leads
    FROM (
        SELECT l.*, a.name AS agency_name
        FROM public.ht_leads l
        LEFT JOIN public.ht_referring_agencies a ON a.id = l.referring_agency_id
        WHERE l.tenant_id = v_staff.tenant_id
          AND (p_status IS NULL OR l.status = lower(trim(p_status)))
          AND (p_score_band IS NULL OR l.lead_score_band = lower(trim(p_score_band)))
          AND (p_source_channel IS NULL OR l.source_channel = lower(trim(p_source_channel)))
        ORDER BY l.created_at DESC
        LIMIT v_limit OFFSET v_offset
    ) sub;

    RETURN jsonb_build_object(
        'success', true,
        'leads', v_leads,
        'total', v_total,
        'limit', v_limit,
        'offset', v_offset
    );
END;
$$;


-- =========================================================================
-- 18. ht_get_my_context RPC (SERVER-AUTHORITATIVE HT STAFF CONTEXT)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.ht_get_my_context()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_hsp RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'unauthenticated'
        );
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'not_staff'
        );
    END IF;

    SELECT * INTO v_hsp
    FROM public.ht_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_hsp.staff_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'no_ht_profile'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_staff.tenant_id,
        'staff_id', v_staff.id,
        'can_view_ht_leads', v_hsp.can_view_ht_leads,
        'can_manage_ht_leads', v_hsp.can_manage_ht_leads
    );
END;
$$;


-- =========================================================================
-- 19. SERVER-INTERNAL PRIMITIVES: LINKING & SUMMARY PERSISTENCE
-- =========================================================================

CREATE OR REPLACE FUNCTION public.ht_link_ai_conversation_to_lead(
    p_conversation_id UUID,
    p_lead_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_conv RECORD;
    v_lead RECORD;
BEGIN
    SELECT * INTO v_conv FROM public.ht_ai_conversations WHERE id = p_conversation_id;
    IF v_conv.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Conversation not found.';
    END IF;

    SELECT * INTO v_lead FROM public.ht_leads WHERE id = p_lead_id;
    IF v_lead.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Lead not found.';
    END IF;

    -- Enforce exact same tenant
    IF v_conv.tenant_id <> v_lead.tenant_id THEN
        RAISE EXCEPTION 'FORBIDDEN: Cross-tenant conversation lead binding denied.';
    END IF;

    -- Prevent rebinding to a DIFFERENT lead
    IF v_conv.lead_id IS NOT NULL AND v_conv.lead_id <> p_lead_id THEN
        RAISE EXCEPTION 'INVALID_STATE: Conversation is already linked to a different lead.';
    END IF;

    -- Idempotent check: if already linked to same lead, return success
    IF v_conv.lead_id = p_lead_id THEN
        RETURN jsonb_build_object(
            'success', true,
            'conversation_id', p_conversation_id,
            'lead_id', p_lead_id,
            'already_linked', true
        );
    END IF;

    UPDATE public.ht_ai_conversations
    SET lead_id = p_lead_id,
        updated_at = now()
    WHERE id = p_conversation_id;

    -- Also copy latest summary to lead if present
    IF v_conv.summary IS NOT NULL THEN
        UPDATE public.ht_leads
        SET ai_summary = v_conv.summary,
            ai_summary_updated_at = now(),
            updated_at = now()
        WHERE id = p_lead_id;
    END IF;

    INSERT INTO public.audit_events (
        tenant_id, actor_id, actor_role, action,
        resource_type, resource_id, payload
    ) VALUES (
        v_conv.tenant_id::text,
        'system',
        'system',
        'ht_ai_conversation_linked_to_lead',
        'ht_ai_conversations',
        p_conversation_id::text,
        jsonb_build_object('lead_id', p_lead_id)
    );

    RETURN jsonb_build_object(
        'success', true,
        'conversation_id', p_conversation_id,
        'lead_id', p_lead_id,
        'already_linked', false
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.ht_update_ai_conversation_summary(
    p_conversation_id UUID,
    p_summary TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_conv RECORD;
    v_labeled_summary TEXT;
BEGIN
    SELECT * INTO v_conv FROM public.ht_ai_conversations WHERE id = p_conversation_id;
    IF v_conv.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Conversation not found.';
    END IF;

    -- Ensure explicit assistive label
    IF p_summary NOT LIKE '%AI-generated assistive summary — not verified clinical fact%' THEN
        v_labeled_summary := '[AI-generated assistive summary — not verified clinical fact] ' || p_summary;
    ELSE
        v_labeled_summary := p_summary;
    END IF;

    UPDATE public.ht_ai_conversations
    SET summary = v_labeled_summary,
        updated_at = now()
    WHERE id = p_conversation_id;

    -- If linked to lead, propagate to ht_leads
    IF v_conv.lead_id IS NOT NULL THEN
        UPDATE public.ht_leads
        SET ai_summary = v_labeled_summary,
            ai_summary_updated_at = now(),
            updated_at = now()
        WHERE id = v_conv.lead_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'conversation_id', p_conversation_id,
        'lead_id', v_conv.lead_id,
        'summary', v_labeled_summary
    );
END;
$$;


-- =========================================================================
-- 20. EXECUTE PERMISSIONS FOR NEW FUNCTIONS
-- =========================================================================

-- Revoke from public, anon, and authenticated for server-internal AI persistence & global cleanup RPCs
REVOKE ALL ON FUNCTION public.ht_assign_coordinator FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ht_score_lead FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ht_update_ai_summary FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ht_request_handoff FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ht_acknowledge_handoff FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ht_create_ai_conversation FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ht_add_ai_message FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ht_get_ai_conversation_by_session FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ht_cleanup_expired_ai_data FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ht_link_ai_conversation_to_lead FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ht_update_ai_conversation_summary FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ht_enqueue_whatsapp_handoff FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ht_get_my_context FROM PUBLIC, anon;

-- Explicitly GRANT EXECUTE ON server-internal functions TO service_role
GRANT EXECUTE ON FUNCTION public.ht_create_ai_conversation TO service_role;
GRANT EXECUTE ON FUNCTION public.ht_add_ai_message TO service_role;
GRANT EXECUTE ON FUNCTION public.ht_get_ai_conversation_by_session TO service_role;
GRANT EXECUTE ON FUNCTION public.ht_cleanup_expired_ai_data TO service_role;
GRANT EXECUTE ON FUNCTION public.ht_link_ai_conversation_to_lead TO service_role;
GRANT EXECUTE ON FUNCTION public.ht_update_ai_conversation_summary TO service_role;

-- Staff-side operational RPCs (restricted to authenticated)
GRANT EXECUTE ON FUNCTION public.ht_assign_coordinator TO authenticated;
GRANT EXECUTE ON FUNCTION public.ht_score_lead TO authenticated;
GRANT EXECUTE ON FUNCTION public.ht_update_ai_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.ht_acknowledge_handoff TO authenticated;
GRANT EXECUTE ON FUNCTION public.ht_enqueue_whatsapp_handoff TO authenticated;
GRANT EXECUTE ON FUNCTION public.ht_request_handoff TO authenticated;
GRANT EXECUTE ON FUNCTION public.ht_get_my_context TO authenticated;

-- Re-grant existing hardened functions
GRANT EXECUTE ON FUNCTION public.ht_update_lead_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.ht_list_leads TO authenticated;
GRANT EXECUTE ON FUNCTION public.ht_get_lead TO authenticated;

