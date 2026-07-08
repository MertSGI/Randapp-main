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
    await this.ensurePrimaryBranchForTenant(tenantId);
    return this.getStoredBranches(tenantId).filter(b => b.isActive);
  },

  async getPrimaryBranch(tenantId: string): Promise<BusinessBranch> {
    return this.ensurePrimaryBranchForTenant(tenantId);
  },

  async createBranch(tenantId: string, input: Partial<BusinessBranch>): Promise<BusinessBranch> {
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
    await this.updateBranch(tenantId, branchId, { isActive: false });
  },

  async setPrimaryBranch(tenantId: string, branchId: string): Promise<void> {
    await this.updateBranch(tenantId, branchId, { isPrimary: true });
  }
};
