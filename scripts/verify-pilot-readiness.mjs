import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✅ PASS: ${message}`);
  }
}

console.log('=== Stage G1 — Paymentless Pilot Readiness & Audit Suite ===\n');

// ── 1. Release Candidate SHA & Working Tree ──
console.log('--- §1 Release Candidate & Git Integrity ---');
const currentSha = execSync('git rev-parse HEAD').toString().trim();
console.log(`  Release Candidate SHA: ${currentSha}`);
assert(currentSha.length === 40, 'Valid 40-character git commit SHA');

const status = execSync('git status --porcelain').toString().trim();
assert(status === '', 'Working tree is 100% clean');

// ── 2. Migration Parity (34/34) ──
console.log('\n--- §2 Migration Parity ---');
const migDir = path.join(process.cwd(), 'supabase', 'migrations');
const files = fs.readdirSync(migDir).filter(f => f.endsWith('.sql'));
assert(files.length === 34, `34 migration files present on disk (found: ${files.length})`);

const manifestPath = path.join(process.cwd(), 'supabase', 'MIGRATION_APPLY_MANIFEST.md');
const manifestContent = fs.readFileSync(manifestPath, 'utf8');
assert(manifestContent.includes('20260809_admin_reschedule_decision_lock_and_reason_fix.sql'), 'Migration 34 documented in MIGRATION_APPLY_MANIFEST.md');

// ── 3. Frontend & Repository Security ──
console.log('\n--- §3 Frontend & Repository Security ---');
let serviceRoleKeys = '';
try {
  serviceRoleKeys = execSync('git grep "service_role" -- "pages/*" "components/*" "services/*"').toString().trim();
} catch (e) {
  serviceRoleKeys = '';
}
assert(serviceRoleKeys === '', 'Zero service_role key references in frontend source files');

// ── 4. Paymentless Mode Enforcement ──
console.log('\n--- §4 Paymentless Mode Enforcement ---');
const envExample = fs.readFileSync(path.join(process.cwd(), '.env.example'), 'utf8');
assert(envExample.includes('VITE_PAYMENT_MODE=disabled') || envExample.includes('PAYMENT_DISABLED'), 'Default payment mode disabled in environment configuration');

// ── 5. Single Mount Integrity ──
console.log('\n--- §5 Admin Review UI Single-Mount Verification ---');
const adminPageContent = fs.readFileSync(path.join(process.cwd(), 'pages', 'AdminPage.tsx'), 'utf8');
const mountCount = (adminPageContent.match(/<RescheduleRequestsTab/g) || []).length;
assert(mountCount === 1, `RescheduleRequestsTab mounted exactly once in AdminPage.tsx (found: ${mountCount})`);

// ── 6. Outbox Dispatcher Reality Assessment ──
console.log('\n--- §6 Outbox Dispatcher Reality Assessment ---');
console.log('  [NOTICE] communication_outbox records events transactionally (reschedule_request_created, reschedule_request_approved, reschedule_request_rejected).');
console.log('  [NOTICE] IS_COMMUNICATION_OUTBOX_ACTUALLY_DELIVERED = NO (Rows remain queued; operational pilot runbook uses manual notification processing).');

console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ Stage G1 Paymentless Pilot Readiness Audit PASSED.');
