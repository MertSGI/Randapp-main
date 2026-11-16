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

  async listEvents(tenantId: string, filter?: { status?: string }): Promise<any[]> {
    const list = this.getStoredEvents().filter(e => e.tenantId === tenantId);
    if (filter?.status) {
      return list.filter(e => e.status === filter.status);
    }
    return list;
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
    if (events[idx]?.status === 'skipped' && status !== 'skipped') {
      throw new Error(`Local outbox cannot move terminal status 'skipped' back to '${status}'`);
    }
    if (events[idx]?.status === 'dead_letter' && status !== 'dead_letter') {
      throw new Error(`Local outbox cannot move terminal status 'dead_letter' back to '${status}' without explicit revival`);
    }

    events[idx].status = status;
    if (notes) {
      events[idx].failureReason = notes;
    }
    events[idx].updatedAt = new Date().toISOString();
    this.saveStoredEvents(events);
  }

  async scheduleRetry(
    tenantId: string,
    eventId: string,
    options?: { nextRetryAt?: string; delayMs?: number; reason?: string; retryCount?: number }
  ): Promise<any> {
    this.requireNonBlank(tenantId, 'tenantId');
    this.requireNonBlank(eventId, 'eventId');
    const events = this.getStoredEvents();
    const idx = events.findIndex(e => e.tenantId === tenantId && e.id === eventId);
    if (idx === -1) {
      throw new Error('Local outbox event not found for tenant');
    }
    if (events[idx].status === 'delivered') {
      throw new Error(`Cannot schedule retry for delivered event ${eventId}`);
    }
    if (events[idx].status === 'skipped') {
      throw new Error(`Cannot schedule retry for skipped event ${eventId}`);
    }
    if (events[idx].status === 'dead_letter') {
      throw new Error(`Cannot schedule retry for dead_letter event ${eventId}: terminal state`);
    }

    const currentRetryCount = options?.retryCount !== undefined
      ? options.retryCount
      : ((events[idx].retryCount || events[idx].metadata?.retryCount || 0) + 1);

    const delay = options?.delayMs !== undefined ? options.delayMs : 1000 * Math.pow(2, currentRetryCount - 1);
    const nextRetryAt = options?.nextRetryAt || new Date(Date.now() + delay).toISOString();

    events[idx].status = 'retry_scheduled';
    events[idx].retryCount = currentRetryCount;
    events[idx].nextRetryAt = nextRetryAt;
    if (options?.reason) {
      events[idx].failureReason = options.reason;
    }
    events[idx].metadata = {
      ...(events[idx].metadata || {}),
      retryCount: currentRetryCount,
      nextRetryAt,
      lastRetryScheduledAt: new Date().toISOString()
    };
    events[idx].updatedAt = new Date().toISOString();
    this.saveStoredEvents(events);
    return events[idx];
  }

  async moveToDeadLetter(
    tenantId: string,
    eventId: string,
    reason: string
  ): Promise<any> {
    this.requireNonBlank(tenantId, 'tenantId');
    this.requireNonBlank(eventId, 'eventId');
    const events = this.getStoredEvents();
    const idx = events.findIndex(e => e.tenantId === tenantId && e.id === eventId);
    if (idx === -1) {
      throw new Error('Local outbox event not found for tenant');
    }
    if (events[idx].status === 'delivered') {
      throw new Error(`Cannot move delivered event ${eventId} to dead_letter`);
    }
    if (events[idx].status === 'skipped') {
      throw new Error(`Cannot move skipped event ${eventId} to dead_letter: consent was denied`);
    }

    events[idx].status = 'dead_letter';
    events[idx].failureReason = reason;
    events[idx].metadata = {
      ...(events[idx].metadata || {}),
      deadLetterAt: new Date().toISOString(),
      deadLetterReason: reason
    };
    events[idx].updatedAt = new Date().toISOString();
    this.saveStoredEvents(events);
    return events[idx];
  }

  async handleRetrySweep(
    tenantId?: string,
    options?: { sweepTime?: string | number | Date }
  ): Promise<{ affectedRecordCount: number; affectedTenantIds: string[] }> {
    const events = this.getStoredEvents();
    const affectedTenantIds: string[] = [];
    let affectedRecordCount = 0;
    const sweepTimestamp = options?.sweepTime ? new Date(options.sweepTime).getTime() : Date.now();

    for (const ev of events) {
      if (tenantId && ev.tenantId !== tenantId) continue;
      if (ev.status === 'retry_scheduled') {
        const nextRetryRaw = ev.nextRetryAt || ev.metadata?.nextRetryAt;
        if (!nextRetryRaw) continue;
        const nextRetryTime = new Date(nextRetryRaw).getTime();
        if (isNaN(nextRetryTime) || nextRetryTime > sweepTimestamp) {
          continue;
        }

        const retryCount = (ev.retryCount || ev.metadata?.retryCount || 0);
        if (retryCount >= 3) {
          ev.status = 'dead_letter';
          ev.failureReason = 'Max retry attempts exhausted (dead_letter)';
          ev.metadata = { ...(ev.metadata || {}), deadLetterAt: new Date().toISOString() };
        } else {
          ev.status = 'rendered';
          ev.retryCount = retryCount + 1;
          ev.metadata = { ...(ev.metadata || {}), retryCount: retryCount + 1, retriedAt: new Date().toISOString() };
        }
        ev.updatedAt = new Date().toISOString();
        if (!affectedTenantIds.includes(ev.tenantId)) {
          affectedTenantIds.push(ev.tenantId);
        }
        affectedRecordCount++;
      }
    }

    if (affectedRecordCount > 0) {
      this.saveStoredEvents(events);
    }

    return { affectedRecordCount, affectedTenantIds };
  }
}
