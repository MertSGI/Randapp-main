-- =========================================================================
-- MIGRATION 20260912_lari_health_tourism_clinic_acceptance.sql
-- Description: Health Tourism Slice 4 (Block 1 R1) — Server-Authoritative
--              Clinic Acceptance Foundation & Canonical Slot Authority Alignment
-- Target: Disposable PostgreSQL database / Supabase
-- Canonical Migration Number: 68
-- =========================================================================

-- =========================================================================
-- 1. EXTEND ht_leads WITH CONVERSION PROVENANCE FIELDS
-- =========================================================================

ALTER TABLE public.ht_leads
  ADD COLUMN IF NOT EXISTS converted_customer_id UUID NULL,
  ADD COLUMN IF NOT EXISTS converted_patient_profile_id UUID NULL,
  ADD COLUMN IF NOT EXISTS converted_appointment_id UUID NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS converted_by_staff_id UUID NULL;

-- Foreign Keys for conversion provenance
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ht_leads_converted_customer') THEN
    ALTER TABLE public.ht_leads
      ADD CONSTRAINT fk_ht_leads_converted_customer
      FOREIGN KEY (converted_customer_id)
      REFERENCES public.customers(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ht_leads_converted_patient_profile') THEN
    ALTER TABLE public.ht_leads
      ADD CONSTRAINT fk_ht_leads_converted_patient_profile
      FOREIGN KEY (converted_patient_profile_id)
      REFERENCES public.clinic_patient_profiles(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ht_leads_converted_appointment') THEN
    ALTER TABLE public.ht_leads
      ADD CONSTRAINT fk_ht_leads_converted_appointment
      FOREIGN KEY (converted_appointment_id)
      REFERENCES public.appointments(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ht_leads_converted_by_staff') THEN
    ALTER TABLE public.ht_leads
      ADD CONSTRAINT fk_ht_leads_converted_by_staff
      FOREIGN KEY (converted_by_staff_id)
      REFERENCES public.staff(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ht_leads_converted_customer_id ON public.ht_leads(converted_customer_id);
CREATE INDEX IF NOT EXISTS idx_ht_leads_converted_patient_profile_id ON public.ht_leads(converted_patient_profile_id);
CREATE INDEX IF NOT EXISTS idx_ht_leads_converted_appointment_id ON public.ht_leads(converted_appointment_id);


-- =========================================================================
-- 2. EXTEND clinic_patient_profiles WITH preferred_language
-- =========================================================================

ALTER TABLE public.clinic_patient_profiles
  ADD COLUMN IF NOT EXISTS preferred_language TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_clinic_patient_profiles_preferred_language') THEN
    ALTER TABLE public.clinic_patient_profiles
      ADD CONSTRAINT chk_clinic_patient_profiles_preferred_language
      CHECK (preferred_language IS NULL OR preferred_language IN ('tr', 'en', 'de', 'ru', 'ar'));
  END IF;
END $$;


-- =========================================================================
-- 3. ENSURE appointments HAS source COLUMN
-- =========================================================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS source TEXT NULL;


-- =========================================================================
-- 4. RPC: ht_accept_lead_into_clinic (SERVER-AUTHORITATIVE CONVERSION)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.ht_accept_lead_into_clinic(
    p_lead_id UUID,
    p_branch_id UUID,
    p_service_id UUID,
    p_practitioner_staff_id UUID,
    p_appointment_date DATE,
    p_appointment_time TIME
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_lead RECORD;
    v_caller_staff RECORD;
    v_csp RECORD;
    v_prac_csp RECORD;
    v_lock_key BIGINT;
    v_eval_res JSONB;
    v_reason_code TEXT;
    v_duration_minutes INT;

    v_existing_app RECORD;
    v_customer_id UUID;
    v_patient_profile_id UUID;
    v_appointment_id UUID;
BEGIN
    -- 1. Authentication Check
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    -- 2. Lock Lead Row for Update & Verify Existence
    SELECT * INTO v_lead
    FROM public.ht_leads
    WHERE id = p_lead_id
    FOR UPDATE;

    IF v_lead.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Lead not found.';
    END IF;

    -- 3. Resolve Active Caller Staff Identity for Lead Tenant
    SELECT s.* INTO v_caller_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.tenant_id = v_lead.tenant_id
      AND s.active = true;

    IF v_caller_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity in this tenant.';
    END IF;

    -- 4. Clinic Authority Check: Caller MUST have Clinic staff profile with can_manage_patient_profiles=true
    SELECT csp.* INTO v_csp
    FROM public.clinic_staff_profiles csp
    WHERE csp.staff_id = v_caller_staff.id
      AND csp.tenant_id = v_lead.tenant_id;

    IF v_csp.staff_id IS NULL OR v_csp.can_manage_patient_profiles = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks can_manage_patient_profiles permission.';
    END IF;

    -- 5. Idempotency & Lead State Validation Check
    IF v_lead.status = 'converted' THEN
        IF v_lead.converted_appointment_id IS NOT NULL THEN
            SELECT * INTO v_existing_app
            FROM public.appointments
            WHERE id = v_lead.converted_appointment_id;

            IF v_existing_app.id IS NOT NULL
               AND v_existing_app.branch_id = p_branch_id
               AND v_existing_app.service_id = p_service_id
               AND v_existing_app.staff_id = p_practitioner_staff_id
               AND v_existing_app.appointment_date = p_appointment_date
               AND v_existing_app.appointment_time = p_appointment_time THEN
                RETURN jsonb_build_object(
                    'already_converted', true,
                    'customer_id', v_lead.converted_customer_id,
                    'patient_profile_id', v_lead.converted_patient_profile_id,
                    'appointment_id', v_lead.converted_appointment_id
                );
            ELSE
                RAISE EXCEPTION 'ALREADY_CONVERTED: Lead has already been converted under different booking parameters.';
            END IF;
        ELSE
            RAISE EXCEPTION 'ALREADY_CONVERTED: Lead has already been converted.';
        END IF;
    END IF;

    -- Lead MUST be in handoff_pending status AND handoff_state requested
    IF v_lead.status <> 'handoff_pending' OR v_lead.handoff_state <> 'requested' THEN
        RAISE EXCEPTION 'INVALID_LEAD_STATE: Lead must be in handoff_pending status with handoff_state requested.';
    END IF;

    -- 6. Acquire Scheduling Advisory Lock (SAME lock family as create_public_booking)
    v_lock_key := hashtextextended(
        v_lead.tenant_id::text
        || ':'
        || p_practitioner_staff_id::text
        || ':'
        || p_appointment_date::text,
        0
    );
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- 7. Call Canonical Core Booking Slot Evaluator Engine
    SELECT public.evaluate_booking_slot(
        p_tenant_id => v_lead.tenant_id,
        p_branch_id => p_branch_id,
        p_service_id => p_service_id,
        p_staff_id => p_practitioner_staff_id,
        p_date => p_appointment_date,
        p_time => p_appointment_time,
        p_exclude_appointment_id => NULL
    ) INTO v_eval_res;

    IF (v_eval_res->>'allowed')::boolean IS NOT TRUE THEN
        v_reason_code := COALESCE(v_eval_res->>'reason_code', 'slot_unavailable');
        RAISE EXCEPTION 'INVALID_APPOINTMENT_SLOT:%', v_reason_code;
    END IF;

    -- 8. Practitioner Clinic Profile Authority Check
    SELECT csp.* INTO v_prac_csp
    FROM public.clinic_staff_profiles csp
    WHERE csp.staff_id = p_practitioner_staff_id
      AND csp.tenant_id = v_lead.tenant_id;

    IF v_prac_csp.staff_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_PRACTITIONER: Practitioner staff lacks Clinic profile.';
    END IF;

    -- Extract duration from Core slot evaluator result
    v_duration_minutes := (v_eval_res->>'duration_minutes')::integer;

    -- 9. Atomic Execution
    -- A. Create Customer (One Lead -> One Customer)
    INSERT INTO public.customers (
        tenant_id,
        name,
        email,
        phone
    ) VALUES (
        v_lead.tenant_id,
        v_lead.full_name,
        v_lead.email,
        v_lead.phone
    ) RETURNING id INTO v_customer_id;

    -- B. Create Clinic Patient Profile (Copy preferred_language ONLY; NO passport copy, NO inferred medical fields)
    INSERT INTO public.clinic_patient_profiles (
        tenant_id,
        customer_id,
        preferred_language,
        created_by
    ) VALUES (
        v_lead.tenant_id,
        v_customer_id,
        v_lead.preferred_language,
        v_caller_uid
    ) RETURNING id INTO v_patient_profile_id;

    -- C. Create Appointment (duration derived from Core slot evaluator; source = health_tourism; 0 encounters created)
    INSERT INTO public.appointments (
        tenant_id,
        customer_id,
        branch_id,
        staff_id,
        service_id,
        user_name,
        user_email,
        phone,
        notes,
        appointment_date,
        appointment_time,
        duration_minutes,
        status,
        source
    ) VALUES (
        v_lead.tenant_id,
        v_customer_id,
        p_branch_id,
        p_practitioner_staff_id,
        p_service_id,
        v_lead.full_name,
        v_lead.email,
        v_lead.phone,
        v_lead.notes,
        p_appointment_date,
        p_appointment_time,
        v_duration_minutes,
        'pending',
        'health_tourism'
    ) RETURNING id INTO v_appointment_id;

    -- D. Update ht_leads Status & Provenance
    UPDATE public.ht_leads
    SET status = 'converted',
        handoff_state = 'acknowledged',
        converted_customer_id = v_customer_id,
        converted_patient_profile_id = v_patient_profile_id,
        converted_appointment_id = v_appointment_id,
        converted_at = now(),
        converted_by_staff_id = v_caller_staff.id,
        last_activity_at = now(),
        updated_at = now()
    WHERE id = v_lead.id;

    -- E. Write Audit Event (No PII, transcript, passport, or medical info in payload)
    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        v_lead.tenant_id::text,
        v_caller_uid::text,
        'staff',
        'ht_lead_clinic_accepted',
        'ht_leads',
        v_lead.id::text,
        jsonb_build_object(
            'customer_id', v_customer_id,
            'patient_profile_id', v_patient_profile_id,
            'appointment_id', v_appointment_id,
            'branch_id', p_branch_id,
            'service_id', p_service_id,
            'practitioner_staff_id', p_practitioner_staff_id,
            'preferred_language', v_lead.preferred_language
        )
    );

    RETURN jsonb_build_object(
        'already_converted', false,
        'customer_id', v_customer_id,
        'patient_profile_id', v_patient_profile_id,
        'appointment_id', v_appointment_id
    );
END;
$$;


-- =========================================================================
-- 5. RPC: ht_list_pending_clinic_acceptance (READ RPC)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.ht_list_pending_clinic_acceptance()
RETURNS TABLE (
    lead_id UUID,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    preferred_language TEXT,
    country_code TEXT,
    source_channel TEXT,
    ai_summary TEXT,
    handoff_reason TEXT,
    handoff_requested_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_csp RECORD;
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

    SELECT csp.* INTO v_csp
    FROM public.clinic_staff_profiles csp
    WHERE csp.staff_id = v_staff.id
      AND csp.tenant_id = v_staff.tenant_id;

    IF v_csp.staff_id IS NULL OR v_csp.can_manage_patient_profiles = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks can_manage_patient_profiles permission.';
    END IF;

    RETURN QUERY
    SELECT
        l.id AS lead_id,
        l.full_name,
        l.email,
        l.phone,
        l.preferred_language,
        l.country_code,
        l.source_channel,
        l.ai_summary,
        l.handoff_reason,
        l.handoff_requested_at,
        l.created_at
    FROM public.ht_leads l
    WHERE l.tenant_id = v_staff.tenant_id
      AND l.status = 'handoff_pending'
      AND l.handoff_state = 'requested'
    ORDER BY l.handoff_requested_at ASC NULLS LAST, l.created_at ASC;
END;
$$;


-- =========================================================================
-- 6. PRIVILEGES & SECURITY HARDENING
-- =========================================================================

REVOKE ALL ON FUNCTION public.ht_accept_lead_into_clinic(uuid, uuid, uuid, uuid, date, time) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ht_accept_lead_into_clinic(uuid, uuid, uuid, uuid, date, time) TO authenticated;

REVOKE ALL ON FUNCTION public.ht_list_pending_clinic_acceptance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ht_list_pending_clinic_acceptance() TO authenticated;
