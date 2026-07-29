// scripts/test-customer-token-cancellation-rpc.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Stage E1 — Customer Token Cancellation RPC QA Test Suite
// ═══════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

console.log('🏁 Stage E1 — Customer Token Cancellation RPC QA');

// ═══════════════════════════════════════════════════════════════════════════
// §1: Migration File & Static SQL Contract
// ═══════════════════════════════════════════════════════════════════════════

section('§1 Migration File & Static SQL Contract');

const migrationPath = path.join(
  process.cwd(), 'supabase', 'migrations',
  '20260801_cancel_public_appointment_by_manage_token_rpc.sql'
);

assert(fs.existsSync(migrationPath), 'Migration 26 file exists');

const sql = fs.readFileSync(migrationPath, 'utf8');

assert(sql.includes('CREATE OR REPLACE FUNCTION public.cancel_public_appointment_by_manage_token'),
  'Creates cancel_public_appointment_by_manage_token RPC');
assert(sql.includes('SECURITY DEFINER'), 'Function is SECURITY DEFINER');
assert(sql.includes('SET search_path = pg_catalog, public'), 'Explicit search_path set');
assert(sql.includes("encode(sha256(trim(p_token)::bytea), 'hex')"), 'SHA-256 token hashing algorithm matches Stage C1');
assert(sql.includes('FOR UPDATE'), 'Uses SELECT ... FOR UPDATE row locking');
assert(sql.includes('cancelled_by_customer'), 'Sets status to cancelled_by_customer');
assert(sql.includes("'no_change'"), 'Replays cancelled_by_customer as no_change');
assert(sql.includes("'invalid_transition'"), 'Returns invalid_transition for terminal statuses');
assert(sql.includes('INSERT INTO public.audit_events'), 'Inserts audit log on real mutation');
assert(sql.includes('INSERT INTO public.communication_outbox'), 'Inserts communication outbox event on real mutation');
assert(sql.includes('REVOKE ALL ON FUNCTION public.cancel_public_appointment_by_manage_token'), 'Revokes execute from PUBLIC');
assert(sql.includes('GRANT EXECUTE ON FUNCTION public.cancel_public_appointment_by_manage_token'), 'Grants execute to anon, authenticated');

// ═══════════════════════════════════════════════════════════════════════════
// §2: Service Layer Integration
// ═══════════════════════════════════════════════════════════════════════════

section('§2 Service Layer Integration');

const servicePath = path.join(process.cwd(), 'services', 'appointmentSelfServiceService.ts');
assert(fs.existsSync(servicePath), 'appointmentSelfServiceService.ts exists');

const serviceSource = fs.readFileSync(servicePath, 'utf8');

assert(serviceSource.includes('/rest/v1/rpc/cancel_public_appointment_by_manage_token'),
  'Service calls /rest/v1/rpc/cancel_public_appointment_by_manage_token');
assert(serviceSource.includes('p_token: token.trim()'), 'Sends p_token');
assert(serviceSource.includes('p_reason:'), 'Sends p_reason');

// Forbidden client fields must NOT be sent in RPC payload
assert(!serviceSource.includes('p_tenant_id:'), 'Does NOT send p_tenant_id in cancel RPC payload');
assert(!serviceSource.includes('p_actor_id:'), 'Does NOT send p_actor_id in cancel RPC payload');
assert(!serviceSource.includes('p_customer_id:'), 'Does NOT send p_customer_id in cancel RPC payload');

// ═══════════════════════════════════════════════════════════════════════════
// §3: Security & Secret Leak Checks
// ═══════════════════════════════════════════════════════════════════════════

section('§3 Security & Secret Leak Checks');

assert(!sql.includes('service_role'), 'SQL does not contain hardcoded service_role keys');
assert(!serviceSource.includes('service_role'), 'Service source does not contain hardcoded service_role keys');

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════════════════');
console.log(`  Passed:  ${passed}`);
console.log(`  Failed:  ${failed}`);
console.log(`  Total:   ${passed + failed}`);
console.log('══════════════════════════════════════════════════════════');

if (failed > 0) {
  console.error(`\n❌ ${failed} assertion(s) FAILED. Stage E1 token cancellation QA FAILED.\n`);
  process.exit(1);
}

console.log(`\n✅ All ${passed} assertions passed. Stage E1 token cancellation QA PASSED.\n`);
process.exit(0);
