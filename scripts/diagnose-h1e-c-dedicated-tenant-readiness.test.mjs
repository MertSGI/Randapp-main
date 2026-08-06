// scripts/diagnose-h1e-c-dedicated-tenant-readiness.test.mjs
import { buildDedicatedTenantBlockerRegister, runDedicatedTenantReadinessDiagnostic } from './diagnose-h1e-c-dedicated-tenant-readiness.mjs';

console.log('=== STAGE H1E-C DEDICATED TENANT READINESS DIAGNOSTIC UNIT TESTS ===');

let defined = 0;
let executed = 0;
let passed = 0;
let failed = 0;

async function check(title, fn) {
  defined++;
  executed++;
  try {
    await fn();
    passed++;
    console.log('  ✅ PASS: ' + title);
  } catch (err) {
    failed++;
    console.error('  ❌ FAIL: ' + title + ' - ' + err.message);
  }
}

async function main() {
  await check('1. Perfect snapshot with only GLOBAL_RELEASE_PHASE_BLOCKED passes preflight gate', () => {
    const snap = {
      tenant_id: 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd',
      tenant_slug: 'dedicated-h1d-tenant',
      tenant_status: 'active',
      public_site_status: 'published',
      primary_reason_code: 'GLOBAL_RELEASE_PHASE_BLOCKED',
      blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED'],
      readiness_facts: {
        public_site_status: 'published',
        primary_branch_count: 1,
        active_service_count: 1,
        active_staff_count: 1,
        primary_branch_id: 'b001',
        primary_branch_has_services: true,
        primary_branch_has_staff: true,
        staff_can_perform_service: true
      },
      relationship_verification: { relationship_status: 'VERIFIED' },
      subscription_facts: { subscription_exists: true, subscription_status: 'active', billing_mode: 'manual_active', plan_id: 'premium_monthly', plan_version: '1' },
      entitlement_facts: { core_booking_entitlement_found: true, core_booking_boolean_value: true },
      platform_restriction_facts: { active_restrictions_count: 0, core_booking_restricted: false },
      global_release_control: { release_phase: 'pre_pilot', is_payment_collection_enabled: false, is_checkout_enabled: false, is_iyzico_enabled: false }
    };
    const pub = { found: true, allowed: false, bookable: false, primary_reason_code: 'GLOBAL_RELEASE_PHASE_BLOCKED', blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED'] };

    const res = buildDedicatedTenantBlockerRegister(snap, pub);
    if (!res.isPreflightReady) throw new Error('Expected isPreflightReady=true');
    if (res.unexpectedBlockers.length !== 0) throw new Error('Expected 0 unexpected blockers');
    if (res.register.length < 18) throw new Error('Register must cover at minimum 18 fields');
  });

  await check('2. Snapshot with multiple blockers fails preflight gate and reports classification', () => {
    const snap = {
      tenant_id: 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd',
      tenant_slug: 'dedicated-h1d-tenant',
      tenant_status: 'active',
      public_site_status: 'draft',
      primary_reason_code: 'GLOBAL_RELEASE_PHASE_BLOCKED',
      blocking_reason_codes: [
        'GLOBAL_RELEASE_PHASE_BLOCKED',
        'PUBLIC_SITE_STATUS_BLOCKED',
        'SUBSCRIPTION_BLOCKED',
        'REQUIRED_ENTITLEMENT_BLOCKED',
        'OPERATIONAL_READINESS_FAILED'
      ],
      readiness_facts: { public_site_status: 'draft', primary_branch_count: 0, active_service_count: 0, active_staff_count: 0 },
      subscription_facts: { subscription_exists: false, subscription_status: 'missing' },
      entitlement_facts: { core_booking_entitlement_found: false },
      platform_restriction_facts: { active_restrictions_count: 0, core_booking_restricted: false }
    };

    const res = buildDedicatedTenantBlockerRegister(snap, {});
    if (res.isPreflightReady) throw new Error('Expected isPreflightReady=false');
    if (res.unexpectedBlockers.length !== 4) throw new Error(`Expected 4 unexpected blockers, got ${res.unexpectedBlockers.length}`);
    const classifications = res.register.map(r => r.classification);
    if (!classifications.every(c => c === 'STAGING_FIXTURE_DEFECT')) throw new Error('All items should be classified as STAGING_FIXTURE_DEFECT');
  });

  await check('3. Missing configuration aborts diagnostic safely without network', async () => {
    const res = await runDedicatedTenantReadinessDiagnostic({ env: {}, logger: { log: () => {} } });
    if (res.ok !== false || res.reason !== 'CONFIGURATION_REQUIRED') throw new Error('Expected CONFIGURATION_REQUIRED');
  });

  console.log(`\nDefined tests: ${defined}`);
  console.log(`Executed tests: ${executed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) process.exitCode = 1;
}

main();
