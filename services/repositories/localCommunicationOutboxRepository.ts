import { CommunicationOutboxRepository } from './types';

export class LocalCommunicationOutboxRepository implements CommunicationOutboxRepository {
  private getStoredEvents(): any[] {
    const raw = localStorage.getItem('lari_communication_events');
    return raw ? JSON.parse(raw) : [];
  }

  private saveStoredEvents(events: any[]) {
    localStorage.setItem('lari_communication_events', JSON.stringify(events));
  }

  async listEvents(tenantId: string): Promise<any[]> {
    return this.getStoredEvents().filter(e => e.tenantId === tenantId);
  }

  async enqueueEvent(tenantId: string, event: any): Promise<any> {
    const events = this.getStoredEvents();
    const newEvent = {
      id: event.id || `comm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId,
      branchId: event.branchId,
      customerId: event.customerId,
      appointmentId: event.appointmentId,
      subscriptionId: event.subscriptionId,
      audience: event.audience,
      channel: event.channel,
      type: event.type,
      status: event.status || 'queued',
      language: event.language || 'tr',
      subject: event.subject,
      body: event.body,
      metadata: event.metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      failureReason: event.failureReason,
      internalOnly: !!event.internalOnly,
      ...event
    };
    events.unshift(newEvent);
    this.saveStoredEvents(events);
    return newEvent;
  }

  async updateDeliveryStatus(tenantId: string, eventId: string, status: string, notes?: string): Promise<void> {
    const events = this.getStoredEvents();
    const idx = events.findIndex(e => e.id === eventId);
    if (idx !== -1) {
      events[idx].status = status;
      if (notes) {
        events[idx].failureReason = notes;
      }
      events[idx].updatedAt = new Date().toISOString();
      this.saveStoredEvents(events);
    }
  }
}
