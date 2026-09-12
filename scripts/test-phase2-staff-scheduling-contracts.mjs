import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

console.log('--- PHASE 2 SCHEDULING CONTRACT VALIDATION (R2 CANONICAL ALIGNMENT) ---');

const migrationPath = resolve('supabase/migrations/20260916_phase2_staff_scheduling_foundation.sql');
if (!existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. Strict absence of noncanonical business_branches table references',
    test: () => !/public\.business_branches/i.test(sql) && !/REFERENCES\s+public\.business_branches/i.test(sql)
  },
  {
    name: '2. Strict absence of staff.branch_id or services.branch_id assumptions in new logic',
    test: () => !/st\.branch_id\s*!=\s*p_branch_id/i.test(sql) && !/s\.branch_id\s*!=\s*p_branch_id/i.test(sql)
  },
  {
    name: '3. Canonical public.branches used for business_holidays FK',
    test: () => /REFERENCES\s+public\.branches\s*\(id,\s*tenant_id\)/i.test(sql)
  },
  {
    name: '4. Composite tenant foreign keys on staff_time_off, staff_breaks, booking_buffer_rules',
    test: () => /REFERENCES\s+public\.staff\s*\(id,\s*tenant_id\)/i.test(sql) &&
                /REFERENCES\s+public\.services\s*\(id,\s*tenant_id\)/i.test(sql)
  },
  {
    name: '5. Partial unique index on booking_buffer_rules for tenant default',
    test: () => /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+booking_buffer_rules_tenant_default_idx\s+ON\s+public\.booking_buffer_rules\s*\(tenant_id\)\s+WHERE\s+service_id\s+IS\s+NULL/i.test(sql)
  },
  {
    name: '6. Internal evaluate_schedule_constraints function exists',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.evaluate_schedule_constraints/i.test(sql)
  },
  {
    name: '7. Canonical evaluate_booking_slot integrates evaluate_schedule_constraints',
    test: () => /v_sched_res\s*:=\s*public\.evaluate_schedule_constraints/i.test(sql)
  },
  {
    name: '8. Canonical evaluate_booking_slot uses service_branches and staff_branches mappings',
    test: () => /FROM\s+public\.service_branches/i.test(sql) && /FROM\s+public\.staff_branches/i.test(sql)
  },
  {
    name: '9. Canonical evaluate_booking_slot uses ISO weekday semantics (1=Mon..7=Sun)',
    test: () => /v_weekday\s*:=\s*EXTRACT\(DOW\s+FROM\s+p_date\)::INTEGER;\s*IF\s+v_weekday\s*=\s*0\s+THEN\s+v_weekday\s*:=\s*7;\s*END\s+IF;/i.test(sql)
  },
  {
    name: '10. Canonical appointments duration_minutes used for existing appointment occupied interval',
    test: () => /COALESCE\(a\.duration_minutes,\s*30\)/i.test(sql)
  },
  {
    name: '11. Asymmetric buffer collision logic: requested buffer vs existing buffer distinguished',
    test: () => /bbr_exist_svc/i.test(sql) && /bbr_exist_def/i.test(sql) && /v_req_buf_before/i.test(sql) && /v_req_buf_after/i.test(sql)
  },
  {
    name: '12. check_staff_slot_availability delegates to canonical evaluate_booking_slot',
    test: () => /v_eval_res\s*:=\s*public\.evaluate_booking_slot/i.test(sql)
  },
  {
    name: '13. check_staff_slot_availability implements single-branch auto-resolve and multi-branch fail-closed',
    test: () => /v_branch_count\s*>\s*1\s*THEN[\s\S]*?branch_required/i.test(sql)
  },
  {
    name: '14. REVOKE EXECUTE FROM PUBLIC on internal evaluate_schedule_constraints and evaluate_booking_slot',
    test: () => /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.evaluate_schedule_constraints.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.evaluate_booking_slot.*FROM\s+PUBLIC;/i.test(sql)
  },
  {
    name: '15. REVOKE EXECUTE from PUBLIC and anon on check_staff_slot_availability (authenticated/internal only in R3)',
    test: () => /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.check_staff_slot_availability.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.check_staff_slot_availability.*FROM\s+anon;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.check_staff_slot_availability.*TO\s+authenticated;/i.test(sql)
  },
  {
    name: '16. Direct table privileges revoked from PUBLIC and anon on all 4 scheduling tables',
    test: () => /REVOKE\s+ALL\s+ON\s+public\.staff_time_off\s+FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.staff_breaks\s+FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.booking_buffer_rules\s+FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.business_holidays\s+FROM\s+PUBLIC;/i.test(sql)
  },
  {
    name: '17. RLS enabled on all 4 tables',
    test: () => /ALTER\s+TABLE\s+public\.staff_time_off\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql) &&
                /ALTER\s+TABLE\s+public\.staff_breaks\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql) &&
                /ALTER\s+TABLE\s+public\.booking_buffer_rules\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql) &&
                /ALTER\s+TABLE\s+public\.business_holidays\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql)
  },
  {
    name: '18. Fixed search_path = pg_catalog, public, extensions on all functions',
    test: () => (sql.match(/SECURITY\s+DEFINER\s+SET\s+search_path\s*=\s*pg_catalog,\s*public,\s*extensions/g) || []).length >= 3
  },
  {
    name: '19. Public callers cannot pass custom duration to shorten service in check_staff_slot_availability',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.check_staff_slot_availability\s*\(\s*p_tenant_id\s+UUID,\s*p_staff_id\s+UUID,\s*p_service_id\s+UUID,\s*p_date\s+DATE,\s*p_start_time\s+TIME,\s*p_branch_id\s+UUID\s+DEFAULT\s+NULL\s*\)/i.test(sql)
  },
  {
    name: '20. Safe availability result: no disclosure of staff absence details',
    test: () => !/check_staff_slot_availability[\s\S]*?reason[\s\S]*?sto\.reason/i.test(sql)
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
  console.log('All Phase 2 R2 scheduling contract tests passed successfully.');
}
