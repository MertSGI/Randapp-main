import { AvailabilityRule, CatalogRepository } from './types';
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
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates'
      },
      body: JSON.stringify({ staff_id: staffId, service_id: serviceId })
    });
  }

  async removeServiceFromStaff(staffId: string, serviceId: string): Promise<void> {
    await fetchSupabase(`/rest/v1/staff_services?staff_id=eq.${staffId}&service_id=eq.${serviceId}`, {
      method: 'DELETE'
    });
  }

  async listStaffForService(tenantId: string, serviceId: string): Promise<Staff[]> {
    try {
      const url = `/rest/v1/staff_services?service_id=eq.${serviceId}&select=staff_id,staff:staff(*)`;
      const res = await fetchSupabase(url);
      if (!res.ok) return [];
      const data = await res.json();
      return data
        .filter((d: any) => d.staff && d.staff.tenant_id === tenantId && d.staff.active === true)
        .map((d: any) => ({
          id: d.staff.id,
          tenantId: d.staff.tenant_id,
          name: d.staff.name,
          title: d.staff.title,
          image: d.staff.image,
          isOwner: d.staff.is_owner,
          phone: d.staff.phone,
          calendarEmail: d.staff.calendar_email,
          active: d.staff.active
        }));
    } catch {
      return [];
    }
  }

  async listServicesForStaff(staffId: string): Promise<string[]> {
    try {
      const res = await fetchSupabase(`/rest/v1/staff_services?staff_id=eq.${staffId}&select=service_id`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((d: any) => d.service_id as string);
    } catch {
      return [];
    }
  }


  private mapAvailabilityRow(row: any): AvailabilityRule {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      staffId: row.staff_id ?? null,
      weekday: Number(row.weekday),
      is_active: row.is_active,
      start_time: row.start_time,
      end_time: row.end_time
    };
  }

  private mapAvailabilityPatch(patch: Partial<AvailabilityRule>): any {
    const mapped: any = {};
    if (patch.staffId !== undefined) mapped.staff_id = patch.staffId;
    if (patch.weekday !== undefined) mapped.weekday = patch.weekday;
    if (patch.is_active !== undefined) mapped.is_active = patch.is_active;
    if (patch.start_time !== undefined) mapped.start_time = patch.start_time;
    if (patch.end_time !== undefined) mapped.end_time = patch.end_time;
    return mapped;
  }

  async listAvailabilityRules(tenantId: string, staffId?: string): Promise<AvailabilityRule[]> {
    let url = `/rest/v1/availability_rules?tenant_id=eq.${tenantId}&select=*`;
    if (staffId) url += `&staff_id=eq.${staffId}`;
    const res = await fetchSupabase(url);
    if (!res.ok) throw new Error('Supabase availability_rules list failed');
    const data = await res.json();
    return data.map((row: any) => this.mapAvailabilityRow(row));
  }

  async updateAvailabilityRule(ruleId: string, patch: Partial<AvailabilityRule>): Promise<void> {
    const res = await fetchSupabase(`/rest/v1/availability_rules?id=eq.${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.mapAvailabilityPatch(patch))
    });
    if (!res.ok) throw new Error('Supabase availability_rules update failed');
  }

  async createAvailabilityRule(tenantId: string, input: Omit<AvailabilityRule, 'id' | 'tenantId'>): Promise<AvailabilityRule> {
    const res = await fetchSupabase('/rest/v1/availability_rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ ...this.mapAvailabilityPatch(input), tenant_id: tenantId })
    });
    if (!res.ok) throw new Error('Supabase availability_rules insert failed');
    const data = await res.json();
    return this.mapAvailabilityRow(data[0]);
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
