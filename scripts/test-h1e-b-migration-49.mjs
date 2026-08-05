import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { validateSqlStructure } from './validate-supabase-migration-sql.mjs';

console.log('=== STAGE H1E-B MIGRATION 49 HARMONIZED QA ===');

const EXPECTED_MIG47_HASH = '6b4d45b226d16f54d4a4a6357aa7ab36bf836c47966df34c53857a0ec97f1e82';
const mig47Path = path.join(process.cwd(), 'supabase/migrations/20260822_h1e_release_control_and_eligibility_read_contracts.sql');
const mig48Path = path.join(process.cwd(), 'supabase/migrations/20260823_h1e_a_eligibility_runtime_contract_fix.sql');
const mig49Path = path.join(process.cwd(), 'supabase/migrations/20260824_h1e_b_pilot_authorization_history.sql');

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

// 1. Cryptographic Migration 47 & 48 Immutability Check
check('1. Migration 47 cryptographic SHA-256 digest matches frozen baseline', () => {
  if (!fs.existsSync(mig47Path)) throw new Error('Migration 47 file missing');
  const buf = fs.readFileSync(mig47Path);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  if (hash !== EXPECTED_MIG47_HASH) {
    throw new Error(`Migration 47 hash mismatch! Expected ${EXPECTED_MIG47_HASH}, got ${hash}`);
  }
});

check('2. Migration 48 file exists and remains present', () => {
  if (!fs.existsSync(mig48Path)) throw new Error('Migration 48 file missing');
});

// 3. Migration 49 File & Total Migration Count
check('3. Migration 49 file exists with exact filename', () => {
  if (!fs.existsSync(mig49Path)) throw new Error('Migration 49 file missing');
});

check('4. Total migration count is exactly 49', () => {
  const files = fs.readdirSync(path.join(process.cwd(), 'supabase/migrations')).filter(f => f.endsWith('.sql'));
  if (files.length !== 49) throw new Error(`Expected 49 migration files, found ${files.length}`);
});

const content49 = fs.readFileSync(mig49Path, 'utf8');
const codeLines = content49.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

// 5. SQL Structure Validation for Migration 49
check('5. Migration 49 passes real SQL structure validation', () => {
  validateSqlStructure(content49);
});

// 6. Tenant Pilot Authorizations Table & Index Check
check('6. Migration 49 provisions tenant_pilot_authorizations table with partial unique index for active authorization', () => {
  if (!codeLines.includes('CREATE TABLE IF NOT EXISTS public.tenant_pilot_authorizations') ||
      !codeLines.includes('approved_reason TEXT NOT NULL CHECK (trim(approved_reason) != \'\')') ||
      !codeLines.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_pilot_authorizations_active_unique') ||
      !codeLines.includes('WHERE revoked_at IS NULL')) {
    throw new Error('Migration 49 missing tenant_pilot_authorizations table or partial unique index!');
  }
});

// 7. Security ACLs & Direct Write Deny RLS
check('7. Migration 49 revokes direct write privileges and enforces strict RLS', () => {
  if (!codeLines.includes('tenant_pilot_authorizations_no_direct_write') ||
      !codeLines.includes('public.is_super_admin(auth.uid())')) {
    throw new Error('Migration 49 RLS write deny or super-admin check missing!');
  }
});

// 8. RPC Definitions Verification
check('8. Migration 49 provisions super_admin_get_tenant_pilot_authorization read RPC', () => {
  if (!codeLines.includes('CREATE OR REPLACE FUNCTION public.super_admin_get_tenant_pilot_authorization(') ||
      !codeLines.includes('REVOKE ALL ON FUNCTION public.super_admin_get_tenant_pilot_authorization(UUID) FROM PUBLIC, anon;')) {
    throw new Error('Migration 49 super_admin_get_tenant_pilot_authorization read RPC missing or improperly granted');
  }
});

check('9. Migration 49 provisions super_admin_approve_tenant_pilot mutation RPC with advisory lock', () => {
  if (!codeLines.includes('CREATE OR REPLACE FUNCTION public.super_admin_approve_tenant_pilot(') ||
      !codeLines.includes('pg_advisory_xact_lock(hashtextextended(\'tenant_pilot_authorization:\'')) {
    throw new Error('Migration 49 super_admin_approve_tenant_pilot missing or lacks advisory lock');
  }
});

check('10. Migration 49 provisions super_admin_revoke_tenant_pilot mutation RPC with advisory lock', () => {
  if (!codeLines.includes('CREATE OR REPLACE FUNCTION public.super_admin_revoke_tenant_pilot(') ||
      !codeLines.includes('pg_advisory_xact_lock(hashtextextended(\'tenant_pilot_authorization:\'')) {
    throw new Error('Migration 49 super_admin_revoke_tenant_pilot missing or lacks advisory lock');
  }
});

// 11. Eligibility Snapshot Integration
check('11. Migration 49 updates eligibility snapshot RPC with implementation_state = implemented', () => {
  if (!codeLines.includes('CREATE OR REPLACE FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(') ||
      !codeLines.includes('\'implementation_state\', \'implemented\'') ||
      !codeLines.includes('v_authorized := v_active_auth_found;')) {
    throw new Error('Migration 49 eligibility snapshot RPC missing H1E-B integration facts!');
  }
});

// 12. Safety Invariants (bookable remains false, payments disabled)
check('12. Migration 49 preserves bookable = false and does not alter can_accept_public_booking', () => {
  if (!codeLines.includes('v_bookable := false;') || codeLines.includes('can_accept_public_booking')) {
    throw new Error('Migration 49 violates bookable = false invariant or modifies can_accept_public_booking!');
  }
});

console.log('\n══════════════════════════════════════════════════════════');
console.log('Defined tests: ' + defined);
console.log('Executed tests: ' + executed);
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
console.log('Final exit code: ' + (failed === 0 ? 0 : 1));

process.exit(failed === 0 ? 0 : 1);
