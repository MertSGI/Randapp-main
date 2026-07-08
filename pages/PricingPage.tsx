import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { planService, PricingPlan, BillingPeriod } from '../services/planService';
import { launchModeService } from '../services/launchModeService';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';
import { translations } from '../utils/translations';
import { resolvePaymentCta } from '../utils/paymentCtaResolver';
import { FeatureBadge } from '../components/FeatureBadge';

const PricingPage: React.FC = () => {
  const { language } = useLanguage();
  const t = translations[language];
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  
  const { alert: showAlert } = useDialog();
  const paymentMode = ((import.meta as any).env.VITE_PAYMENT_PROVIDER as 'mock' | 'sandbox' | 'production') || 'mock';

  useEffect(() => {
    // Only display active plans
    const activePlans = planService.getActivePlans();
    setPlans(activePlans);
  }, []);

  const hasAnnualDiscount = plans.some(p => p.annualDiscountPercent > 0);

  return (
    <div className="py-12 md:py-16 px-4 max-w-6xl mx-auto">
      <div className="text-center mb-10 md:mb-16">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-4 md:mb-6 dark:text-white tracking-tight">{t.marketing.pricing.title}</h1>
        <p className="text-base sm:text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
          {t.marketing.pricing.subtitle}
        </p>
      </div>

      <div className="flex justify-center mb-10 md:mb-16">
        <div className="bg-gray-100 dark:bg-slate-800 p-1 md:p-1.5 rounded-full inline-flex items-center relative overflow-x-auto max-w-full">
           <button 
             onClick={() => setBillingPeriod('monthly')}
             className={`relative z-10 px-4 md:px-6 py-2.5 md:py-2.5 rounded-full font-bold text-xs md:text-sm transition-colors whitespace-nowrap ${billingPeriod === 'monthly' ? 'text-gray-900 shadow-sm bg-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
           >
             {t.marketing.pricing.monthly}
           </button>
           <button 
             onClick={() => setBillingPeriod('annual')}
             className={`relative z-10 px-4 md:px-6 py-2.5 md:py-2.5 rounded-full font-bold text-xs md:text-sm transition-colors whitespace-nowrap flex items-center ${billingPeriod === 'annual' ? 'text-gray-900 shadow-sm bg-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
           >
             {t.marketing.pricing.annual} 
             {hasAnnualDiscount && <span className="ml-1.5 md:ml-2 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 py-0.5 px-2 rounded-full text-[10px] md:text-xs font-extrabold uppercase tracking-wide">{t.marketing.pricing.annual_discount}</span>}
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 justify-center">
        {plans.map((plan) => {
          const isRecommended = plan.isRecommended;
          const price = planService.calculatePlanPrice(plan.id, billingPeriod);
          const displayPrice = billingPeriod === 'annual' ? (price / 12) : price;
          const trialWording = t.marketing.pricing.trial_wording_plan?.replace('{days}', plan.trialDays?.toString() || '7');

          const ctaConfig = resolvePaymentCta({
            paymentMode,
            plan,
            language
          });

          return (
          <div key={plan.id} className={`bg-white dark:bg-slate-800 p-6 md:p-8 rounded-3xl shadow-sm border ${isRecommended ? 'border-violet-500 shadow-violet-500/20 shadow-2xl relative transform md:-translate-y-2 lg:-translate-y-4 ring-2 ring-violet-500/20' : 'border-slate-200 dark:border-slate-700 mt-0 lg:mt-4'} flex flex-col`}>
            {isRecommended && (
               <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-blue-600 to-violet-600 text-white px-5 md:px-6 py-1.5 md:py-2 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg shadow-violet-500/30 whitespace-nowrap">
                 {t.marketing.pricing.most_popular}
               </div>
            )}
            <h3 className="text-xl md:text-2xl font-bold mb-2 dark:text-white">{plan.name}</h3>
            <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mb-6 min-h-[2.5rem] leading-relaxed">
               {((t.marketing.pricing as any)[`plan_desc_${plan.id}`]) || ''}
            </p>
            <div className="flex items-end gap-1 mb-2">
                <span className="text-4xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight">₺{displayPrice.toLocaleString()}</span>
                <span className="text-base md:text-lg text-gray-400 font-medium mb-1 md:mb-1.5">/{language==='tr'?'ay':'mo'}</span>
            </div>
            
            {billingPeriod === 'annual' && (
                <div className="text-green-600 dark:text-green-400 text-xs md:text-sm font-semibold mb-4 bg-green-50 dark:bg-green-900/20 py-1.5 px-3 rounded-lg inline-block self-start">
                  {t.marketing.pricing.billed_annually.replace('{price}', price.toLocaleString())}
                  {plan.annualDiscountPercent > 0 && ` (%${plan.annualDiscountPercent} ${language === 'tr' ? 'indirim' : 'off'})`}
                </div>
            )}
            {billingPeriod === 'monthly' && <div className="h-0 md:h-[1.875rem] mb-4"></div>}
            
            <p className="text-[10px] md:text-xs leading-relaxed text-gray-400 dark:text-gray-500 italic mb-6 md:mb-8 pb-4 border-b border-gray-100 dark:border-slate-700">
              {trialWording}
            </p>

            <ul className="space-y-4 mb-8 text-gray-600 dark:text-gray-300 flex-grow">
                <li className="flex gap-3">
                   <span className="text-accent font-bold mt-0.5">✓</span>
                   <span className="text-xs md:text-sm pb-1 w-full">{t.marketing.pricing.max_staff.replace('{count}', plan.maxStaff.toString())}</span>
                </li>
                <li className="flex gap-3">
                   <span className="text-accent font-bold mt-0.5">✓</span>
                   <span className="text-xs md:text-sm pb-1 w-full">
                     {plan.maxServices > 900 ? t.marketing.pricing.unlimited_services : t.marketing.pricing.max_services.replace('{count}', plan.maxServices.toString())}
                   </span>
                </li>
                <li className="flex gap-3">
                   <span className="text-accent font-bold mt-0.5">✓</span>
                   <span className="text-xs md:text-sm pb-1 w-full">{t.marketing.pricing.mini_website}</span>
                </li>
                {plan.customDomainEnabled && (
                  <li className="flex gap-3 items-start">
                     <span className="text-accent font-bold mt-0.5">✓</span>
                     <span className="text-xs md:text-sm pb-1 w-full flex justify-between items-center gap-1">
                         <span>{language === 'tr' ? 'Özel domain desteği' : 'Custom domain support'}</span>
                     </span>
                  </li>
                )}
                {plan.aiRecommendationsEnabled && (
                  <li className="flex gap-3">
                     <span className="text-accent font-bold mt-0.5">✓</span>
                     <span className="text-xs md:text-sm pb-1 w-full">
                       {t.marketing.pricing.ai_recommendation} 
                       {plan.aiMonthlyQuota > 0 && <span className="ml-1 text-[10px] text-gray-400 inline-block font-mono">[{t.marketing.pricing.ai_quota.replace('{quota}', plan.aiMonthlyQuota.toString())}]</span>}
                     </span>
                  </li>
                )}
                {plan.aiVisualizationEnabled && (
                  <li className="flex gap-3 items-start">
                     <span className="text-accent font-bold mt-0.5">✓</span>
                     <span className="text-xs md:text-sm pb-1 w-full flex justify-between items-center gap-1">
                         <span>{t.marketing.pricing.ai_visualization}</span>
                     </span>
                  </li>
                )}
            </ul>
            <div className="space-y-3 mt-auto pt-6 border-t border-gray-100 dark:border-slate-700">
               {ctaConfig.actionType === 'talk_to_sales' ? (
                 <Link to="/contact" className={`block w-full text-center font-bold py-3.5 md:py-4 rounded-xl transition bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-slate-600 text-sm md:text-base`}>
                   {ctaConfig.label}
                 </Link>
               ) : (
                 <div>
                   <Link 
                     to={`/register?planId=${plan.id}&billingPeriod=${billingPeriod}`}
                     className={`block w-full text-center font-bold py-3.5 md:py-4 rounded-xl transition shadow-md ${isRecommended ? 'bg-accent text-white hover:bg-blue-600 hover:shadow-lg' : 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-slate-600'} text-sm md:text-base`}>
                     {ctaConfig.label || (language === 'tr' ? '14 Gün Ücretsiz Başla' : 'Start 14-Day Free Trial')}
                   </Link>
                   <p className="text-center text-[11px] text-gray-500 mt-2">
                      {launchModeService.isOnlinePaymentEnabled() ? (
                        language === 'tr' 
                          ? 'Kart doğrulaması gerekir. 14 gün boyunca ücret alınmaz.'
                          : 'Card required. No charge for 14 days.'
                      ) : (
                        language === 'tr'
                          ? 'Manuel aktivasyon sürecidir. Hesap kurulduktan sonra LARİ ekibi sizinle iletişime geçecektir.'
                          : 'Manual activation process. The LARİ team will contact you once your account is created.'
                      )}
                    </p>
                 </div>
               )}
            </div>
          </div>
        )})}
      </div>
      
      <div className="mt-16 md:mt-24 bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 md:p-8 border border-gray-100 dark:border-slate-700 text-center max-w-3xl mx-auto shadow-sm">
         <h4 className="text-lg md:text-xl font-bold mb-3 dark:text-white">{t.marketing.pricing.setup_fee_q}</h4>
         <p className="text-gray-600 dark:text-gray-400 mb-5 text-sm md:text-base leading-relaxed">{t.marketing.pricing.setup_fee_a}</p>
         <Link to="/contact" className="text-blue-600 dark:text-blue-400 font-bold hover:underline text-sm md:text-base inline-flex items-center gap-1">
            {t.marketing.pricing.contact_corp}
            <svg className="w-4 h-4 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
         </Link>
      </div>

      <div className="mt-16 text-center">
         <h4 className="text-lg md:text-xl font-bold mb-6 dark:text-white">{language === 'tr' ? 'Hangi paketin uygun olduğundan emin değil misiniz?' : 'Not sure which package is right?'}</h4>
         <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link to="/pilot" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-8 py-3.5 text-sm md:text-base rounded-xl font-bold shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition">
              {language === 'tr' ? 'Örnek İşletmeyi Gör' : 'View Demo Business'}
            </Link>
            <Link to="/demo" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-8 py-3.5 text-sm md:text-base rounded-xl font-bold shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition">
              {language === 'tr' ? 'Kendi İşletmeni Önizle' : 'Preview Your Business'}
            </Link>
         </div>
      </div>
    </div>
  );
};

export default PricingPage;

