// ============================================================================
// clinic-ai-draft — Supabase Edge Function
//
// Accepts a transcript from an authenticated Clinic practitioner with
// can_write_clinical_notes authority, checks atomic commercial quota per attempt,
// executes Groq primary SOAP draft provider with gated OpenAI fallback, and returns a structured draft.
//
// Security boundaries:
// - Server-only CLINIC_AI_LIVE_ENABLED=true required before auth/quota/provider
//   execution (returns 503 DISABLED_EXTERNAL_HOLD otherwise).
// - ZERO clinical writes. ZERO persistence. ZERO autonomous actions.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { handleClinicAiDraftRequest } from "../_shared/clinicAiEdgeHandlers.ts";

serve((req: Request) =>
  handleClinicAiDraftRequest(req, {
    getEnv: (key: string) => Deno.env.get(key),
    createSupabaseClient: (url: string, anonKey: string, authHeader: string) =>
      createClient(url, anonKey, {
        global: { headers: { Authorization: authHeader } },
      }),
    fetchImpl: fetch,
  })
);
