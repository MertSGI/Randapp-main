import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DeterministicTestCalendarProvider } from '../services/deterministicTestCalendarProvider.ts';

console.log('--- PHASE 3 BACKGROUND JOB & CALENDAR FOUNDATION CONTRACT VALIDATION ---');

const migrationPath = resolve('supabase/migrations/20260920_phase3_background_job_calendar_foundation.sql');
if (!existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. No duplicate domain models created (reuses existing appointments, tenants)',
    test: () => !/CREATE\s+TABLE\s+.*appointments_v2/i.test(sql) &&
                !/CREATE\s+TABLE\s+.*tenants_v2/i.test(sql)
  },
  {
    name: '2. Provider-neutral calendar_sync_queue table created with tenant compound unique constraint',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.calendar_sync_queue/i.test(sql) &&
                /CONSTRAINT\s+calendar_sync_tenant_appointment_provider_unique\s+UNIQUE\s*\(\s*tenant_id\s*,\s*appointment_id\s*,\s*provider\s*\)/i.test(sql)
  },
  {
    name: '3. calendar_sync_queue provider check domain supports provider-neutral targets',
    test: () => /CHECK\s*\(\s*provider\s+IN\s*\([\s\S]*?'google_intent'[\s\S]*?'ics'[\s\S]*?'apple'[\s\S]*?'deterministic_test'[\s\S]*?\)\s*\)/i.test(sql)
  },
  {
    name: '4. background_job_runs table created for canonical worker run ledger',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.background_job_runs/i.test(sql) &&
                /status\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'queued'/i.test(sql)
  },
  {
    name: '5. Direct table access revoked on calendar_sync_queue and background_job_runs from PUBLIC/anon/authenticated',
    test: () => /REVOKE\s+ALL\s+ON\s+public\.calendar_sync_queue\s+FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.calendar_sync_queue\s+FROM\s+anon;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.calendar_sync_queue\s+FROM\s+authenticated;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.background_job_runs\s+FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.background_job_runs\s+FROM\s+anon;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.background_job_runs\s+FROM\s+authenticated;/i.test(sql)
  },
  {
    name: '6. RLS enabled on calendar_sync_queue and background_job_runs',
    test: () => /ALTER\s+TABLE\s+public\.calendar_sync_queue\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i.test(sql) &&
                /ALTER\s+TABLE\s+public\.background_job_runs\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i.test(sql)
  },
  {
    name: '7. enqueue_calendar_sync revoked from browser roles and granted to service_role',
    test: () => /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.enqueue_calendar_sync.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.enqueue_calendar_sync.*FROM\s+anon;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.enqueue_calendar_sync.*FROM\s+authenticated;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.enqueue_calendar_sync.*TO\s+service_role;/i.test(sql)
  },
  {
    name: '8. claim_calendar_sync_batch implements atomic lease locking with FOR UPDATE SKIP LOCKED and service_role grant',
    test: () => /FOR\s+UPDATE\s+SKIP\s+LOCKED/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.claim_calendar_sync_batch.*TO\s+service_role;/i.test(sql)
  },
  {
    name: '9. NO Google OAuth, NO live credentials, NO secret keys in schemas',
    test: () => !/client_secret/i.test(sql) &&
                !/refresh_token/i.test(sql) &&
                !/oauth_token/i.test(sql) &&
                !/api_key/i.test(sql)
  },
  {
    name: '10. Deterministic test calendar provider runs zero network test simulation',
    test: async () => {
      let seq = 0;
      const provider = new DeterministicTestCalendarProvider({
        fixedNow: () => 1700000000000 + (++seq * 1000),
        idGenerator: (p) => `${p}_fixed_${++seq}`
      });

      const res = await provider.syncEvent({
        eventId: 'ev_001',
        tenantId: 'ten_001',
        appointmentId: 'app_001',
        title: 'Consultation',
        description: 'Dental Checkup',
        location: 'LARI Clinic',
        startIso: '2026-09-12T10:00:00Z',
        endIso: '2026-09-12T11:00:00Z'
      });

      if (!res.success || !res.webIntentUrl || !res.rawIcsContent || !res.externalEventRef) {
        return false;
      }

      const cancelled = await provider.cancelEvent(res.externalEventRef);
      return cancelled === true;
    }
  }
];

let failed = 0;
for (const t of tests) {
  try {
    const result = await Promise.resolve(t.test());
    if (result) {
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
  console.log('All phase 3 background job and calendar foundation contract tests passed successfully.');
}
