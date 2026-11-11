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

console.log('================================================================================');
console.log('=== LARI [LARI-PILOT4-002] V1-WQ-07: Public Booking Rate-Limit & OTP QA Suite ===');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// SECTION 1: STATİK KAYNAK, SÖZLEŞME VE GÜVENLİK İNCELEMESİ (STATIC CHECKS)
// -----------------------------------------------------------------------------
const migPath = path.join(rootDir, 'supabase', 'migrations', '20260903_public_booking_ratelimit_spam_and_otp_contract.sql');
const migContent = fs.readFileSync(migPath, 'utf8');

runTest('1.1. Migration 20260903 diskte mevcut, CANDIDATE ONLY ve koruma uyarısı içeriyor', () => {
  assert(fs.existsSync(migPath), 'Migration 20260903 dosyası bulunamadı');
  assert(migContent.includes('CANDIDATE ONLY'), 'Migration CANDIDATE ONLY olarak etiketlenmelidir');
  assert(migContent.includes('Do NOT execute on live/remote production databases automatically'), 'Uzak veritabanı koruma uyarısı zorunludur');
});

runTest('1.2. public_booking_rate_limit_events tablosu, RLS ve indeksleri tanımlı', () => {
  assert(migContent.includes('CREATE TABLE IF NOT EXISTS public.public_booking_rate_limit_events'), 'rate limit tablosu eksik');
  assert(migContent.includes('ALTER TABLE public.public_booking_rate_limit_events ENABLE ROW LEVEL SECURITY'), 'RLS etkinleştirilmelidir');
  assert(migContent.includes('idx_pbrl_tenant_phone_time'), 'Telefon zaman indeksi eksik');
  assert(migContent.includes('idx_pbrl_tenant_fp_time'), 'Fingerprint zaman indeksi eksik');
});

runTest('1.3. public_booking_otp_challenges tablosu, SHA-256 hash zorunluluğu ve durum CHECK kısıtı tanımlı', () => {
  assert(migContent.includes('CREATE TABLE IF NOT EXISTS public.public_booking_otp_challenges'), 'otp challenges tablosu eksik');
  assert(migContent.includes('otp_code_hash TEXT NOT NULL'), 'Ham kod yerine yalnızca sha256 hash tutulmalıdır');
  assert(migContent.includes("CHECK (status IN ('pending', 'verified', 'consumed', 'locked', 'expired'))"), 'status kısıtı eksik');
  assert(migContent.includes('ALTER TABLE public.public_booking_otp_challenges ENABLE ROW LEVEL SECURITY'), 'RLS etkinleştirilmelidir');
});

runTest('1.4. Canlı WhatsApp / SMS gönderimi kesinlikle yasak (delivery_mode: synthetic_outbox_only)', () => {
  assert(migContent.includes("'synthetic_outbox_only'"), 'Outbox kaydı synthetic_outbox_only olmalıdır');
  assert(
    migContent.includes('CANLI_WHATSAPP_VE_SMS_GONDERIMI_YASAK_SYNTHETIC_ONLY') ||
    migContent.includes('CANLI_SMS_GONDERIMI_YASAK_SYNTHETIC_ONLY'),
    'Outbox kaydında canlı gönderim yasağı açıkça belirtilmelidir'
  );
  assert(migContent.includes("'whatsapp'"), 'Outbox birincil kanalı whatsapp olmalıdır');
});

runTest('1.5. Client tarafı servis dosyalarında service_role anahtarı geçmiyor (Guardrail 2)', () => {
  const otpServiceSrc = fs.readFileSync(path.join(rootDir, 'services', 'publicBookingOtpService.ts'), 'utf8');
  const abuseServiceSrc = fs.readFileSync(path.join(rootDir, 'services', 'bookingAbuseProtectionService.ts'), 'utf8');
  assert(!otpServiceSrc.includes('service_role'), 'publicBookingOtpService.ts içinde service_role referansı YASAKTIR');
  assert(!abuseServiceSrc.includes('service_role'), 'bookingAbuseProtectionService.ts içinde service_role referansı YASAKTIR');
});

// -----------------------------------------------------------------------------
// SECTION 2: TYPESCRIPT SENTETİK OTP VE SUİSTİMAL KORUMASI HARNESS TESTLERİ
// -----------------------------------------------------------------------------
const { publicBookingOtpService, LIVE_SMS_DISPATCH_FORBIDDEN } = await import('../services/publicBookingOtpService.ts');
const { bookingAbuseProtectionService } = await import('../services/bookingAbuseProtectionService.ts');

runTest('2.1. publicBookingOtpService LIVE_SMS_DISPATCH_FORBIDDEN bayrağı devrede', () => {
  assert.strictEqual(LIVE_SMS_DISPATCH_FORBIDDEN, true, 'Canlı SMS gönderimi kesinlikle kapalı olmalıdır');
});

await runAsyncTest('2.2. Sentetik OTP talebi başarılı oluşuyor ve canlı SMS atmadan outbox kuyruğuna yazılıyor', async () => {
  publicBookingOtpService.clearSyntheticHarness();
  const res = await publicBookingOtpService.requestOtp({
    slug: 'salon-alfa',
    phone: '+90 555 111 2233',
    clientFingerprint: 'fp_test_1'
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.reasonCode, 'ok');
  assert(res.challengeId, 'challengeId üretilmelidir');

  const outbox = publicBookingOtpService.getSyntheticOutbox('+90 555 111 2233');
  assert.strictEqual(outbox.length, 1, 'Sentetik kuyrukta 1 kayıt olmalıdır');
  assert.strictEqual(outbox[0].deliveryMode, 'synthetic_outbox_only');
  assert(outbox[0].otpCode.length === 6, '6 haneli sentetik kod üretilmelidir');
});

await runAsyncTest('2.3. Cooldown Koruması: 60 saniye dolmadan yeni OTP istenemez (otp_rate_limited)', async () => {
  const res2 = await publicBookingOtpService.requestOtp({
    slug: 'salon-alfa',
    phone: '+90 555 111 2233',
    clientFingerprint: 'fp_test_1'
  });

  assert.strictEqual(res2.success, false);
  assert.strictEqual(res2.reasonCode, 'otp_rate_limited');
  assert(res2.cooldownRemainingSeconds > 0, 'Kalan bekleme süresi bildirilmelidir');
});

await runAsyncTest('2.4. Tenant İzolasyonu: Tenant A için alınan OTP challenge Tenant B slug ile doğrulanamaz', async () => {
  const outbox = publicBookingOtpService.getSyntheticOutbox('+90 555 111 2233');
  const code = outbox[0].otpCode;
  const challengeId = outbox[0].challengeId;

  const verifyCrossTenant = await publicBookingOtpService.verifyOtp({
    slug: 'salon-beta', // Yanlış tenant
    challengeId,
    otpCode: code,
    phone: '+90 555 111 2233'
  });

  assert.strictEqual(verifyCrossTenant.success, false);
  assert.strictEqual(verifyCrossTenant.reasonCode, 'tenant_mismatch');
});

await runAsyncTest('2.5. Brute-Force Kilidi: 3 hatalı deneme sonrası kilitlenir; 4. denemede DOĞRU kod girilse bile açılamaz', async () => {
  publicBookingOtpService.clearSyntheticHarness();
  const initRes = await publicBookingOtpService.requestOtp({
    slug: 'salon-alfa',
    phone: '+90 555 444 3322',
    syntheticOtp: '654321'
  });
  const chId = initRes.challengeId;

  // 1. Hatalı deneme
  const v1 = await publicBookingOtpService.verifyOtp({ slug: 'salon-alfa', challengeId: chId, otpCode: '000000', phone: '+90 555 444 3322' });
  assert.strictEqual(v1.success, false);
  assert.strictEqual(v1.reasonCode, 'otp_invalid');
  assert.strictEqual(v1.attemptsRemaining, 2);

  // 2. Hatalı deneme
  const v2 = await publicBookingOtpService.verifyOtp({ slug: 'salon-alfa', challengeId: chId, otpCode: '111111', phone: '+90 555 444 3322' });
  assert.strictEqual(v2.success, false);
  assert.strictEqual(v2.reasonCode, 'otp_invalid');
  assert.strictEqual(v2.attemptsRemaining, 1);

  // 3. Hatalı deneme -> Kilitlenir (locked)
  const v3 = await publicBookingOtpService.verifyOtp({ slug: 'salon-alfa', challengeId: chId, otpCode: '222222', phone: '+90 555 444 3322' });
  assert.strictEqual(v3.success, false);
  assert.strictEqual(v3.reasonCode, 'otp_brute_force_locked');
  assert.strictEqual(v3.attemptsRemaining, 0);

  // 4. Deneme: DOĞRU KOD girmesine rağmen kilit açılmaz (Brute-force security invariant)
  const v4 = await publicBookingOtpService.verifyOtp({ slug: 'salon-alfa', challengeId: chId, otpCode: '654321', phone: '+90 555 444 3322' });
  assert.strictEqual(v4.success, false);
  assert.strictEqual(v4.reasonCode, 'otp_brute_force_locked');
  assert.strictEqual(v4.attemptsRemaining, 0);
});

await runAsyncTest('2.6. Doğru OTP ile tek kullanımlık token üretimi ve replay engeli (Tekrar kullanım reddedilir)', async () => {
  publicBookingOtpService.clearSyntheticHarness();
  const initRes = await publicBookingOtpService.requestOtp({
    slug: 'salon-alfa',
    phone: '+90 555 999 8877',
    syntheticOtp: '123456'
  });
  const chId = initRes.challengeId;

  const verifyRes = await publicBookingOtpService.verifyOtp({
    slug: 'salon-alfa',
    challengeId: chId,
    otpCode: '123456',
    phone: '+90 555 999 8877'
  });

  assert.strictEqual(verifyRes.success, true);
  assert(verifyRes.verificationToken, 'verificationToken üretilmelidir');

  // Token 1. kez atomik tüketilir
  const consumedFirstTime = publicBookingOtpService.consumeVerificationTokenLocal(
    verifyRes.verificationToken,
    'salon-alfa',
    '+90 555 999 8877'
  );
  assert.strictEqual(consumedFirstTime, true, 'İlk kullanım başarılı olmalıdır');

  // Token 2. kez tüketilmek istendiğinde REPLAY ENGELİ devreye girer (Fail-Closed)
  const consumedSecondTime = publicBookingOtpService.consumeVerificationTokenLocal(
    verifyRes.verificationToken,
    'salon-alfa',
    '+90 555 999 8877'
  );
  assert.strictEqual(consumedSecondTime, false, 'Aynı token tekrar kullanılamamalıdır (Replay engeli)');
});

await runAsyncTest('2.7. bookingAbuseProtectionService burst ve limit kontrollerini beklenen kodlarla engeller', async () => {
  // Burst phone denemesi
  const tenantId = 't_test_abuse_1';
  const testPhone = '+90 532 000 1122';

  // 5 başarısız deneme kaydet
  for (let i = 0; i < 5; i++) {
    bookingAbuseProtectionService.recordBookingAttempt({
      tenantId,
      phone: testPhone,
      email: 'user@test.com',
      success: false
    });
  }

  const evalRes = await bookingAbuseProtectionService.evaluateBookingRequest({
    tenantId,
    phone: testPhone,
    email: 'user@test.com'
  });

  assert.strictEqual(evalRes.allowed, false);
  assert.strictEqual(evalRes.reasonCode, 'rate_limit_exceeded');
});

await runAsyncTest('2.8. Fail-Closed Invariant: listAppointments repository hatası yutulmaz, temporary_failure döner', async () => {
  const { getBookingRepository } = await import('../services/repositories');
  const repo = getBookingRepository();
  const origList = repo.listAppointments;
  try {
    repo.listAppointments = async () => { throw new Error('Database connection failed'); };
    const res = await bookingAbuseProtectionService.shouldBlockBooking({
      tenantId: 't_test_abuse_1',
      phone: '+90 532 999 0011',
      email: 'failclosed@test.com',
      date: '2026-11-20',
      serviceId: 's_test_1'
    });
    assert.strictEqual(res.block, true, 'DB hatasında işlem fail-closed durmalıdır');
    assert.strictEqual(res.reasonCode, 'temporary_failure', 'reasonCode temporary_failure olmalıdır');
  } finally {
    repo.listAppointments = origList;
  }
});

await runAsyncTest('2.9. Client Fingerprint Burst Limiti: Aynı fingerprint ile 10 istek sonrası rate_limit_exceeded', async () => {
  const tenantId = 't_test_abuse_fp';
  const testFp = 'fp_browser_heavy_burst_1';

  for (let i = 0; i < 10; i++) {
    bookingAbuseProtectionService.recordBookingAttempt({
      tenantId,
      phone: `+90 532 000 99${i.toString().padStart(2, '0')}`,
      email: `user${i}@test.com`,
      clientFingerprint: testFp,
      success: false
    });
  }

  const evalRes = await bookingAbuseProtectionService.evaluateBookingRequest({
    tenantId,
    phone: '+90 532 000 8800',
    email: 'newuser@test.com',
    clientFingerprint: testFp
  });

  assert.strictEqual(evalRes.allowed, false);
  assert.strictEqual(evalRes.reasonCode, 'rate_limit_exceeded');
});

await runAsyncTest('2.10. Status-Agnostic Cooldown: Doğrulanmış challenge sonrası 60s dolmadan yeni istek otp_rate_limited döner', async () => {
  publicBookingOtpService.clearSyntheticHarness();
  const r1 = await publicBookingOtpService.requestOtp({
    slug: 'salon-alfa',
    phone: '+90 555 333 4455',
    syntheticOtp: '334455',
    channel: 'whatsapp'
  });
  assert.strictEqual(r1.success, true);

  // Doğrula -> status='verified'
  const v = await publicBookingOtpService.verifyOtp({
    slug: 'salon-alfa',
    challengeId: r1.challengeId,
    otpCode: '334455',
    phone: '+90 555 333 4455'
  });
  assert.strictEqual(v.success, true);

  // Doğrulanmış olsa bile 60 saniye dolmadan yeni OTP istenemez
  const r2 = await publicBookingOtpService.requestOtp({
    slug: 'salon-alfa',
    phone: '+90 555 333 4455'
  });
  assert.strictEqual(r2.success, false);
  assert.strictEqual(r2.reasonCode, 'otp_rate_limited');
});

await runAsyncTest('2.11. WhatsApp Birincil Hedef Kanal: Sentetik kuyruk kaydı channel whatsapp olarak yazılır', async () => {
  publicBookingOtpService.clearSyntheticHarness();
  await publicBookingOtpService.requestOtp({
    slug: 'salon-alfa',
    phone: '+90 555 888 7766'
  });

  const outbox = publicBookingOtpService.getSyntheticOutbox('+90 555 888 7766');
  assert.strictEqual(outbox.length, 1);
  assert.strictEqual(outbox[0].channel, 'whatsapp', 'Varsayılan hedef kanal whatsapp olmalıdır');
});

await runAsyncTest('2.12. [FAIL-CLOSED CRYPTO UNAVAILABLE] Kripto API yokken requestOtp ve verifyOtp reject etmez, temporary_failure döner', async () => {
  publicBookingOtpService.clearSyntheticHarness();
  const origCryptoDesc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const origVersionsDesc = Object.getOwnPropertyDescriptor(process, 'versions');

  const disableAllCrypto = () => {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    Object.defineProperty(process, 'versions', {
      value: { ...process.versions, node: undefined },
      configurable: true,
      writable: true,
    });
  };
  const restoreAllCrypto = () => {
    if (origCryptoDesc) Object.defineProperty(globalThis, 'crypto', origCryptoDesc);
    if (origVersionsDesc) Object.defineProperty(process, 'versions', origVersionsDesc);
  };

  try {
    disableAllCrypto();
    const res = await publicBookingOtpService.requestOtp({
      slug: 'salon-alfa',
      phone: '+90 555 123 0099',
      syntheticOtp: '112233',
    });
    assert.strictEqual(res.success, false, 'Kripto yokken requestOtp başarısız dönmelidir');
    assert.strictEqual(res.reasonCode, 'temporary_failure', 'requestOtp temporary_failure dönmeli, promise reject etmemelidir');
    assert.strictEqual(publicBookingOtpService.getSyntheticOutbox('+90 555 123 0099').length, 0, 'Outbox kaydı oluşmamalı');

    restoreAllCrypto();
    const okInit = await publicBookingOtpService.requestOtp({
      slug: 'salon-alfa',
      phone: '+90 555 123 0099',
      syntheticOtp: '112233',
    });
    assert.strictEqual(okInit.success, true);

    disableAllCrypto();
    const vFail = await publicBookingOtpService.verifyOtp({
      slug: 'salon-alfa',
      challengeId: okInit.challengeId,
      otpCode: '112233',
      phone: '+90 555 123 0099',
    });
    assert.strictEqual(vFail.success, false);
    assert.strictEqual(vFail.reasonCode, 'temporary_failure', 'verifyOtp de kripto yokken temporary_failure dönmelidir');
    const auditAfter = publicBookingOtpService.getSyntheticChallengeAudit(okInit.challengeId);
    assert.strictEqual(auditAfter.status, 'pending', 'Kripto hatasında challenge pending kalmalıdır');
    assert.strictEqual(auditAfter.attemptsCount, 0, 'Kripto hatasında deneme sayacı artmamalıdır');
  } finally {
    restoreAllCrypto();
  }
});

function installNodeLocalStorageShim() {
  const origDesc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  if (origDesc) return () => {};
  const store = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(String(k), String(v)); },
      removeItem: (k) => { store.delete(String(k)); },
      clear: () => { store.clear(); },
      key: (i) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    },
  });
  return () => {
    try { delete globalThis.localStorage; } catch {}
  };
}

await runAsyncTest('2.13. [LOCAL REPO ATOMİKLİK] LocalBookingRepository slot_conflict ve hata durumunda OTP tokenını tüketmez, retry başarılı olur', async () => {
  const restoreLS = installNodeLocalStorageShim();
  const { LocalBookingRepository } = await import('../services/repositories/localBookingRepository.ts');
  const repo = new LocalBookingRepository();
  const origCreateAppointment = repo.createAppointment.bind(repo);
  try {
    localStorage.clear();
    localStorage.setItem('lari:salon-local-atom:appointments_seeded', 'true');
    publicBookingOtpService.clearSyntheticHarness();

    // 1. Saat 10:00 u önceden doldur
    const seed = await repo.createPublicBooking({
      slug: 'salon-local-atom',
      serviceId: 'srv_1',
      staffId: 'staff_1',
      appointmentDate: '2026-12-01',
      appointmentTime: '10:00',
      customerName: 'Önceki Müşteri',
      customerEmail: 'onceki@test.com',
      customerPhone: '+90 555 000 1111',
      requiredConsent: true,
    });
    assert.strictEqual(seed.success, true);

    // 2. OTP al ve doğrula
    const req = await publicBookingOtpService.requestOtp({
      slug: 'salon-local-atom',
      phone: '+90 555 222 8899',
      syntheticOtp: '554433',
    });
    const ver = await publicBookingOtpService.verifyOtp({
      slug: 'salon-local-atom',
      challengeId: req.challengeId,
      otpCode: '554433',
      phone: '+90 555 222 8899',
    });
    assert.strictEqual(ver.success, true);
    const token = ver.verificationToken;

    // 3. Dolu saat 10:00 için çağır -> slot_conflict ve token verified kalmalı
    const conflictRes = await repo.createPublicBooking({
      slug: 'salon-local-atom',
      serviceId: 'srv_1',
      staffId: 'staff_1',
      appointmentDate: '2026-12-01',
      appointmentTime: '10:00',
      customerName: 'Çakışan Müşteri',
      customerEmail: 'cakisan@test.com',
      customerPhone: '+90 555 222 8899',
      requiredConsent: true,
      otpVerificationToken: token,
    });
    assert.strictEqual(conflictRes.success, false);
    assert.strictEqual(conflictRes.reasonCode, 'slot_conflict');
    assert.strictEqual(
      publicBookingOtpService.getSyntheticChallengeAudit(req.challengeId).status,
      'verified',
      'slot_conflict sonrası yerel OTP verified kalmalıdır'
    );

    // 4. Beklenmeyen repository hatasında da token yanmamalı
    repo.createAppointment = async () => { throw new Error('Simulated storage write failure'); };
    const failRes = await repo.createPublicBooking({
      slug: 'salon-local-atom',
      serviceId: 'srv_1',
      staffId: 'staff_1',
      appointmentDate: '2026-12-01',
      appointmentTime: '11:00',
      customerName: 'Hata Müşterisi',
      customerEmail: 'hata@test.com',
      customerPhone: '+90 555 222 8899',
      requiredConsent: true,
      otpVerificationToken: token,
    });
    assert.strictEqual(failRes.success, false);
    assert.strictEqual(failRes.reasonCode, 'temporary_failure');
    assert.strictEqual(
      publicBookingOtpService.getSyntheticChallengeAudit(req.challengeId).status,
      'verified',
      'createAppointment istisnasında yerel OTP verified kalmalıdır'
    );

    // 5. Hata giderildikten sonra aynı token ile retry başarılı olmalı ve consumed olmalı
    repo.createAppointment = origCreateAppointment;
    const retryRes = await repo.createPublicBooking({
      slug: 'salon-local-atom',
      serviceId: 'srv_1',
      staffId: 'staff_1',
      appointmentDate: '2026-12-01',
      appointmentTime: '11:00',
      customerName: 'Retry Başarılı',
      customerEmail: 'retry@test.com',
      customerPhone: '+90 555 222 8899',
      requiredConsent: true,
      otpVerificationToken: token,
    });
    assert.strictEqual(retryRes.success, true);
    assert.strictEqual(retryRes.reasonCode, 'ok');
    assert.strictEqual(
      publicBookingOtpService.getSyntheticChallengeAudit(req.challengeId).status,
      'consumed',
      'Başarılı randevu sonrası yerel OTP consumed olmalıdır'
    );

    // 6. Replay engeli
    const replayRes = await repo.createPublicBooking({
      slug: 'salon-local-atom',
      serviceId: 'srv_1',
      staffId: 'staff_1',
      appointmentDate: '2026-12-01',
      appointmentTime: '12:00',
      customerName: 'Replay Deneme',
      customerEmail: 'replay@test.com',
      customerPhone: '+90 555 222 8899',
      requiredConsent: true,
      otpVerificationToken: token,
    });
    assert.strictEqual(replayRes.success, false);
    assert.strictEqual(replayRes.reasonCode, 'otp_token_invalid_or_consumed');
  } finally {
    repo.createAppointment = origCreateAppointment;
    restoreLS();
  }
});

await runAsyncTest('2.14. [LOCAL REPO EŞZAMANLILIK] Aynı tokenla paralel çift gönderimde yalnızca 1 randevu oluşur ve çakışma kilidi salınır', async () => {
  const restoreLS = installNodeLocalStorageShim();
  const { LocalBookingRepository } = await import('../services/repositories/localBookingRepository.ts');
  const repo = new LocalBookingRepository();
  const origCreateAppointment = repo.createAppointment.bind(repo);
  try {
    localStorage.clear();
    localStorage.setItem('lari:salon-local-conc:appointments_seeded', 'true');
    publicBookingOtpService.clearSyntheticHarness();

    // Case A: Başarılı eşzamanlı iki istek -> tam 1 başarılı, 1 otp_token_invalid_or_consumed
    const req1 = await publicBookingOtpService.requestOtp({
      slug: 'salon-local-conc',
      phone: '+90 555 333 9911',
      syntheticOtp: '778899',
    });
    const ver1 = await publicBookingOtpService.verifyOtp({
      slug: 'salon-local-conc',
      challengeId: req1.challengeId,
      otpCode: '778899',
      phone: '+90 555 333 9911',
    });
    assert.strictEqual(ver1.success, true);

    repo.createAppointment = async (...args) => {
      await new Promise(r => setTimeout(r, 35));
      return origCreateAppointment(...args);
    };

    const [resA, resB] = await Promise.all([
      repo.createPublicBooking({
        slug: 'salon-local-conc',
        serviceId: 'srv_1',
        staffId: 'staff_1',
        appointmentDate: '2026-12-02',
        appointmentTime: '13:00',
        customerName: 'Paralel A',
        customerEmail: 'pa@test.com',
        customerPhone: '+90 555 333 9911',
        requiredConsent: true,
        otpVerificationToken: ver1.verificationToken,
      }),
      repo.createPublicBooking({
        slug: 'salon-local-conc',
        serviceId: 'srv_1',
        staffId: 'staff_1',
        appointmentDate: '2026-12-02',
        appointmentTime: '14:00',
        customerName: 'Paralel B',
        customerEmail: 'pb@test.com',
        customerPhone: '+90 555 333 9911',
        requiredConsent: true,
        otpVerificationToken: ver1.verificationToken,
      }),
    ]);

    const okCount = [resA, resB].filter(r => r.success).length;
    const rejCount = [resA, resB].filter(r => !r.success && r.reasonCode === 'otp_token_invalid_or_consumed').length;
    assert.strictEqual(okCount, 1, 'Paralel iki istekten yalnızca 1 tanesi başarılı olmalıdır');
    assert.strictEqual(rejCount, 1, 'Paralel ikinci istek otp_token_invalid_or_consumed almalıdır');
    const savedApts = await repo.listAppointments('salon-local-conc');
    assert.strictEqual(savedApts.length, 1, 'Depoda tam 1 randevu oluşmalıdır');
    assert.strictEqual(publicBookingOtpService.getSyntheticChallengeAudit(req1.challengeId).status, 'consumed');

    // Case B: İlk paralel istek slot_conflict ile başarısız olursa kilit salınır ve sonraki retry başarılı olur
    const req2 = await publicBookingOtpService.requestOtp({
      slug: 'salon-local-conc',
      phone: '+90 555 333 9922',
      syntheticOtp: '665544',
    });
    const ver2 = await publicBookingOtpService.verifyOtp({
      slug: 'salon-local-conc',
      challengeId: req2.challengeId,
      otpCode: '665544',
      phone: '+90 555 333 9922',
    });
    const [failConc, rejConc] = await Promise.all([
      repo.createPublicBooking({
        slug: 'salon-local-conc',
        serviceId: 'srv_1',
        staffId: 'staff_1',
        appointmentDate: '2026-12-02',
        appointmentTime: '13:00', // Case A tarafından dolu!
        customerName: 'Paralel Fail',
        customerEmail: 'pf@test.com',
        customerPhone: '+90 555 333 9922',
        requiredConsent: true,
        otpVerificationToken: ver2.verificationToken,
      }),
      repo.createPublicBooking({
        slug: 'salon-local-conc',
        serviceId: 'srv_1',
        staffId: 'staff_1',
        appointmentDate: '2026-12-02',
        appointmentTime: '15:00',
        customerName: 'Paralel Blocked',
        customerEmail: 'pblk@test.com',
        customerPhone: '+90 555 333 9922',
        requiredConsent: true,
        otpVerificationToken: ver2.verificationToken,
      }),
    ]);
    assert.strictEqual(failConc.reasonCode, 'slot_conflict');
    assert.strictEqual(rejConc.reasonCode, 'otp_token_invalid_or_consumed');
    assert.strictEqual(
      publicBookingOtpService.getSyntheticChallengeAudit(req2.challengeId).status,
      'verified',
      'Paralel ilk istek slot_conflict aldığında kilit salınmalı ve token verified kalmalıdır'
    );

    const retryOk = await repo.createPublicBooking({
      slug: 'salon-local-conc',
      serviceId: 'srv_1',
      staffId: 'staff_1',
      appointmentDate: '2026-12-02',
      appointmentTime: '15:00',
      customerName: 'Retry Sonrasi Basarili',
      customerEmail: 'rok@test.com',
      customerPhone: '+90 555 333 9922',
      requiredConsent: true,
      otpVerificationToken: ver2.verificationToken,
    });
    assert.strictEqual(retryOk.success, true);
    assert.strictEqual(publicBookingOtpService.getSyntheticChallengeAudit(req2.challengeId).status, 'consumed');
  } finally {
    repo.createAppointment = origCreateAppointment;
    restoreLS();
  }
});

// -----------------------------------------------------------------------------
// SECTION 3: GERÇEK EMBEDDED POSTGRESQL VE CANDIDATE MIGRATION DOĞRULAMASI
// -----------------------------------------------------------------------------
let embeddedPg = null;
let pgClient = null;
let disposableTmpDir = null;

async function getDisposablePgEngine() {
  if (pgClient) return pgClient;

  disposableTmpDir = path.join(os.tmpdir(), `pg_lari_otp_${Date.now()}_${Math.floor(Math.random() * 10000)}`);
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

  // Supabase rolleri
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

  // Temel şema tabloları
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS public;
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS public.tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
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
      is_active BOOLEAN DEFAULT true,
      is_primary BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.services (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      duration_minutes INTEGER DEFAULT 30,
      active BOOLEAN DEFAULT true,
      price NUMERIC DEFAULT 250.00
    );

    CREATE TABLE IF NOT EXISTS public.staff (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      active BOOLEAN DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS public.customers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT
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
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.appointment_access_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL,
      appointment_id UUID NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.consent_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      consent_type TEXT NOT NULL,
      is_granted BOOLEAN NOT NULL,
      ip_address TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.public_booking_idempotency (
      idempotency_key TEXT NOT NULL,
      tenant_id UUID NOT NULL,
      appointment_id UUID NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (idempotency_key, tenant_id)
    );

    CREATE TABLE IF NOT EXISTS public.communication_outbox (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL,
      recipient TEXT NOT NULL,
      channel TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'queued',
      delivery_mode TEXT DEFAULT 'synthetic_outbox_only',
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'active',
      plan_id TEXT DEFAULT 'pro'
    );

    -- Helper RPCs mock implementation for commercial and slot engines
    CREATE OR REPLACE FUNCTION public.resolve_tenant_commercial_eligibility(p_tenant_id uuid)
    RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('eligible', true); $$;

    CREATE OR REPLACE FUNCTION public.assert_tenant_commercial_action_allowed(p_tenant_id uuid, p_action text)
    RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('allowed', true); $$;

    CREATE OR REPLACE FUNCTION public.resolve_quota_period_key(p_tenant_id uuid, p_metric text)
    RETURNS text LANGUAGE sql AS $$ SELECT '2026-11'::text; $$;

    CREATE OR REPLACE FUNCTION public.consume_commercial_usage(p_tenant_id uuid, p_metric text, p_period text)
    RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('success', true); $$;

    CREATE OR REPLACE FUNCTION public.evaluate_booking_slot(
      p_tenant_id uuid, p_branch_id uuid, p_service_id uuid, p_staff_id uuid, p_date date, p_time time
    )
    RETURNS jsonb LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM public.appointments a
        WHERE a.tenant_id = p_tenant_id
          AND a.staff_id = p_staff_id
          AND a.appointment_date = p_date
          AND a.appointment_time = p_time
          AND a.status NOT IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system', 'no_show')
      ) THEN
        RETURN jsonb_build_object('allowed', false, 'duration_minutes', 30, 'reason_code', 'slot_conflict');
      END IF;
      RETURN jsonb_build_object('allowed', true, 'duration_minutes', 30, 'reason_code', 'ok');
    END;
    $$;
  `);

  // 20260903 candidate migration'ını gerçek Postgres üzerine uygula
  await client.query(migContent);

  pgClient = client;
  return pgClient;
}

try {
  await runAsyncTest('3.1. [GERÇEK DB] 20260903 migration uygulandı ve tüm RPC ler SECURITY DEFINER olarak hazır', async () => {
    const db = await getDisposablePgEngine();
    const res = await db.query(`
      SELECT proname, prosecdef FROM pg_proc
      JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
      WHERE proname IN (
        'evaluate_and_record_public_booking_rate_limit',
        'request_public_booking_otp',
        'verify_public_booking_otp',
        'create_public_booking'
      ) AND nspname = 'public';
    `);

    assert.strictEqual(res.rows.length, 4, '4 RPC fonksiyonu da oluşturulmuş olmalıdır');
    for (const row of res.rows) {
      assert.strictEqual(row.prosecdef, true, `${row.proname} fonksiyonu SECURITY DEFINER olmalıdır`);
    }
  });

  let tenantAId, tenantBId, serviceAId, staffAId, branchAId;

  await runAsyncTest('3.2. [GERÇEK DB SEED] Test tenantları, şubeleri, servis ve personelleri eklendi', async () => {
    const db = await getDisposablePgEngine();

    const tA = await db.query(`
      INSERT INTO public.tenants (name, slug, status, onboarding_status, public_site_status)
      VALUES ('Salon Alfa', 'salon-alfa', 'active', 'completed', 'published')
      RETURNING id;
    `);
    tenantAId = tA.rows[0].id;

    const tB = await db.query(`
      INSERT INTO public.tenants (name, slug, status, onboarding_status, public_site_status)
      VALUES ('Salon Beta', 'salon-beta', 'active', 'completed', 'published')
      RETURNING id;
    `);
    tenantBId = tB.rows[0].id;

    const brA = await db.query(`
      INSERT INTO public.branches (tenant_id, name, is_active, is_primary)
      VALUES ($1, 'Merkez Sube', true, true) RETURNING id;
    `, [tenantAId]);
    branchAId = brA.rows[0].id;

    const sA = await db.query(`
      INSERT INTO public.services (tenant_id, name, duration_minutes, active)
      VALUES ($1, 'Sac Kesim', 30, true) RETURNING id;
    `, [tenantAId]);
    serviceAId = sA.rows[0].id;

    const stA = await db.query(`
      INSERT INTO public.staff (tenant_id, name, active)
      VALUES ($1, 'Ahmet Usta', true) RETURNING id;
    `, [tenantAId]);
    staffAId = stA.rows[0].id;
  });

  let challengeAId;
  const knownTestCode = '882211';
  const knownTestCodeHash = crypto.createHash('sha256').update(knownTestCode, 'utf8').digest('hex');

  await runAsyncTest('3.3. [GERÇEK DB] request_public_booking_otp anon güvenlik kontrolü, hash doğrulaması ve WhatsApp outbox', async () => {
    const db = await getDisposablePgEngine();

    // 1. Güvenlik İhlali Testi (FINDING-ADIM010-001): anon rolü sentetik hash gönderemez!
    await db.query('SET ROLE anon');
    const anonHackRes = await db.query(`
      SELECT public.request_public_booking_otp(
        p_slug := 'salon-alfa',
        p_customer_phone := '+90 555 123 4567',
        p_client_fingerprint := 'fp_anon_hack',
        p_synthetic_otp_hash := $1
      ) AS res;
    `, [knownTestCodeHash]);
    await db.query('RESET ROLE');
    assert.strictEqual(anonHackRes.rows[0].res.success, false);
    assert.strictEqual(anonHackRes.rows[0].res.reason_code, 'synthetic_hash_forbidden_for_public', 'anon sentetik hash gönderemez');

    // 2. Geçersiz Format Testi: 64 hex olmayan sentetik hash reddedilir
    const invalidFormatRes = await db.query(`
      SELECT public.request_public_booking_otp(
        p_slug := 'salon-alfa',
        p_customer_phone := '+90 555 123 4567',
        p_client_fingerprint := 'fp_db_1',
        p_synthetic_otp_hash := '123456'
      ) AS res;
    `);
    assert.strictEqual(invalidFormatRes.rows[0].res.success, false);
    assert.strictEqual(invalidFormatRes.rows[0].res.reason_code, 'invalid_synthetic_otp_hash');

    // 3. Yetkili (server/internal) ortamda geçerli 64-hex sentetik hash ile challenge oluşturma
    const rpcRes = await db.query(`
      SELECT public.request_public_booking_otp(
        p_slug := 'salon-alfa',
        p_customer_phone := '+90 555 123 4567',
        p_client_fingerprint := 'fp_db_1',
        p_synthetic_otp_hash := $1
      ) AS res;
    `, [knownTestCodeHash]);

    const data = rpcRes.rows[0].res;
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.reasonCode || data.reason_code, 'ok');
    const challengeId = data.challengeId || data.challenge_id;
    assert(challengeId, 'challengeId dönmelidir');
    challengeAId = challengeId;

    // Challenge tablosunda ham kod bulunmadığını, yalnızca hash bulunduğunu doğrula
    const chRow = await db.query('SELECT * FROM public.public_booking_otp_challenges WHERE id = $1', [challengeAId]);
    assert.strictEqual(chRow.rows.length, 1);
    assert.strictEqual(chRow.rows[0].otp_code_hash, knownTestCodeHash, 'DB de sadece SHA-256 hash saklanmalıdır');
    assert.strictEqual(chRow.rows[0].status, 'pending');

    // Outbox kaydının synthetic_outbox_only ve whatsapp olduğunu doğrula
    const outboxRow = await db.query(
      "SELECT * FROM public.communication_outbox WHERE metadata->>'challenge_id' = $1",
      [challengeAId]
    );
    assert.strictEqual(outboxRow.rows.length, 1);
    assert.strictEqual(outboxRow.rows[0].delivery_mode, 'synthetic_outbox_only');
    assert.strictEqual(outboxRow.rows[0].channel, 'whatsapp', 'Hedef outbox kanalı whatsapp olmalıdır');
  });

  await runAsyncTest('3.4. [GERÇEK DB] Cooldown kontrolü: 60s içinde ikinci OTP talebi otp_rate_limited döner', async () => {
    const db = await getDisposablePgEngine();

    const rpcRes = await db.query(`
      SELECT public.request_public_booking_otp(
        p_slug := 'salon-alfa',
        p_customer_phone := '+90 555 123 4567',
        p_client_fingerprint := 'fp_db_1'
      ) AS res;
    `);

    const data = rpcRes.rows[0].res;
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.reasonCode || data.reason_code, 'otp_rate_limited');
    const remaining = data.cooldown_remaining_seconds ?? data.cooldownRemainingSeconds;
    assert(remaining > 0, 'Kalan süre bildirilmeli');
  });

  await runAsyncTest('3.5. [GERÇEK DB] Cross-tenant izolasyonu: Tenant A challenge ı Tenant B slug ile doğrulanamaz (tenant_mismatch)', async () => {
    const db = await getDisposablePgEngine();

    const rpcRes = await db.query(`
      SELECT public.verify_public_booking_otp(
        p_slug := 'salon-beta', -- Yanlış tenant
        p_challenge_id := $1,
        p_otp_code := $2,
        p_customer_phone := '+90 555 123 4567'
      ) AS res;
    `, [challengeAId, knownTestCode]);

    const data = rpcRes.rows[0].res;
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.reasonCode || data.reason_code, 'tenant_mismatch');
  });

  await runAsyncTest('3.6. [GERÇEK DB] Brute-force kilidi: 3 yanlış kod sonrası challenge locked olur ve doğru kodla dahi açılmaz', async () => {
    const db = await getDisposablePgEngine();

    // Yeni challenge aç
    const reqRes = await db.query(`
      SELECT public.request_public_booking_otp(
        p_slug := 'salon-alfa',
        p_customer_phone := '+90 555 777 8899',
        p_synthetic_otp_hash := $1
      ) AS res;
    `, [knownTestCodeHash]);
    const lockChallengeId = reqRes.rows[0].res.challengeId || reqRes.rows[0].res.challenge_id;
    assert(lockChallengeId, 'lockChallengeId alınmalıdır');

    // 1. Yanlış deneme
    const r1 = await db.query(`
      SELECT public.verify_public_booking_otp('salon-alfa', $1, '000000', '+90 555 777 8899') AS res;
    `, [lockChallengeId]);
    assert.strictEqual(r1.rows[0].res.reason_code, 'otp_invalid');
    assert.strictEqual(r1.rows[0].res.attempts_remaining, 2);

    // 2. Yanlış deneme
    const r2 = await db.query(`
      SELECT public.verify_public_booking_otp('salon-alfa', $1, '111111', '+90 555 777 8899') AS res;
    `, [lockChallengeId]);
    assert.strictEqual(r2.rows[0].res.reason_code, 'otp_invalid');
    assert.strictEqual(r2.rows[0].res.attempts_remaining, 1);

    // 3. Yanlış deneme -> locked
    const r3 = await db.query(`
      SELECT public.verify_public_booking_otp('salon-alfa', $1, '222222', '+90 555 777 8899') AS res;
    `, [lockChallengeId]);
    assert.strictEqual(r3.rows[0].res.reason_code, 'otp_brute_force_locked');
    assert.strictEqual(r3.rows[0].res.attempts_remaining, 0);

    // 4. Deneme: DOĞRU KOD girmesine rağmen kilitlenmiş olmalı (Fail-closed)
    const r4 = await db.query(`
      SELECT public.verify_public_booking_otp('salon-alfa', $1, $2, '+90 555 777 8899') AS res;
    `, [lockChallengeId, knownTestCode]);
    assert.strictEqual(r4.rows[0].res.reason_code, 'otp_brute_force_locked');
  });

  let validVerificationToken;

  await runAsyncTest('3.7. [GERÇEK DB] Doğru kodla verify_public_booking_otp tek kullanımlık token üretir', async () => {
    const db = await getDisposablePgEngine();

    const rpcRes = await db.query(`
      SELECT public.verify_public_booking_otp(
        p_slug := 'salon-alfa',
        p_challenge_id := $1,
        p_otp_code := $2,
        p_customer_phone := '+90 555 123 4567'
      ) AS res;
    `, [challengeAId, knownTestCode]);

    const data = rpcRes.rows[0].res;
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.reason_code, 'ok');
    assert(data.verification_token, 'verification_token dönmeli');
    validVerificationToken = data.verification_token;

    // DB durumunu kontrol et: status = 'verified'
    const chRow = await db.query('SELECT status FROM public.public_booking_otp_challenges WHERE id = $1', [challengeAId]);
    assert.strictEqual(chRow.rows[0].status, 'verified');
  });

  // FINDING-ADIM010-003: Sunucu Tarafı require_otp_for_booking Politikası
  await runAsyncTest('3.7b. [GERÇEK DB] require_otp_for_booking aktifken tokensız çağrı otp_required ile durdurulur', async () => {
    const db = await getDisposablePgEngine();

    // Tenant A için OTP zorunluluğunu aktif et
    await db.query('UPDATE public.tenants SET require_otp_for_booking = true WHERE id = $1', [tenantAId]);

    // Token vermeden rezervasyon dene
    const noTokenRes = await db.query(`
      SELECT public.create_public_booking(
        p_slug := 'salon-alfa',
        p_service_id := $1,
        p_staff_id := $2,
        p_appointment_date := '2026-11-20'::date,
        p_appointment_time := '14:00'::time,
        p_customer_name := 'Test Müşteri No Token',
        p_customer_email := 'musteri@test.com',
        p_customer_phone := '+90 555 123 4567',
        p_required_consent := true,
        p_branch_id := $3
      ) AS res;
    `, [serviceAId, staffAId, branchAId]);

    const data = noTokenRes.rows[0].res;
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.reason_code, 'otp_required', 'OTP politikası aktifken tokensız istek otp_required dönmelidir');

    // Hiçbir randevu kaydı oluşmadığını doğrula
    const aptCount = await db.query('SELECT count(*) FROM public.appointments WHERE user_name = $1', ['Test Müşteri No Token']);
    assert.strictEqual(parseInt(aptCount.rows[0].count, 10), 0, 'Randevu oluşmamalıdır');
  });

  let createdAppointmentId;

  await runAsyncTest('3.8. [GERÇEK DB] create_public_booking tokenı başarıyla doğrular ve status u consumed yapar', async () => {
    const db = await getDisposablePgEngine();

    const bookingRes = await db.query(`
      SELECT public.create_public_booking(
        p_slug := 'salon-alfa',
        p_service_id := $1,
        p_staff_id := $2,
        p_appointment_date := '2026-11-20'::date,
        p_appointment_time := '14:00'::time,
        p_customer_name := 'Test Müşteri',
        p_customer_email := 'musteri@test.com',
        p_customer_phone := '+90 555 123 4567',
        p_required_consent := true,
        p_marketing_consent := false,
        p_reminder_consent := true,
        p_idempotency_key := 'idem_test_otp_1',
        p_branch_id := $3,
        p_otp_verification_token := $4,
        p_client_fingerprint := 'fp_db_1'
      ) AS res;
    `, [serviceAId, staffAId, branchAId, validVerificationToken]);

    const data = bookingRes.rows[0].res;
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.reason_code, 'ok');
    assert(data.appointment_id, 'appointment_id üretilmelidir');
    createdAppointmentId = data.appointment_id;

    // Challenge durumunu kontrol et: status = 'consumed'
    const chRow = await db.query('SELECT status, consumed_at FROM public.public_booking_otp_challenges WHERE id = $1', [challengeAId]);
    assert.strictEqual(chRow.rows[0].status, 'consumed', 'Token randevu oluştuktan sonra consumed olmalıdır');
    assert(chRow.rows[0].consumed_at, 'consumed_at kaydedilmelidir');
  });

  // FINDING-ADIM010-004: Atomik Tüketim / Başarısız İşlemde Token Yanmaz
  await runAsyncTest('3.8b. [GERÇEK DB] Hatalı rezervasyonda (invalid_branch) OTP tokenı tüketilmez (verified kalır)', async () => {
    const db = await getDisposablePgEngine();

    // Yeni challenge aç ve doğrula
    const code2 = '991122';
    const code2Hash = crypto.createHash('sha256').update(code2, 'utf8').digest('hex');
    const rRes = await db.query(`
      SELECT public.request_public_booking_otp(
        p_slug := 'salon-alfa',
        p_customer_phone := '+90 555 333 7788',
        p_synthetic_otp_hash := $1
      ) AS res;
    `, [code2Hash]);
    const chId2 = rRes.rows[0].res.challengeId || rRes.rows[0].res.challenge_id;

    const vRes = await db.query(`
      SELECT public.verify_public_booking_otp('salon-alfa', $1, $2, '+90 555 333 7788') AS res;
    `, [chId2, code2]);
    const token2 = vRes.rows[0].res.verification_token;
    assert(token2, 'token2 alınmalı');

    // Geçersiz şube (böyle bir şube yok) ile çağır
    const fakeBranchId = '00000000-0000-0000-0000-000000000000';
    const failBooking = await db.query(`
      SELECT public.create_public_booking(
        p_slug := 'salon-alfa',
        p_service_id := $1,
        p_staff_id := $2,
        p_appointment_date := '2026-11-25'::date,
        p_appointment_time := '10:00'::time,
        p_customer_name := 'Test Müşteri Branch Fail',
        p_customer_email := 'fail@test.com',
        p_customer_phone := '+90 555 333 7788',
        p_required_consent := true,
        p_branch_id := $3,
        p_otp_verification_token := $4
      ) AS res;
    `, [serviceAId, staffAId, fakeBranchId, token2]);

    assert.strictEqual(failBooking.rows[0].res.success, false);
    assert.strictEqual(failBooking.rows[0].res.reason_code, 'invalid_branch');

    // Challenge durumu hala 'verified' olmalı, 'consumed' olmamalı!
    const chCheck = await db.query('SELECT status FROM public.public_booking_otp_challenges WHERE id = $1', [chId2]);
    assert.strictEqual(chCheck.rows[0].status, 'verified', 'Hatalı işlemde token yanmamalı, verified kalmalıdır');
  });

  // FINDING-ADIM010-002: pg_proc + ACL + SET ROLE + 13-Parametreli Eski Sözleşme (20260813) Uyumluluğu
  await runAsyncTest('3.8c. [GERÇEK DB] pg_proc, ACL, SET ROLE anon/authenticated ve 13-arg konumsal/isimli eski istemci uyumluluğu', async () => {
    const db = await getDisposablePgEngine();

    // 1. pg_proc üzerinde tek overload, exact argüman tipleri/adları, varsayılan sayısı ve search_path doğrula
    const procRes = await db.query(`
      SELECT
        p.oid,
        p.prosecdef,
        p.pronargs,
        p.pronargdefaults,
        p.proargnames,
        ARRAY(
          SELECT pg_catalog.format_type(t, NULL)
          FROM unnest(p.proargtypes) WITH ORDINALITY AS u(t, ord)
          ORDER BY u.ord
        ) AS arg_types,
        p.proconfig,
        COALESCE(array_to_string(p.proacl, ','), '') AS acl_str,
        pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
        pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
        pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') AS srv_exec
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'create_public_booking';
    `);

    assert.strictEqual(procRes.rows.length, 1, 'pg_proc içinde yalnızca tek create_public_booking bulunmalıdır (güvensiz overload olmamalı)');
    const proc = procRes.rows[0];
    assert.strictEqual(proc.prosecdef, true, 'SECURITY DEFINER olmalıdır');
    assert.strictEqual(proc.pronargs, 15, '13 legacy + 2 trailing nullable OTP/fingerprint parametresi = 15 olmalıdır');
    assert.strictEqual(proc.pronargdefaults, 6, 'Son 6 parametre (marketing, reminder, idemp, branch, otp, fp) DEFAULT değerine sahip olmalıdır');
    assert.deepStrictEqual(proc.arg_types, [
      'text', 'uuid', 'uuid', 'date', 'time without time zone',
      'text', 'text', 'text', 'boolean', 'boolean', 'boolean', 'text', 'uuid',
      'text', 'text'
    ], '20260813 kanonik 13-arg sırası/tipleri + 2 trailing text korunmalıdır');
    assert.deepStrictEqual(proc.proargnames, [
      'p_slug', 'p_service_id', 'p_staff_id', 'p_appointment_date', 'p_appointment_time',
      'p_customer_name', 'p_customer_email', 'p_customer_phone', 'p_required_consent',
      'p_marketing_consent', 'p_reminder_consent', 'p_idempotency_key', 'p_branch_id',
      'p_otp_verification_token', 'p_client_fingerprint'
    ]);
    assert(
      Array.isArray(proc.proconfig) && proc.proconfig.includes('search_path=pg_catalog, public, extensions'),
      'search_path sabitlenmelidir'
    );
    assert.strictEqual(proc.anon_exec, true, 'anon EXECUTE yetkisine sahip olmalı');
    assert.strictEqual(proc.auth_exec, true, 'authenticated EXECUTE yetkisine sahip olmalı');
    assert.strictEqual(proc.srv_exec, true, 'service_role EXECUTE yetkisine sahip olmalı');
    assert(!proc.acl_str.split(',').some(a => a.startsWith('=X/')), 'PUBLIC EXECUTE yetkisi kaldırılmış olmalıdır');

    // İç rate-limit helper'ı anon ve authenticated için kapalı olmalı
    const privHelperRes = await db.query(`
      SELECT
        pg_catalog.has_function_privilege('anon', 'public.evaluate_and_record_public_booking_rate_limit(uuid,text,text,uuid,date)', 'EXECUTE') AS anon_rl,
        pg_catalog.has_function_privilege('authenticated', 'public.evaluate_and_record_public_booking_rate_limit(uuid,text,text,uuid,date)', 'EXECUTE') AS auth_rl;
    `);
    assert.strictEqual(privHelperRes.rows[0].anon_rl, false, 'anon rate_limit iç helperına erişememelidir');
    assert.strictEqual(privHelperRes.rows[0].auth_rl, false, 'authenticated rate_limit iç helperına erişememelidir');

    // Tenant B için fixtures
    const brB = await db.query(`
      INSERT INTO public.branches (tenant_id, name, is_active, is_primary)
      VALUES ($1, 'Beta Merkez', true, true) RETURNING id;
    `, [tenantBId]);
    const branchBId = brB.rows[0].id;

    const sB = await db.query(`
      INSERT INTO public.services (tenant_id, name, duration_minutes, active)
      VALUES ($1, 'Beta Hizmet', 30, true) RETURNING id;
    `, [tenantBId]);
    const serviceBId = sB.rows[0].id;

    const stB = await db.query(`
      INSERT INTO public.staff (tenant_id, name, active)
      VALUES ($1, 'Beta Personel', true) RETURNING id;
    `, [tenantBId]);
    const staffBId = stB.rows[0].id;

    // 2. SET ROLE anon ile 13 parametreli NAMED çağrı
    let legacyNamed;
    await db.query('SET ROLE anon');
    try {
      legacyNamed = await db.query(`
        SELECT public.create_public_booking(
          p_slug := 'salon-beta',
          p_service_id := $1,
          p_staff_id := $2,
          p_appointment_date := '2026-11-22'::date,
          p_appointment_time := '11:00'::time,
          p_customer_name := 'Eski Sözleşme Named Anon',
          p_customer_email := 'eski_named@test.com',
          p_customer_phone := '+90 555 444 3322',
          p_required_consent := true,
          p_marketing_consent := false,
          p_reminder_consent := true,
          p_idempotency_key := 'idem_legacy_13_arg_named',
          p_branch_id := $3
        ) AS res;
      `, [serviceBId, staffBId, branchBId]);
    } finally {
      await db.query('RESET ROLE');
    }
    assert.strictEqual(legacyNamed.rows[0].res.success, true);
    assert.strictEqual(legacyNamed.rows[0].res.reason_code, 'ok');
    assert(legacyNamed.rows[0].res.appointment_id, 'Named eski çağrı appointment_id üretmelidir');

    // 3. SET ROLE authenticated ile 13 parametreli POSITIONAL (konumsal) çağrı
    let legacyPos;
    await db.query('SET ROLE authenticated');
    try {
      legacyPos = await db.query(`
        SELECT public.create_public_booking(
          'salon-beta', $1::uuid, $2::uuid, '2026-11-23'::date, '12:00'::time,
          'Eski Sözleşme Konumsal Auth', 'eski_pos@test.com', '+90 555 444 3399',
          true, false, true, 'idem_legacy_13_arg_pos', $3::uuid
        ) AS res;
      `, [serviceBId, staffBId, branchBId]);
    } finally {
      await db.query('RESET ROLE');
    }
    assert.strictEqual(legacyPos.rows[0].res.success, true);
    assert.strictEqual(legacyPos.rows[0].res.reason_code, 'ok');
    assert(legacyPos.rows[0].res.appointment_id, 'Konumsal eski çağrı appointment_id üretmelidir');

    // 4. Güvenlik doğrulaması: require_otp_for_booking = true iken 13-arg konumsal çağrı OTP güvenliğini ATLAYAMAZ
    await db.query('UPDATE public.tenants SET require_otp_for_booking = true WHERE id = $1', [tenantBId]);
    try {
      let bypassAttempt;
      await db.query('SET ROLE anon');
      try {
        bypassAttempt = await db.query(`
          SELECT public.create_public_booking(
            'salon-beta', $1::uuid, $2::uuid, '2026-11-24'::date, '13:00'::time,
            'Bypass Deneme', 'bypass@test.com', '+90 555 444 3388',
            true, false, false, 'idem_legacy_bypass', $3::uuid
          ) AS res;
        `, [serviceBId, staffBId, branchBId]);
      } finally {
        await db.query('RESET ROLE');
      }
      assert.strictEqual(bypassAttempt.rows[0].res.success, false);
      assert.strictEqual(bypassAttempt.rows[0].res.reason_code, 'otp_required', 'Eski 13-arg çağrı OTP zorunluluğunu atlayamamalıdır');
    } finally {
      await db.query('UPDATE public.tenants SET require_otp_for_booking = false WHERE id = $1', [tenantBId]);
    }
  });

  // FINDING-ADIM010-004: Gerçek slot_conflict durumunda OTP tokenı tüketilmez (verified kalır) ve yeni saatle retry başarılı olur
  await runAsyncTest('3.8d. [GERÇEK DB] slot_conflict durumunda doğrulanmış OTP tokenı tüketilmez (verified kalır) ve retry başarılı olur', async () => {
    const db = await getDisposablePgEngine();

    const codeSlot = '447788';
    const codeSlotHash = crypto.createHash('sha256').update(codeSlot, 'utf8').digest('hex');
    const rRes = await db.query(`
      SELECT public.request_public_booking_otp(
        p_slug := 'salon-alfa',
        p_customer_phone := '+90 555 444 9900',
        p_client_fingerprint := 'fp_slot_test',
        p_synthetic_otp_hash := $1
      ) AS res;
    `, [codeSlotHash]);
    const chSlotId = rRes.rows[0].res.challengeId || rRes.rows[0].res.challenge_id;
    assert(chSlotId, 'chSlotId üretilmeli');

    const vRes = await db.query(`
      SELECT public.verify_public_booking_otp('salon-alfa', $1, $2, '+90 555 444 9900') AS res;
    `, [chSlotId, codeSlot]);
    const tokenSlot = vRes.rows[0].res.verification_token;
    assert(tokenSlot, 'tokenSlot alınmalı');

    // Test 3.8 de '2026-11-20' '14:00' staffAId için randevu oluşturulmuştu -> gerçek slot_conflict!
    let conflictRes;
    await db.query('SET ROLE anon');
    try {
      conflictRes = await db.query(`
        SELECT public.create_public_booking(
          p_slug := 'salon-alfa',
          p_service_id := $1,
          p_staff_id := $2,
          p_appointment_date := '2026-11-20'::date,
          p_appointment_time := '14:00'::time,
          p_customer_name := 'Slot Conflict Müşteri',
          p_customer_email := 'slotconflict@test.com',
          p_customer_phone := '+90 555 444 9900',
          p_required_consent := true,
          p_marketing_consent := false,
          p_reminder_consent := false,
          p_idempotency_key := 'idem_slot_conflict_1',
          p_branch_id := $3,
          p_otp_verification_token := $4,
          p_client_fingerprint := 'fp_slot_test'
        ) AS res;
      `, [serviceAId, staffAId, branchAId, tokenSlot]);
    } finally {
      await db.query('RESET ROLE');
    }
    assert.strictEqual(conflictRes.rows[0].res.success, false);
    assert.strictEqual(conflictRes.rows[0].res.reason_code, 'slot_conflict', 'Çakışan saatte slot_conflict dönmelidir');

    // Randevu oluşmadığını ve challenge status un 'verified' kaldığını doğrula
    const aptCheck = await db.query("SELECT count(*) FROM public.appointments WHERE phone = '+90 555 444 9900'");
    assert.strictEqual(parseInt(aptCheck.rows[0].count, 10), 0, 'slot_conflict durumunda randevu oluşturulmamalıdır');
    const chCheck = await db.query('SELECT status, consumed_at FROM public.public_booking_otp_challenges WHERE id = $1', [chSlotId]);
    assert.strictEqual(chCheck.rows[0].status, 'verified', 'slot_conflict sonrası challenge verified kalmalıdır');
    assert.strictEqual(chCheck.rows[0].consumed_at, null, 'consumed_at boş kalmalıdır');

    // Aynı token ile müsait bir saate ('2026-11-26' '11:30') retry -> başarılı ve consumed olmalı!
    let retryRes;
    await db.query('SET ROLE anon');
    try {
      retryRes = await db.query(`
        SELECT public.create_public_booking(
          p_slug := 'salon-alfa',
          p_service_id := $1,
          p_staff_id := $2,
          p_appointment_date := '2026-11-26'::date,
          p_appointment_time := '11:30'::time,
          p_customer_name := 'Slot Retry Başarılı',
          p_customer_email := 'slotretry@test.com',
          p_customer_phone := '+90 555 444 9900',
          p_required_consent := true,
          p_marketing_consent := false,
          p_reminder_consent := false,
          p_idempotency_key := 'idem_slot_retry_2',
          p_branch_id := $3,
          p_otp_verification_token := $4,
          p_client_fingerprint := 'fp_slot_test'
        ) AS res;
      `, [serviceAId, staffAId, branchAId, tokenSlot]);
    } finally {
      await db.query('RESET ROLE');
    }
    assert.strictEqual(retryRes.rows[0].res.success, true);
    assert.strictEqual(retryRes.rows[0].res.reason_code, 'ok');
    const chConsumed = await db.query('SELECT status, consumed_at FROM public.public_booking_otp_challenges WHERE id = $1', [chSlotId]);
    assert.strictEqual(chConsumed.rows[0].status, 'consumed', 'Başarılı retry sonrası challenge consumed olmalıdır');
    assert(chConsumed.rows[0].consumed_at, 'consumed_at dolmalıdır');
  });

  await runAsyncTest('3.9. [GERÇEK DB REPLAY ENGELİ] Aynı OTP tokenı ikinci kez kullanılamaz (otp_token_invalid_or_consumed)', async () => {
    const db = await getDisposablePgEngine();

    // Aynı tokenla tekrar randevu denemesi
    const replayRes = await db.query(`
      SELECT public.create_public_booking(
        p_slug := 'salon-alfa',
        p_service_id := $1,
        p_staff_id := $2,
        p_appointment_date := '2026-11-21'::date,
        p_appointment_time := '15:00'::time,
        p_customer_name := 'Test Müşteri Replay',
        p_customer_email := 'musteri@test.com',
        p_customer_phone := '+90 555 123 4567',
        p_required_consent := true,
        p_marketing_consent := false,
        p_reminder_consent := false,
        p_idempotency_key := 'idem_test_otp_replay_2',
        p_branch_id := $3,
        p_otp_verification_token := $4,
        p_client_fingerprint := 'fp_db_1'
      ) AS res;
    `, [serviceAId, staffAId, branchAId, validVerificationToken]);

    const data = replayRes.rows[0].res;
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.reason_code, 'otp_token_invalid_or_consumed', 'Tüketilmiş token fail-closed reddedilmelidir');
  });

  await runAsyncTest('3.10. [GERÇEK DB MÜKERRER RANDEVU ENGELİ] Aynı gün aynı hizmet için mükerrer randevu engellenir', async () => {
    const db = await getDisposablePgEngine();

    // 3.8 de '+90 555 123 4567' için '2026-11-20' tarihinde serviceAId hizmeti alınmıştı.
    // Aynı müşteri aynı gün aynı hizmet için tekrar randevu almaya çalışırsa engellenmeli:
    const dupRes = await db.query(`
      SELECT public.create_public_booking(
        p_slug := 'salon-alfa',
        p_service_id := $1,
        p_staff_id := $2,
        p_appointment_date := '2026-11-20'::date,
        p_appointment_time := '16:00'::time,
        p_customer_name := 'Test Müşteri Duplicate',
        p_customer_email := 'musteri@test.com',
        p_customer_phone := '+90 555 123 4567',
        p_required_consent := true,
        p_branch_id := $3
      ) AS res;
    `, [serviceAId, staffAId, branchAId]);

    const data = dupRes.rows[0].res;
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.reason_code, 'duplicate_booking_same_day');
  });

  await runAsyncTest('3.11. [GERÇEK DB FAIL-CLOSED] Geçersiz tenant ve bozuk parametrelerde randevu açılmaz', async () => {
    const db = await getDisposablePgEngine();

    const failRes = await db.query(`
      SELECT public.create_public_booking(
        p_slug := 'olmayan-salon-xyz',
        p_service_id := $1,
        p_staff_id := $2,
        p_appointment_date := '2026-11-20'::date,
        p_appointment_time := '10:00'::time,
        p_customer_name := 'Deneme',
        p_customer_email := 'deneme@test.com',
        p_customer_phone := '+90 555 000 9988',
        p_required_consent := true
      ) AS res;
    `, [serviceAId, staffAId]);

    const data = failRes.rows[0].res;
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.reason_code, 'invalid_tenant');
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

// -----------------------------------------------------------------------------
// SECTION 4: GERÇEK CHROMIUM TARAYICIDA WEBCRYPTO SHA-256 VE FAIL-CLOSED DOĞRULAMASI
// -----------------------------------------------------------------------------
const { createServer } = await import('vite');
const { chromium } = await import('playwright');

let viteServer = null;
let browser = null;
try {
  const port = await getAvailablePort();
  viteServer = await createServer({
    configFile: path.resolve(rootDir, 'vite.config.ts'),
    server: { port, host: '127.0.0.1', strictPort: true },
    logLevel: 'error',
  });
  await viteServer.listen();
  await viteServer.transformRequest('/services/publicBookingOtpService.ts').catch(() => {});
  await viteServer.transformRequest('/services/repositories/localBookingRepository.ts').catch(() => {});

  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext();
  await context.route('**/*', (route) => {
    let parsed;
    try {
      parsed = new URL(route.request().url());
    } catch {
      return route.fulfill({ status: 204, body: '' });
    }
    if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
      return route.continue();
    }
    return route.fulfill({ status: 204, body: '' });
  });

  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  await runAsyncTest('4.1. [GERÇEK CHROMIUM] WebCrypto SHA-256 üretir (64 küçük hex), sim_hash ve ham OTP sızdırmaz', async () => {
    const browserRes = await page.evaluate(async () => {
      const { publicBookingOtpService } = await import('/services/publicBookingOtpService.ts');
      publicBookingOtpService.clearSyntheticHarness();
      const otpCode = '741852';
      const req = await publicBookingOtpService.requestOtp({
        slug: 'salon-browser-sha',
        phone: '+90 555 919 8283',
        syntheticOtp: otpCode,
        channel: 'whatsapp',
      });
      const audit = publicBookingOtpService.getSyntheticChallengeAudit(req.challengeId);
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(otpCode));
      const expectedHex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      return { req, audit, expectedHex, otpCode, lsDump: JSON.stringify(window.localStorage) };
    });

    assert.strictEqual(browserRes.req.success, true);
    assert(browserRes.audit, 'Tarayıcı challenge audit kaydı dönmelidir');
    assert.match(browserRes.audit.otpCodeHash, /^[0-9a-f]{64}$/, 'Tarayıcı hash tam 64 küçük hex karakter olmalıdır');
    assert.strictEqual(browserRes.audit.otpCodeHash, browserRes.expectedHex, 'WebCrypto SHA-256 digest ile birebir eşleşmelidir');
    assert(!browserRes.audit.otpCodeHash.includes('sim_hash'), 'sim_hash fallback kesinlikle olmamalı');
    assert(!browserRes.audit.otpCodeHash.includes(browserRes.otpCode), 'Ham OTP kodu hash alanında geçmemelidir');
    assert(!browserRes.lsDump.includes(browserRes.otpCode), 'Ham OTP kodu localStorage a sızmamalıdır');
  });

  await runAsyncTest('4.2. [GERÇEK CHROMIUM FAIL-CLOSED] WebCrypto yokken requestOtp reject etmez, temporary_failure döner', async () => {
    const noCryptoRes = await page.evaluate(async () => {
      const { publicBookingOtpService } = await import('/services/publicBookingOtpService.ts');
      publicBookingOtpService.clearSyntheticHarness();
      const origDesc = Object.getOwnPropertyDescriptor(window, 'crypto');
      Object.defineProperty(window, 'crypto', { value: undefined, configurable: true });
      try {
        const res = await publicBookingOtpService.requestOtp({
          slug: 'salon-browser-nocrypto',
          phone: '+90 555 717 6263',
          syntheticOtp: '369258',
        });
        return {
          threw: false,
          res,
          outboxCount: publicBookingOtpService.getSyntheticOutbox('+90 555 717 6263').length,
        };
      } catch (e) {
        return { threw: true, error: String(e) };
      } finally {
        if (origDesc) Object.defineProperty(window, 'crypto', origDesc);
      }
    });

    assert.strictEqual(noCryptoRes.threw, false, 'Tarayıcıda crypto yokken unhandled rejection olmamalıdır');
    assert.strictEqual(noCryptoRes.res.success, false);
    assert.strictEqual(noCryptoRes.res.reasonCode, 'temporary_failure', 'Tarayıcıda reasonCode temporary_failure olmalıdır');
    assert.strictEqual(noCryptoRes.outboxCount, 0, 'Outbox kaydı oluşmamalı');
  });

  await runAsyncTest('4.3. [GERÇEK CHROMIUM ATOMİKLİK] Tarayıcıda slot_conflict tokenı yakmaz, retry tüketir, replay reddedilir', async () => {
    const atomRes = await page.evaluate(async () => {
      const { publicBookingOtpService } = await import('/services/publicBookingOtpService.ts');
      const { LocalBookingRepository } = await import('/services/repositories/localBookingRepository.ts');
      window.localStorage.clear();
      window.localStorage.setItem('lari:salon-browser-atom:appointments_seeded', 'true');
      publicBookingOtpService.clearSyntheticHarness();
      const repo = new LocalBookingRepository();

      await repo.createPublicBooking({
        slug: 'salon-browser-atom',
        serviceId: 'srv_1',
        staffId: 'staff_1',
        appointmentDate: '2026-12-03',
        appointmentTime: '10:00',
        customerName: 'Tarayıcı İlk',
        customerEmail: 'b1@test.com',
        customerPhone: '+90 555 111 0000',
        requiredConsent: true,
      });

      const req = await publicBookingOtpService.requestOtp({
        slug: 'salon-browser-atom',
        phone: '+90 555 818 9293',
        syntheticOtp: '852963',
      });
      const ver = await publicBookingOtpService.verifyOtp({
        slug: 'salon-browser-atom',
        challengeId: req.challengeId,
        otpCode: '852963',
        phone: '+90 555 818 9293',
      });

      const conflictRes = await repo.createPublicBooking({
        slug: 'salon-browser-atom',
        serviceId: 'srv_1',
        staffId: 'staff_1',
        appointmentDate: '2026-12-03',
        appointmentTime: '10:00',
        customerName: 'Tarayıcı Çakışma',
        customerEmail: 'bc@test.com',
        customerPhone: '+90 555 818 9293',
        requiredConsent: true,
        otpVerificationToken: ver.verificationToken,
      });
      const statusAfterConflict = publicBookingOtpService.getSyntheticChallengeAudit(req.challengeId)?.status;

      const retryRes = await repo.createPublicBooking({
        slug: 'salon-browser-atom',
        serviceId: 'srv_1',
        staffId: 'staff_1',
        appointmentDate: '2026-12-03',
        appointmentTime: '11:30',
        customerName: 'Tarayıcı Retry',
        customerEmail: 'br@test.com',
        customerPhone: '+90 555 818 9293',
        requiredConsent: true,
        otpVerificationToken: ver.verificationToken,
      });
      const statusAfterRetry = publicBookingOtpService.getSyntheticChallengeAudit(req.challengeId)?.status;

      const replayRes = await repo.createPublicBooking({
        slug: 'salon-browser-atom',
        serviceId: 'srv_1',
        staffId: 'staff_1',
        appointmentDate: '2026-12-03',
        appointmentTime: '12:30',
        customerName: 'Tarayıcı Replay',
        customerEmail: 'brep@test.com',
        customerPhone: '+90 555 818 9293',
        requiredConsent: true,
        otpVerificationToken: ver.verificationToken,
      });

      return { conflictRes, statusAfterConflict, retryRes, statusAfterRetry, replayRes };
    });

    assert.strictEqual(atomRes.conflictRes.success, false);
    assert.strictEqual(atomRes.conflictRes.reasonCode, 'slot_conflict');
    assert.strictEqual(atomRes.statusAfterConflict, 'verified');
    assert.strictEqual(atomRes.retryRes.success, true);
    assert.strictEqual(atomRes.retryRes.reasonCode, 'ok');
    assert.strictEqual(atomRes.statusAfterRetry, 'consumed');
    assert.strictEqual(atomRes.replayRes.success, false);
    assert.strictEqual(atomRes.replayRes.reasonCode, 'otp_token_invalid_or_consumed');
  });
} finally {
  if (browser) {
    try { await browser.close(); } catch {}
  }
  if (viteServer) {
    try { await viteServer.close(); } catch {}
  }
}

console.log('\n================================================================================');
console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED PERFECTLY!`);
console.log('Terminal State: LARI_PILOT4_V1_WQ07_RATELIMIT_AND_OTP_CONTRACT_VERIFIED');
console.log('================================================================================\n');
process.exit(0);
