-- =========================================================================
-- MIGRATION: 20260928_phase5_ht_treatment_journey_quote_itinerary.sql (R1 SECURITY HARDENED)
-- Description: Phase 5 Node 3 Health Tourism Treatment Journey, Quote & Itinerary Domain
-- Authority: LARI-AOS-PROGRAM-V2-BOOTSTRAP-20260908-01 (DECISION-020)
-- Program: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
-- Security Hardening Corrections:
--   1. Strict server-authoritative caller tenant derivation & HT coordinator capability verification.
--   2. Explicit cross-tenant entity validation for lead_id, customer_id, coordinator_staff_id, appointment_id, assigned_coordinator_staff_id.
--   3. Quote concurrency row/advisory locking on journey ID to eliminate race conditions on MAX(version)+1.
--   4. Currency code validation, amount bounds, and authoritative item total sum checks.
--   5. Quota concurrency transactional row locking on tenant vertical quota evaluation.
--   6. Fail-closed RLS; revoke from PUBLIC, anon; grant authenticated, service_role.
-- =========================================================================

-- 1. TABLE: public.ht_treatment_journeys
CREATE TABLE IF NOT EXISTS public.ht_treatment_journeys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    lead_id UUID NULL,
    customer_id UUID NULL,
    coordinator_staff_id UUID NULL,
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

    CONSTRAINT uq_ht_treatment_journeys_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT fk_ht_treatment_journeys_lead_tenant FOREIGN KEY (lead_id, tenant_id)
        REFERENCES public.ht_leads(id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT fk_ht_treatment_journeys_customer_tenant FOREIGN KEY (customer_id, tenant_id)
        REFERENCES public.customers(id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT fk_ht_treatment_journeys_coordinator_tenant FOREIGN KEY (coordinator_staff_id, tenant_id)
        REFERENCES public.staff(id, tenant_id) ON DELETE SET NULL
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
    currency VARCHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    total_amount_minor_units INTEGER NOT NULL CHECK (total_amount_minor_units >= 0),
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
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
    assigned_coordinator_staff_id UUID NULL,
    notes TEXT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (
        status IN ('scheduled', 'in_progress', 'completed', 'cancelled')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_ht_journey_itinerary_events_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT fk_ht_journey_itinerary_events_journey_tenant FOREIGN KEY (journey_id, tenant_id)
        REFERENCES public.ht_treatment_journeys(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_ht_journey_itinerary_events_appointment_tenant FOREIGN KEY (appointment_id, tenant_id)
        REFERENCES public.appointments(id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT fk_ht_journey_itinerary_events_staff_tenant FOREIGN KEY (assigned_coordinator_staff_id, tenant_id)
        REFERENCES public.staff(id, tenant_id) ON DELETE SET NULL,
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

-- 5. INTERNAL HELPER: VERIFY CALLER HT AUTHORITY
CREATE OR REPLACE FUNCTION public.ht_assert_caller_ht_authority(
    p_caller_uid UUID,
    p_target_tenant_id UUID,
    p_require_manage BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_staff RECORD;
    v_csp RECORD;
    v_user RECORD;
    v_vert_ctx JSONB;
BEGIN
    IF p_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    -- Check active staff identity in the specific tenant
    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = p_caller_uid
      AND s.tenant_id = p_target_tenant_id
      AND s.active = true;

    IF v_staff.id IS NOT NULL THEN
        -- Check canonical ht_staff_profiles
        SELECT * INTO v_csp
        FROM public.ht_staff_profiles
        WHERE staff_id = v_staff.id
          AND tenant_id = p_target_tenant_id;

        IF v_csp.staff_id IS NULL THEN
            RAISE EXCEPTION 'FORBIDDEN: Caller has no Health Tourism staff profile.';
        END IF;

        IF p_require_manage AND v_csp.can_manage_ht_leads IS NOT TRUE THEN
            RAISE EXCEPTION 'FORBIDDEN: Caller lacks can_manage_ht_leads capability.';
        END IF;

        IF NOT p_require_manage AND v_csp.can_view_ht_leads IS NOT TRUE AND v_csp.can_manage_ht_leads IS NOT TRUE THEN
            RAISE EXCEPTION 'FORBIDDEN: Caller lacks Health Tourism lead/journey permissions.';
        END IF;

        RETURN v_staff.id;
    END IF;

    -- Fallback: check active tenant_owner of the exact tenant
    SELECT * INTO v_user
    FROM public.users_profile
    WHERE id = p_caller_uid
      AND tenant_id = p_target_tenant_id
      AND role = 'tenant_owner'
      AND active = true;

    IF v_user.id IS NOT NULL THEN
        RETURN NULL; -- Tenant owner authorized without specific staff ID
    END IF;

    RAISE EXCEPTION 'FORBIDDEN: Cross-tenant access denied or insufficient Health Tourism permissions.';
END;
$$;

REVOKE ALL ON FUNCTION public.ht_assert_caller_ht_authority FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ht_assert_caller_ht_authority TO authenticated, service_role;


-- 6. SERVER-AUTHORITATIVE RPCS

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
    v_user RECORD;
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

    IF p_title IS NULL OR trim(p_title) = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: Title is required.';
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
        PERFORM public.ht_assert_caller_ht_authority(v_caller_uid, v_tenant_id, true);
    ELSE
        SELECT * INTO v_user
        FROM public.users_profile
        WHERE id = v_caller_uid
          AND role = 'tenant_owner'
          AND active = true;

        IF v_user.id IS NOT NULL AND v_user.tenant_id IS NOT NULL THEN
            v_tenant_id := v_user.tenant_id;
        ELSE
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

    -- Validate optional foreign entity tenant integrity
    IF p_lead_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.ht_leads WHERE id = p_lead_id AND tenant_id = v_tenant_id) THEN
            RAISE EXCEPTION 'FORBIDDEN: Lead does not belong to caller tenant.';
        END IF;
    END IF;

    IF p_customer_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND tenant_id = v_tenant_id) THEN
            RAISE EXCEPTION 'FORBIDDEN: Customer does not belong to caller tenant.';
        END IF;
    END IF;

    IF p_coordinator_staff_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.staff s
            JOIN public.ht_staff_profiles csp ON csp.staff_id = s.id AND csp.tenant_id = s.tenant_id
            WHERE s.id = p_coordinator_staff_id
              AND s.tenant_id = v_tenant_id
              AND s.active = true
              AND csp.can_manage_ht_leads = true
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN: Assigned coordinator is not an active HT staff member in caller tenant.';
        END IF;
    END IF;

    -- Transactional concurrency advisory lock on tenant for quota enforcement
    PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant_id::text, 42));

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
    v_item RECORD;
    v_sum_items INTEGER := 0;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    IF p_journey_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_INPUT: Journey ID is required.';
    END IF;

    IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION 'INVALID_INPUT: Currency must be a 3-letter ISO code.';
    END IF;

    IF p_total_amount_minor_units IS NULL OR p_total_amount_minor_units < 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: Total amount must be a non-negative integer.';
    END IF;

    -- Concurrency row lock & fetch journey
    SELECT * INTO v_journey
    FROM public.ht_treatment_journeys
    WHERE id = p_journey_id
    FOR UPDATE;

    IF v_journey.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Treatment journey not found.';
    END IF;

    -- Strict caller tenant & HT capability check (fail closed against cross-tenant attacks)
    PERFORM public.ht_assert_caller_ht_authority(v_caller_uid, v_journey.tenant_id, true);

    -- Validate items if provided
    IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS (description text, category text, amount_minor_units integer)
        LOOP
            IF v_item.amount_minor_units IS NULL OR v_item.amount_minor_units < 0 THEN
                RAISE EXCEPTION 'INVALID_INPUT: Quote item amounts must be non-negative integers.';
            END IF;
            v_sum_items := v_sum_items + v_item.amount_minor_units;
        END LOOP;

        IF v_sum_items <> p_total_amount_minor_units THEN
            RAISE EXCEPTION 'INVALID_INPUT: Sum of line items (%) does not match total amount (%).',
                v_sum_items, p_total_amount_minor_units;
        END IF;
    END IF;

    -- Determine next deterministic version under row lock
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
        COALESCE(p_items, '[]'::jsonb),
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

    IF p_journey_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_INPUT: Journey ID is required.';
    END IF;

    IF p_scheduled_start IS NULL THEN
        RAISE EXCEPTION 'INVALID_INPUT: Scheduled start time is required.';
    END IF;

    IF p_scheduled_end IS NOT NULL AND p_scheduled_end < p_scheduled_start THEN
        RAISE EXCEPTION 'INVALID_INPUT: Scheduled end must be greater than or equal to start.';
    END IF;

    -- Concurrency row lock & fetch journey
    SELECT * INTO v_journey
    FROM public.ht_treatment_journeys
    WHERE id = p_journey_id
    FOR UPDATE;

    IF v_journey.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Treatment journey not found.';
    END IF;

    -- Strict caller tenant & HT capability check (fail closed against cross-tenant attacks)
    PERFORM public.ht_assert_caller_ht_authority(v_caller_uid, v_journey.tenant_id, true);

    -- Validate optional appointment tenant relationship
    IF p_appointment_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.appointments
            WHERE id = p_appointment_id AND tenant_id = v_journey.tenant_id
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN: Appointment does not belong to journey tenant.';
        END IF;
    END IF;

    -- Validate optional assigned coordinator tenant relationship
    IF p_assigned_coordinator_staff_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.staff s
            JOIN public.ht_staff_profiles csp ON csp.staff_id = s.id AND csp.tenant_id = s.tenant_id
            WHERE s.id = p_assigned_coordinator_staff_id
              AND s.tenant_id = v_journey.tenant_id
              AND s.active = true
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN: Assigned coordinator is not an active HT staff member in journey tenant.';
        END IF;
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
