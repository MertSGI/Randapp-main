// ============================================================================
// Clinic AI Assist — Provider Abstraction (Shared Edge Function Layer)
//
// Provider-neutral interfaces for transcription and SOAP draft generation.
// Factories FAIL CLOSED when no real provider is configured.
// A deterministic fake provider is ONLY used in unit/integration tests.
// ============================================================================

// ---------------------------------------------------------------------------
// Transcription Provider Interface
// ---------------------------------------------------------------------------

export interface ClinicTranscriptionProviderRequest {
  audio: Uint8Array;
  mimeType: string;
  locale?: string;
  requestContext: {
    tenantId: string;
    staffId: string;
    encounterId?: string;
  };
}

export interface ClinicTranscriptionProviderResult {
  transcript: string;
  detectedLanguage?: string;
  providerRequestId?: string;
}

export interface ClinicTranscriptionProvider {
  transcribe(
    request: ClinicTranscriptionProviderRequest
  ): Promise<ClinicTranscriptionProviderResult>;
}

// ---------------------------------------------------------------------------
// SOAP Draft Provider Interface
// ---------------------------------------------------------------------------

export interface ClinicSoapDraftProviderRequest {
  transcript: string;
  encounterReason?: string;
  locale?: string;
  requestContext: {
    tenantId: string;
    staffId: string;
    encounterId?: string;
  };
}

export interface ClinicSoapDraftProviderResult {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  warnings?: string[];
}

export interface ClinicSoapDraftProvider {
  generateDraft(
    request: ClinicSoapDraftProviderRequest
  ): Promise<ClinicSoapDraftProviderResult>;
}

// ---------------------------------------------------------------------------
// Clinical AI Safety System Prompt
// ---------------------------------------------------------------------------

/**
 * The canonical system instruction for SOAP draft generation.
 * Enforces the assistive structuring contract — no invented data.
 */
export const CLINIC_AI_DRAFT_SYSTEM_PROMPT = `You are a clinical documentation assistant that structures dictated notes into SOAP format.

STRICT RULES:
- Structure ONLY information explicitly present in the clinician's dictation/input.
- Do NOT invent observations, vital signs, or physical examination findings.
- Do NOT invent diagnoses or differential diagnoses.
- Do NOT invent medications, dosages, or treatment plans.
- Do NOT invent allergies or medical history.
- Do NOT infer certainty that was not spoken. Preserve uncertainty (e.g., "possible", "likely").
- Leave SOAP fields BLANK (empty string) when the dictation does not contain relevant information for that field.
- Do NOT add clinical recommendations not present in the dictation.
- This is a DRAFT for clinician review, NOT a finalized medical record.

OUTPUT FORMAT:
Return a valid JSON object with exactly these fields:
{
  "subjective": "...",
  "objective": "...",
  "assessment": "...",
  "plan": "...",
  "warnings": ["optional warning strings if applicable"]
}

If a field has no corresponding dictation content, set it to an empty string "".
Respond ONLY with the JSON object. No additional text.`;

// ---------------------------------------------------------------------------
// Audio Constraints (Server-Side)
// ---------------------------------------------------------------------------

/** Maximum audio payload size in bytes (10 MB). */
export const MAX_AUDIO_PAYLOAD_BYTES = 10 * 1024 * 1024;

/** Allowed audio MIME types for transcription. */
export const SUPPORTED_AUDIO_MIMES: ReadonlySet<string> = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/wav',
  'audio/mpeg',
]);

// ---------------------------------------------------------------------------
// Provider Factory — Fail-Closed
// ---------------------------------------------------------------------------

/**
 * Creates a transcription provider based on server environment configuration.
 * FAILS CLOSED with AI_PROVIDER_NOT_CONFIGURED when no provider is set up.
 *
 * Real provider implementations would be added here as separate modules
 * (e.g., Google Cloud Speech-to-Text, OpenAI Whisper).
 */
export function createTranscriptionProvider(): ClinicTranscriptionProvider {
  const providerName = Deno.env.get('CLINIC_AI_TRANSCRIPTION_PROVIDER');
  const apiKey = Deno.env.get('CLINIC_AI_TRANSCRIPTION_API_KEY');

  if (!providerName || providerName === 'none' || !apiKey || apiKey.startsWith('replace_with_')) {
    throw new ClinicAiProviderNotConfiguredError('Transcription provider is not configured.');
  }

  // Future: switch on providerName to instantiate real providers
  // e.g., case 'google_speech': return new GoogleSpeechProvider(apiKey);
  // e.g., case 'openai_whisper': return new OpenAIWhisperProvider(apiKey);

  throw new ClinicAiProviderNotConfiguredError(
    `Unknown transcription provider: ${providerName}. No real provider implementation available.`
  );
}

/**
 * Creates a SOAP draft provider based on server environment configuration.
 * FAILS CLOSED with AI_PROVIDER_NOT_CONFIGURED when no provider is set up.
 */
export function createSoapDraftProvider(): ClinicSoapDraftProvider {
  const providerName = Deno.env.get('CLINIC_AI_DRAFT_PROVIDER');
  const apiKey = Deno.env.get('CLINIC_AI_DRAFT_API_KEY');

  if (!providerName || providerName === 'none' || !apiKey || apiKey.startsWith('replace_with_')) {
    throw new ClinicAiProviderNotConfiguredError('SOAP draft provider is not configured.');
  }

  // Future: switch on providerName to instantiate real providers
  // e.g., case 'gemini': return new GeminiDraftProvider(apiKey);
  // e.g., case 'openai': return new OpenAIDraftProvider(apiKey);

  throw new ClinicAiProviderNotConfiguredError(
    `Unknown SOAP draft provider: ${providerName}. No real provider implementation available.`
  );
}

// ---------------------------------------------------------------------------
// Error Class
// ---------------------------------------------------------------------------

export class ClinicAiProviderNotConfiguredError extends Error {
  public readonly code = 'AI_PROVIDER_NOT_CONFIGURED' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ClinicAiProviderNotConfiguredError';
  }
}
