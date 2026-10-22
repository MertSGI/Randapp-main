import { 
  CommunicationEvent, 
  CommunicationChannel, 
  CommunicationAudience, 
  CommunicationEventType, 
  CommunicationDeliveryStatus 
} from '../types';
import { messageTemplateService } from './messageTemplateService';
import { consentService } from './consentService';
import { getDataSourceMode } from './dataSourceConfig';

const STORAGE_KEY = 'lari_communication_events';

function resolveEnv(): Record<string, any> {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any)?.env) {
      return (import.meta as any).env;
    }
  } catch {
    // ignore
  }
  try {
    if (typeof globalThis !== 'undefined' && (globalThis as any)?.import?.meta?.env) {
      return (globalThis as any).import.meta.env;
    }
  } catch {
    // ignore
  }
  try {
    if (typeof process !== 'undefined' && process?.env) {
      return process.env;
    }
  } catch {
    // ignore
  }
  return {};
}

function isPersistentMode(): boolean {
  try {
    if (getDataSourceMode() === 'supabase') return true;
  } catch {
    // fallback
  }
  const env = resolveEnv();
  const mode = env.VITE_DATA_MODE || env.VITE_LARI_DATA_SOURCE;
  return mode === 'supabase' || mode === 'supabase_staging' || mode === 'supabase_production';
}

export interface CreateEventInput {
  tenantId: string;
  branchId?: string;
  customerId?: string;
  appointmentId?: string;
  subscriptionId?: string;
  audience: CommunicationAudience;
  channel: CommunicationChannel;
  type: CommunicationEventType;
  language?: 'tr' | 'en';
  contextArgs: Record<string, string | number>;
  metadata?: any;
  internalOnly?: boolean;
}

export const communicationEventService = {
  // Enforce local storage state list
  getAllEvents(): CommunicationEvent[] {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error("Failed to parse communication events from storage", e);
        }
      }
    }
    return [];
  },

  saveAllEvents(events: CommunicationEvent[]) {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    }
  },

  createCommunicationEvent(input: CreateEventInput): CommunicationEvent {
    const events = this.getAllEvents();
    const id = `comm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const language = input.language || 'tr';

    // 1. Consent verification (Skip if audience is customer and lacks corresponding consents)
    let initialStatus: CommunicationDeliveryStatus = 'queued';
    let failureReason = '';

    if (input.audience === 'customer' && input.customerId && input.tenantId) {
      const isTransactional = 
        input.type.startsWith('booking_') || 
        input.type === 'support_request_created';

      const consent = consentService.getCustomerConsent(input.tenantId, input.customerId);

      if (isTransactional) {
        if (consent && !consent.bookingContactConsent && !consent.appointmentReminderConsent) {
          initialStatus = 'skipped';
          failureReason = 'Müşteri işlem onay/iletişim izni vermemiştir.';
        }
      } else {
        const hasMarketing = consentService.canSendMarketing(input.tenantId, input.customerId);
        if (!hasMarketing) {
          initialStatus = 'skipped';
          failureReason = 'Müşteri pazarlama / kampanya iletişim izni vermemiştir.';
        }
      }
    }

    // 2. Render Template
    const rendered = messageTemplateService.renderTemplate(
      input.type,
      input.audience as any,
      input.contextArgs,
      language
    );

    // Fail closed: Client event creation produces a local draft ('rendered') or 'skipped'.
    // Under no circumstances can client config or browser localStorage automatically declare 'sent'
    // or manufacture a synthetic provider message receipt.
    const finalStatus = initialStatus === 'skipped' ? 'skipped' : 'rendered';

    const newEvent: CommunicationEvent = {
      id,
      tenantId: input.tenantId,
      branchId: input.branchId,
      customerId: input.customerId,
      appointmentId: input.appointmentId,
      subscriptionId: input.subscriptionId,
      audience: input.audience,
      channel: input.channel,
      type: input.type,
      status: finalStatus,
      language,
      subject: rendered.subject,
      body: rendered.body,
      metadata: input.metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      failureReason: failureReason || undefined,
      internalOnly: !!input.internalOnly
    };

    events.unshift(newEvent);
    this.saveAllEvents(events);

    // Safe logging
    console.group(`🔔 [COMMUNICATION EVENT - ${newEvent.channel.toUpperCase()}]`);
    console.log(`ID: ${newEvent.id}`);
    console.log(`Type: ${newEvent.type}`);
    console.log(`Audience: ${newEvent.audience}`);
    console.log(`Status: ${newEvent.status}`);
    if (newEvent.subject) console.log(`Subject: ${newEvent.subject}`);
    console.log(`Body: ${newEvent.body}`);
    if (newEvent.failureReason) console.log(`Reason: ${newEvent.failureReason}`);
    console.groupEnd();

    return newEvent;
  },

  queueCommunicationEvent(input: CreateEventInput): CommunicationEvent {
    return this.createCommunicationEvent(input);
  },

  renderCommunicationTemplate(type: CommunicationEventType, context: Record<string, string | number>, language: 'tr' | 'en' = 'tr') {
    return messageTemplateService.renderTemplate(type, 'customer', context, language);
  },

  listCommunicationEventsForTenant(tenantId: string): CommunicationEvent[] {
    return this.getAllEvents().filter(e => e.tenantId === tenantId);
  },

  listCommunicationEventsForCustomer(customerId: string): CommunicationEvent[] {
    return this.getAllEvents().filter(e => e.customerId === customerId);
  },

  listInternalCommunicationEvents(): CommunicationEvent[] {
    return this.getAllEvents().filter(e => e.internalOnly);
  },

  markCommunicationSent(id: string, providerMessageId?: string): CommunicationEvent | null {
    if (isPersistentMode()) {
      const err = new Error('COMMUNICATION_SERVER_DELIVERY_REQUIRED: Client cannot mark communication events as sent in persistent mode. Server delivery webhook receipt required.');
      (err as any).errorCode = 'COMMUNICATION_SERVER_DELIVERY_REQUIRED';
      throw err;
    }

    // Fail closed against unverified or fake auto-generated provider receipts
    if (!providerMessageId || !providerMessageId.trim() || providerMessageId.startsWith('prov_')) {
      const err = new Error('INVALID_PROVIDER_RECEIPT: Cannot mark communication event as sent without verified external provider receipt.');
      (err as any).errorCode = 'INVALID_PROVIDER_RECEIPT';
      throw err;
    }

    const events = this.getAllEvents();
    const event = events.find(e => e.id === id);
    if (event) {
      event.status = 'sent';
      event.providerMessageId = providerMessageId;
      event.updatedAt = new Date().toISOString();
      this.saveAllEvents(events);
      return event;
    }
    return null;
  },

  markCommunicationFailed(id: string, reason: string): CommunicationEvent | null {
    if (isPersistentMode()) {
      throw {
        errorCode: 'COMMUNICATION_SERVER_DELIVERY_REQUIRED',
        message: 'Client cannot mark communication events as failed in persistent mode. Server callback required.'
      };
    }

    const events = this.getAllEvents();
    const event = events.find(e => e.id === id);
    if (event) {
      event.status = 'failed';
      event.failureReason = reason;
      event.updatedAt = new Date().toISOString();
      this.saveAllEvents(events);
      return event;
    }
    return null;
  },

  cancelCommunicationEvent(id: string): CommunicationEvent | null {
    if (isPersistentMode()) {
      throw {
        errorCode: 'COMMUNICATION_SERVER_DELIVERY_REQUIRED',
        message: 'Client cannot cancel communication events directly in persistent mode.'
      };
    }

    const events = this.getAllEvents();
    const event = events.find(e => e.id === id);
    if (event) {
      event.status = 'cancelled';
      event.updatedAt = new Date().toISOString();
      this.saveAllEvents(events);
      return event;
    }
    return null;
  },

  getCommunicationEventSummary(tenantId: string) {
    const tenantEvents = this.listCommunicationEventsForTenant(tenantId);
    const summary = {
      total: tenantEvents.length,
      queued: tenantEvents.filter(e => e.status === 'queued').length,
      rendered: tenantEvents.filter(e => e.status === 'rendered').length,
      skipped: tenantEvents.filter(e => e.status === 'skipped').length,
      sent: tenantEvents.filter(e => e.status === 'sent').length,
      failed: tenantEvents.filter(e => e.status === 'failed').length,
      cancelled: tenantEvents.filter(e => e.status === 'cancelled').length,
      channels: {
        in_app: tenantEvents.filter(e => e.channel === 'in_app').length,
        email: tenantEvents.filter(e => e.channel === 'email').length,
        whatsapp: tenantEvents.filter(e => e.channel === 'whatsapp').length,
        sms: tenantEvents.filter(e => e.channel === 'sms').length,
      }
    };
    return summary;
  }
};
