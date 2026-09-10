import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

console.log('--- PHASE 2 SCHEDULING CONTRACT VALIDATION ---');

const migrationPath = resolve('supabase/migrations/20260916_phase2_staff_scheduling_foundation.sql');
if (!existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. staff_time_off table creation',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.staff_time_off/i.test(sql)
  },
  {
    name: '2. staff_time_off RLS enabled',
    test: () => /ALTER\s+TABLE\s+public\.staff_time_off\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql)
  },
  {
    name: '3. staff_time_off date range constraint',
    test: () => /CONSTRAINT\s+staff_time_off_date_range\s+CHECK\s*\(\s*end_date\s*>=\s*start_date\s*\)/i.test(sql)
  },
  {
    name: '4. staff_breaks table creation',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.staff_breaks/i.test(sql)
  },
  {
    name: '5. staff_breaks weekday constraint',
    test: () => /weekday\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*weekday\s*>=\s*0\s+AND\s+weekday\s*<=\s*6\s*\)/i.test(sql)
  },
  {
    name: '6. staff_breaks time range constraint',
    test: () => /CONSTRAINT\s+staff_breaks_time_range\s+CHECK\s*\(\s*end_time\s*>\s*start_time\s*\)/i.test(sql)
  },
  {
    name: '7. booking_buffer_rules table creation',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.booking_buffer_rules/i.test(sql)
  },
  {
    name: '8. booking_buffer_rules uniqueness constraint',
    test: () => /CONSTRAINT\s+booking_buffer_unique\s+UNIQUE\s*\(\s*tenant_id\s*,\s*service_id\s*\)/i.test(sql)
  },
  {
    name: '9. business_holidays table creation',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.business_holidays/i.test(sql)
  },
  {
    name: '10. business_holidays uniqueness constraint',
    test: () => /CONSTRAINT\s+business_holidays_unique\s+UNIQUE\s*\(\s*tenant_id\s*,\s*branch_id\s*,\s*date\s*\)/i.test(sql)
  },
  {
    name: '11. check_staff_slot_availability RPC exists and is SECURITY DEFINER',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.check_staff_slot_availability[\s\S]*?SECURITY\s+DEFINER/i.test(sql)
  },
  {
    name: '12. check_staff_slot_availability sets search_path = public',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.check_staff_slot_availability[\s\S]*?SET\s+search_path\s*=\s*public/i.test(sql)
  },
  {
    name: '13. check_staff_slot_availability checks business_holidays',
    test: () => /FROM\s+public\.business_holidays/i.test(sql)
  },
  {
    name: '14. check_staff_slot_availability checks staff_time_off',
    test: () => /FROM\s+public\.staff_time_off/i.test(sql)
  },
  {
    name: '15. check_staff_slot_availability checks staff_breaks',
    test: () => /FROM\s+public\.staff_breaks/i.test(sql)
  },
  {
    name: '16. check_staff_slot_availability checks booking_buffer_rules',
    test: () => /FROM\s+public\.booking_buffer_rules/i.test(sql)
  },
  {
    name: '17. check_staff_slot_availability checks appointments overlap',
    test: () => /FROM\s+public\.appointments/i.test(sql)
  },
  {
    name: '18. Super admin full access policies created for all 4 tables',
    test: () => {
      const p1 = /CREATE\s+POLICY\s+"Super Admins - Full Access on staff_time_off"/i.test(sql);
      const p2 = /CREATE\s+POLICY\s+"Super Admins - Full Access on staff_breaks"/i.test(sql);
      const p3 = /CREATE\s+POLICY\s+"Super Admins - Full Access on booking_buffer_rules"/i.test(sql);
      const p4 = /CREATE\s+POLICY\s+"Super Admins - Full Access on business_holidays"/i.test(sql);
      return p1 && p2 && p3 && p4;
    }
  },
  {
    name: '19. Public read policies created for slot generation queryability',
    test: () => {
      const pr1 = /CREATE\s+POLICY\s+"Public read staff_time_off"/i.test(sql);
      const pr2 = /CREATE\s+POLICY\s+"Public read staff_breaks"/i.test(sql);
      const pr3 = /CREATE\s+POLICY\s+"Public read booking_buffer_rules"/i.test(sql);
      const pr4 = /CREATE\s+POLICY\s+"Public read business_holidays"/i.test(sql);
      return pr1 && pr2 && pr3 && pr4;
    }
  },
  {
    name: '20. Explicit execute grants for anon and authenticated on check_staff_slot_availability',
    test: () => {
      const g1 = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.check_staff_slot_availability\s+TO\s+anon;/i.test(sql);
      const g2 = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.check_staff_slot_availability\s+TO\s+authenticated;/i.test(sql);
      return g1 && g2;
    }
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
  console.log('All scheduling contract tests passed successfully.');
}
