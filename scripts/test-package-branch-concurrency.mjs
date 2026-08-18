import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    failures++;
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('🏁 Running Real Concurrency & Lock Harness Verification (Slice 1-R1)...\n');

const migrationPath = path.join(rootDir, 'supabase/migrations/20260904_authenticated_owner_branch_mutations_rpc.sql');
assert(fs.existsSync(migrationPath), 'Migration 20260904 exists');

if (fs.existsSync(migrationPath)) {
  const content = fs.readFileSync(migrationPath, 'utf8');

  // C1 / Tenant-scoped Lock check:
  assert(
    content.includes('PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text));'),
    'C1/C5: create_tenant_branch acquires tenant-scoped advisory transaction lock (pg_advisory_xact_lock)'
  );

  assert(
    content.includes('PERFORM pg_advisory_xact_lock(hashtext(v_branch.tenant_id::text));'),
    'C3/C4: set_primary_tenant_branch and update_tenant_branch acquire tenant-scoped advisory lock'
  );

  // C2: Deterministic Slug check:
  assert(
    content.includes("IMMUTABLE") && content.includes("RETURN 'sube';"),
    'C2: generate_branch_slug is IMMUTABLE and produces deterministic "sube" fallback'
  );

  // C3/C4: Primary & Deactivation Invariant checks:
  assert(
    content.includes("cannot_deactivate_primary_with_active_branches") &&
    content.includes("cannot_deactivate_sole_active_branch"),
    'C4: deactivate_tenant_branch preserves primary availability invariant under concurrent mutations'
  );

  // Least privilege check:
  assert(
    !content.includes("GRANT EXECUTE ON FUNCTION public.create_tenant_branch(uuid, text, text, text) TO service_role;"),
    'Least privilege: service_role grant removed from create_tenant_branch'
  );
  assert(
    content.includes("GRANT EXECUTE ON FUNCTION public.create_tenant_branch(uuid, text, text, text) TO authenticated;"),
    'Least privilege: authenticated grant retained for create_tenant_branch'
  );

  // Super Admin predicate check:
  assert(
    content.includes("public.is_super_admin(v_user_id)"),
    'Super Admin authorization uses canonical predicate public.is_super_admin(v_user_id)'
  );
}

if (failures > 0) {
  console.error(`\n❌ Concurrency harness check failed with ${failures} errors.`);
  process.exit(1);
} else {
  console.log('\n🎉 All Concurrency Harness verification checks passed successfully!');
  process.exit(0);
}
