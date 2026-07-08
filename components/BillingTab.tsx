import { launchModeService } from '../services/launchModeService';
import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { useTenant } from '../contexts/TenantContext';
import { subscriptionService, TenantSubscription, TenantUsage } from '../services/subscriptionService';
import { planService, PricingPlan } from '../services/planService';
import { resolvePaymentCta } from '../utils/paymentCtaResolver';
import { CheckoutPreviewModal } from './CheckoutPreviewModal';

const BillingTab: React.FC = () => {
  const { language } = useLanguage();
  const t = translations[language];
  const { tenant } = useTenant();
  const [subscription, setSubscription] = useState<TenantSubscription | null>(null);
  const [currentPlan, setCurrentPlan] = useState<PricingPlan | null>(null);
  const [usage, setUsage] = useState<TenantUsage | null>(null);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  
  const [previewPlan, setPreviewPlan] = useState<PricingPlan | null>(null);
  const [platformLedgers, setPlatformLedgers] = useState<any[]>([]);

  useEffect(() => {
    // Check for callback parameters from payment provider
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    if (urlParams.get('checkout') === 'cancelled') {
        const trLang = translations[language || 'tr']?.billing as any;
        setCheckoutError(trLang?.checkout_cancelled_msg || 'Güvenli ödeme işlemi iptal edildi.');
        window.history.replaceState(null, '', window.location.pathname + window.location.search + '#/admin?tab=abonelik');
    }
    if (urlParams.get('checkout') === 'success') {
        const trLang = translations[language || 'tr']?.billing as any;
        setCheckoutMessage(trLang?.checkout_success_msg || 'Ödeme başarıyla tamamlandı. Aboneliğiniz güncellendi.');
        window.history.replaceState(null, '', window.location.pathname + window.location.search + '#/admin?tab=abonelik');
        
        // Handle referral mapping on checkout success
        if (tenant?.id) {
          import('../services/referralProgramService').then(({ referralProgramService }) => {
            referralProgramService.markReferralTrialStarted(tenant.id);
          });
        }
    }
    if (urlParams.get('checkout_simulate') === 'true') {
        setCheckoutMessage('Ödeme başarıyla doğrulandı.');
        window.history.replaceState(null, '', window.location.pathname + window.location.search + '#/admin?tab=abonelik');
        
        // Handle referral mapping on checkout success
        if (tenant?.id) {
          import('../services/referralProgramService').then(({ referralProgramService }) => {
            referralProgramService.markReferralTrialStarted(tenant.id);
          });
        }
    }
    
    if (tenant) {
      loadBillingData();
      import('../services/referralProgramService').then(({ referralProgramService }) => {
        setPlatformLedgers(referralProgramService.listReferralRewards(tenant.id));
      });
    }
  }, [tenant]);

  const loadBillingData = async () => {
    if (!tenant) return;
    setLoading(true);
    
    const sub = await subscriptionService.getCurrentSubscription(tenant.id);
    setSubscription(sub);
    
    const plan = await subscriptionService.getPlanForTenant(tenant.id);
    setCurrentPlan(plan);
    
    const currentUsage = await subscriptionService.getTenantUsage(tenant.id);
    setUsage(currentUsage);
    
    setPlans(planService.getActivePlans());
    
    setLoading(false);
  };

  const handleCheckout = async (planId: string) => {
    if (!tenant) return;
    setCheckoutError(null);

    const isMock = (import.meta as any).env.VITE_PAYMENT_PROVIDER === 'mock' || !(import.meta as any).env.VITE_PAYMENT_PROVIDER;

    // Presentation mode block
    if (isMock) {
        const selected = plans.find(p => p.id === planId);
        if (selected) setPreviewPlan(selected);
        return;
    }

    const testValidation = (await import('../services/paymentSandboxTestService')).paymentSandboxTestService.validatePlanReferenceCodes(planId);
    if (!testValidation.valid) {
        setCheckoutError(translations[language || 'tr']?.billing?.checkout_error_missing_ref || 'Bu paket için ödeme sağlayıcı referans kodları eksik.');
        return;
    }

    try {
      const url = await subscriptionService.startCheckout(tenant.id, planId);
      if (url) {
        window.location.href = url;
      }
    } catch (err: any) {
       console.error("Checkout failed", err);
       setCheckoutError(err.message || translations[language || 'tr']?.billing?.checkout_failed_default || 'Ödeme oturumu başlatılırken bir hata oluştu.');
    }
  };

  const handleBillingPortal = async () => {
    if (!tenant) return;
    await subscriptionService.openBillingPortal(tenant.id);
  };

  const handleConfirmMockCheckout = async () => {
    if (!tenant || !previewPlan) return;
    try {
      await subscriptionService.startTrialAfterCheckout(tenant.id);
      const updated = await subscriptionService.upgradePlanNow(tenant.id, previewPlan.id);
      setSubscription(updated);
      setCurrentPlan(previewPlan);
      setCheckoutMessage(language === 'tr' 
        ? `Kart doğrulama adımı başarıyla tamamlandı. ${previewPlan.name} planı için 14 günlük deneme süreniz aktiftir.` 
        : `Verification successful. Your 14-day trial of ${previewPlan.name} is now active.`);
      setPreviewPlan(null);
    } catch (e: any) {
      setCheckoutError(e.message);
      setPreviewPlan(null);
    }
  };

  const handlePause = async () => {
    if (!tenant) return;
    try {
      const updated = await subscriptionService.pauseSubscription(tenant.id, "Kullanıcı talebiyle duraklatıldı");
      setSubscription(updated);
      setCheckoutMessage(language === 'tr'
        ? "Online randevularınız geçici olarak dondurulmuştur."
        : "Online booking is temporarily paused.");
    } catch (e: any) {
      setCheckoutError(e.message);
    }
  };

  const handleResume = async () => {
    if (!tenant) return;
    try {
      const updated = await subscriptionService.resumeSubscription(tenant.id);
      setSubscription(updated);
      setCheckoutMessage(language === 'tr'
        ? "Aboneliğiniz yeniden aktif edilmiştir. Rezervasyon sayfanız yayındadır."
        : "Subscription has been resumed. Your public page is live.");
    } catch (e: any) {
      setCheckoutError(e.message);
    }
  };

  const handleCancelAtPeriodEnd = async () => {
    if (!tenant) return;
    try {
      const updated = await subscriptionService.cancelAtPeriodEnd(tenant.id);
      setSubscription(updated);
      setCheckoutMessage(language === 'tr'
        ? "İptal talebi oluşturuldu. Mevcut fatura dönemi bitene kadar özellikleri kullanmaya devam edebilirsiniz."
        : "Cancellation scheduled for period end. Features remain active until then.");
    } catch (e: any) {
      setCheckoutError(e.message);
    }
  };

  const handleCancelImmediately = async () => {
    if (!tenant) return;
    try {
      const updated = await subscriptionService.cancelImmediately(tenant.id);
      setSubscription(updated);
      setCheckoutMessage(language === 'tr'
        ? "Aboneliğiniz anında kapatılmış/sonlandırılmıştır."
        : "Subscription has been terminated immediately.");
    } catch (e: any) {
      setCheckoutError(e.message);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">{translations[language || 'tr']?.billing?.loading || 'Yükleniyor...'}</div>;
  }

  return (
    <div className="space-y-8">
      {/* Launch Mode Notice */}
      {!launchModeService.isOnlinePaymentEnabled() && (
        <div className="bg-indigo-50 dark:bg-indigo-950/20 border-l-4 border-indigo-500 p-5 rounded-r-xl shadow-sm">
          <div className="flex gap-3">
            <span className="text-xl">ℹ️</span>
            <div>
              <h4 className="font-bold text-indigo-900 dark:text-indigo-300 text-sm md:text-base">
                {language === 'tr' ? 'Çevrimdışı Faturalandırma Aktif' : 'Offline Billing Active'}
              </h4>
              <p className="text-indigo-700 dark:text-indigo-400 text-xs md:text-sm mt-1">
                {language === 'tr' 
                  ? 'LARİ şu anda çevrimdışı ve manuel faturalandırma modundadır (limited_live_manual_billing). Aylık paket yenilemeleri, elden tahsilat veya banka havalesi sonrasında Süper Admin tarafından gerçekleştirilir. Online ödeme altyapısı daha sonra entegre edilecektir.'
                  : 'LARİ is currently in offline and manual billing mode. Monthly renewals are performed by the Super Admin after cash or bank transfer confirmation. Online payments will be enabled later.'}
              </p>
            </div>
          </div>
        </div>
      )}
      {/* Current Status */}
      <div className="bg-white dark:bg-slate-800 shadow-sm rounded-lg border border-gray-200 dark:border-slate-700 p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">{t.billing.current_subscription_status}</h2>

        {checkoutError && (
          <div className="mb-6 bg-red-50 border border-red-500 p-4 rounded-md">
            <h3 className="text-red-900 font-bold">{t.billing.checkout_failed}</h3>
            <p className="text-red-800 text-sm mt-1">{checkoutError}</p>
          </div>
        )}

        {checkoutMessage && (
          <div className="mb-6 bg-green-50 border border-green-500 p-4 rounded-md">
            <h3 className="text-green-900 font-bold">{(t.billing as any).checkout_success || 'Başarılı'}</h3>
            <p className="text-green-800 text-sm mt-1">{checkoutMessage}</p>
          </div>
        )}

        {/* Dynamic State Banners */}
        {subscription?.status === 'pending_checkout' && (
          <div className="mb-6 bg-amber-50 dark:bg-amber-950/20 border-l-4 border-amber-500 p-4 rounded-r-md">
            <h3 className="text-amber-800 dark:text-amber-300 font-medium text-sm md:text-base">
              {language === 'tr' ? 'Kart Doğrulaması Bekleniyor' : 'Card Verification Pending'}
            </h3>
            <p className="text-amber-700 dark:text-amber-400 text-xs md:text-sm mt-1">
              {language === 'tr' ? '14 günlük denemenizi başlatmak ve sayfanızı yayına hazırlamak için lütfen güvenli kart doğrulama adımını tamamlayın.' : 'Please complete the secure card verification step to start your 14-day free trial.'}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-2 italic">
              {language === 'tr' ? 'Güvenli ödeme sağlayıcısı üzerinden doğrulama yapılır.' : 'Verification is performed securely through our checkout provider.'}
            </p>
            <button 
              onClick={handleBillingPortal}
              className="mt-3 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-md font-medium text-xs transition-colors"
            >
              {language === 'tr' ? 'Kart Doğrulama Adımına Git' : 'Go to Card Auth'}
            </button>
          </div>
        )}

        {subscription?.status === 'trialing' && subscription?.trialEnd && (
          <div className="mb-6 bg-blue-50 dark:bg-blue-950/20 border-l-4 border-blue-500 p-4 rounded-r-md">
            <h3 className="text-blue-800 dark:text-blue-300 font-medium text-sm md:text-base">
              {language === 'tr' ? '14 Günlük Deneme Aktif' : '14-Day Free Trial Active'}
            </h3>
            <p className="text-blue-700 dark:text-blue-400 text-xs md:text-sm mt-1">
              {language === 'tr' 
                ? `Deneme süreniz ${new Date(subscription.trialEnd).toLocaleDateString()} tarihinde sona erecektir. Bu sürenin sonuna kadar herhangi bir kesinti ya da ücretlendirme yapılmaz.` 
                : `Your trial will end on ${new Date(subscription.trialEnd).toLocaleDateString()}. No charges will be made before this date.`}
            </p>
          </div>
        )}

        {subscription?.status === 'active' && (
          <div className="mb-6 bg-emerald-50 dark:bg-emerald-950/20 border-l-4 border-emerald-500 p-4 rounded-r-md">
            <h3 className="text-emerald-800 dark:text-emerald-300 font-medium text-sm md:text-base">
              {language === 'tr' ? 'Aktif Abonelik (Güvende)' : 'Subscription Active (Secure)'}
            </h3>
            <p className="text-emerald-700 dark:text-emerald-400 text-xs md:text-sm mt-1">
              {language === 'tr' 
                ? 'Aboneliğiniz başarıyla doğrulanmış ve aktiftir. Tüm sistem özellikleri, randevu entegrasyonu ve rezervasyon sayfası kesintisiz olarak çalışmaktadır.' 
                : 'Your subscription is successfully verified and active. All services are fully operational.'}
            </p>
          </div>
        )}

        {subscription?.status === 'manual_active' && (
          <div className="mb-6 bg-indigo-50 dark:bg-indigo-950/20 border-l-4 border-indigo-500 p-4 rounded-r-md">
            <h3 className="text-indigo-800 dark:text-indigo-300 font-medium text-sm md:text-base">
              🔒 {language === 'tr' ? 'Manuel Olarak Aktif Edildi' : 'Manually Activated'}
            </h3>
            <p className="text-indigo-700 dark:text-indigo-400 text-xs md:text-sm mt-1">
              {language === 'tr' 
                ? 'Hesabınız Super Admin tarafından özel bir anlaşma veya manuel ödeme yöntemiyle aktif edilmiştir.' 
                : 'Your account has been manually activated by the Super Admin.'}
            </p>
          </div>
        )}

        {subscription?.status === 'comped' && (
          <div className="mb-6 bg-purple-50 dark:bg-purple-950/20 border-l-4 border-purple-500 p-4 rounded-r-md">
            <h3 className="text-purple-800 dark:text-purple-300 font-medium text-sm md:text-base">
              🎁 {language === 'tr' ? 'Hediye / Pilot İstisnası Kullanımı' : 'Complimentary / Pilot Access'}
            </h3>
            <p className="text-purple-700 dark:text-purple-400 text-xs md:text-sm mt-1">
              {language === 'tr' 
                ? 'İşletmeniz destek programımız, pilot ortaklık veya hediye lisans kapsamında değerlendirilmiştir. Tüm paket imkanlarından sınırsızca yararlanabilirsiniz.' 
                : 'Your business has been designated for our complimentary or pilot group.'}
            </p>
          </div>
        )}

        {subscription?.status === 'past_due' && (
          <div className="mb-6 bg-rose-50 dark:bg-rose-950/20 border-l-4 border-rose-500 p-4 rounded-r-md">
            <h3 className="text-rose-800 dark:text-rose-300 font-medium text-sm md:text-base">
              ⚠️ {language === 'tr' ? 'Ödeme Bekleniyor (Önemli)' : 'Payment Pending / Past Due'}
            </h3>
            <p className="text-rose-700 dark:text-rose-400 text-xs md:text-sm mt-1">
              {language === 'tr' 
                ? 'Son faturaya ait ödeme tamamlanamamıştır. Randevu alımının aksamaması için lütfen ödeme bilgilerinizi güncelleyin.' 
                : 'Your last invoice payment is pending. Please update your billing details.'}
            </p>
          </div>
        )}

        {subscription?.status === 'paused' && (
          <div className="mb-6 bg-slate-100 dark:bg-slate-900 border-l-4 border-slate-500 p-4 rounded-r-md">
            <h3 className="text-slate-800 dark:text-slate-200 font-medium text-sm md:text-base">
              ⏸️ {language === 'tr' ? 'Abonelik Duraklatıldı / Donduruldu' : 'Subscription Paused'}
            </h3>
            <p className="text-slate-700 dark:text-slate-300 text-xs md:text-sm mt-1">
              {language === 'tr' 
                ? 'Talep üzerine online randevu alımı geçici olarak duraklatılmıştır. "Yeniden Aktif Et" butonu ile tekrar rezervasyon alımını açabilirsiniz.' 
                : 'At your request, online booking services are temporarily frozen.'}
            </p>
          </div>
        )}

        {subscription?.status === 'suspended' && (
          <div className="mb-6 bg-red-50 dark:bg-red-950/20 border-l-4 border-red-500 p-4 rounded-r-md">
            <h3 className="text-red-800 dark:text-red-300 font-medium text-sm md:text-base">
              🚫 {language === 'tr' ? 'Hesap Askıya Alındı' : 'Account Suspended'}
            </h3>
            <p className="text-red-700 dark:text-red-400 text-xs md:text-sm mt-1">
              {language === 'tr' 
                ? 'Hesabınız güvenlik, risk veya idari değerlendirme sebebiyle askıya alınmıştır. Lütfen destek ekibimizle iletişime geçin.' 
                : 'Your account has been suspended for risk or compliance reasons. Please contact support.'}
            </p>
          </div>
        )}

        {subscription?.cancelAtPeriodEnd && (
          <div className="mb-6 bg-orange-50 dark:bg-orange-950/20 border-l-4 border-orange-500 p-4 rounded-r-md">
            <h3 className="text-orange-800 dark:text-orange-300 font-medium text-sm md:text-base">
              📅 {language === 'tr' ? 'Dönem Sonunda İptal Edilecek' : 'Cancelled at Period End'}
            </h3>
            <p className="text-orange-700 dark:text-orange-400 text-xs md:text-sm mt-1">
              {language === 'tr' 
                ? `İptal talebi mevcuttur. Aboneliğiniz ${subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : 'dönem sonu'} tarihine kadar aktif kalacak, yeni dönemde yenilenmeyecektir.` 
                : `Your subscription is scheduled for cancellation and remains active until ${subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : 'period end'}.`}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            {platformLedgers.length > 0 && (
               <div className="mb-6 bg-indigo-50 border border-indigo-200 p-4 rounded-xl">
                  <div className="flex items-center gap-3 mb-2">
                     <span className="bg-indigo-600 text-white p-1.5 rounded-lg">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                        </svg>
                     </span>
                     <h3 className="font-bold text-indigo-900">{language === 'tr' ? 'Referans Ödülleri' : 'Referral Rewards'}</h3>
                  </div>
                  <p className="text-sm text-indigo-800">
                     {language === 'tr' 
                        ? `Toplam ${platformLedgers.reduce((acc, curr) => acc + curr.monthsGranted, 0)} ay ücretsiz kullanım tanımlandı. Sonraki faturanızdan düşülecektir.` 
                        : `Total of ${platformLedgers.reduce((acc, curr) => acc + curr.monthsGranted, 0)} free months granted. Will be applied to next cycle.`}
                  </p>
               </div>
            )}

            {subscription && (subscription.referralCredits || subscription.discountType) ? (
              <div className="mb-6 p-4 bg-indigo-50/50 dark:bg-indigo-950/10 border border-indigo-100 dark:border-indigo-900/30 rounded-xl space-y-2">
                <span className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">🌟 Tanımlı İndirimler & Ödüller</span>
                {subscription.referralCredits && subscription.referralCredits > 0 ? (
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-normal">
                    Referans Ödülü: <strong>{subscription.referralCredits} Ay Ücretsiz Kullanım</strong> {language === 'tr' ? 'tanımlandı.' : 'granted.'}
                  </p>
                ) : null}
                {subscription.discountType ? (
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-normal">
                    Faturadan Düşülecek İndirim: <strong>{subscription.discountType === 'percentage' ? `%${subscription.discountValue}` : `₺${subscription.discountValue}`}</strong>
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mb-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">{t.billing.active_plan}</p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{currentPlan?.name || t.billing.plan_free_trial}</p>
                {subscription?.scheduledPlanId && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full font-medium">
                    {language === 'tr' ? `Dönem sonu geçiş: ${subscription.scheduledPlanId}` : `Scheduled migration: ${subscription.scheduledPlanId}`}
                  </span>
                )}
              </div>
            </div>
            <div className="mb-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">{t.billing.status}</p>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase ${
                  subscription?.status === 'active' ? 'bg-green-100 text-green-800' :
                  subscription?.status === 'trialing' ? 'bg-blue-100 text-blue-800' :
                  subscription?.status === 'pending_checkout' ? 'bg-yellow-101 text-yellow-800 bg-yellow-100' :
                  subscription?.status === 'past_due' ? 'bg-red-100 text-red-800' :
                  subscription?.status === 'paused' ? 'bg-slate-100 text-slate-800' :
                  subscription?.status === 'suspended' ? 'bg-red-200 text-red-900' :
                  subscription?.status === 'comped' ? 'bg-purple-100 text-purple-800' :
                  subscription?.status === 'manual_active' ? 'bg-indigo-100 text-indigo-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {subscription?.status === 'pending_checkout' 
                    ? (language === 'tr' ? 'Doğrulama Bekliyor' : 'Pending Auth') 
                    : (subscription ? t.billing[subscription.status] || subscription.status : t.billing.unknown)}
                </span>
                {subscription?.paymentProvider && (
                  <span className="text-xs uppercase font-mono text-gray-400">
                    ({subscription.paymentProvider.replace('_', ' ')})
                  </span>
                )}
              </div>
            </div>
            <div className="mb-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">{t.billing.monthly_amount}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">₺{currentPlan?.monthlyPrice || 0}</p>
              <p className="text-xs text-gray-500">{t.billing.setup_fee_note?.replace('{fee}', String(currentPlan?.setupFee || 0))}</p>
            </div>

            {!launchModeService.isOnlinePaymentEnabled() && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700 space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  {language === 'tr' ? '✍️ Çevrimdışı Aktivasyon & Manuel Yönetim Bilgileri' : '✍️ Offline Activation & Manual Management Info'}
                </span>

                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl p-4 space-y-2 text-xs text-amber-900 dark:text-amber-300">
                  <p className="font-semibold">
                    {language === 'tr' ? 'Platform ve Abonelik Yönetim Bildirimi:' : 'Platform and Subscription Notice:'}
                  </p>
                  <ul className="list-disc pl-4 space-y-1 leading-relaxed">
                    {language === 'tr' ? (
                      <>
                        <li>Hesabınız LARİ ekibi tarafından manuel aktive edilir.</li>
                        <li>Online ödeme devreye alınana kadar abonelik yönetimi manuel yürütülür.</li>
                        <li>Platform altyapısı, kaynak kodları ve Super Admin yönetimi LARİ’ye aittir.</li>
                        <li>Salon sahibi yalnızca kendi işletme paneline ve müşterileri için rezervasyon sayfasına erişir.</li>
                      </>
                    ) : (
                      <>
                        <li>Your account is activated manually by the LARİ team.</li>
                        <li>Until online payments are active, subscription management is handled manually.</li>
                        <li>The platform infrastructure, source code, and Super Admin control belong to LARİ.</li>
                        <li>The salon owner only has access to their specific business panel and booking link.</li>
                      </>
                    )}
                  </ul>
                </div>
                
                {subscription?.paidThroughDate && (
                  <div className="text-xs pt-1">
                    <span className="text-gray-500">{language === 'tr' ? 'Ödenen Son Tarih: ' : 'Paid Through Date: '}</span>
                    <strong className="text-gray-800 dark:text-slate-200">{new Date(subscription.paidThroughDate).toLocaleDateString()}</strong>
                  </div>
                )}
                
                {subscription?.manualActivationReason && (
                  <div className="text-xs">
                    <span className="text-gray-500">{language === 'tr' ? 'Aktivasyon Gerekçesi: ' : 'Activation Reason: '}</span>
                    <strong className="text-gray-800 dark:text-slate-200">{subscription.manualActivationReason}</strong>
                  </div>
                )}

                {subscription?.paymentReferenceNote && (
                  <div className="text-xs">
                    <span className="text-gray-500">{language === 'tr' ? 'Ödeme / Dekont Referansı: ' : 'Payment / Slip Ref: '}</span>
                    <strong className="text-gray-800 dark:text-slate-200">{subscription.paymentReferenceNote}</strong>
                  </div>
                )}

                {subscription?.nextManualReviewAt && (
                  <div className="text-xs">
                    <span className="text-gray-500">{language === 'tr' ? 'Sonraki Manuel Kontrol: ' : 'Next Manual Review: '}</span>
                    <strong className="text-gray-800 dark:text-slate-200">{new Date(subscription.nextManualReviewAt).toLocaleDateString()}</strong>
                  </div>
                )}
              </div>
            )}

            {/* Quick Management Actions for Business Owners */}
            {subscription && (
              <div className="mt-6 border-t border-gray-100 dark:border-slate-700 pt-4 space-y-3">
                <p className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 tracking-wider">
                  {language === 'tr' ? 'Abonelik İşlemleri' : 'Subscription Controls'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {subscription.status === 'paused' ? (
                    <button
                      onClick={handleResume}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer"
                    >
                      {language === 'tr' ? '▶️ Sayfayı Yayına Al' : '▶️ Resume System / Online'}
                    </button>
                  ) : (
                    ['active', 'trialing', 'manual_active', 'comped'].includes(subscription.status) && (
                      <button
                        onClick={handlePause}
                        className="bg-zinc-600 hover:bg-zinc-700 text-white text-xs px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer"
                      >
                        {language === 'tr' ? '⏸️ Rezervasyonu Geçici Durdur' : '⏸️ Freeze Online Booking'}
                      </button>
                    )
                  )}

                  {!subscription.cancelAtPeriodEnd && ['active', 'trialing', 'manual_active', 'comped', 'past_due'].includes(subscription.status) && (
                    <>
                      <button
                        onClick={handleCancelAtPeriodEnd}
                        className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer"
                      >
                        {language === 'tr' ? '📅 Dönem Sonunda İptal Et' : '📅 Cancel at Period End'}
                      </button>
                      <button
                        onClick={handleCancelImmediately}
                        className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer"
                      >
                        {language === 'tr' ? '📴 Hemen Sonlandır' : '📴 Deactivate Now'}
                      </button>
                    </>
                  )}

                  {subscription.cancelAtPeriodEnd && (
                    <button
                      onClick={handleResume}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer"
                    >
                      {language === 'tr' ? '🔄 İptali Geri Çek' : '🔄 Recede Cancellation'}
                    </button>
                  )}
                </div>
              </div>
            )}
            
            <div className="flex gap-4 mt-6">
              <button 
                onClick={handleBillingPortal}
                className="bg-white text-gray-700 border border-gray-300 dark:bg-slate-700 dark:text-white dark:border-slate-600 px-4 py-2 rounded-md font-medium text-sm hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
              >
                {t.billing.billing_portal_btn}
              </button>
              <button 
                onClick={() => window.open(`https://wa.me/${(import.meta as any).env.VITE_SALES_WHATSAPP_NUMBER || ''}`, '_blank')}
                className="bg-white text-gray-700 border border-gray-300 dark:bg-slate-700 dark:text-white dark:border-slate-600 px-4 py-2 rounded-md font-medium text-sm hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
              >
                {t.billing.talk_to_sales_btn}
              </button>
            </div>
          </div>
          
          <div className="bg-gray-50 dark:bg-slate-900 p-4 rounded-lg border border-gray-200 dark:border-slate-700">
             <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t.billing.usage_limits}</h3>
             
             <div className="mb-4">
               <div className="flex justify-between text-sm mb-1">
                 <span className="text-gray-600 dark:text-gray-400">{t.billing.staff_count}</span>
                 <span className="text-gray-900 dark:text-white">{usage?.staffCount} / {currentPlan?.maxStaff === 999 ? t.billing.unlimited : currentPlan?.maxStaff}</span>
               </div>
               <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                 <div className="bg-accent h-2 rounded-full" style={{ width: `${Math.min(100, ((usage?.staffCount || 0) / (currentPlan?.maxStaff || 1)) * 100)}%` }}></div>
               </div>
             </div>

             <div className="mb-4">
               <div className="flex justify-between text-sm mb-1">
                 <span className="text-gray-600 dark:text-gray-400">{t.billing.services_count}</span>
                 <span className="text-gray-900 dark:text-white">{usage?.serviceCount} / {currentPlan?.maxServices === 999 ? t.billing.unlimited : currentPlan?.maxServices}</span>
               </div>
               <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                 <div className="bg-accent h-2 rounded-full" style={{ width: `${Math.min(100, ((usage?.serviceCount || 0) / (currentPlan?.maxServices || 1)) * 100)}%` }}></div>
               </div>
             </div>

             <div className="mb-4">
               <div className="flex justify-between text-sm mb-1">
                 <span className="text-gray-600 dark:text-gray-400">{t.billing.monthly_apts_count}</span>
                 <span className="text-gray-900 dark:text-white">{usage?.monthlyAppointmentsCount} / {currentPlan?.maxMonthlyAppointments === 99999 ? t.billing.unlimited : currentPlan?.maxMonthlyAppointments}</span>
               </div>
               <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                 <div className="bg-green-500 h-2 rounded-full" style={{ width: `${Math.min(100, ((usage?.monthlyAppointmentsCount || 0) / (currentPlan?.maxMonthlyAppointments || 1)) * 100)}%` }}></div>
               </div>
             </div>

             {currentPlan?.aiRecommendationsEnabled && (
               <div className="mb-4">
                 <div className="flex justify-between text-sm mb-1">
                   <span className="text-gray-600 dark:text-gray-400">{t.billing.ai_quota}</span>
                   <span className="text-gray-900 dark:text-white">{usage?.aiUsageCount} / {currentPlan?.aiMonthlyQuota || t.billing.unlimited}</span>
                 </div>
                 <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                   <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${currentPlan?.aiMonthlyQuota ? Math.min(100, ((usage?.aiUsageCount || 0) / currentPlan.aiMonthlyQuota) * 100) : 0}%` }}></div>
                 </div>
               </div>
             )}
          </div>
        </div>
      </div>

      {/* Pricing Plans */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">{t.billing.upgrade_plan_title}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map(plan => (
            <div key={plan.id} className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border p-6 flex flex-col ${currentPlan?.id === plan.id ? 'border-accent shadow-md relative' : 'border-gray-200 dark:border-slate-700'}`}>
              
              {currentPlan?.id === plan.id && (
                 <span className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-accent text-white text-xs font-bold px-3 py-1 rounded-full uppercase">
                   {t.billing.current_plan_badge}
                 </span>
              )}

              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{plan.name}</h3>
              <div className="mb-4">
                <span className="text-3xl font-extrabold text-gray-900 dark:text-white">₺{plan.monthlyPrice}</span>
                <span className="text-gray-500 dark:text-gray-400">{t.billing.per_month}</span>
              </div>
              <p className="text-sm text-gray-500 mb-6">{t.billing.setup_fee_note_plain?.replace('{fee}', String(plan.setupFee))}</p>
              
              <ul className="space-y-3 mb-8 flex-1">
                <li className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                  {plan.maxStaff === 999 ? t.billing.unlimited : plan.maxStaff} {t.billing.staff_count}
                </li>
                <li className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                  {plan.maxServices === 999 ? t.billing.unlimited : plan.maxServices} {t.billing.services_count}
                </li>
                <li className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                  {t.billing.monthly_apts_count}: {plan.maxMonthlyAppointments === 99999 ? t.billing.unlimited : plan.maxMonthlyAppointments}
                </li>
                {plan.customDomainEnabled && (
                  <li className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                    <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                    {t.billing.manual_domain_support}
                  </li>
                )}
                <li className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                  <svg className={`w-5 h-5 mr-2 flex-shrink-0 ${plan.aiRecommendationsEnabled ? 'text-green-500' : 'text-gray-300'}`} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                  {t.billing.ai_analysis_support}
                </li>
              </ul>
              
              {(() => {
                const ctaConfig = resolvePaymentCta({
                  paymentMode: ((import.meta as any).env.VITE_PAYMENT_PROVIDER as any) || 'mock',
                  plan,
                  currentSubscriptionPlanId: currentPlan?.id,
                  subscriptionStatus: subscription?.status as any,
                  language: (language === 'tr' ? 'tr' : 'en')
                });

                return (
                  <div className="mt-auto space-y-3">
                    {ctaConfig.safetyMessage && (
                      <p className="text-xs text-yellow-600 dark:text-yellow-500 text-center">{ctaConfig.safetyMessage}</p>
                    )}
                    <button 
                      onClick={
                        ctaConfig.actionType === 'talk_to_sales' 
                          ? () => window.open(`https://wa.me/${(import.meta as any).env.VITE_SALES_WHATSAPP_NUMBER || ''}?text=Merhaba, ${plan.name} planına geçmek / abonelik başlatmak istiyorum.`, '_blank')
                          : () => handleCheckout(plan.id)
                      }
                      disabled={ctaConfig.disabled}
                      className={`w-full py-3 px-4 rounded-md font-bold text-center transition-colors ${
                        ctaConfig.disabled
                          ? 'bg-gray-100 dark:bg-slate-700 text-gray-400 cursor-not-allowed' 
                          : 'bg-accent text-white hover:bg-blue-600'
                      }`}
                    >
                      {ctaConfig.label}
                    </button>
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      </div>
      <CheckoutPreviewModal isOpen={!!previewPlan} onClose={() => setPreviewPlan(null)} onConfirm={handleConfirmMockCheckout} plan={previewPlan} />
    </div>
  );
};

export default BillingTab;
