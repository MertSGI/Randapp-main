import { User } from '../types';

export function canPreviewTenantSite(currentUser: User | null, tenantId: string | undefined): boolean {
  if (!currentUser || !tenantId) return false;
  if (!currentUser.active) return false;
  
  if (currentUser.role === 'super_admin') {
    return true;
  }
  
  if (currentUser.role === 'tenant_owner' && currentUser.tenantId === tenantId) {
    return true;
  }
  
  return false;
}
