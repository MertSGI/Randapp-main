import { communicationEventService } from '../services/communicationEventService';
import { CommunicationEventType, CustomerConsentFlags } from '../types';

class MockLocalStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

const mockLocalStorage = new MockLocalStorage();
(globalThis as any).window = { localStorage: mockLocalStorage };
(globalThis as any).localStorage = mockLocalStorage;

const fixedNow = 1762160400000;
const originalNow = Date.now;
const originalRandom = Math.random;
Date.now = () => fixedNow;
Math.random = () => 0.123456789;

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function setConsent(tenantId: string, customerId: string, consent: CustomerConsentFlags) {
  const key = `lari_customer_consents_by_tenant_${tenantId}`;
  const current = JSON.parse(localStorage.getItem(key) || '{}');
  current[customerId] = consent;
  localStorage.setItem(key, JSON.stringify(current));
}

function resetStorage() {
  localStorage.clear();
}

function createCustomerEvent(type: CommunicationEventType, customerId: string) {
  return communicationEventService.createCommunicationEvent({
    tenantId: 'tenant-consent-test',
    customerId,
    audience: 'customer',
    channel: 'sms',
    type,
    contextArgs: {
      customerName: 'Synthetic Customer',
      businessName: 'Synthetic Salon',
      serviceName: 'Haircut',
      date: '2026-11-03',
      time: '11:00',
      months: 1
    }
  });
}

function assertNotSent(eventStatuses: string[]) {
  assert(eventStatuses.every(status => status !== 'sent'), 'No event status should be sent');
}

try {
  resetStorage();

  const noConsentEvent = createCustomerEvent('booking_created', 'cust-no-consent');
  assert(noConsentEvent.status === 'skipped', 'No consent record must skip transactional customer event');

  setConsent('tenant-consent-test', 'cust-both-false', {
    bookingContactConsent: false,
    appointmentReminderConsent: false,
    marketingConsent: false,
    referralCampaignConsent: false,
    customerMemoryConsent: false,
    referencePhotoConsent: false,
    aiStyleAssistantConsent: false,
    consentVersion: '1.0',
    consentCapturedAt: '2026-11-03T08:00:00.000Z',
    consentSource: 'booking'
  });
  const bothFalseEvent = createCustomerEvent('support_request_created', 'cust-both-false');
  assert(bothFalseEvent.status === 'skipped', 'Both false consents must skip transactional customer event');

  setConsent('tenant-consent-test', 'cust-booking-yes', {
    bookingContactConsent: true,
    appointmentReminderConsent: false,
    marketingConsent: false,
    referralCampaignConsent: false,
    customerMemoryConsent: false,
    referencePhotoConsent: false,
    aiStyleAssistantConsent: false,
    consentVersion: '1.0',
    consentCapturedAt: '2026-11-03T08:00:00.000Z',
    consentSource: 'booking'
  });
  const bookingConsentEvent = createCustomerEvent('booking_confirmed', 'cust-booking-yes');
  assert(bookingConsentEvent.status === 'rendered', 'bookingContactConsent=true must allow transactional render');

  setConsent('tenant-consent-test', 'cust-reminder-yes', {
    bookingContactConsent: false,
    appointmentReminderConsent: true,
    marketingConsent: false,
    referralCampaignConsent: false,
    customerMemoryConsent: false,
    referencePhotoConsent: false,
    aiStyleAssistantConsent: false,
    consentVersion: '1.0',
    consentCapturedAt: '2026-11-03T08:00:00.000Z',
    consentSource: 'booking'
  });
  const reminderConsentEvent = createCustomerEvent('booking_reminder', 'cust-reminder-yes');
  assert(reminderConsentEvent.status === 'rendered', 'appointmentReminderConsent=true must allow transactional render');

  const marketingEvent = createCustomerEvent('referral_credit_awarded', 'cust-marketing-default');
  assert(marketingEvent.status === 'skipped', 'Marketing path must remain consent-gated and skipped by default');

  assertNotSent([
    noConsentEvent.status,
    bothFalseEvent.status,
    bookingConsentEvent.status,
    reminderConsentEvent.status,
    marketingEvent.status
  ]);

  console.log('✅ transactional consent checks passed');
} finally {
  Date.now = originalNow;
  Math.random = originalRandom;
}
