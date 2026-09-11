-- =========================================================================
-- MIGRATION: 20260923_phase3_custom_domain_verification_foundation.sql
-- Description: Phase 3 Lane 4 Custom Domain Verification Foundation
-- Target: Supabase / PostgreSQL
-- Authority: LARI-PROGRAM-V2-PHASE3-CUSTOM-DOMAIN-VERIFICATION-20260911-01
-- Constraints:
--   - Provider-neutral domain model only
--   - requested hostname, normalized hostname, tenant binding
--   - verification challenge/token, verification status, timestamps
--   - renew/recheck lifecycle, failure state
--   - domain conflict protection, single-domain ownership invariant
--   - deterministic DNS verification test provider (NO real network send, NO real DNS mutation)
--   - strictly DOMAIN_PROVIDER_READY_NOT_CONNECTED state
--   - tenant isolation, role authorized
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
            'TEST_PROVIDER_SIMULATED_FAILED'
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

-- Deny all direct public/anon access
DROP POLICY IF EXISTS custom_domains_isolation_policy ON public.custom_domains;
CREATE POLICY custom_domains_isolation_policy ON public.custom_domains
    FOR ALL
    TO authenticated
    USING (
        tenant_id = public.current_tenant_id()
    )
    WITH CHECK (
        tenant_id = public.current_tenant_id()
    );

-- 2. DOMAIN NORMALIZATION HELPER FUNCTION
CREATE OR REPLACE FUNCTION public.normalize_custom_hostname(p_hostname TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
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

-- 3. REQUEST CUSTOM DOMAIN RPC
CREATE OR REPLACE FUNCTION public.request_custom_domain(
    p_tenant_id UUID,
    p_hostname TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_normalized TEXT;
    v_token TEXT;
    v_rec_name TEXT;
    v_expected_val TEXT;
    v_domain_id UUID;
    v_existing_id UUID;
    v_existing_tenant UUID;
    v_existing_status TEXT;
BEGIN
    -- 1. Authorization check
    v_caller_role := auth.jwt() ->> 'role';
    IF v_caller_role IS NULL OR (v_caller_role <> 'authenticated' AND v_caller_role <> 'service_role') THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;

    -- If authenticated, caller must match tenant
    IF v_caller_role = 'authenticated' THEN
        IF public.current_tenant_id() IS NOT NULL AND public.current_tenant_id() <> p_tenant_id THEN
            RAISE EXCEPTION 'TENANT_MISMATCH' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 2. Normalize hostname
    v_normalized := public.normalize_custom_hostname(p_hostname);

    -- 3. Check domain conflict / single-domain ownership invariant
    SELECT id, tenant_id, status
    INTO v_existing_id, v_existing_tenant, v_existing_status
    FROM public.custom_domains
    WHERE normalized_hostname = v_normalized;

    IF v_existing_id IS NOT NULL THEN
        IF v_existing_tenant <> p_tenant_id THEN
            -- Domain belongs to another tenant
            RAISE EXCEPTION 'DOMAIN_ALREADY_REGISTERED_BY_OTHER_TENANT' USING ERRCODE = '23505';
        ELSE
            -- Already registered by this tenant
            IF v_existing_status = 'verified' THEN
                RAISE EXCEPTION 'DOMAIN_ALREADY_VERIFIED' USING ERRCODE = 'P0005';
            END IF;
            -- If pending or failed, regenerate challenge and return
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

    -- 4. Generate challenge & token
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

-- 4. VERIFY CUSTOM DOMAIN RPC (DETERMINISTIC TEST PROVIDER / SIMULATED VERIFIER)
-- Strict Rule: NO real network request, NO real DNS mutation, NO live cloud API call.
-- Provider-neutral test verification accepts deterministic mock token matching or simulation flags.
CREATE OR REPLACE FUNCTION public.verify_custom_domain(
    p_tenant_id UUID,
    p_domain_id UUID,
    p_simulated_txt_value TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_domain RECORD;
    v_is_valid BOOLEAN := false;
BEGIN
    -- Authorization check
    v_caller_role := auth.jwt() ->> 'role';
    IF v_caller_role IS NULL OR (v_caller_role <> 'authenticated' AND v_caller_role <> 'service_role') THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;

    IF v_caller_role = 'authenticated' THEN
        IF public.current_tenant_id() IS NOT NULL AND public.current_tenant_id() <> p_tenant_id THEN
            RAISE EXCEPTION 'TENANT_MISMATCH' USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT *
    INTO v_domain
    FROM public.custom_domains
    WHERE id = p_domain_id AND tenant_id = p_tenant_id;

    IF v_domain.id IS NULL THEN
        RAISE EXCEPTION 'DOMAIN_NOT_FOUND' USING ERRCODE = 'P0006';
    END IF;

    IF v_domain.status = 'verified' THEN
        RETURN jsonb_build_object(
            'success', true,
            'domain_id', v_domain.id,
            'status', 'verified',
            'normalized_hostname', v_domain.normalized_hostname,
            'verified_at', v_domain.verified_at,
            'provider_status', v_domain.provider_status,
            'message', 'Domain already verified'
        );
    END IF;

    -- Deterministic test verification check:
    -- In provider-neutral testing mode:
    -- If p_simulated_txt_value matches verification_expected_value, or if explicit test simulation flag is passed.
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
            'message', 'Domain ownership successfully verified via deterministic test challenge'
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
            'error_code', 'DNS_RECORD_MISMATCH',
            'error_message', 'Simulated DNS TXT record did not match expected verification challenge value'
        );
    END IF;
END;
$$;

-- 5. RECHECK / RENEW CUSTOM DOMAIN STATUS RPC
CREATE OR REPLACE FUNCTION public.recheck_custom_domain(
    p_tenant_id UUID,
    p_domain_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_domain RECORD;
BEGIN
    v_caller_role := auth.jwt() ->> 'role';
    IF v_caller_role IS NULL OR (v_caller_role <> 'authenticated' AND v_caller_role <> 'service_role') THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;

    IF v_caller_role = 'authenticated' THEN
        IF public.current_tenant_id() IS NOT NULL AND public.current_tenant_id() <> p_tenant_id THEN
            RAISE EXCEPTION 'TENANT_MISMATCH' USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT *
    INTO v_domain
    FROM public.custom_domains
    WHERE id = p_domain_id AND tenant_id = p_tenant_id;

    IF v_domain.id IS NULL THEN
        RAISE EXCEPTION 'DOMAIN_NOT_FOUND' USING ERRCODE = 'P0006';
    END IF;

    -- Return full lifecycle status
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

-- 6. REMOVE / REVOKE CUSTOM DOMAIN RPC
CREATE OR REPLACE FUNCTION public.remove_custom_domain(
    p_tenant_id UUID,
    p_domain_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_deleted RECORD;
BEGIN
    v_caller_role := auth.jwt() ->> 'role';
    IF v_caller_role IS NULL OR (v_caller_role <> 'authenticated' AND v_caller_role <> 'service_role') THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;

    IF v_caller_role = 'authenticated' THEN
        IF public.current_tenant_id() IS NOT NULL AND public.current_tenant_id() <> p_tenant_id THEN
            RAISE EXCEPTION 'TENANT_MISMATCH' USING ERRCODE = '42501';
        END IF;
    END IF;

    DELETE FROM public.custom_domains
    WHERE id = p_domain_id AND tenant_id = p_tenant_id
    RETURNING id, normalized_hostname INTO v_deleted;

    IF v_deleted.id IS NULL THEN
        RAISE EXCEPTION 'DOMAIN_NOT_FOUND' USING ERRCODE = 'P0006';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'domain_id', v_deleted.id,
        'normalized_hostname', v_deleted.normalized_hostname,
        'status', 'removed'
    );
END;
$$;

-- 7. RESOLVE TENANT BY CUSTOM DOMAIN RPC
CREATE OR REPLACE FUNCTION public.resolve_tenant_by_custom_domain(
    p_hostname TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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
      AND cd.status = 'verified';

    IF v_record.id IS NULL THEN
        RETURN jsonb_build_object(
            'resolved', false,
            'normalized_hostname', v_norm,
            'message', 'Domain not found or not verified'
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

-- Grant permissions
REVOKE ALL ON TABLE public.custom_domains FROM anon, public;
GRANT SELECT ON TABLE public.custom_domains TO authenticated;

GRANT EXECUTE ON FUNCTION public.normalize_custom_hostname(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_custom_domain(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_custom_domain(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recheck_custom_domain(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_custom_domain(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_by_custom_domain(TEXT) TO anon, authenticated, service_role;
