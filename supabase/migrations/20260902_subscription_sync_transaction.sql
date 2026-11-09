-- ==============================================================================
-- LARI PILOT 3: CANDIDATE MIGRATION (ADIM-005)
-- File: 20260902_subscription_sync_transaction.sql
-- Purpose: Atomic All-in-One Transaction RPC for Subscription Sync Operations
-- Target: Enforce atomic state transition across subscriptions, tenants, and audit_logs.
-- Notice: CANDIDATE ONLY. Do NOT execute on live/remote production databases automatically.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.execute_subscription_sync_transaction(
    p_tenant_id TEXT,
    p_subscription_status TEXT,
    p_tenant_status TEXT,
    p_mode TEXT DEFAULT 'sync_verified',
    p_provider_status TEXT DEFAULT NULL,
    p_audit_details JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant_uuid UUID;
    v_sub_id UUID;
    v_tenant RECORD;
    v_sub RECORD;
BEGIN
    -- 1. Validate Tenant ID parameter
    IF p_tenant_id IS NULL OR trim(p_tenant_id) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MISSING_TENANT_ID',
            'code', 'MISSING_TENANT_ID'
        );
    END IF;

    BEGIN
        v_tenant_uuid := p_tenant_id::uuid;
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_TENANT_ID',
            'code', 'INVALID_TENANT_ID'
        );
    END;

    -- 2. Validate Status Parameters
    IF p_subscription_status IS NULL OR trim(p_subscription_status) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MISSING_SUBSCRIPTION_STATUS',
            'code', 'MISSING_SUBSCRIPTION_STATUS'
        );
    END IF;

    IF p_tenant_status IS NULL OR trim(p_tenant_status) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MISSING_TENANT_STATUS',
            'code', 'MISSING_TENANT_STATUS'
        );
    END IF;

    -- Fail-closed validation invariant:
    -- Tenant can ONLY be active if subscription is active or trialing
    IF p_tenant_status = 'active' AND p_subscription_status NOT IN ('active', 'trialing') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'FAIL_CLOSED_VIOLATION_TENANT_ACTIVE_WITHOUT_ACTIVE_SUBSCRIPTION',
            'code', 'FAIL_CLOSED_VIOLATION'
        );
    END IF;

    -- 3. Lock Tenant FOR UPDATE
    SELECT * INTO v_tenant
    FROM public.tenants
    WHERE id = v_tenant_uuid
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'TENANT_NOT_FOUND',
            'code', 'TENANT_NOT_FOUND'
        );
    END IF;

    -- 4. Lock Subscription FOR UPDATE (or locate most recent)
    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = v_tenant_uuid
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        v_sub_id := v_sub.id;
        UPDATE public.subscriptions
        SET status = p_subscription_status,
            updated_at = now()
        WHERE id = v_sub.id;
    ELSE
        INSERT INTO public.subscriptions (
            tenant_id,
            status,
            created_at,
            updated_at
        )
        VALUES (
            v_tenant_uuid,
            p_subscription_status,
            now(),
            now()
        )
        RETURNING id INTO v_sub_id;
    END IF;

    -- 5. Update Tenant Status
    UPDATE public.tenants
    SET status = p_tenant_status,
        updated_at = now()
    WHERE id = v_tenant_uuid;

    -- 6. Insert Audit Log
    INSERT INTO public.audit_logs (
        tenant_id,
        action,
        details,
        created_at
    )
    VALUES (
        v_tenant_uuid,
        'subscription_sync',
        jsonb_build_object(
            'mode', COALESCE(p_mode, 'sync_verified'),
            'providerStatus', p_provider_status,
            'subscriptionStatus', p_subscription_status,
            'tenantStatus', p_tenant_status,
            'subscriptionId', v_sub_id,
            'auditDetails', COALESCE(p_audit_details, '{}'::jsonb)
        ),
        now()
    );

    -- 7. Return Success Result
    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'subscription_status', p_subscription_status,
        'tenant_status', p_tenant_status,
        'mode', p_mode
    );
END;
$$;

-- Revoke all direct execution from untrusted roles
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON FUNCTION public.execute_subscription_sync_transaction FROM PUBLIC;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE ALL ON FUNCTION public.execute_subscription_sync_transaction FROM anon;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE ALL ON FUNCTION public.execute_subscription_sync_transaction FROM authenticated;
    END IF;
    GRANT EXECUTE ON FUNCTION public.execute_subscription_sync_transaction TO service_role;
  END IF;
END $$;
