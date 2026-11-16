import { AvailabilityRule, CatalogRepository } from './types.ts';
import { Service, Staff, SERVICES as DEMO_SERVICES } from '../../types.ts';
import { dataProvider } from '../dataProvider';
import { DYNAMIC_STORAGE_KEYS } from '../storageKeys';

const DEMO_STAFF: Staff[] = [
  {
    id: 'staff_1',
    name: 'Cemil Kaya',
    title: 'Senior Specialist',
    image: 'https://images.unsplash.com/photo-1543610892-0b1f7e6d8ac1?auto=format&fit=crop&q=80&w=200',
    isOwner: true,
  },
  {
    id: 'staff_2',
    name: 'Ayşe Yılmaz',
    title: 'Hair Colorist',
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200',
    isOwner: false,
  },
  {
    id: 'staff_3',
    name: 'Burak Öz',
    title: 'Barber',
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200',
    isOwner: false,
  }
];

export function requireTenantId(tenantId?: string, operation: string = 'operation'): string {
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new Error(`[localCatalogRepository] Security error: non-empty tenantId is required for ${operation}`);
  }
  return tenantId.trim();
}

export class LocalCatalogRepository implements CatalogRepository {
  private getServicesKey(tenantId: string) { return DYNAMIC_STORAGE_KEYS.tenantServices(tenantId); }
  private getStaffKey(tenantId: string) { return DYNAMIC_STORAGE_KEYS.tenantStaff(tenantId); }
  // We'll store simple mappings as "staffId_serviceId" -> bool
  private getStaffServiceMappingKey(tenantId: string) { return DYNAMIC_STORAGE_KEYS.tenantStaffServices(tenantId); }

  async listServices(tenantId: string, options?: { activeOnly?: boolean }): Promise<Service[]> {
    const cleanTenantId = requireTenantId(tenantId, 'listServices');
    const key = this.getServicesKey(cleanTenantId);
    const existing = await dataProvider.getList<Service>(key);
    
    if (!existing || existing.length === 0) {
      const isSeeded = localStorage.getItem(DYNAMIC_STORAGE_KEYS.tenantIsSeededServices(cleanTenantId)) === 'true';
      if (isSeeded) return [];
      
      const seededServices = DEMO_SERVICES.map(s => ({ ...s, tenantId: cleanTenantId }));
      await dataProvider.set(key, seededServices);
      localStorage.setItem(DYNAMIC_STORAGE_KEYS.tenantIsSeededServices(cleanTenantId), 'true');
      return options?.activeOnly ? seededServices.filter(s => s.active !== false) : seededServices;
    }
    return options?.activeOnly ? existing.filter(s => s.active !== false) : existing;
  }

  async getServiceById(serviceId: string, tenantId?: string): Promise<Service | null> {
    const cleanTenantId = requireTenantId(tenantId, 'getServiceById');
    const key = this.getServicesKey(cleanTenantId);
    let list = await dataProvider.getList<Service>(key) || [];
    if (list.length === 0) {
      const isSeeded = localStorage.getItem(DYNAMIC_STORAGE_KEYS.tenantIsSeededServices(cleanTenantId)) === 'true';
      if (!isSeeded) {
        list = await this.listServices(cleanTenantId);
      }
    }
    const match = list.find((s: Service) => s.id === serviceId);
    return match || null;
  }

  async createService(tenantId: string, input: Omit<Service, 'id' | 'tenantId'>): Promise<Service> {
    const cleanTenantId = requireTenantId(tenantId, 'createService');
    const key = this.getServicesKey(cleanTenantId);
    const existing = await dataProvider.getList<Service>(key);
    const newService: Service = { ...input, id: `srv_${Date.now()}`, tenantId: cleanTenantId };
    await dataProvider.set(key, [...(existing || []), newService]);
    return newService;
  }

  async updateService(serviceId: string, patch: Partial<Service>, tenantId?: string): Promise<Service | null> {
    const cleanTenantId = requireTenantId(tenantId, 'updateService');
    if (patch.tenantId !== undefined && patch.tenantId.trim() !== cleanTenantId) {
      throw new Error('[localCatalogRepository] Tenant isolation violation: cannot alter service tenant_id');
    }
    const existingInTenant = await this.getServiceById(serviceId, cleanTenantId);
    if (!existingInTenant) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes(':services') && key !== this.getServicesKey(cleanTenantId)) {
          const raw = localStorage.getItem(key);
          try {
            const list = raw ? JSON.parse(raw) : [];
            if (Array.isArray(list) && list.some((s: any) => s && s.id === serviceId)) {
              throw new Error('[localCatalogRepository] Tenant isolation violation: cannot update service of another tenant');
            }
          } catch (e: any) {
            if (e.message && e.message.includes('Tenant isolation violation')) throw e;
          }
        }
      }
      return null;
    }
    const { tenantId: _t, id: _id, createdAt: _c, ...safePatch } = patch as any;
    const key = this.getServicesKey(cleanTenantId);
    const existing = await dataProvider.getList<Service>(key) || [];
    const updated = existing.map(s => s.id === serviceId ? { ...s, ...safePatch } : s);
    await dataProvider.set(key, updated);
    return { ...existingInTenant, ...safePatch };
  }

  async deleteOrDeactivateService(serviceId: string, tenantId?: string): Promise<boolean> {
    const cleanTenantId = requireTenantId(tenantId, 'deleteOrDeactivateService');
    const updated = await this.updateService(serviceId, { active: false }, cleanTenantId);
    return updated !== null;
  }

  async listStaff(tenantId: string, options?: { activeOnly?: boolean }): Promise<Staff[]> {
    const cleanTenantId = requireTenantId(tenantId, 'listStaff');
    const key = this.getStaffKey(cleanTenantId);
    const existing = await dataProvider.getList<Staff>(key);
    
    if (!existing || existing.length === 0) {
      const isSeeded = localStorage.getItem(DYNAMIC_STORAGE_KEYS.tenantIsSeededStaff(cleanTenantId)) === 'true';
      if (isSeeded) return [];
      
      const seededStaff = DEMO_STAFF.map(s => ({ ...s, tenantId: cleanTenantId }));
      await dataProvider.set(key, seededStaff);
      localStorage.setItem(DYNAMIC_STORAGE_KEYS.tenantIsSeededStaff(cleanTenantId), 'true');

      const mappingKey = this.getStaffServiceMappingKey(cleanTenantId);
      if (localStorage.getItem(mappingKey) === null) {
        const demoMappings: Record<string, string[]> = {
          staff_1: ['srv_1', 'srv_2', 'srv_3', 'srv_4', 'srv_5'],
          staff_2: ['srv_1', 'srv_2', 'srv_3', 'srv_4', 'srv_5'],
          staff_3: ['srv_1', 'srv_2', 'srv_3', 'srv_4', 'srv_5'],
        };
        localStorage.setItem(mappingKey, JSON.stringify(demoMappings));
      }
      return options?.activeOnly ? seededStaff.filter(s => s.active !== false) : seededStaff;
    }
    return options?.activeOnly ? existing.filter(s => s.active !== false) : existing;
  }

  async getStaffById(staffId: string, tenantId?: string): Promise<Staff | null> {
    const cleanTenantId = requireTenantId(tenantId, 'getStaffById');
    const key = this.getStaffKey(cleanTenantId);
    let list = await dataProvider.getList<Staff>(key) || [];
    if (list.length === 0) {
      const isSeeded = localStorage.getItem(DYNAMIC_STORAGE_KEYS.tenantIsSeededStaff(cleanTenantId)) === 'true';
      if (!isSeeded) {
        list = await this.listStaff(cleanTenantId);
      }
    }
    const match = list.find((s: Staff) => s.id === staffId);
    return match || null;
  }

  async createStaff(tenantId: string, input: Omit<Staff, 'id' | 'tenantId'>): Promise<Staff> {
    const cleanTenantId = requireTenantId(tenantId, 'createStaff');
    const key = this.getStaffKey(cleanTenantId);
    const existing = await dataProvider.getList<Staff>(key);
    const newStaff: Staff = { ...input, id: `staff_${Date.now()}`, tenantId: cleanTenantId };
    await dataProvider.set(key, [...(existing || []), newStaff]);

    // If caller explicitly provides initial service mappings, record them
    if (Array.isArray((input as any).serviceIds) && (input as any).serviceIds.length > 0) {
      const mappingKey = this.getStaffServiceMappingKey(cleanTenantId);
      const mappings = JSON.parse(localStorage.getItem(mappingKey) || '{}');
      mappings[newStaff.id] = (input as any).serviceIds;
      localStorage.setItem(mappingKey, JSON.stringify(mappings));
    }

    return newStaff;
  }

  async updateStaff(staffId: string, patch: Partial<Staff>, tenantId?: string): Promise<Staff | null> {
    const cleanTenantId = requireTenantId(tenantId, 'updateStaff');
    if (patch.tenantId !== undefined && patch.tenantId.trim() !== cleanTenantId) {
      throw new Error('[localCatalogRepository] Tenant isolation violation: cannot alter staff tenant_id');
    }
    const existingInTenant = await this.getStaffById(staffId, cleanTenantId);
    if (!existingInTenant) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes(':staff') && !key.includes('staff_services') && key !== this.getStaffKey(cleanTenantId)) {
          const raw = localStorage.getItem(key);
          try {
            const list = raw ? JSON.parse(raw) : [];
            if (Array.isArray(list) && list.some((s: any) => s && s.id === staffId)) {
              throw new Error('[localCatalogRepository] Tenant isolation violation: cannot update staff of another tenant');
            }
          } catch (e: any) {
            if (e.message && e.message.includes('Tenant isolation violation')) throw e;
          }
        }
      }
      return null;
    }
    const { tenantId: _t, id: _id, createdAt: _c, ...safePatch } = patch as any;
    const key = this.getStaffKey(cleanTenantId);
    const existing = await dataProvider.getList<Staff>(key) || [];
    const updated = existing.map(s => s.id === staffId ? { ...s, ...safePatch } : s);
    await dataProvider.set(key, updated);
    return { ...existingInTenant, ...safePatch };
  }

  async deleteOrDeactivateStaff(staffId: string, tenantId?: string): Promise<boolean> {
    const cleanTenantId = requireTenantId(tenantId, 'deleteOrDeactivateStaff');
    const updated = await this.updateStaff(staffId, { active: false }, cleanTenantId);
    return updated !== null;
  }

  async assignServiceToStaff(staffId: string, serviceId: string, tenantId?: string): Promise<void> {
    const cleanTenantId = requireTenantId(tenantId, 'assignServiceToStaff');
    const staff = await this.getStaffById(staffId, cleanTenantId);
    if (!staff) {
      throw new Error('[localCatalogRepository] Staff not found for tenant');
    }
    const service = await this.getServiceById(serviceId, cleanTenantId);
    if (!service) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.includes(':services') && k !== this.getServicesKey(cleanTenantId)) {
          const raw = localStorage.getItem(k);
          try {
            const list = raw ? JSON.parse(raw) : [];
            if (Array.isArray(list) && list.some((s: any) => s && s.id === serviceId)) {
              throw new Error('[localCatalogRepository] Tenant isolation violation: cannot assign service to staff across tenants');
            }
          } catch (e: any) {
            if (e.message && e.message.includes('Tenant isolation violation')) throw e;
          }
        }
      }
      throw new Error('[localCatalogRepository] Service not found for tenant');
    }
    const key = this.getStaffServiceMappingKey(cleanTenantId);
    const mappings = JSON.parse(localStorage.getItem(key) || '{}');
    if (!mappings[staffId]) mappings[staffId] = [];
    if (!mappings[staffId].includes(serviceId)) {
      mappings[staffId].push(serviceId);
      localStorage.setItem(key, JSON.stringify(mappings));
    }
  }

  async removeServiceFromStaff(staffId: string, serviceId: string, tenantId?: string): Promise<void> {
    const cleanTenantId = requireTenantId(tenantId, 'removeServiceFromStaff');
    const staff = await this.getStaffById(staffId, cleanTenantId);
    if (!staff) {
      throw new Error('[localCatalogRepository] Tenant isolation violation: staff does not belong to requested tenant');
    }
    const key = this.getStaffServiceMappingKey(cleanTenantId);
    const mappings = JSON.parse(localStorage.getItem(key) || '{}');
    if (mappings[staffId]) {
      mappings[staffId] = mappings[staffId].filter((id: string) => id !== serviceId);
      localStorage.setItem(key, JSON.stringify(mappings));
    }
  }

  async listStaffForService(tenantId: string, serviceId: string): Promise<Staff[]> {
    const cleanTenantId = requireTenantId(tenantId, 'listStaffForService');
    const service = await this.getServiceById(serviceId, cleanTenantId);
    if (!service) return [];

    const staffList = await this.listStaff(cleanTenantId, { activeOnly: true });
    if (!staffList || staffList.length === 0) return [];

    const key = this.getStaffServiceMappingKey(cleanTenantId);
    const rawMappings = localStorage.getItem(key);
    if (rawMappings === null) {
      return staffList.filter(s => {
        if (Array.isArray((s as any).serviceIds) && (s as any).serviceIds.length > 0) {
          return (s as any).serviceIds.includes(serviceId);
        }
        return false;
      });
    }

    const mappings = JSON.parse(rawMappings || '{}');
    return staffList.filter(s => {
      const theirServices = mappings[s.id] || (Array.isArray((s as any).serviceIds) ? (s as any).serviceIds : undefined);
      if (theirServices && Array.isArray(theirServices) && theirServices.length > 0) {
        return theirServices.includes(serviceId);
      }
      return false;
    });
  }

  async listServicesForStaff(staffId: string, tenantId?: string): Promise<string[]> {
    const cleanTenantId = requireTenantId(tenantId, 'listServicesForStaff');
    const staff = await this.getStaffById(staffId, cleanTenantId);
    if (!staff) return [];
    const key = this.getStaffServiceMappingKey(cleanTenantId);
    const mappings = JSON.parse(localStorage.getItem(key) || '{}');
    const rawIds: string[] = Array.isArray(mappings[staffId]) ? mappings[staffId] : [];
    if (rawIds.length === 0) return [];

    // Intersect mapped service IDs with tenant-owned services to prevent corrupted/cross-tenant leaks (FINDING-ADIM023-014)
    const tenantServices = await this.listServices(cleanTenantId);
    const allowedIds = new Set(tenantServices.map(s => s.id));
    return rawIds.filter(id => allowedIds.has(id));
  }

  private normalizeAvailabilityRule(tenantId: string, rule: any): AvailabilityRule {
    return {
      id: rule.id,
      tenantId: rule.tenantId || rule.tenant_id || tenantId,
      staffId: rule.staffId ?? rule.staff_id ?? null,
      weekday: Number(rule.weekday),
      is_active: rule.is_active ?? rule.isActive ?? true,
      start_time: rule.start_time || rule.startTime || '09:00:00',
      end_time: rule.end_time || rule.endTime || '18:00:00'
    };
  }

  private assertValidAvailabilityRule(rule: Pick<AvailabilityRule, 'weekday' | 'is_active' | 'start_time' | 'end_time'>) {
    if (!Number.isInteger(rule.weekday) || rule.weekday < 1 || rule.weekday > 7) {
      throw new Error('Availability weekday must be between 1 and 7.');
    }
    if (!rule.is_active) return;

    const [sh, sm] = rule.start_time.substring(0, 5).split(':').map(Number);
    const [eh, em] = rule.end_time.substring(0, 5).split(':').map(Number);
    if (![sh, sm, eh, em].every(Number.isFinite) || (eh * 60 + em) <= (sh * 60 + sm)) {
      throw new Error('Availability end time must be after start time for active weekdays.');
    }
  }

  async listAvailabilityRules(tenantId: string, staffId?: string): Promise<AvailabilityRule[]> {
    const cleanTenantId = requireTenantId(tenantId, 'listAvailabilityRules');
    const localData = localStorage.getItem(DYNAMIC_STORAGE_KEYS.tenantAvailabilityRules(cleanTenantId));
    let rules = (localData ? JSON.parse(localData) : []).map((rule: any) => this.normalizeAvailabilityRule(cleanTenantId, rule));
    if (rules.length === 0) {
      const seeded: AvailabilityRule[] = [];
      const staffIds = ['staff_1', 'staff_2', 'staff_3'];
      for (const sid of staffIds) {
        for (let d = 1; d <= 7; d++) {
          seeded.push({
            id: `rule_seeded_${sid}_${d}`,
            tenantId: cleanTenantId,
            staffId: sid,
            weekday: d,
            is_active: true,
            start_time: '09:00:00',
            end_time: '18:00:00'
          });
        }
      }
      rules = seeded;
      localStorage.setItem(DYNAMIC_STORAGE_KEYS.tenantAvailabilityRules(cleanTenantId), JSON.stringify(rules));
    }
    if (staffId) {
      return rules.filter((r: AvailabilityRule) => r.staffId === staffId || r.staffId == null);
    }
    return rules;
  }

  async updateAvailabilityRule(ruleId: string, patch: Partial<AvailabilityRule>, tenantId?: string): Promise<void> {
    const cleanTenantId = requireTenantId(tenantId, 'updateAvailabilityRule');
    if (patch.tenantId !== undefined && patch.tenantId.trim() !== cleanTenantId) {
      throw new Error('[localCatalogRepository] Tenant isolation violation: cannot alter availability rule tenantId');
    }
    const key = DYNAMIC_STORAGE_KEYS.tenantAvailabilityRules(cleanTenantId);
    const rules = JSON.parse(localStorage.getItem(key) || '[]').map((rule: any) => this.normalizeAvailabilityRule(cleanTenantId, rule));
    const index = rules.findIndex((rule: AvailabilityRule) => rule.id === ruleId);
    if (index >= 0) {
      const { tenantId: _t, id: _id, ...safePatch } = patch as any;
      const updated = { ...rules[index], ...safePatch };
      this.assertValidAvailabilityRule(updated);
      rules[index] = updated;
      localStorage.setItem(key, JSON.stringify(rules));
      return;
    }
    for (let i = 0; i < localStorage.length; i++) {
      const otherKey = localStorage.key(i);
      if (otherKey && otherKey.endsWith(':availability_rules') && otherKey !== key) {
        const otherRules = JSON.parse(localStorage.getItem(otherKey) || '[]');
        if (Array.isArray(otherRules) && otherRules.some((r: any) => r && r.id === ruleId)) {
          throw new Error('[localCatalogRepository] Tenant isolation violation: cannot update availability rule of another tenant');
        }
      }
    }
    throw new Error(`Availability rule not found for tenant: ${ruleId}`);
  }

  async createAvailabilityRule(tenantId: string, input: Omit<AvailabilityRule, 'id' | 'tenantId'>): Promise<AvailabilityRule> {
    const cleanTenantId = requireTenantId(tenantId, 'createAvailabilityRule');
    const rules = await this.listAvailabilityRules(cleanTenantId);
    const normalizedInput = this.normalizeAvailabilityRule(cleanTenantId, { ...input, tenantId: cleanTenantId });
    this.assertValidAvailabilityRule(normalizedInput);

    const duplicateIndex = rules.findIndex((rule: AvailabilityRule) =>
      rule.tenantId === cleanTenantId &&
      (rule.staffId || null) === (normalizedInput.staffId || null) &&
      rule.weekday === normalizedInput.weekday
    );

    const nextRule: AvailabilityRule = {
      ...normalizedInput,
      id: rules[duplicateIndex]?.id || `rule_${cleanTenantId}_${normalizedInput.staffId || 'tenant'}_${normalizedInput.weekday}`
    };

    if (duplicateIndex >= 0) {
      rules[duplicateIndex] = nextRule;
    } else {
      rules.push(nextRule);
    }

    localStorage.setItem(DYNAMIC_STORAGE_KEYS.tenantAvailabilityRules(cleanTenantId), JSON.stringify(rules));
    return nextRule;
  }

  async archiveService(tenantId: string, serviceId: string): Promise<boolean> {
    const cleanTenantId = requireTenantId(tenantId, 'archiveService');
    const updated = await this.updateService(serviceId, { active: false }, cleanTenantId);
    return updated !== null;
  }

  async listPublicActiveServicesByTenantSlug(slug: string): Promise<Service[]> {
    const tenantId = `tenant_${slug}`;
    return this.listServices(tenantId, { activeOnly: true });
  }

  async archiveStaff(tenantId: string, staffId: string): Promise<boolean> {
    const cleanTenantId = requireTenantId(tenantId, 'archiveStaff');
    const updated = await this.updateStaff(staffId, { active: false }, cleanTenantId);
    return updated !== null;
  }

  async listPublicActiveStaffByTenantSlug(slug: string): Promise<Staff[]> {
    const tenantId = `tenant_${slug}`;
    return this.listStaff(tenantId, { activeOnly: true });
  }

  async getAvailability(tenantId: string): Promise<any> {
    const cleanTenantId = requireTenantId(tenantId, 'getAvailability');
    return this.listAvailabilityRules(cleanTenantId);
  }

  async updateAvailability(tenantId: string, input: any): Promise<any> {
    const cleanTenantId = requireTenantId(tenantId, 'updateAvailability');
    if (input && typeof input === 'object') {
      if (input.tenantId !== undefined && String(input.tenantId).trim() !== cleanTenantId) {
        throw new Error('[localCatalogRepository] Tenant isolation violation: cannot alter availability rule tenantId');
      }
    }
    const rules = await this.listAvailabilityRules(cleanTenantId);
    if (rules.length > 0) {
      const firstRule = rules[0];
      await this.updateAvailabilityRule(firstRule.id, input, cleanTenantId);
      const refreshed = (await this.listAvailabilityRules(cleanTenantId)).find(r => r.id === firstRule.id);
      return refreshed || firstRule;
    } else {
      const { tenantId: _t, id: _id, ...safeInput } = (input || {}) as any;
      return this.createAvailabilityRule(cleanTenantId, safeInput);
    }
  }

  async getPublicAvailabilityByTenantSlug(slug: string): Promise<any> {
    const tenantId = `tenant_${slug}`;
    return this.getAvailability(tenantId);
  }
}

