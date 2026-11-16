export type HtLanguage = 'tr' | 'en' | 'de' | 'ru' | 'ar';

export interface HtTranslationDictionary {
  brandName: string;
  brandTagline: string;
  selectLanguage: string;
  inquireNow: string;

  heroBadge: string;
  heroTitle: string;
  heroSubtitle: string;
  getStartedBtn: string;
  learnMoreBtn: string;

  processSectionTitle: string;
  processSectionSubtitle: string;
  processStep1Title: string;
  step1Desc: string;
  processStep2Title: string;
  step2Desc: string;
  processStep3Title: string;
  step3Desc: string;

  aboutClinicTitle: string;
  addressLabel: string;
  getDirectionsBtn: string;
  contactTitle: string;

  intakeFormTitle: string;
  intakeFormSubtitle: string;
  step1Tab: string;
  step2Tab: string;
  step3Tab: string;
  step4Tab: string;
  nextBtn: string;
  backBtn: string;
  homeBtn: string;

  intakeStep1Title: string;
  preferredLanguageLabel: string;
  countryLabel: string;
  countrySelectPlaceholder: string;

  intakeStep2Title: string;
  fullNameLabel: string;
  fullNamePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  contactNotice: string;

  intakeStep3Title: string;
  passportLabel: string;
  passportPlaceholder: string;
  passportNotice: string;
  agencyReferralNotice: string;
  invalidAgencyWarning: string;
  additionalInfoEmptyText: string;

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

  successTitle: string;
  successMessage: string;
  referenceCodeLabel: string;
  newInquiryBtn: string;

  fullNameRequiredErr: string;
  contactRequiredErr: string;
  invalidCountryErr: string;
  invalidAgencyErr: string;
  tenantNotFoundTitle: string;
  tenantNotFoundDesc: string;
  tenantSuspendedTitle: string;
  tenantSuspendedDesc: string;
  loadingTenantText: string;

  contactFormIntro: string;
  nameRequiredErr: string;
  contactRequiredFormErr: string;
  submitToCoordinatorBtn: string;
  handoffSubmittedSuccess: string;
  contactCaptureFailedErr: string;
  genericConnectionErr: string;
  contactDetailsRequiredReply: string;
  chatMedicalSafetyDeferral: string;
  rateLimitedErr: string;

  footerCopyright: string;
  footerRights: string;

  metaTitle: string;
  metaDescription: string;
}
