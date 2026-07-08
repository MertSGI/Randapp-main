export type Role = 'super_admin' | 'tenant_owner' | 'staff' | 'customer';

export interface BusinessBranch {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  phone?: string;
  address?: string;
  city?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  workingHours?: any;
  isPrimary: boolean;
  isActive: boolean;
  publicSiteStatus?: 'draft' | 'published' | 'paused';
  verificationStatus?: 'not_submitted' | 'under_review' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export interface TenantBranding {
  tenantId: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  businessName: string;
  tagline?: string;
  instagramUrl?: string;
  whatsappNumber?: string;
  address?: string;
  footerText?: string;
}

export interface SalonBusinessProfile {
  id: string;
  tenant_id: string;
  public_display_name?: string;
  short_description?: string;
  about_text?: string;
  business_category?: string;
  address?: string;
  city?: string;
  district?: string;
  map_embed_url?: string;
  google_maps_url?: string;
  phone?: string;
  whatsapp_number?: string;
  instagram_url?: string;
  website_url?: string;
  email?: string;
  opening_hours_summary?: string;
  cover_image_url?: string;
  cover_images?: string[];
  logo_url?: string;
  gallery_images?: string[];
  amenities?: string[];
  parking_info?: string;
  payment_methods?: string[];
  cancellation_policy?: string;
  booking_policy?: string;
  featured_message?: string;
  seo_title?: string;
  seo_description?: string;
  is_public_profile_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  subdomain?: string;
  customDomain?: string;
  status: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired' | 'none';
  planId?: string;
  createdAt: string;
  updatedAt: string;
  branding: TenantBranding;
  
  // Verification and Publish Gates
  verificationStatus?: 'not_submitted' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'suspended';
  publicSiteStatus?: 'draft' | 'preview_ready' | 'pending_review' | 'published' | 'paused' | 'suspended';
  businessRiskStatus?: 'normal' | 'needs_review' | 'prohibited' | 'suspected_impersonation';
  isPublished?: boolean;
  setupComplete?: boolean;
}

export interface Staff {
  id: string;
  tenantId?: string;
  branchId?: string;
  name: string;
  title: string;
  calendarEmail?: string;
  phone?: string;
  image?: string;
  isOwner?: boolean;
  active?: boolean;
}

export interface User {
  id: string;
  tenantId?: string;
  name: string;
  email: string;
  passwordHash?: string;
  phone?: string;
  role: Role;
  active?: boolean;
}

export interface Service {
  id: string;
  tenantId?: string;
  branchId?: string;
  name: string;
  name_tr: string; // Turkish name
  duration: number; // in minutes
  price: number;
  image?: string; // URL to service image
  active?: boolean;
  category?: string;
}

export interface CustomerConsentFlags {
  bookingContactConsent: boolean;
  appointmentReminderConsent: boolean;
  marketingConsent: boolean;
  referralCampaignConsent: boolean;
  customerMemoryConsent: boolean;
  referencePhotoConsent: boolean;
  aiStyleAssistantConsent: boolean;
  consentVersion: string;
  consentCapturedAt: string;
  consentSource: 'booking' | 'admin' | 'customer_portal' | 'import';
}

export interface CustomerDataRequest {
  id: string;
  tenantId: string;
  customerId: string;
  requestType: 'export' | 'delete' | 'correction';
  status: 'pending' | 'completed' | 'rejected';
  requestedAt: string;
  completedAt?: string;
  notes?: string;
}

export interface BusinessOwnerTermsAcceptance {
  tenantId: string;
  ownerUserId: string;
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: string;
  source: string;
}

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  phone?: string;
  notes?: string;
  segment?: string;
  createdAt: string;
  consentFlags?: CustomerConsentFlags;
}

export interface CustomerMemoryNote {
  id: string;
  text: string;
  createdAt: string;
  createdBy: string;
}

export interface CustomerMemoryPhoto {
  id: string;
  url: string;
  caption?: string;
  createdAt: string;
}

export interface CustomerProfile {
  id: string;
  tenantId: string;
  fullName: string;
  phone: string;
  email: string;
  preferredLanguage?: 'tr' | 'en';
  marketingConsent?: boolean;
  appointmentReminderConsent?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastAppointmentAt?: string;
  // New Customer Profile Lite fields
  firstVisitAt?: string;
  totalAppointments?: number;
  preferredStaffId?: string;
  lastServiceId?: string;
  stylePreference?: string;
  colorFormula?: string;
  avoidNotes?: string;
  careNotes?: string;
  internalNotes?: CustomerMemoryNote[];
  referencePhotos?: CustomerMemoryPhoto[];
  appointmentIds?: string[];
}

export interface Subscription {
  id: string;
  tenantId: string;
  planId: string;
  provider?: string;
  providerSubscriptionReferenceCode?: string;
  providerCustomerReferenceCode?: string;
  status: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired' | 'payment_failed' | 'pending';
  trialStartsAt?: string;
  trialEndsAt?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd?: boolean;
  cancelledAt?: string;
  pastDueAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Payment {
  id: string;
  tenantId: string;
  subscriptionId: string;
  provider: string;
  providerPaymentId: string;
  providerToken?: string;
  amount: number;
  currency: string;
  status: 'succeeded' | 'pending' | 'failed';
  paidAt?: string;
  failedAt?: string;
  failureReason?: string;
  rawEventId?: string;
  createdAt: string;
}

export interface PaymentEvent {
  id: string;
  provider: string;
  eventType: string;
  providerEventId?: string;
  tenantId?: string;
  subscriptionId?: string;
  status: string;
  rawPayload: any;
  processedAt?: string;
  processingError?: string;
  createdAt: string;
}

export interface AuditLog {
  tenantId: string;
  actorType: 'system' | 'admin' | 'user' | 'webhook';
  actorId: string;
  action: string;
  metadata?: any;
  createdAt: string;
}

export interface Appointment {
  id: string;
  tenantId?: string;
  branchId?: string;
  userId?: string;
  customerId?: string;
  user_name: string;
  user_email: string;
  serviceId: string;
  staffId: string;
  date: string; // ISO Date string YYYY-MM-DD
  time: string; // HH:mm
  status: 'confirmed' | 'cancelled' | 'cancelled_by_customer' | 'cancelled_by_salon' | 'completed' | 'no_show';
  notes?: string;
  cancelReason?: string;
  cancelledAt?: string;
  cancelledBy?: 'customer' | 'salon' | 'system';
  createdAt: string;
  syncedToGoogle: boolean;
  phone?: string;
  source?: string;
}

export interface TimeSlot {
  time: string;
  available: boolean;
}

export interface Plan {
  id: string;
  name: string;
  name_tr: string;
  description_en: string;
  description_tr: string;
  monthlyPrice: number;
  setupFee?: number;
  staffLimit: number; // 0 means unlimited
  serviceLimit: number;
  trialEnabled?: boolean;
  trialDays?: number;
  providerProductReferenceCode?: string;
  providerPlanReferenceCodeMonthly?: string;
  providerPlanReferenceCodeAnnual?: string;
  features: {
    multi_branch: boolean;
    maxBranches: number;
    customerMemory: boolean;
    customerPortal: boolean;
    referralCampaigns: boolean;
    reports: boolean;
    aiRecommendation: boolean;
    aiVisualization: boolean;
    aiMonthlyQuota: number;
    customDomain: boolean;
    prioritySupport: boolean;
  };
  isActive: boolean;
  isRecommended: boolean;
}

export interface PlatformReferralProgram {
  id: string;
  name: string;
  isActive: boolean;
  rewardPerQualifiedReferralMonths: number;
  milestoneRewardThreshold: number;
  milestoneRewardMonths: number;
  qualificationRule: 'card_verified_trial_started' | 'subscription_activated';
  appliesToPlanIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PlatformReferral {
  id: string;
  referrerTenantId: string;
  referredTenantId?: string;
  referredOwnerEmail: string;
  referralCode: string;
  status: 'invited' | 'registered' | 'trial_started' | 'qualified' | 'rewarded' | 'rejected' | 'expired';
  qualificationEvent?: string;
  qualifiedAt?: string;
  rewardedAt?: string;
  rewardMonths?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReferralRewardLedger {
  id: string;
  tenantId: string;
  referralId?: string;
  rewardType: 'free_months' | 'manual_credit';
  monthsGranted: number;
  status: 'pending' | 'applied' | 'cancelled';
  appliedAt?: string;
  subscriptionExtensionUntil?: string;
  createdAt: string;
}

export interface BusinessCustomerCampaign {
  id: string;
  tenantId: string;
  name: string;
  type: 'refer_friend' | 'discount' | 'loyalty';
  isActive: boolean;
  rewardDescription: string;
  customerReward: string;
  referredCustomerReward: string;
  startDate?: string;
  endDate?: string;
  maxUses?: number;
  terms?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessCustomerReferral {
  id: string;
  tenantId: string;
  campaignId: string;
  referrerCustomerId: string;
  referredCustomerName: string;
  referredCustomerPhone?: string;
  status: 'pending' | 'booked' | 'completed' | 'rewarded' | 'rejected';
  appointmentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerCampaignReward {
  id: string;
  tenantId: string;
  campaignId: string;
  customerReferralId?: string;
  customerId: string;
  appointmentId?: string;
  rewardOwnerType: 'referrer_customer' | 'referred_customer';
  rewardDescription: string;
  rewardValueType: 'percent_discount' | 'fixed_discount' | 'free_service' | 'manual_reward';
  rewardValue?: number;
  status: 'available' | 'reserved' | 'used' | 'cancelled' | 'expired';
  availableAt: string;
  expiresAt?: string;
  usedAt?: string;
  usedAppointmentId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export const SERVICES: Service[] = [
  { 
    id: 'srv_1', 
    name: "Men's Haircut", 
    name_tr: 'Saç Kesimi', 
    duration: 45, 
    price: 300,
    image: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=800&q=80'
  },
  { 
    id: 'srv_2', 
    name: 'Beard Trim & Shape', 
    name_tr: 'Sakal Tıraşı & Şekillendirme', 
    duration: 30, 
    price: 200,
    image: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=800&q=80'
  },
  { 
    id: 'srv_3', 
    name: 'Manicure & Pedicure', 
    name_tr: 'Manikür & Pedikür', 
    duration: 60, 
    price: 500,
    image: 'https://images.unsplash.com/photo-1519014816548-bf5fe059e98b?auto=format&fit=crop&w=800&q=80'
  },
  { 
    id: 'srv_4', 
    name: 'Hair Prosthesis', 
    name_tr: 'Protez Saç', 
    duration: 120, 
    price: 3500,
    image: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'srv_5',
    name: 'Laser Epilation',
    name_tr: 'Lazer Epilasyon',
    duration: 45,
    price: 800,
    image: 'https://images.unsplash.com/photo-1555820585-c5ae44394b79?auto=format&fit=crop&w=800&q=80'
  }
];

export const BUSINESS_HOURS = {
  start: 9, // 09:00
  end: 21, // 21:00
  interval: 45, // minutes (adjusted for barber slots)
};

export interface ReferralCampaign {
  id: string;
  tenantId: string;
  campaignType: string;
  title: string;
  description: string;
  rewardType: string;
  rewardValue: string;
  active: boolean;
  createdBy: string;
  startDate?: string;
  endDate?: string;
}

export interface ReferralCode {
  id: string;
  campaignId: string;
  referrerType: 'customer' | 'tenant';
  referrerId: string;
  code: string;
  usageCount: number;
  status: 'active' | 'inactive';
}

export interface ReferralLead {
  id: string;
  campaignId: string;
  referralCode: string;
  leadName: string;
  leadEmail?: string;
  status: 'pending' | 'converted';
  createdAt: string;
}

export type CommunicationChannel = 'in_app' | 'email' | 'whatsapp' | 'sms' | 'internal_note';

export type CommunicationAudience = 'business_owner' | 'customer' | 'super_admin' | 'support_operator';

export type CommunicationEventType =
  | 'owner_registered'
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'public_site_preview_ready'
  | 'public_site_published'
  | 'booking_created'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_completed'
  | 'booking_no_show'
  | 'booking_reminder'
  | 'trial_started'
  | 'trial_ending'
  | 'subscription_active'
  | 'subscription_past_due'
  | 'subscription_paused'
  | 'subscription_suspended'
  | 'subscription_cancelled_period_end'
  | 'subscription_cancelled_immediate'
  | 'plan_upgraded'
  | 'plan_downgrade_scheduled'
  | 'manual_subscription_activated'
  | 'referral_credit_awarded'
  | 'custom_domain_requested'
  | 'custom_domain_active'
  | 'support_request_created'
  | 'super_admin_manual_provisioning_completed'
  | 'appointment_manage_link_created'
  | 'cancellation_request_created'
  | 'cancellation_request_approved'
  | 'cancellation_request_rejected'
  | 'reschedule_request_created'
  | 'reschedule_request_approved'
  | 'reschedule_request_rejected'
  | 'appointment_confirmed_by_customer';

export type CommunicationDeliveryStatus = 'queued' | 'rendered' | 'skipped' | 'sent' | 'failed' | 'cancelled';

export interface CommunicationEvent {
  id: string;
  tenantId: string;
  branchId?: string;
  customerId?: string;
  appointmentId?: string;
  subscriptionId?: string;
  audience: CommunicationAudience;
  channel: CommunicationChannel;
  type: CommunicationEventType;
  status: CommunicationDeliveryStatus;
  language: 'tr' | 'en';
  subject?: string;
  body: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  providerMessageId?: string;
  failureReason?: string;
  internalOnly: boolean;
}

export type BackgroundJobType =
  | 'subscription_trial_ending_sweep'
  | 'subscription_trial_expiration_sweep'
  | 'subscription_past_due_sweep'
  | 'subscription_cancel_at_period_end_sweep'
  | 'subscription_downgrade_at_period_end_sweep'
  | 'referral_credit_monthly_application'
  | 'communication_outbox_retry_sweep'
  | 'communication_failed_delivery_review'
  | 'custom_domain_verification_poll'
  | 'booking_availability_refresh'
  | 'data_export_reminder'
  | 'migration_snapshot_integrity_check'
  | 'support_review_queue_digest';

export type BackgroundJobStatus =
  | 'scheduled'
  | 'running'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface BackgroundJobRun {
  id: string;
  jobType: BackgroundJobType;
  status: BackgroundJobStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  affectedTenantIds: string[];
  affectedRecordCount: number;
  warningCount: number;
  errorCount: number;
  summary: string;
  metadata?: any;
  createdBy: 'system' | 'super_admin' | 'local_simulation';
  internalOnly: boolean;
}

export enum MediaAssetType {
  LOGO = 'logo',
  COVER = 'cover',
  GALLERY = 'gallery',
  STAFF_PHOTO = 'staff_photo',
  SERVICE_IMAGE = 'service_image',
  BRANCH_IMAGE = 'branch_image',
  CAMPAIGN_IMAGE = 'campaign_image',
  DOCUMENT = 'document',
  INTERNAL_ATTACHMENT = 'internal_attachment'
}

export enum MediaVisibility {
  PUBLIC = 'public',
  TENANT_PRIVATE = 'tenant_private',
  SUPER_ADMIN_ONLY = 'super_admin_only'
}

export enum MediaStorageProvider {
  LOCAL_PREVIEW = 'local_preview',
  SUPABASE_STORAGE = 'supabase_storage',
  S3_COMPATIBLE = 's3_compatible',
  EXTERNAL_URL = 'external_url'
}

export enum MediaAssetStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  REJECTED = 'rejected',
  DELETED = 'deleted'
}

export interface MediaAsset {
  id: string;
  tenantId: string;
  branchId?: string;
  ownerType: 'business_profile' | 'staff' | 'service' | 'branch' | 'campaign' | 'tenant' | 'support_case';
  ownerId?: string;
  type: MediaAssetType;
  visibility: MediaVisibility;
  provider: MediaStorageProvider;
  status: MediaAssetStatus;
  fileName: string;
  originalFileName?: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  altText?: string;
  storagePath?: string;
  publicUrl?: string;
  localPreviewUrl?: string;
  createdAt: string;
  updatedAt: string;
  uploadedBy?: string;
  metadata?: any;
}

export interface AppointmentAccessToken {
  id: string;
  tenantId: string;
  appointmentId: string;
  customerId?: string;
  tokenHash: string;
  purpose: 'view' | 'cancel' | 'reschedule' | 'confirm';
  status: 'active' | 'used' | 'expired' | 'revoked';
  expiresAt: string;
  createdAt: string;
  usedAt?: string;
  metadata?: any;
}

export type AppointmentChangeRequestType = 'cancellation' | 'reschedule';

export type AppointmentChangeRequestStatus = 
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled_by_customer'
  | 'applied';

export interface AppointmentChangeRequest {
  id: string;
  tenantId: string;
  appointmentId: string;
  customerId?: string;
  type: AppointmentChangeRequestType;
  status: AppointmentChangeRequestStatus;
  requestedDateTime?: string;
  reason?: string;
  customerNote?: string;
  ownerNote?: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface BookingPolicy {
  cancellationWindowHours: number;
  allowCustomerCancellation: boolean;
  allowCustomerRescheduleRequest: boolean;
  requireOwnerApprovalForReschedule: boolean;
  maxAdvanceBookingDays: number;
  minNoticeHours: number;
  spamProtectionEnabled: boolean;
  maxBookingsPerPhonePerDay: number;
  maxBookingsPerIpPerDay?: number;
  blockRepeatedNoShowPhone: boolean;
  noShowThreshold: number;
  requireContactConsent: boolean;
}

// === OBSERVABILITY & AUDIT LOGS MODEL ===
export type AuditActorType =
  | 'customer'
  | 'tenant_owner'
  | 'staff'
  | 'super_admin'
  | 'system'
  | 'background_job'
  | 'provider_webhook'
  | 'local_simulation';

export type AuditEventCategory =
  | 'auth'
  | 'tenant'
  | 'booking'
  | 'customer_self_service'
  | 'anti_abuse'
  | 'subscription'
  | 'payment'
  | 'communication'
  | 'scheduler'
  | 'domain'
  | 'media'
  | 'data_export'
  | 'migration'
  | 'support'
  | 'security'
  | 'system';

export type AuditEventSeverity =
  | 'info'
  | 'notice'
  | 'warning'
  | 'error'
  | 'critical';

export type AuditEventStatus =
  | 'recorded'
  | 'reviewed'
  | 'escalated'
  | 'resolved'
  | 'dismissed';

export interface AuditEvent {
  id: string;
  tenantId?: string;
  actorType: AuditActorType;
  actorId?: string;
  category: AuditEventCategory;
  severity: AuditEventSeverity;
  action: string;
  status: AuditEventStatus;
  entityType?: string;
  entityId?: string;
  correlationId?: string;
  requestId?: string;
  summary: string;
  safeDetails?: any;
  redactionApplied: boolean;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  metadata?: any;
}

// === SUPPORT TICKETS MODEL ===
export type SupportTicketStatus =
  | 'open'
  | 'waiting_on_customer'
  | 'waiting_on_owner'
  | 'in_review'
  | 'resolved'
  | 'closed'
  | 'escalated';

export type SupportTicketPriority =
  | 'low'
  | 'normal'
  | 'high'
  | 'urgent';

export type SupportTicketSource =
  | 'tenant_owner'
  | 'customer_self_service'
  | 'super_admin'
  | 'system'
  | 'background_job'
  | 'communication_outbox';

export type SupportTicketCategory =
  | 'booking'
  | 'cancellation_reschedule'
  | 'payment_billing'
  | 'subscription'
  | 'domain'
  | 'media'
  | 'communication'
  | 'account_access'
  | 'data_export'
  | 'bug'
  | 'abuse_spam'
  | 'security'
  | 'feature_request'
  | 'other';

export interface SupportTicket {
  id: string;
  tenantId?: string;
  source: SupportTicketSource;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  title: string;
  description: string;
  requesterName?: string;
  requesterEmail?: string;
  requesterPhone?: string;
  relatedAppointmentId?: string;
  relatedCustomerId?: string;
  relatedSubscriptionId?: string;
  relatedCommunicationEventId?: string;
  relatedBackgroundJobRunId?: string;
  relatedAuditEventIds: string[];
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  internalNotes?: string;
  publicReply?: string;
  metadata?: any;
}

// === INCIDENT RESPONSE MODEL ===
export type IncidentStatus =
  | 'detected'
  | 'investigating'
  | 'mitigated'
  | 'resolved'
  | 'closed';

export type IncidentSeverity =
  | 'sev4_minor'
  | 'sev3_moderate'
  | 'sev2_major'
  | 'sev1_critical';

export interface Incident {
  id: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  title: string;
  summary: string;
  affectedTenantIds: string[];
  affectedCategories: AuditEventCategory[];
  relatedAuditEventIds: string[];
  relatedSupportTicketIds: string[];
  startedAt: string;
  detectedAt: string;
  resolvedAt?: string;
  owner?: string;
  mitigationNotes?: string;
  postmortemNotes?: string;
  metadata?: any;
}

// === LEGAL & POLICY READINESS MODEL ===
export type LegalDocumentType =
  | 'terms_of_service'
  | 'privacy_policy'
  | 'kvkk_clarification_text'
  | 'cookie_policy'
  | 'data_processing_terms'
  | 'acceptable_use_policy'
  | 'subscription_terms'
  | 'booking_terms'
  | 'cancellation_policy'
  | 'communication_consent_text'
  | 'marketing_consent_text'
  | 'media_consent_text';

export type LegalDocumentStatus =
  | 'draft'
  | 'review_required'
  | 'active'
  | 'archived';

export interface LegalDocumentVersion {
  id: string;
  type: LegalDocumentType;
  version: string;
  status: LegalDocumentStatus;
  locale: string;
  title: string;
  summary: string;
  content: string;
  effectiveAt?: string;
  archivedAt?: string;
  requiresAcceptance: boolean;
  createdAt: string;
  updatedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  legalReviewStatus?: 'pending_review' | 'under_review' | 'reviewed' | 'external_review_required';
  externalLegalReviewRequired?: boolean;
  reviewNote?: string;
  complianceFinalized?: boolean;
  legalApprovalClaim?: string;
  metadata?: any;
}

export type PolicyAcceptanceActorType =
  | 'tenant_owner'
  | 'customer'
  | 'staff'
  | 'super_admin';

export type PolicyAcceptanceSource =
  | 'registration'
  | 'booking'
  | 'self_service'
  | 'admin_panel'
  | 'super_admin'
  | 'manual_import';

export interface PolicyAcceptanceRecord {
  id: string;
  tenantId?: string;
  actorType: PolicyAcceptanceActorType;
  actorId?: string;
  actorDisplayName?: string;
  actorContact?: string;
  documentType: LegalDocumentType;
  documentVersion: string;
  acceptedAt: string;
  acceptanceSource: PolicyAcceptanceSource;
  ipAddress?: string;
  userAgent?: string;
  locale: string;
  consentSnapshot?: string; // Captured text or configuration at acceptance time
  revokedAt?: string;
  metadata?: any;
}

// === DATA RIGHTS REQUESTS MODEL ===
export type DataRightsRequestType =
  | 'access'
  | 'export'
  | 'deletion'
  | 'correction'
  | 'consent_withdrawal';

export type DataRightsRequestStatus =
  | 'submitted'
  | 'in_review'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export interface DataRightsRequest {
  id: string;
  tenantId?: string;
  requesterType: 'customer' | 'tenant_owner' | 'staff';
  requesterName?: string;
  requesterContact?: string;
  type: DataRightsRequestType;
  status: DataRightsRequestStatus;
  description: string;
  relatedCustomerId?: string;
  relatedAppointmentId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  internalNotes?: string;
  metadata?: any;
}




