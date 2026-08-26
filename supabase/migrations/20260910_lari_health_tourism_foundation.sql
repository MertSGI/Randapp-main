-- =========================================================================
-- MIGRATION 20260910_lari_health_tourism_foundation.sql
-- Description: Foundational Health Tourism Domain & Server Authority for LARİ (Slice 1)
-- Target: Disposable PostgreSQL database / Supabase
-- =========================================================================

-- 1. HT REFERRING AGENCIES TABLE (TENANT SCOPED)
CREATE TABLE IF NOT EXISTS public.ht_referring_agencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NULL,
    contact_email TEXT NULL,
    contact_phone TEXT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ht_referring_agencies_tenant_id_id UNIQUE (id, tenant_id),
    CONSTRAINT uq_ht_referring_agencies_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_ht_referring_agencies_tenant_id ON public.ht_referring_agencies(tenant_id);

CREATE TRIGGER update_ht_referring_agencies_modtime
BEFORE UPDATE ON public.ht_referring_agencies
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.ht_referring_agencies ENABLE ROW LEVEL SECURITY;


-- 2. HT STAFF PROFILES TABLE (TENANT SCOPED STAFF CAPABILITIES)
CREATE TABLE IF NOT EXISTS public.ht_staff_profiles (
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    staff_id UUID PRIMARY KEY REFERENCES public.staff(id) ON DELETE CASCADE,
    can_manage_ht_leads BOOLEAN NOT NULL DEFAULT false,
    can_view_ht_leads BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ht_staff_profiles_staff_tenant UNIQUE (staff_id, tenant_id),
    CONSTRAINT chk_ht_staff_lead_manage_dependency CHECK (
        can_manage_ht_leads = false OR can_view_ht_leads = true
    )
);

CREATE INDEX IF NOT EXISTS idx_ht_staff_profiles_tenant_id ON public.ht_staff_profiles(tenant_id);

-- Enforce composite tenant alignment with public.staff (id, tenant_id)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_staff_id_tenant'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'fk_ht_staff_profiles_staff_tenant'
        ) THEN
            ALTER TABLE public.ht_staff_profiles
            ADD CONSTRAINT fk_ht_staff_profiles_staff_tenant
            FOREIGN KEY (staff_id, tenant_id)
            REFERENCES public.staff(id, tenant_id)
            ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

CREATE TRIGGER update_ht_staff_profiles_modtime
BEFORE UPDATE ON public.ht_staff_profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.ht_staff_profiles ENABLE ROW LEVEL SECURITY;


-- 3. HT LEADS TABLE (TENANT SCOPED LEAD DOMAIN FOUNDATION)
CREATE TABLE IF NOT EXISTS public.ht_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'new',
    source_channel TEXT NOT NULL DEFAULT 'web',
    referring_agency_id UUID NULL,
    preferred_language TEXT NOT NULL DEFAULT 'en',
    country_code TEXT NULL,
    passport_number TEXT NULL,
    full_name TEXT NOT NULL,
    email TEXT NULL,
    phone TEXT NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_ht_leads_status CHECK (
        status IN ('new', 'contacted', 'qualified', 'handoff_pending', 'converted', 'closed')
    ),
    CONSTRAINT chk_ht_leads_source_channel CHECK (
        source_channel IN ('web', 'whatsapp', 'agency_referral', 'organic', 'paid_search', 'social', 'direct', 'other')
    ),
    CONSTRAINT chk_ht_leads_contact CHECK (
        (email IS NOT NULL AND trim(email) <> '') OR (phone IS NOT NULL AND trim(phone) <> '')
    ),
    CONSTRAINT fk_ht_leads_referring_agency_tenant FOREIGN KEY (referring_agency_id, tenant_id)
        REFERENCES public.ht_referring_agencies(id, tenant_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ht_leads_tenant_status ON public.ht_leads(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ht_leads_referring_agency ON public.ht_leads(referring_agency_id);

CREATE TRIGGER update_ht_leads_modtime
BEFORE UPDATE ON public.ht_leads
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.ht_leads ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 4. RLS POLICIES FOR DIRECT DML HARDENING
-- =========================================================================

-- ht_referring_agencies RLS
DROP POLICY IF EXISTS "Authorized HT staff can read referring agencies" ON public.ht_referring_agencies;

CREATE POLICY "Authorized HT staff can read referring agencies"
ON public.ht_referring_agencies
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.ht_staff_profiles hsp ON hsp.staff_id = s.id
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = ht_referring_agencies.tenant_id
          AND s.active = true
          AND (hsp.can_view_ht_leads = true OR hsp.can_manage_ht_leads = true)
    )
);

-- ht_staff_profiles RLS
DROP POLICY IF EXISTS "Authorized tenant staff can read ht staff profiles" ON public.ht_staff_profiles;

CREATE POLICY "Authorized tenant staff can read ht staff profiles"
ON public.ht_staff_profiles
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = ht_staff_profiles.tenant_id
          AND s.active = true
    )
);

-- ht_leads RLS
DROP POLICY IF EXISTS "Authorized HT staff can read leads" ON public.ht_leads;

CREATE POLICY "Authorized HT staff can read leads"
ON public.ht_leads
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.ht_staff_profiles hsp ON hsp.staff_id = s.id
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = ht_leads.tenant_id
          AND s.active = true
          AND (hsp.can_view_ht_leads = true OR hsp.can_manage_ht_leads = true)
    )
);


-- =========================================================================
-- 5. SERVER-AUTHORITATIVE RPC CONTRACTS
-- =========================================================================

-- A. ht_set_staff_profile
CREATE OR REPLACE FUNCTION public.ht_set_staff_profile(
    p_staff_id UUID,
    p_can_manage_ht_leads BOOLEAN DEFAULT false,
    p_can_view_ht_leads BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_caller_up RECORD;
    v_target_staff RECORD;
    v_can_view BOOLEAN := p_can_view_ht_leads;
    v_res RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT * INTO v_target_staff
    FROM public.staff
    WHERE id = p_staff_id;

    IF v_target_staff.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Staff member not found.';
    END IF;

    IF v_target_staff.active IS NOT TRUE THEN
        RAISE EXCEPTION 'INVALID_STATE: Target staff member is inactive.';
    END IF;

    SELECT * INTO v_caller_up
    FROM public.users_profile
    WHERE id = v_caller_uid
      AND tenant_id = v_target_staff.tenant_id
      AND role = 'tenant_owner'
      AND active = true;

    IF v_caller_up.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Only active tenant owner of exact tenant can configure HT staff profile.';
    END IF;

    IF p_can_manage_ht_leads = true THEN
        v_can_view := true;
    END IF;

    INSERT INTO public.ht_staff_profiles (
        tenant_id,
        staff_id,
        can_manage_ht_leads,
        can_view_ht_leads,
        updated_at
    ) VALUES (
        v_target_staff.tenant_id,
        p_staff_id,
        p_can_manage_ht_leads,
        v_can_view,
        now()
    )
    ON CONFLICT (staff_id) DO UPDATE SET
        can_manage_ht_leads = EXCLUDED.can_manage_ht_leads,
        can_view_ht_leads = EXCLUDED.can_view_ht_leads,
        updated_at = now()
    RETURNING * INTO v_res;

    RETURN jsonb_build_object(
        'success', true,
        'staff_id', v_res.staff_id,
        'tenant_id', v_res.tenant_id,
        'can_manage_ht_leads', v_res.can_manage_ht_leads,
        'can_view_ht_leads', v_res.can_view_ht_leads
    );
END;
$$;


-- B. ht_create_referring_agency
CREATE OR REPLACE FUNCTION public.ht_create_referring_agency(
    p_name TEXT,
    p_code TEXT DEFAULT NULL,
    p_contact_email TEXT DEFAULT NULL,
    p_contact_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_hsp RECORD;
    v_agency RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    SELECT * INTO v_hsp
    FROM public.ht_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_hsp.staff_id IS NULL OR v_hsp.can_manage_ht_leads = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks can_manage_ht_leads permission.';
    END IF;

    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: Agency name is required.';
    END IF;

    INSERT INTO public.ht_referring_agencies (
        tenant_id,
        name,
        code,
        contact_email,
        contact_phone,
        active,
        updated_at
    ) VALUES (
        v_staff.tenant_id,
        trim(p_name),
        nullif(trim(p_code), ''),
        nullif(trim(p_contact_email), ''),
        nullif(trim(p_contact_phone), ''),
        true,
        now()
    )
    RETURNING * INTO v_agency;

    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        v_staff.tenant_id::text,
        v_caller_uid::text,
        'staff',
        'ht_agency_created',
        'ht_referring_agencies',
        v_agency.id::text,
        jsonb_build_object(
            'agency_id', v_agency.id,
            'name', v_agency.name,
            'code', v_agency.code
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'agency_id', v_agency.id,
        'tenant_id', v_agency.tenant_id,
        'name', v_agency.name,
        'code', v_agency.code,
        'active', v_agency.active
    );
END;
$$;


-- C. ht_create_public_lead (PUBLIC INTAKE RPC)
CREATE OR REPLACE FUNCTION public.ht_create_public_lead(
    p_slug TEXT,
    p_full_name TEXT,
    p_email TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_preferred_language TEXT DEFAULT 'en',
    p_country_code TEXT DEFAULT NULL,
    p_passport_number TEXT DEFAULT NULL,
    p_source_channel TEXT DEFAULT 'web',
    p_referring_agency_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_tenant RECORD;
    v_agency RECORD;
    v_lang TEXT := coalesce(nullif(lower(trim(p_preferred_language)), ''), 'en');
    v_country TEXT := nullif(upper(trim(p_country_code)), '');
    v_channel TEXT := coalesce(nullif(lower(trim(p_source_channel)), ''), 'web');
    v_lead RECORD;
BEGIN
    IF p_slug IS NULL OR trim(p_slug) = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: Tenant slug is required.';
    END IF;

    SELECT id, status INTO v_tenant
    FROM public.tenants
    WHERE slug = trim(p_slug);

    IF v_tenant.id IS NULL OR v_tenant.status <> 'active' THEN
        RAISE EXCEPTION 'NOT_FOUND: Active tenant not found for slug.';
    END IF;

    IF p_full_name IS NULL OR trim(p_full_name) = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: Full name is required.';
    END IF;

    IF (p_email IS NULL OR trim(p_email) = '') AND (p_phone IS NULL OR trim(p_phone) = '') THEN
        RAISE EXCEPTION 'INVALID_INPUT: Either email or phone is required.';
    END IF;

    IF v_channel NOT IN ('web', 'whatsapp', 'agency_referral', 'organic', 'paid_search', 'social', 'direct', 'other') THEN
        RAISE EXCEPTION 'INVALID_INPUT: Invalid source_channel value.';
    END IF;

    IF p_referring_agency_id IS NOT NULL THEN
        SELECT id, tenant_id, active INTO v_agency
        FROM public.ht_referring_agencies
        WHERE id = p_referring_agency_id;

        IF v_agency.id IS NULL OR v_agency.tenant_id <> v_tenant.id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Referring agency does not belong to target tenant.';
        END IF;

        IF v_agency.active IS NOT TRUE THEN
            RAISE EXCEPTION 'INVALID_STATE: Referring agency is inactive.';
        END IF;
    END IF;

    INSERT INTO public.ht_leads (
        tenant_id,
        status,
        source_channel,
        referring_agency_id,
        preferred_language,
        country_code,
        passport_number,
        full_name,
        email,
        phone,
        notes,
        created_at,
        updated_at
    ) VALUES (
        v_tenant.id,
        'new',
        v_channel,
        p_referring_agency_id,
        v_lang,
        v_country,
        nullif(trim(p_passport_number), ''),
        trim(p_full_name),
        nullif(trim(p_email), ''),
        nullif(trim(p_phone), ''),
        NULL,
        now(),
        now()
    )
    RETURNING * INTO v_lead;

    -- Write Audit Log: ABSOLUTELY EXCLUDE SENSITIVE PASSPORT_NUMBER FROM AUDIT PAYLOAD!
    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        v_tenant.id::text,
        'anon_public_intake',
        'public',
        'ht_lead_created',
        'ht_leads',
        v_lead.id::text,
        jsonb_build_object(
            'lead_id', v_lead.id,
            'source_channel', v_lead.source_channel,
            'referring_agency_id', v_lead.referring_agency_id,
            'preferred_language', v_lead.preferred_language,
            'country_code', v_lead.country_code
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'lead_id', v_lead.id,
        'tenant_id', v_lead.tenant_id,
        'status', v_lead.status,
        'created_at', v_lead.created_at
    );
END;
$$;


-- D. ht_update_lead_status
CREATE OR REPLACE FUNCTION public.ht_update_lead_status(
    p_lead_id UUID,
    p_status TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_hsp RECORD;
    v_lead RECORD;
    v_status TEXT := lower(trim(p_status));
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    SELECT * INTO v_hsp
    FROM public.ht_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_hsp.staff_id IS NULL OR v_hsp.can_manage_ht_leads = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks can_manage_ht_leads permission.';
    END IF;

    IF v_status NOT IN ('new', 'contacted', 'qualified', 'handoff_pending', 'converted', 'closed') THEN
        RAISE EXCEPTION 'INVALID_INPUT: Invalid lead status transition.';
    END IF;

    SELECT * INTO v_lead
    FROM public.ht_leads
    WHERE id = p_lead_id;

    IF v_lead.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Lead not found.';
    END IF;

    IF v_lead.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'FORBIDDEN: Cross-tenant lead mutation denied.';
    END IF;

    UPDATE public.ht_leads
    SET status = v_status,
        notes = coalesce(nullif(trim(p_notes), ''), notes),
        updated_at = now()
    WHERE id = p_lead_id
    RETURNING * INTO v_lead;

    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        v_staff.tenant_id::text,
        v_caller_uid::text,
        'staff',
        'ht_lead_status_updated',
        'ht_leads',
        p_lead_id::text,
        jsonb_build_object(
            'lead_id', p_lead_id,
            'previous_status', v_lead.status,
            'new_status', v_status
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'lead_id', v_lead.id,
        'status', v_lead.status,
        'updated_at', v_lead.updated_at
    );
END;
$$;


-- E. ht_update_lead_agency_attribution
CREATE OR REPLACE FUNCTION public.ht_update_lead_agency_attribution(
    p_lead_id UUID,
    p_referring_agency_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_hsp RECORD;
    v_lead RECORD;
    v_agency RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    SELECT * INTO v_hsp
    FROM public.ht_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_hsp.staff_id IS NULL OR v_hsp.can_manage_ht_leads = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks can_manage_ht_leads permission.';
    END IF;

    SELECT * INTO v_lead
    FROM public.ht_leads
    WHERE id = p_lead_id;

    IF v_lead.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Lead not found.';
    END IF;

    IF v_lead.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'FORBIDDEN: Cross-tenant lead mutation denied.';
    END IF;

    IF p_referring_agency_id IS NOT NULL THEN
        SELECT * INTO v_agency
        FROM public.ht_referring_agencies
        WHERE id = p_referring_agency_id;

        IF v_agency.id IS NULL OR v_agency.tenant_id <> v_staff.tenant_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Agency does not belong to staff tenant.';
        END IF;

        IF v_agency.active IS NOT TRUE THEN
            RAISE EXCEPTION 'INVALID_STATE: Agency is inactive.';
        END IF;
    END IF;

    UPDATE public.ht_leads
    SET referring_agency_id = p_referring_agency_id,
        updated_at = now()
    WHERE id = p_lead_id
    RETURNING * INTO v_lead;

    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        v_staff.tenant_id::text,
        v_caller_uid::text,
        'staff',
        'ht_lead_agency_attribution_updated',
        'ht_leads',
        p_lead_id::text,
        jsonb_build_object(
            'lead_id', p_lead_id,
            'referring_agency_id', p_referring_agency_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'lead_id', v_lead.id,
        'referring_agency_id', v_lead.referring_agency_id,
        'updated_at', v_lead.updated_at
    );
END;
$$;


-- F. ht_get_lead (STAFF READ)
CREATE OR REPLACE FUNCTION public.ht_get_lead(
    p_lead_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_hsp RECORD;
    v_lead RECORD;
    v_agency RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    SELECT * INTO v_hsp
    FROM public.ht_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_hsp.staff_id IS NULL OR (v_hsp.can_view_ht_leads = false AND v_hsp.can_manage_ht_leads = false) THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks HT lead view permission.';
    END IF;

    SELECT * INTO v_lead
    FROM public.ht_leads
    WHERE id = p_lead_id;

    IF v_lead.id IS NULL OR v_lead.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'NOT_FOUND: Lead not found or cross-tenant access denied.';
    END IF;

    IF v_lead.referring_agency_id IS NOT NULL THEN
        SELECT name, code INTO v_agency
        FROM public.ht_referring_agencies
        WHERE id = v_lead.referring_agency_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'lead', jsonb_build_object(
            'id', v_lead.id,
            'tenant_id', v_lead.tenant_id,
            'status', v_lead.status,
            'source_channel', v_lead.source_channel,
            'referring_agency_id', v_lead.referring_agency_id,
            'agency_name', v_agency.name,
            'agency_code', v_agency.code,
            'preferred_language', v_lead.preferred_language,
            'country_code', v_lead.country_code,
            'passport_number', v_lead.passport_number,
            'full_name', v_lead.full_name,
            'email', v_lead.email,
            'phone', v_lead.phone,
            'notes', v_lead.notes,
            'created_at', v_lead.created_at,
            'updated_at', v_lead.updated_at
        )
    );
END;
$$;


-- G. ht_list_leads (STAFF READ) - EXCLUDES PASSPORT_NUMBER IN BROAD PROJECTION
CREATE OR REPLACE FUNCTION public.ht_list_leads(
    p_status TEXT DEFAULT NULL,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_hsp RECORD;
    v_leads JSONB;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    SELECT * INTO v_hsp
    FROM public.ht_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_hsp.staff_id IS NULL OR (v_hsp.can_view_ht_leads = false AND v_hsp.can_manage_ht_leads = false) THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks HT lead view permission.';
    END IF;

    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', l.id,
            'tenant_id', l.tenant_id,
            'status', l.status,
            'source_channel', l.source_channel,
            'referring_agency_id', l.referring_agency_id,
            'agency_name', a.name,
            'preferred_language', l.preferred_language,
            'country_code', l.country_code,
            'full_name', l.full_name,
            'email', l.email,
            'phone', l.phone,
            'created_at', l.created_at,
            'updated_at', l.updated_at
            -- NOTE: passport_number IS EXCLUDED FROM LIST PROJECTION FOR PII SAFETY!
        ) ORDER BY l.created_at DESC
    ), '[]'::jsonb) INTO v_leads
    FROM public.ht_leads l
    LEFT JOIN public.ht_referring_agencies a ON a.id = l.referring_agency_id
    WHERE l.tenant_id = v_staff.tenant_id
      AND (p_status IS NULL OR l.status = lower(trim(p_status)))
    LIMIT p_limit OFFSET p_offset;

    RETURN jsonb_build_object(
        'success', true,
        'leads', v_leads
    );
END;
$$;


-- H. ht_list_referring_agencies (STAFF READ)
CREATE OR REPLACE FUNCTION public.ht_list_referring_agencies(
    p_active_only BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_hsp RECORD;
    v_agencies JSONB;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    SELECT * INTO v_hsp
    FROM public.ht_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_hsp.staff_id IS NULL OR (v_hsp.can_view_ht_leads = false AND v_hsp.can_manage_ht_leads = false) THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks HT view permission.';
    END IF;

    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', a.id,
            'tenant_id', a.tenant_id,
            'name', a.name,
            'code', a.code,
            'contact_email', a.contact_email,
            'contact_phone', a.contact_phone,
            'active', a.active,
            'created_at', a.created_at
        ) ORDER BY a.name ASC
    ), '[]'::jsonb) INTO v_agencies
    FROM public.ht_referring_agencies a
    WHERE a.tenant_id = v_staff.tenant_id
      AND (p_active_only IS FALSE OR a.active = true);

    RETURN jsonb_build_object(
        'success', true,
        'agencies', v_agencies
    );
END;
$$;


-- =========================================================================
-- 6. EXECUTE PERMISSIONS HARDENING
-- =========================================================================

REVOKE ALL ON FUNCTION public.ht_set_staff_profile FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ht_create_referring_agency FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ht_create_public_lead FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ht_update_lead_status FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ht_update_lead_agency_attribution FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ht_get_lead FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ht_list_leads FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ht_list_referring_agencies FROM PUBLIC, anon;

-- Public lead intake allowed for anon and authenticated
GRANT EXECUTE ON FUNCTION public.ht_create_public_lead TO anon, authenticated;

-- Staff-side contracts restricted to authenticated
GRANT EXECUTE ON FUNCTION public.ht_set_staff_profile TO authenticated;
GRANT EXECUTE ON FUNCTION public.ht_create_referring_agency TO authenticated;
GRANT EXECUTE ON FUNCTION public.ht_update_lead_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.ht_update_lead_agency_attribution TO authenticated;
GRANT EXECUTE ON FUNCTION public.ht_get_lead TO authenticated;
GRANT EXECUTE ON FUNCTION public.ht_list_leads TO authenticated;
GRANT EXECUTE ON FUNCTION public.ht_list_referring_agencies TO authenticated;
