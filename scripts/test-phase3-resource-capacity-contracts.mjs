import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

console.log('--- PHASE 3 RESOURCE & CAPACITY CONTRACT VALIDATION ---');

const migrationPath = resolve('supabase/migrations/20260920_phase3_resource_capacity_foundation.sql');
if (!existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. Strict absence of noncanonical business_branches table references',
    test: () => !/business_branches/i.test(sql)
  },
  {
    name: '2. Table public.resources created with tenant and branch composite foreign key',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.resources/i.test(sql) &&
                /REFERENCES\s+public\.branches\s*\(id,\s*tenant_id\)/i.test(sql) &&
                /REFERENCES\s+public\.tenants\s*\(id\)/i.test(sql)
  },
  {
    name: '3. Resources table enforces capacity >= 1 and valid resource types',
    test: () => /CHECK\s*\(capacity\s*>=\s*1\)/i.test(sql) &&
                /resource_type\s+VARCHAR\(60\)\s+NOT\s+NULL\s+CHECK\s*\(\s*resource_type\s+IN\s*\(\s*'room',\s*'chair',\s*'station',\s*'equipment',\s*'facility',\s*'shared'\s*\)\s*\)/i.test(sql)
  },
  {
    name: '4. Direct raw table access REVOKED from PUBLIC, anon, and authenticated on resources',
    test: () => /REVOKE\s+ALL\s+ON\s+public\.resources\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i.test(sql) &&
                /ALTER\s+TABLE\s+public\.resources\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i.test(sql)
  },
  {
    name: '5. Table public.service_resource_requirements created with composite service tenant FK',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.service_resource_requirements/i.test(sql) &&
                /REFERENCES\s+public\.services\s*\(id,\s*tenant_id\)/i.test(sql) &&
                /REFERENCES\s+public\.resources\s*\(id\)/i.test(sql)
  },
  {
    name: '6. Service resource requirements enforce mandatory quantity >= 1 and target check',
    test: () => /CHECK\s*\(required_quantity\s*>=\s*1\)/i.test(sql) &&
                /CONSTRAINT\s+chk_srr_target\s+CHECK\s*\(\s*resource_id\s+IS\s+NOT\s+NULL\s+OR\s+resource_type\s+IS\s+NOT\s+NULL\s*\)/i.test(sql)
  },
  {
    name: '7. Direct raw table access REVOKED on service_resource_requirements',
    test: () => /REVOKE\s+ALL\s+ON\s+public\.service_resource_requirements\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i.test(sql) &&
                /ALTER\s+TABLE\s+public\.service_resource_requirements\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i.test(sql)
  },
  {
    name: '8. Table public.resource_blocks created with date/time range checks',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.resource_blocks/i.test(sql) &&
                /REFERENCES\s+public\.resources\s*\(id\)/i.test(sql) &&
                /CONSTRAINT\s+chk_resource_block_dates\s+CHECK\s*\(\s*end_date\s*>=\s*start_date\s*\)/i.test(sql) &&
                /CONSTRAINT\s+chk_resource_block_times\s+CHECK/i.test(sql)
  },
  {
    name: '9. Table public.appointment_resources created for tracking allocations',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.appointment_resources/i.test(sql) &&
                /REFERENCES\s+public\.appointments\s*\(id\)/i.test(sql) &&
                /REFERENCES\s+public\.resources\s*\(id\)/i.test(sql) &&
                /CONSTRAINT\s+uq_appointment_resource\s+UNIQUE\s*\(\s*appointment_id,\s*resource_id\s*\)/i.test(sql)
  },
  {
    name: '10. Direct raw table access REVOKED on appointment_resources and resource_blocks',
    test: () => /REVOKE\s+ALL\s+ON\s+public\.appointment_resources\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i.test(sql) &&
                /REVOKE\s+ALL\s+ON\s+public\.resource_blocks\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i.test(sql)
  },
  {
    name: '11. Function evaluate_resource_availability exists with search_path and SECURITY DEFINER',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.evaluate_resource_availability/i.test(sql) &&
                /SECURITY\s+DEFINER/i.test(sql) &&
                /SET\s+search_path\s*=\s*pg_catalog,\s*public,\s*extensions/i.test(sql)
  },
  {
    name: '12. evaluate_resource_availability checks block conflicts during requested window',
    test: () => /FROM\s+public\.resource_blocks\s+rb/i.test(sql) &&
                /\(rb\.start_date\s*\+\s*rb\.start_time\)\s*<\s*v_req_end/i.test(sql) &&
                /\(rb\.end_date\s*\+\s*rb\.end_time\)\s*>\s*v_req_start/i.test(sql)
  },
  {
    name: '13. evaluate_resource_availability checks active appointment allocations vs resource capacity',
    test: () => /JOIN\s+public\.appointments\s+a\s+ON\s+a\.id\s*=\s*ar\.appointment_id/i.test(sql) &&
                /a\.status\s+NOT\s+IN\s*\(\s*'cancelled',\s*'cancelled_by_customer'/i.test(sql) &&
                /v_allocated_qty\s*\+\s*v_req_record\.required_quantity\s*\)\s*<=\s*v_resource\.capacity/i.test(sql)
  },
  {
    name: '14. evaluate_resource_availability fails closed when mandatory requirement cannot be fulfilled',
    test: () => /IF\s+v_req_record\.is_mandatory\s+AND\s+NOT\s+v_candidate_found\s+THEN/i.test(sql) &&
                /'reason_code',\s*'resource_unavailable'/i.test(sql)
  },
  {
    name: '15. Canonical evaluate_booking_slot integrates evaluate_resource_availability',
    test: () => /v_res_eval\s*:=\s*public\.evaluate_resource_availability/i.test(sql) &&
                /IF\s+NOT\s*\(v_res_eval->>'allowed'\)::boolean\s+THEN/i.test(sql)
  },
  {
    name: '16. evaluate_booking_slot returns allocated resource_id on ok',
    test: () => /'resource_id',\s*v_res_eval->>'resource_id'/i.test(sql)
  },
  {
    name: '17. RPC allocate_appointment_resource exists with upsert semantics',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.allocate_appointment_resource/i.test(sql) &&
                /ON\s+CONFLICT\s*\(appointment_id,\s*resource_id\)\s+DO\s+UPDATE/i.test(sql)
  },
  {
    name: '18. Execution grants on evaluate_booking_slot and allocate_appointment_resource revoked from PUBLIC/anon',
    test: () => /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.evaluate_booking_slot.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.evaluate_booking_slot.*FROM\s+anon;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.allocate_appointment_resource.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.allocate_appointment_resource.*FROM\s+anon;/i.test(sql)
  },
  {
    name: '19. evaluate_booking_slot and allocate_appointment_resource granted to authenticated and service_role',
    test: () => /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.evaluate_booking_slot.*TO\s+authenticated,\s*service_role;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.allocate_appointment_resource.*TO\s+authenticated,\s*service_role;/i.test(sql)
  },
  {
    name: '20. evaluate_resource_availability execution revoked from PUBLIC/anon and granted to trusted roles',
    test: () => /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.evaluate_resource_availability.*FROM\s+PUBLIC;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.evaluate_resource_availability.*FROM\s+anon;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.evaluate_resource_availability.*TO\s+authenticated,\s*service_role;/i.test(sql)
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
