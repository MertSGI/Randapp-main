import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import {
  handleSubscriptionSync,
  mapProviderStatusToSubscriptionStatus,
  evaluateTenantStatusFromSubscriptionStatus,
  evaluateEnvironment,
  isProductionEnvironment,
  isMockSyncAllowed,
  corsHeaders
} from '../supabase/functions/subscription-sync/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const SUBSCRIPTION_SYNC_TRANSACTION_RPC_SQL = `
CREATE OR REPLACE FUNCTION public.execute_subscription_sync_transaction(
    p_tenant_id TEXT,
    p_subscription_status TEXT,
    p_tenant_status TEXT,
    p_mode TEXT DEFAULT 'sync_verified',
    p_provider_status TEXT DEFAULT NULL,
    p_audit_details JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant_uuid UUID;
    v_sub_id UUID;
    v_tenant RECORD;
    v_sub RECORD;
BEGIN
    -- 1. Validate Tenant ID parameter
    IF p_tenant_id IS NULL OR trim(p_tenant_id) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MISSING_TENANT_ID',
            'code', 'MISSING_TENANT_ID'
        );
    END IF;

    BEGIN
        v_tenant_uuid := p_tenant_id::uuid;
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_TENANT_ID',
            'code', 'INVALID_TENANT_ID'
        );
    END;

    -- 2. Validate Status Parameters
    IF p_subscription_status IS NULL OR trim(p_subscription_status) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MISSING_SUBSCRIPTION_STATUS',
            'code', 'MISSING_SUBSCRIPTION_STATUS'
        );
    END IF;

    IF p_tenant_status IS NULL OR trim(p_tenant_status) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MISSING_TENANT_STATUS',
            'code', 'MISSING_TENANT_STATUS'
        );
    END IF;

    -- Fail-closed validation invariant:
    -- Tenant can ONLY be active if subscription is active or trialing
    IF p_tenant_status = 'active' AND p_subscription_status NOT IN ('active', 'trialing') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'FAIL_CLOSED_VIOLATION_TENANT_ACTIVE_WITHOUT_ACTIVE_SUBSCRIPTION',
            'code', 'FAIL_CLOSED_VIOLATION'
        );
    END IF;

    -- 3. Lock Tenant FOR UPDATE
    SELECT * INTO v_tenant
    FROM public.tenants
    WHERE id = v_tenant_uuid
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'TENANT_NOT_FOUND',
            'code', 'TENANT_NOT_FOUND'
        );
    END IF;

    -- 4. Lock Subscription FOR UPDATE (or locate most recent)
    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = v_tenant_uuid
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        v_sub_id := v_sub.id;
        UPDATE public.subscriptions
        SET status = p_subscription_status,
            updated_at = now()
        WHERE id = v_sub.id;
    ELSE
        INSERT INTO public.subscriptions (
            tenant_id,
            status,
            created_at,
            updated_at
        )
        VALUES (
            v_tenant_uuid,
            p_subscription_status,
            now(),
            now()
        )
        RETURNING id INTO v_sub_id;
    END IF;

    -- 5. Update Tenant Status
    UPDATE public.tenants
    SET status = p_tenant_status,
        updated_at = now()
    WHERE id = v_tenant_uuid;

    -- 6. Insert Audit Log
    INSERT INTO public.audit_logs (
        tenant_id,
        action,
        details,
        created_at
    )
    VALUES (
        v_tenant_uuid,
        'subscription_sync',
        jsonb_build_object(
            'mode', COALESCE(p_mode, 'sync_verified'),
            'providerStatus', p_provider_status,
            'subscriptionStatus', p_subscription_status,
            'tenantStatus', p_tenant_status,
            'subscriptionId', v_sub_id,
            'auditDetails', COALESCE(p_audit_details, '{}'::jsonb)
        ),
        now()
    );

    -- 7. Return Success Result
    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'subscription_status', p_subscription_status,
        'tenant_status', p_tenant_status,
        'mode', p_mode
    );
END;
$$;

-- Revoke all direct execution from untrusted roles
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON FUNCTION public.execute_subscription_sync_transaction FROM PUBLIC;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE ALL ON FUNCTION public.execute_subscription_sync_transaction FROM anon;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE ALL ON FUNCTION public.execute_subscription_sync_transaction FROM authenticated;
    END IF;
    GRANT EXECUTE ON FUNCTION public.execute_subscription_sync_transaction TO service_role;
  END IF;
END $$;
`;

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    process.exit(1);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.stack || err.message}`);
    process.exit(1);
  }
}

function createSyntheticSupabaseAdmin(options = {}) {
  const store = {
    subscriptions: new Map(),
    tenants: new Map(),
    audit_logs: [],
    ...(options.initialStore || {})
  };

  const failOnRpc = options.failOnRpc || false;
  const missingRpc = options.missingRpc || false;
  const failInsideTransaction = options.failInsideTransaction || {};

  const directTableMutations = [];

  const admin = {
    store,
    directTableMutations,
    from: (table) => {
      return {
        update: (payload) => {
          return {
            eq: async (col, val) => {
              directTableMutations.push({ table, op: 'update', col, val, payload });
              const current = store[table]?.get(val) || {};
              store[table]?.set(val, { ...current, ...payload });
              return { data: store[table]?.get(val), error: null };
            }
          };
        },
        insert: async (payload) => {
          directTableMutations.push({ table, op: 'insert', payload });
          store[table]?.push(payload);
          return { data: payload, error: null };
        }
      };
    }
  };

  if (!missingRpc) {
    admin.rpc = async (functionName, params) => {
      if (functionName === 'execute_subscription_sync_transaction') {
        if (failOnRpc) {
          return { data: null, error: { message: 'Database transaction RPC error', code: 'RPC_ERROR' } };
        }

        const { p_tenant_id, p_subscription_status, p_tenant_status, p_mode, p_provider_status, p_audit_details } = params;

        // Simulate transactional atomic failure: if any step inside transaction fails, roll back completely
        if (failInsideTransaction.subscriptions) {
          return { data: null, error: { message: 'Subscription row lock or update failed inside transaction', code: 'TX_SUB_FAILED' } };
        }
        if (failInsideTransaction.tenants) {
          return { data: null, error: { message: 'Tenant update failed inside transaction', code: 'TX_TENANT_FAILED' } };
        }

        // Atomic commit to store
        const currentSub = store.subscriptions.get(p_tenant_id) || {};
        store.subscriptions.set(p_tenant_id, {
          ...currentSub,
          status: p_subscription_status,
          updated_at: new Date().toISOString()
        });

        const currentTenant = store.tenants.get(p_tenant_id) || {};
        store.tenants.set(p_tenant_id, {
          ...currentTenant,
          status: p_tenant_status
        });

        store.audit_logs.push({
          tenant_id: p_tenant_id,
          action: 'subscription_sync',
          details: p_audit_details || {},
          created_at: new Date().toISOString()
        });

        return {
          data: {
            success: true,
            tenant_id: p_tenant_id,
            subscription_status: p_subscription_status,
            tenant_status: p_tenant_status,
            mode: p_mode
          },
          error: null
        };
      }
      return { data: null, error: { message: 'Unknown RPC function', code: 'RPC_NOT_FOUND' } };
    };
  }

  return admin;
}

function createMockRequest(method, body = null, headers = {}) {
  return {
    method,
    headers: new Map(Object.entries(headers)),
    text: async () => (body !== null ? (typeof body === 'string' ? body : JSON.stringify(body)) : ''),
    json: async () => (body !== null ? (typeof body === 'string' ? JSON.parse(body) : body) : {})
  };
}

console.log('================================================================================');
console.log('=== LARI [LARI-PILOT3-005] Subscription Sync Fail-Closed Security QA ===');
console.log('================================================================================\n');

// ---------------------------------------------------------------------------
// 1. STATIK VE MİMARİ DOĞRULAMA (Static Code & Policy Verification)
// ---------------------------------------------------------------------------
const syncIndexPath = path.join(rootDir, 'supabase', 'functions', 'subscription-sync', 'index.ts');
const syncIndexContent = fs.readFileSync(syncIndexPath, 'utf8');

runTest('1.1. subscription-sync/index.ts dosyasi mevcut ve okunabiliyor', () => {
  assert(syncIndexContent.length > 0, 'subscription-sync/index.ts bos');
});

runTest('1.2. mockProviderStatus = "active" hardcoded atamasi kaldirildi ve fail-closed guard altinda', () => {
  const hasUnsafeHardcodedPattern = /const\s+mockProviderStatus\s*=\s*['"]active['"]/i.test(syncIndexContent);
  assert.strictEqual(
    hasUnsafeHardcodedPattern,
    false,
    'Hata: Guvensiz hardcoded "const mockProviderStatus = active" atamasi kod icinde tespit edildi!'
  );
});

runTest('1.3. subscription-sync/index.ts temel fail-closed guvenlik fonksiyonlarini export ediyor', () => {
  assert.strictEqual(typeof handleSubscriptionSync, 'function', 'handleSubscriptionSync bulunamadi');
  assert.strictEqual(typeof mapProviderStatusToSubscriptionStatus, 'function', 'mapProviderStatusToSubscriptionStatus bulunamadi');
  assert.strictEqual(typeof evaluateTenantStatusFromSubscriptionStatus, 'function', 'evaluateTenantStatusFromSubscriptionStatus bulunamadi');
  assert.strictEqual(typeof evaluateEnvironment, 'function', 'evaluateEnvironment bulunamadi');
  assert.strictEqual(typeof isProductionEnvironment, 'function', 'isProductionEnvironment bulunamadi');
  assert.strictEqual(typeof isMockSyncAllowed, 'function', 'isMockSyncAllowed bulunamadi');
});

runTest('1.4. Kod icinde tum fail-closed ve hata kodlari tanimli', () => {
  assert(syncIndexContent.includes('MOCK_FORBIDDEN_IN_PRODUCTION'), 'MOCK_FORBIDDEN_IN_PRODUCTION kodu bulunamadi');
  assert(syncIndexContent.includes('CONFLICTING_ENVIRONMENT'), 'CONFLICTING_ENVIRONMENT kodu bulunamadi');
  assert(syncIndexContent.includes('UNKNOWN_ENVIRONMENT'), 'UNKNOWN_ENVIRONMENT kodu bulunamadi');
  assert(syncIndexContent.includes('SERVER_MOCK_NOT_ENABLED'), 'SERVER_MOCK_NOT_ENABLED kodu bulunamadi');
  assert(syncIndexContent.includes('EXPLICIT_TEST_FLAG_REQUIRED'), 'EXPLICIT_TEST_FLAG_REQUIRED kodu bulunamadi');
  assert(syncIndexContent.includes('PROVIDER_VERIFICATION_REQUIRED'), 'PROVIDER_VERIFICATION_REQUIRED kodu bulunamadi');
  assert(syncIndexContent.includes('PROVIDER_VERIFICATION_FAILED'), 'PROVIDER_VERIFICATION_FAILED kodu bulunamadi');
  assert(syncIndexContent.includes('PROVIDER_VERIFICATION_ERROR'), 'PROVIDER_VERIFICATION_ERROR kodu bulunamadi');
  assert(syncIndexContent.includes('RPC_UNAVAILABLE'), 'RPC_UNAVAILABLE kodu bulunamadi');
  assert(syncIndexContent.includes('SUBSCRIPTION_SYNC_TRANSACTION_FAILED'), 'SUBSCRIPTION_SYNC_TRANSACTION_FAILED kodu bulunamadi');
});

runTest('1.5. Kod icinde tek transaction-backed RPC kullanimi zorunlu kılındı (sequential direct table update yok)', () => {
  assert(syncIndexContent.includes('execute_subscription_sync_transaction'), 'execute_subscription_sync_transaction RPC cagrisi bulunamadi');
  // Subscriptions veya tenants tablosuna dogrudan update yapilmadigini statik olarak dogrula
  const directSubUpdate = /\.from\(['"]subscriptions['"]\)\.update\(/i.test(syncIndexContent);
  const directTenantUpdate = /\.from\(['"]tenants['"]\)\.update\(/i.test(syncIndexContent);
  assert.strictEqual(directSubUpdate, false, 'Hata: subscriptions tablosuna dogrudan update cagriliyor!');
  assert.strictEqual(directTenantUpdate, false, 'Hata: tenants tablosuna dogrudan update cagriliyor!');
});

runTest('1.6. execute_subscription_sync_transaction RPC tanımı ve sürumlenen migration dosyası doğrulanır', () => {
  const migPath = path.join(rootDir, 'supabase', 'migrations', '20260902_subscription_sync_transaction.sql');
  assert(fs.existsSync(migPath), 'Sürumlenen migration dosyasi bulunamadi: supabase/migrations/20260902_subscription_sync_transaction.sql');
  const sqlContent = fs.readFileSync(migPath, 'utf8');
  assert(sqlContent.includes('CREATE OR REPLACE FUNCTION public.execute_subscription_sync_transaction'), 'RPC fonksiyon tanimi SQL icinde bulunamadi');
  assert(sqlContent.includes('public.tenants'), 'tenants tablosu SQL icinde yer almiyor');
  assert(sqlContent.includes('public.subscriptions'), 'subscriptions tablosu SQL icinde yer almiyor');
  assert(sqlContent.includes('public.audit_logs'), 'audit_logs tablosu SQL icinde yer almiyor');
  assert(sqlContent.includes('FAIL_CLOSED_VIOLATION'), 'Fail-closed guard SQL icinde yer almiyor');
});

// ---------------------------------------------------------------------------
// 2. BIRIM TESTLERI: DURUM HARITALAMA (mapProviderStatusToSubscriptionStatus)
// ---------------------------------------------------------------------------
runTest('2.1. mapProviderStatusToSubscriptionStatus: active -> active', () => {
  assert.strictEqual(mapProviderStatusToSubscriptionStatus('active'), 'active');
  assert.strictEqual(mapProviderStatusToSubscriptionStatus('  ACTIVE  '), 'active');
});

runTest('2.2. mapProviderStatusToSubscriptionStatus: trialing -> trialing', () => {
  assert.strictEqual(mapProviderStatusToSubscriptionStatus('trialing'), 'trialing');
  assert.strictEqual(mapProviderStatusToSubscriptionStatus('TRIALING'), 'trialing');
});

runTest('2.3. mapProviderStatusToSubscriptionStatus: pending -> pending', () => {
  assert.strictEqual(mapProviderStatusToSubscriptionStatus('pending'), 'pending');
});

runTest('2.4. mapProviderStatusToSubscriptionStatus: past_due / failed / unpaid -> past_due', () => {
  assert.strictEqual(mapProviderStatusToSubscriptionStatus('past_due'), 'past_due');
  assert.strictEqual(mapProviderStatusToSubscriptionStatus('failed'), 'past_due');
  assert.strictEqual(mapProviderStatusToSubscriptionStatus('unpaid'), 'past_due');
});

runTest('2.5. mapProviderStatusToSubscriptionStatus: canceled / cancelled -> cancelled', () => {
  assert.strictEqual(mapProviderStatusToSubscriptionStatus('canceled'), 'cancelled');
  assert.strictEqual(mapProviderStatusToSubscriptionStatus('cancelled'), 'cancelled');
});

runTest('2.6. mapProviderStatusToSubscriptionStatus: expired -> expired', () => {
  assert.strictEqual(mapProviderStatusToSubscriptionStatus('expired'), 'expired');
});

runTest('2.7. mapProviderStatusToSubscriptionStatus: suspended -> suspended', () => {
  assert.strictEqual(mapProviderStatusToSubscriptionStatus('suspended'), 'suspended');
});

runTest('2.8. mapProviderStatusToSubscriptionStatus: pending_checkout -> pending_checkout', () => {
  assert.strictEqual(mapProviderStatusToSubscriptionStatus('pending_checkout'), 'pending_checkout');
});

runTest('2.9. mapProviderStatusToSubscriptionStatus (FAIL-CLOSED): Bilinmeyen veya gecersiz tum durumlar suspended doner', () => {
  const invalidOrUnknownCases = [
    null,
    undefined,
    '',
    '   ',
    'unknown_status',
    'fraud',
    'unverified',
    'fake_active',
    'active_pending',
    12345,
    {},
    []
  ];
  for (const tc of invalidOrUnknownCases) {
    assert.strictEqual(
      mapProviderStatusToSubscriptionStatus(tc),
      'suspended',
      `Fail-closed ihlali: ${String(tc)} durumu suspended olarak donmedi`
    );
  }
});

// ---------------------------------------------------------------------------
// 3. BIRIM TESTLERI: TENANT DURUM DEGERLENDIRMESI (evaluateTenantStatusFromSubscriptionStatus)
// ---------------------------------------------------------------------------
runTest('3.1. evaluateTenantStatusFromSubscriptionStatus: active ve trialing haricinde tenant active olamaz', () => {
  assert.strictEqual(evaluateTenantStatusFromSubscriptionStatus('active'), 'active');
  assert.strictEqual(evaluateTenantStatusFromSubscriptionStatus('trialing'), 'active');

  const suspendedCases = [
    'past_due',
    'cancelled',
    'canceled',
    'expired',
    'suspended',
    'pending',
    'pending_checkout',
    'unknown',
    'unverified',
    ''
  ];
  for (const st of suspendedCases) {
    assert.strictEqual(
      evaluateTenantStatusFromSubscriptionStatus(st),
      'suspended',
      `Tenant active olmamaliydi: ${st}`
    );
  }
});

// ---------------------------------------------------------------------------
// 4. BIRIM TESTLERI: ORTAM VE MOCK YETKILENDIRME (ADIM005-MOCK-GATE-001)
// ---------------------------------------------------------------------------
runTest('4.1. isProductionEnvironment: Herhangi bir production sinyali varsa kesinlikle production sayilir', () => {
  assert.strictEqual(isProductionEnvironment((k) => (k === 'ENVIRONMENT' ? 'production' : undefined)), true);
  assert.strictEqual(isProductionEnvironment((k) => (k === 'NODE_ENV' ? 'production' : undefined)), true);
  assert.strictEqual(isProductionEnvironment((k) => (k === 'DENO_ENV' ? 'production' : undefined)), true);
  assert.strictEqual(isProductionEnvironment((k) => (k === 'PAYMENT_RUN_MODE' ? 'production_live' : undefined)), true);
  assert.strictEqual(isProductionEnvironment((k) => (k === 'VITE_PAYMENT_RUN_MODE' ? 'production_live' : undefined)), true);

  // KRİTİK: ENVIRONMENT=development iken NODE_ENV=production ise production sinyali ASLA göz ardı edilemez!
  const mixedEnv = (k) => {
    if (k === 'ENVIRONMENT') return 'development';
    if (k === 'NODE_ENV') return 'production';
    return undefined;
  };
  assert.strictEqual(isProductionEnvironment(mixedEnv), true, 'Celisik durumda production sinyali goz ardi edildi!');
});

runTest('4.2. evaluateEnvironment: Bilinmeyen veya bos ortamlar unconfigured / unknown sayilir', () => {
  const emptyEnv = evaluateEnvironment(() => undefined);
  assert.strictEqual(emptyEnv.isProduction, false);
  assert.strictEqual(emptyEnv.isKnownNonProduction, false);
  assert.strictEqual(emptyEnv.reason, 'UNKNOWN_OR_UNDEFINED_ENVIRONMENT');

  const devEnv = evaluateEnvironment((k) => (k === 'ENVIRONMENT' ? 'development' : undefined));
  assert.strictEqual(devEnv.isProduction, false);
  assert.strictEqual(devEnv.isKnownNonProduction, true);
});

runTest('4.3. isMockSyncAllowed: Production modunda mock simülasyonu kosulsuz yasaktir (HTTP 403 / fail-closed)', () => {
  const getProdEnv = (k) => (k === 'ENVIRONMENT' ? 'production' : undefined);

  const res1 = isMockSyncAllowed(true, { sandboxMock: true }, getProdEnv);
  assert.strictEqual(res1.allowed, false);
  assert.strictEqual(res1.reason, 'MOCK_FORBIDDEN_IN_PRODUCTION');

  const res2 = isMockSyncAllowed(true, { mockProviderStatus: 'active' }, getProdEnv);
  assert.strictEqual(res2.allowed, false);
  assert.strictEqual(res2.reason, 'MOCK_FORBIDDEN_IN_PRODUCTION');
});

runTest('4.4. isMockSyncAllowed: Bilinmeyen / tanimsiz ortamda mock kesinlikle yasaktir (ADIM005-MOCK-GATE-001)', () => {
  const getEmptyEnv = () => undefined;

  // Ortam değişkenleri tamamen boşken istemci sandboxMock: true gönderse dahi izin VERİLMEZ
  const res = isMockSyncAllowed(false, { sandboxMock: true, simulateProviderStatus: 'active' }, getEmptyEnv);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'UNKNOWN_ENVIRONMENT');
});

runTest('4.5. isMockSyncAllowed: Celisik ortamlarda (dev + prod) mock kesinlikle yasaktir (ADIM005-MOCK-GATE-001)', () => {
  const conflictingEnv = (k) => {
    if (k === 'ENVIRONMENT') return 'development';
    if (k === 'NODE_ENV') return 'production';
    return undefined;
  };
  const isProd = isProductionEnvironment(conflictingEnv);
  const res = isMockSyncAllowed(isProd, { sandboxMock: true }, conflictingEnv);
  assert.strictEqual(res.allowed, false);
  assert(res.reason === 'MOCK_FORBIDDEN_IN_PRODUCTION' || res.reason === 'CONFLICTING_ENVIRONMENT');
});

runTest('4.6. isMockSyncAllowed: Sunucu tarafi izin (ALLOW_SUBSCRIPTION_SYNC_MOCK=true) yoksa mock yasaktir', () => {
  const devNoServerFlag = (k) => (k === 'ENVIRONMENT' ? 'development' : undefined);
  const res1 = isMockSyncAllowed(false, { sandboxMock: true }, devNoServerFlag);
  assert.strictEqual(res1.allowed, false);
  assert.strictEqual(res1.reason, 'SERVER_MOCK_NOT_ENABLED');

  const devWithServerFlag = (k) => {
    if (k === 'ENVIRONMENT') return 'development';
    if (k === 'ALLOW_SUBSCRIPTION_SYNC_MOCK') return 'true';
    return undefined;
  };
  const res2 = isMockSyncAllowed(false, { sandboxMock: true }, devWithServerFlag);
  assert.strictEqual(res2.allowed, true);
});

runTest('4.7. isMockSyncAllowed: Non-prod ve sunucu izni olsa dahi istemci acik test bayragi gondermelidir', () => {
  const devWithServerFlag = (k) => {
    if (k === 'ENVIRONMENT') return 'development';
    if (k === 'ALLOW_SUBSCRIPTION_SYNC_MOCK') return 'true';
    return undefined;
  };
  // Sadece mockProviderStatus gonderilmis, sandboxMock bayragi yok -> yasak
  const res = isMockSyncAllowed(false, { mockProviderStatus: 'active' }, devWithServerFlag);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'EXPLICIT_TEST_FLAG_REQUIRED');
});

// ---------------------------------------------------------------------------
// 5. ENTEGRASYON TESTLERI: PRODÜKSİYON / CANLI FAIL-CLOSED AKISI
// ---------------------------------------------------------------------------
await runAsyncTest('5.1. Prod modunda mock istek atildiginda HTTP 403 MOCK_FORBIDDEN_IN_PRODUCTION doner ve DB degismez', async () => {
  const mockAdmin = createSyntheticSupabaseAdmin();
  const getProdEnv = (k) => (k === 'ENVIRONMENT' ? 'production' : undefined);

  const req = createMockRequest('POST', {
    tenantId: 'tenant_prod_1',
    sandboxMock: true,
    mockProviderStatus: 'active'
  });

  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: mockAdmin,
    getEnv: getProdEnv
  });

  assert.strictEqual(res.status, 403);
  const body = await res.json();
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.errorCode, 'MOCK_FORBIDDEN_IN_PRODUCTION');
  assert.strictEqual(body.activated, false);
  assert.strictEqual(mockAdmin.store.subscriptions.size, 0, 'DB subscriptions tablosuna dokunulmamaliydi');
  assert.strictEqual(mockAdmin.store.tenants.size, 0, 'DB tenants tablosuna dokunulmamaliydi');
  assert.strictEqual(mockAdmin.directTableMutations.length, 0);
});

await runAsyncTest('5.2. Prod modunda saglayici dogrulamasi yoksa HTTP 503 PROVIDER_VERIFICATION_REQUIRED fail-closed doner', async () => {
  const mockAdmin = createSyntheticSupabaseAdmin();
  const getProdEnv = (k) => (k === 'ENVIRONMENT' ? 'production' : undefined);

  const req = createMockRequest('POST', {
    tenantId: 'tenant_prod_2'
  });

  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: mockAdmin,
    getEnv: getProdEnv
  });

  assert.strictEqual(res.status, 503);
  const body = await res.json();
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.errorCode, 'PROVIDER_VERIFICATION_REQUIRED');
  assert.strictEqual(body.activated, false);
  assert.strictEqual(mockAdmin.store.subscriptions.size, 0);
  assert.strictEqual(mockAdmin.directTableMutations.length, 0);
});

await runAsyncTest('5.3. Prod modunda saglayici dogrulamasi basarisiz olursa HTTP 422 PROVIDER_VERIFICATION_FAILED fail-closed doner', async () => {
  const mockAdmin = createSyntheticSupabaseAdmin();
  const getProdEnv = (k) => (k === 'ENVIRONMENT' ? 'production' : undefined);

  const req = createMockRequest('POST', {
    tenantId: 'tenant_prod_3'
  });

  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: mockAdmin,
    getEnv: getProdEnv,
    verifyProviderStatus: async () => ({
      verified: false,
      error: 'Subscription not found in payment provider'
    })
  });

  assert.strictEqual(res.status, 422);
  const body = await res.json();
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.errorCode, 'PROVIDER_VERIFICATION_FAILED');
  assert.strictEqual(body.activated, false);
  assert.strictEqual(mockAdmin.store.subscriptions.size, 0);
  assert.strictEqual(mockAdmin.directTableMutations.length, 0);
});

await runAsyncTest('5.4. Prod modunda saglayici dogrulama servisi exception verirse HTTP 503 PROVIDER_VERIFICATION_ERROR doner', async () => {
  const mockAdmin = createSyntheticSupabaseAdmin();
  const getProdEnv = (k) => (k === 'ENVIRONMENT' ? 'production' : undefined);

  const req = createMockRequest('POST', {
    tenantId: 'tenant_prod_4'
  });

  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: mockAdmin,
    getEnv: getProdEnv,
    verifyProviderStatus: async () => {
      throw new Error('Connection reset by provider');
    }
  });

  assert.strictEqual(res.status, 503);
  const body = await res.json();
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.errorCode, 'PROVIDER_VERIFICATION_ERROR');
  assert.strictEqual(body.activated, false);
  assert.strictEqual(mockAdmin.store.subscriptions.size, 0);
  assert.strictEqual(mockAdmin.directTableMutations.length, 0);
});

await runAsyncTest('5.5. Prod modunda saglayici "past_due" donerse tenant suspended yapilir, ASLA active yapilmaz', async () => {
  const mockAdmin = createSyntheticSupabaseAdmin({
    initialStore: {
      subscriptions: new Map([['tenant_prod_5', { status: 'pending' }]]),
      tenants: new Map([['tenant_prod_5', { status: 'suspended' }]])
    }
  });
  const getProdEnv = (k) => (k === 'ENVIRONMENT' ? 'production' : undefined);

  const req = createMockRequest('POST', {
    tenantId: 'tenant_prod_5'
  });

  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: mockAdmin,
    getEnv: getProdEnv,
    verifyProviderStatus: async () => ({
      verified: true,
      status: 'past_due'
    })
  });

  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.activated, false);
  assert.strictEqual(body.subscriptionStatus, 'past_due');
  assert.strictEqual(body.tenantStatus, 'suspended');

  assert.strictEqual(mockAdmin.store.subscriptions.get('tenant_prod_5').status, 'past_due');
  assert.strictEqual(mockAdmin.store.tenants.get('tenant_prod_5').status, 'suspended');
  assert.strictEqual(mockAdmin.directTableMutations.length, 0, 'Mutasyon RPC uzerinden olmali, direct table update degil');
});

await runAsyncTest('5.6. Prod modunda saglayici YALNIZCA "active" ve dogrulanmis donerse aktiflesir', async () => {
  const mockAdmin = createSyntheticSupabaseAdmin({
    initialStore: {
      subscriptions: new Map([['tenant_prod_6', { status: 'pending' }]]),
      tenants: new Map([['tenant_prod_6', { status: 'suspended' }]])
    }
  });
  const getProdEnv = (k) => (k === 'ENVIRONMENT' ? 'production' : undefined);

  const req = createMockRequest('POST', {
    tenantId: 'tenant_prod_6'
  });

  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: mockAdmin,
    getEnv: getProdEnv,
    verifyProviderStatus: async () => ({
      verified: true,
      status: 'active'
    })
  });

  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.activated, true);
  assert.strictEqual(body.subscriptionStatus, 'active');
  assert.strictEqual(body.tenantStatus, 'active');

  assert.strictEqual(mockAdmin.store.subscriptions.get('tenant_prod_6').status, 'active');
  assert.strictEqual(mockAdmin.store.tenants.get('tenant_prod_6').status, 'active');
  assert.strictEqual(mockAdmin.directTableMutations.length, 0);
});

// ---------------------------------------------------------------------------
// 6. ENTEGRASYON TESTLERI: TEST/SANDBOX VE MOCK GUARD GUVEBLIGI (ADIM005-MOCK-GATE-001)
// ---------------------------------------------------------------------------
await runAsyncTest('6.1. Non-prod ortamda acik test bayragi yoksa fail-closed kalir ve DB mutasyonu 0 olur', async () => {
  const mockAdmin = createSyntheticSupabaseAdmin();
  const getDevEnv = (k) => {
    if (k === 'ENVIRONMENT') return 'development';
    if (k === 'ALLOW_SUBSCRIPTION_SYNC_MOCK') return 'true';
    return undefined;
  };

  const req = createMockRequest('POST', {
    tenantId: 'tenant_dev_1',
    mockProviderStatus: 'active'
  });

  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: mockAdmin,
    getEnv: getDevEnv
  });

  assert.strictEqual(res.status, 403);
  const body = await res.json();
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.errorCode, 'EXPLICIT_TEST_FLAG_REQUIRED');
  assert.strictEqual(body.activated, false);
  assert.strictEqual(mockAdmin.store.subscriptions.size, 0, 'DB degisikligi yapilmamali');
  assert.strictEqual(mockAdmin.directTableMutations.length, 0);
});

await runAsyncTest('6.2. Non-prod ve sunucu izni varken durum belirtilmezse FAIL-CLOSED suspended kalir (asla active yapmaz)', async () => {
  const mockAdmin = createSyntheticSupabaseAdmin();
  const getDevEnv = (k) => {
    if (k === 'ENVIRONMENT') return 'development';
    if (k === 'ALLOW_SUBSCRIPTION_SYNC_MOCK') return 'true';
    return undefined;
  };

  const req = createMockRequest('POST', {
    tenantId: 'tenant_dev_2',
    sandboxMock: true
  });

  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: mockAdmin,
    getEnv: getDevEnv
  });

  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.mode, 'sandbox_mock');
  assert.strictEqual(body.providerStatus, 'unverified');
  assert.strictEqual(body.subscriptionStatus, 'suspended');
  assert.strictEqual(body.tenantStatus, 'suspended');
  assert.strictEqual(body.activated, false, 'Durum belirtilmediginde asla active yapilmamalidir!');

  assert.strictEqual(mockAdmin.store.subscriptions.get('tenant_dev_2').status, 'suspended');
  assert.strictEqual(mockAdmin.store.tenants.get('tenant_dev_2').status, 'suspended');
});

await runAsyncTest('6.3. Non-prod ve sunucu izni varken bilinmeyen durum gonderilirse FAIL-CLOSED suspended kalir', async () => {
  const mockAdmin = createSyntheticSupabaseAdmin();
  const getDevEnv = (k) => {
    if (k === 'ENVIRONMENT') return 'development';
    if (k === 'ALLOW_SUBSCRIPTION_SYNC_MOCK') return 'true';
    return undefined;
  };

  const req = createMockRequest('POST', {
    tenantId: 'tenant_dev_3',
    sandboxMock: true,
    simulateProviderStatus: 'fake_or_unrecognized_status'
  });

  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: mockAdmin,
    getEnv: getDevEnv
  });

  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.subscriptionStatus, 'suspended');
  assert.strictEqual(body.tenantStatus, 'suspended');
  assert.strictEqual(body.activated, false);

  assert.strictEqual(mockAdmin.store.subscriptions.get('tenant_dev_3').status, 'suspended');
  assert.strictEqual(mockAdmin.store.tenants.get('tenant_dev_3').status, 'suspended');
});

await runAsyncTest('6.4. Dogrulanmis non-prod + sunucu izni + istemci test bayragi ile aktiflesme basarilidir', async () => {
  const mockAdmin = createSyntheticSupabaseAdmin();
  const getDevEnv = (k) => {
    if (k === 'ENVIRONMENT') return 'development';
    if (k === 'ALLOW_SUBSCRIPTION_SYNC_MOCK') return 'true';
    return undefined;
  };

  const req = createMockRequest('POST', {
    tenantId: 'tenant_dev_4',
    sandboxMock: true,
    simulateProviderStatus: 'active'
  });

  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: mockAdmin,
    getEnv: getDevEnv
  });

  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.mode, 'sandbox_mock');
  assert.strictEqual(body.subscriptionStatus, 'active');
  assert.strictEqual(body.tenantStatus, 'active');
  assert.strictEqual(body.activated, true);

  assert.strictEqual(mockAdmin.store.subscriptions.get('tenant_dev_4').status, 'active');
  assert.strictEqual(mockAdmin.store.tenants.get('tenant_dev_4').status, 'active');
});

// NEGATIF MOCK GATE TESTLERİ (Denetçi Rework Karşı Örnekleri)
await runAsyncTest('6.5. [COUNTER-EXAMPLE 1] Ortam tanimsizken sandboxMock ve simulateProviderStatus=active ile istek HTTP 403 UNKNOWN_ENVIRONMENT doner', async () => {
  const mockAdmin = createSyntheticSupabaseAdmin();
  const getEmptyEnv = () => undefined; // Ortam değişkenleri tamamen tanımsız!

  const req = createMockRequest('POST', {
    tenantId: 'victim_tenant',
    sandboxMock: true,
    simulateProviderStatus: 'active'
  });

  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: mockAdmin,
    getEnv: getEmptyEnv
  });

  assert.strictEqual(res.status, 403, 'Ortam tanimsizken HTTP 403 donmelidir');
  const body = await res.json();
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.errorCode, 'UNKNOWN_ENVIRONMENT');
  assert.strictEqual(body.activated, false);
  assert.strictEqual(mockAdmin.store.subscriptions.size, 0, 'Sifir DB mutasyonu saglanmalidir');
  assert.strictEqual(mockAdmin.store.tenants.size, 0, 'Sifir DB mutasyonu saglanmalidir');
  assert.strictEqual(mockAdmin.directTableMutations.length, 0);
});

await runAsyncTest('6.6. [COUNTER-EXAMPLE 2] ENVIRONMENT=development ve NODE_ENV=production celiskisinde mock engellenir (HTTP 403)', async () => {
  const mockAdmin = createSyntheticSupabaseAdmin();
  const conflictingEnv = (k) => {
    if (k === 'ENVIRONMENT') return 'development';
    if (k === 'NODE_ENV') return 'production';
    if (k === 'ALLOW_SUBSCRIPTION_SYNC_MOCK') return 'true';
    return undefined;
  };

  const req = createMockRequest('POST', {
    tenantId: 'tenant_conflict',
    sandboxMock: true,
    simulateProviderStatus: 'active'
  });

  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: mockAdmin,
    getEnv: conflictingEnv
  });

  assert.strictEqual(res.status, 403);
  const body = await res.json();
  assert.strictEqual(body.ok, false);
  assert(body.errorCode === 'MOCK_FORBIDDEN_IN_PRODUCTION' || body.errorCode === 'CONFLICTING_ENVIRONMENT');
  assert.strictEqual(body.activated, false);
  assert.strictEqual(mockAdmin.store.subscriptions.size, 0, 'Sifir DB mutasyonu saglanmalidir');
});

await runAsyncTest('6.7. [COUNTER-EXAMPLE 3] Non-prod ortamda sunucu izni (ALLOW_SUBSCRIPTION_SYNC_MOCK) yoksa HTTP 403 SERVER_MOCK_NOT_ENABLED doner', async () => {
  const mockAdmin = createSyntheticSupabaseAdmin();
  const devNoMockEnv = (k) => {
    if (k === 'ENVIRONMENT') return 'development';
    // ALLOW_SUBSCRIPTION_SYNC_MOCK tanimsiz!
    return undefined;
  };

  const req = createMockRequest('POST', {
    tenantId: 'tenant_no_server_auth',
    sandboxMock: true,
    simulateProviderStatus: 'active'
  });

  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: mockAdmin,
    getEnv: devNoMockEnv
  });

  assert.strictEqual(res.status, 403);
  const body = await res.json();
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.errorCode, 'SERVER_MOCK_NOT_ENABLED');
  assert.strictEqual(body.activated, false);
  assert.strictEqual(mockAdmin.store.subscriptions.size, 0, 'Sifir DB mutasyonu saglanmalidir');
});

// ---------------------------------------------------------------------------
// 7. VERITABANI HATA YONETIMI VE ATOMİK RPC TESTLERI (ADIM005-ATOMICITY-002)
// ---------------------------------------------------------------------------
await runAsyncTest('7.1. RPC arayuzu yoksa (missing RPC) HTTP 503 RPC_UNAVAILABLE doner ve tablolara dokunulmaz', async () => {
  const mockAdmin = createSyntheticSupabaseAdmin({
    missingRpc: true,
    initialStore: {
      subscriptions: new Map([['tenant_atomic_1', { status: 'active' }]]),
      tenants: new Map([['tenant_atomic_1', { status: 'active' }]])
    }
  });

  const getDevEnv = (k) => {
    if (k === 'ENVIRONMENT') return 'development';
    if (k === 'ALLOW_SUBSCRIPTION_SYNC_MOCK') return 'true';
    return undefined;
  };

  const req = createMockRequest('POST', {
    tenantId: 'tenant_atomic_1',
    sandboxMock: true,
    simulateProviderStatus: 'suspended'
  });

  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: mockAdmin,
    getEnv: getDevEnv
  });

  assert.strictEqual(res.status, 503);
  const body = await res.json();
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.errorCode, 'RPC_UNAVAILABLE');

  // Baslangictaki kayitlar tamamen degismeden kalmalidir
  assert.strictEqual(mockAdmin.store.subscriptions.get('tenant_atomic_1').status, 'active');
  assert.strictEqual(mockAdmin.store.tenants.get('tenant_atomic_1').status, 'active');
  assert.strictEqual(mockAdmin.directTableMutations.length, 0);
});

await runAsyncTest('7.2. RPC hata verirse (failOnRpc) HTTP 503 SUBSCRIPTION_SYNC_TRANSACTION_FAILED doner ve durumlar degismez', async () => {
  const mockAdmin = createSyntheticSupabaseAdmin({
    failOnRpc: true,
    initialStore: {
      subscriptions: new Map([['tenant_atomic_2', { status: 'active' }]]),
      tenants: new Map([['tenant_atomic_2', { status: 'active' }]])
    }
  });

  const getDevEnv = (k) => {
    if (k === 'ENVIRONMENT') return 'development';
    if (k === 'ALLOW_SUBSCRIPTION_SYNC_MOCK') return 'true';
    return undefined;
  };

  const req = createMockRequest('POST', {
    tenantId: 'tenant_atomic_2',
    sandboxMock: true,
    simulateProviderStatus: 'suspended'
  });

  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: mockAdmin,
    getEnv: getDevEnv
  });

  assert.strictEqual(res.status, 503);
  const body = await res.json();
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.errorCode, 'SUBSCRIPTION_SYNC_TRANSACTION_FAILED');

  assert.strictEqual(mockAdmin.store.subscriptions.get('tenant_atomic_2').status, 'active');
  assert.strictEqual(mockAdmin.store.tenants.get('tenant_atomic_2').status, 'active');
  assert.strictEqual(mockAdmin.directTableMutations.length, 0);
});

await runAsyncTest('7.3. [COUNTER-EXAMPLE ATOMICITY] Tenant guncellemesi transaction icinde hata verirse subscription ASLA degismez', async () => {
  // Baslangicta tenant active, saglayici past_due bildiriyor.
  // Transaction icinde tenants update fail oldugunda subscriptions degismis KALMAMALIDIR (tam atomik rollback)!
  const mockAdmin = createSyntheticSupabaseAdmin({
    failInsideTransaction: { tenants: true },
    initialStore: {
      subscriptions: new Map([['tenant_atomic_3', { status: 'active' }]]),
      tenants: new Map([['tenant_atomic_3', { status: 'active' }]])
    }
  });

  const getProdEnv = (k) => (k === 'ENVIRONMENT' ? 'production' : undefined);

  const req = createMockRequest('POST', {
    tenantId: 'tenant_atomic_3'
  });

  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: mockAdmin,
    getEnv: getProdEnv,
    verifyProviderStatus: async () => ({
      verified: true,
      status: 'past_due'
    })
  });

  assert.strictEqual(res.status, 503);
  const body = await res.json();
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.errorCode, 'SUBSCRIPTION_SYNC_TRANSACTION_FAILED');

  // Her iki kayit da kismi yazim olmadan baslangic durumunu korumalidir (kısmi yazım = 0)
  assert.strictEqual(mockAdmin.store.subscriptions.get('tenant_atomic_3').status, 'active');
  assert.strictEqual(mockAdmin.store.tenants.get('tenant_atomic_3').status, 'active');
  assert.strictEqual(mockAdmin.directTableMutations.length, 0);
});

await runAsyncTest('7.4. [COUNTER-EXAMPLE ATOMICITY] Subscriptions transaction icinde hata verirse tenant degismez', async () => {
  const mockAdmin = createSyntheticSupabaseAdmin({
    failInsideTransaction: { subscriptions: true },
    initialStore: {
      subscriptions: new Map([['tenant_atomic_4', { status: 'pending' }]]),
      tenants: new Map([['tenant_atomic_4', { status: 'suspended' }]])
    }
  });

  const getDevEnv = (k) => {
    if (k === 'ENVIRONMENT') return 'development';
    if (k === 'ALLOW_SUBSCRIPTION_SYNC_MOCK') return 'true';
    return undefined;
  };

  const req = createMockRequest('POST', {
    tenantId: 'tenant_atomic_4',
    sandboxMock: true,
    simulateProviderStatus: 'active'
  });

  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: mockAdmin,
    getEnv: getDevEnv
  });

  assert.strictEqual(res.status, 503);
  assert.strictEqual(mockAdmin.store.subscriptions.get('tenant_atomic_4').status, 'pending');
  assert.strictEqual(mockAdmin.store.tenants.get('tenant_atomic_4').status, 'suspended');
  assert.strictEqual(mockAdmin.directTableMutations.length, 0);
});

// ---------------------------------------------------------------------------
// 8. ERROR DISCLOSURE VE SECRET SIZDIRMA KORUMASI TESTLERI (ADIM005-ERROR-DISCLOSURE-003)
// ---------------------------------------------------------------------------
await runAsyncTest('8.1. Provider failure icindeki secret sentinel yanita veya loglara sizdirilmaz', async () => {
  const SECRET_SENTINEL = 'SECRET_SENTINEL_TOKEN_VAL_837261';
  const interceptedLogs = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args) => interceptedLogs.push(args.join(' '));
  console.warn = (...args) => interceptedLogs.push(args.join(' '));

  try {
    const mockAdmin = createSyntheticSupabaseAdmin();
    const getProdEnv = (k) => (k === 'ENVIRONMENT' ? 'production' : undefined);

    const req = createMockRequest('POST', {
      tenantId: 'tenant_secret_leak_1'
    });

    const res = await handleSubscriptionSync(req, {
      supabaseAdmin: mockAdmin,
      getEnv: getProdEnv,
      verifyProviderStatus: async () => ({
        verified: false,
        error: `Authorization Bearer ${SECRET_SENTINEL}`
      })
    });

    assert.strictEqual(res.status, 422);
    const bodyText = await res.text();
    assert.strictEqual(bodyText.includes(SECRET_SENTINEL), false, `Secret sentinel response payload icinde bulundu: ${bodyText}`);

    const joinedLogs = interceptedLogs.join(' ');
    assert.strictEqual(joinedLogs.includes(SECRET_SENTINEL), false, `Secret sentinel loglar icinde bulundu: ${joinedLogs}`);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
});

await runAsyncTest('8.2. Provider verification exception icindeki secret sentinel yanita veya loglara sizdirilmaz', async () => {
  const SECRET_SENTINEL = 'SECRET_SENTINEL_EXCEPTION_VAL_948172';
  const interceptedLogs = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args) => interceptedLogs.push(args.join(' '));
  console.warn = (...args) => interceptedLogs.push(args.join(' '));

  try {
    const mockAdmin = createSyntheticSupabaseAdmin();
    const getProdEnv = (k) => (k === 'ENVIRONMENT' ? 'production' : undefined);

    const req = createMockRequest('POST', {
      tenantId: 'tenant_secret_leak_2'
    });

    const res = await handleSubscriptionSync(req, {
      supabaseAdmin: mockAdmin,
      getEnv: getProdEnv,
      verifyProviderStatus: async () => {
        throw new Error(`Critical provider connection failure with key: ${SECRET_SENTINEL}`);
      }
    });

    assert.strictEqual(res.status, 503);
    const bodyText = await res.text();
    assert.strictEqual(bodyText.includes(SECRET_SENTINEL), false, `Secret sentinel response payload icinde bulundu: ${bodyText}`);

    const joinedLogs = interceptedLogs.join(' ');
    assert.strictEqual(joinedLogs.includes(SECRET_SENTINEL), false, `Secret sentinel loglar icinde bulundu: ${joinedLogs}`);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
});

await runAsyncTest('8.3. Beklenmeyen handler exception icindeki secret sentinel yanita veya loglara sizdirilmaz', async () => {
  const SECRET_SENTINEL = 'SECRET_SENTINEL_UNEXPECTED_VAL_556677';
  const interceptedLogs = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args) => interceptedLogs.push(args.join(' '));
  console.warn = (...args) => interceptedLogs.push(args.join(' '));

  try {
    // req.text cagrisi kasitli olarak secret sentinel iceren bir exception firlatir
    const req = {
      method: 'POST',
      headers: new Map(),
      text: async () => {
        throw new Error(`Unexpected internal payload decompression error: ${SECRET_SENTINEL}`);
      }
    };

    const res = await handleSubscriptionSync(req);
    assert.strictEqual(res.status, 500);
    const bodyText = await res.text();
    assert.strictEqual(bodyText.includes(SECRET_SENTINEL), false, `Secret sentinel response payload icinde bulundu: ${bodyText}`);

    const joinedLogs = interceptedLogs.join(' ');
    assert.strictEqual(joinedLogs.includes(SECRET_SENTINEL), false, `Secret sentinel loglar icinde bulundu: ${joinedLogs}`);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
});

// ---------------------------------------------------------------------------
// 9. HTTP PROTOKOLU VE VALIDASYON TESTLERI
// ---------------------------------------------------------------------------
await runAsyncTest('9.1. OPTIONS metodu CORS headers ile 200 doner', async () => {
  const req = createMockRequest('OPTIONS');
  const res = await handleSubscriptionSync(req);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('Access-Control-Allow-Origin') || res.headers.get('access-control-allow-origin'), '*');
});

await runAsyncTest('9.2. GET metodu HTTP 405 METHOD_NOT_ALLOWED doner', async () => {
  const req = createMockRequest('GET');
  const res = await handleSubscriptionSync(req);
  assert.strictEqual(res.status, 405);
  const body = await res.json();
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.errorCode, 'METHOD_NOT_ALLOWED');
});

await runAsyncTest('9.3. Gecersiz JSON body HTTP 400 INVALID_JSON doner', async () => {
  const req = {
    method: 'POST',
    text: async () => 'not_json_string{',
    json: async () => { throw new Error('Invalid JSON'); }
  };
  const res = await handleSubscriptionSync(req);
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.errorCode, 'INVALID_JSON');
});

await runAsyncTest('9.4. Eksik tenantId HTTP 400 MISSING_TENANT_ID doner', async () => {
  const req = createMockRequest('POST', { tenantId: '' });
  const res = await handleSubscriptionSync(req);
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.errorCode, 'MISSING_TENANT_ID');
});

await runAsyncTest('9.5. diagnostic=true cagrisi ortam degiskenlerini kontrol eder ve 200 doner', async () => {
  const req = createMockRequest('POST', { diagnostic: true });
  const res = await handleSubscriptionSync(req, {
    getEnv: (k) => (k === 'IYZICO_API_KEY' ? 'test_key' : undefined)
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.mode, 'diagnostic');
  assert.strictEqual(body.functionName, 'subscription-sync');
  assert.strictEqual(body.requiredEnvPresent.IYZICO_API_KEY, true);
  assert.strictEqual(body.canProceed, false);
  assert(body.missingEnvNames.includes('IYZICO_SECRET_KEY'));
});

// ---------------------------------------------------------------------------
// 10. EMBEDDED POSTGRESQL TRANSACTIONAL RPC DB ATOMİSİTE VE ROLLBACK TESTLERİ
// ---------------------------------------------------------------------------
let pgEngine = null;
let pgClient = null;
let disposableTmpDir = null;

async function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function getDisposablePgEngine() {
  if (pgClient) return pgClient;
  const tmpDir = path.join(os.tmpdir(), `pg_lari_subsync_${Date.now()}_${Math.floor(Math.random() * 10000)}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  disposableTmpDir = tmpDir;

  const port = await getAvailablePort();
  const pg = new EmbeddedPostgres({
    databaseDir: tmpDir,
    port,
    user: 'postgres',
    password: 'password',
    initdbFlags: ['--locale=C', '--encoding=UTF8'],
    persistent: false
  });

  await pg.initialise();
  await pg.start();
  pgEngine = pg;

  const client = pg.getPgClient();
  await client.connect();
  await client.query(`ALTER DATABASE postgres SET synchronous_commit = 'off'; SET synchronous_commit = 'off';`);
  pgClient = client;

  // Supabase / Postgres yetkilendirme rolleri
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
      END IF;
    END $$;
  `);

  // Temel üretim şeması tabloları (001_initial_schema ile tam uyumlu)
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS public;
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS public.tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      plan_id VARCHAR(50),
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      action VARCHAR(255) NOT NULL,
      details JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // 20260902 surumlenen migration dosyasini dogrudan diskten oku ve uygula (inline fallback yok)
  const migPath = path.join(rootDir, 'supabase', 'migrations', '20260902_subscription_sync_transaction.sql');
  assert(fs.existsSync(migPath), 'Surumlenen migration dosyasi diskte bulunamadi: ' + migPath);
  const migSql = fs.readFileSync(migPath, 'utf8');
  await client.query(migSql);

  return client;
}

function createPgBackedSupabaseAdmin(client) {
  return {
    rpc: async (functionName, params = {}) => {
      if (functionName === 'execute_subscription_sync_transaction') {
        const {
          p_tenant_id,
          p_subscription_status,
          p_tenant_status,
          p_mode = 'sync_verified',
          p_provider_status = null,
          p_audit_details = {}
        } = params;

        try {
          const sql = `
            SELECT public.execute_subscription_sync_transaction(
              p_tenant_id := $1,
              p_subscription_status := $2,
              p_tenant_status := $3,
              p_mode := $4,
              p_provider_status := $5,
              p_audit_details := $6::jsonb
            ) AS result;
          `;
          const res = await client.query(sql, [
            p_tenant_id,
            p_subscription_status,
            p_tenant_status,
            p_mode,
            p_provider_status,
            JSON.stringify(p_audit_details)
          ]);
          const data = res.rows[0]?.result;
          return { data, error: null };
        } catch (err) {
          return {
            data: null,
            error: {
              message: err.message,
              code: err.code || 'PG_ERROR'
            }
          };
        }
      }
      return {
        data: null,
        error: {
          message: `Unknown RPC function: ${functionName}`,
          code: 'RPC_NOT_FOUND'
        }
      };
    }
  };
}

await runAsyncTest('10.1. [GERÇEK DB DOĞRULAMA] 20260902 migration Disposable Postgres üzerine uygulandı ve RPC hazır', async () => {
  const db = await getDisposablePgEngine();
  const res = await db.query(`
    SELECT proname, prosecdef FROM pg_proc
    JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
    WHERE proname = 'execute_subscription_sync_transaction' AND nspname = 'public';
  `);
  assert.strictEqual(res.rows.length, 1, 'execute_subscription_sync_transaction fonksiyonu DB icinde bulunamadi');
  assert.strictEqual(res.rows[0].prosecdef, true, 'Fonksiyon SECURITY DEFINER olmalidir');
});

await runAsyncTest('10.2. [GERÇEK DB BAŞARILI TRANSACTION] Sağlayıcı "past_due" döndüğünde handler gerçek RPC ile subscription=past_due, tenant=suspended yapar ve audit kaydeder', async () => {
  const db = await getDisposablePgEngine();
  const pgAdmin = createPgBackedSupabaseAdmin(db);

  const tenantRes = await db.query("INSERT INTO public.tenants (name, status) VALUES ('Salon Real DB 1', 'active') RETURNING id;");
  const tenantId = tenantRes.rows[0].id;

  await db.query("INSERT INTO public.subscriptions (tenant_id, status) VALUES ($1, 'active');", [tenantId]);

  const req = createMockRequest('POST', { tenantId });
  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: pgAdmin,
    getEnv: (k) => (k === 'ENVIRONMENT' ? 'production' : undefined),
    verifyProviderStatus: async () => ({
      verified: true,
      status: 'past_due'
    })
  });

  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.activated, false);
  assert.strictEqual(body.subscriptionStatus, 'past_due');
  assert.strictEqual(body.tenantStatus, 'suspended');

  // Gerçek Postgres tablolarını doğrudan doğrula
  const subDb = await db.query("SELECT status FROM public.subscriptions WHERE tenant_id = $1;", [tenantId]);
  const tenantDb = await db.query("SELECT status FROM public.tenants WHERE id = $1;", [tenantId]);
  const auditDb = await db.query("SELECT action, details FROM public.audit_logs WHERE tenant_id = $1;", [tenantId]);

  assert.strictEqual(subDb.rows[0].status, 'past_due');
  assert.strictEqual(tenantDb.rows[0].status, 'suspended');
  assert.strictEqual(auditDb.rows.length, 1);
  assert.strictEqual(auditDb.rows[0].action, 'subscription_sync');
  assert.strictEqual(auditDb.rows[0].details.subscriptionStatus, 'past_due');
  assert.strictEqual(auditDb.rows[0].details.tenantStatus, 'suspended');
});

await runAsyncTest('10.3. [GERÇEK DB BAŞARILI TRANSACTION] Sağlayıcı "active" döndüğünde handler gerçek RPC ile subscription=active ve tenant=active yapar', async () => {
  const db = await getDisposablePgEngine();
  const pgAdmin = createPgBackedSupabaseAdmin(db);

  const tenantRes = await db.query("INSERT INTO public.tenants (name, status) VALUES ('Salon Real DB 2', 'suspended') RETURNING id;");
  const tenantId = tenantRes.rows[0].id;

  await db.query("INSERT INTO public.subscriptions (tenant_id, status) VALUES ($1, 'suspended');", [tenantId]);

  const req = createMockRequest('POST', { tenantId });
  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: pgAdmin,
    getEnv: (k) => (k === 'ENVIRONMENT' ? 'production' : undefined),
    verifyProviderStatus: async () => ({
      verified: true,
      status: 'active'
    })
  });

  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.activated, true);
  assert.strictEqual(body.subscriptionStatus, 'active');
  assert.strictEqual(body.tenantStatus, 'active');

  const subDb = await db.query("SELECT status FROM public.subscriptions WHERE tenant_id = $1;", [tenantId]);
  const tenantDb = await db.query("SELECT status FROM public.tenants WHERE id = $1;", [tenantId]);
  const auditDb = await db.query("SELECT count(*) FROM public.audit_logs WHERE tenant_id = $1;", [tenantId]);

  assert.strictEqual(subDb.rows[0].status, 'active');
  assert.strictEqual(tenantDb.rows[0].status, 'active');
  assert.strictEqual(Number(auditDb.rows[0].count), 1);
});

await runAsyncTest('10.4. [GERÇEK DB ATOMİK ROLLBACK: SUBSCRIPTION UPDATE FAIL] Subscriptions yazımında hata oluştuğunda HTTP 503 döner ve 3 tablo da başlangıç durumunu korur', async () => {
  const db = await getDisposablePgEngine();
  const pgAdmin = createPgBackedSupabaseAdmin(db);

  const tenantRes = await db.query("INSERT INTO public.tenants (name, status) VALUES ('Salon Rollback Sub', 'active') RETURNING id;");
  const tenantId = tenantRes.rows[0].id;

  await db.query("INSERT INTO public.subscriptions (tenant_id, status) VALUES ($1, 'active');", [tenantId]);

  // Subscriptions tablosuna kasıtlı hata fırlatan BEFORE UPDATE trigger ekle
  await db.query(`
    CREATE OR REPLACE FUNCTION trg_fail_sub() RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'MOCK_PG_FAIL_SUBSCRIPTIONS_UPDATE';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_test_sub BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION trg_fail_sub();
  `);

  try {
    const req = createMockRequest('POST', { tenantId });
    const res = await handleSubscriptionSync(req, {
      supabaseAdmin: pgAdmin,
      getEnv: (k) => (k === 'ENVIRONMENT' ? 'production' : undefined),
      verifyProviderStatus: async () => ({
        verified: true,
        status: 'past_due'
      })
    });

    assert.strictEqual(res.status, 503, 'DB hatasinda 503 donulmelidir');
    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.errorCode, 'SUBSCRIPTION_SYNC_TRANSACTION_FAILED');
    assert.strictEqual(body.activated, false);

    // Atomik durum doğrulaması: hiçbir tablo değişmemiş olmalı
    const subDb = await db.query("SELECT status FROM public.subscriptions WHERE tenant_id = $1;", [tenantId]);
    const tenantDb = await db.query("SELECT status FROM public.tenants WHERE id = $1;", [tenantId]);
    const auditDb = await db.query("SELECT count(*) FROM public.audit_logs WHERE tenant_id = $1;", [tenantId]);

    assert.strictEqual(subDb.rows[0].status, 'active', 'Subscription baslangic durumunu korumalidir');
    assert.strictEqual(tenantDb.rows[0].status, 'active', 'Tenant baslangic durumunu korumalidir');
    assert.strictEqual(Number(auditDb.rows[0].count), 0, 'Audit log olusmamalidir');
  } finally {
    await db.query("DROP TRIGGER IF EXISTS trg_test_sub ON public.subscriptions;");
    await db.query("DROP FUNCTION IF EXISTS trg_fail_sub();");
  }
});

await runAsyncTest('10.5. [GERÇEK DB ATOMİK ROLLBACK: TENANT UPDATE FAIL] Tenants yazımında hata oluştuğunda subscription güncellemesi ROLLBACK edilir ve 3 tablo da başlangıç durumunu korur', async () => {
  const db = await getDisposablePgEngine();
  const pgAdmin = createPgBackedSupabaseAdmin(db);

  const tenantRes = await db.query("INSERT INTO public.tenants (name, status) VALUES ('Salon Rollback Tenant', 'active') RETURNING id;");
  const tenantId = tenantRes.rows[0].id;

  await db.query("INSERT INTO public.subscriptions (tenant_id, status) VALUES ($1, 'active');", [tenantId]);

  // Tenants tablosuna kasıtlı hata fırlatan BEFORE UPDATE trigger ekle
  // RPC akışında subscriptions update ÖNCE, tenants update SONRA çalışır.
  // Tenants patladığında ilk adımın (subscriptions update) PostgreSQL transaction rollback ile geri alındığını kanıtlar.
  await db.query(`
    CREATE OR REPLACE FUNCTION trg_fail_tenant() RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'MOCK_PG_FAIL_TENANTS_UPDATE';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_test_tenant BEFORE UPDATE ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION trg_fail_tenant();
  `);

  try {
    const req = createMockRequest('POST', { tenantId });
    const res = await handleSubscriptionSync(req, {
      supabaseAdmin: pgAdmin,
      getEnv: (k) => (k === 'ENVIRONMENT' ? 'production' : undefined),
      verifyProviderStatus: async () => ({
        verified: true,
        status: 'past_due'
      })
    });

    assert.strictEqual(res.status, 503);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.errorCode, 'SUBSCRIPTION_SYNC_TRANSACTION_FAILED');

    // KRİTİK ATOMİK ROLLBACK DENETİMİ:
    // Subscriptions tablosu 'past_due' yapılmış olsa dahi, tenant hatası nedeniyle rollback edilip 'active' kalmalıdır!
    const subDb = await db.query("SELECT status FROM public.subscriptions WHERE tenant_id = $1;", [tenantId]);
    const tenantDb = await db.query("SELECT status FROM public.tenants WHERE id = $1;", [tenantId]);
    const auditDb = await db.query("SELECT count(*) FROM public.audit_logs WHERE tenant_id = $1;", [tenantId]);

    assert.strictEqual(subDb.rows[0].status, 'active', 'Subscription rollback edilmeli ve baslangic durumunu korumalidir');
    assert.strictEqual(tenantDb.rows[0].status, 'active', 'Tenant baslangic durumunu korumalidir');
    assert.strictEqual(Number(auditDb.rows[0].count), 0, 'Audit log olusmamalidir');
  } finally {
    await db.query("DROP TRIGGER IF EXISTS trg_test_tenant ON public.tenants;");
    await db.query("DROP FUNCTION IF EXISTS trg_fail_tenant();");
  }
});

await runAsyncTest('10.6. [GERÇEK DB ATOMİK ROLLBACK: AUDIT INSERT FAIL] Audit insert hatasında hem subscription hem tenant güncellemeleri ROLLBACK edilir', async () => {
  const db = await getDisposablePgEngine();
  const pgAdmin = createPgBackedSupabaseAdmin(db);

  const tenantRes = await db.query("INSERT INTO public.tenants (name, status) VALUES ('Salon Rollback Audit', 'active') RETURNING id;");
  const tenantId = tenantRes.rows[0].id;

  await db.query("INSERT INTO public.subscriptions (tenant_id, status) VALUES ($1, 'active');", [tenantId]);

  // Audit logs tablosuna kasıtlı hata fırlatan BEFORE INSERT trigger ekle
  // RPC akışında subscriptions ve tenants güncellendikten SONRA audit_logs'a insert yapılır.
  // Audit patladığında önceki iki tablonun ikisinin de PostgreSQL transaction rollback ile geri alındığını kanıtlar.
  await db.query(`
    CREATE OR REPLACE FUNCTION trg_fail_audit() RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'MOCK_PG_FAIL_AUDIT_INSERT';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_test_audit BEFORE INSERT ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION trg_fail_audit();
  `);

  try {
    const req = createMockRequest('POST', { tenantId });
    const res = await handleSubscriptionSync(req, {
      supabaseAdmin: pgAdmin,
      getEnv: (k) => (k === 'ENVIRONMENT' ? 'production' : undefined),
      verifyProviderStatus: async () => ({
        verified: true,
        status: 'past_due'
      })
    });

    assert.strictEqual(res.status, 503);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.errorCode, 'SUBSCRIPTION_SYNC_TRANSACTION_FAILED');

    // KRİTİK ATOMİK ROLLBACK DENETİMİ:
    // Subscriptions ve tenants ikisi de başlangıçtaki 'active' durumunu korumalıdır
    const subDb = await db.query("SELECT status FROM public.subscriptions WHERE tenant_id = $1;", [tenantId]);
    const tenantDb = await db.query("SELECT status FROM public.tenants WHERE id = $1;", [tenantId]);
    const auditDb = await db.query("SELECT count(*) FROM public.audit_logs WHERE tenant_id = $1;", [tenantId]);

    assert.strictEqual(subDb.rows[0].status, 'active', 'Subscription rollback edilmeli');
    assert.strictEqual(tenantDb.rows[0].status, 'active', 'Tenant rollback edilmeli');
    assert.strictEqual(Number(auditDb.rows[0].count), 0, 'Audit log olusmamalidir');
  } finally {
    await db.query("DROP TRIGGER IF EXISTS trg_test_audit ON public.audit_logs;");
    await db.query("DROP FUNCTION IF EXISTS trg_fail_audit();");
  }
});

await runAsyncTest('10.7. [GERÇEK DB INVARIANT VIOLATION] Abonelik active/trialing degilken tenant active yapilamaz (FAIL_CLOSED_VIOLATION)', async () => {
  const db = await getDisposablePgEngine();
  const tenantRes = await db.query("INSERT INTO public.tenants (name, status) VALUES ('Salon Invariant Test', 'suspended') RETURNING id;");
  const tenantId = tenantRes.rows[0].id;
  await db.query("INSERT INTO public.subscriptions (tenant_id, status) VALUES ($1, 'suspended');", [tenantId]);

  // Doğrudan RPC düzeyinde invariant ihlali çağrısı
  const rpcRes = await db.query(`
    SELECT public.execute_subscription_sync_transaction(
      p_tenant_id := $1,
      p_subscription_status := 'past_due',
      p_tenant_status := 'active',
      p_mode := 'test'
    ) AS res;
  `, [tenantId]);

  const data = rpcRes.rows[0].res;
  assert.strictEqual(data.success, false);
  assert.strictEqual(data.code, 'FAIL_CLOSED_VIOLATION');

  // DB durumunu kontrol et: tenant active OLMAMALIDIR
  const tenantDb = await db.query("SELECT status FROM public.tenants WHERE id = $1;", [tenantId]);
  assert.strictEqual(tenantDb.rows[0].status, 'suspended', 'Fail-closed invariant ihlalinde tenant asla active yapilamaz');
});

await runAsyncTest('10.8. [GERÇEK DB TENANT_NOT_FOUND] Var olmayan tenant için RPC TENANT_NOT_FOUND döner ve handler 503 üretir', async () => {
  const db = await getDisposablePgEngine();
  const pgAdmin = createPgBackedSupabaseAdmin(db);
  const nonExistentTenantId = '00000000-0000-0000-0000-000000000999';

  const req = createMockRequest('POST', { tenantId: nonExistentTenantId });
  const res = await handleSubscriptionSync(req, {
    supabaseAdmin: pgAdmin,
    getEnv: (k) => (k === 'ENVIRONMENT' ? 'production' : undefined),
    verifyProviderStatus: async () => ({
      verified: true,
      status: 'active'
    })
  });

  assert.strictEqual(res.status, 503);
  const body = await res.json();
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.errorCode, 'SUBSCRIPTION_SYNC_TRANSACTION_FAILED');
  assert.strictEqual(body.activated, false);

  const subDb = await db.query("SELECT count(*) FROM public.subscriptions WHERE tenant_id = $1;", [nonExistentTenantId]);
  assert.strictEqual(Number(subDb.rows[0].count), 0);
});

// Temizlik: Disposable PostgreSQL istemcisini ve sunucusunu kapat
if (pgClient) {
  try {
    await pgClient.end();
  } catch (err) {}
}
if (pgEngine) {
  try {
    await pgEngine.stop();
  } catch (err) {}
}
if (disposableTmpDir) {
  try {
    fs.rmSync(disposableTmpDir, { recursive: true, force: true });
  } catch {}
}

console.log('\n================================================================================');
console.log(`=== TUM TESTLER BASARIYLA TAMAMLANDI: ${passedTests} / ${totalTests} TEST GECTI ===`);
console.log('================================================================================');

process.exit(0);
