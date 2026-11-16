import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  requestTranscription,
  requestSoapDraft,
  getClinicAiAssistAvailability,
  MAX_AUDIO_PAYLOAD_BYTES,
  MAX_TRANSCRIPT_LENGTH,
} from './clinicAiAssistService.ts';

export async function runClinicAiAssistServiceTests(): Promise<void> {
  // 1. Static invariants: no persistent browser storage, no clinical encounter writes
  const source = fs.readFileSync(path.join(process.cwd(), 'services', 'clinicAiAssistService.ts'), 'utf8');
  assert.equal(source.includes('localStorage'), false);
  assert.equal(source.includes('sessionStorage'), false);
  assert.equal(source.includes('indexedDB'), false);
  assert.equal(source.includes('saveClinicEncounterNote'), false);
  assert.equal(source.includes('completeClinicEncounter'), false);

  let invokerCalled = false;
  const neverCalledInvoker = async () => {
    invokerCalled = true;
    return { data: null, error: null };
  };

  // 2. Fail-closed in local mode and when Edge AI flag is disabled (default 0-TL mode)
  const defaultAvail = getClinicAiAssistAvailability({ mode: 'local' });
  assert.equal(defaultAvail.availabilityTier, 'DISABLED_EXTERNAL_HOLD');
  assert.equal(defaultAvail.isAvailable, false);

  const supaDefaultAvail = getClinicAiAssistAvailability({ mode: 'supabase' });
  assert.equal(supaDefaultAvail.availabilityTier, 'DISABLED_EXTERNAL_HOLD');
  assert.equal(supaDefaultAvail.isAvailable, false);

  const sampleAudio = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' });
  const localTranscribe = await requestTranscription(sampleAudio, 'audio/webm', 'tr', {
    mode: 'local',
    invoker: neverCalledInvoker,
  });
  assert.equal(localTranscribe.success, false);
  assert.equal(localTranscribe.availabilityTier, 'DISABLED_EXTERNAL_HOLD');
  assert.equal(localTranscribe.error?.code, 'AI_PROVIDER_NOT_CONFIGURED');

  const supaUnactivatedDraft = await requestSoapDraft('Hasta baş ağrısı tarif ediyor.', 'Kontrol', {
    mode: 'supabase',
    allowEdgeInvocation: false,
    invoker: neverCalledInvoker,
  });
  assert.equal(supaUnactivatedDraft.success, false);
  assert.equal(supaUnactivatedDraft.availabilityTier, 'DISABLED_EXTERNAL_HOLD');
  assert.equal(supaUnactivatedDraft.error?.code, 'AI_PROVIDER_NOT_CONFIGURED');
  assert.equal(invokerCalled, false, 'Fail-closed mode must never invoke edge function');

  // 3. Client-side payload validation before edge invocation (zero wasted quota)
  const emptyAudio = new Blob([], { type: 'audio/webm' });
  const emptyAudioRes = await requestTranscription(emptyAudio, 'audio/webm', 'tr', {
    mode: 'supabase',
    allowEdgeInvocation: true,
    invoker: neverCalledInvoker,
  });
  assert.equal(emptyAudioRes.success, false);
  assert.equal(emptyAudioRes.error?.code, 'UNSUPPORTED_MIME');

  const oversizedBlob = { size: MAX_AUDIO_PAYLOAD_BYTES + 1, type: 'audio/webm' } as unknown as Blob;
  const oversizedRes = await requestTranscription(oversizedBlob, 'audio/webm', 'tr', {
    mode: 'supabase',
    allowEdgeInvocation: true,
    invoker: neverCalledInvoker,
  });
  assert.equal(oversizedRes.success, false);
  assert.equal(oversizedRes.error?.code, 'PAYLOAD_TOO_LARGE');

  const badMimeRes = await requestTranscription(sampleAudio, 'application/exe', 'tr', {
    mode: 'supabase',
    allowEdgeInvocation: true,
    invoker: neverCalledInvoker,
  });
  assert.equal(badMimeRes.success, false);
  assert.equal(badMimeRes.error?.code, 'UNSUPPORTED_MIME');

  const blankTranscriptRes = await requestSoapDraft('   ', undefined, {
    mode: 'supabase',
    allowEdgeInvocation: true,
    invoker: neverCalledInvoker,
  });
  assert.equal(blankTranscriptRes.success, false);
  assert.equal(blankTranscriptRes.error?.code, 'DRAFT_GENERATION_FAILED');

  const longTranscriptRes = await requestSoapDraft('a'.repeat(MAX_TRANSCRIPT_LENGTH + 1), undefined, {
    mode: 'supabase',
    allowEdgeInvocation: true,
    invoker: neverCalledInvoker,
  });
  assert.equal(longTranscriptRes.success, false);
  assert.equal(longTranscriptRes.error?.code, 'PAYLOAD_TOO_LARGE');
  assert.equal(invokerCalled, false, 'Validation failures must block before edge invocation');

  // 4. Deterministic mock edge invocation & error normalization
  const mockTranscribeInvoker = async (fnName: string) => {
    assert.equal(fnName, 'clinic-ai-transcribe');
    return {
      data: {
        success: true,
        data: {
          transcript: 'Sentetik klinik dikte metni.',
          detectedLanguage: 'tr',
          providerRequestId: 'req_synth_1',
        },
      },
      error: null,
    };
  };
  const okTranscribe = await requestTranscription(sampleAudio, 'audio/webm', 'tr', {
    mode: 'supabase',
    allowEdgeInvocation: true,
    invoker: mockTranscribeInvoker,
  });
  assert.equal(okTranscribe.success, true);
  assert.equal(okTranscribe.data?.transcript, 'Sentetik klinik dikte metni.');
  assert.equal(okTranscribe.data?.detectedLanguage, 'tr');

  const mockDraftInvoker = async (fnName: string) => {
    assert.equal(fnName, 'clinic-ai-draft');
    return {
      data: {
        success: true,
        data: {
          subjective: 'Baş ağrısı',
          objective: '',
          assessment: '',
          plan: 'Hekim değerlendirmesi',
          warnings: ['Hekim onayı gereklidir.'],
        },
      },
      error: null,
    };
  };
  const okDraft = await requestSoapDraft('Sentetik klinik dikte metni.', 'Baş ağrısı', {
    mode: 'supabase',
    allowEdgeInvocation: true,
    invoker: mockDraftInvoker,
  });
  assert.equal(okDraft.success, true);
  assert.equal(okDraft.data?.subjective, 'Baş ağrısı');
  assert.equal(okDraft.data?.warnings?.length, 1);

  const errorInvoker = async () => ({
    data: null,
    error: { message: 'Edge returned 403 FORBIDDEN' },
  });
  const forbiddenRes = await requestSoapDraft('Test transcript', undefined, {
    mode: 'supabase',
    allowEdgeInvocation: true,
    invoker: errorInvoker,
  });
  assert.equal(forbiddenRes.success, false);
  assert.equal(forbiddenRes.error?.code, 'FORBIDDEN');

  console.log('[PASS] clinicAiAssistService tests verified');
}

await runClinicAiAssistServiceTests();
