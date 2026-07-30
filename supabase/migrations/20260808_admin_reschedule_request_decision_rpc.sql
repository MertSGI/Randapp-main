-- Migration 33: Stage F3 Admin Reschedule Request Decision Backend
-- File: supabase/migrations/20260808_admin_reschedule_request_decision_rpc.sql
--
-- PURPOSE:
-- 1. Creates public.admin_reschedule_decision_idempotency table for decision idempotency handling.
-- 2. Implements public.admin_list_pending_reschedule_requests SECURITY DEFINER RPC.
-- 3. Implements public.admin_decide_reschedule_request SECURITY DEFINER RPC.
-- Supports tenant_owner / super_admin approval and rejection of customer reschedule requests.
-- Revalidates proposed slot availability atomically at approval time.
-- Inserts transactional audit log and communication outbox records.
-- Enforces strict server-side authorization and tenant isolation based on auth.uid().

BEGIN;

-- 1. Create Idempotency Table
CREATE TABLE IF NOT EXISTS public.admin_reschedule_decision_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    change_request_id UUID NOT NULL REFERENCES public.appointment_change_requests(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
    response_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.admin_reschedule_decision_idempotency ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_reschedule_decision_idempotency FROM PUBLIC;
REVOKE ALL ON public.admin_reschedule_decision_idempotency FROM anon;
REVOKE ALL ON public.admin_reschedule_decision_idempotency FROM authenticated;

-- 2. Create Admin List Pending Reschedule Requests RPC
CREATE OR REPLACE FUNCTION public.admin_list_pending_reschedule_requests(
    p_limit integer DEFAULT 50,
    p_cursor_created_at timestamptz DEFAULT NULL,
    p_cursor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor record;
    v_limit integer;
    v_requests jsonb;
BEGIN
    -- Check Authentication
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthenticated');
    END IF;

    -- Resolve Actor Profile & Tenant
    SELECT id, tenant_id, role INTO v_actor
    FROM public.users_profile
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthenticated');
    END IF;

    -- Check Role Authorization (tenant_owner or super_admin required)
    IF v_actor.role NOT IN ('tenant_owner', 'super_admin') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);

    -- Query Pending Reschedule Requests
    SELECT jsonb_agg(
        jsonb_build_object(
            'change_request_id', cr.id,
            'appointment_id', cr.appointment_id,
            'tenant_id', cr.tenant_id,
            'request_type', cr.request_type,
            'request_status', cr.status,
            'proposed_date', cr.proposed_date,
            'proposed_time', cr.proposed_time,
            'reason', cr.reason,
            'created_at', cr.created_at,
            'current_appointment_date', a.appointment_date,
            'current_appointment_time', a.appointment_time,
            'current_appointment_status', a.status,
            'customer_name', a.user_name,
            'customer_phone', a.phone,
            'service_name', COALESCE(s.name_tr, s.name, 'Hizmet'),
            'staff_name', COALESCE(st.name, 'Personel'),
            'branch_name', COALESCE(b.name, 'Şube')
        )
    ) INTO v_requests
    FROM public.appointment_change_requests cr
    JOIN public.appointments a ON a.id = cr.appointment_id
    LEFT JOIN public.services s ON s.id = a.service_id
    LEFT JOIN public.staff st ON st.id = a.staff_id
    LEFT JOIN public.branches b ON b.id = a.branch_id
    WHERE cr.request_type = 'reschedule'
      AND cr.status IN ('pending', 'requested')
      AND (
        (v_actor.role = 'super_admin' AND v_actor.tenant_id IS NULL)
        OR
        (cr.tenant_id = v_actor.tenant_id::text)
      )
      AND (
        p_cursor_created_at IS NULL
        OR (cr.created_at, cr.id) < (p_cursor_created_at, p_cursor_id)
      )
    ORDER BY cr.created_at DESC, cr.id DESC
    LIMIT v_limit;

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'requests', COALESCE(v_requests, '[]'::jsonb)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'service_error');
END;
$$;

ALTER FUNCTION public.admin_list_pending_reschedule_requests(integer, timestamptz, uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.admin_list_pending_reschedule_requests(integer, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_pending_reschedule_requests(integer, timestamptz, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_reschedule_requests(integer, timestamptz, uuid) TO authenticated;


-- 3. Create Admin Reschedule Request Decision RPC
CREATE OR REPLACE FUNCTION public.admin_decide_reschedule_request(
    p_change_request_id uuid,
    p_decision text,
    p_reason text DEFAULT NULL,
    p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor record;
    v_trimmed_decision text;
    v_trimmed_reason text;
    v_trimmed_key text;
    v_req record;
    v_appointment record;
    v_existing_idem record;
    v_overlap_count integer;
    v_response jsonb;
    v_prev_date date;
    v_prev_time text;
BEGIN
    -- Check Authentication
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthenticated');
    END IF;

    -- Resolve Actor Profile
    SELECT id, tenant_id, role INTO v_actor
    FROM public.users_profile
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthenticated');
    END IF;

    -- Role Authorization
    IF v_actor.role NOT IN ('tenant_owner', 'super_admin') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    -- Input Hygiene
    IF p_change_request_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'request_unavailable');
    END IF;

    v_trimmed_decision := lower(trim(COALESCE(p_decision, '')));
    IF v_trimmed_decision NOT IN ('approved', 'rejected') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_decision');
    END IF;

    v_trimmed_reason := NULLIF(trim(p_reason), '');
    v_trimmed_key := NULLIF(trim(p_idempotency_key), '');

    -- Check Idempotency Table
    IF v_trimmed_key IS NOT NULL THEN
        SELECT decision, response_payload INTO v_existing_idem
        FROM public.admin_reschedule_decision_idempotency
        WHERE idempotency_key = v_trimmed_key;

        IF FOUND THEN
            IF v_existing_idem.decision = v_trimmed_decision THEN
                RETURN v_existing_idem.response_payload;
            ELSE
                RETURN jsonb_build_object('success', false, 'reason_code', 'idempotency_conflict');
            END IF;
        END IF;
    END IF;

    -- Lock Change Request Row FOR UPDATE
    SELECT id, tenant_id, appointment_id, request_type, proposed_date, proposed_time, reason, status
    INTO v_req
    FROM public.appointment_change_requests
    WHERE id = p_change_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'request_unavailable');
    END IF;

    -- Verify Tenant Isolation
    IF v_actor.role != 'super_admin' AND v_req.tenant_id != v_actor.tenant_id::text THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'request_unavailable');
    END IF;

    -- Check Request Type
    IF v_req.request_type != 'reschedule' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'request_unavailable');
    END IF;

    -- Check Already Resolved Status
    IF v_req.status IN ('approved', 'rejected', 'applied') THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'request_already_resolved',
            'changed', false,
            'change_request_id', v_req.id,
            'request_status', v_req.status
        );
    END IF;

    -- Lock Target Appointment Row FOR UPDATE
    SELECT id, tenant_id, branch_id, service_id, staff_id, appointment_date, appointment_time,
           duration_minutes, status, phone, user_name
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_req.appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'request_unavailable');
    END IF;

    v_prev_date := v_appointment.appointment_date;
    v_prev_time := v_appointment.appointment_time::text;

    -- Handle Decision: REJECTED
    IF v_trimmed_decision = 'rejected' THEN
        UPDATE public.appointment_change_requests
        SET status = 'rejected',
            reason = COALESCE(v_trimmed_reason, reason),
            resolved_at = now(),
            resolved_by = auth.uid()::text
        WHERE id = v_req.id;

        v_response := jsonb_build_object(
            'success', true,
            'reason_code', 'ok',
            'changed', true,
            'decision', 'rejected',
            'change_request_id', v_req.id,
            'appointment_id', v_appointment.id,
            'previous_date', v_prev_date,
            'previous_time', v_prev_time,
            'appointment_date', v_appointment.appointment_date,
            'appointment_time', v_appointment.appointment_time,
            'request_status', 'rejected',
            'appointment_status', v_appointment.status
        );

        IF v_trimmed_key IS NOT NULL THEN
            INSERT INTO public.admin_reschedule_decision_idempotency (
                tenant_id, change_request_id, actor_id, idempotency_key, decision, response_payload
            ) VALUES (
                v_req.tenant_id, v_req.id, auth.uid(), v_trimmed_key, 'rejected', v_response
            );
        END IF;

        -- Audit Log
        INSERT INTO public.audit_events (
            tenant_id, actor_id, actor_role, action, resource_type, resource_id, payload, created_at
        ) VALUES (
            v_appointment.tenant_id,
            auth.uid(),
            'tenant_owner',
            'appointment_reschedule_rejected',
            'appointment',
            v_appointment.id,
            jsonb_build_object(
                'change_request_id', v_req.id,
                'rejection_reason', v_trimmed_reason
            ),
            now()
        );

        -- Communication Outbox
        IF v_appointment.phone IS NOT NULL AND trim(v_appointment.phone) != '' THEN
            INSERT INTO public.communication_outbox (
                tenant_id, recipient, channel, message, status, metadata, created_at, updated_at
            ) VALUES (
                v_appointment.tenant_id,
                v_appointment.phone,
                'whatsapp',
                'Randevu değişiklik talebiniz işletme tarafından reddedildi.',
                'queued',
                jsonb_build_object(
                    'event_type', 'reschedule_request_rejected',
                    'appointment_id', v_appointment.id,
                    'change_request_id', v_req.id,
                    'reason', v_trimmed_reason
                ),
                now(),
                now()
            );
        END IF;

        RETURN v_response;
    END IF;

    -- Handle Decision: APPROVED
    -- Approval requires appointment.status = 'confirmed'
    IF v_appointment.status != 'confirmed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_transition',
            'changed', false,
            'appointment_id', v_appointment.id,
            'appointment_status', v_appointment.status
        );
    END IF;

    -- Validate Proposed Slot
    IF v_req.proposed_date IS NULL OR v_req.proposed_time IS NULL OR trim(v_req.proposed_time) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'slot_unavailable');
    END IF;

    IF v_req.proposed_date < current_date THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'slot_unavailable');
    END IF;

    -- Server-Side Overlap Revalidation against active appointments
    SELECT COUNT(*) INTO v_overlap_count
    FROM public.appointments
    WHERE staff_id = v_appointment.staff_id
      AND appointment_date = v_req.proposed_date
      AND appointment_time = v_req.proposed_time
      AND id != v_appointment.id
      AND status IN ('confirmed', 'completed');

    IF v_overlap_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'slot_unavailable',
            'changed', false,
            'appointment_id', v_appointment.id
        );
    END IF;

    -- Atomic Appointment Schedule Update
    UPDATE public.appointments
    SET appointment_date = v_req.proposed_date,
        appointment_time = v_req.proposed_time
    WHERE id = v_appointment.id;

    -- Update Change Request Status
    UPDATE public.appointment_change_requests
    SET status = 'approved',
        resolved_at = now(),
        resolved_by = auth.uid()::text
    WHERE id = v_req.id;

    v_response := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'changed', true,
        'decision', 'approved',
        'change_request_id', v_req.id,
        'appointment_id', v_appointment.id,
        'previous_date', v_prev_date,
        'previous_time', v_prev_time,
        'appointment_date', v_req.proposed_date,
        'appointment_time', v_req.proposed_time,
        'request_status', 'approved',
        'appointment_status', 'confirmed'
    );

    IF v_trimmed_key IS NOT NULL THEN
        INSERT INTO public.admin_reschedule_decision_idempotency (
            tenant_id, change_request_id, actor_id, idempotency_key, decision, response_payload
        ) VALUES (
            v_req.tenant_id, v_req.id, auth.uid(), v_trimmed_key, 'approved', v_response
        );
    END IF;

    -- Audit Log
    INSERT INTO public.audit_events (
        tenant_id, actor_id, actor_role, action, resource_type, resource_id, payload, created_at
    ) VALUES (
        v_appointment.tenant_id,
        auth.uid(),
        'tenant_owner',
        'appointment_reschedule_approved',
        'appointment',
        v_appointment.id,
        jsonb_build_object(
            'change_request_id', v_req.id,
            'previous_date', v_prev_date,
            'previous_time', v_prev_time,
            'approved_date', v_req.proposed_date,
            'approved_time', v_req.proposed_time
        ),
        now()
    );

    -- Communication Outbox
    IF v_appointment.phone IS NOT NULL AND trim(v_appointment.phone) != '' THEN
        INSERT INTO public.communication_outbox (
            tenant_id, recipient, channel, message, status, metadata, created_at, updated_at
        ) VALUES (
            v_appointment.tenant_id,
            v_appointment.phone,
            'whatsapp',
            'Randevu değişiklik talebiniz işletme tarafından onaylandı.',
            'queued',
            jsonb_build_object(
                'event_type', 'reschedule_request_approved',
                'appointment_id', v_appointment.id,
                'change_request_id', v_req.id,
                'approved_date', v_req.proposed_date,
                'approved_time', v_req.proposed_time
            ),
            now(),
            now()
        );
    END IF;

    RETURN v_response;
END;
$$;

ALTER FUNCTION public.admin_decide_reschedule_request(uuid, text, text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.admin_decide_reschedule_request(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_decide_reschedule_request(uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_reschedule_request(uuid, text, text, text) TO authenticated;

COMMIT;
