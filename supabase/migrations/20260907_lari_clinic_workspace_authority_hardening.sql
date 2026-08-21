-- LARİ CLINIC MIGRATION 63: WORKSPACE AUTHORITY HARDENING (R1.1 REPAIRED)
-- File: supabase/migrations/20260907_lari_clinic_workspace_authority_hardening.sql
-- Purpose:
--   1. Harden clinic_upsert_patient_profile authorization: enforce can_manage_patient_profiles = true ONLY.
--   2. Fix canonical audit_events schema insert (actor_role = 'staff', action = 'clinic_patient_profile_changed', without non-existent column).
--   3. Restore upsert response contract (returns patient_profile_id).
--   4. Add public.clinic_get_patient_profile(p_customer_id UUID) for bounded profile reads (gated by manage OR view).
--   5. Add public.clinic_get_staff_setup_profiles() for owner setup prefill & current non-patient configuration read.

-- =========================================================================
-- 1. HARDEN clinic_upsert_patient_profile (CAN_MANAGE_PATIENT_PROFILES ONLY)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.clinic_upsert_patient_profile(
    p_customer_id UUID,
    p_date_of_birth DATE DEFAULT NULL,
    p_sex_at_birth TEXT DEFAULT NULL,
    p_emergency_contact_name TEXT DEFAULT NULL,
    p_emergency_contact_phone TEXT DEFAULT NULL,
    p_emergency_contact_relationship TEXT DEFAULT NULL,
    p_blood_type TEXT DEFAULT NULL,
    p_allergies TEXT DEFAULT NULL,
    p_chronic_conditions TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_csp RECORD;
    v_customer RECORD;
    v_res RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    -- Derive active staff identity server-side
    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    -- Check Clinic capabilities: requires can_manage_patient_profiles = true ONLY
    SELECT * INTO v_csp
    FROM public.clinic_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_csp.staff_id IS NULL OR v_csp.can_manage_patient_profiles = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Insufficient Clinic permissions to manage patient profiles.';
    END IF;

    -- Validate customer exists and matches staff tenant
    SELECT * INTO v_customer
    FROM public.customers
    WHERE id = p_customer_id
      AND tenant_id = v_staff.tenant_id;

    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Customer not found or tenant mismatch.';
    END IF;

    -- Upsert clinic_patient_profiles
    INSERT INTO public.clinic_patient_profiles (
        tenant_id,
        customer_id,
        date_of_birth,
        sex_at_birth,
        emergency_contact_name,
        emergency_contact_phone,
        emergency_contact_relationship,
        blood_type,
        allergies,
        chronic_conditions,
        created_by,
        updated_by,
        updated_at
    ) VALUES (
        v_staff.tenant_id,
        p_customer_id,
        p_date_of_birth,
        p_sex_at_birth,
        p_emergency_contact_name,
        p_emergency_contact_phone,
        p_emergency_contact_relationship,
        p_blood_type,
        p_allergies,
        p_chronic_conditions,
        v_caller_uid,
        v_caller_uid,
        now()
    )
    ON CONFLICT (tenant_id, customer_id) DO UPDATE SET
        date_of_birth = EXCLUDED.date_of_birth,
        sex_at_birth = EXCLUDED.sex_at_birth,
        emergency_contact_name = EXCLUDED.emergency_contact_name,
        emergency_contact_phone = EXCLUDED.emergency_contact_phone,
        emergency_contact_relationship = EXCLUDED.emergency_contact_relationship,
        blood_type = EXCLUDED.blood_type,
        allergies = EXCLUDED.allergies,
        chronic_conditions = EXCLUDED.chronic_conditions,
        updated_by = v_caller_uid,
        updated_at = now()
    RETURNING * INTO v_res;

    -- Log audit event using CANONICAL audit_events schema (actor_role, action, resource_type, resource_id, payload)
    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        v_staff.tenant_id::text,
        v_caller_uid::text,
        'staff',
        'clinic_patient_profile_changed',
        'clinic_patient_profiles',
        v_res.id::text,
        jsonb_build_object(
            'customer_id', p_customer_id,
            'patient_profile_id', v_res.id,
            'staff_id', v_staff.id
        )
    );

    -- Return canonical patient_profile_id response contract
    RETURN jsonb_build_object(
        'success', true,
        'patient_profile_id', v_res.id,
        'customer_id', p_customer_id,
        'tenant_id', v_staff.tenant_id,
        'updated_at', v_res.updated_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.clinic_upsert_patient_profile FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_upsert_patient_profile TO authenticated;

-- =========================================================================
-- 2. ADD BOUNDED PATIENT PROFILE READ RPC (clinic_get_patient_profile)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.clinic_get_patient_profile(
    p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_csp RECORD;
    v_customer RECORD;
    v_profile RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    -- Derive active staff identity server-side
    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    -- Check Clinic capabilities: requires manage OR view
    SELECT * INTO v_csp
    FROM public.clinic_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_csp.staff_id IS NULL OR (v_csp.can_manage_patient_profiles = false AND v_csp.can_view_clinical_records = false) THEN
        RAISE EXCEPTION 'FORBIDDEN: Insufficient Clinic permissions to view patient profile.';
    END IF;

    -- Validate customer exists and belongs to caller tenant
    SELECT * INTO v_customer
    FROM public.customers
    WHERE id = p_customer_id
      AND tenant_id = v_staff.tenant_id;

    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Customer not found or tenant mismatch.';
    END IF;

    -- Fetch bounded profile
    SELECT * INTO v_profile
    FROM public.clinic_patient_profiles
    WHERE customer_id = p_customer_id
      AND tenant_id = v_staff.tenant_id;

    RETURN jsonb_build_object(
        'success', true,
        'customer_id', p_customer_id,
        'patient_profile', CASE
            WHEN v_profile.id IS NULL THEN NULL
            ELSE jsonb_build_object(
                'id', v_profile.id,
                'date_of_birth', v_profile.date_of_birth,
                'sex_at_birth', v_profile.sex_at_birth,
                'emergency_contact_name', v_profile.emergency_contact_name,
                'emergency_contact_phone', v_profile.emergency_contact_phone,
                'emergency_contact_relationship', v_profile.emergency_contact_relationship,
                'blood_type', v_profile.blood_type,
                'allergies', v_profile.allergies,
                'chronic_conditions', v_profile.chronic_conditions,
                'updated_at', v_profile.updated_at
            )
        END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.clinic_get_patient_profile FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_get_patient_profile TO authenticated;

-- =========================================================================
-- 3. ADD SAFE OWNER STAFF SETUP READ RPC (clinic_get_staff_setup_profiles)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.clinic_get_staff_setup_profiles()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_user RECORD;
    v_staff_list JSONB;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    -- Derive user profile and verify tenant_owner role
    SELECT * INTO v_user
    FROM public.users_profile
    WHERE id = v_caller_uid;

    IF v_user.id IS NULL OR v_user.role <> 'tenant_owner' OR v_user.tenant_id IS NULL OR v_user.active IS NOT TRUE THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller is not an active tenant owner.';
    END IF;

    -- Query active staff for this tenant with left joined clinic_staff_profiles
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'staff_id', s.id,
            'staff_name', s.name,
            'staff_active', s.active,
            'practitioner_type', csp.practitioner_type,
            'specialty', csp.specialty,
            'medical_license_number', csp.medical_license_number,
            'can_manage_patient_profiles', coalesce(csp.can_manage_patient_profiles, false),
            'can_view_clinical_records', coalesce(csp.can_view_clinical_records, false),
            'can_write_clinical_notes', coalesce(csp.can_write_clinical_notes, false),
            'clinic_profile_exists', (csp.staff_id IS NOT NULL)
        )
        ORDER BY s.name ASC
    ), '[]'::jsonb) INTO v_staff_list
    FROM public.staff s
    LEFT JOIN public.clinic_staff_profiles csp ON csp.staff_id = s.id AND csp.tenant_id = v_user.tenant_id
    WHERE s.tenant_id = v_user.tenant_id
      AND s.active = true;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_user.tenant_id,
        'profiles', v_staff_list
    );
END;
$$;

REVOKE ALL ON FUNCTION public.clinic_get_staff_setup_profiles FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_get_staff_setup_profiles TO authenticated;
