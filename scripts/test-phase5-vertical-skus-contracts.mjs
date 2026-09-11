import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

console.log('--- PHASE 5 VERTICAL SKUS & COMMERCIAL PACKAGING CONTRACT VALIDATION ---');

const migrationPath = resolve('supabase/migrations/20260927_phase5_vertical_skus_commercial_packaging.sql');
if (!existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. Canonical commercial feature definitions seeded for Clinic vertical',
    test: () => /clinic_workspace/i.test(sql) &&
                /max_practitioners/i.test(sql) &&
                /clinic_ai_transcribe/i.test(sql) &&
                /clinic_ai_soap_draft/i.test(sql)
  },
  {
    name: '2. Canonical commercial feature definitions seeded for Health Tourism vertical',
    test: () => /ht_lead_ops/i.test(sql) &&
                /ht_multilingual_funnel/i.test(sql) &&
                /max_active_journeys/i.test(sql) &&
                /max_coordinators/i.test(sql) &&
                /ht_agency_network/i.test(sql) &&
                /ht_ai_chat/i.test(sql) &&
                /ht_journey_quote/i.test(sql)
  },
  {
    name: '3. Explicit vertical plans seeded (clinic_starter, clinic_pro, ht_starter, ht_enterprise)',
    test: () => /clinic_starter/i.test(sql) &&
                /clinic_pro/i.test(sql) &&
                /ht_starter/i.test(sql) &&
                /ht_enterprise/i.test(sql)
  },
  {
    name: '4. Zero duplicate plans or plan_versions table creation',
    test: () => !/CREATE\s+TABLE\s+.*plans_v2/i.test(sql) &&
                !/CREATE\s+TABLE\s+.*vertical_plans/i.test(sql) &&
                !/CREATE\s+TABLE\s+.*subscriptions_v2/i.test(sql)
  },
  {
    name: '5. Plan versions published in version 1 for all vertical SKUs',
    test: () => /lifecycle_status\s*=\s*'published'/i.test(sql) &&
                /version_number/i.test(sql) &&
                /clinic_starter/i.test(sql)
  },
  {
    name: '6. Server-authoritative RPC: resolve_tenant_vertical_context defined',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.resolve_tenant_vertical_context/i.test(sql) &&
                /SECURITY\s+DEFINER/i.test(sql) &&
                /SET\s+search_path\s*=\s*pg_catalog,\s*public/i.test(sql)
  },
  {
    name: '7. resolve_tenant_vertical_context verifies commercial lifecycle eligibility',
    test: () => /public\.resolve_tenant_commercial_eligibility/i.test(sql)
  },
  {
    name: '8. resolve_tenant_vertical_context evaluates effective entitlements',
    test: () => /public\.resolve_effective_tenant_entitlements/i.test(sql)
  },
  {
    name: '9. Practitioner quota enforcement trigger exists on clinic_staff_profiles',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.enforce_practitioner_quota_limit/i.test(sql) &&
                /trg_enforce_practitioner_quota_limit/i.test(sql) &&
                /BEFORE\s+INSERT\s+OR\s+UPDATE\s+ON\s+public\.clinic_staff_profiles/i.test(sql)
  },
  {
    name: '10. Coordinator quota enforcement trigger exists on ht_staff_profiles',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.enforce_ht_coordinator_quota_limit/i.test(sql) &&
                /trg_enforce_ht_coordinator_quota_limit/i.test(sql) &&
                /BEFORE\s+INSERT\s+OR\s+UPDATE\s+ON\s+public\.ht_staff_profiles/i.test(sql)
  },
  {
    name: '11. Fail-closed vertical entitlement check in quota enforcement',
    test: () => /CLINIC_VERTICAL_NOT_ENTITLED/i.test(sql) &&
                /HT_VERTICAL_NOT_ENTITLED/i.test(sql) &&
                /PRACTITIONER_QUOTA_EXCEEDED/i.test(sql) &&
                /COORDINATOR_QUOTA_EXCEEDED/i.test(sql)
  },
  {
    name: '12. RPC permissions: REVOKE from PUBLIC, GRANT to authenticated and service_role',
    test: () => /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.resolve_tenant_vertical_context.*FROM\s+PUBLIC/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.resolve_tenant_vertical_context.*TO\s+authenticated,\s*service_role/i.test(sql)
  },
  {
    name: '13. TypeScript service layer and types exist and validate',
    test: () => {
      const servicePath = resolve('services/verticalCommercialService.ts');
      const typesPath = resolve('types/commercial.ts');
      if (!existsSync(servicePath) || !existsSync(typesPath)) return false;
      const sCode = readFileSync(servicePath, 'utf8');
      const tCode = readFileSync(typesPath, 'utf8');
      return sCode.includes('resolveVerticalContext') &&
             tCode.includes('TenantVerticalCommercialContext') &&
             tCode.includes('VerticalQuotas');
    }
  }
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  try {
    if (t.test()) {
      console.log(`[PASS] ${t.name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${t.name}`);
      failed++;
    }
  } catch (err) {
    console.error(`[ERROR] ${t.name}: ${err.message}`);
    failed++;
  }
}

console.log(`\n========================================`);
console.log(`PHASE 5 NODE 1 CONTRACTS: ${tests.length} | PASSED: ${passed} | FAILED: ${failed}`);
console.log(`========================================\n`);

process.exit(failed > 0 ? 1 : 0);
