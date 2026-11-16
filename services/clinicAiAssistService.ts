// ============================================================================
// Clinic AI Assist — Client-Side Service (Fail-Closed Hardened)
//
// Provides typed wrappers for invoking the clinic-ai-transcribe and
// clinic-ai-draft Edge Functions via Supabase client.
//
// STRICT INVARIANTS:
// - ZERO clinic note save calls
// - ZERO clinic encounter complete calls
// - ZERO usage of web persistent storage or URL
// - Fail-closed in local/0-TL mode and when Edge AI activation flag is unset
// - All results are returned to volatile React component state only
// ============================================================================

import { supabase } from './supabaseClient';
import { getDataSourceMode, type DataSourceMode } from './dataSourceConfig';
import type { FeatureAvailabilityTier } from './adminFeatureAvailabilityService';

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

export type ClinicAiAssistState =
  | 'idle'
  | 'requesting_microphone'
  | 'recording'
  | 'recorded'
  | 'transcribing'
  | 'transcribed'
  | 'drafting'
  | 'draft_ready'
  | 'error';

export const MAX_AUDIO_PAYLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_RECORDING_DURATION_MS = 5 * 60 * 1000;
export const MAX_TRANSCRIPT_LENGTH = 50_000;
export const MAX_ENCOUNTER_REASON_LENGTH = 1_000;

export const SUPPORTED_AUDIO_MIMES: readonly string[] = [
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/wav',
  'audio/mpeg',
  'audio/mp3',
] as const;

export interface ClinicTranscriptionRequest {
  audio: Blob;
  mimeType: string;
  locale?: string;
}

export interface ClinicTranscriptionResult {
  transcript: string;
  detectedLanguage?: string;
  providerRequestId?: string;
}

export interface ClinicSoapDraftRequest {
  transcript: string;
  encounterReason?: string;
}

export interface ClinicSoapDraftResult {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  warnings?: string[];
}

export type ClinicAiAssistErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MIME'
  | 'AI_PROVIDER_NOT_CONFIGURED'
  | 'AI_QUOTA_EXHAUSTED'
  | 'TRANSCRIPTION_FAILED'
  | 'DRAFT_GENERATION_FAILED'
  | 'BROWSER_NOT_SUPPORTED'
  | 'MICROPHONE_DENIED'
  | 'RECORDING_FAILED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export interface ClinicAiAssistError {
  code: ClinicAiAssistErrorCode;
  message: string;
}

export interface ClinicAiServiceResult<T> {
  success: boolean;
  availabilityTier?: FeatureAvailabilityTier;
  data?: T;
  error?: ClinicAiAssistError;
}

export type ClinicEdgeInvoker = (
  functionName: 'clinic-ai-transcribe' | 'clinic-ai-draft',
  options: { body: unknown }
) => Promise<{ data: any; error: unknown }>;

export interface ClinicAiCallOptions {
  mode?: DataSourceMode;
  allowEdgeInvocation?: boolean;
  invoker?: ClinicEdgeInvoker;
}

function readClinicAiEnabledFlag(): boolean {
  try {
    const importMetaEnv = (import.meta as any)?.env;
    if (importMetaEnv?.VITE_CLINIC_AI_ENABLED === 'true') return true;
  } catch {
    // ignore
  }
  const globalImportEnv = (globalThis as any)?.import?.meta?.env;
  if (globalImportEnv?.VITE_CLINIC_AI_ENABLED === 'true') return true;
  const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return nodeEnv?.VITE_CLINIC_AI_ENABLED === 'true';
}

function resolveDataModeSafe(modeOverride?: DataSourceMode): DataSourceMode {
  if (modeOverride) return modeOverride;
  try {
    return getDataSourceMode();
  } catch {
    return 'local';
  }
}

export function getClinicAiAssistAvailability(options?: {
  mode?: DataSourceMode;
  allowEdgeInvocation?: boolean;
}): {
  availabilityTier: FeatureAvailabilityTier;
  isAvailable: boolean;
  reasonCode: string;
  message: string;
} {
  const mode = resolveDataModeSafe(options?.mode);
  const edgeEnabled = options?.allowEdgeInvocation ?? readClinicAiEnabledFlag();

  if (mode === 'supabase' && edgeEnabled) {
    return {
      availabilityTier: 'LIVE_ACTIVE',
      isAvailable: true,
      reasonCode: 'LIVE_ACTIVE',
      message: 'Clinic AI Assist Edge invocation is enabled.',
    };
  }

  return {
    availabilityTier: 'DISABLED_EXTERNAL_HOLD',
    isAvailable: false,
    reasonCode: 'AI_PROVIDER_NOT_CONFIGURED',
    message:
      mode !== 'supabase'
        ? 'Clinic AI Assist is disabled in local/0-TL mode (DISABLED_EXTERNAL_HOLD).'
        : 'Clinic AI Assist requires server provider activation (DISABLED_EXTERNAL_HOLD).',
  };
}

function isSupportedAudioMime(mimeType: string): boolean {
  if (!mimeType || typeof mimeType !== 'string') return false;
  const normalized = mimeType.trim().toLowerCase();
  const baseMime = normalized.split(';')[0].trim();
  return SUPPORTED_AUDIO_MIMES.includes(normalized) || SUPPORTED_AUDIO_MIMES.includes(baseMime);
}

async function invokeEdge(
  functionName: 'clinic-ai-transcribe' | 'clinic-ai-draft',
  body: unknown,
  invoker?: ClinicEdgeInvoker
): Promise<{ data: any; error: unknown }> {
  if (invoker) {
    return invoker(functionName, { body });
  }
  return supabase.functions.invoke(functionName, { body: body as any });
}

// ---------------------------------------------------------------------------
// Transcription Service
// ---------------------------------------------------------------------------

/**
 * Sends audio to the clinic-ai-transcribe Edge Function for transcription.
 * Returns a volatile transcript result — caller must hold in React state only.
 */
export async function requestTranscription(
  audioBlob: Blob,
  mimeType: string,
  locale?: string,
  options?: ClinicAiCallOptions
): Promise<ClinicAiServiceResult<ClinicTranscriptionResult>> {
  const availability = getClinicAiAssistAvailability(options);
  if (!availability.isAvailable) {
    return {
      success: false,
      availabilityTier: availability.availabilityTier,
      error: {
        code: 'AI_PROVIDER_NOT_CONFIGURED',
        message: availability.message,
      },
    };
  }

  if (!audioBlob || audioBlob.size <= 0) {
    return {
      success: false,
      availabilityTier: availability.availabilityTier,
      error: {
        code: 'UNSUPPORTED_MIME',
        message: 'Empty audio payload.',
      },
    };
  }

  if (audioBlob.size > MAX_AUDIO_PAYLOAD_BYTES) {
    return {
      success: false,
      availabilityTier: availability.availabilityTier,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: `Audio payload exceeds maximum limit of ${MAX_AUDIO_PAYLOAD_BYTES} bytes.`,
      },
    };
  }

  const effectiveMime = (mimeType || audioBlob.type || '').trim();
  if (!isSupportedAudioMime(effectiveMime)) {
    return {
      success: false,
      availabilityTier: availability.availabilityTier,
      error: {
        code: 'UNSUPPORTED_MIME',
        message: `Unsupported audio MIME type: ${effectiveMime || 'unknown'}.`,
      },
    };
  }

  try {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording');
    formData.append('mimeType', effectiveMime);
    if (locale && locale.trim()) {
      formData.append('locale', locale.trim());
    }

    const { data, error } = await invokeEdge('clinic-ai-transcribe', formData, options?.invoker);

    if (error) {
      return {
        success: false,
        availabilityTier: availability.availabilityTier,
        error: parseEdgeFunctionError(error, 'TRANSCRIPTION_FAILED'),
      };
    }

    if (data && data.success && data.data && typeof data.data.transcript === 'string') {
      return {
        success: true,
        availabilityTier: availability.availabilityTier,
        data: {
          transcript: data.data.transcript,
          detectedLanguage: data.data.detectedLanguage || undefined,
          providerRequestId: data.data.providerRequestId || undefined,
        },
      };
    }

    if (data && !data.success && data.error) {
      return {
        success: false,
        availabilityTier: availability.availabilityTier,
        error: {
          code: (data.error.code as ClinicAiAssistErrorCode) || 'TRANSCRIPTION_FAILED',
          message: data.error.message || 'Transcription failed.',
        },
      };
    }

    return {
      success: false,
      availabilityTier: availability.availabilityTier,
      error: { code: 'TRANSCRIPTION_FAILED', message: 'Unexpected transcription response.' },
    };
  } catch (err) {
    return {
      success: false,
      availabilityTier: availability.availabilityTier,
      error: {
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Network error during transcription.',
      },
    };
  }
}

// ---------------------------------------------------------------------------
// SOAP Draft Service
// ---------------------------------------------------------------------------

/**
 * Sends a transcript to the clinic-ai-draft Edge Function for SOAP structuring.
 * Returns a volatile draft result — caller must hold in React state only.
 *
 * Minimized input: transcript + optional encounterReason.
 * Does NOT send patient history, demographics, or tenant records.
 */
export async function requestSoapDraft(
  transcript: string,
  encounterReason?: string,
  options?: ClinicAiCallOptions
): Promise<ClinicAiServiceResult<ClinicSoapDraftResult>> {
  const availability = getClinicAiAssistAvailability(options);
  if (!availability.isAvailable) {
    return {
      success: false,
      availabilityTier: availability.availabilityTier,
      error: {
        code: 'AI_PROVIDER_NOT_CONFIGURED',
        message: availability.message,
      },
    };
  }

  if (typeof transcript !== 'string' || transcript.trim().length === 0) {
    return {
      success: false,
      availabilityTier: availability.availabilityTier,
      error: {
        code: 'DRAFT_GENERATION_FAILED',
        message: 'Non-empty transcript string required.',
      },
    };
  }

  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return {
      success: false,
      availabilityTier: availability.availabilityTier,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: `Transcript exceeds maximum length of ${MAX_TRANSCRIPT_LENGTH} characters.`,
      },
    };
  }

  if (encounterReason && encounterReason.length > MAX_ENCOUNTER_REASON_LENGTH) {
    return {
      success: false,
      availabilityTier: availability.availabilityTier,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: `Encounter reason exceeds maximum length of ${MAX_ENCOUNTER_REASON_LENGTH} characters.`,
      },
    };
  }

  try {
    const { data, error } = await invokeEdge(
      'clinic-ai-draft',
      {
        transcript: transcript.trim(),
        encounterReason: encounterReason?.trim() || undefined,
      },
      options?.invoker
    );

    if (error) {
      return {
        success: false,
        availabilityTier: availability.availabilityTier,
        error: parseEdgeFunctionError(error, 'DRAFT_GENERATION_FAILED'),
      };
    }

    if (data && data.success && data.data) {
      return {
        success: true,
        availabilityTier: availability.availabilityTier,
        data: {
          subjective: typeof data.data.subjective === 'string' ? data.data.subjective : '',
          objective: typeof data.data.objective === 'string' ? data.data.objective : '',
          assessment: typeof data.data.assessment === 'string' ? data.data.assessment : '',
          plan: typeof data.data.plan === 'string' ? data.data.plan : '',
          warnings: Array.isArray(data.data.warnings) ? data.data.warnings : [],
        },
      };
    }

    if (data && !data.success && data.error) {
      return {
        success: false,
        availabilityTier: availability.availabilityTier,
        error: {
          code: (data.error.code as ClinicAiAssistErrorCode) || 'DRAFT_GENERATION_FAILED',
          message: data.error.message || 'SOAP draft generation failed.',
        },
      };
    }

    return {
      success: false,
      availabilityTier: availability.availabilityTier,
      error: { code: 'DRAFT_GENERATION_FAILED', message: 'Unexpected draft response.' },
    };
  } catch (err) {
    return {
      success: false,
      availabilityTier: availability.availabilityTier,
      error: {
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Network error during draft generation.',
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseEdgeFunctionError(
  error: unknown,
  fallbackCode: ClinicAiAssistErrorCode
): ClinicAiAssistError {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as { message: unknown }).message || '');

    if (msg.includes('AI_PROVIDER_NOT_CONFIGURED') || msg.includes('503')) {
      return { code: 'AI_PROVIDER_NOT_CONFIGURED', message: 'AI provider is not configured.' };
    }
    if (msg.includes('AI_QUOTA_EXHAUSTED') || msg.includes('429')) {
      return { code: 'AI_QUOTA_EXHAUSTED', message: 'AI quota exhausted.' };
    }
    if (msg.includes('401') || msg.includes('AUTH_REQUIRED')) {
      return { code: 'AUTH_REQUIRED', message: 'Authentication required.' };
    }
    if (msg.includes('403') || msg.includes('FORBIDDEN')) {
      return { code: 'FORBIDDEN', message: 'Clinical AI access denied.' };
    }

    return { code: fallbackCode, message: msg || 'Clinic AI request failed.' };
  }

  return { code: fallbackCode, message: 'An unexpected error occurred.' };
}
