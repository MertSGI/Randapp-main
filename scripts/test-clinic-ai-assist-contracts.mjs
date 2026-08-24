import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('=== RUNNING CLINIC AI ASSIST V1 CONTRACT QA SUITE ===');
console.log('');

// ---------------------------------------------------------------------------
// Load source files
// ---------------------------------------------------------------------------

const loadFile = (relPath) => {
  const fullPath = path.join(process.cwd(), relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Required file missing: ${relPath}`);
  }
  return fs.readFileSync(fullPath, 'utf8');
};

// New AI Assist files
const clinicAiAssistTypes = loadFile('types/clinicAiAssist.ts');
const clinicAiAssistService = loadFile('services/clinicAiAssistService.ts');
const clinicAiAssistPanel = loadFile('components/clinic/ClinicAiAssistPanel.tsx');
const clinicAiAssistProvider = loadFile('supabase/functions/_shared/clinicAiAssistProvider.ts');
const clinicAiTranscribeEdge = loadFile('supabase/functions/clinic-ai-transcribe/index.ts');
const clinicAiDraftEdge = loadFile('supabase/functions/clinic-ai-draft/index.ts');

// Existing Clinic files
const clinicEncounterPanel = loadFile('components/clinic/ClinicEncounterPanel.tsx');
const clinicUiPolicy = loadFile('services/clinicUiPolicy.ts');
const clinicService = loadFile('services/clinicService.ts');
const envExample = loadFile('supabase/functions/.env.example');

// Package & migrations
const packageJson = JSON.parse(loadFile('package.json'));
const migrationsDir = path.join(process.cwd(), 'supabase/migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ===========================================================================
// CHECK 1: Provider not configured => fail closed => no fake transcript
// ===========================================================================

check('1. Provider fail-closed — no fake transcript in production', () => {
  // Provider factory must throw when not configured
  assert(
    clinicAiAssistProvider.includes('AI_PROVIDER_NOT_CONFIGURED'),
    'Provider must define AI_PROVIDER_NOT_CONFIGURED error'
  );
  assert(
    clinicAiAssistProvider.includes("throw new ClinicAiProviderNotConfiguredError"),
    'Provider factory must throw ClinicAiProviderNotConfiguredError when not configured'
  );

  // No hardcoded fake transcript strings in the provider module
  assert(
    !clinicAiAssistProvider.includes('Mock') && !clinicAiAssistProvider.includes('fake transcript'),
    'Provider must NOT contain mock/fake transcript in production code'
  );

  // Edge functions reference AI_PROVIDER_NOT_CONFIGURED
  assert(
    clinicAiTranscribeEdge.includes('AI_PROVIDER_NOT_CONFIGURED'),
    'Transcribe edge function must handle AI_PROVIDER_NOT_CONFIGURED'
  );
  assert(
    clinicAiDraftEdge.includes('AI_PROVIDER_NOT_CONFIGURED'),
    'Draft edge function must handle AI_PROVIDER_NOT_CONFIGURED'
  );
});

// ===========================================================================
// CHECK 2: Authorization check in edge functions (JWT auth required)
// ===========================================================================

check('2. Edge functions require JWT authentication', () => {
  // Transcribe edge function
  assert(
    clinicAiTranscribeEdge.includes('Authorization') &&
    clinicAiTranscribeEdge.includes('Bearer'),
    'Transcribe edge function must check Authorization Bearer header'
  );
  assert(
    clinicAiTranscribeEdge.includes('AUTH_REQUIRED'),
    'Transcribe edge function must return AUTH_REQUIRED on missing auth'
  );

  // Draft edge function
  assert(
    clinicAiDraftEdge.includes('Authorization') &&
    clinicAiDraftEdge.includes('Bearer'),
    'Draft edge function must check Authorization Bearer header'
  );
  assert(
    clinicAiDraftEdge.includes('AUTH_REQUIRED'),
    'Draft edge function must return AUTH_REQUIRED on missing auth'
  );
});

// ===========================================================================
// CHECK 3: Receptionist without note authority => denied
// ===========================================================================

check('3. canUseClinicAiAssist denies without can_write_clinical_notes', () => {
  assert(
    clinicUiPolicy.includes('canUseClinicAiAssist'),
    'clinicUiPolicy must export canUseClinicAiAssist'
  );
  assert(
    clinicUiPolicy.includes("if (!context.can_write_clinical_notes) return false;"),
    'canUseClinicAiAssist must check can_write_clinical_notes'
  );
});

// ===========================================================================
// CHECK 4: super_admin => denied
// ===========================================================================

check('4. super_admin denied — policy requires can_write_clinical_notes + staff match', () => {
  // canUseClinicAiAssist requires a matching context with clinical note authority.
  // super_admin has no Clinic staff context (deriveClinicWorkspaceMode returns 'unauthorized'),
  // therefore canUseClinicAiAssist receives null context and returns false.
  assert(
    clinicUiPolicy.includes("if (!context) return false;"),
    'canUseClinicAiAssist must deny null context (super_admin has no clinic context)'
  );

  // Edge functions additionally check can_write_clinical_notes from server authority
  assert(
    clinicAiTranscribeEdge.includes('can_write_clinical_notes'),
    'Transcribe edge function must check can_write_clinical_notes'
  );
  assert(
    clinicAiDraftEdge.includes('can_write_clinical_notes'),
    'Draft edge function must check can_write_clinical_notes'
  );
});

// ===========================================================================
// CHECK 5: Valid practitioner => provider adapter may be invoked
// ===========================================================================

check('5. Valid practitioner path — provider invocation exists', () => {
  assert(
    clinicAiTranscribeEdge.includes('createTranscriptionProvider'),
    'Transcribe edge function must call createTranscriptionProvider'
  );
  assert(
    clinicAiDraftEdge.includes('createSoapDraftProvider'),
    'Draft edge function must call createSoapDraftProvider'
  );
});

// ===========================================================================
// CHECK 6: Transcription result => application/UI state only
// ===========================================================================

check('6. Transcription result — no persistence calls in client service', () => {
  // Client service must NOT call saveClinicEncounterNote
  assert(
    !clinicAiAssistService.includes('saveClinicEncounterNote'),
    'clinicAiAssistService must NOT call saveClinicEncounterNote'
  );
  assert(
    !clinicAiAssistService.includes('completeClinicEncounter'),
    'clinicAiAssistService must NOT call completeClinicEncounter'
  );
  // No localStorage/sessionStorage/indexedDB
  assert(
    !clinicAiAssistService.includes('localStorage'),
    'clinicAiAssistService must NOT use localStorage'
  );
  assert(
    !clinicAiAssistService.includes('sessionStorage'),
    'clinicAiAssistService must NOT use sessionStorage'
  );
  assert(
    !clinicAiAssistService.includes('indexedDB') && !clinicAiAssistService.includes('IndexedDB'),
    'clinicAiAssistService must NOT use IndexedDB'
  );
});

// ===========================================================================
// CHECK 7: Generate Draft => structured SOAP, zero clinic save calls
// ===========================================================================

check('7. Draft generation — structured SOAP output, zero save calls in edge function', () => {
  // Draft edge function returns structured SOAP fields
  assert(
    clinicAiDraftEdge.includes('subjective') &&
    clinicAiDraftEdge.includes('objective') &&
    clinicAiDraftEdge.includes('assessment') &&
    clinicAiDraftEdge.includes('plan'),
    'Draft edge function must return structured SOAP fields'
  );

  // Draft edge function must NOT call clinic_save_encounter_note
  assert(
    !clinicAiDraftEdge.includes('clinic_save_encounter_note'),
    'Draft edge function must NOT call clinic_save_encounter_note'
  );
  assert(
    !clinicAiDraftEdge.includes('clinic_complete_encounter'),
    'Draft edge function must NOT call clinic_complete_encounter'
  );
});

// ===========================================================================
// CHECK 8: Use Draft => populates SOAP editor, zero save calls
// ===========================================================================

check('8. Use Draft — populates SOAP editor via callback, zero save calls', () => {
  // AI panel calls onUseDraft callback
  assert(
    clinicAiAssistPanel.includes('onUseDraft'),
    'ClinicAiAssistPanel must accept onUseDraft callback'
  );
  // AI panel must NOT call saveClinicEncounterNote
  assert(
    !clinicAiAssistPanel.includes('saveClinicEncounterNote'),
    'ClinicAiAssistPanel must NOT call saveClinicEncounterNote'
  );
  // AI panel must NOT call completeClinicEncounter
  assert(
    !clinicAiAssistPanel.includes('completeClinicEncounter'),
    'ClinicAiAssistPanel must NOT call completeClinicEncounter'
  );
  // ClinicEncounterPanel wires onUseDraft to setSoapForm
  assert(
    clinicEncounterPanel.includes('handleUseDraft') &&
    clinicEncounterPanel.includes('setSoapForm'),
    'ClinicEncounterPanel must wire onUseDraft to populate soapForm'
  );
});

// ===========================================================================
// CHECK 9: Reject Draft => clears AI draft, zero save calls
// ===========================================================================

check('9. Reject Draft — clears state, zero save calls', () => {
  assert(
    clinicAiAssistPanel.includes('handleRejectDraft'),
    'ClinicAiAssistPanel must implement handleRejectDraft'
  );
  // Reject clears transcript and draft
  assert(
    clinicAiAssistPanel.includes("setTranscript('')"),
    'handleRejectDraft must clear transcript'
  );
});

// ===========================================================================
// CHECK 10: Existing Save Note => unchanged canonical path
// ===========================================================================

check('10. Existing Save Note — canonical persistence path unchanged', () => {
  assert(
    clinicEncounterPanel.includes('handleSaveNote'),
    'ClinicEncounterPanel must retain handleSaveNote'
  );
  assert(
    clinicEncounterPanel.includes('clinicService.saveClinicEncounterNote'),
    'handleSaveNote must call clinicService.saveClinicEncounterNote'
  );
  // Existing clinicService still uses supabaseClinicRepository
  assert(
    clinicService.includes('supabaseClinicRepository.saveEncounterNote'),
    'clinicService must still delegate to supabaseClinicRepository.saveEncounterNote'
  );
});

// ===========================================================================
// CHECK 11: No localStorage/sessionStorage/IndexedDB/URL for clinical AI data
// ===========================================================================

check('11. No browser persistence for audio/transcript/draft', () => {
  // ClinicAiAssistPanel — the only component handling AI data
  assert(
    !clinicAiAssistPanel.includes('localStorage'),
    'ClinicAiAssistPanel must NOT use localStorage'
  );
  assert(
    !clinicAiAssistPanel.includes('sessionStorage'),
    'ClinicAiAssistPanel must NOT use sessionStorage'
  );
  assert(
    !clinicAiAssistPanel.includes('indexedDB') && !clinicAiAssistPanel.includes('IndexedDB'),
    'ClinicAiAssistPanel must NOT use IndexedDB'
  );
  assert(
    !clinicAiAssistPanel.includes('window.location.hash') &&
    !clinicAiAssistPanel.includes('searchParams'),
    'ClinicAiAssistPanel must NOT use URL/query/hash for clinical data'
  );
});

// ===========================================================================
// CHECK 12: Manual SOAP editing still works when AI unavailable
// ===========================================================================

check('12. Manual SOAP editing works when AI unavailable', () => {
  // The existing SOAP form is always rendered when canWriteNote is true,
  // regardless of AI panel state
  assert(
    clinicEncounterPanel.includes('canWriteNote ?') ||
    clinicEncounterPanel.includes('{canWriteNote ? ('),
    'SOAP form must render based on canWriteNote, independent of AI state'
  );
  // AI panel is conditionally shown but does NOT gate the SOAP form
  assert(
    clinicEncounterPanel.includes('canAiAssist') &&
    clinicEncounterPanel.includes('ClinicAiAssistPanel'),
    'AI panel is conditionally shown with canAiAssist'
  );
});

// ===========================================================================
// CHECK 13: No AI path can call clinic_complete_encounter
// ===========================================================================

check('13. No AI path calls clinic_complete_encounter', () => {
  assert(
    !clinicAiAssistPanel.includes('clinic_complete_encounter') &&
    !clinicAiAssistPanel.includes('completeClinicEncounter'),
    'ClinicAiAssistPanel must NOT reference clinic_complete_encounter'
  );
  assert(
    !clinicAiAssistService.includes('clinic_complete_encounter') &&
    !clinicAiAssistService.includes('completeClinicEncounter'),
    'clinicAiAssistService must NOT reference clinic_complete_encounter'
  );
  assert(
    !clinicAiDraftEdge.includes('clinic_complete_encounter'),
    'clinic-ai-draft must NOT reference clinic_complete_encounter'
  );
  assert(
    !clinicAiTranscribeEdge.includes('clinic_complete_encounter'),
    'clinic-ai-transcribe must NOT reference clinic_complete_encounter'
  );
});

// ===========================================================================
// CHECK 14: No frontend provider secret reference
// ===========================================================================

check('14. No frontend provider secret — no VITE_*KEY for AI', () => {
  const allNewFiles = [
    clinicAiAssistTypes,
    clinicAiAssistService,
    clinicAiAssistPanel,
  ].join('\n');

  assert(
    !allNewFiles.includes('VITE_GEMINI_API_KEY') &&
    !allNewFiles.includes('VITE_OPENAI_API_KEY') &&
    !allNewFiles.includes('VITE_AI_'),
    'Frontend files must NOT reference VITE_ AI provider keys'
  );

  // .env.example must NOT have VITE_ prefix for clinic AI keys
  assert(
    !envExample.includes('VITE_CLINIC_AI'),
    '.env.example must NOT expose clinic AI keys with VITE_ prefix'
  );
});

// ===========================================================================
// ADDITIONAL STRUCTURAL CHECKS
// ===========================================================================

check('15. Migration 65 defines 0-argument RPC, consumes canonical "eligible" boolean & drops parameterized legacy RPC', () => {
  assert.strictEqual(
    migrationFiles.length,
    65,
    `Expected 65 migration files, got ${migrationFiles.length}`
  );
  const migration65Path = path.join(migrationsDir, '20260909_clinic_ai_assist_commercial_authority.sql');
  assert(fs.existsSync(migration65Path), 'Migration 65 file missing');
  const m65Content = fs.readFileSync(migration65Path, 'utf8');

  // Check SQL test suite file & static hygiene guards
  const sqlTestPath = path.join(process.cwd(), 'supabase/tests/clinic_ai_assist_commercial_authority_tests.sql');
  assert(fs.existsSync(sqlTestPath), 'SQL test suite file missing');
  const sqlTestContent = fs.readFileSync(sqlTestPath, 'utf8');

  // Static Hygiene Guard 1: Malformed synthetic UUID check
  assert(
    !sqlTestContent.includes('a9999999-9999-4999-9999-99999999905'),
    'SQL test suite must NOT contain malformed UUID literal "a9999999-9999-4999-9999-99999999905"'
  );
  assert(
    sqlTestContent.includes('a9999999-9999-4999-9999-999999999905'),
    'SQL test suite must contain exact 36-char UUID literal "a9999999-9999-4999-9999-999999999905"'
  );

  // Static Hygiene Guard 2: Subscription fixture contract
  assert(
    !sqlTestContent.includes("billing_mode\n    ) VALUES (\n        v_tenant_a_id,\n        (SELECT plan_id"),
    'SQL test suite must NOT insert UUID into subscriptions.plan_id'
  );
  assert(
    sqlTestContent.includes("billing_mode = 'manual'") || sqlTestContent.includes("'manual'"),
    'SQL test suite must use canonical billing_mode'
  );

  // Static Hygiene Guard 3: Unlimited override shape
  assert(
    sqlTestContent.includes('is_unlimited = true, integer_value = NULL'),
    'SQL test suite must set is_unlimited = true AND integer_value = NULL atomically'
  );

  // Static Hygiene Guard 4: Anon ACL 42501 contract
  assert(
    sqlTestContent.includes('insufficient_privilege') && sqlTestContent.includes("has_function_privilege('anon'"),
    'SQL test suite must check catalog REVOKE and catch insufficient_privilege for anon'
  );

  // Static Hygiene Guard 5: Post-rollback residue query (CASE 25)
  assert(
    sqlTestContent.includes('SELECT COUNT(*) INTO v_table_residue FROM public.tenants') &&
    sqlTestContent.includes('ROLLBACK;\n\n\n-- ============================================================================\n-- SECTION 4: CASE 25'),
    'SQL test suite must execute post-rollback query checks for residue outside the transaction'
  );

  // Static Hygiene Guard 6: Concurrency runner stub prevention
  const concurrencyRunnerPath = path.join(process.cwd(), 'scripts/test-clinic-ai-assist-quota-concurrency.mjs');
  assert(fs.existsSync(concurrencyRunnerPath), 'Concurrency runner missing');
  const concurrencyContent = fs.readFileSync(concurrencyRunnerPath, 'utf8');
  assert(
    !concurrencyContent.includes('// ... execution path for real DB test ...'),
    'Concurrency runner must NOT contain placeholder execution path comments'
  );
  assert(
    m65Content.includes('DROP FUNCTION IF EXISTS public.clinic_check_and_consume_ai_allowance(UUID, INT);'),
    'Migration 65 must drop parameterized legacy signature'
  );

  // Finding 1: Canonical 'eligible' field
  assert(
    m65Content.includes("(v_eligible_res->>'eligible')::boolean"),
    'Migration 65 must consume canonical "eligible" field from resolve_tenant_commercial_eligibility'
  );

  // Concurrency & Server-side derivation
  assert(
    m65Content.includes('pg_advisory_xact_lock'),
    'Migration 65 must use pg_advisory_xact_lock for concurrency safety'
  );
  assert(
    m65Content.includes('can_write_clinical_notes'),
    'Migration 65 must verify can_write_clinical_notes server-side'
  );
});

check('16. Edge functions call 0-argument quota RPC AFTER provider validation (Finding 2 & 3)', () => {
  assert(
    clinicAiTranscribeEdge.includes('clinic_get_my_context'),
    'Transcribe edge function must call clinic_get_my_context RPC'
  );
  assert(
    clinicAiDraftEdge.includes('clinic_get_my_context'),
    'Draft edge function must call clinic_get_my_context RPC'
  );

  // Finding 2: 0-argument RPC call without caller-supplied parameters
  assert(
    clinicAiTranscribeEdge.includes('"clinic_check_and_consume_ai_allowance"') &&
    !clinicAiTranscribeEdge.includes('p_tenant_id'),
    'Transcribe edge function must invoke 0-argument quota RPC without tenant_id/delta parameters'
  );
  assert(
    clinicAiDraftEdge.includes('"clinic_check_and_consume_ai_allowance"') &&
    !clinicAiDraftEdge.includes('p_tenant_id'),
    'Draft edge function must invoke 0-argument quota RPC without tenant_id/delta parameters'
  );

  // Finding 3: Provider factory creation BEFORE quota RPC
  const transcribeProviderIdx = clinicAiTranscribeEdge.indexOf('createTranscriptionProvider()');
  const transcribeQuotaIdx = clinicAiTranscribeEdge.indexOf('clinic_check_and_consume_ai_allowance');
  assert(
    transcribeProviderIdx > 0 && transcribeQuotaIdx > transcribeProviderIdx,
    'Transcribe edge function must validate provider factory BEFORE invoking commercial quota RPC'
  );

  const draftProviderIdx = clinicAiDraftEdge.indexOf('createSoapDraftProvider()');
  const draftQuotaIdx = clinicAiDraftEdge.indexOf('clinic_check_and_consume_ai_allowance');
  assert(
    draftProviderIdx > 0 && draftQuotaIdx > draftProviderIdx,
    'Draft edge function must validate provider factory BEFORE invoking commercial quota RPC'
  );
});

check('17. Provider abstraction exists with OpenAI adapters and fail-closed factory', () => {
  assert(
    clinicAiAssistProvider.includes('ClinicTranscriptionProvider'),
    'Provider module must define ClinicTranscriptionProvider interface'
  );
  assert(
    clinicAiAssistProvider.includes('ClinicSoapDraftProvider'),
    'Provider module must define ClinicSoapDraftProvider interface'
  );
  assert(
    clinicAiAssistProvider.includes('OpenAiTranscriptionProvider'),
    'Provider module must export OpenAiTranscriptionProvider adapter'
  );
  assert(
    clinicAiAssistProvider.includes('OpenAiSoapDraftProvider'),
    'Provider module must export OpenAiSoapDraftProvider adapter'
  );
});

check('18. Pre-buffer audio payload size check enforced', () => {
  assert(
    clinicAiTranscribeEdge.includes('audioFile.size > MAX_AUDIO_PAYLOAD_BYTES'),
    'Transcribe edge function must inspect audioFile.size BEFORE arrayBuffer allocation'
  );
});

check('19. MIME allowlist enforced', () => {
  assert(
    clinicAiAssistProvider.includes('SUPPORTED_AUDIO_MIMES'),
    'Provider module must define SUPPORTED_AUDIO_MIMES'
  );
  assert(
    clinicAiTranscribeEdge.includes('SUPPORTED_AUDIO_MIMES'),
    'Transcribe edge function must check SUPPORTED_AUDIO_MIMES'
  );
});

check('20. Clinical AI safety contract present in draft provider', () => {
  assert(
    clinicAiAssistProvider.includes('Do NOT invent observations'),
    'Safety contract must prohibit inventing observations'
  );
  assert(
    clinicAiAssistProvider.includes('Do NOT invent diagnoses'),
    'Safety contract must prohibit inventing diagnoses'
  );
});

check('21. AI safety label visible in UI', () => {
  assert(
    clinicAiAssistPanel.includes('Hekim onayı gereklidir') ||
    clinicAiAssistPanel.includes('hekim incelemesi'),
    'AI panel must display clinician review required label'
  );
});

check('22. Security Repair 1: Zero SUPABASE_SERVICE_ROLE_KEY fallback for user context', () => {
  assert(
    !clinicAiTranscribeEdge.includes('SUPABASE_SERVICE_ROLE_KEY'),
    'Transcribe edge function must NOT fall back to SUPABASE_SERVICE_ROLE_KEY'
  );
  assert(
    !clinicAiDraftEdge.includes('SUPABASE_SERVICE_ROLE_KEY'),
    'Draft edge function must NOT fall back to SUPABASE_SERVICE_ROLE_KEY'
  );
});

check('23. State machine types defined', () => {
  const states = ['idle', 'requesting_microphone', 'recording', 'recorded',
    'transcribing', 'transcribed', 'drafting', 'draft_ready', 'error'];
  for (const s of states) {
    assert(
      clinicAiAssistTypes.includes(`'${s}'`),
      `ClinicAiAssistState must include '${s}'`
    );
  }
});

check('24. qa:clinic-ai-assist script registered in package.json', () => {
  assert(
    packageJson.scripts && packageJson.scripts['qa:clinic-ai-assist'],
    'package.json must have qa:clinic-ai-assist script'
  );
});

check('25. Edge functions do NOT persist audio or transcript', () => {
  // No INSERT, UPDATE, storage upload in transcribe function
  assert(
    !clinicAiTranscribeEdge.includes('INSERT') &&
    !clinicAiTranscribeEdge.includes('.upload(') &&
    !clinicAiTranscribeEdge.includes('.upsert('),
    'Transcribe edge function must NOT persist audio/transcript'
  );
  // No INSERT, UPDATE in draft function
  assert(
    !clinicAiDraftEdge.includes('INSERT') &&
    !clinicAiDraftEdge.includes('.upload(') &&
    !clinicAiDraftEdge.includes('.upsert('),
    'Draft edge function must NOT persist draft'
  );
});

check('26. Transcribe edge function does NOT log audio bytes or transcript text', () => {
  // The only console.error should be the generic error message, not transcript content
  const consoleLines = clinicAiTranscribeEdge.split('\n').filter(l => l.includes('console.'));
  for (const line of consoleLines) {
    assert(
      !line.includes('transcript') && !line.includes('audio') && !line.includes('result'),
      `Transcribe edge function must NOT log sensitive data: ${line.trim()}`
    );
  }
});

// ===========================================================================
// SUMMARY
// ===========================================================================

console.log('');
console.log(`=== CLINIC AI ASSIST V1 CONTRACT QA: ${passed} PASSED, ${failed} FAILED ===`);

if (failed > 0) {
  process.exit(1);
}

console.log('');
console.log('ALL CHECKS PASSED.');
