import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const REGISTRATION_PATH = path.resolve(ROOT_DIR, 'pages', 'RegistrationPage.tsx');
const SELF_SERVICE_PATH = path.resolve(ROOT_DIR, 'pages', 'AppointmentSelfServicePage.tsx');
const BOOKING_PATH = path.resolve(ROOT_DIR, 'pages', 'BookingPage.tsx');

// Environment setup helper for Node test runner
function setTestEnv(envObj) {
  globalThis.import = { meta: { env: envObj } };
  for (const [k, v] of Object.entries(envObj)) {
    if (v === undefined || v === '') delete process.env[k];
    else process.env[k] = v;
  }
}

function setSupabaseMode() {
  setTestEnv({
    VITE_DATA_MODE: 'supabase_staging',
    VITE_SUPABASE_URL: 'https://fake-staging.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'fake-anon-key-for-test'
  });
}

function setLocalMode() {
  setTestEnv({
    VITE_DATA_MODE: 'local',
    VITE_SUPABASE_URL: '',
    VITE_SUPABASE_ANON_KEY: ''
  });
}

setLocalMode();

// Dynamic imports for runtime fail-closed verifications
const { policyAcceptanceService } = await import('../services/policyAcceptanceService.ts');
const { consentLedgerService } = await import('../services/consentLedgerService.ts');
const { dataRightsRequestService } = await import('../services/dataRightsRequestService.ts');

test('1. RegistrationPage: Integrates policyAcceptanceService and recordPolicyAcceptance', () => {
  const code = fs.readFileSync(REGISTRATION_PATH, 'utf8');
  assert.ok(code.includes('policyAcceptanceService'), 'RegistrationPage must import and reference policyAcceptanceService');
  assert.ok(code.includes('recordPolicyAcceptance'), 'RegistrationPage must call recordPolicyAcceptance');
});

test('2. RegistrationPage: Integrates consentLedgerService and recordConsent', () => {
  const code = fs.readFileSync(REGISTRATION_PATH, 'utf8');
  assert.ok(code.includes('consentLedgerService'), 'RegistrationPage must import and reference consentLedgerService');
  assert.ok(code.includes('recordConsent'), 'RegistrationPage must call recordConsent');
});

test('3. RegistrationPage: Formally binds terms_of_service and privacy_policy document types', () => {
  const code = fs.readFileSync(REGISTRATION_PATH, 'utf8');
  assert.ok(code.includes("'terms_of_service'"), 'RegistrationPage must reference terms_of_service');
  assert.ok(code.includes("'privacy_policy'"), 'RegistrationPage must reference privacy_policy');
});

test('4. RegistrationPage: Visibly displays pending server attestation in persistent mode', () => {
  const code = fs.readFileSync(REGISTRATION_PATH, 'utf8');
  assert.ok(
    code.includes('LEGAL_ACCEPTANCE_RECORD_PENDING') && code.includes('SERVER_LEGAL_WRITE_NOT_READY'),
    'RegistrationPage must visibly indicate pending server attestation tokens'
  );
  assert.ok(code.includes('isPersistentMode'), 'RegistrationPage must resolve persistent mode state');
});

test('5. RegistrationPage: Retains idempotent tenant provisioning without rolling back tenant on legal record omission', () => {
  const code = fs.readFileSync(REGISTRATION_PATH, 'utf8');
  assert.ok(
    code.includes('Retain idempotent tenant provisioning without rolling back tenant on legal record omission'),
    'RegistrationPage must explicitly document and enforce tenant provisioning preservation'
  );
  // Ensure legal recording error does not trigger setSubmissionState('PROVISIONING_FAILED_TERMINAL')
  assert.ok(!code.includes("catch (legalErr) {\n          setSubmissionState('PROVISIONING_FAILED_TERMINAL')"), 'Legal record error must not fail tenant provisioning');
});

test('6. AppointmentSelfServicePage: Renders literal header "Kişisel Verilerin Korunması"', () => {
  const code = fs.readFileSync(SELF_SERVICE_PATH, 'utf8');
  assert.ok(
    code.includes('Kişisel Verilerin Korunması'),
    'AppointmentSelfServicePage must contain literal Turkish header "Kişisel Verilerin Korunması"'
  );
});

test('7. AppointmentSelfServicePage: Exposes "Talep Türü" with deletion, export, correction, and consent_withdrawal', () => {
  const code = fs.readFileSync(SELF_SERVICE_PATH, 'utf8');
  assert.ok(code.includes('Talep Türü'), 'Must have Talep Türü selector label');
  assert.ok(code.includes('deletion'), 'Must support deletion request type');
  assert.ok(code.includes('export'), 'Must support export request type');
  assert.ok(code.includes('correction'), 'Must support correction request type');
  assert.ok(code.includes('consent_withdrawal'), 'Must support consent_withdrawal request type');
});

test('8. AppointmentSelfServicePage: Integrates dataRightsRequestService.createDataRightsRequest', () => {
  const code = fs.readFileSync(SELF_SERVICE_PATH, 'utf8');
  assert.ok(code.includes('dataRightsRequestService'), 'Must import dataRightsRequestService');
  assert.ok(code.includes('createDataRightsRequest'), 'Must invoke createDataRightsRequest');
});

test('9. AppointmentSelfServicePage: Displays fail-closed error and retains user description when LEGAL_PERSISTENCE_REQUIRED occurs', () => {
  const code = fs.readFileSync(SELF_SERVICE_PATH, 'utf8');
  assert.ok(code.includes('LEGAL_PERSISTENCE_REQUIRED'), 'Must explicitly guard against LEGAL_PERSISTENCE_REQUIRED');
  assert.ok(code.includes('kvkkError'), 'Must set error state for user feedback');
  // Confirm setKvkkDesc(\'\') is NOT in the catch block (retains user text)
  assert.ok(!code.includes("catch (err: any) {\n      setKvkkDesc('')"), 'Must retain user description on error');
});

test('10. BookingPage: Preserves atomic booking RPC without fake fallback localStorage consent in Supabase mode', () => {
  const code = fs.readFileSync(BOOKING_PATH, 'utf8');
  assert.ok(code.includes('if (!isSupabaseMode)'), 'BookingPage must gate client-side consent writes behind !isSupabaseMode');
  assert.ok(code.includes('policyAcceptanceService'), 'BookingPage must integrate policyAcceptanceService for local mode');
  assert.ok(code.includes('consentLedgerService'), 'BookingPage must integrate consentLedgerService for local mode');
  assert.ok(code.includes('booking_terms'), 'BookingPage must reference booking_terms');
  assert.ok(code.includes('communication_consent_text'), 'BookingPage must reference communication_consent_text');
  assert.ok(code.includes('marketing_consent_text'), 'BookingPage must reference marketing_consent_text');
});

test('11. Security Audit: Customer call sites do not leak forbidden test words', () => {
  const regCode = fs.readFileSync(REGISTRATION_PATH, 'utf8');
  const selfServiceCode = fs.readFileSync(SELF_SERVICE_PATH, 'utf8');
  const bookingCode = fs.readFileSync(BOOKING_PATH, 'utf8');

  for (const [name, code] of [
    ['RegistrationPage', regCode],
    ['AppointmentSelfServicePage', selfServiceCode],
    ['BookingPage', bookingCode]
  ]) {
    assert.ok(!code.includes('dummy'), `${name} contains forbidden word: dummy`);
    assert.ok(!code.includes('mock_legal'), `${name} contains forbidden word: mock_legal`);
    assert.ok(!code.includes('sandbox_data'), `${name} contains forbidden word: sandbox_data`);
  }
});

test('12. Runtime Call Site Contract: Services fail closed in persistent mode when invoked', async () => {
  setSupabaseMode();

  assert.throws(
    () => {
      policyAcceptanceService.recordPolicyAcceptance({
        actorType: 'tenant_owner',
        documentType: 'terms_of_service',
        acceptanceSource: 'registration'
      });
    },
    /LEGAL_PERSISTENCE_REQUIRED/
  );

  assert.throws(
    () => {
      consentLedgerService.recordConsent({
        actorType: 'tenant_owner',
        consentType: 'booking_transactional',
        status: 'granted',
        source: 'registration'
      });
    },
    /LEGAL_PERSISTENCE_REQUIRED/
  );

  assert.throws(
    () => {
      dataRightsRequestService.createDataRightsRequest({
        tenantId: 'tenant-123',
        requesterType: 'customer',
        type: 'export',
        description: 'Customer test request'
      });
    },
    /LEGAL_PERSISTENCE_REQUIRED/
  );
});
