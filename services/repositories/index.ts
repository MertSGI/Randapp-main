import { dataSourceConfig } from '../dataSourceConfig';

// Repository Types
import { 
  BusinessProfileRepository, 
  CatalogRepository, 
  BookingRepository, 
  CampaignRepository,
  TenantRepository,
  SubscriptionRepository,
  ManualProvisioningRepository,
  SelfServiceRepository,
  CommunicationOutboxRepository,
  AuditEventRepository,
  SupportTicketRepository,
  PolicyAndConsentRepository
} from './types';

// Local Implementations
import { LocalBusinessProfileRepository } from './localBusinessProfileRepository';
import { LocalCatalogRepository } from './localCatalogRepository';
import { LocalBookingRepository } from './localBookingRepository';
import { LocalCampaignRepository } from './localCampaignRepository';
import { LocalTenantRepository } from './localTenantRepository';
import { LocalSubscriptionRepository } from './localSubscriptionRepository';
import { LocalManualProvisioningRepository } from './localManualProvisioningRepository';
import { LocalSelfServiceRepository } from './localSelfServiceRepository';
import { LocalCommunicationOutboxRepository } from './localCommunicationOutboxRepository';
import { LocalAuditEventRepository } from './localAuditEventRepository';
import { LocalSupportTicketRepository } from './localSupportTicketRepository';
import { LocalPolicyAndConsentRepository } from './localPolicyAndConsentRepository';

// Supabase Implementations
import { SupabaseBusinessProfileRepository } from './supabaseBusinessProfileRepository';
import { SupabaseCatalogRepository } from './supabaseCatalogRepository';
import { SupabaseBookingRepository } from './supabaseBookingRepository';
import { SupabaseCampaignRepository } from './supabaseCampaignRepository';
import { SupabaseTenantRepository } from './supabaseTenantRepository';
import { SupabaseSubscriptionRepository } from './supabaseSubscriptionRepository';
import { SupabaseManualProvisioningRepository } from './supabaseManualProvisioningRepository';
import { SupabaseSelfServiceRepository } from './supabaseSelfServiceRepository';
import { SupabaseCommunicationOutboxRepository } from './supabaseCommunicationOutboxRepository';
import { SupabaseAuditEventRepository } from './supabaseAuditEventRepository';
import { SupabaseSupportTicketRepository } from './supabaseSupportTicketRepository';
import { SupabasePolicyAndConsentRepository } from './supabasePolicyAndConsentRepository';

// Singleton instances for local providers to maintain state easily if needed
const localProviders = {
  businessProfile: new LocalBusinessProfileRepository(),
  catalog: new LocalCatalogRepository(),
  booking: new LocalBookingRepository(),
  campaign: new LocalCampaignRepository(),
  tenant: new LocalTenantRepository(),
  subscription: new LocalSubscriptionRepository(),
  manualProvisioning: new LocalManualProvisioningRepository(),
  selfService: new LocalSelfServiceRepository(),
  communicationOutbox: new LocalCommunicationOutboxRepository(),
  auditEvent: new LocalAuditEventRepository(),
  supportTicket: new LocalSupportTicketRepository(),
  policyAndConsent: new LocalPolicyAndConsentRepository(),
};

const rawSupabaseProviders = {
  businessProfile: new SupabaseBusinessProfileRepository(),
  catalog: new SupabaseCatalogRepository(),
  booking: new SupabaseBookingRepository(),
  campaign: new SupabaseCampaignRepository(),
  tenant: new SupabaseTenantRepository(),
  subscription: new SupabaseSubscriptionRepository(),
  manualProvisioning: new SupabaseManualProvisioningRepository(),
  selfService: new SupabaseSelfServiceRepository(),
  communicationOutbox: new SupabaseCommunicationOutboxRepository(),
  auditEvent: new SupabaseAuditEventRepository(),
  supportTicket: new SupabaseSupportTicketRepository(),
  policyAndConsent: new SupabasePolicyAndConsentRepository(),
};

// Pilot demo bypass helper proxy
const createPilotBypassProxy = <T extends object>(supabaseImpl: T, localImpl: T): T => {
  return new Proxy(supabaseImpl, {
    get(target, prop, receiver) {
      const originalMethod = Reflect.get(target, prop, receiver);
      if (typeof originalMethod === 'function') {
        return function(this: any, ...args: any[]) {
          let isPilot = false;
          try {
            const activeTenantId = localStorage.getItem('lari_active_tenant_id');
            const inPilotDemo = localStorage.getItem('lari_in_pilot_demo') === 'true';
            const hashPilot = window.location.hash.includes('tenant_pilot_demo') || window.location.hash.includes('pilot/customer');
            const pathPilot = window.location.pathname.includes('tenant_pilot_demo') || window.location.pathname.includes('pilot/customer');
            
            isPilot = activeTenantId === 'tenant_pilot_demo' || 
                      inPilotDemo || 
                      hashPilot || 
                      pathPilot || 
                      args.includes('tenant_pilot_demo');
          } catch (e) {
            // safe fallback
          }
          if (isPilot) {
            const localMethod = Reflect.get(localImpl, prop);
            if (typeof localMethod === 'function') {
              return localMethod.apply(localImpl, args);
            }
          }
          return originalMethod.apply(this, args);
        };
      }
      return originalMethod;
    }
  });
};

const supabaseProviders = {
  businessProfile: createPilotBypassProxy(rawSupabaseProviders.businessProfile, localProviders.businessProfile),
  catalog: createPilotBypassProxy(rawSupabaseProviders.catalog, localProviders.catalog),
  booking: createPilotBypassProxy(rawSupabaseProviders.booking, localProviders.booking),
  campaign: createPilotBypassProxy(rawSupabaseProviders.campaign, localProviders.campaign),
  tenant: createPilotBypassProxy(rawSupabaseProviders.tenant, localProviders.tenant),
  subscription: createPilotBypassProxy(rawSupabaseProviders.subscription, localProviders.subscription),
  manualProvisioning: createPilotBypassProxy(rawSupabaseProviders.manualProvisioning, localProviders.manualProvisioning),
  selfService: createPilotBypassProxy(rawSupabaseProviders.selfService, localProviders.selfService),
  communicationOutbox: createPilotBypassProxy(rawSupabaseProviders.communicationOutbox, localProviders.communicationOutbox),
  auditEvent: createPilotBypassProxy(rawSupabaseProviders.auditEvent, localProviders.auditEvent),
  supportTicket: createPilotBypassProxy(rawSupabaseProviders.supportTicket, localProviders.supportTicket),
  policyAndConsent: createPilotBypassProxy(rawSupabaseProviders.policyAndConsent, localProviders.policyAndConsent),
};

import { repositoryFactory } from '../repositoryFactory';

/**
 * Returns the currently active BusinessProfileRepository based on the environment data source mode.
 */
export const getBusinessProfileRepository = (): BusinessProfileRepository => {
  return repositoryFactory.getBusinessProfileRepository();
};

/**
 * Returns the currently active CatalogRepository based on the environment data source mode.
 */
export const getCatalogRepository = (): CatalogRepository => {
  return repositoryFactory.getCatalogRepository();
};

/**
 * Returns the currently active BookingRepository based on the environment data source mode.
 */
export const getBookingRepository = (): BookingRepository => {
  return repositoryFactory.getBookingRepository();
};

/**
 * Returns the currently active CatalogRepository for Service Catalog.
 */
export const getServiceCatalogRepository = (): CatalogRepository => {
  return repositoryFactory.getServiceCatalogRepository();
};

/**
 * Returns the currently active CatalogRepository for Staff.
 */
export const getStaffRepository = (): CatalogRepository => {
  return repositoryFactory.getStaffRepository();
};

/**
 * Returns the currently active CatalogRepository for Availability/Working Hours.
 */
export const getAvailabilityRepository = (): CatalogRepository => {
  return repositoryFactory.getAvailabilityRepository();
};

/**
 * Returns the currently active BookingRepository for Customers.
 */
export const getCustomerRepository = (): BookingRepository => {
  return repositoryFactory.getCustomerRepository();
};

/**
 * Returns the currently active CampaignRepository based on the environment data source mode.
 */
export const getCampaignRepository = (): CampaignRepository => {
  return repositoryFactory.getCampaignRepository();
};

/**
 * Returns the currently active TenantRepository based on the environment data source mode.
 */
export const getTenantRepository = (): TenantRepository => {
  return repositoryFactory.getTenantRepository();
};

/**
 * Returns the currently active SubscriptionRepository based on the environment data source mode.
 */
export const getSubscriptionRepository = (): SubscriptionRepository => {
  return repositoryFactory.getSubscriptionRepository();
};

/**
 * Returns the currently active ManualProvisioningRepository based on the environment data source mode.
 */
export const getManualProvisioningRepository = (): ManualProvisioningRepository => {
  return repositoryFactory.getManualProvisioningRepository();
};

/**
 * Returns the currently active SelfServiceRepository based on the environment data source mode.
 */
export const getSelfServiceRepository = (): SelfServiceRepository => {
  return repositoryFactory.getSelfServiceRepository();
};

/**
 * Returns the currently active CommunicationOutboxRepository based on the environment data source mode.
 */
export const getCommunicationOutboxRepository = (): CommunicationOutboxRepository => {
  return repositoryFactory.getCommunicationOutboxRepository();
};

/**
 * Returns the currently active AuditEventRepository based on the environment data source mode.
 */
export const getAuditEventRepository = (): AuditEventRepository => {
  return repositoryFactory.getAuditEventRepository();
};

/**
 * Returns the currently active SupportTicketRepository based on the environment data source mode.
 */
export const getSupportTicketRepository = (): SupportTicketRepository => {
  return repositoryFactory.getSupportTicketRepository();
};

/**
 * Returns the currently active PolicyAndConsentRepository based on the environment data source mode.
 */
export const getPolicyAndConsentRepository = (): PolicyAndConsentRepository => {
  return repositoryFactory.getPolicyAndConsentRepository();
};

