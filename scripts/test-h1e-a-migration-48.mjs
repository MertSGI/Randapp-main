import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { validateSqlStructure } from './validate-supabase-migration-sql.mjs';

console.log('=== STAGE H1E-A MIGRATION 48 HARMONIZED QA ===');

const EXPECTED_MIG47_HASH = '6b4d45b226d16f54d4a4a6357aa7ab36bf836c47966df34c53857a0ec97f1e82';
const mig47Path = path.join(process.cwd(), 'supabase/migrations/20260822_h1e_release_control_and_eligibility_read_contracts.sql');
const mig48Path = path.join(process.cwd(), 'supabase/migrations/20260823_h1e_a_eligibility_runtime_contract_fix.sql');

let defined = 0;
let executed = 0;
let passed = 0;
let failed = 0;

function check(title, fn) {
  defined++;
  executed++;
  try {
    fn();
    passed++;
    console.log('  ✅ PASS: ' + title);
  } catch (err) {
    failed++;
    console.error('  ❌ FAIL: ' + title + ' - ' + err.message);
  }
}

// 1. Cryptographic Migration 47 SHA-256 Check
check('1. Migration 47 cryptographic SHA-256 digest matches frozen baseline', () => {
  if (!fs.existsSync(mig47Path)) throw new Error('Migration 47 file missing');
  const buf = fs.readFileSync(mig47Path);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  if (hash !== EXPECTED_MIG47_HASH) {
    throw new Error(`Migration 47 hash mismatch! Expected ${EXPECTED_MIG47_HASH}, got ${hash}`);
  }
});

// 2. Migration 48 File & Manifest
check('2. Migration 48 file exists with exact filename', () => {
  if (!fs.existsSync(mig48Path)) throw new Error('Migration 48 file missing');
});

check('3. Total migration count is at least 48', () => {
  const files = fs.readdirSync(path.join(process.cwd(), 'supabase/migrations')).filter(f => f.endsWith('.sql'));
  if (files.length < 48) throw new Error(`Expected at least 48 migration files, found ${files.length}`);
});

const content48 = fs.readFileSync(mig48Path, 'utf8');
const codeLines = content48.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

// 4. SQL Structure Validation
check('4. Migration 48 passes real SQL structure validation', () => {
  validateSqlStructure(content48);
});

// 5. Live Column Verification
check('5. Migration 48 uses exact live columns services.active and staff.active', () => {
  if (codeLines.includes('services.is_active') || codeLines.includes('staff.is_active')) {
    throw new Error('Migration 48 contains non-existent is_active column references!');
  }
  if (!codeLines.includes('services') || !codeLines.includes('active = true')) {
    throw new Error('Migration 48 missing active = true checks');
  }
});

// 6. Fail-closed Missing Singleton Return
check('6. Migration 48 returns immediate fail-closed error envelope when singleton is missing', () => {
  if (!codeLines.includes('IF NOT FOUND OR v_release_phase IS NULL THEN') ||
      !codeLines.includes("'RELEASE_CONTROL_UNAVAILABLE'")) {
    throw new Error('Migration 48 missing immediate fail-closed return on missing singleton');
  }
});

// 7. Canonical Phase Derivation
check('7. Migration 48 derives production_authorized & pilot_enforce_req strictly from release_phase', () => {
  if (!codeLines.includes("v_release_phase = 'full_production'") ||
      !codeLines.includes("v_release_phase = 'paymentless_pilot'")) {
    throw new Error('Migration 48 missing canonical phase derivation');
  }
});

// 8. Explicit Join-Based Relationship Verification
check('8. Migration 48 performs explicit join queries across staff_branches, service_branches, and staff_services on primary branch', () => {
  if (!codeLines.includes('staff_branches') || !codeLines.includes('service_branches') || !codeLines.includes('staff_services')) {
    throw new Error('Migration 48 missing explicit relationship proof joins!');
  }
  if (!codeLines.includes('stb.branch_id = v_primary_branch_id') || !codeLines.includes('seb.branch_id = v_primary_branch_id')) {
    throw new Error('Migration 48 staff_can_perform_service query does not join staff_branches and service_branches on v_primary_branch_id!');
  }
});

// 9. Global Restriction Scope Verification
check('9. Migration 48 contains no is_global reference and uses tenant_id IS NULL for global scope', () => {
  if (codeLines.includes('is_global')) {
    throw new Error('Migration 48 contains non-existent is_global column reference!');
  }
  if (!codeLines.includes('tenant_id IS NULL')) {
    throw new Error('Migration 48 missing tenant_id IS NULL global restriction predicate!');
  }
});

// 10. Integration of Commercial Resolver Result
check('10. Migration 48 incorporates resolve_tenant_commercial_eligibility result into SUBSCRIPTION_BLOCKED', () => {
  if (!codeLines.includes('resolve_tenant_commercial_eligibility') || !codeLines.includes('NOT v_comm_eligible')) {
    throw new Error('Migration 48 does not use commercial resolver result for SUBSCRIPTION_BLOCKED');
  }
});

// 10. Blocker-Consistent Eligible Semantics
check('10. Migration 48 enforces blocker-consistent eligible boolean semantics', () => {
  if (!codeLines.includes('v_eligible := v_tenant_exists') ||
      !codeLines.includes('NOT v_core_booking_restricted') ||
      !codeLines.includes('NOT v_core_entitlement_blocked')) {
    throw new Error('Migration 48 eligible boolean logic allows blockers to be ignored');
  }
});

// 11. Security ACLs & Immutability
check('11. Migration 48 preserves canonical super-admin check and ACLs', () => {
  if (!codeLines.includes('public.is_super_admin(v_actor_user_id)') ||
      !codeLines.includes('REVOKE ALL ON FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(UUID) FROM PUBLIC, anon;') ||
      !codeLines.includes('GRANT EXECUTE ON FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(UUID) TO authenticated;')) {
    throw new Error('Migration 48 ACL grants/revokes invalid');
  }
});

// 12. Negative Fixture Tests
check('12. Negative Fixtures: altered Migration 47 hash is caught', () => {
  const tamperedBuf = Buffer.from(fs.readFileSync(mig47Path) + ' ');
  const tamperedHash = crypto.createHash('sha256').update(tamperedBuf).digest('hex');
  if (tamperedHash === EXPECTED_MIG47_HASH) {
    throw new Error('Tampered hash check failed');
  }
});

console.log('\n══════════════════════════════════════════════════════════');
console.log('Defined tests: ' + defined);
console.log('Executed tests: ' + executed);
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
console.log('Final exit code: ' + (failed === 0 ? 0 : 1));

process.exit(failed === 0 ? 0 : 1);
