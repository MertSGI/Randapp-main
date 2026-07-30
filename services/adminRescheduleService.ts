import { supabase } from './supabaseClient';
import { getDataSourceMode } from './dataSourceConfig';

export interface PendingRescheduleRequestItem {
  change_request_id: string;
  appointment_id: string;
  tenant_id: string;
  request_type: string;
  request_status: string;
  proposed_date: string;
  proposed_time: string;
  customer_reason?: string;
  resolution_reason?: string;
  created_at: string;
  current_appointment_date: string;
  current_appointment_time: string;
  current_appointment_status: string;
  customer_name?: string;
  customer_phone?: string;
  service_name?: string;
  staff_name?: string;
  branch_name?: string;
}

export function mapAdminDecisionReasonCodeToMessage(reasonCode: string, decision?: 'approved' | 'rejected'): string {
  switch (reasonCode) {
    case 'ok':
      return decision === 'rejected'
        ? 'Randevu değişikliği talebi reddedildi.'
        : 'Randevu değişikliği onaylandı.';
    case 'no_change':
      return 'Bu talep için ek bir işlem yapılmadı.';
    case 'unauthenticated':
      return 'Oturumunuz sona ermiş. Lütfen yeniden giriş yapın.';
    case 'forbidden':
      return 'Bu işlem için yetkiniz bulunmuyor.';
    case 'request_unavailable':
      return 'Değişiklik talebi bulunamadı veya artık erişilebilir değil.';
    case 'invalid_decision':
      return 'Geçersiz karar seçildi.';
    case 'invalid_transition':
      return 'Randevunun mevcut durumu bu talebin onaylanmasına izin vermiyor.';
    case 'request_already_resolved':
      return 'Bu değişiklik talebi daha önce sonuçlandırılmış.';
    case 'slot_unavailable':
      return 'Talep edilen saat artık uygun değil. Talep beklemede bırakıldı.';
    case 'idempotency_conflict':
      return 'İşlem bilgileri değişti. Lütfen listeyi yenileyip tekrar deneyin.';
    default:
      return 'İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin.';
  }
}

export const adminRescheduleService = {
  /**
   * Stage F4 — Secure RPC call to list pending reschedule requests for Admin.
   */
  async listPendingRescheduleRequests(params?: {
    limit?: number;
    cursorCreatedAt?: string;
    cursorId?: string;
  }): Promise<{
    success: boolean;
    reasonCode: string;
    requests: PendingRescheduleRequestItem[];
  }> {
    try {
      if (getDataSourceMode() === 'supabase') {
        const { data, error } = await supabase.rpc('admin_list_pending_reschedule_requests', {
          p_limit: params?.limit || 50,
          p_cursor_created_at: params?.cursorCreatedAt || null,
          p_cursor_id: params?.cursorId || null
        });

        if (error) {
          console.error('[adminRescheduleService] listPendingRescheduleRequests RPC error:', error);
          return { success: false, reasonCode: 'service_error', requests: [] };
        }

        const res = data as any;
        return {
          success: res?.success || false,
          reasonCode: res?.reason_code || 'unknown_error',
          requests: Array.isArray(res?.requests) ? res.requests : []
        };
      }
    } catch (err: any) {
      console.error('[adminRescheduleService] listPendingRescheduleRequests exception:', err);
    }

    return { success: false, reasonCode: 'service_error', requests: [] };
  },

  /**
   * Stage F4 — Secure RPC call to approve or reject a customer reschedule request.
   */
  async decideRescheduleRequest(params: {
    changeRequestId: string;
    decision: 'approved' | 'rejected';
    reason?: string;
    idempotencyKey?: string;
  }): Promise<{
    success: boolean;
    reasonCode: string;
    changed?: boolean;
    decision?: string;
    changeRequestId?: string;
    appointmentId?: string;
    previousDate?: string;
    previousTime?: string;
    appointmentDate?: string;
    appointmentTime?: string;
    requestStatus?: string;
    appointmentStatus?: string;
    message?: string;
  }> {
    if (!params.changeRequestId || !params.decision) {
      return {
        success: false,
        reasonCode: 'invalid_parameters',
        message: 'Eksik veya geçersiz parametre.'
      };
    }

    try {
      if (getDataSourceMode() === 'supabase') {
        const idempotencyKey = params.idempotencyKey || `admin_dec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const { data, error } = await supabase.rpc('admin_decide_reschedule_request', {
          p_change_request_id: params.changeRequestId,
          p_decision: params.decision,
          p_reason: params.reason ? params.reason.trim() : null,
          p_idempotency_key: idempotencyKey
        });

        if (error) {
          console.error('[adminRescheduleService] decideRescheduleRequest RPC error:', error);
          return {
            success: false,
            reasonCode: 'service_error',
            message: mapAdminDecisionReasonCodeToMessage('service_error')
          };
        }

        const res = data as any;
        const msg = mapAdminDecisionReasonCodeToMessage(res?.reason_code || 'unknown_error', params.decision);

        return {
          success: res?.success || false,
          reasonCode: res?.reason_code || 'unknown_error',
          changed: res?.changed,
          decision: res?.decision,
          changeRequestId: res?.change_request_id,
          appointmentId: res?.appointment_id,
          previousDate: res?.previous_date,
          previousTime: res?.previous_time,
          appointmentDate: res?.appointment_date,
          appointmentTime: res?.appointment_time,
          requestStatus: res?.request_status,
          appointmentStatus: res?.appointment_status,
          message: msg
        };
      }
    } catch (err: any) {
      console.error('[adminRescheduleService] decideRescheduleRequest exception:', err);
    }

    return {
      success: false,
      reasonCode: 'service_error',
      message: mapAdminDecisionReasonCodeToMessage('service_error')
    };
  }
};
