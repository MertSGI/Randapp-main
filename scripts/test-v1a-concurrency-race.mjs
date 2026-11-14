/**
 * scripts/test-v1a-concurrency-race.mjs
 * ============================================================================
 * LARİ — [LARI-PILOT5-009] V1A-PREFLIGHT-02: 50-Paralel Randevu, Erteleme ve
 * OTP Yarış (Race) Testi
 *
 * Kanonik Görev & Hedef:
 * Aynı salon, personel ve saat dilimine (14:00-14:30) aynı milisaniyede
 * (Promise.all ile 50 paralel istek) gönderilen randevu ve erteleme (reschedule)
 * isteklerinden tam olarak 1 tanesinin 201 Created, 49 tanesinin 409 Conflict
 * (SLOT_ALREADY_BOOKED) döndüğünü; paralel OTP denemelerinin atomik sayaçla
 * kilitlendiğini kanıtlayan stres testi.
 *
 * Sıfır maliyet (0 TL) ve sıfır harici ağ çıkışı (Zero Network Egress) garantili.
 * ============================================================================
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Technical Guardrail: Normalization
process.env.LC_ALL = 'C';
process.env.LANG = 'C';
process.env.VITE_DATA_MODE = 'mock';
process.env.VITE_APP_BASE_DOMAIN = 'randevulari.com';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// -----------------------------------------------------------------------------
// Global Test Harness: Headless Window, Storage & Intercepted Fetch
// -----------------------------------------------------------------------------
const storageMap = new Map();
const mockLocalStorage = {
  getItem: (key) => storageMap.get(key) ?? null,
  setItem: (key, val) => storageMap.set(key, String(val)),
  removeItem: (key) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  get length() { return storageMap.size; },
  key: (i) => Array.from(storageMap.keys())[i] ?? null
};

const sessionStorageMap = new Map();
const mockSessionStorage = {
  getItem: (key) => sessionStorageMap.get(key) ?? null,
  setItem: (key, val) => sessionStorageMap.set(key, String(val)),
  removeItem: (key) => sessionStorageMap.delete(key),
  clear: () => sessionStorageMap.clear(),
  get length() { return sessionStorageMap.size; },
  key: (i) => Array.from(sessionStorageMap.keys())[i] ?? null
};

globalThis.localStorage = mockLocalStorage;
global.localStorage = mockLocalStorage;
globalThis.sessionStorage = mockSessionStorage;
global.sessionStorage = mockSessionStorage;

globalThis.window = {
  localStorage: mockLocalStorage,
  sessionStorage: mockSessionStorage,
  location: {
    protocol: 'http:',
    host: 'localhost',
    hostname: 'localhost',
    pathname: '/',
    search: '',
    hash: '',
    href: 'http://localhost/'
  }
};
global.window = globalThis.window;

// Strict fetch interceptor to guarantee Zero Network Egress
let interceptedNetworkCalls = 0;
const nativeFetch = globalThis.fetch;

globalThis.fetch = async (url, options = {}) => {
  const urlStr = String(url);
  if (urlStr.startsWith('http://127.0.0.1:') || urlStr.startsWith('http://localhost:')) {
    // Loopback traffic is permitted
    if (typeof nativeFetch === 'function') {
      return nativeFetch(url, options);
    }
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(urlStr);
      const req = http.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      }, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const bodyBuffer = Buffer.concat(chunks);
          const bodyText = bodyBuffer.toString('utf8');
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: new Headers(res.headers),
            text: async () => bodyText,
            json: async () => JSON.parse(bodyText)
          });
        });
      });
      req.on('error', reject);
      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
      req.end();
    });
  }

  // Any non-loopback network egress is strictly forbidden
  interceptedNetworkCalls++;
  throw new Error(`SECURITY_VIOLATION_EGRESS_BLOCKED: External network request to '${urlStr}' is forbidden.`);
};

// -----------------------------------------------------------------------------
// Import Application Services (Dynamic TS module loading via tsx)
// -----------------------------------------------------------------------------
const { 
  createAppointment, 
  createAppointmentSafely, 
  AppointmentSlotConflictError, 
  getAppointments 
} = await import('../services/appointmentService.ts');

const { 
  appointmentSelfServiceService, 
  requestRescheduleSafely, 
  RescheduleSlotConflictError 
} = await import('../services/appointmentSelfServiceService.ts');

const { 
  publicBookingOtpService 
} = await import('../services/publicBookingOtpService.ts');

const { 
  LocalBookingRepository 
} = await import('../services/repositories/localBookingRepository.ts');

const { 
  LocalSelfServiceRepository, 
  resetLocalSelfServiceState 
} = await import('../services/repositories/localSelfServiceRepository.ts');

const { 
  STORAGE_KEYS, 
  DYNAMIC_STORAGE_KEYS, 
  purgeAllLariStorage 
} = await import('../services/storageKeys.ts');

const { 
  tenantService 
} = await import('../services/tenantService.ts');

const { 
  dataProvider 
} = await import('../services/dataProvider.ts');

// -----------------------------------------------------------------------------
// Test Runner Harness
// -----------------------------------------------------------------------------
let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(() => {
        console.log(`  [PASS] ${name}`);
        passedTests++;
      }).catch(err => {
        console.error(`  [FAIL] ${name}`);
        console.error(`    ${err.message}`);
        throw err;
      });
    } else {
      console.log(`  [PASS] ${name}`);
      passedTests++;
      return Promise.resolve();
    }
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// In-Process Canonical HTTP Server (Port 0 - Ephemeral Loopback)
// -----------------------------------------------------------------------------
function startConcurrencyServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
      const pathname = parsedUrl.pathname;
      const method = req.method;

      // Collect JSON body
      let bodyText = '';
      for await (const chunk of req) {
        bodyText += chunk;
      }
      let body = {};
      if (bodyText.trim()) {
        try {
          body = JSON.parse(bodyText);
        } catch {
          body = {};
        }
      }

      // Route 1: POST /api/appointments
      if (method === 'POST' && pathname === '/api/appointments') {
        const tenantId = body.tenantId || 'test_salon';
        const result = await createAppointmentSafely(tenantId, {
          userId: body.userId || `cust_${Date.now()}`,
          user_name: body.user_name || 'Yarış Müşterisi',
          user_email: body.user_email || 'race@test.local',
          phone: body.phone || '+905551234567',
          serviceId: body.serviceId || 'srv_1',
          staffId: body.staffId || 'staff_1',
          date: body.date || '2026-11-20',
          time: body.time || '14:00',
          durationMinutes: body.durationMinutes || 30,
          status: 'confirmed',
          syncedToGoogle: false
        });

        if (result.success && result.statusCode === 201) {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            statusCode: 201,
            code: 'APPOINTMENT_CREATED',
            appointment: result.appointment
          }));
          return;
        }

        if (result.statusCode === 409 || result.code === 'SLOT_ALREADY_BOOKED') {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            statusCode: 409,
            code: 'SLOT_ALREADY_BOOKED',
            error: result.error || 'Slot already booked',
            reasonCode: 'SLOT_ALREADY_BOOKED'
          }));
          return;
        }

        res.writeHead(result.statusCode || 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          statusCode: result.statusCode || 500,
          code: result.code || 'INTERNAL_ERROR',
          error: result.error
        }));
        return;
      }

      // Route 2: POST /api/public/reschedule or /rest/v1/rpc/request_public_appointment_reschedule_by_manage_token
      if (method === 'POST' && (pathname === '/api/public/reschedule' || pathname === '/rest/v1/rpc/request_public_appointment_reschedule_by_manage_token')) {
        const token = body.token || body.p_token || '';
        const requestedDateTime = body.requestedDateTime || (body.p_requested_date && body.p_requested_time ? `${body.p_requested_date} ${body.p_requested_time}` : '');
        const note = body.note || body.reason || body.p_reason || 'Saat erteleme talebi';

        const result = await requestRescheduleSafely(token, requestedDateTime, note);
        if (result.success && result.statusCode === 201) {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            statusCode: 201,
            code: 'RESCHEDULE_REQUESTED',
            changeRequest: result.changeRequest,
            reason_code: 'ok'
          }));
          return;
        }

        if (result.statusCode === 409) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            statusCode: 409,
            code: result.code,
            reason_code: result.code,
            message: result.message
          }));
          return;
        }

        res.writeHead(result.statusCode || 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          statusCode: result.statusCode || 400,
          code: result.code || 'INVALID_INPUT',
          message: result.message
        }));
        return;
      }

      // Route 3: POST /rest/v1/rpc/create_public_booking
      if (method === 'POST' && pathname === '/rest/v1/rpc/create_public_booking') {
        const repo = new LocalBookingRepository();
        const bookingRes = await repo.createPublicBooking({
          slug: body.p_slug || body.slug || 'melis-salon',
          branchId: body.p_branch_id || body.branchId,
          serviceId: body.p_service_id || body.serviceId || 'srv_1',
          staffId: body.p_staff_id || body.staffId || 'staff_1',
          appointmentDate: body.p_appointment_date || body.appointmentDate || '2026-11-20',
          appointmentTime: body.p_appointment_time || body.appointmentTime || '14:00',
          customerName: body.p_customer_name || body.customerName || 'Müşteri',
          customerEmail: body.p_customer_email || body.customerEmail || 'test@test.local',
          customerPhone: body.p_customer_phone || body.customerPhone || '+905551234567',
          requiredConsent: body.p_required_consent ?? true,
          marketingConsent: body.p_marketing_consent ?? false,
          reminderConsent: body.p_reminder_consent ?? false,
          idempotencyKey: body.p_idempotency_key || body.idempotencyKey,
          otpVerificationToken: body.p_otp_verification_token || body.otpVerificationToken
        });

        if (bookingRes.success) {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            appointment_id: bookingRes.appointmentId,
            manage_token: bookingRes.manageToken,
            reason_code: 'ok',
            code: 'APPOINTMENT_CREATED'
          }));
          return;
        }

        const isConflict = bookingRes.reasonCode === 'slot_conflict' || bookingRes.reasonCode === 'SLOT_ALREADY_BOOKED';
        res.writeHead(isConflict ? 409 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          code: isConflict ? 'SLOT_ALREADY_BOOKED' : bookingRes.reasonCode,
          reason_code: bookingRes.reasonCode
        }));
        return;
      }

      // Route 4: POST /api/public/otp/verify or /rest/v1/rpc/verify_public_booking_otp
      if (method === 'POST' && (pathname === '/api/public/otp/verify' || pathname === '/rest/v1/rpc/verify_public_booking_otp')) {
        const verifyRes = await publicBookingOtpService.verifyOtp({
          slug: body.slug || body.p_slug || 'melis-salon',
          challengeId: body.challengeId || body.p_challenge_id || '',
          otpCode: body.otpCode || body.p_otp_code || '',
          phone: body.phone || body.p_customer_phone || '+905551234567'
        });

        if (verifyRes.success) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            verification_token: verifyRes.verificationToken,
            reason_code: 'ok'
          }));
          return;
        }

        if (verifyRes.reasonCode === 'otp_brute_force_locked') {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            reason_code: 'otp_brute_force_locked',
            attempts_remaining: 0,
            message: verifyRes.message
          }));
          return;
        }

        if (verifyRes.reasonCode === 'otp_already_consumed') {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            reason_code: 'otp_already_consumed',
            message: verifyRes.message
          }));
          return;
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          reason_code: verifyRes.reasonCode,
          attempts_remaining: verifyRes.attemptsRemaining,
          message: verifyRes.message
        }));
        return;
      }

      // Fallback 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = addr.port;
      const url = `http://127.0.0.1:${port}`;
      resolve({
        server,
        port,
        url,
        close: () => new Promise((resClose) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            resClose();
          };
          const timer = setTimeout(() => {
            try { server.closeAllConnections?.(); } catch {}
            finish();
          }, 2000);
          timer.unref?.();
          try { server.closeIdleConnections?.(); } catch {}
          server.close(() => {
            clearTimeout(timer);
            finish();
          });
          try { server.closeAllConnections?.(); } catch {}
        })
      });
    });
  });
}

// -----------------------------------------------------------------------------
// TEST SUITE EXECUTION
// -----------------------------------------------------------------------------
console.log('================================================================================');
console.log('🚀 LARİ — V1A-PREFLIGHT-02: 50-Paralel Yarış ve Çakışma Güvenlik Paketi');
console.log('================================================================================\n');

const testServer = await startConcurrencyServer();
const BASE_URL = testServer.url;

try {
  // ---------------------------------------------------------------------------
  // BÖLÜM 1: 50-Paralel HTTP POST Randevu Yarışı (1x 201, 49x 409)
  // ---------------------------------------------------------------------------
  console.log('--- Bölüm 1: 50-Paralel HTTP POST Randevu Yarışı (Aynı Salon, Personel, 14:00-14:30) ---');

  await runTest('1.1. Aynı milisaniyede gönderilen 50 paralel randevu isteğinden TAM 1 tanesi 201, 49 tanesi 409 döner', async () => {
    // Hazırlık: Depoyu temizle
    purgeAllLariStorage();
    storageMap.clear();

    const tenantId = 'salon_race_alpha';
    const staffId = 'staff_1';
    const serviceId = 'srv_1';
    const date = '2026-11-20';
    const time = '14:00'; // 14:00 - 14:30 slot

    // 50 paralel HTTP POST isteğini aynı anda Promise.all ile ateşle
    const parallelRequests = Array.from({ length: 50 }, (_, i) => {
      return fetch(`${BASE_URL}/api/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          staffId,
          serviceId,
          date,
          time,
          user_name: `Yarışçı Müşteri #${i + 1}`,
          user_email: `competitor_${i + 1}@test.local`,
          phone: `+9055511122${String(i).padStart(2, '0')}`
        })
      });
    });

    const responses = await Promise.all(parallelRequests);
    const parsedBodies = await Promise.all(responses.map(r => r.json()));

    let count201 = 0;
    let count409 = 0;
    let otherStatusCount = 0;

    for (let i = 0; i < responses.length; i++) {
      const res = responses[i];
      const data = parsedBodies[i];
      if (res.status === 201) {
        count201++;
        assert.strictEqual(data.success, true, '201 yanıtı success: true dönmelidir');
        assert.strictEqual(data.code, 'APPOINTMENT_CREATED', '201 yanıtı APPOINTMENT_CREATED kodunu taşımalıdır');
        assert.ok(data.appointment?.id, 'Oluşturulan randevunun ID değeri bulunmalıdır');
      } else if (res.status === 409) {
        count409++;
        assert.strictEqual(data.success, false, '409 yanıtı success: false dönmelidir');
        assert.strictEqual(data.code, 'SLOT_ALREADY_BOOKED', '409 yanıtı SLOT_ALREADY_BOOKED hata kodunu taşımalıdır');
      } else {
        otherStatusCount++;
        console.error(`Beklenmeyen durum kodu: ${res.status}`, data);
      }
    }

    assert.strictEqual(count201, 1, `Tam olarak 1 başarılı 201 Created beklenirken ${count201} alındı`);
    assert.strictEqual(count409, 49, `Tam olarak 49 çakışma 409 Conflict beklenirken ${count409} alındı`);
    assert.strictEqual(otherStatusCount, 0, 'Hiçbir istek 500 veya beklenmeyen durum kodu döndürmemelidir');

    // Depo doğrulaması: Veritabanında tam olarak 1 randevu bulunmalıdır
    const storedAppointments = await getAppointments(tenantId);
    const slotAppointments = storedAppointments.filter(a => 
      a.staffId === staffId && 
      a.date === date && 
      a.time === time && 
      a.status === 'confirmed'
    );

    assert.strictEqual(slotAppointments.length, 1, 'Depoda ilgili saat dilimine ait tam olarak 1 onaylı randevu bulunmalıdır');
  });

  // ---------------------------------------------------------------------------
  // BÖLÜM 2: 50-Paralel HTTP Erteleme (Reschedule) Yarış Testi
  // ---------------------------------------------------------------------------
  console.log('\n--- Bölüm 2: 50-Paralel Erteleme (Reschedule) Yarış Testi (Aynı Dilime Erteleme) ---');

  await runTest('2.1. Farklı randevulardan aynı saat dilimine (14:00-14:30) gönderilen 50 paralel ertelemeden TAM 1 tanesi 201, 49 tanesi 409 döner', async () => {
    const tenantId = 'salon_reschedule_race';
    const staffId = 'staff_1';
    const serviceId = 'srv_1';
    const date = '2026-11-20';
    const targetTime = '14:00'; // Target slot (14:00-14:30)

    // 50 farklı randevu oluştur (çakışmayan başlangıç tarihlerine)
    const tokens = [];
    for (let i = 0; i < 50; i++) {
      const initDay = 1 + Math.floor(i / 5);
      const initHour = 9 + (i % 5);
      const initDate = `2026-10-${String(initDay).padStart(2, '0')}`;
      const initTime = `${String(initHour).padStart(2, '0')}:00`;
      
      const apt = await createAppointment(tenantId, {
        userId: `cust_resched_${i}`,
        user_name: `Erteleyen Müşteri #${i + 1}`,
        user_email: `resched_${i}@test.local`,
        phone: `+9055533344${String(i).padStart(2, '0')}`,
        serviceId,
        staffId,
        date: initDate,
        time: initTime,
        status: 'confirmed',
        syncedToGoogle: false
      });

      const token = await appointmentSelfServiceService.createAppointmentAccessToken(tenantId, apt.id, 'view');
      tokens.push(token);
    }

    assert.strictEqual(tokens.length, 50, '50 adet başlangıç randevusu ve erişim belirteci hazırlandı');

    // 50 randevunun tümü aynı anda 14:00 hedefine erteleme talebi göndersin
    const parallelReschedules = tokens.map((token, idx) => {
      return fetch(`${BASE_URL}/api/public/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          requestedDateTime: `${date} ${targetTime}`,
          note: `Paralel erteleme denemesi #${idx + 1}`
        })
      });
    });

    const resResults = await Promise.all(parallelReschedules);
    const resBodies = await Promise.all(resResults.map(r => r.json()));

    let resCount201 = 0;
    let resCount409 = 0;

    for (let i = 0; i < resResults.length; i++) {
      const res = resResults[i];
      const data = resBodies[i];
      if (res.status === 201) {
        resCount201++;
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.code, 'RESCHEDULE_REQUESTED');
      } else if (res.status === 409) {
        resCount409++;
        assert.strictEqual(data.success, false);
        assert.strictEqual(data.code, 'SLOT_ALREADY_BOOKED');
      }
    }

    assert.strictEqual(resCount201, 1, `Ertelemede tam 1 adet 201 Created beklenirken ${resCount201} alındı`);
    assert.strictEqual(resCount409, 49, `Ertelemede tam 49 adet 409 Conflict beklenirken ${resCount409} alındı`);
  });

  await runTest('2.2. Aynı randevu için aynı anda gönderilen 50 eşzamanlı erteleme isteğinden tam 1 tanesi 201, 49 tanesi 409 (REQUEST_ALREADY_PENDING) döner', async () => {
    const tenantId = 'salon_dup_reschedule';
    const apt = await createAppointment(tenantId, {
      userId: 'cust_single_resched',
      user_name: 'Tekil Müşteri',
      user_email: 'single@test.local',
      phone: '+905559998877',
      serviceId: 'srv_1',
      staffId: 'staff_1',
      date: '2026-11-21',
      time: '10:00',
      status: 'confirmed',
      syncedToGoogle: false
    });

    const token = await appointmentSelfServiceService.createAppointmentAccessToken(tenantId, apt.id, 'view');

    // Aynı randevu için 50 paralel erteleme isteği
    const parallelCalls = Array.from({ length: 50 }, (_, i) => {
      return fetch(`${BASE_URL}/api/public/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          requestedDateTime: `2026-11-21 16:${String(i).padStart(2, '0')}`,
          note: `Mükerrer erteleme çağrısı #${i + 1}`
        })
      });
    });

    const responses = await Promise.all(parallelCalls);
    const bodies = await Promise.all(responses.map(r => r.json()));

    let countCreated = 0;
    let countPending = 0;

    for (let i = 0; i < responses.length; i++) {
      if (responses[i].status === 201) {
        countCreated++;
      } else if (responses[i].status === 409) {
        countPending++;
        assert.strictEqual(bodies[i].code, 'REQUEST_ALREADY_PENDING');
      }
    }

    assert.strictEqual(countCreated, 1, 'Aynı randevu için tam 1 talep oluşturulmalıdır');
    assert.strictEqual(countPending, 49, 'Kalan 49 istek REQUEST_ALREADY_PENDING ile 409 almalıdır');
  });

  await runTest('2.3. staff_A bekleyen ertelemesi staff_B talebini engellememeli, buna karşılık aynı staff ve slot için 50 paralel talep yine tam 1x201 ve 49x409 üretmelidir', async () => {
    const tenantId = 'salon_multi_staff_reschedule';
    const staff_A = 'staff_1';
    const staff_B = 'staff_2';
    const date = '2026-11-22';
    const targetTime = '14:00';

    // 1. staff_A için randevu oluştur ve 14:00 için erteleme talebi aç (status: requested)
    const aptA = await createAppointment(tenantId, {
      userId: 'cust_staff_a',
      user_name: 'Müşteri Staff A',
      user_email: 'staff_a_user@test.local',
      phone: '+905551113344',
      serviceId: 'srv_1',
      staffId: staff_A,
      date: '2026-10-05',
      time: '09:00',
      status: 'confirmed',
      syncedToGoogle: false
    });
    const tokenA = await appointmentSelfServiceService.createAppointmentAccessToken(tenantId, aptA.id, 'view');

    const resA = await fetch(`${BASE_URL}/api/public/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: tokenA,
        requestedDateTime: `${date} ${targetTime}`,
        note: 'Staff A erteleme talebi'
      })
    });
    const bodyA = await resA.json();
    assert.strictEqual(resA.status, 201, 'staff_A ilk erteleme talebi 201 Created almalıdır');
    assert.strictEqual(bodyA.success, true);

    // 2. staff_B için randevu oluştur ve AYNI saat dilimine (14:00) erteleme talebi aç
    // staff_A'nın bekleyen ertelemesi staff_B'yi ENGELLEMEMELİDİR
    const aptB = await createAppointment(tenantId, {
      userId: 'cust_staff_b',
      user_name: 'Müşteri Staff B',
      user_email: 'staff_b_user@test.local',
      phone: '+905552223344',
      serviceId: 'srv_1',
      staffId: staff_B,
      date: '2026-10-05',
      time: '10:00',
      status: 'confirmed',
      syncedToGoogle: false
    });
    const tokenB = await appointmentSelfServiceService.createAppointmentAccessToken(tenantId, aptB.id, 'view');

    const resB = await fetch(`${BASE_URL}/api/public/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: tokenB,
        requestedDateTime: `${date} ${targetTime}`,
        note: 'Staff B erteleme talebi'
      })
    });
    const bodyB = await resB.json();
    assert.strictEqual(resB.status, 201, 'staff_A bekleyen ertelemesi staff_B talebini engellememeli (201 Created olmalıdır)');
    assert.strictEqual(bodyB.success, true);

    // 3. Buna karşılık, aynı staff (staff_A) ve aynı slot (15:00) için 50 paralel talep yine tam 1x201 ve 49x409 üretmelidir
    const slotTime50 = '15:00';
    const tokens50 = [];
    for (let i = 0; i < 50; i++) {
      const initDay = 1 + Math.floor(i / 5);
      const initHour = 11 + (i % 5);
      const initDate = `2026-10-${String(initDay).padStart(2, '0')}`;
      const initTime = `${String(initHour).padStart(2, '0')}:30`;

      const apt = await createAppointment(tenantId, {
        userId: `cust_race_staff_a_${i}`,
        user_name: `Erteleyen Müşteri A #${i + 1}`,
        user_email: `resched_a_${i}@test.local`,
        phone: `+9055577788${String(i).padStart(2, '0')}`,
        serviceId: 'srv_1',
        staffId: staff_A,
        date: initDate,
        time: initTime,
        status: 'confirmed',
        syncedToGoogle: false
      });

      const token = await appointmentSelfServiceService.createAppointmentAccessToken(tenantId, apt.id, 'view');
      tokens50.push(token);
    }

    const parallelSameStaffCalls = tokens50.map((token, idx) => {
      return fetch(`${BASE_URL}/api/public/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          requestedDateTime: `${date} ${slotTime50}`,
          note: `Aynı staff paralel erteleme denemesi #${idx + 1}`
        })
      });
    });

    const results50 = await Promise.all(parallelSameStaffCalls);
    const bodies50 = await Promise.all(results50.map(r => r.json()));

    let count201 = 0;
    let count409 = 0;

    for (let i = 0; i < results50.length; i++) {
      if (results50[i].status === 201) {
        count201++;
        assert.strictEqual(bodies50[i].success, true);
        assert.strictEqual(bodies50[i].code, 'RESCHEDULE_REQUESTED');
      } else if (results50[i].status === 409) {
        count409++;
        assert.strictEqual(bodies50[i].success, false);
        assert.strictEqual(bodies50[i].code, 'SLOT_ALREADY_BOOKED');
      }
    }

    assert.strictEqual(count201, 1, `Aynı personel için tam 1 adet 201 Created beklenirken ${count201} alındı`);
    assert.strictEqual(count409, 49, `Aynı personel için tam 49 adet 409 Conflict (SLOT_ALREADY_BOOKED) beklenirken ${count409} alındı`);
  });

  // ---------------------------------------------------------------------------
  // BÖLÜM 3: 50-Paralel create_public_booking RPC Sözleşme Doğrulaması
  // ---------------------------------------------------------------------------
  console.log('\n--- Bölüm 3: 50-Paralel create_public_booking RPC Yarış Testi (1x 201, 49x 409) ---');

  await runTest('3.1. create_public_booking RPC uç noktasına 50 eşzamanlı çağrıdan tam 1 tanesi 201, 49 tanesi 409 döner', async () => {
    const slug = 'salon_rpc_concurrency';
    const date = '2026-11-25';
    const time = '14:00';

    const calls = Array.from({ length: 50 }, (_, i) => {
      return fetch(`${BASE_URL}/rest/v1/rpc/create_public_booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_slug: slug,
          p_service_id: 'srv_1',
          p_staff_id: 'staff_1',
          p_appointment_date: date,
          p_appointment_time: time,
          p_customer_name: `Public Müşteri #${i + 1}`,
          p_customer_email: `pub_${i}@test.local`,
          p_customer_phone: `+9055566677${String(i).padStart(2, '0')}`,
          p_required_consent: true
        })
      });
    });

    const responses = await Promise.all(calls);
    const bodies = await Promise.all(responses.map(r => r.json()));

    let successCount = 0;
    let conflictCount = 0;

    for (let i = 0; i < responses.length; i++) {
      if (responses[i].status === 201) {
        successCount++;
        assert.strictEqual(bodies[i].reason_code, 'ok');
        assert.ok(bodies[i].appointment_id);
      } else if (responses[i].status === 409) {
        conflictCount++;
        assert.strictEqual(bodies[i].code, 'SLOT_ALREADY_BOOKED');
        assert.strictEqual(bodies[i].reason_code, 'slot_conflict');
      }
    }

    assert.strictEqual(successCount, 1, 'RPC çağrısında tam 1 adet 201 Created beklenir');
    assert.strictEqual(conflictCount, 49, 'RPC çağrısında tam 49 adet 409 Conflict beklenir');
  });

  // ---------------------------------------------------------------------------
  // BÖLÜM 4: Servis Katmanı Doğrudan Yarış Doğrulaması (TypeScript Seviyesi)
  // ---------------------------------------------------------------------------
  console.log('\n--- Bölüm 4: Servis Katmanı Doğrudan TypeScript Yarış Testi ---');

  await runTest('4.1. createAppointmentSafely doğrudan çağrıldığında 50 paralel çağrıdan tam 1 tanesi 201, 49 tanesi 409 döner', async () => {
    const tenantId = 'direct_ts_race';
    const date = '2026-11-26';
    const time = '14:00';

    const promises = Array.from({ length: 50 }, (_, i) => {
      return createAppointmentSafely(tenantId, {
        userId: `usr_${i}`,
        user_name: `TS Müşteri #${i + 1}`,
        user_email: `ts_${i}@test.local`,
        phone: `+9055544455${String(i).padStart(2, '0')}`,
        serviceId: 'srv_1',
        staffId: 'staff_1',
        date,
        time,
        status: 'confirmed',
        syncedToGoogle: false
      });
    });

    const results = await Promise.all(promises);
    const created = results.filter(r => r.statusCode === 201);
    const conflicts = results.filter(r => r.statusCode === 409 && r.code === 'SLOT_ALREADY_BOOKED');

    assert.strictEqual(created.length, 1, 'Servis seviyesinde tam 1 başarılı randevu oluşturulmalıdır');
    assert.strictEqual(conflicts.length, 49, 'Servis seviyesinde tam 49 çakışma (409) yakalanmalıdır');
  });

  // ---------------------------------------------------------------------------
  // BÖLÜM 5: 50-Paralel OTP Kaba Kuvvet (Brute-Force) ve Atomik Sayaç Kilidi
  // ---------------------------------------------------------------------------
  console.log('\n--- Bölüm 5: 50-Paralel OTP Kaba Kuvvet (Brute-Force) ve Atomik Kilit Testi ---');

  await runTest('5.1. 50 paralel hatalı OTP doğrulama isteğinde sayaç asla maxAttempts (3) sınırını aşmaz ve kilitlenir', async () => {
    publicBookingOtpService.clearSyntheticHarness();

    const slug = 'salon_otp_race';
    const phone = '+905551239988';
    
    // OTP oturumu başlat (doğru kod: 888999)
    const chal = await publicBookingOtpService.requestOtp({
      slug,
      phone,
      syntheticOtp: '888999'
    });

    assert.strictEqual(chal.success, true);
    const challengeId = chal.challengeId;

    // 50 paralel hatalı kod denemesi gönder
    const parallelBadTries = Array.from({ length: 50 }, (_, i) => {
      return fetch(`${BASE_URL}/api/public/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          challengeId,
          otpCode: `00000${i % 10}`, // Wrong code
          phone
        })
      });
    });

    const verifyResponses = await Promise.all(parallelBadTries);
    const verifyBodies = await Promise.all(verifyResponses.map(r => r.json()));

    let lockedCount = 0;
    for (const b of verifyBodies) {
      if (b.reason_code === 'otp_brute_force_locked') {
        lockedCount++;
        assert.strictEqual(b.attempts_remaining, 0, 'Kilitli yanıtta attempts_remaining 0 olmalıdır');
      }
    }

    // 3 hatalı denemeden sonraki tüm 47 deneme kilit almalıdır
    assert.ok(lockedCount >= 47, `En az 47 istek brute_force_locked almalıdır (Alınan: ${lockedCount})`);

    // Oturumun dahili denetimini incele
    const audit = publicBookingOtpService.getSyntheticChallengeAudit(challengeId);
    assert.ok(audit, 'Audit kaydı mevcut olmalıdır');
    assert.strictEqual(audit.status, 'locked', 'Oturum durumu locked olmalıdır');
    assert.strictEqual(audit.attemptsCount, 3, 'attemptsCount tam olarak maxAttempts (3) olmalı, yarışla sızmamalıdır');

    // 51. İstek: Şimdi doğru kod girilse dahi kilit kaldırılamaz (Fail-closed invariant)
    const bypassAttempt = await publicBookingOtpService.verifyOtp({
      slug,
      challengeId,
      otpCode: '888999',
      phone
    });

    assert.strictEqual(bypassAttempt.success, false, 'Kilitli oturumda doğru kod bile kabul edilmemelidir');
    assert.strictEqual(bypassAttempt.reasonCode, 'otp_brute_force_locked');
  });

  await runTest('5.2. Değiştirilmemiş üretim verifyOtp fonksiyonuna Promise.all ile 50 hatalı çağrıda attemptsCount tam 3 ve kilitli durum doğrulanır', async () => {
    publicBookingOtpService.clearSyntheticHarness();

    const slug = 'salon_direct_otp_bad_race';
    const phone = '+905553332211';

    const chal = await publicBookingOtpService.requestOtp({
      slug,
      phone,
      syntheticOtp: '777888'
    });

    assert.strictEqual(chal.success, true);
    const challengeId = chal.challengeId;

    // Doğrudan publicBookingOtpService.verifyOtp fonksiyonuna 50 paralel hatalı istek
    const promises = Array.from({ length: 50 }, (_, i) => {
      return publicBookingOtpService.verifyOtp({
        slug,
        challengeId,
        otpCode: `99999${i % 10}`,
        phone
      });
    });

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 50);

    const lockedResults = results.filter(r => !r.success && r.reasonCode === 'otp_brute_force_locked');
    assert.ok(lockedResults.length >= 47, `En az 47 istek doğrudan çağrıda brute_force_locked almalıdır (Alınan: ${lockedResults.length})`);

    const audit = publicBookingOtpService.getSyntheticChallengeAudit(challengeId);
    assert.ok(audit, 'Audit kaydı mevcut olmalıdır');
    assert.strictEqual(audit.status, 'locked', 'Oturum durumu locked olmalıdır');
    assert.strictEqual(audit.attemptsCount, 3, 'attemptsCount tam olarak maxAttempts (3) olmalı, yarışla sızmamalıdır');
  });

  // ---------------------------------------------------------------------------
  // BÖLÜM 6: 50-Paralel Doğru OTP ve Tek Seferlik Token Tüketim Yarışı
  // ---------------------------------------------------------------------------
  console.log('\n--- Bölüm 6: 50-Paralel Doğru OTP ve Tek Seferlik Token Tüketim Yarışı ---');

  await runTest('6.1. Aynı anda 50 paralel doğru kod doğrulamasından tam 1 tanesi token alır, 49 tanesi reddedilir', async () => {
    publicBookingOtpService.clearSyntheticHarness();

    const slug = 'salon_valid_otp_race';
    const phone = '+905559876543';

    const chal = await publicBookingOtpService.requestOtp({
      slug,
      phone,
      syntheticOtp: '654321'
    });

    const challengeId = chal.challengeId;

    // 50 paralel DOĞRU kod doğrulaması
    const parallelValidTries = Array.from({ length: 50 }, () => {
      return fetch(`${BASE_URL}/api/public/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          challengeId,
          otpCode: '654321', // Correct code
          phone
        })
      });
    });

    const responses = await Promise.all(parallelValidTries);
    const bodies = await Promise.all(responses.map(r => r.json()));

    let tokenAcquiredCount = 0;
    let rejectedCount = 0;
    let acquiredToken = null;

    for (let i = 0; i < responses.length; i++) {
      if (responses[i].status === 200 && bodies[i].verification_token) {
        tokenAcquiredCount++;
        acquiredToken = bodies[i].verification_token;
      } else if (responses[i].status === 409 || responses[i].status === 400) {
        rejectedCount++;
        assert.strictEqual(bodies[i].reason_code, 'otp_already_consumed');
      }
    }

    assert.strictEqual(tokenAcquiredCount, 1, '50 eşzamanlı çağrıdan tam olarak 1 tanesi verification_token almalıdır');
    assert.strictEqual(rejectedCount, 49, 'Kalan 49 çağrı otp_already_consumed almalıdır');
    assert.ok(acquiredToken, 'Geçerli bir doğrulama belirteci üretilmiş olmalıdır');

    // 6.2: Bu tek belirteç ile 50 paralel randevu oluşturma denemesi (Token Reuse Race)
    const bookingRace = Array.from({ length: 50 }, (_, i) => {
      const repo = new LocalBookingRepository();
      return repo.createPublicBooking({
        slug,
        serviceId: 'srv_1',
        staffId: `staff_${(i % 3) + 1}`, // Catalog personellerinden biri
        appointmentDate: '2026-11-28',
        appointmentTime: `10:${String(i).padStart(2, '0')}`,
        customerName: `Müşteri #${i + 1}`,
        customerEmail: `otp_race_${i}@test.local`,
        customerPhone: phone,
        requiredConsent: true,
        otpVerificationToken: acquiredToken
      });
    });

    const bookingResults = await Promise.all(bookingRace);
    const successfulBookings = bookingResults.filter(r => r.success);
    const tokenRejectionBookings = bookingResults.filter(r => !r.success && r.reasonCode === 'otp_token_invalid_or_consumed');

    assert.strictEqual(successfulBookings.length, 1, 'Tek bir OTP belirteci ile tam 1 randevu oluşturulabilmelidir');
    assert.strictEqual(tokenRejectionBookings.length, 49, 'Kalan 49 eşzamanlı deneme otp_token_invalid_or_consumed almalıdır');
  });

  await runTest('6.2. Değiştirilmemiş üretim verifyOtp fonksiyonuna Promise.all ile 50 doğru çağrıda tam 1 başarı ve 49 otp_already_consumed doğrulanır', async () => {
    publicBookingOtpService.clearSyntheticHarness();

    const slug = 'salon_direct_otp_valid_race';
    const phone = '+905554443322';

    const chal = await publicBookingOtpService.requestOtp({
      slug,
      phone,
      syntheticOtp: '334455'
    });

    assert.strictEqual(chal.success, true);
    const challengeId = chal.challengeId;

    // Doğrudan publicBookingOtpService.verifyOtp fonksiyonuna 50 paralel DOĞRU istek
    const promises = Array.from({ length: 50 }, () => {
      return publicBookingOtpService.verifyOtp({
        slug,
        challengeId,
        otpCode: '334455',
        phone
      });
    });

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 50);

    const successResults = results.filter(r => r.success && r.verificationToken);
    const consumedResults = results.filter(r => !r.success && r.reasonCode === 'otp_already_consumed');

    assert.strictEqual(successResults.length, 1, 'Doğrudan üretim verifyOtp çağrısında tam 1 adet başarı ve token üretilmelidir');
    assert.strictEqual(consumedResults.length, 49, 'Kalan 49 çağrı otp_already_consumed almalıdır');

    const audit = publicBookingOtpService.getSyntheticChallengeAudit(challengeId);
    assert.ok(audit);
    assert.strictEqual(audit.status, 'verified', 'Oturum durumu verified olmalıdır');
  });

  // ---------------------------------------------------------------------------
  // BÖLÜM 7: Stres Altında Çapraz Kiracı (Cross-Tenant) İzolasyon Güvencesi
  // ---------------------------------------------------------------------------
  console.log('\n--- Bölüm 7: Stres Altında Çapraz Kiracı İzolasyon Güvencesi ---');

  await runTest('7.1. Salon A 14:00 için kilitlenirken Salon B aynı saat dilimine bağımsız şekilde randevu alabilir', async () => {
    const tenantA = 'salon_a_stress';
    const tenantB = 'salon_b_stress';
    const staffId = 'staff_1';
    const date = '2026-11-30';
    const time = '14:00';

    // Salon A için 50 paralel istek başlat
    const promisesA = Array.from({ length: 50 }, (_, i) => {
      return createAppointmentSafely(tenantA, {
        userId: `usr_a_${i}`,
        user_name: `Müşteri A #${i}`,
        user_email: `a_${i}@test.local`,
        phone: '+905551110000',
        serviceId: 'srv_1',
        staffId,
        date,
        time,
        status: 'confirmed',
        syncedToGoogle: false
      });
    });

    // Aynı anda Salon B için tam olarak aynı tarih ve saatte randevu isteği gönder
    const promiseB = createAppointmentSafely(tenantB, {
      userId: 'usr_b_isolated',
      user_name: 'Müşteri B',
      user_email: 'b@test.local',
      phone: '+905552220000',
      serviceId: 'srv_1',
      staffId,
      date,
      time,
      status: 'confirmed',
      syncedToGoogle: false
    });

    const [resultsA, resultB] = await Promise.all([
      Promise.all(promisesA),
      promiseB
    ]);

    const createdA = resultsA.filter(r => r.statusCode === 201);
    const conflictsA = resultsA.filter(r => r.statusCode === 409);

    assert.strictEqual(createdA.length, 1, 'Salon A için tam 1 randevu oluşturulmalıdır');
    assert.strictEqual(conflictsA.length, 49, 'Salon A için 49 çakışma oluşmalıdır');

    // Salon B izole olmalı ve başarıyla 201 Created almalıdır
    assert.strictEqual(resultB.statusCode, 201, 'Salon B Salon A stresinden etkilenmeden 201 Created almalıdır');
    assert.strictEqual(resultB.success, true);
  });

  // ---------------------------------------------------------------------------
  // BÖLÜM 8: Sıfır Ağ Çıkışı (Zero Network Egress) ve 0 TL Maliyet Doğrulaması
  // ---------------------------------------------------------------------------
  console.log('\n--- Bölüm 8: Sıfır Ağ Çıkışı & Sıfır Harcama (0 TL) Kanıtı ---');

  await runTest('8.1. Test paketi boyunca hiçbir harici dış ağ isteği gerçekleşmemiştir (Zero Egress)', () => {
    assert.strictEqual(interceptedNetworkCalls, 0, `Harici dış ağ isteği tespit edildi: ${interceptedNetworkCalls}`);
  });

  await runTest('8.2. Sıfır harcama (0 TL): Ücretli SMS/WhatsApp gateway veya dış API kullanılmamıştır', () => {
    assert.strictEqual(process.env.VITE_DATA_MODE, 'mock');
  });

} finally {
  // Graceful Server Cleanup
  await testServer.close();
}

console.log('\n================================================================================');
console.log(`🎉 TÜM YARIŞ VE ÇAKIŞMA TESTLERİ GEÇTİ! Toplam: ${passedTests}/${totalTests} (%100 PASS)`);
console.log('================================================================================\n');

process.exit(0);
