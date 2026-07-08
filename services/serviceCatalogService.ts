import { Service } from '../types';
import { createSuccess, createError, MutationResult } from '../utils/mutationResult';
import { getCatalogRepository } from './repositories';

export const getServices = async (tenantId: string, options?: { activeOnly?: boolean }): Promise<Service[]> => {
  return getCatalogRepository().listServices(tenantId, options);
};

export const createService = async (tenantId: string, service: Omit<Service, 'id' | 'tenantId'>): Promise<Service> => {
  return getCatalogRepository().createService(tenantId, service);
};

export const updateService = async (tenantId: string, serviceId: string, updates: Partial<Service>): Promise<Service | null> => {
  return getCatalogRepository().updateService(serviceId, updates);
};

export const deleteService = async (tenantId: string, serviceId: string): Promise<MutationResult<void>> => {
  try {
    const success = await getCatalogRepository().archiveService(tenantId, serviceId);
    return success ? createSuccess('deleted') : createError('deleted', 'action_failed');
  } catch (err) {
    return createError('deleted', 'action_failed');
  }
};

export const listPublicActiveServicesByTenantSlug = async (slug: string): Promise<Service[]> => {
  return getCatalogRepository().listPublicActiveServicesByTenantSlug(slug);
};

// Legacy verification reference: getServiceCatalogRepository


