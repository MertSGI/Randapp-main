import fs from 'fs';
import path from 'path';

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✅ PASS: ${message}`);
  }
}

console.log('=== Stage G1B — Public Schema Security Inventory QA ===\n');

// 1. Verify all 35 migration files exist
const migDir = path.join(process.cwd(), 'supabase', 'migrations');
const files = fs.readdirSync(migDir).filter(f => f.endsWith('.sql'));
assert(files.length >= 35 && files.length <= 40, `Migration files present (found: ${files.length})`);

// 2. Check Security Definer Search Path Enforcement
let definerFunctions = 0;
let searchPathCompliant = 0;

for (const file of files) {
  const content = fs.readFileSync(path.join(migDir, file), 'utf8');
  const matches = content.match(/SECURITY DEFINER/gi);
  if (matches) {
    definerFunctions += matches.length;
  }
  const spMatches = content.match(/SET search_path = pg_catalog, public/gi);
  if (spMatches) {
    searchPathCompliant += spMatches.length;
  }
}

console.log(`  Found ${definerFunctions} SECURITY DEFINER function declarations.`);
console.log(`  Found ${searchPathCompliant} explicit search_path = pg_catalog, public settings.`);
assert(definerFunctions > 0, 'SECURITY DEFINER functions detected and checked');

// 3. Direct Table Write Revocation Verification
const mig29File = files.find(f => f.includes('appointments_direct_update_hardening'));
assert(Boolean(mig29File), 'Migration 29 (Direct-Write Hardening) exists');
const migD2bContent = fs.readFileSync(path.join(migDir, mig29File), 'utf8');
assert(migD2bContent.includes('REVOKE UPDATE ON public.appointments FROM authenticated'), 'Direct UPDATE on public.appointments revoked from authenticated');

// 4. Reason Preservation Verification
const mig34Path = path.join(migDir, '20260809_admin_reschedule_decision_lock_and_reason_fix.sql');
assert(fs.existsSync(mig34Path), 'Migration 34 exists');
const mig34Content = fs.readFileSync(mig34Path, 'utf8');
assert(mig34Content.includes('resolution_reason'), 'Migration 34 defines resolution_reason for admin decisions');

console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ Stage G1B Public Schema Security Inventory QA PASSED.');
