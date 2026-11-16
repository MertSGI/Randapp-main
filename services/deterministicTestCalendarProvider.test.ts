import assert from 'node:assert/strict';
import {
  EXTERNAL_CALENDAR_HOLD_CLASSIFICATION,
  getCalendarProviderReadinessTier,
} from './calendarProviderContract.ts';
import { DeterministicTestCalendarProvider } from './deterministicTestCalendarProvider.ts';

export async function runDeterministicTestCalendarProviderTests(): Promise<void> {
  // 1. Verify EXTERNAL_HOLD classification for live external calendar providers
  assert.equal(EXTERNAL_CALENDAR_HOLD_CLASSIFICATION.length, 3);
  for (const item of EXTERNAL_CALENDAR_HOLD_CLASSIFICATION) {
    assert.equal(item.readinessTier, 'EXTERNAL_HOLD');
    assert.equal(item.liveExecutionAllowed, false);
    assert.equal(item.reasonCode, 'EXTERNAL_CALENDAR_CREDENTIALS_REQUIRED');
    assert.equal(getCalendarProviderReadinessTier(item.providerId), 'EXTERNAL_HOLD');
  }

  assert.equal(getCalendarProviderReadinessTier('deterministic_test'), 'LOCAL_DETERMINISTIC_TEST');
  assert.equal(getCalendarProviderReadinessTier('google_intent'), 'CLIENT_INTENT_OR_ICS');
  assert.equal(getCalendarProviderReadinessTier('ics'), 'CLIENT_INTENT_OR_ICS');
  assert.equal(getCalendarProviderReadinessTier('apple'), 'CLIENT_INTENT_OR_ICS');

  // 2. Verify DeterministicTestCalendarProvider sync & cancel with zero network access
  let seq = 0;
  const provider = new DeterministicTestCalendarProvider({
    fixedNow: () => 1700000000000 + (++seq * 1000),
    idGenerator: (prefix) => `${prefix}_det_${++seq}`,
  });

  assert.equal(provider.providerId, 'deterministic_test');

  const syncResult = await provider.syncEvent({
    eventId: 'ev_100',
    tenantId: 'tenant_1',
    appointmentId: 'apt_100',
    title: 'Saç Bakımı',
    description: 'Müşteri randevusu',
    location: 'Nişantaşı Şube',
    startIso: '2026-11-20T10:00:00Z',
    endIso: '2026-11-20T11:00:00Z',
  });

  assert.equal(syncResult.success, true);
  assert.equal(syncResult.provider, 'deterministic_test');
  assert.ok(syncResult.externalEventRef?.startsWith('cal_ev_det_'));
  assert.ok(syncResult.webIntentUrl?.includes('https://calendar.google.com/calendar/render?'));
  assert.ok(syncResult.rawIcsContent?.includes('BEGIN:VCALENDAR'));
  assert.ok(syncResult.rawIcsContent?.includes(`UID:${syncResult.externalEventRef}@lari.local`));

  // Cancel existing synced event -> true; second cancel -> false
  const cancelledFirst = await provider.cancelEvent(syncResult.externalEventRef!);
  assert.equal(cancelledFirst, true);
  const cancelledSecond = await provider.cancelEvent(syncResult.externalEventRef!);
  assert.equal(cancelledSecond, false);
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('deterministicTestCalendarProvider.test.ts');

if (isDirectExecution) {
  await runDeterministicTestCalendarProviderTests();
  console.log('[PASS] deterministicTestCalendarProvider.test.ts');
}
