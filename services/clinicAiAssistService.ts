// ============================================================================
// Clinic AI Assist — Client-Side Service
//
// Provides typed wrappers for invoking the clinic-ai-transcribe and
// clinic-ai-draft Edge Functions via Supabase client.
//
// STRICT INVARIANTS:
// - ZERO clinic note save calls
// - ZERO clinic encounter complete calls
// - ZERO usage of web persistent storage or URL
// - All results are returned to volatile React component state only
// ============================================================================

import { supabase } from './supabaseClient';
import type {
  ClinicTranscriptionResult,
  ClinicSoapDraftResult,
  ClinicAiAssistError,
  ClinicAiAssistErrorCode,
} from '../types/clinicAiAssist';

// ---------------------------------------------------------------------------
// Result Types
// ---------------------------------------------------------------------------

interface ClinicAiServiceResult<T> {
  success: boolean;
  data?: T;
  error?: ClinicAiAssistError;
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
  locale?: string
): Promise<ClinicAiServiceResult<ClinicTranscriptionResult>> {
  try {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording');
    formData.append('mimeType', mimeType);
    if (locale) {
      formData.append('locale', locale);
    }

    const { data, error } = await supabase.functions.invoke('clinic-ai-transcribe', {
      body: formData,
    });

    if (error) {
      return {
        success: false,
        error: parseEdgeFunctionError(error, 'TRANSCRIPTION_FAILED'),
      };
    }

    if (data && data.success && data.data) {
      return {
        success: true,
        data: {
          transcript: data.data.transcript,
          detectedLanguage: data.data.detectedLanguage || undefined,
          providerRequestId: data.data.providerRequestId || undefined,
        },
      };
    }

    // Edge function returned a structured error
    if (data && !data.success && data.error) {
      return {
        success: false,
        error: {
          code: (data.error.code as ClinicAiAssistErrorCode) || 'TRANSCRIPTION_FAILED',
          message: data.error.message || 'Transcription failed.',
        },
      };
    }

    return {
      success: false,
      error: { code: 'TRANSCRIPTION_FAILED', message: 'Unexpected transcription response.' },
    };
  } catch (err) {
    return {
      success: false,
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
  encounterReason?: string
): Promise<ClinicAiServiceResult<ClinicSoapDraftResult>> {
  try {
    const { data, error } = await supabase.functions.invoke('clinic-ai-draft', {
      body: { transcript, encounterReason },
    });

    if (error) {
      return {
        success: false,
        error: parseEdgeFunctionError(error, 'DRAFT_GENERATION_FAILED'),
      };
    }

    if (data && data.success && data.data) {
      return {
        success: true,
        data: {
          subjective: data.data.subjective || '',
          objective: data.data.objective || '',
          assessment: data.data.assessment || '',
          plan: data.data.plan || '',
          warnings: data.data.warnings || [],
        },
      };
    }

    // Edge function returned a structured error
    if (data && !data.success && data.error) {
      return {
        success: false,
        error: {
          code: (data.error.code as ClinicAiAssistErrorCode) || 'DRAFT_GENERATION_FAILED',
          message: data.error.message || 'SOAP draft generation failed.',
        },
      };
    }

    return {
      success: false,
      error: { code: 'DRAFT_GENERATION_FAILED', message: 'Unexpected draft response.' },
    };
  } catch (err) {
    return {
      success: false,
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
    const msg = (error as { message: string }).message;

    // Parse known error patterns from Edge Function responses
    if (msg.includes('AI_PROVIDER_NOT_CONFIGURED') || msg.includes('503')) {
      return { code: 'AI_PROVIDER_NOT_CONFIGURED', message: 'AI provider is not configured.' };
    }
    if (msg.includes('401') || msg.includes('AUTH_REQUIRED')) {
      return { code: 'AUTH_REQUIRED', message: 'Authentication required.' };
    }
    if (msg.includes('403') || msg.includes('FORBIDDEN')) {
      return { code: 'FORBIDDEN', message: 'Clinical AI access denied.' };
    }

    return { code: fallbackCode, message: msg };
  }

  return { code: fallbackCode, message: 'An unexpected error occurred.' };
}
