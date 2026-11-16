import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import esbuild from 'esbuild';

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✅ PASS: ${message}`);
  }
}

console.log('=== Stage H1C — Commercial Eligibility & Quota Enforcement QA ===\n');

const migDir = path.join(process.cwd(), 'supabase', 'migrations');
const h1cPath = path.join(migDir, '20260813_h1c_commercial_eligibility_and_quota_enforcement.sql');
assert(fs.existsSync(h1cPath), 'Migration 38 file 20260813_h1c_commercial_eligibility_and_quota_enforcement.sql exists');

const sql = fs.readFileSync(h1cPath, 'utf8');

// Read all H1B files for regression
const h1bFiles = ['20260811_h1b_super_admin_commercial_mutations.sql', '20260812_h1b_apply_due_scheduled_plan_change_rpc.sql'];
let h1bSql = '';
for (const f of h1bFiles) {
  h1bSql += fs.readFileSync(path.join(migDir, f), 'utf8') + '\n';
}

// 1. Canonical staging bootstrap
assert(sql.includes("'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa'"), 'Canonical tenant UUID referenced in bootstrap');
assert(sql.includes("'baslangic'") && sql.includes("'active'") && sql.includes("'manual'"), 'Bootstrap assigns baslangic/active/manual');
assert(sql.includes("H1C staging commercial enforcement bootstrap"), 'Bootstrap event reason recorded');

// 2. Internal helpers
assert(sql.includes('CREATE OR REPLACE FUNCTION public.resolve_tenant_commercial_eligibility'), 'resolve_tenant_commercial_eligibility declared');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.assert_tenant_commercial_action_allowed'), 'assert_tenant_commercial_action_allowed declared');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.resolve_commercial_quota'), 'resolve_commercial_quota declared');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.resolve_quota_period_key'), 'resolve_quota_period_key declared');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.consume_commercial_usage'), 'consume_commercial_usage declared');

// 3. Internal helpers are NOT browser-callable
const internalFns = [
  'resolve_tenant_commercial_eligibility',
  'assert_tenant_commercial_action_allowed',
  'resolve_commercial_quota',
  'resolve_quota_period_key',
  'consume_commercial_usage'
];
for (const fn of internalFns) {
  assert(sql.includes(`REVOKE EXECUTE ON FUNCTION public.${fn}`), `EXECUTE revoked from browser roles for ${fn}`);
}

// 4. Quota enforcement triggers
assert(sql.includes('CREATE OR REPLACE FUNCTION public.enforce_staff_quota'), 'enforce_staff_quota trigger function declared');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.enforce_service_quota'), 'enforce_service_quota trigger function declared');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.enforce_branch_quota'), 'enforce_branch_quota trigger function declared');
assert(sql.includes('trg_enforce_staff_quota'), 'Staff quota trigger installed');
assert(sql.includes('trg_enforce_service_quota'), 'Service quota trigger installed');
assert(sql.includes('trg_enforce_branch_quota'), 'Branch quota trigger installed');

// 5. SECURITY DEFINER and search_path
assert(sql.includes('SECURITY DEFINER'), 'SECURITY DEFINER used');
assert(sql.includes('SET search_path = pg_catalog, public'), 'search_path hardening present');

// 6. Reason codes
const reasonCodes = [
  'commercial_subscription_missing',
  'commercial_plan_version_missing',
  'commercial_plan_version_not_effective',
  'commercial_status_not_eligible',
  'commercial_trial_expired',
  'commercial_grace_expired',
  'commercial_feature_disabled',
  'commercial_quota_exceeded',
  'commercial_allowed',
  'commercial_tenant_not_found'
];
for (const rc of reasonCodes) {
  assert(sql.includes(rc), `Reason code ${rc} defined`);
}

// 7. Updated public booking RPCs
assert(sql.includes('CREATE OR REPLACE FUNCTION public.can_accept_public_booking'), 'can_accept_public_booking updated');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.create_public_booking'), 'create_public_booking updated');
assert(sql.includes('resolve_tenant_commercial_eligibility(v_tenant_id)'), 'create_public_booking uses commercial eligibility');
assert(sql.includes("assert_tenant_commercial_action_allowed(v_tenant_id, 'core_booking')"), 'create_public_booking checks core_booking');
assert(sql.includes("consume_commercial_usage(v_tenant_id, 'max_monthly_appointments'"), 'create_public_booking enforces monthly quota');

// 8. Cancellation feature gate
assert(sql.includes('CREATE OR REPLACE FUNCTION public.cancel_public_appointment_by_manage_token'), 'cancel_public_appointment updated');
assert(sql.includes("'customer_cancellation'"), 'Cancellation feature gate checks customer_cancellation');
assert(sql.includes("'feature_unavailable'"), 'Feature unavailable reason code used');

// 9. Diagnostic RPCs
assert(sql.includes('CREATE OR REPLACE FUNCTION public.get_my_commercial_enforcement_snapshot'), 'Self-service enforcement snapshot declared');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.super_admin_get_tenant_commercial_enforcement_snapshot'), 'Super Admin enforcement snapshot declared');

// 10. Concurrency controls
assert(sql.includes('pg_advisory_xact_lock'), 'Advisory transaction locks used for concurrency');
assert(sql.includes('FOR UPDATE'), 'FOR UPDATE row locking used');

// 11. Usage counters integration
assert(sql.includes('usage_counters'), 'usage_counters table integrated');

// 12. Timezone handling
assert(sql.includes("'Europe/Istanbul'"), 'Europe/Istanbul timezone fallback present');
assert(sql.includes('resolve_quota_period_key'), 'Period key resolution function referenced');

// 13. H1B regression - ensure H1B RPCs still exist in their migration files
const h1bRpcs = [
  'super_admin_assign_commercial_plan',
  'super_admin_change_subscription_status',
  'super_admin_schedule_plan_change',
  'super_admin_cancel_scheduled_plan_change',
  'super_admin_apply_due_scheduled_plan_change',
  'super_admin_record_billing_transaction',
  'super_admin_manage_tenant_entitlement_override'
];
for (const rpc of h1bRpcs) {
  assert(h1bSql.includes(`CREATE OR REPLACE FUNCTION public.${rpc}`), `H1B RPC ${rpc} remains in migration files`);
}

// ----------------------------------------------------------------------------
// 14. Runtime TypeScript Contract Enforcement (ADIM-028 Faz B2)
// ----------------------------------------------------------------------------
console.log('\n=== Phase B2 — Runtime Commercial, Entitlement, Adapter & Tax/Invoice Enforcement ===\n');

const mockStorage = new Map();
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (k) => (mockStorage.has(k) ? mockStorage.get(k) : null),
    setItem: (k, v) => mockStorage.set(k, String(v)),
    removeItem: (k) => mockStorage.delete(k),
    clear: () => mockStorage.clear(),
    key: (i) => Array.from(mockStorage.keys())[i] ?? null,
    get length() {
      return mockStorage.size;
    }
  };
}

globalThis.__LARI_MOCK_STATE__ = {
  dataMode: 'local',
  rpcCalls: [],
  rpcHandler: async () => ({ data: null, error: null })
};

const tempEntryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lari-adim028-'));
const tempBundlePath = path.join(tempEntryDir, 'bundle.mjs');

try {
  const virtualEntry = `
    export * from ${JSON.stringify(path.join(process.cwd(), 'services', 'commercialCatalogService.ts'))};
    export * from ${JSON.stringify(path.join(process.cwd(), 'services', 'entitlementService.ts'))};
    export * from ${JSON.stringify(path.join(process.cwd(), 'services', 'superAdminCommercialAdapter.ts'))};
    export * from ${JSON.stringify(path.join(process.cwd(), 'services', 'businessProfileService.ts'))};
  `;

  const mockPlugin = {
    name: 'mock-supabase-and-mode',
    setup(build) {
      build.onResolve({ filter: /^\.\/supabaseClient(?:\.ts)?$/ }, () => ({
        path: 'mock-supabase-client',
        namespace: 'lari-mock'
      }));
      build.onResolve({ filter: /^\.\/dataSourceConfig(?:\.ts)?$/ }, () => ({
        path: 'mock-data-source-config',
        namespace: 'lari-mock'
      }));
      build.onResolve({ filter: /^\.\/repositories(?:\.ts)?$/ }, () => ({
        path: 'mock-repositories',
        namespace: 'lari-mock'
      }));

      build.onLoad({ filter: /^mock-supabase-client$/, namespace: 'lari-mock' }, () => ({
        contents: `
          export const supabase = {
            rpc: async (name, args) => {
              globalThis.__LARI_MOCK_STATE__.rpcCalls.push({ name, args });
              return globalThis.__LARI_MOCK_STATE__.rpcHandler(name, args);
            }
          };
        `,
        loader: 'js'
      }));
      build.onLoad({ filter: /^mock-data-source-config$/, namespace: 'lari-mock' }, () => ({
        contents: `
          export function getDataSourceMode() {
            return globalThis.__LARI_MOCK_STATE__.dataMode;
          }
          export const getActiveDataSourceMode = getDataSourceMode;
        `,
        loader: 'js'
      }));
      build.onLoad({ filter: /^mock-repositories$/, namespace: 'lari-mock' }, () => ({
        contents: `
          export function getBusinessProfileRepository() {
            return {
              getBusinessProfile: async () => null,
              updateBusinessProfile: async () => null,
              getPublicBusinessProfile: async () => null,
              getPublicBusinessProfileBySlug: async () => null
            };
          }
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

  // A. commercialCatalogService & isCommercialSubscriptionSnapshotEligible
  globalThis.__LARI_MOCK_STATE__.dataMode = 'local';
  globalThis.__LARI_MOCK_STATE__.rpcCalls = [];
  assert(
    (await mod.commercialCatalogService.getMyCommercialSubscriptionSnapshot('tenant-1')) === null &&
      globalThis.__LARI_MOCK_STATE__.rpcCalls.length === 0,
    'commercialCatalogService fails closed in local mode without issuing RPC'
  );

  const nowMs = Date.UTC(2026, 10, 15, 12, 0, 0);
  const futureIso = new Date(nowMs + 86_400_000).toISOString();
  const pastIso = new Date(nowMs - 86_400_000).toISOString();

  assert(
    mod.isCommercialSubscriptionSnapshotEligible(
      { success: true, tenant_id: 'tenant-1', status: 'active', current_period_end: futureIso },
      nowMs
    ) === true,
    'Active subscription with future period end is eligible'
  );
  assert(
    mod.isCommercialSubscriptionSnapshotEligible(
      { success: true, tenant_id: 'tenant-1', status: 'past_due', current_period_end: futureIso },
      nowMs
    ) === false,
    'past_due subscription is denied by fail-closed eligibility guard'
  );
  assert(
    mod.isCommercialSubscriptionSnapshotEligible(
      { success: true, tenant_id: 'tenant-1', status: 'trialing', trial_end: pastIso },
      nowMs
    ) === false,
    'Expired trial is denied by fail-closed eligibility guard'
  );
  assert(
    mod.isCommercialSubscriptionSnapshotEligible(
      { success: true, tenant_id: 'tenant-1', status: 'trialing' },
      nowMs
    ) === false,
    'Trialing subscription without trial_end is denied by fail-closed eligibility guard'
  );
  assert(
    mod.isCommercialSubscriptionSnapshotEligible(
      { success: true, tenant_id: 'tenant-1', status: 'trialing', trial_end: null },
      nowMs
    ) === false,
    'Trialing subscription with null trial_end is denied by fail-closed eligibility guard'
  );
  assert(
    mod.isCommercialSubscriptionSnapshotEligible(
      { success: true, tenant_id: 'tenant-1', status: 'trialing', trial_end: 'not-a-date' },
      nowMs
    ) === false,
    'Trialing subscription with unparseable trial_end is denied by fail-closed eligibility guard'
  );
  assert(
    mod.isCommercialSubscriptionSnapshotEligible(
      { success: true, tenant_id: 'tenant-1', status: 'trialing', trial_end: futureIso },
      nowMs
    ) === true,
    'Trialing subscription with valid future trial_end is eligible'
  );

  globalThis.__LARI_MOCK_STATE__.dataMode = 'supabase';
  globalThis.__LARI_MOCK_STATE__.rpcHandler = async () => ({
    data: { success: true },
    error: null
  });
  assert(
    (await mod.commercialCatalogService.getMyCommercialEnforcementSnapshot('tenant-1')) === null,
    'getMyCommercialEnforcementSnapshot rejects snapshot missing tenant_id when expectedTenantId is given'
  );

  globalThis.__LARI_MOCK_STATE__.rpcHandler = async () => ({
    data: { success: true, tenant_id: 'other-tenant' },
    error: null
  });
  assert(
    (await mod.commercialCatalogService.getMyCommercialEnforcementSnapshot('tenant-1')) === null,
    'getMyCommercialEnforcementSnapshot rejects snapshot with mismatched tenant_id'
  );

  globalThis.__LARI_MOCK_STATE__.rpcHandler = async () => ({
    data: { success: true, tenant_id: 'tenant-1', is_eligible: true },
    error: null
  });
  assert(
    (await mod.commercialCatalogService.getMyCommercialEnforcementSnapshot('tenant-1'))?.tenant_id === 'tenant-1',
    'getMyCommercialEnforcementSnapshot returns snapshot when tenant_id matches expectedTenantId'
  );

  // B. entitlementService fail-closed resolution
  globalThis.__LARI_MOCK_STATE__.dataMode = 'supabase';
  globalThis.__LARI_MOCK_STATE__.rpcHandler = async () => ({
    data: {
      success: true,
      tenant_id: 'other-tenant',
      status: 'active',
      effective_entitlements: {
        features: { multi_branch: true, online_booking: true },
        limits: { maxBranches: 5, maxStaff: -1 }
      }
    },
    error: null
  });
  const mismatchedEntitlements = await mod.entitlementService.getTenantEffectiveEntitlements('tenant-1');
  assert(
    mismatchedEntitlements.features.multi_branch === false && mismatchedEntitlements.limits.maxBranches === 0,
    'entitlementService denies access when server snapshot tenant_id mismatches caller tenantId'
  );

  globalThis.__LARI_MOCK_STATE__.rpcHandler = async () => ({
    data: {
      success: true,
      tenant_id: 'tenant-1',
      status: 'active',
      current_period_end: futureIso,
      effective_entitlements: {
        features: { multi_branch: true, online_booking: true },
        limits: { maxBranches: 5, maxStaff: -1 }
      }
    },
    error: null
  });
  const validEntitlements = await mod.entitlementService.getTenantEffectiveEntitlements('tenant-1');
  assert(
    validEntitlements.features.multi_branch === true &&
      validEntitlements.features.custom_domain_manual === false &&
      validEntitlements.limits.maxBranches === 5 &&
      validEntitlements.unlimitedFlags?.maxStaff === true,
    'entitlementService maps server features, numeric quotas, and -1 unlimitedFlags faithfully'
  );

  // C. superAdminCommercialAdapter pre-RPC and null response guards
  globalThis.__LARI_MOCK_STATE__.rpcCalls = [];
  const missingKeyRes = await mod.superAdminCommercialAdapter.assignPlan({
    idempotencyKey: '   ',
    tenantId: 'tenant-1',
    planCode: 'premium'
  });
  assert(
    missingKeyRes.success === false &&
      missingKeyRes.reason_code === 'missing_idempotency_key' &&
      globalThis.__LARI_MOCK_STATE__.rpcCalls.length === 0,
    'superAdminCommercialAdapter blocks assignPlan when idempotencyKey is empty without RPC call'
  );

  const negativeTxRes = await mod.superAdminCommercialAdapter.recordBillingTransaction({
    idempotencyKey: 'idem-1',
    tenantId: 'tenant-1',
    amount: -50,
    transactionType: 'manual_payment',
    operatorReason: 'audit test'
  });
  assert(
    negativeTxRes.success === false && negativeTxRes.reason_code === 'invalid_amount',
    'superAdminCommercialAdapter blocks negative billing transaction amount'
  );

  globalThis.__LARI_MOCK_STATE__.rpcHandler = async () => ({ data: null, error: null });
  const emptyRpcRes = await mod.superAdminCommercialAdapter.changeStatus({
    idempotencyKey: 'idem-2',
    tenantId: 'tenant-1',
    targetStatus: 'suspended',
    operatorReason: 'audit'
  });
  assert(
    emptyRpcRes.success === false && emptyRpcRes.reason_code === 'empty_response',
    'superAdminCommercialAdapter normalizes null RPC payload fail-closed'
  );

  globalThis.__LARI_MOCK_STATE__.rpcHandler = async () => ({
    data: { success: true },
    error: null
  });
  const missingTenantSnap = await mod.superAdminCommercialAdapter.getTenantSnapshot('tenant-1');
  assert(
    missingTenantSnap.success === false && missingTenantSnap.reason_code === 'tenant_mismatch',
    'superAdminCommercialAdapter.getTenantSnapshot rejects success=true payload missing tenant_id with tenant_mismatch'
  );

  globalThis.__LARI_MOCK_STATE__.rpcHandler = async () => ({
    data: { success: true, tenant_id: '' },
    error: null
  });
  const emptyTenantSnap = await mod.superAdminCommercialAdapter.getTenantSnapshot('tenant-1');
  assert(
    emptyTenantSnap.success === false && emptyTenantSnap.reason_code === 'tenant_mismatch',
    'superAdminCommercialAdapter.getTenantSnapshot rejects success=true payload with empty tenant_id as tenant_mismatch'
  );

  globalThis.__LARI_MOCK_STATE__.rpcHandler = async () => ({
    data: { success: true, tenant_id: 'other-tenant' },
    error: null
  });
  const mismatchTenantSnap = await mod.superAdminCommercialAdapter.getTenantSnapshot('tenant-1');
  assert(
    mismatchTenantSnap.success === false && mismatchTenantSnap.reason_code === 'tenant_mismatch',
    'superAdminCommercialAdapter.getTenantSnapshot rejects success=true payload with unequal tenant_id as tenant_mismatch'
  );

  globalThis.__LARI_MOCK_STATE__.rpcHandler = async () => ({
    data: { success: false, reason_code: 'unauthorized' },
    error: null
  });
  const unauthTenantSnap = await mod.superAdminCommercialAdapter.getTenantSnapshot('tenant-1');
  assert(
    unauthTenantSnap.success === false && unauthTenantSnap.reason_code === 'unauthorized',
    'superAdminCommercialAdapter.getTenantSnapshot preserves explicit failure reason_code when success=false'
  );

  globalThis.__LARI_MOCK_STATE__.rpcHandler = async () => ({
    data: { success: true, tenant_id: 'tenant-1', eligibility: { eligible: true, reason_code: 'commercial_allowed' } },
    error: null
  });
  const validTenantSnap = await mod.superAdminCommercialAdapter.getTenantSnapshot('tenant-1');
  assert(
    validTenantSnap.success === true && validTenantSnap.tenant_id === 'tenant-1',
    'superAdminCommercialAdapter.getTenantSnapshot accepts success=true payload when tenant_id matches normalizedTenantId'
  );

  // D. businessProfileService Tax Validation, Anti-Spoofing, Redaction & Fail-Closed Invoice Adapter
  assert(mod.isValidTurkishVkn('1111111114') === true, 'Valid 10-digit Turkish VKN checksum passes');
  assert(mod.isValidTurkishVkn('1111111115') === false, 'Invalid VKN checksum fails');
  assert(mod.isValidTurkishVkn('0000000000') === false, 'All-zero VKN is rejected');
  assert(mod.isValidTurkishTckn('10000000146') === true, 'Valid synthetic 11-digit TCKN passes');
  assert(mod.isValidTurkishTckn('10000000147') === false, 'Invalid TCKN checksum fails');

  globalThis.__LARI_MOCK_STATE__.dataMode = 'local';
  const spoofedSave = mod.businessProfileService.saveCommercialTaxProfile('tenant-1', {
    entityType: 'corporate',
    legalBusinessName: 'Lari Salon A.Ş.',
    taxNumber: '1111111114',
    taxOffice: 'Beşiktaş',
    billingAddress: 'Barbaros Bulvarı No:10 İstanbul',
    billingEmail: 'muhasebe@larisalon.test',
    isServerVerified: true,
    verificationStatus: 'verified'
  });
  assert(
    spoofedSave.success === true &&
      spoofedSave.profile?.isServerVerified === false &&
      spoofedSave.profile?.verificationStatus === 'pending_server_verification',
    'saveCommercialTaxProfile strips client self-attestation (isServerVerified stays false)'
  );

  const redacted = mod.redactCommercialTaxProfileForLogs(spoofedSave.profile);
  assert(
    redacted?.taxNumber === '******1114' &&
      redacted?.billingAddress === '[REDACTED]' &&
      String(redacted?.billingEmail).startsWith('m***@'),
    'redactCommercialTaxProfileForLogs masks VKN, email, and billing address'
  );

  globalThis.__LARI_MOCK_STATE__.dataMode = 'supabase';
  const remoteSave = mod.businessProfileService.saveCommercialTaxProfile('tenant-1', {
    entityType: 'corporate',
    legalBusinessName: 'Lari Salon A.Ş.',
    taxNumber: '1111111114',
    taxOffice: 'Beşiktaş',
    billingAddress: 'Barbaros Bulvarı No:10 İstanbul',
    billingEmail: 'muhasebe@larisalon.test'
  });
  assert(
    remoteSave.success === false && remoteSave.reasonCode === 'SERVER_TAX_PROFILE_ENDPOINT_REQUIRED',
    'saveCommercialTaxProfile fails closed in supabase mode until server endpoint exists'
  );

  const invoiceStatus = mod.businessProfileService.getInvoiceAdapterStatus(spoofedSave.profile);
  const invoiceAttempt = mod.businessProfileService.issueInvoice({
    tenantId: 'tenant-1',
    transactionReference: 'tx-100',
    amount: 1490,
    currency: 'TRY',
    taxProfile: spoofedSave.profile
  });
  assert(
    invoiceStatus.canIssueAutomatedInvoice === false &&
      invoiceStatus.taxProfileServerVerified === false &&
      invoiceAttempt.issued === false &&
      invoiceAttempt.invoiceNumber === null &&
      invoiceAttempt.ettn === null &&
      invoiceAttempt.reasonCode === 'SERVER_INVOICE_ADAPTER_REQUIRED',
    'Invoice adapter fails closed without issuing synthetic invoice numbers or ETTN'
  );
} finally {
  fs.rmSync(tempEntryDir, { recursive: true, force: true });
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ Stage H1C Commercial Eligibility & Quota Enforcement QA PASSED.');
