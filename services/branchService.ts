import { BusinessBranch } from '../types';
import { getBusinessProfileRepository } from './repositories';
import { tenantService } from './tenantService';

export const branchService = {
  getStoredBranches(tenantId: string): BusinessBranch[] {
    const raw = localStorage.getItem(`lari_branches_${tenantId}`);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {}
    }
    return [];
  },

  saveStoredBranches(tenantId: string, branches: BusinessBranch[]) {
    localStorage.setItem(`lari_branches_${tenantId}`, JSON.stringify(branches));
  },

  async ensurePrimaryBranchForTenant(tenantId: string): Promise<BusinessBranch> {
    const { getDataSourceMode } = await import('./dataSourceConfig');
    if (getDataSourceMode() === 'supabase') {
      const branches = await this.listBranches(tenantId);
      const primary = branches.find(b => b.isPrimary);
      if (primary) return primary;

      const profileRepo = getBusinessProfileRepository();
      const profile = await profileRepo.getProfile(tenantId);
      const tenant = await tenantService.getTenantById(tenantId);

      const name = profile?.public_display_name || tenant?.name || 'Merkez Şube';
      const created = await this.createBranch(tenantId, { name, isPrimary: true });
      return created;
    }

    const branches = this.getStoredBranches(tenantId);
    let primary = branches.find(b => b.isPrimary);
    
    if (!primary) {
      const profileRepo = getBusinessProfileRepository();
      const profile = await profileRepo.getProfile(tenantId);
      const tz = new Date().toISOString();
      const tenant = await tenantService.getTenantById(tenantId);
      
      const newPrimary: BusinessBranch = {
        id: `branch_origin_${Date.now()}`,
        tenantId,
        name: profile?.public_display_name || tenant?.name || 'Merkez Şube',
        slug: tenant?.slug || 'merkez',
        phone: profile?.phone || '',
        address: profile?.address || '',
        city: profile?.city || '',
        district: profile?.district || '',
        isPrimary: true,
        isActive: true,
        createdAt: tz,
        updatedAt: tz
      };
      
      branches.push(newPrimary);
      this.saveStoredBranches(tenantId, branches);
      primary = newPrimary;
    }
    return primary;
  },

  async listBranches(tenantId: string): Promise<BusinessBranch[]> {
    try {
      const { fetchSupabase } = await import('./repositories/supabaseClient');
      const { getDataSourceMode } = await import('./dataSourceConfig');
      if (getDataSourceMode() === 'supabase') {
        const res = await fetchSupabase(`/rest/v1/branches?tenant_id=eq.${tenantId}&order=is_primary.desc,created_at.asc`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
          const raw = await res.json();
          if (Array.isArray(raw)) {
            const profileRepo = getBusinessProfileRepository();
            const profile = await profileRepo.getProfile(tenantId);

            return raw.filter((b: any) => b.is_active !== false).map((b: any) => ({
              id: b.id,
              tenantId: b.tenant_id,
              name: b.name,
              slug: b.slug,
              isPrimary: !!b.is_primary,
              isActive: !!b.is_active,
              phone: b.is_primary ? (profile?.phone || '') : '',
              address: b.is_primary ? (profile?.address || '') : '',
              city: b.is_primary ? (profile?.city || '') : '',
              district: b.is_primary ? (profile?.district || '') : '',
              createdAt: b.created_at || '',
              updatedAt: b.updated_at || ''
            }));
          }
        }
        // In Supabase mode, fail closed (DO NOT fallback to localStorage)
        return [];
      }
    } catch (err) {
      console.error('listBranches failed in Supabase mode:', err);
      const { getDataSourceMode } = await import('./dataSourceConfig');
      if (getDataSourceMode() === 'supabase') {
        return [];
      }
    }

    await this.ensurePrimaryBranchForTenant(tenantId);
    return this.getStoredBranches(tenantId).filter(b => b.isActive);
  },

  async listPublicBranches(slug: string, tenantId?: string): Promise<BusinessBranch[]> {
    try {
      const { fetchSupabase } = await import('./repositories/supabaseClient');
      const { getDataSourceMode } = await import('./dataSourceConfig');
      if (getDataSourceMode() === 'supabase') {
        const res = await fetchSupabase('/rest/v1/rpc/get_public_branches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_slug: slug })
        });
        if (res.ok) {
          const raw = await res.json();
          const data = Array.isArray(raw) ? raw[0] : raw;
          if (data?.success && Array.isArray(data.branches) && data.branches.length > 0) {
            return data.branches.map((b: any) => ({
              id: b.id,
              tenantId: tenantId || '',
              name: b.name,
              slug: b.slug,
              isPrimary: !!b.is_primary,
              isActive: true,
              createdAt: '',
              updatedAt: ''
            }));
          }
        }
        // In public Supabase mode, fail closed on RPC error/empty response; DO NOT fallback to direct table read
        return [];
      }
    } catch (err) {
      console.error('listPublicBranches RPC failed:', err);
      const { getDataSourceMode } = await import('./dataSourceConfig');
      if (getDataSourceMode() === 'supabase') {
        return [];
      }
    }
    if (tenantId) {
      return this.listBranches(tenantId);
    }
    return [];
  },

  async getPrimaryBranch(tenantId: string): Promise<BusinessBranch> {
    return this.ensurePrimaryBranchForTenant(tenantId);
  },

  async createBranch(tenantId: string, input: Partial<BusinessBranch>): Promise<BusinessBranch> {
    try {
      const { fetchSupabase } = await import('./repositories/supabaseClient');
      const { getDataSourceMode } = await import('./dataSourceConfig');
      if (getDataSourceMode() === 'supabase') {
        const res = await fetchSupabase('/rest/v1/rpc/create_tenant_branch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_tenant_id: tenantId,
            p_name: input.name || 'Yeni Şube',
            p_slug: input.slug || null
          })
        });

        if (res.ok) {
          const raw = await res.json();
          const data = Array.isArray(raw) ? raw[0] : raw;
          if (data?.success && data?.branch) {
            const created = data.branch;
            if (input.isPrimary && !created.is_primary) {
              await this.setPrimaryBranch(tenantId, created.id);
              created.is_primary = true;
            }
            return {
              id: created.id,
              tenantId: created.tenant_id,
              name: created.name,
              slug: created.slug,
              isPrimary: !!created.is_primary,
              isActive: !!created.is_active,
              createdAt: created.created_at || '',
              updatedAt: created.updated_at || ''
            };
          }
          throw new Error(data?.reason_code || 'create_tenant_branch_failed');
        }
        throw new Error('create_tenant_branch_http_error');
      }
    } catch (err) {
      const { getDataSourceMode } = await import('./dataSourceConfig');
      if (getDataSourceMode() === 'supabase') {
        console.error('createBranch failed in Supabase mode:', err);
        throw err;
      }
    }

    const branches = this.getStoredBranches(tenantId);
    const setPrimary = branches.length === 0 || input.isPrimary;
    
    if (setPrimary) {
      branches.forEach(b => b.isPrimary = false);
    }
    
    const tz = new Date().toISOString();
    const newBranch: BusinessBranch = {
      ...input,
      id: `branch_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      tenantId,
      name: input.name || 'Yeni Şube',
      slug: input.slug || `sube-${Date.now()}`,
      isPrimary: setPrimary,
      isActive: true,
      createdAt: tz,
      updatedAt: tz
    } as BusinessBranch;
    
    branches.push(newBranch);
    this.saveStoredBranches(tenantId, branches);
    return newBranch;
  },

  async updateBranch(tenantId: string, branchId: string, patch: Partial<BusinessBranch>): Promise<BusinessBranch | null> {
    try {
      const { fetchSupabase } = await import('./repositories/supabaseClient');
      const { getDataSourceMode } = await import('./dataSourceConfig');
      if (getDataSourceMode() === 'supabase') {
        if (patch.isActive === false) {
          await this.deactivateBranch(tenantId, branchId);
        }
        if (patch.isPrimary) {
          await this.setPrimaryBranch(tenantId, branchId);
        }
        if (patch.name || patch.slug) {
          const res = await fetchSupabase('/rest/v1/rpc/update_tenant_branch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              p_branch_id: branchId,
              p_name: patch.name || null,
              p_slug: patch.slug || null
            })
          });
          if (!res.ok) {
            throw new Error('update_tenant_branch_http_error');
          }
        }
        const updatedBranches = await this.listBranches(tenantId);
        return updatedBranches.find(b => b.id === branchId) || null;
      }
    } catch (err) {
      const { getDataSourceMode } = await import('./dataSourceConfig');
      if (getDataSourceMode() === 'supabase') {
        console.error('updateBranch failed in Supabase mode:', err);
        throw err;
      }
    }

    const branches = this.getStoredBranches(tenantId);
    const index = branches.findIndex(b => b.id === branchId);
    if (index === -1) return null;
    
    if (patch.isPrimary) {
      branches.forEach(b => b.isPrimary = false);
    }
    
    branches[index] = { ...branches[index], ...patch, updatedAt: new Date().toISOString() };
    
    // Ensure at least one primary
    if (!branches.some(b => b.isPrimary) && branches.length > 0) {
      branches[0].isPrimary = true;
    }
    
    this.saveStoredBranches(tenantId, branches);
    return branches[index];
  },

  async deactivateBranch(tenantId: string, branchId: string): Promise<void> {
    try {
      const { fetchSupabase } = await import('./repositories/supabaseClient');
      const { getDataSourceMode } = await import('./dataSourceConfig');
      if (getDataSourceMode() === 'supabase') {
        const res = await fetchSupabase('/rest/v1/rpc/deactivate_tenant_branch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_branch_id: branchId })
        });
        if (res.ok) {
          const raw = await res.json();
          const data = Array.isArray(raw) ? raw[0] : raw;
          if (data?.success) return;
          throw new Error(data?.reason_code || 'deactivate_tenant_branch_failed');
        }
        throw new Error('deactivate_tenant_branch_http_error');
      }
    } catch (err) {
      const { getDataSourceMode } = await import('./dataSourceConfig');
      if (getDataSourceMode() === 'supabase') {
        console.error('deactivateBranch failed in Supabase mode:', err);
        throw err;
      }
    }

    await this.updateBranch(tenantId, branchId, { isActive: false });
  },

  async setPrimaryBranch(tenantId: string, branchId: string): Promise<void> {
    try {
      const { fetchSupabase } = await import('./repositories/supabaseClient');
      const { getDataSourceMode } = await import('./dataSourceConfig');
      if (getDataSourceMode() === 'supabase') {
        const res = await fetchSupabase('/rest/v1/rpc/set_primary_tenant_branch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_branch_id: branchId })
        });
        if (res.ok) {
          const raw = await res.json();
          const data = Array.isArray(raw) ? raw[0] : raw;
          if (data?.success) return;
          throw new Error(data?.reason_code || 'set_primary_tenant_branch_failed');
        }
        throw new Error('set_primary_tenant_branch_http_error');
      }
    } catch (err) {
      const { getDataSourceMode } = await import('./dataSourceConfig');
      if (getDataSourceMode() === 'supabase') {
        console.error('setPrimaryBranch failed in Supabase mode:', err);
        throw err;
      }
    }

    await this.updateBranch(tenantId, branchId, { isPrimary: true });
  }
};
