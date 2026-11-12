import { TenantRepository, Tenant } from './types';
import { STORAGE_KEYS } from '../storageKeys';

export class LocalTenantRepository implements TenantRepository {
  activeTenantId: string | null = null;

  async listTenants(): Promise<Tenant[]> {
    const raw = localStorage.getItem(STORAGE_KEYS.REGISTERED_TENANTS);
    return raw ? JSON.parse(raw) : [];
  }

  async getTenantById(id: string): Promise<Tenant | null> {
    const tenants = await this.listTenants();
    return tenants.find(t => t.id === id) || null;
  }

  async createTenant(input: Partial<Tenant>): Promise<Tenant> {
    const tenants = await this.listTenants();
    const newTenant: Tenant = {
      id: input.id || `tenant_${Date.now()}`,
      slug: input.slug || `tenant_${Date.now()}`,
      name: input.name || 'Yeni Salon',
      status: input.status || 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      branding: input.branding || {
        tenantId: input.id || `tenant_${Date.now()}`,
        businessName: input.name || 'Yeni Salon',
        primaryColor: '#2563eb',
        secondaryColor: '#1d4ed8',
        logoUrl: ''
      },
      ...input
    } as Tenant;
    tenants.push(newTenant);
    localStorage.setItem(STORAGE_KEYS.REGISTERED_TENANTS, JSON.stringify(tenants));
    return newTenant;
  }

  async updateTenant(id: string, patch: Partial<Tenant>): Promise<void> {
    const tenants = await this.listTenants();
    const idx = tenants.findIndex(t => t.id === id);
    if (idx !== -1) {
      tenants[idx] = { ...tenants[idx], ...patch, updatedAt: new Date().toISOString() };
      localStorage.setItem(STORAGE_KEYS.REGISTERED_TENANTS, JSON.stringify(tenants));
    }
  }

  setActiveTenant(id: string): void {
    this.activeTenantId = id;
    localStorage.setItem(STORAGE_KEYS.ACTIVE_TENANT_ID, id);
  }

  getActiveTenantId(): string | null {
    if (!this.activeTenantId) {
      this.activeTenantId = localStorage.getItem(STORAGE_KEYS.ACTIVE_TENANT_ID);
    }
    return this.activeTenantId;
  }
}
