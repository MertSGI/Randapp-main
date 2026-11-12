import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

runTest('1.3. AppointmentCard.tsx görsel uyarı rozetini ve arayıp teyit etme aksiyonunu içeriyor', () => {
  const content = fs.readFileSync(cardComponentPath, 'utf8');
  assert(content.includes('data-testid="no-show-risk-badge"'), 'data-testid="no-show-risk-badge" eksik');
  assert(content.includes('data-testid="no-show-call-action"'), 'data-testid="no-show-call-action" eksik');
  assert(content.includes('bookingAbuseProtectionService.getNoShowRiskBadge'), 'Servis çağrısı eksik');
  assert(content.includes('riskBadge.hasRisk'), 'hasRisk koşullu gösterimi eksik');
  assert(content.includes('Teyit İçin Ara') || content.includes('Call & Confirm'), 'Arayıp teyit etme butonu eksik');
});

runTest('1.4. AdminPage.tsx AppointmentCard bileşenini ve no-show sinyali kaydını entegre ediyor', () => {
  const content = fs.readFileSync(adminPagePath, 'utf8');
  assert(content.includes("import AppointmentCard from '../components/AppointmentCard'"), 'AppointmentCard import eksik');
  assert(content.includes('<AppointmentCard'), 'AppointmentCard JSX kullanımı eksik');
  assert(content.includes('bookingAbuseProtectionService.recordNoShowSignal'), 'Admin no-show mutation sinyal kaydı eksik');
  assert(content.includes('handleCallConfirm'), 'Admin çağrı onay işleyicisi eksik');
});

runTest('1.5. Kaynak dosyalarında yetkisiz secret veya service_role bulunmuyor', () => {
  const cardContent = fs.readFileSync(cardComponentPath, 'utf8');
  const abuseContent = fs.readFileSync(abuseServicePath, 'utf8');
  assert(!cardContent.includes('service_role'), 'AppointmentCard.tsx içinde service_role yasaktır');
  assert(!abuseContent.includes('service_role'), 'bookingAbuseProtectionService.ts içinde service_role yasaktır');
});

// -----------------------------------------------------------------------------
// SECTION 2: BİRİM MANTIK VE getNoShowRiskBadge DAVRANIŞ TESTLERİ
// -----------------------------------------------------------------------------
const { bookingAbuseProtectionService } = await import('../services/bookingAbuseProtectionService.ts');

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

runTest('2.3. 2 veya daha fazla no-show kaydı olan müşteri için yüksek seviye "⚠️ No-Show Riski (N kez)" rozeti üretiliyor', () => {
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

  // Farklı formatlarda sorgula
  const b1 = bookingAbuseProtectionService.getNoShowRiskBadge('0555 123 45 67', 'tenant_norm_1');
  const b2 = bookingAbuseProtectionService.getNoShowRiskBadge('5551234567', 'tenant_norm_1');
  const b3 = bookingAbuseProtectionService.getNoShowRiskBadge('+905551234567', 'tenant_norm_1');

  assert.strictEqual(b1.count, 1, '0555 formatı eşleşmeli');
  assert.strictEqual(b2.count, 1, '555 formatı eşleşmeli');
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

runTest('2.8. Kiracı izolasyonu: tenantId belirtildiğinde sinyaller kiracıya göre filtrelenir', () => {
  bookingAbuseProtectionService.clearAllNoShowSignals();
  bookingAbuseProtectionService.recordNoShowSignal('tenant_A', '+90 500 111 22 33');

  const bTenantA = bookingAbuseProtectionService.getNoShowRiskBadge('+90 500 111 22 33', 'tenant_A');
  const bTenantB = bookingAbuseProtectionService.getNoShowRiskBadge('+90 500 111 22 33', 'tenant_B');

  assert.strictEqual(bTenantA.count, 1, 'Tenant A için sinyal bulunmalı');
  assert.strictEqual(bTenantB.count, 0, 'Tenant B için sinyal 0 olmalı (izolasyon)');
  assert.strictEqual(bTenantB.hasRisk, false);
});

runTest('2.9. Önceden veritabanında no_show durumundaki randevular fallback olarak rozete yansır', () => {
  bookingAbuseProtectionService.clearAllNoShowSignals();
  const mockAppointments = [
    { phone: '+90 530 111 22 33', status: 'no_show' },
    { phone: '+90 530 111 22 33', status: 'completed' },
    { phone: '+90 530 111 22 33', status: 'confirmed' }
  ];

  const badge = bookingAbuseProtectionService.getNoShowRiskBadge(
    '+90 530 111 22 33',
    'tenant_fallback',
    mockAppointments
  );

  assert.strictEqual(badge.hasRisk, true, 'Randevu geçmişindeki no_show dikkate alınmalı');
  assert.strictEqual(badge.count, 1);
  assert.strictEqual(badge.badgeText, '⚠️ No-Show Riski (1 kez)');
});

// -----------------------------------------------------------------------------
// SECTION 3: BİLEŞEN SÖZLEŞMESİ VE GÖRSEL TASARIM KURALLARI (AppointmentCard)
// -----------------------------------------------------------------------------
runTest('3.1. AppointmentCard TypeScript derleme arayüzü ve prop sözleşmesi tam uyumlu', () => {
  const cardSrc = fs.readFileSync(cardComponentPath, 'utf8');
  assert(cardSrc.includes('export interface AppointmentCardProps'), 'AppointmentCardProps export edilmeli');
  assert(cardSrc.includes('appointment: Appointment'), 'appointment propu zorunlu');
  assert(cardSrc.includes('onCallConfirm?:'), 'onCallConfirm opsiyonel propu mevcut');
  assert(cardSrc.includes('allAppointments?:'), 'allAppointments opsiyonel propu mevcut');
});

runTest('3.2. AppointmentCard sade tasarım kuralı: 0 no-show durumunda rozet ve arama butonu DOM oluşturmaz', () => {
  const cardSrc = fs.readFileSync(cardComponentPath, 'utf8');
  // hasRisk kontrolü altında data-testid="no-show-risk-badge" ve data-testid="no-show-call-action" olmalıdır
  assert(cardSrc.includes('{riskBadge.hasRisk && ('), 'hasRisk koruması şart');
  assert(cardSrc.includes('{riskBadge.hasRisk && appointment.phone && ('), 'Arama butonu yalnızca riskli ve telefonlu randevularda açılmalı');
});

runTest('3.3. AppointmentCard risk durumunda sarı/kırmızı renk hiyerarşisi uyguluyor', () => {
  const cardSrc = fs.readFileSync(cardComponentPath, 'utf8');
  assert(cardSrc.includes("riskBadge.level === 'high'"), 'Yüksek risk dalı olmalı');
  assert(cardSrc.includes('bg-red-50') || cardSrc.includes('text-red-800'), 'Kırmızı renk sınıfları bulunmalı');
  assert(cardSrc.includes('bg-amber-50') || cardSrc.includes('text-amber-800'), 'Kehribar/sarı renk sınıfları bulunmalı');
});

// -----------------------------------------------------------------------------
// SECTION 4: UÇTAN UCA NO-SHOW İŞ AKIŞI VE SİNYAL SENKRONİZASYONU
// -----------------------------------------------------------------------------
runTest('4.1. Admin "Gelmedi" (No Show) aksiyonu sinyal üretir ve sonraki randevuda rozeti tetikler', () => {
  bookingAbuseProtectionService.clearAllNoShowSignals();
  const testPhone = '+90 533 777 66 55';
  const tenantId = 't_e2e_noshow';

  // 1. İlk başta müşteri temiz
  const initialBadge = bookingAbuseProtectionService.getNoShowRiskBadge(testPhone, tenantId);
  assert.strictEqual(initialBadge.hasRisk, false);

  // 2. Salon personeli / sahibi "Gelmedi" işaretledi (AdminPage.tsx handleNoShow mantığı)
  bookingAbuseProtectionService.recordNoShowSignal(tenantId, testPhone);

  // 3. Bir sonraki randevuda rozet hemen belirmeli
  const updatedBadge = bookingAbuseProtectionService.getNoShowRiskBadge(testPhone, tenantId);
  assert.strictEqual(updatedBadge.hasRisk, true);
  assert.strictEqual(updatedBadge.count, 1);
  assert.strictEqual(updatedBadge.badgeText, '⚠️ No-Show Riski (1 kez)');
  assert(updatedBadge.actionText.includes('Müşteriyi arayarak'));
});

runTest('4.2. "Tamamlandı" veya "İptal" aksiyonları no-show sinyali üretmez', () => {
  bookingAbuseProtectionService.clearAllNoShowSignals();
  const testPhone = '+90 533 111 00 99';
  const tenantId = 't_e2e_clean';

  // Tamamlanan ve iptal randevular
  const badge = bookingAbuseProtectionService.getNoShowRiskBadge(testPhone, tenantId);
  assert.strictEqual(badge.hasRisk, false);
  assert.strictEqual(badge.count, 0);
});

console.log('\n================================================================================');
console.log(`=== QA SONUCU: ${passedTests}/${totalTests} TEST BAŞARIYLA GEÇTİ (PASS) ===`);
console.log('================================================================================\n');
