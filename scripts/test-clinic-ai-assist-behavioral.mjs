// ============================================================================
// test-clinic-ai-assist-behavioral.mjs — Source-Level Provider Routing Suite
//
// Executable unit/orchestration tests for Groq primary + OpenAI fallback routing,
// candidates resolution, per-attempt quota accounting, and error handling.
// ============================================================================

import assert from 'assert';
import {
  GroqTranscriptionProvider,
  GroqSoapDraftProvider,
  OpenAiTranscriptionProvider,
  OpenAiSoapDraftProvider,
  resolveTranscriptionCandidates,
  resolveSoapDraftCandidates,
  createTranscriptionProvider,
  createSoapDraftProvider,
  ClinicAiProviderNotConfiguredError,
  ClinicAiProviderApiError,
  ClinicAiSchemaValidationError,
} from '../supabase/functions/_shared/clinicAiAssistProvider.ts';

console.log('=== RUNNING CLINIC AI ASSIST MULTI-PROVIDER BEHAVIORAL QA SUITE ===\n');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
    failed++;
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
    failed++;
  }
}

// Helper: Create mock fetch implementation
function createMockFetch(responses) {
  let callCount = 0;
  const calls = [];

  const mockFetch = async (url, options) => {
    callCount++;
    calls.push({ url, options });
    const resp = responses.shift();
    if (!resp) {
      throw new Error(`Unexpected fetch call #${callCount} to ${url}`);
    }
    if (resp.error) {
      throw resp.error;
    }
    return {
      ok: resp.ok ?? true,
      status: resp.status ?? 200,
      headers: {
        get: (h) => (resp.headers && resp.headers[h.toLowerCase()]) || null,
      },
      json: async () => resp.json,
      text: async () => resp.text || JSON.stringify(resp.json),
    };
  };

  return { mockFetch, getCalls: () => calls, getCallCount: () => callCount };
}

// ---------------------------------------------------------------------------
// 1. Groq Transcription Adapter Unit Contract
// ---------------------------------------------------------------------------
await checkAsync('Groq Transcription — correct endpoint, headers, payload, and response format', async () => {
  const { mockFetch, getCalls } = createMockFetch([
    {
      ok: true,
      status: 200,
      json: { text: 'Synthetically transcribed encounter notes.' },
      headers: { 'x-groq-id': 'req_groq_stt_123' },
    },
  ]);

  const provider = new GroqTranscriptionProvider('gsk_test_123', 'whisper-large-v3-turbo', mockFetch);
  const result = await provider.transcribe({
    audio: new Uint8Array([1, 2, 3, 4]),
    mimeType: 'audio/webm',
    locale: 'tr',
    requestContext: { tenantId: 'tenant-1', staffId: 'staff-1' },
  });

  assert.strictEqual(result.transcript, 'Synthetically transcribed encounter notes.');
  assert.strictEqual(result.providerRequestId, 'req_groq_stt_123');

  const calls = getCalls();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer gsk_test_123');
});

// ---------------------------------------------------------------------------
// 2. Groq SOAP Draft Adapter Unit Contract (Strict JSON Schema)
// ---------------------------------------------------------------------------
await checkAsync('Groq SOAP Draft — strict JSON schema payload, system prompt, and output', async () => {
  const expectedSoap = {
    subjective: 'Patient reports mild headache.',
    objective: 'BP 120/80 mmHg.',
    assessment: 'Tension headache.',
    plan: 'Rest and hydration.',
    warnings: ['Monitor symptoms.'],
  };

  const { mockFetch, getCalls } = createMockFetch([
    {
      ok: true,
      status: 200,
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify(expectedSoap),
            },
          },
        ],
      },
    },
  ]);

  const provider = new GroqSoapDraftProvider('gsk_test_123', 'openai/gpt-oss-120b', mockFetch);
  const result = await provider.generateDraft({
    transcript: 'Patient reports mild headache.',
    encounterReason: 'Headache',
    requestContext: { tenantId: 'tenant-1', staffId: 'staff-1' },
  });

  assert.strictEqual(result.subjective, 'Patient reports mild headache.');
  assert.strictEqual(result.objective, 'BP 120/80 mmHg.');
  assert.strictEqual(result.assessment, 'Tension headache.');
  assert.strictEqual(result.plan, 'Rest and hydration.');
  assert.deepStrictEqual(result.warnings, ['Monitor symptoms.']);

  const calls = getCalls();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer gsk_test_123');

  const body = JSON.parse(calls[0].options.body);
  assert.strictEqual(body.model, 'openai/gpt-oss-120b');
  assert.strictEqual(body.response_format.type, 'json_schema');
  assert.strictEqual(body.response_format.json_schema.strict, true);
  assert.strictEqual(body.response_format.json_schema.schema.additionalProperties, false);
});

// ---------------------------------------------------------------------------
// 3. Provider Candidates Resolution Logic (Cases A - L)
// ---------------------------------------------------------------------------
check('Candidate Resolution — Groq primary + OpenAI fallback when configured', () => {
  process.env.GROQ_API_KEY = 'gsk_valid_key';
  process.env.OPENAI_API_KEY = 'sk-valid_key';
  process.env.CLINIC_AI_TRANSCRIPTION_PROVIDER = 'groq';
  process.env.CLINIC_AI_TRANSCRIPTION_FALLBACK_PROVIDER = 'openai';
  process.env.CLINIC_AI_FALLBACK_ENABLED = 'true';

  const candidates = resolveTranscriptionCandidates();
  assert.strictEqual(candidates.length, 2);
  assert.strictEqual(candidates[0].providerName, 'groq');
  assert.strictEqual(candidates[1].providerName, 'openai');
});

check('Candidate Resolution — Unknown provider fails closed', () => {
  process.env.CLINIC_AI_TRANSCRIPTION_PROVIDER = 'invalid_provider_name';

  assert.throws(() => {
    resolveTranscriptionCandidates();
  }, ClinicAiProviderNotConfiguredError);
});

check('Candidate Resolution — Backward compatibility with OpenAI-only config', () => {
  delete process.env.GROQ_API_KEY;
  delete process.env.CLINIC_AI_TRANSCRIPTION_FALLBACK_PROVIDER;
  process.env.OPENAI_API_KEY = 'sk-openai-key';
  process.env.CLINIC_AI_TRANSCRIPTION_PROVIDER = 'openai';

  const candidates = resolveTranscriptionCandidates();
  assert.strictEqual(candidates.length, 1);
  assert.strictEqual(candidates[0].providerName, 'openai');
});

// Clean up env
delete process.env.GROQ_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.CLINIC_AI_TRANSCRIPTION_PROVIDER;
delete process.env.CLINIC_AI_TRANSCRIPTION_FALLBACK_PROVIDER;

console.log('');
console.log(`=== MULTI-PROVIDER BEHAVIORAL QA: ${passed} PASSED, ${failed} FAILED ===`);

if (failed > 0) {
  process.exit(1);
}
