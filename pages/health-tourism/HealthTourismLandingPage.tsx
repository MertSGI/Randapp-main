import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import { tenantService } from '../../services/tenantService';
import { businessProfileService, PublicBusinessProfile } from '../../services/businessProfileService';
import { useHealthTourismLanguage } from '../../hooks/useHealthTourismLanguage';
import { HealthTourismIntakeForm } from '../../components/health-tourism/HealthTourismIntakeForm';
import { extractSourceChannel, extractReferringAgencyId } from '../../utils/sourceAttributionHelper';
import { Tenant } from '../../types';

export const HealthTourismLandingPage: React.FC = () => {
  const { tenantSlug: urlTenantSlug } = useParams<{ tenantSlug?: string }>();
  const [searchParams] = useSearchParams();

  const globalTenantCtx = useTenant();
  const [resolvedTenant, setResolvedTenant] = useState<Tenant | null>(null);
  const [isResolvingTenant, setIsResolvingTenant] = useState<boolean>(true);
  const [tenantResolutionStatus, setTenantResolutionStatus] = useState<'active' | 'not_found' | 'suspended'>('active');

  const [businessProfile, setBusinessProfile] = useState<PublicBusinessProfile | null>(null);

  const { language, setLanguage, t, isRtl, supportedLanguages } = useHealthTourismLanguage();

  // Extract source attribution & agency referral from URL context
  const sourceChannel = extractSourceChannel(window.location.href, document.referrer);
  const referringAgencyId = extractReferringAgencyId(searchParams);

  useEffect(() => {
    let isMounted = true;

    async function resolvePageTenant() {
      setIsResolvingTenant(true);
      try {
        let tnt: Tenant | null = null;

        // 1. If explicit slug in URL parameter (/health-tourism/:tenantSlug)
        if (urlTenantSlug) {
          tnt = await tenantService.getTenantBySlug(urlTenantSlug);
        } else if (globalTenantCtx.tenant) {
          // 2. Reuse tenant from TenantContext if custom domain / host resolved it
          tnt = globalTenantCtx.tenant;
        } else {
          // 3. Fallback to host resolution
          tnt = await tenantService.resolveTenantFromHost(window.location.hostname);
        }

        if (!isMounted) return;

        if (!tnt) {
          setTenantResolutionStatus('not_found');
          setResolvedTenant(null);
        } else if (tnt.status !== 'active') {
          setTenantResolutionStatus('suspended');
          setResolvedTenant(tnt);
        } else {
          setTenantResolutionStatus('active');
          setResolvedTenant(tnt);

          // Fetch public business profile
          const profile = await businessProfileService.getPublicProfile(tnt.id);
          if (isMounted) {
            setBusinessProfile(profile);
          }
        }
      } catch (err) {
        if (isMounted) {
          setTenantResolutionStatus('not_found');
        }
      } finally {
        if (isMounted) {
          setIsResolvingTenant(false);
        }
      }
    }

    resolvePageTenant();

    return () => {
      isMounted = false;
    };
  }, [urlTenantSlug, globalTenantCtx.tenant]);

  // Update SEO Document Title & Meta Tags
  useEffect(() => {
    const originalTitle = document.title;
    const businessName = resolvedTenant?.name || businessProfile?.displayName || 'LARİ';
    document.title = `${t.metaTitle} | ${businessName}`;

    // Update meta description
    let metaDescEl = document.querySelector('meta[name="description"]');
    if (!metaDescEl) {
      metaDescEl = document.createElement('meta');
      metaDescEl.setAttribute('name', 'description');
      document.head.appendChild(metaDescEl);
    }
    metaDescEl.setAttribute('content', `${t.metaDescription} - ${businessName}`);

    return () => {
      document.title = originalTitle;
    };
  }, [t, resolvedTenant, businessProfile]);

  const primaryColor = resolvedTenant?.branding?.primaryColor || '#4f46e5';

  if (isResolvingTenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center p-8">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 font-medium">{t.loadingTenantText}</p>
        </div>
      </div>
    );
  }

  if (tenantResolutionStatus === 'not_found' || !resolvedTenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 p-4">
        <div className="max-w-md w-full text-center bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-700">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            !
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {t.tenantNotFoundTitle}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
            {t.tenantNotFoundDesc}
          </p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition"
          >
            Ana Sayfa
          </a>
        </div>
      </div>
    );
  }

  if (tenantResolutionStatus === 'suspended') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 p-4">
        <div className="max-w-md w-full text-center bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-700">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            !
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {t.tenantSuspendedTitle}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {t.tenantSuspendedDesc}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`min-h-screen bg-slate-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 ${
        isRtl ? 'font-sans-rtl' : 'font-sans'
      }`}
    >
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-gray-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Tenant Identity */}
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            {resolvedTenant.branding?.logoUrl ? (
              <img
                src={resolvedTenant.branding.logoUrl}
                alt={resolvedTenant.name}
                className="h-10 w-auto max-w-[160px] object-contain"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-md"
                style={{ backgroundColor: primaryColor }}
              >
                {resolvedTenant.name.charAt(0)}
              </div>
            )}
            <div>
              <span className="font-bold text-lg text-gray-900 dark:text-white block leading-tight">
                {resolvedTenant.name}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t.brandName}
              </span>
            </div>
          </div>

          {/* Controls: Language Selector & CTA */}
          <div className="flex items-center space-x-4 rtl:space-x-reverse">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as any)}
              aria-label={t.selectLanguage}
              className="p-2 bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {supportedLanguages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>

            <a
              href="#intake-form"
              className="hidden sm:inline-flex items-center px-4 py-2 text-sm font-semibold rounded-xl text-white shadow-md hover:opacity-90 transition"
              style={{ backgroundColor: primaryColor }}
            >
              {t.inquireNow}
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 bg-gradient-to-b from-indigo-50/50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Hero Text */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left rtl:lg:text-right">
              <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                {t.heroBadge}
              </span>
              <h1 className="text-3xl sm:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight leading-tight">
                {t.heroTitle}
              </h1>
              <p className="text-base sm:text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto lg:mx-0">
                {t.heroSubtitle}
              </p>

              <div className="pt-2 flex flex-wrap justify-center lg:justify-start rtl:lg:justify-end gap-4">
                <a
                  href="#intake-form"
                  className="px-8 py-4 rounded-xl text-white font-bold shadow-lg hover:opacity-90 transition text-base"
                  style={{ backgroundColor: primaryColor }}
                >
                  {t.getStartedBtn}
                </a>
                <a
                  href="#process"
                  className="px-6 py-4 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 transition text-base"
                >
                  {t.learnMoreBtn}
                </a>
              </div>
            </div>

            {/* Form Container */}
            <div id="intake-form" className="lg:col-span-5 scroll-mt-24">
              <HealthTourismIntakeForm
                tenantSlug={resolvedTenant.slug}
                t={t}
                activeLanguage={language}
                onLanguageChange={setLanguage}
                sourceChannel={sourceChannel}
                referringAgencyId={referringAgencyId}
                isRtl={isRtl}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Trust & Process Section */}
      <section id="process" className="py-16 bg-white dark:bg-slate-800/50 border-t border-b border-gray-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">
              {t.processSectionTitle}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {t.processSectionSubtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 text-center">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                1
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                {t.step1Title}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                {t.step1Desc}
              </p>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 text-center">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                2
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                {t.step2Title}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                {t.step2Desc}
              </p>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 text-center">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                3
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                {t.step3Title}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                {t.step3Desc}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Clinic Profile & Location Section */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-8 shadow-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                  {t.aboutClinicTitle}: {resolvedTenant.name}
                </h2>
                {businessProfile?.description && (
                  <p className="text-gray-600 dark:text-gray-300 text-sm mb-6 leading-relaxed">
                    {businessProfile.description}
                  </p>
                )}

                {businessProfile?.address && (
                  <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      📍 {t.addressLabel}:
                    </p>
                    <p className="text-gray-600 dark:text-gray-400">
                      {businessProfile.address}
                    </p>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        `${resolvedTenant.name} ${businessProfile.address}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline mt-2"
                    >
                      {t.getDirectionsBtn} →
                    </a>
                  </div>
                )}
              </div>

              {businessProfile?.phone && (
                <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded-xl border border-gray-200 dark:border-slate-700">
                  <h3 className="font-bold text-gray-900 dark:text-white mb-3">
                    {t.contactTitle}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    📞 {businessProfile.phone}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-gray-500 dark:text-gray-400 space-y-2">
          <p>
            {resolvedTenant.branding?.footerText || `${resolvedTenant.name}. All rights reserved.`}
          </p>
          <p>
            © {new Date().getFullYear()} {t.footerCopyright} {t.footerRights}
          </p>
        </div>
      </footer>
    </div>
  );
};
