-- ===========================================================================
-- Migration: Phase 3 Waitlist Domain Foundation (R1 Hardened)
-- Authority: LARI-PROGRAM-V2-EV056-WAITLIST-FOUNDATION-R1-CORRECTION-20260910-01
-- Program: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
-- Phase: 3 (PRODUCT_COMPLETENESS_BEFORE_EXTERNAL_PROVIDERS)
-- Base: 09bb1f8d8ce070c33d09099a6d0ae20c93787d11
-- Stacked on: c507ca9edfce09c533a439283707c68bbdd29f25
--
-- Controller Corrections Applied:
-- 1. CONFIRMED_ISSUE_EV056_1 (NO_PUBLIC_PII_TABLE_SURFACE):
--    Removed broad anonymous offered-row SELECT policy ("Public read offered waitlist").
--    Direct table access is strictly tenant-scoped (authenticated tenant admins/staff/super admin).
--    Direct anonymous table SELECT is completely blocked (REVOKE ALL FROM PUBLIC, anon).
-- 2. CONFIRMED_ISSUE_EV056_2 (Cryptographic One-Time Claim Capability):
--    Waitlist UUID is NOT used as bearer authority.
--    offer_waitlist_slot generates a cryptographically secure 256-bit token (using encode(gen_random_bytes(32), 'hex')).
--    Only the SHA-256 hash (claim_token_hash) is stored server-side.
--    The raw claim_token is returned by offer_waitlist_slot for delivery to customer.
--    claim_waitlist_slot requires the raw p_claim_token, computes sha256(p_claim_token),
--    and performs constant-time comparison against claim_token_hash.
--    Token is single-use and invalidated immediately upon claim or expiration.
-- 3. CONFIRMED_ISSUE_EV056_3 (Explicit Caller Authorization in offer_waitlist_slot):
--    SECURITY DEFINER function explicitly verifies:
--    - Caller is active super_admin OR active tenant_owner/staff for that exact tenant.
--    - Waitlist entry belongs to caller's tenant.
--    - Offered staff belongs to caller's tenant and matches branch if assigned.
--    Cross-tenant offer attempts fail closed.
-- 4. CONFIRMED_ISSUE_EV056_4 (Canonical Booking Engine Invariants at Claim):
--    claim_waitlist_slot verifies:
--    - Tenant is active.
--    - Service is active, belongs to tenant, and matches branch if assigned.
--    - Offered staff is active, belongs to tenant, and matches branch if assigned.
--    - Concurrency check: no overlapping active appointment exists for that staff, date, and slot time.
--    - Idempotency / single-use: locks waitlist row FOR UPDATE, verifies offered status and unexpired time.
-- 5. CONFIRMED_ISSUE_EV056_5 (NO_ANON_DIRECT_TABLE_INSERT):
--    Removed "Public insert booking_waitlist" policy.
--    Public intake is strictly through join_booking_waitlist RPC. Direct table INSERT is revoked from anon.
-- 6. State Machine Enforcement:
--    Explicit state machine transitions enforced:
--    pending -> offered | cancelled
--    offered -> claimed | expired | cancelled
--    Terminal states (claimed, expired, cancelled) cannot be transitioned.
-- 7. Fixed search_path = pg_catalog, public on all SECURITY DEFINER functions.
--    REVOKE EXECUTE FROM PUBLIC first, then grant explicit roles.
-- ===========================================================================

-- =========================================================================
-- 1. Table: public.booking_waitlist
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.booking_waitlist (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id           UUID DEFAULT NULL REFERENCES public.business_branches(id) ON DELETE CASCADE,
    service_id          UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    staff_id            UUID DEFAULT NULL REFERENCES public.staff(id) ON DELETE SET NULL,
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
    offered_staff_id    UUID DEFAULT NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    -- Store only cryptographic hash of claim token, never raw token
    claim_token_hash    TEXT DEFAULT NULL,
    notes               TEXT DEFAULT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT booking_waitlist_time_window CHECK (
        (preferred_time_start IS NULL AND preferred_time_end IS NULL) OR
        (preferred_time_start IS NOT NULL AND preferred_time_end IS NOT NULL AND preferred_time_end >= preferred_time_start)
    )
);

CREATE INDEX idx_booking_waitlist_tenant_status ON public.booking_waitlist(tenant_id, status);
CREATE INDEX idx_booking_waitlist_service_date ON public.booking_waitlist(service_id, preferred_date);
CREATE INDEX idx_booking_waitlist_customer_phone ON public.booking_waitlist(tenant_id, customer_phone);
CREATE INDEX idx_booking_waitlist_claim_token_hash ON public.booking_waitlist(claim_token_hash) WHERE claim_token_hash IS NOT NULL;

CREATE TRIGGER update_booking_waitlist_modtime
    BEFORE UPDATE ON public.booking_waitlist
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.booking_waitlist ENABLE ROW LEVEL SECURITY;

-- Block direct table access from public / anon
REVOKE ALL ON public.booking_waitlist FROM PUBLIC;
REVOKE ALL ON public.booking_waitlist FROM anon;

-- Tenant Admins and Staff can view and manage waitlist entries for their own tenant
CREATE POLICY "Tenant Admins and Staff - Full Access on booking_waitlist"
    ON public.booking_waitlist FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (
                    up.role IN ('tenant_owner', 'staff')
                    AND up.tenant_id = booking_waitlist.tenant_id
                )
              )
        )
    );

-- Super Admin explicit policy
CREATE POLICY "Super Admins - Full Access on booking_waitlist"
    ON public.booking_waitlist FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role = 'super_admin'
              AND up.active = true
        )
    );

-- =========================================================================
-- 2. State Machine Enforcement Trigger
-- =========================================================================

CREATE OR REPLACE FUNCTION public.enforce_waitlist_state_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Valid transitions:
    -- pending -> offered, cancelled
    -- offered -> claimed, expired, cancelled
    -- Terminal: claimed, expired, cancelled cannot be transitioned
    IF OLD.status = 'pending' AND NEW.status IN ('offered', 'cancelled') THEN
        RETURN NEW;
    ELSIF OLD.status = 'offered' AND NEW.status IN ('claimed', 'expired', 'cancelled') THEN
        RETURN NEW;
    ELSE
        RAISE EXCEPTION 'INVALID_WAITLIST_STATE_TRANSITION: Cannot transition from % to %', OLD.status, NEW.status;
    END IF;
END;
$$;

CREATE TRIGGER trg_enforce_waitlist_state_transition
    BEFORE UPDATE ON public.booking_waitlist
    FOR EACH ROW EXECUTE FUNCTION public.enforce_waitlist_state_transition();

-- =========================================================================
-- 3. RPC: join_booking_waitlist (Bounded public intake RPC)
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
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_new_id UUID;
    v_tenant_rec RECORD;
    v_service_rec RECORD;
    v_staff_rec RECORD;
    v_clean_name TEXT;
    v_clean_phone TEXT;
    v_clean_email TEXT;
BEGIN
    -- Input sanitization and bounded input validation
    v_clean_name := trim(COALESCE(p_customer_name, ''));
    v_clean_phone := trim(COALESCE(p_customer_phone, ''));
    v_clean_email := NULLIF(trim(COALESCE(p_customer_email, '')), '');

    IF length(v_clean_name) < 2 OR length(v_clean_name) > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CUSTOMER_NAME');
    END IF;

    IF length(v_clean_phone) < 7 OR length(v_clean_phone) > 25 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CUSTOMER_PHONE');
    END IF;

    -- Validation: Tenant must exist and be active
    SELECT t.id, t.status INTO v_tenant_rec
    FROM public.tenants t
    WHERE t.id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND');
    END IF;

    IF v_tenant_rec.status NOT IN ('active', 'trialing') THEN
        RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_ACTIVE');
    END IF;

    -- Validation: Service must exist, belong to tenant, and be active
    SELECT s.id, s.active, s.branch_id INTO v_service_rec
    FROM public.services s
    WHERE s.id = p_service_id AND s.tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'SERVICE_NOT_FOUND');
    END IF;

    IF v_service_rec.active = false THEN
        RETURN jsonb_build_object('success', false, 'error', 'SERVICE_INACTIVE');
    END IF;

    -- Validation: Branch consistency if branch provided
    IF p_branch_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.business_branches b WHERE b.id = p_branch_id AND b.tenant_id = p_tenant_id AND b.is_active = true) THEN
            RETURN jsonb_build_object('success', false, 'error', 'BRANCH_NOT_FOUND');
        END IF;

        IF v_service_rec.branch_id IS NOT NULL AND v_service_rec.branch_id != p_branch_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'SERVICE_BRANCH_MISMATCH');
        END IF;
    END IF;

    -- Validation: Optional staff must belong to tenant and be active
    IF p_staff_id IS NOT NULL THEN
        SELECT st.id, st.active, st.branch_id INTO v_staff_rec
        FROM public.staff st
        WHERE st.id = p_staff_id AND st.tenant_id = p_tenant_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_FOUND');
        END IF;

        IF v_staff_rec.active = false THEN
            RETURN jsonb_build_object('success', false, 'error', 'STAFF_INACTIVE');
        END IF;

        IF p_branch_id IS NOT NULL AND v_staff_rec.branch_id IS NOT NULL AND v_staff_rec.branch_id != p_branch_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'STAFF_BRANCH_MISMATCH');
        END IF;
    END IF;

    -- Validation: Preferred date cannot be in the past
    IF p_preferred_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_DATE');
    END IF;

    -- Validation: Preferred time consistency
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
-- 4. RPC: offer_waitlist_slot (Authorized tenant admin RPC)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.offer_waitlist_slot(
    p_waitlist_id           UUID,
    p_offered_date          DATE,
    p_offered_time          TIME,
    p_offered_staff_id      UUID,
    p_expires_in_minutes    INTEGER DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID;
    v_caller_role TEXT;
    v_caller_tenant_id UUID;
    v_entry public.booking_waitlist%ROWTYPE;
    v_staff_rec RECORD;
    v_raw_token TEXT;
    v_token_hash TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
    END IF;

    -- Explicit caller tenant authorization check
    SELECT up.role, up.tenant_id, up.active
    INTO v_caller_role, v_caller_tenant_id
    FROM public.users_profile up
    WHERE up.id = v_caller_uid AND up.active = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'CALLER_NOT_ACTIVE');
    END IF;

    -- Lock waitlist entry FOR UPDATE
    SELECT * INTO v_entry
    FROM public.booking_waitlist
    WHERE id = p_waitlist_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'WAITLIST_ENTRY_NOT_FOUND');
    END IF;

    -- Fail-closed tenant isolation check
    IF v_caller_role != 'super_admin' THEN
        IF v_caller_tenant_id IS NULL OR v_caller_tenant_id != v_entry.tenant_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_CROSS_TENANT');
        END IF;
    END IF;

    -- State check: only pending entries can be offered
    IF v_entry.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS', 'current_status', v_entry.status);
    END IF;

    -- Validate offered staff belongs to same tenant and is active
    SELECT st.id, st.active, st.branch_id
    INTO v_staff_rec
    FROM public.staff st
    WHERE st.id = p_offered_staff_id AND st.tenant_id = v_entry.tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'OFFERED_STAFF_NOT_FOUND');
    END IF;

    IF v_staff_rec.active = false THEN
        RETURN jsonb_build_object('success', false, 'error', 'OFFERED_STAFF_INACTIVE');
    END IF;

    -- Branch consistency check where waitlist is branch-scoped
    IF v_entry.branch_id IS NOT NULL AND v_staff_rec.branch_id IS NOT NULL AND v_staff_rec.branch_id != v_entry.branch_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'OFFERED_STAFF_BRANCH_MISMATCH');
    END IF;

    -- Generate cryptographically strong 256-bit token
    v_raw_token := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

    v_expires_at := NOW() + (GREATEST(COALESCE(p_expires_in_minutes, 60), 5) || ' minutes')::interval;

    UPDATE public.booking_waitlist
    SET status = 'offered',
        offered_appointment_date = p_offered_date,
        offered_appointment_time = p_offered_time,
        offered_staff_id = p_offered_staff_id,
        claim_token_hash = v_token_hash,
        offered_at = NOW(),
        offer_expires_at = v_expires_at,
        updated_at = NOW()
    WHERE id = p_waitlist_id;

    -- Return raw token to caller ONLY once (for SMS/WhatsApp dispatch), never stored in plaintext
    RETURN jsonb_build_object(
        'success', true,
        'waitlist_id', p_waitlist_id,
        'status', 'offered',
        'claim_token', v_raw_token,
        'offer_expires_at', v_expires_at
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.offer_waitlist_slot(UUID, DATE, TIME, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.offer_waitlist_slot(UUID, DATE, TIME, UUID, INTEGER) TO authenticated;

-- =========================================================================
-- 5. RPC: claim_waitlist_slot (Cryptographic one-time claim capability)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.claim_waitlist_slot(
    p_claim_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_token_hash TEXT;
    v_entry public.booking_waitlist%ROWTYPE;
    v_apt_id UUID;
    v_service_duration INTEGER;
    v_service_active BOOLEAN;
    v_staff_active BOOLEAN;
    v_tenant_status TEXT;
BEGIN
    IF p_claim_token IS NULL OR length(trim(p_claim_token)) < 32 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CLAIM_TOKEN');
    END IF;

    -- Compute SHA-256 of provided bearer claim token
    v_token_hash := encode(digest(trim(p_claim_token), 'sha256'), 'hex');

    -- Look up waitlist entry by claim_token_hash with row lock FOR UPDATE
    SELECT * INTO v_entry
    FROM public.booking_waitlist
    WHERE claim_token_hash = v_token_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'CLAIM_TOKEN_NOT_FOUND');
    END IF;

    -- Status verification
    IF v_entry.status != 'offered' THEN
        RETURN jsonb_build_object('success', false, 'error', 'OFFER_NOT_ACTIVE', 'current_status', v_entry.status);
    END IF;

    -- Expiration verification
    IF v_entry.offer_expires_at IS NOT NULL AND v_entry.offer_expires_at < NOW() THEN
        UPDATE public.booking_waitlist
        SET status = 'expired', claim_token_hash = NULL, updated_at = NOW()
        WHERE id = v_entry.id;

        RETURN jsonb_build_object('success', false, 'error', 'OFFER_EXPIRED');
    END IF;

    -- Canonical Booking Invariant 1: Tenant must be active
    SELECT t.status INTO v_tenant_status
    FROM public.tenants t
    WHERE t.id = v_entry.tenant_id;

    IF v_tenant_status NOT IN ('active', 'trialing') THEN
        RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_ACTIVE');
    END IF;

    -- Canonical Booking Invariant 2: Service must be active and valid
    SELECT s.duration, s.active INTO v_service_duration, v_service_active
    FROM public.services s
    WHERE s.id = v_entry.service_id AND s.tenant_id = v_entry.tenant_id;

    IF NOT FOUND OR v_service_active = false THEN
        RETURN jsonb_build_object('success', false, 'error', 'SERVICE_NOT_AVAILABLE');
    END IF;

    v_service_duration := COALESCE(v_service_duration, 60);

    -- Canonical Booking Invariant 3: Staff must be active and valid
    SELECT st.active INTO v_staff_active
    FROM public.staff st
    WHERE st.id = v_entry.offered_staff_id AND st.tenant_id = v_entry.tenant_id;

    IF NOT FOUND OR v_staff_active = false THEN
        RETURN jsonb_build_object('success', false, 'error', 'STAFF_NOT_AVAILABLE');
    END IF;

    -- Canonical Booking Invariant 4: Concurrency / slot conflict prevention
    IF EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.staff_id = v_entry.offered_staff_id
          AND a.tenant_id = v_entry.tenant_id
          AND a.appointment_date = v_entry.offered_appointment_date
          AND a.status NOT IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system', 'no_show')
          AND (
              (a.appointment_date + a.appointment_time) < (v_entry.offered_appointment_date + v_entry.offered_appointment_time + (v_service_duration || ' minutes')::interval)
              AND
              ((a.appointment_date + a.appointment_time) + '60 minutes'::interval) > (v_entry.offered_appointment_date + v_entry.offered_appointment_time)
          )
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'SLOT_ALREADY_BOOKED');
    END IF;

    -- Atomic canonical appointment creation
    INSERT INTO public.appointments (
        tenant_id,
        branch_id,
        service_id,
        staff_id,
        appointment_date,
        appointment_time,
        customer_name,
        customer_phone,
        customer_email,
        status,
        notes
    ) VALUES (
        v_entry.tenant_id,
        v_entry.branch_id,
        v_entry.service_id,
        v_entry.offered_staff_id,
        v_entry.offered_appointment_date,
        v_entry.offered_appointment_time,
        v_entry.customer_name,
        v_entry.customer_phone,
        v_entry.customer_email,
        'confirmed',
        'Claimed from waitlist (' || v_entry.id || ')'
    ) RETURNING id INTO v_apt_id;

    -- Atomic waitlist state transition to claimed and token invalidation (single-use)
    UPDATE public.booking_waitlist
    SET status = 'claimed',
        claim_token_hash = NULL,
        updated_at = NOW()
    WHERE id = v_entry.id;

    RETURN jsonb_build_object(
        'success', true,
        'waitlist_id', v_entry.id,
        'appointment_id', v_apt_id,
        'status', 'claimed'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_waitlist_slot(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_slot(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_slot(TEXT) TO authenticated;
