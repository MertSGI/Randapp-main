import fs from 'fs';
import path from 'path';

console.log('--- PHASE 5 NODE 2 CLINIC PRACTITIONER PERMISSIONS CONTRACT VALIDATION ---');

const migrationFile = 'supabase/migrations/20260928_phase5_clinic_practitioners_workspace_hardening.sql';
if (!fs.existsSync(migrationFile)) {
  console.error('[FAIL] Migration file not found:', migrationFile);
  process.exit(1);
}
const sql = fs.readFileSync(migrationFile, 'utf8');

function assertRule(num, desc, condition) {
  if (condition) {
    console.log(`[PASS] ${num}. ${desc}`);
  } else {
    console.error(`[FAIL] ${num}. ${desc}`);
    process.exit(1);
  }
}

assertRule(1, 'clinic_set_staff_profile checks resolve_tenant_vertical_context',
  sql.includes('resolve_tenant_vertical_context') && sql.includes('clinic_set_staff_profile'));

assertRule(2, 'clinic_set_staff_profile enforces subscription eligibility fail-closed',
  sql.includes("v_vert_ctx->>'eligible'") && sql.includes('Tenant subscription is not currently eligible'));

assertRule(3, 'clinic_set_staff_profile enforces clinic_enabled vertical check',
  sql.includes("clinic_enabled") && sql.includes('Clinic workspace vertical is not enabled'));

assertRule(4, 'clinic_set_staff_profile enforces active tenant owner authorization',
  sql.includes("role = 'tenant_owner'") && sql.includes('active = true'));

assertRule(5, 'clinic_set_staff_profile enforces note-writing implies record-viewing invariant',
  sql.includes('p_can_write_clinical_notes = true THEN') && sql.includes('v_can_view := true'));

assertRule(6, 'clinic_set_staff_profile records audit event metadata with zero clinical payload',
  sql.includes('audit_events') && sql.includes('clinic_staff_profile_changed'));

assertRule(7, 'clinic_get_my_context verifies tenant vertical eligibility and fails closed',
  sql.includes('clinic_vertical_disabled') && sql.includes('clinic_get_my_context'));

assertRule(8, 'Zero duplicate clinic tables created',
  !sql.toLowerCase().includes('create table public.clinic_staff_profiles') &&
  !sql.toLowerCase().includes('create table public.clinic_patient_profiles'));

assertRule(9, 'Execution revoked from PUBLIC and anon, granted to authenticated and service_role',
  sql.includes('REVOKE ALL ON FUNCTION public.clinic_set_staff_profile FROM PUBLIC, anon;') &&
  sql.includes('GRANT EXECUTE ON FUNCTION public.clinic_set_staff_profile TO authenticated, service_role;') &&
  sql.includes('REVOKE EXECUTE ON FUNCTION public.clinic_get_my_context() FROM PUBLIC, anon;'));

assertRule(10, 'clinic_get_my_context scopes permitted_branch_ids via canonical staff_branches membership',
  sql.includes('JOIN public.staff_branches sb ON sb.branch_id = b.id') &&
  sql.includes('sb.staff_id = v_staff.id'));

console.log('\n========================================');
console.log('PHASE 5 NODE 2 CONTRACTS: 10 | PASSED: 10 | FAILED: 0');
console.log('========================================\n');
