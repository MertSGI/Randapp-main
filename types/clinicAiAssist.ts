// ============================================================================
// Clinic AI Assist V1 — Type Definitions
// Human-in-the-loop speech-to-text + SOAP draft workflow types.
// All AI material is VOLATILE (React component state only).
// ============================================================================

// ---------------------------------------------------------------------------
// State Machine
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

// ---------------------------------------------------------------------------
// Audio Constants
// ---------------------------------------------------------------------------

/** Maximum audio payload size in bytes (10 MB). */
export const MAX_AUDIO_PAYLOAD_BYTES = 10 * 1024 * 1024;

/** Maximum recording duration in milliseconds (5 minutes). */
export const MAX_RECORDING_DURATION_MS = 5 * 60 * 1000;

/** Allowed audio MIME types for transcription. */
export const SUPPORTED_AUDIO_MIMES: readonly string[] = [
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/wav',
  'audio/mpeg',
] as const;

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// SOAP Draft
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

export type ClinicAiAssistErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MIME'
  | 'AI_PROVIDER_NOT_CONFIGURED'
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
