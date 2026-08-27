export type HtLanguage = 'tr' | 'en' | 'de' | 'ru' | 'ar';

export interface HtTranslationDictionary {
  // Brand & Header
  brandName: string;
  brandTagline: string;
  selectLanguage: string;
  inquireNow: string;

  // Hero Section
  heroBadge: string;
  heroTitle: string;
  heroSubtitle: string;
  getStartedBtn: string;
  learnMoreBtn: string;

  // Process & Trust
  processSectionTitle: string;
  processSectionSubtitle: string;
  processStep1Title: string;
  step1Desc: string;
  processStep2Title: string;
  step2Desc: string;
  processStep3Title: string;
  step3Desc: string;

  // Clinic Info & Location
  aboutClinicTitle: string;
  addressLabel: string;
  getDirectionsBtn: string;
  contactTitle: string;

  // Intake Form Headers & Navigation Controls
  intakeFormTitle: string;
  intakeFormSubtitle: string;
  step1Tab: string;
  step2Tab: string;
  step3Tab: string;
  step4Tab: string;
  nextBtn: string;
  backBtn: string;
  homeBtn: string;

  // Step 1 - Patient Context
  intakeStep1Title: string;
  preferredLanguageLabel: string;
  countryLabel: string;
  countrySelectPlaceholder: string;

  // Step 2 - Contact Details
  intakeStep2Title: string;
  fullNameLabel: string;
  fullNamePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  contactNotice: string;

  // Step 3 - Context & Passport
  intakeStep3Title: string;
  passportLabel: string;
  passportPlaceholder: string;
  passportNotice: string;
  agencyReferralNotice: string;
  invalidAgencyWarning: string;
  additionalInfoEmptyText: string;

  // Step 4 - Review & Submit
  intakeStep4Title: string;
  reviewNotice: string;
  fullNameSummary: string;
  contactSummary: string;
  emailSummary: string;
  phoneSummary: string;
  countrySummary: string;
  languageSummary: string;
  passportSummary: string;
  agencySummary: string;
  providedStatus: string;
  notProvidedStatus: string;
  agencyDetectedStatus: string;
  noAgencyStatus: string;
  submitBtn: string;
  submittingBtn: string;
  submitErrorGeneric: string;

  // Step 5 - Success
  successTitle: string;
  successMessage: string;
  referenceCodeLabel: string;
  newInquiryBtn: string;

  // Validation Errors & Tenant Statuses
  fullNameRequiredErr: string;
  contactRequiredErr: string;
  invalidCountryErr: string;
  invalidAgencyErr: string;
  tenantNotFoundTitle: string;
  tenantNotFoundDesc: string;
  tenantSuspendedTitle: string;
  tenantSuspendedDesc: string;
  loadingTenantText: string;

  // Footer
  footerCopyright: string;
  footerRights: string;

  // SEO
  metaTitle: string;
  metaDescription: string;
}
