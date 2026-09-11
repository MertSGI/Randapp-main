import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

console.log('=== Phase 4 Loyalty & Client Reactivation Foundation Contract Tests ===\n');

const migrationPath = resolve('supabase/migrations/20260925_phase4_loyalty_reactivation_foundation.sql');
if (!existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const servicePath = resolve('services/loyaltyReactivationService.ts');
if (!existsSync(servicePath)) {
  console.error(`FAIL: Service file not found at ${servicePath}`);
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');
const serviceCode = readFileSync(servicePath, 'utf8');

const tests = [
  // 1. Schema Invariants & Model Preservation
  {
    category: '1. Model Invariants & Architecture',
    name: '1.1 Reuses canonical public.customers(id) and public.tenants(id) (zero duplicate customers_v2)',
    fn: () => !/CREATE\s+TABLE\s+.*customers_v2/i.test(sql) &&
              !/CREATE\s+TABLE\s+.*tenants_v2/i.test(sql) &&
              /REFERENCES\s+public\.customers\s*\(\s*id/i.test(sql)
  },
  {
    category: '1. Model Invariants & Architecture',
    name: '1.2 Defines tenant_loyalty_configs with points conversion and threshold constraints',
    fn: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.tenant_loyalty_configs/i.test(sql) &&
              /points_per_minor_unit/i.test(sql) &&
              /minimum_points_redemption/i.test(sql)
  },
  {
    category: '1. Model Invariants & Architecture',
    name: '1.3 Defines customer_loyalty_ledger with append-only ledger and tenant idempotency',
    fn: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.customer_loyalty_ledger/i.test(sql) &&
              /CONSTRAINT\s+uq_loyalty_tenant_idempotency\s+UNIQUE\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i.test(sql) &&
              /CHECK\s*\(\s*running_balance\s*>=\s*0\s*\)/i.test(sql)
  },
  {
    category: '1. Model Invariants & Architecture',
    name: '1.4 Defines customer_loyalty_balances aggregate table with non-negative constraints',
    fn: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.customer_loyalty_balances/i.test(sql) &&
              /CHECK\s*\(\s*current_balance\s*>=\s*0\s*\)/i.test(sql)
  },
  {
    category: '1. Model Invariants & Architecture',
    name: '1.5 Defines customer_reactivation_events queue for non-invasive reactivation detection',
    fn: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.customer_reactivation_events/i.test(sql) &&
              /status\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'detected'/i.test(sql)
  },

  // 2. Trust Boundaries & Security ACLs
  {
    category: '2. Security & Trust Boundaries',
    name: '2.1 Enables RLS on all loyalty and reactivation tables',
    fn: () => /ALTER\s+TABLE\s+public\.tenant_loyalty_configs\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i.test(sql) &&
              /ALTER\s+TABLE\s+public\.customer_loyalty_ledger\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i.test(sql) &&
              /ALTER\s+TABLE\s+public\.customer_loyalty_balances\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i.test(sql) &&
              /ALTER\s+TABLE\s+public\.customer_reactivation_events\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i.test(sql)
  },
  {
    category: '2. Security & Trust Boundaries',
    name: '2.2 Revokes direct table mutation access from PUBLIC, anon, and authenticated browser clients',
    fn: () => /REVOKE\s+ALL\s+ON\s+public\.tenant_loyalty_configs\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i.test(sql) &&
              /REVOKE\s+ALL\s+ON\s+public\.customer_loyalty_ledger\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i.test(sql) &&
              /REVOKE\s+ALL\s+ON\s+public\.customer_loyalty_balances\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i.test(sql) &&
              /REVOKE\s+ALL\s+ON\s+public\.customer_reactivation_events\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i.test(sql)
  },
  {
    category: '2. Security & Trust Boundaries',
    name: '2.3 Grants trusted access to service_role strictly',
    fn: () => /GRANT\s+ALL\s+ON\s+public\.tenant_loyalty_configs\s+TO\s+service_role;/i.test(sql) &&
              /GRANT\s+ALL\s+ON\s+public\.customer_loyalty_ledger\s+TO\s+service_role;/i.test(sql) &&
              /GRANT\s+ALL\s+ON\s+public\.customer_loyalty_balances\s+TO\s+service_role;/i.test(sql) &&
              /GRANT\s+ALL\s+ON\s+public\.customer_reactivation_events\s+TO\s+service_role;/i.test(sql)
  },
  {
    category: '2. Security & Trust Boundaries',
    name: '2.4 Restricts earn and redeem mutations to service_role with explicit revocation from browser',
    fn: () => /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.earn_loyalty_points_for_appointment\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i.test(sql) &&
              /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.redeem_loyalty_points_for_appointment\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i.test(sql) &&
              /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.earn_loyalty_points_for_appointment\s+TO\s+service_role;/i.test(sql) &&
              /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.redeem_loyalty_points_for_appointment\s+TO\s+service_role;/i.test(sql)
  },
  {
    category: '2. Security & Trust Boundaries',
    name: '2.5 Sanitized read RPC get_customer_loyalty_profile granted to authenticated staff',
    fn: () => /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_customer_loyalty_profile\s+FROM\s+PUBLIC,\s*anon;/i.test(sql) &&
              /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_customer_loyalty_profile\s+TO\s+authenticated,\s*service_role;/i.test(sql)
  },

  // 3. Concurrency, Race Condition, & Provider Safety
  {
    category: '3. Concurrency & Safety Controls',
    name: '3.1 Uses FOR UPDATE row locking during point redemption to eliminate double-spend',
    fn: () => /SELECT\s+\*\s+INTO\s+v_current_bal[\s\S]*?FROM\s+public\.customer_loyalty_balances[\s\S]*?FOR\s+UPDATE;/i.test(sql)
  },
  {
    category: '3. Concurrency & Safety Controls',
    name: '3.2 Strictly NO external live marketing/email/SMS provider credentials or network calls in schema',
    fn: () => !/tw_api_key/i.test(sql) &&
              !/sendgrid_key/i.test(sql) &&
              !/mailgun/i.test(sql) &&
              !/twilio/i.test(sql) &&
              !/http_post/i.test(sql)
  },

  // 5. R1 Security, Integrity & Cohort Scanning Tests
  {
    category: '5. R1 Security & Integrity Enhancements',
    name: '5.1 Enforces caller authorization check in get_customer_loyalty_profile',
    fn: () => /v_user\.role\s+NOT\s+IN\s*\('tenant_owner',\s*'staff'\)/i.test(sql) &&
              /PERMISSION_DENIED/i.test(sql) &&
              /auth\.uid\(\)/i.test(sql)
  },
  {
    category: '5. R1 Security & Integrity Enhancements',
    name: '5.2 Verifies appointment status is completed and matches tenant/customer in earn_loyalty_points',
    fn: () => /v_appt\.status\s*<>\s*'completed'/i.test(sql) &&
              /APPOINTMENT_NOT_COMPLETED/i.test(sql) &&
              /v_appt\.customer_id\s*<>\s*p_customer_id/i.test(sql)
  },
  {
    category: '5. R1 Security & Integrity Enhancements',
    name: '5.3 Enforces database-level append-only protection via trigger on customer_loyalty_ledger',
    fn: () => /CREATE\s+TRIGGER\s+trg_prevent_loyalty_ledger_mutation/i.test(sql) &&
              /LOYALTY_LEDGER_IMMUTABLE/i.test(sql)
  },
  {
    category: '5. R1 Security & Integrity Enhancements',
    name: '5.4 Implements scan_customer_reactivation_cohorts RPC with cohort detection',
    fn: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.scan_customer_reactivation_cohorts/i.test(sql) &&
              /customer_reactivation_events/i.test(sql) &&
              /p_inactivity_days/i.test(sql)
  },
  {
    category: '5. R1 Security & Integrity Enhancements',
    name: '5.5 Enforces non-financial completed appointment rule for loyalty earning (zero catalog price or caller money dependency)',
    fn: () => /points_per_completed_appointment/i.test(sql) &&
              !/services\.price\s*\*\s*100/i.test(sql) &&
              !/v_svc_price\s*\*\s*100/i.test(sql)
  }
];

let failed = 0;
let currentCat = '';

for (const t of tests) {
  if (t.category !== currentCat) {
    currentCat = t.category;
    console.log(`\n--- ${currentCat} ---`);
  }
  try {
    const passed = t.fn();
    if (passed) {
      console.log(`[PASS] ${t.name}`);
    } else {
      console.error(`[FAIL] ${t.name}`);
      failed++;
    }
  } catch (err) {
    console.error(`[ERROR] ${t.name}:`, err.message);
    failed++;
  }
}

console.log(`\n==================================================`);
console.log(`SUMMARY: ${tests.length - failed} passed, ${failed} failed`);
console.log(`==================================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All Phase 4 Loyalty & Client Reactivation foundation contract tests passed successfully.');
}
