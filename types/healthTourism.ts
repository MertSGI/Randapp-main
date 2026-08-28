export type HtLeadStatus = 'new' | 'contacted' | 'qualified' | 'handoff_pending' | 'converted' | 'closed';

export type HtSourceChannel =
  | 'web'
  | 'whatsapp'
  | 'agency_referral'
  | 'organic'
  | 'paid_search'
  | 'social'
  | 'direct'
  | 'other';

export type HtLeadScoreBand = 'cold' | 'warm' | 'hot';

export type HtHandoffState = 'none' | 'requested' | 'acknowledged';

export type HtConversationStatus = 'active' | 'completed' | 'expired';

export type HtServiceErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'INVALID_STATE'
  | 'INVALID_TRANSITION'
  | 'CROSS_TENANT_VIOLATION'
  | 'UNKNOWN';

export interface HtReferringAgency {
  id: string;
  tenant_id: string;
  name: string;
  code: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface HtStaffProfile {
  tenant_id: string;
  staff_id: string;
  can_manage_ht_leads: boolean;
  can_view_ht_leads: boolean;
  created_at: string;
  updated_at: string;
}

/**
  * Ordinary HtLead projection for browser/coordinator workspace.
  * NOTE: Sensitive passport_number is strictly excluded from ordinary read contracts for privacy containment.
  */
export interface HtLead {
  id: string;
  tenant_id: string;
  status: HtLeadStatus;
  source_channel: HtSourceChannel;
  referring_agency_id: string | null;
  agency_name?: string;
  agency_code?: string;
  preferred_language: string;
  country_code: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes?: string | null;
  // Slice 3: Operational fields
  assigned_coordinator_staff_id?: string | null;
  coordinator_name?: string | null;
  lead_score?: number | null;
  lead_score_band?: HtLeadScoreBand | null;
  lead_score_reasons?: string[] | null;
  ai_summary?: string | null;
  ai_summary_updated_at?: string | null;
  handoff_state?: HtHandoffState;
  handoff_reason?: string | null;
  handoff_requested_at?: string | null;
  last_activity_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface HtAiConversation {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  session_token?: string;
  preferred_language: string;
  status: HtConversationStatus;
  handoff_state: HtHandoffState;
  summary: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface HtAiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export interface CreatePublicLeadParams {
  slug: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  preferred_language?: string;
  country_code?: string | null;
  passport_number?: string | null;
  source_channel?: HtSourceChannel;
  referring_agency_id?: string | null;
}

export interface CreatePublicLeadResult {
  success: boolean;
  lead_id?: string;
  tenant_id?: string;
  status?: HtLeadStatus;
  created_at?: string;
  reason_code?: HtServiceErrorCode | string;
  message?: string;
}

export interface UpdateLeadStatusParams {
  lead_id: string;
  status: HtLeadStatus;
  notes?: string | null;
}

export interface UpdateLeadAgencyParams {
  lead_id: string;
  referring_agency_id: string | null;
}

export interface CreateAgencyParams {
  name: string;
  code?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
}

// Slice 3: Coordinator Operations
export interface AssignCoordinatorParams {
  lead_id: string;
  coordinator_staff_id: string;
}

export interface ScoreLeadParams {
  lead_id: string;
  ai_intent_delta?: number;
}

export interface AcknowledgeHandoffParams {
  lead_id: string;
}

export interface EnqueueWhatsAppHandoffParams {
  lead_id: string;
  conversation_id?: string | null;
  handoff_reason?: string;
}

export interface HtLeadListParams {
  status?: HtLeadStatus | null;
  score_band?: HtLeadScoreBand | null;
  source_channel?: HtSourceChannel | null;
  limit?: number;
  offset?: number;
}

export interface HtLeadListResult {
  success: boolean;
  leads?: HtLead[];
  total?: number;
  limit?: number;
  offset?: number;
  message?: string;
}
