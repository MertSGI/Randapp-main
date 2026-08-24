// ============================================================================
// clinic-ai-draft — Supabase Edge Function
//
// Accepts a transcript from an authenticated Clinic practitioner with
// can_write_clinical_notes authority, invokes the configured SOAP draft
// provider, and returns a structured draft for clinician review.
//
// ZERO clinical writes. ZERO persistence. ZERO autonomous actions.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  createSoapDraftProvider,
  ClinicAiProviderNotConfiguredError,
} from "../_shared/clinicAiAssistProvider.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Maximum transcript length in characters (50,000 ~ 10,000 words). */
const MAX_TRANSCRIPT_LENGTH = 50_000;

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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonError("AI_PROVIDER_NOT_CONFIGURED", "Server configuration incomplete.", 500);
    }

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
    //    Minimized input: transcript + optional encounterReason only.
    //    Does NOT accept patient history, demographics, or tenant records.
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

    // -----------------------------------------------------------------------
    // 4. Invoke SOAP draft provider (fail-closed if not configured)
    // -----------------------------------------------------------------------
    const provider = createSoapDraftProvider();

    const result = await provider.generateDraft({
      transcript: transcript.trim(),
      encounterReason: encounterReason?.trim() || undefined,
      requestContext: {
        tenantId: clinicContext.tenant_id,
        staffId: clinicContext.staff_id,
      },
    });

    // -----------------------------------------------------------------------
    // 5. Return structured SOAP draft — ZERO persistence, ZERO clinical writes
    // -----------------------------------------------------------------------
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          subjective: result.subjective,
          objective: result.objective,
          assessment: result.assessment,
          plan: result.plan,
          warnings: result.warnings || [],
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (error) {
    if (error instanceof ClinicAiProviderNotConfiguredError) {
      return jsonError("AI_PROVIDER_NOT_CONFIGURED", error.message, 503);
    }

    // Generic error — do NOT leak transcript details
    console.error("[clinic-ai-draft] Error:", error.message);
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
