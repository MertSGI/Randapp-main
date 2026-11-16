// ============================================================================
// clinic-ai-transcribe — Supabase Edge Function
//
// Accepts bounded authenticated audio payload from a Clinic practitioner
// with can_write_clinical_notes authority, checks atomic commercial quota per attempt,
// executes Groq primary provider with gated OpenAI fallback, and returns a normalized transcript.
//
// Security boundaries:
// - Server-only CLINIC_AI_LIVE_ENABLED=true required before auth/quota/provider
//   execution (returns 503 DISABLED_EXTERNAL_HOLD otherwise).
// - ZERO audio persistence. ZERO transcript logging. ZERO clinical writes.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { handleClinicAiTranscribeRequest } from "../_shared/clinicAiEdgeHandlers.ts";

serve((req: Request) =>
  handleClinicAiTranscribeRequest(req, {
    getEnv: (key: string) => Deno.env.get(key),
    createSupabaseClient: (url: string, anonKey: string, authHeader: string) =>
      createClient(url, anonKey, {
        global: { headers: { Authorization: authHeader } },
      }),
    fetchImpl: fetch,
  })
);
