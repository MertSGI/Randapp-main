import { AuditEventRepository } from './types';

export class LocalAuditEventRepository implements AuditEventRepository {
  private getStoredEvents(): any[] {
    const raw = localStorage.getItem('lari_audit_events_v1');
    return raw ? JSON.parse(raw) : [];
  }

  private saveStoredEvents(events: any[]) {
    localStorage.setItem('lari_audit_events_v1', JSON.stringify(events));
  }

  async listEvents(tenantId?: string): Promise<any[]> {
    const events = this.getStoredEvents();
    if (tenantId) {
      return events.filter(e => e.tenantId === tenantId);
    }
    return events;
  }

  async createEvent(event: any): Promise<any> {
    const events = this.getStoredEvents();
    const newEvent = {
      id: event.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId: event.tenantId,
      actorType: event.actorType,
      actorId: event.actorId,
      category: event.category,
      severity: event.severity,
      action: event.action,
      status: event.status || 'recorded',
      entityType: event.entityType,
      entityId: event.entityId,
      correlationId: event.correlationId,
      requestId: event.requestId,
      summary: event.summary,
      safeDetails: event.safeDetails,
      redactionApplied: event.redactionApplied || false,
      createdAt: event.createdAt || new Date().toISOString(),
      metadata: event.metadata || {},
      ...event
    };
    events.unshift(newEvent);
    this.saveStoredEvents(events);
    return newEvent;
  }
}
