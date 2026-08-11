-- =========================================================================
-- MIGRATION 20260830_p1c_public_branch_read_contract.sql
-- Description: Server-authoritative public branch read RPC get_public_branches
-- Solves PUBLIC_BRANCH_READ_CONTRACT_DRIFT by exposing active branch metadata
-- for public storefronts without opening direct anon table access on public.branches.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_public_branches(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_id uuid;
  v_status text;
  v_public_status text;
  v_branches jsonb;
BEGIN
  IF p_slug IS NULL OR trim(p_slug) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason_code', 'invalid_slug',
      'branches', '[]'::jsonb
    );
  END IF;

  SELECT id, status, public_site_status
  INTO v_tenant_id, v_status, v_public_status
  FROM public.tenants
  WHERE slug = trim(p_slug);

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason_code', 'tenant_not_found',
      'branches', '[]'::jsonb
    );
  END IF;

  IF v_status NOT IN ('active', 'manual_active') OR v_public_status != 'published' THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason_code', 'tenant_not_eligible',
      'branches', '[]'::jsonb
    );
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'slug', b.slug,
        'is_primary', b.is_primary,
        'timezone', coalesce(b.timezone, 'Europe/Istanbul')
      )
      ORDER BY b.is_primary DESC, b.created_at ASC
    ),
    '[]'::jsonb
  ) INTO v_branches
  FROM public.branches b
  WHERE b.tenant_id = v_tenant_id
    AND b.is_active = true;

  RETURN jsonb_build_object(
    'success', true,
    'reason_code', 'ok',
    'branches', v_branches
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'reason_code', 'internal_error',
    'branches', '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_branches(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_branches(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_branches(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_branches(text) TO service_role;
