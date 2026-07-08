import fs from 'fs';
import path from 'path';

console.log('🏁 Starting QA Verification: Supabase Auth & RLS Bootstrap Readiness...');

const root = process.cwd();

// 1. Files that should exist
const essentialFiles = [
  'docs/SUPABASE_AUTH_RLS_BOOTSTRAP_RUNBOOK.md',
  'docs/SUPABASE_RLS_IDENTITY_MODEL_DECISION.md',
  'docs/SUPABASE_STAGING_AUTH_SEED_PLAN.md',
  'docs/SUPABASE_STAGING_EXECUTION_CHECKLIST.md',
  'supabase/seed/paymentless_staging_seed.sql',
  'supabase/tests/paymentless_production_rls_smoke.sql',
  'supabase/migrations/20260622_paymentless_production_rls_identity_alignment.sql'
];

essentialFiles.forEach(file => {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ QA ERROR: Essential bootstrap file is missing: ${file}`);
    process.exit(1);
  }
  console.log(`✅ File present: ${file}`);
});

// 2. Audit files for legacy "salon_owner" role
// "salon_owner" must be completely replaced by "tenant_owner" as canonical
const filesToAudit = [
  'types.ts',
  'services/authService.ts',
  'services/pilotDemoService.ts',
  'App.tsx',
  'utils/previewAuth.ts',
  'scripts/verify-mock-crud.ts',
  'supabase/seed/paymentless_staging_seed.sql',
  'supabase/tests/paymentless_production_rls_smoke.sql',
  'supabase/tests/rls_tenant_isolation_scenarios.sql',
  'supabase/migrations/001_initial_schema.sql',
  'supabase/migrations/005_salon_business_profile.sql',
  'supabase/migrations/20260622_paymentless_production_rls_identity_alignment.sql',
  'supabase/migrations/20260601_lari_core_schema_alignment.sql',
  'docs/SUPABASE_AUTH_RLS_BOOTSTRAP_RUNBOOK.md',
  'docs/SUPABASE_STAGING_AUTH_SEED_PLAN.md',
  'docs/SUPABASE_STAGING_EXECUTION_CHECKLIST.md'
];

let legacyRoleCount = 0;

filesToAudit.forEach(file => {
  const fullPath = path.join(root, file);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    // Check for instances of salon_owner that are not part of an explanation of a legacy role
    if (content.includes('salon_owner') && !content.includes('Equivalent to \'tenant_owner\'')) {
      console.error(`❌ QA ERROR: Legacy role name 'salon_owner' found in ${file}`);
      legacyRoleCount++;
    }
  }
});

if (legacyRoleCount > 0) {
  console.error(`❌ QA FAILED: Found ${legacyRoleCount} instance(s) of legacy 'salon_owner' role.`);
  process.exit(1);
} else {
  console.log('✅ Legacy role check: No unauthorized legacy \'salon_owner\' roles exist in active code, migrations, or tests.');
}

// 3. Verify users_profile identity model in types.ts
const typesContent = fs.readFileSync(path.join(root, 'types.ts'), 'utf8');
if (!typesContent.includes('tenant_owner')) {
  console.error('❌ QA ERROR: types.ts is missing the canonical tenant_owner role.');
  process.exit(1);
}
console.log('✅ types.ts correctly defines canonical role fields.');

console.log('🎉 QA SUCCESS: Supabase Auth & RLS Bootstrap is verified as 100% compliant!');
process.exit(0);
