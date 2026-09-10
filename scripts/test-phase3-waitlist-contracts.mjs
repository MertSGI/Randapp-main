import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

console.log('--- PHASE 3 WAITLIST CONTRACT VALIDATION ---');

const migrationPath = resolve('supabase/migrations/20260917_phase3_waitlist_foundation.sql');
if (!existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. booking_waitlist table creation',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.booking_waitlist/i.test(sql)
  },
  {
    name: '2. booking_waitlist status state machine constraint',
    test: () => /CHECK\s*\(\s*status\s+IN\s*\(\s*'pending',\s*'offered',\s*'claimed',\s*'expired',\s*'cancelled'\s*\)\s*\)/i.test(sql)
  },
  {
    name: '3. booking_waitlist time window check constraint',
    test: () => /CONSTRAINT\s+booking_waitlist_time_window\s+CHECK/i.test(sql)
  },
  {
    name: '4. booking_waitlist RLS enabled',
    test: () => /ALTER\s+TABLE\s+public\.booking_waitlist\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql)
  },
  {
    name: '5. Tenant Admins access policy on booking_waitlist',
    test: () => /CREATE\s+POLICY\s+"Tenant Admins - Full Access on booking_waitlist"/i.test(sql)
  },
  {
    name: '6. Super Admin full access policy on booking_waitlist',
    test: () => /CREATE\s+POLICY\s+"Super Admins - Full Access on booking_waitlist"/i.test(sql)
  },
  {
    name: '7. Public insert policy on booking_waitlist',
    test: () => /CREATE\s+POLICY\s+"Public insert booking_waitlist"/i.test(sql)
  },
  {
    name: '8. join_booking_waitlist RPC defined as SECURITY DEFINER',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.join_booking_waitlist[\s\S]*?SECURITY\s+DEFINER/i.test(sql)
  },
  {
    name: '9. join_booking_waitlist sets search_path = public',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.join_booking_waitlist[\s\S]*?SET\s+search_path\s*=\s*public/i.test(sql)
  },
  {
    name: '10. join_booking_waitlist validates tenant existence',
    test: () => /IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.tenants\s+WHERE\s+id\s*=\s*p_tenant_id\s*\)/i.test(sql)
  },
  {
    name: '11. join_booking_waitlist validates service existence',
    test: () => /IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.services\s+WHERE\s+id\s*=\s*p_service_id/i.test(sql)
  },
  {
    name: '12. join_booking_waitlist validates date not in the past',
    test: () => /IF\s+p_preferred_date\s*<\s*CURRENT_DATE/i.test(sql)
  },
  {
    name: '13. offer_waitlist_slot RPC defined as SECURITY DEFINER',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.offer_waitlist_slot[\s\S]*?SECURITY\s+DEFINER/i.test(sql)
  },
  {
    name: '14. offer_waitlist_slot locks row with FOR UPDATE',
    test: () => /FROM\s+public\.booking_waitlist[\s\S]*?WHERE\s+id\s*=\s*p_waitlist_id[\s\S]*?FOR\s+UPDATE/i.test(sql)
  },
  {
    name: '15. offer_waitlist_slot enforces pending status transition',
    test: () => /IF\s+v_entry\.status\s*!=\s*'pending'/i.test(sql)
  },
  {
    name: '16. claim_waitlist_slot RPC defined as SECURITY DEFINER',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.claim_waitlist_slot[\s\S]*?SECURITY\s+DEFINER/i.test(sql)
  },
  {
    name: '17. claim_waitlist_slot checks expiration and transitions to expired',
    test: () => /IF\s+v_entry\.offer_expires_at\s+IS\s+NOT\s+NULL\s+AND\s+v_entry\.offer_expires_at\s*<\s*NOW\(\)/i.test(sql)
  },
  {
    name: '18. claim_waitlist_slot atomic appointment insertion',
    test: () => /INSERT\s+INTO\s+public\.appointments/i.test(sql)
  },
  {
    name: '19. claim_waitlist_slot transitions waitlist to claimed',
    test: () => /UPDATE\s+public\.booking_waitlist[\s\S]*?SET\s+status\s*=\s*'claimed'/i.test(sql)
  },
  {
    name: '20. Explicit execute grants for anon and authenticated',
    test: () => {
      const g1 = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.join_booking_waitlist\s+TO\s+anon/i.test(sql);
      const g2 = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.claim_waitlist_slot\s+TO\s+anon/i.test(sql);
      const g3 = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.offer_waitlist_slot\s+TO\s+authenticated/i.test(sql);
      return g1 && g2 && g3;
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
  console.log('All waitlist contract tests passed successfully.');
}
