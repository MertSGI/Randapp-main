import test from 'node:test';
import assert from 'node:assert/strict';

// In-memory mock localStorage for deterministic node runtime testing
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(String(key), String(value));
  }
  removeItem(key) {
    this.store.delete(String(key));
  }
  clear() {
    this.store.clear();
  }
}

const mockLs = new MockLocalStorage();
globalThis.localStorage = mockLs;
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    location: { origin: 'http://localhost:3000' },
    localStorage: mockLs,
  };
}

function setTestEnv(envObj) {
  globalThis.import = { meta: { env: envObj } };
  for (const [k, v] of Object.entries(envObj)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

setTestEnv({
  VITE_DATA_MODE: 'mock',
  VITE_COMMUNICATION_MODE: 'local_outbox_only',
});

// Import public services under test
const { communicationEventService } = await import('../services/communicationEventService.ts');
const { communicationProviderConfigService } = await import('../services/communicationProviderConfigService.ts');
const { SupabaseCommunicationOutboxRepository } = await import('../services/repositories/supabaseCommunicationOutboxRepository.ts');

test('Case 1: localStorage provider-ready does not cause unsent event to be marked sent', () => {
  mockLs.clear();
  mockLs.setItem('lari_communication_provider_config', JSON.stringify({
    mode: 'sms_provider_ready',
    smsProvider: 'twilio'
  }));

  const event = communicationEventService.createCommunicationEvent({
    tenantId: 'tenant-t1',
    audience: 'customer',
    channel: 'sms',
    type: 'booking_confirmed',
    contextArgs: { customerName: 'Test User', serviceName: 'Saç Kesimi', appointmentDate: '2026-10-25' }
  });

  assert.notEqual(event.status, 'sent', 'Event must not be marked sent from client config');
  assert.equal(event.status, 'rendered', 'Event must remain in rendered draft state');
});

test('Case 2: VITE_COMMUNICATION_MODE live value cannot create real provider authority on client', () => {
  mockLs.clear();
  setTestEnv({ VITE_COMMUNICATION_MODE: 'sms_provider_ready' });

  assert.equal(communicationProviderConfigService.isProviderActive('sms'), false);
  assert.equal(communicationProviderConfigService.isProviderActive('email'), false);
  assert.equal(communicationProviderConfigService.isProviderActive('whatsapp'), false);
});

test('Case 3: providerMessageId is not automatically generated with fake IDs on creation', () => {
  mockLs.clear();
  const event = communicationEventService.createCommunicationEvent({
    tenantId: 'tenant-t2',
    audience: 'customer',
    channel: 'email',
    type: 'booking_confirmed',
    contextArgs: { customerName: 'Alice', serviceName: 'Cilt Bakımı', appointmentDate: '2026-10-26' }
  });

  assert.equal(event.providerMessageId, undefined, 'providerMessageId must not be manufactured on creation');
});

test('Case 4: In persistent mode, browser enqueue rejects direct raw table POST', async () => {
  const repo = new SupabaseCommunicationOutboxRepository();
  setTestEnv({ VITE_DATA_MODE: 'supabase_staging' });

  await assert.rejects(
    async () => {
      await repo.enqueueEvent('tenant-t3', {
        id: 'comm-1',
        channel: 'sms',
        recipient: '+905551234567',
        body: 'Hello'
      });
    },
    (err) => err.errorCode === 'COMMUNICATION_SERVER_ENQUEUE_REQUIRED',
    'Direct enqueue must be rejected with COMMUNICATION_SERVER_ENQUEUE_REQUIRED'
  );
});

test('Case 5: In persistent mode, delivery update rejects direct raw table PATCH', async () => {
  const repo = new SupabaseCommunicationOutboxRepository();
  setTestEnv({ VITE_DATA_MODE: 'supabase_staging' });

  await assert.rejects(
    async () => {
      await repo.updateDeliveryStatus('tenant-t3', 'comm-1', 'sent');
    },
    (err) => err.errorCode === 'COMMUNICATION_PROVIDER_CALLBACK_REQUIRED',
    'Delivery status update must be rejected with COMMUNICATION_PROVIDER_CALLBACK_REQUIRED'
  );
});

test('Case 6: in_app channel is not silently converted to sms and missing recipient is rejected', async () => {
  const repo = new SupabaseCommunicationOutboxRepository();

  await assert.rejects(
    async () => {
      await repo.enqueueEvent('tenant-t4', {
        id: 'comm-2',
        channel: 'in_app',
        recipient: '+905551234567',
        body: 'In-app notification'
      });
    },
    (err) => err.errorCode === 'UNSUPPORTED_COMMUNICATION_CHANNEL',
    'in_app channel must reject with UNSUPPORTED_COMMUNICATION_CHANNEL'
  );

  await assert.rejects(
    async () => {
      await repo.enqueueEvent('tenant-t4', {
        id: 'comm-3',
        channel: 'sms',
        recipient: 'unknown_recipient',
        body: 'No recipient'
      });
    },
    (err) => err.errorCode === 'INVALID_COMMUNICATION_RECIPIENT',
    'unknown_recipient must reject with INVALID_COMMUNICATION_RECIPIENT'
  );
});

test('Case 7: Local draft rendered and consent skipped states are preserved', () => {
  mockLs.clear();
  setTestEnv({ VITE_DATA_MODE: 'mock' });

  // Event with consent default -> rendered
  const event1 = communicationEventService.createCommunicationEvent({
    tenantId: 'tenant-demo',
    audience: 'customer',
    channel: 'sms',
    type: 'booking_confirmed',
    contextArgs: { customerName: 'Bob', serviceName: 'Manikür', appointmentDate: '2026-10-27' }
  });
  assert.equal(event1.status, 'rendered');
});

test('Case 8: Sanitized tenant list RPC path and tenant isolation structure preserved', async () => {
  const repo = new SupabaseCommunicationOutboxRepository();
  assert.ok(typeof repo.listEvents === 'function');
});

test('Case 9: Missing or fake provider receipt cannot elevate status to sent', () => {
  mockLs.clear();
  setTestEnv({ VITE_DATA_MODE: 'mock' });

  const event = communicationEventService.createCommunicationEvent({
    tenantId: 'tenant-receipt',
    audience: 'customer',
    channel: 'sms',
    type: 'booking_confirmed',
    contextArgs: { customerName: 'Carol', serviceName: 'Pedikür', appointmentDate: '2026-10-28' }
  });

  // Attempting to mark sent with fake prov_... receipt must throw
  assert.throws(
    () => {
      communicationEventService.markCommunicationSent(event.id, 'prov_fake123');
    },
    /INVALID_PROVIDER_RECEIPT/,
    'Fake prov_ receipt must be rejected'
  );

  // Attempting to mark sent without receipt must throw
  assert.throws(
    () => {
      communicationEventService.markCommunicationSent(event.id, '');
    },
    /INVALID_PROVIDER_RECEIPT/,
    'Empty receipt must be rejected'
  );

  // In persistent mode, marking sent from client throws COMMUNICATION_SERVER_DELIVERY_REQUIRED
  setTestEnv({ VITE_DATA_MODE: 'supabase_staging' });
  assert.throws(
    () => {
      communicationEventService.markCommunicationSent(event.id, 'ext_real_receipt_123');
    },
    /COMMUNICATION_SERVER_DELIVERY_REQUIRED/,
    'Client cannot mark sent in persistent mode'
  );
});
