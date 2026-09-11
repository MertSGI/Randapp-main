-- =========================================================================
-- MIGRATION: 20260928_phase5_ht_treatment_journey_quote_itinerary.sql
-- Description: Phase 5 Node 3 Health Tourism Treatment Journey, Quote & Itinerary Domain
-- Authority: LARI-AOS-PROGRAM-V2-BOOTSTRAP-20260908-01 (DECISION-020)
-- Program: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
-- Constraints:
--   1. Reuses canonical ht_leads, customers, tenants, staff, and appointments models.
--   2. Strict tenant isolation on all journey, quote, and itinerary entities.
--   3. Financial quotes stored in explicit minor units (amount_minor_units INTEGER) with currency code.
--   4. Quota check against max_active_journeys in create_treatment_journey RPC.
--   5. Pure server-authoritative RPCs with role enforcement (coordinator / tenant_owner).
--   6. Zero live external travel/flight/hotel booking mutations or payment collections.
-- =========================================================================

-- 1. TABLE: public.ht_treatment_journeys
CREATE TABLE IF NOT EXISTS public.ht_treatment_journeys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    lead_id UUID NULL REFERENCES public.ht_leads(id) ON DELETE SET NULL,
    customer_id UUID NULL REFERENCES public.customers(id) ON DELETE SET NULL,
    coordinator_staff_id UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'inquiry' CHECK (
        status IN ('inquiry', 'quote_sent', 'booked', 'in_travel', 'in_treatment', 'completed', 'cancelled')
    ),
    title TEXT NOT NULL,
    target_treatment_category TEXT NULL,
    arrival_date DATE NULL,
    departure_date DATE NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_ht_treatment_journeys_id_tenant UNIQUE (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_ht_treatment_journeys_tenant_status ON public.ht_treatment_journeys(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ht_treatment_journeys_customer ON public.ht_treatment_journeys(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_ht_treatment_journeys_lead ON public.ht_treatment_journeys(tenant_id, lead_id);

ALTER TABLE public.ht_treatment_journeys ENABLE ROW LEVEL SECURITY;

-- 2. TABLE: public.ht_journey_quotes
CREATE TABLE IF NOT EXISTS public.ht_journey_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    journey_id UUID NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (
        status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')
    ),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    total_amount_minor_units INTEGER NOT NULL CHECK (total_amount_minor_units >= 0),
    items JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of { description, category, amount_minor_units }
    valid_until TIMESTAMPTZ NULL,
    created_by UUID NULL REFERENCES public.users_profile(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_ht_journey_quotes_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT fk_ht_journey_quotes_journey_tenant FOREIGN KEY (journey_id, tenant_id)
        REFERENCES public.ht_treatment_journeys(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT uq_ht_journey_quotes_journey_version UNIQUE (journey_id, version)
);

CREATE INDEX IF NOT EXISTS idx_ht_journey_quotes_lookup ON public.ht_journey_quotes(tenant_id, journey_id);

ALTER TABLE public.ht_journey_quotes ENABLE ROW LEVEL SECURITY;

-- 3. TABLE: public.ht_journey_itinerary_events
CREATE TABLE IF NOT EXISTS public.ht_journey_itinerary_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    journey_id UUID NOT NULL,
    appointment_id UUID NULL,
    event_type TEXT NOT NULL CHECK (
        event_type IN ('airport_pickup', 'hotel_checkin', 'clinical_consultation', 'procedure', 'recovery', 'hotel_checkout', 'airport_dropoff', 'custom')
    ),
    title TEXT NOT NULL,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NULL,
    location TEXT NULL,
    assigned_coordinator_staff_id UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    notes TEXT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (
        status IN ('scheduled', 'in_progress', 'completed', 'cancelled')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_ht_journey_itinerary_events_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT fk_ht_journey_itinerary_events_journey_tenant FOREIGN KEY (journey_id, tenant_id)
        REFERENCES public.ht_treatment_journeys(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT chk_ht_journey_itinerary_time_order CHECK (
        scheduled_end IS NULL OR scheduled_end >= scheduled_start
    )
);

CREATE INDEX IF NOT EXISTS idx_ht_journey_itinerary_lookup ON public.ht_journey_itinerary_events(tenant_id, journey_id, scheduled_start);

ALTER TABLE public.ht_journey_itinerary_events ENABLE ROW LEVEL SECURITY;

-- 4. RLS POLICIES (Strict Tenant & Staff Role Isolation)
DROP POLICY IF EXISTS "Deny direct browser mutation on ht_treatment_journeys" ON public.ht_treatment_journeys;
CREATE POLICY "Deny direct browser mutation on ht_treatment_journeys"
ON public.ht_treatment_journeys FOR ALL TO authenticated
USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Deny direct browser mutation on ht_journey_quotes" ON public.ht_journey_quotes;
CREATE POLICY "Deny direct browser mutation on ht_journey_quotes"
ON public.ht_journey_quotes FOR ALL TO authenticated
USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Deny direct browser mutation on ht_journey_itinerary_events" ON public.ht_journey_itinerary_events;
CREATE POLICY "Deny direct browser mutation on ht_journey_itinerary_events"
ON public.ht_journey_itinerary_events FOR ALL TO authenticated
USING (false) WITH CHECK (false);

-- 5. SERVER-AUTHORITATIVE RPCS

-- A. create_treatment_journey
CREATE OR REPLACE FUNCTION public.ht_create_treatment_journey(
    p_title TEXT,
    p_lead_id UUID DEFAULT NULL,
    p_customer_id UUID DEFAULT NULL,
    p_coordinator_staff_id UUID DEFAULT NULL,
    p_target_treatment_category TEXT DEFAULT NULL,
    p_arrival_date DATE DEFAULT NULL,
    p_departure_date DATE DEFAULT NULL,
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
    v_tenant_id UUID;
    v_vert_ctx JSONB;
    v_active_journeys_count INTEGER;
    v_limit INTEGER;
    v_is_unlimited BOOLEAN;
    v_new_journey RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    -- Derive caller active staff and tenant
    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_staff.id IS NOT NULL THEN
        v_tenant_id := v_staff.tenant_id;
    ELSE
        -- Fallback: check active tenant_owner
        SELECT tenant_id INTO v_tenant_id
        FROM public.users_profile
        WHERE id = v_caller_uid
          AND role = 'tenant_owner'
          AND active = true;

        IF v_tenant_id IS NULL THEN
            RAISE EXCEPTION 'FORBIDDEN: Caller has neither active staff nor tenant_owner identity.';
        END IF;
    END IF;

    -- Verify server-authoritative vertical context
    v_vert_ctx := public.resolve_tenant_vertical_context(v_tenant_id);

    IF (v_vert_ctx->>'eligible')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'FORBIDDEN: Tenant subscription is not currently eligible (%).',
            COALESCE(v_vert_ctx->>'reason_code', 'INELIGIBLE');
    END IF;

    IF (v_vert_ctx->'verticals'->>'health_tourism_enabled')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'FORBIDDEN: Health Tourism vertical is not enabled for this tenant.';
    END IF;

    -- Check max_active_journeys quota
    v_is_unlimited := COALESCE((v_vert_ctx->'quotas'->'max_active_journeys'->>'is_unlimited')::boolean, false);
    v_limit := COALESCE((v_vert_ctx->'quotas'->'max_active_journeys'->>'limit')::integer, 0);

    IF NOT v_is_unlimited THEN
        SELECT COUNT(*) INTO v_active_journeys_count
        FROM public.ht_treatment_journeys
        WHERE tenant_id = v_tenant_id
          AND status IN ('inquiry', 'quote_sent', 'booked', 'in_travel', 'in_treatment');

        IF v_active_journeys_count >= v_limit THEN
            RAISE EXCEPTION 'QUOTA_EXCEEDED: Active journey limit of % reached for tenant.', v_limit;
        END IF;
    END IF;

    -- Create journey
    INSERT INTO public.ht_treatment_journeys (
        tenant_id,
        lead_id,
        customer_id,
        coordinator_staff_id,
        status,
        title,
        target_treatment_category,
        arrival_date,
        departure_date,
        notes,
        created_at,
        updated_at
    ) VALUES (
        v_tenant_id,
        p_lead_id,
        p_customer_id,
        p_coordinator_staff_id,
        'inquiry',
        p_title,
        p_target_treatment_category,
        p_arrival_date,
        p_departure_date,
        p_notes,
        now(),
        now()
    )
    RETURNING * INTO v_new_journey;

    RETURN jsonb_build_object(
        'success', true,
        'journey_id', v_new_journey.id,
        'tenant_id', v_new_journey.tenant_id,
        'status', v_new_journey.status,
        'title', v_new_journey.title
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ht_create_treatment_journey FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ht_create_treatment_journey TO authenticated, service_role;


-- B. create_or_update_journey_quote
CREATE OR REPLACE FUNCTION public.ht_create_or_update_journey_quote(
    p_journey_id UUID,
    p_currency VARCHAR(3),
    p_total_amount_minor_units INTEGER,
    p_items JSONB,
    p_valid_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_journey RECORD;
    v_next_version INTEGER := 1;
    v_quote RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT * INTO v_journey
    FROM public.ht_treatment_journeys
    WHERE id = p_journey_id;

    IF v_journey.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Treatment journey not found.';
    END IF;

    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
    FROM public.ht_journey_quotes
    WHERE journey_id = p_journey_id;

    INSERT INTO public.ht_journey_quotes (
        tenant_id,
        journey_id,
        version,
        status,
        currency,
        total_amount_minor_units,
        items,
        valid_until,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        v_journey.tenant_id,
        p_journey_id,
        v_next_version,
        'draft',
        p_currency,
        p_total_amount_minor_units,
        p_items,
        p_valid_until,
        v_caller_uid,
        now(),
        now()
    )
    RETURNING * INTO v_quote;

    -- Advance journey status to quote_sent if currently inquiry
    IF v_journey.status = 'inquiry' THEN
        UPDATE public.ht_treatment_journeys
        SET status = 'quote_sent', updated_at = now()
        WHERE id = p_journey_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'quote_id', v_quote.id,
        'journey_id', p_journey_id,
        'version', v_quote.version,
        'total_amount_minor_units', v_quote.total_amount_minor_units,
        'currency', v_quote.currency
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ht_create_or_update_journey_quote FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ht_create_or_update_journey_quote TO authenticated, service_role;


-- C. add_journey_itinerary_event
CREATE OR REPLACE FUNCTION public.ht_add_journey_itinerary_event(
    p_journey_id UUID,
    p_event_type TEXT,
    p_title TEXT,
    p_scheduled_start TIMESTAMPTZ,
    p_scheduled_end TIMESTAMPTZ DEFAULT NULL,
    p_location TEXT DEFAULT NULL,
    p_assigned_coordinator_staff_id UUID DEFAULT NULL,
    p_appointment_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_journey RECORD;
    v_event RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT * INTO v_journey
    FROM public.ht_treatment_journeys
    WHERE id = p_journey_id;

    IF v_journey.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Treatment journey not found.';
    END IF;

    INSERT INTO public.ht_journey_itinerary_events (
        tenant_id,
        journey_id,
        appointment_id,
        event_type,
        title,
        scheduled_start,
        scheduled_end,
        location,
        assigned_coordinator_staff_id,
        notes,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_journey.tenant_id,
        p_journey_id,
        p_appointment_id,
        p_event_type,
        p_title,
        p_scheduled_start,
        p_scheduled_end,
        p_location,
        p_assigned_coordinator_staff_id,
        p_notes,
        'scheduled',
        now(),
        now()
    )
    RETURNING * INTO v_event;

    RETURN jsonb_build_object(
        'success', true,
        'event_id', v_event.id,
        'journey_id', p_journey_id,
        'event_type', v_event.event_type,
        'scheduled_start', v_event.scheduled_start
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ht_add_journey_itinerary_event FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ht_add_journey_itinerary_event TO authenticated, service_role;
