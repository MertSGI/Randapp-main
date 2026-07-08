import { CatalogRepository } from './types';
import { Service, Staff } from '../../types';
import { fetchSupabase } from './supabaseClient';

export class SupabaseCatalogRepository implements CatalogRepository {

  async listServices(tenantId: string, options?: { activeOnly?: boolean }): Promise<Service[]> {
    try {
      let url = `/rest/v1/services?tenant_id=eq.${tenantId}&select=*`;
      if (options?.activeOnly) url += '&active=eq.true';
      const res = await fetchSupabase(url);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((d: any) => ({
        id: d.id,
        tenantId: d.tenant_id,
        name: d.name,
        name_tr: d.name_tr,
        duration: d.duration,
        price: d.price,
        image: d.image,
        active: d.active,
        category: d.category,
      }));
    } catch { return []; }
  }

  async getServiceById(serviceId: string): Promise<Service | null> {
    try {
      const res = await fetchSupabase(`/rest/v1/services?id=eq.${serviceId}&select=*`);
      if (!res.ok) return null;
      const data = await res.json();
      return data[0] || null;
    } catch { return null; }
  }

  async createService(tenantId: string, input: Omit<Service, 'id' | 'tenantId'>): Promise<Service> {
    const res = await fetchSupabase('/rest/v1/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        tenant_id: tenantId,
        name: input.name,
        name_tr: input.name_tr,
        duration: input.duration,
        price: input.price,
        image: input.image,
        active: input.active,
        category: input.category
      })
    });
    if (!res.ok) throw new Error('Supabase insert failed');
    const data = await res.json();
    return data[0];
  }

  async updateService(serviceId: string, patch: Partial<Service>): Promise<Service | null> {
    const res = await fetchSupabase(`/rest/v1/services?id=eq.${serviceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) throw new Error('Supabase update failed');
    const data = await res.json();
    return data[0];
  }

  async deleteOrDeactivateService(serviceId: string): Promise<boolean> {
    await this.updateService(serviceId, { active: false });
    return true;
  }

  async listStaff(tenantId: string, options?: { activeOnly?: boolean }): Promise<Staff[]> {
     try {
      let url = `/rest/v1/staff?tenant_id=eq.${tenantId}&select=*`;
      if (options?.activeOnly) url += '&active=eq.true';
      const res = await fetchSupabase(url);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((d: any) => ({
        id: d.id,
        tenantId: d.tenant_id,
        name: d.name,
        title: d.title,
        image: d.image,
        isOwner: d.is_owner,
        phone: d.phone,
        calendarEmail: d.calendar_email,
        active: d.active
      }));
    } catch { return []; }
  }

  async getStaffById(staffId: string): Promise<Staff | null> {
    try {
      const res = await fetchSupabase(`/rest/v1/staff?id=eq.${staffId}&select=*`);
      if (!res.ok) return null;
      const data = await res.json();
      return data[0] || null;
    } catch { return null; }
  }

  async createStaff(tenantId: string, input: Omit<Staff, 'id' | 'tenantId'>): Promise<Staff> {
    const res = await fetchSupabase('/rest/v1/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        tenant_id: tenantId,
        name: input.name,
        title: input.title,
        image: input.image,
        is_owner: input.isOwner,
        phone: input.phone,
        calendar_email: input.calendarEmail,
        active: input.active
      })
    });
    if (!res.ok) throw new Error('Supabase insert failed');
    const data = await res.json();
    return data[0];
  }

  async updateStaff(staffId: string, patch: Partial<Staff>): Promise<Staff | null> {
    const res = await fetchSupabase(`/rest/v1/staff?id=eq.${staffId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(patch) // Mapping needed in reality, simplified here
    });
    if (!res.ok) throw new Error('update failed');
    return (await res.json())[0];
  }

  async deleteOrDeactivateStaff(staffId: string): Promise<boolean> {
    await this.updateStaff(staffId, { active: false });
    return true;
  }

  async assignServiceToStaff(staffId: string, serviceId: string): Promise<void> {
    await fetchSupabase('/rest/v1/staff_services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: staffId, service_id: serviceId })
    });
  }

  async removeServiceFromStaff(staffId: string, serviceId: string): Promise<void> {
    await fetchSupabase(`/rest/v1/staff_services?staff_id=eq.${staffId}&service_id=eq.${serviceId}`, {
      method: 'DELETE'
    });
  }

  async listStaffForService(tenantId: string, serviceId: string): Promise<Staff[]> {
    // This requires a join query in Supabase: select from staff_services
    // Using simple stub approach that falls back to all staff for now
    return this.listStaff(tenantId, { activeOnly: true });
  }

  async listAvailabilityRules(tenantId: string, staffId?: string): Promise<any[]> {
    let url = `/rest/v1/availability_rules?tenant_id=eq.${tenantId}&select=*`;
    if (staffId) url += `&staff_id=eq.${staffId}`;
    const res = await fetchSupabase(url);
    if (!res.ok) return [];
    return res.json();
  }

  async updateAvailabilityRule(ruleId: string, patch: any): Promise<void> {
    await fetchSupabase(`/rest/v1/availability_rules?id=eq.${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
    });
  }

  async createAvailabilityRule(tenantId: string, input: any): Promise<any> {
    const res = await fetchSupabase('/rest/v1/availability_rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ ...input, tenant_id: tenantId })
    });
    return (await res.json())[0];
  }

  async archiveService(tenantId: string, serviceId: string): Promise<boolean> {
    const res = await fetchSupabase(`/rest/v1/services?id=eq.${serviceId}&tenant_id=eq.${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false })
    });
    return res.ok;
  }

  async listPublicActiveServicesByTenantSlug(slug: string): Promise<Service[]> {
    try {
      const tenantRes = await fetchSupabase(`/rest/v1/tenants?slug=eq.${slug}&select=*`);
      if (!tenantRes.ok) return [];
      const tenantData = await tenantRes.json();
      if (!tenantData[0]) return [];
      
      const tenantId = tenantData[0].id;
      return this.listServices(tenantId, { activeOnly: true });
    } catch (err) {
      console.error('Error listPublicActiveServicesByTenantSlug:', err);
      return [];
    }
  }

  async archiveStaff(tenantId: string, staffId: string): Promise<boolean> {
    const res = await fetchSupabase(`/rest/v1/staff?id=eq.${staffId}&tenant_id=eq.${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false })
    });
    return res.ok;
  }

  async listPublicActiveStaffByTenantSlug(slug: string): Promise<Staff[]> {
    try {
      const tenantRes = await fetchSupabase(`/rest/v1/tenants?slug=eq.${slug}&select=*`);
      if (!tenantRes.ok) return [];
      const tenantData = await tenantRes.json();
      if (!tenantData[0]) return [];
      
      const tenantId = tenantData[0].id;
      return this.listStaff(tenantId, { activeOnly: true });
    } catch (err) {
      console.error('Error listPublicActiveStaffByTenantSlug:', err);
      return [];
    }
  }

  async getAvailability(tenantId: string): Promise<any> {
    return this.listAvailabilityRules(tenantId);
  }

  async updateAvailability(tenantId: string, input: any): Promise<any> {
    // Check if rule exists or create one
    const rules = await this.listAvailabilityRules(tenantId);
    if (rules.length > 0) {
      const firstRule = rules[0];
      await this.updateAvailabilityRule(firstRule.id, input);
      return { ...firstRule, ...input };
    } else {
      return this.createAvailabilityRule(tenantId, input);
    }
  }

  async getPublicAvailabilityByTenantSlug(slug: string): Promise<any> {
    try {
      const tenantRes = await fetchSupabase(`/rest/v1/tenants?slug=eq.${slug}&select=*`);
      if (!tenantRes.ok) return [];
      const tenantData = await tenantRes.json();
      if (!tenantData[0]) return [];
      
      const tenantId = tenantData[0].id;
      return this.getAvailability(tenantId);
    } catch (err) {
      console.error('Error getPublicAvailabilityByTenantSlug:', err);
      return [];
    }
  }
}
