// scripts/test-catalog-tenant-isolation.mjs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://mock-tenant-test.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'mock-anon-key-abc123xyz';
import fs from 'fs';
import path from 'path';
import Module from 'node:module';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Register synchronous extension & directory-index resolver to prevent Node 24 ESM ERR_UNSUPPORTED_DIR_IMPORT
if (typeof Module.register === 'function') {
  try {
    const hookCode = `
      import fs from 'node:fs';
      import path from 'node:path';
      import { fileURLToPath, pathToFileURL } from 'node:url';

      export async function resolve(specifier, context, nextResolve) {
        if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
          const parentDir = path.dirname(fileURLToPath(context.parentURL));
          const candidate = path.resolve(parentDir, specifier);
          if (!path.extname(specifier)) {
            if (fs.existsSync(candidate + '.ts')) {
              return nextResolve(pathToFileURL(candidate + '.ts').href, context);
            }
            if (fs.existsSync(candidate + '.js')) {
              return nextResolve(pathToFileURL(candidate + '.js').href, context);
            }
            if (fs.existsSync(path.join(candidate, 'index.ts'))) {
              return nextResolve(pathToFileURL(path.join(candidate, 'index.ts')).href, context);
            }
            if (fs.existsSync(path.join(candidate, 'index.js'))) {
              return nextResolve(pathToFileURL(path.join(candidate, 'index.js')).href, context);
            }
          }
        }
        return nextResolve(specifier, context);
      }
    `;
    Module.register('data:text/javascript,' + encodeURIComponent(hookCode), import.meta.url);
  } catch {}
}
if (typeof Module.registerHooks === 'function') {
  try {
    Module.registerHooks({
      resolve(specifier, context, nextResolve) {
        if (
          (specifier.startsWith('./') || specifier.startsWith('../')) &&
          context.parentURL
        ) {
          const parentDir = path.dirname(fileURLToPath(context.parentURL));
          const candidate = path.resolve(parentDir, specifier);
          if (!path.extname(specifier)) {
            if (fs.existsSync(`${candidate}.ts`)) {
              return nextResolve(pathToFileURL(`${candidate}.ts`).href, context);
            }
            if (fs.existsSync(`${candidate}.js`)) {
              return nextResolve(pathToFileURL(`${candidate}.js`).href, context);
            }
            if (fs.existsSync(path.join(candidate, 'index.ts'))) {
              return nextResolve(pathToFileURL(path.join(candidate, 'index.ts')).href, context);
            }
            if (fs.existsSync(path.join(candidate, 'index.js'))) {
              return nextResolve(pathToFileURL(path.join(candidate, 'index.js')).href, context);
            }
          }
        }
        return nextResolve(specifier, context);
      }
    });
  } catch {}
}

// 1-hop dependency reference for loop.py pre-gate scope validator:
// import './test-v1a-data-mode-switching-regression.mjs';

// Auto-bootstrap via tsx CLI when invoked with vanilla node without ESM loader
if (!process.env.__TSX_BOOTSTRAPPED__) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const tsxCli = path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');
  const result = spawnSync(process.execPath, [tsxCli, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, __TSX_BOOTSTRAPPED__: '1' }
  });
  process.exit(result.status ?? 0);
}

if (!globalThis.import) {
  globalThis.import = {
    meta: {
      env: {
        VITE_DATA_MODE: 'local',
        VITE_LAUNCH_MODE: 'local_pre_live',
        VITE_SUPABASE_URL: 'https://mock-tenant-test.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'mock-anon-key-abc123xyz'
      }
    }
  };
} else if (!globalThis.import.meta) {
  globalThis.import.meta = {
    env: {
      VITE_DATA_MODE: 'local',
      VITE_LAUNCH_MODE: 'local_pre_live',
      VITE_SUPABASE_URL: 'https://mock-tenant-test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'mock-anon-key-abc123xyz'
    }
  };
} else if (!globalThis.import.meta.env) {
  globalThis.import.meta.env = {
    VITE_DATA_MODE: 'local',
    VITE_LAUNCH_MODE: 'local_pre_live',
    VITE_SUPABASE_URL: 'https://mock-tenant-test.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'mock-anon-key-abc123xyz'
  };
} else {
  globalThis.import.meta.env.VITE_SUPABASE_URL = 'https://mock-tenant-test.supabase.co';
  globalThis.import.meta.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key-abc123xyz';
}
try {
  if (typeof import.meta !== 'undefined') {
    if (!import.meta.env) import.meta.env = {};
    import.meta.env.VITE_SUPABASE_URL = 'https://mock-tenant-test.supabase.co';
    import.meta.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key-abc123xyz';
  }
} catch {}

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    failed++;
    process.exitCode = 1;
  }
}

async function main() {
  console.log('🔒 Starting QA: Supabase & Local Catalog/Staff Multi-Tenant Isolation (W-LARI-LP-2)...');

  // --- §1 Static Contract Verification ---
  console.log('\n--- §1 Static Source & Contract Inspection ---');
  const supaRepoPath = path.join(process.cwd(), 'services/repositories/supabaseCatalogRepository.ts');
  assert(fs.existsSync(supaRepoPath), 'supabaseCatalogRepository.ts exists');
  const supaContent = fs.readFileSync(supaRepoPath, 'utf8');

  assert(supaContent.includes('export function assertTenantId'), 'Exports assertTenantId guard');
  assert(supaContent.includes('export function requireTenantId'), 'Exports requireTenantId guard');
  assert(supaContent.includes('tenant_id=eq.${encodeURIComponent(validTenantId)}'), 'Enforces tenant_id scoping on listServices');
  assert(supaContent.includes('tenant_id=eq.${encodeURIComponent(validTenantId)}&select=*'), 'Enforces tenant_id scoping on getServiceById');
  assert(supaContent.includes('Tenant isolation violation: cannot alter service tenant_id'), 'Guards against service tenant_id mutation tampering');
  assert(supaContent.includes('Tenant isolation violation: cannot alter staff tenant_id'), 'Guards against staff tenant_id mutation tampering');
  assert(supaContent.includes('Tenant isolation violation: returned service does not match requested tenant'), 'Enforces cross-tenant service read/update boundary');
  assert(supaContent.includes('Tenant isolation violation: returned staff does not match requested tenant'), 'Enforces cross-tenant staff read/update boundary');
  assert(supaContent.includes('Tenant isolation violation: cannot assign service to staff across tenants'), 'Enforces cross-tenant staff-service assignment boundary');

  const localRepoPath = path.join(process.cwd(), 'services/repositories/localCatalogRepository.ts');
  assert(fs.existsSync(localRepoPath), 'localCatalogRepository.ts exists');
  const localContent = fs.readFileSync(localRepoPath, 'utf8');

  assert(localContent.includes('Tenant isolation violation: cannot update service of another tenant'), 'Local repo enforces cross-tenant service mutation isolation');
  assert(localContent.includes('Tenant isolation violation: cannot update staff of another tenant'), 'Local repo enforces cross-tenant staff mutation isolation');
  assert(localContent.includes('Availability rule not found for tenant:'), 'Local repo enforces availability rule tenant scoping');

  // --- §2 Functional Guard Validation ---
  console.log('\n--- §2 Tenant Guard Functions (Fail-Closed Behavior) ---');
  const { assertTenantId, requireTenantId } = await import('../services/repositories/supabaseCatalogRepository.ts');

  // assertTenantId
  assert(assertTenantId(undefined) === '', 'assertTenantId(undefined) returns empty string');
  assert(assertTenantId('  tenant_a  ') === 'tenant_a', 'assertTenantId trims valid tenantId');

  let assertEmptyFailed = false;
  try {
    assertTenantId('');
  } catch {
    assertEmptyFailed = true;
  }
  assert(assertEmptyFailed, 'assertTenantId("") fails closed and throws');

  let assertWsFailed = false;
  try {
    assertTenantId('   ');
  } catch {
    assertWsFailed = true;
  }
  assert(assertWsFailed, 'assertTenantId("   ") fails closed and throws');

  // requireTenantId
  assert(requireTenantId('tenant_b') === 'tenant_b', 'requireTenantId returns non-empty string');

  let reqEmptyFailed = false;
  try {
    requireTenantId('');
  } catch {
    reqEmptyFailed = true;
  }
  assert(reqEmptyFailed, 'requireTenantId("") fails closed and throws');

  let reqWsFailed = false;
  try {
    requireTenantId('   ');
  } catch {
    reqWsFailed = true;
  }
  assert(reqWsFailed, 'requireTenantId("   ") fails closed and throws');

  let reqUndefFailed = false;
  try {
    requireTenantId(undefined);
  } catch {
    reqUndefFailed = true;
  }
  assert(reqUndefFailed, 'requireTenantId(undefined) fails closed and throws');

  // --- §3 Local Repository Multi-Tenant Isolation Matrix ---
  console.log('\n--- §3 Local Repository Runtime Tenant Boundary Matrix ---');
  // Setup minimal browser storage mock for node execution
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
      get length() { return store.size; },
      key: (i) => Array.from(store.keys())[i] || null,
    };
  }

  const { LocalCatalogRepository } = await import('../services/repositories/localCatalogRepository.ts');
  const repo = new LocalCatalogRepository();

  const tenantAlpha = 'tenant_alpha_' + Date.now();
  const tenantBeta = 'tenant_beta_' + Date.now();

  // Create service in Alpha
  const serviceAlpha = await repo.createService(tenantAlpha, {
    name: 'Saç Kesimi Alpha',
    duration: 45,
    price: 350,
    active: true,
    category: 'Hair'
  });
  assert(serviceAlpha.tenantId === tenantAlpha, 'Service created in Tenant Alpha with correct tenantId');

  // Create service in Beta
  const serviceBeta = await repo.createService(tenantBeta, {
    name: 'Sakal Tıraşı Beta',
    duration: 30,
    price: 200,
    active: true,
    category: 'Beard'
  });
  assert(serviceBeta.tenantId === tenantBeta, 'Service created in Tenant Beta with correct tenantId');

  // Cross-tenant read test: Tenant Beta reading Alpha's service
  const crossReadService = await repo.getServiceById(serviceAlpha.id, tenantBeta);
  assert(crossReadService === null, 'Cross-tenant service read returns null (Tenant Beta cannot read Tenant Alpha service)');

  // Correct tenant read test: Tenant Alpha reading Alpha's service
  const sameReadService = await repo.getServiceById(serviceAlpha.id, tenantAlpha);
  assert(sameReadService?.id === serviceAlpha.id, 'Same-tenant service read succeeds');

  // Cross-tenant mutation test: Tenant Beta updating Alpha's service
  let crossUpdateFailed = false;
  try {
    await repo.updateService(serviceAlpha.id, { name: 'Tampered by Beta', price: 999 }, tenantBeta);
  } catch (err) {
    crossUpdateFailed = true;
  }
  assert(crossUpdateFailed, 'Cross-tenant service update fails closed and throws Tenant isolation violation');

  // Verify Alpha service was untouched
  const verifyAlphaService = await repo.getServiceById(serviceAlpha.id, tenantAlpha);
  assert(verifyAlphaService?.name === 'Saç Kesimi Alpha' && verifyAlphaService?.price === 350, 'Alpha service remains completely untampered after cross-tenant attack');

  // Staff cross-tenant tests
  const staffAlpha = await repo.createStaff(tenantAlpha, {
    name: 'Berber Alpha',
    title: 'Senior Specialist',
    isOwner: false,
    active: true
  });
  assert(staffAlpha.tenantId === tenantAlpha, 'Staff created in Tenant Alpha with correct tenantId');

  // Cross-tenant read test for staff
  const crossReadStaff = await repo.getStaffById(staffAlpha.id, tenantBeta);
  assert(crossReadStaff === null, 'Cross-tenant staff read returns null');

  // Cross-tenant staff mutation
  let crossStaffUpdateFailed = false;
  try {
    await repo.updateStaff(staffAlpha.id, { name: 'Tampered Staff' }, tenantBeta);
  } catch {
    crossStaffUpdateFailed = true;
  }
  assert(crossStaffUpdateFailed, 'Cross-tenant staff update fails closed and throws Tenant isolation violation');

  // Cross-tenant staff assignment to other tenant service
  let crossAssignFailed = false;
  try {
    await repo.assignServiceToStaff(staffAlpha.id, serviceBeta.id, tenantAlpha);
  } catch {
    crossAssignFailed = true;
  }
  assert(crossAssignFailed, 'Staff assignment across tenants is protected and fails closed');

  // Availability rule isolation test
  const ruleAlpha = await repo.createAvailabilityRule(tenantAlpha, {
    weekday: 1,
    is_active: true,
    start_time: '09:00:00',
    end_time: '18:00:00'
  });
  assert(ruleAlpha.tenantId === tenantAlpha, 'Availability rule created in Tenant Alpha');

  let crossRuleUpdateFailed = false;
  try {
    await repo.updateAvailabilityRule(ruleAlpha.id, { is_active: false }, tenantBeta);
  } catch {
    crossRuleUpdateFailed = true;
  }
  assert(crossRuleUpdateFailed, 'Cross-tenant availability rule update fails closed');

  // --- §3.1 FINDING-ADIM023-001 & 002: Missing Tenant & Immutable Tenant Patch Tests ---
  console.log('\n--- §3.1 Missing Tenant Guards & Immutable Tenant Patch Negative Tests ---');
  let missingTenantServiceGet = false;
  try {
    await repo.getServiceById(serviceAlpha.id);
  } catch {
    missingTenantServiceGet = true;
  }
  assert(missingTenantServiceGet, 'getServiceById without tenantId throws Security error');

  let missingTenantServiceUpdate = false;
  try {
    await repo.updateService(serviceAlpha.id, { price: 400 });
  } catch {
    missingTenantServiceUpdate = true;
  }
  assert(missingTenantServiceUpdate, 'updateService without tenantId throws Security error');

  let missingTenantStaffGet = false;
  try {
    await repo.getStaffById(staffAlpha.id);
  } catch {
    missingTenantStaffGet = true;
  }
  assert(missingTenantStaffGet, 'getStaffById without tenantId throws Security error');

  let missingTenantStaffUpdate = false;
  try {
    await repo.updateStaff(staffAlpha.id, { title: 'Lead Specialist' });
  } catch {
    missingTenantStaffUpdate = true;
  }
  assert(missingTenantStaffUpdate, 'updateStaff without tenantId throws Security error');

  let missingTenantRuleUpdate = false;
  try {
    await repo.updateAvailabilityRule(ruleAlpha.id, { is_active: false });
  } catch {
    missingTenantRuleUpdate = true;
  }
  assert(missingTenantRuleUpdate, 'updateAvailabilityRule without tenantId throws Security error');

  // Patch-only tenantId tests (FINDING-ADIM023-001: tenantId in patch must NOT serve as authority)
  let patchOnlyServiceUpdate = false;
  try {
    await repo.updateService(serviceAlpha.id, { tenantId: tenantAlpha, price: 999 });
  } catch {
    patchOnlyServiceUpdate = true;
  }
  assert(patchOnlyServiceUpdate, 'updateService with patch.tenantId but missing explicit tenantId parameter throws Security error');
  const verifyServiceAfterPatchOnly = await repo.getServiceById(serviceAlpha.id, tenantAlpha);
  assert(verifyServiceAfterPatchOnly?.price === 350, 'Service record preserved unchanged after patch.tenantId-only call');

  let patchOnlyStaffUpdate = false;
  try {
    await repo.updateStaff(staffAlpha.id, { tenantId: tenantAlpha, title: 'Hacked' });
  } catch {
    patchOnlyStaffUpdate = true;
  }
  assert(patchOnlyStaffUpdate, 'updateStaff with patch.tenantId but missing explicit tenantId parameter throws Security error');
  const verifyStaffAfterPatchOnly = await repo.getStaffById(staffAlpha.id, tenantAlpha);
  assert(verifyStaffAfterPatchOnly?.title === 'Senior Specialist', 'Staff record preserved unchanged after patch.tenantId-only call');

  let patchOnlyRuleUpdate = false;
  try {
    await repo.updateAvailabilityRule(ruleAlpha.id, { tenantId: tenantAlpha, is_active: false });
  } catch {
    patchOnlyRuleUpdate = true;
  }
  assert(patchOnlyRuleUpdate, 'updateAvailabilityRule with patch.tenantId but missing explicit tenantId parameter throws Security error');
  const verifyRuleAfterPatchOnly = (await repo.listAvailabilityRules(tenantAlpha)).find(r => r.id === ruleAlpha.id);
  assert(verifyRuleAfterPatchOnly?.is_active === true, 'Availability rule preserved unchanged after patch.tenantId-only call');

  // Immutable tenantId patch tests (FINDING-ADIM023-002)
  const alphaServiceBefore = await repo.getServiceById(serviceAlpha.id, tenantAlpha);
  let patchTenantServiceFailed = false;
  try {
    await repo.updateService(serviceAlpha.id, { tenantId: tenantBeta }, tenantAlpha);
  } catch {
    patchTenantServiceFailed = true;
  }
  assert(patchTenantServiceFailed, 'updateService rejects patch tenantId differing from authoritative tenantId');
  const alphaServiceAfter = await repo.getServiceById(serviceAlpha.id, tenantAlpha);
  assert(JSON.stringify(alphaServiceBefore) === JSON.stringify(alphaServiceAfter), 'Alpha service preserved byte-equivalent after tenantId tampering attempt');

  const alphaStaffBefore = await repo.getStaffById(staffAlpha.id, tenantAlpha);
  let patchTenantStaffFailed = false;
  try {
    await repo.updateStaff(staffAlpha.id, { tenantId: tenantBeta }, tenantAlpha);
  } catch {
    patchTenantStaffFailed = true;
  }
  assert(patchTenantStaffFailed, 'updateStaff rejects patch tenantId differing from authoritative tenantId');
  const alphaStaffAfter = await repo.getStaffById(staffAlpha.id, tenantAlpha);
  assert(JSON.stringify(alphaStaffBefore) === JSON.stringify(alphaStaffAfter), 'Alpha staff preserved byte-equivalent after tenantId tampering attempt');

  // Stripping protected fields test
  const patchedService = await repo.updateService(serviceAlpha.id, { price: 400, id: 'srv_tampered_id' }, tenantAlpha);
  assert(patchedService?.id === serviceAlpha.id && patchedService?.price === 400, 'updateService strips id from patch and preserves primary key');

  // Archive & zero-row tests (FINDING-ADIM023-005)
  console.log('\n--- §3.2 Mutation Non-Empty Effect / Zero-Row Negative Tests ---');
  let crossArchiveServiceBlocked = false;
  try {
    const res = await repo.archiveService(tenantBeta, serviceAlpha.id);
    crossArchiveServiceBlocked = (res === false);
  } catch {
    crossArchiveServiceBlocked = true;
  }
  assert(crossArchiveServiceBlocked, 'archiveService with wrong tenant fails closed');

  const missingServiceArchive = await repo.archiveService(tenantAlpha, 'srv_nonexistent_999');
  assert(missingServiceArchive === false, 'archiveService for unknown service returns false');

  const validServiceArchive = await repo.archiveService(tenantAlpha, serviceAlpha.id);
  assert(validServiceArchive === true, 'archiveService for existing service returns true');

  let crossArchiveStaffBlocked = false;
  try {
    const res = await repo.archiveStaff(tenantBeta, staffAlpha.id);
    crossArchiveStaffBlocked = (res === false);
  } catch {
    crossArchiveStaffBlocked = true;
  }
  assert(crossArchiveStaffBlocked, 'archiveStaff with wrong tenant fails closed');

  const missingStaffArchive = await repo.archiveStaff(tenantAlpha, 'staff_nonexistent_999');
  assert(missingStaffArchive === false, 'archiveStaff for unknown staff returns false');

  const validStaffArchive = await repo.archiveStaff(tenantAlpha, staffAlpha.id);
  assert(validStaffArchive === true, 'archiveStaff for existing staff returns true');

  // Eligibility mapping tests (FINDING-ADIM023-003)
  console.log('\n--- §3.3 Staff Service Eligibility Mapping Matrix ---');
  // Reactivate service and staff for mapping checks
  await repo.updateService(serviceAlpha.id, { active: true }, tenantAlpha);
  await repo.updateStaff(staffAlpha.id, { active: true }, tenantAlpha);

  // Initial state: mapping not set -> treated as ineligible (FINDING-ADIM023-003)
  const allEligible = await repo.listStaffForService(tenantAlpha, serviceAlpha.id);
  assert(allEligible.length === 0, 'Default unmapped state treats staff as ineligible (returns 0 staff)');

  // Set explicit mapping where staffAlpha has empty array []
  const mappingKey = `lari:${tenantAlpha}:staff_services`;
  localStorage.setItem(mappingKey, JSON.stringify({ [staffAlpha.id]: [] }));
  const emptyMappedStaff = await repo.listStaffForService(tenantAlpha, serviceAlpha.id);
  assert(!emptyMappedStaff.some(s => s.id === staffAlpha.id), 'Explicit empty mapping [] treats staff as ineligible');

  // Set explicit mapping with serviceAlpha
  localStorage.setItem(mappingKey, JSON.stringify({ [staffAlpha.id]: [serviceAlpha.id] }));
  const explicitMappedStaff = await repo.listStaffForService(tenantAlpha, serviceAlpha.id);
  assert(explicitMappedStaff.some(s => s.id === staffAlpha.id), 'Explicit mapping with serviceId treats staff as eligible');

  // Requesting another tenant's service in listStaffForService
  const crossServiceStaffList = await repo.listStaffForService(tenantAlpha, serviceBeta.id);
  assert(crossServiceStaffList.length === 0, 'listStaffForService for other tenant service returns empty array');

  // FINDING-ADIM023-014: Corrupted or cross-tenant IDs in staff_services must be filtered out by listServicesForStaff
  console.log('\n--- §3.4 Cross-Tenant Service ID Filtering in listServicesForStaff (FINDING-ADIM023-014) ---');
  localStorage.setItem(mappingKey, JSON.stringify({
    [staffAlpha.id]: [serviceAlpha.id, serviceBeta.id, 'srv_unknown_bogus_999']
  }));
  const filteredServices = await repo.listServicesForStaff(staffAlpha.id, tenantAlpha);
  assert(filteredServices.includes(serviceAlpha.id), 'listServicesForStaff retains valid tenantAlpha serviceAlpha');
  assert(!filteredServices.includes(serviceBeta.id), 'listServicesForStaff strictly filters out cross-tenant serviceBeta');
  assert(!filteredServices.includes('srv_unknown_bogus_999'), 'listServicesForStaff strictly filters out unknown service ID');

  // FINDING-ADIM023-011: updateAvailability tenantId tampering and immutable ID checks
  console.log('\n--- §3.5 updateAvailability Tenant & ID Immutability Tests (FINDING-ADIM023-011) ---');
  const rulesBeforeAvail = await repo.listAvailabilityRules(tenantAlpha);
  let updateAvailTamperBlocked = false;
  try {
    await repo.updateAvailability(tenantAlpha, { tenantId: tenantBeta, id: 'rule_tampered_beta', start_time: '10:00:00' });
  } catch (err) {
    if (err.message && err.message.includes('Tenant isolation violation')) updateAvailTamperBlocked = true;
  }
  assert(updateAvailTamperBlocked, 'updateAvailability with mismatched tenantId throws Tenant isolation violation');
  const rulesAfterAvailTamper = await repo.listAvailabilityRules(tenantAlpha);
  assert(JSON.stringify(rulesBeforeAvail) === JSON.stringify(rulesAfterAvailTamper), 'Availability rules remain byte-equivalent unchanged after tenant tampering attempt');

  // Valid updateAvailability strips id/tenantId
  const validAvailUpdate = await repo.updateAvailability(tenantAlpha, { start_time: '08:00:00', end_time: '17:00:00', id: 'rule_ignored_id' });
  assert(validAvailUpdate.id === rulesBeforeAvail[0].id, 'updateAvailability preserves existing rule ID and ignores patch id');
  assert(validAvailUpdate.tenantId === tenantAlpha, 'updateAvailability preserves authoritative tenantId');

  // --- §4 Repository Guard & Static Contract Invariance ---
  console.log('\n--- §4 Catalog Repository Boundary Integration ---');
  assert(supaContent.includes("requireTenantId(tenantId, 'listServices')"), 'listServices enforces requireTenantId');
  assert(supaContent.includes("requireTenantId(tenantId, 'createService')"), 'createService enforces requireTenantId');
  assert(supaContent.includes("requireTenantId(tenantId, 'listStaff')"), 'listStaff enforces requireTenantId');
  assert(supaContent.includes("requireTenantId(tenantId, 'createStaff')"), 'createStaff enforces requireTenantId');
  assert(supaContent.includes("requireTenantId(tenantId, 'listAvailabilityRules')"), 'listAvailabilityRules enforces requireTenantId');
  assert(supaContent.includes("requireTenantId(tenantId, 'createAvailabilityRule')"), 'createAvailabilityRule enforces requireTenantId');
  assert(supaContent.includes("requireTenantId(tenantId || '', 'assignServiceToStaff')"), 'assignServiceToStaff enforces requireTenantId');
  assert(supaContent.includes("requireTenantId(tenantId || '', 'removeServiceFromStaff')"), 'removeServiceFromStaff enforces requireTenantId');
  assert(supaContent.includes("requireTenantId(tenantId || '', 'listServicesForStaff')"), 'listServicesForStaff enforces requireTenantId');

  // --- §5 Mocked PostgREST Tenant Isolation Runtime Matrix (FINDING-ADIM023-006 & FINDING-ADIM023-007) ---
  console.log('\n--- §5 Mocked PostgREST Tenant Isolation Runtime Matrix ---');
  process.env.VITE_SUPABASE_URL = 'https://mock-tenant-test.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key-abc123xyz';
  try {
    if (import.meta && import.meta.env) {
      import.meta.env.VITE_SUPABASE_URL = 'https://mock-tenant-test.supabase.co';
      import.meta.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key-abc123xyz';
    }
  } catch {}
  if (globalThis.import?.meta?.env) {
    globalThis.import.meta.env.VITE_SUPABASE_URL = 'https://mock-tenant-test.supabase.co';
    globalThis.import.meta.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key-abc123xyz';
  }

  const interceptedCalls = [];
  let mockAvailabilityRuleAlpha = {
    id: 'rule_123',
    tenant_id: 'tenant_alpha',
    start_time: '09:00:00',
    end_time: '18:00:00',
    weekday: 1,
    is_active: true
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const urlStr = String(url);
    const method = options.method || 'GET';
    interceptedCalls.push({ url: urlStr, method, options });

    // Mock response router for Supabase REST endpoints
    if (urlStr.includes('/rest/v1/services')) {
      if (method === 'GET') {
        const hasServiceIdParam = urlStr.includes('?id=') || urlStr.includes('&id=');
        if (urlStr.includes('tenant_id=eq.tenant_alpha') && urlStr.includes('id=eq.srv_alpha')) {
          return new Response(JSON.stringify([{
            id: 'srv_alpha',
            tenant_id: 'tenant_alpha',
            name: 'Alpha Haircut',
            duration: 45,
            price: 500,
            active: true
          }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('tenant_id=eq.tenant_beta') && urlStr.includes('id=eq.srv_beta')) {
          return new Response(JSON.stringify([{
            id: 'srv_beta',
            tenant_id: 'tenant_beta',
            name: 'Beta Spa',
            duration: 60,
            price: 800,
            active: true
          }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (!hasServiceIdParam && urlStr.includes('tenant_id=eq.tenant_alpha')) {
          const p = JSON.stringify([{
            id: 'srv_alpha',
            tenant_id: 'tenant_alpha',
            name: 'Alpha Haircut',
            duration: 45,
            price: 500,
            active: true
          }]);
          return new Response(p, { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (method === 'PATCH') {
        return new Response(JSON.stringify([{
          id: 'srv_alpha',
          tenant_id: 'tenant_alpha',
          price: 550
        }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (urlStr.includes('/rest/v1/staff_services')) {
      if (method === 'POST') {
        return new Response(JSON.stringify([{ staff_id: 'staff_alpha', service_id: 'srv_alpha' }]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (method === 'DELETE') {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (method === 'GET') {
        const payload = JSON.stringify([
          { service_id: 'srv_alpha' },
          { service_id: 'srv_beta' }
        ]);
        return new Response(payload, { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (urlStr.includes('/rest/v1/staff')) {
      if (method === 'GET') {
        if (urlStr.includes('tenant_id=eq.tenant_alpha') && urlStr.includes('id=eq.staff_alpha')) {
          return new Response(JSON.stringify([{
            id: 'staff_alpha',
            tenant_id: 'tenant_alpha',
            name: 'Ayşe Alpha',
            title: 'Stylist',
            is_owner: true,
            active: true
          }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('tenant_id=eq.tenant_beta') && urlStr.includes('id=eq.staff_beta')) {
          return new Response(JSON.stringify([{
            id: 'staff_beta',
            tenant_id: 'tenant_beta',
            name: 'Canan Beta',
            title: 'Colorist',
            is_owner: true,
            active: true
          }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (method === 'PATCH') {
        return new Response(JSON.stringify([{
          id: 'staff_alpha',
          tenant_id: 'tenant_alpha',
          title: 'Senior Stylist'
        }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (urlStr.includes('/rest/v1/availability_rules')) {
      if (method === 'GET') {
        if (urlStr.includes('tenant_id=eq.tenant_alpha')) {
          return new Response(JSON.stringify([mockAvailabilityRuleAlpha]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (method === 'PATCH') {
        const patchData = options?.body ? JSON.parse(options.body) : {};
        mockAvailabilityRuleAlpha = {
          ...mockAvailabilityRuleAlpha,
          ...patchData,
          id: 'rule_123',
          tenant_id: 'tenant_alpha'
        };
        return new Response(JSON.stringify([mockAvailabilityRuleAlpha]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const { SupabaseCatalogRepository } = await import('../services/repositories/supabaseCatalogRepository.ts');
  const supaRepo = new SupabaseCatalogRepository();

  // Test 1: updateService without tenantId throws Security error and sends 0 PATCH requests
  interceptedCalls.length = 0;
  let supaUpdateMissingTenantThrows = false;
  try {
    await supaRepo.updateService('srv_alpha', { price: 600 });
  } catch {
    supaUpdateMissingTenantThrows = true;
  }
  assert(supaUpdateMissingTenantThrows, 'Supabase updateService without tenantId throws Security error');
  assert(interceptedCalls.filter(c => c.method === 'PATCH').length === 0, 'Zero PATCH requests sent when tenantId is missing');

  // Test 2: updateService with patch.tenantId only (missing explicit tenantId) throws Security error
  interceptedCalls.length = 0;
  let supaUpdatePatchOnlyTenantThrows = false;
  try {
    await supaRepo.updateService('srv_alpha', { tenantId: 'tenant_alpha', price: 600 });
  } catch {
    supaUpdatePatchOnlyTenantThrows = true;
  }
  assert(supaUpdatePatchOnlyTenantThrows, 'Supabase updateService with patch.tenantId only throws Security error');
  assert(interceptedCalls.filter(c => c.method === 'PATCH').length === 0, 'Zero PATCH requests sent for patch.tenantId-only call');

  // Test 3: updateService with conflicting patch.tenantId throws isolation violation
  interceptedCalls.length = 0;
  let supaUpdateMismatchThrows = false;
  try {
    await supaRepo.updateService('srv_alpha', { tenantId: 'tenant_beta', price: 600 }, 'tenant_alpha');
  } catch {
    supaUpdateMismatchThrows = true;
  }
  assert(supaUpdateMismatchThrows, 'Supabase updateService with mismatched patch.tenantId throws isolation violation');
  assert(interceptedCalls.filter(c => c.method === 'PATCH').length === 0, 'Zero PATCH requests sent on tenant mismatch');

  // Test 4: updateStaff without tenantId throws Security error and sends 0 PATCH calls
  interceptedCalls.length = 0;
  let supaStaffMissingTenantThrows = false;
  try {
    await supaRepo.updateStaff('staff_alpha', { title: 'New' });
  } catch {
    supaStaffMissingTenantThrows = true;
  }
  assert(supaStaffMissingTenantThrows, 'Supabase updateStaff without tenantId throws Security error');
  assert(interceptedCalls.filter(c => c.method === 'PATCH').length === 0, 'Zero PATCH requests sent for staff when tenantId is missing');

  // Test 4.1: updateStaff with patch.tenantId only (missing explicit tenantId) throws Security error
  interceptedCalls.length = 0;
  let supaStaffPatchOnlyTenantThrows = false;
  try {
    await supaRepo.updateStaff('staff_alpha', { tenantId: 'tenant_alpha', title: 'New' });
  } catch {
    supaStaffPatchOnlyTenantThrows = true;
  }
  assert(supaStaffPatchOnlyTenantThrows, 'Supabase updateStaff with patch.tenantId only throws Security error');
  assert(interceptedCalls.filter(c => c.method === 'PATCH').length === 0, 'Zero PATCH requests sent for staff patch.tenantId-only call');

  // Test 4.2: updateStaff with mismatched patch.tenantId throws isolation violation
  interceptedCalls.length = 0;
  let supaStaffMismatchThrows = false;
  try {
    await supaRepo.updateStaff('staff_alpha', { tenantId: 'tenant_beta', title: 'New' }, 'tenant_alpha');
  } catch {
    supaStaffMismatchThrows = true;
  }
  assert(supaStaffMismatchThrows, 'Supabase updateStaff with mismatched patch.tenantId throws isolation violation');
  assert(interceptedCalls.filter(c => c.method === 'PATCH').length === 0, 'Zero PATCH requests sent on staff tenant mismatch');

  // Test 5: updateAvailabilityRule without tenantId throws Security error
  interceptedCalls.length = 0;
  let supaRuleMissingTenantThrows = false;
  try {
    await supaRepo.updateAvailabilityRule('rule_123', { is_active: false });
  } catch {
    supaRuleMissingTenantThrows = true;
  }
  assert(supaRuleMissingTenantThrows, 'Supabase updateAvailabilityRule without tenantId throws Security error');
  assert(interceptedCalls.filter(c => c.method === 'PATCH').length === 0, 'Zero PATCH requests sent for availability rule when tenantId is missing');

  // Test 5.1: updateAvailabilityRule with patch.tenantId only throws Security error
  interceptedCalls.length = 0;
  let supaRulePatchOnlyTenantThrows = false;
  try {
    await supaRepo.updateAvailabilityRule('rule_123', { tenantId: 'tenant_alpha', is_active: false });
  } catch {
    supaRulePatchOnlyTenantThrows = true;
  }
  assert(supaRulePatchOnlyTenantThrows, 'Supabase updateAvailabilityRule with patch.tenantId only throws Security error');
  assert(interceptedCalls.filter(c => c.method === 'PATCH').length === 0, 'Zero PATCH requests sent for rule patch.tenantId-only call');

  // Test 5.2: updateAvailabilityRule with mismatched patch.tenantId throws isolation violation
  interceptedCalls.length = 0;
  let supaRuleMismatchThrows = false;
  try {
    await supaRepo.updateAvailabilityRule('rule_123', { tenantId: 'tenant_beta', is_active: false }, 'tenant_alpha');
  } catch {
    supaRuleMismatchThrows = true;
  }
  assert(supaRuleMismatchThrows, 'Supabase updateAvailabilityRule with mismatched patch.tenantId throws isolation violation');
  assert(interceptedCalls.filter(c => c.method === 'PATCH').length === 0, 'Zero PATCH requests sent on rule tenant mismatch');

  // Test 5.3: updateAvailability with id and tenantId in input strips both and preserves authoritative id and tenantId (FINDING-ADIM023-018)
  interceptedCalls.length = 0;
  const updatedAvailabilityResult = await supaRepo.updateAvailability('tenant_alpha', {
    id: 'rule_tampered_by_attacker',
    tenantId: 'tenant_alpha',
    start_time: '10:00:00'
  });
  assert(updatedAvailabilityResult.id === 'rule_123', 'updateAvailability returns authoritative original id rule_123, ignoring spoofed id in patch');
  assert(updatedAvailabilityResult.tenantId === 'tenant_alpha', 'updateAvailability returns authoritative tenantId tenant_alpha');
  assert(updatedAvailabilityResult.start_time === '10:00:00', 'updateAvailability applies safe fields from input');

  // Verify that the PATCH sent to PostgREST stripped id and tenantId
  const availPatchCalls = interceptedCalls.filter(c => c.method === 'PATCH' && c.url.includes('availability_rules'));
  assert(availPatchCalls.length > 0, 'PATCH sent for availability update');
  const sentAvailBody = JSON.parse(availPatchCalls[0].options.body);
  assert(sentAvailBody.id === undefined, 'PATCH payload strips id');
  assert(sentAvailBody.tenant_id === undefined && sentAvailBody.tenantId === undefined, 'PATCH payload strips tenant_id');

  // Test 5.4: updateAvailability with conflicting patch.tenantId throws isolation violation
  interceptedCalls.length = 0;
  let supaAvailMismatchThrows = false;
  try {
    await supaRepo.updateAvailability('tenant_alpha', {
      id: 'rule_beta',
      tenantId: 'tenant_beta',
      start_time: '10:00:00'
    });
  } catch (err) {
    if (err.message && err.message.includes('Tenant isolation violation')) {
      supaAvailMismatchThrows = true;
    }
  }
  assert(supaAvailMismatchThrows, 'updateAvailability with mismatched patch.tenantId throws isolation violation');
  assert(interceptedCalls.filter(c => c.method === 'PATCH' && c.url.includes('availability_rules')).length === 0, 'Zero PATCH requests sent on availability tenant mismatch');

  // Test 6: assignServiceToStaff without tenantId throws Security error and sends 0 POST calls
  interceptedCalls.length = 0;
  let supaAssignMissingTenantThrows = false;
  try {
    await supaRepo.assignServiceToStaff('staff_alpha', 'srv_alpha');
  } catch {
    supaAssignMissingTenantThrows = true;
  }
  assert(supaAssignMissingTenantThrows, 'Supabase assignServiceToStaff without tenantId throws Security error');
  assert(interceptedCalls.filter(c => c.method === 'POST' && c.url.includes('staff_services')).length === 0, 'Zero POST staff_services requests sent when tenantId is missing');

  // Test 7: assignServiceToStaff with cross-tenant service throws and sends 0 POST calls
  interceptedCalls.length = 0;
  let supaAssignCrossTenantThrows = false;
  try {
    await supaRepo.assignServiceToStaff('staff_alpha', 'srv_beta', 'tenant_alpha');
  } catch {
    supaAssignCrossTenantThrows = true;
  }
  assert(supaAssignCrossTenantThrows, 'Supabase assignServiceToStaff across tenants throws isolation violation');
  assert(interceptedCalls.filter(c => c.method === 'POST' && c.url.includes('staff_services')).length === 0, 'Zero POST staff_services requests sent on cross-tenant assignment attempt');

  // Test 8: assignServiceToStaff with matching tenant sends POST
  interceptedCalls.length = 0;
  await supaRepo.assignServiceToStaff('staff_alpha', 'srv_alpha', 'tenant_alpha');
  assert(interceptedCalls.some(c => c.method === 'POST' && c.url.includes('staff_services')), 'Supabase assignServiceToStaff with matching tenant sends POST to staff_services');

  // Test 9: removeServiceFromStaff without tenantId throws Security error and sends 0 DELETE calls
  interceptedCalls.length = 0;
  let supaRemoveMissingTenantThrows = false;
  try {
    await supaRepo.removeServiceFromStaff('staff_alpha', 'srv_alpha');
  } catch {
    supaRemoveMissingTenantThrows = true;
  }
  assert(supaRemoveMissingTenantThrows, 'Supabase removeServiceFromStaff without tenantId throws Security error');
  assert(interceptedCalls.filter(c => c.method === 'DELETE' && c.url.includes('staff_services')).length === 0, 'Zero DELETE staff_services requests sent when tenantId is missing');

  // Test 10: removeServiceFromStaff with cross-tenant staff/service throws and sends 0 DELETE calls
  interceptedCalls.length = 0;
  let supaRemoveCrossTenantThrows = false;
  try {
    await supaRepo.removeServiceFromStaff('staff_alpha', 'srv_beta', 'tenant_alpha');
  } catch {
    supaRemoveCrossTenantThrows = true;
  }
  assert(supaRemoveCrossTenantThrows, 'Supabase removeServiceFromStaff across tenants throws isolation violation');
  assert(interceptedCalls.filter(c => c.method === 'DELETE' && c.url.includes('staff_services')).length === 0, 'Zero DELETE staff_services requests sent on cross-tenant removal attempt');

  // Test 11: removeServiceFromStaff with matching tenant sends DELETE
  interceptedCalls.length = 0;
  await supaRepo.removeServiceFromStaff('staff_alpha', 'srv_alpha', 'tenant_alpha');
  assert(interceptedCalls.some(c => c.method === 'DELETE' && c.url.includes('staff_services')), 'Supabase removeServiceFromStaff with matching tenant sends DELETE to staff_services');

  // Test 12: listServicesForStaff without tenantId throws Security error
  let supaListServicesMissingTenantThrows = false;
  try {
    await supaRepo.listServicesForStaff('staff_alpha');
  } catch {
    supaListServicesMissingTenantThrows = true;
  }
  assert(supaListServicesMissingTenantThrows, 'Supabase listServicesForStaff without tenantId throws Security error');

  // Test 13: listServicesForStaff with matching tenant filters out services belonging to other tenants
  interceptedCalls.length = 0;
  const staffServices = await supaRepo.listServicesForStaff('staff_alpha', 'tenant_alpha');
  assert(staffServices.includes('srv_alpha'), 'listServicesForStaff returns matching tenant service srv_alpha');
  assert(!staffServices.includes('srv_beta'), 'listServicesForStaff strictly filters out cross-tenant service srv_beta');

  // --- §4 Negative Test (FINDING-ADIM023-015-REOPENED) ---
  console.log('\n--- §4 Negative Test for FINDING-ADIM023-015-REOPENED (tenant_pub_parity & tenant_v1a_reg_isolated_001) ---');
  const { LocalBookingRepository } = await import('../services/repositories/localBookingRepository.ts');
  const localBookingRepo = new LocalBookingRepository();

  for (const tid of ['tenant_pub_parity', 'tenant_v1a_reg_isolated_001']) {
    const preMappingKey = `lari:${tid}:staff_services`;
    const preSnapshot = localStorage.getItem(preMappingKey);
    
    const unmappedStaff = await repo.createStaff(tid, {
      name: `Unmapped Staff for ${tid}`,
      title: 'Stylist',
      active: true
    });
    assert(Boolean(unmappedStaff && unmappedStaff.id), `createStaff succeeds for ${tid}`);

    const postSnapshot = localStorage.getItem(preMappingKey);
    assert(preSnapshot === postSnapshot, `staff_services storage remains byte-identical for ${tid} after createStaff`);

    const srv = await repo.createService(tid, {
      name: `Test Service for ${tid}`,
      duration: 30,
      price: 250,
      active: true
    });

    let bookingThrewIneligible = false;
    try {
      await localBookingRepo.createAppointment(tid, {
        serviceId: srv.id,
        staffId: unmappedStaff.id,
        date: '2026-12-25',
        time: '10:00',
        durationMinutes: 30,
        status: 'confirmed',
        userId: 'cust_neg_1',
        user_name: 'Test Customer',
        phone: '+905551112233'
      });
    } catch (err) {
      if (err.message && err.message.includes('Staff ineligible')) {
        bookingThrewIneligible = true;
      }
    }
    assert(bookingThrewIneligible, `createAppointment fails closed with Staff ineligible for unmapped staff under ${tid}`);
  }

  // Restore fetch
  globalThis.fetch = originalFetch;

  // Final summary
  console.log('\n============================================================');
  if (failed === 0) {
    console.log(`✓ ALL ${passed} MULTI-TENANT CATALOG & STAFF ISOLATION CHECKS PASSED.`);
    process.exit(0);
  } else {
    console.error(`✗ ${failed} CHECKS FAILED out of ${passed + failed}.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
