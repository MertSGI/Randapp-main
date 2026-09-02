CREATE OR REPLACE FUNCTION pg_temp.slice4_e2_bootstrap_commercial(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_plan_code TEXT;
    v_plan_version_id UUID;
    v_elig JSONB;
    v_bool_val BOOLEAN;
    v_quota JSONB;
    v_fk TEXT;
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'slice4_e2_bootstrap_commercial: p_tenant_id cannot be null';
    END IF;

    -- Select a published plan version satisfying ALL 4 required boolean features AND ALL 4 unlimited integer quotas
    SELECT p.code, pv.id
    INTO v_plan_code, v_plan_version_id
    FROM public.plan_versions pv
    JOIN public.plans p ON p.id = pv.plan_id
    JOIN public.plan_entitlements pe_core ON pe_core.plan_version_id = pv.id AND pe_core.feature_key = 'core_booking' AND pe_core.boolean_value = true
    JOIN public.plan_entitlements pe_staff ON pe_staff.plan_version_id = pv.id AND pe_staff.feature_key = 'staff_management' AND pe_staff.boolean_value = true
    JOIN public.plan_entitlements pe_service ON pe_service.plan_version_id = pv.id AND pe_service.feature_key = 'service_management' AND pe_service.boolean_value = true
    JOIN public.plan_entitlements pe_mini ON pe_mini.plan_version_id = pv.id AND pe_mini.feature_key = 'lari_minisite' AND pe_mini.boolean_value = true
    JOIN public.plan_entitlements pe_mstaff ON pe_mstaff.plan_version_id = pv.id AND pe_mstaff.feature_key = 'max_staff' AND pe_mstaff.value_type = 'integer' AND pe_mstaff.is_unlimited = true
    JOIN public.plan_entitlements pe_mservice ON pe_mservice.plan_version_id = pv.id AND pe_mservice.feature_key = 'max_services' AND pe_mservice.value_type = 'integer' AND pe_mservice.is_unlimited = true
    JOIN public.plan_entitlements pe_mbranch ON pe_mbranch.plan_version_id = pv.id AND pe_mbranch.feature_key = 'max_branches' AND pe_mbranch.value_type = 'integer' AND pe_mbranch.is_unlimited = true
    JOIN public.plan_entitlements pe_mappt ON pe_mappt.plan_version_id = pv.id AND pe_mappt.feature_key = 'max_monthly_appointments' AND pe_mappt.value_type = 'integer' AND pe_mappt.is_unlimited = true
    WHERE pv.lifecycle_status = 'published'
    ORDER BY pv.created_at DESC
    LIMIT 1;

    IF v_plan_version_id IS NULL OR v_plan_code IS NULL THEN
        RAISE EXCEPTION 'COMMERCIAL_TEST_FIXTURE_FATAL: No published plan_version found satisfying required capabilities and unlimited quotas.';
    END IF;

    -- Remove existing subscriptions for this synthetic test tenant only to prevent duplicates
    DELETE FROM public.subscriptions
    WHERE tenant_id = p_tenant_id;

    -- Insert exactly one canonical active subscription
    INSERT INTO public.subscriptions (
        tenant_id,
        plan_id,
        plan_version_id,
        status,
        billing_mode,
        current_period_start,
        current_period_end
    ) VALUES (
        p_tenant_id,
        v_plan_code,
        v_plan_version_id,
        'active',
        'manual',
        now() - interval '1 day',
        now() + interval '1 year'
    );

    -- 1. Prove Commercial Eligibility
    v_elig := public.resolve_tenant_commercial_eligibility(p_tenant_id);
    IF (v_elig->>'eligible')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'COMMERCIAL_TEST_FIXTURE_FATAL: Tenant % eligibility resolved false: %', p_tenant_id, v_elig;
    END IF;

    -- 2. Verify Effective Entitlements (Boolean features)
    FOREACH v_fk IN ARRAY ARRAY['core_booking', 'staff_management', 'service_management', 'lari_minisite'] LOOP
        SELECT boolean_value INTO v_bool_val
        FROM public.resolve_effective_tenant_entitlements(p_tenant_id)
        WHERE feature_key = v_fk;

        IF v_bool_val IS NOT TRUE THEN
            RAISE EXCEPTION 'COMMERCIAL_TEST_FIXTURE_FATAL: Tenant % effective entitlement % resolved false or null', p_tenant_id, v_fk;
        END IF;
    END LOOP;

    -- 3. Verify Effective Quota Authority (Unlimited quotas)
    FOREACH v_fk IN ARRAY ARRAY['max_staff', 'max_services', 'max_branches', 'max_monthly_appointments'] LOOP
        v_quota := public.resolve_commercial_quota(p_tenant_id, v_fk);
        IF (v_quota->>'is_unlimited')::boolean IS NOT TRUE THEN
            RAISE EXCEPTION 'COMMERCIAL_TEST_FIXTURE_FATAL: Tenant % quota % resolved not unlimited: %', p_tenant_id, v_fk, v_quota;
        END IF;
    END LOOP;
END;
$$;
