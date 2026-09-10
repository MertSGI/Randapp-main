import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

console.log('--- PHASE 3 COMMUNICATIONS FOUNDATION CONTRACT VALIDATION ---');

const migrationPath = resolve('supabase/migrations/20260918_phase3_communications_foundation.sql');
if (!existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. communication_outbox table creation',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.communication_outbox/i.test(sql)
  },
  {
    name: '2. Channel abstraction constraints (email, sms, whatsapp, otp)',
    test: () => /channel\s+IN\s*\(\s*'email',\s*'sms',\s*'whatsapp',\s*'otp'\s*\)/i.test(sql)
  },
  {
    name: '3. Status lifecycle state machine constraint',
    test: () => /status\s+IN\s*\([\s\S]*?'queued'[\s\S]*?'processing'[\s\S]*?'sent_to_provider'[\s\S]*?'delivered'[\s\S]*?'failed_retryable'[\s\S]*?'failed_terminal'[\s\S]*?'dead_letter'[\s\S]*?'cancelled'[\s\S]*?\)/i.test(sql)
  },
  {
    name: '4. Tenant-scoped idempotency key unique constraint',
    test: () => /CONSTRAINT\s+comms_outbox_tenant_idempotency_unique\s+UNIQUE\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i.test(sql)
  },
  {
    name: '5. Direct table privileges revoked from PUBLIC and anon on outbox',
    test: () => /REVOKE\s+ALL\s+ON\s+public\.communication_outbox\s+FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.communication_outbox\s+FROM\s+anon;/i.test(sql)
  },
  {
    name: '6. RLS enabled on communication_outbox',
    test: () => /ALTER\s+TABLE\s+public\.communication_outbox\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql)
  },
  {
    name: '7. Scoped view policy on outbox for tenant admins and staff',
    test: () => /CREATE\s+POLICY\s+"Tenant\s+Admins\s+and\s+Staff\s+-\s+Scoped\s+View\s+on\s+communication_outbox"/i.test(sql)
  },
  {
    name: '8. Super Admins policy on communication_outbox',
    test: () => /CREATE\s+POLICY\s+"Super\s+Admins\s+-\s+Full\s+Access\s+on\s+communication_outbox"/i.test(sql)
  },
  {
    name: '9. communication_delivery_callbacks table creation',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.communication_delivery_callbacks/i.test(sql)
  },
  {
    name: '10. Callback dedupe/replay token unique constraint',
    test: () => /CONSTRAINT\s+comms_callbacks_replay_unique\s+UNIQUE\s*\(\s*provider_id\s*,\s*replay_token\s*\)/i.test(sql)
  },
  {
    name: '11. Direct table privileges revoked from PUBLIC and anon on callbacks table',
    test: () => /REVOKE\s+ALL\s+ON\s+public\.communication_delivery_callbacks\s+FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.communication_delivery_callbacks\s+FROM\s+anon;/i.test(sql)
  },
  {
    name: '12. enqueue_communication_outbox defined as SECURITY DEFINER with fixed search_path',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.enqueue_communication_outbox[\s\S]*?SECURITY\s+DEFINER\s+SET\s+search_path\s*=\s*pg_catalog,\s*public/i.test(sql)
  },
  {
    name: '13. enqueue_communication_outbox handles ON CONFLICT idempotency',
    test: () => /ON\s+CONFLICT\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i.test(sql)
  },
  {
    name: '14. claim_outbox_batch implements atomic lease locking with FOR UPDATE SKIP LOCKED',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.claim_outbox_batch[\s\S]*?FOR\s+UPDATE\s+SKIP\s+LOCKED/i.test(sql)
  },
  {
    name: '15. claim_outbox_batch increments attempt_count and sets locked_by and lease_until',
    test: () => /locked_by\s*=\s*p_worker_id/i.test(sql) &&
                /lease_until\s*=\s*v_lease_until/i.test(sql) &&
                /attempt_count\s*=\s*co\.attempt_count\s*\+\s*1/i.test(sql)
  },
  {
    name: '16. record_delivery_callback implements replay prevention lookup',
    test: () => /SELECT\s+1\s+FROM\s+public\.communication_delivery_callbacks\s+WHERE\s+provider_id\s*=\s*p_provider_id\s+AND\s+replay_token\s*=\s*p_replay_token/i.test(sql)
  },
  {
    name: '17. record_delivery_callback transitions failed messages to dead_letter on max retries',
    test: () => /v_outbox_rec\.attempt_count\s*>=\s*v_outbox_rec\.max_attempts[\s\S]*?status\s*=\s*'dead_letter'/i.test(sql)
  },
  {
    name: '18. REVOKE EXECUTE FROM PUBLIC on all communication RPCs before explicit grants',
    test: () => /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.enqueue_communication_outbox.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.claim_outbox_batch.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.record_delivery_callback.*FROM\s+PUBLIC;/i.test(sql)
  },
  {
    name: '19. Explicit grants on communication functions restricted to authenticated role',
    test: () => /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.enqueue_communication_outbox.*TO\s+authenticated;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.claim_outbox_batch.*TO\s+authenticated;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.record_delivery_callback.*TO\s+authenticated;/i.test(sql)
  },
  {
    name: '20. No provider secrets stored in outbox or callback schemas',
    test: () => !/api_key/i.test(sql) && !/secret_key/i.test(sql) && !/bearer_token/i.test(sql) && !/auth_token/i.test(sql)
  }
];

let failed = 0;
for (const t of tests) {
  try {
    if (t.test()) {
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
  console.log('All communication foundation contract tests passed successfully.');
}
