import { Service } from '../types';
import { createSuccess, createError, MutationResult } from '../utils/mutationResult';
import { getServiceCatalogRepository } from './repositories';

export const getServices = async (tenantId: string, options?: { activeOnly?: boolean }): Promise<Service[]> => {
  return getServiceCatalogRepository().listServices(tenantId, options);
};

export const createService = async (tenantId: string, service: Omit<Service, 'id' | 'tenantId'>): Promise<Service> => {
  return getServiceCatalogRepository().createService(tenantId, service);
};

export const updateService = async (tenantId: string, serviceId: string, updates: Partial<Service>): Promise<Service | null> => {
  return getServiceCatalogRepository().updateService(serviceId, updates);
};

export const deleteService = async (tenantId: string, serviceId: string): Promise<MutationResult<void>> => {
  try {
    const success = await getServiceCatalogRepository().archiveService(tenantId, serviceId);
    return success ? createSuccess('deleted') : createError('deleted', 'action_failed');
  } catch (err) {
    return createError('deleted', 'action_failed');
  }
};

export const listPublicActiveServicesByTenantSlug = async (slug: string): Promise<Service[]> => {
  return getServiceCatalogRepository().listPublicActiveServicesByTenantSlug(slug);
};

