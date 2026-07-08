import { AuditEvent, AuditActorType, AuditEventCategory, AuditEventSeverity, AuditEventStatus } from '../types';

const AUDIT_STORAGE_KEY = 'lari_audit_events_v1';

export const auditLogService = {
  /**
   * Generates a correlation ID to chain events (e.g. corr_appt_123)
   */
  createCorrelationId(prefix: string): string {
    const randomHex = Math.random().toString(16).substring(2, 10);
    return `corr_${prefix}_${randomHex}`;
  },

  /**
   * Safe payload redactor recursively stripping passwords, card numbers,
   * raw tokens, private notes, secrets, and large base64 attachments.
   */
  redactAuditPayload(payload: any): any {
    if (!payload) return payload;
    if (typeof payload !== 'object') {
      if (typeof payload === 'string') {
        // Redact any possible base64 large assets or raw secrets
        if (payload.startsWith('data:image/') && payload.includes(';base64,')) {
          return '[REDACTED_BASE64_IMAGE_DATA]';
        }
        if (payload.includes('apt_tok_')) {
          return payload.replace(/apt_tok_[a-zA-Z0-9_-]+/g, '[REDACTED_TOKEN]');
        }
      }
      return payload;
    }

    if (Array.isArray(payload)) {
      return payload.map(item => this.redactAuditPayload(item));
    }

    const redacted: any = {};
    const sensitiveKeys = [
      'password', 'pass', 'passwordConfirm', 'pin', 'otp',
      'cardNumber', 'card_number', 'cvv', 'cvc', 'expiry', 'cc',
      'token', 'accessToken', 'refreshToken', 'tokenHash', 'secret',
      'providerSecret', 'apiKey', 'api_key', 'dsn', 'sentry_dsn',
      'webhookUrl', 'webhook_url', 'privateNote', 'customer_memory',
      'customerMemory', 'staff_notes', 'internal_notes', 'base64'
    ];

    for (const key of Object.keys(payload)) {
      const value = payload[key];
      const lowerKey = key.toLowerCase();

      if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
        redacted[key] = '[REDACTED_SENSITIVE_FIELD]';
      } else if (typeof value === 'object') {
        redacted[key] = this.redactAuditPayload(value);
      } else if (typeof value === 'string') {
        if (value.startsWith('data:image/') && value.includes(';base64,')) {
          redacted[key] = '[REDACTED_BASE64_IMAGE_DATA]';
        } else if (value.includes('apt_tok_')) {
          redacted[key] = value.replace(/apt_tok_[a-zA-Z0-9_-]+/g, '[REDACTED_TOKEN]');
        } else {
          redacted[key] = value;
        }
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  },

  /**
   * Logs an audit event into localStorage storage safely.
   */
  logAuditEvent(input: {
    tenantId?: string;
    actorType: AuditActorType;
    actorId?: string;
    category: AuditEventCategory;
    severity: AuditEventSeverity;
    action: string;
    entityType?: string;
    entityId?: string;
    correlationId?: string;
    requestId?: string;
    summary: string;
    safeDetails?: any;
    metadata?: any;
  }): AuditEvent {
    // Save event
    const events = this._getEventsFromStore();

    const requiresRedaction = input.safeDetails ? true : false;
    const redactedDetails = input.safeDetails ? this.redactAuditPayload(input.safeDetails) : undefined;
    const redactedMetadata = input.metadata ? this.redactAuditPayload(input.metadata) : undefined;

    const newEvent: AuditEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId: input.tenantId,
      actorType: input.actorType,
      actorId: input.actorId,
      category: input.category,
      severity: input.severity,
      action: input.action,
      status: 'recorded',
      entityType: input.entityType,
      entityId: input.entityId,
      correlationId: input.correlationId,
      requestId: input.requestId,
      summary: input.summary,
      safeDetails: redactedDetails,
      redactionApplied: requiresRedaction,
      createdAt: new Date().toISOString(),
      metadata: redactedMetadata
    };

    events.unshift(newEvent); // Keep newest first
    this._saveEventsToStore(events);

    // Also output to dev console for local simulation observability
    console.log(`[AUDIT_LOG_SIMULATION][${newEvent.severity.toUpperCase()}] ${newEvent.category} - ${newEvent.action}: ${newEvent.summary}`, {
      correlationId: newEvent.correlationId,
      tenantId: newEvent.tenantId
    });

    return newEvent;
  },

  /**
   * Lists all audit events with optional filters (severity, category, tenantId)
   */
  listAuditEvents(filters?: {
    severity?: AuditEventSeverity;
    category?: AuditEventCategory;
    tenantId?: string;
    status?: AuditEventStatus;
  }): AuditEvent[] {
    let events = this._getEventsFromStore();

    if (filters) {
      if (filters.severity) {
        events = events.filter(e => e.severity === filters.severity);
      }
      if (filters.category) {
        events = events.filter(e => e.category === filters.category);
      }
      if (filters.tenantId) {
        events = events.filter(e => e.tenantId === filters.tenantId);
      }
      if (filters.status) {
        events = events.filter(e => e.status === filters.status);
      }
    }

    return events;
  },

  listTenantAuditEvents(tenantId: string, filters?: {
    severity?: AuditEventSeverity;
    category?: AuditEventCategory;
    status?: AuditEventStatus;
  }): AuditEvent[] {
    return this.listAuditEvents({ ...filters, tenantId });
  },

  listSystemAuditEvents(filters?: {
    severity?: AuditEventSeverity;
    category?: AuditEventCategory;
    status?: AuditEventStatus;
  }): AuditEvent[] {
    // System events are either lacking tenantId or global
    const events = this.listAuditEvents(filters);
    return events.filter(e => !e.tenantId);
  },

  getAuditEvent(eventId: string): AuditEvent | undefined {
    const events = this._getEventsFromStore();
    return events.find(e => e.id === eventId);
  },

  markAuditEventReviewed(eventId: string, reviewerId: string): AuditEvent | undefined {
    const events = this._getEventsFromStore();
    const eventIndex = events.findIndex(e => e.id === eventId);
    if (eventIndex !== -1) {
      events[eventIndex].status = 'reviewed';
      events[eventIndex].reviewedAt = new Date().toISOString();
      events[eventIndex].reviewedBy = reviewerId;
      this._saveEventsToStore(events);
      return events[eventIndex];
    }
    return undefined;
  },

  escalateAuditEvent(eventId: string, reason: string): AuditEvent | undefined {
    const events = this._getEventsFromStore();
    const eventIndex = events.findIndex(e => e.id === eventId);
    if (eventIndex !== -1) {
      events[eventIndex].status = 'escalated';
      events[eventIndex].reviewedAt = new Date().toISOString();
      if (!events[eventIndex].metadata) events[eventIndex].metadata = {};
      events[eventIndex].metadata.escalationReason = reason;
      this._saveEventsToStore(events);
      return events[eventIndex];
    }
    return undefined;
  },

  resolveAuditEvent(eventId: string, resolution: string): AuditEvent | undefined {
    const events = this._getEventsFromStore();
    const eventIndex = events.findIndex(e => e.id === eventId);
    if (eventIndex !== -1) {
      events[eventIndex].status = 'resolved';
      events[eventIndex].reviewedAt = new Date().toISOString();
      if (!events[eventIndex].metadata) events[eventIndex].metadata = {};
      events[eventIndex].metadata.resolutionNotes = resolution;
      this._saveEventsToStore(events);
      return events[eventIndex];
    }
    return undefined;
  },

  getAuditReadinessSummary() {
    const events = this._getEventsFromStore();
    const severityCount = {
      info: events.filter(e => e.severity === 'info').length,
      notice: events.filter(e => e.severity === 'notice').length,
      warning: events.filter(e => e.severity === 'warning').length,
      error: events.filter(e => e.severity === 'error').length,
      critical: events.filter(e => e.severity === 'critical').length,
    };

    return {
      totalEvents: events.length,
      bySeverity: severityCount,
      localPersistence: true,
      providerConnected: false,
      redactionEngineActive: true
    };
  },

  // Helper storage routines
  _getEventsFromStore(): AuditEvent[] {
    try {
      const data = localStorage.getItem(AUDIT_STORAGE_KEY);
      if (!data) {
        // Hydrate with some basic default system/onboarding audit logs
        const initial: AuditEvent[] = [
          {
            id: 'evt_init_1',
            actorType: 'system',
            category: 'system',
            severity: 'notice',
            action: 'observability_service_initialized',
            status: 'recorded',
            summary: 'LARİ Observability, audit log, and incident response engine successfully online.',
            redactionApplied: false,
            createdAt: new Date(Date.now() - 3600000).toISOString()
          }
        ];
        localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(initial));
        return initial;
      }
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  _saveEventsToStore(events: AuditEvent[]): void {
    try {
      // Crop to last 1000 logs to prevent memory leak
      const cropped = events.slice(0, 1000);
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(cropped));
    } catch (e) {
      console.error('Failed to write audit logs to localStorage', e);
    }
  }
};
