import { SupportTicketRepository } from './types';

export class LocalSupportTicketRepository implements SupportTicketRepository {
  private getStoredTickets(): any[] {
    const raw = localStorage.getItem('lari_support_tickets_v1');
    return raw ? JSON.parse(raw) : [];
  }

  private saveStoredTickets(tickets: any[]) {
    localStorage.setItem('lari_support_tickets_v1', JSON.stringify(tickets));
  }

  async listTickets(tenantId?: string): Promise<any[]> {
    const tickets = this.getStoredTickets();
    if (tenantId) {
      return tickets.filter(t => t.tenantId === tenantId);
    }
    return tickets;
  }

  async createTicket(ticket: any): Promise<any> {
    const tickets = this.getStoredTickets();
    const newTicket = {
      id: ticket.id || `tkt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId: ticket.tenantId,
      source: ticket.source,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status || 'open',
      title: ticket.title,
      description: ticket.description,
      requesterName: ticket.requesterName,
      requesterEmail: ticket.requesterEmail,
      requesterPhone: ticket.requesterPhone,
      relatedAppointmentId: ticket.relatedAppointmentId,
      relatedCustomerId: ticket.relatedCustomerId,
      relatedSubscriptionId: ticket.relatedSubscriptionId,
      relatedCommunicationEventId: ticket.relatedCommunicationEventId,
      relatedBackgroundJobRunId: ticket.relatedBackgroundJobRunId,
      relatedAuditEventIds: ticket.relatedAuditEventIds || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: ticket.metadata || {},
      ...ticket
    };
    tickets.unshift(newTicket);
    this.saveStoredTickets(tickets);
    return newTicket;
  }

  async updateTicket(ticketId: string, patch: any): Promise<any> {
    const tickets = this.getStoredTickets();
    const idx = tickets.findIndex(t => t.id === ticketId);
    if (idx !== -1) {
      tickets[idx] = { ...tickets[idx], ...patch, updatedAt: new Date().toISOString() };
      this.saveStoredTickets(tickets);
      return tickets[idx];
    }
    return null;
  }
}
