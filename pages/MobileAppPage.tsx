import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { Link } from 'react-router-dom';
import { Smartphone, MapPin, Star, CalendarHeart, Gift } from 'lucide-react';
import { FeatureBadge } from '../components/FeatureBadge';

const MobileAppPage: React.FC = () => {
  const { language } = useLanguage();
  const t = translations[language];

  const content = {
    badge: t.marketing.mobile_app.badge,
    title: t.marketing.mobile_app.title,
    subtitle: t.marketing.mobile_app.subtitle,
    notice: t.marketing.mobile_app.notice,
    features: [
      {
        icon: <MapPin className="w-5 h-5 md:w-6 md:h-6 text-accent" />,
        title: t.marketing.mobile_app.feat_1_title,
        desc: t.marketing.mobile_app.feat_1_desc
      },
      {
        icon: <CalendarHeart className="w-5 h-5 md:w-6 md:h-6 text-accent" />,
        title: t.marketing.mobile_app.feat_2_title,
        desc: t.marketing.mobile_app.feat_2_desc
      },
      {
        icon: <Star className="w-5 h-5 md:w-6 md:h-6 text-accent" />,
        title: t.marketing.mobile_app.feat_3_title,
        desc: t.marketing.mobile_app.feat_3_desc
      },
      {
        icon: <Gift className="w-5 h-5 md:w-6 md:h-6 text-accent" />,
        title: t.marketing.mobile_app.feat_4_title,
        desc: t.marketing.mobile_app.feat_4_desc
      }
    ],
    cta: t.marketing.mobile_app.cta,
    btn: t.marketing.mobile_app.btn
  };

  return (
    <div className="bg-gray-50 dark:bg-slate-900 min-h-[calc(100vh-64px)] pb-16 md:pb-24">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            <div className="flex justify-center mb-6 items-center gap-2 md:gap-3 flex-wrap">
               <span className="inline-flex items-center gap-1.5 md:gap-2 bg-blue-50 dark:bg-slate-700/50 text-accent font-semibold px-3 py-1.5 md:px-4 md:py-2 rounded-full text-xs md:text-sm shadow-sm">
                 <Smartphone className="w-4 h-4 md:w-5 md:h-5" />
                 {content.badge}
               </span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-5 md:mb-6 max-w-4xl mx-auto leading-tight">
              {content.title}
            </h1>
            <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-2xl lg:max-w-3xl mx-auto leading-relaxed px-2">
              {content.subtitle}
            </p>

            <div className="mt-8 md:mt-12 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-400 p-4 md:p-5 rounded-xl max-w-2xl mx-auto text-sm md:text-base leading-relaxed shadow-sm">
               {content.notice}
            </div>
        </div>
      </div>

      {/* Feature Grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8 lg:gap-10">
              {content.features.map((feat, idx) => (
                  <div key={idx} className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 flex flex-col sm:flex-row gap-5 md:gap-6 hover:shadow-md transition">
                      <div className="flex-shrink-0 w-12 h-12 md:w-14 md:h-14 bg-blue-50 dark:bg-slate-700 rounded-2xl flex items-center justify-center">
                         {feat.icon}
                      </div>
                      <div>
                          <h3 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white mb-2">{feat.title}</h3>
                          <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-sm md:text-base">
                              {feat.desc}
                          </p>
                      </div>
                  </div>
              ))}
          </div>
      </div>
      
      {/* CTA Box */}
      <div className="max-w-5xl mx-auto px-4 mt-4 md:mt-8">
         <div className="bg-gradient-to-r from-blue-600 to-accent rounded-3xl p-8 md:p-12 text-center shadow-lg relative overflow-hidden">
             <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white opacity-10 rounded-full blur-2xl"></div>
             <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-32 h-32 bg-blue-400 opacity-20 rounded-full blur-3xl"></div>
             
             <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-4 relative z-10 leading-tight">
                 {language === 'tr' ? 'Müşterinizin telefonda yaşayacağı deneyimi inceleyin.' : 'Examine the experience your customers will have on mobile.'}
             </h2>
             <p className="text-blue-100 mb-8 relative z-10 text-lg">
                 {language === 'tr' ? 'Örnek ekranları test edebilir veya ücretsiz denemeye başlayabilirsiniz.' : 'You can test sample screens or start a free trial.'}
             </p>
             <div className="flex flex-col sm:flex-row justify-center gap-4 relative z-10 flex-wrap">
                 <Link to="/register?planId=professional" className="inline-block w-full sm:w-auto bg-white text-blue-600 px-8 py-3.5 md:py-4 rounded-xl font-bold shadow-md hover:shadow-xl transition transform hover:-translate-y-1 text-sm md:text-base text-center shrink-0">
                     {language === 'tr' ? '14 Gün Ücretsiz Başla' : 'Start 14-Day Free'}
                 </Link>
                 <Link to="/pilot/customer" className="inline-block w-full sm:w-auto bg-blue-500/30 border border-blue-200/50 text-white hover:bg-blue-500/50 px-8 py-3.5 md:py-4 rounded-xl font-bold shadow-sm transition text-sm md:text-base text-center shrink-0">
                     {language === 'tr' ? 'Müşteri Deneyimini İncele' : 'View Customer Experience'}
                 </Link>
                 <Link to="/pilot/admin" className="inline-block w-full sm:w-auto bg-blue-500/30 border border-blue-200/50 text-white hover:bg-blue-500/50 px-8 py-3.5 md:py-4 rounded-xl font-bold shadow-sm transition text-sm md:text-base text-center shrink-0">
                     {language === 'tr' ? 'İşletme Panelini İncele' : 'View Admin Panel'}
                 </Link>
                 <Link to="/demo" className="inline-block w-full sm:w-auto bg-blue-500/30 border border-blue-200/50 text-white hover:bg-blue-500/50 px-8 py-3.5 md:py-4 rounded-xl font-bold shadow-sm transition text-sm md:text-base text-center shrink-0">
                     {language === 'tr' ? 'Kendi İşletmeni Önizle' : 'Preview Your Business'}
                 </Link>
             </div>
         </div>
      </div>
    </div>
  );
};

export default MobileAppPage;
