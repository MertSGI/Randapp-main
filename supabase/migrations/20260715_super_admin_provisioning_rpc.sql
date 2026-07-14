-- 20260715_super_admin_provisioning_rpc.sql
-- Description: Controlled, atomic PostgreSQL function for Super Admin Tenant Provisioning.
-- Validates readiness constraints, upserts manual active subscription, publishes site status.

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
    v_sub_id uuid;
    v_sub_exists boolean;
    v_result jsonb;
    v_persisted_tenant jsonb;
    v_persisted_sub jsonb;
BEGIN
    -- 1. Security check: Caller must be super_admin with NULL tenant_id
    SELECT role, tenant_id INTO v_caller_role, v_caller_tenant_id
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF v_caller_role IS DISTINCT FROM 'super_admin' OR v_caller_tenant_id IS NOT NULL THEN
        RAISE EXCEPTION 'Yetkisiz işlem. Yalnızca platform yöneticisi (Super Admin) bu işlemi gerçekleştirebilir.';
    END IF;

    -- 2. Lock/Load tenant row to prevent concurrency issues
    PERFORM 1 FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Belirtilen işletme (tenant) bulunamadı.';
    END IF;

    -- 3. Readiness checklist verification
    -- A. Business profile exists
    SELECT EXISTS (
        SELECT 1 FROM public.tenant_business_profiles WHERE tenant_id = p_tenant_id
    ) INTO v_has_profile;
    IF NOT v_has_profile THEN
        RAISE EXCEPTION 'Hata: İşletme detay profili (tenant_business_profiles) mevcut değil.';
    END IF;

    -- B. Active service exists
    SELECT EXISTS (
        SELECT 1 FROM public.services WHERE tenant_id = p_tenant_id AND active = true
    ) INTO v_has_service;
    IF NOT v_has_service THEN
        RAISE EXCEPTION 'Hata: İşletmeye tanımlı aktif hizmet bulunamadı.';
    END IF;

    -- C. Active staff exists
    SELECT EXISTS (
        SELECT 1 FROM public.staff WHERE tenant_id = p_tenant_id AND active = true
    ) INTO v_has_staff;
    IF NOT v_has_staff THEN
        RAISE EXCEPTION 'Hata: İşletmeye tanımlı aktif çalışan bulunamadı.';
    END IF;

    -- D. Staff-service assignment exists
    SELECT EXISTS (
        SELECT 1 FROM public.staff_services ss
        JOIN public.services s ON s.id = ss.service_id
        JOIN public.staff st ON st.id = ss.staff_id
        WHERE s.tenant_id = p_tenant_id AND st.tenant_id = p_tenant_id AND s.active = true AND st.active = true
    ) INTO v_has_staff_service;
    IF NOT v_has_staff_service THEN
        RAISE EXCEPTION 'Hata: İşletmede çalışan ve hizmet eşleşmesi (tanımlı uzmanlık) bulunamadı.';
    END IF;

    -- E. Usable active availability exists (belongs to an active staff member)
    SELECT EXISTS (
        SELECT 1 FROM public.availability_rules ar
        JOIN public.staff st ON st.id = ar.staff_id
        WHERE ar.tenant_id = p_tenant_id AND st.tenant_id = p_tenant_id AND st.active = true
    ) INTO v_has_availability;
    IF NOT v_has_availability THEN
        RAISE EXCEPTION 'Hata: İşletmeye ait aktif çalışma saatleri veya uygunluk kuralları tanımlanmamış.';
    END IF;

    -- 4. Idempotently create or update the manual active subscription
    -- Since subscriptions table doesn't have a unique constraint on tenant_id, we check explicitly
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions WHERE tenant_id = p_tenant_id
    ) INTO v_sub_exists;

    IF v_sub_exists THEN
        UPDATE public.subscriptions
        SET
            status = 'manual_active',
            plan_id = 'premium_monthly',
            billing_source = 'manual',
            payment_reference_note = 'Süper Admin tarafından manuel onaylandı'
        WHERE tenant_id = p_tenant_id;
    ELSE
        v_sub_id := gen_random_uuid();
        INSERT INTO public.subscriptions (
            id,
            tenant_id,
            plan_id,
            status,
            billing_source,
            payment_reference_note
        )
        VALUES (
            v_sub_id,
            p_tenant_id,
            'premium_monthly',
            'manual_active',
            'manual',
            'Süper Admin tarafından manuel onaylandı'
        );
    END IF;

    -- 5. Update tenant state
    UPDATE public.tenants
    SET
        status = 'active',
        onboarding_status = 'completed',
        public_site_status = 'published',
        provisioning_status = 'live',
        go_live_status = 'live',
        verification_status = 'approved'
    WHERE id = p_tenant_id;

    -- 6. Retrieve actual persisted state
    SELECT row_to_json(t)::jsonb INTO v_persisted_tenant FROM public.tenants t WHERE t.id = p_tenant_id;
    SELECT row_to_json(s)::jsonb INTO v_persisted_sub FROM public.subscriptions s WHERE s.tenant_id = p_tenant_id LIMIT 1;

    -- 7. Build and return result object containing new state
    v_result := jsonb_build_object(
        'tenant', v_persisted_tenant,
        'subscription', v_persisted_sub
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Revoke public execution permissions
REVOKE EXECUTE ON FUNCTION public.approve_and_publish_tenant(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_and_publish_tenant(uuid) FROM anon;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.approve_and_publish_tenant(uuid) TO authenticated;
