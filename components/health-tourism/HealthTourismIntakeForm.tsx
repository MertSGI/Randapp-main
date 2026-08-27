import React, { useState, useEffect } from 'react';
import { HtLanguage, HtTranslationDictionary } from '../../types/healthTourismPublic';
import { HtSourceChannel } from '../../types/healthTourism';
import { HealthTourismService } from '../../utils/healthTourismService';
import { supabase } from '../../services/supabaseClient';
import { getLocalizedCountries, isValidIsoCountryCode } from '../../utils/countryHelper';

export interface HealthTourismIntakeFormProps {
  tenantSlug: string;
  t: HtTranslationDictionary;
  activeLanguage: HtLanguage;
  onLanguageChange: (lang: HtLanguage) => void;
  sourceChannel: HtSourceChannel;
  referringAgencyId: string | null;
  hasInvalidAgencyWarning?: boolean;
  isRtl?: boolean;
}

/**
 * Utility to mask email for non-sensitive review summary
 */
function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local.charAt(0)}***@${domain}`;
  }
  return `${local.charAt(0)}***${local.charAt(local.length - 1)}@${domain}`;
}

/**
 * Utility to mask phone for non-sensitive review summary
 */
function maskPhone(phone: string): string {
  if (!phone || phone.length < 6) return phone;
  const visiblePrefix = phone.slice(0, 4);
  const visibleSuffix = phone.slice(-2);
  return `${visiblePrefix} *** **${visibleSuffix}`;
}

export const HealthTourismIntakeForm: React.FC<HealthTourismIntakeFormProps> = ({
  tenantSlug,
  t,
  activeLanguage,
  onLanguageChange,
  sourceChannel,
  referringAgencyId,
  hasInvalidAgencyWarning = false,
  isRtl = false,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [preferredLanguage, setPreferredLanguage] = useState<HtLanguage>(activeLanguage);
  const [countryCode, setCountryCode] = useState<string>('');
  const [passportNumber, setPassportNumber] = useState<string>('');

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [leadResult, setLeadResult] = useState<{ lead_id?: string } | null>(null);

  // Sync preferred language when active surface language changes
  useEffect(() => {
    setPreferredLanguage(activeLanguage);
  }, [activeLanguage]);

  // Passport UI is disabled by default via feature flag
  const isPassportEnabled = (import.meta as any).env?.VITE_HT_PASSPORT_INTAKE_ENABLED === 'true';

  const countryOptions = getLocalizedCountries(activeLanguage);

  const handleLanguageSelect = (lang: HtLanguage) => {
    setPreferredLanguage(lang);
    onLanguageChange(lang);
  };

  const validateStep2 = (): boolean => {
    setValidationError(null);
    if (!fullName.trim()) {
      setValidationError(t.fullNameRequiredErr);
      return false;
    }
    if (!email.trim() && !phone.trim()) {
      setValidationError(t.contactRequiredErr);
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (currentStep === 2 && !validateStep2()) {
      return;
    }
    setValidationError(null);
    setCurrentStep((prev) => Math.min(prev + 1, 4));
  };

  const handlePrev = () => {
    setValidationError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!validateStep2()) {
      setCurrentStep(2);
      return;
    }

    // Validate country code if selected
    if (countryCode && !isValidIsoCountryCode(countryCode)) {
      setValidationError(t.invalidCountryErr);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const htService = new HealthTourismService(supabase);

      const result = await htService.createPublicLead({
        slug: tenantSlug,
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        preferred_language: preferredLanguage,
        country_code: countryCode && isValidIsoCountryCode(countryCode) ? countryCode : null,
        passport_number: isPassportEnabled ? passportNumber.trim() || null : null,
        source_channel: sourceChannel,
        referring_agency_id: referringAgencyId || null,
      });

      if (result.success) {
        setLeadResult({ lead_id: result.lead_id });
        setCurrentStep(5);

        // Completely clear ALL intake PII state upon successful submission
        setFullName('');
        setEmail('');
        setPhone('');
        setPassportNumber('');
        setCountryCode('');
      } else {
        // Display localized generic public error, strictly suppressing raw DB error message
        setSubmitError(t.submitErrorGeneric);
      }
    } catch (err) {
      setSubmitError(t.submitErrorGeneric);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (currentStep === 5) {
    return (
      <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl p-8 text-center shadow-lg" role="region" aria-live="polite">
        <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-3xl font-bold">
          ✓
        </div>
        <h3 className="text-2xl font-bold text-emerald-900 dark:text-emerald-200 mb-2">
          {t.successTitle}
        </h3>
        <p className="text-emerald-700 dark:text-emerald-300 max-w-md mx-auto mb-6 text-sm">
          {t.successMessage}
        </p>

        {leadResult?.lead_id && (
          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 inline-block mb-6 border border-emerald-100 dark:border-emerald-900 shadow-sm">
            <span className="text-xs text-gray-500 uppercase tracking-wider block mb-1">
              {t.referenceCodeLabel}
            </span>
            <code className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {leadResult.lead_id}
            </code>
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={() => {
              setCurrentStep(1);
              setLeadResult(null);
            }}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-md transition focus:ring-2 focus:ring-emerald-500"
          >
            {t.newInquiryBtn}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-6 sm:p-8 shadow-xl">
      {/* Form Header */}
      <div className="mb-6 text-center sm:text-left rtl:sm:text-right">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t.intakeFormTitle}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          {t.intakeFormSubtitle}
        </p>
      </div>

      {/* Progress Navigation Tabs */}
      <div className="flex border-b border-gray-200 dark:border-slate-700 mb-6 overflow-x-auto no-scrollbar" role="tablist">
        {[
          { step: 1, label: t.step1Tab },
          { step: 2, label: t.step2Tab },
          { step: 3, label: t.step3Tab },
          { step: 4, label: t.step4Tab },
        ].map((tab) => (
          <button
            key={tab.step}
            type="button"
            role="tab"
            aria-selected={currentStep === tab.step}
            onClick={() => {
              if (tab.step < currentStep || (tab.step === 2 && currentStep >= 1)) {
                setCurrentStep(tab.step);
              }
            }}
            disabled={tab.step > currentStep}
            className={`flex-1 py-3 px-2 text-center text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
              currentStep === tab.step
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : currentStep > tab.step
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-gray-400 dark:text-gray-500 cursor-not-allowed'
            }`}
          >
            {tab.step}. {tab.label}
          </button>
        ))}
      </div>

      {/* Global Validation / Submit Error Banner */}
      {(validationError || submitError) && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm" role="alert" aria-live="polite">
          {validationError || submitError}
        </div>
      )}

      {/* Malformed Agency Warning Banner */}
      {hasInvalidAgencyWarning && currentStep === 1 && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs sm:text-sm" role="alert">
          ⚠️ {t.invalidAgencyWarning}
        </div>
      )}

      {/* Form Container */}
      <form onSubmit={handleSubmit} noValidate>
        {/* STEP 1: Language & Country */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t.preferredLanguageLabel} *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { code: 'tr' as HtLanguage, label: 'Türkçe' },
                  { code: 'en' as HtLanguage, label: 'English' },
                  { code: 'de' as HtLanguage, label: 'Deutsch' },
                  { code: 'ru' as HtLanguage, label: 'Русский' },
                  { code: 'ar' as HtLanguage, label: 'العربية' },
                ].map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => handleLanguageSelect(lang.code)}
                    className={`py-3 px-4 rounded-xl border text-sm font-medium transition focus:ring-2 focus:ring-indigo-500 ${
                      preferredLanguage === lang.code
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold'
                        : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-700 dark:text-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="ht-country" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t.countryLabel}
              </label>
              <select
                id="ht-country"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                aria-invalid={Boolean(countryCode && !isValidIsoCountryCode(countryCode))}
                aria-describedby={countryCode && !isValidIsoCountryCode(countryCode) ? 'INVALID_COUNTRY' : undefined}
                className={`w-full p-3 rounded-xl border bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                  countryCode && !isValidIsoCountryCode(countryCode) ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-slate-600'
                }`}
              >
                <option value="">{t.countrySelectPlaceholder}</option>
                {countryOptions.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
              {countryCode && !isValidIsoCountryCode(countryCode) && (
                <p id="INVALID_COUNTRY" className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert">
                  {t.invalidCountryErr}
                </p>
              )}
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-md transition focus:ring-2 focus:ring-indigo-500"
              >
                {t.nextBtn}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Contact Details */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div>
              <label htmlFor="ht-fullname" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t.fullNameLabel} *
              </label>
              <input
                id="ht-fullname"
                type="text"
                required
                aria-required="true"
                aria-invalid={validationError === t.fullNameRequiredErr}
                aria-describedby={validationError === t.fullNameRequiredErr ? 'FULL_NAME_REQUIRED' : undefined}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t.fullNamePlaceholder}
                className={`w-full p-3 rounded-xl border bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                  validationError === t.fullNameRequiredErr ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-slate-600'
                }`}
              />
              {validationError === t.fullNameRequiredErr && (
                <p id="FULL_NAME_REQUIRED" className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert">
                  {t.fullNameRequiredErr}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="ht-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t.emailLabel}
              </label>
              <input
                id="ht-email"
                type="email"
                dir="ltr"
                aria-invalid={validationError === t.contactRequiredErr}
                aria-describedby={validationError === t.contactRequiredErr ? 'CONTACT_METHOD_REQUIRED' : undefined}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.emailPlaceholder}
                className={`w-full p-3 rounded-xl border bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                  validationError === t.contactRequiredErr ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-slate-600'
                }`}
              />
            </div>

            <div>
              <label htmlFor="ht-phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t.phoneLabel}
              </label>
              <input
                id="ht-phone"
                type="tel"
                dir="ltr"
                aria-invalid={validationError === t.contactRequiredErr}
                aria-describedby={validationError === t.contactRequiredErr ? 'CONTACT_METHOD_REQUIRED' : 'ht-phone-notice'}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t.phonePlaceholder}
                className={`w-full p-3 rounded-xl border bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                  validationError === t.contactRequiredErr ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-slate-600'
                }`}
              />
              <p id="ht-phone-notice" className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t.contactNotice}
              </p>
              {validationError === t.contactRequiredErr && (
                <p id="CONTACT_METHOD_REQUIRED" className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert">
                  {t.contactRequiredErr}
                </p>
              )}
            </div>

            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={handlePrev}
                className="px-6 py-3 border border-gray-300 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition focus:ring-2 focus:ring-indigo-500"
              >
                {t.backBtn}
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-md transition focus:ring-2 focus:ring-indigo-500"
              >
                {t.nextBtn}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Details & Optional Context */}
        {currentStep === 3 && (
          <div className="space-y-6">
            {isPassportEnabled && (
              <div>
                <label htmlFor="ht-passport" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t.passportLabel}
                </label>
                <input
                  id="ht-passport"
                  type="text"
                  dir="ltr"
                  value={passportNumber}
                  onChange={(e) => setPassportNumber(e.target.value)}
                  placeholder={t.passportPlaceholder}
                  className="w-full p-3 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t.passportNotice}
                </p>
              </div>
            )}

            {referringAgencyId && (
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 text-xs sm:text-sm">
                ✓ {t.agencyReferralNotice}
              </div>
            )}

            {!isPassportEnabled && !referringAgencyId && (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
                {t.additionalInfoEmptyText}
              </div>
            )}

            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={handlePrev}
                className="px-6 py-3 border border-gray-300 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition focus:ring-2 focus:ring-indigo-500"
              >
                {t.backBtn}
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-md transition focus:ring-2 focus:ring-indigo-500"
              >
                {t.nextBtn}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Non-Sensitive Review & Submit */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div className="bg-gray-50 dark:bg-slate-900 p-6 rounded-xl border border-gray-200 dark:border-slate-700 space-y-3 text-sm">
              <h3 className="font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-700 pb-2 mb-3">
                {t.intakeStep4Title}
              </h3>
              <div className="flex justify-between">
                <span className="text-gray-500">{t.fullNameSummary}:</span>
                <span className="font-medium text-gray-900 dark:text-white">{fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t.contactSummary}:</span>
                <span className="font-medium text-gray-900 dark:text-white">{t.providedStatus}</span>
              </div>
              {email && (
                <div className="flex justify-between">
                  <span className="text-gray-500">{t.emailSummary}:</span>
                  <span className="font-mono text-gray-900 dark:text-white">{maskEmail(email)}</span>
                </div>
              )}
              {phone && (
                <div className="flex justify-between">
                  <span className="text-gray-500">{t.phoneSummary}:</span>
                  <span className="font-mono text-gray-900 dark:text-white">{maskPhone(phone)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">{t.languageSummary}:</span>
                <span className="font-medium text-gray-900 dark:text-white uppercase">{preferredLanguage}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t.countrySummary}:</span>
                <span className="font-medium text-gray-900 dark:text-white">{countryCode || t.notProvidedStatus}</span>
              </div>
              {isPassportEnabled && (
                <div className="flex justify-between">
                  <span className="text-gray-500">{t.passportSummary}:</span>
                  <span className="font-mono text-gray-900 dark:text-white">
                    {passportNumber ? '••••••••' : t.notProvidedStatus}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">{t.agencySummary}:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {referringAgencyId ? t.agencyDetectedStatus : t.noAgencyStatus}
                </span>
              </div>
            </div>

            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={handlePrev}
                disabled={isSubmitting}
                className="px-6 py-3 border border-gray-300 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition disabled:opacity-50 focus:ring-2 focus:ring-indigo-500"
              >
                {t.backBtn}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg transition disabled:opacity-50 focus:ring-2 focus:ring-emerald-500"
              >
                {isSubmitting ? t.submittingBtn : t.submitBtn}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};
