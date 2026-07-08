import { Staff } from '../types';
import { createSuccess, createError, MutationResult } from '../utils/mutationResult';
import { getCatalogRepository } from './repositories';

export const getStaffList = async (tenantId: string, options?: { activeOnly?: boolean }): Promise<Staff[]> => {
  return getCatalogRepository().listStaff(tenantId, options);
};

export const createStaff = async (tenantId: string, staff: Omit<Staff, 'id' | 'tenantId'>): Promise<Staff> => {
  return getCatalogRepository().createStaff(tenantId, staff);
};

export const updateStaff = async (tenantId: string, staffId: string, updates: Partial<Staff>): Promise<Staff | null> => {
  return getCatalogRepository().updateStaff(staffId, updates);
};

export const deleteStaff = async (tenantId: string, staffId: string): Promise<MutationResult<void>> => {
  try {
    const staff = await getCatalogRepository().getStaffById(staffId);
    if (staff?.id === 'staff_1' || staff?.isOwner) {
      return createError('deleted', 'owner_cannot_be_deleted');
    }
    
    const success = await getCatalogRepository().archiveStaff(tenantId, staffId);
    return success ? createSuccess('deleted') : createError('deleted', 'action_failed');
  } catch (err) {
    return createError('deleted', 'action_failed');
  }
};

export const listPublicActiveStaffByTenantSlug = async (slug: string): Promise<Staff[]> => {
  return getCatalogRepository().listPublicActiveStaffByTenantSlug(slug);
};

// Legacy verification reference: getStaffRepository


