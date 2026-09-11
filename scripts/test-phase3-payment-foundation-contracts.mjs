import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DeterministicTestPaymentProvider } from '../services/deterministicTestPaymentProvider.ts';

console.log('--- PHASE 3 PROVIDER-NEUTRAL PAYMENT FOUNDATION CONTRACT VALIDATION (EV058-R2) ---');

const migrationPath = resolve('supabase/migrations/20260919_phase3_provider_neutral_payment_foundation.sql');
if (!existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. No duplicate payment ledger (no payments_v2, payment_events_v2, or subscriptions_v2)',
    test: () => !/CREATE\s+TABLE\s+.*payments_v2/i.test(sql) &&
                !/CREATE\s+TABLE\s+.*payment_events_v2/i.test(sql) &&
                !/CREATE\s+TABLE\s+.*subscriptions_v2/i.test(sql)
  },
  {
    name: '2. Provider-neutral payment_intents table created with integer minor units & uppercase ISO currency',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.payment_intents/i.test(sql) &&
                /amount_minor\s+BIGINT\s+NOT\s+NULL\s+CHECK\s*\(\s*amount_minor\s*>\s*0\s*\)/i.test(sql) &&
                /currency\s+VARCHAR\(3\)\s+NOT\s+NULL\s+CHECK\s*\(\s*currency\s*~\s*'\^\[A-Z\]\{3\}\$'\s*\)/i.test(sql)
  },
  {
    name: '3. Payment intents state machine status check domain constraint',
    test: () => /CHECK\s*\(\s*status\s+IN\s*\([\s\S]*?'created'[\s\S]*?'requires_action'[\s\S]*?'processing'[\s\S]*?'succeeded'[\s\S]*?'failed'[\s\S]*?'cancelled'[\s\S]*?'expired'[\s\S]*?\)\s*\)/i.test(sql)
  },
  {
    name: '4. Tenant-scoped idempotency unique constraint on payment_intents',
    test: () => /CONSTRAINT\s+payment_intents_tenant_idempotency_unique\s+UNIQUE\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i.test(sql)
  },
  {
    name: '5. Direct table privileges revoked from PUBLIC, anon, and authenticated on payment_intents',
    test: () => /REVOKE\s+ALL\s+ON\s+public\.payment_intents\s+FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.payment_intents\s+FROM\s+anon;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.payment_intents\s+FROM\s+authenticated;/i.test(sql)
  },
  {
    name: '6. Direct table privileges revoked from PUBLIC, anon, and authenticated on public.payments',
    test: () => /REVOKE\s+ALL\s+ON\s+public\.payments\s+FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.payments\s+FROM\s+anon;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.payments\s+FROM\s+authenticated;/i.test(sql)
  },
  {
    name: '7. Existing public.payments reconciled with intent_id, amount_minor and NO unproven amount*100 backfill (EV058-R1)',
    test: () => /ALTER\s+TABLE\s+public\.payments[\s\S]*?ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+intent_id/i.test(sql) &&
                /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+amount_minor\s+BIGINT/i.test(sql) &&
                !/amount\s*\*\s*100/i.test(sql) &&
                /amount_unit_classification/i.test(sql)
  },
  {
    name: '8. Provider-scoped atomic replay protection and legacy constraint reconciliation on public.payment_events (EV058-R1)',
    test: () => /ALTER\s+TABLE\s+public\.payment_events\s+DROP\s+CONSTRAINT\s+IF\s+EXISTS/i.test(sql) &&
                /CONSTRAINT\s+payment_events_provider_event_unique\s+UNIQUE\s*\(\s*provider\s*,\s*provider_event_id\s*\)/i.test(sql)
  },
  {
    name: '9. Direct table privileges revoked on public.payment_events from PUBLIC, anon, authenticated',
    test: () => /REVOKE\s+ALL\s+ON\s+public\.payment_events\s+FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.payment_events\s+FROM\s+anon;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.payment_events\s+FROM\s+authenticated;/i.test(sql)
  },
  {
    name: '10. create_payment_intent computes request_fingerprint, atomic idempotency, revoked from browser roles, granted to service_role (EV058-R2)',
    test: () => /v_fingerprint\s*:=\s*encode\(sha256\(/i.test(sql) &&
                /ON\s+CONFLICT\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)\s*DO\s+NOTHING/i.test(sql) &&
                /IDEMPOTENCY_CONFLICT/i.test(sql) &&
                /idempotent_duplicate/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.create_payment_intent.*FROM\s+PUBLIC;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.create_payment_intent.*TO\s+service_role;/i.test(sql)
  },
  {
    name: '11. Trusted bind_payment_intent_provider operation binds intent, provider, provider_ref with service_role grant (EV058-R2)',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.bind_payment_intent_provider/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.bind_payment_intent_provider.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.bind_payment_intent_provider.*FROM\s+anon;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.bind_payment_intent_provider.*FROM\s+authenticated;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.bind_payment_intent_provider.*TO\s+service_role;/i.test(sql)
  },
  {
    name: '12. Pre-ingest binding validation in process_verified_payment_event prevents event poisoning (EV058-R2)',
    test: () => {
      // Must validate binding before INSERT INTO payment_events
      const bindingIdx = sql.indexOf('PROVIDER_BINDING_MISMATCH');
      const insertEvIdx = sql.indexOf('INSERT INTO public.payment_events');
      return bindingIdx > 0 && insertEvIdx > 0 && bindingIdx < insertEvIdx;
    }
  },
  {
    name: '13. process_verified_payment_event protects terminal states against mutation by newer timestamp alone (EV058-R2)',
    test: () => /TERMINAL_STATE_PRESERVED_AGAINST_MUTATION/i.test(sql) &&
                /status\s+IN\s*\(\s*'succeeded',\s*'failed',\s*'cancelled',\s*'expired'\s*\)/i.test(sql)
  },
  {
    name: '14. process_verified_payment_event execution revoked from browser roles, granted to service_role (EV058-R2)',
    test: () => /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.process_verified_payment_event.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.process_verified_payment_event.*FROM\s+anon;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.process_verified_payment_event.*FROM\s+authenticated;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.process_verified_payment_event.*TO\s+service_role;/i.test(sql)
  },
  {
    name: '15. No provider secrets or raw credentials stored in schemas',
    test: () => !/api_key/i.test(sql) && !/secret_key/i.test(sql) && !/bearer_token/i.test(sql) && !/auth_token/i.test(sql)
  },
  {
    name: '16. Preserves paymentless release control invariants (does NOT enable payments/iyzico/checkout)',
    test: () => !/is_payment_collection_enabled\s*=\s*true/i.test(sql) &&
                !/is_checkout_enabled\s*=\s*true/i.test(sql) &&
                !/is_iyzico_enabled\s*=\s*true/i.test(sql)
  },
  {
    name: '17. Fixed search_path = pg_catalog, public, extensions on all functions',
    test: () => (sql.match(/SECURITY\s+DEFINER\s+SET\s+search_path\s*=\s*pg_catalog,\s*public,\s*extensions/g) || []).length >= 3
  },
  {
    name: '18. RLS enabled on all three financial tables',
    test: () => /ALTER\s+TABLE\s+public\.payment_intents\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i.test(sql) &&
                /ALTER\s+TABLE\s+public\.payments\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i.test(sql) &&
                /ALTER\s+TABLE\s+public\.payment_events\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i.test(sql)
  },
  {
    name: '19. Payment money model strictly enforces integer minor units > 0',
    test: () => /amount_minor\s+BIGINT\s+NOT\s+NULL\s+CHECK\s*\(\s*amount_minor\s*>\s*0\s*\)/i.test(sql) &&
                /chk_payments_amount_minor_positive/i.test(sql)
  },
  {
    name: '20. Deterministic test payment provider runs scenarios without network',
    test: async () => {
      let seq = 0;
      const provider = new DeterministicTestPaymentProvider({
        fixedNow: () => 1700000000000 + (++seq * 1000),
        idGenerator: (p) => `${p}_fixed_${++seq}`
      });

      // 1. Webhook signature verification test
      const valid = await provider.verifyWebhook({ 'x-test-provider-signature': 'valid_test_signature' }, '{}');
      const invalid = await provider.verifyWebhook({ 'x-test-provider-signature': 'fake' }, '{}');
      if (!valid || invalid) return false;

      // 2. Webhook simulation test
      const sim = provider.simulateWebhookEvent('intent_123', 'success');
      const normalized = provider.normalizeEvent(sim.rawPayload);
      if (normalized.status !== 'succeeded' || normalized.intentId !== 'intent_123') return false;

      // 3. Event replay duplicate and mismatch detection
      const r1 = provider.evaluateEventReplay('evt_001', 'digest_aaa');
      const r2 = provider.evaluateEventReplay('evt_001', 'digest_aaa');
      const r3 = provider.evaluateEventReplay('evt_001', 'digest_bbb');

      return r1 === 'NEW' && r2 === 'IDEMPOTENT_SUCCESS' && r3 === 'INTEGRITY_CONFLICT';
    }
  },
  {
    name: '21. Unique provider reference owner enforced via index and fail-closed check in bind_payment_intent_provider (EV058-R3)',
    test: () => sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_intents_provider_reference') &&
                sql.includes('ON public.payment_intents(provider_id, provider_reference)') &&
                sql.includes('PROVIDER_REFERENCE_ALREADY_BOUND') &&
                sql.includes('Another payment intent already owns this provider reference')
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
  console.log('All provider-neutral payment foundation EV058-R2 contract tests passed successfully.');
}

