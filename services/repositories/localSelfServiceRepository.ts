import { SelfServiceRepository } from './types';
import { STORAGE_KEYS, registerMemoryResetHook } from '../storageKeys';

function getSecureRandomBytes(byteCount: number): Uint8Array {
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(byteCount);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const nodeCrypto = typeof require !== 'undefined' ? require('crypto') : null;
      if (nodeCrypto && typeof nodeCrypto.randomBytes === 'function') {
        return new Uint8Array(nodeCrypto.randomBytes(byteCount));
      }
    } catch {}
  }
  throw new Error('SEC_CSPRNG_UNAVAILABLE: Cryptographically secure random number generator is required.');
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSecureId(prefix = 'tok_', bytes = 16): string {
  const randomHex = bytesToHex(getSecureRandomBytes(bytes));
  return `${prefix}${Date.now()}_${randomHex}`;
}

let memoryTokens: any[] = [];
let memoryRequests: any[] = [];
let memoryIdempotency: Record<string, { decision: string; payload: any }> = {};

export function resetLocalSelfServiceState() {
  memoryTokens = [];
  memoryRequests = [];
  memoryIdempotency = {};
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEYS.APPOINTMENT_ACCESS_TOKENS);
    localStorage.removeItem(STORAGE_KEYS.APPOINTMENT_CHANGE_REQUESTS);
    localStorage.removeItem(STORAGE_KEYS.ADMIN_RESCHEDULE_DECISION_IDEMPOTENCY);
  }
}

// Register memory reset hook for centralized purge / reset (V1A-TECH-01)
registerMemoryResetHook(() => {
  memoryTokens = [];
  memoryRequests = [];
  memoryIdempotency = {};
});

export class LocalSelfServiceRepository implements SelfServiceRepository {
  private getStoredTokens(): any[] {
    if (typeof localStorage === 'undefined') return memoryTokens;
    const raw = localStorage.getItem(STORAGE_KEYS.APPOINTMENT_ACCESS_TOKENS);
    return raw ? JSON.parse(raw) : [];
  }

  private saveStoredTokens(tokens: any[]) {
    if (typeof localStorage === 'undefined') {
      memoryTokens = tokens;
      return;
    }
    localStorage.setItem(STORAGE_KEYS.APPOINTMENT_ACCESS_TOKENS, JSON.stringify(tokens));
  }

  private getStoredChangeRequests(): any[] {
    if (typeof localStorage === 'undefined') return memoryRequests;
    const raw = localStorage.getItem(STORAGE_KEYS.APPOINTMENT_CHANGE_REQUESTS);
    return raw ? JSON.parse(raw) : [];
  }

  private saveStoredChangeRequests(requests: any[]) {
    if (typeof localStorage === 'undefined') {
      memoryRequests = requests;
      return;
    }
    localStorage.setItem(STORAGE_KEYS.APPOINTMENT_CHANGE_REQUESTS, JSON.stringify(requests));
  }

  private getStoredIdempotency(): Record<string, { decision: string; payload: any }> {
    if (typeof localStorage === 'undefined') return memoryIdempotency;
    const raw = localStorage.getItem(STORAGE_KEYS.ADMIN_RESCHEDULE_DECISION_IDEMPOTENCY);
    return raw ? JSON.parse(raw) : {};
  }

  private saveStoredIdempotency(data: Record<string, { decision: string; payload: any }>) {
    if (typeof localStorage === 'undefined') {
      memoryIdempotency = data;
      return;
    }
    localStorage.setItem(STORAGE_KEYS.ADMIN_RESCHEDULE_DECISION_IDEMPOTENCY, JSON.stringify(data));
  }

  async listTokens(tenantId: string): Promise<any[]> {
    return this.getStoredTokens().filter(t => t.tenantId === tenantId);
  }

  async getTokenByHash(tokenHash: string): Promise<any | null> {
    return this.getStoredTokens().find(t => t.tokenHash === tokenHash) || null;
  }

  async createToken(tenantId: string, input: any): Promise<any> {
    const tokens = this.getStoredTokens();
    const newToken = {
      id: input.id || generateSecureId('tok_'),
      tenantId,
      appointmentId: input.appointmentId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: new Date().toISOString(),
      usedAt: null,
      ...input
    };
    tokens.push(newToken);
    this.saveStoredTokens(tokens);
    return newToken;
  }

  async updateToken(tokenId: string, patch: any): Promise<void> {
    const tokens = this.getStoredTokens();
    const idx = tokens.findIndex(t => t.id === tokenId);
    if (idx !== -1) {
      tokens[idx] = { ...tokens[idx], ...patch };
      this.saveStoredTokens(tokens);
    }
  }

  async listChangeRequests(tenantId: string): Promise<any[]> {
    return this.getStoredChangeRequests().filter(r => r.tenantId === tenantId);
  }

  async createChangeRequest(tenantId: string, input: any): Promise<any> {
    const requests = this.getStoredChangeRequests();
    const newRequest = {
      id: input.id || generateSecureId('req_'),
      tenantId,
      appointmentId: input.appointmentId,
      requestType: input.requestType,
      requestedBy: input.requestedBy,
      proposedDate: input.proposedDate,
      proposedTime: input.proposedTime,
      reason: input.reason,
      status: input.status || 'pending',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedBy: null,
      ...input
    };
    requests.push(newRequest);
    this.saveStoredChangeRequests(requests);
    return newRequest;
  }

  async updateChangeRequest(requestId: string, patch: any): Promise<void> {
    const requests = this.getStoredChangeRequests();
    const idx = requests.findIndex(r => r.id === requestId);
    if (idx !== -1) {
      requests[idx] = { ...requests[idx], ...patch };
      this.saveStoredChangeRequests(requests);
    }
  }

  async listPendingRescheduleRequests(tenantId?: string): Promise<any[]> {
    const requests = this.getStoredChangeRequests().filter(r => 
      (!tenantId || r.tenantId === tenantId) && 
      r.requestType === 'reschedule' && 
      (r.status === 'requested' || r.status === 'pending')
    );

    const { getBookingRepository } = await import('./index');
    const bookingRepo = getBookingRepository();
    const result: any[] = [];

    for (const req of requests) {
      const apt = await bookingRepo.getAppointmentById(req.appointmentId);
      result.push({
        change_request_id: req.id,
        appointment_id: req.appointmentId,
        tenant_id: req.tenantId,
        request_type: req.requestType,
        request_status: req.status || 'pending',
        proposed_date: req.proposedDate || req.proposed_date || '',
        proposed_time: req.proposedTime || req.proposed_time || '',
        customer_reason: req.reason || req.customer_reason || '',
        resolution_reason: req.resolutionReason || req.resolution_reason || '',
        created_at: req.createdAt || req.created_at || new Date().toISOString(),
        current_appointment_date: apt?.date || (apt as any)?.appointment_date || '',
        current_appointment_time: apt?.time || (apt as any)?.appointment_time || '',
        current_appointment_status: apt?.status || '',
        customer_name: apt?.user_name || (apt as any)?.customer_name || '',
        customer_phone: apt?.phone || (apt as any)?.customer_phone || '',
        staff_name: (apt as any)?.staff?.name || '',
        service_name: (apt as any)?.service?.name || (apt as any)?.service?.name_tr || '',
        branch_name: (apt as any)?.branch?.name || ''
      });
    }

    return result;
  }

  async decideRescheduleRequest(params: {
    tenantId?: string;
    changeRequestId: string;
    decision: 'approved' | 'rejected';
    reason?: string;
    actorId?: string;
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
  }> {
    const trimmedDecision = (params.decision || '').toLowerCase().trim();
    if (trimmedDecision !== 'approved' && trimmedDecision !== 'rejected') {
      return { success: false, reasonCode: 'invalid_decision' };
    }

    if (!params.changeRequestId) {
      return { success: false, reasonCode: 'request_unavailable' };
    }

    // Check Idempotency Table
    if (params.idempotencyKey) {
      const trimmedKey = params.idempotencyKey.trim();
      const idem = this.getStoredIdempotency();
      if (idem[trimmedKey]) {
        if (idem[trimmedKey].decision === trimmedDecision) {
          return idem[trimmedKey].payload;
        } else {
          return { success: false, reasonCode: 'idempotency_conflict' };
        }
      }
    }

    const requests = this.getStoredChangeRequests();
    const req = requests.find(r => r.id === params.changeRequestId);
    if (!req) {
      return { success: false, reasonCode: 'request_unavailable' };
    }

    if (params.tenantId && req.tenantId !== params.tenantId) {
      return { success: false, reasonCode: 'request_unavailable' };
    }

    if (req.requestType !== 'reschedule') {
      return { success: false, reasonCode: 'request_unavailable' };
    }

    if (req.status && req.status !== 'pending' && req.status !== 'requested') {
      return {
        success: false,
        reasonCode: 'request_already_resolved',
        changed: false,
        changeRequestId: req.id,
        requestStatus: req.status
      };
    }

    const { getBookingRepository } = await import('./index');
    const bookingRepo = getBookingRepository();
    const apt = await bookingRepo.getAppointmentById(req.appointmentId);
    if (!apt) {
      return { success: false, reasonCode: 'request_unavailable' };
    }

    const prevDate = apt.date || (apt as any).appointment_date || '';
    const prevTime = apt.time || (apt as any).appointment_time || '';

    if (trimmedDecision === 'rejected') {
      req.status = 'rejected';
      req.resolvedAt = new Date().toISOString();
      req.resolvedBy = params.actorId || 'local_owner';
      req.resolutionReason = params.reason ? params.reason.trim() : null;
      this.saveStoredChangeRequests(requests);

      const response = {
        success: true,
        reasonCode: 'ok',
        changed: true,
        decision: 'rejected',
        changeRequestId: req.id,
        appointmentId: apt.id,
        previousDate: prevDate,
        previousTime: prevTime,
        appointmentDate: prevDate,
        appointmentTime: prevTime,
        requestStatus: 'rejected',
        appointmentStatus: apt.status
      };

      if (params.idempotencyKey) {
        const idem = this.getStoredIdempotency();
        idem[params.idempotencyKey.trim()] = { decision: 'rejected', payload: response };
        this.saveStoredIdempotency(idem);
      }

      try {
        const { getAuditEventRepository, getCommunicationOutboxRepository } = await import('./index');
        const auditRepo = getAuditEventRepository();
        await auditRepo.createEvent({
          tenantId: apt.tenantId || req.tenantId,
          tenant_id: apt.tenantId || req.tenantId,
          actorId: params.actorId || 'local_owner',
          actor_id: params.actorId || 'local_owner',
          actorRole: 'tenant_owner',
          actor_role: 'tenant_owner',
          action: 'appointment_reschedule_rejected',
          entityType: 'appointment',
          resource_type: 'appointment',
          entityId: apt.id,
          resource_id: apt.id,
          payload: { change_request_id: req.id, rejection_reason: params.reason || null },
          metadata: { change_request_id: req.id, rejection_reason: params.reason || null }
        });
        if (apt.phone && apt.phone.trim()) {
          const outboxRepo = getCommunicationOutboxRepository();
          await outboxRepo.enqueueEvent(apt.tenantId || req.tenantId, {
            recipient: apt.phone,
            channel: 'whatsapp',
            message: 'Randevu değişiklik talebiniz işletme tarafından reddedildi.',
            status: 'queued',
            metadata: {
              event_type: 'reschedule_request_rejected',
              appointment_id: apt.id,
              change_request_id: req.id,
              reason: params.reason || null
            }
          });
        }
      } catch (logErr) {
        console.warn('Non-blocking audit/outbox error in local reschedule reject:', logErr);
      }

      return response;
    }

    if (trimmedDecision === 'approved') {
      if (apt.status !== 'confirmed') {
        return {
          success: false,
          reasonCode: 'invalid_transition',
          changed: false,
          appointmentId: apt.id,
          appointmentStatus: apt.status
        };
      }

      const proposedDate = req.proposedDate || req.proposed_date;
      const proposedTime = req.proposedTime || req.proposed_time;
      if (!proposedDate || !proposedTime) {
        return { success: false, reasonCode: 'slot_unavailable' };
      }

      const today = new Date().toISOString().split('T')[0];
      if (proposedDate < today) {
        return {
          success: false,
          reasonCode: 'slot_unavailable',
          changed: false,
          appointmentId: apt.id
        };
      }

      // Check for overlap against active appointments for the same staff
      const allAppointments = await bookingRepo.listAppointments(req.tenantId);
      const targetStaffId = apt.staffId || (apt as any).staff_id;
      const hasConflict = allAppointments.some(a => {
        if (a.id === apt.id) return false;
        if (a.status !== 'confirmed' && a.status !== 'completed') return false;
        const sId = a.staffId || (a as any).staff_id;
        if (targetStaffId && sId && sId !== targetStaffId) return false;
        const aDate = a.date || (a as any).appointment_date;
        const aTime = a.time || (a as any).appointment_time;
        return aDate === proposedDate && aTime === proposedTime;
      });

      if (hasConflict) {
        return {
          success: false,
          reasonCode: 'slot_unavailable',
          changed: false,
          appointmentId: apt.id
        };
      }

      // Atomic update of appointment date and time
      await bookingRepo.updateAppointment(apt.id, {
        date: proposedDate,
        appointment_date: proposedDate,
        time: proposedTime,
        appointment_time: proposedTime
      } as any);

      req.status = 'approved';
      req.resolvedAt = new Date().toISOString();
      req.resolvedBy = params.actorId || 'local_owner';
      this.saveStoredChangeRequests(requests);

      const response = {
        success: true,
        reasonCode: 'ok',
        changed: true,
        decision: 'approved',
        changeRequestId: req.id,
        appointmentId: apt.id,
        previousDate: prevDate,
        previousTime: prevTime,
        appointmentDate: proposedDate,
        appointmentTime: proposedTime,
        requestStatus: 'approved',
        appointmentStatus: 'confirmed'
      };

      if (params.idempotencyKey) {
        const idem = this.getStoredIdempotency();
        idem[params.idempotencyKey.trim()] = { decision: 'approved', payload: response };
        this.saveStoredIdempotency(idem);
      }

      try {
        const { getAuditEventRepository, getCommunicationOutboxRepository } = await import('./index');
        const auditRepo = getAuditEventRepository();
        await auditRepo.createEvent({
          tenantId: apt.tenantId || req.tenantId,
          tenant_id: apt.tenantId || req.tenantId,
          actorId: params.actorId || 'local_owner',
          actor_id: params.actorId || 'local_owner',
          actorRole: 'tenant_owner',
          actor_role: 'tenant_owner',
          action: 'appointment_reschedule_approved',
          entityType: 'appointment',
          resource_type: 'appointment',
          entityId: apt.id,
          resource_id: apt.id,
          payload: {
            change_request_id: req.id,
            previous_date: prevDate,
            previous_time: prevTime,
            approved_date: proposedDate,
            approved_time: proposedTime
          },
          metadata: {
            change_request_id: req.id,
            previous_date: prevDate,
            previous_time: prevTime,
            approved_date: proposedDate,
            approved_time: proposedTime
          }
        });
        if (apt.phone && apt.phone.trim()) {
          const outboxRepo = getCommunicationOutboxRepository();
          await outboxRepo.enqueueEvent(apt.tenantId || req.tenantId, {
            recipient: apt.phone,
            channel: 'whatsapp',
            message: `Randevunuz ${proposedDate} saat ${proposedTime} olarak güncellenmiştir.`,
            status: 'queued',
            metadata: {
              event_type: 'reschedule_request_approved',
              appointment_id: apt.id,
              change_request_id: req.id,
              previous_date: prevDate,
              previous_time: prevTime,
              appointment_date: proposedDate,
              appointment_time: proposedTime
            }
          });
        }
      } catch (logErr) {
        console.warn('Non-blocking audit/outbox error in local reschedule approve:', logErr);
      }

      return response;
    }

    return { success: false, reasonCode: 'invalid_decision' };
  }
}
