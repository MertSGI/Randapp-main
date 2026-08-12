-- 20260902_p2a_publish_commercial_contract_alignment.sql
-- Parallel Lane P2A — Forward-Hardened Admin Publish & Commercial Contract Alignment RPC
-- Governance: FILE ONLY. DO NOT APPLY TO LIVE STAGING DATABASE.
-- Description:
--   Hardens public.approve_and_publish_tenant(uuid) to preserve the tenant's selected
--   canonical plan_id and matching plan_version_id upon operator publish/activation.
--   P2A.0-R2 Improvements:
--     1. Eliminates legacy 'premium_monthly' forced plan rewrite.
--     2. Preserves tenant's selected canonical plan_id and plan_version_id.
--     3. Transitions subscription status from 'pending_onboarding' to 'manual_active'.
--     4. Preserves all readiness checklist checks (business profile, active service, active staff, staff-service mapping, availability rules).
--     5. Updates tenant status = 'active', onboarding_status = 'completed', public_site_status = 'published', provisioning_status = 'live', go_live_status = 'live', verification_status = 'approved'.
--     6. Writes an audit event to public.audit_events.
-- Security:
--   - SECURITY DEFINER hardened with search_path = pg_catalog, public
--   - Strict super_admin caller authorization check
--   - REVOKE EXECUTE from PUBLIC and anon; GRANT EXECUTE to authenticated

CREATE OR REPLACE FUNCTION public.approve_and_publish_tenant(p_tenant_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_caller_role text;
    v_caller_tenant_id uuid;
    v_has_profile boolean;
    v_has_service boolean;
    v_has_staff boolean;
    v_has_staff_service boolean;
    v_has_availability boolean;
    v_sub_exists boolean;
    v_current_plan_id text;
    v_current_plan_ver_id uuid;
    v_result jsonb;
    v_persisted_tenant jsonb;
    v_persisted_sub jsonb;
BEGIN
    -- 1. Security check: Caller must be super_admin with NULL tenant_id
    SELECT role, tenant_id INTO v_caller_role, v_caller_tenant_id
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF v_caller_role IS DISTINCT FROM 'super_admin' OR v_caller_tenant_id IS NOT NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Only platform super_admin can approve and publish a tenant.' USING ERRCODE = 'P0001';
    END IF;

    -- 2. Lock/Load tenant row
    PERFORM 1 FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TENANT_NOT_FOUND: Specified tenant % does not exist.', p_tenant_id USING ERRCODE = 'P0001';
    END IF;

    -- 3. Readiness checklist verification
    -- A. Business profile exists
    SELECT EXISTS (
        SELECT 1 FROM public.tenant_business_profiles WHERE tenant_id = p_tenant_id
    ) INTO v_has_profile;
    IF NOT v_has_profile THEN
        RAISE EXCEPTION 'ONBOARDING_NOT_READY: Business profile (tenant_business_profiles) missing.' USING ERRCODE = 'P0001';
    END IF;

    -- B. Active service exists
    SELECT EXISTS (
        SELECT 1 FROM public.services WHERE tenant_id = p_tenant_id AND active = true
    ) INTO v_has_service;
    IF NOT v_has_service THEN
        RAISE EXCEPTION 'ONBOARDING_NOT_READY: No active service configured for tenant.' USING ERRCODE = 'P0001';
    END IF;

    -- C. Active staff exists
    SELECT EXISTS (
        SELECT 1 FROM public.staff WHERE tenant_id = p_tenant_id AND active = true
    ) INTO v_has_staff;
    IF NOT v_has_staff THEN
        RAISE EXCEPTION 'ONBOARDING_NOT_READY: No active staff member configured for tenant.' USING ERRCODE = 'P0001';
    END IF;

    -- D. Staff-service assignment exists
    SELECT EXISTS (
        SELECT 1 FROM public.staff_services ss
        JOIN public.services s ON s.id = ss.service_id
        JOIN public.staff st ON st.id = ss.staff_id
        WHERE s.tenant_id = p_tenant_id AND st.tenant_id = p_tenant_id AND s.active = true AND st.active = true
    ) INTO v_has_staff_service;
    IF NOT v_has_staff_service THEN
        RAISE EXCEPTION 'ONBOARDING_NOT_READY: No valid staff-service assignment found for tenant.' USING ERRCODE = 'P0001';
    END IF;

    -- E. Active availability rules exist
    SELECT EXISTS (
        SELECT 1 FROM public.availability_rules ar
        JOIN public.staff st ON st.id = ar.staff_id
        WHERE ar.tenant_id = p_tenant_id AND st.tenant_id = p_tenant_id AND st.active = true
    ) INTO v_has_availability;
    IF NOT v_has_availability THEN
        RAISE EXCEPTION 'ONBOARDING_NOT_READY: No active availability rules configured for tenant.' USING ERRCODE = 'P0001';
    END IF;

    -- 4. Preserve canonical plan selection and update subscription status to manual_active
    SELECT plan_id, plan_version_id INTO v_current_plan_id, v_current_plan_ver_id
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_current_plan_id IS NOT NULL THEN
        UPDATE public.subscriptions
        SET
            status = 'manual_active',
            billing_mode = 'manual',
            payment_reference_note = 'Approved and published by Super Admin'
        WHERE tenant_id = p_tenant_id;
    ELSE
        -- Fallback to baslangic if no subscription exists
        INSERT INTO public.subscriptions (
            tenant_id,
            plan_id,
            status,
            billing_mode,
            payment_reference_note
        ) VALUES (
            p_tenant_id,
            'baslangic',
            'manual_active',
            'manual',
            'Approved and published by Super Admin'
        );
    END IF;

    -- 5. Update tenant publish & onboarding state
    UPDATE public.tenants
    SET
        status = 'active',
        onboarding_status = 'completed',
        public_site_status = 'published',
        provisioning_status = 'live',
        go_live_status = 'live',
        verification_status = 'approved'
    WHERE id = p_tenant_id;

    -- 6. Enable business profile public visibility
    UPDATE public.tenant_business_profiles
    SET is_public_profile_enabled = true
    WHERE tenant_id = p_tenant_id;

    -- 7. Audit log entry
    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        p_tenant_id::text,
        auth.uid()::text,
        'super_admin',
        'tenant_approved_and_published',
        'tenants',
        p_tenant_id::text,
        jsonb_build_object(
            'plan_id', v_current_plan_id,
            'plan_version_id', v_current_plan_ver_id,
            'status', 'manual_active'
        )
    );

    -- 8. Retrieve actual persisted state
    SELECT row_to_json(t)::jsonb INTO v_persisted_tenant FROM public.tenants t WHERE t.id = p_tenant_id;
    SELECT row_to_json(s)::jsonb INTO v_persisted_sub FROM public.subscriptions s WHERE s.tenant_id = p_tenant_id LIMIT 1;

    v_result := jsonb_build_object(
        'tenant', v_persisted_tenant,
        'subscription', v_persisted_sub
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public;

-- Revoke public execution permissions
REVOKE EXECUTE ON FUNCTION public.approve_and_publish_tenant(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_and_publish_tenant(uuid) FROM anon;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.approve_and_publish_tenant(uuid) TO authenticated;
