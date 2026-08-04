-- =========================================================================
-- MIGRATION 46: FUTURE PLATFORM RESTRICTION SAFE END FIX
--
-- Forward-only correction for super_admin_end_platform_restriction.
--
-- A future restriction cannot be ended by assigning expires_at = now()
-- because that produces expires_at < starts_at and violates the canonical
-- restriction date-range constraint.
--
-- Future restrictions are disabled through is_restricted = false while
-- preserving their existing expiry. Active restrictions expire at now().
-- =========================================================================

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
        expires_at = CASE
            WHEN starts_at > now() THEN expires_at
            ELSE now()
        END
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
