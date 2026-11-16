import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

globalThis.__mockImportMetaEnv = { VITE_DATA_MODE: 'mock' };

// Register a lightweight synchronous TypeScript extension resolver so this suite
// runs directly under both `node scripts/test-slug-regression.mjs` (Node 22.15+/24)
// and `npx tsx scripts/test-slug-regression.mjs`.
if (typeof Module.registerHooks === 'function') {
  try {
    Module.registerHooks({
      resolve(specifier, context, nextResolve) {
        if (
          (specifier.startsWith('./') || specifier.startsWith('../')) &&
          !path.extname(specifier) &&
          context.parentURL
        ) {
          const parentDir = path.dirname(fileURLToPath(context.parentURL));
          const tsCandidate = path.resolve(parentDir, `${specifier}.ts`);
          if (fs.existsSync(tsCandidate)) {
            return nextResolve(pathToFileURL(tsCandidate).href, context);
          }
        }
        return nextResolve(specifier, context);
      },
      load(url, context, nextLoad) {
        if (url.endsWith('/types.ts')) {
          const rawTypes = fs.readFileSync(fileURLToPath(url), 'utf8');
          const exportedNames = new Set(['MediaAssetType']);
          for (const m of rawTypes.matchAll(/export\s+(?:interface|type|enum)\s+([A-Za-z0-9_]+)/g)) {
            exportedNames.add(m[1]);
          }
          const stubs = Array.from(exportedNames)
            .map((name) => `export const ${name} = {};`)
            .join('\n');
          return {
            format: 'module',
            shortCircuit: true,
            source: stubs + '\n',
          };
        }
        if (url.endsWith('/supabaseClient.ts') || url.endsWith('/supabaseDataProvider.ts')) {
          return {
            format: 'module',
            shortCircuit: true,
            source: `export const supabase = new Proxy({}, {
  get(target, prop) {
    if (globalThis.__mockSupabaseClient && prop in globalThis.__mockSupabaseClient) {
      return globalThis.__mockSupabaseClient[prop];
    }
    return target[prop];
  }
});
export const supabaseProvider = {};\n`,
          };
        }
        if (url.endsWith('.ts')) {
          const rawTs = fs.readFileSync(fileURLToPath(url), 'utf8');
          const typeExports = [];
          for (const m of rawTs.matchAll(/export\s+(?:interface|type)\s+([A-Za-z0-9_]+)/g)) {
            typeExports.push(`export const ${m[1]} = undefined;`);
          }
          const envPrelude = `if (typeof import.meta !== 'undefined' && !import.meta.env) { Object.defineProperty(import.meta, 'env', { get: () => globalThis.__mockImportMetaEnv || { VITE_DATA_MODE: 'mock' }, configurable: true }); }\n`;
          return {
            format: 'module-typescript',
            shortCircuit: true,
            source: `${envPrelude}${rawTs}\n${typeExports.join('\n')}\n`,
          };
        }
        return nextLoad(url, context);
      },
    });
  } catch (hookErr) {
    // Hook registration ignored if unsupported or already registered
  }
}

// Deterministic in-memory browser storage & window mock for service tests
const storageMap = new Map();
const localStorageMock = {
  getItem(key) {
    return storageMap.has(key) ? storageMap.get(key) : null;
  },
  setItem(key, value) {
    storageMap.set(key, String(value));
  },
  removeItem(key) {
    storageMap.delete(key);
  },
  clear() {
    storageMap.clear();
  },
};

globalThis.localStorage = localStorageMock;
globalThis.window = {
  location: {
    origin: 'https://randevulari.com',
    hostname: 'randevulari.com',
    hash: '',
    pathname: '/',
  },
  localStorage: localStorageMock,
};

let slugUtilsModule;
let publicLinkModule;
let siteProvisioningModule;
let tenantServiceModule;

try {
  slugUtilsModule = await import('../utils/slugUtils.ts');
  publicLinkModule = await import('../services/publicLinkService.ts');
  siteProvisioningModule = await import('../services/siteProvisioningService.ts');
  tenantServiceModule = await import('../services/tenantService.ts');
} catch (loadErr) {
  // Transpilation fallback if host node environment does not resolve .ts files directly
  let esbuild;
  try {
    esbuild = (await import('esbuild')).default;
  } catch {}

  const loadTranspiled = async (rel) => {
    const absPath = path.resolve(__dirname, rel);
    const code = fs.readFileSync(absPath, 'utf8');
    let js;
    if (esbuild) {
      js = esbuild.transformSync(code, { loader: 'ts' }).code;
    } else {
      js = code
        .replace(/export\s+interface\s+[\s\S]*?}/g, '')
        .replace(/export\s+type\s+[\s\S]*?;/g, '')
        .replace(/:\s*[A-Za-z0-9_<>\[\]|&]+/g, '')
        .replace(/as\s+const/g, '');
    }
    const dataUri = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
    return await import(dataUri);
  };

  slugUtilsModule = await loadTranspiled('../utils/slugUtils.ts');
  publicLinkModule = await loadTranspiled('../services/publicLinkService.ts');
  siteProvisioningModule = await loadTranspiled('../services/siteProvisioningService.ts');
  tenantServiceModule = await loadTranspiled('../services/tenantService.ts');
}

const {
  SLUG_VALIDATION_REASONS,
  isValidSlug,
  validateSlugFormat,
  generateSlugFromName,
  getSlugAlternatives,
} = slugUtilsModule;
const { publicLinkService } = publicLinkModule;
const { siteProvisioningService } = siteProvisioningModule;
const { tenantService } = tenantServiceModule;

console.log('🏁 Running slug validation, normalization, and reserveTenantSlug regression tests...');

let failures = 0;

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    console.error('❌ Case ' + label + ' FAILED: Expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    failures++;
  } else {
    console.log('✅ Case ' + label + ' PASSED: got ' + JSON.stringify(actual));
  }
}

function seedTenants(tenants) {
  localStorageMock.clear();
  localStorageMock.setItem('lari_registered_tenants', JSON.stringify(tenants));
}

// 1. Canonical utility & reason-code assertions
assertEqual('lari reserved', isValidSlug('lari'), false);
assertEqual('randevulari reserved', isValidSlug('randevulari'), false);
assertEqual('randapp reserved', isValidSlug('randapp'), false);
assertEqual('radapp reserved', isValidSlug('radapp'), false);
assertEqual('admin reserved', isValidSlug('admin'), false);
assertEqual('super-admin reserved', isValidSlug('super-admin'), false);
assertEqual('book reserved', isValidSlug('book'), false);
assertEqual('booking reserved', isValidSlug('booking'), false);
assertEqual('login reserved', isValidSlug('login'), false);
assertEqual('checkout reserved', isValidSlug('checkout'), false);

assertEqual('melis-guzellik valid', isValidSlug('melis-guzellik'), true);
assertEqual('valid business slug', isValidSlug('valid-normal-business-slug'), true);
assertEqual('uppercase normalizer', generateSlugFromName('MELIS-GUZELLIK'), 'melis-guzellik');
assertEqual('Turkish character conversion', generateSlugFromName('şahin-güzellik-ve-saç'), 'sahin-guzellik-ve-sac');
assertEqual('empty slug rejection', isValidSlug(''), false);
assertEqual('too short slug', isValidSlug('ab'), false);
assertEqual('consecutive hyphens', isValidSlug('abc--def'), false);
assertEqual('overlong slug rejected (51 chars)', isValidSlug('a'.repeat(51)), false);
assertEqual('max length slug accepted (50 chars)', isValidSlug('a'.repeat(50)), true);
assertEqual('trailing hyphen rejected', isValidSlug('slug-ending-with-'), false);
assertEqual('leading hyphen rejected', isValidSlug('-slug-starting-with'), false);

// 2. Structured reason-code contract assertions
const shortResult = validateSlugFormat('ab');
assertEqual('validateSlugFormat too short isValid', shortResult.isValid, false);
assertEqual('validateSlugFormat too short reason', shortResult.reason, SLUG_VALIDATION_REASONS.EMPTY_OR_SHORT);

const overlongResult = validateSlugFormat('a'.repeat(51));
assertEqual('validateSlugFormat overlong isValid', overlongResult.isValid, false);
assertEqual('validateSlugFormat overlong reason', overlongResult.reason, SLUG_VALIDATION_REASONS.TOO_LONG);

const hyphenResult = validateSlugFormat('melis--guzellik');
assertEqual('validateSlugFormat double-hyphen isValid', hyphenResult.isValid, false);
assertEqual('validateSlugFormat double-hyphen reason', hyphenResult.reason, SLUG_VALIDATION_REASONS.INVALID_FORMAT);

const reservedResult = validateSlugFormat('admin');
assertEqual('validateSlugFormat reserved isValid', reservedResult.isValid, false);
assertEqual('validateSlugFormat reserved reason', reservedResult.reason, SLUG_VALIDATION_REASONS.RESERVED);

const validResult = validateSlugFormat('melis-guzellik');
assertEqual('validateSlugFormat valid isValid', validResult.isValid, true);
assertEqual('validateSlugFormat valid reason', validResult.reason, SLUG_VALIDATION_REASONS.VALID);

// 3. Collision alternative generator assertions
const altsForValid = getSlugAlternatives('melis');
assertEqual('getSlugAlternatives length for melis', altsForValid.length, 4);
assertEqual('getSlugAlternatives includes melis-studio', altsForValid.includes('melis-studio'), true);
assertEqual('getSlugAlternatives includes melis-guzellik', altsForValid.includes('melis-guzellik'), true);
assertEqual('getSlugAlternatives includes melis-salon', altsForValid.includes('melis-salon'), true);
assertEqual('getSlugAlternatives includes melis-tr', altsForValid.includes('melis-tr'), true);

const altsForReserved = getSlugAlternatives('admin');
assertEqual('getSlugAlternatives for reserved word returns empty array', altsForReserved.length, 0);

// Base slug near 50-char ceiling: only alternatives <= 50 chars may be returned
const longBase = 'a'.repeat(45);
const altsForLong = getSlugAlternatives(longBase);
for (const alt of altsForLong) {
  assertEqual('alternative adheres to <=50 ceiling: ' + alt, alt.length <= 50, true);
  assertEqual('alternative is valid slug: ' + alt, isValidSlug(alt), true);
}
assertEqual('only -tr fits 45 char base', altsForLong.length, 1);
assertEqual('alternative for 45 char base is longBase-tr', altsForLong[0], `${longBase}-tr`);

// 4. In-memory single-tab serialization & deterministic fallback assertions
seedTenants([
  { id: 'tenant_1', name: 'Melis Güzellik', slug: 'melis-guzellik', status: 'active' },
  { id: 'tenant_2', name: 'Yeni Salon', slug: 'yeni-salon', status: 'active' },
  { id: 'tenant_3', name: 'Boş Salon', slug: 'bos-salon', status: 'active' },
]);

// 4A. Clean reservation for unowned valid slug
const resClean = await siteProvisioningService.reserveTenantSlug('tenant_3', 'temiz-salon');
assertEqual('reserve unowned slug succeeds', resClean, true);
const updatedTenant3 = await tenantService.getTenantById('tenant_3');
assertEqual('tenant_3 slug updated to temiz-salon', updatedTenant3?.slug, 'temiz-salon');

// 4B. Collision with tenant_1 ('melis-guzellik') falls back deterministically to 'melis-guzellik-studio'
const resCollision = await siteProvisioningService.reserveTenantSlug('tenant_2', 'melis-guzellik');
assertEqual('reserve colliding slug succeeds via fallback', resCollision, true);
const updatedTenant2 = await tenantService.getTenantById('tenant_2');
assertEqual('tenant_2 slug resolved to melis-guzellik-studio', updatedTenant2?.slug, 'melis-guzellik-studio');

// 4C. Reserved words must be rejected without suffix fallback
const resReserved = await siteProvisioningService.reserveTenantSlug('tenant_3', 'admin');
assertEqual('reserveTenantSlug rejects reserved word admin', resReserved, false);
const tenant3AfterReserved = await tenantService.getTenantById('tenant_3');
assertEqual('tenant_3 slug unchanged after reserved rejection', tenant3AfterReserved?.slug, 'temiz-salon');

// 4D. Concurrent reservation calls are serialized by client lock
seedTenants([
  { id: 'tenant_alpha', name: 'Alpha', slug: 'alpha-initial', status: 'active' },
  { id: 'tenant_beta', name: 'Beta', slug: 'beta-initial', status: 'active' },
]);
const p1 = siteProvisioningService.reserveTenantSlug('tenant_alpha', 'ortak-hedef');
const p2 = siteProvisioningService.reserveTenantSlug('tenant_beta', 'ortak-hedef');
const [r1, r2] = await Promise.all([p1, p2]);
assertEqual('concurrent p1 succeeds', r1, true);
assertEqual('concurrent p2 succeeds', r2, true);
const tAlpha = await tenantService.getTenantById('tenant_alpha');
const tBeta = await tenantService.getTenantById('tenant_beta');
assertEqual('serialized winner receives primary slug ortak-hedef', tAlpha?.slug, 'ortak-hedef');
assertEqual('serialized runner-up receives deterministic fallback ortak-hedef-studio', tBeta?.slug, 'ortak-hedef-studio');

// 5. HashRouter / path slug parser regression assertions
const parseUrlSlug = (hash, path) => {
  let urlSlug = '';
  if (hash) {
    const parts = hash.split('/');
    if (parts.length >= 3 && parts[1] === 'booking') {
      urlSlug = parts[2].split('?')[0];
    } else if (parts.length >= 2 && parts[1] && parts[1] !== 'book' && parts[1] !== 'admin' && parts[1] !== 'super-admin' && parts[1] !== 'login' && parts[1] !== 'features' && parts[1] !== 'pricing' && parts[1] !== 'mobile-app' && parts[1] !== 'register' && parts[1] !== 'contact' && parts[1] !== 'pilot' && parts[1] !== 'privacy' && parts[1] !== 'terms' && parts[1] !== 'support' && parts[1] !== 'demo' && parts[1] !== 'customer') {
      urlSlug = parts[1].split('?')[0];
    }
  }
  if (!urlSlug && path && path !== '/') {
    const parts = path.split('/');
    if (parts.length >= 3 && parts[1] === 'booking') {
      urlSlug = parts[2];
    } else if (parts.length >= 2 && parts[1] && parts[1] !== 'book' && parts[1] !== 'admin' && parts[1] !== 'super-admin' && parts[1] !== 'login' && parts[1] !== 'features' && parts[1] !== 'pricing' && parts[1] !== 'mobile-app' && parts[1] !== 'register' && parts[1] !== 'contact' && parts[1] !== 'pilot' && parts[1] !== 'privacy' && parts[1] !== 'terms' && ObligatoryExclusion(parts[1])) {
      urlSlug = parts[1];
    }
  }
  return urlSlug;
};

function ObligatoryExclusion(val) {
  return val !== 'support' && val !== 'demo' && val !== 'customer';
}

assertEqual('hash booking/slug', parseUrlSlug('#/booking/melis-guzellik', ''), 'melis-guzellik');
assertEqual('hash slug directly', parseUrlSlug('#/melis-guzellik', ''), 'melis-guzellik');
assertEqual('path booking/slug', parseUrlSlug('', '/booking/melis-guzellik'), 'melis-guzellik');
assertEqual('path slug directly', parseUrlSlug('', '/melis-guzellik'), 'melis-guzellik');
assertEqual('malformed hash', parseUrlSlug('#/login', ''), '');
assertEqual('empty slug', parseUrlSlug('', ''), '');

// 6. Proposed least-privilege PostgreSQL atomic RPC file existence & assertion
const proposalSqlPath = path.resolve(__dirname, '../supabase/proposals/20261030_proposed_reserve_tenant_slug_atomic_rpc.sql');
assertEqual('proposal SQL file exists', fs.existsSync(proposalSqlPath), true);
const proposalSql = fs.readFileSync(proposalSqlPath, 'utf8');
assertEqual('proposal defines reserve_tenant_slug', proposalSql.includes('CREATE OR REPLACE FUNCTION public.reserve_tenant_slug'), true);
assertEqual('proposal specifies SECURITY DEFINER', proposalSql.includes('SECURITY DEFINER'), true);
assertEqual('proposal pins search_path', proposalSql.includes('SET search_path = public, pg_temp'), true);
assertEqual('proposal catches unique_violation', proposalSql.includes('WHEN unique_violation THEN'), true);
assertEqual('proposal checks tenants_slug_key', proposalSql.includes('tenants_slug_key'), true);
assertEqual('proposal revokes anon execution', proposalSql.includes('REVOKE ALL ON FUNCTION public.reserve_tenant_slug(uuid, text) FROM anon;'), true);

// 7. Atomic RPC mock client test
const simulatedDbTenants = new Map([
  ['uuid-tenant-1', { id: 'uuid-tenant-1', slug: 'melis-guzellik', ownerId: 'user-1' }],
  ['uuid-tenant-2', { id: 'uuid-tenant-2', slug: 'initial-2', ownerId: 'user-2' }],
]);
let currentCallerId = 'user-2';
let rpcCallCount = 0;

const mockRpcClient = {
  async rpc(fnName, args) {
    rpcCallCount++;
    if (fnName !== 'reserve_tenant_slug') {
      return { data: null, error: { code: 'PGRST202', message: 'Function not found' } };
    }
    const tId = args.p_tenant_id;
    const desired = String(args.p_desired_slug || '').trim().toLowerCase();
    const tenantRow = simulatedDbTenants.get(tId);
    if (!tenantRow) {
      return { data: { reserved: false, slug: desired, reason: 'TENANT_NOT_FOUND', collision_resolved: false }, error: null };
    }
    if (tenantRow.ownerId !== currentCallerId) {
      return { data: { reserved: false, slug: '', reason: 'FORBIDDEN_NOT_TENANT_OWNER', collision_resolved: false }, error: null };
    }
    const isSlugTakenByOther = (cand) => {
      for (const [id, row] of simulatedDbTenants.entries()) {
        if (id !== tId && row.slug === cand) return true;
      }
      return false;
    };
    if (!isSlugTakenByOther(desired)) {
      tenantRow.slug = desired;
      return { data: { reserved: true, slug: desired, reason: 'VALID', collision_resolved: false }, error: null };
    }
    for (const suffix of ['studio', 'guzellik', 'salon', 'tr']) {
      const candidate = `${desired}-${suffix}`;
      if (candidate.length <= 50 && isValidSlug(candidate) && !isSlugTakenByOther(candidate)) {
        tenantRow.slug = candidate;
        return { data: { reserved: true, slug: candidate, reason: 'VALID', collision_resolved: true }, error: null };
      }
    }
    return { data: { reserved: false, slug: desired, reason: 'SLUG_TAKEN', collision_resolved: false }, error: null };
  },
};

// Reserved & malformed slugs rejected before RPC invocation
const rpcReserved = await siteProvisioningService.reserveTenantSlugAtomicRpc('uuid-tenant-2', 'admin', mockRpcClient);
assertEqual('atomic RPC rejects reserved word without fallback', rpcReserved.reserved, false);
assertEqual('atomic RPC reserved reason is RESERVED', rpcReserved.reason, SLUG_VALIDATION_REASONS.RESERVED);
assertEqual('atomic RPC not called for client-rejected reserved word', rpcCallCount, 0);

// Collision with uuid-tenant-1 ('melis-guzellik') atomically resolves to 'melis-guzellik-studio'
const rpcCollision = await siteProvisioningService.reserveTenantSlugAtomicRpc('uuid-tenant-2', 'melis-guzellik', mockRpcClient);
assertEqual('atomic RPC collision resolves to true', rpcCollision.reserved, true);
assertEqual('atomic RPC collision assigns melis-guzellik-studio', rpcCollision.slug, 'melis-guzellik-studio');
assertEqual('atomic RPC collision marks collisionResolved=true', rpcCollision.collisionResolved, true);
assertEqual('atomic RPC persists melis-guzellik-studio in DB row', simulatedDbTenants.get('uuid-tenant-2')?.slug, 'melis-guzellik-studio');

// Unauthorized caller (non-owner) rejected by RPC
currentCallerId = 'intruder-user-999';
const rpcForbidden = await siteProvisioningService.reserveTenantSlugAtomicRpc('uuid-tenant-2', 'yeni-salon', mockRpcClient);
assertEqual('atomic RPC rejects non-owner caller', rpcForbidden.reserved, false);
assertEqual('atomic RPC returns FORBIDDEN_NOT_TENANT_OWNER', rpcForbidden.reason, 'FORBIDDEN_NOT_TENANT_OWNER');

// 8. Rollback failure surfaces SLUG_RESERVATION_STATE_DIVERGENCE
seedTenants([
  { id: 'tenant_3', name: 'Boş Salon', slug: 'bos-salon', status: 'active' },
]);
const origUpdateForDivergence = tenantService.updateTenant.bind(tenantService);
let stateDivergenceThrown = false;
try {
  let updateCalls = 0;
  tenantService.updateTenant = async (tId, data) => {
    updateCalls++;
    if (updateCalls === 1) {
      await origUpdateForDivergence(tId, data);
      const arr = JSON.parse(localStorageMock.getItem('lari_registered_tenants') || '[]');
      arr.unshift({ id: 'tenant_diverge_comp', name: 'Comp', slug: 'diverge-target-slug', status: 'active' });
      localStorageMock.setItem('lari_registered_tenants', JSON.stringify(arr));
      return;
    }
    throw new Error('Database connection reset during rollback');
  };

  await siteProvisioningService.reserveTenantSlug('tenant_3', 'diverge-target-slug');
} catch (err) {
  if (err && String(err.message).includes('SLUG_RESERVATION_STATE_DIVERGENCE')) {
    stateDivergenceThrown = true;
  }
} finally {
  tenantService.updateTenant = origUpdateForDivergence;
}
assertEqual('rollback failure surfaces SLUG_RESERVATION_STATE_DIVERGENCE', stateDivergenceThrown, true);

// 9. Supabase Mode Exclusivity Verification & Direct-Update / Rollback Prohibition Proof (Bulgu #1 [P1_CONTRACT])
const targetSupabaseSlug = 'akdeniz-vip-salon';
const supabaseTenantId = 'uuid-supabase-tenant-1';

// Switch environment to Supabase mode
globalThis.__mockImportMetaEnv = {
  VITE_DATA_MODE: 'supabase_staging',
  VITE_SUPABASE_URL: 'https://mock.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'mock-anon-key',
};
process.env.VITE_DATA_MODE = 'supabase_staging';
process.env.VITE_SUPABASE_URL = 'https://mock.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key';

// Authoritative DB state simulation for Supabase
const simulatedSupabaseDb = new Map([
  [
    supabaseTenantId,
    {
      id: supabaseTenantId,
      slug: 'eski-salon-slug',
      name: 'Akdeniz VIP Salon',
      status: 'active',
      ownerEmail: 'owner@akdeniz.local',
    },
  ],
]);

// Configure mock Supabase client for reserveTenantSlugAtomicRpc & queries
globalThis.__mockSupabaseClient = {
  async rpc(fnName, args) {
    if (fnName === 'reserve_tenant_slug') {
      const tId = args.p_tenant_id;
      const desired = String(args.p_desired_slug || '').trim().toLowerCase();
      const row = simulatedSupabaseDb.get(tId);
      if (row) {
        row.slug = desired;
      }
      return {
        data: {
          reserved: true,
          slug: desired,
          reason: 'VALID',
          collision_resolved: false,
        },
        error: null,
      };
    }
    return { data: null, error: { code: 'PGRST202', message: 'Function not found' } };
  },
  from(tableName) {
    return {
      select() {
        return {
          eq(col, val) {
            return {
              async single() {
                if (tableName === 'tenants' && col === 'slug') {
                  for (const t of simulatedSupabaseDb.values()) {
                    if (t.slug === val) return { data: t, error: null };
                  }
                }
                return { data: null, error: { code: 'PGRST116', message: 'Not found' } };
              },
              async maybeSingle() {
                if (tableName === 'tenants' && col === 'slug') {
                  for (const t of simulatedSupabaseDb.values()) {
                    if (t.slug === val) return { data: t, error: null };
                  }
                }
                return { data: null, error: null };
              },
            };
          },
        };
      },
    };
  },
};

// Seed localStorage with conflicting stale mock records that would falsely trigger failure in mock mode
localStorageMock.setItem(
  'lari_registered_tenants',
  JSON.stringify([
    {
      id: 'stale-conflicting-mock-tenant-999',
      name: 'Eski Çakışan Salon',
      slug: targetSupabaseSlug,
      status: 'active',
    },
  ])
);

// Intercept tenantService to provide authoritative DB reads and catch prohibited direct updates / rollbacks
const origGetTenantById = tenantService.getTenantById.bind(tenantService);
const origGetTenantBySlug = tenantService.getTenantBySlug.bind(tenantService);
const origUpdateTenantForSupabase = tenantService.updateTenant.bind(tenantService);

let prohibitedDirectUpdateOrRollbackCalled = false;
tenantService.updateTenant = async () => {
  prohibitedDirectUpdateOrRollbackCalled = true;
  throw new Error('PROHIBITED_DIRECT_UPDATE: Direct update or rollback must never be invoked in Supabase mode');
};

tenantService.getTenantById = async (id) => {
  if (simulatedSupabaseDb.has(id)) {
    return simulatedSupabaseDb.get(id);
  }
  return origGetTenantById(id);
};

tenantService.getTenantBySlug = async (slug) => {
  for (const t of simulatedSupabaseDb.values()) {
    if (t.slug === slug) return t;
  }
  return null;
};

let supabaseReservationResult = false;
let supabaseModeThrewDivergence = false;

try {
  supabaseReservationResult = await siteProvisioningService.reserveTenantSlug(supabaseTenantId, targetSupabaseSlug);
} catch (err) {
  if (err && String(err.message).includes('SLUG_RESERVATION_STATE_DIVERGENCE')) {
    supabaseModeThrewDivergence = true;
  }
} finally {
  // Restore tenantService mocks and environment
  tenantService.getTenantById = origGetTenantById;
  tenantService.getTenantBySlug = origGetTenantBySlug;
  tenantService.updateTenant = origUpdateTenantForSupabase;
  globalThis.__mockImportMetaEnv = { VITE_DATA_MODE: 'mock' };
  process.env.VITE_DATA_MODE = 'mock';
  localStorageMock.clear();
}

assertEqual('Supabase mode reservation returns true despite conflicting localStorage mock', supabaseReservationResult, true);
assertEqual('Supabase mode does not invoke direct update or rollback', prohibitedDirectUpdateOrRollbackCalled, false);
assertEqual('Supabase mode does not throw SLUG_RESERVATION_STATE_DIVERGENCE', supabaseModeThrewDivergence, false);
assertEqual('Supabase mode persists target slug in authoritative DB', simulatedSupabaseDb.get(supabaseTenantId)?.slug, targetSupabaseSlug);

// 9B. Negative verification: post-write exclusivity DB failure in Supabase mode
// verifies that direct-update rollback is never invoked and no divergence error is thrown
globalThis.__mockImportMetaEnv = {
  VITE_DATA_MODE: 'supabase_staging',
  VITE_SUPABASE_URL: 'https://mock.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'mock-anon-key',
};
process.env.VITE_DATA_MODE = 'supabase_staging';
process.env.VITE_SUPABASE_URL = 'https://mock.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key';

let prohibitedRollbackCalledOnMismatch = false;
tenantService.updateTenant = async () => {
  prohibitedRollbackCalledOnMismatch = true;
  throw new Error('PROHIBITED_DIRECT_UPDATE: Direct update or rollback must never be invoked in Supabase mode');
};

// RPC succeeds, but post-write DB read returns wrong slug (integrity mismatch)
tenantService.getTenantById = async (id) => ({
  id,
  slug: 'unmatched-db-slug',
  name: 'Mismatch Salon',
  status: 'active',
});
tenantService.getTenantBySlug = async () => null;

let mismatchReservationResult = true;
let mismatchThrewDivergence = false;
try {
  mismatchReservationResult = await siteProvisioningService.reserveTenantSlug(supabaseTenantId, 'mismatch-target-slug');
} catch (err) {
  if (err && String(err.message).includes('SLUG_RESERVATION_STATE_DIVERGENCE')) {
    mismatchThrewDivergence = true;
  }
} finally {
  tenantService.getTenantById = origGetTenantById;
  tenantService.getTenantBySlug = origGetTenantBySlug;
  tenantService.updateTenant = origUpdateTenantForSupabase;
  globalThis.__mockImportMetaEnv = { VITE_DATA_MODE: 'mock' };
  process.env.VITE_DATA_MODE = 'mock';
  localStorageMock.clear();
}

assertEqual('Supabase mode returns false when authoritative DB read fails exclusivity', mismatchReservationResult, false);
assertEqual('Supabase mode does not invoke prohibited rollback on exclusivity mismatch', prohibitedRollbackCalledOnMismatch, false);
assertEqual('Supabase mode does not throw divergence error on exclusivity mismatch', mismatchThrewDivergence, false);

if (failures > 0) {
  console.error('❌ Slug regression test suite failed with ' + failures + ' errors.');
  process.exit(1);
} else {
  console.log('🎉 All slug regression test cases passed successfully!');
  process.exit(0);
}
