import assert from 'node:assert/strict';
import { handleAiEdgeScaffoldRequest } from '../supabase/functions/_shared/aiEdgePolicy.ts';
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
  validateAndNormalizeSoapDraft,
} from '../supabase/functions/_shared/clinicAiAssistProvider.ts';
import {
  isProviderReplyGrounded,
  buildGroundedReplacementResponse,
  executeProviderCall,
  resolveHtAiProviderConfig,
} from '../supabase/functions/ht-ai-chat/provider-policy.ts';
import {
  handleClinicAiTranscribeRequest,
  handleClinicAiDraftRequest,
} from '../supabase/functions/_shared/clinicAiEdgeHandlers.ts';
import { handleHtAiChatRequest } from '../supabase/functions/ht-ai-chat/handler.ts';

export async function runEdgeAiPolicyTests() {
  // 1. Phase 3 AI edge scaffolds fail closed (401, 400, 405, 503 EXTERNAL_HOLD)
  for (const featureName of ['ai-quota-check', 'ai-recommendation', 'ai-visualization']) {
    const requiresPrompt = featureName !== 'ai-quota-check';

    const getRes = await handleAiEdgeScaffoldRequest(
      new Request('https://edge.local/test', { method: 'GET' }),
      { featureName, requiresPrompt, getEnv: () => undefined }
    );
    assert.equal(getRes.status, 405);

    const unauthRes = await handleAiEdgeScaffoldRequest(
      new Request('https://edge.local/test', {
        method: 'POST',
        body: JSON.stringify({ tenantId: 't1', prompt: 'hello' }),
      }),
      { featureName, requiresPrompt, getEnv: () => undefined }
    );
    assert.equal(unauthRes.status, 401);
    const unauthJson = await unauthRes.json();
    assert.equal(unauthJson.allowed, false);
    assert.equal(unauthJson.availabilityTier, 'DISABLED_EXTERNAL_HOLD');

    const badBodyRes = await handleAiEdgeScaffoldRequest(
      new Request('https://edge.local/test', {
        method: 'POST',
        headers: { Authorization: 'Bearer synth-jwt' },
        body: JSON.stringify({}),
      }),
      { featureName, requiresPrompt, getEnv: () => undefined }
    );
    assert.equal(badBodyRes.status, 400);

    const noKeyRes = await handleAiEdgeScaffoldRequest(
      new Request('https://edge.local/test', {
        method: 'POST',
        headers: { Authorization: 'Bearer synth-jwt' },
        body: JSON.stringify({ tenantId: 't1', prompt: 'hello' }),
      }),
      { featureName, requiresPrompt, getEnv: () => undefined }
    );
    assert.equal(noKeyRes.status, 503);
    const noKeyJson = await noKeyRes.json();
    assert.equal(noKeyJson.success, false);
    assert.equal(noKeyJson.allowed, false);
    assert.equal(noKeyJson.availabilityTier, 'DISABLED_EXTERNAL_HOLD');
    assert.equal(noKeyJson.error.code, 'AI_PROVIDER_NOT_CONFIGURED');

    const unverifiedEntitlementRes = await handleAiEdgeScaffoldRequest(
      new Request('https://edge.local/test', {
        method: 'POST',
        headers: { Authorization: 'Bearer synth-jwt' },
        body: JSON.stringify({ tenantId: 't1', prompt: 'hello' }),
      }),
      {
        featureName,
        requiresPrompt,
        getEnv: (k) => (k === 'GEMINI_API_KEY' ? 'test-server-key' : k === 'AI_FEATURES_LIVE_ENABLED' ? 'true' : undefined),
      }
    );
    assert.equal(unverifiedEntitlementRes.status, 503);
    const unverJson = await unverifiedEntitlementRes.json();
    assert.equal(unverJson.error.code, 'AI_ENTITLEMENT_UNVERIFIED');
  }

  // 2. Clinic AI Assist provider fail-closed & deterministic orchestration (zero live calls)
  assert.throws(() => new GroqTranscriptionProvider(''), ClinicAiProviderNotConfiguredError);
  assert.throws(() => new GroqSoapDraftProvider('replace_with_key'), ClinicAiProviderNotConfiguredError);
  assert.throws(() => new OpenAiTranscriptionProvider(''), ClinicAiProviderNotConfiguredError);
  assert.throws(() => new OpenAiSoapDraftProvider(''), ClinicAiProviderNotConfiguredError);

  const validSoap = validateAndNormalizeSoapDraft({
    subjective: '  Baş ağrısı  ',
    objective: '',
    assessment: 'Değerlendirme bekleniyor',
    plan: 'Takip',
    warnings: ['Hekim onayı gerekir'],
  });
  assert.equal(validSoap.subjective, 'Baş ağrısı');
  assert.throws(() => validateAndNormalizeSoapDraft({ subjective: 'missing fields' }));

  const oldEnv = { ...process.env };
  try {
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.CLINIC_AI_TRANSCRIPTION_PROVIDER = 'unknown_provider';
    assert.throws(() => resolveTranscriptionCandidates(), ClinicAiProviderNotConfiguredError);

    process.env.CLINIC_AI_TRANSCRIPTION_PROVIDER = 'groq';
    process.env.CLINIC_AI_DRAFT_PROVIDER = 'groq';
    const candidates = resolveSoapDraftCandidates();
    assert.equal(candidates.length, 1);
    assert.throws(() => candidates[0].createProvider(), ClinicAiProviderNotConfiguredError);
  } finally {
    process.env = oldEnv;
  }

  // Metered provider chain: quota denial stops before provider invocation
  let invoked = false;
  const quotaStopped = await executeMeteredProviderChain({
    candidates: [
      {
        providerName: 'groq',
        createProvider: () => ({
          providerName: 'groq',
          invoke: async () => {
            invoked = true;
            return 'OK';
          },
        }),
      },
    ],
    createProvider: (c) => c.createProvider(),
    reserveQuota: async () => ({
      success: false,
      reason_code: 'AI_QUOTA_EXHAUSTED',
      message: 'Quota exceeded',
    }),
  });
  assert.equal(invoked, false);
  assert.equal(quotaStopped.stoppedByQuota, true);
  assert.equal(quotaStopped.quotaStopReason?.status, 429);

  // Retryable primary failure + fallback
  let primaryCalled = 0;
  let fallbackCalled = 0;
  const fallbackOutcome = await executeMeteredProviderChain({
    candidates: [
      {
        providerName: 'groq',
        createProvider: () => ({
          providerName: 'groq',
          invoke: async () => {
            primaryCalled++;
            throw new ClinicAiProviderApiError('Timeout', { providerName: 'groq', statusCode: 503 });
          },
        }),
      },
      {
        providerName: 'openai',
        createProvider: () => ({
          providerName: 'openai',
          invoke: async () => {
            fallbackCalled++;
            return 'FALLBACK_SUCCESS';
          },
        }),
      },
    ],
    createProvider: (c) => c.createProvider(),
    reserveQuota: async () => ({ success: true }),
  });
  assert.equal(primaryCalled, 1);
  assert.equal(fallbackCalled, 1);
  assert.equal(fallbackOutcome.result, 'FALLBACK_SUCCESS');

  // 4. Deterministic HTTP checks via mock Request/env without network calls
  await runEdgeAiPolicyTestsPart2();
}

async function runEdgeAiPolicyTestsPart2() {
  assert.equal(
    isProviderReplyGrounded('A coordinator will contact you usually by email or phone.'),
    false
  );
  assert.equal(
    isProviderReplyGrounded('Please upload your passport so our partner clinics can process your visa.'),
    false
  );
  assert.equal(
    isProviderReplyGrounded('Talebinizi özetlememe ve bir insan koordinatör yönlendirmesi talep etmenize yardımcı olabilirim.'),
    true
  );
  assert.ok(buildGroundedReplacementResponse('tr').includes('koordinatör'));

  const noKeyProviderRes = await executeProviderCall({
    aiApiKey: undefined,
    message: 'Hello',
    buildSystemPrompt: (lang) => `Prompt ${lang}`,
  });
  assert.equal(noKeyProviderRes.success, false);
  assert.equal(noKeyProviderRes.statusCode, 503);
  assert.equal(noKeyProviderRes.errorCode, 'AI_PROVIDER_UNAVAILABLE');

  // 5. ADIM038-AI-001: Allowlisted provider/key matching & unknown provider rejection before fetch
  const dualKeysEnv = {
    GROQ_API_KEY: 'groq-secret-only',
    OPENAI_API_KEY: 'openai-secret-only',
  };

  const openaiResolved = resolveHtAiProviderConfig((k) =>
    k === 'HT_AI_CHAT_PROVIDER' ? 'openai' : dualKeysEnv[k]
  );
  assert.equal(openaiResolved.supported, true);
  assert.equal(openaiResolved.provider, 'openai');
  assert.equal(openaiResolved.apiKey, 'openai-secret-only');

  const groqResolved = resolveHtAiProviderConfig((k) =>
    k === 'HT_AI_CHAT_PROVIDER' ? 'groq' : dualKeysEnv[k]
  );
  assert.equal(groqResolved.supported, true);
  assert.equal(groqResolved.provider, 'groq');
  assert.equal(groqResolved.apiKey, 'groq-secret-only');

  // OpenAI selected without OPENAI_API_KEY must NEVER fall back to GROQ_API_KEY
  const openaiNoOwnKey = resolveHtAiProviderConfig((k) =>
    k === 'HT_AI_CHAT_PROVIDER' ? 'openai' : k === 'GROQ_API_KEY' ? 'groq-secret-only' : undefined
  );
  assert.equal(openaiNoOwnKey.supported, true);
  assert.equal(openaiNoOwnKey.provider, 'openai');
  assert.equal(openaiNoOwnKey.apiKey, undefined);

  // Unknown/typo provider fails closed in resolver AND in executeProviderCall before fetch
  const unknownResolved = resolveHtAiProviderConfig((k) =>
    k === 'HT_AI_CHAT_PROVIDER' ? 'grok' : dualKeysEnv[k]
  );
  assert.equal(unknownResolved.supported, false);
  assert.equal(unknownResolved.apiKey, undefined);

  let typoFetchCalls = 0;
  const typoRes = await executeProviderCall({
    aiProvider: 'grok',
    aiApiKey: 'should-never-be-sent',
    message: 'Hello',
    fetchImpl: (async () => {
      typoFetchCalls++;
      return new Response('{}', { status: 200 });
    }),
    buildSystemPrompt: (lang) => `Prompt ${lang}`,
  });
  assert.equal(typoFetchCalls, 0);
  assert.equal(typoRes.success, false);
  assert.equal(typoRes.statusCode, 503);
  assert.equal(typoRes.errorCode, 'AI_PROVIDER_UNAVAILABLE');

  // Verify openai uses api.openai.com with OPENAI_API_KEY and groq uses api.groq.com with GROQ_API_KEY
  const seenCalls = [];
  const captureFetch = (async (url, init) => {
    seenCalls.push({ url: String(url), auth: init?.headers?.Authorization });
    return new Response(
      JSON.stringify({ choices: [{ message: { content: 'I can help summarize your inquiry.' } }] }),
      { status: 200 }
    );
  });

  const okOpenAi = await executeProviderCall({
    aiProvider: openaiResolved.provider,
    aiApiKey: openaiResolved.apiKey,
    aiModel: openaiResolved.model,
    message: 'Hello',
    fetchImpl: captureFetch,
    buildSystemPrompt: (lang) => `Prompt ${lang}`,
  });
  assert.equal(okOpenAi.success, true);
  assert.equal(seenCalls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(seenCalls[0].auth, 'Bearer openai-secret-only');

  const okGroq = await executeProviderCall({
    aiProvider: groqResolved.provider,
    aiApiKey: groqResolved.apiKey,
    aiModel: groqResolved.model,
    message: 'Hello',
    fetchImpl: captureFetch,
    buildSystemPrompt: (lang) => `Prompt ${lang}`,
  });
  assert.equal(okGroq.success, true);
  assert.equal(seenCalls[1].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(seenCalls[1].auth, 'Bearer groq-secret-only');

  // 6. ADIM038-AI-002: CLINIC_AI_FALLBACK_ENABLED defaults to false (PAID_FALLBACK=DISABLED)
  for (const flagValue of [undefined, 'false']) {
    const fetchUrls = [];
    const mockRetryableFetch = (async (url) => {
      fetchUrls.push(String(url));
      return new Response(JSON.stringify({ error: 'Service Unavailable' }), { status: 503 });
    });

    const envMap = {
      GROQ_API_KEY: 'groq-key',
      OPENAI_API_KEY: 'openai-key',
      CLINIC_AI_TRANSCRIPTION_PROVIDER: 'groq',
      CLINIC_AI_TRANSCRIPTION_FALLBACK_PROVIDER: 'openai',
      CLINIC_AI_DRAFT_PROVIDER: 'groq',
      CLINIC_AI_DRAFT_FALLBACK_PROVIDER: 'openai',
      ...(flagValue !== undefined ? { CLINIC_AI_FALLBACK_ENABLED: flagValue } : {}),
    };
    const getEnv = (k) => envMap[k];

    const transCandidates = resolveTranscriptionCandidates(mockRetryableFetch, getEnv);
    const draftCandidates = resolveSoapDraftCandidates(mockRetryableFetch, getEnv);
    assert.equal(transCandidates.length, 1);
    assert.equal(transCandidates[0].providerName, 'groq');
    assert.equal(draftCandidates.length, 1);
    assert.equal(draftCandidates[0].providerName, 'groq');

    let quotaCalls = 0;
    const chainRes = await executeMeteredProviderChain({
      candidates: draftCandidates,
      createProvider: (c) => {
        const p = c.createProvider();
        return {
          providerName: p.providerName,
          invoke: () => p.generateDraft({
            transcript: 'Patient reports headache.',
            requestContext: { tenantId: 't1', staffId: 's1' },
          }),
        };
      },
      reserveQuota: async () => {
        quotaCalls++;
        return { success: true };
      },
    });
    assert.equal(quotaCalls, 1);
    assert.equal(chainRes.attemptedCount, 1);
    assert.equal(fetchUrls.length, 1);
    assert.ok(fetchUrls[0].includes('api.groq.com'));
  }

  // Only when CLINIC_AI_FALLBACK_ENABLED === 'true' should fallback execute on retryable 503
  {
    const fetchUrls = [];
    const fallbackFetch = (async (url) => {
      const urlStr = String(url);
      fetchUrls.push(urlStr);
      if (urlStr.includes('api.groq.com')) {
        return new Response(JSON.stringify({ error: 'Service Unavailable' }), { status: 503 });
      }
      return new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                subjective: 'Headache',
                objective: '',
                assessment: '',
                plan: 'Follow-up',
                warnings: [],
              }),
            },
          }],
        }),
        { status: 200 }
      );
    });

    const envMap = {
      GROQ_API_KEY: 'groq-key',
      OPENAI_API_KEY: 'openai-key',
      CLINIC_AI_TRANSCRIPTION_PROVIDER: 'groq',
      CLINIC_AI_TRANSCRIPTION_FALLBACK_PROVIDER: 'openai',
      CLINIC_AI_DRAFT_PROVIDER: 'groq',
      CLINIC_AI_DRAFT_FALLBACK_PROVIDER: 'openai',
      CLINIC_AI_FALLBACK_ENABLED: 'true',
    };
    const getEnv = (k) => envMap[k];

    assert.equal(resolveTranscriptionCandidates(fallbackFetch, getEnv).length, 2);
    const draftCandidates = resolveSoapDraftCandidates(fallbackFetch, getEnv);
    assert.equal(draftCandidates.length, 2);

    let quotaCalls = 0;
    const chainRes = await executeMeteredProviderChain({
      candidates: draftCandidates,
      createProvider: (c) => {
        const p = c.createProvider();
        return {
          providerName: p.providerName,
          invoke: () => p.generateDraft({
            transcript: 'Patient reports headache.',
            requestContext: { tenantId: 't1', staffId: 's1' },
          }),
        };
      },
      reserveQuota: async () => {
        quotaCalls++;
        return { success: true };
      },
    });
    assert.equal(quotaCalls, 2);
    assert.equal(chainRes.attemptedCount, 2);
    assert.equal(chainRes.result?.subjective, 'Headache');
    assert.equal(fetchUrls.length, 2);
    assert.ok(fetchUrls[0].includes('api.groq.com'));
    assert.ok(fetchUrls[1].includes('api.openai.com'));
  }

  // 7. ADIM038-AI-003: clinic-ai-transcribe & clinic-ai-draft require CLINIC_AI_LIVE_ENABLED=true
  for (const liveFlag of [undefined, 'false']) {
    let clinicRpcCalls = 0;
    let clinicFetchCalls = 0;
    let clinicClientCreated = 0;

    const clinicEnv = {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      GROQ_API_KEY: 'groq-secret',
      OPENAI_API_KEY: 'openai-secret',
      ...(liveFlag !== undefined ? { CLINIC_AI_LIVE_ENABLED: liveFlag } : {}),
    };

    const mockDeps = {
      getEnv: (k) => clinicEnv[k],
      createSupabaseClient: () => {
        clinicClientCreated++;
        return {
          auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
          rpc: async () => {
            clinicRpcCalls++;
            return { data: [{ tenant_id: 't1', staff_id: 's1', can_write_clinical_notes: true }], error: null };
          },
        };
      },
      fetchImpl: (async () => {
        clinicFetchCalls++;
        return new Response('{}', { status: 200 });
      }),
    };

    const transcribeForm = new FormData();
    transcribeForm.append('audio', new File([new Uint8Array([1, 2, 3])], 'note.webm', { type: 'audio/webm' }));
    const transcribeRes = await handleClinicAiTranscribeRequest(
      new Request('https://edge.local/clinic-ai-transcribe', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-jwt' },
        body: transcribeForm,
      }),
      mockDeps
    );
    assert.equal(transcribeRes.status, 503);
    const transcribeJson = await transcribeRes.json();
    assert.equal(transcribeJson.success, false);
    assert.equal(transcribeJson.error.code, 'DISABLED_EXTERNAL_HOLD');

    const draftRes = await handleClinicAiDraftRequest(
      new Request('https://edge.local/clinic-ai-draft', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-jwt',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcript: 'Patient feels better.' }),
      }),
      mockDeps
    );
    assert.equal(draftRes.status, 503);
    const draftJson = await draftRes.json();
    assert.equal(draftJson.success, false);
    assert.equal(draftJson.error.code, 'DISABLED_EXTERNAL_HOLD');

    assert.equal(clinicClientCreated, 0);
    assert.equal(clinicRpcCalls, 0);
    assert.equal(clinicFetchCalls, 0);
  }

  // 8. ADIM038-AI-004: ht-ai-chat requires HT_AI_CHAT_LIVE_ENABLED=true before RPC or fetch
  for (const liveFlag of [undefined, 'false']) {
    let htClientCreated = 0;
    let htDbOrRpcCalls = 0;
    let htFetchCalls = 0;

    const htEnv = {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      HT_RATE_LIMIT_HASH_KEY: 'hash-key',
      GROQ_API_KEY: 'groq-secret',
      OPENAI_API_KEY: 'openai-secret',
      HT_AI_CHAT_PROVIDER: 'openai',
      ...(liveFlag !== undefined ? { HT_AI_CHAT_LIVE_ENABLED: liveFlag } : {}),
    };

    const htRes = await handleHtAiChatRequest(
      new Request('https://edge.local/ht-ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: 'synth-clinic',
          message: 'Hello, tell me about your intake process.',
        }),
      }),
      {
        getEnv: (k) => htEnv[k],
        createSupabaseClient: () => {
          htClientCreated++;
          return {
            from: () => {
              htDbOrRpcCalls++;
              return {
                select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
                delete: () => ({ eq: async () => ({ error: null }) }),
              };
            },
            rpc: async () => {
              htDbOrRpcCalls++;
              return { data: { allowed: true }, error: null };
            },
          };
        },
        fetchImpl: (async () => {
          htFetchCalls++;
          return new Response('{}', { status: 200 });
        }),
      }
    );

    assert.equal(htRes.status, 503);
    const htJson = await htRes.json();
    assert.equal(htJson.success, false);
    assert.equal(htJson.error.code, 'DISABLED_EXTERNAL_HOLD');
    assert.equal(htClientCreated, 0);
    assert.equal(htDbOrRpcCalls, 0);
    assert.equal(htFetchCalls, 0);
  }

  // When HT_AI_CHAT_LIVE_ENABLED=true but provider is unknown/typo, handler must reject before fetch
  {
    let htTypoFetchCalls = 0;
    const htLiveUnknownProviderEnv = {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      HT_RATE_LIMIT_HASH_KEY: 'hash-key',
      GROQ_API_KEY: 'groq-secret',
      OPENAI_API_KEY: 'openai-secret',
      HT_AI_CHAT_LIVE_ENABLED: 'true',
      HT_AI_CHAT_PROVIDER: 'grok',
    };

    const htTypoRes = await handleHtAiChatRequest(
      new Request('https://edge.local/ht-ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: 'synth-clinic',
          message: 'How does the intake process work?',
        }),
      }),
      {
        getEnv: (k) => htLiveUnknownProviderEnv[k],
        createSupabaseClient: () => ({
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'tenant-1',
                    status: 'active',
                    verification_status: 'verified',
                    public_site_status: 'published',
                  },
                }),
              }),
            }),
            delete: () => ({ eq: async () => ({ error: null }) }),
          }),
          rpc: async (fn) => {
            if (fn === 'ht_check_rate_limit') return { data: { allowed: true }, error: null };
            if (fn === 'ht_create_ai_conversation') {
              return { data: { success: true, conversation_id: 'conv-1', session_token: 'sess-1' }, error: null };
            }
            return { data: { success: true }, error: null };
          },
        }),
        fetchImpl: (async () => {
          htTypoFetchCalls++;
          return new Response('{}', { status: 200 });
        }),
      }
    );

    assert.equal(htTypoRes.status, 503);
    const htTypoJson = await htTypoRes.json();
    assert.equal(htTypoJson.error.code, 'AI_PROVIDER_UNAVAILABLE');
    assert.equal(htTypoFetchCalls, 0);
  }

  console.log('[PASS] Edge AI fail-closed & grounding policy tests verified');
}

await runEdgeAiPolicyTests();
