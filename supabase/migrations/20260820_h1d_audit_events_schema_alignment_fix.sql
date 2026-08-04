-- =========================================================================
-- MIGRATION 45: H1D AUDIT_EVENTS CANONICAL SCHEMA ALIGNMENT
--
-- Forward-only correction for the two H1D platform restriction mutation RPCs.
-- Aligns audit writes with canonical audit_events columns:
-- tenant_id, actor_id, actor_role, action, resource_type, resource_id, payload.
-- =========================================================================

-- 1. MUTATION RPC: super_admin_create_platform_restriction
CREATE OR REPLACE FUNCTION public.super_admin_create_platform_restriction(
    p_tenant_id UUID,
    p_feature_key TEXT,
    p_reason TEXT,
    p_starts_at TIMESTAMPTZ DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor_user_id UUID;
    v_fingerprint   TEXT;
    v_cached_resp   JSONB;
    v_starts_at     TIMESTAMPTZ;
    v_restriction   RECORD;
    v_resp          JSONB;
BEGIN
    -- 1. Authenticate and Authorize
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized', 'changed', false, 'replayed', false);
    END IF;

    -- 2. Validate mandatory idempotency key
    IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'idempotency_key_required', 'changed', false, 'replayed', false);
    END IF;

    IF p_tenant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'tenant_not_found', 'changed', false, 'replayed', false);
    END IF;

    IF p_feature_key IS NULL OR NOT EXISTS (SELECT 1 FROM public.commercial_feature_definitions WHERE feature_key = p_feature_key) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_feature_key', 'changed', false, 'replayed', false);
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'reason_required', 'changed', false, 'replayed', false);
    END IF;

    v_starts_at := COALESCE(p_starts_at, now());
    IF p_expires_at IS NOT NULL AND p_expires_at <= v_starts_at THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_date_range', 'changed', false, 'replayed', false);
    END IF;

    -- 3. Acquire Advisory Transaction Lock
    PERFORM pg_advisory_xact_lock(hashtextextended('super_admin_create_platform_restriction:' || trim(p_idempotency_key), 424242));

    -- Complete fingerprint including temporal fields
    v_fingerprint := md5(concat_ws(':', COALESCE(p_tenant_id::text, 'global'), p_feature_key, trim(p_reason), v_starts_at::text, COALESCE(p_expires_at::text, 'none')));

    -- 4. Check cached idempotency record
    BEGIN
        v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_create_platform_restriction', v_fingerprint);
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%IDEMPOTENCY_CONFLICT%' THEN
                RETURN jsonb_build_object('success', false, 'reason_code', 'idempotency_conflict', 'changed', false, 'replayed', false);
            ELSE
                RAISE;
            END IF;
    END;

    IF v_cached_resp IS NOT NULL THEN
        RETURN v_cached_resp || jsonb_build_object('changed', false, 'replayed', true);
    END IF;

    -- 5. Execute mutation
    INSERT INTO public.platform_system_restrictions (
        tenant_id,
        feature_key,
        is_restricted,
        reason,
        starts_at,
        expires_at
    ) VALUES (
        p_tenant_id,
        p_feature_key,
        true,
        trim(p_reason),
        v_starts_at,
        p_expires_at
    )
    RETURNING * INTO v_restriction;

    -- 6. Write audit event
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
        v_actor_user_id::text,
        'super_admin',
        'platform_restriction_created',
        'platform_system_restrictions',
        v_restriction.id::text,
        jsonb_build_object(
            'feature_key', p_feature_key,
            'reason', trim(p_reason),
            'starts_at', v_starts_at,
            'expires_at', p_expires_at
        )
    );

    v_resp := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'changed', true,
        'replayed', false,
        'restriction', to_jsonb(v_restriction)
    );

    -- 7. Record idempotency response
    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_create_platform_restriction', v_fingerprint, v_resp);

    -- 8. Return response
    RETURN v_resp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_create_platform_restriction(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_create_platform_restriction(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;


-- 2. MUTATION RPC: super_admin_end_platform_restriction
CREATE OR REPLACE FUNCTION public.super_admin_end_platform_restriction(
    p_restriction_id UUID,
    p_reason TEXT,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor_user_id UUID;
    v_fingerprint   TEXT;
    v_cached_resp   JSONB;
    v_restriction   RECORD;
    v_new_rest      RECORD;
    v_resp          JSONB;
BEGIN
    -- 1. Authenticate and Authorize
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized', 'changed', false, 'replayed', false);
    END IF;

    -- 2. Validate mandatory idempotency key
    IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'idempotency_key_required', 'changed', false, 'replayed', false);
    END IF;

    IF p_restriction_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_parameters', 'changed', false, 'replayed', false);
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'reason_required', 'changed', false, 'replayed', false);
    END IF;

    -- 3. Acquire Advisory Transaction Lock
    PERFORM pg_advisory_xact_lock(hashtextextended('super_admin_end_platform_restriction:' || trim(p_idempotency_key), 424242));

    v_fingerprint := md5(concat_ws(':', p_restriction_id::text, 'end_restriction', trim(p_reason)));

    -- 4. Check cached idempotency record
    BEGIN
        v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_end_platform_restriction', v_fingerprint);
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%IDEMPOTENCY_CONFLICT%' THEN
                RETURN jsonb_build_object('success', false, 'reason_code', 'idempotency_conflict', 'changed', false, 'replayed', false);
            ELSE
                RAISE;
            END IF;
    END;

    IF v_cached_resp IS NOT NULL THEN
        RETURN v_cached_resp || jsonb_build_object('changed', false, 'replayed', true);
    END IF;

    -- 5. Execute mutation
    SELECT * INTO v_restriction
    FROM public.platform_system_restrictions
    WHERE id = p_restriction_id
    FOR UPDATE;

    IF v_restriction.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'restriction_not_found', 'changed', false, 'replayed', false);
    END IF;

    IF NOT v_restriction.is_restricted OR (v_restriction.expires_at IS NOT NULL AND v_restriction.expires_at <= now()) THEN
        v_resp := jsonb_build_object('success', true, 'reason_code', 'already_ended', 'changed', false, 'replayed', false, 'restriction', to_jsonb(v_restriction));
        PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_end_platform_restriction', v_fingerprint, v_resp);
        RETURN v_resp;
    END IF;

    UPDATE public.platform_system_restrictions
    SET is_restricted = false,
        expires_at = now()
    WHERE id = p_restriction_id
    RETURNING * INTO v_new_rest;

    -- 6. Write audit event
    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        v_restriction.tenant_id::text,
        v_actor_user_id::text,
        'super_admin',
        'platform_restriction_ended',
        'platform_system_restrictions',
        p_restriction_id::text,
        jsonb_build_object(
            'feature_key', v_restriction.feature_key,
            'reason', trim(p_reason),
            'ended_at', now()
        )
    );

    v_resp := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'changed', true,
        'replayed', false,
        'restriction', to_jsonb(v_new_rest)
    );

    -- 7. Record idempotency response
    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_end_platform_restriction', v_fingerprint, v_resp);

    -- 8. Return response
    RETURN v_resp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_end_platform_restriction(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_end_platform_restriction(UUID, TEXT, TEXT) TO authenticated;
