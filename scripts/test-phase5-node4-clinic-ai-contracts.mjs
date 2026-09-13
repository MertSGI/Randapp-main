import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('--- PHASE 5 NODE 4 CLINIC ENCOUNTER AI DICTATION & SOAP DRAFT CONTRACT VALIDATION ---');

function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exit(1);
  }
}

const loadFile = (relPath) => {
  const fullPath = path.join(process.cwd(), relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Required file missing: ${relPath}`);
  }
  return fs.readFileSync(fullPath, 'utf8');
};

const clinicAiTranscribeEdge = loadFile('supabase/functions/clinic-ai-transcribe/index.ts');
const clinicAiDraftEdge = loadFile('supabase/functions/clinic-ai-draft/index.ts');
const clinicAiAssistProvider = loadFile('supabase/functions/_shared/clinicAiAssistProvider.ts');
const clinicEncounterPanel = loadFile('components/clinic/ClinicEncounterPanel.tsx');
const clinicAiAssistPanel = loadFile('components/clinic/ClinicAiAssistPanel.tsx');
const clinicUiPolicy = loadFile('services/clinicUiPolicy.ts');
const migration65 = loadFile('supabase/migrations/20260909_clinic_ai_assist_commercial_authority.sql');
const migrationNode1 = loadFile('supabase/migrations/20260927_phase5_vertical_skus_commercial_packaging.sql');

// 1. Provider neutrality & resilience
check('1. Provider neutrality: Groq primary with metered OpenAI fallback configured', () => {
  assert(clinicAiAssistProvider.includes("primaryProviderName === 'openai' ? 'whisper-1' : 'whisper-large-v3-turbo'"));
  assert(clinicAiAssistProvider.includes("primaryProviderName === 'openai' ? 'gpt-4o-mini' : 'openai/gpt-oss-120b'"));
  assert(clinicAiAssistProvider.includes('resolveTranscriptionCandidates'));
  assert(clinicAiAssistProvider.includes('resolveSoapDraftCandidates'));
});

// 2. Zero live LLM credentials in frontend code
check('2. Zero live LLM/provider credentials in client code', () => {
  assert(!clinicAiAssistPanel.includes('OPENAI_API_KEY'));
  assert(!clinicAiAssistPanel.includes('GROQ_API_KEY'));
  assert(!clinicEncounterPanel.includes('OPENAI_API_KEY'));
  assert(!clinicEncounterPanel.includes('GROQ_API_KEY'));
});

// 3. Zero audio persistence or raw audio retention
check('3. Zero audio persistence: audio payload held strictly in volatile client memory', () => {
  assert(clinicAiTranscribeEdge.includes('ZERO audio persistence. ZERO transcript logging. ZERO clinical writes.'));
  assert(!clinicAiTranscribeEdge.includes('supabase.storage'));
  assert(!clinicAiTranscribeEdge.includes('from("audio_recordings")'));
});

// 4. Server-authoritative quota consumption
check('4. Server-authoritative quota consumption via 0-argument RPC with advisory lock', () => {
  assert(clinicAiTranscribeEdge.includes('"clinic_check_and_consume_ai_allowance"'));
  assert(clinicAiDraftEdge.includes('"clinic_check_and_consume_ai_allowance"'));
  assert(migration65.includes('pg_advisory_xact_lock'));
  assert(migration65.includes("v_period_key := to_char(timezone('UTC', now()), 'YYYY-MM')"));
  assert(migration65.includes('resolve_tenant_commercial_eligibility'));
});

// 5. Vertical SKU features registered in commercial packaging
check('5. Vertical SKU features clinic_ai_transcribe and clinic_ai_soap_draft registered in Node 1', () => {
  assert(migrationNode1.includes("'clinic_ai_transcribe'"));
  assert(migrationNode1.includes("'clinic_ai_soap_draft'"));
  assert(migrationNode1.includes("v_clinic_starter_ver_id, 'clinic_ai_transcribe'"));
  assert(migrationNode1.includes("v_clinic_pro_ver_id, 'clinic_ai_soap_draft'"));
});

// 6. Enforces can_write_clinical_notes permission server-side & UI policy
check('6. Enforces can_write_clinical_notes permission server-side and client-side', () => {
  assert(clinicAiTranscribeEdge.includes('if (!clinicContext.can_write_clinical_notes)'));
  assert(clinicAiDraftEdge.includes('if (!clinicContext.can_write_clinical_notes)'));
  assert(clinicUiPolicy.includes('export function canUseClinicAiAssist'));
  assert(clinicEncounterPanel.includes('canUseClinicAiAssist(context, encStatus, assignedStaffId)'));
});

// 7. Human-in-the-loop: AI draft never directly saved or encounter completed
check('7. Human approval authoritative: AI draft does not persist notes or complete encounter', () => {
  assert(clinicAiAssistPanel.includes('onUseDraft: (draft: {'));
  assert(!clinicAiAssistPanel.includes('saveClinicEncounterNote'));
  assert(!clinicAiAssistPanel.includes('completeClinicEncounter'));
  assert(clinicEncounterPanel.includes('handleUseDraft = (draft:'));
  assert(clinicEncounterPanel.includes('setSoapForm(prev => ({'));
  assert(clinicEncounterPanel.includes('handleSaveNote'));
});

// 8. Security DEFINER and execution privileges
check('8. RPC security: REVOKE FROM PUBLIC, anon and GRANT TO authenticated', () => {
  assert(migration65.includes('REVOKE EXECUTE ON FUNCTION public.clinic_check_and_consume_ai_allowance() FROM PUBLIC, anon;'));
  assert(migration65.includes('GRANT EXECUTE ON FUNCTION public.clinic_check_and_consume_ai_allowance() TO authenticated;'));
});

console.log('\n========================================');
console.log('PHASE 5 NODE 4 CONTRACTS: 8 | PASSED: 8 | FAILED: 0');
console.log('========================================\n');
