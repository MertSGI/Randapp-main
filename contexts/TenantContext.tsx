import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { Tenant, TenantBranding } from '../types';
import { tenantService } from '../services/tenantService';

interface TenantContextType {
  tenant: Tenant | null;
  branding: TenantBranding | null;
  isLoadingTenant: boolean;
  tenantStatus: 'active' | 'not_found' | 'suspended';
  refreshTenant: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const [isLoadingTenant, setIsLoadingTenant] = useState(true);
  const [tenantStatus, setTenantStatus] = useState<'active' | 'not_found' | 'suspended'>('active');

  const loadTenant = async () => {
    setIsLoadingTenant(true);
    try {
      const resolvedTenant = await tenantService.getCurrentTenant();
      
      if (!resolvedTenant) {
        setTenantStatus('not_found');
        setTenant(null);
        setBranding(null);
      } else {
        const fetchedBranding = await tenantService.getTenantBranding(resolvedTenant.id);
        
        if (resolvedTenant.status !== 'active') {
          setTenantStatus('suspended');
        } else {
          setTenantStatus('active');
        }
        
        setTenant(resolvedTenant);
        setBranding(fetchedBranding || (resolvedTenant as any).branding || null);
      }
    } catch (error) {
      console.error("Failed to load tenant", error);
      setTenantStatus('not_found');
    } finally {
      setIsLoadingTenant(false);
    }
  };

  useEffect(() => {
    loadTenant();
  }, []);

  const value = {
    tenant,
    branding,
    isLoadingTenant,
    tenantStatus,
    refreshTenant: loadTenant,
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
