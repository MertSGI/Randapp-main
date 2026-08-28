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
// Provider: Reuses existing Groq/OpenAI provider infrastructure.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Maximum user message length */
const MAX_MESSAGE_LENGTH = 2_000;

/** Maximum messages per conversation before suggesting handoff */
const MAX_CONVERSATION_MESSAGES = 50;

/** Rate limit: max new conversations per IP per hour */
const RATE_LIMIT_WINDOW_MS = 3600_000;

/** Medical safety boundary keywords that trigger handoff */
const MEDICAL_KEYWORDS = [
  'diagnos', 'diagnosis', 'treatment', 'prescri', 'medicat', 'surgery',
  'operation', 'procedure', 'cure', 'therapy', 'symptom', 'disease',
  'cancer', 'tumor', 'transplant', 'what is wrong with me',
  'am i sick', 'do i have', 'should i take', 'tedavi', 'teşhis',
  'ameliyat', 'ilaç', 'hastalık', 'kanser', 'tümör',
  'علاج', 'تشخيص', 'مرض', 'جراحة', 'دواء',
  'лечение', 'диагноз', 'болезнь', 'операция', 'лекарство',
  'Behandlung', 'Diagnose', 'Krankheit', 'Operation', 'Medikament'
];

/** System prompt for the HT AI Lead Agent */
function buildSystemPrompt(language: string): string {
  return `You are a helpful Health Tourism intake assistant for an international health tourism service. Your role is:

1. Answer basic intake and process questions about health tourism services
2. Explain how to submit an inquiry or request
3. Help with language and navigation on the platform
4. Collect non-clinical context (preferred language, country, contact preferences)
5. Summarize user interest for coordinator review
6. Offer human handoff when appropriate

STRICT MEDICAL BOUNDARY — YOU MUST NEVER:
- Diagnose any condition
- Recommend specific treatments or procedures
- Prescribe medication
- Claim medical suitability for any procedure
- Make medical outcome promises
- Replace qualified clinician review
- Provide specific medical advice

When a user asks for medical diagnosis, treatment advice, or clinical recommendations:
- Clearly explain that you cannot provide medical advice
- State that qualified medical professionals will review their inquiry
- Offer to connect them with a human coordinator
- Say: "I'm an intake assistant and cannot provide medical advice. Let me connect you with our medical coordination team who can properly address your health questions."

Respond in ${language === 'tr' ? 'Turkish' : language === 'de' ? 'German' : language === 'ru' ? 'Russian' : language === 'ar' ? 'Arabic' : 'English'}.

Keep responses concise, warm, and professional. Focus on helping the user navigate the health tourism inquiry process.`;
}

function containsMedicalQuery(message: string): boolean {
  const lower = message.toLowerCase();
  return MEDICAL_KEYWORDS.some(kw => lower.includes(kw));
}

function jsonError(code: string, message: string, status: number): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code, message } }),
    { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
}

function jsonSuccess(data: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({ success: true, ...data }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonError("METHOD_NOT_ALLOWED", "POST required", 405);
  }

  try {
    // -----------------------------------------------------------------------
    // 1. Environment & Supabase service client
    // -----------------------------------------------------------------------
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const aiApiKey = Deno.env.get("GROQ_API_KEY") || Deno.env.get("OPENAI_API_KEY");
    const aiProvider = Deno.env.get("HT_AI_CHAT_PROVIDER") || Deno.env.get("CLINIC_AI_DRAFT_PROVIDER") || "groq";
    const aiModel = Deno.env.get("HT_AI_CHAT_MODEL") || (aiProvider === "openai" ? "gpt-4o-mini" : "llama-3.1-70b-versatile");

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonError("SERVER_CONFIG_ERROR", "Server configuration incomplete.", 500);
    }

    // Service role client for server-authoritative operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // -----------------------------------------------------------------------
    // 2. Parse request
    // -----------------------------------------------------------------------
    const body = await req.json();
    const {
      session_token, message, tenant_slug, preferred_language,
      full_name, email, phone, country_code, source_channel, referring_agency_id
    } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return jsonError("INVALID_INPUT", "Message is required.", 400);
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return jsonError("INVALID_INPUT", `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters.`, 400);
    }

    if (!tenant_slug || typeof tenant_slug !== "string") {
      return jsonError("INVALID_INPUT", "Tenant slug is required.", 400);
    }

    // -----------------------------------------------------------------------
    // 3. Resolve tenant from slug using canonical tenant authority
    // -----------------------------------------------------------------------
    const { data: tenantData } = await supabase
      .from("tenants")
      .select("id, status, verification_status, public_site_status")
      .eq("slug", tenant_slug.toLowerCase().trim())
      .maybeSingle();

    if (!tenantData?.id) {
      return jsonError("NOT_FOUND", "Health tourism service not found.", 404);
    }

    // Gating checks according to canonical Slice 2 public site authority:
    if (tenantData.status !== "active") {
      return jsonError("NOT_FOUND", "Tenant is not active.", 404);
    }

    if (tenantData.verification_status === "suspended") {
      return jsonError("FORBIDDEN", "Tenant service is suspended.", 403);
    }

    if (tenantData.public_site_status && tenantData.public_site_status !== "published") {
      return jsonError("FORBIDDEN", "Health tourism public site is not published.", 403);
    }

    const tenantId = tenantData.id;

    // -----------------------------------------------------------------------
    // 4. Handle handoff request
    // -----------------------------------------------------------------------
    const isHandoffRequest = message.startsWith("__HANDOFF_REQUEST__:");

    // -----------------------------------------------------------------------
    // 5. Resolve or create conversation
    // -----------------------------------------------------------------------
    let conversationId: string;
    let currentSessionToken: string;
    let existingLeadId: string | null = null;
    let conversationMessages: Array<{ role: string; content: string }> = [];

    if (session_token) {
      // Validate existing session
      const { data: convData, error: getConvErr } = await supabase.rpc("ht_get_ai_conversation_by_session", {
        p_session_token: session_token,
      });

      if (getConvErr || !convData?.success || !convData?.conversation) {
        return jsonError("INVALID_SESSION", "Invalid or expired conversation session.", 401);
      }

      // Cross-tenant check
      if (convData.conversation.tenant_id !== tenantId) {
        return jsonError("FORBIDDEN", "Cross-tenant conversation access denied.", 403);
      }

      conversationId = convData.conversation.id;
      currentSessionToken = session_token;
      existingLeadId = convData.conversation.lead_id || null;
      conversationMessages = (convData.messages || []).map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      }));
    } else {
      // Create new conversation
      const { data: newConv, error: createConvErr } = await supabase.rpc("ht_create_ai_conversation", {
        p_tenant_id: tenantId,
        p_preferred_language: preferred_language || "en",
      });

      if (createConvErr || !newConv?.success) {
        console.error("ht_create_ai_conversation error:", createConvErr || newConv);
        return jsonError("CONVERSATION_CREATE_FAILED", "Unable to start conversation. Please try again.", 500);
      }

      conversationId = newConv.conversation_id;
      currentSessionToken = newConv.session_token;
    }

    // -----------------------------------------------------------------------
    // 5B. Handle Lead Creation & Linking if Contact Info Provided
    // -----------------------------------------------------------------------
    let activeLeadId: string | null = existingLeadId;

    if (!activeLeadId && full_name && (email || phone)) {
      // Create lead through canonical public authority
      const { data: leadResult, error: leadErr } = await supabase.rpc("ht_create_public_lead", {
        p_slug: tenant_slug.toLowerCase().trim(),
        p_full_name: full_name,
        p_email: email || null,
        p_phone: phone || null,
        p_preferred_language: preferred_language || "en",
        p_country_code: country_code || null,
        p_passport_number: null,
        p_source_channel: source_channel || "web",
        p_referring_agency_id: referring_agency_id || null,
      });

      if (leadErr || !leadResult?.success || !leadResult?.lead_id) {
        console.error("ht_create_public_lead error:", leadErr || leadResult);
        return jsonError("LEAD_CREATION_FAILED", "Unable to process contact details. Please try again.", 500);
      }

      activeLeadId = leadResult.lead_id;

      // Link conversation to created/reused lead via server-internal primitive
      const { data: linkResult, error: linkErr } = await supabase.rpc("ht_link_ai_conversation_to_lead", {
        p_conversation_id: conversationId,
        p_lead_id: activeLeadId,
      });

      if (linkErr || !linkResult?.success) {
        console.error("ht_link_ai_conversation_to_lead error:", linkErr || linkResult);
        return jsonError("CONVERSATION_LINK_FAILED", "Unable to connect conversation to lead record.", 500);
      }
    }

    // -----------------------------------------------------------------------
    // 5C. Check message limit (with server-authoritative handoff persistence)
    // -----------------------------------------------------------------------
    if (conversationMessages.length >= MAX_CONVERSATION_MESSAGES) {
      if (!activeLeadId) {
        return jsonSuccess({
          session_token: currentSessionToken,
          reply: null,
          conversation_id: conversationId,
          handoff_triggered: false,
          requires_contact: true,
          handoff_reason: "conversation_limit_reached",
          outcome_code: "LIMIT_REACHED_REQUIRES_CONTACT",
        });
      }

      const { data: limitHandoffRes, error: limitHandoffErr } = await supabase.rpc("ht_request_handoff", {
        p_conversation_id: conversationId,
        p_reason: "conversation_limit_reached",
      });

      if (limitHandoffErr || !limitHandoffRes?.success) {
        console.error("ht_request_handoff (limit reached) error:", limitHandoffErr || limitHandoffRes);
        return jsonError("HANDOFF_REQUEST_FAILED", "Unable to process conversation limit handoff.", 500);
      }

      return jsonSuccess({
        session_token: currentSessionToken,
        reply: null,
        conversation_id: conversationId,
        handoff_triggered: true,
        requires_contact: false,
        handoff_reason: "conversation_limit_reached",
        outcome_code: "LIMIT_REACHED_HANDOFF_COMPLETED",
      });
    }

    // -----------------------------------------------------------------------
    // 6. Handle handoff
    // -----------------------------------------------------------------------
    if (isHandoffRequest) {
      const reason = message.replace("__HANDOFF_REQUEST__:", "").trim() || "user_requested";

      // If conversation is NOT bound to a lead (no contact info), prompt for contact details!
      if (!activeLeadId) {
        return jsonSuccess({
          session_token: currentSessionToken,
          reply: null,
          conversation_id: conversationId,
          handoff_triggered: false,
          requires_contact: true,
          handoff_reason: reason,
          outcome_code: "CONTACT_REQUIRED",
        });
      }

      const { data: handoffRes, error: handoffErr } = await supabase.rpc("ht_request_handoff", {
        p_conversation_id: conversationId,
        p_reason: reason,
      });

      if (handoffErr || !handoffRes?.success) {
        console.error("ht_request_handoff error:", handoffErr || handoffRes);
        return jsonError("HANDOFF_REQUEST_FAILED", "Unable to process handoff request. Please try again.", 500);
      }

      return jsonSuccess({
        session_token: currentSessionToken,
        reply: null,
        conversation_id: conversationId,
        handoff_triggered: true,
        requires_contact: false,
        handoff_reason: reason,
        outcome_code: "HANDOFF_COMPLETED",
      });
    }

    // -----------------------------------------------------------------------
    // 7. Store user message
    // -----------------------------------------------------------------------
    const { data: userMsgRes, error: userMsgErr } = await supabase.rpc("ht_add_ai_message", {
      p_session_token: currentSessionToken,
      p_role: "user",
      p_content: message.trim(),
    });

    if (userMsgErr || !userMsgRes?.success) {
      console.error("ht_add_ai_message (user) error:", userMsgErr || userMsgRes);
      return jsonError("MESSAGE_PERSIST_FAILED", "Unable to record message. Please try again.", 500);
    }

    // -----------------------------------------------------------------------
    // 8. Check medical safety boundary
    // -----------------------------------------------------------------------
    const isMedicalQuery = containsMedicalQuery(message);

    if (isMedicalQuery) {
      const safetyResponse = "I'm an intake assistant and cannot provide medical advice, diagnosis, or treatment recommendations. Our qualified medical professionals will review your inquiry personally. Would you like me to connect you with a human coordinator who can properly address your health questions?";

      // Store safety response
      const { data: safetyMsgRes, error: safetyMsgErr } = await supabase.rpc("ht_add_ai_message", {
        p_session_token: currentSessionToken,
        p_role: "assistant",
        p_content: safetyResponse,
      });

      if (safetyMsgErr || !safetyMsgRes?.success) {
        console.error("ht_add_ai_message (safety assistant) error:", safetyMsgErr || safetyMsgRes);
        return jsonError("MESSAGE_PERSIST_FAILED", "Unable to record response. Please try again.", 500);
      }

      // Trigger handoff state
      const { data: medHandoffRes, error: medHandoffErr } = await supabase.rpc("ht_request_handoff", {
        p_conversation_id: conversationId,
        p_reason: "medical_advice_boundary",
      });

      if (medHandoffErr || !medHandoffRes?.success) {
        console.error("ht_request_handoff (medical boundary) error:", medHandoffErr || medHandoffRes);
        return jsonError("HANDOFF_REQUEST_FAILED", "Unable to record medical safety handoff. Please try again.", 500);
      }

      // If no lead bound, request contact details, do NOT claim coordinator reached out yet
      const requiresContact = !activeLeadId;

      return jsonSuccess({
        session_token: currentSessionToken,
        reply: safetyResponse,
        conversation_id: conversationId,
        handoff_triggered: true,
        requires_contact: requiresContact,
        handoff_reason: "medical_advice_boundary",
      });
    }

    // -----------------------------------------------------------------------
    // 9. Generate AI response
    // -----------------------------------------------------------------------
    let aiReply = "I'm here to help you with your health tourism inquiry. Could you tell me more about what you're looking for?";

    if (aiApiKey) {
      try {
        const systemPrompt = buildSystemPrompt(preferred_language || "en");
        const chatMessages = [
          { role: "system", content: systemPrompt },
          ...conversationMessages.filter(m => m.role !== "system").slice(-10),
          { role: "user", content: message.trim() },
        ];

        const apiUrl = aiProvider === "openai"
          ? "https://api.openai.com/v1/chat/completions"
          : "https://api.groq.com/openai/v1/chat/completions";

        const aiResponse = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${aiApiKey}`,
          },
          body: JSON.stringify({
            model: aiModel,
            messages: chatMessages,
            max_tokens: 500,
            temperature: 0.7,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const choice = aiData?.choices?.[0]?.message?.content;
          if (choice && typeof choice === "string" && choice.trim().length > 0) {
            aiReply = choice.trim();
          }
        }
      } catch {
        // Fallback to default response on provider error
      }
    }

    // -----------------------------------------------------------------------
    // 10. Store AI response
    // -----------------------------------------------------------------------
    const { data: aiMsgRes, error: aiMsgErr } = await supabase.rpc("ht_add_ai_message", {
      p_session_token: currentSessionToken,
      p_role: "assistant",
      p_content: aiReply,
    });

    if (aiMsgErr || !aiMsgRes?.success) {
      console.error("ht_add_ai_message (assistant) error:", aiMsgErr || aiMsgRes);
      return jsonError("MESSAGE_PERSIST_FAILED", "Unable to record AI response. Please try again.", 500);
    }

    // -----------------------------------------------------------------------
    // 11. Generate and persist summary for coordinator
    // -----------------------------------------------------------------------
    let summary: string | undefined;
    const totalMessages = conversationMessages.length + 2; // +user +assistant
    if (totalMessages >= 4) {
      const userMsgs = [...conversationMessages.filter(m => m.role === "user").map(m => m.content), message.trim()];
      summary = `[AI-generated assistive summary — not verified clinical fact] User interests: ${userMsgs.slice(-3).join("; ").substring(0, 300)}`;

      // Persist summary server-side to ht_ai_conversations and (if linked) ht_leads
      const { data: summaryRes, error: summaryErr } = await supabase.rpc("ht_update_ai_conversation_summary", {
        p_conversation_id: conversationId,
        p_summary: summary,
      });

      if (summaryErr || !summaryRes?.success) {
        console.error("ht_update_ai_conversation_summary error:", summaryErr || summaryRes);
        return jsonError("SUMMARY_PERSIST_FAILED", "Unable to update conversation summary. Please try again.", 500);
      }
    }

    return jsonSuccess({
      session_token: currentSessionToken,
      reply: aiReply,
      conversation_id: conversationId,
      handoff_triggered: false,
      summary,
    });

  } catch (err) {
    console.error("ht-ai-chat unhandled internal error:", err);
    return jsonError("INTERNAL_ERROR", "An unexpected error occurred in the AI chat service. Please try again.", 500);
  }
});
