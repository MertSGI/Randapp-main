-- ===========================================================================
-- Migration: Phase 3 Waitlist Domain Foundation
-- Program: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
-- Phase: 3 (PRODUCT_COMPLETENESS_BEFORE_EXTERNAL_PROVIDERS)
-- Base: 09bb1f8d8ce070c33d09099a6d0ae20c93787d11
--
-- Adds the canonical server-authoritative waitlist domain:
-- 1. Table: public.booking_waitlist
--    - Handles customer waitlist requests when desired time/service is booked.
--    - Status state machine: pending -> offered -> claimed / expired / cancelled
--    - RLS enabled with tenant admin isolation + public intake insertion
-- 2. Function: public.join_booking_waitlist RPC (SECURITY DEFINER)
-- 3. Function: public.offer_waitlist_slot RPC (SECURITY DEFINER)
-- 4. Function: public.claim_waitlist_slot RPC (SECURITY DEFINER)
-- ===========================================================================

-- =========================================================================
-- 1. Table: public.booking_waitlist
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.booking_waitlist (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id           UUID DEFAULT NULL,
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

CREATE TRIGGER update_booking_waitlist_modtime
    BEFORE UPDATE ON public.booking_waitlist
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.booking_waitlist ENABLE ROW LEVEL SECURITY;

-- Tenant Admins can view and manage waitlist entries
CREATE POLICY "Tenant Admins - Full Access on booking_waitlist"
    ON public.booking_waitlist FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (
                    up.role = 'tenant_owner'
                    AND up.tenant_id = booking_waitlist.tenant_id
                )
              )
        )
    );

-- Super Admin explicit full access policy
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

-- Public can insert waitlist request (intake flow)
CREATE POLICY "Public insert booking_waitlist"
    ON public.booking_waitlist FOR INSERT
    WITH CHECK (true);

-- Public can read own offered waitlist entry by ID (for claiming via link/token)
CREATE POLICY "Public read offered waitlist"
    ON public.booking_waitlist FOR SELECT
    USING (status = 'offered');

-- =========================================================================
-- 2. RPC: join_booking_waitlist
-- =========================================================================

CREATE OR REPLACE FUNCTION public.join_booking_waitlist(
    p_tenant_id             UUID,
    p_service_id            UUID,
    p_preferred_date        DATE,
    p_customer_name         TEXT,
    p_customer_phone        TEXT,
    p_customer_email        TEXT DEFAULT NULL,
    p_staff_id              UUID DEFAULT NULL,
    p_preferred_time_start  TIME DEFAULT NULL,
    p_preferred_time_end    TIME DEFAULT NULL,
    p_notes                 TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_id UUID;
BEGIN
    -- Validation: Tenant must exist
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND');
    END IF;

    -- Validation: Service must belong to tenant
    IF NOT EXISTS (SELECT 1 FROM public.services WHERE id = p_service_id AND tenant_id = p_tenant_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'SERVICE_NOT_FOUND');
    END IF;

    -- Validation: Date cannot be in the past
    IF p_preferred_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_DATE');
    END IF;

    INSERT INTO public.booking_waitlist (
        tenant_id,
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
        p_service_id,
        p_staff_id,
        trim(p_customer_name),
        trim(p_customer_phone),
        CASE WHEN p_customer_email IS NOT NULL THEN trim(p_customer_email) ELSE NULL END,
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

GRANT EXECUTE ON FUNCTION public.join_booking_waitlist TO anon;
GRANT EXECUTE ON FUNCTION public.join_booking_waitlist TO authenticated;

-- =========================================================================
-- 3. RPC: offer_waitlist_slot
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
SET search_path = public
AS $$
DECLARE
    v_entry public.booking_waitlist%ROWTYPE;
BEGIN
    SELECT * INTO v_entry
    FROM public.booking_waitlist
    WHERE id = p_waitlist_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'WAITLIST_ENTRY_NOT_FOUND');
    END IF;

    IF v_entry.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS', 'current_status', v_entry.status);
    END IF;

    UPDATE public.booking_waitlist
    SET status = 'offered',
        offered_appointment_date = p_offered_date,
        offered_appointment_time = p_offered_time,
        offered_staff_id = p_offered_staff_id,
        offered_at = NOW(),
        offer_expires_at = NOW() + (p_expires_in_minutes || ' minutes')::interval,
        updated_at = NOW()
    WHERE id = p_waitlist_id;

    RETURN jsonb_build_object(
        'success', true,
        'waitlist_id', p_waitlist_id,
        'status', 'offered',
        'offer_expires_at', NOW() + (p_expires_in_minutes || ' minutes')::interval
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.offer_waitlist_slot TO authenticated;

-- =========================================================================
-- 4. RPC: claim_waitlist_slot
-- =========================================================================

CREATE OR REPLACE FUNCTION public.claim_waitlist_slot(
    p_waitlist_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_entry public.booking_waitlist%ROWTYPE;
    v_apt_id UUID;
BEGIN
    SELECT * INTO v_entry
    FROM public.booking_waitlist
    WHERE id = p_waitlist_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'WAITLIST_ENTRY_NOT_FOUND');
    END IF;

    IF v_entry.status != 'offered' THEN
        RETURN jsonb_build_object('success', false, 'error', 'OFFER_NOT_ACTIVE', 'current_status', v_entry.status);
    END IF;

    IF v_entry.offer_expires_at IS NOT NULL AND v_entry.offer_expires_at < NOW() THEN
        UPDATE public.booking_waitlist
        SET status = 'expired', updated_at = NOW()
        WHERE id = p_waitlist_id;

        RETURN jsonb_build_object('success', false, 'error', 'OFFER_EXPIRED');
    END IF;

    -- Create appointment directly from claimed waitlist offer
    INSERT INTO public.appointments (
        tenant_id,
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
        v_entry.service_id,
        v_entry.offered_staff_id,
        v_entry.offered_appointment_date,
        v_entry.offered_appointment_time,
        v_entry.customer_name,
        v_entry.customer_phone,
        v_entry.customer_email,
        'confirmed',
        'Booked via waitlist claim (' || p_waitlist_id || ')'
    ) RETURNING id INTO v_apt_id;

    -- Mark waitlist as claimed
    UPDATE public.booking_waitlist
    SET status = 'claimed', updated_at = NOW()
    WHERE id = p_waitlist_id;

    RETURN jsonb_build_object(
        'success', true,
        'waitlist_id', p_waitlist_id,
        'appointment_id', v_apt_id,
        'status', 'claimed'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_waitlist_slot TO anon;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_slot TO authenticated;
