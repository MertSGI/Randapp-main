import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

console.log('--- PHASE 3 WAITLIST CONTRACT VALIDATION (R2 HARDENED) ---');

const migrationPath = resolve('supabase/migrations/20260917_phase3_waitlist_foundation.sql');
if (!existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. No noncanonical business_branches reference in waitlist migration (EV056-R2 item 1)',
    test: () => !/business_branches/i.test(sql)
  },
  {
    name: '2. Direct table privileges revoked from PUBLIC and anon on booking_waitlist (EV056-R2 item 12)',
    test: () => /REVOKE\s+ALL\s+ON\s+public\.booking_waitlist\s+FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.booking_waitlist\s+FROM\s+anon;/i.test(sql)
  },
  {
    name: '3. Composite foreign key relationships enforce tenant safety at DB level (EV056-R2 item 2)',
    test: () => /FOREIGN\s+KEY\s*\(\s*branch_id\s*,\s*tenant_id\s*\)\s*REFERENCES\s*public\.branches\s*\(\s*id\s*,\s*tenant_id\s*\)/i.test(sql) &&
                /FOREIGN\s+KEY\s*\(\s*service_id\s*,\s*tenant_id\s*\)\s*REFERENCES\s*public\.services\s*\(\s*id\s*,\s*tenant_id\s*\)/i.test(sql) &&
                /FOREIGN\s+KEY\s*\(\s*staff_id\s*,\s*tenant_id\s*\)\s*REFERENCES\s*public\.staff\s*\(\s*id\s*,\s*tenant_id\s*\)/i.test(sql) &&
                /FOREIGN\s+KEY\s*\(\s*offered_staff_id\s*,\s*tenant_id\s*\)\s*REFERENCES\s*public\.staff\s*\(\s*id\s*,\s*tenant_id\s*\)/i.test(sql) &&
                /FOREIGN\s+KEY\s*\(\s*offered_branch_id\s*,\s*tenant_id\s*\)\s*REFERENCES\s*public\.branches\s*\(\s*id\s*,\s*tenant_id\s*\)/i.test(sql)
  },
  {
    name: '4. Cryptographic one-time claim token hash column and partial index in booking_waitlist (EV056-R2 item 4)',
    test: () => /claim_token_hash\s+TEXT\s+DEFAULT\s+NULL/i.test(sql) &&
                /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_booking_waitlist_claim_token_hash\s+ON\s+public\.booking_waitlist\s*\(\s*claim_token_hash\s*\)\s*WHERE\s+claim_token_hash\s+IS\s+NOT\s+NULL;/i.test(sql)
  },
  {
    name: '5. offer_waitlist_slot generates 256-bit token and hashes with SHA-256 (EV056-R2 item 4)',
    test: () => /v_raw_token\s*:=\s*encode\(gen_random_bytes\(32\),\s*'hex'\);/i.test(sql) &&
                /v_token_hash\s*:=\s*encode\(sha256\(v_raw_token::bytea\),\s*'hex'\);/i.test(sql)
  },
  {
    name: '6. offer_waitlist_slot enforces bounded expiration domain 5-1440 min (EV056-R2 item 5)',
    test: () => /v_bounded_expires_min\s*:=\s*LEAST\(GREATEST\(COALESCE\(p_expires_in_minutes,\s*60\),\s*5\),\s*1440\);/i.test(sql)
  },
  {
    name: '7. offer_waitlist_slot explicitly allowlists roles (EV056-R2 item 3)',
    test: () => /v_caller_role\s*!=\s*'super_admin'\s*AND\s*v_caller_role\s*NOT\s*IN\s*\('tenant_owner',\s*'staff'\)/i.test(sql)
  },
  {
    name: '8. Intake join_booking_waitlist verifies junction service_branches and staff_services (EV056-R2 item 1)',
    test: () => /FROM\s+public\.service_branches\s+WHERE\s+service_id\s*=\s*p_service_id\s+AND\s+branch_id\s*=\s*p_branch_id/i.test(sql) &&
                /FROM\s+public\.staff_services\s+WHERE\s+staff_id\s*=\s*p_staff_id\s+AND\s+service_id\s*=\s*p_service_id/i.test(sql) &&
                /FROM\s+public\.staff_branches\s+WHERE\s+staff_id\s*=\s*p_staff_id\s+AND\s+branch_id\s*=\s*p_branch_id/i.test(sql)
  },
  {
    name: '9. offer_waitlist_slot validates slot using canonical evaluate_booking_slot (EV056-R2 item 6)',
    test: () => /v_eval_res\s*:=\s*public\.evaluate_booking_slot\s*\(\s*p_tenant_id\s*=>\s*v_entry\.tenant_id,\s*p_branch_id\s*=>\s*v_target_branch_id,\s*p_service_id\s*=>\s*v_entry\.service_id,\s*p_staff_id\s*=>\s*p_offered_staff_id,\s*p_date\s*=>\s*p_offered_date,\s*p_time\s*=>\s*p_offered_time\s*\);/i.test(sql)
  },
  {
    name: '10. claim_waitlist_slot acquires canonical pg_advisory_xact_lock (EV056-R2 item 9)',
    test: () => /PERFORM\s+pg_advisory_xact_lock\(\s*hashtext\('slot_booking'\),\s*hashtext\(v_entry\.tenant_id::text\s*\|\|\s*':'\s*\|\|\s*v_entry\.offered_staff_id::text\)\s*\);/i.test(sql)
  },
  {
    name: '11. claim_waitlist_slot validates slot using canonical evaluate_booking_slot (EV056-R2 item 8)',
    test: () => /public\.evaluate_booking_slot\s*\([\s\S]*?v_entry\.offered_staff_id[\s\S]*?v_entry\.service_id/i.test(sql)
  },
  {
    name: '12. claim_waitlist_slot inserts canonical appointment matching create_public_booking contract (EV056-R2 item 8)',
    test: () => /INSERT\s+INTO\s+public\.appointments\s*\(\s*tenant_id,\s*branch_id,\s*customer_id,\s*user_name,\s*user_email,\s*phone,\s*service_id,\s*staff_id,\s*appointment_date,\s*appointment_time,\s*duration_minutes,\s*status,\s*notes\s*\)/i.test(sql)
  },
  {
    name: '13. claim_waitlist_slot invalidates token upon successful claim (EV056-R2 item 4)',
    test: () => /UPDATE\s+public\.booking_waitlist[\s\S]*?SET\s+status\s*=\s*'claimed',\s*claim_token_hash\s*=\s*NULL/i.test(sql)
  },
  {
    name: '14. cancel_waitlist_slot authorized RPC exists for bounded state transitions (EV056-R2 item 11)',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.cancel_waitlist_slot/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.cancel_waitlist_slot.*TO\s+authenticated;/i.test(sql)
  },
  {
    name: '15. Server-authoritative state machine transition trigger prevents illegal transitions (EV056-R2 item 10)',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.enforce_waitlist_state_transition/i.test(sql) &&
                /CREATE\s+TRIGGER\s+trg_enforce_waitlist_state_transition/i.test(sql) &&
                /INVALID_WAITLIST_STATE_TRANSITION/i.test(sql)
  },
  {
    name: '16. join_booking_waitlist bounds inputs and verifies junction service_branches (EV056-R2 item 1 & 13)',
    test: () => /length\(v_clean_name\)\s*<\s*2/i.test(sql) &&
                /length\(v_clean_phone\)\s*<\s*7/i.test(sql) &&
                /FROM\s+public\.service_branches\s+WHERE\s+service_id\s*=\s*p_service_id/i.test(sql)
  },
  {
    name: '17. Fixed search_path = pg_catalog, public, extensions on all waitlist functions',
    test: () => (sql.match(/SECURITY\s+DEFINER\s+SET\s+search_path\s*=\s*pg_catalog,\s*public,\s*extensions/g) || []).length >= 5
  },
  {
    name: '18. REVOKE EXECUTE FROM PUBLIC on all waitlist RPCs before explicit grants',
    test: () => /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.join_booking_waitlist.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.offer_waitlist_slot.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.claim_waitlist_slot.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.cancel_waitlist_slot.*FROM\s+PUBLIC;/i.test(sql)
  },
  {
    name: '19. Sanitized list RPC or view that never exposes claim_token_hash (EV056-R2 item 10)',
    test: () => !/SELECT[\s\S]*?claim_token_hash[\s\S]*?FROM\s+public\.booking_waitlist/i.test(sql.replace(/SELECT[\s\S]*?INTO\s+v_entry[\s\S]*?FROM\s+public\.booking_waitlist/gi, ''))
  },
  {
    name: '20. Row-level security enabled and table access revoked from anon/public',
    test: () => /ALTER\s+TABLE\s+public\.booking_waitlist\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i.test(sql) &&
                !/CREATE\s+POLICY\s+"Public/i.test(sql)
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
  console.log('All hardened EV-056-R2 waitlist contract tests passed successfully.');
}
