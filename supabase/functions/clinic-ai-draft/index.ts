// ============================================================================
// clinic-ai-draft — Supabase Edge Function
//
// Accepts a transcript from an authenticated Clinic practitioner with
// can_write_clinical_notes authority, checks atomic commercial quota per attempt,
// executes Groq primary SOAP draft provider with metered OpenAI fallback, and returns a structured draft for clinician review.
//
// ZERO clinical writes. ZERO persistence. ZERO autonomous actions.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  resolveSoapDraftCandidates,
  executeMeteredProviderChain,
  ClinicAiProviderNotConfiguredError,
  ClinicAiSchemaValidationError,
  ClinicAiProviderApiError,
  ClinicSoapDraftProviderResult,
} from "../_shared/clinicAiAssistProvider.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Maximum transcript length in characters (50,000 ~ 10,000 words). */
const MAX_TRANSCRIPT_LENGTH = 50_000;

/** Maximum encounter reason length in characters (1,000 chars). */
const MAX_REASON_LENGTH = 1_000;

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

    // Pure user-context client using caller JWT only. No service role fallback.
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
        "Clinical note writing authority required for AI draft generation.",
        403
      );
    }

    // -----------------------------------------------------------------------
    // 3. Parse and validate request body
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // 4. Provider Candidate Chain Resolution BEFORE Quota Reservation
    // -----------------------------------------------------------------------
    const candidates = resolveSoapDraftCandidates();
    if (candidates.length === 0) {
      return jsonError("AI_PROVIDER_NOT_CONFIGURED", "SOAP draft provider is not configured.", 503);
    }

    // -----------------------------------------------------------------------
    // 5. Sequential Candidate Execution with Shared Metered Helper
    // -----------------------------------------------------------------------
    const chainOutcome = await executeMeteredProviderChain({
      candidates,
      createProvider: (candidate) => {
        const instance = candidate.createProvider();
        return {
          providerName: instance.providerName,
          invoke: () => instance.generateDraft({
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
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Process final error if all candidates failed or non-retryable error occurred
    const lastError = chainOutcome.lastError;
    if (lastError instanceof ClinicAiProviderNotConfiguredError) {
      return jsonError("AI_PROVIDER_NOT_CONFIGURED", lastError.message, 503);
    }
    if (lastError instanceof ClinicAiSchemaValidationError) {
      return jsonError("DRAFT_GENERATION_FAILED", lastError.message, 502);
    }
    if (lastError instanceof ClinicAiProviderApiError) {
      return jsonError("DRAFT_GENERATION_FAILED", "External draft provider error.", 502);
    }

    if (chainOutcome.attemptedCount === 0) {
      return jsonError("AI_PROVIDER_NOT_CONFIGURED", "No valid SOAP draft provider configured.", 503);
    }

    console.error(`[clinic-ai-draft] Safe Error Log: function=clinic-ai-draft, code=DRAFT_GENERATION_FAILED`);
    return jsonError("DRAFT_GENERATION_FAILED", "SOAP draft generation failed.", 500);
  } catch (error) {
    if (error instanceof ClinicAiProviderNotConfiguredError) {
      return jsonError("AI_PROVIDER_NOT_CONFIGURED", error.message, 503);
    }
    const safeCode = (error && typeof error === "object" && "code" in error) ? (error as { code: string }).code : "UNKNOWN_ERROR";
    console.error(`[clinic-ai-draft] Safe Error Log: function=clinic-ai-draft, code=${safeCode}`);
    return jsonError("DRAFT_GENERATION_FAILED", "SOAP draft generation failed.", 500);
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
