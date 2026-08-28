import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams, useLocation, Link } from 'react-router-dom';
import { tenantService } from '../../services/tenantService';
import { businessProfileService } from '../../services/businessProfileService';
import { Tenant, TenantBranding, SalonBusinessProfile } from '../../types';
import { useHealthTourismLanguage } from '../../hooks/useHealthTourismLanguage';
import { HealthTourismIntakeForm } from '../../components/health-tourism/HealthTourismIntakeForm';
import { HtAiChatWidget } from '../../components/health-tourism/HtAiChatWidget';
import { extractSourceChannel, extractReferringAgencyId, hasInvalidAgencyReferral } from '../../utils/sourceAttributionHelper';
import { HtLanguage } from '../../types/healthTourismPublic';

export const HealthTourismLandingPage: React.FC = () => {
  const { tenantSlug: routeSlug } = useParams<{ tenantSlug?: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const { language, setLanguage, t, isRtl, supportedLanguages } = useHealthTourismLanguage();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const [businessProfile, setBusinessProfile] = useState<SalonBusinessProfile | null>(null);
  const [isLoadingTenant, setIsLoadingTenant] = useState<boolean>(true);
  const [tenantError, setTenantError] = useState<'not_found' | 'suspended' | null>(null);

  // Extract source channel & agency attribution from search params across BrowserRouter and HashRouter
  const sourceChannel = useMemo(() => {
    const fullUrl = window.location.href;
    const ref = typeof document !== 'undefined' ? document.referrer : '';
    return extractSourceChannel(fullUrl, ref);
  }, [location.search, location.hash]);

  const referringAgencyId = useMemo(() => {
    return extractReferringAgencyId(searchParams) || extractReferringAgencyId(location.search);
  }, [searchParams, location.search]);

  const hasInvalidAgency = useMemo(() => {
    return hasInvalidAgencyReferral(searchParams) || hasInvalidAgencyReferral(location.search);
  }, [searchParams, location.search]);

  // Load Tenant, Branding & Public Business Profile
  useEffect(() => {
    let isMounted = true;
    setIsLoadingTenant(true);
    setTenantError(null);

    async function loadTenantData() {
      try {
        let activeTenant: Tenant | null = null;

        if (routeSlug) {
          activeTenant = await tenantService.getTenantBySlug(routeSlug);
        } else {
          activeTenant = await tenantService.resolveTenantFromHost(window.location.hostname);
        }

        if (!isMounted) return;

        if (!activeTenant) {
          setTenantError('not_found');
          setIsLoadingTenant(false);
          return;
        }

        // Active Tenant & Publication Gating
        // 1. Must be status === 'active'
        // 2. If publicSiteStatus exists, it must NOT be suspended, paused, draft, pending_review, or preview_ready
        //    (i.e. if publicSiteStatus is present, it must be 'published')
        const isStatusActive = activeTenant.status === 'active';
        const isVerificationSuspended = activeTenant.verificationStatus === 'suspended';
        
        const hasPublicSiteStatus = Boolean(activeTenant.publicSiteStatus);
        const isPublicSitePublished = activeTenant.publicSiteStatus === 'published';
        
        // Gate logic:
        // Must be active status and not suspended.
        // If publicSiteStatus field is available/present on tenant, require publicSiteStatus === 'published'.
        const isEligible = isStatusActive && !isVerificationSuspended && (!hasPublicSiteStatus || isPublicSitePublished);

        if (!isEligible) {
          setTenantError('suspended');
          setIsLoadingTenant(false);
          return;
        }

        setTenant(activeTenant);

        // Fetch exact tenant branding and canonical public business profile in parallel
        const [tenantBranding, profile] = await Promise.all([
          tenantService.getTenantBranding(activeTenant.id),
          businessProfileService.getPublicBusinessProfile(activeTenant.id),
        ]);

        if (!isMounted) return;
        setBranding(tenantBranding);
        setBusinessProfile(profile);
      } catch (err) {
        if (isMounted) {
          setTenantError('not_found');
        }
      } finally {
        if (isMounted) {
          setIsLoadingTenant(false);
        }
      }
    }

    loadTenantData();

    return () => {
      isMounted = false;
    };
  }, [routeSlug]);

  // Manage HTML Lang, RTL, and SEO Document Meta attributes with unmount restoration
  useEffect(() => {
    const prevLang = document.documentElement.lang;
    const prevDir = document.documentElement.dir;
    const prevTitle = document.title;

    document.documentElement.lang = language;
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.title = t.metaTitle;

    // Update Meta Description
    let metaDesc = document.querySelector('meta[name="description"]');
    const createdMetaDesc = !metaDesc;
    const prevMetaDescContent = metaDesc ? metaDesc.getAttribute('content') : null;

    if (metaDesc) {
      metaDesc.setAttribute('content', t.metaDescription);
    } else {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      metaDesc.setAttribute('content', t.metaDescription);
      document.head.appendChild(metaDesc);
    }

    return () => {
      document.documentElement.lang = prevLang || 'tr';
      document.documentElement.dir = prevDir || 'ltr';
      document.title = prevTitle;

      if (createdMetaDesc && metaDesc && metaDesc.parentNode) {
        metaDesc.parentNode.removeChild(metaDesc);
      } else if (metaDesc && prevMetaDescContent !== null) {
        metaDesc.setAttribute('content', prevMetaDescContent);
      }
    };
  }, [language, isRtl, t.metaTitle, t.metaDescription]);

  // Display fields derivation with fallback precedence
  const displayName = useMemo(() => {
    return businessProfile?.public_display_name || branding?.businessName || tenant?.name || 'LARİ';
  }, [businessProfile, branding, tenant]);

  const displayDescription = useMemo(() => {
    return businessProfile?.short_description || businessProfile?.about_text || null;
  }, [businessProfile]);

  const primaryColor = branding?.primaryColor || '#4f46e5';

  if (isLoadingTenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 text-gray-700 dark:text-gray-300">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-medium">{t.loadingTenantText}</p>
        </div>
      </div>
    );
  }

  if (tenantError === 'not_found') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 px-4">
        <div className="max-w-md w-full text-center bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-700">
          <div className="text-4xl mb-4">🏥</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t.tenantNotFoundTitle}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{t.tenantNotFoundDesc}</p>
          <Link to="/" className="inline-block px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition">
            {t.homeBtn}
          </Link>
        </div>
      </div>
    );
  }

  if (tenantError === 'suspended') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 px-4">
        <div className="max-w-md w-full text-center bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-700">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t.tenantSuspendedTitle}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{t.tenantSuspendedDesc}</p>
          <Link to="/" className="inline-block px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition">
            {t.homeBtn}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-gray-900 dark:text-gray-100 ${isRtl ? 'rtl' : 'ltr'}`}>
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-gray-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            {branding?.logoUrl ? (
              <img src={branding.logoUrl} alt={displayName} className="h-9 w-auto max-w-[140px] object-contain" />
            ) : (
              <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shadow-sm" style={{ backgroundColor: primaryColor }}>
                {displayName.charAt(0)}
              </div>
            )}
            <div>
              <span className="font-bold text-lg text-gray-900 dark:text-white block leading-tight">{displayName}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 block">{t.brandName}</span>
            </div>
          </div>

          {/* Language Selector */}
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <label htmlFor="ht-lang-select" className="sr-only">
              {t.selectLanguage}
            </label>
            <select
              id="ht-lang-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value as HtLanguage)}
              className="py-1.5 px-3 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-indigo-500"
            >
              {supportedLanguages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-16 bg-gradient-to-b from-indigo-900 via-slate-900 to-slate-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center sm:text-left rtl:sm:text-right">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-semibold uppercase tracking-wider mb-6">
            <span>🌍</span>
            <span>{t.heroBadge}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight max-w-3xl mb-4 leading-tight">
            {t.heroTitle}
          </h1>

          <p className="text-base sm:text-lg text-slate-300 max-w-2xl mb-8 leading-relaxed">
            {displayDescription || t.heroSubtitle}
          </p>
        </div>
      </section>

      {/* Process Section */}
      <section className="py-16 bg-white dark:bg-slate-900 border-y border-gray-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              {t.processSectionTitle}
            </h2>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-2">
              {t.processSectionSubtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-center">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl font-bold mx-auto mb-4">
                1
              </div>
              <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">{t.processStep1Title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t.step1Desc}</p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-center">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">{t.processStep2Title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t.step2Desc}</p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-center">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">{t.processStep3Title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t.step3Desc}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Main Intake Form Section */}
      <section id="intake-form-section" className="py-16 max-w-4xl mx-auto px-4 sm:px-6">
        {tenant && (
          <HealthTourismIntakeForm
            tenantSlug={tenant.slug}
            t={t}
            activeLanguage={language}
            onLanguageChange={setLanguage}
            sourceChannel={sourceChannel}
            referringAgencyId={referringAgencyId}
            hasInvalidAgencyWarning={hasInvalidAgency}
            isRtl={isRtl}
          />
        )}
      </section>

      {/* Clinic Info & Location */}
      {businessProfile && (businessProfile.address || businessProfile.google_maps_url || businessProfile.phone) && (
        <section className="py-12 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 text-center sm:text-left rtl:sm:text-right">
              {t.aboutClinicTitle}
            </h2>

            <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl border border-gray-200 dark:border-slate-700 space-y-4">
              {businessProfile.address && (
                <div>
                  <span className="text-xs uppercase tracking-wider text-gray-500 font-bold block mb-1">
                    {t.addressLabel}
                  </span>
                  <p className="text-sm text-gray-800 dark:text-gray-200 font-medium">
                    {businessProfile.address}
                    {businessProfile.district ? `, ${businessProfile.district}` : ''}
                    {businessProfile.city ? `, ${businessProfile.city}` : ''}
                  </p>
                </div>
              )}

              {(businessProfile.google_maps_url || businessProfile.map_embed_url) && (
                <div>
                  <a
                    href={businessProfile.google_maps_url || businessProfile.map_embed_url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-bold border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition"
                  >
                    <span>📍</span>
                    <span>{t.getDirectionsBtn}</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="py-8 bg-slate-900 border-t border-slate-800 text-slate-400 text-xs text-center">
        <div className="max-w-7xl mx-auto px-4">
          <p>
            © {new Date().getFullYear()} {displayName}. {t.footerCopyright} {t.footerRights}
          </p>
        </div>
      </footer>

      {/* AI Chat Widget — only when tenant is loaded */}
      {tenant && businessProfile?.slug && (
        <HtAiChatWidget
          tenantSlug={businessProfile.slug}
          preferredLanguage={language}
          translations={{
            chatTitle: language === 'tr' ? 'Sağlık Turizmi Asistanı' : language === 'de' ? 'Gesundheitstourismus-Assistent' : language === 'ru' ? 'Ассистент медицинского туризма' : language === 'ar' ? 'مساعد السياحة الصحية' : 'Health Tourism Assistant',
            chatPlaceholder: language === 'tr' ? 'Mesajınızı yazın...' : language === 'de' ? 'Nachricht eingeben...' : language === 'ru' ? 'Введите сообщение...' : language === 'ar' ? 'اكتب رسالتك...' : 'Type your message...',
            chatSend: language === 'tr' ? 'Gönder' : language === 'de' ? 'Senden' : language === 'ru' ? 'Отправить' : language === 'ar' ? 'إرسال' : 'Send',
            chatHandoff: language === 'tr' ? 'İnsan koordinatörle görüşün' : language === 'de' ? 'Mit einem Koordinator sprechen' : language === 'ru' ? 'Связаться с координатором' : language === 'ar' ? 'تحدث مع منسق' : 'Talk to a human coordinator',
            chatWelcome: language === 'tr' ? 'Merhaba! Sağlık turizmi süreciniz hakkında sorularınızı yanıtlamak için buradayım.' : language === 'de' ? 'Hallo! Ich bin hier, um Ihre Fragen zum Gesundheitstourismus zu beantworten.' : language === 'ru' ? 'Здравствуйте! Я здесь, чтобы ответить на ваши вопросы о медицинском туризме.' : language === 'ar' ? 'مرحباً! أنا هنا للإجابة على أسئلتكم حول السياحة الصحية.' : 'Hello! I\'m here to answer your questions about health tourism.',
            chatMedicalDisclaimer: language === 'tr' ? 'Bu asistan tıbbi teşhis veya tedavi önerisi sunamaz. Tıbbi sorularınız uzman koordinatörlerimize yönlendirilecektir.' : language === 'de' ? 'Dieser Assistent kann keine medizinische Diagnose oder Behandlungsempfehlung geben.' : language === 'ru' ? 'Этот ассистент не может предоставить медицинский диагноз или рекомендации по лечению.' : language === 'ar' ? 'لا يمكن لهذا المساعد تقديم تشخيص طبي أو توصيات علاجية.' : 'This assistant cannot provide medical diagnosis or treatment recommendations. Medical questions will be directed to our qualified coordinators.',
          }}
        />
      )}
    </div>
  );
};
