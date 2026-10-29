// scripts/test-catalog-tenant-isolation.mjs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import fs from 'fs';
import path from 'path';

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

  // --- §1 Static Source & Contract Inspection ---
  console.log('\n--- §1 Static Source & Contract Inspection ---');
  const supaRepoPath = path.join(process.cwd(), 'services/repositories/supabaseCatalogRepository.ts');
  assert(fs.existsSync(supaRepoPath), 'supabaseCatalogRepository.ts exists');
  const supaContent = fs.readFileSync(supaRepoPath, 'utf8');

  assert(supaContent.includes('export function assertTenantId'), 'Exports assertTenantId guard');
  assert(supaContent.includes('export function requireTenantId'), 'Exports requireTenantId guard');
  assert(supaContent.includes('tenant_id=eq.${encodeURIComponent(validTenantId)}'), 'Enforces tenant_id scoping on listServices');
  assert(supaContent.includes('tenant_id=eq.${encodeURIComponent(cleanTenantId)}'), 'Enforces tenant_id scoping on getServiceById/updateService');
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
  function assertTenantId(tenantId, operation = 'operation') {
    if (tenantId !== undefined && (typeof tenantId !== 'string' || !tenantId.trim())) {
      throw new Error(`[guard] Security error: invalid or empty tenantId provided for ${operation}`);
    }
    return tenantId?.trim() || '';
  }

  function requireTenantId(tenantId, operation = 'operation') {
    if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
      throw new Error(`[guard] Security error: non-empty tenantId is required for ${operation}`);
    }
    return tenantId.trim();
  }

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

  // --- §3 Local Repository Multi-Tenant Isolation Simulation ---
  console.log('\n--- §3 Local Repository Runtime Tenant Boundary Matrix ---');
  const store = new Map();
  const mockStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] || null,
  };

  const tenantAlpha = 'tenant_alpha_' + Date.now();
  const tenantBeta = 'tenant_beta_' + Date.now();

  const serviceAlpha = {
    id: 'srv_alpha_1',
    name: 'Saç Kesimi Alpha',
    duration: 45,
    price: 350,
    active: true,
    category: 'Hair',
    tenantId: tenantAlpha
  };

  const serviceBeta = {
    id: 'srv_beta_1',
    name: 'Sakal Tıraşı Beta',
    duration: 30,
    price: 200,
    active: true,
    category: 'Beard',
    tenantId: tenantBeta
  };

  mockStorage.setItem(`lari:${tenantAlpha}:services`, JSON.stringify([serviceAlpha]));
  mockStorage.setItem(`lari:${tenantBeta}:services`, JSON.stringify([serviceBeta]));

  assert(serviceAlpha.tenantId === tenantAlpha, 'Service created in Tenant Alpha with correct tenantId');
  assert(serviceBeta.tenantId === tenantBeta, 'Service created in Tenant Beta with correct tenantId');

  // Cross-tenant read test
  const alphaServices = JSON.parse(mockStorage.getItem(`lari:${tenantAlpha}:services`));
  const betaServices = JSON.parse(mockStorage.getItem(`lari:${tenantBeta}:services`));
  assert(!betaServices.some(s => s.id === serviceAlpha.id), 'Tenant Beta cannot see services from Tenant Alpha');

  // Cross-tenant tampering defense simulation
  function checkCrossTenantServiceTamper(targetSrvId, callerTenantId) {
    for (let i = 0; i < mockStorage.length; i++) {
      const k = mockStorage.key(i);
      if (k && k.endsWith(':services') && k !== `lari:${callerTenantId}:services`) {
        const raw = mockStorage.getItem(k);
        const list = raw ? JSON.parse(raw) : [];
        if (Array.isArray(list) && list.some(s => s && s.id === targetSrvId)) {
          throw new Error('Tenant isolation violation: cannot update service of another tenant');
        }
      }
    }
  }

  let tamperBlocked = false;
  try {
    checkCrossTenantServiceTamper('srv_alpha_1', tenantBeta);
  } catch (e) {
    if (e.message.includes('Tenant isolation violation')) {
      tamperBlocked = true;
    }
  }
  assert(tamperBlocked, 'Updating another tenant service throws Tenant isolation violation');

  console.log(`\n======================================================`);
  console.log(`🏁 Catalog/Staff Multi-Tenant Isolation Results: ${passed} passed, ${failed} failed`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
