import { SupportTicket, SupportTicketStatus, SupportTicketPriority, SupportTicketSource, SupportTicketCategory } from '../types';
import { auditLogService } from './auditLogService';

const SUPPORT_TICKET_STORAGE_KEY = 'lari_support_tickets_v1';

export const supportTicketService = {
  createSupportTicket(input: {
    tenantId?: string;
    source: SupportTicketSource;
    category: SupportTicketCategory;
    priority: SupportTicketPriority;
    title: string;
    description: string;
    requesterName?: string;
    requesterEmail?: string;
    requesterPhone?: string;
    relatedAppointmentId?: string;
    relatedCustomerId?: string;
    relatedSubscriptionId?: string;
    relatedCommunicationEventId?: string;
    relatedBackgroundJobRunId?: string;
    relatedAuditEventIds?: string[];
    metadata?: any;
  }): SupportTicket {
    const tickets = this._getTicketsFromStore();

    const newTicket: SupportTicket = {
      id: `tkt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId: input.tenantId,
      source: input.source,
      category: input.category,
      priority: input.priority,
      status: 'open',
      title: input.title,
      description: input.description,
      requesterName: input.requesterName,
      requesterEmail: input.requesterEmail,
      requesterPhone: input.requesterPhone,
      relatedAppointmentId: input.relatedAppointmentId,
      relatedCustomerId: input.relatedCustomerId,
      relatedSubscriptionId: input.relatedSubscriptionId,
      relatedCommunicationEventId: input.relatedCommunicationEventId,
      relatedBackgroundJobRunId: input.relatedBackgroundJobRunId,
      relatedAuditEventIds: input.relatedAuditEventIds || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: input.metadata || {}
    };

    tickets.unshift(newTicket);
    this._saveTicketsToStore(tickets);

    // Instrument with Audit Event
    auditLogService.logAuditEvent({
      tenantId: input.tenantId,
      actorType: 'system',
      category: 'support',
      severity: input.priority === 'urgent' || input.priority === 'high' ? 'warning' : 'info',
      action: 'support_ticket_created',
      entityType: 'SupportTicket',
      entityId: newTicket.id,
      summary: `Yeni Destek Talebi Sızdırıldı: "${newTicket.title}" [Kategori: ${newTicket.category}]`,
      safeDetails: {
        ticketId: newTicket.id,
        priority: newTicket.priority,
        source: newTicket.source
      }
    });

    return newTicket;
  },

  listSupportTickets(filters?: {
    status?: SupportTicketStatus;
    priority?: SupportTicketPriority;
    category?: SupportTicketCategory;
    tenantId?: string;
  }): SupportTicket[] {
    let tickets = this._getTicketsFromStore();

    if (filters) {
      if (filters.status) {
        tickets = tickets.filter(t => t.status === filters.status);
      }
      if (filters.priority) {
        tickets = tickets.filter(t => t.priority === filters.priority);
      }
      if (filters.category) {
        tickets = tickets.filter(t => t.category === filters.category);
      }
      if (filters.tenantId) {
        tickets = tickets.filter(t => t.tenantId === filters.tenantId);
      }
    }

    return tickets;
  },

  listTenantSupportTickets(tenantId: string): SupportTicket[] {
    return this.listSupportTickets({ tenantId });
  },

  getSupportTicket(ticketId: string): SupportTicket | undefined {
    const tickets = this._getTicketsFromStore();
    return tickets.find(t => t.id === ticketId);
  },

  updateSupportTicketStatus(ticketId: string, status: SupportTicketStatus): SupportTicket | undefined {
    const tickets = this._getTicketsFromStore();
    const index = tickets.findIndex(t => t.id === ticketId);
    if (index !== -1) {
      tickets[index].status = status;
      tickets[index].updatedAt = new Date().toISOString();
      if (status === 'resolved') {
        tickets[index].resolvedAt = new Date().toISOString();
      }
      this._saveTicketsToStore(tickets);

      // Audit status transition
      auditLogService.logAuditEvent({
        tenantId: tickets[index].tenantId,
        actorType: 'super_admin',
        category: 'support',
        severity: 'info',
        action: 'support_ticket_status_updated',
        entityType: 'SupportTicket',
        entityId: ticketId,
        summary: `Destek talebi durumu güncellendi: ${status} (#${ticketId})`
      });

      return tickets[index];
    }
    return undefined;
  },

  assignSupportTicket(ticketId: string, assignee: string): SupportTicket | undefined {
    const tickets = this._getTicketsFromStore();
    const index = tickets.findIndex(t => t.id === ticketId);
    if (index !== -1) {
      tickets[index].assignedTo = assignee;
      tickets[index].updatedAt = new Date().toISOString();
      this._saveTicketsToStore(tickets);
      return tickets[index];
    }
    return undefined;
  },

  addInternalNote(ticketId: string, note: string): SupportTicket | undefined {
    const tickets = this._getTicketsFromStore();
    const index = tickets.findIndex(t => t.id === ticketId);
    if (index !== -1) {
      tickets[index].internalNotes = (tickets[index].internalNotes || '') + `\n--- [${new Date().toISOString()}] ---\n${note}`;
      tickets[index].updatedAt = new Date().toISOString();
      this._saveTicketsToStore(tickets);
      return tickets[index];
    }
    return undefined;
  },

  addPublicReply(ticketId: string, reply: string): SupportTicket | undefined {
    const tickets = this._getTicketsFromStore();
    const index = tickets.findIndex(t => t.id === ticketId);
    if (index !== -1) {
      tickets[index].publicReply = (tickets[index].publicReply || '') + `\n--- [${new Date().toISOString()}] ---\n${reply}`;
      tickets[index].updatedAt = new Date().toISOString();
      tickets[index].status = 'waiting_on_customer';
      this._saveTicketsToStore(tickets);
      return tickets[index];
    }
    return undefined;
  },

  linkAuditEventToTicket(ticketId: string, auditEventId: string): SupportTicket | undefined {
    const tickets = this._getTicketsFromStore();
    const index = tickets.findIndex(t => t.id === ticketId);
    if (index !== -1) {
      if (!tickets[index].relatedAuditEventIds.includes(auditEventId)) {
        tickets[index].relatedAuditEventIds.push(auditEventId);
        tickets[index].updatedAt = new Date().toISOString();
        this._saveTicketsToStore(tickets);
      }
      return tickets[index];
    }
    return undefined;
  },

  resolveSupportTicket(ticketId: string, resolution: string): SupportTicket | undefined {
    const tickets = this._getTicketsFromStore();
    const index = tickets.findIndex(t => t.id === ticketId);
    if (index !== -1) {
      tickets[index].status = 'resolved';
      tickets[index].resolvedAt = new Date().toISOString();
      tickets[index].internalNotes = (tickets[index].internalNotes || '') + `\n[Çözüm Önemli Notu: ${resolution}]`;
      tickets[index].updatedAt = new Date().toISOString();
      this._saveTicketsToStore(tickets);

      auditLogService.logAuditEvent({
        tenantId: tickets[index].tenantId,
        actorType: 'super_admin',
        category: 'support',
        severity: 'info',
        action: 'support_ticket_resolved',
        entityType: 'SupportTicket',
        entityId: ticketId,
        summary: `Destek talebi başarıyla çözüldü (#${ticketId})`
      });

      return tickets[index];
    }
    return undefined;
  },

  getSupportReadinessSummary() {
    const tickets = this._getTicketsFromStore();
    return {
      totalTickets: tickets.length,
      openTickets: tickets.filter(t => t.status === 'open').length,
      resolvedTickets: tickets.filter(t => t.status === 'resolved').length,
      lowPriority: tickets.filter(t => t.priority === 'low').length,
      normalPriority: tickets.filter(t => t.priority === 'normal').length,
      highPriority: tickets.filter(t => t.priority === 'high').length,
      urgentPriority: tickets.filter(t => t.priority === 'urgent').length,
      hasSelfServiceIntegration: true,
      hasOutboxEscalations: true
    };
  },

  _getTicketsFromStore(): SupportTicket[] {
    try {
      const data = localStorage.getItem(SUPPORT_TICKET_STORAGE_KEY);
      if (!data) {
        const initial: SupportTicket[] = [
          {
            id: 'tkt_default_1',
            source: 'system',
            category: 'booking',
            priority: 'normal',
            status: 'open',
            title: 'Sistem Entegrasyon Başlangıç Kontrolü',
            description: 'Canlı pilot rezervasyon akış testleri öncesi, kendi kendine hizmet ve güvenlik duvarlarının kontrolü için otomatik açılan kontrol bileti.',
            relatedAuditEventIds: ['evt_init_1'],
            createdAt: new Date(Date.now() - 3600000).toISOString(),
            updatedAt: new Date(Date.now() - 3600000).toISOString()
          }
        ];
        localStorage.setItem(SUPPORT_TICKET_STORAGE_KEY, JSON.stringify(initial));
        return initial;
      }
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  _saveTicketsToStore(tickets: SupportTicket[]): void {
    try {
      localStorage.setItem(SUPPORT_TICKET_STORAGE_KEY, JSON.stringify(tickets));
    } catch (e) {
      console.error('Failed to write support tickets', e);
    }
  }
};
