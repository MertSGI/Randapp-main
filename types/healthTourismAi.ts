/**
 * Health Tourism AI Assist Types
 * Types for public AI chat widget and AI-assisted lead scoring
 */

export interface HtAiChatRequest {
  session_token?: string;
  message: string;
  tenant_slug: string;
  preferred_language?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  country_code?: string;
  source_channel?: string;
  referring_agency_id?: string;
}

export interface HtAiChatResponse {
  success: boolean;
  session_token?: string;
  reply?: string;
  conversation_id?: string;
  handoff_triggered?: boolean;
  requires_contact?: boolean;
  handoff_reason?: string;
  outcome_code?:
    | 'MEDICAL_SAFETY_BOUNDARY'
    | 'CONTACT_REQUIRED'
    | 'HANDOFF_COMPLETED'
    | 'LIMIT_REACHED_REQUIRES_CONTACT'
    | 'LIMIT_REACHED_HANDOFF_COMPLETED';
  /** AI-generated assistive summary — not verified clinical fact */
  summary?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface HtLeadScoreResult {
  success: boolean;
  lead_id?: string;
  lead_score?: number;
  lead_score_band?: string;
  lead_score_reasons?: string[];
  rule_score?: number;
  ai_intent_delta?: number;
  message?: string;
}
