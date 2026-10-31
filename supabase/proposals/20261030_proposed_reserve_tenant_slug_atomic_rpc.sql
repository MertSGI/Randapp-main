-- =============================================================================
-- PROPOSAL ONLY — DO NOT DEPLOY OR EXECUTE WITHOUT EXPLICIT OWNER APPROVAL
-- =============================================================================
-- Proposed Migration: 20261030_proposed_reserve_tenant_slug_atomic_rpc.sql
-- Target: LARI Supabase / PostgreSQL 17.6 (`public.tenants`)
--
-- Root Cause Addressed:
-- 1. `20260714_tenants_update_rls_hardening.sql` dropped the direct
--    `"Tenant Owner UPDATE own tenant"` policy on `public.tenants` so a
--    `tenant_owner` cannot self-mutate `plan_id`, `status`, or billing fields.
--    Consequently, direct PostgREST `UPDATE public.tenants SET slug = ...` by
--    an authenticated `tenant_owner` affects 0 rows (or fails under RLS).
-- 2. Client-side `slugReservationQueue` in `siteProvisioningService.ts` is an
--    in-memory single-tab Promise queue, NOT a distributed database lock across
--    multiple browser clients/sessions.
--
-- Solution:
-- Least-privilege `SECURITY DEFINER` RPC `public.reserve_tenant_slug` with
-- pinned `search_path = public, pg_temp` that:
--   a) Authenticates caller (`auth.uid()`) and verifies active `tenant_owner`
--      membership in `public.users_profile` for `p_tenant_id` (or active
--      `super_admin`).
--   b) Enforces canonical slug format (`^[a-z0-9]+(-[a-z0-9]+)*$`, length 3..50)
--      and rejects all reserved platform/route identifiers without fallback.
--   c) Acquires a row-level lock (`SELECT ... FOR UPDATE`) on the caller's
--      `public.tenants` row.
--   d) Attempts `UPDATE public.tenants SET slug = v_candidate, updated_at = now()
--      WHERE id = p_tenant_id` (mutating ONLY `slug` and `updated_at`), and ONLY
--      when `unique_violation` (SQLSTATE `23505` on `tenants_slug_key`) occurs,
--      iterates deterministically through the 4 approved suffixes
--      (`-studio`, `-guzellik`, `-salon`, `-tr`) that remain <= 50 chars.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_tenant_slug(
  p_tenant_id uuid,
  p_desired_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_is_authorized boolean := false;
  v_current_slug text;
  v_normalized text;
  v_candidate text;
  v_suffix text;
  v_constraint_name text := '';
  v_suffixes constant text[] := ARRAY['studio', 'guzellik', 'salon', 'tr'];
  v_reserved constant text[] := ARRAY[
    'admin', 'super-admin', 'login', 'register', 'api', 'dashboard',
    'settings', 'profile', 'public', 'assets', 'static', 'auth', 'user',
    'users', 'book', 'booking', 'appointment', 'appointments', 'checkout',
    'payment', 'payments', 'billing', 'pricing', 'features', 'support',
    'help', 'contact', 'privacy', 'terms', 'pilot', 'demo', 'customer',
    'customers', 'mobile-app', 'lari', 'randevulari', 'randapp', 'radapp',
    'onboarding', 'webhook', 'webhooks', 'status', 'health', 'graphql',
    'rest', 'v1', 'v2', 'app', 'www', 'mail', 'smtp', 'imap', 'pop', 'ftp',
    'cdn', 'media', 'files', 'uploads', 'downloads', 'blog', 'news', 'press',
    'careers', 'about', 'team', 'legal', 'security', 'trust', 'docs',
    'documentation', 'developers', 'partner', 'partners', 'affiliate',
    'affiliates', 'reseller', 'resellers', 'enterprise', 'business',
    'salon', 'studio', 'spa', 'clinic', 'beauty', 'wellness', 'barber',
    'test', 'testing', 'staging', 'dev', 'development', 'prod', 'production',
    'internal', 'system', 'root', 'null', 'undefined', 'true', 'false'
  ];
BEGIN
  -- 1. Require authenticated caller
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object(
      'reserved', false,
      'slug', '',
      'reason', 'UNAUTHENTICATED',
      'collision_resolved', false
    );
  END IF;

  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'reserved', false,
      'slug', '',
      'reason', 'EMPTY_OR_SHORT',
      'collision_resolved', false
    );
  END IF;

  -- 2. Least-privilege caller authorization: must be active tenant_owner of p_tenant_id or active super_admin
  SELECT EXISTS (
    SELECT 1
    FROM public.users_profile up
    WHERE up.id = v_caller_id
      AND up.active = true
      AND (
        (up.tenant_id = p_tenant_id AND up.role IN ('tenant_owner', 'super_admin'))
        OR (public.is_super_admin(v_caller_id) AND up.role = 'super_admin')
      )
  )
  INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'reserved', false,
      'slug', '',
      'reason', 'FORBIDDEN_NOT_TENANT_OWNER',
      'collision_resolved', false
    );
  END IF;

  -- 3. Normalize and validate desired slug without fallback on format/reserved errors
  v_normalized := lower(btrim(COALESCE(p_desired_slug, '')));

  IF char_length(v_normalized) < 3 THEN
    RETURN jsonb_build_object(
      'reserved', false,
      'slug', v_normalized,
      'reason', 'EMPTY_OR_SHORT',
      'collision_resolved', false
    );
  END IF;

  IF char_length(v_normalized) > 50 THEN
    RETURN jsonb_build_object(
      'reserved', false,
      'slug', v_normalized,
      'reason', 'TOO_LONG',
      'collision_resolved', false
    );
  END IF;

  IF v_normalized !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RETURN jsonb_build_object(
      'reserved', false,
      'slug', v_normalized,
      'reason', 'INVALID_FORMAT',
      'collision_resolved', false
    );
  END IF;

  IF v_normalized = ANY(v_reserved) THEN
    RETURN jsonb_build_object(
      'reserved', false,
      'slug', v_normalized,
      'reason', 'RESERVED',
      'collision_resolved', false
    );
  END IF;

  -- 4. Lock target tenant row and check idempotent same-owner reservation
  SELECT t.slug
  INTO v_current_slug
  FROM public.tenants t
  WHERE t.id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'reserved', false,
      'slug', v_normalized,
      'reason', 'TENANT_NOT_FOUND',
      'collision_resolved', false
    );
  END IF;

  IF v_current_slug = v_normalized THEN
    RETURN jsonb_build_object(
      'reserved', true,
      'slug', v_normalized,
      'reason', 'VALID',
      'collision_resolved', false
    );
  END IF;

  -- 5. Attempt atomic primary slug reservation (updates ONLY slug and updated_at)
  BEGIN
    UPDATE public.tenants
    SET slug = v_normalized,
        updated_at = now()
    WHERE id = p_tenant_id;

    RETURN jsonb_build_object(
      'reserved', true,
      'slug', v_normalized,
      'reason', 'VALID',
      'collision_resolved', false
    );
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name IS NULL OR v_constraint_name NOT IN ('tenants_slug_key', 'tenants_slug_unique') THEN
        RAISE;
      END IF;
      -- Collision on public.tenants(slug) unique constraint: proceed to deterministic suffix fallback
      NULL;
  END;

  -- 6. Collision-only deterministic suffix fallback (-studio, -guzellik, -salon, -tr)
  FOREACH v_suffix IN ARRAY v_suffixes LOOP
    v_candidate := v_normalized || '-' || v_suffix;

    IF char_length(v_candidate) <= 50
       AND v_candidate ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       AND NOT (v_candidate = ANY(v_reserved))
    THEN
      BEGIN
        UPDATE public.tenants
        SET slug = v_candidate,
            updated_at = now()
        WHERE id = p_tenant_id;

        RETURN jsonb_build_object(
          'reserved', true,
          'slug', v_candidate,
          'reason', 'VALID',
          'collision_resolved', true
        );
      EXCEPTION
        WHEN unique_violation THEN
          GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
          IF v_constraint_name IS NOT NULL AND v_constraint_name != '' AND v_constraint_name NOT IN ('tenants_slug_key', 'tenants_slug_unique') THEN
            RAISE;
          END IF;
          CONTINUE;
      END;
    END IF;
  END LOOP;

  -- 7. Base slug and all valid deterministic alternatives are occupied
  RETURN jsonb_build_object(
    'reserved', false,
    'slug', v_normalized,
    'reason', 'SLUG_TAKEN',
    'collision_resolved', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_tenant_slug(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_tenant_slug(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_tenant_slug(uuid, text) TO authenticated;

COMMIT;
