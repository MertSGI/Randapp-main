import { 
  DataRightsRequest, 
  DataRightsRequestType, 
  DataRightsRequestStatus 
} from '../types';
import { auditLogService } from './auditLogService';
import { supportTicketService } from './supportTicketService';
import { getDataSourceMode } from './dataSourceConfig';

const RIGHTS_STORAGE_KEY = 'lari_data_rights_requests_v1';

export interface CreateRightsRequestInput {
  tenantId?: string;
  requesterType: 'customer' | 'tenant_owner' | 'staff';
  requesterName?: string;
  requesterContact?: string;
  type: DataRightsRequestType;
  description: string;
  relatedCustomerId?: string;
  relatedAppointmentId?: string;
  metadata?: any;
}

export const dataRightsRequestService = {
  /**
   * Creates a data rights request and creates an associated high-priority support ticket for manual team verification.
   * In persistent (supabase) mode, direct client creation is rejected fail-closed.
   */
  createDataRightsRequest(input: CreateRightsRequestInput): DataRightsRequest {
    if (getDataSourceMode() === 'supabase') {
      throw new Error(
        'LEGAL_PERSISTENCE_REQUIRED: Direct client data rights request cannot be recorded in persistent mode. Trusted server capability required.'
      );
    }

    const list = this._getRequestsFromStore();
    const id = `drq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Redact requester contact
    const safeContact = input.requesterContact ? auditLogService.redactAuditPayload(input.requesterContact) : undefined;

    const request: DataRightsRequest = {
      id,
      tenantId: input.tenantId,
      requesterType: input.requesterType,
      requesterName: input.requesterName || 'İsimsiz Kullanıcı',
      requesterContact: safeContact,
      type: input.type,
      status: 'submitted',
      description: input.description,
      relatedCustomerId: input.relatedCustomerId,
      relatedAppointmentId: input.relatedAppointmentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: input.metadata || {}
    };

    list.push(request);
    this._saveRequestsToStore(list);

    // Write to audit logs
    auditLogService.logAuditEvent({
      tenantId: input.tenantId,
      actorType: input.requesterType === 'tenant_owner' ? 'tenant_owner' : 'customer',
      actorId: input.relatedCustomerId || 'unknown',
      category: 'data_export',
      severity: 'warning',
      action: 'data_rights_request_submitted',
      summary: `KVKK Veri Hakkı Talebi Alındı: ${input.type.toUpperCase()}`,
      safeDetails: {
        requestId: id,
        type: input.type,
        requesterType: input.requesterType
      }
    });

    // Create a support ticket automatically to track this data rights operation
    try {
      const ticketTitle = `[KVKK VERİ HAKKI TALEBİ] - ${input.type.toUpperCase()} - ${request.requesterName}`;
      const ticketDescription = `Talep Eden: ${request.requesterName} (${input.requesterType})\nTürü: ${input.type.toUpperCase()}\nAçıklama: ${input.description}\n\nBu işlem veri tabanı bütünlüğü ve KVKK kanuni süreleri gereğince manuel doğrulama ve yönetici onayı gerektirmektedir.`;
      
      const ticket = supportTicketService.createSupportTicket({
        tenantId: input.tenantId,
        source: input.requesterType === 'tenant_owner' ? 'tenant_owner' : 'customer_self_service',
        category: 'data_export',
        priority: 'high',
        title: ticketTitle,
        description: ticketDescription,
        requesterName: request.requesterName,
        requesterEmail: input.requesterType === 'customer' ? safeContact : undefined,
        relatedCustomerId: input.relatedCustomerId,
        relatedAppointmentId: input.relatedAppointmentId,
        metadata: { relatedDataRightsRequestId: id }
      });

      if (ticket) {
        request.metadata = { ...request.metadata, linkedSupportTicketId: ticket.id };
        this._saveRequestsToStore(list);
      }
    } catch (err) {
      console.warn('Failed to auto-create support ticket for data rights request:', err);
    }

    return request;
  },

  /**
   * Lists data rights requests with filters.
   */
  listDataRightsRequests(filters?: {
    tenantId?: string;
    type?: DataRightsRequestType;
    status?: DataRightsRequestStatus;
  }): DataRightsRequest[] {
    const list = this._getRequestsFromStore();
    let filtered = [...list];

    if (filters) {
      if (filters.tenantId) {
        filtered = filtered.filter(r => r.tenantId === filters.tenantId);
      }
      if (filters.type) {
        filtered = filtered.filter(r => r.type === filters.type);
      }
      if (filters.status) {
        filtered = filtered.filter(r => r.status === filters.status);
      }
    }

    return filtered;
  },

  /**
   * Alias method for listing requests (for QA contract compliance).
   */
  listRequests(filters?: any): DataRightsRequest[] {
    return this.listDataRightsRequests(filters);
  },

  /**
   * Updates status of a data rights request.
   * In persistent mode, client mutation is rejected fail-closed.
   */
  updateDataRightsRequestStatus(id: string, status: DataRightsRequestStatus, internalNotes?: string): DataRightsRequest | null {
    if (getDataSourceMode() === 'supabase') {
      throw new Error(
        'LEGAL_PERSISTENCE_REQUIRED: Direct client data rights request status update cannot be performed in persistent mode. Trusted server capability required.'
      );
    }

    const list = this._getRequestsFromStore();
    const request = list.find(r => r.id === id);
    if (request) {
      request.status = status;
      request.updatedAt = new Date().toISOString();
      if (status === 'completed') {
        request.completedAt = new Date().toISOString();
      }
      if (internalNotes) {
        request.internalNotes = internalNotes;
      }
      this._saveRequestsToStore(list);

      // Log event
      auditLogService.logAuditEvent({
        tenantId: request.tenantId,
        actorType: 'tenant_owner',
        category: 'data_export',
        severity: 'info',
        action: 'data_rights_request_status_updated',
        summary: `KVKK talebi güncellendi: ${request.type} -> ${status}`,
        safeDetails: {
          requestId: id,
          status,
          type: request.type
        }
      });

      return request;
    }
    return null;
  },

  /**
   * Alias method for updating request status (for QA contract compliance).
   */
  updateRequestStatus(id: string, status: DataRightsRequestStatus, internalNotes?: string): DataRightsRequest | null {
    return this.updateDataRightsRequestStatus(id, status, internalNotes);
  },

  /**
   * Links a request manually to an existing support ticket.
   */
  linkToSupportTicket(requestId: string, ticketId: string): DataRightsRequest | null {
    if (getDataSourceMode() === 'supabase') {
      throw new Error('LEGAL_PERSISTENCE_REQUIRED: Direct client support ticket linking is prohibited in persistent mode. Trusted server capability required.');
    }
    const list = this._getRequestsFromStore();
    const request = list.find(r => r.id === requestId);
    if (request) {
      if (!request.metadata) request.metadata = {};
      request.metadata.linkedSupportTicketId = ticketId;
      request.updatedAt = new Date().toISOString();
      this._saveRequestsToStore(list);
      return request;
    }
    return null;
  },

  /**
   * Generates a readiness summary report.
   */
  getDataRightsReadinessSummary() {
    const isSupabase = getDataSourceMode() === 'supabase';
    if (isSupabase) {
      return {
        totalRequests: 0,
        submitted: 0,
        inReview: 0,
        completed: 0,
        rejected: 0,
        byType: { access: 0, export: 0, deletion: 0, correction: 0, consent_withdrawal: 0 },
        requiresManualApproval: true,
        hasLinkedSupportTickets: false,
        serverProofVerified: false,
        readinessStatus: 'UNAVAILABLE_PENDING_SERVER_API',
        serverVerificationRequired: true,
        persistenceMode: 'unconfigured_server'
      };
    }
    const list = this._getRequestsFromStore();
    return {
      totalRequests: list.length,
      submitted: list.filter(r => r.status === 'submitted').length,
      inReview: list.filter(r => r.status === 'in_review').length,
      completed: list.filter(r => r.status === 'completed').length,
      rejected: list.filter(r => r.status === 'rejected').length,
      byType: {
        access: list.filter(r => r.type === 'access').length,
        export: list.filter(r => r.type === 'export').length,
        deletion: list.filter(r => r.type === 'deletion').length,
        correction: list.filter(r => r.type === 'correction').length,
        consent_withdrawal: list.filter(r => r.type === 'consent_withdrawal').length
      },
      requiresManualApproval: true,
      hasLinkedSupportTickets: list.every(r => !!r.metadata?.linkedSupportTicketId || r.status !== 'submitted'),
      serverProofVerified: false,
      persistenceMode: isSupabase ? 'unconfigured_server' : 'local_preview_simulation'
    };
  },

  // Helper storage routines
  _getRequestsFromStore(): DataRightsRequest[] {
    try {
      if (typeof window === 'undefined') return [];
      const data = localStorage.getItem(RIGHTS_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  _saveRequestsToStore(list: DataRightsRequest[]): void {
    try {
      if (typeof window !== 'undefined' && getDataSourceMode() !== 'supabase') {
        localStorage.setItem(RIGHTS_STORAGE_KEY, JSON.stringify(list));
      }
    } catch (e) {
      console.error('Failed to write data rights requests to storage', e);
    }
  }
};
