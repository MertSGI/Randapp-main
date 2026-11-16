import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import * as esbuild from 'esbuild';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${label}`);
    failed++;
  }
}

function installMemoryLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(String(k), String(v));
    },
    removeItem(k) {
      store.delete(String(k));
    },
    clear() {
      store.clear();
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    }
  };
  return store;
}

console.log('=== Stage H1A + Faz B3 — Commercial Legacy Compatibility QA ===\n');

const migrationPath = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260810_h1a_commercial_catalog_and_read_contracts.sql'
);
const sqlContent = fs.readFileSync(migrationPath, 'utf8');

// 1. Check legacy standart plan registration
assert(
  sqlContent.includes("'standart', 'Standart (Miras)'") &&
    sqlContent.includes(
      "('standart', 'Standart (Miras)', 'Eski Standart paket aboneleri için korunan miras plan snapshot', false, true, false, true, 99)"
    ),
  'Legacy standart plan correctly seeded as non-public, non-assignable, legacy=true'
);

// 2. Check public catalog RPC filters out legacy plans
assert(
  sqlContent.includes('p.is_legacy = false') &&
    sqlContent.includes('p.is_public = true') &&
    sqlContent.includes('p.is_assignable = true'),
  'get_public_commercial_plan_catalog RPC excludes legacy and non-public plans'
);

// 3. Check existing subscription backfill update
assert(
  sqlContent.includes('UPDATE public.subscriptions s') &&
    sqlContent.includes('SET plan_version_id = pv.id') &&
    sqlContent.includes('WHERE s.plan_version_id IS NULL'),
  'Subscriptions plan_version_id backfill logic verified'
);

// 4. Runtime TS compatibility checks via esbuild bundle
installMemoryLocalStorage();
globalThis.__LARI_LEGACY_TEST_STATE__ = {
  dataMode: 'supabase',
  rpcCalls: [],
  rpcHandler: async () => ({ data: [], error: null })
};

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lari-adim029-legacy-'));
const tempBundlePath = path.join(tempDir, 'bundle.mjs');
const prevViteDataMode = process.env.VITE_DATA_MODE;

try {
  const virtualEntry = `
    export * from ${JSON.stringify(path.join(process.cwd(), 'services', 'commercialCatalogService.ts'))};
    export * from ${JSON.stringify(path.join(process.cwd(), 'services', 'manualProvisioningService.ts'))};
    export * from ${JSON.stringify(path.join(process.cwd(), 'services', 'subscriptionLifecycleService.ts'))};
    export * from ${JSON.stringify(path.join(process.cwd(), 'services', 'planService.ts'))};
    export * from ${JSON.stringify(path.join(process.cwd(), 'services', 'entitlementService.ts'))};
  `;

  const mockPlugin = {
    name: 'mock-supabase-and-mode',
    setup(build) {
      build.onResolve({ filter: /^\.\/supabaseClient(?:\.ts)?$/ }, () => ({
        path: 'mock-supabase-client',
        namespace: 'lari-legacy-mock'
      }));
      build.onResolve({ filter: /^\.\/dataSourceConfig(?:\.ts)?$/ }, () => ({
        path: 'mock-data-source-config',
        namespace: 'lari-legacy-mock'
      }));

      build.onLoad({ filter: /^mock-supabase-client$/, namespace: 'lari-legacy-mock' }, () => ({
        contents: `
          export const supabase = {
            rpc: async (name, args) => {
              globalThis.__LARI_LEGACY_TEST_STATE__.rpcCalls.push({ name, args });
              return globalThis.__LARI_LEGACY_TEST_STATE__.rpcHandler(name, args);
            }
          };
        `,
        loader: 'js'
      }));

      build.onLoad({ filter: /^mock-data-source-config$/, namespace: 'lari-legacy-mock' }, () => ({
        contents: `
          export function getDataSourceMode() {
            return globalThis.__LARI_LEGACY_TEST_STATE__.dataMode;
          }
          export const dataSourceConfig = {
            get mode() {
              return globalThis.__LARI_LEGACY_TEST_STATE__.dataMode;
            }
          };
        `,
        loader: 'js'
      }));
    }
  };

  const result = await esbuild.build({
    stdin: {
      contents: virtualEntry,
      resolveDir: process.cwd(),
      loader: 'ts'
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins: [mockPlugin]
  });

  fs.writeFileSync(tempBundlePath, result.outputFiles[0].text, 'utf8');
  const mod = await import(pathToFileURL(tempBundlePath).href);

  // 4a. Legacy 'standart' plan resolution & downgrade continuity
  const standartPlan = mod.planService.getPlan('standart');
  const standartEntitlements = mod.entitlementService.getPlanEntitlements('standart');
  assert(
    standartPlan &&
      standartPlan.id === 'standart' &&
      standartEntitlements.limits.maxStaff === 3 &&
      standartEntitlements.limits.maxServices === 25,
    'Legacy "standart" plan and entitlements resolve for grandfathered tenants'
  );

  const downgradeCalc = mod.subscriptionLifecycleService.calculatePlanChange(
    {
      tenantId: 'tenant-legacy-std',
      planId: 'professional',
      status: 'active',
      cancelAtPeriodEnd: false
    },
    'standart',
    'period_end'
  );
  assert(
    downgradeCalc.success === true &&
      downgradeCalc.action === 'downgrade_scheduled' &&
      downgradeCalc.updatedSub?.scheduledPlanId === 'standart',
    'Subscription plan rank preserves legacy "standart" downgrade compatibility'
  );

  // 4b. Public catalog defense-in-depth excludes 'standart', is_legacy=true, is_assignable=false, and is_active=false
  globalThis.__LARI_LEGACY_TEST_STATE__.dataMode = 'supabase';
  globalThis.__LARI_LEGACY_TEST_STATE__.rpcHandler = async () => ({
    data: [
      { plan_id: 'p-legacy', plan_code: 'standart', display_name: 'Standart', is_legacy: false, sort_order: 1 },
      { plan_id: 'p-flagged', plan_code: 'pro_old', display_name: 'Old Pro', is_legacy: true, sort_order: 2 },
      { plan_id: 'p-nonassignable', plan_code: 'vip_hidden', display_name: 'VIP Hidden', is_legacy: false, is_assignable: false, sort_order: 3 },
      { plan_id: 'p-inactive', plan_code: 'old_beta', display_name: 'Old Beta', is_legacy: false, is_active: false, sort_order: 4 },
      { plan_id: 'p-pro', plan_code: 'professional', display_name: 'Professional', is_legacy: false, is_assignable: true, is_active: true, sort_order: 5 }
    ],
    error: null
  });
  const filteredPublicCatalog = await mod.commercialCatalogService.getPublicCatalog();
  assert(
    filteredPublicCatalog.length === 1 && filteredPublicCatalog[0].plan_code === 'professional',
    'commercialCatalogService.getPublicCatalog filters out legacy, non-assignable, and inactive plans'
  );

  // 4c. Manual-active paid_through_date & past_due grace checks
  const now = Date.now();
  const futureIso = new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString();
  const pastIso = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();

  assert(
    mod.isCommercialSubscriptionSnapshotEligible(
      {
        success: true,
        tenant_id: 'tenant-manual-valid',
        status: 'manual_active',
        current_period_end: futureIso,
        paid_through_date: futureIso
      },
      now
    ) === true,
    'manual_active snapshot with unexpired paid_through_date is eligible'
  );

  assert(
    mod.isCommercialSubscriptionSnapshotEligible(
      {
        success: true,
        tenant_id: 'tenant-manual-expired',
        status: 'manual_active',
        current_period_end: futureIso,
        paid_through_date: pastIso
      },
      now
    ) === false,
    'manual_active snapshot with expired paid_through_date fails closed'
  );

  assert(
    mod.isCommercialSubscriptionSnapshotEligible(
      {
        success: true,
        tenant_id: 'tenant-past-due-no-grace',
        status: 'past_due',
        current_period_end: futureIso
      },
      now
    ) === false &&
      mod.isPastDueWithinGraceWindow(
        {
          success: true,
          tenant_id: 'tenant-past-due-grace',
          status: 'past_due',
          current_period_end: pastIso,
          grace_until: futureIso
        },
        now
      ) === true &&
      mod.isLegacySubscriptionSnapshotEligible(
        {
          success: true,
          tenant_id: 'tenant-past-due-grace',
          status: 'past_due',
          current_period_end: pastIso,
          grace_until: futureIso
        },
        now
      ) === true &&
      mod.isLegacySubscriptionSnapshotEligible(
        {
          success: true,
          tenant_id: 'tenant-past-due-expired-grace',
          status: 'past_due',
          current_period_end: pastIso,
          grace_until: pastIso
        },
        now
      ) === false,
    'past_due stays fail-closed by default while explicit unexpired grace_until works via legacy/grace helper'
  );

  // 4d. Manual provisioning fails closed in supabase mode and preserves manual_active in mock mode
  process.env.VITE_DATA_MODE = 'supabase';
  const supaFail = await mod.manualProvisioningService.provisionTenant({
    businessName: 'Blocked Supabase Salon',
    ownerName: 'Owner',
    ownerEmail: 'owner@blocked.test',
    ownerPhone: '+905551110000',
    planId: 'professional',
    billingSource: 'offline_payment',
    subscriptionStatus: 'manual_active',
    publicSlug: 'blocked-supa-salon',
    publishStatus: true
  });
  assert(
    supaFail.success === false && /supabase/i.test(supaFail.error || ''),
    'manualProvisioningService.provisionTenant fails closed in supabase mode'
  );

  process.env.VITE_DATA_MODE = 'production';
  const prodFail = await mod.manualProvisioningService.provisionTenant({
    businessName: 'Blocked Prod Salon',
    ownerName: 'Owner',
    ownerEmail: 'owner@prod-blocked.test',
    ownerPhone: '+905551110001',
    planId: 'professional',
    billingSource: 'offline_payment',
    subscriptionStatus: 'manual_active',
    publicSlug: 'blocked-prod-salon',
    publishStatus: true
  });
  assert(
    prodFail.success === false && /production/i.test(prodFail.error || ''),
    'manualProvisioningService.provisionTenant fails closed in non-simulation production mode'
  );

  process.env.VITE_DATA_MODE = 'mock';
  const manualOk = await mod.manualProvisioningService.provisionTenant({
    businessName: 'Miras Manuel Salon',
    ownerName: 'Ayse Demir',
    ownerEmail: 'ayse@miras.test',
    ownerPhone: '+905551112233',
    planId: 'standart',
    billingSource: 'offline_payment',
    subscriptionStatus: 'manual_active',
    paidThroughDate: futureIso,
    manualActivationReason: 'legacy_bank_transfer_v1a',
    paymentReferenceNote: 'EFT-2026-001',
    publicSlug: 'miras-manuel-salon',
    publishStatus: true
  });
  const storedManualSub = manualOk.tenantId
    ? JSON.parse(globalThis.localStorage.getItem(`mock_subscription_${manualOk.tenantId}`) || 'null')
    : null;
  assert(
    manualOk.success === true &&
      Boolean(manualOk.tenantId) &&
      storedManualSub?.status === 'manual_active' &&
      storedManualSub?.planId === 'standart' &&
      storedManualSub?.paidThroughDate === futureIso &&
      storedManualSub?.manualActivationReason === 'legacy_bank_transfer_v1a' &&
      storedManualSub?.paymentReferenceNote === 'EFT-2026-001',
    'manualProvisioningService preserves manual_active status, legacy planId, paidThroughDate, and manual audit fields in mock mode'
  );
} finally {
  if (prevViteDataMode === undefined) {
    delete process.env.VITE_DATA_MODE;
  } else {
    process.env.VITE_DATA_MODE = prevViteDataMode;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('\n══════════════════════════════════════════════════════════');
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) {
  process.exit(1);
}
console.log('✅ Stage H1A + Faz B3 Commercial Legacy Compatibility QA PASSED.\n');
