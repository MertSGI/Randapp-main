import assert from 'node:assert/strict';
import { STORAGE_KEYS } from './storageKeys.ts';

class MemoryStorage {
  #items = new Map<string, string>();
  get length() {
    return this.#items.size;
  }
  clear() {
    this.#items.clear();
  }
  getItem(key: string) {
    return this.#items.has(key) ? this.#items.get(key)! : null;
  }
  key(index: number) {
    return [...this.#items.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.#items.delete(key);
  }
  setItem(key: string, value: string) {
    this.#items.set(key, String(value));
  }
}

export async function runBackgroundJobServiceTests(): Promise<void> {
  (globalThis as any).localStorage = new MemoryStorage();
  (globalThis as any).window = { location: { hash: '', pathname: '' } };

  const { backgroundJobService } = await import('./backgroundJobService.ts');

  // 1. Registered jobs include all 13 canonical job types
  const jobs = backgroundJobService.listBackgroundJobs();
  assert.equal(jobs.length, 13);
  assert.ok(jobs.some((j) => j.jobType === 'custom_domain_verification_poll'));
  assert.ok(jobs.some((j) => j.jobType === 'booking_availability_refresh'));

  // 2. Scheduler readiness summary preserves local_simulation & classifies external integrations as EXTERNAL_HOLD
  const readiness = backgroundJobService.getSchedulerReadinessSummary();
  assert.equal(readiness.mode, 'local_simulation');
  assert.equal(readiness.enabled, false);
  assert.equal(readiness.isCronTriggered, false);
  assert.equal(readiness.readyForLiveOps, false);

  const extHoldIds = readiness.externalHoldCapabilities.map((c) => c.capabilityId);
  assert.ok(extHoldIds.includes('external_calendar_oauth_sync'));
  assert.ok(extHoldIds.includes('live_custom_domain_dns_ssl_verification'));
  for (const cap of readiness.externalHoldCapabilities) {
    assert.equal(cap.classification, 'EXTERNAL_HOLD');
    assert.equal(cap.liveExecutionAllowed, false);
  }

  // 3. Custom domain verification poll simulates state progression without promoting to live verified
  globalThis.localStorage.setItem(
    STORAGE_KEYS.CUSTOM_DOMAIN_REQUESTS,
    JSON.stringify([
      { tenantId: 't_1', hostname: 'salon.example.com', status: 'requested' },
    ])
  );

  const run = await backgroundJobService.runBackgroundJobNow('custom_domain_verification_poll');
  assert.equal(run.status, 'completed');
  assert.equal(run.affectedRecordCount, 1);
  assert.equal(run.metadata?.externalHoldClassification, 'EXTERNAL_HOLD');
  assert.equal(run.metadata?.liveDnsVerificationAllowed, false);
  assert.equal(run.metadata?.providerStatus, 'DOMAIN_PROVIDER_READY_NOT_CONNECTED');

  const updated = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEYS.CUSTOM_DOMAIN_REQUESTS) || '[]');
  assert.equal(updated[0].status, 'dns_instructions_sent');
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('backgroundJobService.test.ts');

if (isDirectExecution) {
  await runBackgroundJobServiceTests();
  console.log('[PASS] backgroundJobService.test.ts');
}
