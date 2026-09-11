import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DeterministicTestCommunicationProvider } from '../services/deterministicTestCommunicationProvider.ts';

console.log('--- PHASE 3 COMMUNICATIONS FOUNDATION CONTRACT VALIDATION (EV057-R3) ---');

const migrationPath = resolve('supabase/migrations/20260918_phase3_communications_foundation.sql');
if (!existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. communication_outbox schema reconciled safely without dropping existing table (EV057-R2/R3)',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.communication_outbox/i.test(sql) &&
                /ALTER\s+TABLE\s+public\.communication_outbox[\s\S]*?ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+recipient_address/i.test(sql) &&
                /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+request_fingerprint/i.test(sql) &&
                /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+last_event_timestamp/i.test(sql)
  },
  {
    name: '2. Legacy CHECK constraints safely reconciled dynamically preserving legacy values (EV057-R3/R5)',
    test: () => /FROM\s+pg_constraint[\s\S]*?conname\s+IN\s*\('communication_outbox_channel_check',\s*'communication_outbox_status_check'\)/i.test(sql) &&
                /ADD\s+CONSTRAINT\s+communication_outbox_channel_check[\s\S]*?sms[\s\S]*?whatsapp[\s\S]*?email[\s\S]*?otp/i.test(sql) &&
                /ADD\s+CONSTRAINT\s+communication_outbox_status_check[\s\S]*?queued[\s\S]*?sent[\s\S]*?failed[\s\S]*?processing[\s\S]*?delivered/i.test(sql)
  },
  {
    name: '2b. Canonical public.users_profile and explicit tenant_id cast in get_tenant_communication_outbox (EV057-R5)',
    test: () => /FROM\s+public\.users_profile\s+up/i.test(sql) &&
                !/public\.user_profiles/i.test(sql) &&
                /co\.tenant_id\s*=\s*p_tenant_id::text/i.test(sql) &&
                /tenant_id\s*=\s*p_tenant_id::text/i.test(sql)
  },
  {
    name: '3. Status lifecycle state machine constraint or values',
    test: () => /status/i.test(sql) && /queued/i.test(sql)
  },
  {
    name: '4. Tenant-scoped idempotency key unique index exists (EV057-R2)',
    test: () => /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_comms_outbox_tenant_idempotency_unique/i.test(sql)
  },
  {
    name: '5. Direct table privileges revoked from PUBLIC, anon, and authenticated (EV057-R2 zero browser PII leakage)',
    test: () => /REVOKE\s+ALL\s+ON\s+public\.communication_outbox\s+FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.communication_outbox\s+FROM\s+anon;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.communication_outbox\s+FROM\s+authenticated;/i.test(sql)
  },
  {
    name: '6. RLS enabled on communication_outbox',
    test: () => /ALTER\s+TABLE\s+public\.communication_outbox\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql)
  },
  {
    name: '7. communication_delivery_callbacks table exists with compound provider_msg_ref index',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.communication_delivery_callbacks/i.test(sql) &&
                /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_comms_callbacks_provider_ref\s+ON\s+public\.communication_delivery_callbacks\s*\(\s*provider_id\s*,\s*provider_msg_ref\s*\)/i.test(sql)
  },
  {
    name: '8. Callback dedupe/replay token unique constraint scoped to provider',
    test: () => /CONSTRAINT\s+comms_callbacks_replay_unique\s+UNIQUE\s*\(\s*provider_id\s*,\s*replay_token\s*\)/i.test(sql)
  },
  {
    name: '9. Direct table privileges revoked on callbacks from PUBLIC, anon, authenticated',
    test: () => /REVOKE\s+ALL\s+ON\s+public\.communication_delivery_callbacks\s+FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.communication_delivery_callbacks\s+FROM\s+anon;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.communication_delivery_callbacks\s+FROM\s+authenticated;/i.test(sql)
  },
  {
    name: '10. enqueue_communication_outbox enforces immutable request fingerprinting and IDEMPOTENCY_CONFLICT',
    test: () => /v_existing_rec\.request_fingerprint\s*!=\s*v_fingerprint/i.test(sql) &&
                /IDEMPOTENCY_CONFLICT/i.test(sql) &&
                /idempotent_duplicate/i.test(sql)
  },
  {
    name: '11. enqueue_communication_outbox revoked from PUBLIC/anon/authenticated and explicitly granted to service_role (EV057-R3)',
    test: () => /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.enqueue_communication_outbox.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.enqueue_communication_outbox.*FROM\s+anon;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.enqueue_communication_outbox.*FROM\s+authenticated;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.enqueue_communication_outbox.*TO\s+service_role;/i.test(sql)
  },
  {
    name: '12. claim_outbox_batch validates bounded batch_size and lease_seconds',
    test: () => /v_bounded_batch\s*:=\s*LEAST\(GREATEST\(COALESCE\(p_batch_size,\s*10\),\s*1\),\s*100\);/i.test(sql) &&
                /v_bounded_lease\s*:=\s*LEAST\(GREATEST\(COALESCE\(p_lease_seconds,\s*300\),\s*10\),\s*3600\);/i.test(sql)
  },
  {
    name: '13. claim_outbox_batch implements atomic lease locking with FOR UPDATE SKIP LOCKED',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.claim_outbox_batch[\s\S]*?FOR\s+UPDATE\s+SKIP\s+LOCKED/i.test(sql)
  },
  {
    name: '14. claim_outbox_batch revoked from PUBLIC/anon/authenticated and explicitly granted to service_role (EV057-R3)',
    test: () => /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.claim_outbox_batch.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.claim_outbox_batch.*FROM\s+anon;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.claim_outbox_batch.*FROM\s+authenticated;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.claim_outbox_batch.*TO\s+service_role;/i.test(sql)
  },
  {
    name: '15. record_delivery_callback binds provider_id + provider_msg_ref in outbox lookup',
    test: () => /WHERE\s+provider_id\s*=\s*v_clean_provider\s+AND\s+provider_msg_ref\s*=\s*v_clean_msg_ref/i.test(sql)
  },
  {
    name: '16. record_delivery_callback detects EVENT_ID_PAYLOAD_MISMATCH on altered duplicate replay payload',
    test: () => /v_existing_cb\.raw_payload_hash\s*!=\s*v_payload_hash/i.test(sql) &&
                /EVENT_ID_PAYLOAD_MISMATCH/i.test(sql)
  },
  {
    name: '17. record_delivery_callback prevents regression of terminal states and out-of-order events',
    test: () => /TERMINAL_STATE_PRESERVED_AGAINST_REGRESSION/i.test(sql) &&
                /OUT_OF_ORDER_EVENT_IGNORED/i.test(sql)
  },
  {
    name: '18. record_delivery_callback explicitly classifies UNMATCHED_PROVIDER_REFERENCE without claiming success (EV057-R3)',
    test: () => /UNMATCHED_PROVIDER_REFERENCE/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.record_delivery_callback.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.record_delivery_callback.*FROM\s+anon;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.record_delivery_callback.*FROM\s+authenticated;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.record_delivery_callback.*TO\s+service_role;/i.test(sql)
  },
  {
    name: '19. Sanitized projection RPC get_tenant_communication_outbox exists and is wired in repository adapter (EV057-R3)',
    test: () => {
      const rpcCheck = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_tenant_communication_outbox/i.test(sql) &&
                       /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_tenant_communication_outbox.*TO\s+authenticated;/i.test(sql) &&
                       /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_tenant_communication_outbox.*TO\s+service_role;/i.test(sql);
      const repoPath = resolve('services/repositories/supabaseCommunicationOutboxRepository.ts');
      const repoCode = readFileSync(repoPath, 'utf8');
      const repoUsesRpc = /get_tenant_communication_outbox/i.test(repoCode) && !/\.from\('communication_outbox'\)/i.test(repoCode);
      return rpcCheck && repoUsesRpc;
    }
  },
  {
    name: '20. No provider secrets or raw credentials stored in schemas',
    test: () => !/api_key/i.test(sql) && !/secret_key/i.test(sql) && !/bearer_token/i.test(sql) && !/auth_token/i.test(sql)
  },
  {
    name: '21. Deterministic test communication provider runs deterministic scenarios without network',
    test: async () => {
      let seq = 0;
      const provider = new DeterministicTestCommunicationProvider({
        fixedNow: () => 1700000000000 + (++seq * 1000),
        idGenerator: (p) => `${p}_fixed_${++seq}`
      });

      // 1. Success scenario
      provider.setSimulationMode('success');
      const res1 = await provider.sendMessage({
        id: 'msg_1',
        tenantId: 'tenant_1',
        channel: 'email',
        recipientAddress: 'customer@example.com',
        templateId: 'tpl_1',
        payload: { test: true },
        idempotencyKey: 'idemp_1',
        status: 'queued',
        attemptCount: 0,
        maxAttempts: 3,
        nextAttemptAt: new Date().toISOString()
      });

      if (!res1.success || !res1.providerMsgRef) return false;

      // 2. Retryable failure scenario
      provider.setSimulationMode('retryable_failure');
      const res2 = await provider.sendMessage({
        id: 'msg_2',
        tenantId: 'tenant_1',
        channel: 'sms',
        recipientAddress: '+905551234567',
        templateId: 'tpl_2',
        payload: {},
        idempotencyKey: 'idemp_2',
        status: 'queued',
        attemptCount: 1,
        maxAttempts: 3,
        nextAttemptAt: new Date().toISOString()
      });

      if (res2.success || !res2.isRetryable) return false;

      // 3. Callback generation and replay evaluation
      const cb1 = provider.simulateDeliveryCallback(res1.providerMsgRef, 'delivered');
      const replayStatus1 = provider.evaluateCallbackReplay(cb1.replayToken, 'hash_abc');
      const replayStatus2 = provider.evaluateCallbackReplay(cb1.replayToken, 'hash_abc');
      const replayStatus3 = provider.evaluateCallbackReplay(cb1.replayToken, 'hash_different');

      return replayStatus1 === 'NEW' &&
             replayStatus2 === 'DUPLICATE_EXACT' &&
             replayStatus3 === 'EVENT_ID_PAYLOAD_MISMATCH';
    }
  }
];

let failed = 0;
for (const t of tests) {
  try {
    const result = await Promise.resolve(t.test());
    if (result) {
      console.log(`[PASS] ${t.name}`);
    } else {
      console.error(`[FAIL] ${t.name}`);
      failed++;
    }
  } catch (e) {
    console.error(`[ERROR] ${t.name}:`, e.message);
    failed++;
  }
}

console.log(`\nResult: ${tests.length - failed}/${tests.length} tests passed.`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All communication foundation EV057-R3 contract tests passed successfully.');
}

