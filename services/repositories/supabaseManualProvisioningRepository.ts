import { ManualProvisioningRepository } from './types';
import { fetchSupabase } from './supabaseClient';

export class SupabaseManualProvisioningRepository implements ManualProvisioningRepository {
  async getProvisioningLog(tenantId: string): Promise<any | null> {
    try {
      const res = await fetchSupabase(`/rest/v1/tenant_onboarding_progress?tenant_id=eq.${tenantId}&select=*`);
      if (!res.ok) return null;
      const data = await res.json();
      return data[0] || null;
    } catch {
      return null;
    }
  }

  async logProvisioningSuccess(tenantId: string, log: any): Promise<void> {
    try {
      const existing = await this.getProvisioningLog(tenantId);
      const body = {
        salon_info_completed: log.salon_info_completed ?? true,
        branding_completed: log.branding_completed ?? true,
        whatsapp_completed: log.whatsapp_completed ?? true,
        services_completed: log.services_completed ?? true,
        staff_completed: log.staff_completed ?? true,
        calendar_completed: log.calendar_completed ?? true,
        test_appointment_completed: log.test_appointment_completed ?? true,
        reviewed_by_admin: log.reviewed_by_admin ?? true,
        live_enabled: log.live_enabled ?? true,
        updated_at: new Date().toISOString()
      };

      if (existing) {
        await fetchSupabase(`/rest/v1/tenant_onboarding_progress?tenant_id=eq.${tenantId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      } else {
        await fetchSupabase('/rest/v1/tenant_onboarding_progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...body,
            tenant_id: tenantId,
            created_at: new Date().toISOString()
          })
        });
      }
    } catch (err) {
      console.error('Error logging provisioning success to Supabase:', err);
    }
  }
}
