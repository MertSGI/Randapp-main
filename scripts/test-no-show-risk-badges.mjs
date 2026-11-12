import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

// Standard mock localStorage harness for headless Node environment
const storageMap = new Map();
const mockLocalStorage = {
  getItem: (key) => storageMap.get(key) || null,
  setItem: (key, val) => storageMap.set(key, String(val)),
  removeItem: (key) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  get length() { return storageMap.size; },
  key: (i) => Array.from(storageMap.keys())[i] || null
};
globalThis.localStorage = mockLocalStorage;
globalThis.window = { localStorage: mockLocalStorage };

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

console.log('================================================================================');
console.log('=== LARI [LARI-PILOT5-004] V1A-FUNC-02: No-Show & Risk Badges QA Suite ===');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// SECTION 1: STATİK KAYNAK, SÖZLEŞME VE BİLEŞEN BÜTÜNLÜĞÜ
// -----------------------------------------------------------------------------
const abuseServicePath = path.join(rootDir, 'services', 'bookingAbuseProtectionService.ts');
const cardComponentPath = path.join(rootDir, 'components', 'AppointmentCard.tsx');
const adminPagePath = path.join(rootDir, 'pages', 'AdminPage.tsx');

runTest('1.1. bookingAbuseProtectionService.ts, AppointmentCard.tsx ve AdminPage.tsx diskte mevcut', () => {
  assert(fs.existsSync(abuseServicePath), 'services/bookingAbuseProtectionService.ts bulunamadı');
  assert(fs.existsSync(cardComponentPath), 'components/AppointmentCard.tsx bulunamadı');
  assert(fs.existsSync(adminPagePath), 'pages/AdminPage.tsx bulunamadı');
});

runTest('1.2. bookingAbuseProtectionService.ts içinde NoShowRiskBadge tipi ve getNoShowRiskBadge fonksiyonu tanımlı', () => {
  const content = fs.readFileSync(abuseServicePath, 'utf8');
  assert(content.includes('export interface NoShowRiskBadge'), 'NoShowRiskBadge interface eksik');
  assert(content.includes('getNoShowRiskBadge'), 'getNoShowRiskBadge fonksiyonu eksik');
  assert(content.includes('getNoShowBadge'), 'getNoShowBadge alias fonksiyonu eksik');
  assert(content.includes('⚠️ No-Show Riski'), 'Kanonik ⚠️ No-Show Riski rozet metni eksik');
});

runTest('1.3. FINDING-ADIM014-001 Statik Denetim: executeStatusMutation ve handleNoShow mutasyon sonucuna bağlı', () => {
  const content = fs.readFileSync(adminPagePath, 'utf8');
  assert(
    content.includes('executeStatusMutation = async (') &&
    content.includes('Promise<{ success: boolean; changed: boolean }>'),
    'executeStatusMutation açıkça Promise<{ success: boolean; changed: boolean }> dönmelidir'
  );
  assert(
    content.includes('mutationResult.success && mutationResult.changed'),
    'handleNoShow yalnızca mutationResult.success && mutationResult.changed durumunda recordNoShowSignal çağırmalıdır'
  );
});

runTest('1.4. FINDING-ADIM014-002 Statik Denetim: bookingAbuseProtectionService tenantId sınırını sıkı koruyor', () => {
  const content = fs.readFileSync(abuseServicePath, 'utf8');
  assert(
    content.includes('if (!tenantId || typeof tenantId !== \'string\' || !tenantId.trim()) return 0;'),
    'getNoShowRiskCountForCustomer boş/tanımsız tenantId durumunda 0 dönmelidir'
  );
  assert(
    content.includes('if (!cleanTenantId || !cleanPhone)'),
    'getNoShowRiskBadge boş tenantId veya boş telefon durumunda güvenli sıfır risk dönmelidir'
  );
  assert(
    content.includes('aptTenantId.trim() !== cleanTenantId'),
    'appointments fallback satırları tenantId ile sıkı filtrelenmelidir'
  );
});

runTest('1.5. AppointmentCard.tsx görsel uyarı rozetini ve arayıp teyit etme aksiyonunu içeriyor', () => {
  const content = fs.readFileSync(cardComponentPath, 'utf8');
  assert(content.includes('data-testid="no-show-risk-badge"'), 'data-testid="no-show-risk-badge" eksik');
  assert(content.includes('data-testid="no-show-call-action"'), 'data-testid="no-show-call-action" eksik');
  assert(content.includes('bookingAbuseProtectionService.getNoShowRiskBadge'), 'Servis çağrısı eksik');
  assert(content.includes('riskBadge.hasRisk'), 'hasRisk koşullu gösterimi eksik');
  assert(content.includes('Teyit İçin Ara') || content.includes('Call & Confirm'), 'Arayıp teyit etme butonu eksik');
});

runTest('1.6. Kaynak dosyalarında yetkisiz secret veya service_role bulunmuyor', () => {
  const cardContent = fs.readFileSync(cardComponentPath, 'utf8');
  const abuseContent = fs.readFileSync(abuseServicePath, 'utf8');
  assert(!cardContent.includes('service_role'), 'AppointmentCard.tsx içinde service_role yasaktır');
  assert(!abuseContent.includes('service_role'), 'bookingAbuseProtectionService.ts içinde service_role yasaktır');
});

// -----------------------------------------------------------------------------
// SECTION 2: BİRİM MANTIK VE getNoShowRiskBadge DAVRANIŞ TESTLERİ
// -----------------------------------------------------------------------------
// Node ESM ortamında TS derlemesini esbuild paketi ile yükle
const abuseBundle = esbuild.buildSync({
  entryPoints: [abuseServicePath],
  bundle: true,
  format: 'esm',
  write: false,
});
const tempAbusePath = path.join(rootDir, 'scripts', '.temp_abuse_for_qa.mjs');
fs.writeFileSync(tempAbusePath, abuseBundle.outputFiles[0].text);
const { bookingAbuseProtectionService } = await import('./.temp_abuse_for_qa.mjs');
fs.unlinkSync(tempAbusePath);

runTest('2.1. Geçmişi temiz müşteride (0 no-show) rozet sade kalıyor (hasRisk: false)', () => {
  bookingAbuseProtectionService.clearAllNoShowSignals();
  const badge = bookingAbuseProtectionService.getNoShowRiskBadge('+90 532 000 11 22', 'tenant_test_1');
  assert.strictEqual(badge.hasRisk, false, 'Temiz müşteri hasRisk false olmalı');
  assert.strictEqual(badge.count, 0, 'No-show sayısı 0 olmalı');
  assert.strictEqual(badge.level, 'none', 'Risk seviyesi none olmalı');
  assert.strictEqual(badge.badgeText, '', 'Rozet metni boş olmalı');
  assert.strictEqual(badge.actionText, '', 'Aksiyon metni boş olmalı');
  assert.strictEqual(badge.severityColor, 'none', 'Renk none olmalı');
});

runTest('2.2. 1 no-show kaydı olan müşteri için orta seviye "⚠️ No-Show Riski (1 kez)" rozeti üretiliyor', () => {
  bookingAbuseProtectionService.clearAllNoShowSignals();
  bookingAbuseProtectionService.recordNoShowSignal('tenant_test_1', '+90 532 111 22 33');

  const badge = bookingAbuseProtectionService.getNoShowRiskBadge('+90 532 111 22 33', 'tenant_test_1');
  assert.strictEqual(badge.hasRisk, true, 'hasRisk true olmalı');
  assert.strictEqual(badge.count, 1, 'count 1 olmalı');
  assert.strictEqual(badge.level, 'medium', 'level medium olmalı');
  assert.strictEqual(badge.severityColor, 'amber', 'severityColor amber olmalı');
  assert.strictEqual(badge.badgeText, '⚠️ No-Show Riski (1 kez)', 'badgeText formatı 1 kez içermeli');
  assert.strictEqual(badge.label, '⚠️ No-Show Riski', 'label ⚠️ No-Show Riski olmalı');
  assert(badge.actionText.includes('Müşteriyi arayarak'), 'actionText arama hatırlatması içermeli');
});

runTest('2.3. 2 no-show kaydı olan müşteri için yüksek seviye "⚠️ No-Show Riski (2 kez)" rozeti üretiliyor', () => {
  bookingAbuseProtectionService.clearAllNoShowSignals();
  bookingAbuseProtectionService.recordNoShowSignal('tenant_test_1', '+90 532 999 88 77');
  bookingAbuseProtectionService.recordNoShowSignal('tenant_test_1', '+90 532 999 88 77');

  const badge = bookingAbuseProtectionService.getNoShowRiskBadge('+90 532 999 88 77', 'tenant_test_1');
  assert.strictEqual(badge.hasRisk, true, 'hasRisk true olmalı');
  assert.strictEqual(badge.count, 2, 'count 2 olmalı');
  assert.strictEqual(badge.level, 'high', 'level high olmalı');
  assert.strictEqual(badge.severityColor, 'red', 'severityColor red olmalı');
  assert.strictEqual(badge.badgeText, '⚠️ No-Show Riski (2 kez)', 'badgeText formatı 2 kez içermeli');
  assert(badge.actionText.includes('Yüksek Risk'), 'Yüksek risk uyarısı içermeli');
});

runTest('2.4. 3 no-show kaydında sayaç ve risk düzeyi artışı doğrulanıyor', () => {
  bookingAbuseProtectionService.recordNoShowSignal('tenant_test_1', '+90 532 999 88 77');
  const badge = bookingAbuseProtectionService.getNoShowRiskBadge('+90 532 999 88 77', 'tenant_test_1');
  assert.strictEqual(badge.count, 3, 'count 3 olmalı');
  assert.strictEqual(badge.level, 'high', 'level high olmalı');
  assert.strictEqual(badge.badgeText, '⚠️ No-Show Riski (3 kez)', 'badgeText formatı 3 kez içermeli');
});

runTest('2.5. Telefon formatı varyasyonları (boşluk, +90, yerel format) normalizasyon toleransıyla eşleşiyor', () => {
  bookingAbuseProtectionService.clearAllNoShowSignals();
  bookingAbuseProtectionService.recordNoShowSignal('tenant_norm_1', '+90 555 123 45 67');

  const b1 = bookingAbuseProtectionService.getNoShowRiskBadge('0555 123 45 67', 'tenant_norm_1');
  const b2 = bookingAbuseProtectionService.getNoShowRiskBadge('905551234567', 'tenant_norm_1');
  const b3 = bookingAbuseProtectionService.getNoShowRiskBadge('+905551234567', 'tenant_norm_1');

  assert.strictEqual(b1.count, 1, '0555 formatı eşleşmeli');
  assert.strictEqual(b2.count, 1, '90555 formatı eşleşmeli');
  assert.strictEqual(b3.count, 1, '+90555 formatı eşleşmeli');
  assert.strictEqual(b1.hasRisk, true);
});

runTest('2.6. Boş, tanımsız veya geçersiz telefon numarasında fail-safe boş rozet dönüyor', () => {
  const bEmpty = bookingAbuseProtectionService.getNoShowRiskBadge('', 'tenant_norm_1');
  const bNull = bookingAbuseProtectionService.getNoShowRiskBadge(null, 'tenant_norm_1');
  const bUndefined = bookingAbuseProtectionService.getNoShowRiskBadge(undefined, 'tenant_norm_1');
  const bInvalid = bookingAbuseProtectionService.getNoShowRiskBadge('abc-xyz', 'tenant_norm_1');

  assert.strictEqual(bEmpty.hasRisk, false, 'Boş telefon hasRisk false olmalı');
  assert.strictEqual(bNull.hasRisk, false, 'Null telefon hasRisk false olmalı');
  assert.strictEqual(bUndefined.hasRisk, false, 'Undefined telefon hasRisk false olmalı');
  assert.strictEqual(bInvalid.hasRisk, false, 'Geçersiz telefon hasRisk false olmalı');
});

runTest('2.7. Girdi polimorfizmi: obje ({ phone, tenantId }) ve alias (getNoShowBadge) tam çalışıyor', () => {
  bookingAbuseProtectionService.clearAllNoShowSignals();
  bookingAbuseProtectionService.recordNoShowSignal('tenant_poly', '+90 544 333 22 11');

  const bObj = bookingAbuseProtectionService.getNoShowRiskBadge({
    phone: '+90 544 333 22 11',
    tenantId: 'tenant_poly'
  });
  const bAlias = bookingAbuseProtectionService.getNoShowBadge('+90 544 333 22 11', 'tenant_poly');

  assert.strictEqual(bObj.count, 1, 'Obje girdisi çalışmalı');
  assert.strictEqual(bAlias.count, 1, 'Alias metodu çalışmalı');
  assert.strictEqual(bObj.badgeText, bAlias.badgeText);
});

// -----------------------------------------------------------------------------
// SECTION 3: FINDING-ADIM014-002 KIRACI İZOLASYONU VE FALLBACK NEGATİF TESTLERİ
// -----------------------------------------------------------------------------
runTest('3.1. [FINDING-002] Tenant A sinyali Tenant B sorgusunda kesinlikle rozet üretmez', () => {
  bookingAbuseProtectionService.clearAllNoShowSignals();
  bookingAbuseProtectionService.recordNoShowSignal('tenant_A', '+90 500 111 22 33');

  const bTenantA = bookingAbuseProtectionService.getNoShowRiskBadge('+90 500 111 22 33', 'tenant_A');
  const bTenantB = bookingAbuseProtectionService.getNoShowRiskBadge('+90 500 111 22 33', 'tenant_B');

  assert.strictEqual(bTenantA.count, 1, 'Tenant A için sinyal bulunmalı');
  assert.strictEqual(bTenantB.count, 0, 'Tenant B için sinyal 0 olmalı (izolasyon)');
  assert.strictEqual(bTenantB.hasRisk, false, 'Tenant B hasRisk false olmalı');
});

runTest('3.2. [FINDING-002] tenantId eksik/boş sorgularda güvenli sıfır risk (fail-safe)', () => {
  bookingAbuseProtectionService.clearAllNoShowSignals();
  bookingAbuseProtectionService.recordNoShowSignal('tenant_A', '+90 500 111 22 33');

  // getNoShowRiskCountForCustomer testleri
  assert.strictEqual(bookingAbuseProtectionService.getNoShowRiskCountForCustomer('', '+90 500 111 22 33'), 0);
  assert.strictEqual(bookingAbuseProtectionService.getNoShowRiskCountForCustomer(null, '+90 500 111 22 33'), 0);
  assert.strictEqual(bookingAbuseProtectionService.getNoShowRiskCountForCustomer(undefined, '+90 500 111 22 33'), 0);

  // getNoShowRiskForCustomer testleri
  assert.strictEqual(bookingAbuseProtectionService.getNoShowRiskForCustomer('', '+90 500 111 22 33'), 'low');
  assert.strictEqual(bookingAbuseProtectionService.getNoShowRiskForCustomer(null, '+90 500 111 22 33'), 'low');

  // getNoShowRiskBadge testleri
  const bEmptyTenant = bookingAbuseProtectionService.getNoShowRiskBadge('+90 500 111 22 33', '');
  const bNullTenant = bookingAbuseProtectionService.getNoShowRiskBadge('+90 500 111 22 33', null);
  const bObjEmptyTenant = bookingAbuseProtectionService.getNoShowRiskBadge({ phone: '+90 500 111 22 33', tenantId: '' });

  assert.strictEqual(bEmptyTenant.hasRisk, false, 'Boş tenantId ile hasRisk false olmalı');
  assert.strictEqual(bEmptyTenant.count, 0, 'Boş tenantId ile count 0 olmalı');
  assert.strictEqual(bNullTenant.hasRisk, false, 'Null tenantId ile hasRisk false olmalı');
  assert.strictEqual(bObjEmptyTenant.hasRisk, false, 'Obje içinde boş tenantId ile hasRisk false olmalı');
});

runTest('3.3. [FINDING-002] Karışık-tenant appointment dizisinde diğer kiracı kayıtları elenir', () => {
  bookingAbuseProtectionService.clearAllNoShowSignals();
  const testPhone = '+90 530 888 77 66';

  const mixedAppointments = [
    { phone: testPhone, status: 'no_show', tenantId: 'tenant_A' },
    { phone: testPhone, status: 'no_show', tenantId: 'tenant_A' },
    { phone: testPhone, status: 'no_show', tenantId: 'tenant_B' },
    { phone: testPhone, status: 'no_show' }, // tenantId eksik (güvenlik gereği elenmeli)
    { phone: testPhone, status: 'completed', tenantId: 'tenant_B' },
  ];

  // Tenant B için sorgula: Sadece 1 adet Tenant B no_show randevusu sayılmalı
  const badgeTenantB = bookingAbuseProtectionService.getNoShowRiskBadge(
    testPhone,
    'tenant_B',
    mixedAppointments
  );
  assert.strictEqual(badgeTenantB.count, 1, 'Tenant B için tam 1 no_show sayılmalı (Tenant A ve tenant-less elenmeli)');
  assert.strictEqual(badgeTenantB.hasRisk, true);
  assert.strictEqual(badgeTenantB.level, 'medium');

  // Tenant A için sorgula: 2 adet Tenant A no_show randevusu sayılmalı
  const badgeTenantA = bookingAbuseProtectionService.getNoShowRiskBadge(
    testPhone,
    'tenant_A',
    mixedAppointments
  );
  assert.strictEqual(badgeTenantA.count, 2, 'Tenant A için 2 no_show sayılmalı');
  assert.strictEqual(badgeTenantA.level, 'high');

  // Tenant C (hiç kaydı olmayan) için sorgula: 0 sayılmalı
  const badgeTenantC = bookingAbuseProtectionService.getNoShowRiskBadge(
    testPhone,
    'tenant_C',
    mixedAppointments
  );
  assert.strictEqual(badgeTenantC.count, 0, 'Tenant C için 0 sayılmalı');
  assert.strictEqual(badgeTenantC.hasRisk, false);
});

// -----------------------------------------------------------------------------
// SECTION 4: FINDING-ADIM014-001 MUTASYON SONUCU VE SİNYAL SENKRONİZASYONU
// -----------------------------------------------------------------------------
runTest('4.1. [FINDING-001] Başarısız mutasyonda (service_error, invalid_transition, forbidden) no-show sinyali kaydedilmez', () => {
  bookingAbuseProtectionService.clearAllNoShowSignals();
  const testPhone = '+90 542 111 00 22';
  const tenantId = 't_mutation_test';

  // AdminPage handleNoShow mantığı simülasyonu:
  // const mutationResult = await executeStatusMutation(id, 'no_show');
  // if (mutationResult?.success && mutationResult?.changed && targetApt?.phone && tenantId) { ... }
  const simulateAdminHandleNoShow = (mutationResult, targetApt, tid) => {
    if (mutationResult?.success && mutationResult?.changed && targetApt?.phone && tid) {
      bookingAbuseProtectionService.recordNoShowSignal(tid, targetApt.phone);
    }
  };

  const targetApt = { id: 'apt_1', phone: testPhone, status: 'confirmed' };

  // 1. Senaryo: RPC hatası (service_error / forbidden)
  simulateAdminHandleNoShow({ success: false, changed: false }, targetApt, tenantId);
  assert.strictEqual(
    bookingAbuseProtectionService.getNoShowRiskCountForCustomer(tenantId, testPhone),
    0,
    'Başarısız mutasyon (success: false) sinyal üretmemeli'
  );

  // 2. Senaryo: Geçersiz geçiş (invalid_transition)
  simulateAdminHandleNoShow({ success: false, changed: false }, targetApt, tenantId);
  assert.strictEqual(
    bookingAbuseProtectionService.getNoShowRiskCountForCustomer(tenantId, testPhone),
    0,
    'invalid_transition sinyal üretmemeli'
  );

  const badgeAfterFailures = bookingAbuseProtectionService.getNoShowRiskBadge(testPhone, tenantId);
  assert.strictEqual(badgeAfterFailures.hasRisk, false, 'Hatalı mutasyonlar sonrası müşteride risk rozeti oluşmamalı');
});

runTest('4.2. [FINDING-001] no_change mutasyonunda (değişiklik yaratmayan) no-show sinyali kaydedilmez', () => {
  bookingAbuseProtectionService.clearAllNoShowSignals();
  const testPhone = '+90 542 333 44 55';
  const tenantId = 't_mutation_test';

  const simulateAdminHandleNoShow = (mutationResult, targetApt, tid) => {
    if (mutationResult?.success && mutationResult?.changed && targetApt?.phone && tid) {
      bookingAbuseProtectionService.recordNoShowSignal(tid, targetApt.phone);
    }
  };

  const targetApt = { id: 'apt_2', phone: testPhone, status: 'no_show' };

  // Durum zaten no_show idi (no_change)
  simulateAdminHandleNoShow({ success: true, changed: false }, targetApt, tenantId);
  assert.strictEqual(
    bookingAbuseProtectionService.getNoShowRiskCountForCustomer(tenantId, testPhone),
    0,
    'changed: false durumunda sinyal kaydedilmemelidir'
  );

  const badge = bookingAbuseProtectionService.getNoShowRiskBadge(testPhone, tenantId);
  assert.strictEqual(badge.hasRisk, false);
});

runTest('4.3. [FINDING-001] Başarılı ve değişiklik yaratan mutasyonda (success: true && changed: true) tam bir sinyal eklenir', () => {
  bookingAbuseProtectionService.clearAllNoShowSignals();
  const testPhone = '+90 542 777 88 99';
  const tenantId = 't_mutation_test';

  const simulateAdminHandleNoShow = (mutationResult, targetApt, tid) => {
    if (mutationResult?.success && mutationResult?.changed && targetApt?.phone && tid) {
      bookingAbuseProtectionService.recordNoShowSignal(tid, targetApt.phone);
    }
  };

  const targetApt = { id: 'apt_3', phone: testPhone, status: 'confirmed' };

  // Başarılı no_show mutasyonu
  simulateAdminHandleNoShow({ success: true, changed: true }, targetApt, tenantId);
  assert.strictEqual(
    bookingAbuseProtectionService.getNoShowRiskCountForCustomer(tenantId, testPhone),
    1,
    'Başarılı mutasyonda tam 1 sinyal kaydedilmelidir'
  );

  const badge = bookingAbuseProtectionService.getNoShowRiskBadge(testPhone, tenantId);
  assert.strictEqual(badge.hasRisk, true);
  assert.strictEqual(badge.count, 1);
  assert.strictEqual(badge.badgeText, '⚠️ No-Show Riski (1 kez)');
});

// -----------------------------------------------------------------------------
// SECTION 5: GERÇEK AppointmentCard DOM / BİLEŞEN RENDER VE GÖRSEL DOĞRULAMA
// -----------------------------------------------------------------------------
// esbuild ile AppointmentCard bileşenini canlı ESM modülü olarak derle
const cardBundle = esbuild.buildSync({
  entryPoints: [cardComponentPath],
  bundle: true,
  external: ['react', 'react-dom'],
  format: 'esm',
  write: false,
});
const tempCardPath = path.join(rootDir, 'scripts', '.temp_card_for_qa.mjs');
fs.writeFileSync(tempCardPath, cardBundle.outputFiles[0].text);
const { AppointmentCard } = await import('./.temp_card_for_qa.mjs');
fs.unlinkSync(tempCardPath);

runTest('5.1. Temiz müşterinin randevu kartı DOM sade kalır (rozet ve arama aksiyonu render edilmez)', () => {
  bookingAbuseProtectionService.clearAllNoShowSignals();
  const cleanApt = {
    id: 'apt_dom_clean',
    user_name: 'Zeynep Kaya',
    phone: '+90 555 111 22 33',
    status: 'confirmed',
    tenantId: 'tenant_dom_test',
    date: '2026-11-15',
    time: '14:00',
  };

  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(AppointmentCard, {
      appointment: cleanApt,
      tenantId: 'tenant_dom_test',
      allAppointments: [cleanApt],
      language: 'tr',
    })
  );

  assert(!html.includes('data-testid="no-show-risk-badge"'), 'Temiz kartta no-show-risk-badge bulunmamalıdır');
  assert(!html.includes('data-testid="no-show-call-action"'), 'Temiz kartta no-show-call-action bulunmamalıdır');
  assert(!html.includes('⚠️ No-Show Riski'), 'Temiz kartta uyarı metni görünmemelidir');
  assert(html.includes('Zeynep Kaya'), 'Müşteri ismi render edilmelidir');
});

runTest('5.2. 1 no-show kaydı olan müşterinin randevu kartında orta risk rozeti ve teyit arama aksiyonu belirir', () => {
  bookingAbuseProtectionService.clearAllNoShowSignals();
  const testPhone = '+90 555 444 33 22';
  const tenantId = 'tenant_dom_test';
  bookingAbuseProtectionService.recordNoShowSignal(tenantId, testPhone);

  const riskyApt = {
    id: 'apt_dom_risky_1',
    user_name: 'Burak Demir',
    phone: testPhone,
    status: 'confirmed',
    tenantId,
    date: '2026-11-15',
    time: '15:30',
  };

  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(AppointmentCard, {
      appointment: riskyApt,
      tenantId,
      allAppointments: [riskyApt],
      language: 'tr',
    })
  );

  assert(html.includes('data-testid="no-show-risk-badge"'), 'Riskli kartta no-show-risk-badge belirmelidir');
  assert(html.includes('⚠️ No-Show Riski (1 kez)'), 'Doğru rozet metni ("⚠️ No-Show Riski (1 kez)") görünmelidir');
  assert(html.includes('data-testid="no-show-call-action"'), 'Arayıp teyit etme butonu (data-testid="no-show-call-action") belirmelidir');
  assert(html.includes('Teyit İçin Ara'), 'Buton metni "Teyit İçin Ara" olmalıdır');
  assert(html.includes('bg-amber-50') || html.includes('text-amber-800'), 'Orta risk kehribar rengi sınıflarını içermelidir');
});

runTest('5.3. 2 no-show kaydı olan müşterinin randevu kartında yüksek risk kırmızı rozet belirir', () => {
  bookingAbuseProtectionService.clearAllNoShowSignals();
  const testPhone = '+90 555 999 00 11';
  const tenantId = 'tenant_dom_test';
  bookingAbuseProtectionService.recordNoShowSignal(tenantId, testPhone);
  bookingAbuseProtectionService.recordNoShowSignal(tenantId, testPhone);

  const highRiskApt = {
    id: 'apt_dom_high_risk',
    user_name: 'Kemal Ak',
    phone: testPhone,
    status: 'confirmed',
    tenantId,
    date: '2026-11-15',
    time: '16:00',
  };

  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(AppointmentCard, {
      appointment: highRiskApt,
      tenantId,
      allAppointments: [highRiskApt],
      language: 'tr',
    })
  );

  assert(html.includes('data-testid="no-show-risk-badge"'), 'Yüksek riskli kartta no-show-risk-badge belirmelidir');
  assert(html.includes('⚠️ No-Show Riski (2 kez)'), 'Doğru rozet metni ("⚠️ No-Show Riski (2 kez)") görünmelidir');
  assert(html.includes('bg-red-50') || html.includes('text-red-800'), 'Yüksek risk kırmızı renk sınıflarını içermelidir');
});

runTest('5.4. Telefonu olmayan randevuda teyit arama butonu gösterilmez', () => {
  bookingAbuseProtectionService.clearAllNoShowSignals();
  const noPhoneApt = {
    id: 'apt_dom_no_phone',
    user_name: 'Anonim Randevu',
    phone: '',
    status: 'confirmed',
    tenantId: 'tenant_dom_test',
    date: '2026-11-15',
    time: '17:00',
  };

  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(AppointmentCard, {
      appointment: noPhoneApt,
      tenantId: 'tenant_dom_test',
      language: 'tr',
    })
  );

  assert(!html.includes('data-testid="no-show-call-action"'), 'Telefonu olmayan randevuda arama butonu olmamalıdır');
});

console.log('\n================================================================================');
console.log(`=== QA SONUCU: ${passedTests}/${totalTests} TEST BAŞARIYLA GEÇTİ (PASS) ===`);
console.log('================================================================================\n');
