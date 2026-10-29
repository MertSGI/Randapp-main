import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Register a lightweight synchronous TypeScript extension resolver so this suite
// runs directly under both `node scripts/test-slug-regression.mjs` (Node 22.15+/24)
// and `npx tsx scripts/test-slug-regression.mjs`.
if (typeof Module.registerHooks === 'function') {
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
          source: 'export const supabase = {};\nexport const supabaseProvider = {};\n',
        };
      }
      if (url.endsWith('.ts')) {
        const rawTs = fs.readFileSync(fileURLToPath(url), 'utf8');
        const typeExports = [];
        for (const m of rawTs.matchAll(/export\s+(?:interface|type)\s+([A-Za-z0-9_]+)/g)) {
          typeExports.push(`export const ${m[1]} = undefined;`);
        }
        const envPrelude = `if (typeof import.meta !== 'undefined' && !import.meta.env) { Object.defineProperty(import.meta, 'env', { value: { VITE_DATA_MODE: 'mock' }, configurable: true, writable: true }); }\n`;
        return {
          format: 'module-typescript',
          shortCircuit: true,
          source: `${envPrelude}${rawTs}\n${typeExports.join('\n')}\n`,
        };
      }
      return nextLoad(url, context);
    },
  });
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

const {
  SLUG_VALIDATION_REASONS,
  isValidSlug,
  validateSlugFormat,
  generateSlugFromName,
  getSlugAlternatives,
} = await import('../utils/slugUtils.ts');
const { publicLinkService } = await import('../services/publicLinkService.ts');
const { siteProvisioningService } = await import('../services/siteProvisioningService.ts');
const { tenantService } = await import('../services/tenantService.ts');

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
assertEqual('reserved name in generateSlugFromName', generateSlugFromName('admin'), '');
assertEqual('empty slug rejection', isValidSlug(''), false);
assertEqual('too short slug', isValidSlug('ab'), false);
assertEqual('consecutive hyphens', isValidSlug('abc--def'), false);
assertEqual('50-char slug valid', isValidSlug('a'.repeat(50)), true);
assertEqual('51-char slug invalid', isValidSlug('a'.repeat(51)), false);

assertEqual('reason code RESERVED (lowercase)', validateSlugFormat('admin').reason, SLUG_VALIDATION_REASONS.RESERVED);
assertEqual('reason code RESERVED (uppercase)', validateSlugFormat('ADMIN').reason, SLUG_VALIDATION_REASONS.RESERVED);
assertEqual('reason code EMPTY_OR_SHORT', validateSlugFormat('ab').reason, SLUG_VALIDATION_REASONS.EMPTY_OR_SHORT);
assertEqual('reason code TOO_LONG', validateSlugFormat('a'.repeat(51)).reason, SLUG_VALIDATION_REASONS.TOO_LONG);
assertEqual('reason code INVALID_FORMAT (--)', validateSlugFormat('abc--def').reason, SLUG_VALIDATION_REASONS.INVALID_FORMAT);
assertEqual('reason code VALID', validateSlugFormat('melis-guzellik').reason, SLUG_VALIDATION_REASONS.VALID);

assertEqual('alternatives for reserved word is empty', getSlugAlternatives('admin').length, 0);
assertEqual('alternatives for 50-char base is empty', getSlugAlternatives('a'.repeat(50)).length, 0);
assertEqual('alternatives for valid base count', getSlugAlternatives('melis-guzellik').length, 4);
assertEqual('first alternative for valid base', getSlugAlternatives('melis-guzellik')[0], 'melis-guzellik-studio');

// 2. End-to-end siteProvisioningService.reserveTenantSlug mutation & negative policy tests
seedTenants([
  { id: 'tenant_1', name: 'Melis Güzellik', slug: 'old-slug-1', status: 'active' },
  { id: 'tenant_2', name: 'Başka Salon', slug: 'old-slug-2', status: 'active' },
  { id: 'tenant_3', name: 'Üçüncü Salon', slug: 'initial-valid-slug', status: 'active' },
  { id: 'tenant_50a', name: 'Elli Karakter A', slug: 'initial-50a', status: 'active' },
  { id: 'tenant_50b', name: 'Elli Karakter B', slug: 'initial-50b', status: 'active' },
]);

// Case A: Normal valid slug unchanged
const resNormal = await siteProvisioningService.reserveTenantSlug('tenant_1', 'melis-guzellik');
assertEqual('reserve normal valid slug result', resNormal, true);
assertEqual('reserve normal valid slug persisted', (await tenantService.getTenantById('tenant_1'))?.slug, 'melis-guzellik');

// Case B: Already-owned slug by same tenant stays unchanged (no suffix appended)
const resSameOwner = await siteProvisioningService.reserveTenantSlug('tenant_1', 'melis-guzellik');
assertEqual('reserve already-owned slug by same tenant result', resSameOwner, true);
assertEqual('reserve already-owned slug stays unchanged', (await tenantService.getTenantById('tenant_1'))?.slug, 'melis-guzellik');

// Case C: Actual collision with another tenant -> deterministic valid alternative ('melis-guzellik-studio')
const collisionCheck = await publicLinkService.validateSlug('melis-guzellik', 'tenant_2');
assertEqual('validateSlug collision reason is SLUG_TAKEN', collisionCheck.reason, SLUG_VALIDATION_REASONS.SLUG_TAKEN);
const resCollision = await siteProvisioningService.reserveTenantSlug('tenant_2', 'melis-guzellik');
assertEqual('reserve colliding slug resolves to alternative result', resCollision, true);
assertEqual('reserve colliding slug assigns melis-guzellik-studio to tenant_2', (await tenantService.getTenantById('tenant_2'))?.slug, 'melis-guzellik-studio');
assertEqual('reserve colliding slug preserves tenant_1 ownership', (await tenantService.getTenantById('tenant_1'))?.slug, 'melis-guzellik');

// Case D: Reserved words & uppercase variants -> rejected, NEVER remapped to admin-studio / lari-studio
for (const reservedInput of ['admin', 'ADMIN', 'lari', 'LARI', 'super-admin', 'randevulari', 'randapp', 'radapp', 'book', 'booking']) {
  const resReserved = await siteProvisioningService.reserveTenantSlug('tenant_3', reservedInput);
  assertEqual(`reserve reserved word "${reservedInput}" rejected`, resReserved, false);
  assertEqual(`tenant_3 slug unchanged after reserved "${reservedInput}"`, (await tenantService.getTenantById('tenant_3'))?.slug, 'initial-valid-slug');
  assertEqual(`"${reservedInput.toLowerCase()}-studio" never allocated`, await tenantService.getTenantBySlug(`${reservedInput.toLowerCase()}-studio`), null);
}

// Case E: Empty / too-short / malformed / consecutive hyphens -> rejected
for (const malformedInput of ['', '   ', 'a', 'ab', 'abc--def', '-abc', 'abc-', 'abc$def', '---']) {
  const resMalformed = await siteProvisioningService.reserveTenantSlug('tenant_3', malformedInput);
  assertEqual(`reserve malformed "${malformedInput}" rejected`, resMalformed, false);
  assertEqual(`tenant_3 slug unchanged after malformed "${malformedInput}"`, (await tenantService.getTenantById('tenant_3'))?.slug, 'initial-valid-slug');
}

// Case F: 50-character base where suffix exceeds 50 -> valid when free, rejected on collision
const slug50 = 'a'.repeat(50);
const res50Free = await siteProvisioningService.reserveTenantSlug('tenant_50a', slug50);
assertEqual('reserve 50-char free slug succeeds', res50Free, true);
assertEqual('tenant_50a holds 50-char slug', (await tenantService.getTenantById('tenant_50a'))?.slug, slug50);

const res50Collision = await siteProvisioningService.reserveTenantSlug('tenant_50b', slug50);
assertEqual('reserve 50-char colliding slug rejected (suffixes > 50)', res50Collision, false);
assertEqual('tenant_50b slug unchanged after 50-char collision', (await tenantService.getTenantById('tenant_50b'))?.slug, 'initial-50b');

// Case G: Overlong >50 character input -> rejected
const slug51 = 'b'.repeat(51);
const res51 = await siteProvisioningService.reserveTenantSlug('tenant_3', slug51);
assertEqual('reserve 51-char overlong slug rejected', res51, false);
assertEqual('tenant_3 slug unchanged after 51-char input', (await tenantService.getTenantById('tenant_3'))?.slug, 'initial-valid-slug');

// Case H: Missing tenant or non-existent tenant -> rejected without side effects
assertEqual('reserve with empty tenantId rejected', await siteProvisioningService.reserveTenantSlug('', 'valid-free-slug'), false);
assertEqual('reserve with whitespace tenantId rejected', await siteProvisioningService.reserveTenantSlug('   ', 'valid-free-slug'), false);
assertEqual('reserve with unknown tenantId rejected', await siteProvisioningService.reserveTenantSlug('tenant_unknown_999', 'valid-free-slug'), false);
assertEqual('unknown tenant did not claim valid-free-slug', await tenantService.getTenantBySlug('valid-free-slug'), null);

// Case I: Cross-tenant collision when base and all 4 alternatives are already taken -> rejected
const currentTenants = JSON.parse(localStorageMock.getItem('lari_registered_tenants') || '[]');
currentTenants.push(
  { id: 't_occ_0', name: 'Occ 0', slug: 'dolu-salon', status: 'active' },
  { id: 't_occ_1', name: 'Occ 1', slug: 'dolu-salon-studio', status: 'active' },
  { id: 't_occ_2', name: 'Occ 2', slug: 'dolu-salon-guzellik', status: 'active' },
  { id: 't_occ_3', name: 'Occ 3', slug: 'dolu-salon-salon', status: 'active' },
  { id: 't_occ_4', name: 'Occ 4', slug: 'dolu-salon-tr', status: 'active' },
);
localStorageMock.setItem('lari_registered_tenants', JSON.stringify(currentTenants));
const resAllTaken = await siteProvisioningService.reserveTenantSlug('tenant_3', 'dolu-salon');
assertEqual('reserve when base and all alternatives are occupied rejected', resAllTaken, false);
assertEqual('tenant_3 slug unchanged when all alternatives occupied', (await tenantService.getTenantById('tenant_3'))?.slug, 'initial-valid-slug');

// Case J: Concurrent duplicate race during updateTenant -> rejected and rolled back
const origUpdateTenant = tenantService.updateTenant.bind(tenantService);
let simulatedRaceTriggered = false;
tenantService.updateTenant = async (tId, updates) => {
  await origUpdateTenant(tId, updates);
  if (!simulatedRaceTriggered && tId === 'tenant_3' && updates.slug === 'race-target-slug') {
    simulatedRaceTriggered = true;
    // Simulate a competing tenant claiming the same slug first in storage
    const arr = JSON.parse(localStorageMock.getItem('lari_registered_tenants') || '[]');
    arr.unshift({ id: 'tenant_competitor', name: 'Competitor', slug: 'race-target-slug', status: 'active' });
    localStorageMock.setItem('lari_registered_tenants', JSON.stringify(arr));
  }
};
const resRace = await siteProvisioningService.reserveTenantSlug('tenant_3', 'race-target-slug');
tenantService.updateTenant = origUpdateTenant;
assertEqual('concurrent duplicate race rejected', resRace, false);
assertEqual('tenant_3 slug rolled back to initial-valid-slug after race', (await tenantService.getTenantById('tenant_3'))?.slug, 'initial-valid-slug');

// Case K: Unexpected lookup error -> reason UNKNOWN_ERROR, rejected without fallback
const origGetTenantBySlug = tenantService.getTenantBySlug.bind(tenantService);
tenantService.getTenantBySlug = async () => {
  throw new Error('simulated storage outage');
};
const errVal = await publicLinkService.validateSlug('melis-guzellik', 'tenant_3');
assertEqual('unexpected lookup error returns UNKNOWN_ERROR reason', errVal.reason, SLUG_VALIDATION_REASONS.UNKNOWN_ERROR);
const resLookupErr = await siteProvisioningService.reserveTenantSlug('tenant_3', 'melis-guzellik');
tenantService.getTenantBySlug = origGetTenantBySlug;
assertEqual('reserve under lookup error rejected without fallback', resLookupErr, false);
assertEqual('tenant_3 slug unchanged after lookup error', (await tenantService.getTenantById('tenant_3'))?.slug, 'initial-valid-slug');

// 3. HashRouter / path slug parser regression assertions
const parseUrlSlug = (hash, pathStr) => {
  let urlSlug = '';
  if (hash) {
    const parts = hash.split('/');
    if (parts.length >= 3 && parts[1] === 'booking') {
      urlSlug = parts[2].split('?')[0];
    } else if (parts.length >= 2 && parts[1] && parts[1] !== 'book' && parts[1] !== 'admin' && parts[1] !== 'super-admin' && parts[1] !== 'login' && parts[1] !== 'features' && parts[1] !== 'pricing' && parts[1] !== 'mobile-app' && parts[1] !== 'register' && parts[1] !== 'contact' && parts[1] !== 'pilot' && parts[1] !== 'privacy' && parts[1] !== 'terms' && parts[1] !== 'support' && parts[1] !== 'demo' && parts[1] !== 'customer') {
      urlSlug = parts[1].split('?')[0];
    }
  }
  if (!urlSlug && pathStr && pathStr !== '/') {
    const parts = pathStr.split('/');
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

if (failures > 0) {
  console.error('❌ Slug regression test suite failed with ' + failures + ' errors.');
  process.exit(1);
} else {
  console.log('🎉 All slug regression test cases passed successfully!');
  process.exit(0);
}
