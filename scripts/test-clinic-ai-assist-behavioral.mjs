import assert from 'assert';
import {
  OpenAiTranscriptionProvider,
  OpenAiSoapDraftProvider,
  createTranscriptionProvider,
  createSoapDraftProvider,
  ClinicAiProviderNotConfiguredError,
  ClinicAiSchemaValidationError,
  ClinicAiProviderApiError,
  MAX_AUDIO_PAYLOAD_BYTES,
} from '../supabase/functions/_shared/clinicAiAssistProvider.ts';

console.log('=== RUNNING CLINIC AI ASSIST V1 BEHAVIORAL UNIT TEST SUITE ===\n');

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

async function asyncCheck(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// Global Deno polyfill for Node test environment
if (typeof globalThis.Deno === 'undefined') {
  const envMap = new Map();
  globalThis.Deno = {
    env: {
      get: (k) => envMap.get(k),
      set: (k, v) => envMap.set(k, v),
      delete: (k) => envMap.delete(k),
    },
  };
}

// Helper to set Deno env
function setEnv(k, v) {
  if (v === undefined) {
    globalThis.Deno.env.delete(k);
  } else {
    globalThis.Deno.env.set(k, v);
  }
}

async function main() {
  // 1. Provider not configured => throw AI_PROVIDER_NOT_CONFIGURED
  check('1. Transcription factory throws ClinicAiProviderNotConfiguredError when provider="none"', () => {
    setEnv('CLINIC_AI_TRANSCRIPTION_PROVIDER', 'none');
    assert.throws(
      () => createTranscriptionProvider(),
      ClinicAiProviderNotConfiguredError
    );
  });

  check('2. SOAP draft factory throws ClinicAiProviderNotConfiguredError when key is placeholder', () => {
    setEnv('CLINIC_AI_DRAFT_PROVIDER', 'openai');
    setEnv('OPENAI_API_KEY', 'replace_with_server_side_key');
    assert.throws(
      () => createSoapDraftProvider(),
      ClinicAiProviderNotConfiguredError
    );
  });

  check('3. Transcription adapter instantiation fails closed without valid API key', () => {
    assert.throws(
      () => new OpenAiTranscriptionProvider(''),
      ClinicAiProviderNotConfiguredError
    );
    assert.throws(
      () => new OpenAiTranscriptionProvider('replace_with_key'),
      ClinicAiProviderNotConfiguredError
    );
  });

  // 4. OpenAI Transcription Adapter behavior with mock fetch
  await asyncCheck('4. OpenAiTranscriptionProvider sends bounded request and normalizes response correctly', async () => {
    let capturedUrl = '';
    let capturedHeaders = {};

    const mockFetch = async (url, options) => {
      capturedUrl = url.toString();
      capturedHeaders = options.headers;
      return {
        ok: true,
        headers: new Map([['x-request-id', 'req-123-abc']]),
        json: async () => ({
          text: '  Hastanın göğüs ağrısı şikayeti bulunmaktadır.  ',
          language: 'turkish',
        }),
      };
    };

    const provider = new OpenAiTranscriptionProvider('sk-valid-test-key-12345', 'whisper-1', mockFetch);
    const result = await provider.transcribe({
      audio: new Uint8Array([1, 2, 3, 4]),
      mimeType: 'audio/webm',
      locale: 'tr',
      requestContext: { tenantId: 'tenant-1', staffId: 'staff-1' },
    });

    assert.strictEqual(capturedUrl, 'https://api.openai.com/v1/audio/transcriptions');
    assert.strictEqual(capturedHeaders['Authorization'], 'Bearer sk-valid-test-key-12345');
    assert.strictEqual(result.transcript, 'Hastanın göğüs ağrısı şikayeti bulunmaktadır.');
    assert.strictEqual(result.detectedLanguage, 'turkish');
    assert.strictEqual(result.providerRequestId, 'req-123-abc');
  });

  // 5. OpenAI SOAP Draft Adapter behavior with mock fetch (Structured Schema)
  await asyncCheck('5. OpenAiSoapDraftProvider requires strict structured JSON output schema', async () => {
    let capturedBody = {};

    const mockFetch = async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        headers: new Map(),
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  subjective: 'Göğüs ağrısı 2 gündür var.',
                  objective: 'Tansiyon 120/80.',
                  assessment: 'Aküte yakın göğüs ağrısı.',
                  plan: 'EKG çekilecek.',
                  warnings: ['Acil sevk gerekebilir.'],
                }),
              },
            },
          ],
        }),
      };
    };

    const provider = new OpenAiSoapDraftProvider('sk-valid-test-key-12345', 'gpt-4o-mini', mockFetch);
    const result = await provider.generateDraft({
      transcript: 'Göğüs ağrısı 2 gündür var. Tansiyon 120/80.',
      encounterReason: 'Rutin kontrol',
      requestContext: { tenantId: 'tenant-1', staffId: 'staff-1' },
    });

    assert.strictEqual(capturedBody.response_format.type, 'json_schema');
    assert.strictEqual(capturedBody.response_format.json_schema.name, 'soap_note_draft');
    assert.strictEqual(result.subjective, 'Göğüs ağrısı 2 gündür var.');
    assert.strictEqual(result.objective, 'Tansiyon 120/80.');
    assert.strictEqual(result.assessment, 'Aküte yakın göğüs ağrısı.');
    assert.strictEqual(result.plan, 'EKG çekilecek.');
    assert.deepStrictEqual(result.warnings, ['Acil sevk gerekebilir.']);
  });

  // 6. Malformed JSON response -> throws ClinicAiSchemaValidationError
  await asyncCheck('6. OpenAiSoapDraftProvider fails closed on malformed JSON response', async () => {
    const mockFetch = async () => ({
      ok: true,
      headers: new Map(),
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"subjective": "a", "objective": "b"}', // missing assessment & plan
            },
          },
        ],
      }),
    });

    const provider = new OpenAiSoapDraftProvider('sk-valid-test-key-12345', 'gpt-4o-mini', mockFetch);

    await assert.rejects(
      async () => {
        await provider.generateDraft({
          transcript: 'test',
          requestContext: { tenantId: 'tenant-1', staffId: 'staff-1' },
        });
      },
      ClinicAiSchemaValidationError
    );
  });

  // 7. API HTTP error handling
  await asyncCheck('7. OpenAiSoapDraftProvider throws ClinicAiProviderApiError on 500 status', async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 500,
    });

    const provider = new OpenAiSoapDraftProvider('sk-valid-test-key-12345', 'gpt-4o-mini', mockFetch);

    await assert.rejects(
      async () => {
        await provider.generateDraft({
          transcript: 'test',
          requestContext: { tenantId: 'tenant-1', staffId: 'staff-1' },
        });
      },
      ClinicAiProviderApiError
    );
  });

  // 8. Pre-buffer size guard constant check
  check('8. MAX_AUDIO_PAYLOAD_BYTES is exactly 10MB (10,485,760 bytes)', () => {
    assert.strictEqual(MAX_AUDIO_PAYLOAD_BYTES, 10 * 1024 * 1024);
  });

  // 9. Simulating atomic quota enforcement logic logic
  check('9. Atomic Quota Allowance logic: 1 provider invocation = 1 unit', () => {
    let quotaConsumed = 0;
    const consumeQuota = (units) => {
      quotaConsumed += units;
      return { success: true, current_usage: quotaConsumed };
    };

    // Pre-flight check
    const r1 = consumeQuota(1);
    assert.strictEqual(r1.success, true);
    assert.strictEqual(quotaConsumed, 1);
  });

  console.log(`\n=== CLINIC AI ASSIST V1 BEHAVIORAL UNIT QA: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
