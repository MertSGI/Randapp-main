// ============================================================================
// Clinic AI Assist — Multi-Provider Resilience Abstraction (Groq + OpenAI)
//
// Shared server-side layer for Supabase Edge Functions.
// Conforms strictly to ClinicTranscriptionProvider and ClinicSoapDraftProvider.
// Implements Groq primary provider adapters and OpenAI fallback adapters with
// safe error handling, timeout bounds, and candidate resolution chain.
// ============================================================================

// ---------------------------------------------------------------------------
// Transcription Provider Interface & Request/Result Types
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
  readonly providerName: string;
  transcribe(
    request: ClinicTranscriptionProviderRequest
  ): Promise<ClinicTranscriptionProviderResult>;
}

// ---------------------------------------------------------------------------
// SOAP Draft Provider Interface & Request/Result Types
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
  readonly providerName: string;
  generateDraft(
    request: ClinicSoapDraftProviderRequest
  ): Promise<ClinicSoapDraftProviderResult>;
}

// ---------------------------------------------------------------------------
// Clinical AI Safety System Prompt
// ---------------------------------------------------------------------------

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

/** Default provider HTTP timeout in milliseconds (30s). */
export const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;

/** Allowed audio MIME types for transcription. */
export const SUPPORTED_AUDIO_MIMES: ReadonlySet<string> = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/wav',
  'audio/mpeg',
  'audio/mp3',
]);

// ---------------------------------------------------------------------------
// Custom Errors
// ---------------------------------------------------------------------------

export class ClinicAiProviderNotConfiguredError extends Error {
  public readonly code = 'AI_PROVIDER_NOT_CONFIGURED' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ClinicAiProviderNotConfiguredError';
  }
}

export class ClinicAiSchemaValidationError extends Error {
  public readonly code = 'AI_SCHEMA_VALIDATION_FAILED' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ClinicAiSchemaValidationError';
  }
}

export class ClinicAiProviderApiError extends Error {
  public readonly code = 'AI_PROVIDER_API_ERROR' as const;
  public readonly providerName: string;
  public readonly statusCode?: number;
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    options: {
      providerName: string;
      statusCode?: number;
      isRetryable?: boolean;
    }
  ) {
    super(message);
    this.name = 'ClinicAiProviderApiError';
    this.providerName = options.providerName;
    this.statusCode = options.statusCode;
    this.isRetryable = options.isRetryable ?? isStatusRetryable(options.statusCode);
  }
}

export function isStatusRetryable(statusCode?: number): boolean {
  if (!statusCode) return true; // Network/timeout transport error is retryable
  if (statusCode === 408 || statusCode === 429) return true;
  if (statusCode >= 500 && statusCode <= 599) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Groq Transcription Provider Adapter
// ---------------------------------------------------------------------------

export class GroqTranscriptionProvider implements ClinicTranscriptionProvider {
  public readonly providerName = 'groq';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    apiKey: string,
    model: string = 'whisper-large-v3-turbo',
    fetchImpl: typeof fetch = fetch
  ) {
    if (!apiKey || apiKey.startsWith('replace_with_')) {
      throw new ClinicAiProviderNotConfiguredError('Groq API key is missing or invalid.');
    }
    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl;
  }

  async transcribe(
    request: ClinicTranscriptionProviderRequest
  ): Promise<ClinicTranscriptionProviderResult> {
    const ext = getExtensionFromMime(request.mimeType);
    const blob = new Blob([request.audio], { type: request.mimeType });

    const formData = new FormData();
    formData.append('file', blob, `audio.${ext}`);
    formData.append('model', this.model);
    if (request.locale) {
      formData.append('language', request.locale);
    }
    formData.append('response_format', 'verbose_json');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_PROVIDER_TIMEOUT_MS);

    try {
      const res = await this.fetchImpl('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new ClinicAiProviderApiError(`Groq transcription API returned status ${res.status}`, {
          providerName: 'groq',
          statusCode: res.status,
        });
      }

      const data = await res.json();
      if (!data || typeof data.text !== 'string') {
        throw new ClinicAiSchemaValidationError('Malformed response from Groq transcription API.');
      }

      const xGroqId = data?.x_groq?.id || res.headers.get('x-groq-id') || res.headers.get('x-request-id') || undefined;

      return {
        transcript: data.text.trim(),
        detectedLanguage: data.language || undefined,
        providerRequestId: xGroqId,
      };
    } catch (err: unknown) {
      if (err instanceof ClinicAiProviderApiError || err instanceof ClinicAiSchemaValidationError) {
        throw err;
      }
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      throw new ClinicAiProviderApiError(
        isTimeout ? 'Groq transcription request timed out.' : 'Groq transcription transport error.',
        {
          providerName: 'groq',
          statusCode: isTimeout ? 408 : undefined,
          isRetryable: true,
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ---------------------------------------------------------------------------
// Groq SOAP Draft Provider Adapter (Strict JSON Schema Output)
// ---------------------------------------------------------------------------

export class GroqSoapDraftProvider implements ClinicSoapDraftProvider {
  public readonly providerName = 'groq';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    apiKey: string,
    model: string = 'openai/gpt-oss-120b',
    fetchImpl: typeof fetch = fetch
  ) {
    if (!apiKey || apiKey.startsWith('replace_with_')) {
      throw new ClinicAiProviderNotConfiguredError('Groq API key is missing or invalid.');
    }
    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl;
  }

  async generateDraft(
    request: ClinicSoapDraftProviderRequest
  ): Promise<ClinicSoapDraftProviderResult> {
    let userPrompt = `Dictated encounter transcript:\n"${request.transcript}"`;
    if (request.encounterReason) {
      userPrompt += `\n\nEncounter Reason / Visit Complaint:\n"${request.encounterReason}"`;
    }

    const payload = {
      model: this.model,
      messages: [
        { role: 'system', content: CLINIC_AI_DRAFT_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'soap_note_draft',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              subjective: { type: 'string' },
              objective: { type: 'string' },
              assessment: { type: 'string' },
              plan: { type: 'string' },
              warnings: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['subjective', 'objective', 'assessment', 'plan', 'warnings'],
            additionalProperties: false,
          },
        },
      },
      temperature: 0.1,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_PROVIDER_TIMEOUT_MS);

    try {
      const res = await this.fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new ClinicAiProviderApiError(`Groq chat completion API returned status ${res.status}`, {
          providerName: 'groq',
          statusCode: res.status,
        });
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new ClinicAiSchemaValidationError('Empty content choice from Groq draft API.');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new ClinicAiSchemaValidationError('Failed to parse Groq JSON output string.');
      }

      return validateAndNormalizeSoapDraft(parsed);
    } catch (err: unknown) {
      if (err instanceof ClinicAiProviderApiError || err instanceof ClinicAiSchemaValidationError) {
        throw err;
      }
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      throw new ClinicAiProviderApiError(
        isTimeout ? 'Groq draft request timed out.' : 'Groq draft transport error.',
        {
          providerName: 'groq',
          statusCode: isTimeout ? 408 : undefined,
          isRetryable: true,
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAI Transcription Provider Adapter
// ---------------------------------------------------------------------------

export class OpenAiTranscriptionProvider implements ClinicTranscriptionProvider {
  public readonly providerName = 'openai';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    apiKey: string,
    model: string = 'whisper-1',
    fetchImpl: typeof fetch = fetch
  ) {
    if (!apiKey || apiKey.startsWith('replace_with_')) {
      throw new ClinicAiProviderNotConfiguredError('OpenAI API key is missing or invalid.');
    }
    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl;
  }

  async transcribe(
    request: ClinicTranscriptionProviderRequest
  ): Promise<ClinicTranscriptionProviderResult> {
    const ext = getExtensionFromMime(request.mimeType);
    const blob = new Blob([request.audio], { type: request.mimeType });

    const formData = new FormData();
    formData.append('file', blob, `audio.${ext}`);
    formData.append('model', this.model);
    if (request.locale) {
      formData.append('language', request.locale);
    }
    formData.append('response_format', 'verbose_json');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_PROVIDER_TIMEOUT_MS);

    try {
      const res = await this.fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new ClinicAiProviderApiError(`OpenAI transcription API returned status ${res.status}`, {
          providerName: 'openai',
          statusCode: res.status,
        });
      }

      const data = await res.json();
      if (!data || typeof data.text !== 'string') {
        throw new ClinicAiSchemaValidationError('Malformed response from OpenAI transcription API.');
      }

      return {
        transcript: data.text.trim(),
        detectedLanguage: data.language || undefined,
        providerRequestId: res.headers.get('x-request-id') || undefined,
      };
    } catch (err: unknown) {
      if (err instanceof ClinicAiProviderApiError || err instanceof ClinicAiSchemaValidationError) {
        throw err;
      }
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      throw new ClinicAiProviderApiError(
        isTimeout ? 'OpenAI transcription request timed out.' : 'OpenAI transcription transport error.',
        {
          providerName: 'openai',
          statusCode: isTimeout ? 408 : undefined,
          isRetryable: true,
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAI SOAP Draft Provider Adapter (Structured Output)
// ---------------------------------------------------------------------------

export class OpenAiSoapDraftProvider implements ClinicSoapDraftProvider {
  public readonly providerName = 'openai';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    apiKey: string,
    model: string = 'gpt-4o-mini',
    fetchImpl: typeof fetch = fetch
  ) {
    if (!apiKey || apiKey.startsWith('replace_with_')) {
      throw new ClinicAiProviderNotConfiguredError('OpenAI API key is missing or invalid.');
    }
    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl;
  }

  async generateDraft(
    request: ClinicSoapDraftProviderRequest
  ): Promise<ClinicSoapDraftProviderResult> {
    let userPrompt = `Dictated encounter transcript:\n"${request.transcript}"`;
    if (request.encounterReason) {
      userPrompt += `\n\nEncounter Reason / Visit Complaint:\n"${request.encounterReason}"`;
    }

    const payload = {
      model: this.model,
      messages: [
        { role: 'system', content: CLINIC_AI_DRAFT_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'soap_note_draft',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              subjective: { type: 'string' },
              objective: { type: 'string' },
              assessment: { type: 'string' },
              plan: { type: 'string' },
              warnings: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['subjective', 'objective', 'assessment', 'plan', 'warnings'],
            additionalProperties: false,
          },
        },
      },
      temperature: 0.1,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_PROVIDER_TIMEOUT_MS);

    try {
      const res = await this.fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new ClinicAiProviderApiError(`OpenAI chat completion API returned status ${res.status}`, {
          providerName: 'openai',
          statusCode: res.status,
        });
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new ClinicAiSchemaValidationError('Empty content choice from OpenAI draft API.');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new ClinicAiSchemaValidationError('Failed to parse OpenAI JSON output string.');
      }

      return validateAndNormalizeSoapDraft(parsed);
    } catch (err: unknown) {
      if (err instanceof ClinicAiProviderApiError || err instanceof ClinicAiSchemaValidationError) {
        throw err;
      }
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      throw new ClinicAiProviderApiError(
        isTimeout ? 'OpenAI draft request timed out.' : 'OpenAI draft transport error.',
        {
          providerName: 'openai',
          statusCode: isTimeout ? 408 : undefined,
          isRetryable: true,
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public validateAndNormalizeSoapDraft(obj: unknown): ClinicSoapDraftProviderResult {
    return validateAndNormalizeSoapDraft(obj);
  }
}

// ---------------------------------------------------------------------------
// Helpers & Validation
// ---------------------------------------------------------------------------

export function validateAndNormalizeSoapDraft(obj: unknown): ClinicSoapDraftProviderResult {
  if (!obj || typeof obj !== 'object') {
    throw new ClinicAiSchemaValidationError('SOAP draft output is not an object.');
  }

  const record = obj as Record<string, unknown>;

  if (typeof record.subjective !== 'string') {
    throw new ClinicAiSchemaValidationError('SOAP draft missing required string property "subjective".');
  }
  if (typeof record.objective !== 'string') {
    throw new ClinicAiSchemaValidationError('SOAP draft missing required string property "objective".');
  }
  if (typeof record.assessment !== 'string') {
    throw new ClinicAiSchemaValidationError('SOAP draft missing required string property "assessment".');
  }
  if (typeof record.plan !== 'string') {
    throw new ClinicAiSchemaValidationError('SOAP draft missing required string property "plan".');
  }

  let warnings: string[] = [];
  if (Array.isArray(record.warnings)) {
    warnings = record.warnings.filter((w): w is string => typeof w === 'string');
  }

  return {
    subjective: record.subjective.trim(),
    objective: record.objective.trim(),
    assessment: record.assessment.trim(),
    plan: record.plan.trim(),
    warnings,
  };
}

export function getExtensionFromMime(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  return 'webm';
}

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

function getEnvVar(key: string): string | undefined {
  if (typeof Deno !== 'undefined') {
    return Deno.env.get(key);
  }
  const nodeProcess = (
    globalThis as {
      process?: {
        env?: Record<string, string | undefined>;
      };
    }
  ).process;
  return nodeProcess?.env?.[key];
}

// ---------------------------------------------------------------------------
// Candidate Chain Resolution (Primary + Optional Fallback)
// ---------------------------------------------------------------------------

export interface TranscriptionCandidate {
  providerName: string;
  createProvider(): ClinicTranscriptionProvider;
}

export interface SoapDraftCandidate {
  providerName: string;
  createProvider(): ClinicSoapDraftProvider;
}

export function resolveTranscriptionCandidates(
  fetchImpl: typeof fetch = fetch
): TranscriptionCandidate[] {
  const primaryProviderName = getEnvVar('CLINIC_AI_TRANSCRIPTION_PROVIDER') || getEnvVar('OPENAI_TRANSCRIPTION_PROVIDER') || 'groq';
  const primaryModel = getEnvVar('CLINIC_AI_TRANSCRIPTION_MODEL') || (primaryProviderName === 'openai' ? 'whisper-1' : 'whisper-large-v3-turbo');

  const fallbackEnabled = (getEnvVar('CLINIC_AI_FALLBACK_ENABLED') ?? 'true') === 'true';
  const fallbackProviderName = getEnvVar('CLINIC_AI_TRANSCRIPTION_FALLBACK_PROVIDER');
  const configuredFallbackModel = getEnvVar('CLINIC_AI_TRANSCRIPTION_FALLBACK_MODEL');

  // Validation: Check for invalid primary provider name (Fail Closed)
  if (primaryProviderName !== 'groq' && primaryProviderName !== 'openai' && primaryProviderName !== 'none') {
    throw new ClinicAiProviderNotConfiguredError(`Unknown transcription provider: ${primaryProviderName}. No provider implementation available.`);
  }

  // Validation: Check for invalid fallback provider name if fallback is enabled (Fail Closed)
  if (fallbackEnabled && fallbackProviderName && fallbackProviderName !== 'groq' && fallbackProviderName !== 'openai' && fallbackProviderName !== 'none') {
    throw new ClinicAiProviderNotConfiguredError(`Unknown fallback transcription provider: ${fallbackProviderName}. No provider implementation available.`);
  }

  const candidates: TranscriptionCandidate[] = [];

  // Primary Candidate
  if (primaryProviderName === 'groq') {
    const groqKey = getEnvVar('GROQ_API_KEY');
    candidates.push({
      providerName: 'groq',
      createProvider: () => new GroqTranscriptionProvider(groqKey || '', primaryModel, fetchImpl),
    });
  } else if (primaryProviderName === 'openai') {
    const openAiKey = getEnvVar('OPENAI_API_KEY') || getEnvVar('CLINIC_AI_TRANSCRIPTION_API_KEY');
    candidates.push({
      providerName: 'openai',
      createProvider: () => new OpenAiTranscriptionProvider(openAiKey || '', primaryModel, fetchImpl),
    });
  }

  // Fallback Candidate (if enabled and valid)
  if (fallbackEnabled && fallbackProviderName && fallbackProviderName !== primaryProviderName && fallbackProviderName !== 'none') {
    const fallbackModel = configuredFallbackModel || (fallbackProviderName === 'openai' ? 'whisper-1' : 'whisper-large-v3-turbo');
    if (fallbackProviderName === 'openai') {
      const openAiKey = getEnvVar('OPENAI_API_KEY') || getEnvVar('CLINIC_AI_TRANSCRIPTION_API_KEY');
      candidates.push({
        providerName: 'openai',
        createProvider: () => new OpenAiTranscriptionProvider(openAiKey || '', fallbackModel, fetchImpl),
      });
    } else if (fallbackProviderName === 'groq') {
      const groqKey = getEnvVar('GROQ_API_KEY');
      candidates.push({
        providerName: 'groq',
        createProvider: () => new GroqTranscriptionProvider(groqKey || '', fallbackModel, fetchImpl),
      });
    }
  }

  return candidates;
}

export function resolveSoapDraftCandidates(
  fetchImpl: typeof fetch = fetch
): SoapDraftCandidate[] {
  const primaryProviderName = getEnvVar('CLINIC_AI_DRAFT_PROVIDER') || getEnvVar('OPENAI_DRAFT_PROVIDER') || 'groq';
  const primaryModel = getEnvVar('CLINIC_AI_DRAFT_MODEL') || (primaryProviderName === 'openai' ? 'gpt-4o-mini' : 'openai/gpt-oss-120b');

  const fallbackEnabled = (getEnvVar('CLINIC_AI_FALLBACK_ENABLED') ?? 'true') === 'true';
  const fallbackProviderName = getEnvVar('CLINIC_AI_DRAFT_FALLBACK_PROVIDER');
  const configuredFallbackModel = getEnvVar('CLINIC_AI_DRAFT_FALLBACK_MODEL');

  // Validation: Check for invalid primary provider name (Fail Closed)
  if (primaryProviderName !== 'groq' && primaryProviderName !== 'openai' && primaryProviderName !== 'none') {
    throw new ClinicAiProviderNotConfiguredError(`Unknown SOAP draft provider: ${primaryProviderName}. No provider implementation available.`);
  }

  // Validation: Check for invalid fallback provider name if fallback is enabled (Fail Closed)
  if (fallbackEnabled && fallbackProviderName && fallbackProviderName !== 'groq' && fallbackProviderName !== 'openai' && fallbackProviderName !== 'none') {
    throw new ClinicAiProviderNotConfiguredError(`Unknown fallback SOAP draft provider: ${fallbackProviderName}. No provider implementation available.`);
  }

  const candidates: SoapDraftCandidate[] = [];

  // Primary Candidate
  if (primaryProviderName === 'groq') {
    const groqKey = getEnvVar('GROQ_API_KEY');
    candidates.push({
      providerName: 'groq',
      createProvider: () => new GroqSoapDraftProvider(groqKey || '', primaryModel, fetchImpl),
    });
  } else if (primaryProviderName === 'openai') {
    const openAiKey = getEnvVar('OPENAI_API_KEY') || getEnvVar('CLINIC_AI_DRAFT_API_KEY');
    candidates.push({
      providerName: 'openai',
      createProvider: () => new OpenAiSoapDraftProvider(openAiKey || '', primaryModel, fetchImpl),
    });
  }

  // Fallback Candidate (if enabled and valid)
  if (fallbackEnabled && fallbackProviderName && fallbackProviderName !== primaryProviderName && fallbackProviderName !== 'none') {
    const fallbackModel = configuredFallbackModel || (fallbackProviderName === 'openai' ? 'gpt-4o-mini' : 'openai/gpt-oss-120b');
    if (fallbackProviderName === 'openai') {
      const openAiKey = getEnvVar('OPENAI_API_KEY') || getEnvVar('CLINIC_AI_DRAFT_API_KEY');
      candidates.push({
        providerName: 'openai',
        createProvider: () => new OpenAiSoapDraftProvider(openAiKey || '', fallbackModel, fetchImpl),
      });
    } else if (fallbackProviderName === 'groq') {
      const groqKey = getEnvVar('GROQ_API_KEY');
      candidates.push({
        providerName: 'groq',
        createProvider: () => new GroqSoapDraftProvider(groqKey || '', fallbackModel, fetchImpl),
      });
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Shared Metered Provider Chain Orchestration Helper
// ---------------------------------------------------------------------------

export interface MeteredChainOptions<TCandidate, TResult> {
  candidates: TCandidate[];
  createProvider(candidate: TCandidate): { providerName: string; invoke(): Promise<TResult> };
  reserveQuota(): Promise<{ success: boolean; reason_code?: string; message?: string }>;
}

export interface MeteredChainResult<TResult> {
  result?: TResult;
  lastError?: unknown;
  attemptedCount: number;
  quotaConsumedCount: number;
  stoppedByQuota?: boolean;
  quotaStopReason?: { reason_code: string; message: string; status: number };
}

export async function executeMeteredProviderChain<TCandidate, TResult>(
  options: MeteredChainOptions<TCandidate, TResult>
): Promise<MeteredChainResult<TResult>> {
  let lastError: unknown = null;
  let successfulResult: TResult | undefined = undefined;
  let attemptedCount = 0;
  let quotaConsumedCount = 0;

  for (const candidate of options.candidates) {
    let providerEntry;
    try {
      providerEntry = options.createProvider(candidate);
    } catch (err) {
      if (err instanceof ClinicAiProviderNotConfiguredError) {
        lastError = err;
        continue;
      }
      throw err;
    }

    const quotaRes = await options.reserveQuota();
    if (!quotaRes || !quotaRes.success) {
      const reason_code = quotaRes?.reason_code || 'AI_NOT_ENTITLED';
      const message = quotaRes?.message || 'AI operation not allowed under commercial policy.';
      const status = reason_code === 'AI_QUOTA_EXHAUSTED' ? 429 : 403;
      return {
        result: undefined,
        lastError,
        attemptedCount,
        quotaConsumedCount,
        stoppedByQuota: true,
        quotaStopReason: { reason_code, message, status },
      };
    }

    quotaConsumedCount++;
    attemptedCount++;

    try {
      successfulResult = await providerEntry.invoke();
      break;
    } catch (err) {
      lastError = err;
      if (err instanceof ClinicAiProviderApiError && err.isRetryable) {
        continue;
      }
      break;
    }
  }

  return {
    result: successfulResult,
    lastError,
    attemptedCount,
    quotaConsumedCount,
  };
}

// ---------------------------------------------------------------------------
// Backward-Compatible Single-Provider Factories
// ---------------------------------------------------------------------------

export function createTranscriptionProvider(
  fetchImpl: typeof fetch = fetch
): ClinicTranscriptionProvider {
  const candidates = resolveTranscriptionCandidates(fetchImpl);
  if (candidates.length === 0) {
    throw new ClinicAiProviderNotConfiguredError('Transcription provider is not configured.');
  }

  // Attempt to initialize first valid provider candidate
  for (const candidate of candidates) {
    try {
      return candidate.createProvider();
    } catch (err) {
      if (err instanceof ClinicAiProviderNotConfiguredError && candidates.length > 1) {
        continue;
      }
      throw err;
    }
  }

  throw new ClinicAiProviderNotConfiguredError('No valid transcription provider configured.');
}

export function createSoapDraftProvider(
  fetchImpl: typeof fetch = fetch
): ClinicSoapDraftProvider {
  const candidates = resolveSoapDraftCandidates(fetchImpl);
  if (candidates.length === 0) {
    throw new ClinicAiProviderNotConfiguredError('SOAP draft provider is not configured.');
  }

  for (const candidate of candidates) {
    try {
      return candidate.createProvider();
    } catch (err) {
      if (err instanceof ClinicAiProviderNotConfiguredError && candidates.length > 1) {
        continue;
      }
      throw err;
    }
  }

  throw new ClinicAiProviderNotConfiguredError('No valid SOAP draft provider configured.');
}
