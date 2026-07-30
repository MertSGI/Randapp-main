#!/usr/bin/env node
// verify-supabase-staging-consistency.mjs
// Description: Validates staging documentation, identity model, and migration list consistency
// before executing a real Supabase staging smoke test.

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(process.cwd());
let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    if (detail) console.log(`     → ${detail}`);
    failed++;
    failures.push(label);
  }
}

function readSafe(filePath) {
  const full = join(ROOT, filePath);
  if (!existsSync(full)) return null;
  return readFileSync(full, 'utf8');
}

console.log('\n🔍 LARİ Supabase Staging Consistency Verification\n');

// =========================================================================
// 1. MIGRATION LIST CONSISTENCY
// =========================================================================
console.log('── 1. Migration List Consistency ──');

const CANONICAL_MIGRATIONS = [
  '001_initial_schema.sql',
  '002_subscription_alignment.sql',
  '003_provisioning_onboarding.sql',
  '004_iyzico_provider_alignment.sql',
  '005_salon_business_profile.sql',
  '20260601_lari_core_schema_alignment.sql',
  '20260619_lari_rls_policy_draft.sql',
  '20260620_paymentless_production_core_tables.sql',
  '20260621_paymentless_production_repository_columns.sql',
  '20260622_paymentless_production_rls_identity_alignment.sql',
  '20260713_communication_outbox_rls_hardening.sql',
  '20260714_tenants_update_rls_hardening.sql',
  '20260715_super_admin_provisioning_rpc.sql',
  '20260716_public_booking_eligibility_rpc.sql',
  '20260720_public_booking_rpc.sql',
  '20260722_public_booking_search_path_fix.sql',
  '20260723_booking_lifecycle_foundation.sql',
  '20260724_admin_rls_and_read_model_fix.sql',
  '20260725_admin_bootstrap_and_runtime_consistency.sql',
  '20260726_admin_rpc_execute_acl_hardening.sql',
  '20260727_admin_runtime_schema_contract_fix.sql',
  '20260728_admin_rpc_live_schema_reconstruction.sql',
  '20260729_admin_bootstrap_subscription_contract_fix.sql',
  '20260730_self_service_token_read_rpc.sql',
  '20260731_admin_appointment_status_mutation_rpc.sql',
  '20260801_cancel_public_appointment_by_manage_token_rpc.sql',
  '20260802_cancel_public_appointment_by_manage_token_schema_fix.sql',
  '20260803_cancel_public_appointment_by_manage_token_audit_outbox_fix.sql',
  '20260804_appointments_direct_update_hardening.sql',
  '20260805_request_public_appointment_reschedule_by_manage_token_rpc.sql',
  '20260806_request_public_appointment_reschedule_outbox_fix.sql',
];

// Check actual migration files on disk
const migrationsDir = join(ROOT, 'supabase', 'migrations');
if (existsSync(migrationsDir)) {
  const diskFiles = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  check(
    `Migration files on disk match canonical list (${CANONICAL_MIGRATIONS.length} files)`,
    diskFiles.length === CANONICAL_MIGRATIONS.length &&
    diskFiles.every((f, i) => f === CANONICAL_MIGRATIONS[i]),
    `Found: [${diskFiles.join(', ')}]`
  );
} else {
  check('supabase/migrations directory exists', false, 'Directory not found');
}

// Check MIGRATION_APPLY_MANIFEST.md
const manifest = readSafe('supabase/MIGRATION_APPLY_MANIFEST.md');
if (manifest) {
  check(
    `MIGRATION_APPLY_MANIFEST.md lists all ${CANONICAL_MIGRATIONS.length} migrations`,
    CANONICAL_MIGRATIONS.every(m => manifest.includes(m)),
    'Missing: ' + CANONICAL_MIGRATIONS.filter(m => !manifest.includes(m)).join(', ')
  );
} else {
  check('MIGRATION_APPLY_MANIFEST.md exists', false);
}



// Check staging docs for migration lists
const DOCS_WITH_MIGRATION_LISTS = [
  'docs/SUPABASE_STAGING_EXECUTION_RUNBOOK.md',
  'docs/REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md',
  'docs/SUPABASE_CANONICAL_MIGRATION_APPLY_STRATEGY.md',
];

const CRITICAL_MIGRATION = '20260713_communication_outbox_rls_hardening.sql';

for (const docPath of DOCS_WITH_MIGRATION_LISTS) {
  const content = readSafe(docPath);
  if (content) {
    check(
      `${docPath} includes latest communication_outbox hardening migration`,
      content.includes(CRITICAL_MIGRATION),
      `Missing: ${CRITICAL_MIGRATION}`
    );
  } else {
    check(`${docPath} exists`, false);
  }
}


// =========================================================================
// 2. TENANT ID CONSISTENCY
// =========================================================================
console.log('\n── 2. Tenant ID Consistency ──');

const CANONICAL_TENANT_UUID = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
const CANONICAL_SLUG = 'melis-guzellik';
const BAD_TENANT_ID = 'melis-guzellik-id';

const TENANT_CHECK_FILES = [
  'docs/SUPABASE_STAGING_EXECUTION_RUNBOOK.md',
  'docs/REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md',
  'docs/SUPABASE_STAGING_AUTH_SEED_PLAN.md',
  'supabase/seed/paymentless_staging_seed.sql',
  'supabase/tests/paymentless_production_rls_smoke.sql',
];

for (const filePath of TENANT_CHECK_FILES) {
  const content = readSafe(filePath);
  if (content) {
    check(
      `${filePath} does NOT use '${BAD_TENANT_ID}' as tenant_id`,
      !content.includes(BAD_TENANT_ID),
      `Found non-UUID tenant ID placeholder '${BAD_TENANT_ID}'`
    );
  }
}

// Verify canonical UUID is used in seed
const seedContent = readSafe('supabase/seed/paymentless_staging_seed.sql');
if (seedContent) {
  check(
    'Seed SQL uses canonical tenant UUID',
    seedContent.includes(CANONICAL_TENANT_UUID),
    `Expected ${CANONICAL_TENANT_UUID}`
  );
  check(
    'Seed SQL uses melis-guzellik only as slug',
    seedContent.includes(`'${CANONICAL_SLUG}'`),
  );
}


// =========================================================================
// 3. SUPER ADMIN IDENTITY MODEL
// =========================================================================
console.log('\n── 3. Super Admin Identity Model ──');

const FAKE_SUPERADMIN_TENANT = '11111111-1111-1111-1111-111111111111';

const SUPER_ADMIN_CHECK_FILES = [
  'docs/REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md',
  'docs/SUPABASE_STAGING_EXECUTION_RUNBOOK.md',
  'docs/SUPABASE_STAGING_AUTH_SEED_PLAN.md',
];

for (const filePath of SUPER_ADMIN_CHECK_FILES) {
  const content = readSafe(filePath);
  if (content) {
    check(
      `${filePath} does NOT use fake super_admin tenant UUID`,
      !content.includes(FAKE_SUPERADMIN_TENANT),
      `Found fake UUID '${FAKE_SUPERADMIN_TENANT}' used for super_admin`
    );
  }
}

// Check operator guide for NULL tenant_id in super admin mapping
const operatorGuide = readSafe('docs/REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md');
if (operatorGuide) {
  // Look for the pattern of super_admin with NULL
  const hasSuperAdminNull = /super_admin[\s\S]{0,500}NULL/i.test(operatorGuide);
  check(
    'Operator Guide maps super_admin with tenant_id = NULL',
    hasSuperAdminNull,
    'Super Admin mapping should explicitly use tenant_id = NULL'
  );
  
  check(
    'Operator Guide maps tenant_owner with canonical UUID',
    operatorGuide.includes(CANONICAL_TENANT_UUID) && operatorGuide.includes('tenant_owner'),
  );
}

// Check staging auth seed plan
const authSeedPlan = readSafe('docs/SUPABASE_STAGING_AUTH_SEED_PLAN.md');
if (authSeedPlan) {
  check(
    'Auth Seed Plan documents super_admin tenant scope as NULL',
    authSeedPlan.includes('NULL') && authSeedPlan.includes('super_admin'),
    'Super Admin section should state tenant scope as NULL'
  );
}

// Check RLS identity model decision doc
const rlsDecision = readSafe('docs/SUPABASE_RLS_IDENTITY_MODEL_DECISION.md');
if (rlsDecision) {
  check(
    'RLS Identity Model Decision documents users_profile.id = auth.uid()',
    rlsDecision.includes('auth.uid()') && rlsDecision.includes('users_profile'),
  );
  check(
    'RLS Identity Model Decision documents super_admin with NULL tenant_id',
    rlsDecision.includes('super_admin') && rlsDecision.includes('NULL'),
    'Document should state super_admin uses tenant_id = NULL'
  );
}

// Check test files
const rlsIsolation = readSafe('supabase/tests/rls_tenant_isolation_scenarios.sql');
if (rlsIsolation) {
  // super_admin should be inserted with NULL tenant_id
  check(
    'RLS isolation scenarios use NULL tenant_id for super_admin',
    rlsIsolation.includes("super_admin_id, NULL") || rlsIsolation.includes("super_admin_id,NULL"),
    'Super Admin insert should use tenant_id = NULL, not a real tenant UUID'
  );
}


// =========================================================================
// 4. ROLE CONSISTENCY
// =========================================================================
console.log('\n── 4. Role Consistency ──');

const STAGING_DOCS = [
  'docs/SUPABASE_STAGING_EXECUTION_RUNBOOK.md',
  'docs/REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md',
  'docs/SUPABASE_STAGING_AUTH_SEED_PLAN.md',
  'docs/SUPABASE_RLS_IDENTITY_MODEL_DECISION.md',
  'supabase/migrations/20260619_lari_rls_policy_draft.sql',
];

for (const filePath of STAGING_DOCS) {
  const content = readSafe(filePath);
  if (content) {
    // salon_owner should not be used as a canonical role
    const hasSalonOwner = /\bsalon_owner\b/.test(content);
    check(
      `${filePath} does NOT use 'salon_owner' (canonical is 'tenant_owner')`,
      !hasSalonOwner,
      `Found deprecated role name 'salon_owner'`
    );
  }
}

// tenant_owner should be present as canonical role
check(
  'Canonical role tenant_owner is used in Operator Guide',
  operatorGuide && operatorGuide.includes('tenant_owner'),
);


// =========================================================================
// 5. SECURITY CHECKS
// =========================================================================
console.log('\n── 5. Security Checks ──');

// Check frontend files for service_role key leaks and raw card captures recursively
const EXCLUDED_DIRS = ['node_modules', 'dist', 'build', 'coverage', '.git', '.temp'];
let serviceRoleLeakFound = false;
let rawCardFieldFound = false;

const walkFiles = (dirPath) => {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.includes(entry.name)) {
        continue;
      }
      walkFiles(fullPath);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js') || entry.name.endsWith('.jsx') || entry.name.endsWith('.mjs') || entry.name.endsWith('.cjs')) {
      const content = readFileSync(fullPath, 'utf8');
      
      const isFrontend = fullPath.includes(join(ROOT, 'components')) || 
                         fullPath.includes(join(ROOT, 'pages')) || 
                         fullPath.includes(join(ROOT, 'contexts')) || 
                         fullPath.includes(join(ROOT, 'services')) || 
                         fullPath.includes(join(ROOT, 'utils')) ||
                         fullPath === join(ROOT, 'App.tsx') ||
                         fullPath === join(ROOT, 'index.tsx');

      if (isFrontend) {
        // 1. service_role / SUPABASE_SERVICE_ROLE_KEY / secret checks
        const forbiddenTerms = [
          'service_role',
          'SERVICE_ROLE_KEY',
          'SECRET_ROLE_KEY',
          'SUPABASE_SERVICE_ROLE_KEY',
          'VITE_SUPABASE_SERVICE_ROLE_KEY',
          'VITE_SUPABASE_SECRET_ROLE_KEY',
          'VITE_IYZICO_SECRET_KEY',
          'IYZICO_SECRET_KEY'
        ];
        
        const hasDirectForbidden = forbiddenTerms.some(t => content.includes(t));
        
        // Dynamic construction patterns
        const hasConcatPattern1 = content.includes('VITE_SUPABASE') && content.includes('SERVICE_ROLE_KEY');
        const hasConcatPattern2 = content.includes('SUPABASE_') && content.includes('SERVICE_ROLE_KEY');
        const hasConcatPattern3 = /['"`]SUPABASE_['"`]\s*\+\s*['"`]SERVICE_ROLE_KEY['"`]/i.test(content);
        const hasTemplatePattern = /VITE_SUPABASE_.*\$\{.*service_role.*\}|VITE_SUPABASE_.*\$\{.*SERVICE_ROLE_KEY.*\}/i.test(content);
        const hasJoinPattern = /join\(['"`]_['"`]\)/i.test(content) && content.includes('SERVICE_ROLE_KEY');
        
        if (hasDirectForbidden || hasConcatPattern1 || hasConcatPattern2 || hasConcatPattern3 || hasTemplatePattern || hasJoinPattern) {
          serviceRoleLeakFound = true;
        }

        // 2. card_number / card_cvv capture check
        const isStagingScannerCheckFile = [
          'auditLogService.ts',
          'environmentPreflightService.ts',
          'migrationDryRunService.ts'
        ].includes(entry.name);
        
        if (!isStagingScannerCheckFile) {
          if (/card_number|card_cvv|cardNumber|cardCvv/i.test(content)) {
            rawCardFieldFound = true;
          }
        }
      }
    }
  }
};

walkFiles(ROOT);

check(
  'No service_role key references in frontend source files',
  !serviceRoleLeakFound,
  'Found service_role or SUPABASE_SERVICE_ROLE_KEY in frontend code'
);

// Check .env.example does not have real credentials
const envExample = readSafe('.env.example');
if (envExample) {
  check(
    '.env.example does not contain real Supabase credentials',
    !envExample.includes('eyJ') && !envExample.includes('.supabase.co'),
    'Found what looks like real credentials in .env.example'
  );
}

check(
  'No raw card capture fields in frontend code',
  !rawCardFieldFound,
  'Found card_number/card_cvv fields in frontend code'
);

// Check goLiveService calls can_accept_public_booking and no file calls get_public_booking_eligibility
const goLiveContent = readSafe('services/goLiveService.ts');
if (goLiveContent) {
  check(
    'goLiveService calls can_accept_public_booking with p_slug',
    goLiveContent.includes("can_accept_public_booking") && goLiveContent.includes("p_slug: tenant.slug"),
    'goLiveService must call can_accept_public_booking with p_slug'
  );
  check(
    'goLiveService does NOT call get_public_booking_eligibility',
    !goLiveContent.includes("get_public_booking_eligibility"),
    'goLiveService must not call get_public_booking_eligibility'
  );
}


// =========================================================================
// 6. BRAND & DOMAIN CONSISTENCY
// =========================================================================
console.log('\n── 6. Brand & Domain Consistency ──');

// Check LARİ brand is visible
const indexHtml = readSafe('index.html');
if (indexHtml) {
  check(
    'LARİ brand name appears in index.html',
    indexHtml.includes('LARİ') || indexHtml.includes('Lari') || indexHtml.includes('lari'),
  );
}

// Check randevulari.com domain strategy
if (envExample) {
  check(
    'randevulari.com is configured as public base domain',
    envExample.includes('randevulari.com'),
  );
}


// =========================================================================
// 7. PAYMENT & BILLING CLAIMS
// =========================================================================
console.log('\n── 7. Payment & Billing Safety ──');

if (envExample) {
  check(
    'Default payment mode is disabled in .env.example',
    envExample.includes('VITE_PAYMENT_MODE=disabled'),
  );
}

// Check no live iyzico claim in staging docs
for (const docPath of STAGING_DOCS) {
  const content = readSafe(docPath);
  if (content) {
    check(
      `${docPath} does not claim live iyzico integration`,
      !content.includes('iyzico_live'),
      'Found live iyzico claim in staging documentation'
    );
  }
}


// =========================================================================
// SUMMARY
// =========================================================================
console.log('\n══════════════════════════════════════════');
console.log(`  Total checks: ${passed + failed}`);
console.log(`  ✅ Passed: ${passed}`);
console.log(`  ❌ Failed: ${failed}`);
console.log('══════════════════════════════════════════\n');

if (failed > 0) {
  console.log('❌ STAGING CONSISTENCY CHECK FAILED\n');
  console.log('Failures:');
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  console.log('');
  process.exit(1);
} else {
  console.log('✅ ALL STAGING CONSISTENCY CHECKS PASSED');
  console.log('   Safe to proceed with real Supabase staging project setup.\n');
  process.exit(0);
}
