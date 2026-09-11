import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

console.log('--- PHASE 3 PACKAGE LIMITS & MULTI-BRANCH R1 CONTRACT VALIDATION ---');

const migrationPath = resolve('supabase/migrations/20260921_phase3_package_limits_multibranch_completeness.sql');
if (!existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');

const manifestPath = resolve('docs/COMMERCIAL_QUOTA_ENFORCEMENT_PATH_MANIFEST.md');
if (!existsSync(manifestPath)) {
  console.error(`FAIL: Enforcement path manifest not found at ${manifestPath}`);
  process.exit(1);
}

const manifest = readFileSync(manifestPath, 'utf8');

const tests = [
  {
    name: '1. Strict absence of noncanonical business_branches table references',
    test: () => !/business_branches/i.test(sql)
  },
  {
    name: '2. Function enforce_tenant_primary_branch_invariant exists',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.enforce_tenant_primary_branch_invariant/i.test(sql)
  },
  {
    name: '3. Primary branch trigger auto-promotes first active branch to primary',
    test: () => /NEW\.is_primary\s*:=\s*true;/i.test(sql) && /COALESCE\(v_active_count,\s*0\)\s*=\s*0/i.test(sql)
  },
  {
    name: '4. Primary branch deactivation prohibited when other active branches exist',
    test: () => /PRIMARY_BRANCH_DEACTIVATION_PROHIBITED/i.test(sql) &&
                /OLD\.is_primary\s*=\s*true\s+AND\s+NEW\.is_active\s*=\s*false/i.test(sql)
  },
  {
    name: '5. Single primary branch maintained per tenant via demotion logic before write',
    test: () => /UPDATE\s+public\.branches\s+SET\s+is_primary\s*=\s*false/i.test(sql) &&
                /id\s*<>\s*NEW\.id\s+AND\s+is_primary\s*=\s*true/i.test(sql)
  },
  {
    name: '6. Trigger trg_tenant_primary_branch_invariant registered on public.branches',
    test: () => /CREATE\s+TRIGGER\s+trg_tenant_primary_branch_invariant/i.test(sql) &&
                /BEFORE\s+INSERT\s+OR\s+UPDATE\s+OF\s+is_primary,\s*is_active\s+ON\s+public\.branches/i.test(sql)
  },
  {
    name: '7. Safe branch deactivation RPC deactivate_tenant_branch exists',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.deactivate_tenant_branch/i.test(sql)
  },
  {
    name: '8. deactivate_tenant_branch checks for active future appointments in branch timezone',
    test: () => /branch_has_active_future_appointments/i.test(sql) &&
                /v_now_in_tz/i.test(sql) &&
                /a\.status\s+NOT\s+IN\s*\(\s*'cancelled'/i.test(sql)
  },
  {
    name: '9. Staff branch assignment RPC assign_staff_to_branch exists with tenant validation',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.assign_staff_to_branch/i.test(sql) &&
                /INSERT\s+INTO\s+public\.staff_branches/i.test(sql)
  },
  {
    name: '10. assign_staff_to_branch validates active staff and active branch',
    test: () => /'invalid_branch'/i.test(sql) && /'invalid_staff'/i.test(sql) &&
                /ON\s+CONFLICT\s*\(staff_id,\s*branch_id\)\s+DO\s+NOTHING/i.test(sql)
  },
  {
    name: '11. Service branch assignment RPC assign_service_to_branch exists with tenant validation',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.assign_service_to_branch/i.test(sql) &&
                /INSERT\s+INTO\s+public\.service_branches/i.test(sql)
  },
  {
    name: '12. assign_service_to_branch validates active service and active branch',
    test: () => /'invalid_branch'/i.test(sql) && /'invalid_service'/i.test(sql) &&
                /ON\s+CONFLICT\s*\(service_id,\s*branch_id\)\s+DO\s+NOTHING/i.test(sql)
  },
  {
    name: '13. Branch calendar query RPC get_branch_calendar_appointments exists',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_branch_calendar_appointments/i.test(sql)
  },
  {
    name: '14. get_branch_calendar_appointments enforces real staff branch permissions',
    test: () => /staff_not_authorized_for_branch/i.test(sql) &&
                /v_user\.role\s*=\s*'staff'/i.test(sql) &&
                /public\.staff_branches/i.test(sql)
  },
  {
    name: '15. get_branch_calendar_appointments enforces tenant binding across branch, service, and staff',
    test: () => /JOIN\s+public\.branches\s+b\s+ON\s+b\.id\s*=\s*a\.branch_id\s+AND\s+b\.tenant_id\s*=\s*a\.tenant_id/i.test(sql) &&
                /JOIN\s+public\.services\s+s\s+ON\s+s\.id\s*=\s*a\.service_id\s+AND\s+s\.tenant_id\s*=\s*a\.tenant_id/i.test(sql) &&
                /JOIN\s+public\.staff\s+st\s+ON\s+st\.id\s*=\s*a\.staff_id\s+AND\s+st\.tenant_id\s*=\s*a\.tenant_id/i.test(sql)
  },
  {
    name: '16. Direct execution of RPCs REVOKED from PUBLIC and anon',
    test: () => /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.deactivate_tenant_branch.*FROM\s+PUBLIC,\s*anon;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.assign_staff_to_branch.*FROM\s+PUBLIC,\s*anon;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.assign_service_to_branch.*FROM\s+PUBLIC,\s*anon;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_branch_calendar_appointments.*FROM\s+PUBLIC,\s*anon;/i.test(sql)
  },
  {
    name: '17. Execution of RPCs GRANTED to authenticated and service_role',
    test: () => /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.deactivate_tenant_branch.*TO\s+authenticated,\s*service_role;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.assign_staff_to_branch.*TO\s+authenticated,\s*service_role;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.assign_service_to_branch.*TO\s+authenticated,\s*service_role;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_branch_calendar_appointments.*TO\s+authenticated,\s*service_role;/i.test(sql)
  },
  {
    name: '18. Enforcement path manifest documents max_staff, max_services, max_branches, and max_monthly_appointments',
    test: () => manifest.includes('max_staff') &&
                manifest.includes('max_services') &&
                manifest.includes('max_branches') &&
                manifest.includes('max_monthly_appointments') &&
                manifest.includes('resolve_commercial_quota') &&
                manifest.includes('consume_commercial_usage')
  }
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  try {
    if (t.test()) {
      console.log(`PASS: ${t.name}`);
      passed++;
    } else {
      console.error(`FAIL: ${t.name}`);
      failed++;
    }
  } catch (err) {
    console.error(`ERROR: ${t.name}:`, err.message);
    failed++;
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${tests.length} total.`);
if (failed > 0) {
  process.exit(1);
}
console.log('ALL PHASE 3 PACKAGE LIMITS & MULTI-BRANCH R1 CONTRACTS PASS.');
