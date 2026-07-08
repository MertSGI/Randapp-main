import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { PricingPlan } from '../services/planService';

interface CheckoutPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  plan: PricingPlan | null;
}

export const CheckoutPreviewModal: React.FC<CheckoutPreviewModalProps> = ({ isOpen, onClose, onConfirm, plan }) => {
  const { language } = useLanguage();

  if (!isOpen || !plan) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl w-full max-w-lg shadow-2xl border border-gray-100 dark:border-slate-800 overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
           <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              {language === 'tr' ? 'Güvenli Ödeme Önizlemesi' : 'Secure Checkout Preview'}
           </h3>
           <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
           </button>
        </div>

        {/* Content */}
        <div className="p-6">
           <div className="flex items-start justify-between mb-6">
              <div>
                 <p className="text-sm font-semibold text-accent uppercase tracking-wider">{plan.name}</p>
                 <p className="font-bold text-slate-900 dark:text-white mt-1">
                    {language === 'tr' ? 'Aylık Abonelik' : 'Monthly Subscription'}
                 </p>
              </div>
              <div className="text-right">
                 <p className="text-2xl font-extrabold text-slate-900 dark:text-white">₺{plan.monthlyPrice}</p>
                 <p className="text-xs text-slate-500">{language === 'tr' ? 'KDV Dahil' : 'Inc. VAT'}</p>
              </div>
           </div>

           <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 mb-6">
              <h4 className="font-bold text-blue-900 dark:text-blue-300 text-sm mb-1">
                 {language === 'tr' ? `14 Günlük Ücretsiz Deneme` : `14-Day Free Trial`}
              </h4>
              <p className="text-xs text-blue-700 dark:text-blue-400">
                 {language === 'tr' ? '14 günlük ücretsiz denemeniz için güvenli ödeme sayfası hazırlanıyor... Kart bilgileriniz LARİ tarafından alınmaz; doğrulama güvenli ödeme sağlayıcısı üzerinden yapılır. 14 gün içinde iptal ederseniz ücret ödemezsiniz.' : 'Secure checkout is preparing... LARİ does not collect your card details. If you cancel within 14 days, you will not be charged.'}
              </p>
           </div>

           {/* Consent */}
           <div className="flex items-start gap-3 mb-6">
              <input type="checkbox" checked readOnly className="mt-1 shrink-0 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
              <p className="text-xs text-slate-600 dark:text-slate-400">
                 {language === 'tr' ? 'KVKK Aydınlatma Metni, Kullanım Şartları ve Mesafeli Satış/Abonelik koşullarını okudum ve kabul ediyorum. Güvenli ödeme altyapısına yönlendirileceksiniz.' : 'I have read and agree to the KVKK Privacy Policy, Terms of Use, and Distance Selling Agreements. You will be redirected to secure checkout.'}
              </p>
           </div>

           <button onClick={onConfirm || onClose} className="w-full bg-slate-900 dark:bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity">
              {language === 'tr' ? 'Güvenli Ödemeye Devam Et' : 'Proceed to Secure Checkout'}
           </button>
        </div>
      </div>
    </div>
  );
};
