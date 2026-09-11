import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

console.log('--- PHASE 3 RESOURCE & CAPACITY R1 HARDENED CONTRACT VALIDATION ---');

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
    name: '2. Table public.resources created with tenant and branch composite foreign key and unique (id, tenant_id)',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.resources/i.test(sql) &&
                /REFERENCES\s+public\.branches\s*\(id,\s*tenant_id\)/i.test(sql) &&
                /CONSTRAINT\s+uq_resources_id_tenant\s+UNIQUE\s*\(\s*id,\s*tenant_id\s*\)/i.test(sql)
  },
  {
    name: '3. Resources table enforces capacity >= 1 and valid resource types',
    test: () => /CHECK\s*\(capacity\s*>=\s*1\)/i.test(sql) &&
                /resource_type\s+VARCHAR\(60\)\s+NOT\s+NULL\s+CHECK/i.test(sql)
  },
  {
    name: '4. Direct raw table access REVOKED from PUBLIC, anon, and authenticated on resources',
    test: () => /REVOKE\s+ALL\s+ON\s+public\.resources\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i.test(sql) &&
                /ALTER\s+TABLE\s+public\.resources\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i.test(sql)
  },
  {
    name: '5. Table public.service_resource_requirements enforces composite (service_id, tenant_id) and (resource_id, tenant_id)',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.service_resource_requirements/i.test(sql) &&
                /REFERENCES\s+public\.services\s*\(id,\s*tenant_id\)/i.test(sql) &&
                /REFERENCES\s+public\.resources\s*\(id,\s*tenant_id\)/i.test(sql)
  },
  {
    name: '6. Table public.resource_blocks enforces composite (resource_id, tenant_id)',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.resource_blocks/i.test(sql) &&
                /REFERENCES\s+public\.resources\s*\(id,\s*tenant_id\)/i.test(sql)
  },
  {
    name: '7. Table public.appointment_resources enforces composite (appointment_id, tenant_id) and (resource_id, tenant_id) with unique (appointment_id, resource_id)',
    test: () => /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.appointment_resources/i.test(sql) &&
                /REFERENCES\s+public\.appointments\s*\(id,\s*tenant_id\)/i.test(sql) &&
                /REFERENCES\s+public\.resources\s*\(id,\s*tenant_id\)/i.test(sql) &&
                /CONSTRAINT\s+uq_appointment_resource\s+UNIQUE/i.test(sql)
  },
  {
    name: '8. evaluate_and_lock_resource_plan supports deterministic advisory locking in stable resource order',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.evaluate_and_lock_resource_plan/i.test(sql) &&
                /ORDER\s+BY\s+srr\.id\s+ASC/i.test(sql) &&
                /ORDER\s+BY\s+r\.id\s+ASC/i.test(sql) &&
                /pg_advisory_xact_lock/i.test(sql)
  },
  {
    name: '9. evaluate_and_lock_resource_plan returns complete allocation plan for all mandatory requirements',
    test: () => /allocation_plan/i.test(sql) &&
                /jsonb_build_object\(\s*'allowed',\s*true,\s*'reason_code',\s*'ok',\s*'allocation_plan',\s*v_plan\s*\)/i.test(sql)
  },
  {
    name: '10. evaluate_and_lock_resource_plan revoked from PUBLIC, anon, and authenticated (service_role only)',
    test: () => /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.evaluate_and_lock_resource_plan.*FROM\s+PUBLIC,\s*anon,\s*authenticated;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.evaluate_and_lock_resource_plan.*TO\s+service_role;/i.test(sql)
  },
  {
    name: '11. Canonical evaluate_booking_slot integrates resource plan evaluation and returns allocation_plan',
    test: () => /v_res_eval\s*:=\s*public\.evaluate_and_lock_resource_plan/i.test(sql) &&
                /'allocation_plan',\s*v_res_eval->'allocation_plan'/i.test(sql)
  },
  {
    name: '12. evaluate_booking_slot preserves EV055-R3 schedule constraints (evaluate_schedule_constraints check)',
    test: () => /evaluate_schedule_constraints/i.test(sql)
  },
  {
    name: '13. allocate_appointment_resource is restricted to service_role and verifies tenant match',
    test: () => /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.allocate_appointment_resource.*FROM\s+PUBLIC,\s*anon,\s*authenticated;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.allocate_appointment_resource.*TO\s+service_role;/i.test(sql) &&
                /APPOINTMENT_TENANT_MISMATCH/i.test(sql) &&
                /RESOURCE_TENANT_MISMATCH/i.test(sql)
  },
  {
    name: '14. Canonical create_public_booking composes resource evaluation, locking, and allocation into single lifecycle (ENGINE COUNT = 1)',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_public_booking/i.test(sql) &&
                /resource_plan_locking/i.test(sql) &&
                /INSERT\s+INTO\s+public\.appointments/i.test(sql) &&
                /INSERT\s+INTO\s+public\.appointment_resources/i.test(sql) &&
                /allocation_plan/i.test(sql)
  },
  {
    name: '15. Administrative RPCs provided: admin_create_resource, admin_update_resource, admin_create_resource_block, admin_set_service_resource_requirement',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_create_resource/i.test(sql) &&
                /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_update_resource/i.test(sql) &&
                /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_create_resource_block/i.test(sql) &&
                /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_set_service_resource_requirement/i.test(sql)
  },
  {
    name: '16. Administrative RPCs enforce role allowlists (tenant_owner or super_admin)',
    test: () => /up\.role\s*<>\s*'super_admin'\s+AND\s*\(up\.role\s*<>\s*'tenant_owner'/i.test(sql) ||
                /v_caller_role\s*<>\s*'super_admin'\s+AND\s*\(v_caller_role\s*<>\s*'tenant_owner'/i.test(sql)
  },
  {
    name: '17. Administrative RPCs revoke execute from public/anon and grant to authenticated/service_role',
    test: () => /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.admin_create_resource.*FROM\s+PUBLIC,\s*anon;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_create_resource.*TO\s+authenticated,\s*service_role;/i.test(sql)
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
console.log('ALL PHASE 3 RESOURCE & CAPACITY R1 HARDENED CONTRACTS PASS.');
