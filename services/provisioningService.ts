import { supabase } from './supabaseClient';
import { dataProvider } from './dataProvider';

export type ProvisioningStatus = 
  | 'pending_payment'
  | 'payment_verified'
  | 'tenant_created'
  | 'onboarding_required'
  | 'setup_in_progress'
  | 'ready_for_review'
  | 'live'
  | 'failed';

export interface ProvisioningPayload {
  checkoutSessionId: string;
  planId: string;
  email: string;
  salonName: string;
}

export const provisioningService = {
  async createTenantFromCheckout(payload: ProvisioningPayload): Promise<{ tenantId: string } | null> {
    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';

    if (mode === 'supabase') {
      console.warn("createTenantFromCheckout MUST be called server-side inside an Edge Function after verified webhook.");
      // Edge Function handles creating tenant, subscription record, owner profile, etc.
      return { tenantId: 'mock-edge-tenant' };
    }

    // Mock Mode
    console.log(`[Mock Provisioning] Simulating tenant creation for ${payload.salonName}`);
    return { tenantId: 'mock-tenant-' + Date.now() };
  },

  async createDefaultTenantBranding(tenantId: string, data: any): Promise<void> {
    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';
    if (mode === 'supabase') {
      console.warn("createDefaultTenantBranding should ideally be handled via Edge Function or RLS policy during provisioning.");
      return;
    }
    console.log(`[Mock Provisioning] Creating default branding for ${tenantId}`);
  },

  async createSalonOwnerProfile(tenantId: string, userId: string, email: string): Promise<void> {
    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';
    if (mode === 'supabase') {
      console.warn("createSalonOwnerProfile MUST be called server-side inside an Edge Function.");
      return;
    }
    console.log(`[Mock Provisioning] Creating owner profile ${email} for ${tenantId}`);
  },

  async seedDefaultServices(tenantId: string): Promise<void> {
    console.log(`[Provisioning] Seeding default services for ${tenantId}`);
  },

  async seedDefaultStaff(tenantId: string): Promise<void> {
    console.log(`[Provisioning] Seeding default staff for ${tenantId}`);
  },

  async markTenantProvisioningStatus(tenantId: string, status: ProvisioningStatus): Promise<void> {
    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';
    if (mode === 'supabase') {
      // In a real app, salon owner might update to 'setup_in_progress', 'ready_for_review'.
      // Usually done via standard Supabase update if RLS permits.
      const { error } = await supabase
        .from('tenants')
        .update({ provisioning_status: status })
        .eq('id', tenantId);
        
      if (error) console.error("Error updating provisioning status:", error);
      return;
    }
    console.log(`[Mock Provisioning] Marking tenant ${tenantId} as ${status}`);
    await dataProvider.set(`randapp:${tenantId}:provisioning_status`, status);
  },

  async getProvisioningStatus(tenantId: string): Promise<ProvisioningStatus> {
    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';
    if (mode === 'supabase') {
      const { data, error } = await supabase
        .from('tenants')
        .select('provisioning_status')
        .eq('id', tenantId)
        .single();
      
      if (error) return 'failed';
      return data?.provisioning_status || 'setup_in_progress';
    }

    const status = await dataProvider.get<ProvisioningStatus>(`randapp:${tenantId}:provisioning_status`);
    return status || 'onboarding_required';
  }
};
