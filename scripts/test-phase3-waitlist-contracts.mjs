import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

console.log('--- PHASE 3 WAITLIST CONTRACT VALIDATION (R1 HARDENED) ---');

const migrationPath = resolve('supabase/migrations/20260917_phase3_waitlist_foundation.sql');
if (!existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. No broad anonymous offered-row SELECT policy (EV056_1)',
    test: () => !/CREATE\s+POLICY\s+"Public\s+read\s+offered\s+waitlist"/i.test(sql)
  },
  {
    name: '2. Direct table privileges revoked from PUBLIC and anon on booking_waitlist (EV056_1 & EV056_5)',
    test: () => /REVOKE\s+ALL\s+ON\s+public\.booking_waitlist\s+FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.booking_waitlist\s+FROM\s+anon;/i.test(sql)
  },
  {
    name: '3. No anonymous direct table INSERT policy (EV056_5)',
    test: () => !/CREATE\s+POLICY\s+"Public\s+insert\s+booking_waitlist"/i.test(sql)
  },
  {
    name: '4. Cryptographic one-time claim token hash column in booking_waitlist (EV056_2)',
    test: () => /claim_token_hash\s+TEXT\s+DEFAULT\s+NULL/i.test(sql) &&
                /CREATE\s+INDEX\s+idx_booking_waitlist_claim_token_hash\s+ON\s+public\.booking_waitlist\s*\(claim_token_hash\)/i.test(sql)
  },
  {
    name: '5. offer_waitlist_slot generates 256-bit token and hashes with SHA-256 (EV056_2)',
    test: () => /gen_random_bytes\(32\)/i.test(sql) &&
                /digest\(.*'sha256'\)/i.test(sql)
  },
  {
    name: '6. claim_waitlist_slot requires raw p_claim_token and hashes with SHA-256 for lookup (EV056_2)',
    test: () => /FUNCTION\s+public\.claim_waitlist_slot\s*\(\s*p_claim_token\s+TEXT\s*\)/i.test(sql) &&
                /digest\(trim\(p_claim_token\),\s*'sha256'\)/i.test(sql) &&
                /WHERE\s+claim_token_hash\s*=\s*v_token_hash/i.test(sql)
  },
  {
    name: '7. offer_waitlist_slot verifies caller active, tenant-bound, and role-authorized (EV056_3)',
    test: () => /v_caller_uid\s*:=\s*auth\.uid\(\)/i.test(sql) &&
                /FROM\s+public\.users_profile\s+up[\s\S]*?WHERE\s+up\.id\s*=\s*v_caller_uid\s+AND\s+up\.active\s*=\s*true/i.test(sql) &&
                /v_caller_role\s*!=\s*'super_admin'[\s\S]*?v_caller_tenant_id\s*!=\s*v_entry\.tenant_id/i.test(sql)
  },
  {
    name: '8. offer_waitlist_slot checks offered staff belongs to tenant and branch (EV056_3)',
    test: () => /FROM\s+public\.staff\s+st[\s\S]*?WHERE\s+st\.id\s*=\s*p_offered_staff_id\s+AND\s+st\.tenant_id\s*=\s*v_entry\.tenant_id/i.test(sql) &&
                /v_staff_rec\.branch_id\s*!=\s*v_entry\.branch_id/i.test(sql)
  },
  {
    name: '9. claim_waitlist_slot validates canonical booking invariants: active tenant, service, staff (EV056_4)',
    test: () => /FROM\s+public\.tenants\s+t[\s\S]*?WHERE\s+t\.id\s*=\s*v_entry\.tenant_id/i.test(sql) &&
                /FROM\s+public\.services\s+s[\s\S]*?WHERE\s+s\.id\s*=\s*v_entry\.service_id/i.test(sql) &&
                /FROM\s+public\.staff\s+st[\s\S]*?WHERE\s+st\.id\s*=\s*v_entry\.offered_staff_id/i.test(sql)
  },
  {
    name: '10. claim_waitlist_slot checks concurrency / slot overlap conflict before creating appointment (EV056_4)',
    test: () => /FROM\s+public\.appointments\s+a[\s\S]*?WHERE\s+a\.staff_id\s*=\s*v_entry\.offered_staff_id/i.test(sql) &&
                /SLOT_ALREADY_BOOKED/i.test(sql)
  },
  {
    name: '11. claim_waitlist_slot invalidates token upon successful claim (EV056_2)',
    test: () => /UPDATE\s+public\.booking_waitlist[\s\S]*?SET\s+status\s*=\s*'claimed',\s*claim_token_hash\s*=\s*NULL/i.test(sql)
  },
  {
    name: '12. Server-authoritative state machine transition trigger exists (EV056_6)',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.enforce_waitlist_state_transition/i.test(sql) &&
                /CREATE\s+TRIGGER\s+trg_enforce_waitlist_state_transition/i.test(sql) &&
                /INVALID_WAITLIST_STATE_TRANSITION/i.test(sql)
  },
  {
    name: '13. join_booking_waitlist validates tenant, service, and bounded inputs (EV056_join)',
    test: () => /length\(v_clean_name\)\s*<\s*2/i.test(sql) &&
                /length\(v_clean_phone\)\s*<\s*7/i.test(sql) &&
                /FROM\s+public\.tenants\s+t\s+WHERE\s+t\.id\s*=\s*p_tenant_id/i.test(sql) &&
                /FROM\s+public\.services\s+s\s+WHERE\s+s\.id\s*=\s*p_service_id/i.test(sql)
  },
  {
    name: '14. Fixed search_path = pg_catalog, public on all waitlist functions',
    test: () => (sql.match(/SECURITY\s+DEFINER\s+SET\s+search_path\s*=\s*pg_catalog,\s*public/g) || []).length >= 4
  },
  {
    name: '15. REVOKE EXECUTE FROM PUBLIC on all waitlist RPCs before explicit grants',
    test: () => /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.join_booking_waitlist.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.offer_waitlist_slot.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.claim_waitlist_slot.*FROM\s+PUBLIC;/i.test(sql)
  },
  {
    name: '16. Explicit grants for join, offer, and claim RPCs',
    test: () => /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.join_booking_waitlist.*TO\s+anon;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.offer_waitlist_slot.*TO\s+authenticated;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.claim_waitlist_slot.*TO\s+anon;/i.test(sql)
  },
  {
    name: '17. Tenant isolation policy on booking_waitlist for tenant admins and staff',
    test: () => /CREATE\s+POLICY\s+"Tenant\s+Admins\s+and\s+Staff\s+-\s+Full\s+Access\s+on\s+booking_waitlist"/i.test(sql)
  },
  {
    name: '18. Super Admins policy on booking_waitlist',
    test: () => /CREATE\s+POLICY\s+"Super\s+Admins\s+-\s+Full\s+Access\s+on\s+booking_waitlist"/i.test(sql)
  },
  {
    name: '19. Row-level security enabled on booking_waitlist',
    test: () => /ALTER\s+TABLE\s+public\.booking_waitlist\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql)
  },
  {
    name: '20. Row-level update locking (FOR UPDATE) in offer and claim RPCs',
    test: () => (sql.match(/FROM\s+public\.booking_waitlist[\s\S]*?FOR\s+UPDATE/g) || []).length >= 2
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
  console.log('All hardened waitlist contract tests passed successfully.');
}
