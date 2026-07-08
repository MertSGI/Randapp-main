import { 
  Tenant, 
  SalonBusinessProfile, 
  Service, 
  Staff, 
  BusinessBranch, 
  Appointment, 
  CustomerProfile, 
  Subscription, 
  PaymentEvent, 
  CommunicationEvent,
  PlatformReferral,
  BusinessCustomerCampaign,
  BusinessCustomerReferral,
  CustomerCampaignReward
} from '../types';

/**
 * 1. Tenant Repository Contract
 * Handles basic tenant registration, listing, and global attributes.
 */
export interface TenantRepository {
  /**
   * Public/Admin: Retrieves active tenant configuration via isPublished/slug.
   * Throws Error if not found.
   */
  getTenantById(id: string): Promise<Tenant | null>;
  getTenantBySlug(slug: string): Promise<Tenant | null>;
  createTenant(tenant: Partial<Tenant>): Promise<Tenant>;
  updateTenant(id: string, patches: Partial<Tenant>): Promise<void>;
  listTenants(): Promise<Tenant[]>;
}

/**
 * 2. Business Profile Repository Contract
 * Handles public and private configurations for salon public domains.
 */
export interface BusinessProfileRepository {
  /**
   * Public-readable lookup of salon web layouts, hours, categories.
   */
  getProfile(tenantId: string): Promise<SalonBusinessProfile | null>;
  /**
   * Owner-restricted modification of details (address, description, instagram).
   */
  updateProfile(tenantId: string, patches: Partial<SalonBusinessProfile>): Promise<SalonBusinessProfile | null>;
}

/**
 * 3. Catalog Repository Contract
 * Handles master service types lists for booking menu layouts.
 */
export interface CatalogRepository {
  /**
   * Public-readable active treatment menus.
   */
  listServices(tenantId: string, options?: { activeOnly?: boolean }): Promise<Service[]>;
  getServiceById(tenantId: string, serviceId: string): Promise<Service | null>;
  /**
   * Owner-restricted modification of prices and service hours.
   */
  createService(tenantId: string, input: Omit<Service, 'id' | 'tenantId'>): Promise<Service>;
  updateService(tenantId: string, serviceId: string, patches: Partial<Service>): Promise<Service | null>;
  deleteService(tenantId: string, serviceId: string): Promise<boolean>;
}

/**
 * 4. Staff Repository Contract
 * Handles the list of practitioners for booking calendars and reservation assignments.
 */
export interface StaffRepository {
  /**
   * Public-readable staff listing for user calendar select dropdowns.
   */
  listStaff(tenantId: string, options?: { activeOnly?: boolean }): Promise<Staff[]>;
  getStaffById(tenantId: string, staffId: string): Promise<Staff | null>;
  /**
   * Owner-restricted configurations.
   */
  createStaff(tenantId: string, input: Omit<Staff, 'id' | 'tenantId'>): Promise<Staff>;
  updateStaff(tenantId: string, staffId: string, patches: Partial<Staff>): Promise<Staff | null>;
  deleteStaff(tenantId: string, staffId: string): Promise<boolean>;
}

/**
 * 5. Branch Repository Contract
 * Handles multi-location branches mapping to an Enterprise tenant.
 */
export interface BranchRepository {
  /**
   * Public-readable lists of branches for location booking selection.
   */
  listBranches(tenantId: string): Promise<BusinessBranch[]>;
  getBranchById(tenantId: string, branchId: string): Promise<BusinessBranch | null>;
  /**
   * Owner-restricted branch creation.
   */
  createBranch(tenantId: string, branch: Partial<BusinessBranch>): Promise<BusinessBranch>;
  updateBranch(tenantId: string, branchId: string, patches: Partial<BusinessBranch>): Promise<BusinessBranch | null>;
}

/**
 * 6. Appointment Repository Contract
 * Core scheduling reservation engine handling customer-submitted bookings.
 */
export interface AppointmentRepository {
  /**
   * Owner-restricted master booking details lookup.
   */
  listAppointments(tenantId: string, filter?: { date?: string; upcomingOnly?: boolean }): Promise<Appointment[]>;
  getAppointmentById(tenantId: string, appointmentId: string): Promise<Appointment | null>;
  /**
   * Public-enabled reservation ingestion. Requires isolation tags logic.
   */
  createAppointment(tenantId: string, input: Omit<Appointment, 'id' | 'createdAt' | 'tenantId'>): Promise<Appointment>;
  /**
   * Owner or validated self-service cancellation updates.
   */
  updateAppointment(tenantId: string, appointmentId: string, patches: Partial<Appointment>): Promise<Appointment | null>;
  cancelAppointment(tenantId: string, appointmentId: string, reason?: string, cancelledBy?: 'customer' | 'salon' | 'system'): Promise<boolean>;
}

/**
 * 7. Customer Repository Contract
 * Core CRM directory isolated by tenant_id.
 */
export interface CustomerRepository {
  listCustomers(tenantId: string): Promise<CustomerProfile[]>;
  getCustomerById(tenantId: string, customerId: string): Promise<CustomerProfile | null>;
  findCustomerByPhoneOrEmail(tenantId: string, phone?: string, email?: string): Promise<CustomerProfile | null>;
  createOrUpdateCustomer(tenantId: string, customer: Partial<CustomerProfile>): Promise<CustomerProfile>;
}

/**
 * 8. Customer Memory Repository Contract
 * Handles secure visual style logs, formula logs, and consent history.
 * Explicitly non-public. Private to the salon owner.
 */
export interface CustomerMemoryRepository {
  getCustomerMemory(tenantId: string, customerId: string): Promise<any>;
  updateCustomerMemory(tenantId: string, customerId: string, memoryJson: any): Promise<void>;
  addCustomerNote(tenantId: string, customerId: string, text: string, author: string): Promise<void>;
}

/**
 * 9. Subscription Repository Contract
 * Manages billing and SaaS quotas. Requires elevated Service Role or Edge validation endpoints.
 */
export interface SubscriptionRepository {
  getSubscription(tenantId: string): Promise<Subscription | null>;
  createPendingCheckout(tenantId: string, planId: string): Promise<any>;
  updateSubscriptionStatus(tenantId: string, status: string): Promise<void>;
  listPaymentEvents(tenantId: string): Promise<PaymentEvent[]>;
}

/**
 * 10. Communication Event Repository (Outbox System)
 * Enqueues customer and operator dispatch rows securely to prevent spam or mixups.
 */
export interface CommunicationEventRepository {
  /**
   * Owner-restricted log audit reviews.
   */
  listEvents(tenantId: string): Promise<CommunicationEvent[]>;
  /**
   * Local or system background jobs queue append operation.
   */
  enqueueEvent(tenantId: string, event: Omit<CommunicationEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<CommunicationEvent>;
  updateDeliveryStatus(tenantId: string, eventId: string, status: string, notes?: string): Promise<void>;
}

/**
 * 11. Site Provisioning Repository Contract
 * Manages active public routing parameters, subdomains, and custom headers.
 */
export interface SiteProvisioningRepository {
  getProvisioningStatus(tenantId: string): Promise<{
    slug: string;
    isPublished: boolean;
    domainStrategy: string;
    customDomain?: string;
  }>;
  updateProvisioningStatus(tenantId: string, updates: {
    isPublished: boolean;
    slug?: string;
    customDomain?: string;
  }): Promise<void>;
}

/**
 * 12. Custom Domain Repository Contract
 * Manages B2B vanity redirects config files for randevulari.com mapping.
 */
export interface CustomDomainRepository {
  listDomainRequests(): Promise<any[]>;
  addDomainRequest(tenantId: string, domainName: string): Promise<any>;
  updateDomainStatus(id: string, status: 'pending' | 'active' | 'failed', errorNote?: string): Promise<void>;
}

/**
 * 13. Referral Repository Contract
 * Platform metrics, invite link codes, and SaaS milestones.
 */
export interface ReferralRepository {
  listReferrals(tenantId: string): Promise<PlatformReferral[]>;
  addReferral(tenantId: string, referral: Omit<PlatformReferral, 'id' | 'createdAt' | 'updatedAt'>): Promise<PlatformReferral>;
  updateReferralStatus(referralId: string, status: string, monthsReward?: number): Promise<void>;
}

/**
 * 14. Campaign Repository Contract
 * Salon-to-customer friend referral discounts campaigns.
 */
export interface CampaignRepository {
  listCampaigns(tenantId: string): Promise<BusinessCustomerCampaign[]>;
  saveCampaign(tenantId: string, campaign: BusinessCustomerCampaign): Promise<BusinessCustomerCampaign>;
  deleteCampaign(tenantId: string, campaignId: string): Promise<boolean>;
  
  listCustomerReferrals(tenantId: string): Promise<BusinessCustomerReferral[]>;
  saveCustomerReferral(tenantId: string, referral: BusinessCustomerReferral): Promise<BusinessCustomerReferral>;
  
  listCustomerRewards(tenantId: string): Promise<CustomerCampaignReward[]>;
  saveCustomerReward(tenantId: string, reward: CustomerCampaignReward): Promise<CustomerCampaignReward>;
}

/**
 * 15. Manual Provisioning Repository Contract
 * Super Admin bypass paths to deploy pilot accounts without standard billing workflows.
 */
export interface ManualProvisioningRepository {
  getProvisioningLog(tenantId: string): Promise<any | null>;
  logProvisioningSuccess(tenantId: string, logs: {
    adminEmail: string;
    offlinePayment: boolean;
    complimentary: boolean;
    pilotException: boolean;
    setupNotes: string;
    billingSource: string;
  }): Promise<void>;
}
