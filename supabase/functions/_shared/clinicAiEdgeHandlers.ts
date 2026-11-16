// ============================================================================
// Clinic AI Assist — Pure Edge Request Handlers (Deno Edge & Node/tsx Testable)
//
// Shared server-side handler layer for clinic-ai-transcribe and clinic-ai-draft.
// Enforces server-only CLINIC_AI_LIVE_ENABLED=true gate BEFORE any Supabase
// auth/context/quota RPCs, candidate resolution, or external provider fetch.
// ============================================================================

import { readEdgeEnv } from "./aiEdgePolicy.ts";
import {
  resolveTranscriptionCandidates,
  resolveSoapDraftCandidates,
  executeMeteredProviderChain,
  ClinicAiProviderNotConfiguredError,
  ClinicAiSchemaValidationError,
  ClinicAiProviderApiError,
  MAX_AUDIO_PAYLOAD_BYTES,
  SUPPORTED_AUDIO_MIMES,
} from "./clinicAiAssistProvider.ts";

export const CLINIC_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_TRANSCRIPT_LENGTH = 50_000;
const MAX_REASON_LENGTH = 1_000;

export interface ClinicAiSupabaseClient {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
  rpc(fn: string, params?: Record<string, unknown>): Promise<{ data: any; error: unknown }>;
}

export interface ClinicAiEdgeDeps {
  getEnv?: (key: string) => string | undefined;
  createSupabaseClient: (url: string, anonKey: string, authHeader: string) => ClinicAiSupabaseClient;
  fetchImpl?: typeof fetch;
}

function jsonError(code: string, message: string, status: number): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code, message } }),
    { status, headers: { ...CLINIC_CORS_HEADERS, "Content-Type": "application/json" } }
  );
}

interface AuthorizedClinicContext {
  supabase: ClinicAiSupabaseClient;
  clinicContext: { tenant_id: string; staff_id: string; can_write_clinical_notes: boolean };
  getEnv: (key: string) => string | undefined;
}

async function authorizeClinicAiRequest(
  req: Request,
  deps: ClinicAiEdgeDeps,
  roleDeniedMessage: string
): Promise<{ response: Response } | { authorized: AuthorizedClinicContext }> {
  if (req.method === "OPTIONS") {
    return { response: new Response("ok", { headers: CLINIC_CORS_HEADERS }) };
  }

  if (req.method !== "POST") {
    return {
      response: new Response(
        JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } }),
        { status: 405, headers: { ...CLINIC_CORS_HEADERS, "Content-Type": "application/json" } }
      ),
    };
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { response: jsonError("AUTH_REQUIRED", "Valid authentication token required.", 401) };
  }

  const getEnv = deps.getEnv ?? readEdgeEnv;

  // Server-only live activation gate: fail closed BEFORE any auth/quota RPCs or provider fetch
  if (getEnv("CLINIC_AI_LIVE_ENABLED") !== "true") {
    return {
      response: jsonError(
        "DISABLED_EXTERNAL_HOLD",
        "Clinic AI Assist is disabled in 0-TL / EXTERNAL_HOLD mode until CLINIC_AI_LIVE_ENABLED=true is enabled server-side.",
        503
      ),
    };
  }

  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return { response: jsonError("AI_PROVIDER_NOT_CONFIGURED", "Server configuration incomplete.", 500) };
  }

  const supabase = deps.createSupabaseClient(supabaseUrl, supabaseAnonKey, authHeader);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { response: jsonError("AUTH_REQUIRED", "Invalid or expired authentication token.", 401) };
  }

  const { data: contextData, error: contextError } = await supabase.rpc("clinic_get_my_context");
  if (contextError || !contextData || contextData.length === 0) {
    return { response: jsonError("FORBIDDEN", "No Clinic staff context found for caller.", 403) };
  }

  const clinicContext = contextData[0];
  if (!clinicContext.can_write_clinical_notes) {
    return { response: jsonError("FORBIDDEN", roleDeniedMessage, 403) };
  }

  return {
    authorized: {
      supabase,
      clinicContext,
      getEnv,
    },
  };
}

function mapChainFailure<TResult>(
  fnName: string,
  errorCode: string,
  fallbackMessage: string,
  chainOutcome: {
    lastError?: unknown;
    attemptedCount: number;
  }
): Response {
  const lastError = chainOutcome.lastError;
  if (lastError instanceof ClinicAiProviderNotConfiguredError) {
    return jsonError("AI_PROVIDER_NOT_CONFIGURED", lastError.message, 503);
  }
  if (lastError instanceof ClinicAiSchemaValidationError) {
    return jsonError(errorCode, lastError.message, 502);
  }
  if (lastError instanceof ClinicAiProviderApiError) {
    return jsonError(errorCode, fallbackMessage, 502);
  }
  if (chainOutcome.attemptedCount === 0) {
    return jsonError("AI_PROVIDER_NOT_CONFIGURED", `No valid provider configured for ${fnName}.`, 503);
  }
  console.error(`[${fnName}] Safe Error Log: function=${fnName}, code=${errorCode}`);
  return jsonError(errorCode, fallbackMessage, 500);
}

export async function handleClinicAiTranscribeRequest(
  req: Request,
  deps: ClinicAiEdgeDeps
): Promise<Response> {
  try {
    const authResult = await authorizeClinicAiRequest(
      req,
      deps,
      "Clinical note writing authority required for AI transcription."
    );
    if ("response" in authResult) {
      return authResult.response;
    }

    const { supabase, clinicContext, getEnv } = authResult.authorized;

    const formData = await req.formData();
    const audioFile = formData.get("audio");
    const mimeType = formData.get("mimeType") as string | null;
    const locale = formData.get("locale") as string | null;

    if (!audioFile || !(audioFile instanceof File)) {
      return jsonError("UNSUPPORTED_MIME", "Audio file required in 'audio' form field.", 400);
    }

    if (audioFile.size > MAX_AUDIO_PAYLOAD_BYTES) {
      return jsonError(
        "PAYLOAD_TOO_LARGE",
        `Audio payload size (${audioFile.size} bytes) exceeds maximum limit of ${MAX_AUDIO_PAYLOAD_BYTES} bytes.`,
        413
      );
    }

    const effectiveMime = mimeType || audioFile.type || "audio/webm";
    const baseMime = effectiveMime.split(";")[0].trim();
    if (!SUPPORTED_AUDIO_MIMES.has(effectiveMime) && !SUPPORTED_AUDIO_MIMES.has(baseMime)) {
      return jsonError(
        "UNSUPPORTED_MIME",
        `Unsupported audio MIME type: ${effectiveMime}. Supported: ${[...SUPPORTED_AUDIO_MIMES].join(", ")}`,
        400
      );
    }

    const audioBytes = new Uint8Array(await audioFile.arrayBuffer());
    if (audioBytes.byteLength === 0) {
      return jsonError("UNSUPPORTED_MIME", "Empty audio payload.", 400);
    }

    const candidates = resolveTranscriptionCandidates(deps.fetchImpl ?? fetch, getEnv);
    if (candidates.length === 0) {
      return jsonError("AI_PROVIDER_NOT_CONFIGURED", "Transcription provider is not configured.", 503);
    }

    const chainOutcome = await executeMeteredProviderChain({
      candidates,
      createProvider: (candidate) => {
        const instance = candidate.createProvider();
        return {
          providerName: instance.providerName,
          invoke: () =>
            instance.transcribe({
              audio: audioBytes,
              mimeType: effectiveMime,
              locale: locale || undefined,
              requestContext: {
                tenantId: clinicContext.tenant_id,
                staffId: clinicContext.staff_id,
              },
            }),
        };
      },
      reserveQuota: async () => {
        const { data, error } = await supabase.rpc("clinic_check_and_consume_ai_allowance");
        if (error) {
          return {
            success: false,
            reason_code: "COMMERCIAL_NOT_ELIGIBLE",
            message: "Commercial entitlement check failed.",
          };
        }
        return data;
      },
    });

    if (chainOutcome.stoppedByQuota && chainOutcome.quotaStopReason) {
      const { reason_code, message, status } = chainOutcome.quotaStopReason;
      return jsonError(reason_code, message, status);
    }

    if (chainOutcome.result) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            transcript: chainOutcome.result.transcript,
            detectedLanguage: chainOutcome.result.detectedLanguage || null,
            providerRequestId: chainOutcome.result.providerRequestId || null,
          },
        }),
        { status: 200, headers: { ...CLINIC_CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    return mapChainFailure(
      "clinic-ai-transcribe",
      "TRANSCRIPTION_FAILED",
      "External transcription provider error.",
      chainOutcome
    );
  } catch (error) {
    if (error instanceof ClinicAiProviderNotConfiguredError) {
      return jsonError("AI_PROVIDER_NOT_CONFIGURED", error.message, 503);
    }
    const safeCode = (error && typeof error === "object" && "code" in error) ? (error as { code: string }).code : "UNKNOWN_ERROR";
    console.error(`[clinic-ai-transcribe] Safe Error Log: function=clinic-ai-transcribe, code=${safeCode}`);
    return jsonError("TRANSCRIPTION_FAILED", "Transcription request failed.", 500);
  }
}

export async function handleClinicAiDraftRequest(
  req: Request,
  deps: ClinicAiEdgeDeps
): Promise<Response> {
  try {
    const authResult = await authorizeClinicAiRequest(
      req,
      deps,
      "Clinical note writing authority required for AI draft generation."
    );
    if ("response" in authResult) {
      return authResult.response;
    }

    const { supabase, clinicContext, getEnv } = authResult.authorized;

    const body = await req.json();
    const { transcript, encounterReason } = body;

    if (!transcript || typeof transcript !== "string" || transcript.trim().length === 0) {
      return jsonError("DRAFT_GENERATION_FAILED", "Non-empty transcript string required.", 400);
    }

    if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
      return jsonError(
        "PAYLOAD_TOO_LARGE",
        `Transcript exceeds maximum length of ${MAX_TRANSCRIPT_LENGTH} characters.`,
        413
      );
    }

    if (encounterReason && typeof encounterReason === "string" && encounterReason.length > MAX_REASON_LENGTH) {
      return jsonError(
        "PAYLOAD_TOO_LARGE",
        `Encounter reason exceeds maximum length of ${MAX_REASON_LENGTH} characters.`,
        413
      );
    }

    const candidates = resolveSoapDraftCandidates(deps.fetchImpl ?? fetch, getEnv);
    if (candidates.length === 0) {
      return jsonError("AI_PROVIDER_NOT_CONFIGURED", "SOAP draft provider is not configured.", 503);
    }

    const chainOutcome = await executeMeteredProviderChain({
      candidates,
      createProvider: (candidate) => {
        const instance = candidate.createProvider();
        return {
          providerName: instance.providerName,
          invoke: () =>
            instance.generateDraft({
              transcript: transcript.trim(),
              encounterReason: encounterReason && typeof encounterReason === "string" ? encounterReason.trim() : undefined,
              requestContext: {
                tenantId: clinicContext.tenant_id,
                staffId: clinicContext.staff_id,
              },
            }),
        };
      },
      reserveQuota: async () => {
        const { data, error } = await supabase.rpc("clinic_check_and_consume_ai_allowance");
        if (error) {
          return {
            success: false,
            reason_code: "COMMERCIAL_NOT_ELIGIBLE",
            message: "Commercial entitlement check failed.",
          };
        }
        return data;
      },
    });

    if (chainOutcome.stoppedByQuota && chainOutcome.quotaStopReason) {
      const { reason_code, message, status } = chainOutcome.quotaStopReason;
      return jsonError(reason_code, message, status);
    }

    if (chainOutcome.result) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            subjective: chainOutcome.result.subjective,
            objective: chainOutcome.result.objective,
            assessment: chainOutcome.result.assessment,
            plan: chainOutcome.result.plan,
            warnings: chainOutcome.result.warnings || [],
          },
        }),
        { status: 200, headers: { ...CLINIC_CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    return mapChainFailure(
      "clinic-ai-draft",
      "DRAFT_GENERATION_FAILED",
      "External draft provider error.",
      chainOutcome
    );
  } catch (error) {
    if (error instanceof ClinicAiProviderNotConfiguredError) {
      return jsonError("AI_PROVIDER_NOT_CONFIGURED", error.message, 503);
    }
    const safeCode = (error && typeof error === "object" && "code" in error) ? (error as { code: string }).code : "UNKNOWN_ERROR";
    console.error(`[clinic-ai-draft] Safe Error Log: function=clinic-ai-draft, code=${safeCode}`);
    return jsonError("DRAFT_GENERATION_FAILED", "SOAP draft generation failed.", 500);
  }
}
