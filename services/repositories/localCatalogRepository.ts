import { AvailabilityRule, CatalogRepository } from './types';
import { Service, Staff, SERVICES as DEMO_SERVICES } from '../../types';
import { dataProvider } from '../dataProvider';

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

export class LocalCatalogRepository implements CatalogRepository {
  private getServicesKey(tenantId: string) { return `lari:${tenantId}:services`; }
  private getStaffKey(tenantId: string) { return `lari:${tenantId}:staff`; }
  // We'll store simple mappings as "staffId_serviceId" -> bool
  private getStaffServiceMappingKey(tenantId: string) { return `lari:${tenantId}:staff_services`; }

  async listServices(tenantId: string, options?: { activeOnly?: boolean }): Promise<Service[]> {
    const key = this.getServicesKey(tenantId);
    const existing = await dataProvider.getList<Service>(key);
    
    if (!existing || existing.length === 0) {
      const isSeeded = localStorage.getItem(`lari:${tenantId}:is_seeded_services`) === 'true';
      if (isSeeded) return [];
      
      const seededServices = DEMO_SERVICES.map(s => ({ ...s, tenantId }));
      await dataProvider.set(key, seededServices);
      localStorage.setItem(`lari:${tenantId}:is_seeded_services`, 'true');
      return options?.activeOnly ? seededServices.filter(s => s.active !== false) : seededServices;
    }
    return options?.activeOnly ? existing.filter(s => s.active !== false) : existing;
  }

  async getServiceById(serviceId: string): Promise<Service | null> {
    // In local mode, we have to scan keys or assume we can find it.
    // Better yet: we just iterate all services across tenant if we don't have tenantId...
    // But usually we do. If we don't, we can search.
    for (let i = 0; i < localStorage.length; i++) {
       const key = localStorage.key(i);
       if (key && key.includes(':services')) {
          const list = JSON.parse(localStorage.getItem(key) || '[]');
          const match = list.find((s: Service) => s.id === serviceId);
          if (match) return match;
       }
    }
    return null;
  }

  async createService(tenantId: string, input: Omit<Service, 'id' | 'tenantId'>): Promise<Service> {
    const key = this.getServicesKey(tenantId);
    const existing = await dataProvider.getList<Service>(key);
    const newService: Service = { ...input, id: `srv_${Date.now()}`, tenantId };
    await dataProvider.set(key, [...(existing || []), newService]);
    return newService;
  }

  async updateService(serviceId: string, patch: Partial<Service>): Promise<Service | null> {
    const service = await this.getServiceById(serviceId);
    if (!service) return null;
    const key = this.getServicesKey(service.tenantId!);
    const existing = await dataProvider.getList<Service>(key);
    const updated = existing?.map(s => s.id === serviceId ? { ...s, ...patch } : s) || [];
    await dataProvider.set(key, updated);
    return { ...service, ...patch };
  }

  async deleteOrDeactivateService(serviceId: string): Promise<boolean> {
    const service = await this.getServiceById(serviceId);
    if (!service) return false;
    await this.updateService(serviceId, { active: false });
    return true;
  }

  async listStaff(tenantId: string, options?: { activeOnly?: boolean }): Promise<Staff[]> {
    const key = this.getStaffKey(tenantId);
    const existing = await dataProvider.getList<Staff>(key);
    
    if (!existing || existing.length === 0) {
      const isSeeded = localStorage.getItem(`lari:${tenantId}:is_seeded_staff`) === 'true';
      if (isSeeded) return [];
      
      const seededStaff = DEMO_STAFF.map(s => ({ ...s, tenantId }));
      await dataProvider.set(key, seededStaff);
      localStorage.setItem(`lari:${tenantId}:is_seeded_staff`, 'true');
      return options?.activeOnly ? seededStaff.filter(s => s.active !== false) : seededStaff;
    }
    return options?.activeOnly ? existing.filter(s => s.active !== false) : existing;
  }

  async getStaffById(staffId: string): Promise<Staff | null> {
    for (let i = 0; i < localStorage.length; i++) {
       const key = localStorage.key(i);
       if (key && key.includes(':staff') && !key.includes('staff_services')) {
          const list = JSON.parse(localStorage.getItem(key) || '[]');
          const match = list.find((s: Staff) => s.id === staffId);
          if (match) return match;
       }
    }
    return null;
  }

  async createStaff(tenantId: string, input: Omit<Staff, 'id' | 'tenantId'>): Promise<Staff> {
    const key = this.getStaffKey(tenantId);
    const existing = await dataProvider.getList<Staff>(key);
    const newStaff: Staff = { ...input, id: `staff_${Date.now()}`, tenantId };
    await dataProvider.set(key, [...(existing || []), newStaff]);
    return newStaff;
  }

  async updateStaff(staffId: string, patch: Partial<Staff>): Promise<Staff | null> {
    const staff = await this.getStaffById(staffId);
    if (!staff) return null;
    const key = this.getStaffKey(staff.tenantId!);
    const existing = await dataProvider.getList<Staff>(key);
    const updated = existing?.map(s => s.id === staffId ? { ...s, ...patch } : s) || [];
    await dataProvider.set(key, updated);
    return { ...staff, ...patch };
  }

  async deleteOrDeactivateStaff(staffId: string): Promise<boolean> {
    const staff = await this.getStaffById(staffId);
    if (!staff) return false;
    await this.updateStaff(staffId, { active: false });
    return true;
  }

  async assignServiceToStaff(staffId: string, serviceId: string): Promise<void> {
    const staff = await this.getStaffById(staffId);
    if (!staff?.tenantId) return;
    const key = this.getStaffServiceMappingKey(staff.tenantId);
    const mappings = JSON.parse(localStorage.getItem(key) || '{}');
    if (!mappings[staffId]) mappings[staffId] = [];
    if (!mappings[staffId].includes(serviceId)) {
      mappings[staffId].push(serviceId);
      localStorage.setItem(key, JSON.stringify(mappings));
    }
  }

  async removeServiceFromStaff(staffId: string, serviceId: string): Promise<void> {
    const staff = await this.getStaffById(staffId);
    if (!staff?.tenantId) return;
    const key = this.getStaffServiceMappingKey(staff.tenantId);
    const mappings = JSON.parse(localStorage.getItem(key) || '{}');
    if (mappings[staffId]) {
      mappings[staffId] = mappings[staffId].filter((id: string) => id !== serviceId);
      localStorage.setItem(key, JSON.stringify(mappings));
    }
  }

  async listStaffForService(tenantId: string, serviceId: string): Promise<Staff[]> {
    const staffList = await this.listStaff(tenantId, { activeOnly: true });
    // In local mode, if we haven't mapped anything, we assume all staff can do all seeded services for simplicity
    // unless they specifically have a mapping array.
    const key = this.getStaffServiceMappingKey(tenantId);
    const mappings = JSON.parse(localStorage.getItem(key) || 'null');
    
    if (!mappings) {
       return staffList; // No explicit mappings, everyone can do everything
    }
    
    return staffList.filter(s => {
       const theirServices = mappings[s.id];
       if (!theirServices || theirServices.length === 0) return true; // If they have no mappings explicitly set, fallback to true, or false depending on rigidness. Let's say true for demo.
       return theirServices.includes(serviceId);
    });
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
    const localData = localStorage.getItem(`lari:${tenantId}:availability_rules`);
    const rules = (localData ? JSON.parse(localData) : []).map((rule: any) => this.normalizeAvailabilityRule(tenantId, rule));
    if (staffId) {
      return rules.filter((r: AvailabilityRule) => r.staffId === staffId || r.staffId == null);
    }
    return rules;
  }

  async updateAvailabilityRule(ruleId: string, patch: Partial<AvailabilityRule>): Promise<void> {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.endsWith(':availability_rules')) continue;
      const tenantId = key.split(':')[1];
      const rules = JSON.parse(localStorage.getItem(key) || '[]').map((rule: any) => this.normalizeAvailabilityRule(tenantId, rule));
      const index = rules.findIndex((rule: AvailabilityRule) => rule.id === ruleId);
      if (index < 0) continue;

      const updated = { ...rules[index], ...patch };
      this.assertValidAvailabilityRule(updated);
      rules[index] = updated;
      localStorage.setItem(key, JSON.stringify(rules));
      return;
    }
    throw new Error(`Availability rule not found: ${ruleId}`);
  }

  async createAvailabilityRule(tenantId: string, input: Omit<AvailabilityRule, 'id' | 'tenantId'>): Promise<AvailabilityRule> {
    const rules = await this.listAvailabilityRules(tenantId);
    const normalizedInput = this.normalizeAvailabilityRule(tenantId, { ...input, tenantId });
    this.assertValidAvailabilityRule(normalizedInput);

    const duplicateIndex = rules.findIndex((rule: AvailabilityRule) =>
      rule.tenantId === tenantId &&
      (rule.staffId || null) === (normalizedInput.staffId || null) &&
      rule.weekday === normalizedInput.weekday
    );

    const nextRule: AvailabilityRule = {
      ...normalizedInput,
      id: rules[duplicateIndex]?.id || `rule_${tenantId}_${normalizedInput.staffId || 'tenant'}_${normalizedInput.weekday}`
    };

    if (duplicateIndex >= 0) {
      rules[duplicateIndex] = nextRule;
    } else {
      rules.push(nextRule);
    }

    localStorage.setItem(`lari:${tenantId}:availability_rules`, JSON.stringify(rules));
    return nextRule;
  }

  async archiveService(tenantId: string, serviceId: string): Promise<boolean> {
    await this.updateService(serviceId, { active: false });
    return true;
  }

  async listPublicActiveServicesByTenantSlug(slug: string): Promise<Service[]> {
    const tenantId = `tenant_${slug}`;
    return this.listServices(tenantId, { activeOnly: true });
  }

  async archiveStaff(tenantId: string, staffId: string): Promise<boolean> {
    await this.updateStaff(staffId, { active: false });
    return true;
  }

  async listPublicActiveStaffByTenantSlug(slug: string): Promise<Staff[]> {
    const tenantId = `tenant_${slug}`;
    return this.listStaff(tenantId, { activeOnly: true });
  }

  async getAvailability(tenantId: string): Promise<any> {
    return this.listAvailabilityRules(tenantId);
  }

  async updateAvailability(tenantId: string, input: any): Promise<any> {
    const rules = await this.listAvailabilityRules(tenantId);
    if (rules.length > 0) {
      const firstRule = rules[0];
      const updated = { ...firstRule, ...input };
      const index = rules.findIndex((r: any) => r.id === firstRule.id);
      rules[index] = updated;
      localStorage.setItem(`lari:${tenantId}:availability_rules`, JSON.stringify(rules));
      return updated;
    } else {
      return this.createAvailabilityRule(tenantId, input);
    }
  }

  async getPublicAvailabilityByTenantSlug(slug: string): Promise<any> {
    const tenantId = `tenant_${slug}`;
    return this.getAvailability(tenantId);
  }
}

