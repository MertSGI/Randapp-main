import { CommunicationOutboxRepository } from './types';
import { STORAGE_KEYS } from '../storageKeys';

export class LocalCommunicationOutboxRepository implements CommunicationOutboxRepository {
  private readonly providerOnlyStatuses = new Set(['sent', 'delivered', 'accepted_by_provider']);

  private requireNonBlank(value: string, fieldName: string) {
    if (!value || !value.trim()) {
      throw new Error(`Local outbox requires nonblank ${fieldName}`);
    }
  }

  private getStoredEvents(): any[] {
    if (typeof localStorage === 'undefined') {
      throw new Error('Local outbox persistence is unavailable in this runtime');
    }
    let raw: string | null;
    try {
      raw = localStorage.getItem(STORAGE_KEYS.COMMUNICATION_EVENTS);
    } catch {
      throw new Error('Local outbox persistence read failed');
    }
    if (raw === null || raw === '') {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error('Stored outbox must be an array');
      }
      return parsed;
    } catch {
      throw new Error('Local outbox persistence contains invalid stored event data');
    }
  }

  private saveStoredEvents(events: any[]) {
    if (typeof localStorage === 'undefined') {
      throw new Error('Local outbox persistence is unavailable in this runtime');
    }
    try {
      localStorage.setItem(STORAGE_KEYS.COMMUNICATION_EVENTS, JSON.stringify(events));
    } catch {
      throw new Error('Local outbox persistence failed');
    }
  }

  async listEvents(tenantId: string): Promise<any[]> {
    return this.getStoredEvents().filter(e => e.tenantId === tenantId);
  }

  async enqueueEvent(tenantId: string, event: any): Promise<any> {
    this.requireNonBlank(tenantId, 'tenantId');
    if (this.providerOnlyStatuses.has(event?.status)) {
      throw new Error(`Local outbox cannot enqueue provider-only status '${event.status}'`);
    }

    const events = this.getStoredEvents();
    const providedId = event?.id;
    if (providedId !== null && providedId !== undefined) {
      if (typeof providedId !== 'string') {
        throw new Error('Local outbox requires a string eventId');
      }
      this.requireNonBlank(providedId, 'eventId');
    }
    const id = providedId == null
      ? `comm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      : providedId;
    if (events.some(e => e.tenantId === tenantId && e.id === id)) {
      throw new Error('Local outbox already contains this event id for the tenant');
    }

    const newEvent = {
      branchId: event.branchId,
      customerId: event.customerId,
      appointmentId: event.appointmentId,
      subscriptionId: event.subscriptionId,
      audience: event.audience,
      channel: event.channel,
      type: event.type,
      language: event.language || 'tr',
      subject: event.subject,
      body: event.body,
      metadata: event.metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      failureReason: event.failureReason,
      internalOnly: !!event.internalOnly,
      ...event,
      // Override caller fields after the spread: never lose generated canonical ID/status.
      id,
      status: event.status || 'queued',
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
    this.requireNonBlank(tenantId, 'tenantId');
    this.requireNonBlank(eventId, 'eventId');
    if (this.providerOnlyStatuses.has(status)) {
      throw new Error(`Local outbox cannot set provider-only status '${status}' from browser state`);
    }

    const events = this.getStoredEvents();
    const matchingEvents = events.filter(e => e.tenantId === tenantId && e.id === eventId);
    if (matchingEvents.length === 0) {
      throw new Error('Local outbox event not found for tenant');
    }
    if (matchingEvents.length > 1) {
      throw new Error('Local outbox has duplicate event ids for tenant');
    }

    const idx = events.findIndex(e => e.tenantId === tenantId && e.id === eventId);
    if (events[idx]?.status === 'skipped' && status === 'queued') {
      throw new Error("Local outbox cannot move terminal status 'skipped' back to 'queued'");
    }

    events[idx].status = status;
    if (notes) {
      events[idx].failureReason = notes;
    }
    events[idx].updatedAt = new Date().toISOString();
    this.saveStoredEvents(events);
  }
}
