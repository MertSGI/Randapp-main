import { AvailabilityRule, CatalogRepository } from './types.ts';
import { Service, Staff } from '../../types.ts';
import { fetchSupabase } from './supabaseClient';

export function assertTenantId(tenantId?: string, operation: string = 'operation'): string {
  if (tenantId !== undefined && (typeof tenantId !== 'string' || !tenantId.trim())) {
    throw new Error(`[supabaseCatalogRepository] Security error: invalid or empty tenantId provided for ${operation}`);
  }
  return tenantId?.trim() || '';
}

export function requireTenantId(tenantId: string, operation: string = 'operation'): string {
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new Error(`[supabaseCatalogRepository] Security error: non-empty tenantId is required for ${operation}`);
  }
  return tenantId.trim();
}

export class SupabaseCatalogRepository implements CatalogRepository {

  private mapServiceRow(d: any): Service {
    return {
      id: d.id,
      tenantId: d.tenant_id,
      name: d.name,
      name_tr: d.name_tr,
      duration: d.duration,
      price: d.price,
      image: d.image,
      active: d.active,
      category: d.category,
    };
  }

  private mapStaffRow(d: any): Staff {
    return {
      id: d.id,
      tenantId: d.tenant_id,
      name: d.name,
      title: d.title,
      image: d.image,
      isOwner: d.is_owner ?? d.isOwner ?? false,
      phone: d.phone,
      calendarEmail: d.calendar_email ?? d.calendarEmail,
      active: d.active
    };
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

  private mapServicePatch(patch: Partial<Service>): Record<string, any> {
    const mapped: Record<string, any> = {};
    if (patch.name !== undefined) mapped.name = patch.name;
    if (patch.name_tr !== undefined) mapped.name_tr = patch.name_tr;
    if (patch.duration !== undefined) mapped.duration = patch.duration;
    if (patch.price !== undefined) mapped.price = patch.price;
    if (patch.image !== undefined) mapped.image = patch.image;
    if (patch.active !== undefined) mapped.active = patch.active;
    if (patch.category !== undefined) mapped.category = patch.category;
    return mapped;
  }

  private mapStaffPatch(patch: Partial<Staff>): Record<string, any> {
    const mapped: Record<string, any> = {};
    if (patch.name !== undefined) mapped.name = patch.name;
    if (patch.title !== undefined) mapped.title = patch.title;
    if (patch.image !== undefined) mapped.image = patch.image;
    if (patch.isOwner !== undefined) mapped.is_owner = patch.isOwner;
    if (patch.phone !== undefined) mapped.phone = patch.phone;
    if (patch.calendarEmail !== undefined) mapped.calendar_email = patch.calendarEmail;
    if (patch.active !== undefined) mapped.active = patch.active;
    return mapped;
  }

  private mapAvailabilityPatch(patch: Partial<AvailabilityRule>): Record<string, any> {
    const mapped: Record<string, any> = {};
    if (patch.staffId !== undefined) mapped.staff_id = patch.staffId;
    if (patch.weekday !== undefined) mapped.weekday = patch.weekday;
    if (patch.is_active !== undefined) mapped.is_active = patch.is_active;
    if (patch.start_time !== undefined) mapped.start_time = patch.start_time;
    if (patch.end_time !== undefined) mapped.end_time = patch.end_time;
    return mapped;
  }

  async listServices(tenantId: string, options?: { activeOnly?: boolean }): Promise<Service[]> {
    try {
      const validTenantId = requireTenantId(tenantId, 'listServices');
      let url = `/rest/v1/services?tenant_id=eq.${encodeURIComponent(validTenantId)}&select=*`;
      if (options?.activeOnly) url += '&active=eq.true';
      const res = await fetchSupabase(url);
      if (!res.ok) return [];
      const data = await res.json();
      return (data || []).map((d: any) => this.mapServiceRow(d));
    } catch (err: any) {
      if (err.message && err.message.includes('[supabaseCatalogRepository]')) throw err;
      return [];
    }
  }

  async getServiceById(serviceId: string, tenantId?: string): Promise<Service | null> {
    try {
      const validTenantId = requireTenantId(tenantId || '', 'getServiceById');
      const url = `/rest/v1/services?id=eq.${encodeURIComponent(serviceId)}&tenant_id=eq.${encodeURIComponent(validTenantId)}&select=*`;
      const res = await fetchSupabase(url);
      if (!res.ok) return null;
      const data = await res.json();
      const s = data?.[0] || null;
      if (!s) return null;
      if (s.tenant_id && s.tenant_id !== validTenantId) {
        throw new Error('[supabaseCatalogRepository] Tenant isolation violation: returned service does not match requested tenant');
      }
      return this.mapServiceRow(s);
    } catch (err: any) {
      if (err.message && err.message.includes('[supabaseCatalogRepository]')) throw err;
      return null;
    }
  }

  async createService(tenantId: string, input: Omit<Service, 'id' | 'tenantId'>): Promise<Service> {
    const validTenantId = requireTenantId(tenantId, 'createService');
    const res = await fetchSupabase('/rest/v1/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        tenant_id: validTenantId,
        name: input.name,
        name_tr: input.name_tr,
        duration: input.duration,
        price: input.price,
        image: input.image,
        active: input.active,
        category: input.category
      })
    });
    if (!res.ok) throw new Error(`Supabase insert failed: HTTP ${res.status}`);
    const data = await res.json();
    return this.mapServiceRow(data[0]);
  }

  async updateService(serviceId: string, patch: Partial<Service>, tenantId?: string): Promise<Service | null> {
    const validTenantId = requireTenantId(tenantId || '', 'updateService');
    if (patch.tenantId !== undefined && patch.tenantId.trim() !== validTenantId) {
      throw new Error('[supabaseCatalogRepository] Tenant isolation violation: cannot alter service tenant_id');
    }
    const { tenantId: _t, id: _id, createdAt: _c, ...safePatch } = patch as any;
    const url = `/rest/v1/services?id=eq.${encodeURIComponent(serviceId)}&tenant_id=eq.${encodeURIComponent(validTenantId)}`;
    const res = await fetchSupabase(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(this.mapServicePatch(safePatch))
    });
    if (!res.ok) throw new Error(`Supabase update failed: HTTP ${res.status}`);
    const data = await res.json();
    const s = data?.[0] || null;
    if (!s) return null;
    if (s.tenant_id && s.tenant_id !== validTenantId) {
      throw new Error('[supabaseCatalogRepository] Tenant isolation violation: returned service does not match requested tenant');
    }
    return this.mapServiceRow(s);
  }

  async deleteOrDeactivateService(serviceId: string, tenantId?: string): Promise<boolean> {
    const validTenantId = requireTenantId(tenantId || '', 'deleteOrDeactivateService');
    const res = await this.updateService(serviceId, { active: false }, validTenantId);
    return !!res;
  }

  async archiveService(tenantId: string, serviceId: string): Promise<boolean> {
    const validTenantId = requireTenantId(tenantId, 'archiveService');
    const res = await fetchSupabase(`/rest/v1/services?id=eq.${encodeURIComponent(serviceId)}&tenant_id=eq.${encodeURIComponent(validTenantId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({ active: false })
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0;
  }

  async listStaff(tenantId: string, options?: { activeOnly?: boolean }): Promise<Staff[]> {
    try {
      const validTenantId = requireTenantId(tenantId, 'listStaff');
      let url = `/rest/v1/staff?tenant_id=eq.${encodeURIComponent(validTenantId)}&select=*`;
      if (options?.activeOnly) url += '&active=eq.true';
      const res = await fetchSupabase(url);
      if (!res.ok) return [];
      const data = await res.json();
      return (data || []).map((d: any) => this.mapStaffRow(d));
    } catch (err: any) {
      if (err.message && err.message.includes('[supabaseCatalogRepository]')) throw err;
      return [];
    }
  }

  async getStaffById(staffId: string, tenantId?: string): Promise<Staff | null> {
    try {
      const validTenantId = requireTenantId(tenantId || '', 'getStaffById');
      const url = `/rest/v1/staff?id=eq.${encodeURIComponent(staffId)}&tenant_id=eq.${encodeURIComponent(validTenantId)}&select=*`;
      const res = await fetchSupabase(url);
      if (!res.ok) return null;
      const data = await res.json();
      const s = data?.[0] || null;
      if (!s) return null;
      if (s.tenant_id && s.tenant_id !== validTenantId) {
        throw new Error('[supabaseCatalogRepository] Tenant isolation violation: returned staff does not match requested tenant');
      }
      return this.mapStaffRow(s);
    } catch (err: any) {
      if (err.message && err.message.includes('[supabaseCatalogRepository]')) throw err;
      return null;
    }
  }

  async createStaff(tenantId: string, input: Omit<Staff, 'id' | 'tenantId'>): Promise<Staff> {
    const validTenantId = requireTenantId(tenantId, 'createStaff');
    const res = await fetchSupabase('/rest/v1/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        tenant_id: validTenantId,
        name: input.name,
        title: input.title,
        image: input.image,
        is_owner: input.isOwner ?? false,
        phone: input.phone,
        calendar_email: input.calendarEmail,
        active: input.active
      })
    });
    if (!res.ok) throw new Error(`Supabase insert failed: HTTP ${res.status}`);
    const data = await res.json();
    return this.mapStaffRow(data[0]);
  }

  async updateStaff(staffId: string, patch: Partial<Staff>, tenantId?: string): Promise<Staff | null> {
    const validTenantId = requireTenantId(tenantId || '', 'updateStaff');
    if (patch.tenantId !== undefined && patch.tenantId.trim() !== validTenantId) {
      throw new Error('[supabaseCatalogRepository] Tenant isolation violation: cannot alter staff tenant_id');
    }
    const { tenantId: _t, id: _id, createdAt: _c, ...safePatch } = patch as any;
    const url = `/rest/v1/staff?id=eq.${encodeURIComponent(staffId)}&tenant_id=eq.${encodeURIComponent(validTenantId)}`;
    const res = await fetchSupabase(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(this.mapStaffPatch(safePatch))
    });
    if (!res.ok) throw new Error(`Supabase update failed: HTTP ${res.status}`);
    const data = await res.json();
    const s = data?.[0] || null;
    if (!s) return null;
    if (s.tenant_id && s.tenant_id !== validTenantId) {
      throw new Error('[supabaseCatalogRepository] Tenant isolation violation: returned staff does not match requested tenant');
    }
    return this.mapStaffRow(s);
  }

  async deleteOrDeactivateStaff(staffId: string, tenantId?: string): Promise<boolean> {
    const validTenantId = requireTenantId(tenantId || '', 'deleteOrDeactivateStaff');
    const res = await this.updateStaff(staffId, { active: false }, validTenantId);
    return !!res;
  }

  async archiveStaff(tenantId: string, staffId: string): Promise<boolean> {
    const validTenantId = requireTenantId(tenantId, 'archiveStaff');
    const res = await fetchSupabase(`/rest/v1/staff?id=eq.${encodeURIComponent(staffId)}&tenant_id=eq.${encodeURIComponent(validTenantId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({ active: false })
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0;
  }

  async assignServiceToStaff(staffId: string, serviceId: string, tenantId?: string): Promise<void> {
    const validTenantId = requireTenantId(tenantId || '', 'assignServiceToStaff');
    const [staff, service] = await Promise.all([
      this.getStaffById(staffId, validTenantId),
      this.getServiceById(serviceId, validTenantId)
    ]);
    if (!staff || !service) {
      throw new Error('[supabaseCatalogRepository] Tenant isolation violation: cannot assign service to staff across tenants');
    }
    const res = await fetchSupabase('/rest/v1/staff_services', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates'
      },
      body: JSON.stringify({ staff_id: staffId, service_id: serviceId })
    });
    if (!res.ok) throw new Error(`Supabase assign service failed: HTTP ${res.status}`);
  }

  async removeServiceFromStaff(staffId: string, serviceId: string, tenantId?: string): Promise<void> {
    const validTenantId = requireTenantId(tenantId || '', 'removeServiceFromStaff');
    const [staff, service] = await Promise.all([
      this.getStaffById(staffId, validTenantId),
      this.getServiceById(serviceId, validTenantId)
    ]);
    if (!staff) {
      throw new Error('[supabaseCatalogRepository] Tenant isolation violation: cannot remove service from staff of another tenant');
    }
    if (!service) {
      throw new Error('[supabaseCatalogRepository] Tenant isolation violation: cannot remove service of another tenant');
    }
    const res = await fetchSupabase(`/rest/v1/staff_services?staff_id=eq.${encodeURIComponent(staffId)}&service_id=eq.${encodeURIComponent(serviceId)}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error(`Supabase remove service failed: HTTP ${res.status}`);
  }

  async listStaffForService(tenantId: string, serviceId: string): Promise<Staff[]> {
    try {
      const validTenantId = requireTenantId(tenantId, 'listStaffForService');
      const service = await this.getServiceById(serviceId, validTenantId);
      if (!service) return [];

      const url = `/rest/v1/staff_services?service_id=eq.${encodeURIComponent(serviceId)}&select=staff_id,staff:staff(*)`;
      const res = await fetchSupabase(url);
      if (!res.ok) return [];
      const data = await res.json();
      return (data || [])
        .filter((d: any) => d.staff && d.staff.tenant_id === validTenantId && d.staff.active !== false)
        .map((d: any) => this.mapStaffRow(d.staff));
    } catch (err: any) {
      if (err.message && err.message.includes('[supabaseCatalogRepository]')) throw err;
      return [];
    }
  }

  async listServicesForStaff(staffId: string, tenantId?: string): Promise<string[]> {
    try {
      const validTenantId = requireTenantId(tenantId || '', 'listServicesForStaff');
      const staff = await this.getStaffById(staffId, validTenantId);
      if (!staff) return [];

      const res = await fetchSupabase(`/rest/v1/staff_services?staff_id=eq.${encodeURIComponent(staffId)}&select=service_id`);
      if (!res.ok) return [];
      const data = await res.json();
      const rawServiceIds: string[] = (data || []).map((d: any) => d.service_id as string);
      if (rawServiceIds.length === 0) return [];

      const tenantServices = await this.listServices(validTenantId);
      const allowedIds = new Set(tenantServices.map(s => s.id));
      return rawServiceIds.filter(id => allowedIds.has(id));
    } catch (err: any) {
      if (err.message && err.message.includes('[supabaseCatalogRepository]')) throw err;
      return [];
    }
  }

  async listAvailabilityRules(tenantId: string, staffId?: string): Promise<AvailabilityRule[]> {
    const validTenantId = requireTenantId(tenantId, 'listAvailabilityRules');
    let url = `/rest/v1/availability_rules?tenant_id=eq.${encodeURIComponent(validTenantId)}&select=*`;
    if (staffId) url += `&staff_id=eq.${encodeURIComponent(staffId)}`;
    const res = await fetchSupabase(url);
    if (!res.ok) throw new Error(`Supabase availability_rules list failed: HTTP ${res.status}`);
    const data = await res.json();
    return (data || []).map((row: any) => this.mapAvailabilityRow(row));
  }

  async updateAvailabilityRule(ruleId: string, patch: Partial<AvailabilityRule>, tenantId?: string): Promise<void> {
    const validTenantId = requireTenantId(tenantId || '', 'updateAvailabilityRule');
    if (patch.tenantId !== undefined && patch.tenantId.trim() !== validTenantId) {
      throw new Error('[supabaseCatalogRepository] Tenant isolation violation: cannot alter availability rule tenantId');
    }
    const { tenantId: _t, id: _id, ...safePatch } = patch as any;
    const url = `/rest/v1/availability_rules?id=eq.${encodeURIComponent(ruleId)}&tenant_id=eq.${encodeURIComponent(validTenantId)}`;
    const res = await fetchSupabase(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(this.mapAvailabilityPatch(safePatch))
    });
    if (!res.ok) throw new Error(`Supabase availability_rules update failed: HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`Availability rule not found for tenant: ${ruleId}`);
    }
  }

  async createAvailabilityRule(tenantId: string, input: Omit<AvailabilityRule, 'id' | 'tenantId'>): Promise<AvailabilityRule> {
    const validTenantId = requireTenantId(tenantId, 'createAvailabilityRule');
    const res = await fetchSupabase('/rest/v1/availability_rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({ ...this.mapAvailabilityPatch(input), tenant_id: validTenantId })
    });
    if (!res.ok) throw new Error(`Supabase availability_rules insert failed: HTTP ${res.status}`);
    const data = await res.json();
    return this.mapAvailabilityRow(data[0]);
  }

  async listPublicActiveServicesByTenantSlug(slug: string): Promise<Service[]> {
    try {
      const tenantRes = await fetchSupabase(`/rest/v1/tenants?slug=eq.${encodeURIComponent(slug)}&select=*`);
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

  async listPublicActiveStaffByTenantSlug(slug: string): Promise<Staff[]> {
    try {
      const tenantRes = await fetchSupabase(`/rest/v1/tenants?slug=eq.${encodeURIComponent(slug)}&select=*`);
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
    const validTenantId = requireTenantId(tenantId, 'getAvailability');
    return this.listAvailabilityRules(validTenantId);
  }

  async updateAvailability(tenantId: string, input: any): Promise<any> {
    const validTenantId = requireTenantId(tenantId, 'updateAvailability');
    if (input?.tenantId !== undefined && input.tenantId.trim() !== validTenantId) {
      throw new Error('[supabaseCatalogRepository] Tenant isolation violation: cannot alter availability rule tenantId');
    }
    const { id: _stripId, tenantId: _stripTid, ...safeInput } = input || {};
    const rules = await this.listAvailabilityRules(validTenantId);
    if (rules.length > 0) {
      const firstRule = rules[0];
      await this.updateAvailabilityRule(firstRule.id || '', safeInput, validTenantId);
      const refreshedRules = await this.listAvailabilityRules(validTenantId);
      const updatedRule = refreshedRules.find(r => r.id === firstRule.id);
      if (updatedRule) {
        return { ...firstRule, ...updatedRule, ...safeInput, id: firstRule.id, tenantId: validTenantId };
      }
      return { ...firstRule, ...safeInput, id: firstRule.id, tenantId: validTenantId };
    } else {
      return this.createAvailabilityRule(validTenantId, safeInput);
    }
  }

  async getPublicAvailabilityByTenantSlug(slug: string): Promise<any> {
    try {
      const tenantRes = await fetchSupabase(`/rest/v1/tenants?slug=eq.${encodeURIComponent(slug)}&select=*`);
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
