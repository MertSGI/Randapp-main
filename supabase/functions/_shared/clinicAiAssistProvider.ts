// ============================================================================
// Clinic AI Assist — Provider Abstraction & Real OpenAI Adapters
//
// Shared server-side layer for Supabase Edge Functions.
// Conforms strictly to ClinicTranscriptionProvider and ClinicSoapDraftProvider.
// Includes OpenAI Whisper transcription adapter and OpenAI Chat Completion
// structured SOAP draft adapter with strict JSON schema validation.
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
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'ClinicAiProviderApiError';
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// OpenAI Transcription Provider Adapter
// ---------------------------------------------------------------------------

export class OpenAiTranscriptionProvider implements ClinicTranscriptionProvider {
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
    const ext = this.getExtensionFromMime(request.mimeType);
    const blob = new Blob([request.audio], { type: request.mimeType });

    const formData = new FormData();
    formData.append('file', blob, `audio.${ext}`);
    formData.append('model', this.model);
    if (request.locale) {
      formData.append('language', request.locale);
    }
    formData.append('response_format', 'verbose_json');

    const res = await this.fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const errStatus = res.status;
      throw new ClinicAiProviderApiError(`OpenAI transcription API returned status ${errStatus}`, errStatus);
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
  }

  private getExtensionFromMime(mimeType: string): string {
    if (mimeType.includes('webm')) return 'webm';
    if (mimeType.includes('ogg')) return 'ogg';
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('wav')) return 'wav';
    if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
    return 'webm';
  }
}

// ---------------------------------------------------------------------------
// OpenAI SOAP Draft Provider Adapter (Structured Output)
// ---------------------------------------------------------------------------

export class OpenAiSoapDraftProvider implements ClinicSoapDraftProvider {
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

    const res = await this.fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errStatus = res.status;
      throw new ClinicAiProviderApiError(`OpenAI chat completion API returned status ${errStatus}`, errStatus);
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

    return this.validateAndNormalizeSoapDraft(parsed);
  }

  public validateAndNormalizeSoapDraft(obj: unknown): ClinicSoapDraftProviderResult {
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
}

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

export function createTranscriptionProvider(
  fetchImpl: typeof fetch = fetch
): ClinicTranscriptionProvider {
  const providerName = typeof Deno !== 'undefined' ? Deno.env.get('CLINIC_AI_TRANSCRIPTION_PROVIDER') || Deno.env.get('OPENAI_TRANSCRIPTION_PROVIDER') : process.env.CLINIC_AI_TRANSCRIPTION_PROVIDER || process.env.OPENAI_TRANSCRIPTION_PROVIDER;
  const apiKey = typeof Deno !== 'undefined' ? Deno.env.get('OPENAI_API_KEY') || Deno.env.get('CLINIC_AI_TRANSCRIPTION_API_KEY') : process.env.OPENAI_API_KEY || process.env.CLINIC_AI_TRANSCRIPTION_API_KEY;
  const model = (typeof Deno !== 'undefined' ? Deno.env.get('CLINIC_AI_TRANSCRIPTION_MODEL') : process.env.CLINIC_AI_TRANSCRIPTION_MODEL) || 'whisper-1';

  if (!providerName || providerName === 'none') {
    throw new ClinicAiProviderNotConfiguredError('Transcription provider is not configured.');
  }

  if (providerName === 'openai') {
    if (!apiKey || apiKey.startsWith('replace_with_')) {
      throw new ClinicAiProviderNotConfiguredError('OpenAI transcription API key is not configured.');
    }
    return new OpenAiTranscriptionProvider(apiKey, model, fetchImpl);
  }

  throw new ClinicAiProviderNotConfiguredError(
    `Unknown transcription provider: ${providerName}. No provider implementation available.`
  );
}

export function createSoapDraftProvider(
  fetchImpl: typeof fetch = fetch
): ClinicSoapDraftProvider {
  const providerName = typeof Deno !== 'undefined' ? Deno.env.get('CLINIC_AI_DRAFT_PROVIDER') || Deno.env.get('OPENAI_DRAFT_PROVIDER') : process.env.CLINIC_AI_DRAFT_PROVIDER || process.env.OPENAI_DRAFT_PROVIDER;
  const apiKey = typeof Deno !== 'undefined' ? Deno.env.get('OPENAI_API_KEY') || Deno.env.get('CLINIC_AI_DRAFT_API_KEY') : process.env.OPENAI_API_KEY || process.env.CLINIC_AI_DRAFT_API_KEY;
  const model = (typeof Deno !== 'undefined' ? Deno.env.get('CLINIC_AI_DRAFT_MODEL') : process.env.CLINIC_AI_DRAFT_MODEL) || 'gpt-4o-mini';

  if (!providerName || providerName === 'none') {
    throw new ClinicAiProviderNotConfiguredError('SOAP draft provider is not configured.');
  }

  if (providerName === 'openai') {
    if (!apiKey || apiKey.startsWith('replace_with_')) {
      throw new ClinicAiProviderNotConfiguredError('OpenAI SOAP draft API key is not configured.');
    }
    return new OpenAiSoapDraftProvider(apiKey, model, fetchImpl);
  }

  throw new ClinicAiProviderNotConfiguredError(
    `Unknown SOAP draft provider: ${providerName}. No provider implementation available.`
  );
}
