import { launchModeService } from './launchModeService';
import { getDataSourceMode } from './dataSourceConfig';
import { shouldUsePilotLocalBypass } from './pilotBypassPolicy';
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
} from './repositories/types';
import { LocalBusinessProfileRepository } from './repositories/localBusinessProfileRepository';
import { LocalCatalogRepository } from './repositories/localCatalogRepository';
import { LocalBookingRepository } from './repositories/localBookingRepository';
import { LocalCampaignRepository } from './repositories/localCampaignRepository';
import { LocalTenantRepository } from './repositories/localTenantRepository';
import { LocalSubscriptionRepository } from './repositories/localSubscriptionRepository';
import { LocalManualProvisioningRepository } from './repositories/localManualProvisioningRepository';
import { LocalSelfServiceRepository } from './repositories/localSelfServiceRepository';
import { LocalCommunicationOutboxRepository } from './repositories/localCommunicationOutboxRepository';
import { LocalAuditEventRepository } from './repositories/localAuditEventRepository';
import { LocalSupportTicketRepository } from './repositories/localSupportTicketRepository';
import { LocalPolicyAndConsentRepository } from './repositories/localPolicyAndConsentRepository';

import { SupabaseBusinessProfileRepository } from './repositories/supabaseBusinessProfileRepository';
import { SupabaseCatalogRepository } from './repositories/supabaseCatalogRepository';
import { SupabaseBookingRepository } from './repositories/supabaseBookingRepository';
import { SupabaseCampaignRepository } from './repositories/supabaseCampaignRepository';
import { SupabaseTenantRepository } from './repositories/supabaseTenantRepository';
import { SupabaseSubscriptionRepository } from './repositories/supabaseSubscriptionRepository';
import { SupabaseManualProvisioningRepository } from './repositories/supabaseManualProvisioningRepository';
import { SupabaseSelfServiceRepository } from './repositories/supabaseSelfServiceRepository';
import { SupabaseCommunicationOutboxRepository } from './repositories/supabaseCommunicationOutboxRepository';
import { SupabaseAuditEventRepository } from './repositories/supabaseAuditEventRepository';
import { SupabaseSupportTicketRepository } from './repositories/supabaseSupportTicketRepository';
import { SupabasePolicyAndConsentRepository } from './repositories/supabasePolicyAndConsentRepository';

// Singletons
const localBusinessProfile = new LocalBusinessProfileRepository();
const localCatalog = new LocalCatalogRepository();
const localBooking = new LocalBookingRepository();
const localCampaign = new LocalCampaignRepository();
const localTenant = new LocalTenantRepository();
const localSubscription = new LocalSubscriptionRepository();
const localManualProvisioning = new LocalManualProvisioningRepository();
const localSelfService = new LocalSelfServiceRepository();
const localCommunicationOutbox = new LocalCommunicationOutboxRepository();
const localAuditEvent = new LocalAuditEventRepository();
const localSupportTicket = new LocalSupportTicketRepository();
const localPolicyAndConsent = new LocalPolicyAndConsentRepository();

const supabaseBusinessProfile = new SupabaseBusinessProfileRepository();
const supabaseCatalog = new SupabaseCatalogRepository();
const supabaseBooking = new SupabaseBookingRepository();
const supabaseCampaign = new SupabaseCampaignRepository();
const supabaseTenant = new SupabaseTenantRepository();
const supabaseSubscription = new SupabaseSubscriptionRepository();
const supabaseManualProvisioning = new SupabaseManualProvisioningRepository();
const supabaseSelfService = new SupabaseSelfServiceRepository();
const supabaseCommunicationOutbox = new SupabaseCommunicationOutboxRepository();
const supabaseAuditEvent = new SupabaseAuditEventRepository();
const supabaseSupportTicket = new SupabaseSupportTicketRepository();
const supabasePolicyAndConsent = new SupabasePolicyAndConsentRepository();

// Proxy helper for pilot demo bypass
const createPilotBypassProxy = <T extends object>(supabaseImpl: T, localImpl: object): T => {
  return new Proxy(supabaseImpl, {
    get(target, prop, receiver) {
      const originalMethod = Reflect.get(target, prop, receiver);
      if (typeof originalMethod === 'function') {
        return function(this: any, ...args: any[]) {
          let isPilot = false;
          try {
            const activeTenantId = typeof localStorage !== 'undefined' ? localStorage.getItem('lari_active_tenant_id') : null;
            const inPilotDemo = typeof localStorage !== 'undefined' && localStorage.getItem('lari_in_pilot_demo') === 'true';
            const hash = typeof window !== 'undefined' && window.location?.hash ? window.location.hash : '';
            const pathname = typeof window !== 'undefined' && window.location?.pathname ? window.location.pathname : '';
            
            isPilot = shouldUsePilotLocalBypass(getDataSourceMode(), {
              activeTenantId,
              inPilotDemo,
              hash,
              pathname,
              args,
            });
          } catch (e) {
            // safe fallback
          }
          if (isPilot) {
            const localMethod = Reflect.get(localImpl as any, prop);
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

const proxiedSupabaseBusinessProfile = createPilotBypassProxy(supabaseBusinessProfile, localBusinessProfile);
const proxiedSupabaseCatalog = createPilotBypassProxy(supabaseCatalog, localCatalog);
const proxiedSupabaseBooking = createPilotBypassProxy(supabaseBooking, localBooking);
const proxiedSupabaseCampaign = createPilotBypassProxy(supabaseCampaign, localCampaign);
const proxiedSupabaseTenant = createPilotBypassProxy(supabaseTenant, localTenant);
const proxiedSupabaseSubscription = createPilotBypassProxy(supabaseSubscription, localSubscription);
const proxiedSupabaseManualProvisioning = createPilotBypassProxy(supabaseManualProvisioning, localManualProvisioning);
const proxiedSupabaseSelfService = createPilotBypassProxy(supabaseSelfService, localSelfService);
const proxiedSupabaseCommunicationOutbox = createPilotBypassProxy(supabaseCommunicationOutbox, localCommunicationOutbox);
const proxiedSupabaseAuditEvent = createPilotBypassProxy(supabaseAuditEvent, localAuditEvent);
const proxiedSupabaseSupportTicket = createPilotBypassProxy(supabaseSupportTicket, localSupportTicket);
const proxiedSupabasePolicyAndConsent = createPilotBypassProxy(supabasePolicyAndConsent, localPolicyAndConsent);

function selectRepository<T>(localRepo: any, supabaseRepo: any, domainName: string): T {
  const launchMode = launchModeService.getCurrentLaunchMode();
  const dataMode = getDataSourceMode();

  if (launchModeService.requiresPersistentDatabase(launchMode) || dataMode.startsWith('supabase')) {
    if (dataMode !== 'supabase') {
      throw new Error(`Supabase repository required for paymentless production: ${domainName}`);
    }
    return supabaseRepo as T;
  }
  return localRepo as T;
}

export const repositoryFactory = {
  getActiveDataMode() {
    return getDataSourceMode();
  },

  getLaunchMode() {
    return launchModeService.getCurrentLaunchMode();
  },

  isSupabaseMode(): boolean {
    return getDataSourceMode() === 'supabase';
  },

  isLocalMode(): boolean {
    return getDataSourceMode() === 'local';
  },

  isPersistentDatabaseRequired(): boolean {
    return launchModeService.requiresPersistentDatabase(launchModeService.getCurrentLaunchMode());
  },

  getBusinessProfileRepository(): BusinessProfileRepository {
    return selectRepository(localBusinessProfile, proxiedSupabaseBusinessProfile, 'businessProfile');
  },

  getCatalogRepository(): CatalogRepository {
    return selectRepository(localCatalog, proxiedSupabaseCatalog, 'catalog');
  },

  getBookingRepository(): BookingRepository {
    return selectRepository(localBooking, proxiedSupabaseBooking, 'booking');
  },

  getServiceCatalogRepository(): CatalogRepository {
    return this.getCatalogRepository();
  },

  getStaffRepository(): CatalogRepository {
    return this.getCatalogRepository();
  },

  getAvailabilityRepository(): CatalogRepository {
    return this.getCatalogRepository();
  },

  getCustomerRepository(): BookingRepository {
    return this.getBookingRepository();
  },

  getCampaignRepository(): CampaignRepository {
    return selectRepository(localCampaign, proxiedSupabaseCampaign, 'campaign');
  },

  getTenantRepository(): TenantRepository {
    return selectRepository(localTenant, proxiedSupabaseTenant, 'tenant');
  },

  getSubscriptionRepository(): SubscriptionRepository {
    return selectRepository(localSubscription, proxiedSupabaseSubscription, 'subscription');
  },

  getManualProvisioningRepository(): ManualProvisioningRepository {
    return selectRepository(localManualProvisioning, proxiedSupabaseManualProvisioning, 'manualProvisioning');
  },

  getSelfServiceRepository(): SelfServiceRepository {
    return selectRepository(localSelfService, proxiedSupabaseSelfService, 'selfService');
  },

  getCommunicationOutboxRepository(): CommunicationOutboxRepository {
    return selectRepository(localCommunicationOutbox, proxiedSupabaseCommunicationOutbox, 'communicationOutbox');
  },

  getAuditEventRepository(): AuditEventRepository {
    return selectRepository(localAuditEvent, proxiedSupabaseAuditEvent, 'auditEvent');
  },

  getSupportTicketRepository(): SupportTicketRepository {
    return selectRepository(localSupportTicket, proxiedSupabaseSupportTicket, 'supportTicket');
  },

  getPolicyAndConsentRepository(): PolicyAndConsentRepository {
    return selectRepository(localPolicyAndConsent, proxiedSupabasePolicyAndConsent, 'policyAndConsent');
  },

  getRawLocalRepositories() {
    return {
      businessProfile: localBusinessProfile,
      catalog: localCatalog,
      booking: localBooking,
      campaign: localCampaign,
      tenant: localTenant,
      subscription: localSubscription,
      manualProvisioning: localManualProvisioning,
      selfService: localSelfService,
      communicationOutbox: localCommunicationOutbox,
      auditEvent: localAuditEvent,
      supportTicket: localSupportTicket,
      policyAndConsent: localPolicyAndConsent,
    };
  },

  getRawSupabaseRepositories() {
    return {
      businessProfile: supabaseBusinessProfile,
      catalog: supabaseCatalog,
      booking: supabaseBooking,
      campaign: supabaseCampaign,
      tenant: supabaseTenant,
      subscription: supabaseSubscription,
      manualProvisioning: supabaseManualProvisioning,
      selfService: supabaseSelfService,
      communicationOutbox: supabaseCommunicationOutbox,
      auditEvent: supabaseAuditEvent,
      supportTicket: supabaseSupportTicket,
      policyAndConsent: supabasePolicyAndConsent,
    };
  }
};
