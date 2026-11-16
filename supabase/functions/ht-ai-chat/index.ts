// ============================================================================
// ht-ai-chat — Supabase Edge Function
//
// Public Health Tourism AI Lead Agent. Server-authoritative conversation
// boundary for assistive intake/navigation help.
//
// Medical safety boundary: NEVER diagnoses, recommends treatment, prescribes,
// claims medical suitability, makes medical outcome promises, or replaces
// clinician review.
//
// Security boundaries:
// - Server-only HT_AI_CHAT_LIVE_ENABLED=true required before service-role
//   mutations or provider calls (503 DISABLED_EXTERNAL_HOLD otherwise).
// - Explicit allowlisted provider switch (openai / groq only).
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { handleHtAiChatRequest } from "./handler.ts";

serve((req: Request) =>
  handleHtAiChatRequest(req, {
    getEnv: (key: string) => Deno.env.get(key),
    createSupabaseClient: (url: string, serviceKey: string) => createClient(url, serviceKey),
    fetchImpl: fetch,
  })
);
