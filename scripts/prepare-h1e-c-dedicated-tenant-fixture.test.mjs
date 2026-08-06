// scripts/prepare-h1e-c-dedicated-tenant-fixture.test.mjs
import { validateFixturePreparationPreconditions, prepareDedicatedTenantStagingFixture } from './prepare-h1e-c-dedicated-tenant-fixture.mjs';
import { DEDICATED_H1D_TENANT_ID, CANONICAL_TENANT_ID } from './test-h1e-a-credentialed-runner-helpers.mjs';

console.log('=== STAGE H1E-C DEDICATED TENANT FIXTURE PREPARATION UNIT TESTS ===');

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

  console.log(`\nDefined tests: ${defined}`);
  console.log(`Executed tests: ${executed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) process.exitCode = 1;
}

main();
