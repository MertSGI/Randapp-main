import { Tenant as GlobalTenant, SalonBusinessProfile, Service, Staff, Appointment, TimeSlot, BusinessCustomerCampaign, BusinessCustomerReferral, CustomerCampaignReward } from '../../types';

export interface Tenant extends GlobalTenant {
  official_business_name?: string;
  public_display_name?: string;
  owner_user_id?: string;
  category?: string;
  city?: string;
  district?: string;
  phone?: string;
  address?: string;
  instagram_handle?: string;
  subscription_status?: string;
  business_risk_status?: string;
  onboarding_status?: string;
}

export interface TenantRepository {
  listTenants(): Promise<Tenant[]>;
  getTenantById(id: string): Promise<Tenant | null>;
  createTenant(input: Partial<Tenant>): Promise<Tenant>;
  updateTenant(id: string, patch: Partial<Tenant>): Promise<void>;
  setActiveTenant(id: string): void;
  getActiveTenantId(): string | null;
}

export interface BusinessProfileRepository {
  getProfile(tenantId: string): Promise<SalonBusinessProfile | null>;
  updateProfile(tenantId: string, patch: Partial<SalonBusinessProfile>): Promise<SalonBusinessProfile | null>;
  submitForReview(tenantId: string): Promise<void>;
  updatePublicSiteStatus(tenantId: string, status: string): Promise<void>;
  getBusinessProfile(tenantId: string): Promise<SalonBusinessProfile | null>;
  updateBusinessProfile(tenantId: string, patch: Partial<SalonBusinessProfile>): Promise<SalonBusinessProfile | null>;
  getPublicBusinessProfileBySlug(slug: string): Promise<SalonBusinessProfile | null>;
}

export interface CatalogRepository {
  listServices(tenantId: string, options?: { activeOnly?: boolean }): Promise<Service[]>;
  getServiceById(serviceId: string): Promise<Service | null>;
  createService(tenantId: string, input: Omit<Service, 'id' | 'tenantId'>): Promise<Service>;
  updateService(serviceId: string, patch: Partial<Service>): Promise<Service | null>;
  deleteOrDeactivateService(serviceId: string): Promise<boolean>;
  archiveService(tenantId: string, serviceId: string): Promise<boolean>;
  listPublicActiveServicesByTenantSlug(slug: string): Promise<Service[]>;
  
  listStaff(tenantId: string, options?: { activeOnly?: boolean }): Promise<Staff[]>;
  getStaffById(staffId: string): Promise<Staff | null>;
  createStaff(tenantId: string, input: Omit<Staff, 'id' | 'tenantId'>): Promise<Staff>;
  updateStaff(staffId: string, patch: Partial<Staff>): Promise<Staff | null>;
  deleteOrDeactivateStaff(staffId: string): Promise<boolean>;
  archiveStaff(tenantId: string, staffId: string): Promise<boolean>;
  listPublicActiveStaffByTenantSlug(slug: string): Promise<Staff[]>;
  
  assignServiceToStaff(staffId: string, serviceId: string): Promise<void>;
  removeServiceFromStaff(staffId: string, serviceId: string): Promise<void>;
  listStaffForService(tenantId: string, serviceId: string): Promise<Staff[]>;
  
  listAvailabilityRules(tenantId: string, staffId?: string): Promise<any[]>;
  updateAvailabilityRule(ruleId: string, patch: any): Promise<void>;
  createAvailabilityRule(tenantId: string, input: any): Promise<any>;

  getAvailability(tenantId: string): Promise<any>;
  updateAvailability(tenantId: string, input: any): Promise<any>;
  getPublicAvailabilityByTenantSlug(slug: string): Promise<any>;
}

export interface BookingRepository {
  listAppointments(tenantId: string, filter?: { date?: string, upcomingOnly?: boolean }): Promise<Appointment[]>;
  getAppointmentById(appointmentId: string): Promise<Appointment | null>;
  createAppointment(tenantId: string, input: Omit<Appointment, 'id' | 'createdAt' | 'tenantId'>): Promise<Appointment>;
  updateAppointment(appointmentId: string, patch: Partial<Appointment>): Promise<Appointment | null>;
  cancelAppointment(appointmentId: string, reason?: string, cancelledBy?: 'customer' | 'salon' | 'system'): Promise<boolean>;
  
  listCustomers(tenantId: string): Promise<any[]>;
  getCustomerById(customerId: string): Promise<any | null>;
  findCustomerByPhoneOrEmail(tenantId: string, phone?: string, email?: string): Promise<any | null>;
  createOrUpdateCustomer(tenantId: string, input: any): Promise<any>;
  createOrFindCustomerForBooking(tenantId: string, input: any): Promise<any>;
  getCustomer(tenantId: string, customerId: string): Promise<any | null>;
  updateCustomer(tenantId: string, customerId: string, patch: any): Promise<any | null>;
  
  getCustomerMemory(customerId: string): Promise<any>;
  updateCustomerMemory(customerId: string, patch: any): Promise<void>;
  addCustomerNote(customerId: string, text: string, author: string): Promise<void>;
}

export interface SubscriptionRepository {
  getSubscription(tenantId: string): Promise<any>;
  createPendingCheckout(tenantId: string, planId: string): Promise<any>;
  updateSubscriptionStatus(tenantId: string, status: string): Promise<void>;
  listPaymentEvents(tenantId: string): Promise<any[]>;
  updateManualSubscription(tenantId: string, options: any): Promise<any>;
}

export interface ManualProvisioningRepository {
  getProvisioningLog(tenantId: string): Promise<any | null>;
  logProvisioningSuccess(tenantId: string, log: any): Promise<void>;
}

export interface SelfServiceRepository {
  listTokens(tenantId: string): Promise<any[]>;
  getTokenByHash(tokenHash: string): Promise<any | null>;
  createToken(tenantId: string, input: any): Promise<any>;
  updateToken(tokenId: string, patch: any): Promise<void>;
  listChangeRequests(tenantId: string): Promise<any[]>;
  createChangeRequest(tenantId: string, input: any): Promise<any>;
  updateChangeRequest(requestId: string, patch: any): Promise<void>;
}

export interface CommunicationOutboxRepository {
  listEvents(tenantId: string): Promise<any[]>;
  enqueueEvent(tenantId: string, event: any): Promise<any>;
  updateDeliveryStatus(tenantId: string, eventId: string, status: string, notes?: string): Promise<void>;
}

export interface AuditEventRepository {
  listEvents(tenantId?: string): Promise<any[]>;
  createEvent(event: any): Promise<any>;
}

export interface SupportTicketRepository {
  listTickets(tenantId?: string): Promise<any[]>;
  createTicket(ticket: any): Promise<any>;
  updateTicket(ticketId: string, patch: any): Promise<any>;
}

export interface PolicyAndConsentRepository {
  listAcceptances(tenantId?: string): Promise<any[]>;
  createAcceptance(acceptance: any): Promise<any>;
  listConsentRecords(tenantId?: string): Promise<any[]>;
  createConsentRecord(consent: any): Promise<any>;
  updateConsentRecord(consentId: string, patch: any): Promise<void>;
}

export interface SuperAdminRepository {
  listTenants(): Promise<Tenant[]>;
  listSubscriptions(): Promise<any[]>;
  listPayments(): Promise<any[]>;
  approveTenant(tenantId: string): Promise<void>;
  rejectTenant(tenantId: string, reason: string): Promise<void>;
  suspendTenant(tenantId: string): Promise<void>;
}

export interface CampaignRepository {
  listCampaigns(tenantId: string): Promise<BusinessCustomerCampaign[]>;
  saveCampaign(tenantId: string, campaign: BusinessCustomerCampaign): Promise<BusinessCustomerCampaign>;
  deleteCampaign(campaignId: string): Promise<boolean>;
  listCustomerReferrals(tenantId: string): Promise<BusinessCustomerReferral[]>;
  saveCustomerReferral(tenantId: string, referral: BusinessCustomerReferral): Promise<BusinessCustomerReferral>;
  listCustomerRewards(tenantId: string): Promise<CustomerCampaignReward[]>;
  saveCustomerReward(tenantId: string, reward: CustomerCampaignReward): Promise<CustomerCampaignReward>;
}

