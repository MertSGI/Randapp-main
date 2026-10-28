import { CommunicationOutboxRepository } from './types';

export class LocalCommunicationOutboxRepository implements CommunicationOutboxRepository {
  private getStoredEvents(): any[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }
    try {
      const raw = localStorage.getItem('lari_communication_events');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveStoredEvents(events: any[]) {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem('lari_communication_events', JSON.stringify(events));
    } catch {}
  }

  async listEvents(tenantId: string): Promise<any[]> {
    return this.getStoredEvents().filter(e => e.tenantId === tenantId);
  }

  async enqueueEvent(tenantId: string, event: any): Promise<any> {
    const events = this.getStoredEvents();
    const newEvent = {
      id: event.id || `comm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
      ...event,
      // Enforce tenantId belongs to the authorized tenant and cannot be spoofed
      tenantId: tenantId
    };
    events.unshift(newEvent);
    this.saveStoredEvents(events);
    return newEvent;
  }

  async updateDeliveryStatus(
    tenantId: string,
    eventId: string,
    status: string,
    notes?: string,
    options?: { verifiedProviderReceipt?: boolean }
  ): Promise<void> {
    const events = this.getStoredEvents();
    const idx = events.findIndex(e => e.id === eventId);
    if (idx === -1) {
      return;
    }

    // Defect E-1: Cross-tenant update check
    if (events[idx].tenantId !== tenantId) {
      throw new Error(`Cross-tenant outbox violation: event ${eventId} belongs to tenant ${events[idx].tenantId}, not ${tenantId}`);
    }

    // Defect E-4: Browser cannot fabricate sent or delivered status
    if (status === 'sent' || status === 'delivered') {
      throw new Error(`Browser client cannot assert delivery status '${status}' without verified provider receipt`);
    }

    events[idx].status = status;
    if (notes) {
      events[idx].failureReason = notes;
    }
    events[idx].updatedAt = new Date().toISOString();
    this.saveStoredEvents(events);
  }
}
