import { launchModeService } from './launchModeService';
import { getDataSourceMode } from './dataSourceConfig';
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

export const repositoryFactory = {
  getBusinessProfileRepository(): BusinessProfileRepository {
    const launchMode = launchModeService.getCurrentLaunchMode();
    const dataMode = getDataSourceMode();

    if (launchModeService.requiresPersistentDatabase(launchMode) || dataMode === 'supabase') {
      if (dataMode !== 'supabase') {
        throw new Error('Supabase repository required for paymentless production: businessProfile');
      }
      return proxiedSupabaseBusinessProfile;
    }
    return localBusinessProfile;
  },

  getCatalogRepository(): CatalogRepository {
    const launchMode = launchModeService.getCurrentLaunchMode();
    const dataMode = getDataSourceMode();

    if (launchModeService.requiresPersistentDatabase(launchMode) || dataMode === 'supabase') {
      if (dataMode !== 'supabase') {
        throw new Error('Supabase repository required for paymentless production: catalog');
      }
      return proxiedSupabaseCatalog;
    }
    return localCatalog;
  },

  getBookingRepository(): BookingRepository {
    const launchMode = launchModeService.getCurrentLaunchMode();
    const dataMode = getDataSourceMode();

    if (launchModeService.requiresPersistentDatabase(launchMode) || dataMode === 'supabase') {
      if (dataMode !== 'supabase') {
        throw new Error('Supabase repository required for paymentless production: booking');
      }
      return proxiedSupabaseBooking;
    }
    return localBooking;
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
    const launchMode = launchModeService.getCurrentLaunchMode();
    const dataMode = getDataSourceMode();

    if (launchModeService.requiresPersistentDatabase(launchMode) || dataMode === 'supabase') {
      if (dataMode !== 'supabase') {
        throw new Error('Supabase repository required for paymentless production: campaign');
      }
      return proxiedSupabaseCampaign;
    }
    return localCampaign;
  },

  getTenantRepository(): TenantRepository {
    const launchMode = launchModeService.getCurrentLaunchMode();
    const dataMode = getDataSourceMode();

    if (launchModeService.requiresPersistentDatabase(launchMode) || dataMode === 'supabase') {
      if (dataMode !== 'supabase') {
        throw new Error('Supabase repository required for paymentless production: tenant');
      }
      return proxiedSupabaseTenant;
    }
    return localTenant;
  },

  getSubscriptionRepository(): SubscriptionRepository {
    const launchMode = launchModeService.getCurrentLaunchMode();
    const dataMode = getDataSourceMode();

    if (launchModeService.requiresPersistentDatabase(launchMode) || dataMode === 'supabase') {
      if (dataMode !== 'supabase') {
        throw new Error('Supabase repository required for paymentless production: subscription');
      }
      return proxiedSupabaseSubscription;
    }
    return localSubscription;
  },

  getManualProvisioningRepository(): ManualProvisioningRepository {
    const launchMode = launchModeService.getCurrentLaunchMode();
    const dataMode = getDataSourceMode();

    if (launchModeService.requiresPersistentDatabase(launchMode) || dataMode === 'supabase') {
      if (dataMode !== 'supabase') {
        throw new Error('Supabase repository required for paymentless production: manualProvisioning');
      }
      return proxiedSupabaseManualProvisioning;
    }
    return localManualProvisioning;
  },

  getSelfServiceRepository(): SelfServiceRepository {
    const launchMode = launchModeService.getCurrentLaunchMode();
    const dataMode = getDataSourceMode();

    if (launchModeService.requiresPersistentDatabase(launchMode) || dataMode === 'supabase') {
      if (dataMode !== 'supabase') {
        throw new Error('Supabase repository required for paymentless production: selfService');
      }
      return proxiedSupabaseSelfService;
    }
    return localSelfService;
  },

  getCommunicationOutboxRepository(): CommunicationOutboxRepository {
    const launchMode = launchModeService.getCurrentLaunchMode();
    const dataMode = getDataSourceMode();

    if (launchModeService.requiresPersistentDatabase(launchMode) || dataMode === 'supabase') {
      if (dataMode !== 'supabase') {
        throw new Error('Supabase repository required for paymentless production: communicationOutbox');
      }
      return proxiedSupabaseCommunicationOutbox;
    }
    return localCommunicationOutbox;
  },

  getAuditEventRepository(): AuditEventRepository {
    const launchMode = launchModeService.getCurrentLaunchMode();
    const dataMode = getDataSourceMode();

    if (launchModeService.requiresPersistentDatabase(launchMode) || dataMode === 'supabase') {
      if (dataMode !== 'supabase') {
        throw new Error('Supabase repository required for paymentless production: auditEvent');
      }
      return proxiedSupabaseAuditEvent;
    }
    return localAuditEvent;
  },

  getSupportTicketRepository(): SupportTicketRepository {
    const launchMode = launchModeService.getCurrentLaunchMode();
    const dataMode = getDataSourceMode();

    if (launchModeService.requiresPersistentDatabase(launchMode) || dataMode === 'supabase') {
      if (dataMode !== 'supabase') {
        throw new Error('Supabase repository required for paymentless production: supportTicket');
      }
      return proxiedSupabaseSupportTicket;
    }
    return localSupportTicket;
  },

  getPolicyAndConsentRepository(): PolicyAndConsentRepository {
    const launchMode = launchModeService.getCurrentLaunchMode();
    const dataMode = getDataSourceMode();

    if (launchModeService.requiresPersistentDatabase(launchMode) || dataMode === 'supabase') {
      if (dataMode !== 'supabase') {
        throw new Error('Supabase repository required for paymentless production: policyAndConsent');
      }
      return proxiedSupabasePolicyAndConsent;
    }
    return localPolicyAndConsent;
  }
};
