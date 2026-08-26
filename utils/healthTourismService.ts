import { SupabaseClient } from '@supabase/supabase-js';
import {
  CreateAgencyParams,
  CreatePublicLeadParams,
  CreatePublicLeadResult,
  HtLead,
  HtLeadStatus,
  HtReferringAgency,
  HtStaffProfile,
  UpdateLeadAgencyParams,
  UpdateLeadStatusParams
} from '../types/healthTourism';

export class HealthTourismService {
  constructor(private client: SupabaseClient) {}

  /**
   * Public lead intake via server-authoritative RPC
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
        reason_code: error.code || 'RPC_ERROR',
        message: error.message
      };
    }

    return data as CreatePublicLeadResult;
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
    status?: HtLeadStatus,
    limit = 50,
    offset = 0
  ): Promise<{ success: boolean; leads?: HtLead[]; message?: string }> {
    const { data, error } = await this.client.rpc('ht_list_leads', {
      p_status: status ?? null,
      p_limit: limit,
      p_offset: offset
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return data as { success: boolean; leads?: HtLead[] };
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
}
