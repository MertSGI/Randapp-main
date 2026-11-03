import { LocalCommunicationOutboxRepository } from '../services/repositories/localCommunicationOutboxRepository';

class SyntheticLocalStorage {
  private store = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new Error('synthetic write failure');
    }
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectReject(promise: Promise<unknown>, message: string) {
  let rejected = false;
  try {
    await promise;
  } catch {
    rejected = true;
  }
  assert(rejected, message);
}

async function run() {
  const syntheticStorage = new SyntheticLocalStorage();
  (globalThis as any).window = { localStorage: syntheticStorage };
  (globalThis as any).localStorage = syntheticStorage;
  syntheticStorage.clear();

  const repository = new LocalCommunicationOutboxRepository();

  await repository.enqueueEvent('tenant-a', { id: 'event-forge-guard', status: 'queued' });
  await expectReject(
    repository.updateDeliveryStatus('tenant-a', 'event-forge-guard', 'sent', undefined, { verifiedProviderReceipt: true }),
    'verifiedProviderReceipt=true must not allow sent status in local outbox'
  );
  await expectReject(
    repository.updateDeliveryStatus('tenant-a', 'event-forge-guard', 'delivered', undefined, { verifiedProviderReceipt: true }),
    'verifiedProviderReceipt=true must not allow delivered status in local outbox'
  );

  await expectReject(
    repository.enqueueEvent('tenant-a', { id: 'event-forged-sent', status: 'sent' }),
    "enqueueEvent must reject caller-supplied status='sent'"
  );

  await repository.enqueueEvent('tenant-a', { id: 'duplicate-id', status: 'queued' });
  await repository.enqueueEvent('tenant-b', { id: 'duplicate-id', status: 'queued' });
  await repository.updateDeliveryStatus('tenant-a', 'duplicate-id', 'failed', 'synthetic failure');
  const tenantAEvents = await repository.listEvents('tenant-a');
  const tenantBEvents = await repository.listEvents('tenant-b');
  const tenantAFailed = tenantAEvents.find((e) => e.id === 'duplicate-id');
  const tenantBQueued = tenantBEvents.find((e) => e.id === 'duplicate-id');
  assert(tenantAFailed?.status === 'failed', 'duplicate id update must apply only to matching tenant event');
  assert(tenantBQueued?.status === 'queued', 'duplicate id update must not mutate another tenant event');

  await repository.enqueueEvent('tenant-a', { id: 'skipped-terminal', status: 'skipped' });
  await expectReject(
    repository.updateDeliveryStatus('tenant-a', 'skipped-terminal', 'queued'),
    "terminal status 'skipped' must not be converted to queued"
  );

  const beforeWriteFailure = (await repository.listEvents('tenant-write-failure')).length;
  syntheticStorage.failWrites = true;
  await expectReject(
    repository.enqueueEvent('tenant-write-failure', { id: 'write-fail-id', status: 'queued' }),
    'enqueue must fail when local persistence fails'
  );
  syntheticStorage.failWrites = false;
  const afterWriteFailure = (await repository.listEvents('tenant-write-failure')).length;
  assert(beforeWriteFailure === afterWriteFailure, 'failed write must not claim success or persist event');

  const okEvent = await repository.enqueueEvent('tenant-ok', { id: 'ok-event-1', status: 'queued', channel: 'sms' });
  assert(okEvent.tenantId === 'tenant-ok', 'legitimate enqueue should preserve authorized tenant');
  await repository.updateDeliveryStatus('tenant-ok', 'ok-event-1', 'failed', 'local delivery simulator failure');
  const okEvents = await repository.listEvents('tenant-ok');
  const updatedOkEvent = okEvents.find((e) => e.id === 'ok-event-1');
  assert(updatedOkEvent?.status === 'failed', 'legitimate failed status update should succeed');
  assert(updatedOkEvent?.failureReason === 'local delivery simulator failure', 'legitimate update should persist notes');

  console.log('✅ local outbox guard synthetic tests passed');
}

run().catch((error) => {
  console.error('❌ local outbox guard synthetic tests failed');
  console.error(error);
  process.exit(1);
});
