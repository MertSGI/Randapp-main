-- =========================================================================
-- MIGRATION 20260904_authenticated_owner_branch_mutations_rpc.sql
-- Description: Server-authoritative owner branch mutation RPC contracts for Package / Customer Customization Slice 1-R1
-- Functions:
--   1. public.create_tenant_branch(p_tenant_id uuid, p_name text, p_slug text DEFAULT NULL, p_timezone text DEFAULT 'Europe/Istanbul') -> jsonb
--   2. public.update_tenant_branch(p_branch_id uuid, p_name text DEFAULT NULL, p_slug text DEFAULT NULL, p_timezone text DEFAULT NULL) -> jsonb
--   3. public.set_primary_tenant_branch(p_branch_id uuid) -> jsonb
--   4. public.deactivate_tenant_branch(p_branch_id uuid) -> jsonb
-- =========================================================================

-- Helper function to generate slug from branch name deterministically (IMMUTABLE)
CREATE OR REPLACE FUNCTION public.generate_branch_slug(
    p_name text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean text;
BEGIN
    IF p_name IS NULL OR trim(p_name) = '' THEN
        RETURN 'sube';
    END IF;

    -- Replace Turkish non-ASCII characters & sanitize
    v_clean := lower(trim(p_name));
    v_clean := translate(v_clean, 'çğıöşüÇĞİÖŞÜ', 'cgiosuCGIOSU');
    v_clean := regexp_replace(v_clean, '[^a-z0-9]+', '-', 'g');
    v_clean := trim(both '-' from v_clean);

    IF v_clean = '' THEN
        v_clean := 'sube';
    END IF;

    RETURN v_clean;
END;
$$;

-- 1. CREATE_TENANT_BRANCH RPC
CREATE OR REPLACE FUNCTION public.create_tenant_branch(
    p_tenant_id uuid,
    p_name      text,
    p_slug      text DEFAULT NULL,
    p_timezone  text DEFAULT 'Europe/Istanbul'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id       uuid := auth.uid();
    v_profile       record;
    v_name          text;
    v_base_slug     text;
    v_final_slug    text;
    v_slug_suffix   integer := 0;
    v_active_count  integer;
    v_is_primary    boolean;
    v_new_branch    record;
BEGIN
    -- Gate 1: Authentication
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthenticated');
    END IF;

    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_tenant');
    END IF;

    -- Acquire tenant-scoped transaction lock to serialize concurrent mutations for this tenant
    PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text));

    -- Gate 2: Authorization check using canonical Super Admin predicate & tenant owner check
    SELECT id, tenant_id, role, active
    INTO v_profile
    FROM public.users_profile
    WHERE id = v_user_id;

    IF NOT FOUND OR v_profile.active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    IF (v_profile.role = 'tenant_owner' AND v_profile.tenant_id = p_tenant_id) OR
       public.is_super_admin(v_user_id) THEN
        -- Allowed
    ELSE
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    -- Gate 3: Input validation
    v_name := trim(p_name);
    IF v_name IS NULL OR v_name = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_name');
    END IF;

    -- Deterministic slug generation / normalization
    IF p_slug IS NOT NULL AND trim(p_slug) <> '' THEN
        v_base_slug := public.generate_branch_slug(p_slug);
    ELSE
        v_base_slug := public.generate_branch_slug(v_name);
    END IF;

    v_final_slug := v_base_slug;
    WHILE EXISTS (SELECT 1 FROM public.branches WHERE tenant_id = p_tenant_id AND slug = v_final_slug) LOOP
        v_slug_suffix := v_slug_suffix + 1;
        v_final_slug := v_base_slug || '-' || v_slug_suffix;
    END LOOP;

    -- Primary branch invariant: First active branch automatically becomes primary
    SELECT count(*) INTO v_active_count
    FROM public.branches
    WHERE tenant_id = p_tenant_id AND is_active = true;

    IF v_active_count = 0 THEN
        v_is_primary := true;
    ELSE
        v_is_primary := false;
    END IF;

    INSERT INTO public.branches (
        tenant_id,
        name,
        slug,
        is_active,
        is_primary,
        timezone
    ) VALUES (
        p_tenant_id,
        v_name,
        v_final_slug,
        true,
        v_is_primary,
        coalesce(trim(p_timezone), 'Europe/Istanbul')
    )
    RETURNING * INTO v_new_branch;

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'branch', jsonb_build_object(
            'id', v_new_branch.id,
            'tenant_id', v_new_branch.tenant_id,
            'name', v_new_branch.name,
            'slug', v_new_branch.slug,
            'is_active', v_new_branch.is_active,
            'is_primary', v_new_branch.is_primary,
            'timezone', v_new_branch.timezone,
            'created_at', v_new_branch.created_at,
            'updated_at', v_new_branch.updated_at
        )
    );
END;
$$;

-- 2. UPDATE_TENANT_BRANCH RPC
CREATE OR REPLACE FUNCTION public.update_tenant_branch(
    p_branch_id uuid,
    p_name      text DEFAULT NULL,
    p_slug      text DEFAULT NULL,
    p_timezone  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id     uuid := auth.uid();
    v_profile     record;
    v_branch      record;
    v_new_name    text;
    v_new_slug    text;
    v_new_tz      text;
    v_updated     record;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthenticated');
    END IF;

    IF p_branch_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'branch_not_found');
    END IF;

    SELECT * INTO v_branch
    FROM public.branches
    WHERE id = p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'branch_not_found');
    END IF;

    -- Acquire tenant-scoped transaction lock
    PERFORM pg_advisory_xact_lock(hashtext(v_branch.tenant_id::text));

    SELECT id, tenant_id, role, active
    INTO v_profile
    FROM public.users_profile
    WHERE id = v_user_id;

    IF NOT FOUND OR v_profile.active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    IF (v_profile.role = 'tenant_owner' AND v_profile.tenant_id = v_branch.tenant_id) OR
       public.is_super_admin(v_user_id) THEN
        -- Allowed
    ELSE
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    v_new_name := v_branch.name;
    IF p_name IS NOT NULL AND trim(p_name) <> '' THEN
        v_new_name := trim(p_name);
    END IF;

    v_new_slug := v_branch.slug;
    IF p_slug IS NOT NULL AND trim(p_slug) <> '' THEN
        v_new_slug := public.generate_branch_slug(p_slug);
        IF EXISTS (SELECT 1 FROM public.branches WHERE tenant_id = v_branch.tenant_id AND slug = v_new_slug AND id <> p_branch_id) THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'slug_already_exists');
        END IF;
    END IF;

    v_new_tz := v_branch.timezone;
    IF p_timezone IS NOT NULL AND trim(p_timezone) <> '' THEN
        v_new_tz := trim(p_timezone);
    END IF;

    UPDATE public.branches
    SET name = v_new_name,
        slug = v_new_slug,
        timezone = v_new_tz,
        updated_at = now()
    WHERE id = p_branch_id
    RETURNING * INTO v_updated;

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'branch', jsonb_build_object(
            'id', v_updated.id,
            'tenant_id', v_updated.tenant_id,
            'name', v_updated.name,
            'slug', v_updated.slug,
            'is_active', v_updated.is_active,
            'is_primary', v_updated.is_primary,
            'timezone', v_updated.timezone,
            'created_at', v_updated.created_at,
            'updated_at', v_updated.updated_at
        )
    );
END;
$$;

-- 3. SET_PRIMARY_TENANT_BRANCH RPC
CREATE OR REPLACE FUNCTION public.set_primary_tenant_branch(
    p_branch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id     uuid := auth.uid();
    v_profile     record;
    v_branch      record;
    v_updated     record;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthenticated');
    END IF;

    IF p_branch_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'branch_not_found');
    END IF;

    SELECT * INTO v_branch
    FROM public.branches
    WHERE id = p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'branch_not_found');
    END IF;

    -- Acquire tenant-scoped transaction lock
    PERFORM pg_advisory_xact_lock(hashtext(v_branch.tenant_id::text));

    SELECT id, tenant_id, role, active
    INTO v_profile
    FROM public.users_profile
    WHERE id = v_user_id;

    IF NOT FOUND OR v_profile.active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    IF (v_profile.role = 'tenant_owner' AND v_profile.tenant_id = v_branch.tenant_id) OR
       public.is_super_admin(v_user_id) THEN
        -- Allowed
    ELSE
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    IF v_branch.is_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'branch_inactive');
    END IF;

    -- Transactionally swap primary flag for active branches of this tenant
    UPDATE public.branches
    SET is_primary = false,
        updated_at = now()
    WHERE tenant_id = v_branch.tenant_id AND is_primary = true;

    UPDATE public.branches
    SET is_primary = true,
        updated_at = now()
    WHERE id = p_branch_id
    RETURNING * INTO v_updated;

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'branch', jsonb_build_object(
            'id', v_updated.id,
            'tenant_id', v_updated.tenant_id,
            'name', v_updated.name,
            'slug', v_updated.slug,
            'is_active', v_updated.is_active,
            'is_primary', v_updated.is_primary,
            'timezone', v_updated.timezone,
            'created_at', v_updated.created_at,
            'updated_at', v_updated.updated_at
        )
    );
END;
$$;

-- 4. DEACTIVATE_TENANT_BRANCH RPC
CREATE OR REPLACE FUNCTION public.deactivate_tenant_branch(
    p_branch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id           uuid := auth.uid();
    v_profile           record;
    v_branch            record;
    v_other_active_cnt  integer;
    v_updated           record;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthenticated');
    END IF;

    IF p_branch_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'branch_not_found');
    END IF;

    SELECT * INTO v_branch
    FROM public.branches
    WHERE id = p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'branch_not_found');
    END IF;

    -- Acquire tenant-scoped transaction lock
    PERFORM pg_advisory_xact_lock(hashtext(v_branch.tenant_id::text));

    SELECT id, tenant_id, role, active
    INTO v_profile
    FROM public.users_profile
    WHERE id = v_user_id;

    IF NOT FOUND OR v_profile.active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    IF (v_profile.role = 'tenant_owner' AND v_profile.tenant_id = v_branch.tenant_id) OR
       public.is_super_admin(v_user_id) THEN
        -- Allowed
    ELSE
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    -- Idempotent check if already inactive
    IF v_branch.is_active IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'already_inactive',
            'branch', jsonb_build_object(
                'id', v_branch.id,
                'tenant_id', v_branch.tenant_id,
                'name', v_branch.name,
                'slug', v_branch.slug,
                'is_active', v_branch.is_active,
                'is_primary', v_branch.is_primary,
                'timezone', v_branch.timezone,
                'created_at', v_branch.created_at,
                'updated_at', v_branch.updated_at
            )
        );
    END IF;

    SELECT count(*) INTO v_other_active_cnt
    FROM public.branches
    WHERE tenant_id = v_branch.tenant_id AND is_active = true AND id <> p_branch_id;

    IF v_branch.is_primary IS TRUE THEN
        IF v_other_active_cnt > 0 THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'cannot_deactivate_primary_with_active_branches');
        ELSE
            RETURN jsonb_build_object('success', false, 'reason_code', 'cannot_deactivate_sole_active_branch');
        END IF;
    END IF;

    UPDATE public.branches
    SET is_active = false,
        is_primary = false,
        updated_at = now()
    WHERE id = p_branch_id
    RETURNING * INTO v_updated;

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'branch', jsonb_build_object(
            'id', v_updated.id,
            'tenant_id', v_updated.tenant_id,
            'name', v_updated.name,
            'slug', v_updated.slug,
            'is_active', v_updated.is_active,
            'is_primary', v_updated.is_primary,
            'timezone', v_updated.timezone,
            'created_at', v_updated.created_at,
            'updated_at', v_updated.updated_at
        )
    );
END;
$$;

-- REVOKE EXECUTE FROM PUBLIC / anon
REVOKE ALL ON FUNCTION public.create_tenant_branch(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_tenant_branch(uuid, text, text, text) FROM anon;

REVOKE ALL ON FUNCTION public.update_tenant_branch(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_tenant_branch(uuid, text, text, text) FROM anon;

REVOKE ALL ON FUNCTION public.set_primary_tenant_branch(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_primary_tenant_branch(uuid) FROM anon;

REVOKE ALL ON FUNCTION public.deactivate_tenant_branch(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_tenant_branch(uuid) FROM anon;

-- GRANT EXECUTE TO authenticated only (Least privilege: service_role grant removed)
GRANT EXECUTE ON FUNCTION public.create_tenant_branch(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_tenant_branch(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_primary_tenant_branch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_tenant_branch(uuid) TO authenticated;
