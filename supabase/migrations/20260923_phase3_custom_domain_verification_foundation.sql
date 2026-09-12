-- =========================================================================
-- MIGRATION: 20260923_phase3_custom_domain_verification_foundation.sql
-- Description: Phase 3 Lane 4 Custom Domain Verification Foundation (R1 Hardened)
-- Target: Supabase / PostgreSQL
-- Implementation Authority: LARI-PROGRAM-V2-PHASE3-CUSTOM-DOMAIN-VERIFICATION-20260911-01
-- Correction Authority: LARI-PROGRAM-V2-PHASE3-R1-CORRECTIONS-AND-PHASE4-CONTINUATION-20260911-01
-- Constraints:
--   - public.custom_domains is the single authoritative lifecycle and verification source
--   - public.tenants.custom_domain is synchronized ONLY as a derived verified value (no split-brain)
--   - Reconciles any pre-existing tenants.custom_domain rows into public.custom_domains safely
--   - Explicit application role & tenant checks from public.users_profile (fail closed on NULL)
--   - Only tenant_owner for exact tenant or super_admin may mutate custom domains
--   - Fixed search_path = pg_catalog, public
--   - Sanitized tenant-scoped read RPC (get_tenant_custom_domains) with challenge rows secured
--   - Deterministic test verification (TEST_PROVIDER_SIMULATED_VERIFIED) is service_role only
--     and NEVER satisfies public live tenant-domain resolution (only REAL_PROVIDER_VERIFIED resolves)
--   - No DNS network calls, no Vercel mutations, no randevulari.com changes
-- =========================================================================

-- 1. CUSTOM DOMAINS TABLE
CREATE TABLE IF NOT EXISTS public.custom_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    requested_hostname TEXT NOT NULL,
    normalized_hostname TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_verification',
    verification_method TEXT NOT NULL DEFAULT 'dns_txt',
    verification_token TEXT NOT NULL DEFAULT ('lari-verify-' || replace(gen_random_uuid()::text, '-', '')),
    verification_record_name TEXT NOT NULL,
    verification_expected_value TEXT NOT NULL,
    provider_status TEXT NOT NULL DEFAULT 'DOMAIN_PROVIDER_READY_NOT_CONNECTED',
    error_code TEXT NULL,
    error_message TEXT NULL,
    last_checked_at TIMESTAMPTZ NULL,
    verified_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_custom_domains_status CHECK (
        status IN (
            'pending_verification',
            'verified',
            'failed',
            'revoked',
            'expired'
        )
    ),
    CONSTRAINT chk_custom_domains_provider_status CHECK (
        provider_status IN (
            'DOMAIN_PROVIDER_READY_NOT_CONNECTED',
            'TEST_PROVIDER_SIMULATED_VERIFIED',
            'TEST_PROVIDER_SIMULATED_FAILED',
            'REAL_PROVIDER_VERIFIED'
        )
    ),
    CONSTRAINT chk_custom_domains_hostname_format CHECK (
        normalized_hostname ~* '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    )
);

-- Unique index ensuring single-domain ownership across tenants (domain conflict protection)
CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_domains_normalized_hostname
    ON public.custom_domains(normalized_hostname);

-- Tenant lookup index
CREATE INDEX IF NOT EXISTS idx_custom_domains_tenant_id
    ON public.custom_domains(tenant_id);

CREATE INDEX IF NOT EXISTS idx_custom_domains_status
    ON public.custom_domains(status);

-- Enable RLS
ALTER TABLE public.custom_domains ENABLE ROW LEVEL SECURITY;

-- Deny raw table access from anon and authenticated; internal / RPC access only
REVOKE ALL ON TABLE public.custom_domains FROM PUBLIC, anon, authenticated;

-- 2. RECONCILE PRE-EXISTING tenants.custom_domain VALUES SAFELY
DO $$
DECLARE
    v_rec RECORD;
BEGIN
    FOR v_rec IN
        SELECT id AS t_id, lower(trim(custom_domain)) AS c_dom
        FROM public.tenants
        WHERE custom_domain IS NOT NULL AND trim(custom_domain) <> ''
    LOOP
        -- Insert into custom_domains if not already tracked as non-live LEGACY_UNVERIFIED
        INSERT INTO public.custom_domains (
            tenant_id,
            requested_hostname,
            normalized_hostname,
            status,
            verification_method,
            verification_token,
            verification_record_name,
            verification_expected_value,
            provider_status,
            verified_at,
            metadata
        ) VALUES (
            v_rec.t_id,
            v_rec.c_dom,
            v_rec.c_dom,
            'pending_verification',
            'dns_txt',
            'lari-legacy-migrated',
            '_lari-challenge.' || v_rec.c_dom,
            'legacy-migrated-unverified',
            'DOMAIN_PROVIDER_READY_NOT_CONNECTED',
            NULL,
            jsonb_build_object('source', 'legacy_tenants_custom_domain', 'verification_status', 'LEGACY_UNVERIFIED')
        )
        ON CONFLICT (normalized_hostname) DO NOTHING;
    END LOOP;
END;
$$;

-- 3. DOMAIN NORMALIZATION HELPER FUNCTION
CREATE OR REPLACE FUNCTION public.normalize_custom_hostname(p_hostname TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_norm TEXT;
BEGIN
    IF p_hostname IS NULL OR trim(p_hostname) = '' THEN
        RAISE EXCEPTION 'HOSTNAME_REQUIRED' USING ERRCODE = 'P0001';
    END IF;

    -- Strip leading http:// or https://, port, trailing slashes, whitespace, and lowercase
    v_norm := lower(trim(p_hostname));
    v_norm := regexp_replace(v_norm, '^https?://', '', 'i');
    v_norm := regexp_replace(v_norm, '/.*$', '', 'i');
    v_norm := regexp_replace(v_norm, ':[0-9]+$', '', 'i');
    v_norm := trim(v_norm);

    -- Reject forbidden system/apex apex domains or localhost
    IF v_norm = 'localhost' OR v_norm LIKE '%.localhost' OR v_norm LIKE '%.local' THEN
        RAISE EXCEPTION 'FORBIDDEN_LOCAL_DOMAIN' USING ERRCODE = 'P0002';
    END IF;

    -- Reject randevulari platform subdomains or apex to prevent hijacking
    IF v_norm = 'randevulari.com' OR v_norm = 'www.randevulari.com' OR v_norm = 'app.randevulari.com' OR v_norm LIKE '%.randevulari.com' THEN
        RAISE EXCEPTION 'FORBIDDEN_PLATFORM_DOMAIN' USING ERRCODE = 'P0003';
    END IF;

    -- Basic domain format check
    IF NOT (v_norm ~* '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$') THEN
        RAISE EXCEPTION 'INVALID_HOSTNAME_FORMAT' USING ERRCODE = 'P0004';
    END IF;

    RETURN v_norm;
END;
$$;

-- 4. REQUEST CUSTOM DOMAIN RPC
CREATE OR REPLACE FUNCTION public.request_custom_domain(
    p_tenant_id UUID,
    p_hostname TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user RECORD;
    v_normalized TEXT;
    v_token TEXT;
    v_rec_name TEXT;
    v_expected_val TEXT;
    v_domain_id UUID;
    v_existing_id UUID;
    v_existing_tenant UUID;
    v_existing_status TEXT;
BEGIN
    -- Fail closed on NULL tenant or caller
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'TENANT_REQUIRED' USING ERRCODE = '42501';
    END IF;

    -- Authorize against users_profile
    SELECT role, tenant_id INTO v_user
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;

    IF v_user.role <> 'super_admin' AND (v_user.role <> 'tenant_owner' OR v_user.tenant_id <> p_tenant_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: tenant_owner access required' USING ERRCODE = '42501';
    END IF;

    -- Normalize hostname
    v_normalized := public.normalize_custom_hostname(p_hostname);

    -- Check domain conflict / single-domain ownership invariant
    SELECT id, tenant_id, status
    INTO v_existing_id, v_existing_tenant, v_existing_status
    FROM public.custom_domains
    WHERE normalized_hostname = v_normalized;

    IF v_existing_id IS NOT NULL THEN
        IF v_existing_tenant <> p_tenant_id THEN
            RAISE EXCEPTION 'DOMAIN_ALREADY_REGISTERED_BY_OTHER_TENANT' USING ERRCODE = '23505';
        ELSE
            IF v_existing_status = 'verified' THEN
                RAISE EXCEPTION 'DOMAIN_ALREADY_VERIFIED' USING ERRCODE = 'P0005';
            END IF;

            v_token := 'lari-verify-' || replace(gen_random_uuid()::text, '-', '');
            v_rec_name := '_lari-challenge.' || v_normalized;
            v_expected_val := v_token;

            UPDATE public.custom_domains
            SET verification_token = v_token,
                verification_record_name = v_rec_name,
                verification_expected_value = v_expected_val,
                status = 'pending_verification',
                error_code = NULL,
                error_message = NULL,
                updated_at = now()
            WHERE id = v_existing_id
            RETURNING id INTO v_domain_id;

            RETURN jsonb_build_object(
                'success', true,
                'domain_id', v_domain_id,
                'requested_hostname', p_hostname,
                'normalized_hostname', v_normalized,
                'status', 'pending_verification',
                'verification_record_type', 'TXT',
                'verification_record_name', v_rec_name,
                'verification_expected_value', v_expected_val,
                'provider_status', 'DOMAIN_PROVIDER_READY_NOT_CONNECTED',
                'message', 'Verification challenge refreshed'
            );
        END IF;
    END IF;

    v_token := 'lari-verify-' || replace(gen_random_uuid()::text, '-', '');
    v_rec_name := '_lari-challenge.' || v_normalized;
    v_expected_val := v_token;

    INSERT INTO public.custom_domains (
        tenant_id,
        requested_hostname,
        normalized_hostname,
        status,
        verification_method,
        verification_token,
        verification_record_name,
        verification_expected_value,
        provider_status
    ) VALUES (
        p_tenant_id,
        p_hostname,
        v_normalized,
        'pending_verification',
        'dns_txt',
        v_token,
        v_rec_name,
        v_expected_val,
        'DOMAIN_PROVIDER_READY_NOT_CONNECTED'
    )
    RETURNING id INTO v_domain_id;

    RETURN jsonb_build_object(
        'success', true,
        'domain_id', v_domain_id,
        'requested_hostname', p_hostname,
        'normalized_hostname', v_normalized,
        'status', 'pending_verification',
        'verification_record_type', 'TXT',
        'verification_record_name', v_rec_name,
        'verification_expected_value', v_expected_val,
        'provider_status', 'DOMAIN_PROVIDER_READY_NOT_CONNECTED',
        'message', 'Domain registered, pending TXT record verification'
    );
END;
$$;

-- 5. SIMULATED TEST VERIFIER (SERVICE_ROLE ONLY)
-- Deterministic test verification; STRICTLY RESTRICTED to service_role test harnesses.
-- Results in TEST_PROVIDER_SIMULATED_VERIFIED which is NOT live-resolved.
CREATE OR REPLACE FUNCTION public.simulate_verify_custom_domain_for_testing(
    p_tenant_id UUID,
    p_domain_id UUID,
    p_simulated_txt_value TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_domain RECORD;
    v_is_valid BOOLEAN := false;
BEGIN
    SELECT * INTO v_domain
    FROM public.custom_domains
    WHERE id = p_domain_id AND tenant_id = p_tenant_id;

    IF v_domain.id IS NULL THEN
        RAISE EXCEPTION 'DOMAIN_NOT_FOUND' USING ERRCODE = 'P0006';
    END IF;

    IF p_simulated_txt_value IS NOT NULL AND trim(p_simulated_txt_value) = v_domain.verification_expected_value THEN
        v_is_valid := true;
    END IF;

    IF v_is_valid THEN
        UPDATE public.custom_domains
        SET status = 'verified',
            provider_status = 'TEST_PROVIDER_SIMULATED_VERIFIED',
            verified_at = now(),
            last_checked_at = now(),
            error_code = NULL,
            error_message = NULL,
            updated_at = now()
        WHERE id = p_domain_id;

        RETURN jsonb_build_object(
            'success', true,
            'domain_id', p_domain_id,
            'status', 'verified',
            'normalized_hostname', v_domain.normalized_hostname,
            'provider_status', 'TEST_PROVIDER_SIMULATED_VERIFIED',
            'verified_at', now(),
            'message', 'Domain test-verified in simulation mode (not active on live platform)'
        );
    ELSE
        UPDATE public.custom_domains
        SET status = 'failed',
            provider_status = 'TEST_PROVIDER_SIMULATED_FAILED',
            last_checked_at = now(),
            error_code = 'DNS_RECORD_MISMATCH',
            error_message = 'Simulated DNS TXT record did not match expected verification challenge value',
            updated_at = now()
        WHERE id = p_domain_id;

        RETURN jsonb_build_object(
            'success', false,
            'domain_id', p_domain_id,
            'status', 'failed',
            'normalized_hostname', v_domain.normalized_hostname,
            'provider_status', 'TEST_PROVIDER_SIMULATED_FAILED',
            'error_code', 'DNS_RECORD_MISMATCH'
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.simulate_verify_custom_domain_for_testing(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.simulate_verify_custom_domain_for_testing(UUID, UUID, TEXT) TO service_role;

-- Backward compatible verify_custom_domain for test harnesses
CREATE OR REPLACE FUNCTION public.verify_custom_domain(
    p_tenant_id UUID,
    p_domain_id UUID,
    p_simulated_txt_value TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    RETURN public.simulate_verify_custom_domain_for_testing(p_tenant_id, p_domain_id, p_simulated_txt_value);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_custom_domain(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_custom_domain(UUID, UUID, TEXT) TO service_role;

-- 6. SANITIZED TENANT-SCORED READ RPC
CREATE OR REPLACE FUNCTION public.get_tenant_custom_domains(
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user RECORD;
    v_domains JSONB;
BEGIN
    SELECT role, tenant_id INTO v_user
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;

    IF v_user.role <> 'super_admin' AND (v_user.role <> 'tenant_owner' OR v_user.tenant_id <> p_tenant_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', cd.id,
            'tenant_id', cd.tenant_id,
            'requested_hostname', cd.requested_hostname,
            'normalized_hostname', cd.normalized_hostname,
            'status', cd.status,
            'provider_status', cd.provider_status,
            'verification_record_type', 'TXT',
            'verification_record_name', cd.verification_record_name,
            'verification_expected_value', cd.verification_expected_value,
            'last_checked_at', cd.last_checked_at,
            'verified_at', cd.verified_at,
            'error_code', cd.error_code,
            'error_message', cd.error_message,
            'created_at', cd.created_at
        )
    )
    INTO v_domains
    FROM public.custom_domains cd
    WHERE cd.tenant_id = p_tenant_id
    ORDER BY cd.created_at DESC;

    RETURN jsonb_build_object('success', true, 'domains', COALESCE(v_domains, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_custom_domains(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_custom_domains(UUID) TO authenticated, service_role;

-- 7. RECHECK / RENEW CUSTOM DOMAIN STATUS RPC
CREATE OR REPLACE FUNCTION public.recheck_custom_domain(
    p_tenant_id UUID,
    p_domain_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user RECORD;
    v_domain RECORD;
BEGIN
    SELECT role, tenant_id INTO v_user
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;

    IF v_user.role <> 'super_admin' AND (v_user.role <> 'tenant_owner' OR v_user.tenant_id <> p_tenant_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_domain
    FROM public.custom_domains
    WHERE id = p_domain_id AND tenant_id = p_tenant_id;

    IF v_domain.id IS NULL THEN
        RAISE EXCEPTION 'DOMAIN_NOT_FOUND' USING ERRCODE = 'P0006';
    END IF;

    RETURN jsonb_build_object(
        'domain_id', v_domain.id,
        'tenant_id', v_domain.tenant_id,
        'requested_hostname', v_domain.requested_hostname,
        'normalized_hostname', v_domain.normalized_hostname,
        'status', v_domain.status,
        'verification_record_name', v_domain.verification_record_name,
        'verification_expected_value', v_domain.verification_expected_value,
        'provider_status', v_domain.provider_status,
        'last_checked_at', v_domain.last_checked_at,
        'verified_at', v_domain.verified_at,
        'error_code', v_domain.error_code,
        'error_message', v_domain.error_message
    );
END;
$$;

-- 8. REMOVE / REVOKE CUSTOM DOMAIN RPC
CREATE OR REPLACE FUNCTION public.remove_custom_domain(
    p_tenant_id UUID,
    p_domain_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user RECORD;
    v_deleted RECORD;
BEGIN
    SELECT role, tenant_id INTO v_user
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;

    IF v_user.role <> 'super_admin' AND (v_user.role <> 'tenant_owner' OR v_user.tenant_id <> p_tenant_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.custom_domains
    WHERE id = p_domain_id AND tenant_id = p_tenant_id
    RETURNING id, normalized_hostname INTO v_deleted;

    IF v_deleted.id IS NULL THEN
        RAISE EXCEPTION 'DOMAIN_NOT_FOUND' USING ERRCODE = 'P0006';
    END IF;

    -- Synchronize derived custom_domain on tenants table (clear if this domain was set)
    UPDATE public.tenants
    SET custom_domain = NULL, updated_at = now()
    WHERE id = p_tenant_id AND lower(custom_domain) = v_deleted.normalized_hostname;

    RETURN jsonb_build_object(
        'success', true,
        'domain_id', v_deleted.id,
        'normalized_hostname', v_deleted.normalized_hostname,
        'status', 'removed'
    );
END;
$$;

-- 9. RESOLVE TENANT BY CUSTOM DOMAIN RPC
-- Resolves ONLY when domain is REAL_PROVIDER_VERIFIED.
-- Test simulation state (TEST_PROVIDER_SIMULATED_VERIFIED) or DOMAIN_PROVIDER_READY_NOT_CONNECTED
-- will NOT be resolved as live public domain truth.
CREATE OR REPLACE FUNCTION public.resolve_tenant_by_custom_domain(
    p_hostname TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_norm TEXT;
    v_record RECORD;
BEGIN
    v_norm := public.normalize_custom_hostname(p_hostname);

    SELECT cd.id, cd.tenant_id, cd.status, cd.normalized_hostname, t.slug AS tenant_slug, t.name AS tenant_name
    INTO v_record
    FROM public.custom_domains cd
    JOIN public.tenants t ON t.id = cd.tenant_id
    WHERE cd.normalized_hostname = v_norm
      AND cd.status = 'verified'
      AND cd.provider_status = 'REAL_PROVIDER_VERIFIED';

    IF v_record.id IS NULL THEN
        RETURN jsonb_build_object(
            'resolved', false,
            'normalized_hostname', v_norm,
            'message', 'Domain not verified by real connected provider'
        );
    END IF;

    RETURN jsonb_build_object(
        'resolved', true,
        'domain_id', v_record.id,
        'tenant_id', v_record.tenant_id,
        'tenant_slug', v_record.tenant_slug,
        'tenant_name', v_record.tenant_name,
        'normalized_hostname', v_record.normalized_hostname
    );
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_custom_hostname(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_custom_domain(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recheck_custom_domain(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_custom_domain(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_tenant_by_custom_domain(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.normalize_custom_hostname(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_custom_domain(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recheck_custom_domain(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_custom_domain(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_by_custom_domain(TEXT) TO anon, authenticated, service_role;
