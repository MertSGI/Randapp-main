// scripts/prepare-h1e-c-dedicated-tenant-fixture.test.mjs
import { validateFixturePreparationPreconditions, prepareDedicatedTenantStagingFixture } from './prepare-h1e-c-dedicated-tenant-fixture.mjs';
import { DEDICATED_H1D_TENANT_ID, CANONICAL_TENANT_ID } from './test-h1e-a-credentialed-runner-helpers.mjs';

console.log('=== STAGE H1E-C DEDICATED TENANT FIXTURE PREPARATION UNIT TESTS (OPTION B) ===');

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
  await check('1. Missing confirmation fails precondition check', () => {
    const res = validateFixturePreparationPreconditions({
      targetTenantId: DEDICATED_H1D_TENANT_ID,
      confirmation: null
    });
    if (res.ok !== false || res.reason !== 'FIXTURE_PREPARATION_CONFIRMATION_REQUIRED') {
      throw new Error('Expected FIXTURE_PREPARATION_CONFIRMATION_REQUIRED');
    }
  });

  await check('2. Attempting to mutate canonical tenant is strictly forbidden', () => {
    const res = validateFixturePreparationPreconditions({
      targetTenantId: CANONICAL_TENANT_ID,
      confirmation: 'I_UNDERSTAND_THIS_PREPARES_STAGING_FIXTURE_FOR_DEDICATED_TENANT'
    });
    if (res.ok !== false || res.reason !== 'INVALID_TARGET_TENANT_ID') {
      throw new Error('Expected INVALID_TARGET_TENANT_ID');
    }
  });

  await check('3. Non-dedicated tenant ID is strictly rejected', () => {
    const res = validateFixturePreparationPreconditions({
      targetTenantId: '12345678-1234-1234-1234-123456789012',
      confirmation: 'I_UNDERSTAND_THIS_PREPARES_STAGING_FIXTURE_FOR_DEDICATED_TENANT'
    });
    if (res.ok !== false || res.reason !== 'INVALID_TARGET_TENANT_ID') {
      throw new Error('Expected INVALID_TARGET_TENANT_ID');
    }
  });

  await check('4. Correct target tenant ID and confirmation pass preconditions', () => {
    const res = validateFixturePreparationPreconditions({
      targetTenantId: DEDICATED_H1D_TENANT_ID,
      confirmation: 'I_UNDERSTAND_THIS_PREPARES_STAGING_FIXTURE_FOR_DEDICATED_TENANT'
    });
    if (!res.ok) throw new Error(`Expected ok=true, got ${res.reason}`);
  });

  await check('5. Preparation runner aborts safely without network when unconfirmed', async () => {
    const res = await prepareDedicatedTenantStagingFixture({
      targetTenantId: DEDICATED_H1D_TENANT_ID,
      confirmation: null,
      logger: { log: () => {} }
    });
    if (res.ok !== false || res.reason !== 'FIXTURE_PREPARATION_CONFIRMATION_REQUIRED') {
      throw new Error('Expected FIXTURE_PREPARATION_CONFIRMATION_REQUIRED');
    }
  });

  await check('6. OPTION B verifier returns FIXTURE_SQL_REQUIRES_EXPLICIT_OPERATOR_EXECUTION when blockers remain', async () => {
    const logs = [];
    const mockLogger = { log: (msg) => logs.push(msg) };

    const mockFetch = async (url) => {
      const u = String(url);
      if (u.includes('/auth/v1/token')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ access_token: 'mock-jwt-token', user: { id: 'user-1' } }),
          json: async () => ({ access_token: 'mock-jwt-token', user: { id: 'user-1' } })
        };
      }
      if (u.includes('/super_admin_get_tenant_pilot_eligibility_snapshot')) {
        const payload = JSON.stringify({
          success: true,
          tenant_id: DEDICATED_H1D_TENANT_ID,
          tenant_slug: 'dedicated-h1d-tenant',
          primary_reason_code: 'GLOBAL_RELEASE_PHASE_BLOCKED',
          blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED', 'PUBLIC_SITE_STATUS_BLOCKED', 'SUBSCRIPTION_BLOCKED'],
          global_release_control: { release_phase: 'pre_pilot', is_payment_collection_enabled: false, is_checkout_enabled: false, is_iyzico_enabled: false },
          pilot_authorization: { is_authorized: false }
        });
        return { ok: true, status: 200, text: async () => payload, json: async () => JSON.parse(payload) };
      }
      if (u.includes('/can_accept_public_booking')) {
        const payload = JSON.stringify({ found: true, allowed: false, primary_reason_code: 'GLOBAL_RELEASE_PHASE_BLOCKED' });
        return { ok: true, status: 200, text: async () => payload, json: async () => JSON.parse(payload) };
      }
      return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
    };

    const res = await prepareDedicatedTenantStagingFixture({
      targetTenantId: DEDICATED_H1D_TENANT_ID,
      confirmation: 'I_UNDERSTAND_THIS_PREPARES_STAGING_FIXTURE_FOR_DEDICATED_TENANT',
      env: {
        VITE_SUPABASE_URL: 'https://mock.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'mock-anon-key',
        LARI_STAGE_H1D_SUPER_ADMIN_EMAIL: 'superadmin@randevulari.com',
        LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD: 'pass'
      },
      fetchImpl: mockFetch,
      logger: mockLogger
    });

    if (res.ok !== false || res.reason !== 'FIXTURE_SQL_REQUIRES_EXPLICIT_OPERATOR_EXECUTION') {
      throw new Error(`Expected FIXTURE_SQL_REQUIRES_EXPLICIT_OPERATOR_EXECUTION, got ${res.reason}`);
    }
    const logStr = logs.join('\n');
    if (!logStr.includes('FIXTURE_SQL_REQUIRES_EXPLICIT_OPERATOR_EXECUTION')) {
      throw new Error('Logs must explicitly state FIXTURE_SQL_REQUIRES_EXPLICIT_OPERATOR_EXECUTION');
    }
  });

  await check('7. OPTION B verifier returns exitCode 0 FIXTURE_VERIFIED_READY after SQL execution', async () => {
    const logs = [];
    const mockLogger = { log: (msg) => logs.push(msg) };

    const mockFetch = async (url) => {
      const u = String(url);
      if (u.includes('/auth/v1/token')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ access_token: 'mock-jwt-token', user: { id: 'user-1' } }),
          json: async () => ({ access_token: 'mock-jwt-token', user: { id: 'user-1' } })
        };
      }
      if (u.includes('/super_admin_get_tenant_pilot_eligibility_snapshot')) {
        const payload = JSON.stringify({
          success: true,
          tenant_id: DEDICATED_H1D_TENANT_ID,
          tenant_slug: 'dedicated-h1d-tenant',
          tenant_status: 'active',
          public_site_status: 'published',
          primary_reason_code: 'GLOBAL_RELEASE_PHASE_BLOCKED',
          blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED'],
          readiness_facts: { public_site_status: 'published', primary_branch_count: 1, active_service_count: 1, active_staff_count: 1, primary_branch_id: 'b001', primary_branch_has_services: true, primary_branch_has_staff: true, staff_can_perform_service: true },
          relationship_verification: { relationship_status: 'VERIFIED' },
          subscription_facts: { subscription_exists: true, subscription_status: 'active', billing_mode: 'manual', plan_id: 'premium', plan_version: '1' },
          entitlement_facts: { core_booking_entitlement_found: true, core_booking_boolean_value: true },
          platform_restriction_facts: { active_restrictions_count: 0, core_booking_restricted: false },
          global_release_control: { release_phase: 'pre_pilot', is_payment_collection_enabled: false, is_checkout_enabled: false, is_iyzico_enabled: false },
          pilot_authorization: { is_authorized: false }
        });
        return { ok: true, status: 200, text: async () => payload, json: async () => JSON.parse(payload) };
      }
      if (u.includes('/can_accept_public_booking')) {
        const payload = JSON.stringify({ found: true, allowed: false, primary_reason_code: 'GLOBAL_RELEASE_PHASE_BLOCKED' });
        return { ok: true, status: 200, text: async () => payload, json: async () => JSON.parse(payload) };
      }
      return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
    };

    const res = await prepareDedicatedTenantStagingFixture({
      targetTenantId: DEDICATED_H1D_TENANT_ID,
      confirmation: 'I_UNDERSTAND_THIS_PREPARES_STAGING_FIXTURE_FOR_DEDICATED_TENANT',
      env: {
        VITE_SUPABASE_URL: 'https://mock.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'mock-anon-key',
        LARI_STAGE_H1D_SUPER_ADMIN_EMAIL: 'superadmin@randevulari.com',
        LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD: 'pass'
      },
      fetchImpl: mockFetch,
      logger: mockLogger
    });

    if (res.ok !== true || res.reason !== 'FIXTURE_VERIFIED_READY') {
      throw new Error(`Expected FIXTURE_VERIFIED_READY, got ${res.reason}`);
    }
  });

  console.log(`\nDefined tests: ${defined}`);
  console.log(`Executed tests: ${executed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) process.exitCode = 1;
}

main();
