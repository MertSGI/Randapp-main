import assert from 'node:assert/strict';
import {
  HealthTourismAiService,
  getHealthTourismAiAvailability,
} from './healthTourismAiService.ts';

export async function runHealthTourismAiServiceTests(): Promise<void> {
  let fetchCalled = false;
  const neverCalledFetcher = (async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }) as typeof fetch;

  // 1. Default/local/unactivated mode is DISABLED_EXTERNAL_HOLD and never calls network
  const localAvail = getHealthTourismAiAvailability({ mode: 'local' });
  assert.equal(localAvail.availabilityTier, 'DISABLED_EXTERNAL_HOLD');
  assert.equal(localAvail.isAvailable, false);

  const localService = new HealthTourismAiService({
    mode: 'local',
    fetcher: neverCalledFetcher,
  });
  const localRes = await localService.sendMessage({
    tenant_slug: 'synth-clinic',
    message: 'Hello, I have an inquiry.',
  });
  assert.equal(localRes.success, false);
  assert.equal(localRes.error?.code, 'AI_EXTERNAL_HOLD');

  const disabledSupaService = new HealthTourismAiService({
    mode: 'supabase',
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon-key',
    edgeEnabled: false,
    fetcher: neverCalledFetcher,
  });
  const disabledRes = await disabledSupaService.sendMessage({
    tenant_slug: 'synth-clinic',
    message: 'Hello',
  });
  assert.equal(disabledRes.success, false);
  assert.equal(disabledRes.error?.code, 'AI_PROVIDER_UNAVAILABLE');

  // 2. Missing supabase credentials fail closed before fetch
  const missingConfigService = new HealthTourismAiService({
    mode: 'supabase',
    supabaseUrl: '',
    supabaseAnonKey: '',
    edgeEnabled: true,
    fetcher: neverCalledFetcher,
  });
  const missingConfigRes = await missingConfigService.sendMessage({
    tenant_slug: 'synth-clinic',
    message: 'Hello',
  });
  assert.equal(missingConfigRes.success, false);
  assert.equal(missingConfigRes.error?.code, 'AI_PROVIDER_UNAVAILABLE');

  // 3. Input validation (blank message, >2000 chars, invalid country_code, empty slug) fails closed before fetch
  const enabledTestService = new HealthTourismAiService({
    mode: 'supabase',
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon-key',
    edgeEnabled: true,
    fetcher: neverCalledFetcher,
  });

  const emptySlugRes = await enabledTestService.sendMessage({
    tenant_slug: '   ',
    message: 'Hello',
  });
  assert.equal(emptySlugRes.success, false);
  assert.equal(emptySlugRes.error?.code, 'INVALID_INPUT');

  const emptyMsgRes = await enabledTestService.sendMessage({
    tenant_slug: 'synth-clinic',
    message: '   ',
  });
  assert.equal(emptyMsgRes.success, false);
  assert.equal(emptyMsgRes.error?.code, 'INVALID_INPUT');

  const overlongMsgRes = await enabledTestService.sendMessage({
    tenant_slug: 'synth-clinic',
    message: 'x'.repeat(2001),
  });
  assert.equal(overlongMsgRes.success, false);
  assert.equal(overlongMsgRes.error?.code, 'INVALID_INPUT');

  const badCountryRes = await enabledTestService.sendMessage({
    tenant_slug: 'synth-clinic',
    message: 'Hello',
    country_code: 'XX',
  });
  assert.equal(badCountryRes.success, false);
  assert.equal(badCountryRes.error?.code, 'INVALID_INPUT');

  const missingSessionHandoff = await enabledTestService.requestHumanHandoff('', 'synth-clinic');
  assert.equal(missingSessionHandoff.success, false);
  assert.equal(missingSessionHandoff.error?.code, 'INVALID_SESSION');

  assert.equal(fetchCalled, false, 'Fail-closed and validation paths must never invoke fetcher');

  // 4. Deterministic mock Edge response & error normalization
  let capturedUrl = '';
  let capturedBody: Record<string, unknown> | null = null;
  const mockFetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init?.body || '{}'));
    return new Response(
      JSON.stringify({
        success: true,
        session_token: 'sess_synth_123',
        reply: 'I can help collect your contact details and request a human coordinator handoff.',
        conversation_id: 'conv_synth_123',
        handoff_triggered: false,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const happyService = new HealthTourismAiService({
    mode: 'supabase',
    supabaseUrl: 'https://example.supabase.co/',
    supabaseAnonKey: 'anon-key',
    edgeEnabled: true,
    fetcher: mockFetcher,
  });
  const okRes = await happyService.sendMessage({
    tenant_slug: 'Synth-Clinic',
    message: '  Can you explain the intake process?  ',
    preferred_language: 'en',
    country_code: 'de',
  });
  assert.equal(okRes.success, true);
  assert.equal(okRes.session_token, 'sess_synth_123');
  assert.equal(capturedUrl, 'https://example.supabase.co/functions/v1/ht-ai-chat');
  assert.equal(capturedBody?.tenant_slug, 'synth-clinic');
  assert.equal(capturedBody?.country_code, 'DE');

  // Non-2xx error mapping
  const failService = new HealthTourismAiService({
    mode: 'supabase',
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon-key',
    edgeEnabled: true,
    fetcher: (async () =>
      new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many requests.' } }), {
        status: 429,
      })) as typeof fetch,
  });
  const rlRes = await failService.sendMessage({
    tenant_slug: 'synth-clinic',
    message: 'Hello',
  });
  assert.equal(rlRes.success, false);
  assert.equal(rlRes.error?.code, 'RATE_LIMITED');

  console.log('[PASS] healthTourismAiService tests verified');
}

await runHealthTourismAiServiceTests();
