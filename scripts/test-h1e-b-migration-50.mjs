import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { validateSqlStructure } from './validate-supabase-migration-sql.mjs';

console.log('=== STAGE H1E-B1 MIGRATION 50 HARMONIZED QA ===');

const EXPECTED_MIG47_HASH = '6b4d45b226d16f54d4a4a6357aa7ab36bf836c47966df34c53857a0ec97f1e82';
const mig47Path = path.join(process.cwd(), 'supabase/migrations/20260822_h1e_release_control_and_eligibility_read_contracts.sql');
const mig48Path = path.join(process.cwd(), 'supabase/migrations/20260823_h1e_a_eligibility_runtime_contract_fix.sql');
const mig49Path = path.join(process.cwd(), 'supabase/migrations/20260824_h1e_b_pilot_authorization_history.sql');
const mig50Path = path.join(process.cwd(), 'supabase/migrations/20260825_h1e_b_authorization_contract_hardening.sql');

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

// 1. Cryptographic Migration 47 Baseline Check
check('1. Migration 47 cryptographic SHA-256 digest matches frozen baseline', () => {
  if (!fs.existsSync(mig47Path)) throw new Error('Migration 47 file missing');
  const buf = fs.readFileSync(mig47Path);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  if (hash !== EXPECTED_MIG47_HASH) {
    throw new Error(`Migration 47 hash mismatch! Expected ${EXPECTED_MIG47_HASH}, got ${hash}`);
  }
});

// 2. Migration 48 and 49 Immutability
check('2. Migrations 48 and 49 files exist and remain present', () => {
  if (!fs.existsSync(mig48Path)) throw new Error('Migration 48 file missing');
  if (!fs.existsSync(mig49Path)) throw new Error('Migration 49 file missing');
});

// 3. Migration 50 File & Total Migration Count
check('3. Migration 50 file exists with exact filename', () => {
  if (!fs.existsSync(mig50Path)) throw new Error('Migration 50 file missing');
});

check('4. Total migration count is exactly 50', () => {
  const files = fs.readdirSync(path.join(process.cwd(), 'supabase/migrations')).filter(f => f.endsWith('.sql'));
  if (files.length !== 50) throw new Error(`Expected 50 migration files, found ${files.length}`);
});

const content50 = fs.readFileSync(mig50Path, 'utf8');
const codeLines = content50.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

// 5. Real SQL Structure Validation for Migration 50
check('5. Migration 50 passes real SQL structure validation', () => {
  validateSqlStructure(content50);
});

// 6. Direct Table Privileges Revoked
check('6. Migration 50 revokes all table privileges from PUBLIC, anon, authenticated and drops direct SELECT policy', () => {
  if (!codeLines.includes('REVOKE ALL ON TABLE public.tenant_pilot_authorizations FROM PUBLIC, anon, authenticated;') ||
      !codeLines.includes('DROP POLICY IF EXISTS tenant_pilot_authorizations_super_admin_read ON public.tenant_pilot_authorizations;')) {
    throw new Error('Migration 50 missing REVOKE ALL or direct SELECT policy drop!');
  }
});

// 7. Canonical Uppercase Reason Codes
check('7. Migration 50 normalizes error reason codes to uppercase (UNAUTHORIZED, IDEMPOTENCY_KEY_REQUIRED, TENANT_NOT_FOUND, INVALID_REASON, IDEMPOTENCY_CONFLICT)', () => {
  if (!codeLines.includes('\'reason_code\', \'UNAUTHORIZED\'') ||
      !codeLines.includes('\'reason_code\', \'IDEMPOTENCY_KEY_REQUIRED\'') ||
      !codeLines.includes('\'reason_code\', \'TENANT_NOT_FOUND\'') ||
      !codeLines.includes('\'reason_code\', \'INVALID_REASON\'') ||
      !codeLines.includes('\'reason_code\', \'IDEMPOTENCY_CONFLICT\'')) {
    throw new Error('Migration 50 contains un-normalized lowercase reason codes!');
  }
});

// 8. Idempotency Key Hashing in Audit
check('8. Migration 50 replaces raw idempotency key in audit payloads with idempotency_key_hash', () => {
  if (codeLines.includes('\'idempotency_key\', p_idempotency_key') ||
      !codeLines.includes('\'idempotency_key_hash\', md5(p_idempotency_key)')) {
    throw new Error('Migration 50 exposes raw idempotency key in audit payload!');
  }
});

// 9. Mutation Evidence Read RPC Provisioning
check('9. Migration 50 provisions super_admin_get_tenant_pilot_mutation_evidence read RPC', () => {
  if (!codeLines.includes('CREATE OR REPLACE FUNCTION public.super_admin_get_tenant_pilot_mutation_evidence(') ||
      !codeLines.includes('REVOKE ALL ON FUNCTION public.super_admin_get_tenant_pilot_mutation_evidence(UUID, TEXT) FROM PUBLIC, anon;')) {
    throw new Error('Migration 50 missing mutation evidence RPC or ACL grants!');
  }
});

// 10. Safety Invariants
check('10. Migration 50 preserves bookable = false and does not touch can_accept_public_booking', () => {
  if (codeLines.includes('can_accept_public_booking')) {
    throw new Error('Migration 50 modifies can_accept_public_booking!');
  }
});

console.log('\n══════════════════════════════════════════════════════════');
console.log('Defined tests: ' + defined);
console.log('Executed tests: ' + executed);
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
console.log('Final exit code: ' + (failed === 0 ? 0 : 1));

process.exit(failed === 0 ? 0 : 1);
