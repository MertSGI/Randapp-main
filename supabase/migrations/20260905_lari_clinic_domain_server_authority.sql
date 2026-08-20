-- =========================================================================
-- MIGRATION 20260905_lari_clinic_domain_server_authority.sql
-- Description: Foundational Clinical Domain & Server Authority for LARİ Clinic V1
-- Target: Disposable PostgreSQL database / Supabase
-- =========================================================================

-- 1. CLINIC STAFF PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.clinic_staff_profiles (
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    staff_id UUID PRIMARY KEY REFERENCES public.staff(id) ON DELETE CASCADE,
    practitioner_type TEXT NULL,
    specialty TEXT NULL,
    medical_license_number TEXT NULL,
    can_manage_patient_profiles BOOLEAN NOT NULL DEFAULT false,
    can_view_clinical_records BOOLEAN NOT NULL DEFAULT false,
    can_write_clinical_notes BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_clinic_staff_profiles_staff_tenant UNIQUE (staff_id, tenant_id),
    CONSTRAINT chk_clinic_staff_note_view_dependency CHECK (
        can_write_clinical_notes = false OR can_view_clinical_records = true
    )
);

CREATE INDEX IF NOT EXISTS idx_clinic_staff_profiles_tenant_id ON public.clinic_staff_profiles(tenant_id);

-- Enforce composite tenant alignment with public.staff (id, tenant_id)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_staff_id_tenant'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'fk_clinic_staff_profiles_staff_tenant'
        ) THEN
            ALTER TABLE public.clinic_staff_profiles
            ADD CONSTRAINT fk_clinic_staff_profiles_staff_tenant
            FOREIGN KEY (staff_id, tenant_id)
            REFERENCES public.staff(id, tenant_id)
            ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

CREATE TRIGGER update_clinic_staff_profiles_modtime
BEFORE UPDATE ON public.clinic_staff_profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.clinic_staff_profiles ENABLE ROW LEVEL SECURITY;


-- 2. CLINIC PATIENT PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.clinic_patient_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    date_of_birth DATE NULL,
    sex_at_birth TEXT NULL,
    emergency_contact_name TEXT NULL,
    emergency_contact_phone TEXT NULL,
    emergency_contact_relationship TEXT NULL,
    blood_type TEXT NULL,
    allergies TEXT NULL,
    chronic_conditions TEXT NULL,
    created_by UUID NULL REFERENCES public.users_profile(id) ON DELETE SET NULL,
    updated_by UUID NULL REFERENCES public.users_profile(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_clinic_patient_profiles_tenant_customer UNIQUE (tenant_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_clinic_patient_profiles_tenant_customer ON public.clinic_patient_profiles(tenant_id, customer_id);

CREATE TRIGGER update_clinic_patient_profiles_modtime
BEFORE UPDATE ON public.clinic_patient_profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.clinic_patient_profiles ENABLE ROW LEVEL SECURITY;


-- 3. CLINIC ENCOUNTERS TABLE
CREATE TABLE IF NOT EXISTS public.clinic_encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    practitioner_staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    status TEXT NOT NULL,
    reason_for_visit TEXT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ NULL,
    created_by UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_clinic_encounters_status CHECK (status IN ('open', 'completed', 'voided')),
    CONSTRAINT uq_clinic_encounters_appointment UNIQUE (appointment_id)
);

CREATE INDEX IF NOT EXISTS idx_clinic_encounters_tenant_id ON public.clinic_encounters(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clinic_encounters_customer_id ON public.clinic_encounters(customer_id);
CREATE INDEX IF NOT EXISTS idx_clinic_encounters_practitioner ON public.clinic_encounters(practitioner_staff_id);

CREATE TRIGGER update_clinic_encounters_modtime
BEFORE UPDATE ON public.clinic_encounters
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.clinic_encounters ENABLE ROW LEVEL SECURITY;


-- 4. CLINIC ENCOUNTER NOTES TABLE (APPEND-ONLY & VERSIONED)
CREATE TABLE IF NOT EXISTS public.clinic_encounter_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    encounter_id UUID NOT NULL REFERENCES public.clinic_encounters(id) ON DELETE CASCADE,
    author_staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
    version INTEGER NOT NULL,
    subjective TEXT NULL,
    objective TEXT NULL,
    assessment TEXT NULL,
    plan TEXT NULL,
    note_status TEXT NOT NULL DEFAULT 'draft',
    supersedes_note_id UUID NULL REFERENCES public.clinic_encounter_notes(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_clinic_encounter_notes_status CHECK (note_status IN ('draft', 'final')),
    CONSTRAINT chk_clinic_encounter_notes_version CHECK (version > 0),
    CONSTRAINT uq_clinic_encounter_notes_encounter_version UNIQUE (encounter_id, version)
);

CREATE INDEX IF NOT EXISTS idx_clinic_encounter_notes_encounter ON public.clinic_encounter_notes(encounter_id, version DESC);

ALTER TABLE public.clinic_encounter_notes ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 5. RLS POLICIES FOR DIRECT DML Hardening
-- Direct mutations are blocked; SELECT allowed only for authorized staff.
-- =========================================================================

-- public.clinic_staff_profiles RLS
DROP POLICY IF EXISTS "No anon access on clinic_staff_profiles" ON public.clinic_staff_profiles;
DROP POLICY IF EXISTS "Authorized tenant owner can manage clinic staff profiles" ON public.clinic_staff_profiles;
DROP POLICY IF EXISTS "Authorized tenant staff can read clinic staff profiles" ON public.clinic_staff_profiles;

CREATE POLICY "Authorized tenant staff can read clinic staff profiles"
ON public.clinic_staff_profiles
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = clinic_staff_profiles.tenant_id
          AND s.active = true
    )
);


-- public.clinic_patient_profiles RLS
DROP POLICY IF EXISTS "Authorized staff can read clinic_patient_profiles" ON public.clinic_patient_profiles;

CREATE POLICY "Authorized staff can read clinic_patient_profiles"
ON public.clinic_patient_profiles
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.clinic_staff_profiles csp ON csp.staff_id = s.id
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = clinic_patient_profiles.tenant_id
          AND s.active = true
          AND (csp.can_manage_patient_profiles = true OR csp.can_view_clinical_records = true)
    )
);


-- public.clinic_encounters RLS
DROP POLICY IF EXISTS "Authorized staff can read clinic_encounters" ON public.clinic_encounters;

CREATE POLICY "Authorized staff can read clinic_encounters"
ON public.clinic_encounters
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.clinic_staff_profiles csp ON csp.staff_id = s.id
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = clinic_encounters.tenant_id
          AND s.active = true
          AND csp.can_view_clinical_records = true
    )
);


-- public.clinic_encounter_notes RLS
DROP POLICY IF EXISTS "Authorized staff can read clinic_encounter_notes" ON public.clinic_encounter_notes;

CREATE POLICY "Authorized staff can read clinic_encounter_notes"
ON public.clinic_encounter_notes
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.clinic_staff_profiles csp ON csp.staff_id = s.id
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = clinic_encounter_notes.tenant_id
          AND s.active = true
          AND csp.can_view_clinical_records = true
    )
);


-- Explicitly prevent direct DML for authenticated users on patient profiles, encounters, notes
-- All mutations MUST proceed through server-authoritative SECURITY DEFINER RPCs.


-- =========================================================================
-- 6. SERVER-AUTHORITATIVE RPC CONTRACTS
-- =========================================================================

-- A. clinic_set_staff_profile
CREATE OR REPLACE FUNCTION public.clinic_set_staff_profile(
    p_staff_id UUID,
    p_practitioner_type TEXT DEFAULT NULL,
    p_specialty TEXT DEFAULT NULL,
    p_medical_license_number TEXT DEFAULT NULL,
    p_can_manage_patient_profiles BOOLEAN DEFAULT false,
    p_can_view_clinical_records BOOLEAN DEFAULT false,
    p_can_write_clinical_notes BOOLEAN DEFAULT false
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
    v_can_view BOOLEAN := p_can_view_clinical_records;
    v_res RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    -- Validate target staff exists AND is active
    SELECT * INTO v_target_staff
    FROM public.staff
    WHERE id = p_staff_id;

    IF v_target_staff.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Staff member not found.';
    END IF;

    IF v_target_staff.active IS NOT TRUE THEN
        RAISE EXCEPTION 'INVALID_STATE: Target staff member is inactive and cannot receive Clinic capabilities.';
    END IF;

    -- Validate caller is active tenant_owner of the exact tenant (users_profile.active = true)
    SELECT * INTO v_caller_up
    FROM public.users_profile
    WHERE id = v_caller_uid
      AND tenant_id = v_target_staff.tenant_id
      AND role = 'tenant_owner'
      AND active = true;

    IF v_caller_up.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Only active tenant owner of the exact tenant can set Clinic staff profile.';
    END IF;

    -- Enforce invariant: can_write_clinical_notes implies can_view_clinical_records
    IF p_can_write_clinical_notes = true THEN
        v_can_view := true;
    END IF;

    -- Upsert clinic_staff_profiles
    INSERT INTO public.clinic_staff_profiles (
        tenant_id,
        staff_id,
        practitioner_type,
        specialty,
        medical_license_number,
        can_manage_patient_profiles,
        can_view_clinical_records,
        can_write_clinical_notes,
        updated_at
    ) VALUES (
        v_target_staff.tenant_id,
        p_staff_id,
        p_practitioner_type,
        p_specialty,
        p_medical_license_number,
        p_can_manage_patient_profiles,
        v_can_view,
        p_can_write_clinical_notes,
        now()
    )
    ON CONFLICT (staff_id) DO UPDATE SET
        practitioner_type = EXCLUDED.practitioner_type,
        specialty = EXCLUDED.specialty,
        medical_license_number = EXCLUDED.medical_license_number,
        can_manage_patient_profiles = EXCLUDED.can_manage_patient_profiles,
        can_view_clinical_records = EXCLUDED.can_view_clinical_records,
        can_write_clinical_notes = EXCLUDED.can_write_clinical_notes,
        updated_at = now()
    RETURNING * INTO v_res;

    -- Audit event (Metadata only, NO sensitive content)
    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        v_target_staff.tenant_id::text,
        v_caller_uid::text,
        'tenant_owner',
        'clinic_staff_profile_changed',
        'clinic_staff_profiles',
        p_staff_id::text,
        jsonb_build_object(
            'staff_id', p_staff_id,
            'can_manage_patient_profiles', p_can_manage_patient_profiles,
            'can_view_clinical_records', v_can_view,
            'can_write_clinical_notes', p_can_write_clinical_notes
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'staff_id', v_res.staff_id,
        'tenant_id', v_res.tenant_id,
        'can_manage_patient_profiles', v_res.can_manage_patient_profiles,
        'can_view_clinical_records', v_res.can_view_clinical_records,
        'can_write_clinical_notes', v_res.can_write_clinical_notes
    );
END;
$$;


-- B. clinic_upsert_patient_profile
CREATE OR REPLACE FUNCTION public.clinic_upsert_patient_profile(
    p_customer_id UUID,
    p_date_of_birth DATE DEFAULT NULL,
    p_sex_at_birth TEXT DEFAULT NULL,
    p_emergency_contact_name TEXT DEFAULT NULL,
    p_emergency_contact_phone TEXT DEFAULT NULL,
    p_emergency_contact_relationship TEXT DEFAULT NULL,
    p_blood_type TEXT DEFAULT NULL,
    p_allergies TEXT DEFAULT NULL,
    p_chronic_conditions TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_csp RECORD;
    v_customer RECORD;
    v_res RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    -- Derive active staff identity server-side
    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    -- Check Clinic capabilities
    SELECT * INTO v_csp
    FROM public.clinic_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_csp.staff_id IS NULL OR (v_csp.can_manage_patient_profiles = false AND v_csp.can_view_clinical_records = false) THEN
        RAISE EXCEPTION 'FORBIDDEN: Insufficient Clinic permissions to manage patient profiles.';
    END IF;

    -- Validate customer exists and matches staff tenant
    SELECT * INTO v_customer
    FROM public.customers
    WHERE id = p_customer_id
      AND tenant_id = v_staff.tenant_id;

    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Customer not found or tenant mismatch.';
    END IF;

    -- Upsert clinic_patient_profiles
    INSERT INTO public.clinic_patient_profiles (
        tenant_id,
        customer_id,
        date_of_birth,
        sex_at_birth,
        emergency_contact_name,
        emergency_contact_phone,
        emergency_contact_relationship,
        blood_type,
        allergies,
        chronic_conditions,
        created_by,
        updated_by,
        updated_at
    ) VALUES (
        v_staff.tenant_id,
        p_customer_id,
        p_date_of_birth,
        p_sex_at_birth,
        p_emergency_contact_name,
        p_emergency_contact_phone,
        p_emergency_contact_relationship,
        p_blood_type,
        p_allergies,
        p_chronic_conditions,
        v_caller_uid,
        v_caller_uid,
        now()
    )
    ON CONFLICT (tenant_id, customer_id) DO UPDATE SET
        date_of_birth = EXCLUDED.date_of_birth,
        sex_at_birth = EXCLUDED.sex_at_birth,
        emergency_contact_name = EXCLUDED.emergency_contact_name,
        emergency_contact_phone = EXCLUDED.emergency_contact_phone,
        emergency_contact_relationship = EXCLUDED.emergency_contact_relationship,
        blood_type = EXCLUDED.blood_type,
        allergies = EXCLUDED.allergies,
        chronic_conditions = EXCLUDED.chronic_conditions,
        updated_by = v_caller_uid,
        updated_at = now()
    RETURNING * INTO v_res;

    -- Audit event (Metadata only, NO sensitive clinical narrative/phone)
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
        'clinic_patient_profile_changed',
        'clinic_patient_profiles',
        v_res.id::text,
        jsonb_build_object(
            'customer_id', p_customer_id,
            'patient_profile_id', v_res.id,
            'staff_id', v_staff.id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'patient_profile_id', v_res.id,
        'customer_id', v_res.customer_id,
        'tenant_id', v_res.tenant_id
    );
END;
$$;


-- C. clinic_start_encounter
CREATE OR REPLACE FUNCTION public.clinic_start_encounter(
    p_appointment_id UUID,
    p_reason_for_visit TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_csp RECORD;
    v_appointment RECORD;
    v_existing_encounter RECORD;
    v_encounter RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    -- Lock transactionally to protect concurrent double-start attempts for the appointment
    PERFORM pg_advisory_xact_lock(hashtextextended(p_appointment_id::text, 0));

    -- Derive caller active staff
    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    -- Verify capability
    SELECT * INTO v_csp
    FROM public.clinic_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_csp.staff_id IS NULL OR v_csp.can_write_clinical_notes = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Practitioner lacks can_write_clinical_notes capability.';
    END IF;

    -- Fetch and validate appointment
    SELECT * INTO v_appointment
    FROM public.appointments
    WHERE id = p_appointment_id;

    IF v_appointment.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Appointment not found.';
    END IF;

    -- Strict authorization checks
    IF v_appointment.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'FORBIDDEN: Tenant mismatch on appointment.';
    END IF;

    IF v_appointment.staff_id <> v_staff.id THEN
        RAISE EXCEPTION 'FORBIDDEN: Only the practitioner assigned to the appointment can start the encounter.';
    END IF;

    IF v_appointment.customer_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_STATE: Appointment has no registered customer.';
    END IF;

    -- Check if encounter already exists for this appointment
    SELECT * INTO v_existing_encounter
    FROM public.clinic_encounters
    WHERE appointment_id = p_appointment_id;

    IF v_existing_encounter.id IS NOT NULL THEN
        RAISE EXCEPTION 'ALREADY_EXISTS: An encounter already exists for this appointment.';
    END IF;

    -- Create encounter
    INSERT INTO public.clinic_encounters (
        tenant_id,
        appointment_id,
        customer_id,
        practitioner_staff_id,
        branch_id,
        status,
        reason_for_visit,
        started_at,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        v_staff.tenant_id,
        p_appointment_id,
        v_appointment.customer_id,
        v_staff.id,
        v_appointment.branch_id,
        'open',
        p_reason_for_visit,
        now(),
        v_caller_uid,
        now(),
        now()
    )
    RETURNING * INTO v_encounter;

    -- Audit event (Metadata only, NO reason_for_visit or clinical narrative)
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
        'clinic_encounter_started',
        'clinic_encounters',
        v_encounter.id::text,
        jsonb_build_object(
            'encounter_id', v_encounter.id,
            'appointment_id', p_appointment_id,
            'customer_id', v_appointment.customer_id,
            'practitioner_staff_id', v_staff.id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'encounter_id', v_encounter.id,
        'appointment_id', v_encounter.appointment_id,
        'status', v_encounter.status,
        'started_at', v_encounter.started_at
    );
END;
$$;


-- D. clinic_save_encounter_note
CREATE OR REPLACE FUNCTION public.clinic_save_encounter_note(
    p_encounter_id UUID,
    p_subjective TEXT DEFAULT NULL,
    p_objective TEXT DEFAULT NULL,
    p_assessment TEXT DEFAULT NULL,
    p_plan TEXT DEFAULT NULL,
    p_note_status TEXT DEFAULT 'draft'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_csp RECORD;
    v_encounter RECORD;
    v_latest_note RECORD;
    v_next_version INTEGER := 1;
    v_new_note RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    IF p_note_status NOT IN ('draft', 'final') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Allowed note_status values are draft or final.';
    END IF;

    -- Transactional 64-bit advisory lock on encounter ID to prevent version race conditions
    PERFORM pg_advisory_xact_lock(hashtextextended(p_encounter_id::text, 0));

    -- Derive caller active staff
    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    -- Verify capability
    SELECT * INTO v_csp
    FROM public.clinic_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_csp.staff_id IS NULL OR v_csp.can_write_clinical_notes = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Practitioner lacks can_write_clinical_notes capability.';
    END IF;

    -- Fetch encounter
    SELECT * INTO v_encounter
    FROM public.clinic_encounters
    WHERE id = p_encounter_id;

    IF v_encounter.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Encounter not found.';
    END IF;

    IF v_encounter.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'FORBIDDEN: Tenant mismatch on encounter.';
    END IF;

    IF v_encounter.practitioner_staff_id <> v_staff.id THEN
        RAISE EXCEPTION 'FORBIDDEN: Only the practitioner assigned to the encounter can save clinical notes.';
    END IF;

    IF v_encounter.status = 'completed' OR v_encounter.status = 'voided' THEN
        RAISE EXCEPTION 'INVALID_STATE: Cannot add or update notes on a completed or voided encounter.';
    END IF;

    -- Get latest note version for this encounter
    SELECT * INTO v_latest_note
    FROM public.clinic_encounter_notes
    WHERE encounter_id = p_encounter_id
    ORDER BY version DESC
    LIMIT 1;

    IF v_latest_note.id IS NOT NULL THEN
        v_next_version := v_latest_note.version + 1;
    END IF;

    -- Create NEW note version (APPEND ONLY)
    INSERT INTO public.clinic_encounter_notes (
        tenant_id,
        encounter_id,
        author_staff_id,
        version,
        subjective,
        objective,
        assessment,
        plan,
        note_status,
        supersedes_note_id,
        created_at
    ) VALUES (
        v_staff.tenant_id,
        p_encounter_id,
        v_staff.id,
        v_next_version,
        p_subjective,
        p_objective,
        p_assessment,
        p_plan,
        p_note_status,
        v_latest_note.id,
        now()
    )
    RETURNING * INTO v_new_note;

    -- Audit event (Metadata only, NO SOAP narrative content)
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
        'clinic_encounter_note_version_created',
        'clinic_encounter_notes',
        v_new_note.id::text,
        jsonb_build_object(
            'encounter_id', p_encounter_id,
            'note_id', v_new_note.id,
            'version', v_next_version,
            'note_status', p_note_status,
            'author_staff_id', v_staff.id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'note_id', v_new_note.id,
        'encounter_id', v_new_note.encounter_id,
        'version', v_new_note.version,
        'note_status', v_new_note.note_status,
        'created_at', v_new_note.created_at
    );
END;
$$;


-- E. clinic_complete_encounter
CREATE OR REPLACE FUNCTION public.clinic_complete_encounter(
    p_encounter_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_csp RECORD;
    v_encounter RECORD;
    v_res RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    -- Lock transactionally
    PERFORM pg_advisory_xact_lock(hashtextextended(p_encounter_id::text, 0));

    -- Derive caller active staff
    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    -- Verify capability
    SELECT * INTO v_csp
    FROM public.clinic_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_csp.staff_id IS NULL OR v_csp.can_write_clinical_notes = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Practitioner lacks write capability.';
    END IF;

    -- Fetch encounter
    SELECT * INTO v_encounter
    FROM public.clinic_encounters
    WHERE id = p_encounter_id;

    IF v_encounter.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Encounter not found.';
    END IF;

    IF v_encounter.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'FORBIDDEN: Tenant mismatch on encounter.';
    END IF;

    IF v_encounter.practitioner_staff_id <> v_staff.id THEN
        RAISE EXCEPTION 'FORBIDDEN: Only assigned practitioner can complete the encounter.';
    END IF;

    IF v_encounter.status <> 'open' THEN
        RAISE EXCEPTION 'INVALID_STATE: Encounter is not in open status.';
    END IF;

    -- Complete encounter (Do NOT mutate core appointment status in Block 1)
    UPDATE public.clinic_encounters
    SET status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE id = p_encounter_id
    RETURNING * INTO v_res;

    -- Audit event (Metadata only)
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
        'clinic_encounter_completed',
        'clinic_encounters',
        p_encounter_id::text,
        jsonb_build_object(
            'encounter_id', p_encounter_id,
            'appointment_id', v_res.appointment_id,
            'completed_at', v_res.completed_at
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'encounter_id', v_res.id,
        'status', v_res.status,
        'completed_at', v_res.completed_at
    );
END;
$$;


-- F. clinic_get_patient_history
CREATE OR REPLACE FUNCTION public.clinic_get_patient_history(
    p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_csp RECORD;
    v_customer RECORD;
    v_patient_profile RECORD;
    v_encounters JSONB;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    -- Derive caller active staff
    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    -- Verify capability
    SELECT * INTO v_csp
    FROM public.clinic_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_csp.staff_id IS NULL OR v_csp.can_view_clinical_records = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff lacks can_view_clinical_records capability.';
    END IF;

    -- Verify customer belongs to exact tenant
    SELECT * INTO v_customer
    FROM public.customers
    WHERE id = p_customer_id
      AND tenant_id = v_staff.tenant_id;

    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Customer not found or cross-tenant access denied.';
    END IF;

    -- Fetch patient profile
    SELECT * INTO v_patient_profile
    FROM public.clinic_patient_profiles
    WHERE customer_id = p_customer_id
      AND tenant_id = v_staff.tenant_id;

    -- Fetch encounters with versioned notes
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', e.id,
            'appointment_id', e.appointment_id,
            'branch_id', e.branch_id,
            'practitioner_staff_id', e.practitioner_staff_id,
            'status', e.status,
            'reason_for_visit', e.reason_for_visit,
            'started_at', e.started_at,
            'completed_at', e.completed_at,
            'notes', (
                SELECT coalesce(jsonb_agg(
                    jsonb_build_object(
                        'id', n.id,
                        'version', n.version,
                        'author_staff_id', n.author_staff_id,
                        'subjective', n.subjective,
                        'objective', n.objective,
                        'assessment', n.assessment,
                        'plan', n.plan,
                        'note_status', n.note_status,
                        'supersedes_note_id', n.supersedes_note_id,
                        'created_at', n.created_at
                    ) ORDER BY n.version ASC
                ), '[]'::jsonb)
                FROM public.clinic_encounter_notes n
                WHERE n.encounter_id = e.id
            )
        ) ORDER BY e.started_at DESC
    ), '[]'::jsonb) INTO v_encounters
    FROM public.clinic_encounters e
    WHERE e.customer_id = p_customer_id
      AND e.tenant_id = v_staff.tenant_id;

    RETURN jsonb_build_object(
        'success', true,
        'customer_id', p_customer_id,
        'tenant_id', v_staff.tenant_id,
        'patient_profile', CASE WHEN v_patient_profile.id IS NOT NULL THEN jsonb_build_object(
            'id', v_patient_profile.id,
            'date_of_birth', v_patient_profile.date_of_birth,
            'sex_at_birth', v_patient_profile.sex_at_birth,
            'emergency_contact_name', v_patient_profile.emergency_contact_name,
            'emergency_contact_phone', v_patient_profile.emergency_contact_phone,
            'emergency_contact_relationship', v_patient_profile.emergency_contact_relationship,
            'blood_type', v_patient_profile.blood_type,
            'allergies', v_patient_profile.allergies,
            'chronic_conditions', v_patient_profile.chronic_conditions,
            'updated_at', v_patient_profile.updated_at
        ) ELSE NULL END,
        'encounters', v_encounters
    );
END;
$$;


-- =========================================================================
-- 7. EXECUTE PERMISSIONS HARDENING
-- =========================================================================

REVOKE ALL ON FUNCTION public.clinic_set_staff_profile FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clinic_upsert_patient_profile FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clinic_start_encounter FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clinic_save_encounter_note FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clinic_complete_encounter FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clinic_get_patient_history FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.clinic_set_staff_profile TO authenticated;
GRANT EXECUTE ON FUNCTION public.clinic_upsert_patient_profile TO authenticated;
GRANT EXECUTE ON FUNCTION public.clinic_start_encounter TO authenticated;
GRANT EXECUTE ON FUNCTION public.clinic_save_encounter_note TO authenticated;
GRANT EXECUTE ON FUNCTION public.clinic_complete_encounter TO authenticated;
GRANT EXECUTE ON FUNCTION public.clinic_get_patient_history TO authenticated;
