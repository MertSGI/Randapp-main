import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

console.log('--- PHASE 2 SCHEDULING CONTRACT VALIDATION (R1 HARDENED) ---');

const migrationPath = resolve('supabase/migrations/20260916_phase2_staff_scheduling_foundation.sql');
if (!existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. No broad public read policies on base scheduling tables (EV055_1)',
    test: () => !/CREATE\s+POLICY\s+"Public\s+read\s+staff_time_off"/i.test(sql) &&
                !/CREATE\s+POLICY\s+"Public\s+read\s+staff_breaks"/i.test(sql) &&
                !/CREATE\s+POLICY\s+"Public\s+read\s+booking_buffer_rules"/i.test(sql) &&
                !/CREATE\s+POLICY\s+"Public\s+read\s+business_holidays"/i.test(sql)
  },
  {
    name: '2. Direct table privileges revoked from PUBLIC and anon on all 4 tables',
    test: () => /REVOKE\s+ALL\s+ON\s+public\.staff_time_off\s+FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.staff_time_off\s+FROM\s+anon;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.staff_breaks\s+FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.staff_breaks\s+FROM\s+anon;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.booking_buffer_rules\s+FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.booking_buffer_rules\s+FROM\s+anon;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.business_holidays\s+FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.business_holidays\s+FROM\s+anon;/i.test(sql)
  },
  {
    name: '3. check_staff_slot_availability requires p_service_id (EV055_2)',
    test: () => /FUNCTION\s+public\.check_staff_slot_availability\s*\(\s*p_tenant_id\s+UUID,\s*p_staff_id\s+UUID,\s*p_service_id\s+UUID/i.test(sql)
  },
  {
    name: '4. Buffer selection hierarchy: exact service rule first, then tenant default, never random (EV055_2)',
    test: () => /WHERE\s+bbr\.tenant_id\s*=\s*p_tenant_id\s+AND\s+bbr\.service_id\s*=\s*p_service_id\s+AND\s+bbr\.is_active\s*=\s*true/i.test(sql) &&
                /WHERE\s+bbr\.tenant_id\s*=\s*p_tenant_id\s+AND\s+bbr\.service_id\s+IS\s+NULL\s+AND\s+bbr\.is_active\s*=\s*true/i.test(sql)
  },
  {
    name: '5. Default buffer uniqueness partial index exists (EV055_3)',
    test: () => /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+booking_buffer_rules_tenant_default_idx\s+ON\s+public\.booking_buffer_rules\s*\(tenant_id\)\s+WHERE\s+service_id\s+IS\s+NULL/i.test(sql)
  },
  {
    name: '6. Branch holiday support: check_staff_slot_availability accepts p_branch_id (EV055_4)',
    test: () => /p_branch_id\s+UUID\s+DEFAULT\s+NULL/i.test(sql) &&
                /bh\.branch_id\s+IS\s+NULL\s+OR\s+p_branch_id\s+IS\s+NULL\s+OR\s+bh\.branch_id\s*=\s*p_branch_id/i.test(sql)
  },
  {
    name: '7. Entity and tenant binding validations in RPC',
    test: () => /SELECT\s+1\s+FROM\s+public\.tenants\s+t\s+WHERE\s+t\.id\s*=\s*p_tenant_id/i.test(sql) &&
                /FROM\s+public\.services\s+s\s+WHERE\s+s\.id\s*=\s*p_service_id\s+AND\s+s\.tenant_id\s*=\s*p_tenant_id/i.test(sql) &&
                /FROM\s+public\.staff\s+st\s+WHERE\s+st\.id\s*=\s*p_staff_id\s+AND\s+st\.tenant_id\s*=\s*p_tenant_id/i.test(sql) &&
                /FROM\s+public\.business_branches\s+b\s+WHERE\s+b\.id\s*=\s*p_branch_id\s+AND\s+b\.tenant_id\s*=\s*p_tenant_id/i.test(sql)
  },
  {
    name: '8. SECURITY DEFINER hardening with fixed search_path = pg_catalog, public',
    test: () => /SECURITY\s+DEFINER\s+SET\s+search_path\s*=\s*pg_catalog,\s*public/i.test(sql)
  },
  {
    name: '9. REVOKE EXECUTE FROM PUBLIC on RPC before explicit grants',
    test: () => /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.check_staff_slot_availability.*FROM\s+PUBLIC;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.check_staff_slot_availability.*TO\s+anon;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.check_staff_slot_availability.*TO\s+authenticated;/i.test(sql)
  },
  {
    name: '10. Safe availability result: no disclosure of private absence reason',
    test: () => /RETURN\s+jsonb_build_object\s*\(\s*'available',\s*false,\s*'reason',\s*'staff_unavailable'\s*\)/i.test(sql) &&
                !/RETURN\s+jsonb_build_object[\s\S]*?sto\.reason/i.test(sql)
  },
  {
    name: '11. staff_time_off table structure and date range constraint',
    test: () => /CONSTRAINT\s+staff_time_off_date_range\s+CHECK\s*\(\s*end_date\s*>=\s*start_date\s*\)/i.test(sql)
  },
  {
    name: '12. staff_breaks weekday check constraint (0-6)',
    test: () => /weekday\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*weekday\s*>=\s*0\s+AND\s+weekday\s*<=\s*6\s*\)/i.test(sql)
  },
  {
    name: '13. booking_buffer_rules non-negative buffer constraints',
    test: () => /buffer_before\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0\s+CHECK\s*\(\s*buffer_before\s*>=\s*0\s*\)/i.test(sql) &&
                /buffer_after\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0\s+CHECK\s*\(\s*buffer_after\s*>=\s*0\s*\)/i.test(sql)
  },
  {
    name: '14. business_holidays unique constraint',
    test: () => /CONSTRAINT\s+business_holidays_unique\s+UNIQUE\s*\(\s*tenant_id\s*,\s*branch_id\s*,\s*date\s*\)/i.test(sql)
  },
  {
    name: '15. Business holiday all-branches unique partial index exists',
    test: () => /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+business_holidays_tenant_all_branches_idx\s+ON\s+public\.business_holidays\s*\(tenant_id,\s*date\)\s+WHERE\s+branch_id\s+IS\s+NULL/i.test(sql)
  },
  {
    name: '16. RLS enabled on all 4 tables',
    test: () => /ALTER\s+TABLE\s+public\.staff_time_off\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql) &&
                /ALTER\s+TABLE\s+public\.staff_breaks\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql) &&
                /ALTER\s+TABLE\s+public\.booking_buffer_rules\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql) &&
                /ALTER\s+TABLE\s+public\.business_holidays\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql)
  },
  {
    name: '17. Tenant admins and staff have scoped management policies',
    test: () => /CREATE\s+POLICY\s+"Tenant\s+admins\s+can\s+manage\s+staff_time_off"/i.test(sql) &&
                /CREATE\s+POLICY\s+"Tenant\s+admins\s+can\s+manage\s+staff_breaks"/i.test(sql) &&
                /CREATE\s+POLICY\s+"Tenant\s+admins\s+can\s+manage\s+booking_buffer_rules"/i.test(sql) &&
                /CREATE\s+POLICY\s+"Tenant\s+admins\s+can\s+manage\s+business_holidays"/i.test(sql)
  },
  {
    name: '18. Super admins have explicit full access policies on all 4 tables',
    test: () => /CREATE\s+POLICY\s+"Super\s+Admins\s+-\s+Full\s+Access\s+on\s+staff_time_off"/i.test(sql) &&
                /CREATE\s+POLICY\s+"Super\s+Admins\s+-\s+Full\s+Access\s+on\s+staff_breaks"/i.test(sql) &&
                /CREATE\s+POLICY\s+"Super\s+Admins\s+-\s+Full\s+Access\s+on\s+booking_buffer_rules"/i.test(sql) &&
                /CREATE\s+POLICY\s+"Super\s+Admins\s+-\s+Full\s+Access\s+on\s+business_holidays"/i.test(sql)
  },
  {
    name: '19. Working hours outside check in RPC',
    test: () => /SELECT\s+ar\.start_time,\s*ar\.end_time[\s\S]*?FROM\s+public\.availability_rules\s+ar/i.test(sql)
  },
  {
    name: '20. Appointment buffered overlap check in RPC',
    test: () => /SELECT\s+1\s+FROM\s+public\.appointments\s+a[\s\S]*?a\.appointment_date\s*=\s*p_date[\s\S]*?v_buffer_before/i.test(sql)
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
  console.log('All hardened scheduling contract tests passed successfully.');
}
