import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

console.log('--- PHASE 3 WAITLIST CONTRACT VALIDATION (R4 HARDENED) ---');

const migrationPath = resolve('supabase/migrations/20260917_phase3_waitlist_foundation.sql');
if (!existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. No noncanonical business_branches reference in waitlist migration',
    test: () => !/business_branches/i.test(sql)
  },
  {
    name: '2. Direct raw table access REVOKED from all browser roles (EV056-R4 Item 1)',
    test: () => /REVOKE\s+ALL\s+ON\s+public\.booking_waitlist\s+FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.booking_waitlist\s+FROM\s+anon;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.booking_waitlist\s+FROM\s+authenticated;/i.test(sql)
  },
  {
    name: '3. Sanitized tenant-scoped waitlist RPC exists and never exposes claim_token_hash (EV056-R4 Item 1)',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_sanitized_waitlist_entries/i.test(sql) &&
                !/claim_token_hash\s+TEXT/i.test(sql.slice(sql.indexOf('get_sanitized_waitlist_entries'), sql.indexOf('enforce_waitlist_state_transition'))) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_sanitized_waitlist_entries.*TO\s+authenticated;/i.test(sql)
  },
  {
    name: '4. Cryptographic one-time claim token hash column and partial index in booking_waitlist',
    test: () => /claim_token_hash\s+TEXT\s+DEFAULT\s+NULL/i.test(sql) &&
                /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_booking_waitlist_claim_token_hash\s+ON\s+public\.booking_waitlist\s*\(\s*claim_token_hash\s*\)\s*WHERE\s+claim_token_hash\s+IS\s+NOT\s+NULL;/i.test(sql)
  },
  {
    name: '5. offer_waitlist_slot generates 256-bit token and hashes with SHA-256',
    test: () => /v_raw_token\s*:=\s*encode\(gen_random_bytes\(32\),\s*'hex'\);/i.test(sql) &&
                /v_token_hash\s*:=\s*encode\(sha256\(v_raw_token::bytea\),\s*'hex'\);/i.test(sql)
  },
  {
    name: '6. offer_waitlist_slot enforces bounded expiration domain 5-1440 min',
    test: () => /v_bounded_expires_min\s*:=\s*LEAST\(GREATEST\(COALESCE\(p_expires_in_minutes,\s*60\),\s*5\),\s*1440\);/i.test(sql)
  },
  {
    name: '7. offer_waitlist_slot explicitly allowlists roles',
    test: () => /v_caller_role\s*!=\s*'super_admin'\s*AND\s*v_caller_role\s*NOT\s*IN\s*\('tenant_owner',\s*'staff'\)/i.test(sql)
  },
  {
    name: '8. Intake join_booking_waitlist bounds customer_email, notes, and 90-day horizon',
    test: () => /length\(v_clean_email\)\s*>\s*120/i.test(sql) &&
                /length\(p_notes\)\s*>\s*500/i.test(sql) &&
                /p_preferred_date\s*>\s*\(CURRENT_DATE\s*\+\s*INTERVAL\s*'90 days'\)::DATE/i.test(sql)
  },
  {
    name: '9. Intake join_booking_waitlist integrates anti-abuse / rate limiting',
    test: () => /public\.ht_check_rate_limit\s*\(\s*p_bucket_key\s*=>\s*'waitlist:'/i.test(sql)
  },
  {
    name: '10. claim_waitlist_slot uses canonical 64-bit advisory lock matching public booking',
    test: () => /PERFORM\s+pg_advisory_xact_lock\(\s*hashtextextended\(\s*v_entry\.tenant_id::text\s*\|\|\s*':'\s*\|\|\s*v_entry\.offered_staff_id::text\s*\|\|\s*':'\s*\|\|\s*v_entry\.offered_appointment_date::text,\s*0\s*\)\s*\);/i.test(sql)
  },
  {
    name: '11. claim_waitlist_slot verifies tenant and commercial eligibility before claim',
    test: () => /SELECT\s+status,\s+onboarding_status,\s+public_site_status\s+INTO/i.test(sql) &&
                /public\.resolve_tenant_commercial_eligibility\s*\(\s*v_entry\.tenant_id\s*\)/i.test(sql) &&
                /public\.assert_tenant_commercial_action_allowed\s*\(\s*v_entry\.tenant_id,\s*'core_booking'\s*\)/i.test(sql)
  },
  {
    name: '12. Fail-closed commercial and consent checks: no silent exception fallbacks (EV056-R4 Item 2)',
    test: () => {
      const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.claim_waitlist_slot');
      const end = sql.indexOf('CREATE OR REPLACE FUNCTION public.cancel_waitlist_slot');
      const claimFn = sql.slice(start, end);
      return !/EXCEPTION[\s\S]*?WHEN\s+undefined_function\s+OR\s+undefined_table\s+THEN[\s\S]*?NULL/i.test(claimFn) &&
             !/EXCEPTION[\s\S]*?WHEN\s+undefined_table\s+THEN[\s\S]*?NULL/i.test(claimFn);
    }
  },
  {
    name: '13. All-or-nothing quota ordering: quota consumed AFTER non-mutating slot evaluation and customer validation (EV056-R4 Item 3)',
    test: () => {
      const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.claim_waitlist_slot');
      const end = sql.indexOf('CREATE OR REPLACE FUNCTION public.cancel_waitlist_slot');
      const claimFn = sql.slice(start, end);
      const slotEvalIdx = claimFn.indexOf('evaluate_booking_slot');
      const consentIdx = claimFn.indexOf('consent_ledger');
      const quotaIdx = claimFn.indexOf('consume_commercial_usage');
      const apptIdx = claimFn.indexOf('public.appointments');
      return slotEvalIdx !== -1 && consentIdx !== -1 && quotaIdx !== -1 && apptIdx !== -1 &&
             slotEvalIdx < consentIdx && consentIdx < quotaIdx && quotaIdx < apptIdx;
    }
  },
  {
    name: '14. claim_waitlist_slot validates slot using canonical evaluate_booking_slot',
    test: () => /public\.evaluate_booking_slot\s*\([\s\S]*?v_entry\.offered_staff_id[\s\S]*?v_entry\.service_id/i.test(sql)
  },
  {
    name: '15. claim_waitlist_slot inserts canonical appointment matching create_public_booking contract',
    test: () => /INSERT\s+INTO\s+public\.appointments\s*\(\s*tenant_id,\s*branch_id,\s*customer_id,\s*user_name,\s*user_email,\s*phone,\s*service_id,\s*staff_id,\s*appointment_date,\s*appointment_time,\s*duration_minutes,\s*status,\s*notes\s*\)/i.test(sql)
  },
  {
    name: '16. claim_waitlist_slot invalidates token upon successful claim',
    test: () => /UPDATE\s+public\.booking_waitlist[\s\S]*?SET\s+status\s*=\s*'claimed',\s*claim_token_hash\s*=\s*NULL/i.test(sql)
  },
  {
    name: '17. cancel_waitlist_slot authorized RPC exists for bounded state transitions',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.cancel_waitlist_slot/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.cancel_waitlist_slot.*TO\s+authenticated;/i.test(sql)
  },
  {
    name: '18. Server-authoritative state machine transition trigger prevents illegal transitions',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.enforce_waitlist_state_transition/i.test(sql) &&
                /CREATE\s+TRIGGER\s+trg_enforce_waitlist_state_transition/i.test(sql) &&
                /INVALID_WAITLIST_STATE_TRANSITION/i.test(sql)
  },
  {
    name: '19. Fixed search_path = pg_catalog, public, extensions on all waitlist functions',
    test: () => (sql.match(/SECURITY\s+DEFINER\s+SET\s+search_path\s*=\s*pg_catalog,\s*public,\s*extensions/g) || []).length >= 6
  },
  {
    name: '20. REVOKE EXECUTE FROM PUBLIC on all waitlist RPCs before explicit grants',
    test: () => /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.join_booking_waitlist.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.offer_waitlist_slot.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.claim_waitlist_slot.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.cancel_waitlist_slot.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_sanitized_waitlist_entries.*FROM\s+PUBLIC;/i.test(sql)
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
  console.log('All hardened EV-056-R4 waitlist contract tests passed successfully.');
}

