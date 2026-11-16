-- =========================================================================
-- Ported from 72911e4: 20260928_phase5_clinic_practitioners_workspace_hardening.sql
-- Conflict-free sequential prefix: 20261006 (ADIM-036 / Faz E1)
-- Description: Phase 5 Node 2 Clinic Practitioner Permissions & Clinical Workspace Hardening
-- =========================================================================

-- 1. HARDEN clinic_set_staff_profile WITH VERTICAL ENTITLEMENT & QUOTA VALIDATION
CREATE OR REPLACE FUNCTION public.clinic_set_staff_profile(
    p_staff_id UUID,
    p_practitioner_type TEXT DEFAULT NULL,
    p_specialty TEXT DEFAULT NULL,
    p_medical_license_number TEXT DEFAULT NULL,
    p_can_manage_patient_profiles BOOLEAN DEFAULT false,
    p_can_view_clinical_records BOOLEAN DEFAULT false,
    p_can_write_clinical_notes BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_caller_up RECORD;
    v_target_staff RECORD;
    v_vert_ctx JSONB;
    v_can_view BOOLEAN := p_can_view_clinical_records;
    v_res RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT * INTO v_target_staff
    FROM public.staff
    WHERE id = p_staff_id;

    IF v_target_staff.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Staff member not found.';
    END IF;

    IF v_target_staff.active IS NOT TRUE THEN
        RAISE EXCEPTION 'INVALID_STATE: Target staff member is inactive and cannot receive Clinic capabilities.';
    END IF;

    SELECT * INTO v_caller_up
    FROM public.users_profile
    WHERE id = v_caller_uid
      AND tenant_id = v_target_staff.tenant_id
      AND role = 'tenant_owner'
      AND active = true;

    IF v_caller_up.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Only active tenant owner of the exact tenant can set Clinic staff profile.';
    END IF;

    v_vert_ctx := public.resolve_tenant_vertical_context(v_target_staff.tenant_id);

    IF (v_vert_ctx->>'eligible')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'FORBIDDEN: Tenant subscription is not currently eligible for vertical commercial features (%).',
            COALESCE(v_vert_ctx->>'reason_code', 'INELIGIBLE');
    END IF;

    IF (v_vert_ctx->'verticals'->>'clinic_enabled')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'FORBIDDEN: Clinic workspace vertical is not enabled for this tenant subscription.';
    END IF;

    IF p_can_write_clinical_notes = true THEN
        v_can_view := true;
    END IF;

    INSERT INTO public.clinic_staff_profiles (
        tenant_id,
        staff_id,
        practitioner_type,
        specialty,
        medical_license_number,
        can_manage_patient_profiles,
        can_view_clinical_records,
        can_write_clinical_notes,
        updated_at
    ) VALUES (
        v_target_staff.tenant_id,
        p_staff_id,
        p_practitioner_type,
        p_specialty,
        p_medical_license_number,
        p_can_manage_patient_profiles,
        v_can_view,
        p_can_write_clinical_notes,
        now()
    )
    ON CONFLICT (staff_id) DO UPDATE SET
        practitioner_type = EXCLUDED.practitioner_type,
        specialty = EXCLUDED.specialty,
        medical_license_number = EXCLUDED.medical_license_number,
        can_manage_patient_profiles = EXCLUDED.can_manage_patient_profiles,
        can_view_clinical_records = EXCLUDED.can_view_clinical_records,
        can_write_clinical_notes = EXCLUDED.can_write_clinical_notes,
        updated_at = now()
    RETURNING * INTO v_res;

    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        v_target_staff.tenant_id::text,
        v_caller_uid::text,
        'tenant_owner',
        'clinic_staff_profile_changed',
        'clinic_staff_profiles',
        p_staff_id::text,
        jsonb_build_object(
            'staff_id', p_staff_id,
            'can_manage_patient_profiles', p_can_manage_patient_profiles,
            'can_view_clinical_records', v_can_view,
            'can_write_clinical_notes', p_can_write_clinical_notes
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'staff_id', v_res.staff_id,
        'tenant_id', v_res.tenant_id,
        'can_manage_patient_profiles', v_res.can_manage_patient_profiles,
        'can_view_clinical_records', v_res.can_view_clinical_records,
        'can_write_clinical_notes', v_res.can_write_clinical_notes
    );
END;
$$;

REVOKE ALL ON FUNCTION public.clinic_set_staff_profile FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_set_staff_profile TO authenticated, service_role;


-- 2. HARDEN clinic_get_my_context WITH VERTICAL ENTITLEMENT BOUNDARY
CREATE OR REPLACE FUNCTION public.clinic_get_my_context()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_csp RECORD;
    v_vert_ctx JSONB;
    v_branches JSONB;
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
            'reason_code', 'not_clinic_staff'
        );
    END IF;

    SELECT * INTO v_csp
    FROM public.clinic_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_csp.staff_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'no_clinic_profile'
        );
    END IF;

    v_vert_ctx := public.resolve_tenant_vertical_context(v_staff.tenant_id);

    IF (v_vert_ctx->>'eligible')::boolean IS NOT TRUE OR (v_vert_ctx->'verticals'->>'clinic_enabled')::boolean IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'clinic_vertical_disabled',
            'tenant_id', v_staff.tenant_id,
            'staff_id', v_staff.id
        );
    END IF;

    SELECT jsonb_agg(b.id) INTO v_branches
    FROM public.branches b
    JOIN public.staff_branches sb ON sb.branch_id = b.id AND sb.tenant_id = v_staff.tenant_id
    WHERE b.tenant_id = v_staff.tenant_id
      AND b.is_active IS NOT FALSE
      AND sb.staff_id = v_staff.id;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_staff.tenant_id,
        'staff_id', v_staff.id,
        'staff_name', v_staff.name,
        'practitioner_type', v_csp.practitioner_type,
        'specialty', v_csp.specialty,
        'can_manage_patient_profiles', v_csp.can_manage_patient_profiles,
        'can_view_clinical_records', v_csp.can_view_clinical_records,
        'can_write_clinical_notes', v_csp.can_write_clinical_notes,
        'permitted_branch_ids', COALESCE(v_branches, '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.clinic_get_my_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_get_my_context() TO authenticated, service_role;
