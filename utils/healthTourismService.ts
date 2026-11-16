import { SupabaseClient } from '@supabase/supabase-js';
import { getDataSourceMode, type DataSourceMode } from '../services/dataSourceConfig';
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
  ScoreLeadParams,
  UpdateLeadAgencyParams,
  UpdateLeadStatusParams,
} from '../types/healthTourism';
import { HtLeadScoreResult } from '../types/healthTourismAi';

export interface HtRpcClientLike {
  rpc: (
    fn: string,
    args?: Record<string, any>
  ) => Promise<{ data: any; error: { message?: string } | null }> | any;
}

export interface HtRegulatoryHoldStatus {
  classification: 'EXTERNAL_HOLD';
  kvkkSpecialCategoryHealthDataApproval: 'EXTERNAL_HOLD';
  healthTourismAuthorizationCertificate: 'EXTERNAL_HOLD';
  liveWhatsappAndMessagingDispatch: 'EXTERNAL_HOLD';
  productionGoLive: 'NO_GO';
}

export class HealthTourismService {
  constructor(private client: SupabaseClient | HtRpcClientLike) {}

  getExecutionAuthority(modeOverride?: DataSourceMode): 'DB_AUTHORITATIVE' | 'LOCAL_SIMULATION' {
    const mode = modeOverride ?? getDataSourceMode();
    return mode === 'supabase' ? 'DB_AUTHORITATIVE' : 'LOCAL_SIMULATION';
  }

  getRegulatoryHoldStatus(): HtRegulatoryHoldStatus {
    return {
      classification: 'EXTERNAL_HOLD',
      kvkkSpecialCategoryHealthDataApproval: 'EXTERNAL_HOLD',
      healthTourismAuthorizationCertificate: 'EXTERNAL_HOLD',
      liveWhatsappAndMessagingDispatch: 'EXTERNAL_HOLD',
      productionGoLive: 'NO_GO',
    };
  }

  async createPublicLead(
    params: CreatePublicLeadParams,
    options?: { mode?: DataSourceMode }
  ): Promise<CreatePublicLeadResult> {
    if (this.getExecutionAuthority(options?.mode) !== 'DB_AUTHORITATIVE') {
      return {
        success: false,
        reason_code: 'LOCAL_SIMULATION_DB_RPC_UNAVAILABLE',
        message: 'Health tourism public intake requires Supabase server authority mode.',
      };
    }

    const { data, error } = await (this.client.rpc as any)('ht_create_public_lead', {
      p_slug: params.slug,
      p_full_name: params.full_name,
      p_email: params.email ?? null,
      p_phone: params.phone ?? null,
      p_preferred_language: params.preferred_language ?? 'en',
      p_country_code: params.country_code ?? null,
      p_passport_number: params.passport_number ?? null,
      p_source_channel: params.source_channel ?? 'web',
      p_referring_agency_id: params.referring_agency_id ?? null,
    });

    if (error) {
      return {
        success: false,
        reason_code: 'PUBLIC_INTAKE_FAILED',
        message: 'Unable to submit health tourism request.',
      };
    }

    return data as CreatePublicLeadResult;
  }

  async getMyHtContext(options?: {
    mode?: DataSourceMode;
  }): Promise<{
    success: boolean;
    tenant_id?: string;
    staff_id?: string;
    can_view_ht_leads?: boolean;
    can_manage_ht_leads?: boolean;
    reason_code?: string;
    message?: string;
  }> {
    if (this.getExecutionAuthority(options?.mode) !== 'DB_AUTHORITATIVE') {
      return {
        success: false,
        reason_code: 'LOCAL_SIMULATION_DB_RPC_UNAVAILABLE',
        message: 'Health tourism coordinator context requires Supabase server authority mode.',
      };
    }

    const { data, error } = await (this.client.rpc as any)('ht_get_my_context');
    if (error) {
      return { success: false, message: error.message };
    }
    return data;
  }

  async getLead(
    leadId: string,
    options?: { mode?: DataSourceMode }
  ): Promise<{ success: boolean; lead?: HtLead; reason_code?: string; message?: string }> {
    if (this.getExecutionAuthority(options?.mode) !== 'DB_AUTHORITATIVE') {
      return {
        success: false,
        reason_code: 'LOCAL_SIMULATION_DB_RPC_UNAVAILABLE',
        message: 'Supabase server authority mode required.',
      };
    }

    const { data, error } = await (this.client.rpc as any)('ht_get_lead', { p_lead_id: leadId });
    if (error) {
      return { success: false, message: error.message };
    }
    return data as { success: boolean; lead?: HtLead };
  }

  async listLeads(
    params?: HtLeadListParams,
    options?: { mode?: DataSourceMode }
  ): Promise<HtLeadListResult> {
    if (this.getExecutionAuthority(options?.mode) !== 'DB_AUTHORITATIVE') {
      return {
        success: false,
        message: 'Supabase server authority mode required.',
      };
    }

    const { data, error } = await (this.client.rpc as any)('ht_list_leads', {
      p_status: params?.status ?? null,
      p_limit: params?.limit ?? 50,
      p_offset: params?.offset ?? 0,
      p_score_band: params?.score_band ?? null,
      p_source_channel: params?.source_channel ?? null,
    });

    if (error) {
      return { success: false, message: error.message };
    }
    return data as HtLeadListResult;
  }

  private async invokeRpc<T extends { success: boolean; reason_code?: string; message?: string }>(
    rpcName: string,
    args: Record<string, unknown>,
    options?: { mode?: DataSourceMode },
    unavailableMessage = 'Supabase server authority mode required.'
  ): Promise<T> {
    if (this.getExecutionAuthority(options?.mode) !== 'DB_AUTHORITATIVE') {
      return {
        success: false,
        reason_code: 'LOCAL_SIMULATION_DB_RPC_UNAVAILABLE',
        message: unavailableMessage,
      } as T;
    }

    const { data, error } = await (this.client.rpc as any)(rpcName, args);
    if (error) {
      return { success: false, message: error.message } as T;
    }
    return data as T;
  }

  async updateLeadStatus(
    params: UpdateLeadStatusParams,
    options?: { mode?: DataSourceMode }
  ): Promise<{ success: boolean; lead_id?: string; status?: HtLeadStatus; reason_code?: string; message?: string }> {
    return this.invokeRpc(
      'ht_update_lead_status',
      {
        p_lead_id: params.lead_id,
        p_status: params.status,
        p_notes: params.notes ?? null,
      },
      options
    );
  }

  async updateLeadAgencyAttribution(
    params: UpdateLeadAgencyParams,
    options?: { mode?: DataSourceMode }
  ): Promise<{ success: boolean; lead_id?: string; referring_agency_id?: string | null; reason_code?: string; message?: string }> {
    return this.invokeRpc(
      'ht_update_lead_agency_attribution',
      {
        p_lead_id: params.lead_id,
        p_referring_agency_id: params.referring_agency_id,
      },
      options
    );
  }

  async createReferringAgency(
    params: CreateAgencyParams,
    options?: { mode?: DataSourceMode }
  ): Promise<{ success: boolean; agency_id?: string; name?: string; reason_code?: string; message?: string }> {
    return this.invokeRpc(
      'ht_create_referring_agency',
      {
        p_name: params.name,
        p_code: params.code ?? null,
        p_contact_email: params.contact_email ?? null,
        p_contact_phone: params.contact_phone ?? null,
      },
      options
    );
  }

  async listReferringAgencies(
    activeOnly = true,
    options?: { mode?: DataSourceMode }
  ): Promise<{ success: boolean; agencies?: HtReferringAgency[]; reason_code?: string; message?: string }> {
    return this.invokeRpc(
      'ht_list_referring_agencies',
      {
        p_active_only: activeOnly,
      },
      options
    );
  }

  async setHtStaffProfile(
    staffId: string,
    canManageHtLeads: boolean,
    canViewHtLeads: boolean,
    options?: { mode?: DataSourceMode }
  ): Promise<{ success: boolean; staff_id?: string; reason_code?: string; message?: string }> {
    return this.invokeRpc(
      'ht_set_staff_profile',
      {
        p_staff_id: staffId,
        p_can_manage_ht_leads: canManageHtLeads,
        p_can_view_ht_leads: canViewHtLeads,
      },
      options
    );
  }

  async assignCoordinator(
    params: AssignCoordinatorParams,
    options?: { mode?: DataSourceMode }
  ): Promise<{ success: boolean; lead_id?: string; assigned_coordinator_staff_id?: string; reason_code?: string; message?: string }> {
    return this.invokeRpc(
      'ht_assign_coordinator',
      {
        p_lead_id: params.lead_id,
        p_coordinator_staff_id: params.coordinator_staff_id,
      },
      options
    );
  }

  async scoreLead(
    params: ScoreLeadParams,
    options?: { mode?: DataSourceMode }
  ): Promise<HtLeadScoreResult & { reason_code?: string }> {
    return this.invokeRpc<HtLeadScoreResult & { reason_code?: string }>(
      'ht_score_lead',
      {
        p_lead_id: params.lead_id,
        p_ai_intent_delta: params.ai_intent_delta ?? 0,
      },
      options
    );
  }

  async updateAiSummary(
    leadId: string,
    summary: string,
    options?: { mode?: DataSourceMode }
  ): Promise<{ success: boolean; lead_id?: string; reason_code?: string; message?: string }> {
    return this.invokeRpc(
      'ht_update_ai_summary',
      {
        p_lead_id: leadId,
        p_summary: summary,
      },
      options
    );
  }

  async acknowledgeHandoff(
    params: AcknowledgeHandoffParams,
    options?: { mode?: DataSourceMode }
  ): Promise<{ success: boolean; lead_id?: string; handoff_state?: string; reason_code?: string; message?: string }> {
    return this.invokeRpc(
      'ht_acknowledge_handoff',
      {
        p_lead_id: params.lead_id,
      },
      options
    );
  }

  /**
   * Enqueues a synthetic WhatsApp handoff record into communication_outbox.
   * No real external send (EXTERNAL_HOLD).
   */
  async enqueueWhatsAppHandoff(
    params: EnqueueWhatsAppHandoffParams,
    options?: { mode?: DataSourceMode }
  ): Promise<{ success: boolean; outbox_id?: string; reason_code?: string; message?: string }> {
    return this.invokeRpc(
      'ht_enqueue_whatsapp_handoff',
      {
        p_lead_id: params.lead_id,
        p_conversation_id: params.conversation_id ?? null,
        p_handoff_reason: params.handoff_reason ?? 'human_handoff_requested',
      },
      options
    );
  }

  async createTreatmentJourney(
    params: {
      title: string;
      lead_id?: string | null;
      customer_id?: string | null;
      coordinator_staff_id?: string | null;
      target_treatment_category?: string | null;
      arrival_date?: string | null;
      departure_date?: string | null;
      notes?: string | null;
    },
    options?: { mode?: DataSourceMode }
  ): Promise<{ success: boolean; journey_id?: string; reason_code?: string; message?: string }> {
    return this.invokeRpc(
      'ht_create_treatment_journey',
      {
        p_title: params.title,
        p_lead_id: params.lead_id ?? null,
        p_customer_id: params.customer_id ?? null,
        p_coordinator_staff_id: params.coordinator_staff_id ?? null,
        p_target_treatment_category: params.target_treatment_category ?? null,
        p_arrival_date: params.arrival_date ?? null,
        p_departure_date: params.departure_date ?? null,
        p_notes: params.notes ?? null,
      },
      options
    );
  }

  async createOrUpdateJourneyQuote(
    params: {
      journey_id: string;
      currency: string;
      total_amount_minor_units: number;
      items: Array<{ description: string; category: string; amount_minor_units: number }>;
      valid_until?: string | null;
    },
    options?: { mode?: DataSourceMode }
  ): Promise<{ success: boolean; quote_id?: string; version?: number; reason_code?: string; message?: string }> {
    return this.invokeRpc(
      'ht_create_or_update_journey_quote',
      {
        p_journey_id: params.journey_id,
        p_currency: params.currency,
        p_total_amount_minor_units: params.total_amount_minor_units,
        p_items: params.items,
        p_valid_until: params.valid_until ?? null,
      },
      options
    );
  }

  async addJourneyItineraryEvent(
    params: {
      journey_id: string;
      event_type: string;
      title: string;
      scheduled_start: string;
      scheduled_end?: string | null;
      location?: string | null;
      appointment_id?: string | null;
      assigned_coordinator_staff_id?: string | null;
      notes?: string | null;
    },
    options?: { mode?: DataSourceMode }
  ): Promise<{ success: boolean; event_id?: string; reason_code?: string; message?: string }> {
    return this.invokeRpc(
      'ht_add_journey_itinerary_event',
      {
        p_journey_id: params.journey_id,
        p_event_type: params.event_type,
        p_title: params.title,
        p_scheduled_start: params.scheduled_start,
        p_scheduled_end: params.scheduled_end ?? null,
        p_location: params.location ?? null,
        p_appointment_id: params.appointment_id ?? null,
        p_assigned_coordinator_staff_id: params.assigned_coordinator_staff_id ?? null,
        p_notes: params.notes ?? null,
      },
      options
    );
  }
}
