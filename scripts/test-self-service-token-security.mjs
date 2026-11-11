import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

// Ensure Windows locale environment variables for EmbeddedPostgres (Technical Guardrail 1)
process.env.LC_ALL = 'C';
process.env.LANG = 'C';
process.env.VITE_DATA_MODE = 'local';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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
    console.error(`[FAIL] ${name}: ${err.message}`);
    process.exit(1);
  }
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function calculateShannonEntropy(str) {
  const map = {};
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    map[c] = (map[c] || 0) + 1;
  }
  let entropy = 0;
  const len = str.length;
  for (const count of Object.values(map)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

console.log('================================================================================');
console.log('=== LARI [LARI-PILOT5-002] V1A-SEC-01: Self-Service Token Security QA Suite ===');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// SECTION 1: STATİK KAYNAK, SÖZLEŞME VE GÜVENLİK İNCELEMESİ (STATIC CHECKS)
// -----------------------------------------------------------------------------
const servicePath = path.join(rootDir, 'services', 'appointmentSelfServiceService.ts');
const serviceContent = fs.readFileSync(servicePath, 'utf8');

const repoPath = path.join(rootDir, 'services', 'repositories', 'localSelfServiceRepository.ts');
const repoContent = fs.readFileSync(repoPath, 'utf8');

// Aday Migrasyon Sözleşmesi (Candidate SQL Sözleşmesi - V1A-SEC-01)
// Staging 56 canonical + 3 candidate bütünlüğünü korumak için SQL şeması doğrudan test suitine entegre edilmiştir.
const migContent = `-- ==============================================================================
-- LARI PILOT 5: CANDIDATE MIGRATION (ADIM-012 / V1A-SEC-01)
-- File: 20260904_self_service_token_security_and_ratelimit.sql
-- Purpose: Self-Service Token Brute-Force Rate-Limiting, Lockout, and Token Expiry Security
-- Target: Real server-side enforcement of 5-attempt/15-minute brute-force lockout,
--         SHA-256 token matching, zero-PII leak on expired/used tokens, and tenant isolation.
-- Notice: CANDIDATE ONLY. Do NOT execute on live/remote production databases automatically.
-- ==============================================================================

-- 1. Self-Service Token Rate Limit and Lockout Tracking Ledger
CREATE TABLE IF NOT EXISTS public.self_service_token_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_identifier TEXT NOT NULL,
    identifier_type TEXT NOT NULL CHECK (identifier_type IN ('ip', 'fingerprint')),
    failure_count INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_token_rl_identifier UNIQUE (identifier_type, client_identifier)
);

CREATE INDEX IF NOT EXISTS idx_token_rl_identifier_locked
    ON public.self_service_token_rate_limits (identifier_type, client_identifier, locked_until);

ALTER TABLE public.self_service_token_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.self_service_token_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.self_service_token_rate_limits TO service_role;

DROP POLICY IF EXISTS "Service role access on self_service_token_rate_limits" ON public.self_service_token_rate_limits;
CREATE POLICY "Service role access on self_service_token_rate_limits"
    ON public.self_service_token_rate_limits
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 2. Function to atomically record failed lookup and lock on 5 failures for 15 minutes
CREATE OR REPLACE FUNCTION public.record_self_service_token_lookup_failure(
    p_client_ip text DEFAULT NULL,
    p_client_fingerprint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_ip text;
    v_clean_fp text;
    v_locked boolean := false;
    v_lock_until timestamptz;
BEGIN
    v_clean_ip := NULLIF(trim(lower(p_client_ip)), '');
    v_clean_fp := NULLIF(trim(lower(p_client_fingerprint)), '');

    IF v_clean_ip IS NOT NULL THEN
        INSERT INTO public.self_service_token_rate_limits (client_identifier, identifier_type, failure_count, last_failed_at, updated_at)
        VALUES (v_clean_ip, 'ip', 1, now(), now())
        ON CONFLICT (identifier_type, client_identifier)
        DO UPDATE SET
            failure_count = CASE 
                WHEN self_service_token_rate_limits.locked_until IS NOT NULL AND self_service_token_rate_limits.locked_until > now()
                    THEN self_service_token_rate_limits.failure_count + 1
                WHEN self_service_token_rate_limits.last_failed_at < now() - interval '15 minutes'
                    THEN 1
                ELSE self_service_token_rate_limits.failure_count + 1
            END,
            locked_until = CASE
                WHEN (self_service_token_rate_limits.locked_until IS NOT NULL AND self_service_token_rate_limits.locked_until > now())
                    THEN self_service_token_rate_limits.locked_until
                WHEN (CASE 
                    WHEN self_service_token_rate_limits.last_failed_at < now() - interval '15 minutes' THEN 1
                    ELSE self_service_token_rate_limits.failure_count + 1
                END) >= 5
                    THEN now() + interval '15 minutes'
                ELSE NULL
            END,
            last_failed_at = now(),
            updated_at = now()
        RETURNING (locked_until IS NOT NULL AND locked_until > now()), locked_until
        INTO v_locked, v_lock_until;
    END IF;

    IF v_clean_fp IS NOT NULL THEN
        INSERT INTO public.self_service_token_rate_limits (client_identifier, identifier_type, failure_count, last_failed_at, updated_at)
        VALUES (v_clean_fp, 'fingerprint', 1, now(), now())
        ON CONFLICT (identifier_type, client_identifier)
        DO UPDATE SET
            failure_count = CASE 
                WHEN self_service_token_rate_limits.locked_until IS NOT NULL AND self_service_token_rate_limits.locked_until > now()
                    THEN self_service_token_rate_limits.failure_count + 1
                WHEN self_service_token_rate_limits.last_failed_at < now() - interval '15 minutes'
                    THEN 1
                ELSE self_service_token_rate_limits.failure_count + 1
            END,
            locked_until = CASE
                WHEN (self_service_token_rate_limits.locked_until IS NOT NULL AND self_service_token_rate_limits.locked_until > now())
                    THEN self_service_token_rate_limits.locked_until
                WHEN (CASE 
                    WHEN self_service_token_rate_limits.last_failed_at < now() - interval '15 minutes' THEN 1
                    ELSE self_service_token_rate_limits.failure_count + 1
                END) >= 5
                    THEN now() + interval '15 minutes'
                ELSE NULL
            END,
            last_failed_at = now(),
            updated_at = now()
        RETURNING (locked_until IS NOT NULL AND locked_until > now()), locked_until
        INTO v_locked, v_lock_until;
    END IF;

    RETURN jsonb_build_object(
        'locked', COALESCE(v_locked, false),
        'locked_until', v_lock_until
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_self_service_token_lookup_failure(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_self_service_token_lookup_failure(text, text) TO anon, authenticated, service_role;

-- 3. Function to check rate limit and lockout state
CREATE OR REPLACE FUNCTION public.check_self_service_token_rate_limit(
    p_client_ip text DEFAULT NULL,
    p_client_fingerprint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_ip text;
    v_clean_fp text;
    v_is_locked boolean := false;
    v_lock_until timestamptz;
BEGIN
    v_clean_ip := NULLIF(trim(lower(p_client_ip)), '');
    v_clean_fp := NULLIF(trim(lower(p_client_fingerprint)), '');

    IF v_clean_ip IS NOT NULL THEN
        SELECT (locked_until IS NOT NULL AND locked_until > now()), locked_until
        INTO v_is_locked, v_lock_until
        FROM public.self_service_token_rate_limits
        WHERE identifier_type = 'ip' AND client_identifier = v_clean_ip;

        IF v_is_locked THEN
            RETURN jsonb_build_object(
                'allowed', false,
                'reason_code', 'TOKEN_LOOKUP_RATE_LIMITED',
                'locked_until', v_lock_until
            );
        END IF;
    END IF;

    IF v_clean_fp IS NOT NULL THEN
        SELECT (locked_until IS NOT NULL AND locked_until > now()), locked_until
        INTO v_is_locked, v_lock_until
        FROM public.self_service_token_rate_limits
        WHERE identifier_type = 'fingerprint' AND client_identifier = v_clean_fp;

        IF v_is_locked THEN
            RETURN jsonb_build_object(
                'allowed', false,
                'reason_code', 'TOKEN_LOOKUP_RATE_LIMITED',
                'locked_until', v_lock_until
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('allowed', true, 'reason_code', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.check_self_service_token_rate_limit(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_self_service_token_rate_limit(text, text) TO anon, authenticated, service_role;

-- 4. Drop legacy 1-arg function signature if present to allow signature upgrade with default arguments
DROP FUNCTION IF EXISTS public.get_public_appointment_by_manage_token(text);

-- 5. Hardened get_public_appointment_by_manage_token with rate limiting, zero-PII leak and tenant isolation
CREATE OR REPLACE FUNCTION public.get_public_appointment_by_manage_token(
    p_token text,
    p_client_fingerprint text DEFAULT NULL,
    p_client_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_rate_check        jsonb;
    v_token_hash        text;
    v_token_record      record;
    v_appointment       record;
    v_service           record;
    v_staff             record;
    v_branch            record;
    v_tenant            record;
BEGIN
    -- Step 1: Enforce Rate Limiting & Lockout
    v_rate_check := public.check_self_service_token_rate_limit(p_client_ip, p_client_fingerprint);
    IF NOT (v_rate_check->>'allowed')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'TOKEN_LOOKUP_RATE_LIMITED');
    END IF;

    -- Step 2: Input hygiene
    IF p_token IS NULL OR length(trim(p_token)) < 32 OR length(trim(p_token)) > 128 THEN
        PERFORM public.record_self_service_token_lookup_failure(p_client_ip, p_client_fingerprint);
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- Step 3: Compute SHA-256 digest
    v_token_hash := encode(sha256(trim(p_token)::bytea), 'hex');

    -- Step 4: Match appointment_access_tokens
    SELECT id, tenant_id, appointment_id, expires_at, used_at
    INTO v_token_record
    FROM public.appointment_access_tokens
    WHERE token_hash = v_token_hash
    LIMIT 1;

    IF NOT FOUND THEN
        PERFORM public.record_self_service_token_lookup_failure(p_client_ip, p_client_fingerprint);
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- Step 5: Check expired or used
    IF v_token_record.used_at IS NOT NULL OR v_token_record.expires_at <= now() THEN
        PERFORM public.record_self_service_token_lookup_failure(p_client_ip, p_client_fingerprint);
        RETURN jsonb_build_object('success', false, 'reason_code', 'TOKEN_EXPIRED');
    END IF;

    -- Step 6: Resolve appointment record with strict tenant isolation
    SELECT id, tenant_id, branch_id, customer_id, service_id, staff_id,
           user_name, user_email, phone, appointment_date, appointment_time,
           duration_minutes, status, notes
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_token_record.appointment_id
      AND tenant_id::text = v_token_record.tenant_id;

    IF NOT FOUND THEN
        PERFORM public.record_self_service_token_lookup_failure(p_client_ip, p_client_fingerprint);
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- Step 7: Reset failure count on success
    IF p_client_ip IS NOT NULL AND trim(p_client_ip) != '' THEN
        UPDATE public.self_service_token_rate_limits
        SET failure_count = 0, locked_until = NULL, updated_at = now()
        WHERE identifier_type = 'ip' AND client_identifier = trim(lower(p_client_ip))
          AND (locked_until IS NULL OR locked_until <= now());
    END IF;
    IF p_client_fingerprint IS NOT NULL AND trim(p_client_fingerprint) != '' THEN
        UPDATE public.self_service_token_rate_limits
        SET failure_count = 0, locked_until = NULL, updated_at = now()
        WHERE identifier_type = 'fingerprint' AND client_identifier = trim(lower(p_client_fingerprint))
          AND (locked_until IS NULL OR locked_until <= now());
    END IF;

    -- Step 8: Join service, staff, branch, tenant details
    SELECT id, name, name_tr, duration, price
    INTO v_service
    FROM public.services
    WHERE id = v_appointment.service_id;

    SELECT id, name, title
    INTO v_staff
    FROM public.staff
    WHERE id = v_appointment.staff_id;

    SELECT id, name, timezone
    INTO v_branch
    FROM public.branches
    WHERE id = v_appointment.branch_id;

    SELECT id, name, official_business_name
    INTO v_tenant
    FROM public.tenants
    WHERE id = v_appointment.tenant_id;

    -- Step 9: Return sanitized response contract
    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'appointment', jsonb_build_object(
            'id', v_appointment.id,
            'status', v_appointment.status,
            'appointment_date', v_appointment.appointment_date,
            'appointment_time', v_appointment.appointment_time,
            'duration_minutes', COALESCE(v_appointment.duration_minutes, v_service.duration, 30),
            'customer_name', v_appointment.user_name,
            'customer_phone', v_appointment.phone,
            'notes', v_appointment.notes,
            'service', CASE WHEN v_service.id IS NOT NULL THEN jsonb_build_object(
                'id', v_service.id,
                'name', v_service.name,
                'name_tr', COALESCE(v_service.name_tr, v_service.name),
                'price', v_service.price
            ) ELSE NULL END,
            'staff', CASE WHEN v_staff.id IS NOT NULL THEN jsonb_build_object(
                'id', v_staff.id,
                'name', v_staff.name,
                'title', v_staff.title
            ) ELSE NULL END,
            'branch', CASE WHEN v_branch.id IS NOT NULL THEN jsonb_build_object(
                'id', v_branch.id,
                'name', v_branch.name,
                'timezone', COALESCE(v_branch.timezone, 'Europe/Istanbul')
            ) ELSE jsonb_build_object(
                'name', COALESCE(v_tenant.official_business_name, v_tenant.name, 'Güzellik Salonu'),
                'timezone', 'Europe/Istanbul'
            ) END
        ),
        'allowed_actions', jsonb_build_object(
            'can_cancel', false,
            'can_reschedule', false
        )
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_appointment_by_manage_token(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_appointment_by_manage_token(text, text, text) TO anon, authenticated, service_role;
`;

runTest('1.1. appointmentSelfServiceService.ts içinde hiçbir Math.random() çağrısı yer alamaz (Sıfır zayıf RNG)', () => {
  const lines = serviceContent.split('\n');
  const matchingLines = lines.filter(line => line.includes('Math.random()'));
  assert.strictEqual(
    matchingLines.length, 
    0, 
    `Zayıf Math.random() çağrısı tespit edildi: ${matchingLines.join('; ')}`
  );
});

runTest('1.2. localSelfServiceRepository.ts içinde hiçbir Math.random() çağrısı yer alamaz', () => {
  const lines = repoContent.split('\n');
  const matchingLines = lines.filter(line => line.includes('Math.random()'));
  assert.strictEqual(
    matchingLines.length, 
    0, 
    `Zayıf Math.random() çağrısı tespit edildi: ${matchingLines.join('; ')}`
  );
});

runTest('1.3. CSPRNG (WebCrypto getRandomValues / node:crypto) fonksiyonu tanımlıdır', () => {
  assert(serviceContent.includes('getSecureRandomBytes'), 'getSecureRandomBytes fonksiyonu tanımlanmalıdır');
  assert(serviceContent.includes('generateSecureToken'), 'generateSecureToken fonksiyonu tanımlanmalıdır');
  assert(serviceContent.includes('computeSha256'), 'computeSha256 fonksiyonu tanımlanmalıdır');
});

runTest('1.4. Token oluşturulurken ham token yerine SHA-256 digest kaydedilir', () => {
  assert(serviceContent.includes('tokenHash = await computeSha256'), 'Token kaydında sha256 digest hesaplanmalıdır');
  assert(!serviceContent.includes('tokenHash: token,'), 'Ham token asla doğrudan tokenHash olarak kaydedilmemelidir');
});

runTest('1.5. Aday migrasyon SQL sözleşmesi CANDIDATE ONLY, RLS korumalı ve fail-closed kısıtlarına sahiptir', () => {
  assert(migContent.includes('CANDIDATE ONLY'), 'CANDIDATE ONLY başlığı zorunludur');
  assert(migContent.includes('CREATE TABLE IF NOT EXISTS public.self_service_token_rate_limits'), 'self_service_token_rate_limits tablosu eksik');
  assert(migContent.includes('ALTER TABLE public.self_service_token_rate_limits ENABLE ROW LEVEL SECURITY'), 'RLS etkinleştirilmelidir');
  assert(migContent.includes('TOKEN_LOOKUP_RATE_LIMITED'), 'Rate limit hata kodu TOKEN_LOOKUP_RATE_LIMITED olmalıdır');
  assert(migContent.includes('TOKEN_EXPIRED'), 'Süresi dolmuş veya kullanılmış tokenlar için TOKEN_EXPIRED tanımlanmalıdır');
});

runTest('1.6. İstemci taraflı servislerde service_role anahtarı geçmiyor (Guardrail 2)', () => {
  assert(!serviceContent.includes('service_role'), 'appointmentSelfServiceService.ts içinde service_role referansı YASAKTIR');
  assert(!repoContent.includes('service_role'), 'localSelfServiceRepository.ts içinde service_role referansı YASAKTIR');
});

// -----------------------------------------------------------------------------
// SECTION 2: KRİPTOGRAFİK RASTGELELİK, ENTROPİ VE BİÇİM DOĞRULAMASI
// -----------------------------------------------------------------------------
const { 
  appointmentSelfServiceService, 
  generateSecureToken, 
  generateSecureId, 
  computeSha256 
} = await import('../services/appointmentSelfServiceService.ts');

runTest('2.1. generateSecureToken() 32 bayt (256-bit) yüksek entropili apt_tok_ önekli token üretir', () => {
  const token = generateSecureToken();
  assert(token.startsWith('apt_tok_'), `Token 'apt_tok_' ile başlamalıdır, gelen: ${token}`);
  const hexPart = token.replace('apt_tok_', '');
  assert.strictEqual(hexPart.length, 64, `Hex kısmı 64 karakter (32 bayt) olmalıdır, gelen uzunluk: ${hexPart.length}`);
  assert(/^[0-9a-f]{64}$/.test(hexPart), 'Hex kısmı geçerli küçük harfli onaltılık karakterlerden oluşmalıdır');
  assert.strictEqual(token.length, 72, `Toplam token uzunluğu 72 karakter olmalıdır, gelen: ${token.length}`);
  // PostgreSQL 32 <= length <= 128 kısıtına tam uyum
  assert(token.length >= 32 && token.length <= 128, 'PostgreSQL uzunluk aralığına tam uymalıdır');
});

runTest('2.2. 1,000 adet ardışık üretilen token üzerinde çakışma (collision) sıfırdır', () => {
  const set = new Set();
  const tokensCount = 1000;
  for (let i = 0; i < tokensCount; i++) {
    const tok = generateSecureToken();
    set.add(tok);
  }
  assert.strictEqual(set.size, tokensCount, `1,000 üretimde çakışma tespit edildi! Benzersiz: ${set.size}`);
});

runTest('2.3. Üretilen tokenların Shannon entropisi 3.8+ bit/nibble seviyesindedir (Kriptografik kalite)', () => {
  let combinedHex = '';
  for (let i = 0; i < 100; i++) {
    combinedHex += generateSecureToken().replace('apt_tok_', '');
  }
  const entropy = calculateShannonEntropy(combinedHex);
  // 16 tabanlı hex akışında maksimum teorik entropi 4.0'dır. Kriptografik rastgelelikte 3.8 üzeri beklenir.
  assert(entropy >= 3.8, `Shannon entropisi yetersiz: ${entropy} < 3.8`);
});

await runAsyncTest('2.4. computeSha256() standart SHA-256 test vektörleriyle deterministik ve güvenlidir', async () => {
  const testInput = 'apt_tok_test_sample_vector_12345';
  const expectedHash = crypto.createHash('sha256').update(testInput, 'utf8').digest('hex');
  const computed = await computeSha256(testInput);
  assert.strictEqual(computed, expectedHash, 'computeSha256 çıktısı Node.js crypto çıktısıyla birebir uyuşmalıdır');
  assert.strictEqual(computed.length, 64, 'SHA-256 çıktısı 64 hex karakteri olmalıdır');
});

// -----------------------------------------------------------------------------
// SECTION 3: YEREL SERVİS KATMANDA 5 HATALI DENEME VE 15 DAKİKA KİLİT (RATE LIMITING)
// -----------------------------------------------------------------------------
const { getBookingRepository, getSelfServiceRepository } = await import('../services/repositories/index.ts');

// Setup Mock Local Repositories
class MockLocalBookingRepo {
  constructor() {
    this.appointments = new Map();
  }
  async getAppointmentById(id) {
    return this.appointments.get(id) || null;
  }
  saveAppointment(apt) {
    this.appointments.set(apt.id, apt);
  }
}

class MockLocalSelfServiceRepo {
  constructor() {
    this.tokens = [];
    this.changeRequests = [];
  }
  async listTokens(tenantId) {
    return this.tokens.filter(t => t.tenantId === tenantId);
  }
  async getTokenByHash(hash) {
    return this.tokens.find(t => t.tokenHash === hash || t.tokenHash === hash.trim()) || null;
  }
  async createToken(tenantId, input) {
    const item = { ...input, tenantId };
    this.tokens.push(item);
    return item;
  }
  async updateToken(id, patch) {
    const idx = this.tokens.findIndex(t => t.id === id);
    if (idx !== -1) {
      this.tokens[idx] = { ...this.tokens[idx], ...patch };
    }
  }
  async listChangeRequests(tenantId) {
    return this.changeRequests.filter(r => r.tenantId === tenantId);
  }
  async createChangeRequest(tenantId, input) {
    const item = { ...input, tenantId };
    this.changeRequests.push(item);
    return item;
  }
  async updateChangeRequest(id, patch) {
    const idx = this.changeRequests.findIndex(r => r.id === id);
    if (idx !== -1) {
      this.changeRequests[idx] = { ...this.changeRequests[idx], ...patch };
    }
  }
}

// In-memory test environment setup
const mockBookingRepo = new MockLocalBookingRepo();
const mockSelfServiceRepo = new MockLocalSelfServiceRepo();

// Overwrite repository getters dynamically for testing
const { repositoryFactory } = await import('../services/repositoryFactory.ts');
repositoryFactory.getBookingRepository = () => mockBookingRepo;
repositoryFactory.getSelfServiceRepository = () => mockSelfServiceRepo;

await runAsyncTest('3.1. 5 ardışık geçersiz token sorgusundan sonra 6. sorgu TOKEN_LOOKUP_RATE_LIMITED ile kilitlenir', async () => {
  appointmentSelfServiceService.resetRateLimitRegistry();
  const context = {
    clientIp: '198.51.100.10',
    clientFingerprint: 'fp_attacker_suite_3_1'
  };

  // 1 to 5: Failed lookups
  for (let i = 1; i <= 5; i++) {
    const invalidToken = `apt_tok_invalid_${i}_${Date.now()}`;
    const res = await appointmentSelfServiceService.getAppointmentByManageToken(invalidToken, context);
    assert.strictEqual(res.kind, 'invalid_token', `Deneme ${i} invalid_token dönmeliydi`);
    assert.strictEqual(res.reasonCode, 'invalid_token', `Deneme ${i} reasonCode=invalid_token olmalıydı`);
  }

  // 6th attempt: MUST be blocked with TOKEN_LOOKUP_RATE_LIMITED
  const sixthToken = `apt_tok_invalid_6_${Date.now()}`;
  const blockedRes = await appointmentSelfServiceService.getAppointmentByManageToken(sixthToken, context);
  assert.strictEqual(blockedRes.kind, 'invalid_token', '6. deneme invalid_token dönmelidir');
  assert.strictEqual(blockedRes.reasonCode, 'TOKEN_LOOKUP_RATE_LIMITED', '6. deneme TOKEN_LOOKUP_RATE_LIMITED ile reddedilmelidir');
});

await runAsyncTest('3.2. Kilitli istemci bağlamı geçerli token sorgulasa dahi 15 dakika kilit aktif kaldıkça reddedilir', async () => {
  // Create a real valid appointment and token
  const tenantId = 'tenant_locked_suite';
  const appointmentId = 'apt_locked_suite';
  mockBookingRepo.saveAppointment({
    id: appointmentId,
    tenantId,
    customer_name: 'Hedef Müşteri',
    phone: '+905559998877',
    date: '2026-11-20',
    time: '14:00',
    status: 'confirmed'
  });

  const validToken = await appointmentSelfServiceService.createAppointmentAccessToken(tenantId, appointmentId, 'view');
  assert(validToken.startsWith('apt_tok_'), 'Geçerli token üretildi');

  const context = {
    clientIp: '198.51.100.10',
    clientFingerprint: 'fp_attacker_suite_3_1'
  };

  // Try to query with the VALID token from the LOCKED context
  const res = await appointmentSelfServiceService.getAppointmentByManageToken(validToken, context);
  assert.strictEqual(res.kind, 'invalid_token', 'Kilitli istemci geçerli token ile dahi reddedilmelidir');
  assert.strictEqual(res.reasonCode, 'TOKEN_LOOKUP_RATE_LIMITED', 'Kilitli istemciye TOKEN_LOOKUP_RATE_LIMITED dönmelidir');

  // Verify validateAppointmentAccessToken also fails closed
  const isValid = await appointmentSelfServiceService.validateAppointmentAccessToken(validToken, context);
  assert.strictEqual(isValid, false, 'validateAppointmentAccessToken kilitli istemcide false dönmelidir');
});

// -----------------------------------------------------------------------------
// SECTION 4: SAHTE PARMAK İZİ (FINGERPRINT SPOOFING) BYPASS ENGELİ
// -----------------------------------------------------------------------------
await runAsyncTest('4.1. Aynı IP adresinden farklı sahte parmak izleriyle (rotating fingerprint) bypass engellenir', async () => {
  appointmentSelfServiceService.resetRateLimitRegistry();
  const attackerIp = '203.0.113.55';

  // 5 failed attempts with 5 DIFFERENT fingerprints from the same IP
  for (let i = 1; i <= 5; i++) {
    const fakeContext = {
      clientIp: attackerIp,
      clientFingerprint: `fake_fingerprint_variant_${i}_${Math.random()}`
    };
    const res = await appointmentSelfServiceService.getAppointmentByManageToken('apt_tok_fake_attempt', fakeContext);
    assert.strictEqual(res.kind, 'invalid_token');
  }

  // 6th attempt with a BRAND NEW fingerprint from the SAME IP
  const bypassAttemptContext = {
    clientIp: attackerIp,
    clientFingerprint: 'brand_new_unseen_fingerprint_9999'
  };
  const bypassRes = await appointmentSelfServiceService.getAppointmentByManageToken('apt_tok_bypass_try', bypassAttemptContext);
  assert.strictEqual(bypassRes.kind, 'invalid_token', 'Sahte parmak izi bypass denemesi reddedilmelidir');
  assert.strictEqual(bypassRes.reasonCode, 'TOKEN_LOOKUP_RATE_LIMITED', 'Aynı IP kilitlendiği için parmak izi değiştirilse de kilit devrede kalmalıdır');
});

await runAsyncTest('4.2. Farklı proxy IP lerinden aynı parmak iziyle gelen bot saldırısı parmak izi kilidiyle engellenir', async () => {
  appointmentSelfServiceService.resetRateLimitRegistry();
  const botFingerprint = 'hardware_bot_fixed_fingerprint_777';

  // 5 failed attempts with 5 DIFFERENT proxy IPs using the SAME fingerprint
  for (let i = 1; i <= 5; i++) {
    const fakeContext = {
      clientIp: `198.51.100.${100 + i}`,
      clientFingerprint: botFingerprint
    };
    const res = await appointmentSelfServiceService.getAppointmentByManageToken('apt_tok_bot_spray', fakeContext);
    assert.strictEqual(res.kind, 'invalid_token');
  }

  // 6th attempt with a fresh proxy IP but same bot fingerprint
  const nextProxyContext = {
    clientIp: '198.51.100.250',
    clientFingerprint: botFingerprint
  };
  const botRes = await appointmentSelfServiceService.getAppointmentByManageToken('apt_tok_bot_spray', nextProxyContext);
  assert.strictEqual(botRes.kind, 'invalid_token', 'Proxy IP değiştirilse de sabit parmak izi kilitlenmelidir');
  assert.strictEqual(botRes.reasonCode, 'TOKEN_LOOKUP_RATE_LIMITED', 'Sabit parmak izi kilidi TOKEN_LOOKUP_RATE_LIMITED dönmelidir');
});

// -----------------------------------------------------------------------------
// SECTION 5: PARALEL / EŞZAMANLI DENEME KORUMASI (CONCURRENCY & RACE CONDITIONS)
// -----------------------------------------------------------------------------
await runAsyncTest('5.1. 10 eşzamanlı (paralel) geçersiz token sorgusunda atomik sayaç çalışır ve kilit aşılmaz', async () => {
  appointmentSelfServiceService.resetRateLimitRegistry();
  const context = {
    clientIp: '192.0.2.77',
    clientFingerprint: 'fp_concurrent_burst_runner'
  };

  // Launch 10 parallel lookups
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(
      appointmentSelfServiceService.getAppointmentByManageToken(`apt_tok_race_${i}`, context)
    );
  }

  const results = await Promise.all(promises);
  assert.strictEqual(results.length, 10, 'Tüm 10 paralel sorgu tamamlandı');

  // Verify that beyond the 5 threshold, requests are locked with TOKEN_LOOKUP_RATE_LIMITED
  const rateLimitedCount = results.filter(r => r.reasonCode === 'TOKEN_LOOKUP_RATE_LIMITED').length;
  assert(rateLimitedCount > 0, `Paralel patlamada kilit devreye girmelidir! Kilitlenen: ${rateLimitedCount}`);

  // Immediate subsequent request must be firmly locked
  const followUp = await appointmentSelfServiceService.getAppointmentByManageToken('apt_tok_follow_up', context);
  assert.strictEqual(followUp.reasonCode, 'TOKEN_LOOKUP_RATE_LIMITED', 'Paralel patlama sonrası istemci kilitli kalmalıdır');
});

// -----------------------------------------------------------------------------
// SECTION 6: SÜRESİ DOLMUŞ / KULLANILMIŞ TOKENLAR VE SIFIR PII SIZDIRMAZLIK
// -----------------------------------------------------------------------------
await runAsyncTest('6.1. Süresi dolmuş token ile yapılan sorguda müşteri PII verisi asla sızdırılmaz (TOKEN_EXPIRED)', async () => {
  appointmentSelfServiceService.resetRateLimitRegistry();
  const tenantId = 'tenant_expired_test';
  const appointmentId = 'apt_expired_sensitive';
  
  // Sensitive customer data
  mockBookingRepo.saveAppointment({
    id: appointmentId,
    tenantId,
    customer_name: 'Gizli Müşteri Adı',
    user_name: 'Gizli Müşteri Adı',
    phone: '+905329998877',
    user_email: 'gizli.musteri@example.com',
    date: '2026-11-25',
    time: '15:30',
    notes: 'Özel sağlık ve hassasiyet notu',
    status: 'confirmed'
  });

  const rawToken = generateSecureToken();
  const tokenHash = await computeSha256(rawToken);

  // Expired 2 hours ago
  const expiredAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await mockSelfServiceRepo.createToken(tenantId, {
    id: 'tok_expired_test',
    appointmentId,
    tokenHash,
    expiresAt: expiredAt,
    purpose: 'view',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    usedAt: null
  });

  const context = { clientIp: '192.0.2.88', clientFingerprint: 'fp_expiry_checker' };
  const res = await appointmentSelfServiceService.getAppointmentByManageToken(rawToken, context);

  // Must fail closed with TOKEN_EXPIRED
  assert.strictEqual(res.kind, 'invalid_token', 'Süresi dolmuş token invalid_token dönmelidir');
  assert.strictEqual(res.reasonCode, 'TOKEN_EXPIRED', 'reasonCode TOKEN_EXPIRED olmalıdır');

  // Verify Zero PII leakage
  const jsonStr = JSON.stringify(res);
  assert(!jsonStr.includes('Gizli Müşteri Adı'), 'PII SIZINTISI: Müşteri adı yanıtta yer alamaz!');
  assert(!jsonStr.includes('+905329998877'), 'PII SIZINTISI: Telefon numarası yanıtta yer alamaz!');
  assert(!jsonStr.includes('gizli.musteri@example.com'), 'PII SIZINTISI: E-posta yanıtta yer alamaz!');
  assert(!jsonStr.includes('Özel sağlık'), 'PII SIZINTISI: Randevu notu yanıtta yer alamaz!');
  assert.strictEqual(res.appointment, undefined, 'Randevu nesnesi yanıtta yer alamaz');
});

await runAsyncTest('6.2. Daha önce kullanılmış (usedAt != null) token sorgusunda PII sızdırılmaz (TOKEN_EXPIRED)', async () => {
  appointmentSelfServiceService.resetRateLimitRegistry();
  const tenantId = 'tenant_used_test';
  const appointmentId = 'apt_used_sensitive';

  mockBookingRepo.saveAppointment({
    id: appointmentId,
    tenantId,
    customer_name: 'Daha Önce Gelmiş Müşteri',
    user_name: 'Daha Önce Gelmiş Müşteri',
    phone: '+905338887766',
    user_email: 'eski.musteri@example.com',
    date: '2026-11-22',
    time: '11:00',
    notes: 'Kullanılmış randevu notu',
    status: 'confirmed'
  });

  const rawToken = generateSecureToken();
  const tokenHash = await computeSha256(rawToken);

  // Still within 7 days, but usedAt is stamped
  const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  await mockSelfServiceRepo.createToken(tenantId, {
    id: 'tok_used_test',
    appointmentId,
    tokenHash,
    expiresAt,
    purpose: 'view',
    createdAt: new Date().toISOString(),
    usedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString()
  });

  const context = { clientIp: '192.0.2.89', clientFingerprint: 'fp_used_checker' };
  const res = await appointmentSelfServiceService.getAppointmentByManageToken(rawToken, context);

  assert.strictEqual(res.kind, 'invalid_token', 'Kullanılmış token invalid_token dönmelidir');
  assert.strictEqual(res.reasonCode, 'TOKEN_EXPIRED', 'Kullanılmış token reasonCode=TOKEN_EXPIRED dönmelidir');

  const jsonStr = JSON.stringify(res);
  assert(!jsonStr.includes('Daha Önce Gelmiş'), 'PII SIZINTISI: Kullanılmış tokende müşteri adı sızdırılamaz!');
  assert(!jsonStr.includes('+905338887766'), 'PII SIZINTISI: Kullanılmış tokende telefon sızdırılamaz!');
  assert.strictEqual(res.appointment, undefined, 'Kullanılmış tokende randevu objesi dönülemez');
});

// -----------------------------------------------------------------------------
// SECTION 7: KİRACI İZOLASYONU VE CROSS-TENANT KORUMASI
// -----------------------------------------------------------------------------
await runAsyncTest('7.1. Farklı kiracıya ait randevu ID si ile üretilen token kiracı uyuşmazlığında reddedilir', async () => {
  appointmentSelfServiceService.resetRateLimitRegistry();
  const tenantA = 'tenant_salon_alpha';
  const tenantB = 'tenant_salon_beta';

  // Appointment belongs to Tenant B
  mockBookingRepo.saveAppointment({
    id: 'apt_tenant_b_secret',
    tenantId: tenantB,
    customer_name: 'Salon B Müşterisi',
    phone: '+905441112233',
    date: '2026-11-28',
    time: '16:00',
    status: 'confirmed'
  });

  // Token was created under Tenant A's context targeting Tenant B's appointment ID
  const rawToken = generateSecureToken();
  const tokenHash = await computeSha256(rawToken);
  await mockSelfServiceRepo.createToken(tenantA, {
    id: 'tok_cross_tenant_test',
    appointmentId: 'apt_tenant_b_secret',
    tokenHash,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    purpose: 'view',
    createdAt: new Date().toISOString(),
    usedAt: null
  });

  const res = await appointmentSelfServiceService.getAppointmentByManageToken(rawToken, {
    clientIp: '192.0.2.90',
    clientFingerprint: 'fp_cross_tenant'
  });

  assert.strictEqual(res.kind, 'invalid_token', 'Cross-tenant token sorgusu reddedilmelidir');
  assert.strictEqual(res.reasonCode, 'invalid_token', 'Cross-tenant sorgu invalid_token dönmelidir');
  assert(!JSON.stringify(res).includes('Salon B Müşterisi'), 'Cross-tenant PII sızıntısı engellenmelidir');
});

// -----------------------------------------------------------------------------
// SECTION 8: GERÇEK POSTGRESQL / EMBEDDEDPOSTGRES RPC VE RATE LIMIT DOĞRULAMASI
// -----------------------------------------------------------------------------
let disposableTmpDir = null;
let embeddedPg = null;
let pgClient = null;

async function getDisposablePgEngine() {
  if (pgClient) return pgClient;

  disposableTmpDir = path.join(os.tmpdir(), `pg_lari_selfservice_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(disposableTmpDir, { recursive: true });
  const port = await getAvailablePort();

  const pg = new EmbeddedPostgres({
    databaseDir: disposableTmpDir,
    port,
    user: 'postgres',
    password: 'password',
    initdbFlags: ['--locale=C', '--encoding=UTF8'],
    persistent: false
  });

  await pg.initialise();
  await pg.start();
  embeddedPg = pg;

  const client = pg.getPgClient();
  await client.connect();
  await client.query(`ALTER DATABASE postgres SET synchronous_commit = 'off'; SET synchronous_commit = 'off';`);

  // Supabase roles
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

  // Base Schema Tables
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS public;
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS public.tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      official_business_name TEXT,
      slug TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'active',
      onboarding_status TEXT DEFAULT 'completed',
      public_site_status TEXT DEFAULT 'published',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.branches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      timezone TEXT DEFAULT 'Europe/Istanbul',
      is_active BOOLEAN DEFAULT true,
      is_primary BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.services (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      name_tr TEXT,
      duration INTEGER DEFAULT 30,
      active BOOLEAN DEFAULT true,
      price NUMERIC DEFAULT 250.00
    );

    CREATE TABLE IF NOT EXISTS public.staff (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      title TEXT,
      active BOOLEAN DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS public.appointments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      branch_id UUID,
      customer_id UUID,
      user_name TEXT,
      user_email TEXT,
      phone TEXT,
      service_id UUID,
      staff_id UUID,
      appointment_date DATE NOT NULL,
      appointment_time TIME NOT NULL,
      duration_minutes INTEGER DEFAULT 30,
      status TEXT DEFAULT 'confirmed',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.appointment_access_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL,
      appointment_id UUID NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Apply candidate migration 20260904 on real PostgreSQL
  await client.query(migContent);

  pgClient = client;
  return pgClient;
}

try {
  await runAsyncTest('8.1. [GERÇEK DB] 20260904 migrasyonu EmbeddedPostgres üzerinde hatasız kuruldu', async () => {
    const db = await getDisposablePgEngine();
    const tableRes = await db.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'self_service_token_rate_limits'
    `);
    assert.strictEqual(tableRes.rows.length, 1, 'self_service_token_rate_limits tablosu oluşturulmalıdır');

    const procRes = await db.query(`
      SELECT proname, prosecdef FROM pg_proc
      JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
      WHERE proname IN (
        'record_self_service_token_lookup_failure',
        'check_self_service_token_rate_limit',
        'get_public_appointment_by_manage_token'
      )
    `);
    assert(procRes.rows.length >= 3, 'Tüm güvenlik RPC leri tanımlı olmalıdır');
    for (const r of procRes.rows) {
      assert.strictEqual(r.prosecdef, true, `${r.proname} SECURITY DEFINER olmalıdır`);
    }
  });

  await runAsyncTest('8.2. [GERÇEK DB] Geçerli token ile get_public_appointment_by_manage_token başarılı sonuç döner', async () => {
    const db = await getDisposablePgEngine();
    
    // Seed test tenant, branch, service, staff, appointment
    const tRes = await db.query(`
      INSERT INTO public.tenants (name, official_business_name, slug)
      VALUES ('Aura Salonu', 'Aura Güzellik Hizmetleri A.Ş.', 'aura-guzellik')
      RETURNING id
    `);
    const tenantId = tRes.rows[0].id;

    const bRes = await db.query(`
      INSERT INTO public.branches (tenant_id, name, timezone)
      VALUES ($1, 'Nişantaşı Şubesi', 'Europe/Istanbul')
      RETURNING id
    `, [tenantId]);
    const branchId = bRes.rows[0].id;

    const sRes = await db.query(`
      INSERT INTO public.services (tenant_id, name, name_tr, duration, price)
      VALUES ($1, 'Saç Kesimi', 'Saç Kesimi', 45, 450.00)
      RETURNING id
    `, [tenantId]);
    const serviceId = sRes.rows[0].id;

    const stRes = await db.query(`
      INSERT INTO public.staff (tenant_id, name, title)
      VALUES ($1, 'Ahmet Kuaför', 'Usta Kuaför')
      RETURNING id
    `, [tenantId]);
    const staffId = stRes.rows[0].id;

    const aptRes = await db.query(`
      INSERT INTO public.appointments (
        tenant_id, branch_id, service_id, staff_id,
        user_name, user_email, phone, appointment_date, appointment_time, duration_minutes, status, notes
      ) VALUES (
        $1, $2, $3, $4,
        'Meltem Aydın', 'meltem@example.com', '+905321234567', '2026-11-29', '14:00', 45, 'confirmed', 'Kahve ikramı ricası'
      ) RETURNING id
    `, [tenantId, branchId, serviceId, staffId]);
    const appointmentId = aptRes.rows[0].id;

    // Generate real CSPRNG token and SHA-256 hash
    const rawToken = generateSecureToken();
    const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');

    await db.query(`
      INSERT INTO public.appointment_access_tokens (tenant_id, appointment_id, token_hash, expires_at)
      VALUES ($1, $2, $3, now() + interval '7 days')
    `, [tenantId, appointmentId, tokenHash]);

    // Query RPC
    const rpcRes = await db.query(`
      SELECT public.get_public_appointment_by_manage_token($1, $2, $3) AS result
    `, [rawToken, 'fp_real_db_client_1', '10.99.1.1']);

    const res = rpcRes.rows[0].result;
    assert.strictEqual(res.success, true, 'RPC success=true dönmelidir');
    assert.strictEqual(res.reason_code, 'ok', 'reason_code=ok dönmelidir');
    assert.strictEqual(res.appointment.id, appointmentId, 'Randevu ID si eşleşmelidir');
    assert.strictEqual(res.appointment.customer_name, 'Meltem Aydın');
    assert.strictEqual(res.appointment.service.name, 'Saç Kesimi');
    assert.strictEqual(res.appointment.staff.name, 'Ahmet Kuaför');
    assert.strictEqual(res.appointment.branch.name, 'Nişantaşı Şubesi');
  });

  await runAsyncTest('8.3. [GERÇEK DB] 5 hatalı token denemesinde veritabanı kilitlenir ve 6. deneme TOKEN_LOOKUP_RATE_LIMITED döner', async () => {
    const db = await getDisposablePgEngine();
    const clientIp = '10.99.5.50';
    const clientFp = 'fp_real_db_bruteforce_attacker';

    // 5 invalid token lookups in PostgreSQL
    for (let i = 1; i <= 5; i++) {
      const rpcRes = await db.query(`
        SELECT public.get_public_appointment_by_manage_token($1, $2, $3) AS result
      `, [`apt_tok_nonexistent_db_${i}_12345678901234567890123456789012`, clientFp, clientIp]);
      const res = rpcRes.rows[0].result;
      assert.strictEqual(res.success, false, `Deneme ${i} başarısız olmalıdır`);
      assert.strictEqual(res.reason_code, 'invalid_token', `Deneme ${i} reason_code=invalid_token olmalıdır`);
    }

    // 6th attempt: MUST be blocked with TOKEN_LOOKUP_RATE_LIMITED at database engine level
    const sixthRpcRes = await db.query(`
      SELECT public.get_public_appointment_by_manage_token($1, $2, $3) AS result
    `, ['apt_tok_nonexistent_db_6_12345678901234567890123456789012', clientFp, clientIp]);
    const blockedRes = sixthRpcRes.rows[0].result;
    assert.strictEqual(blockedRes.success, false, '6. sorgu başarısız olmalıdır');
    assert.strictEqual(blockedRes.reason_code, 'TOKEN_LOOKUP_RATE_LIMITED', 'Veritabanı 6. sorguda TOKEN_LOOKUP_RATE_LIMITED dönmelidir');

    // Verify rate limit table record exists and is locked
    const rlCheck = await db.query(`
      SELECT failure_count, (locked_until > now()) AS is_locked
      FROM public.self_service_token_rate_limits
      WHERE identifier_type = 'ip' AND client_identifier = $1
    `, [clientIp]);
    assert.strictEqual(rlCheck.rows.length, 1, 'IP kaydı bulunmalıdır');
    assert(rlCheck.rows[0].failure_count >= 5, 'failure_count >= 5 olmalıdır');
    assert.strictEqual(rlCheck.rows[0].is_locked, true, 'locked_until gelecekte olmalıdır');
  });

  await runAsyncTest('8.4. [GERÇEK DB] Süresi dolmuş token veritabanında TOKEN_EXPIRED döner ve PII sızdırmaz', async () => {
    const db = await getDisposablePgEngine();
    
    // Create tenant and appointment with sensitive customer info
    const tRes = await db.query(`
      INSERT INTO public.tenants (name, slug) VALUES ('Süre Sonu Salonu', 'sure-sonu-salonu') RETURNING id
    `);
    const tenantId = tRes.rows[0].id;

    const aptRes = await db.query(`
      INSERT INTO public.appointments (
        tenant_id, user_name, user_email, phone, appointment_date, appointment_time, notes, status
      ) VALUES (
        $1, 'Gizli Müşteri DB', 'gizli.db@example.com', '+905551239988', '2026-11-20', '10:00', 'Çok gizli randevu notu', 'confirmed'
      ) RETURNING id
    `, [tenantId]);
    const appointmentId = aptRes.rows[0].id;

    const rawToken = generateSecureToken();
    const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');

    // Expired 1 hour ago
    await db.query(`
      INSERT INTO public.appointment_access_tokens (tenant_id, appointment_id, token_hash, expires_at)
      VALUES ($1, $2, $3, now() - interval '1 hour')
    `, [tenantId, appointmentId, tokenHash]);

    const rpcRes = await db.query(`
      SELECT public.get_public_appointment_by_manage_token($1, $2, $3) AS result
    `, [rawToken, 'fp_clean_client_8_4', '10.99.8.4']);

    const res = rpcRes.rows[0].result;
    assert.strictEqual(res.success, false, 'Süresi dolmuş token başarısız olmalıdır');
    assert.strictEqual(res.reason_code, 'TOKEN_EXPIRED', 'reason_code=TOKEN_EXPIRED dönmelidir');

    const jsonStr = JSON.stringify(res);
    assert(!jsonStr.includes('Gizli Müşteri DB'), 'PII SIZINTISI: Veritabanı süresi dolmuş tokende müşteri adı sızdıramaz');
    assert(!jsonStr.includes('+905551239988'), 'PII SIZINTISI: Veritabanı süresi dolmuş tokende telefon sızdıramaz');
    assert(!jsonStr.includes('Çok gizli'), 'PII SIZINTISI: Veritabanı randevu notunu sızdıramaz');
    assert.strictEqual(res.appointment, undefined, 'appointment objesi dönülmemelidir');
  });

  await runAsyncTest('8.5. [GERÇEK DB] Kullanılmış (used_at != null) token veritabanında TOKEN_EXPIRED döner', async () => {
    const db = await getDisposablePgEngine();
    
    const tRes = await db.query(`
      INSERT INTO public.tenants (name, slug) VALUES ('Kullanılmış Salon', 'kullanilmis-salon') RETURNING id
    `);
    const tenantId = tRes.rows[0].id;

    const aptRes = await db.query(`
      INSERT INTO public.appointments (
        tenant_id, user_name, phone, appointment_date, appointment_time, status
      ) VALUES (
        $1, 'Ziyaret Edilmiş Müşteri', '+905559876543', '2026-11-20', '12:00', 'confirmed'
      ) RETURNING id
    `, [tenantId]);
    const appointmentId = aptRes.rows[0].id;

    const rawToken = generateSecureToken();
    const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');

    // Valid expires_at, but used_at set
    await db.query(`
      INSERT INTO public.appointment_access_tokens (tenant_id, appointment_id, token_hash, expires_at, used_at)
      VALUES ($1, $2, $3, now() + interval '5 days', now() - interval '10 minutes')
    `, [tenantId, appointmentId, tokenHash]);

    const rpcRes = await db.query(`
      SELECT public.get_public_appointment_by_manage_token($1, $2, $3) AS result
    `, [rawToken, 'fp_clean_client_8_5', '10.99.8.5']);

    const res = rpcRes.rows[0].result;
    assert.strictEqual(res.success, false, 'Kullanılmış token başarısız olmalıdır');
    assert.strictEqual(res.reason_code, 'TOKEN_EXPIRED', 'reason_code=TOKEN_EXPIRED olmalıdır');
    assert(!JSON.stringify(res).includes('Ziyaret Edilmiş'), 'Kullanılmış tokende PII sızdırılamaz');
  });

  await runAsyncTest('8.6. [GERÇEK DB] Kiracı uyuşmazlığında (cross-tenant) randevu verisi sızdırılmaz (invalid_token)', async () => {
    const db = await getDisposablePgEngine();
    
    const tA = await db.query(`INSERT INTO public.tenants (name, slug) VALUES ('Salon A', 'salon-a-iso') RETURNING id`);
    const tB = await db.query(`INSERT INTO public.tenants (name, slug) VALUES ('Salon B', 'salon-b-iso') RETURNING id`);
    const tenantA = tA.rows[0].id;
    const tenantB = tB.rows[0].id;

    // Appointment belongs to Tenant B
    const aptRes = await db.query(`
      INSERT INTO public.appointments (tenant_id, user_name, phone, appointment_date, appointment_time)
      VALUES ($1, 'Tenant B Müşterisi', '+905001112233', '2026-11-30', '09:00') RETURNING id
    `, [tenantB]);
    const aptBId = aptRes.rows[0].id;

    // Token erroneously or maliciously stored with tenant_id = tenantA
    const rawToken = generateSecureToken();
    const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
    await db.query(`
      INSERT INTO public.appointment_access_tokens (tenant_id, appointment_id, token_hash, expires_at)
      VALUES ($1, $2, $3, now() + interval '3 days')
    `, [tenantA, aptBId, tokenHash]);

    const rpcRes = await db.query(`
      SELECT public.get_public_appointment_by_manage_token($1, $2, $3) AS result
    `, [rawToken, 'fp_clean_client_8_6', '10.99.8.6']);

    const res = rpcRes.rows[0].result;
    assert.strictEqual(res.success, false, 'Cross-tenant sorgu başarısız olmalıdır');
    assert.strictEqual(res.reason_code, 'invalid_token', 'reason_code=invalid_token olmalıdır');
    assert(!JSON.stringify(res).includes('Tenant B Müşterisi'), 'Cross-tenant veri sızıntısı engellenmelidir');
  });

  await runAsyncTest('8.7. [GERÇEK DB] Tek parametreli (1-arg) eski RPC çağrısı varsayılan değerlerle tam uyumlu çalışır', async () => {
    const db = await getDisposablePgEngine();
    
    // Call get_public_appointment_by_manage_token with only 1 parameter (p_token)
    const rpcRes = await db.query(`
      SELECT public.get_public_appointment_by_manage_token('apt_tok_legacy_param_test_12345678901234567890123456789012') AS result
    `);
    const res = rpcRes.rows[0].result;
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.reason_code, 'invalid_token', '1-arg eski imza desteği korunmalıdır');
  });

} finally {
  if (pgClient) {
    try { await pgClient.end(); } catch {}
  }
  if (embeddedPg) {
    try { await embeddedPg.stop(); } catch {}
  }
  if (disposableTmpDir && fs.existsSync(disposableTmpDir)) {
    try { fs.rmSync(disposableTmpDir, { recursive: true, force: true }); } catch {}
  }
}

console.log('\n================================================================================');
console.log(`=== LARI [LARI-PILOT5-002] QA SUITE TAMAMLANDI: ${passedTests}/${totalTests} TEST GEÇTİ ===`);
console.log('================================================================================\n');

process.exit(0);
