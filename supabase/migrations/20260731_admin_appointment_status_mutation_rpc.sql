-- 20260731_admin_appointment_status_mutation_rpc.sql
-- Stage D1: Server-Scoped Admin Appointment Mutation RPC Contract.
--
-- Provides:
--   1. public.admin_mutation_idempotency table (24h TTL, actor + key scoped, conflict tracking)
--   2. public.admin_update_appointment_status(UUID, TEXT, TEXT, TEXT) → jsonb
--      - SECURITY DEFINER, SET search_path = pg_catalog, public
--      - Authorizes active tenant_owner only (staff returns forbidden until staff scope model is defined)
--      - Row-level FOR UPDATE lock on target appointment
--      - Canonical status-transition validation & contract normalization (previous_status, status, changed)
--      - Idempotency replay & conflict detection (same key + diff target/apt → idempotency_conflict)
--      - Transactional audit_events insert (exactly 1 on real state change)
--      - Transactional communication_outbox insert (exactly 1 queued outbox row on real state change)
--      - Neutral response for cross-tenant / missing appointments (appointment_unavailable)
--      - REVOKE FROM PUBLIC/anon, GRANT TO authenticated
--
-- Migration count after this file: 25

-- =========================================================================
-- 1. ADMIN MUTATION IDEMPOTENCY TABLE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.admin_mutation_idempotency (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key     TEXT NOT NULL,
    actor_id            UUID NOT NULL,
    tenant_id           UUID NOT NULL,
    appointment_id      UUID NOT NULL,
    target_status       TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    result_payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_admin_idempotency_key UNIQUE (idempotency_key, actor_id)
);

ALTER TABLE public.admin_mutation_idempotency ENABLE ROW LEVEL SECURITY;

-- Deny direct REST client access — only accessible inside SECURITY DEFINER functions.
CREATE POLICY "Deny direct access" ON public.admin_mutation_idempotency
    FOR ALL USING (false);


-- =========================================================================
-- 2. ADMIN UPDATE APPOINTMENT STATUS RPC
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_update_appointment_status(
    p_appointment_id  UUID,
    p_new_status      TEXT,
    p_reason          TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id             uuid := auth.uid();
    v_profile             record;
    v_appointment         record;
    v_old_status          text;
    v_target_status       text;
    v_outbox_event_type   text;
    v_outbox_msg          text;
    v_is_terminal         boolean;
    v_result              jsonb;
    v_idemp_rec           record;
    v_request_fingerprint text;
BEGIN
    -- -----------------------------------------------------------------------
    -- Gate 1: Authentication
    -- -----------------------------------------------------------------------
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'unauthenticated'
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 2: Profile Resolution & Authorization
    -- In Stage D1, allow active tenant_owner only.
    -- Staff returns forbidden until staff scope model is defined.
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, role, active, name
    INTO v_profile
    FROM public.users_profile
    WHERE id = v_user_id;

    IF NOT FOUND OR v_profile.tenant_id IS NULL OR v_profile.active IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'forbidden'
        );
    END IF;

    IF v_profile.role <> 'tenant_owner' THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'forbidden'
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 3: Target Status Alias Normalization & Validation
    -- Admin allowed vocabulary: confirmed, completed, no_show, cancelled
    -- (Map legacy 'cancelled_by_salon' to canonical 'cancelled')
    -- -----------------------------------------------------------------------
    IF p_new_status = 'cancelled_by_salon' OR p_new_status = 'cancelled' THEN
        v_target_status := 'cancelled';
    ELSIF p_new_status IN ('confirmed', 'completed', 'no_show') THEN
        v_target_status := p_new_status;
    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_status'
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 4: Idempotency Replay & Conflict Check
    -- Clean expired entries first.
    -- If key exists for actor:
    --   - Same appointment & target status → return cached result
    --   - Different appointment or target status → return idempotency_conflict
    -- -----------------------------------------------------------------------
    DELETE FROM public.admin_mutation_idempotency
    WHERE expires_at <= now();

    v_request_fingerprint := md5(p_appointment_id::text || ':' || v_target_status);

    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        SELECT appointment_id, target_status, request_fingerprint, result_payload
        INTO v_idemp_rec
        FROM public.admin_mutation_idempotency
        WHERE idempotency_key = trim(p_idempotency_key)
          AND actor_id = v_user_id;

        IF FOUND THEN
            IF v_idemp_rec.request_fingerprint = v_request_fingerprint THEN
                RETURN v_idemp_rec.result_payload;
            ELSE
                RETURN jsonb_build_object(
                    'success', false,
                    'reason_code', 'idempotency_conflict'
                );
            END IF;
        END IF;
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 5: Load Appointment with Row-Level Lock (FOR UPDATE)
    -- Neutral response 'appointment_unavailable' for non-existent or cross-tenant
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, branch_id, status, appointment_date, appointment_time,
           duration_minutes, service_id, staff_id, user_name, user_email, phone
    INTO v_appointment
    FROM public.appointments
    WHERE id = p_appointment_id
      AND tenant_id = v_profile.tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'appointment_unavailable'
        );
    END IF;

    -- Normalize old status (treat legacy cancellation aliases as canonical 'cancelled')
    IF v_appointment.status IN ('cancelled', 'cancelled_by_salon', 'cancelled_by_customer', 'cancelled_by_system') THEN
        v_old_status := 'cancelled';
    ELSE
        v_old_status := v_appointment.status;
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 6: Idempotent Same-Status (No-Change) Check
    -- Returns success: true, reason_code: no_change, changed: false
    -- No audit_events or communication_outbox rows inserted.
    -- -----------------------------------------------------------------------
    IF v_old_status = v_target_status THEN
        v_result := jsonb_build_object(
            'success', true,
            'reason_code', 'no_change',
            'appointment_id', p_appointment_id,
            'previous_status', v_old_status,
            'status', v_target_status,
            'changed', false
        );

        IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
            INSERT INTO public.admin_mutation_idempotency (
                idempotency_key, actor_id, tenant_id, appointment_id,
                target_status, request_fingerprint, result_payload, expires_at
            ) VALUES (
                trim(p_idempotency_key), v_user_id, v_profile.tenant_id, p_appointment_id,
                v_target_status, v_request_fingerprint, v_result, now() + interval '24 hours'
            )
            ON CONFLICT (idempotency_key, actor_id) DO NOTHING;
        END IF;

        RETURN v_result;
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 7: Status Transition Validation
    -- Terminal states (completed, no_show, cancelled) are immutable.
    -- Unknown status values fail closed.
    -- -----------------------------------------------------------------------
    v_is_terminal := v_old_status IN ('completed', 'no_show', 'cancelled');

    IF v_is_terminal THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_transition'
        );
    END IF;

    IF v_old_status NOT IN ('confirmed', 'pending') THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_transition'
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 8: Execute Status Mutation
    -- Always store canonical status string: confirmed, completed, no_show, cancelled
    -- -----------------------------------------------------------------------
    UPDATE public.appointments
    SET status = v_target_status,
        updated_at = now()
    WHERE id = p_appointment_id;

    -- -----------------------------------------------------------------------
    -- Gate 9: Transactional Audit Trail
    -- Exactly 1 audit_events row per real status change
    -- -----------------------------------------------------------------------
    INSERT INTO public.audit_events (
        tenant_id, actor_id, actor_role, action,
        resource_type, resource_id, payload
    ) VALUES (
        v_profile.tenant_id::text,
        v_user_id::text,
        v_profile.role,
        'admin_status_' || v_target_status,
        'appointment',
        p_appointment_id::text,
        jsonb_build_object(
            'previous_status', v_old_status,
            'new_status', v_target_status,
            'reason', COALESCE(p_reason, ''),
            'actor_name', COALESCE(v_profile.name, '')
        )
    );

    -- -----------------------------------------------------------------------
    -- Gate 10: Transactional Outbox Event
    -- Exactly 1 queued communication_outbox row per real status change
    -- Supported channels: whatsapp (default), recipient: phone or email or customer_id
    -- -----------------------------------------------------------------------
    IF v_target_status = 'confirmed' THEN
        v_outbox_event_type := 'appointment_confirmed';
        v_outbox_msg := 'Randevunuz onaylandı.';
    ELSIF v_target_status = 'completed' THEN
        v_outbox_event_type := 'appointment_completed';
        v_outbox_msg := 'Randevunuz tamamlandı.';
    ELSIF v_target_status = 'no_show' THEN
        v_outbox_event_type := 'appointment_no_show';
        v_outbox_msg := 'Randevunuza katılım sağlanmadı.';
    ELSIF v_target_status = 'cancelled' THEN
        v_outbox_event_type := 'appointment_cancelled_by_business';
        v_outbox_msg := 'Randevunuz işletme tarafından iptal edildi.';
    END IF;

    INSERT INTO public.communication_outbox (
        tenant_id, recipient, channel, message, status, metadata
    ) VALUES (
        v_profile.tenant_id::text,
        COALESCE(v_appointment.phone, v_appointment.user_email, p_appointment_id::text),
        'whatsapp',
        v_outbox_msg,
        'queued',
        jsonb_build_object(
            'event_type', v_outbox_event_type,
            'appointment_id', p_appointment_id::text,
            'previous_status', v_old_status,
            'target_status', v_target_status
        )
    );

    -- -----------------------------------------------------------------------
    -- Gate 11: Build Canonical Success Contract
    -- -----------------------------------------------------------------------
    v_result := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'appointment_id', p_appointment_id,
        'previous_status', v_old_status,
        'status', v_target_status,
        'changed', true
    );

    -- -----------------------------------------------------------------------
    -- Gate 12: Record Idempotency Entry
    -- -----------------------------------------------------------------------
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        INSERT INTO public.admin_mutation_idempotency (
            idempotency_key, actor_id, tenant_id, appointment_id,
            target_status, request_fingerprint, result_payload, expires_at
        ) VALUES (
            trim(p_idempotency_key), v_user_id, v_profile.tenant_id, p_appointment_id,
            v_target_status, v_request_fingerprint, v_result, now() + interval '24 hours'
        )
        ON CONFLICT (idempotency_key, actor_id) DO NOTHING;
    END IF;

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    -- Redact all error details: Return neutral service_error, never leak SQLERRM/SQLSTATE
    RETURN jsonb_build_object(
        'success', false,
        'reason_code', 'service_error'
    );
END;
$$;

-- =========================================================================
-- 3. ACL PERMISSIONS
-- =========================================================================
REVOKE ALL ON FUNCTION public.admin_update_appointment_status(UUID, TEXT, TEXT, TEXT)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_update_appointment_status(UUID, TEXT, TEXT, TEXT)
TO authenticated;
