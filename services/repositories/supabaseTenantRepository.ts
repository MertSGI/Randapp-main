import { TenantRepository, Tenant } from './types';
import { fetchSupabase } from './supabaseClient';

export class SupabaseTenantRepository implements TenantRepository {
  activeTenantId: string | null = null;

  async listTenants(): Promise<Tenant[]> {
    try {
      const res = await fetchSupabase('/rest/v1/tenants?select=*');
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((t: any) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        status: t.status,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        official_business_name: t.official_business_name,
        public_display_name: t.public_display_name,
        owner_user_id: t.owner_user_id,
        category: t.category,
        city: t.city,
        district: t.district,
        phone: t.phone,
        address: t.address,
        instagram_handle: t.instagram_handle,
        subscription_status: t.subscription_status,
        business_risk_status: t.business_risk_status,
        onboarding_status: t.onboarding_status,
        branding: {
          tenantId: t.id,
          businessName: t.name,
          primaryColor: '#2563eb',
          secondaryColor: '#1d4ed8',
          logoUrl: ''
        }
      }));
    } catch {
      return [];
    }
  }

  async getTenantById(id: string): Promise<Tenant | null> {
    try {
      const res = await fetchSupabase(`/rest/v1/tenants?id=eq.${id}&select=*`);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data[0]) return null;
      const t = data[0];
      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        status: t.status,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        official_business_name: t.official_business_name,
        public_display_name: t.public_display_name,
        owner_user_id: t.owner_user_id,
        category: t.category,
        city: t.city,
        district: t.district,
        phone: t.phone,
        address: t.address,
        instagram_handle: t.instagram_handle,
        subscription_status: t.subscription_status,
        business_risk_status: t.business_risk_status,
        onboarding_status: t.onboarding_status,
        branding: {
          tenantId: t.id,
          businessName: t.name,
          primaryColor: '#2563eb',
          secondaryColor: '#1d4ed8',
          logoUrl: ''
        }
      };
    } catch {
      return null;
    }
  }

  async createTenant(input: Partial<Tenant>): Promise<Tenant> {
    const res = await fetchSupabase('/rest/v1/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        id: input.id,
        slug: input.slug,
        name: input.name,
        status: input.status || 'active',
        official_business_name: input.official_business_name,
        public_display_name: input.public_display_name,
        owner_user_id: input.owner_user_id,
        category: input.category,
        city: input.city,
        district: input.district,
        phone: input.phone,
        address: input.address,
        instagram_handle: input.instagram_handle,
        subscription_status: input.subscription_status,
        business_risk_status: input.business_risk_status || 'normal',
        onboarding_status: input.onboarding_status || 'not_started',
      })
    });
    if (!res.ok) throw new Error('Supabase tenant creation failed');
    const data = await res.json();
    const t = data[0];
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: t.status,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      official_business_name: t.official_business_name,
      public_display_name: t.public_display_name,
      owner_user_id: t.owner_user_id,
      category: t.category,
      city: t.city,
      district: t.district,
      phone: t.phone,
      address: t.address,
      instagram_handle: t.instagram_handle,
      subscription_status: t.subscription_status,
      business_risk_status: t.business_risk_status,
      onboarding_status: t.onboarding_status,
      branding: {
        tenantId: t.id,
        businessName: t.name,
        primaryColor: '#2563eb',
        secondaryColor: '#1d4ed8',
        logoUrl: ''
      }
    };
  }

  async updateTenant(id: string, patch: Partial<Tenant>): Promise<void> {
    const res = await fetchSupabase(`/rest/v1/tenants?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: patch.slug,
        name: patch.name,
        status: patch.status,
        official_business_name: patch.official_business_name,
        public_display_name: patch.public_display_name,
        category: patch.category,
        city: patch.city,
        district: patch.district,
        phone: patch.phone,
        address: patch.address,
        instagram_handle: patch.instagram_handle,
        subscription_status: patch.subscription_status,
        business_risk_status: patch.business_risk_status,
        onboarding_status: patch.onboarding_status,
        updated_at: new Date().toISOString()
      })
    });
    if (!res.ok) throw new Error('Supabase tenant update failed');
  }

  setActiveTenant(id: string): void {
    this.activeTenantId = id;
    localStorage.setItem('lari_active_tenant_id', id);
  }

  getActiveTenantId(): string | null {
    if (!this.activeTenantId) {
      this.activeTenantId = localStorage.getItem('lari_active_tenant_id');
    }
    return this.activeTenantId;
  }
}
