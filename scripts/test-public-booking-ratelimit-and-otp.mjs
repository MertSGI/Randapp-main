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
const { publicBookingOtpService, LIVE_SMS_DISPATCH_FORBIDDEN, parsePublicBookingPhone, normalizePublicBookingPhone } = await import('../services/publicBookingOtpService.ts');
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

await runAsyncTest('2.15. [LOCAL REPO TELAFİ & EŞZAMANLILIK] Yazma sonrası OTP commit başarısızlığında randevu geri alınır, ilgisiz/eşzamanlı kayıtlar korunur', async () => {
  const restoreLS = installNodeLocalStorageShim();
  const { LocalBookingRepository } = await import('../services/repositories/localBookingRepository.ts');
  const repo = new LocalBookingRepository();
  const origCreateAppointment = repo.createAppointment.bind(repo);
  const origDateNow = Date.now;
  let simOffsetMs = 0;
  Date.now = () => origDateNow() + simOffsetMs;

  try {
    localStorage.clear();
    localStorage.setItem('lari:salon-local-rb:appointments_seeded', 'true');
    publicBookingOtpService.clearSyntheticHarness();

    // 1. Ön-mevcut başka bir randevu (geri alma bunu ASLA silmemeli)
    const baseline = await repo.createPublicBooking({
      slug: 'salon-local-rb',
      serviceId: 'srv_1',
      staffId: 'staff_1',
      appointmentDate: '2026-12-05',
      appointmentTime: '09:00',
      customerName: 'Korunan Müşteri',
      customerEmail: 'korunan@test.com',
      customerPhone: '+90 555 000 1000',
      requiredConsent: true,
    });
    assert.strictEqual(baseline.success, true);

    // 2. Codex karşı-örneği: rezervasyon alınıyor, yazma sırasında süre doluyor -> commit false -> randevu geri alınmalı
    const reqExp = await publicBookingOtpService.requestOtp({
      slug: 'salon-local-rb',
      phone: '+90 555 999 4411',
      syntheticOtp: '135790',
    });
    const verExp = await publicBookingOtpService.verifyOtp({
      slug: 'salon-local-rb',
      challengeId: reqExp.challengeId,
      otpCode: '135790',
      phone: '+90 555 999 4411',
    });
    assert.strictEqual(verExp.success, true);

    repo.createAppointment = async (...args) => {
      const apt = await origCreateAppointment(...args);
      // Yazma tamamlandıktan hemen sonra token TTL süresini (+6 dk) aşır
      simOffsetMs += 6 * 60 * 1000;
      return apt;
    };

    const failPostWrite = await repo.createPublicBooking({
      slug: 'salon-local-rb',
      serviceId: 'srv_1',
      staffId: 'staff_1',
      appointmentDate: '2026-12-05',
      appointmentTime: '10:00',
      customerName: 'PostWrite Rollback',
      customerEmail: 'rollback@test.com',
      customerPhone: '+90 555 999 4411',
      requiredConsent: true,
      otpVerificationToken: verExp.verificationToken,
    });
    assert.strictEqual(failPostWrite.success, false);
    assert.strictEqual(failPostWrite.reasonCode, 'otp_token_invalid_or_consumed');

    const aptsAfterRollback = await repo.listAppointments('salon-local-rb');
    assert.strictEqual(aptsAfterRollback.length, 1, 'Geri alma sonrası yalnızca ön-mevcut baseline randevusu kalmalıdır');
    assert.strictEqual(aptsAfterRollback[0].id, baseline.appointmentId);
    const custAfterRollback = await repo.findCustomerByPhoneOrEmail('salon-local-rb', '+90 555 999 4411', 'rollback@test.com');
    assert.strictEqual(custAfterRollback, null, 'Geri alınan randevuya ait yetim müşteri profili bırakılmamalıdır');

    // 3. Farklı iki tokenla AYNI saate eşzamanlı iki çağrı -> yalnızca 1 tanesi başarılı, diğeri slot_conflict + token verified korunur
    repo.createAppointment = async (...args) => {
      await new Promise(r => setTimeout(r, 30));
      return origCreateAppointment(...args);
    };
    const reqC1 = await publicBookingOtpService.requestOtp({ slug: 'salon-local-rb', phone: '+90 555 999 5511', syntheticOtp: '246810' });
    const verC1 = await publicBookingOtpService.verifyOtp({ slug: 'salon-local-rb', challengeId: reqC1.challengeId, otpCode: '246810', phone: '+90 555 999 5511' });
    const reqC2 = await publicBookingOtpService.requestOtp({ slug: 'salon-local-rb', phone: '+90 555 999 5522', syntheticOtp: '975310' });
    const verC2 = await publicBookingOtpService.verifyOtp({ slug: 'salon-local-rb', challengeId: reqC2.challengeId, otpCode: '975310', phone: '+90 555 999 5522' });

    const [sameSlot1, sameSlot2] = await Promise.all([
      repo.createPublicBooking({
        slug: 'salon-local-rb',
        serviceId: 'srv_1',
        staffId: 'staff_1',
        appointmentDate: '2026-12-05',
        appointmentTime: '11:00',
        customerName: 'Slot Race 1',
        customerEmail: 'sr1@test.com',
        customerPhone: '+90 555 999 5511',
        requiredConsent: true,
        otpVerificationToken: verC1.verificationToken,
      }),
      repo.createPublicBooking({
        slug: 'salon-local-rb',
        serviceId: 'srv_1',
        staffId: 'staff_1',
        appointmentDate: '2026-12-05',
        appointmentTime: '11:00',
        customerName: 'Slot Race 2',
        customerEmail: 'sr2@test.com',
        customerPhone: '+90 555 999 5522',
        requiredConsent: true,
        otpVerificationToken: verC2.verificationToken,
      }),
    ]);

    const raceWinners = [sameSlot1, sameSlot2].filter(r => r.success);
    const raceConflicts = [sameSlot1, sameSlot2].filter(r => !r.success && r.reasonCode === 'slot_conflict');
    assert.strictEqual(raceWinners.length, 1, 'Aynı slota paralel farklı tokenlarda en fazla 1 randevu oluşmalıdır');
    assert.strictEqual(raceConflicts.length, 1, 'İkinci çağrı slot_conflict almalıdır');
    assert.strictEqual(publicBookingOtpService.getSyntheticChallengeAudit(reqC1.challengeId).status, 'consumed');
    assert.strictEqual(publicBookingOtpService.getSyntheticChallengeAudit(reqC2.challengeId).status, 'verified', 'slot_conflict alan ikinci çağrının tokenı verified kalmalıdır');

    // 4. Eşzamanlı rollback + başarılı kayıt izolasyonu: 1. kayıt yazma sonrası süre aşımından geri alınırken 2. kayıt korunmalı
    const reqRbConc = await publicBookingOtpService.requestOtp({ slug: 'salon-local-rb', phone: '+90 555 999 6611', syntheticOtp: '111222' });
    const verRbConc = await publicBookingOtpService.verifyOtp({ slug: 'salon-local-rb', challengeId: reqRbConc.challengeId, otpCode: '111222', phone: '+90 555 999 6611' });
    const reqKeepConc = await publicBookingOtpService.requestOtp({ slug: 'salon-local-rb', phone: '+90 555 999 6622', syntheticOtp: '333444' });
    const verKeepConc = await publicBookingOtpService.verifyOtp({ slug: 'salon-local-rb', challengeId: reqKeepConc.challengeId, otpCode: '333444', phone: '+90 555 999 6622' });

    repo.createAppointment = async (tId, input) => {
      const apt = await origCreateAppointment(tId, input);
      if (input.phone === '+90 555 999 6611') {
        // Yalnız reqRbConc un süresini doldur, reqKeepConc hala geçerli kalsın (Date.now sadece +10 dk zıplatılırsa ikisi de dolar; yerine sade 3 dk vs + reqRbConc eski token!)
        simOffsetMs += 6 * 60 * 1000;
      }
      return apt;
    };
    // reqKeepConc sonradan üretildiği için 6 dk atlayınca o da dolmasın diye simOffsetMs'i önce +4dk geri değil, reqKeepConc'u callback sonrası isteyelim!
    // Simpler: reqKeepConc u tam yazma sırasında rollback'ten SONRA üretmek yerine, rollback sonrası reqKeepConc u oluşturmaya gerek yok;
    // geri alma senaryosunda Date.now sadece reqRbConc sırasında geçici olarak +6dk atlatıp geri alınabilir!
    repo.createAppointment = async (tId, input) => {
      const apt = await origCreateAppointment(tId, input);
      const normInputPhone = normalizePublicBookingPhone(input.phone);
      if (normInputPhone === '+905559996611' || input.phone === '+90 555 999 6611') {
        simOffsetMs += 6 * 60 * 1000;
      } else {
        simOffsetMs = 0; // Paralel ikinci isteğin tokenı hala geçerli
      }
      return apt;
    };

    const [concRbRes, concKeepRes] = await Promise.all([
      repo.createPublicBooking({
        slug: 'salon-local-rb',
        serviceId: 'srv_1',
        staffId: 'staff_1',
        appointmentDate: '2026-12-05',
        appointmentTime: '14:00',
        customerName: 'Rollback Paralel',
        customerEmail: 'rbpar@test.com',
        customerPhone: '+90 555 999 6611',
        requiredConsent: true,
        otpVerificationToken: verRbConc.verificationToken,
      }),
      repo.createPublicBooking({
        slug: 'salon-local-rb',
        serviceId: 'srv_1',
        staffId: 'staff_1',
        appointmentDate: '2026-12-05',
        appointmentTime: '15:00',
        customerName: 'Korunan Paralel',
        customerEmail: 'keeppar@test.com',
        customerPhone: '+90 555 999 6622',
        requiredConsent: true,
        otpVerificationToken: verKeepConc.verificationToken,
      }),
    ]);

    assert.strictEqual(concRbRes.success, false);
    assert.strictEqual(concRbRes.reasonCode, 'otp_token_invalid_or_consumed');
    assert.strictEqual(concKeepRes.success, true);
    assert.strictEqual(publicBookingOtpService.getSyntheticChallengeAudit(reqKeepConc.challengeId).status, 'consumed');
    const finalApts = await repo.listAppointments('salon-local-rb');
    assert.strictEqual(finalApts.length, 3, 'Baseline + Slot Race 1 + Korunan Paralel = 3 randevu bulunmalıdır');
    assert(!finalApts.some(a => a.phone === '+90 555 999 6611' || a.phone === '+905559996611'), 'Geri alınan randevu depoda bulunmamalıdır');
  } finally {
    Date.now = origDateNow;
    repo.createAppointment = origCreateAppointment;
    restoreLS();
  }
});

await runAsyncTest('2.16. [MAT-09] TS Birim & Yerel Depo Negatif Matrisi (Boş telefon+fp fail-closed, email burst=5, alias phone matching, no-show guard, requireOtpForBooking)', async () => {
  const restoreLS = installNodeLocalStorageShim();
  const { LocalBookingRepository } = await import('../services/repositories/localBookingRepository.ts');
  const { appointmentSelfServiceService } = await import('../services/appointmentSelfServiceService.ts');
  const repo = new LocalBookingRepository();

  try {
    localStorage.clear();
    publicBookingOtpService.clearSyntheticHarness();

    // 1. shouldBlockBooking: Boş telefon + boş fingerprint -> fail-closed rate_limit_exceeded
    const blockEmpty = await bookingAbuseProtectionService.shouldBlockBooking({
      tenantId: 't_neg_mat9',
      phone: '',
      email: 'user@test.com',
      clientFingerprint: '',
    });
    assert.strictEqual(blockEmpty.block, true);
    assert.strictEqual(blockEmpty.reasonCode, 'rate_limit_exceeded', 'Boş telefon ve boş fingerprint fail-closed engellenmelidir');

    // 2. shouldBlockBooking: Boş telefon + geçerli fingerprint -> email burst=5
    const tenantIdEmail = 't_neg_mat9_email';
    for (let i = 0; i < 5; i++) {
      bookingAbuseProtectionService.recordBookingAttempt({
        tenantId: tenantIdEmail,
        phone: '',
        email: 'sybil_email@test.com',
        clientFingerprint: 'fp_valid_mat9',
        success: false,
      });
    }
    const blockEmailBurst = await bookingAbuseProtectionService.shouldBlockBooking({
      tenantId: tenantIdEmail,
      phone: '',
      email: 'sybil_email@test.com',
      clientFingerprint: 'fp_valid_mat9',
    });
    assert.strictEqual(blockEmailBurst.block, true);
    assert.strictEqual(blockEmailBurst.reasonCode, 'rate_limit_exceeded', 'Email burst 5 deneme sonrası engellenmelidir');

    // 3. shouldBlockBooking: Farklı biçimli alias telefonlar aynı burst sınırına çarpar
    const tenantIdAlias = 't_neg_mat9_alias';
    for (let i = 0; i < 5; i++) {
      bookingAbuseProtectionService.recordBookingAttempt({
        tenantId: tenantIdAlias,
        phone: '+90 555 111 2233',
        email: `alias${i}@test.com`,
        clientFingerprint: `fp_alias_${i}`,
        success: false,
      });
    }
    const blockAlias = await bookingAbuseProtectionService.shouldBlockBooking({
      tenantId: tenantIdAlias,
      phone: '0555 111 22 33', // Eşdeğer TR formatı
      email: 'checkalias@test.com',
      clientFingerprint: 'fp_alias_check',
    });
    assert.strictEqual(blockAlias.block, true);
    assert.strictEqual(blockAlias.reasonCode, 'rate_limit_exceeded', 'Eşdeğer telefon formatı aynı burst limitine takılmalıdır');

    // 4. No-show guard: Boş telefon için no-show sayacı 0 dönmeli ve boş telefonları eşleştirmemelidir
    bookingAbuseProtectionService.recordNoShowSignal('t_noshow_test', '+90 555 444 3322');
    bookingAbuseProtectionService.recordNoShowSignal('t_noshow_test', '');
    const emptyNoShowRisk = bookingAbuseProtectionService.getNoShowRiskCountForCustomer('t_noshow_test', '');
    assert.strictEqual(emptyNoShowRisk, 0, 'Boş telefon için no-show sayacı 0 olmalıdır');
    const validNoShowRisk = bookingAbuseProtectionService.getNoShowRiskCountForCustomer('t_noshow_test', '0555 444 33 22');
    assert.strictEqual(validNoShowRisk, 1, 'Eşdeğer telefon için no-show sinyali bulunmalıdır');

    // 5. LocalBookingRepository: requireOtpForBooking = true iken boş telefon veya tokensız istek invalid_phone / otp_required alır
    localStorage.setItem('lari:salon-otp-req:appointments_seeded', 'true');
    appointmentSelfServiceService.saveBookingPolicy('salon-otp-req', { requireOtpForBooking: true });

    const emptyPhoneRes = await repo.createPublicBooking({
      slug: 'salon-otp-req',
      serviceId: 'srv_1',
      staffId: 'staff_1',
      appointmentDate: '2026-12-07',
      appointmentTime: '10:00',
      customerName: 'Boş Tel OTP',
      customerEmail: 'bostel@test.com',
      customerPhone: '',
      requiredConsent: true,
    });
    assert.strictEqual(emptyPhoneRes.success, false);
    assert.strictEqual(emptyPhoneRes.reasonCode, 'invalid_phone', 'OTP zorunlu salonda boş telefon invalid_phone almalıdır');

    const validPhoneNoTokRes = await repo.createPublicBooking({
      slug: 'salon-otp-req',
      serviceId: 'srv_1',
      staffId: 'staff_1',
      appointmentDate: '2026-12-07',
      appointmentTime: '10:00',
      customerName: 'Tokensız OTP',
      customerEmail: 'tokensiz@test.com',
      customerPhone: '+90 555 123 4567',
      requiredConsent: true,
    });
    assert.strictEqual(validPhoneNoTokRes.success, false);
    assert.strictEqual(validPhoneNoTokRes.reasonCode, 'otp_required', 'OTP zorunlu salonda tokensız istek otp_required almalıdır');
  } finally {
    restoreLS();
  }
});

await runAsyncTest('2.17. [FINDING-ADIM010-009] spamProtectionEnabled=false iken telefon geçerliliği ve requireOtpForBooking atlanamaz', async () => {
  const restoreLS = installNodeLocalStorageShim();
  const { appointmentSelfServiceService } = await import('../services/appointmentSelfServiceService.ts');
  const origGetPolicy = appointmentSelfServiceService.getBookingPolicy;

  try {
    localStorage.clear();
    publicBookingOtpService.clearSyntheticHarness();

    const tenantOtpSpamOff = 't_finding009_otp_on_spam_off';
    appointmentSelfServiceService.saveBookingPolicy(tenantOtpSpamOff, {
      spamProtectionEnabled: false,
      requireOtpForBooking: true,
    });

    // Spam sayaçları dolu olsa bile önce telefon/OTP kapısı uygulanmalı; geçerli numarada yalnız spam sayacı atlanmalı
    for (let i = 0; i < 6; i++) {
      bookingAbuseProtectionService.recordBookingAttempt({
        tenantId: tenantOtpSpamOff,
        phone: '+90 555 910 0099',
        email: `f9_${i}@test.com`,
        clientFingerprint: 'fp_f9',
        success: false,
      });
    }

    const emptyWhenOtpOn = await bookingAbuseProtectionService.shouldBlockBooking({
      tenantId: tenantOtpSpamOff,
      phone: '',
      email: 'empty_f9@test.com',
      clientFingerprint: 'fp_f9',
    });
    assert.strictEqual(emptyWhenOtpOn.block, true);
    assert.strictEqual(emptyWhenOtpOn.reasonCode, 'invalid_phone', 'spamProtectionEnabled=false iken requireOtpForBooking=true boş telefonu engellemelidir');

    const invalidWhenOtpOn = await bookingAbuseProtectionService.shouldBlockBooking({
      tenantId: tenantOtpSpamOff,
      phone: '5551234567',
      email: 'ambig_f9@test.com',
      clientFingerprint: 'fp_f9',
    });
    assert.strictEqual(invalidWhenOtpOn.block, true);
    assert.strictEqual(invalidWhenOtpOn.reasonCode, 'invalid_phone', 'spamProtectionEnabled=false iken belirsiz/geçersiz telefon invalid_phone ile reddedilmelidir');

    const validWhenOtpOnSpamOff = await bookingAbuseProtectionService.shouldBlockBooking({
      tenantId: tenantOtpSpamOff,
      phone: '0555 910 00 99',
      email: 'valid_f9@test.com',
      clientFingerprint: 'fp_f9',
    });
    assert.strictEqual(validWhenOtpOnSpamOff.block, false, 'Geçerli telefon için spamProtectionEnabled=false yalnız spam sayaçlarını devre dışı bırakmalıdır');

    // FINDING-ADIM010-011: { spamProtectionEnabled: false, requireOtpForBooking: false }
    // durumunda da boş telefon + boş fingerprint fail-closed rate_limit_exceeded dönmelidir
    const tenantBothOff = 't_finding011_both_off';
    appointmentSelfServiceService.saveBookingPolicy(tenantBothOff, {
      spamProtectionEnabled: false,
      requireOtpForBooking: false,
    });

    const blockBothOffEmpty = await bookingAbuseProtectionService.shouldBlockBooking({
      tenantId: tenantBothOff,
      phone: '',
      email: 'both_off@test.com',
      clientFingerprint: '',
    });
    assert.strictEqual(blockBothOffEmpty.block, true);
    assert.strictEqual(
      blockBothOffEmpty.reasonCode,
      'rate_limit_exceeded',
      'spamProtectionEnabled=false ve requireOtpForBooking=false iken boş telefon + boş fingerprint fail-closed engellenmelidir'
    );

    const allowBothOffValidPhone = await bookingAbuseProtectionService.shouldBlockBooking({
      tenantId: tenantBothOff,
      phone: '+90 555 123 4567',
      email: 'both_off_valid@test.com',
      clientFingerprint: '',
    });
    assert.strictEqual(
      allowBothOffValidPhone.block,
      false,
      'spamProtectionEnabled=false iken geçerli telefonlu istek kabul edilmelidir'
    );

    // Yerel depolama (localStorage) doğrudan yazıldığında da aynı kural geçerli olmalı
    const tenantLsOnly = 't_finding009_ls_only';
    localStorage.setItem(
      `lari_tenant_booking_policies_${tenantLsOnly}`,
      JSON.stringify({ spamProtectionEnabled: false, requireOtpForBooking: true })
    );
    const lsEmptyBlock = await bookingAbuseProtectionService.shouldBlockBooking({
      tenantId: tenantLsOnly,
      phone: '',
      email: 'ls@test.com',
      clientFingerprint: 'fp_ls',
    });
    assert.strictEqual(lsEmptyBlock.block, true);
    assert.strictEqual(lsEmptyBlock.reasonCode, 'invalid_phone');

    // Bozuk politika JSON ve politika yükleme hatasında shouldBlockBooking fail-closed temporary_failure dönmeli
    localStorage.setItem(`lari_tenant_booking_policies_${tenantLsOnly}`, '{bad_json');
    const corruptPolicyBlock = await bookingAbuseProtectionService.shouldBlockBooking({
      tenantId: tenantLsOnly,
      phone: '+90 555 910 0099',
      email: 'corrupt@test.com',
      clientFingerprint: 'fp_ls',
    });
    assert.strictEqual(corruptPolicyBlock.block, true);
    assert.strictEqual(corruptPolicyBlock.reasonCode, 'temporary_failure');

    localStorage.removeItem(`lari_tenant_booking_policies_${tenantLsOnly}`);
    appointmentSelfServiceService.getBookingPolicy = () => {
      throw new Error('policy_service_down');
    };
    const loaderErrBlock = await bookingAbuseProtectionService.shouldBlockBooking({
      tenantId: tenantLsOnly,
      phone: '+90 555 910 0099',
      email: 'err@test.com',
      clientFingerprint: 'fp_ls',
    });
    assert.strictEqual(loaderErrBlock.block, true);
    assert.strictEqual(loaderErrBlock.reasonCode, 'temporary_failure');
  } finally {
    appointmentSelfServiceService.getBookingPolicy = origGetPolicy;
    restoreLS();
  }
});

await runAsyncTest('2.18. [FINDING-ADIM010-010] Yerel rezervasyon bozuk/okunamayan/yüklenemeyen politikada temporary_failure ile fail-closed durur', async () => {
  const restoreLS = installNodeLocalStorageShim();
  const { LocalBookingRepository, DEFAULT_LOCAL_BOOKING_OTP_POLICY } = await import('../services/repositories/localBookingRepository.ts');
  const { appointmentSelfServiceService } = await import('../services/appointmentSelfServiceService.ts');
  const repo = new LocalBookingRepository();
  const origGetPolicy = appointmentSelfServiceService.getBookingPolicy;

  try {
    localStorage.clear();
    publicBookingOtpService.clearSyntheticHarness();
    assert.strictEqual(DEFAULT_LOCAL_BOOKING_OTP_POLICY.requireOtpForBooking, false, 'Eksik politika için varsayılan açıkça false tanımlı olmalıdır');

    // 1. Gerçekten eksik politika durumunda (bozulma/hata yoksa) rezervasyon açık varsayılanla çalışır
    const missingSlug = 'salon-missing-policy-ok';
    localStorage.setItem(`lari:${missingSlug}:appointments_seeded`, 'true');
    const missingPolBooking = await repo.createPublicBooking({
      slug: missingSlug,
      serviceId: 'srv_1',
      staffId: 'staff_1',
      appointmentDate: '2026-12-08',
      appointmentTime: '10:00',
      customerName: 'Eksik Politika',
      customerEmail: 'missing_pol@test.com',
      customerPhone: '+90 555 777 0001',
      requiredConsent: true,
    });
    assert.strictEqual(missingPolBooking.success, true, 'Eksik politika durumunda güvenli açık varsayılan ile rezervasyon tamamlanmalıdır');

    // 2. Bozuk politika testleri için verified OTP token hazırla (hiçbir fail-closed hatada token tüketilmemeli)
    const slugFail = 'salon-policy-failclosed';
    localStorage.setItem(`lari:${slugFail}:appointments_seeded`, 'true');
    const otpReq = await publicBookingOtpService.requestOtp({
      slug: slugFail,
      phone: '+90 555 777 0002',
      syntheticOtp: '654321',
    });
    assert.strictEqual(otpReq.success, true);
    const otpVer = await publicBookingOtpService.verifyOtp({
      slug: slugFail,
      challengeId: otpReq.challengeId,
      otpCode: '654321',
      phone: '+90 555 777 0002',
    });
    assert.strictEqual(otpVer.success, true);

    const attemptBooking = (time, token = undefined) => repo.createPublicBooking({
      slug: slugFail,
      serviceId: 'srv_1',
      staffId: 'staff_1',
      appointmentDate: '2026-12-08',
      appointmentTime: time,
      customerName: 'Bozuk Politika',
      customerEmail: 'corrupt_pol@test.com',
      customerPhone: '+90 555 777 0002',
      requiredConsent: true,
      otpVerificationToken: token,
    });

    // A. Bozuk JSON string ve tüm güvenlik alanı şema ihlalleri (FINDING-ADIM010-010)
    const invalidSchemaPayloads = [
      '{corrupt_json',
      '',
      '   ',
      'null',
      '[]',
      '{"requireOtpForBooking":"yes"}',
      '{"spamProtectionEnabled":"false"}',
      '{"spamProtectionEnabled":123}',
      '{"blockRepeatedNoShowPhone":"true"}',
      '{"blockRepeatedNoShowPhone":null}',
      '{"maxBookingsPerPhonePerDay":"not-a-number"}',
      '{"maxBookingsPerPhonePerDay":0}',
      '{"maxBookingsPerPhonePerDay":-1}',
      '{"maxBookingsPerPhonePerDay":3.14}',
      '{"noShowThreshold":"not-a-number"}',
      '{"noShowThreshold":0}',
      '{"noShowThreshold":-2}',
    ];

    for (const badPayload of invalidSchemaPayloads) {
      localStorage.setItem(`lari_tenant_booking_policies_${slugFail}`, badPayload);

      // shouldBlockBooking doğrudan temporary_failure dönmelidir
      const sbbRes = await bookingAbuseProtectionService.shouldBlockBooking({
        tenantId: slugFail,
        phone: '+90 555 777 0002',
        email: 'corrupt_pol@test.com',
        clientFingerprint: 'fp_corrupt',
      });
      assert.strictEqual(sbbRes.block, true, `Bozuk politika (${badPayload}) shouldBlockBooking tarafından engellenmelidir`);
      assert.strictEqual(sbbRes.reasonCode, 'temporary_failure', `Bozuk politika (${badPayload}) temporary_failure dönmelidir`);

      const rNoTok = await attemptBooking('11:00');
      assert.strictEqual(rNoTok.success, false);
      assert.strictEqual(rNoTok.reasonCode, 'temporary_failure', `Bozuk politika (${badPayload}) tokensız temporary_failure dönmelidir`);
      const rWithTok = await attemptBooking('11:30', otpVer.verificationToken);
      assert.strictEqual(rWithTok.success, false);
      assert.strictEqual(rWithTok.reasonCode, 'temporary_failure', `Bozuk politika (${badPayload}) tokenlı da temporary_failure dönmelidir`);
    }
    localStorage.removeItem(`lari_tenant_booking_policies_${slugFail}`);

    // B. localStorage.getItem okuma hatası
    const origGetItem = localStorage.getItem.bind(localStorage);
    localStorage.getItem = (k) => {
      if (k === `lari_tenant_booking_policies_${slugFail}`) {
        throw new Error('localStorage_read_denied');
      }
      return origGetItem(k);
    };
    try {
      const rStorageErr = await attemptBooking('12:00');
      assert.strictEqual(rStorageErr.success, false);
      assert.strictEqual(rStorageErr.reasonCode, 'temporary_failure', 'localStorage okuma hatası temporary_failure dönmelidir');
    } finally {
      localStorage.getItem = origGetItem;
    }

    // C. Dinamik politika servisi (getBookingPolicy) ve dinamik module loader hatası
    appointmentSelfServiceService.getBookingPolicy = () => {
      throw new Error('dynamic_policy_fetch_failed');
    };
    const rDynGetErr = await attemptBooking('13:00');
    assert.strictEqual(rDynGetErr.success, false);
    assert.strictEqual(rDynGetErr.reasonCode, 'temporary_failure', 'getBookingPolicy hatası temporary_failure dönmelidir');
    appointmentSelfServiceService.getBookingPolicy = origGetPolicy;

    const origModuleLoader = repo.loadBookingPolicyModule;
    repo.loadBookingPolicyModule = async () => {
      throw new Error('dynamic_import_failed');
    };
    const rModuleErr = await attemptBooking('13:30');
    assert.strictEqual(rModuleErr.success, false);
    assert.strictEqual(rModuleErr.reasonCode, 'temporary_failure', 'Dinamik politika yükleyici hatası temporary_failure dönmelidir');
    repo.loadBookingPolicyModule = origModuleLoader;

    // Tüm fail-closed denemeler boyunca sıfır randevu/müşteri yazılmış ve OTP tokenı verified korunmuş olmalı
    assert.strictEqual((await repo.listAppointments(slugFail)).length, 0, 'Fail-closed redlerde hiç randevu yazılmamalıdır');
    assert.strictEqual((await repo.listCustomers(slugFail)).length, 0, 'Fail-closed redlerde hiç müşteri yazılmamalıdır');
    assert.strictEqual(publicBookingOtpService.getSyntheticChallengeAudit(otpReq.challengeId).status, 'verified', 'Fail-closed hatalarda OTP verified kalmalıdır');

    // 3. Politika düzeltildiğinde tokensız istek otp_required, tokenlı retry ok alır
    appointmentSelfServiceService.saveBookingPolicy(slugFail, { requireOtpForBooking: true });
    const blockedNoTok = await attemptBooking('14:00');
    assert.strictEqual(blockedNoTok.success, false);
    assert.strictEqual(blockedNoTok.reasonCode, 'otp_required');

    const recovered = await attemptBooking('14:00', otpVer.verificationToken);
    assert.strictEqual(recovered.success, true);
    assert.strictEqual(recovered.reasonCode, 'ok');
    assert.strictEqual(publicBookingOtpService.getSyntheticChallengeAudit(otpReq.challengeId).status, 'consumed');
  } finally {
    appointmentSelfServiceService.getBookingPolicy = origGetPolicy;
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
        pg_catalog.has_function_privilege('anon', 'public.evaluate_and_record_public_booking_rate_limit(uuid,text,text,uuid,date,text)', 'EXECUTE') AS anon_rl,
        pg_catalog.has_function_privilege('authenticated', 'public.evaluate_and_record_public_booking_rate_limit(uuid,text,text,uuid,date,text)', 'EXECUTE') AS auth_rl;
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
    const aptCheck = await db.query("SELECT count(*) FROM public.appointments WHERE phone IN ('+90 555 444 9900', '+905554449900')");
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
    const aptRetryId = retryRes.rows[0].res.appointment_id;
    assert(aptRetryId, 'aptRetryId üretilmelidir');
    const chConsumed = await db.query('SELECT status, consumed_at FROM public.public_booking_otp_challenges WHERE id = $1', [chSlotId]);
    assert.strictEqual(chConsumed.rows[0].status, 'consumed', 'Başarılı retry sonrası challenge consumed olmalıdır');
    assert(chConsumed.rows[0].consumed_at, 'consumed_at dolmalıdır');

    // Aynı idempotency_key + aynı kanonik istek + aynı token (tüketilmiş olsa bile) -> güvenli idempotent replay!
    let sameKeyReplayRes;
    await db.query('SET ROLE anon');
    try {
      sameKeyReplayRes = await db.query(`
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
    assert.strictEqual(sameKeyReplayRes.rows[0].res.success, true, 'Aynı anahtar ve aynı istekle güvenli idempotent replay başarılı olmalıdır');
    assert.strictEqual(sameKeyReplayRes.rows[0].res.reason_code, 'ok');
    assert.strictEqual(sameKeyReplayRes.rows[0].res.appointment_id, aptRetryId, 'Replay mevcut appointment_id yi dönmelidir');

    // Farklı idempotency_key ile AYNI tüketilmiş tokenSlot gönderildiğinde -> otp_token_invalid_or_consumed!
    let diffKeyReplayRes;
    await db.query('SET ROLE anon');
    try {
      diffKeyReplayRes = await db.query(`
        SELECT public.create_public_booking(
          p_slug := 'salon-alfa',
          p_service_id := $1,
          p_staff_id := $2,
          p_appointment_date := '2026-11-27'::date,
          p_appointment_time := '12:00'::time,
          p_customer_name := 'Slot Retry Başarılı',
          p_customer_email := 'slotretry@test.com',
          p_customer_phone := '+90 555 444 9900',
          p_required_consent := true,
          p_marketing_consent := false,
          p_reminder_consent := false,
          p_idempotency_key := 'idem_slot_retry_diff_key',
          p_branch_id := $3,
          p_otp_verification_token := $4,
          p_client_fingerprint := 'fp_slot_test'
        ) AS res;
      `, [serviceAId, staffAId, branchAId, tokenSlot]);
    } finally {
      await db.query('RESET ROLE');
    }
    assert.strictEqual(diffKeyReplayRes.rows[0].res.success, false, 'Farklı idempotency anahtarıyla tüketilmiş token reddedilmelidir');
    assert.strictEqual(diffKeyReplayRes.rows[0].res.reason_code, 'otp_token_invalid_or_consumed');
    const aptCheckFinal = await db.query("SELECT count(*) FROM public.appointments WHERE phone IN ('+90 555 444 9900', '+905554449900')");
    assert.strictEqual(parseInt(aptCheckFinal.rows[0].count, 10), 1, 'Toplam yalnız 1 randevu bulunmalıdır');
  });

  await runAsyncTest('3.8e. [GERÇEK DB IDEMPOTENCY CONFLICT & İZOLASYON] Farklı OTP/içerikte idempotency_conflict döner, yeni OTP yakılmaz ve tenantlar izoledir', async () => {
    const db = await getDisposablePgEngine();

    // Yeni doğrulanmış token (tokenFresh) hazırla
    const codeFresh = '558899';
    const codeFreshHash = crypto.createHash('sha256').update(codeFresh, 'utf8').digest('hex');
    const reqFresh = await db.query(`
      SELECT public.request_public_booking_otp(
        p_slug := 'salon-alfa',
        p_customer_phone := '+90 555 666 7788',
        p_synthetic_otp_hash := $1
      ) AS res;
    `, [codeFreshHash]);
    const chFreshId = reqFresh.rows[0].res.challengeId || reqFresh.rows[0].res.challenge_id;
    const verFresh = await db.query(`
      SELECT public.verify_public_booking_otp('salon-alfa', $1, $2, '+90 555 666 7788') AS res;
    `, [chFreshId, codeFresh]);
    const tokenFresh = verFresh.rows[0].res.verification_token;
    assert(tokenFresh, 'tokenFresh alınmalıdır');

    // 1. Aynı 'idem_slot_retry_2' anahtarı + FARKLI yeni tokenFresh -> idempotency_conflict ve tokenFresh YANMAMALI
    let conflictTokenRes;
    await db.query('SET ROLE anon');
    try {
      conflictTokenRes = await db.query(`
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
      `, [serviceAId, staffAId, branchAId, tokenFresh]);
    } finally {
      await db.query('RESET ROLE');
    }
    assert.strictEqual(conflictTokenRes.rows[0].res.success, false);
    assert.strictEqual(conflictTokenRes.rows[0].res.reason_code, 'idempotency_conflict');

    // tokenFresh hala 'verified' kalmalı!
    const freshCheck1 = await db.query('SELECT status, consumed_at FROM public.public_booking_otp_challenges WHERE id = $1', [chFreshId]);
    assert.strictEqual(freshCheck1.rows[0].status, 'verified', 'idempotency_conflict sonrası yeni token verified kalmalıdır');
    assert.strictEqual(freshCheck1.rows[0].consumed_at, null);

    // 2. Aynı 'idem_slot_retry_2' anahtarı + FARKLI istek içeriği (saat değişikliği) + yeni tokenFresh -> idempotency_conflict ve tokenFresh YANMAMALI
    let conflictPayloadRes;
    await db.query('SET ROLE anon');
    try {
      conflictPayloadRes = await db.query(`
        SELECT public.create_public_booking(
          p_slug := 'salon-alfa',
          p_service_id := $1,
          p_staff_id := $2,
          p_appointment_date := '2026-11-26'::date,
          p_appointment_time := '15:30'::time,
          p_customer_name := 'Farklı İstek Müşterisi',
          p_customer_email := 'farkli@test.com',
          p_customer_phone := '+90 555 666 7788',
          p_required_consent := true,
          p_marketing_consent := false,
          p_reminder_consent := false,
          p_idempotency_key := 'idem_slot_retry_2',
          p_branch_id := $3,
          p_otp_verification_token := $4
        ) AS res;
      `, [serviceAId, staffAId, branchAId, tokenFresh]);
    } finally {
      await db.query('RESET ROLE');
    }
    assert.strictEqual(conflictPayloadRes.rows[0].res.success, false);
    assert.strictEqual(conflictPayloadRes.rows[0].res.reason_code, 'idempotency_conflict');
    const freshCheck2 = await db.query('SELECT status FROM public.public_booking_otp_challenges WHERE id = $1', [chFreshId]);
    assert.strictEqual(freshCheck2.rows[0].status, 'verified', 'Farklı payload ile idempotency_conflict sonrası da yeni token verified kalmalıdır');

    // İkinci randevu oluşturulmadığını doğrula
    const noExtraApt = await db.query("SELECT count(*) FROM public.appointments WHERE tenant_id = $1 AND phone = '+90 555 666 7788'", [tenantAId]);
    assert.strictEqual(parseInt(noExtraApt.rows[0].count, 10), 0, 'Conflict sonrası ikinci randevu oluşturulmamalıdır');

    // 3. Tenant İzolasyonu: Tenant B (salon-beta) aynı 'idem_slot_retry_2' anahtarını çakışmasız kullanabilmeli
    const betaFixtures = await db.query(`
      SELECT
        (SELECT id FROM public.branches WHERE tenant_id = $1 AND is_active = true LIMIT 1) AS branch_id,
        (SELECT id FROM public.services WHERE tenant_id = $1 AND active = true LIMIT 1) AS service_id,
        (SELECT id FROM public.staff WHERE tenant_id = $1 AND active = true LIMIT 1) AS staff_id
    `, [tenantBId]);
    const bRow = betaFixtures.rows[0];
    let tenantBRes;
    await db.query('SET ROLE anon');
    try {
      tenantBRes = await db.query(`
        SELECT public.create_public_booking(
          p_slug := 'salon-beta',
          p_service_id := $1,
          p_staff_id := $2,
          p_appointment_date := '2026-11-28'::date,
          p_appointment_time := '14:00'::time,
          p_customer_name := 'Beta İzolasyon',
          p_customer_email := 'beta_iso@test.com',
          p_customer_phone := '+90 555 666 0011',
          p_required_consent := true,
          p_marketing_consent := false,
          p_reminder_consent := false,
          p_idempotency_key := 'idem_slot_retry_2',
          p_branch_id := $3
        ) AS res;
      `, [bRow.service_id, bRow.staff_id, bRow.branch_id]);
    } finally {
      await db.query('RESET ROLE');
    }
    assert.strictEqual(tenantBRes.rows[0].res.success, true, 'Tenant B aynı idempotency anahtarını Tenant A ile çakışmadan kullanabilmelidir');
    assert.strictEqual(tenantBRes.rows[0].res.reason_code, 'ok');
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

  async function openIndependentPgConnections(count) {
    const clients = [];
    for (let i = 0; i < count; i++) {
      const c = embeddedPg.getPgClient('postgres', '127.0.0.1');
      await c.connect();
      clients.push(c);
    }
    const pids = new Set();
    for (const c of clients) {
      const pidRow = await c.query('SELECT pg_backend_pid() AS pid');
      pids.add(pidRow.rows[0].pid);
    }
    assert.strictEqual(pids.size, count, `Tüm ${count} veritabanı bağlantısı ayrı PostgreSQL oturumu (pg_backend_pid) olmalıdır`);
    return clients;
  }

  async function closeIndependentPgConnections(clients) {
    await Promise.all(clients.map(c => c.end().catch(() => {})));
  }

  await runAsyncTest('3.12. [GERÇEK DB ÇOKLU BAĞLANTI OTP EŞZAMANLILIĞI] Farklı bağlantılardan aynı telefona eşzamanlı OTP taleplerinde kilit bloklar, tek challenge/outbox oluşur ve tenant/rollback güvenlidir', async () => {
    const db = await getDisposablePgEngine();

    // A. Deterministik kilit kanıtı (2 ayrı TCP bağlantısı): Conn 1 commit etmeden Conn 2 dönmemeli
    const lockPair = await openIndependentPgConnections(2);
    try {
      const [c1, c2] = lockPair;
      await c1.query('BEGIN');
      await c1.query('SET LOCAL ROLE anon');
      const r1 = await c1.query(`
        SELECT public.request_public_booking_otp(
          p_slug := 'salon-alfa',
          p_customer_phone := '+90 555 910 0001',
          p_client_fingerprint := 'fp_lock_otp_1'
        ) AS res;
      `);
      assert.strictEqual(r1.rows[0].res.success, true);

      let conn2Settled = false;
      const p2 = (async () => {
        await c2.query('BEGIN');
        try {
          await c2.query('SET LOCAL ROLE anon');
          const res2 = await c2.query(`
            SELECT public.request_public_booking_otp(
              p_slug := 'salon-alfa',
              p_customer_phone := '+90 555 910 0001',
              p_client_fingerprint := 'fp_lock_otp_1'
            ) AS res;
          `);
          await c2.query('COMMIT');
          return res2.rows[0].res;
        } catch (err) {
          await c2.query('ROLLBACK').catch(() => {});
          throw err;
        } finally {
          conn2Settled = true;
        }
      })();

      await new Promise(r => setTimeout(r, 150));
      assert.strictEqual(conn2Settled, false, 'Conn 1 commit etmeden Conn 2 advisory lock üzerinde bloklanmalıdır');

      await c1.query('COMMIT');
      const res2 = await p2;
      assert.strictEqual(res2.success, false);
      assert.strictEqual(res2.reason_code, 'otp_rate_limited', 'Conn 1 commit sonrası Conn 2 cooldown görmelidir');
    } finally {
      await closeIndependentPgConnections(lockPair);
    }

    // B. 6 ayrı TCP bağlantısından gerçek eşzamanlı OTP baskını -> tam 1 başarılı challenge + 1 outbox + Tenant B izole
    const swarm = await openIndependentPgConnections(7);
    try {
      const tenantAClients = swarm.slice(0, 6);
      const tenantBClient = swarm[6];

      const results = await Promise.all([
        ...tenantAClients.map(async (c) => {
          await c.query('SET ROLE anon');
          try {
            const q = await c.query(`
              SELECT public.request_public_booking_otp(
                p_slug := 'salon-alfa',
                p_customer_phone := '+90 555 910 0002',
                p_client_fingerprint := 'fp_stampede_otp'
              ) AS res;
            `);
            return { tenant: 'alfa', res: q.rows[0].res };
          } finally {
            await c.query('RESET ROLE').catch(() => {});
          }
        }),
        (async () => {
          await tenantBClient.query('SET ROLE anon');
          try {
            const q = await tenantBClient.query(`
              SELECT public.request_public_booking_otp(
                p_slug := 'salon-beta',
                p_customer_phone := '+90 555 910 0002',
                p_client_fingerprint := 'fp_stampede_otp'
              ) AS res;
            `);
            return { tenant: 'beta', res: q.rows[0].res };
          } finally {
            await tenantBClient.query('RESET ROLE').catch(() => {});
          }
        })(),
      ]);

      const alfaOk = results.filter(x => x.tenant === 'alfa' && x.res.success === true);
      const alfaLimited = results.filter(x => x.tenant === 'alfa' && x.res.reason_code === 'otp_rate_limited');
      const betaOk = results.filter(x => x.tenant === 'beta' && x.res.success === true);
      assert.strictEqual(alfaOk.length, 1, 'Aynı tenant+telefon eşzamanlı 6 istekten yalnız 1 tanesi başarılı olmalıdır');
      assert.strictEqual(alfaLimited.length, 5, 'Kalan 5 eşzamanlı istek otp_rate_limited almalıdır');
      assert.strictEqual(betaOk.length, 1, 'Farklı tenant aynı telefon kilidinden etkilenmemelidir');

      const chCount = await db.query(
        "SELECT count(*) FROM public.public_booking_otp_challenges WHERE tenant_id = $1 AND customer_phone = '+905559100002'",
        [tenantAId]
      );
      assert.strictEqual(parseInt(chCount.rows[0].count, 10), 1, 'DB de yalnız 1 OTP challenge kaydı oluşmalıdır');
      const obCount = await db.query(
        "SELECT count(*) FROM public.communication_outbox WHERE tenant_id = $1 AND recipient = '+905559100002' AND delivery_mode = 'synthetic_outbox_only'",
        [tenantAId]
      );
      assert.strictEqual(parseInt(obCount.rows[0].count, 10), 1, 'DB de yalnız 1 sentetik outbox kaydı oluşmalıdır');
    } finally {
      await closeIndependentPgConnections(swarm);
    }

    // C. Rollback güvenliği: ROLLBACK edilen OTP talebi cooldown bırakmamalı, retry başarılı olmalı
    const rbPair = await openIndependentPgConnections(2);
    try {
      const [rbConn, okConn] = rbPair;
      await rbConn.query('BEGIN');
      await rbConn.query('SET LOCAL ROLE anon');
      const rbTry = await rbConn.query(`
        SELECT public.request_public_booking_otp('salon-alfa', '+90 555 910 0003', 'fp_rb_otp') AS res;
      `);
      assert.strictEqual(rbTry.rows[0].res.success, true);
      await rbConn.query('ROLLBACK');

      await okConn.query('SET ROLE anon');
      const afterRb = await okConn.query(`
        SELECT public.request_public_booking_otp('salon-alfa', '+90 555 910 0003', 'fp_rb_otp') AS res;
      `);
      await okConn.query('RESET ROLE');
      assert.strictEqual(afterRb.rows[0].res.success, true, 'ROLLBACK sonrası tekrar deneme başarılı olmalıdır');
    } finally {
      await closeIndependentPgConnections(rbPair);
    }
  });

  // Çoklu bağlantı rate-limit ve cross-staff/date testleri için izole tenant ve iki aktif personel hazırla
  let tenantConcId, branchConcId, serviceConcId, staffConc1Id, staffConc2Id;

  await runAsyncTest('3.13. [GERÇEK DB ÇOKLU BAĞLANTI PHONE BURST=5] Farklı personel/tarih seçimi ile paralel 8 bağlantıda telefon burst limiti aşılamaz ve kilit/rollback korunur', async () => {
    const db = await getDisposablePgEngine();

    const tC = await db.query(`
      INSERT INTO public.tenants (name, slug, status, onboarding_status, public_site_status, require_otp_for_booking)
      VALUES ('Salon Concurrency', 'salon-conc-rl', 'active', 'completed', 'published', false)
      RETURNING id;
    `);
    tenantConcId = tC.rows[0].id;
    branchConcId = (await db.query(`INSERT INTO public.branches (tenant_id, name, is_active, is_primary) VALUES ($1, 'Merkez', true, true) RETURNING id`, [tenantConcId])).rows[0].id;
    serviceConcId = (await db.query(`INSERT INTO public.services (tenant_id, name, duration_minutes, active) VALUES ($1, 'Bakim', 30, true) RETURNING id`, [tenantConcId])).rows[0].id;
    staffConc1Id = (await db.query(`INSERT INTO public.staff (tenant_id, name, active) VALUES ($1, 'Personel 1', true) RETURNING id`, [tenantConcId])).rows[0].id;
    staffConc2Id = (await db.query(`INSERT INTO public.staff (tenant_id, name, active) VALUES ($1, 'Personel 2', true) RETURNING id`, [tenantConcId])).rows[0].id;

    // A. Kilit kanıtı: Farklı personel (staff1 vs staff2) ve farklı tarihle aynı telefon çağrısı bile bucket kilidinde beklemeli
    const lockConns = await openIndependentPgConnections(2);
    try {
      const [c1, c2] = lockConns;
      await c1.query('BEGIN');
      await c1.query('SET LOCAL ROLE anon');
      const r1 = await c1.query(`
        SELECT public.create_public_booking(
          'salon-conc-rl', $1::uuid, $2::uuid, '2026-12-09'::date, '10:00'::time,
          'Lock Hold 1', 'lh1@test.com', '+90 555 920 0001', true, false, false, 'idem_rl_lock_1', $3::uuid, NULL, 'fp_rl_lock_a'
        ) AS res;
      `, [serviceConcId, staffConc1Id, branchConcId]);
      assert.strictEqual(r1.rows[0].res.success, true);

      let c2Done = false;
      const p2 = (async () => {
        await c2.query('BEGIN');
        try {
          await c2.query('SET LOCAL ROLE anon');
          const r2 = await c2.query(`
            SELECT public.create_public_booking(
              'salon-conc-rl', $1::uuid, $2::uuid, '2026-12-10'::date, '11:00'::time,
              'Lock Hold 2', 'lh2@test.com', '+90 555 920 0001', true, false, false, 'idem_rl_lock_2', $3::uuid, NULL, 'fp_rl_lock_b'
            ) AS res;
          `, [serviceConcId, staffConc2Id, branchConcId]);
          await c2.query('COMMIT');
          return r2.rows[0].res;
        } catch (err) {
          await c2.query('ROLLBACK').catch(() => {});
          throw err;
        } finally {
          c2Done = true;
        }
      })();

      await new Promise(r => setTimeout(r, 150));
      assert.strictEqual(c2Done, false, 'Farklı personel ve farklı tarih olsa da aynı telefon bucket kilidinde beklemelidir');
      await c1.query('COMMIT');
      const r2Out = await p2;
      assert.strictEqual(r2Out.success, true);
    } finally {
      await closeIndependentPgConnections(lockConns);
    }

    // B. 8 bağımsız bağlantı: aynı telefon, 8 farklı fingerprint, farklı personel (staff1/staff2) ve 8 farklı tarih
    const burstConns = await openIndependentPgConnections(8);
    try {
      const outs = await Promise.all(burstConns.map(async (c, idx) => {
        await c.query('SET ROLE anon');
        try {
          const staffId = idx % 2 === 0 ? staffConc1Id : staffConc2Id;
          const dateStr = `2026-12-${String(11 + idx).padStart(2, '0')}`;
          const q = await c.query(`
            SELECT public.create_public_booking(
              'salon-conc-rl', $1::uuid, $2::uuid, $3::date, '12:00'::time,
              $4, $5, '+90 555 920 0002', true, false, false, $6, $7::uuid, NULL, $8
            ) AS res;
          `, [
            serviceConcId,
            staffId,
            dateStr,
            `Burst Tel ${idx}`,
            `bt${idx}@test.com`,
            `idem_pburst_${idx}`,
            branchConcId,
            `fp_unique_phone_burst_${idx}`,
          ]);
          return q.rows[0].res;
        } finally {
          await c.query('RESET ROLE').catch(() => {});
        }
      }));

      const okCount = outs.filter(r => r.success === true && r.reason_code === 'ok').length;
      const blockedCount = outs.filter(
        r => r.success === false && r.reason_code === 'rate_limit_exceeded' && r.detail === 'phone_burst_limit_reached'
      ).length;
      assert.strictEqual(okCount, 5, 'Eşzamanlı 8 bağlantıdan yalnız 5 tanesi telefon burst limitini geçmelidir');
      assert.strictEqual(blockedCount, 3, 'Kalan 3 eşzamanlı bağlantı phone_burst_limit_reached ile engellenmelidir');

      const evCount = await db.query(
        "SELECT count(*) FROM public.public_booking_rate_limit_events WHERE tenant_id = $1 AND customer_phone = '+905559200002' AND event_type = 'booking_attempt'",
        [tenantConcId]
      );
      assert.strictEqual(parseInt(evCount.rows[0].count, 10), 5, 'Rate-limit ledger da tam 5 deneme kaydı olmalıdır');
    } finally {
      await closeIndependentPgConnections(burstConns);
    }

    // C. Rollback ve DB hata fail-closed güvenliği
    const rbConns = await openIndependentPgConnections(2);
    try {
      const [rbC, okC] = rbConns;
      await rbC.query('BEGIN');
      await rbC.query('SET LOCAL ROLE anon');
      const tryRb = await rbC.query(`
        SELECT public.create_public_booking(
          'salon-conc-rl', $1::uuid, $2::uuid, '2026-12-20'::date, '10:00'::time,
          'RB Test', 'rb@test.com', '+90 555 920 0003', true, false, false, 'idem_rb_rl_1', $3::uuid, NULL, 'fp_rb_rl_1'
        ) AS res;
      `, [serviceConcId, staffConc1Id, branchConcId]);
      assert.strictEqual(tryRb.rows[0].res.success, true);
      await rbC.query('ROLLBACK');

      const rbEv = await okC.query(
        "SELECT count(*) FROM public.public_booking_rate_limit_events WHERE tenant_id = $1 AND customer_phone = '+905559200003'",
        [tenantConcId]
      );
      assert.strictEqual(parseInt(rbEv.rows[0].count, 10), 0, 'ROLLBACK edilen işlem event bırakmamalıdır');

      // Direct fail-closed error test on evaluate_and_record_public_booking_rate_limit (NULL tenant_id)
      const failClosedRl = await okC.query(`
        SELECT public.evaluate_and_record_public_booking_rate_limit(NULL::uuid, '+90 555 920 0003', 'fp_rb_rl_1') AS res;
      `);
      assert.strictEqual(failClosedRl.rows[0].res.allowed, false);
      assert.strictEqual(failClosedRl.rows[0].res.reason_code, 'invalid_tenant');

      await okC.query('SET ROLE anon');
      const retryOk = await okC.query(`
        SELECT public.create_public_booking(
          'salon-conc-rl', $1::uuid, $2::uuid, '2026-12-20'::date, '10:00'::time,
          'Retry RB', 'rb2@test.com', '+90 555 920 0003', true, false, false, 'idem_rb_rl_2', $3::uuid, NULL, 'fp_rb_rl_1'
        ) AS res;
      `, [serviceConcId, staffConc1Id, branchConcId]);
      await okC.query('RESET ROLE');
      assert.strictEqual(retryOk.rows[0].res.success, true);
    } finally {
      await closeIndependentPgConnections(rbConns);
    }
  });

  await runAsyncTest('3.14. [GERÇEK DB ÇOKLU BAĞLANTI FINGERPRINT BURST=10 & DEADLOCK-FREE] Farklı telefon/personel/tarihte paralel 14 bağlantıda 10 sınırının korunumu ve Tenant B izolasyonu', async () => {
    const db = await getDisposablePgEngine();

    // Tenant B hazır fixtures al
    const bFix = (await db.query(`
      SELECT
        (SELECT id FROM public.branches WHERE tenant_id = $1 AND is_active = true LIMIT 1) AS branch_id,
        (SELECT id FROM public.services WHERE tenant_id = $1 AND active = true LIMIT 1) AS service_id,
        (SELECT id FROM public.staff WHERE tenant_id = $1 AND active = true LIMIT 1) AS staff_id
    `, [tenantBId])).rows[0];

    // 14 eşzamanlı bağlantı aynı fingerprint + 14 farklı telefon + farklı personel/tarih + 15. bağlantı Tenant B izolasyon kontrolü
    const conns = await openIndependentPgConnections(15);
    try {
      const concPromises = conns.slice(0, 14).map(async (c, idx) => {
        await c.query('SET ROLE anon');
        try {
          const staffId = idx % 2 === 0 ? staffConc1Id : staffConc2Id;
          const dateStr = `2026-11-${String(10 + idx).padStart(2, '0')}`;
          const phone = `+90 555 930 ${String(idx + 1).padStart(4, '0')}`;
          const q = await c.query(`
            SELECT public.create_public_booking(
              'salon-conc-rl', $1::uuid, $2::uuid, $3::date, '14:00'::time,
              $4, $5, $6, true, false, false, $7, $8::uuid, NULL, 'fp_conc_swarm_10'
            ) AS res;
          `, [
            serviceConcId,
            staffId,
            dateStr,
            `FP Swarm ${idx}`,
            `fps${idx}@test.com`,
            phone,
            `idem_fpburst_${idx}`,
            branchConcId,
          ]);
          return { tenant: 'conc', res: q.rows[0].res };
        } finally {
          await c.query('RESET ROLE').catch(() => {});
        }
      });

      concPromises.push((async () => {
        const c = conns[14];
        await c.query('SET ROLE anon');
        try {
          const q = await c.query(`
            SELECT public.create_public_booking(
              'salon-beta', $1::uuid, $2::uuid, '2026-11-29'::date, '16:00'::time,
              'Beta Swarm Iso', 'betaiso@test.com', '+90 555 930 9999', true, false, false,
              'idem_beta_fp_iso', $3::uuid, NULL, 'fp_conc_swarm_10'
            ) AS res;
          `, [bFix.service_id, bFix.staff_id, bFix.branch_id]);
          return { tenant: 'beta', res: q.rows[0].res };
        } finally {
          await c.query('RESET ROLE').catch(() => {});
        }
      })());

      const allOuts = await Promise.all(concPromises);
      const concOk = allOuts.filter(x => x.tenant === 'conc' && x.res.success === true);
      const concBlocked = allOuts.filter(
        x => x.tenant === 'conc' && x.res.success === false && x.res.reason_code === 'rate_limit_exceeded' && x.res.detail === 'fingerprint_burst_limit_reached'
      );
      const betaOut = allOuts.find(x => x.tenant === 'beta');

      assert.strictEqual(concOk.length, 10, 'Eşzamanlı 14 bağlantıdan tam 10 tanesi fingerprint burst limitini geçmelidir');
      assert.strictEqual(concBlocked.length, 4, 'Kalan 4 bağlantı fingerprint_burst_limit_reached ile reddedilmelidir');
      assert.strictEqual(betaOut.res.success, true, 'Tenant B aynı fingerprint ile izole çalışabilmelidir');

      const fpCount = await db.query(
        "SELECT count(*) FROM public.public_booking_rate_limit_events WHERE tenant_id = $1 AND client_fingerprint = 'fp_conc_swarm_10' AND event_type = 'booking_attempt'",
        [tenantConcId]
      );
      assert.strictEqual(parseInt(fpCount.rows[0].count, 10), 10, 'Fingerprint event sayısı 10 u aşmamalıdır');
    } finally {
      await closeIndependentPgConnections(conns);
    }

    // Çapraz/çakışan (phone, fp) çiftleriyle eşzamanlı deadlock-free doğrulaması (8 ayrı bağlantı)
    const crossConns = await openIndependentPgConnections(8);
    try {
      const pairs = [
        ['+90 555 940 0001', 'fp_cross_A'],
        ['+90 555 940 0002', 'fp_cross_B'],
        ['+90 555 940 0001', 'fp_cross_B'],
        ['+90 555 940 0002', 'fp_cross_A'],
        ['+90 555 940 0001', 'fp_cross_A'],
        ['+90 555 940 0002', 'fp_cross_B'],
        ['+90 555 940 0001', 'fp_cross_B'],
        ['+90 555 940 0002', 'fp_cross_A'],
      ];
      const crossOuts = await Promise.all(crossConns.map(async (c, idx) => {
        const [ph, fp] = pairs[idx];
        await c.query('SET ROLE anon');
        try {
          const staffId = idx % 2 === 0 ? staffConc1Id : staffConc2Id;
          const dateStr = `2027-01-${String(10 + idx).padStart(2, '0')}`;
          const q = await c.query(`
            SELECT public.create_public_booking(
              'salon-conc-rl', $1::uuid, $2::uuid, $3::date, '15:00'::time,
              $4, $5, $6, true, false, false, $7, $8::uuid, NULL, $9
            ) AS res;
          `, [serviceConcId, staffId, dateStr, `Cross ${idx}`, `c${idx}@test.com`, ph, `idem_cross_${idx}`, branchConcId, fp]);
          return q.rows[0].res;
        } finally {
          await c.query('RESET ROLE').catch(() => {});
        }
      }));
      // Hiçbir deadlocks/SQL istisnası olmadan 8 sonucun tamamı temiz JSON dönmelidir
      assert.strictEqual(crossOuts.length, 8);
      for (const r of crossOuts) {
        assert(typeof r.success === 'boolean' && r.reason_code !== 'temporary_failure', `Deadlock veya geçici hata oluşmamalıydı: ${JSON.stringify(r)}`);
      }
    } finally {
      await closeIndependentPgConnections(crossConns);
    }
  });

  await runAsyncTest('3.15. [MAT-01] SQL ve TS Çapraz Eşdeğerlik Doğrulaması (Kanonik E.164, TR alias normalizasyonu ve geçersiz telefon reddi)', async () => {
    const db = await getDisposablePgEngine();

    const testCases = [
      // TR Geçerli Eşdeğerler
      { raw: '+90 555 910 0002', expected: '+905559100002' },
      { raw: '+90-555-910-0002', expected: '+905559100002' },
      { raw: '+90 (555) 910.00.02', expected: '+905559100002' },
      { raw: '0555 910 00 02', expected: '+905559100002' },
      { raw: '00905559100002', expected: '+905559100002' },
      { raw: '905559100002', expected: '+905559100002' },
      { raw: '0 (555) 910-00-02', expected: '+905559100002' },
      { raw: '  05559100002  ', expected: '+905559100002' },
      // Uluslararası Geçerli
      { raw: '+44 20 7946 0958', expected: '+442079460958' },
      { raw: '0044 20 7946 0958', expected: '+442079460958' },
      { raw: '+1 555 234 5678', expected: '+15552345678' },
      // Geçersiz / Desteklenmeyen (SQL -> NULL, TS -> '')
      { raw: null, expected: null },
      { raw: '', expected: null },
      { raw: '   ', expected: null },
      { raw: 'not-a-phone', expected: null },
      { raw: '1234567', expected: null },
      { raw: '5559100002', expected: null },
      { raw: '+90 0555 123 4567', expected: null },
      { raw: '0555123', expected: null },
      { raw: '0555123456789', expected: null },
      { raw: '+90 555 ABC 0002', expected: null },
      { raw: '++905559100002', expected: null },
      { raw: '+123456', expected: null },
      { raw: '+90-555-910-0002#123', expected: null },
    ];

    for (const tc of testCases) {
      const sqlRes = (await db.query('SELECT public.normalize_public_booking_phone($1) AS res', [tc.raw])).rows[0].res;
      const tsRes = normalizePublicBookingPhone(tc.raw);
      const tsParsed = parsePublicBookingPhone(tc.raw);

      assert.strictEqual(
        sqlRes,
        tc.expected,
        `SQL normalize_public_booking_phone for "${tc.raw}" expected "${tc.expected}", got "${sqlRes}"`
      );
      assert.strictEqual(
        tsRes,
        tc.expected || '',
        `TS normalizePublicBookingPhone for "${tc.raw}" expected "${tc.expected || ''}", got "${tsRes}"`
      );
      if (tc.expected) {
        assert.strictEqual(tsParsed.valid, true);
        assert.strictEqual(tsParsed.canonical, tc.expected);
      } else {
        assert.strictEqual(tsParsed.valid, false);
        assert.strictEqual(tsParsed.canonical, '');
      }
    }
  });

  await runAsyncTest('3.16. [MAT-02] Çoklu Bağlantı PG (OTP Alias Normalizasyonu, Eşzamanlı Cooldown Koruması ve Tenant İzolasyonu)', async () => {
    const db = await getDisposablePgEngine();

    // 6 farklı TR telefon alias'ı (hepsi +90 555 950 0001 için)
    const phoneAliases = [
      '+90 555 950 0001',
      '+90-555-950-0001',
      '0555 950 00 01',
      '0 (555) 950-00-01',
      '00905559500001',
      '905559500001',
    ];

    const otpHash = crypto.createHash('sha256').update('951753', 'utf8').digest('hex');
    const conns = await openIndependentPgConnections(7);
    try {
      // 6 bağlantı salon-alfa için eşzamanlı çağrı yapar
      const promises = conns.slice(0, 6).map(async (c, idx) => {
        await c.query('SET ROLE anon');
        try {
          const q = await c.query(`
            SELECT public.request_public_booking_otp(
              p_slug := 'salon-alfa',
              p_customer_phone := $1,
              p_client_fingerprint := $2
            ) AS res;
          `, [phoneAliases[idx], `fp_otp_alias_${idx}`]);
          return { tenant: 'alfa', res: q.rows[0].res };
        } finally {
          await c.query('RESET ROLE').catch(() => {});
        }
      });

      // 7. bağlantı salon-beta (Tenant B) için aynı numarayla çağrı yapar
      promises.push((async () => {
        const c = conns[6];
        await c.query('SET ROLE anon');
        try {
          const q = await c.query(`
            SELECT public.request_public_booking_otp(
              p_slug := 'salon-beta',
              p_customer_phone := '+90 555 950 0001',
              p_client_fingerprint := 'fp_beta_otp'
            ) AS res;
          `);
          return { tenant: 'beta', res: q.rows[0].res };
        } finally {
          await c.query('RESET ROLE').catch(() => {});
        }
      })());

      const results = await Promise.all(promises);
      const alfaResults = results.filter(r => r.tenant === 'alfa');
      const betaResult = results.find(r => r.tenant === 'beta');

      const alfaSuccesses = alfaResults.filter(r => r.res.success === true);
      const alfaRateLimited = alfaResults.filter(r => r.res.success === false && r.res.reason_code === 'otp_rate_limited');

      assert.strictEqual(alfaSuccesses.length, 1, 'Tenant A için 6 eşzamanlı alias çağrısından tam 1 tanesi başarılı olmalıdır');
      assert.strictEqual(alfaRateLimited.length, 5, 'Kalan 5 alias çağrısı otp_rate_limited almalıdır');
      assert.strictEqual(betaResult.res.success, true, 'Tenant B aynı numarayla izole ve başarılı olmalıdır');

      // Tenant A challenge ve outbox kanonik numara ile mi kaydedildi?
      const chalRow = await db.query(
        "SELECT id, customer_phone, status FROM public.public_booking_otp_challenges WHERE customer_phone = '+905559500001' AND tenant_id = $1",
        [tenantAId]
      );
      assert.strictEqual(chalRow.rows.length, 1, 'Kanonik telefon ile tam 1 challenge kaydedilmelidir');
      assert.strictEqual(chalRow.rows[0].customer_phone, '+905559500001');

      const outboxRow = await db.query(
        "SELECT recipient, delivery_mode, metadata FROM public.communication_outbox WHERE recipient = '+905559500001' AND tenant_id = $1",
        [tenantAId]
      );
      assert.strictEqual(outboxRow.rows.length, 1, 'Kanonik recipient ile tam 1 outbox kaydı olmalıdır');
      assert.strictEqual(outboxRow.rows[0].delivery_mode, 'synthetic_outbox_only');
      const generatedCode = outboxRow.rows[0].metadata?.synthetic_otp_code;
      assert(generatedCode, 'Outbox kaydında sentetik OTP kodu bulunmalıdır');

      const challengeId = alfaSuccesses[0].res.challengeId || alfaSuccesses[0].res.challenge_id;

      // Farklı bir telefonla doğrulama -> phone_mismatch
      const mismatchVer = (await db.query(`
        SELECT public.verify_public_booking_otp('salon-alfa', $1, $2, '+90 555 950 0002') AS res;
      `, [challengeId, generatedCode])).rows[0].res;
      assert.strictEqual(mismatchVer.success, false);
      assert.strictEqual(mismatchVer.reason_code, 'phone_mismatch');

      // Başka bir alias biçimiyle doğrulama ('0555 950 00 01') -> başarılı olmalı!
      const aliasVer = (await db.query(`
        SELECT public.verify_public_booking_otp('salon-alfa', $1, $2, '0555 950 00 01') AS res;
      `, [challengeId, generatedCode])).rows[0].res;
      assert.strictEqual(aliasVer.success, true);
      assert(aliasVer.verification_token, 'Doğrulama tokenı üretilmelidir');
    } finally {
      await closeIndependentPgConnections(conns);
    }
  });

  await runAsyncTest('3.17. [MAT-03] Çoklu Bağlantı PG (Rate-Limit Alias Burst=5, Günlük=3 ve Duplicate Engeli)', async () => {
    const db = await getDisposablePgEngine();

    // İkinci bir servis ekleyelim (farklı hizmet için)
    const extraSrv = (await db.query(`
      INSERT INTO public.services (tenant_id, name, duration_minutes, active)
      VALUES ($1, 'Masaj MAT3', 45, true)
      RETURNING id;
    `, [tenantConcId])).rows[0].id;

    // A. Burst=5 Sınırı: 8 bağımsız bağlantı farklı alias'larla aynı anda çağırır
    const burstAliases = [
      '+90 555 960 0001',
      '+90-555-960-0001',
      '0555 960 00 01',
      '0 (555) 960-00-01',
      '00905559600001',
      '905559600001',
      '+90 555 960 0001',
      '05559600001',
    ];

    const burstConns = await openIndependentPgConnections(8);
    try {
      const burstResults = await Promise.all(burstConns.map(async (c, idx) => {
        await c.query('SET ROLE anon');
        try {
          const staffId = idx % 2 === 0 ? staffConc1Id : staffConc2Id;
          const dateStr = `2027-02-${String(10 + idx).padStart(2, '0')}`;
          const q = await c.query(`
            SELECT public.create_public_booking(
              'salon-conc-rl', $1::uuid, $2::uuid, $3::date, '10:00'::time,
              $4, $5, $6, true, false, false, $7, $8::uuid, NULL, $9
            ) AS res;
          `, [
            serviceConcId,
            staffId,
            dateStr,
            `Alias Burst ${idx}`,
            `ab${idx}@test.com`,
            burstAliases[idx],
            `idem_mat3_burst_${idx}`,
            branchConcId,
            `fp_mat3_${idx}`,
          ]);
          return q.rows[0].res;
        } finally {
          await c.query('RESET ROLE').catch(() => {});
        }
      }));

      const oks = burstResults.filter(r => r.success === true);
      const blocked = burstResults.filter(
        r => r.success === false && r.reason_code === 'rate_limit_exceeded' && r.detail === 'phone_burst_limit_reached'
      );
      assert.strictEqual(oks.length, 5, 'Eşzamanlı 8 alias çağrısından tam 5 tanesi burst sınırından geçmelidir');
      assert.strictEqual(blocked.length, 3, 'Kalan 3 alias çağrısı phone_burst_limit_reached ile engellenmelidir');
    } finally {
      await closeIndependentPgConnections(burstConns);
    }

    // B. Günlük Limit=3 ve Aynı Gün Duplicate Engeli
    // 1. Randevu: '0555 960 00 02' ile 2027-03-01 tarihinde serviceConcId
    const res1 = (await db.query(`
      SELECT public.create_public_booking(
        'salon-conc-rl', $1::uuid, $2::uuid, '2027-03-01'::date, '09:00'::time,
        'Daily 1', 'd1@test.com', '0555 960 00 02', true, false, false,
        'idem_mat3_d1', $3::uuid, NULL, 'fp_mat3_d1'
      ) AS res;
    `, [serviceConcId, staffConc1Id, branchConcId])).rows[0].res;
    assert.strictEqual(res1.success, true);

    // 2. Randevu (Aynı gün aynı hizmet): '+90-555-960-0002' ile aynı tarihte serviceConcId -> duplicate_booking_same_day
    const resDup = (await db.query(`
      SELECT public.create_public_booking(
        'salon-conc-rl', $1::uuid, $2::uuid, '2027-03-01'::date, '11:00'::time,
        'Daily Dup', 'ddup@test.com', '+90-555-960-0002', true, false, false,
        'idem_mat3_ddup', $3::uuid, NULL, 'fp_mat3_ddup'
      ) AS res;
    `, [serviceConcId, staffConc2Id, branchConcId])).rows[0].res;
    assert.strictEqual(resDup.success, false);
    assert.strictEqual(resDup.reason_code, 'duplicate_booking_same_day', 'Farklı alias kullansa da aynı gün aynı hizmet engellenmelidir');

    // 2. Geçerli Randevu (Aynı gün farklı hizmet): '905559600002' ile extraSrv
    const res2 = (await db.query(`
      SELECT public.create_public_booking(
        'salon-conc-rl', $1::uuid, $2::uuid, '2027-03-01'::date, '12:00'::time,
        'Daily 2', 'd2@test.com', '905559600002', true, false, false,
        'idem_mat3_d2', $3::uuid, NULL, 'fp_mat3_d2'
      ) AS res;
    `, [extraSrv, staffConc1Id, branchConcId])).rows[0].res;
    assert.strictEqual(res2.success, true);

    // 3. Geçerli Randevu (Farklı tarih veya 3. randevu için başka hizmet): Başka servis oluşturalım
    const srv3 = (await db.query(`
      INSERT INTO public.services (tenant_id, name, duration_minutes, active)
      VALUES ($1, 'Cilt MAT3', 45, true) RETURNING id;
    `, [tenantConcId])).rows[0].id;
    const res3 = (await db.query(`
      SELECT public.create_public_booking(
        'salon-conc-rl', $1::uuid, $2::uuid, '2027-03-01'::date, '14:00'::time,
        'Daily 3', 'd3@test.com', '0 (555) 960-00-02', true, false, false,
        'idem_mat3_d3', $3::uuid, NULL, 'fp_mat3_d3'
      ) AS res;
    `, [srv3, staffConc2Id, branchConcId])).rows[0].res;
    assert.strictEqual(res3.success, true);

    // 4. Randevu (Aynı gün 4. randevu): daily_appointment_limit_reached
    const srv4 = (await db.query(`
      INSERT INTO public.services (tenant_id, name, duration_minutes, active)
      VALUES ($1, 'Makyaj MAT3', 45, true) RETURNING id;
    `, [tenantConcId])).rows[0].id;
    const res4 = (await db.query(`
      SELECT public.create_public_booking(
        'salon-conc-rl', $1::uuid, $2::uuid, '2027-03-01'::date, '16:00'::time,
        'Daily 4', 'd4@test.com', '+90 555 960 0002', true, false, false,
        'idem_mat3_d4', $3::uuid, NULL, 'fp_mat3_d4'
      ) AS res;
    `, [srv4, staffConc1Id, branchConcId])).rows[0].res;
    assert.strictEqual(res4.success, false);
    assert.strictEqual(res4.reason_code, 'rate_limit_exceeded');
    assert.strictEqual(res4.detail, 'daily_appointment_limit_reached', 'Günde 3 randevu sınırı aliaslar üzerinden de korunmalıdır');
  });

  await runAsyncTest('3.18. [MAT-04] Çoklu Bağlantı PG + TS (Geçersiz Telefon Reddi: invalid_phone)', async () => {
    const db = await getDisposablePgEngine();

    const invalidPhones = [
      'not-a-phone',
      '5559100002',
      '+90 0555 123 4567',
      '0555123',
      '++905551234567',
    ];

    // Kayıt sayılarını önceden alalım
    const initAppts = parseInt((await db.query('SELECT count(*) FROM public.appointments')).rows[0].count, 10);
    const initChals = parseInt((await db.query('SELECT count(*) FROM public.public_booking_otp_challenges')).rows[0].count, 10);
    const initOutbox = parseInt((await db.query('SELECT count(*) FROM public.communication_outbox')).rows[0].count, 10);
    const initEvents = parseInt((await db.query('SELECT count(*) FROM public.public_booking_rate_limit_events')).rows[0].count, 10);

    for (const badPhone of invalidPhones) {
      // 1. request_public_booking_otp
      const reqRes = (await db.query(`
        SELECT public.request_public_booking_otp('salon-alfa', $1, 'fp_bad', 'dummy_hash') AS res;
      `, [badPhone])).rows[0].res;
      assert.strictEqual(reqRes.success, false);
      assert.strictEqual(reqRes.reason_code, 'invalid_phone', `request_public_booking_otp should reject "${badPhone}"`);

      // 2. verify_public_booking_otp
      const verRes = (await db.query(`
        SELECT public.verify_public_booking_otp('salon-alfa', '00000000-0000-0000-0000-000000000000'::uuid, '123456', $1) AS res;
      `, [badPhone])).rows[0].res;
      assert.strictEqual(verRes.success, false);
      assert.strictEqual(verRes.reason_code, 'invalid_phone', `verify_public_booking_otp should reject "${badPhone}"`);

      // 3. create_public_booking
      const createRes = (await db.query(`
        SELECT public.create_public_booking(
          'salon-conc-rl', $1::uuid, $2::uuid, '2027-06-01'::date, '10:00'::time,
          'Bad Phone', 'bad@test.com', $3, true, false, false,
          $4, $5::uuid, NULL, 'fp_bad'
        ) AS res;
      `, [serviceConcId, staffConc1Id, badPhone, `idem_bad_${badPhone}`, branchConcId])).rows[0].res;
      assert.strictEqual(createRes.success, false);
      assert.strictEqual(createRes.reason_code, 'invalid_phone', `create_public_booking should reject "${badPhone}"`);

      // 4. evaluate_and_record_public_booking_rate_limit
      const rlRes = (await db.query(`
        SELECT public.evaluate_and_record_public_booking_rate_limit(
          $1::uuid, $2, 'fp_bad', $3::uuid, '2027-06-01'::date, 'bad@test.com'
        ) AS res;
      `, [tenantConcId, badPhone, serviceConcId])).rows[0].res;
      assert.strictEqual(rlRes.allowed, false);
      assert.strictEqual(rlRes.reason_code, 'invalid_phone', `evaluate_and_record should reject "${badPhone}"`);

      // 5. TS publicBookingOtpService
      const tsReq = await publicBookingOtpService.requestOtp({ slug: 'salon-alfa', phone: badPhone, syntheticOtp: '123456' });
      assert.strictEqual(tsReq.success, false);
      assert.strictEqual(tsReq.reasonCode, 'invalid_phone');

      const tsVer = await publicBookingOtpService.verifyOtp({
        slug: 'salon-alfa',
        challengeId: '00000000-0000-0000-0000-000000000000',
        otpCode: '123456',
        phone: badPhone,
      });
      assert.strictEqual(tsVer.success, false);
      assert.strictEqual(tsVer.reasonCode, 'invalid_phone');

      // 6. TS bookingAbuseProtectionService
      const tsBlock = await bookingAbuseProtectionService.shouldBlockBooking({
        tenantId: 't_bad',
        phone: badPhone,
        email: 'bad@test.com',
        clientFingerprint: 'fp_bad',
      });
      assert.strictEqual(tsBlock.block, true);
      assert.strictEqual(tsBlock.reasonCode, 'invalid_phone');
    }

    // Hiçbir kayıt eklenmemeli!
    const postAppts = parseInt((await db.query('SELECT count(*) FROM public.appointments')).rows[0].count, 10);
    const postChals = parseInt((await db.query('SELECT count(*) FROM public.public_booking_otp_challenges')).rows[0].count, 10);
    const postOutbox = parseInt((await db.query('SELECT count(*) FROM public.communication_outbox')).rows[0].count, 10);
    const postEvents = parseInt((await db.query('SELECT count(*) FROM public.public_booking_rate_limit_events')).rows[0].count, 10);

    assert.strictEqual(postAppts, initAppts, 'Geçersiz telefon çağrılarında 0 randevu oluşmalıdır');
    assert.strictEqual(postChals, initChals, 'Geçersiz telefon çağrılarında 0 challenge oluşmalıdır');
    assert.strictEqual(postOutbox, initOutbox, 'Geçersiz telefon çağrılarında 0 outbox oluşmalıdır');
    assert.strictEqual(postEvents, initEvents, 'Geçersiz telefon çağrılarında 0 rate limit eventi oluşmalıdır');
  });

  await runAsyncTest('3.19. [MAT-05] PG + TS (require_otp_for_booking = true İken Boş/NULL Telefon Reddi: invalid_phone)', async () => {
    const db = await getDisposablePgEngine();

    // salon-alfa kiracısında require_otp_for_booking = true yapalım
    await db.query("UPDATE public.tenants SET require_otp_for_booking = true WHERE slug = 'salon-alfa'");
    try {
      // 1. Boş string telefon (15 parametre)
      const resEmpty = (await db.query(`
        SELECT public.create_public_booking(
          'salon-alfa', $1::uuid, $2::uuid, '2027-07-01'::date, '10:00'::time,
          'No Phone OTP', 'nophone@test.com', '', true, false, false,
          'idem_mat5_empty', $3::uuid, 'dummy_token', 'fp_mat5'
        ) AS res;
      `, [serviceAId, staffAId, branchAId])).rows[0].res;
      assert.strictEqual(resEmpty.success, false);
      assert.strictEqual(resEmpty.reason_code, 'invalid_phone', 'OTP zorunlu iken boş telefon invalid_phone almalıdır');

      // 2. NULL telefon (15 parametre)
      const resNull = (await db.query(`
        SELECT public.create_public_booking(
          'salon-alfa', $1::uuid, $2::uuid, '2027-07-01'::date, '10:00'::time,
          'Null Phone OTP', 'nullphone@test.com', NULL, true, false, false,
          'idem_mat5_null', $3::uuid, 'dummy_token', 'fp_mat5'
        ) AS res;
      `, [serviceAId, staffAId, branchAId])).rows[0].res;
      assert.strictEqual(resNull.success, false);
      assert.strictEqual(resNull.reason_code, 'invalid_phone', 'OTP zorunlu iken NULL telefon invalid_phone almalıdır');

      // 3. 13 parametreli eski/legacy imza ile boş telefon
      const resLegacy = (await db.query(`
        SELECT public.create_public_booking(
          'salon-alfa', $1::uuid, $2::uuid, '2027-07-01'::date, '10:00'::time,
          'Legacy No Phone', 'legacynophone@test.com', '', true, false, false,
          'idem_mat5_legacy', $3::uuid
        ) AS res;
      `, [serviceAId, staffAId, branchAId])).rows[0].res;
      assert.strictEqual(resLegacy.success, false);
      assert.strictEqual(resLegacy.reason_code, 'invalid_phone', '13 parametreli imza da OTP zorunlu iken boş telefonu atlayamaz');

      // 4. TS LocalBookingRepository doğrulaması
      const restoreLS = installNodeLocalStorageShim();
      try {
        const { LocalBookingRepository } = await import('../services/repositories/localBookingRepository.ts');
        const { appointmentSelfServiceService } = await import('../services/appointmentSelfServiceService.ts');
        const repo = new LocalBookingRepository();
        localStorage.setItem('lari:salon-otp-mat5:appointments_seeded', 'true');
        appointmentSelfServiceService.saveBookingPolicy('salon-otp-mat5', { requireOtpForBooking: true });

        const tsRes = await repo.createPublicBooking({
          slug: 'salon-otp-mat5',
          serviceId: 'srv_1',
          staffId: 'staff_1',
          appointmentDate: '2027-07-01',
          appointmentTime: '10:00',
          customerName: 'TS Boş Tel',
          customerEmail: 'tsempty@test.com',
          customerPhone: '',
          requiredConsent: true,
        });
        assert.strictEqual(tsRes.success, false);
        assert.strictEqual(tsRes.reasonCode, 'invalid_phone', 'TS repo OTP zorunlu iken boş telefonu invalid_phone ile reddetmelidir');
      } finally {
        restoreLS();
      }
    } finally {
      await db.query("UPDATE public.tenants SET require_otp_for_booking = false WHERE slug = 'salon-alfa'");
    }
  });

  await runAsyncTest('3.20. [MAT-06] Çoklu Bağlantı PG (phone="", fp=NULL, Başlıksız Fail-Closed anonymous_rate_limit_boundary_missing)', async () => {
    const conns = await openIndependentPgConnections(5);
    try {
      const results = await Promise.all(conns.map(async (c, idx) => {
        await c.query('SET ROLE anon');
        try {
          const staffId = idx % 2 === 0 ? staffConc1Id : staffConc2Id;
          const dateStr = `2027-08-${String(10 + idx).padStart(2, '0')}`;
          const q = await c.query(`
            SELECT public.create_public_booking(
              'salon-conc-rl', $1::uuid, $2::uuid, $3::date, '10:00'::time,
              $4, $5, '', true, false, false, $6, $7::uuid, NULL, NULL
            ) AS res;
          `, [
            serviceConcId,
            staffId,
            dateStr,
            `Anon Sybil ${idx}`,
            `anonsybil${idx}@test.com`,
            `idem_mat6_${idx}`,
            branchConcId,
          ]);
          return q.rows[0].res;
        } finally {
          await c.query('RESET ROLE').catch(() => {});
        }
      }));

      assert.strictEqual(results.length, 5);
      for (let i = 0; i < 5; i++) {
        const r = results[i];
        assert.strictEqual(r.success, false, `Anonim başlıksız istek ${i} başarısız olmalıdır`);
        assert.strictEqual(r.reason_code, 'rate_limit_exceeded', `Anonim başlıksız istek ${i} rate_limit_exceeded almalıdır`);
        assert.strictEqual(r.detail, 'anonymous_rate_limit_boundary_missing', `Anonim başlıksız istek ${i} anonymous_rate_limit_boundary_missing almalıdır`);
      }
    } finally {
      await closeIndependentPgConnections(conns);
    }
  });

  await runAsyncTest('3.21. [MAT-07] Çoklu Bağlantı PG (phone="", fp=NULL + Güvenilir IP Header + Email Burst/Rotasyon & Tenant İzolasyonu)', async () => {
    const db = await getDisposablePgEngine();

    // A. Aynı E-posta Burst=5 Sınırı + Tenant B İzolasyonu
    const emailConns = await openIndependentPgConnections(9);
    try {
      const emailPromises = emailConns.slice(0, 8).map(async (c, idx) => {
        await c.query("SET request.headers = '{\"x-real-ip\": \"203.0.113.50\"}'");
        await c.query('SET ROLE anon');
        try {
          const staffId = idx % 2 === 0 ? staffConc1Id : staffConc2Id;
          const dateStr = `2027-09-${String(10 + idx).padStart(2, '0')}`;
          const q = await c.query(`
            SELECT public.create_public_booking(
              'salon-conc-rl', $1::uuid, $2::uuid, $3::date, '11:00'::time,
              $4, 'burst_email@test.com', '', true, false, false,
              $5, $6::uuid, NULL, NULL
            ) AS res;
          `, [
            serviceConcId,
            staffId,
            dateStr,
            `Email Burst ${idx}`,
            `idem_mat7_eb_${idx}`,
            branchConcId,
          ]);
          return { tenant: 'conc', res: q.rows[0].res };
        } finally {
          await c.query('RESET ROLE').catch(() => {});
        }
      });

      // Tenant B aynı e-posta ve aynı IP ile çağrı yapar
      emailPromises.push((async () => {
        const c = emailConns[8];
        const bFix = (await db.query(`
          SELECT
            (SELECT id FROM public.branches WHERE tenant_id = $1 AND is_active = true LIMIT 1) AS branch_id,
            (SELECT id FROM public.services WHERE tenant_id = $1 AND active = true LIMIT 1) AS service_id,
            (SELECT id FROM public.staff WHERE tenant_id = $1 AND active = true LIMIT 1) AS staff_id
        `, [tenantBId])).rows[0];

        await c.query("SET request.headers = '{\"x-real-ip\": \"203.0.113.50\"}'");
        await c.query('SET ROLE anon');
        try {
          const q = await c.query(`
            SELECT public.create_public_booking(
              'salon-beta', $1::uuid, $2::uuid, '2027-09-25'::date, '14:00'::time,
              'Beta Email Iso', 'burst_email@test.com', '', true, false, false,
              'idem_mat7_b_iso', $3::uuid, NULL, NULL
            ) AS res;
          `, [bFix.service_id, bFix.staff_id, bFix.branch_id]);
          return { tenant: 'beta', res: q.rows[0].res };
        } finally {
          await c.query('RESET ROLE').catch(() => {});
        }
      })());

      const emailOuts = await Promise.all(emailPromises);
      const concOks = emailOuts.filter(x => x.tenant === 'conc' && x.res.success === true);
      const concBlocked = emailOuts.filter(
        x => x.tenant === 'conc' && x.res.success === false && x.res.reason_code === 'rate_limit_exceeded' && x.res.detail === 'email_burst_limit_reached'
      );
      const betaOut = emailOuts.find(x => x.tenant === 'beta');

      assert.strictEqual(concOks.length, 5, 'Eşzamanlı 8 çağrıdan tam 5 tanesi email burst sınırından geçmelidir');
      assert.strictEqual(concBlocked.length, 3, 'Kalan 3 çağrı email_burst_limit_reached almalıdır');
      assert.strictEqual(betaOut.res.success, true, 'Tenant B aynı e-posta ve IP ile başarılı olmalıdır (izolasyon)');
    } finally {
      await closeIndependentPgConnections(emailConns);
    }

    // B. E-posta Rotasyonu (Sybil) + Sahte X-Forwarded-For Enjeksiyonu (14 Bağlantı)
    // Sol taraftaki sahte IP değişse de en sağdaki güvenilir IP 203.0.113.51 sabittir
    const ipConns = await openIndependentPgConnections(14);
    try {
      const ipPromises = ipConns.map(async (c, idx) => {
        const fakeHeader = JSON.stringify({
          'x-forwarded-for': `198.51.100.${idx + 1}, 203.0.113.51`,
        });
        await c.query(`SET request.headers = '${fakeHeader}'`);
        await c.query('SET ROLE anon');
        try {
          const staffId = idx % 2 === 0 ? staffConc1Id : staffConc2Id;
          const dateStr = `2027-10-${String(10 + idx).padStart(2, '0')}`;
          const q = await c.query(`
            SELECT public.create_public_booking(
              'salon-conc-rl', $1::uuid, $2::uuid, $3::date, '15:00'::time,
              $4, $5, '', true, false, false,
              $6, $7::uuid, NULL, NULL
            ) AS res;
          `, [
            serviceConcId,
            staffId,
            dateStr,
            `Sybil Rot ${idx}`,
            `sybil_rot_${idx}@test.com`,
            `idem_mat7_sybil_${idx}`,
            branchConcId,
          ]);
          return q.rows[0].res;
        } finally {
          await c.query('RESET ROLE').catch(() => {});
        }
      });

      const ipOuts = await Promise.all(ipPromises);
      const ipOks = ipOuts.filter(r => r.success === true);
      const ipBlocked = ipOuts.filter(
        r => r.success === false && r.reason_code === 'rate_limit_exceeded' && r.detail === 'ip_burst_limit_reached'
      );

      assert.strictEqual(ipOks.length, 10, 'Sağdaki IP sabitken e-posta rotasyonunda tam 10 istek geçmelidir (IP burst=10)');
      assert.strictEqual(ipBlocked.length, 4, 'Kalan 4 istek sahte XFF sol IP rotasyonuna rağmen ip_burst_limit_reached almalıdır');
    } finally {
      await closeIndependentPgConnections(ipConns);
    }

    // C. E-posta Günlük Limit=3 ve Aynı Gün Duplicate Engeli (phone="")
    const cSingle = await embeddedPg.getPgClient('postgres', '127.0.0.1');
    await cSingle.connect();
    try {
      await cSingle.query("SET request.headers = '{\"x-real-ip\": \"203.0.113.52\"}'");

      // 1. Randevu
      const r1 = (await cSingle.query(`
        SELECT public.create_public_booking(
          'salon-conc-rl', $1::uuid, $2::uuid, '2027-11-01'::date, '09:00'::time,
          'Email Daily 1', 'email_daily_check@test.com', '', true, false, false,
          'idem_mat7_d1', $3::uuid, NULL, NULL
        ) AS res;
      `, [serviceConcId, staffConc1Id, branchConcId])).rows[0].res;
      assert.strictEqual(r1.success, true);

      // 2. Randevu (Aynı gün aynı hizmet) -> duplicate_booking_same_day
      const rDup = (await cSingle.query(`
        SELECT public.create_public_booking(
          'salon-conc-rl', $1::uuid, $2::uuid, '2027-11-01'::date, '11:00'::time,
          'Email Daily Dup', 'email_daily_check@test.com', '', true, false, false,
          'idem_mat7_ddup', $3::uuid, NULL, NULL
        ) AS res;
      `, [serviceConcId, staffConc2Id, branchConcId])).rows[0].res;
      assert.strictEqual(rDup.success, false);
      assert.strictEqual(rDup.reason_code, 'duplicate_booking_same_day');

      // 2. Geçerli Randevu (Aynı gün farklı hizmet)
      const extraSrv2 = (await db.query(`
        INSERT INTO public.services (tenant_id, name, duration_minutes, active)
        VALUES ($1, 'Ekstra MAT7', 30, true) RETURNING id;
      `, [tenantConcId])).rows[0].id;
      const r2 = (await cSingle.query(`
        SELECT public.create_public_booking(
          'salon-conc-rl', $1::uuid, $2::uuid, '2027-11-01'::date, '12:00'::time,
          'Email Daily 2', 'email_daily_check@test.com', '', true, false, false,
          'idem_mat7_d2', $3::uuid, NULL, NULL
        ) AS res;
      `, [extraSrv2, staffConc1Id, branchConcId])).rows[0].res;
      assert.strictEqual(r2.success, true);

      // 3. Geçerli Randevu (Aynı gün 3. hizmet)
      const extraSrv3 = (await db.query(`
        INSERT INTO public.services (tenant_id, name, duration_minutes, active)
        VALUES ($1, 'Ekstra MAT7 3', 30, true) RETURNING id;
      `, [tenantConcId])).rows[0].id;
      const r3 = (await cSingle.query(`
        SELECT public.create_public_booking(
          'salon-conc-rl', $1::uuid, $2::uuid, '2027-11-01'::date, '14:00'::time,
          'Email Daily 3', 'email_daily_check@test.com', '', true, false, false,
          'idem_mat7_d3', $3::uuid, NULL, NULL
        ) AS res;
      `, [extraSrv3, staffConc2Id, branchConcId])).rows[0].res;
      assert.strictEqual(r3.success, true);

      // 4. Randevu (Aynı gün 4. randevu) -> daily_appointment_limit_reached
      const extraSrv4 = (await db.query(`
        INSERT INTO public.services (tenant_id, name, duration_minutes, active)
        VALUES ($1, 'Ekstra MAT7 4', 30, true) RETURNING id;
      `, [tenantConcId])).rows[0].id;
      const r4 = (await cSingle.query(`
        SELECT public.create_public_booking(
          'salon-conc-rl', $1::uuid, $2::uuid, '2027-11-01'::date, '16:00'::time,
          'Email Daily 4', 'email_daily_check@test.com', '', true, false, false,
          'idem_mat7_d4', $3::uuid, NULL, NULL
        ) AS res;
      `, [extraSrv4, staffConc1Id, branchConcId])).rows[0].res;
      assert.strictEqual(r4.success, false);
      assert.strictEqual(r4.reason_code, 'rate_limit_exceeded');
      assert.strictEqual(r4.detail, 'daily_appointment_limit_reached');
    } finally {
      await cSingle.end().catch(() => {});
    }
  });

  await runAsyncTest('3.22. [MAT-08] PG (phone="", fp=geçerli): Email Burst=5 ve Günlük=3 (Başlıksız / TCP Client)', async () => {
    const db = await getDisposablePgEngine();

    // İstemci telefon vermiyor, HTTP başlığı yok ama geçerli bir client_fingerprint sağlıyor
    const fpTest = 'fp_valid_no_phone_mat8';
    const emailTest = 'sybil_fp_mat8@test.com';

    // 1. Aynı e-posta ile 6 istek: ilk 5'i geçmeli, 6.'sı email_burst_limit_reached almalı
    const burstOuts = [];
    for (let i = 0; i < 6; i++) {
      const dateStr = `2027-12-${String(10 + i).padStart(2, '0')}`;
      const q = await db.query(`
        SELECT public.create_public_booking(
          'salon-conc-rl', $1::uuid, $2::uuid, $3::date, '10:00'::time,
          $4, $5, '', true, false, false,
          $6, $7::uuid, NULL, $8
        ) AS res;
      `, [
        serviceConcId,
        staffConc1Id,
        dateStr,
        `FP NoPhone ${i}`,
        emailTest,
        `idem_mat8_burst_${i}`,
        branchConcId,
        fpTest,
      ]);
      burstOuts.push(q.rows[0].res);
    }

    const oks = burstOuts.filter(r => r.success === true);
    const blocked = burstOuts.filter(
      r => r.success === false && r.reason_code === 'rate_limit_exceeded' && r.detail === 'email_burst_limit_reached'
    );
    assert.strictEqual(oks.length, 5, 'Geçerli fingerprint varken de aynı e-posta burst=5 sınırına uymalıdır');
    assert.strictEqual(blocked.length, 1, '6. istek email_burst_limit_reached almalıdır');

    // 2. [FINDING-ADIM010-012] Aynı geçerli fingerprint ve phone="" yolunda:
    // (a) 3 başarılı farklı-hizmet randevusu (aynı gün)
    // (c) Aynı gün aynı hizmet için duplicate engeli
    // (b) 4. istekte günlük limit reddi (daily_appointment_limit_reached)
    // (d) Aynı e-posta/fingerprint ile Tenant B üzerinde bağımsız başarı (tenant izolasyonu)
    const emailDaily = 'daily_fp_mat8@test.com';
    const targetDate = '2027-10-25';

    // 4 farklı hizmet oluştur
    const srvMat8_1 = (await db.query(`INSERT INTO public.services (tenant_id, name, duration_minutes, active) VALUES ($1, 'MAT8 Hizmet 1', 30, true) RETURNING id`, [tenantConcId])).rows[0].id;
    const srvMat8_2 = (await db.query(`INSERT INTO public.services (tenant_id, name, duration_minutes, active) VALUES ($1, 'MAT8 Hizmet 2', 30, true) RETURNING id`, [tenantConcId])).rows[0].id;
    const srvMat8_3 = (await db.query(`INSERT INTO public.services (tenant_id, name, duration_minutes, active) VALUES ($1, 'MAT8 Hizmet 3', 30, true) RETURNING id`, [tenantConcId])).rows[0].id;
    const srvMat8_4 = (await db.query(`INSERT INTO public.services (tenant_id, name, duration_minutes, active) VALUES ($1, 'MAT8 Hizmet 4', 30, true) RETURNING id`, [tenantConcId])).rows[0].id;

    // (a).1: 1. Randevu (Hizmet 1)
    const rD1 = (await db.query(`
      SELECT public.create_public_booking(
        'salon-conc-rl', $1::uuid, $2::uuid, $3::date, '09:00'::time,
        'MAT8 Daily 1', $4, '', true, false, false,
        'idem_mat8_d1', $5::uuid, NULL, $6
      ) AS res;
    `, [srvMat8_1, staffConc1Id, targetDate, emailDaily, branchConcId, fpTest])).rows[0].res;
    assert.strictEqual(rD1.success, true, '1. farklı-hizmet randevusu başarılı olmalıdır');
    assert.strictEqual(rD1.reason_code, 'ok');
    assert(rD1.appointment_id, '1. randevu id dönmelidir');

    // (c): Aynı gün aynı hizmet (Hizmet 1) için duplicate engeli
    const rDup = (await db.query(`
      SELECT public.create_public_booking(
        'salon-conc-rl', $1::uuid, $2::uuid, $3::date, '10:00'::time,
        'MAT8 Daily Dup', $4, '', true, false, false,
        'idem_mat8_dup', $5::uuid, NULL, $6
      ) AS res;
    `, [srvMat8_1, staffConc2Id, targetDate, emailDaily, branchConcId, fpTest])).rows[0].res;
    assert.strictEqual(rDup.success, false, 'Aynı gün aynı hizmet duplicate randevu reddedilmelidir');
    assert.strictEqual(rDup.reason_code, 'duplicate_booking_same_day', 'Duplicate hata kodu duplicate_booking_same_day olmalıdır');

    // (a).2: 2. Randevu (Hizmet 2)
    const rD2 = (await db.query(`
      SELECT public.create_public_booking(
        'salon-conc-rl', $1::uuid, $2::uuid, $3::date, '11:00'::time,
        'MAT8 Daily 2', $4, '', true, false, false,
        'idem_mat8_d2', $5::uuid, NULL, $6
      ) AS res;
    `, [srvMat8_2, staffConc1Id, targetDate, emailDaily, branchConcId, fpTest])).rows[0].res;
    assert.strictEqual(rD2.success, true, '2. farklı-hizmet randevusu başarılı olmalıdır');
    assert.strictEqual(rD2.reason_code, 'ok');
    assert(rD2.appointment_id, '2. randevu id dönmelidir');

    // (a).3: 3. Randevu (Hizmet 3)
    const rD3 = (await db.query(`
      SELECT public.create_public_booking(
        'salon-conc-rl', $1::uuid, $2::uuid, $3::date, '13:00'::time,
        'MAT8 Daily 3', $4, '', true, false, false,
        'idem_mat8_d3', $5::uuid, NULL, $6
      ) AS res;
    `, [srvMat8_3, staffConc2Id, targetDate, emailDaily, branchConcId, fpTest])).rows[0].res;
    assert.strictEqual(rD3.success, true, '3. farklı-hizmet randevusu başarılı olmalıdır');
    assert.strictEqual(rD3.reason_code, 'ok');
    assert(rD3.appointment_id, '3. randevu id dönmelidir');

    // (b): 4. istekte günlük limit reddi (daily_appointment_limit_reached)
    const rD4 = (await db.query(`
      SELECT public.create_public_booking(
        'salon-conc-rl', $1::uuid, $2::uuid, $3::date, '15:00'::time,
        'MAT8 Daily 4 Blocked', $4, '', true, false, false,
        'idem_mat8_d4_blocked', $5::uuid, NULL, $6
      ) AS res;
    `, [srvMat8_4, staffConc1Id, targetDate, emailDaily, branchConcId, fpTest])).rows[0].res;
    assert.strictEqual(rD4.success, false, '4. randevu günlük limit nedeniyle engellenmelidir');
    assert.strictEqual(rD4.reason_code, 'rate_limit_exceeded');
    assert.strictEqual(rD4.detail, 'daily_appointment_limit_reached', 'Günlük limit aşım detayı daily_appointment_limit_reached olmalıdır');

    // (d): Aynı e-posta/fingerprint ile Tenant B üzerinde bağımsız başarı (tenant izolasyonu)
    const bInfo = (await db.query(`
      SELECT
        (SELECT id FROM public.branches WHERE tenant_id = $1 AND is_primary = true LIMIT 1) AS branch_id,
        (SELECT id FROM public.services WHERE tenant_id = $1 AND active = true LIMIT 1) AS service_id,
        (SELECT id FROM public.staff WHERE tenant_id = $1 AND active = true LIMIT 1) AS staff_id
    `, [tenantBId])).rows[0];

    const rTenantB = (await db.query(`
      SELECT public.create_public_booking(
        'salon-beta', $1::uuid, $2::uuid, $3::date, '14:00'::time,
        'MAT8 Tenant B Customer', $4, '', true, false, false,
        'idem_mat8_tenant_b_iso', $5::uuid, NULL, $6
      ) AS res;
    `, [bInfo.service_id, bInfo.staff_id, targetDate, emailDaily, bInfo.branch_id, fpTest])).rows[0].res;
    assert.strictEqual(rTenantB.success, true, 'Tenant B de aynı e-posta/fingerprint bağımsız randevu alabilmelidir');
    assert.strictEqual(rTenantB.reason_code, 'ok');
    assert(rTenantB.appointment_id, 'Tenant B randevu id dönmelidir');

    // DB seviyesi kanıt: Tenant A da tam 3, Tenant B de tam 1 randevu kalıcılaşmış olmalı
    const apptsA = await db.query(`
      SELECT count(*) FROM public.appointments
      WHERE tenant_id = $1 AND lower(trim(user_email)) = $2 AND appointment_date = $3::date AND status = 'confirmed'
    `, [tenantConcId, emailDaily, targetDate]);
    assert.strictEqual(parseInt(apptsA.rows[0].count, 10), 3, 'Tenant A da tam 3 randevu kalıcılaşmış olmalıdır');

    const apptsB = await db.query(`
      SELECT count(*) FROM public.appointments
      WHERE tenant_id = $1 AND lower(trim(user_email)) = $2 AND appointment_date = $3::date AND status = 'confirmed'
    `, [tenantBId, emailDaily, targetDate]);
    assert.strictEqual(parseInt(apptsB.rows[0].count, 10), 1, 'Tenant B de tam 1 randevu kalıcılaşmış olmalıdır');
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

  await runAsyncTest('4.2. [GERÇEK CHROMIUM FAIL-CLOSED] Kripto yokken requestOtp ve verifyOtp reject etmez, temporary_failure döner ve durum/sayac değişmez', async () => {
    const noCryptoRes = await page.evaluate(async () => {
      const { publicBookingOtpService } = await import('/services/publicBookingOtpService.ts');
      publicBookingOtpService.clearSyntheticHarness();

      // WebCrypto etkinken bekleyen (pending) bir challenge oluştur
      const setupReq = await publicBookingOtpService.requestOtp({
        slug: 'salon-browser-nocrypto',
        phone: '+90 555 717 6263',
        syntheticOtp: '369258',
      });
      const pendingAuditBefore = publicBookingOtpService.getSyntheticChallengeAudit(setupReq.challengeId);

      const origDesc = Object.getOwnPropertyDescriptor(window, 'crypto');
      Object.defineProperty(window, 'crypto', { value: undefined, configurable: true });
      try {
        const hasNodeProcess = typeof process !== 'undefined' && Boolean(process?.versions?.node);
        const reqRes = await publicBookingOtpService.requestOtp({
          slug: 'salon-browser-nocrypto',
          phone: '+90 555 717 6264',
          syntheticOtp: '147258',
        });
        const verRes = await publicBookingOtpService.verifyOtp({
          slug: 'salon-browser-nocrypto',
          challengeId: setupReq.challengeId,
          otpCode: '369258',
          phone: '+90 555 717 6263',
        });
        const pendingAuditAfter = publicBookingOtpService.getSyntheticChallengeAudit(setupReq.challengeId);
        return {
          threw: false,
          hasNodeProcess,
          reqRes,
          verRes,
          pendingAuditBefore,
          pendingAuditAfter,
          outboxCountNewPhone: publicBookingOtpService.getSyntheticOutbox('+90 555 717 6264').length,
        };
      } catch (e) {
        return { threw: true, error: String(e) };
      } finally {
        if (origDesc) Object.defineProperty(window, 'crypto', origDesc);
      }
    });

    assert.strictEqual(noCryptoRes.threw, false, 'Tarayıcıda crypto yokken unhandled rejection olmamalıdır');
    assert.strictEqual(noCryptoRes.hasNodeProcess, false, 'Tarayıcı ortamında Node crypto fallback olmamalıdır');
    assert.strictEqual(noCryptoRes.reqRes.success, false);
    assert.strictEqual(noCryptoRes.reqRes.reasonCode, 'temporary_failure', 'requestOtp temporary_failure dönmelidir');
    assert.strictEqual(noCryptoRes.outboxCountNewPhone, 0, 'Outbox kaydı oluşmamalı');
    assert.strictEqual(noCryptoRes.verRes.success, false);
    assert.strictEqual(noCryptoRes.verRes.reasonCode, 'temporary_failure', 'verifyOtp temporary_failure dönmelidir');
    assert.strictEqual(noCryptoRes.pendingAuditBefore.status, 'pending');
    assert.strictEqual(noCryptoRes.pendingAuditAfter.status, 'pending', 'Kripto hatasında challenge status değişmemelidir');
    assert.strictEqual(noCryptoRes.pendingAuditAfter.attemptsCount, 0, 'Kripto hatasında attemptsCount değişmemelidir');
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
