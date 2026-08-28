import { SupabaseClient } from '@supabase/supabase-js';
import {
  AssignCoordinatorParams,
  AcknowledgeHandoffParams,
  CreateAgencyParams,
  CreatePublicLeadParams,
  CreatePublicLeadResult,
  EnqueueWhatsAppHandoffParams,
  HtLead,
  HtLeadListParams,
  HtLeadListResult,
  HtLeadStatus,
  HtReferringAgency,
  HtStaffProfile,
  ScoreLeadParams,
  UpdateLeadAgencyParams,
  UpdateLeadStatusParams
} from '../types/healthTourism';
import { HtLeadScoreResult } from '../types/healthTourismAi';

export class HealthTourismService {
  constructor(private client: SupabaseClient) {}

  /**
   * Public lead intake via server-authoritative RPC.
   * Maps database exceptions to a stable, non-disclosing public result.
   */
  async createPublicLead(params: CreatePublicLeadParams): Promise<CreatePublicLeadResult> {
    const { data, error } = await this.client.rpc('ht_create_public_lead', {
      p_slug: params.slug,
      p_full_name: params.full_name,
      p_email: params.email ?? null,
      p_phone: params.phone ?? null,
      p_preferred_language: params.preferred_language ?? 'en',
      p_country_code: params.country_code ?? null,
      p_passport_number: params.passport_number ?? null,
      p_source_channel: params.source_channel ?? 'web',
      p_referring_agency_id: params.referring_agency_id ?? null
    });

    if (error) {
      return {
        success: false,
        reason_code: 'PUBLIC_INTAKE_FAILED',
        message: 'Unable to submit health tourism request.'
      };
    }

    return data as CreatePublicLeadResult;
  }

  /**
   * Fetch current staff's HT context and capabilities server-authoritatively.
   */
  async getMyHtContext(): Promise<{ success: boolean; tenant_id?: string; staff_id?: string; can_view_ht_leads?: boolean; can_manage_ht_leads?: boolean; reason_code?: string; message?: string }> {
    const { data, error } = await this.client.rpc('ht_get_my_context');

    if (error) {
      return { success: false, message: error.message };
    }

    return data as { success: boolean; tenant_id?: string; staff_id?: string; can_view_ht_leads?: boolean; can_manage_ht_leads?: boolean; reason_code?: string };
  }

  /**
   * Fetch single lead detail for authorized HT staff
   */
  async getLead(leadId: string): Promise<{ success: boolean; lead?: HtLead; message?: string }> {
    const { data, error } = await this.client.rpc('ht_get_lead', {
      p_lead_id: leadId
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return data as { success: boolean; lead?: HtLead };
  }

  /**
   * List leads for authorized HT staff
   */
  async listLeads(
    params?: HtLeadListParams
  ): Promise<HtLeadListResult> {
    const { data, error } = await this.client.rpc('ht_list_leads', {
      p_status: params?.status ?? null,
      p_limit: params?.limit ?? 50,
      p_offset: params?.offset ?? 0,
      p_score_band: params?.score_band ?? null,
      p_source_channel: params?.source_channel ?? null
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return data as HtLeadListResult;
  }

  /**
   * Update lead lifecycle status
   */
  async updateLeadStatus(params: UpdateLeadStatusParams): Promise<{ success: boolean; lead_id?: string; status?: HtLeadStatus; message?: string }> {
    const { data, error } = await this.client.rpc('ht_update_lead_status', {
      p_lead_id: params.lead_id,
      p_status: params.status,
      p_notes: params.notes ?? null
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return data as { success: boolean; lead_id?: string; status?: HtLeadStatus };
  }

  /**
   * Update lead agency attribution
   */
  async updateLeadAgencyAttribution(params: UpdateLeadAgencyParams): Promise<{ success: boolean; lead_id?: string; referring_agency_id?: string | null; message?: string }> {
    const { data, error } = await this.client.rpc('ht_update_lead_agency_attribution', {
      p_lead_id: params.lead_id,
      p_referring_agency_id: params.referring_agency_id
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return data as { success: boolean; lead_id?: string; referring_agency_id?: string | null };
  }

  /**
   * Create referring agency for tenant
   */
  async createReferringAgency(params: CreateAgencyParams): Promise<{ success: boolean; agency_id?: string; name?: string; message?: string }> {
    const { data, error } = await this.client.rpc('ht_create_referring_agency', {
      p_name: params.name,
      p_code: params.code ?? null,
      p_contact_email: params.contact_email ?? null,
      p_contact_phone: params.contact_phone ?? null
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return data as { success: boolean; agency_id?: string; name?: string };
  }

  /**
   * List referring agencies for tenant
   */
  async listReferringAgencies(activeOnly = true): Promise<{ success: boolean; agencies?: HtReferringAgency[]; message?: string }> {
    const { data, error } = await this.client.rpc('ht_list_referring_agencies', {
      p_active_only: activeOnly
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return data as { success: boolean; agencies?: HtReferringAgency[] };
  }

  /**
   * Configure HT staff capabilities (Tenant Owner only)
   */
  async setHtStaffProfile(
    staffId: string,
    canManageHtLeads: boolean,
    canViewHtLeads: boolean
  ): Promise<{ success: boolean; staff_id?: string; message?: string }> {
    const { data, error } = await this.client.rpc('ht_set_staff_profile', {
      p_staff_id: staffId,
      p_can_manage_ht_leads: canManageHtLeads,
      p_can_view_ht_leads: canViewHtLeads
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return data as { success: boolean; staff_id?: string };
  }

  // =========================================================================
  // Slice 3: Coordinator Operations
  // =========================================================================

  /**
   * Assign a coordinator to a lead (same-tenant, active staff only)
   */
  async assignCoordinator(params: AssignCoordinatorParams): Promise<{ success: boolean; lead_id?: string; assigned_coordinator_staff_id?: string; message?: string }> {
    const { data, error } = await this.client.rpc('ht_assign_coordinator', {
      p_lead_id: params.lead_id,
      p_coordinator_staff_id: params.coordinator_staff_id
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return data as { success: boolean; lead_id?: string; assigned_coordinator_staff_id?: string };
  }

  /**
   * Score a lead using deterministic rules + bounded AI delta
   */
  async scoreLead(params: ScoreLeadParams): Promise<HtLeadScoreResult> {
    const { data, error } = await this.client.rpc('ht_score_lead', {
      p_lead_id: params.lead_id,
      p_ai_intent_delta: params.ai_intent_delta ?? 0
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return data as HtLeadScoreResult;
  }

  /**
   * Update AI-generated summary for a lead
   */
  async updateAiSummary(leadId: string, summary: string): Promise<{ success: boolean; lead_id?: string; message?: string }> {
    const { data, error } = await this.client.rpc('ht_update_ai_summary', {
      p_lead_id: leadId,
      p_summary: summary
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return data as { success: boolean; lead_id?: string };
  }

  /**
   * Acknowledge a handoff request for a lead
   */
  async acknowledgeHandoff(params: AcknowledgeHandoffParams): Promise<{ success: boolean; lead_id?: string; handoff_state?: string; message?: string }> {
    const { data, error } = await this.client.rpc('ht_acknowledge_handoff', {
      p_lead_id: params.lead_id
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return data as { success: boolean; lead_id?: string; handoff_state?: string };
  }

  /**
   * Enqueue a WhatsApp handoff primitive into communication_outbox.
   * No real external send. Status stays 'queued' for future provider activation.
   */
  async enqueueWhatsAppHandoff(params: EnqueueWhatsAppHandoffParams): Promise<{ success: boolean; outbox_id?: string; message?: string }> {
    const { data, error } = await this.client.rpc('ht_enqueue_whatsapp_handoff', {
      p_lead_id: params.lead_id,
      p_conversation_id: params.conversation_id ?? null,
      p_handoff_reason: params.handoff_reason ?? 'human_handoff_requested'
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return data as { success: boolean; outbox_id?: string };
  }

  /**
   * Clean up expired AI data (messages and conversations).
   * Leads are NEVER deleted by this function.
   */
  async cleanupExpiredAiData(): Promise<{ success: boolean; deleted_messages?: number; deleted_conversations?: number; message?: string }> {
    const { data, error } = await this.client.rpc('ht_cleanup_expired_ai_data');

    if (error) {
      return { success: false, message: error.message };
    }

    return data as { success: boolean; deleted_messages?: number; deleted_conversations?: number };
  }
}
