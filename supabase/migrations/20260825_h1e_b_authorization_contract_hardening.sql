-- =========================================================================
-- MIGRATION 50: STAGE H1E-B1 PILOT AUTHORIZATION CONTRACT HARDENING
-- =========================================================================
-- Provisions:
--   1. Strict Revocation of Direct Table Access on public.tenant_pilot_authorizations:
--      REVOKE ALL ON TABLE public.tenant_pilot_authorizations FROM PUBLIC, anon, authenticated;
--      Drops all direct policies; enables RLS as defense in depth. Access is permitted exclusively
--      via SECURITY DEFINER RPCs.
--   2. Upper-case Reason Code Normalization for:
--      - super_admin_get_tenant_pilot_authorization
--      - super_admin_approve_tenant_pilot
--      - super_admin_revoke_tenant_pilot
--      Normalizes outputs to UNAUTHORIZED, IDEMPOTENCY_KEY_REQUIRED, TENANT_NOT_FOUND,
--      INVALID_REASON, IDEMPOTENCY_CONFLICT.
--   3. Audit Payload Hardening: Replaces raw idempotency_key in audit_events with
--      idempotency_key_hash (md5 hash) to prevent raw secret/key exposure.
--   4. Evidence Read RPC: public.super_admin_get_tenant_pilot_mutation_evidence
--      Returns safe aggregate counts for active/total authorizations, audit events, and
--      idempotency records for a given tenant and run prefix.
--
-- Migration 49 remains applied and immutable.
-- H1E-C public booking enforcement reserved for Migration 51.

-- 1. STRICT TABLE ACCESS REVOCATION & RLS HARDENING
REVOKE ALL ON TABLE public.tenant_pilot_authorizations FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS tenant_pilot_authorizations_super_admin_read ON public.tenant_pilot_authorizations;
DROP POLICY IF EXISTS tenant_pilot_authorizations_no_direct_write ON public.tenant_pilot_authorizations;

ALTER TABLE public.tenant_pilot_authorizations ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 2. READ CONTRACT: super_admin_get_tenant_pilot_authorization
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_get_tenant_pilot_authorization(
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $pilot_read$
DECLARE
    v_actor_user_id     UUID;
    v_tenant_exists     BOOLEAN := false;
    v_active_auth       RECORD;
    v_active_found      BOOLEAN := false;
    v_history           JSONB;
    v_status            TEXT;
BEGIN
    -- 1. Authenticate and Authorize
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'UNAUTHORIZED',
            'timestamp', now()
        );
    END IF;

    -- 2. Check tenant existence
    IF p_tenant_id IS NOT NULL THEN
        PERFORM 1 FROM public.tenants WHERE id = p_tenant_id;
        v_tenant_exists := FOUND;
    END IF;

    IF NOT v_tenant_exists THEN
        RETURN jsonb_build_object(
            'success', true,
            'timestamp', now(),
            'tenant_id', p_tenant_id,
            'status', 'TENANT_NOT_FOUND',
            'reason_code', 'TENANT_NOT_FOUND',
            'is_authorized', false,
            'active_authorization', NULL,
            'authorization_history', jsonb_build_array()
        );
    END IF;

    -- 3. Fetch active authorization
    SELECT * INTO v_active_auth
    FROM public.tenant_pilot_authorizations
    WHERE tenant_id = p_tenant_id AND revoked_at IS NULL
    LIMIT 1;

    v_active_found := FOUND;

    -- 4. Fetch full authorization history summary
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', id,
            'approved_at', approved_at,
            'approved_by', approved_by,
            'approved_reason', approved_reason,
            'revoked_at', revoked_at,
            'revoked_by', revoked_by,
            'revoked_reason', revoked_reason,
            'is_active', (revoked_at IS NULL)
        ) ORDER BY created_at DESC
    ), jsonb_build_array())
    INTO v_history
    FROM public.tenant_pilot_authorizations
    WHERE tenant_id = p_tenant_id;

    -- Determine status
    IF v_active_found THEN
        v_status := 'PILOT_AUTHORIZED';
    ELSIF jsonb_array_length(v_history) > 0 THEN
        v_status := 'PILOT_AUTHORIZATION_REVOKED';
    ELSE
        v_status := 'PILOT_NOT_AUTHORIZED';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'timestamp', now(),
        'tenant_id', p_tenant_id,
        'status', v_status,
        'reason_code', v_status,
        'is_authorized', v_active_found,
        'active_authorization', CASE WHEN v_active_found THEN jsonb_build_object(
            'id', v_active_auth.id,
            'approved_at', v_active_auth.approved_at,
            'approved_by', v_active_auth.approved_by,
            'approved_reason', v_active_auth.approved_reason
        ) ELSE NULL END,
        'authorization_history', v_history
    );
END;
$pilot_read$;

REVOKE ALL ON FUNCTION public.super_admin_get_tenant_pilot_authorization(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_get_tenant_pilot_authorization(UUID) TO authenticated;


-- =========================================================================
-- 3. MUTATION CONTRACT: super_admin_approve_tenant_pilot
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_approve_tenant_pilot(
    p_tenant_id UUID,
    p_reason TEXT,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $pilot_approve$
DECLARE
    v_actor_user_id     UUID;
    v_fingerprint       TEXT;
    v_cached_resp       JSONB;
    v_active_auth_id    UUID;
    v_new_auth          RECORD;
    v_resp              JSONB;
BEGIN
    -- 1. Authenticate and Authorize
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'UNAUTHORIZED', 'changed', false, 'replayed', false);
    END IF;

    -- 2. Validate inputs
    IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'IDEMPOTENCY_KEY_REQUIRED', 'changed', false, 'replayed', false);
    END IF;

    IF p_tenant_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'TENANT_NOT_FOUND', 'changed', false, 'replayed', false);
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'INVALID_REASON', 'changed', false, 'replayed', false);
    END IF;

    -- 3. Acquire Tenant-Scoped Advisory Lock
    PERFORM pg_advisory_xact_lock(hashtextextended('tenant_pilot_authorization:' || p_tenant_id::text, 0));

    -- Check cached idempotency record
    v_fingerprint := md5(concat_ws(':', p_tenant_id::text, trim(p_reason)));

    BEGIN
        v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_approve_tenant_pilot', v_fingerprint);
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%IDEMPOTENCY_CONFLICT%' THEN
                RETURN jsonb_build_object('success', false, 'reason_code', 'IDEMPOTENCY_CONFLICT', 'changed', false, 'replayed', false);
            ELSE
                RAISE;
            END IF;
    END;

    IF v_cached_resp IS NOT NULL THEN
        RETURN v_cached_resp || jsonb_build_object('changed', false, 'replayed', true);
    END IF;

    -- 4. Check if active authorization already exists
    SELECT id INTO v_active_auth_id
    FROM public.tenant_pilot_authorizations
    WHERE tenant_id = p_tenant_id AND revoked_at IS NULL
    FOR UPDATE;

    IF FOUND THEN
        v_resp := jsonb_build_object(
            'success', true,
            'reason_code', 'PILOT_ALREADY_AUTHORIZED',
            'tenant_id', p_tenant_id,
            'authorization_id', v_active_auth_id,
            'changed', false,
            'replayed', false
        );
        PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_approve_tenant_pilot', v_fingerprint, v_resp);
        RETURN v_resp;
    END IF;

    -- 5. Insert new authorization row
    INSERT INTO public.tenant_pilot_authorizations (
        tenant_id,
        approved_at,
        approved_by,
        approved_reason
    ) VALUES (
        p_tenant_id,
        now(),
        v_actor_user_id,
        trim(p_reason)
    )
    RETURNING * INTO v_new_auth;

    -- 6. Write Audit Event with safe idempotency_key_hash instead of raw key
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
        'tenant_pilot_approved',
        'tenant_pilot_authorizations',
        v_new_auth.id::text,
        jsonb_build_object(
            'tenant_id', p_tenant_id,
            'approved_reason', trim(p_reason),
            'idempotency_key_hash', md5(p_idempotency_key)
        )
    );

    v_resp := jsonb_build_object(
        'success', true,
        'reason_code', 'PILOT_AUTHORIZATION_APPROVED',
        'tenant_id', p_tenant_id,
        'authorization_id', v_new_auth.id,
        'approved_at', v_new_auth.approved_at,
        'changed', true,
        'replayed', false
    );

    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_approve_tenant_pilot', v_fingerprint, v_resp);
    RETURN v_resp;
END;
$pilot_approve$;

REVOKE ALL ON FUNCTION public.super_admin_approve_tenant_pilot(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_approve_tenant_pilot(UUID, TEXT, TEXT) TO authenticated;


-- =========================================================================
-- 4. MUTATION CONTRACT: super_admin_revoke_tenant_pilot
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_revoke_tenant_pilot(
    p_tenant_id UUID,
    p_reason TEXT,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $pilot_revoke$
DECLARE
    v_actor_user_id     UUID;
    v_fingerprint       TEXT;
    v_cached_resp       JSONB;
    v_active_auth       RECORD;
    v_resp              JSONB;
BEGIN
    -- 1. Authenticate and Authorize
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'UNAUTHORIZED', 'changed', false, 'replayed', false);
    END IF;

    -- 2. Validate inputs
    IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'IDEMPOTENCY_KEY_REQUIRED', 'changed', false, 'replayed', false);
    END IF;

    IF p_tenant_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'TENANT_NOT_FOUND', 'changed', false, 'replayed', false);
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'INVALID_REASON', 'changed', false, 'replayed', false);
    END IF;

    -- 3. Acquire Tenant-Scoped Advisory Lock
    PERFORM pg_advisory_xact_lock(hashtextextended('tenant_pilot_authorization:' || p_tenant_id::text, 0));

    -- Check cached idempotency record
    v_fingerprint := md5(concat_ws(':', p_tenant_id::text, trim(p_reason)));

    BEGIN
        v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_revoke_tenant_pilot', v_fingerprint);
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%IDEMPOTENCY_CONFLICT%' THEN
                RETURN jsonb_build_object('success', false, 'reason_code', 'IDEMPOTENCY_CONFLICT', 'changed', false, 'replayed', false);
            ELSE
                RAISE;
            END IF;
    END;

    IF v_cached_resp IS NOT NULL THEN
        RETURN v_cached_resp || jsonb_build_object('changed', false, 'replayed', true);
    END IF;

    -- 4. Fetch active authorization row
    SELECT * INTO v_active_auth
    FROM public.tenant_pilot_authorizations
    WHERE tenant_id = p_tenant_id AND revoked_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Check if tenant had history or never authorized
        IF EXISTS (SELECT 1 FROM public.tenant_pilot_authorizations WHERE tenant_id = p_tenant_id) THEN
            v_resp := jsonb_build_object(
                'success', true,
                'reason_code', 'PILOT_ALREADY_REVOKED',
                'tenant_id', p_tenant_id,
                'changed', false,
                'replayed', false
            );
        ELSE
            v_resp := jsonb_build_object(
                'success', true,
                'reason_code', 'PILOT_NOT_AUTHORIZED',
                'tenant_id', p_tenant_id,
                'changed', false,
                'replayed', false
            );
        END IF;
        PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_revoke_tenant_pilot', v_fingerprint, v_resp);
        RETURN v_resp;
    END IF;

    -- 5. Revoke active authorization row
    UPDATE public.tenant_pilot_authorizations
    SET
        revoked_at = now(),
        revoked_by = v_actor_user_id,
        revoked_reason = trim(p_reason)
    WHERE id = v_active_auth.id;

    -- 6. Write Audit Event with safe idempotency_key_hash
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
        'tenant_pilot_revoked',
        'tenant_pilot_authorizations',
        v_active_auth.id::text,
        jsonb_build_object(
            'tenant_id', p_tenant_id,
            'revoked_reason', trim(p_reason),
            'idempotency_key_hash', md5(p_idempotency_key)
        )
    );

    v_resp := jsonb_build_object(
        'success', true,
        'reason_code', 'PILOT_AUTHORIZATION_REVOKED',
        'tenant_id', p_tenant_id,
        'authorization_id', v_active_auth.id,
        'revoked_at', now(),
        'changed', true,
        'replayed', false
    );

    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_revoke_tenant_pilot', v_fingerprint, v_resp);
    RETURN v_resp;
END;
$pilot_revoke$;

REVOKE ALL ON FUNCTION public.super_admin_revoke_tenant_pilot(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_revoke_tenant_pilot(UUID, TEXT, TEXT) TO authenticated;


-- =========================================================================
-- 5. MUTATION EVIDENCE READ RPC
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_get_tenant_pilot_mutation_evidence(
    p_tenant_id UUID,
    p_run_prefix TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $evidence_read$
DECLARE
    v_actor_user_id     UUID;
    v_active_count      INTEGER := 0;
    v_total_auth_count  INTEGER := 0;
    v_approved_audit_cnt INTEGER := 0;
    v_revoked_audit_cnt  INTEGER := 0;
    v_idempotency_cnt   INTEGER := 0;
BEGIN
    -- 1. Authenticate and Authorize
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'UNAUTHORIZED',
            'timestamp', now()
        );
    END IF;

    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'TENANT_NOT_FOUND',
            'timestamp', now()
        );
    END IF;

    -- 2. Aggregate active and total authorizations
    SELECT count(*)::INTEGER INTO v_active_count
    FROM public.tenant_pilot_authorizations
    WHERE tenant_id = p_tenant_id AND revoked_at IS NULL;

    SELECT count(*)::INTEGER INTO v_total_auth_count
    FROM public.tenant_pilot_authorizations
    WHERE tenant_id = p_tenant_id;

    -- 3. Aggregate audit events
    SELECT count(*)::INTEGER INTO v_approved_audit_cnt
    FROM public.audit_events
    WHERE tenant_id = p_tenant_id::text
      AND action = 'tenant_pilot_approved';

    SELECT count(*)::INTEGER INTO v_revoked_audit_cnt
    FROM public.audit_events
    WHERE tenant_id = p_tenant_id::text
      AND action = 'tenant_pilot_revoked';

    -- 4. Aggregate idempotency records for pilot RPCs
    SELECT count(*)::INTEGER INTO v_idempotency_cnt
    FROM public.super_admin_commercial_mutation_idempotency
    WHERE rpc_name IN ('super_admin_approve_tenant_pilot', 'super_admin_revoke_tenant_pilot')
      AND (p_run_prefix IS NULL OR idempotency_key LIKE p_run_prefix || '%');

    RETURN jsonb_build_object(
        'success', true,
        'timestamp', now(),
        'tenant_id', p_tenant_id,
        'active_authorization_count', v_active_count,
        'total_authorization_count', v_total_auth_count,
        'approved_audit_count', v_approved_audit_cnt,
        'revoked_audit_count', v_revoked_audit_cnt,
        'idempotency_record_count', v_idempotency_cnt
    );
END;
$evidence_read$;

REVOKE ALL ON FUNCTION public.super_admin_get_tenant_pilot_mutation_evidence(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_get_tenant_pilot_mutation_evidence(UUID, TEXT) TO authenticated;
