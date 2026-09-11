-- ===========================================================================
-- Migration: Phase 3 Waitlist Domain Foundation (R2 Canonical Alignment)
-- Authority: LARI-PROGRAM-V2-EV056-WAITLIST-FOUNDATION-R2-CORRECTION-20260910-01
-- Program: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
-- Phase: 3 (PRODUCT_COMPLETENESS_BEFORE_EXTERNAL_PROVIDERS)
-- Base: 09bb1f8d8ce070c33d09099a6d0ae20c93787d11
-- Stacked on: 40ea5b6d4854f58e89ed618979f8681303193aa2
--
-- Controller R2 Corrections Applied:
-- 1. CANONICAL BRANCH BINDING:
--    Uses canonical public.branches.
--    Binds staff and services using canonical staff_branches and service_branches.
-- 2. COMPOSITE TENANT-SAFE RELATIONSHIPS:
--    Foreign keys enforce relational tenant isolation at the database level:
--    (branch_id, tenant_id) -> branches(id, tenant_id)
--    (service_id, tenant_id) -> services(id, tenant_id)
--    (staff_id, tenant_id) -> staff(id, tenant_id)
-- 3. EXPLICIT ROLE ALLOWLISTING IN offer_waitlist_slot:
--    Explicit check: role IN ('tenant_owner', 'staff') for matching tenant, or super_admin.
--    Role 'customer' is strictly denied.
-- 4. CRYPTOGRAPHIC CLAIM CAPABILITY:
--    256-bit unguessable random token (gen_random_bytes(32)). Raw token is never stored in DB.
--    Server persists only SHA-256 digest (claim_token_hash).
--    Claim tokens are single-use with bounded expiration (p_expires_in_minutes: 5..1440).
-- 5. CANONICAL BOOKING INVARIANT ENGINE BOUNDARY:
--    claim_waitlist_slot reuses canonical public.evaluate_booking_slot to validate:
--    branch mapping, service-branch, staff-branch, staff-service, schedule constraints (EV055),
--    future slot in timezone, and asymmetric overlapping appointments.
--    Inserts confirmed appointment matching canonical create_public_booking column contracts
--    (including duration_minutes, user_name, phone, customer_id, branch_id).
-- 6. CANONICAL ADVISORY LOCKING:
--    claim_waitlist_slot acquires advisory lock matching canonical booking / reschedule paths.
-- 7. NO DIRECT TABLE MUTATION:
--    booking_waitlist is protected against anon direct read and write (REVOKE ALL FROM PUBLIC, anon).
--    State machine transitions occur strictly through bounded RPCs (join, offer, claim, cancel).
--    claim_token_hash is never exposed in tenant-facing queries.
-- 8. AUTHORIZED CANCEL RPC:
--    public.cancel_waitlist_slot handles cancellation by authorized tenant owner/staff or super_admin.
-- ===========================================================================

-- =========================================================================
-- 1. Table: public.booking_waitlist
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.booking_waitlist (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id           UUID DEFAULT NULL,
    service_id          UUID NOT NULL,
    staff_id            UUID DEFAULT NULL,
    customer_name       TEXT NOT NULL,
    customer_phone      TEXT NOT NULL,
    customer_email      TEXT DEFAULT NULL,
    preferred_date      DATE NOT NULL,
    preferred_time_start TIME WITHOUT TIME ZONE DEFAULT NULL,
    preferred_time_end   TIME WITHOUT TIME ZONE DEFAULT NULL,
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'offered', 'claimed', 'expired', 'cancelled')),
    offered_at          TIMESTAMPTZ DEFAULT NULL,
    offer_expires_at    TIMESTAMPTZ DEFAULT NULL,
    offered_appointment_date DATE DEFAULT NULL,
    offered_appointment_time TIME WITHOUT TIME ZONE DEFAULT NULL,
    offered_staff_id    UUID DEFAULT NULL,
    offered_branch_id   UUID DEFAULT NULL,
    claim_token_hash    TEXT DEFAULT NULL,
    notes               TEXT DEFAULT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Composite foreign keys ensuring fail-closed relational tenant containment
    CONSTRAINT fk_waitlist_branch_tenant FOREIGN KEY (branch_id, tenant_id)
        REFERENCES public.branches(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_waitlist_service_tenant FOREIGN KEY (service_id, tenant_id)
        REFERENCES public.services(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_waitlist_staff_tenant FOREIGN KEY (staff_id, tenant_id)
        REFERENCES public.staff(id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT fk_waitlist_offered_staff_tenant FOREIGN KEY (offered_staff_id, tenant_id)
        REFERENCES public.staff(id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT fk_waitlist_offered_branch_tenant FOREIGN KEY (offered_branch_id, tenant_id)
        REFERENCES public.branches(id, tenant_id) ON DELETE CASCADE,

    CONSTRAINT booking_waitlist_time_window CHECK (
        (preferred_time_start IS NULL AND preferred_time_end IS NULL) OR
        (preferred_time_start IS NOT NULL AND preferred_time_end IS NOT NULL AND preferred_time_end >= preferred_time_start)
    )
);

CREATE INDEX IF NOT EXISTS idx_booking_waitlist_tenant_status ON public.booking_waitlist(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_booking_waitlist_service_date ON public.booking_waitlist(service_id, preferred_date);
CREATE INDEX IF NOT EXISTS idx_booking_waitlist_customer_phone ON public.booking_waitlist(tenant_id, customer_phone);
CREATE INDEX IF NOT EXISTS idx_booking_waitlist_claim_token_hash ON public.booking_waitlist(claim_token_hash) WHERE claim_token_hash IS NOT NULL;

CREATE TRIGGER update_booking_waitlist_modtime
    BEFORE UPDATE ON public.booking_waitlist
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.booking_waitlist ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.booking_waitlist FROM PUBLIC;
REVOKE ALL ON public.booking_waitlist FROM anon;
REVOKE ALL ON public.booking_waitlist FROM authenticated;

-- Service role retains internal access; no direct browser table access.

-- =========================================================================
-- 1.1. Sanitized Tenant-Scoped Waitlist Listing RPC: get_sanitized_waitlist_entries
-- =========================================================================
-- Exposes sanitized projection to authorized tenant admins/staff.
-- Never exposes claim_token_hash.
CREATE OR REPLACE FUNCTION public.get_sanitized_waitlist_entries(
    p_tenant_id UUID,
    p_status TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    tenant_id UUID,
    branch_id UUID,
    service_id UUID,
    preferred_date DATE,
    preferred_time_start TIME,
    preferred_time_end TIME,
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    notes TEXT,
    status TEXT,
    offered_at TIMESTAMPTZ,
    offer_expires_at TIMESTAMPTZ,
    offered_staff_id UUID,
    offered_branch_id UUID,
    offered_appointment_date DATE,
    offered_appointment_time TIME,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_caller_uid UUID;
    v_caller_role TEXT;
    v_caller_tenant_id UUID;
    v_bounded_limit INTEGER;
BEGIN
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT up.role, up.tenant_id
    INTO v_caller_role, v_caller_tenant_id
    FROM public.users_profile up
    WHERE up.id = v_caller_uid AND up.active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CALLER_NOT_ACTIVE';
    END IF;

    IF v_caller_role != 'super_admin' AND v_caller_role NOT IN ('tenant_owner', 'staff') THEN
        RAISE EXCEPTION 'ROLE_NOT_AUTHORIZED';
    END IF;

    IF v_caller_role != 'super_admin' AND (v_caller_tenant_id IS NULL OR v_caller_tenant_id != p_tenant_id) THEN
        RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT';
    END IF;

    v_bounded_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);

    RETURN QUERY
    SELECT
        w.id,
        w.tenant_id,
        w.branch_id,
        w.service_id,
        w.preferred_date,
        w.preferred_time_start,
        w.preferred_time_end,
        w.customer_name,
        w.customer_phone,
        w.customer_email,
        w.notes,
        w.status,
        w.offered_at,
        w.offer_expires_at,
        w.offered_staff_id,
        w.offered_branch_id,
        w.offered_appointment_date,
        w.offered_appointment_time,
        w.created_at,
        w.updated_at
    FROM public.booking_waitlist w
    WHERE w.tenant_id = p_tenant_id
      AND (p_status IS NULL OR w.status = p_status)
    ORDER BY w.created_at DESC
    LIMIT v_bounded_limit
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_sanitized_waitlist_entries(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sanitized_waitlist_entries(UUID, TEXT, INTEGER, INTEGER) TO authenticated;

-- =========================================================================
-- 2. State Machine Enforcement Trigger
-- =========================================================================

CREATE OR REPLACE FUNCTION public.enforce_waitlist_state_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Valid transitions:
    -- pending -> offered, cancelled
    -- offered -> claimed, expired, cancelled
    -- Terminal states: claimed, expired, cancelled cannot reopen
    IF OLD.status = 'pending' AND NEW.status IN ('offered', 'cancelled') THEN
        RETURN NEW;
    ELSIF OLD.status = 'offered' AND NEW.status IN ('claimed', 'expired', 'cancelled') THEN
        RETURN NEW;
    ELSE
        RAISE EXCEPTION 'INVALID_WAITLIST_STATE_TRANSITION: Cannot transition from % to %', OLD.status, NEW.status;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_waitlist_state_transition ON public.booking_waitlist;
CREATE TRIGGER trg_enforce_waitlist_state_transition
    BEFORE UPDATE ON public.booking_waitlist
    FOR EACH ROW EXECUTE FUNCTION public.enforce_waitlist_state_transition();

-- =========================================================================
-- 3. Public Intake RPC: join_booking_waitlist
-- =========================================================================

CREATE OR REPLACE FUNCTION public.join_booking_waitlist(
    p_tenant_id             UUID,
    p_service_id            UUID,
    p_preferred_date        DATE,
    p_customer_name         TEXT,
    p_customer_phone        TEXT,
    p_customer_email        TEXT DEFAULT NULL,
    p_staff_id              UUID DEFAULT NULL,
    p_branch_id             UUID DEFAULT NULL,
    p_preferred_time_start  TIME DEFAULT NULL,
    p_preferred_time_end    TIME DEFAULT NULL,
    p_notes                 TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_new_id UUID;
    v_tenant_status TEXT;
    v_clean_name TEXT;
    v_clean_phone TEXT;
    v_clean_email TEXT;
BEGIN
    -- Input bounds validation
    v_clean_name := trim(COALESCE(p_customer_name, ''));
    v_clean_phone := trim(COALESCE(p_customer_phone, ''));
    v_clean_email := NULLIF(trim(COALESCE(p_customer_email, '')), '');

    IF length(v_clean_name) < 2 OR length(v_clean_name) > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CUSTOMER_NAME');
    END IF;

    IF length(v_clean_phone) < 7 OR length(v_clean_phone) > 25 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CUSTOMER_PHONE');
    END IF;

    IF v_clean_email IS NOT NULL THEN
        IF length(v_clean_email) > 120 OR v_clean_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
            RETURN jsonb_build_object('success', false, 'error', 'INVALID_CUSTOMER_EMAIL');
        END IF;
    END IF;

    IF p_notes IS NOT NULL AND length(p_notes) > 500 THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOTES_TOO_LONG');
    END IF;

    -- Anti-abuse / rate limiting: max 5 waitlist submissions per phone/tenant per hour
    DECLARE
        v_rate_limit_res JSONB;
    BEGIN
        v_rate_limit_res := public.ht_check_rate_limit(
            p_bucket_key     => 'waitlist:' || p_tenant_id::text || ':' || v_clean_phone,
            p_max_requests   => 5,
            p_window_seconds => 3600
        );
        IF (v_rate_limit_res->>'allowed')::BOOLEAN IS FALSE THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'RATE_LIMIT_EXCEEDED',
                'retry_after_seconds', v_rate_limit_res->>'retry_after_seconds'
            );
        END IF;
    EXCEPTION
        WHEN undefined_function OR undefined_table THEN
            -- Reusable fallback if ht_check_rate_limit is not present in local test env
            NULL;
    END;

    -- Validate tenant
    SELECT status INTO v_tenant_status FROM public.tenants WHERE id = p_tenant_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND');
    END IF;

    IF v_tenant_status NOT IN ('active', 'trialing') THEN
        RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_ACTIVE');
    END IF;

    -- Validate service belongs to tenant and is active
    IF NOT EXISTS (SELECT 1 FROM public.services WHERE id = p_service_id AND tenant_id = p_tenant_id AND active = true) THEN
        RETURN jsonb_build_object('success', false, 'error', 'SERVICE_NOT_FOUND');
    END IF;

    -- Validate branch if provided
    IF p_branch_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = p_tenant_id AND is_active = true) THEN
            RETURN jsonb_build_object('success', false, 'error', 'BRANCH_NOT_FOUND');
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.service_branches WHERE service_id = p_service_id AND branch_id = p_branch_id AND tenant_id = p_tenant_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'SERVICE_BRANCH_MISMATCH');
        END IF;
    END IF;

    -- Validate staff if provided
    IF p_staff_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = p_staff_id AND tenant_id = p_tenant_id AND active = true) THEN
            RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND');
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.staff_services WHERE staff_id = p_staff_id AND service_id = p_service_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'STAFF_SERVICE_MISMATCH');
        END IF;

        IF p_branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.staff_branches WHERE staff_id = p_staff_id AND branch_id = p_branch_id AND tenant_id = p_tenant_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'STAFF_BRANCH_MISMATCH');
        END IF;
    END IF;

    -- Preferred date bounds: must be between CURRENT_DATE and CURRENT_DATE + 90 days
    IF p_preferred_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_DATE');
    END IF;

    IF p_preferred_date > (CURRENT_DATE + INTERVAL '90 days')::DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'PREFERRED_DATE_EXCEEDS_HORIZON');
    END IF;

    IF p_preferred_time_start IS NOT NULL AND p_preferred_time_end IS NOT NULL AND p_preferred_time_end < p_preferred_time_start THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_TIME_WINDOW');
    END IF;

    INSERT INTO public.booking_waitlist (
        tenant_id,
        branch_id,
        service_id,
        staff_id,
        customer_name,
        customer_phone,
        customer_email,
        preferred_date,
        preferred_time_start,
        preferred_time_end,
        notes,
        status
    ) VALUES (
        p_tenant_id,
        p_branch_id,
        p_service_id,
        p_staff_id,
        v_clean_name,
        v_clean_phone,
        v_clean_email,
        p_preferred_date,
        p_preferred_time_start,
        p_preferred_time_end,
        p_notes,
        'pending'
    ) RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true,
        'waitlist_id', v_new_id,
        'status', 'pending'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_booking_waitlist(UUID, UUID, DATE, TEXT, TEXT, TEXT, UUID, UUID, TIME, TIME, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_booking_waitlist(UUID, UUID, DATE, TEXT, TEXT, TEXT, UUID, UUID, TIME, TIME, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.join_booking_waitlist(UUID, UUID, DATE, TEXT, TEXT, TEXT, UUID, UUID, TIME, TIME, TEXT) TO authenticated;

-- =========================================================================
-- 4. Authorized Tenant Admin RPC: offer_waitlist_slot
-- =========================================================================

CREATE OR REPLACE FUNCTION public.offer_waitlist_slot(
    p_waitlist_id           UUID,
    p_offered_date          DATE,
    p_offered_time          TIME,
    p_offered_staff_id      UUID,
    p_offered_branch_id     UUID DEFAULT NULL,
    p_expires_in_minutes    INTEGER DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_caller_uid UUID;
    v_caller_role TEXT;
    v_caller_tenant_id UUID;
    v_entry public.booking_waitlist%ROWTYPE;
    v_target_branch_id UUID;
    v_branch_count INTEGER;
    v_eval_res JSONB;
    v_raw_token TEXT;
    v_token_hash TEXT;
    v_bounded_expires_min INTEGER;
    v_expires_at TIMESTAMPTZ;
BEGIN
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
    END IF;

    -- Explicit Role Allowlisting: role IN ('tenant_owner', 'staff') OR super_admin
    SELECT up.role, up.tenant_id
    INTO v_caller_role, v_caller_tenant_id
    FROM public.users_profile up
    WHERE up.id = v_caller_uid AND up.active = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'CALLER_NOT_ACTIVE');
    END IF;

    IF v_caller_role != 'super_admin' AND v_caller_role NOT IN ('tenant_owner', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'error', 'ROLE_NOT_AUTHORIZED');
    END IF;

    -- Lock waitlist entry FOR UPDATE
    SELECT * INTO v_entry
    FROM public.booking_waitlist
    WHERE id = p_waitlist_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'WAITLIST_ENTRY_NOT_FOUND');
    END IF;

    -- Tenant isolation check
    IF v_caller_role != 'super_admin' AND (v_caller_tenant_id IS NULL OR v_caller_tenant_id != v_entry.tenant_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_CROSS_TENANT');
    END IF;

    IF v_entry.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS', 'current_status', v_entry.status);
    END IF;

    -- Resolve branch
    v_target_branch_id := COALESCE(p_offered_branch_id, v_entry.branch_id);
    IF v_target_branch_id IS NULL THEN
        SELECT count(*), min(id) INTO v_branch_count, v_target_branch_id
        FROM public.branches WHERE tenant_id = v_entry.tenant_id AND is_active = true;

        IF v_branch_count = 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'NO_ACTIVE_BRANCHES');
        ELSIF v_branch_count > 1 THEN
            RETURN jsonb_build_object('success', false, 'error', 'BRANCH_REQUIRED');
        END IF;
    END IF;

    -- Validate offered slot with canonical evaluate_booking_slot at OFFER time
    v_eval_res := public.evaluate_booking_slot(
        p_tenant_id  => v_entry.tenant_id,
        p_branch_id  => v_target_branch_id,
        p_service_id => v_entry.service_id,
        p_staff_id   => p_offered_staff_id,
        p_date       => p_offered_date,
        p_time       => p_offered_time
    );

    IF (v_eval_res->>'allowed')::BOOLEAN IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'SLOT_NOT_AVAILABLE', 'reason_code', v_eval_res->>'reason_code');
    END IF;

    -- Bound expiration window: 5 min to 1440 min (24 hours)
    v_bounded_expires_min := LEAST(GREATEST(COALESCE(p_expires_in_minutes, 60), 5), 1440);
    v_expires_at := NOW() + (v_bounded_expires_min || ' minutes')::interval;

    -- Generate cryptographically unguessable 256-bit random token
    v_raw_token  := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(sha256(v_raw_token::bytea), 'hex');

    UPDATE public.booking_waitlist
    SET status = 'offered',
        offered_appointment_date = p_offered_date,
        offered_appointment_time = p_offered_time,
        offered_staff_id = p_offered_staff_id,
        offered_branch_id = v_target_branch_id,
        claim_token_hash = v_token_hash,
        offered_at = NOW(),
        offer_expires_at = v_expires_at,
        updated_at = NOW()
    WHERE id = p_waitlist_id;

    -- Return raw token to caller once for dispatch; never stored in plaintext in DB
    RETURN jsonb_build_object(
        'success', true,
        'waitlist_id', p_waitlist_id,
        'status', 'offered',
        'claim_token', v_raw_token,
        'offer_expires_at', v_expires_at
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.offer_waitlist_slot(UUID, DATE, TIME, UUID, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.offer_waitlist_slot(UUID, DATE, TIME, UUID, UUID, INTEGER) TO authenticated;

-- =========================================================================
-- 5. Public One-Time Claim RPC: claim_waitlist_slot
-- =========================================================================

CREATE OR REPLACE FUNCTION public.claim_waitlist_slot(
    p_claim_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_token_hash TEXT;
    v_entry public.booking_waitlist%ROWTYPE;
    v_eval_res JSONB;
    v_svc_duration INTEGER;
    v_customer_id UUID;
    v_appointment_id UUID;
    v_manage_token TEXT;
    v_manage_token_hash TEXT;
    v_manage_expires_at TIMESTAMPTZ;
BEGIN
    IF p_claim_token IS NULL OR length(trim(p_claim_token)) < 32 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CLAIM_TOKEN');
    END IF;

    -- SHA-256 digest lookup
    v_token_hash := encode(sha256(trim(p_claim_token)::bytea), 'hex');

    -- Lock waitlist entry row FOR UPDATE
    SELECT * INTO v_entry
    FROM public.booking_waitlist
    WHERE claim_token_hash = v_token_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'CLAIM_TOKEN_NOT_FOUND');
    END IF;

    IF v_entry.status != 'offered' THEN
        RETURN jsonb_build_object('success', false, 'error', 'OFFER_NOT_ACTIVE', 'current_status', v_entry.status);
    END IF;

    IF v_entry.offer_expires_at IS NOT NULL AND v_entry.offer_expires_at < NOW() THEN
        UPDATE public.booking_waitlist
        SET status = 'expired', claim_token_hash = NULL, updated_at = NOW()
        WHERE id = v_entry.id;

        RETURN jsonb_build_object('success', false, 'error', 'OFFER_EXPIRED');
    END IF;

    -- Canonical 64-bit advisory locking matching canonical booking transaction primitive exactly
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            v_entry.tenant_id::text || ':' || v_entry.offered_staff_id::text || ':' || v_entry.offered_appointment_date::text,
            0
        )
    );

    -- Gate: Canonical Tenant Status & Public Site Check
    DECLARE
        v_t_status TEXT;
        v_t_onboarding TEXT;
        v_t_public TEXT;
        v_elig JSONB;
        v_action JSONB;
        v_quota_res JSONB;
        v_period_key TEXT;
    BEGIN
        SELECT status, onboarding_status, public_site_status
        INTO v_t_status, v_t_onboarding, v_t_public
        FROM public.tenants
        WHERE id = v_entry.tenant_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND');
        END IF;

        IF v_t_status IS DISTINCT FROM 'active' AND v_t_status IS DISTINCT FROM 'manual_active' THEN
            RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_ACTIVE');
        END IF;

        IF v_t_onboarding IS DISTINCT FROM 'completed' OR v_t_public IS DISTINCT FROM 'published' THEN
            RETURN jsonb_build_object('success', false, 'error', 'BOOKING_UNAVAILABLE');
        END IF;

        -- Gate: Commercial Subscription & Feature Entitlement Check (Fail-closed)
        v_elig := public.resolve_tenant_commercial_eligibility(v_entry.tenant_id);
        IF NOT (v_elig->>'eligible')::BOOLEAN THEN
            RETURN jsonb_build_object('success', false, 'error', 'COMMERCIAL_INELIGIBLE', 'reason_code', v_elig->>'reason_code');
        END IF;

        v_action := public.assert_tenant_commercial_action_allowed(v_entry.tenant_id, 'core_booking');
        IF NOT (v_action->>'allowed')::BOOLEAN THEN
            RETURN jsonb_build_object('success', false, 'error', 'COMMERCIAL_ACTION_DENIED', 'reason_code', v_action->>'reason_code');
        END IF;
    END;

    -- Cross the canonical booking evaluator boundary atomically at claim time (non-mutating validation)
    v_eval_res := public.evaluate_booking_slot(
        p_tenant_id  => v_entry.tenant_id,
        p_branch_id  => v_entry.offered_branch_id,
        p_service_id => v_entry.service_id,
        p_staff_id   => v_entry.offered_staff_id,
        p_date       => v_entry.offered_appointment_date,
        p_time       => v_entry.offered_appointment_time
    );

    IF (v_eval_res->>'allowed')::BOOLEAN IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'SLOT_CONFLICT', 'reason_code', v_eval_res->>'reason_code');
    END IF;

    v_svc_duration := (v_eval_res->>'duration_minutes')::INTEGER;

    -- Customer resolution
    IF v_entry.customer_phone IS NOT NULL AND trim(v_entry.customer_phone) != '' THEN
        SELECT id INTO v_customer_id FROM public.customers
        WHERE tenant_id = v_entry.tenant_id AND phone = v_entry.customer_phone LIMIT 1;
    END IF;

    IF v_customer_id IS NULL AND v_entry.customer_email IS NOT NULL AND trim(v_entry.customer_email) != '' THEN
        SELECT id INTO v_customer_id FROM public.customers
        WHERE tenant_id = v_entry.tenant_id AND email = v_entry.customer_email LIMIT 1;
    END IF;

    IF v_customer_id IS NULL THEN
        INSERT INTO public.customers (tenant_id, name, email, phone)
        VALUES (v_entry.tenant_id, v_entry.customer_name, v_entry.customer_email, v_entry.customer_phone)
        RETURNING id INTO v_customer_id;
    END IF;

    -- Insert canonical consent ledger entries (Fail-closed)
    INSERT INTO public.consent_ledger (tenant_id, customer_id, consent_type, is_granted, ip_address)
    VALUES
        (v_entry.tenant_id::text, v_customer_id::text, 'booking_terms', true, 'rpc_waitlist_claim'),
        (v_entry.tenant_id::text, v_customer_id::text, 'marketing', false, 'rpc_waitlist_claim'),
        (v_entry.tenant_id::text, v_customer_id::text, 'reminders', true, 'rpc_waitlist_claim');

    -- Gate: Consume Commercial Appointment Quota (AFTER all non-mutating validations passed)
    -- All-or-nothing: quota consumption and appointment creation succeed together or fail together.
    DECLARE
        v_period_key TEXT;
        v_quota_res JSONB;
    BEGIN
        v_period_key := public.resolve_quota_period_key(v_entry.tenant_id, 'max_monthly_appointments');
        v_quota_res := public.consume_commercial_usage(v_entry.tenant_id, 'max_monthly_appointments', v_period_key);
        IF NOT (v_quota_res->>'success')::BOOLEAN THEN
            RETURN jsonb_build_object('success', false, 'error', 'COMMERCIAL_QUOTA_EXCEEDED');
        END IF;
    END;

    -- Canonical appointment insertion matching create_public_booking contract
    INSERT INTO public.appointments (
        tenant_id,
        branch_id,
        customer_id,
        user_name,
        user_email,
        phone,
        service_id,
        staff_id,
        appointment_date,
        appointment_time,
        duration_minutes,
        status,
        notes
    ) VALUES (
        v_entry.tenant_id,
        v_entry.offered_branch_id,
        v_customer_id,
        v_entry.customer_name,
        v_entry.customer_email,
        v_entry.customer_phone,
        v_entry.service_id,
        v_entry.offered_staff_id,
        v_entry.offered_appointment_date,
        v_entry.offered_appointment_time,
        v_svc_duration,
        'confirmed',
        'Claimed from waitlist (' || v_entry.id || ')'
    ) RETURNING id INTO v_appointment_id;

    -- Generate appointment management access token
    v_manage_token      := encode(gen_random_bytes(32), 'hex');
    v_manage_token_hash := encode(sha256(v_manage_token::bytea), 'hex');
    v_manage_expires_at := NOW() + interval '30 days';

    INSERT INTO public.appointment_access_tokens (
        tenant_id, appointment_id, token_hash, expires_at
    ) VALUES (
        v_entry.tenant_id::text, v_appointment_id, v_manage_token_hash, v_manage_expires_at
    );

    -- Invalidate claim token immediately (single-use) and transition status to claimed
    UPDATE public.booking_waitlist
    SET status = 'claimed',
        claim_token_hash = NULL,
        updated_at = NOW()
    WHERE id = v_entry.id;

    RETURN jsonb_build_object(
        'success', true,
        'waitlist_id', v_entry.id,
        'appointment_id', v_appointment_id,
        'manage_token', v_manage_token,
        'status', 'claimed'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_waitlist_slot(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_slot(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_slot(TEXT) TO authenticated;

-- =========================================================================
-- 6. Authorized Cancellation RPC: cancel_waitlist_slot
-- =========================================================================

CREATE OR REPLACE FUNCTION public.cancel_waitlist_slot(
    p_waitlist_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_caller_uid UUID;
    v_caller_role TEXT;
    v_caller_tenant_id UUID;
    v_entry public.booking_waitlist%ROWTYPE;
BEGIN
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
    END IF;

    SELECT up.role, up.tenant_id
    INTO v_caller_role, v_caller_tenant_id
    FROM public.users_profile up
    WHERE up.id = v_caller_uid AND up.active = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'CALLER_NOT_ACTIVE');
    END IF;

    IF v_caller_role != 'super_admin' AND v_caller_role NOT IN ('tenant_owner', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'error', 'ROLE_NOT_AUTHORIZED');
    END IF;

    SELECT * INTO v_entry
    FROM public.booking_waitlist
    WHERE id = p_waitlist_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'WAITLIST_ENTRY_NOT_FOUND');
    END IF;

    IF v_caller_role != 'super_admin' AND (v_caller_tenant_id IS NULL OR v_caller_tenant_id != v_entry.tenant_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_CROSS_TENANT');
    END IF;

    IF v_entry.status IN ('claimed', 'expired', 'cancelled') THEN
        RETURN jsonb_build_object('success', false, 'error', 'TERMINAL_STATE_CANNOT_CANCEL', 'current_status', v_entry.status);
    END IF;

    UPDATE public.booking_waitlist
    SET status = 'cancelled',
        claim_token_hash = NULL,
        notes = CASE WHEN p_reason IS NOT NULL THEN COALESCE(notes || ' | ', '') || 'Cancelled: ' || p_reason ELSE notes END,
        updated_at = NOW()
    WHERE id = p_waitlist_id;

    RETURN jsonb_build_object('success', true, 'waitlist_id', p_waitlist_id, 'status', 'cancelled');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_waitlist_slot(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_waitlist_slot(UUID, TEXT) TO authenticated;
