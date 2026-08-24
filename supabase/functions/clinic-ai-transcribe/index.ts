// ============================================================================
// clinic-ai-transcribe — Supabase Edge Function
//
// Accepts bounded authenticated audio payload from a Clinic practitioner
// with can_write_clinical_notes authority, checks atomic commercial quota,
// invokes the configured transcription provider, and returns a normalized transcript.
//
// ZERO audio persistence. ZERO transcript logging. ZERO clinical writes.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  createTranscriptionProvider,
  ClinicAiProviderNotConfiguredError,
  ClinicAiSchemaValidationError,
  ClinicAiProviderApiError,
  MAX_AUDIO_PAYLOAD_BYTES,
  SUPPORTED_AUDIO_MIMES,
} from "../_shared/clinicAiAssistProvider.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  try {
    // -----------------------------------------------------------------------
    // 1. Authentication — derive identity from JWT
    // -----------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonError("AUTH_REQUIRED", "Valid authentication token required.", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonError("AI_PROVIDER_NOT_CONFIGURED", "Server configuration incomplete.", 500);
    }

    // Security Repair 1: Pure user-context client using caller JWT only. No service role fallback.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonError("AUTH_REQUIRED", "Invalid or expired authentication token.", 401);
    }

    // -----------------------------------------------------------------------
    // 2. Clinic Authorization — derive from server authority, NOT browser input
    // -----------------------------------------------------------------------
    const { data: contextData, error: contextError } = await supabase.rpc(
      "clinic_get_my_context"
    );

    if (contextError || !contextData || contextData.length === 0) {
      return jsonError("FORBIDDEN", "No Clinic staff context found for caller.", 403);
    }

    const clinicContext = contextData[0];
    if (!clinicContext.can_write_clinical_notes) {
      return jsonError(
        "FORBIDDEN",
        "Clinical note writing authority required for AI transcription.",
        403
      );
    }

    // -----------------------------------------------------------------------
    // 3. Security Repair 3: Pre-buffer payload size & MIME check
    // -----------------------------------------------------------------------
    const formData = await req.formData();
    const audioFile = formData.get("audio");
    const mimeType = formData.get("mimeType") as string | null;
    const locale = formData.get("locale") as string | null;

    if (!audioFile || !(audioFile instanceof File)) {
      return jsonError("UNSUPPORTED_MIME", "Audio file required in 'audio' form field.", 400);
    }

    // Inspect file size BEFORE buffer allocation
    if (audioFile.size > MAX_AUDIO_PAYLOAD_BYTES) {
      return jsonError(
        "PAYLOAD_TOO_LARGE",
        `Audio payload size (${audioFile.size} bytes) exceeds maximum limit of ${MAX_AUDIO_PAYLOAD_BYTES} bytes.`,
        413
      );
    }

    const effectiveMime = mimeType || audioFile.type || "audio/webm";

    // Validate MIME type
    const baseMime = effectiveMime.split(";")[0].trim();
    if (!SUPPORTED_AUDIO_MIMES.has(effectiveMime) && !SUPPORTED_AUDIO_MIMES.has(baseMime)) {
      return jsonError(
        "UNSUPPORTED_MIME",
        `Unsupported audio MIME type: ${effectiveMime}. Supported: ${[...SUPPORTED_AUDIO_MIMES].join(", ")}`,
        400
      );
    }

    // Post-buffer safety check
    const audioBytes = new Uint8Array(await audioFile.arrayBuffer());
    if (audioBytes.byteLength === 0) {
      return jsonError("UNSUPPORTED_MIME", "Empty audio payload.", 400);
    }

    // -----------------------------------------------------------------------
    // 4. Provider Factory Validation BEFORE Commercial Quota Reservation (Finding 3)
    //    If provider is not configured or invalid, throw/return before consuming quota (delta 0).
    // -----------------------------------------------------------------------
    const provider = createTranscriptionProvider();

    // -----------------------------------------------------------------------
    // 5. Commercial Authority & Atomic Quota Reservation
    //    Uses zero-argument server-authoritative RPC (Finding 2)
    // -----------------------------------------------------------------------
    const { data: quotaData, error: quotaError } = await supabase.rpc(
      "clinic_check_and_consume_ai_allowance"
    );

    if (quotaError) {
      return jsonError("COMMERCIAL_NOT_ELIGIBLE", "Commercial entitlement check failed.", 403);
    }

    if (!quotaData || !quotaData.success) {
      const reasonCode = quotaData?.reason_code || "AI_NOT_ENTITLED";
      const message = quotaData?.message || "AI operation not allowed under commercial policy.";
      const status = reasonCode === "AI_QUOTA_EXHAUSTED" ? 429 : 403;
      return jsonError(reasonCode, message, status);
    }

    // -----------------------------------------------------------------------
    // 6. Invoke transcription provider — 1 unit consumed upon invocation attempt
    // -----------------------------------------------------------------------
    const result = await provider.transcribe({
      audio: audioBytes,
      mimeType: effectiveMime,
      locale: locale || undefined,
      requestContext: {
        tenantId: clinicContext.tenant_id,
        staffId: clinicContext.staff_id,
      },
    });

    // -----------------------------------------------------------------------
    // 7. Return normalized result — ZERO persistence
    // -----------------------------------------------------------------------
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          transcript: result.transcript,
          detectedLanguage: result.detectedLanguage || null,
          providerRequestId: result.providerRequestId || null,
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (error) {
    if (error instanceof ClinicAiProviderNotConfiguredError) {
      return jsonError("AI_PROVIDER_NOT_CONFIGURED", error.message, 503);
    }
    if (error instanceof ClinicAiSchemaValidationError) {
      return jsonError("TRANSCRIPTION_FAILED", error.message, 502);
    }
    if (error instanceof ClinicAiProviderApiError) {
      return jsonError("TRANSCRIPTION_FAILED", "External transcription provider error.", 502);
    }

    // Security Repair 2: Safe error logging without raw details
    const safeCode = (error && typeof error === "object" && "code" in error) ? (error as { code: string }).code : "UNKNOWN_ERROR";
    console.error(`[clinic-ai-transcribe] Safe Error Log: function=clinic-ai-transcribe, code=${safeCode}`);
    return jsonError("TRANSCRIPTION_FAILED", "Transcription request failed.", 500);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonError(code: string, message: string, status: number): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code, message } }),
    { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
}
