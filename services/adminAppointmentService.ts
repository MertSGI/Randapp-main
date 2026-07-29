/**
 * adminAppointmentService.ts — Stage D2
 *
 * Typed service layer for the admin_update_appointment_status RPC.
 *
 * Contract:
 * - Calls the Stage D1 RPC exclusively; never sends tenant_id, actor_id, actor_role,
 *   user_id, branch_id, customer tokens, or token hashes.
 * - Returns only safe RPC contract fields.
 * - Maps reason_code to Turkish user-facing messages.
 * - Wraps PostgREST/network errors into normalized safe results.
 *
 * The RPC resolves auth.uid() server-side and enforces tenant_owner-only access.
 */

import { fetchSupabase } from './repositories/supabaseClient';

// ── Types ────────────────────────────────────────────────────────────────────

/** Canonical writable statuses for admin status mutations. */
export type AdminTargetStatus = 'confirmed' | 'completed' | 'no_show' | 'cancelled';

/** Safe result returned by the RPC. No Postgres internals exposed. */
export interface AdminStatusMutationResult {
  success: boolean;
  reason_code: string;
  appointment_id?: string;
  previous_status?: string;
  status?: string;
  changed?: boolean;
}

/** Input for the admin status mutation. */
export interface AdminStatusMutationInput {
  appointmentId: string;
  targetStatus: AdminTargetStatus;
  reason?: string | null;
  idempotencyKey?: string;
}

// ── Terminal Status Check ────────────────────────────────────────────────────

const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'completed',
  'no_show',
  'cancelled',
  'cancelled_by_customer',
  'cancelled_by_salon',
  'cancelled_by_system',
]);

/**
 * Returns true if the given appointment status is terminal (no further
 * admin status mutations should be offered in the UI).
 */
export function isTerminalStatus(status: string | undefined | null): boolean {
  if (!status) return false;
  return TERMINAL_STATUSES.has(status);
}

// ── Turkish Error Mapping ────────────────────────────────────────────────────

const REASON_CODE_MESSAGES: Record<string, string> = {
  unauthenticated: 'Oturumunuz sona ermiş olabilir. Lütfen yeniden giriş yapın.',
  forbidden: 'Bu işlem için yetkiniz bulunmuyor.',
  appointment_unavailable: 'Randevu bulunamadı veya artık erişilemiyor.',
  invalid_status: 'Seçilen randevu durumu geçerli değil.',
  invalid_transition: 'Bu randevu mevcut durumundan seçilen duruma geçirilemez.',
  idempotency_conflict: 'Bu işlem isteği başka bir değişiklikle çakıştı. Randevu bilgileri yenileniyor.',
  service_error: 'İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin.',
};

const DEFAULT_ERROR_MESSAGE = 'Randevu durumu güncellenemedi.';

/**
 * Returns a safe Turkish user-facing message for the given reason code.
 * Never exposes Postgres internals, table names, or policy names.
 */
export function getAdminStatusReasonMessage(reasonCode: string | undefined | null): string {
  if (!reasonCode) return DEFAULT_ERROR_MESSAGE;
  return REASON_CODE_MESSAGES[reasonCode] || DEFAULT_ERROR_MESSAGE;
}

// ── Success Status Labels ────────────────────────────────────────────────────

const STATUS_LABELS_TR: Record<string, string> = {
  confirmed: 'Onaylandı',
  completed: 'Tamamlandı',
  no_show: 'Gelmedi',
  cancelled: 'İptal Edildi',
};

/**
 * Returns a Turkish display label for the new status after a successful mutation.
 */
export function getStatusLabelTr(status: string): string {
  return STATUS_LABELS_TR[status] || status;
}

// ── RPC Call ────────────────────────────────────────────────────────────────

/**
 * Calls the admin_update_appointment_status RPC.
 *
 * Does NOT send: tenant_id, actor_id, actor_role, user_id, branch_id,
 * customer token, or token hash.
 *
 * Returns a normalized safe result. Postgres errors are wrapped into
 * `{ success: false, reason_code: 'service_error' }`.
 */
export async function updateAdminAppointmentStatus(
  input: AdminStatusMutationInput
): Promise<AdminStatusMutationResult> {
  try {
    const payload: Record<string, unknown> = {
      p_appointment_id: input.appointmentId,
      p_new_status: input.targetStatus,
      p_reason: input.reason?.trim() || null,
    };

    if (input.idempotencyKey) {
      payload.p_idempotency_key = input.idempotencyKey;
    }

    const res = await fetchSupabase('/rest/v1/rpc/admin_update_appointment_status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Handle HTTP-level auth failures (PostgREST returns 401/403 before the RPC runs)
    if (res.status === 401) {
      return { success: false, reason_code: 'unauthenticated' };
    }
    if (res.status === 403) {
      return { success: false, reason_code: 'forbidden' };
    }

    const data = await res.json().catch(() => null);

    // The RPC always returns a JSON object with { success, reason_code, ... }
    if (data && typeof data === 'object' && 'success' in data) {
      return {
        success: !!data.success,
        reason_code: data.reason_code || (data.success ? 'ok' : 'service_error'),
        appointment_id: data.appointment_id,
        previous_status: data.previous_status,
        status: data.status,
        changed: !!data.changed,
      };
    }

    // Unexpected response shape — treat as service error
    return { success: false, reason_code: 'service_error' };
  } catch (err) {
    // Network or fetch failure — never expose the raw error to the UI
    console.error('[adminAppointmentService] RPC call failed:', err instanceof Error ? err.message : 'Unknown error');
    return { success: false, reason_code: 'service_error' };
  }
}

// ── Exported Service Object ──────────────────────────────────────────────────

export const adminAppointmentService = {
  updateAdminAppointmentStatus,
  getAdminStatusReasonMessage,
  getStatusLabelTr,
  isTerminalStatus,
};
