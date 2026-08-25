// ============================================================================
// test-clinic-ai-assist-behavioral.mjs — Comprehensive Provider Behavioral Suite
//
// Executable unit/orchestration tests for:
// - Groq STT & SOAP adapters (full multipart & strict schema contracts, timeout normalization)
// - OpenAI STT & SOAP adapters (legacy/fallback contracts)
// - Candidate chain resolution (default models, reverse models, unknown fallback fail-closed)
// - Shared metered provider chain orchestration (Cases A - O)
// ============================================================================

import assert from 'assert';
import {
  GroqTranscriptionProvider,
  GroqSoapDraftProvider,
  OpenAiTranscriptionProvider,
  OpenAiSoapDraftProvider,
  resolveTranscriptionCandidates,
  resolveSoapDraftCandidates,
  executeMeteredProviderChain,
  ClinicAiProviderNotConfiguredError,
  ClinicAiProviderApiError,
  ClinicAiSchemaValidationError,
  CLINIC_AI_DRAFT_SYSTEM_PROMPT,
} from '../supabase/functions/_shared/clinicAiAssistProvider.ts';

console.log('=== RUNNING CLINIC AI ASSIST MULTI-PROVIDER BEHAVIORAL QA SUITE ===\n');

let passed = 0;
let failed = 0;
const executedCases = [];

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

async function checkAsync(name, caseId, fn) {
  try {
    await fn();
    console.log(`  ✓ [Case ${caseId}] ${name}`);
    passed++;
    executedCases.push(caseId);
  } catch (err) {
    console.error(`  ✗ [Case ${caseId}] ${name}`);
    console.error(`    ${err.stack || err.message}`);
    failed++;
  }
}

// Helper: Create mock fetch implementation with FormData inspection
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

// Helper: Environment Sandbox
function withEnv(envVars, fn) {
  const oldEnv = { ...process.env };
  try {
    for (const [k, v] of Object.entries(envVars)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
    return fn();
  } finally {
    process.env = oldEnv;
  }
}

// ============================================================================
// SECTION 1: ADAPTER CONTRACT & TIMEOUT NORMALIZATION TESTS
// ============================================================================

await checkAsync('Groq Transcription — full multipart contract & x_groq.id normalization', 'ADAPTER_GROQ_STT', async () => {
  const { mockFetch, getCalls } = createMockFetch([
    {
      ok: true,
      status: 200,
      json: {
        text: '  Synthetically transcribed encounter notes.  ',
        language: 'tr',
        x_groq: { id: 'req_groq_json_id_999' },
      },
      headers: { 'x-groq-id': 'req_groq_header_id' },
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
  assert.strictEqual(result.detectedLanguage, 'tr');
  assert.strictEqual(result.providerRequestId, 'req_groq_json_id_999');

  const calls = getCalls();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer gsk_test_123');

  const formData = calls[0].options.body;
  assert(formData instanceof FormData, 'Body must be FormData instance');
  assert.strictEqual(formData.get('model'), 'whisper-large-v3-turbo');
  assert.strictEqual(formData.get('language'), 'tr');
  assert.strictEqual(formData.get('response_format'), 'verbose_json');
  assert(formData.get('file') instanceof Blob, 'FormData file field must be Blob/File');
});

await checkAsync('Groq SOAP Draft — strict JSON schema & safety prompt contract', 'ADAPTER_GROQ_SOAP', async () => {
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
  assert.strictEqual(body.messages[0].content, CLINIC_AI_DRAFT_SYSTEM_PROMPT);
  assert.strictEqual(body.response_format.type, 'json_schema');
  assert.strictEqual(body.response_format.json_schema.strict, true);
  assert.deepStrictEqual(body.response_format.json_schema.schema.required, [
    'subjective', 'objective', 'assessment', 'plan', 'warnings'
  ]);
  assert.strictEqual(body.response_format.json_schema.schema.additionalProperties, false);
});

await checkAsync('Groq STT Adapter Timeout Normalization — AbortError -> 408 Retryable Error', 'GROQ_STT_TIMEOUT_NORM', async () => {
  const mockFetch = async () => {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  };

  const provider = new GroqTranscriptionProvider('gsk_test_123', 'whisper-large-v3-turbo', mockFetch);

  try {
    await provider.transcribe({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm',
      requestContext: { tenantId: 't1', staffId: 's1' },
    });
    assert.fail('Should have thrown ClinicAiProviderApiError');
  } catch (err) {
    assert(err instanceof ClinicAiProviderApiError);
    assert.strictEqual(err.providerName, 'groq');
    assert.strictEqual(err.statusCode, 408);
    assert.strictEqual(err.isRetryable, true);
  }
});

await checkAsync('OpenAI Transcription Regression Adapter', 'ADAPTER_OPENAI_STT', async () => {
  const { mockFetch, getCalls } = createMockFetch([
    {
      ok: true,
      status: 200,
      json: { text: 'OpenAI transcribed text.' },
      headers: { 'x-request-id': 'req_openai_stt_1' },
    },
  ]);

  const provider = new OpenAiTranscriptionProvider('sk-test_123', 'whisper-1', mockFetch);
  const result = await provider.transcribe({
    audio: new Uint8Array([5, 6, 7]),
    mimeType: 'audio/mp3',
    requestContext: { tenantId: 'tenant-1', staffId: 'staff-1' },
  });

  assert.strictEqual(result.transcript, 'OpenAI transcribed text.');
  assert.strictEqual(result.providerRequestId, 'req_openai_stt_1');
  assert.strictEqual(getCalls()[0].url, 'https://api.openai.com/v1/audio/transcriptions');
});

await checkAsync('OpenAI SOAP Draft Regression Adapter', 'ADAPTER_OPENAI_SOAP', async () => {
  const expectedSoap = {
    subjective: 'S', objective: 'O', assessment: 'A', plan: 'P', warnings: []
  };

  const { mockFetch, getCalls } = createMockFetch([
    {
      ok: true,
      status: 200,
      json: { choices: [{ message: { content: JSON.stringify(expectedSoap) } }] },
    },
  ]);

  const provider = new OpenAiSoapDraftProvider('sk-test_123', 'gpt-4o-mini', mockFetch);
  const result = await provider.generateDraft({
    transcript: 'Dictation content',
    requestContext: { tenantId: 'tenant-1', staffId: 'staff-1' },
  });

  assert.strictEqual(result.subjective, 'S');
  assert.strictEqual(getCalls()[0].url, 'https://api.openai.com/v1/chat/completions');
});

// ============================================================================
// SECTION 2: RESOLVER HARDENING & STRENGTHENED REVERSE DEFAULTS TESTS
// ============================================================================

await checkAsync('Strengthened Reverse Resolution — OpenAI primary -> Groq STT fallback uses whisper-large-v3-turbo model', 'REVERSE_GROQ_STT_DEFAULT_MODEL', async () => {
  await withEnv({
    OPENAI_API_KEY: 'sk-test',
    GROQ_API_KEY: 'gsk-test',
    CLINIC_AI_TRANSCRIPTION_PROVIDER: 'openai',
    CLINIC_AI_TRANSCRIPTION_FALLBACK_PROVIDER: 'groq',
    CLINIC_AI_TRANSCRIPTION_FALLBACK_MODEL: undefined,
    CLINIC_AI_FALLBACK_ENABLED: 'true',
  }, async () => {
    const { mockFetch, getCalls } = createMockFetch([
      { ok: true, status: 200, json: { text: 'Transcribed by Groq fallback' } },
    ]);

    const candidates = resolveTranscriptionCandidates(mockFetch);
    assert.strictEqual(candidates.length, 2);
    assert.strictEqual(candidates[0].providerName, 'openai');
    assert.strictEqual(candidates[1].providerName, 'groq');

    const fallbackProvider = candidates[1].createProvider();
    assert.strictEqual(fallbackProvider.providerName, 'groq');

    await fallbackProvider.transcribe({
      audio: new Uint8Array([1, 2]),
      mimeType: 'audio/webm',
      requestContext: { tenantId: 't1', staffId: 's1' },
    });

    const calls = getCalls();
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, 'https://api.groq.com/openai/v1/audio/transcriptions');
    const formData = calls[0].options.body;
    assert.strictEqual(formData.get('model'), 'whisper-large-v3-turbo');
  });
});

await checkAsync('Strengthened Reverse Resolution — OpenAI primary -> Groq SOAP fallback uses openai/gpt-oss-120b model', 'REVERSE_GROQ_DRAFT_DEFAULT_MODEL', async () => {
  await withEnv({
    OPENAI_API_KEY: 'sk-test',
    GROQ_API_KEY: 'gsk-test',
    CLINIC_AI_DRAFT_PROVIDER: 'openai',
    CLINIC_AI_DRAFT_FALLBACK_PROVIDER: 'groq',
    CLINIC_AI_DRAFT_FALLBACK_MODEL: undefined,
    CLINIC_AI_FALLBACK_ENABLED: 'true',
  }, async () => {
    const expectedSoap = { subjective: 'S', objective: 'O', assessment: 'A', plan: 'P', warnings: [] };
    const { mockFetch, getCalls } = createMockFetch([
      { ok: true, status: 200, json: { choices: [{ message: { content: JSON.stringify(expectedSoap) } }] } },
    ]);

    const candidates = resolveSoapDraftCandidates(mockFetch);
    assert.strictEqual(candidates.length, 2);
    assert.strictEqual(candidates[0].providerName, 'openai');
    assert.strictEqual(candidates[1].providerName, 'groq');

    const fallbackProvider = candidates[1].createProvider();
    assert.strictEqual(fallbackProvider.providerName, 'groq');

    await fallbackProvider.generateDraft({
      transcript: 'Testing Groq fallback model',
      requestContext: { tenantId: 't1', staffId: 's1' },
    });

    const calls = getCalls();
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
    const body = JSON.parse(calls[0].options.body);
    assert.strictEqual(body.model, 'openai/gpt-oss-120b');
  });
});

check('Unknown Transcription Fallback Provider Fails Closed', () => {
  withEnv({
    GROQ_API_KEY: 'gsk-test',
    CLINIC_AI_TRANSCRIPTION_PROVIDER: 'groq',
    CLINIC_AI_TRANSCRIPTION_FALLBACK_PROVIDER: 'typo_provider',
    CLINIC_AI_FALLBACK_ENABLED: 'true',
  }, () => {
    assert.throws(() => {
      resolveTranscriptionCandidates();
    }, ClinicAiProviderNotConfiguredError);
  });
});

check('Unknown Draft Fallback Provider Fails Closed', () => {
  withEnv({
    GROQ_API_KEY: 'gsk-test',
    CLINIC_AI_DRAFT_PROVIDER: 'groq',
    CLINIC_AI_DRAFT_FALLBACK_PROVIDER: 'invalid_provider',
    CLINIC_AI_FALLBACK_ENABLED: 'true',
  }, () => {
    assert.throws(() => {
      resolveSoapDraftCandidates();
    }, ClinicAiProviderNotConfiguredError);
  });
});

check('Disabled Fallback Ignores Fallback Typo Provider', () => {
  withEnv({
    GROQ_API_KEY: 'gsk-test',
    CLINIC_AI_TRANSCRIPTION_PROVIDER: 'groq',
    CLINIC_AI_TRANSCRIPTION_FALLBACK_PROVIDER: 'typo_provider',
    CLINIC_AI_FALLBACK_ENABLED: 'false',
  }, () => {
    const candidates = resolveTranscriptionCandidates();
    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].providerName, 'groq');
  });
});

// ============================================================================
// SECTION 3: EXECUTABLE METERED ROUTING MATRIX (CASES A - O)
// ============================================================================

await checkAsync('Groq Primary Succeeds', 'A', async () => {
  let quotaCalls = 0;
  let primaryCalls = 0;
  let fallbackCalls = 0;

  const candidates = [
    {
      providerName: 'groq',
      createProvider: () => ({
        providerName: 'groq',
        invoke: async () => { primaryCalls++; return 'OK_GROQ'; },
      }),
    },
    {
      providerName: 'openai',
      createProvider: () => ({
        providerName: 'openai',
        invoke: async () => { fallbackCalls++; return 'OK_OPENAI'; },
      }),
    },
  ];

  const outcome = await executeMeteredProviderChain({
    candidates,
    createProvider: (c) => c.createProvider(),
    reserveQuota: async () => { quotaCalls++; return { success: true }; },
  });

  assert.strictEqual(outcome.result, 'OK_GROQ');
  assert.strictEqual(outcome.attemptedCount, 1);
  assert.strictEqual(outcome.quotaConsumedCount, 1);
  assert.strictEqual(quotaCalls, 1);
  assert.strictEqual(primaryCalls, 1);
  assert.strictEqual(fallbackCalls, 0);
});

await checkAsync('Groq Returns HTTP 429 -> OpenAI Fallback Succeeds', 'B', async () => {
  let quotaCalls = 0;
  let primaryCalls = 0;
  let fallbackCalls = 0;

  const candidates = [
    {
      providerName: 'groq',
      createProvider: () => ({
        providerName: 'groq',
        invoke: async () => {
          primaryCalls++;
          throw new ClinicAiProviderApiError('Rate limited', { providerName: 'groq', statusCode: 429 });
        },
      }),
    },
    {
      providerName: 'openai',
      createProvider: () => ({
        providerName: 'openai',
        invoke: async () => { fallbackCalls++; return 'FALLBACK_OK'; },
      }),
    },
  ];

  const outcome = await executeMeteredProviderChain({
    candidates,
    createProvider: (c) => c.createProvider(),
    reserveQuota: async () => { quotaCalls++; return { success: true }; },
  });

  assert.strictEqual(outcome.result, 'FALLBACK_OK');
  assert.strictEqual(outcome.attemptedCount, 2);
  assert.strictEqual(outcome.quotaConsumedCount, 2);
  assert.strictEqual(quotaCalls, 2);
  assert.strictEqual(primaryCalls, 1);
  assert.strictEqual(fallbackCalls, 1);
});

await checkAsync('Groq Returns HTTP 503 -> OpenAI Fallback Succeeds', 'C', async () => {
  let quotaCalls = 0;
  let primaryCalls = 0;
  let fallbackCalls = 0;

  const candidates = [
    {
      providerName: 'groq',
      createProvider: () => ({
        providerName: 'groq',
        invoke: async () => {
          primaryCalls++;
          throw new ClinicAiProviderApiError('Service unavailable', { providerName: 'groq', statusCode: 503 });
        },
      }),
    },
    {
      providerName: 'openai',
      createProvider: () => ({
        providerName: 'openai',
        invoke: async () => { fallbackCalls++; return 'FALLBACK_OK'; },
      }),
    },
  ];

  const outcome = await executeMeteredProviderChain({
    candidates,
    createProvider: (c) => c.createProvider(),
    reserveQuota: async () => { quotaCalls++; return { success: true }; },
  });

  assert.strictEqual(outcome.result, 'FALLBACK_OK');
  assert.strictEqual(outcome.quotaConsumedCount, 2);
  assert.strictEqual(primaryCalls, 1);
  assert.strictEqual(fallbackCalls, 1);
});

await checkAsync('Groq Transport/Network Failure -> OpenAI Fallback Succeeds', 'D', async () => {
  let quotaCalls = 0;
  let primaryCalls = 0;
  let fallbackCalls = 0;

  const candidates = [
    {
      providerName: 'groq',
      createProvider: () => ({
        providerName: 'groq',
        invoke: async () => {
          primaryCalls++;
          throw new ClinicAiProviderApiError('Network connection refused', { providerName: 'groq', statusCode: undefined });
        },
      }),
    },
    {
      providerName: 'openai',
      createProvider: () => ({
        providerName: 'openai',
        invoke: async () => { fallbackCalls++; return 'FALLBACK_OK'; },
      }),
    },
  ];

  const outcome = await executeMeteredProviderChain({
    candidates,
    createProvider: (c) => c.createProvider(),
    reserveQuota: async () => { quotaCalls++; return { success: true }; },
  });

  assert.strictEqual(outcome.result, 'FALLBACK_OK');
  assert.strictEqual(outcome.quotaConsumedCount, 2);
  assert.strictEqual(primaryCalls, 1);
  assert.strictEqual(fallbackCalls, 1);
});

await checkAsync('Groq Timeout (408) -> OpenAI Fallback Succeeds', 'E', async () => {
  let quotaCalls = 0;
  let primaryCalls = 0;
  let fallbackCalls = 0;

  const candidates = [
    {
      providerName: 'groq',
      createProvider: () => ({
        providerName: 'groq',
        invoke: async () => {
          primaryCalls++;
          throw new ClinicAiProviderApiError('Request timed out', { providerName: 'groq', statusCode: 408 });
        },
      }),
    },
    {
      providerName: 'openai',
      createProvider: () => ({
        providerName: 'openai',
        invoke: async () => { fallbackCalls++; return 'FALLBACK_OK'; },
      }),
    },
  ];

  const outcome = await executeMeteredProviderChain({
    candidates,
    createProvider: (c) => c.createProvider(),
    reserveQuota: async () => { quotaCalls++; return { success: true }; },
  });

  assert.strictEqual(outcome.result, 'FALLBACK_OK');
  assert.strictEqual(outcome.quotaConsumedCount, 2);
  assert.strictEqual(primaryCalls, 1);
  assert.strictEqual(fallbackCalls, 1);
});

await checkAsync('Groq HTTP 400 Bad Request -> Fallback Stops', 'F', async () => {
  let quotaCalls = 0;
  let primaryCalls = 0;
  let fallbackCalls = 0;

  const candidates = [
    {
      providerName: 'groq',
      createProvider: () => ({
        providerName: 'groq',
        invoke: async () => {
          primaryCalls++;
          throw new ClinicAiProviderApiError('Bad request', { providerName: 'groq', statusCode: 400 });
        },
      }),
    },
    {
      providerName: 'openai',
      createProvider: () => ({
        providerName: 'openai',
        invoke: async () => { fallbackCalls++; return 'FALLBACK_OK'; },
      }),
    },
  ];

  const outcome = await executeMeteredProviderChain({
    candidates,
    createProvider: (c) => c.createProvider(),
    reserveQuota: async () => { quotaCalls++; return { success: true }; },
  });

  assert.strictEqual(outcome.result, undefined);
  assert.strictEqual(outcome.quotaConsumedCount, 1);
  assert.strictEqual(primaryCalls, 1);
  assert.strictEqual(fallbackCalls, 0);
  assert(outcome.lastError instanceof ClinicAiProviderApiError);
});

await checkAsync('Groq HTTP 401 Unauthorized -> Fallback Stops', 'G', async () => {
  let quotaCalls = 0;
  let primaryCalls = 0;
  let fallbackCalls = 0;

  const candidates = [
    {
      providerName: 'groq',
      createProvider: () => ({
        providerName: 'groq',
        invoke: async () => {
          primaryCalls++;
          throw new ClinicAiProviderApiError('Invalid key', { providerName: 'groq', statusCode: 401 });
        },
      }),
    },
    {
      providerName: 'openai',
      createProvider: () => ({
        providerName: 'openai',
        invoke: async () => { fallbackCalls++; return 'FALLBACK_OK'; },
      }),
    },
  ];

  const outcome = await executeMeteredProviderChain({
    candidates,
    createProvider: (c) => c.createProvider(),
    reserveQuota: async () => { quotaCalls++; return { success: true }; },
  });

  assert.strictEqual(outcome.result, undefined);
  assert.strictEqual(outcome.quotaConsumedCount, 1);
  assert.strictEqual(primaryCalls, 1);
  assert.strictEqual(fallbackCalls, 0);
});

await checkAsync('Groq HTTP 403 Forbidden -> Fallback Stops', 'H', async () => {
  let quotaCalls = 0;
  let primaryCalls = 0;
  let fallbackCalls = 0;

  const candidates = [
    {
      providerName: 'groq',
      createProvider: () => ({
        providerName: 'groq',
        invoke: async () => {
          primaryCalls++;
          throw new ClinicAiProviderApiError('Forbidden', { providerName: 'groq', statusCode: 403 });
        },
      }),
    },
    {
      providerName: 'openai',
      createProvider: () => ({
        providerName: 'openai',
        invoke: async () => { fallbackCalls++; return 'FALLBACK_OK'; },
      }),
    },
  ];

  const outcome = await executeMeteredProviderChain({
    candidates,
    createProvider: (c) => c.createProvider(),
    reserveQuota: async () => { quotaCalls++; return { success: true }; },
  });

  assert.strictEqual(outcome.result, undefined);
  assert.strictEqual(outcome.quotaConsumedCount, 1);
  assert.strictEqual(primaryCalls, 1);
  assert.strictEqual(fallbackCalls, 0);
});

await checkAsync('Groq Schema/Malformed Success Response -> Fallback Stops', 'I', async () => {
  let quotaCalls = 0;
  let primaryCalls = 0;
  let fallbackCalls = 0;

  const candidates = [
    {
      providerName: 'groq',
      createProvider: () => ({
        providerName: 'groq',
        invoke: async () => {
          primaryCalls++;
          throw new ClinicAiSchemaValidationError('Invalid JSON schema output');
        },
      }),
    },
    {
      providerName: 'openai',
      createProvider: () => ({
        providerName: 'openai',
        invoke: async () => { fallbackCalls++; return 'FALLBACK_OK'; },
      }),
    },
  ];

  const outcome = await executeMeteredProviderChain({
    candidates,
    createProvider: (c) => c.createProvider(),
    reserveQuota: async () => { quotaCalls++; return { success: true }; },
  });

  assert.strictEqual(outcome.result, undefined);
  assert.strictEqual(outcome.quotaConsumedCount, 1);
  assert.strictEqual(primaryCalls, 1);
  assert.strictEqual(fallbackCalls, 0);
  assert(outcome.lastError instanceof ClinicAiSchemaValidationError);
});

await checkAsync('Groq Missing Key (Skipped) + OpenAI Fallback Invoked', 'J', async () => {
  let quotaCalls = 0;
  let primaryCalls = 0;
  let fallbackCalls = 0;

  const candidates = [
    {
      providerName: 'groq',
      createProvider: () => {
        throw new ClinicAiProviderNotConfiguredError('Groq API key missing');
      },
    },
    {
      providerName: 'openai',
      createProvider: () => ({
        providerName: 'openai',
        invoke: async () => { fallbackCalls++; return 'OPENAI_OK'; },
      }),
    },
  ];

  const outcome = await executeMeteredProviderChain({
    candidates,
    createProvider: (c) => c.createProvider(),
    reserveQuota: async () => { quotaCalls++; return { success: true }; },
  });

  assert.strictEqual(outcome.result, 'OPENAI_OK');
  assert.strictEqual(outcome.attemptedCount, 1);
  assert.strictEqual(outcome.quotaConsumedCount, 1);
  assert.strictEqual(quotaCalls, 1);
  assert.strictEqual(primaryCalls, 0);
  assert.strictEqual(fallbackCalls, 1);
});

await checkAsync('No Valid Providers Configured', 'K', async () => {
  let quotaCalls = 0;
  let primaryCalls = 0;

  const candidates = [
    {
      providerName: 'groq',
      createProvider: () => {
        throw new ClinicAiProviderNotConfiguredError('Groq key missing');
      },
    },
  ];

  const outcome = await executeMeteredProviderChain({
    candidates,
    createProvider: (c) => c.createProvider(),
    reserveQuota: async () => { quotaCalls++; return { success: true }; },
  });

  assert.strictEqual(outcome.result, undefined);
  assert.strictEqual(outcome.attemptedCount, 0);
  assert.strictEqual(outcome.quotaConsumedCount, 0);
  assert.strictEqual(quotaCalls, 0);
  assert.strictEqual(primaryCalls, 0);
  assert(outcome.lastError instanceof ClinicAiProviderNotConfiguredError);
});

await checkAsync('Commercial Quota Denied Before First Invocation', 'L', async () => {
  let quotaCalls = 0;
  let primaryCalls = 0;

  const candidates = [
    {
      providerName: 'groq',
      createProvider: () => ({
        providerName: 'groq',
        invoke: async () => { primaryCalls++; return 'OK'; },
      }),
    },
  ];

  const outcome = await executeMeteredProviderChain({
    candidates,
    createProvider: (c) => c.createProvider(),
    reserveQuota: async () => {
      quotaCalls++;
      return { success: false, reason_code: 'AI_QUOTA_EXHAUSTED', message: 'Quota limit reached' };
    },
  });

  assert.strictEqual(outcome.result, undefined);
  assert.strictEqual(outcome.stoppedByQuota, true);
  assert.strictEqual(outcome.quotaStopReason?.reason_code, 'AI_QUOTA_EXHAUSTED');
  assert.strictEqual(outcome.attemptedCount, 0);
  assert.strictEqual(outcome.quotaConsumedCount, 0);
  assert.strictEqual(quotaCalls, 1);
  assert.strictEqual(primaryCalls, 0);
});

await checkAsync('Primary Invoked + Retryable Failure + Second Quota Denied', 'M', async () => {
  let quotaCalls = 0;
  let primaryCalls = 0;
  let fallbackCalls = 0;

  const candidates = [
    {
      providerName: 'groq',
      createProvider: () => ({
        providerName: 'groq',
        invoke: async () => {
          primaryCalls++;
          throw new ClinicAiProviderApiError('503 Service Unavailable', { providerName: 'groq', statusCode: 503 });
        },
      }),
    },
    {
      providerName: 'openai',
      createProvider: () => ({
        providerName: 'openai',
        invoke: async () => { fallbackCalls++; return 'FALLBACK_OK'; },
      }),
    },
  ];

  const outcome = await executeMeteredProviderChain({
    candidates,
    createProvider: (c) => c.createProvider(),
    reserveQuota: async () => {
      quotaCalls++;
      if (quotaCalls === 1) return { success: true };
      return { success: false, reason_code: 'AI_QUOTA_EXHAUSTED', message: 'Quota exhausted on second try' };
    },
  });

  assert.strictEqual(outcome.result, undefined);
  assert.strictEqual(outcome.stoppedByQuota, true);
  assert.strictEqual(outcome.quotaStopReason?.reason_code, 'AI_QUOTA_EXHAUSTED');
  assert.strictEqual(outcome.attemptedCount, 1);
  assert.strictEqual(outcome.quotaConsumedCount, 1);
  assert.strictEqual(quotaCalls, 2);
  assert.strictEqual(primaryCalls, 1);
  assert.strictEqual(fallbackCalls, 0);
});

await checkAsync('Fallback Disabled + Retryable Primary Failure', 'N', async () => {
  let quotaCalls = 0;
  let primaryCalls = 0;

  const candidates = [
    {
      providerName: 'groq',
      createProvider: () => ({
        providerName: 'groq',
        invoke: async () => {
          primaryCalls++;
          throw new ClinicAiProviderApiError('Rate limited', { providerName: 'groq', statusCode: 429 });
        },
      }),
    },
  ];

  const outcome = await executeMeteredProviderChain({
    candidates,
    createProvider: (c) => c.createProvider(),
    reserveQuota: async () => { quotaCalls++; return { success: true }; },
  });

  assert.strictEqual(outcome.result, undefined);
  assert.strictEqual(outcome.attemptedCount, 1);
  assert.strictEqual(outcome.quotaConsumedCount, 1);
  assert.strictEqual(quotaCalls, 1);
  assert.strictEqual(primaryCalls, 1);
});

await checkAsync('Commercial Authority / RPC Technical Error Before Primary Invocation', 'O', async () => {
  let quotaCalls = 0;
  let primaryCalls = 0;
  let fallbackCalls = 0;

  const candidates = [
    {
      providerName: 'groq',
      createProvider: () => ({
        providerName: 'groq',
        invoke: async () => { primaryCalls++; return 'OK'; },
      }),
    },
    {
      providerName: 'openai',
      createProvider: () => ({
        providerName: 'openai',
        invoke: async () => { fallbackCalls++; return 'FALLBACK'; },
      }),
    },
  ];

  const outcome = await executeMeteredProviderChain({
    candidates,
    createProvider: (c) => c.createProvider(),
    reserveQuota: async () => {
      quotaCalls++;
      // Simulating Edge Function reserveQuota callback when Supabase RPC returns error
      return {
        success: false,
        reason_code: 'COMMERCIAL_NOT_ELIGIBLE',
        message: 'Commercial entitlement check failed.',
      };
    },
  });

  assert.strictEqual(outcome.result, undefined);
  assert.strictEqual(outcome.stoppedByQuota, true);
  assert.strictEqual(outcome.quotaStopReason?.reason_code, 'COMMERCIAL_NOT_ELIGIBLE');
  assert.strictEqual(outcome.quotaStopReason?.status, 403);
  assert.strictEqual(outcome.quotaStopReason?.message, 'Commercial entitlement check failed.');
  assert.strictEqual(outcome.attemptedCount, 0);
  assert.strictEqual(outcome.quotaConsumedCount, 0);
  assert.strictEqual(quotaCalls, 1);
  assert.strictEqual(primaryCalls, 0);
  assert.strictEqual(fallbackCalls, 0);
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log('');
console.log(`=== MULTI-PROVIDER BEHAVIORAL QA: ${passed} PASSED, ${failed} FAILED ===`);
console.log(`BEHAVIORAL_EXECUTABLE_CASE_COUNT=${executedCases.length}`);
console.log(`EXECUTED_ROUTING_CASES=${executedCases.join(',')}`);

if (failed > 0) {
  process.exit(1);
}
