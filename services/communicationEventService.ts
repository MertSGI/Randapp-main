import { 
  CommunicationEvent, 
  CommunicationChannel, 
  CommunicationAudience, 
  CommunicationEventType, 
  CommunicationDeliveryStatus 
} from '../types';
import { messageTemplateService } from './messageTemplateService';
import { consentService } from './consentService';
import { communicationProviderConfigService } from './communicationProviderConfigService';

const STORAGE_KEY = 'lari_communication_events';

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
    if (typeof window !== 'undefined') {
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
    if (typeof window !== 'undefined') {
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
        // Must verify contact/reminder consent
        const hasConsent = consent ? (consent.bookingContactConsent || consent.appointmentReminderConsent) : true; // default to true for booking confirmations if consent wasn't recorded yet, but enforce if recorded
        if (consent && !consent.bookingContactConsent && !consent.appointmentReminderConsent) {
          initialStatus = 'skipped';
          failureReason = 'Müşteri işlem onay/iletişim izni vermemiştir.';
        }
      } else {
        // Marketing or referrals/other campaign related
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

    // Update status to 'rendered' if successfully formatted and not skipped
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

    // 3. Provider Mode Check (If provider configuration specifies active mock/gateway, we mark as sent for our local run modes)
    if (newEvent.status === 'rendered') {
      const config = communicationProviderConfigService.getConfig();
      if (config.mode !== 'local_outbox_only') {
        // If some live provider is set, we could mark 'sent' or 'failed'.
        // In local mock preview, we can simulate sending if config isn't strict local outbox only.
        newEvent.status = 'sent';
        newEvent.providerMessageId = `prov_${Math.random().toString(36).substring(2, 9)}`;
      }
    }

    events.unshift(newEvent);
    this.saveAllEvents(events);

    // Safe logging mimicking delivery simulation
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
    const events = this.getAllEvents();
    const event = events.find(e => e.id === id);
    if (event) {
      event.status = 'sent';
      event.providerMessageId = providerMessageId || `prov_${Math.random().toString(36).substring(2, 9)}`;
      event.updatedAt = new Date().toISOString();
      this.saveAllEvents(events);
      return event;
    }
    return null;
  },

  markCommunicationFailed(id: string, reason: string): CommunicationEvent | null {
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
