import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';

const ContactPage: React.FC = () => {
  const { language } = useLanguage();
  const t = translations[language];
  const [businessName, setBusinessName] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  
  const handleWhatsAppRedirect = (e: React.FormEvent) => {
    e.preventDefault();
    const text = t.marketing.contact.wa_template.replace('{salon}', businessName).replace('{city}', city).replace('{phone}', phone);
    const num = (import.meta as any).env.VITE_SALES_WHATSAPP_NUMBER || '905555555555';
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const directWaNum = (import.meta as any).env.VITE_SALES_WHATSAPP_NUMBER || '905555555555';

  return (
    <div className="py-12 md:py-16 px-4 max-w-5xl mx-auto">
      <div className="text-center mb-10 md:mb-16">
        <h1 className="text-3xl md:text-4xl font-bold mb-4 dark:text-white tracking-tight">{t.marketing.contact.title}</h1>
        <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400">
          {t.marketing.contact.subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-start">
         <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-3xl shadow-lg border border-gray-100 dark:border-slate-700 w-full">
           <h3 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 dark:text-white">{t.marketing.contact.form_title}</h3>
           <p className="text-sm md:text-base text-gray-500 dark:text-gray-400 mb-6">{t.marketing.contact.form_notice}</p>
           <form onSubmit={handleWhatsAppRedirect} className="space-y-4 md:space-y-5">
             <div>
               <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.marketing.contact.form_salon}</label>
               <input required type="text" autoComplete="organization" value={businessName} onChange={e => setBusinessName(e.target.value)} className="w-full rounded-xl border border-gray-300 dark:border-slate-600 p-3 bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition" />
             </div>
             <div>
               <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.marketing.contact.form_city}</label>
               <input required type="text" autoComplete="address-level2" value={city} onChange={e => setCity(e.target.value)} className="w-full rounded-xl border border-gray-300 dark:border-slate-600 p-3 bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition" />
             </div>
             <div>
               <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.marketing.contact.form_phone}</label>
               <input required type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-xl border border-gray-300 dark:border-slate-600 p-3 bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition" />
             </div>
             <div className="pt-2">
               <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 md:py-4 rounded-xl transition shadow-md hover:shadow-lg">
                 {t.marketing.contact.btn_send}
               </button>
             </div>
           </form>
         </div>

         <div className="space-y-6 md:space-y-8 w-full">
            <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700">
               <h3 className="text-lg md:text-xl font-bold mb-3 md:mb-4 dark:text-white">{t.marketing.contact.fast_contact_title}</h3>
               <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 mb-6">{t.marketing.contact.fast_contact_desc}</p>
               <a href={`https://wa.me/${directWaNum}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 w-full bg-[#25D366] text-white px-6 md:px-8 py-3.5 rounded-xl font-bold hover:bg-green-600 transition mb-3 md:mb-4 text-sm md:text-base shadow-sm">
                  {t.marketing.contact.btn_wa}
               </a>
               <a href="mailto:iletisim@lari.com" className="flex items-center justify-center gap-2 w-full bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-white px-6 md:px-8 py-3.5 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-slate-600 transition text-sm md:text-base">
                  iletisim@lari.com
               </a>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-6 md:p-8 rounded-3xl border border-blue-100 dark:border-blue-800">
               <h3 className="text-base md:text-lg font-bold text-blue-800 dark:text-blue-300 mb-2">{t.marketing.contact.support_hours_title}</h3>
               <p className="text-sm md:text-base text-blue-600 dark:text-blue-400">{t.marketing.contact.support_hours_1}</p>
               <p className="text-sm md:text-base text-blue-600 dark:text-blue-400">{t.marketing.contact.support_hours_2}</p>
            </div>
         </div>
      </div>

      <div className="mt-16 text-center">
         <h4 className="text-lg md:text-xl font-bold mb-6 dark:text-white">{language === 'tr' ? 'Keşfetmeye Devam Edin' : 'Continue Exploring'}</h4>
         <div className="flex flex-col sm:flex-row justify-center gap-4 flex-wrap">
            <Link to="/register?planId=professional" className="bg-blue-600 text-white px-8 py-3.5 text-sm md:text-base rounded-xl font-bold shadow-md hover:bg-blue-700 transition shrink-0">
               {language === 'tr' ? '14 Gün Ücretsiz Başla' : 'Start 14-Day Free'}
            </Link>
            <Link to="/pilot" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-8 py-3.5 text-sm md:text-base rounded-xl font-bold shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition shrink-0">
              {language === 'tr' ? 'Örnek İşletmeyi Gör' : 'View Demo Business'}
            </Link>
            <Link to="/demo" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-8 py-3.5 text-sm md:text-base rounded-xl font-bold shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition shrink-0">
              {language === 'tr' ? 'Kendi İşletmeni Önizle' : 'Preview Your Business'}
            </Link>
         </div>
      </div>
    </div>
  );
};

export default ContactPage;
