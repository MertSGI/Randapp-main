import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';

const FeaturesPage: React.FC = () => {
  const { language } = useLanguage();
  const t = translations[language];

  return (
    <div className="py-12 md:py-16">
      <div className="text-center mb-12 md:mb-20 max-w-4xl mx-auto px-4">
         <div className="inline-block bg-violet-50 dark:bg-slate-800 text-violet-600 dark:text-violet-400 font-bold px-5 py-2 rounded-full text-sm mb-6 border border-violet-100 dark:border-slate-700">
           {language === 'tr' ? 'Neden LARİ?' : 'Why LARİ?'}
         </div>
         <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-6 dark:text-white tracking-tight leading-[1.15]">
           {language === 'tr' ? 'Karmaşık mesajlar yerine düzenli bir panel' : 'From messy messages to organized panel'}
         </h1>
         <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl mx-auto">
           {language === 'tr' 
            ? 'LARİ sıradan bir takvim ajandası değildir. Müşterilerinizin markanızı algılayışını profesyonelleştiren ve sizi gereksiz mesaj trafiğinden kurtaran bir platformdur.' 
            : 'LARİ is not just a calendar. It elevates how clients perceive your brand and frees you from endless message traffic.'}
         </p>
      </div>
      
      <div className="max-w-6xl mx-auto space-y-20 md:space-y-32 px-4">
        {/* Feature 1 */}
        <div className="flex flex-col md:flex-row gap-8 md:gap-16 items-center">
           <div className="w-full md:w-1/2 order-2 md:order-1">
              <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Problem 1</div>
              <h3 className="text-2xl md:text-3xl font-bold mb-4 dark:text-white leading-tight">
                 {language === 'tr' ? 'Müşteriler WhatsApp\'tan sürekli aynı soruları soruyor.' : 'Customers ask the same questions on WhatsApp.'}
              </h3>
              <p className="text-lg text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                 {language === 'tr' ? 'Çözüm: Hizmetlerinizi, fiyatlarınızı, işlem sürelerini ve seçilebilir personellerinizi web sitenizde 7/24 gösterin.' : 'Solution: Show your services, prices, duration, and staff 24/7 on your website.'}
              </p>
              <div className="bg-blue-50 dark:bg-slate-800 border border-blue-100 dark:border-slate-700 p-4 rounded-xl text-slate-900 dark:text-white font-medium">
                 <span className="text-blue-600 dark:text-blue-400 font-bold">Sonuç: </span> 
                 {language === 'tr' ? 'Fiyat listesi göndermek veya "Müsait saat var mı?" sorularına cevap vermek için zaman kaybetmezsiniz.' : 'Stop wasting time answering availability or pricing queries.'}
              </div>
           </div>
           <div className="w-full md:w-1/2 order-1 md:order-2">
              <div className="bg-slate-100 dark:bg-slate-800 rounded-3xl p-6 aspect-[4/3] flex flex-col items-center justify-center border border-slate-200 dark:border-slate-700 relative overflow-hidden shadow-inner">
                 <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-0 transform translate-x-4 lg:translate-x-8 translate-y-4 overflow-hidden">
                      <div className="bg-gradient-to-r from-blue-600 to-violet-600 h-24 p-5 flex flex-col justify-end">
                          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-blue-600 font-bold -mb-10 shadow border border-slate-100">ST</div>
                      </div>
                      <div className="pt-12 px-5 pb-5">
                          <div className="h-4 w-32 bg-slate-800 dark:bg-slate-200 rounded mb-2"></div>
                          <div className="h-2 w-48 bg-slate-400 rounded mb-6"></div>
                          <div className="space-y-3">
                              <div className="w-full h-12 bg-slate-50 dark:bg-slate-800 rounded-lg flex justify-between items-center px-4 border border-slate-100 dark:border-slate-700"><div className="w-24 h-2.5 bg-slate-400 dark:bg-slate-500 rounded"></div><div className="w-16 h-8 bg-blue-600 rounded text-center leading-8 text-[10px] text-white font-bold tracking-wider">AL</div></div>
                              <div className="w-full h-12 bg-slate-50 dark:bg-slate-800 rounded-lg flex justify-between items-center px-4 border border-slate-100 dark:border-slate-700"><div className="w-32 h-2.5 bg-slate-400 dark:bg-slate-500 rounded"></div><div className="w-16 h-8 bg-blue-600 rounded text-center leading-8 text-[10px] text-white font-bold tracking-wider">AL</div></div>
                          </div>
                      </div>
                  </div>
              </div>
           </div>
        </div>

        {/* Feature 2 */}
        <div className="flex flex-col md:flex-row gap-8 md:gap-16 items-center">
           <div className="w-full md:w-1/2 order-1">
              <div className="bg-slate-100 dark:bg-slate-800 rounded-3xl p-6 aspect-[4/3] flex flex-col items-center justify-center border border-slate-200 dark:border-slate-700 relative overflow-hidden shadow-inner">
                 <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-5 transform -translate-x-4 lg:-translate-x-8 -translate-y-4">
                      <div className="flex gap-2 mb-6">
                           <div className="px-3 py-1 bg-violet-100 text-violet-700 font-bold text-[10px] rounded uppercase">Bugün</div>
                           <div className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold text-[10px] rounded uppercase">Yarın</div>
                      </div>
                      <div className="w-full bg-violet-50 text-violet-900 dark:bg-slate-800/80 dark:text-violet-100 rounded-lg border-l-4 border-violet-500 p-3 mb-3">
                           <div className="flex justify-between items-center mb-1">
                               <div className="font-bold text-sm">Ayşe Yılmaz</div>
                               <div className="text-xs opacity-70">10:00 - 11:30</div>
                           </div>
                           <div className="text-xs opacity-80">Saç Kesimi & Boya</div>
                      </div>
                      <div className="w-full bg-blue-50 text-blue-900 dark:bg-slate-800/80 dark:text-blue-100 rounded-lg border-l-4 border-blue-500 p-3 mb-3">
                           <div className="flex justify-between items-center mb-1">
                               <div className="font-bold text-sm">Ece K.</div>
                               <div className="text-xs opacity-70">13:00 - 14:00</div>
                           </div>
                           <div className="text-xs opacity-80">Manikür</div>
                      </div>
                  </div>
              </div>
           </div>
           <div className="w-full md:w-1/2 order-2">
              <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Problem 2</div>
              <h3 className="text-2xl md:text-3xl font-bold mb-4 dark:text-white leading-tight">
                 {language === 'tr' ? 'Randevular karışıyor, çakışıyor veya müşteriler iptal etmeyi unutuyor.' : 'Appointments are scattered, conflicting, or clients forget to cancel.'}
              </h3>
              <p className="text-lg text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                 {language === 'tr' ? 'Çözüm: Randevuları, uzman seçimlerini ve personel takvimlerini tek merkezde toplayın. Müşteriler kendi portallarından iptal edebilsin.' : 'Solution: Centralize bookings, staff calendars, and let clients self-serve cancellations.'}
              </p>
              <div className="bg-violet-50 dark:bg-slate-800 border border-violet-100 dark:border-slate-700 p-4 rounded-xl text-slate-900 dark:text-white font-medium">
                 <span className="text-violet-600 dark:text-violet-400 font-bold">Sonuç: </span> 
                 {language === 'tr' ? 'Sıfır çakışma, minimum No-Show oranı. Yönetici panelinden gününüzü net görürsünüz.' : 'Zero conflicts, minimized no-shows, and a clear dashboard for your day.'}
              </div>
           </div>
        </div>

        {/* Feature 3 */}
        <div className="flex flex-col md:flex-row gap-8 md:gap-16 items-center">
           <div className="w-full md:w-1/2 order-2 md:order-1">
              <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Problem 3</div>
              <h3 className="text-2xl md:text-3xl font-bold mb-4 dark:text-white leading-tight">
                 {language === 'tr' ? 'Eski müşterilerin ne zaman geldiğini ve ne yaptırdığını unutuyorsunuz.' : 'You forget customer preferences and past visits.'}
              </h3>
              <p className="text-lg text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                 {language === 'tr' ? 'Çözüm: Müşterilere ait gizli notları, renk formüllerini, referans fotoğraflarını ve eski randevu geçmişlerini Müşteri Hafızasına güvenle kaydedin.' : 'Solution: Keep customer notes, visit history, color formulas, and reference photos privately in Customer Memory.'}
              </p>
              <div className="bg-amber-50 dark:bg-slate-800 border border-amber-100 dark:border-slate-700 p-4 rounded-xl text-slate-900 dark:text-white font-medium">
                 <span className="text-amber-600 dark:text-amber-500 font-bold">Sonuç: </span> 
                 {language === 'tr' ? 'Her müşteri bir sonraki gelişinde kendini özel hisseder. Premium hizmet deneyimi.' : 'Every repeat visit feels personal. Premium service experience powered by CRM data.'}
              </div>
           </div>
           <div className="w-full md:w-1/2 order-1 md:order-2">
              <div className="bg-slate-100 dark:bg-slate-800 rounded-3xl p-6 aspect-[4/3] flex flex-col items-center justify-center border border-slate-200 dark:border-slate-700 relative overflow-hidden shadow-inner">
                 <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-5 transform translate-x-4 lg:translate-x-8 translate-y-4">
                      <div className="flex justify-between items-start mb-4">
                          <div>
                              <div className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">Merve Y.</div>
                              <div className="text-xs text-slate-500">Kayıt: 2024 • 12 Ziyaret</div>
                          </div>
                      </div>
                      <div className="space-y-4">
                          <div className="w-full bg-amber-50 dark:bg-slate-800/50 rounded-lg border border-amber-200 dark:border-slate-700 p-3">
                              <div className="flex items-center gap-2 mb-2">
                                  <span className="text-[10px] text-amber-700 font-bold uppercase rounded bg-amber-200 px-1.5 py-0.5">Gizli Not</span>
                              </div>
                              <div className="text-[11px] text-slate-700 dark:text-slate-300">Saç derisi hassas. Boya işleminde 20 volume oksidan kullanılmalı.</div>
                          </div>
                          <div>
                              <div className="text-xs font-bold text-slate-500 mb-2">Geçmiş İşlemler</div>
                              <div className="flex gap-2">
                                 <div className="flex-1 h-16 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
                                 <div className="flex-1 h-16 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
           </div>
        </div>

        {/* Customer-Facing AI Visualizer Section */}
        <div className="mt-32 border-t border-slate-200 dark:border-slate-800 pt-20">
           <div className="flex flex-col lg:flex-row gap-12 items-center max-w-6xl mx-auto">
              <div className="w-full lg:w-1/2">
                 <div className="inline-block bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400 font-bold px-4 py-1.5 rounded-full text-xs mb-6 border border-violet-200 dark:border-violet-800 uppercase tracking-widest">
                    {language === 'tr' ? 'Premium' : 'Premium'}
                 </div>
                 <h2 className="text-3xl md:text-5xl font-bold mb-6 dark:text-white leading-tight">
                    {language === 'tr' ? 'Randevu öncesi AI Stil Asistanı' : 'Pre-booking AI Style Assistant'}
                 </h2>
                 <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed mb-8">
                    {language === 'tr'
                      ? 'Müşteriler saç, sakal veya tırnak fikri için fotoğraf yükleyip randevu almadan önce stil önerisi alabilir. Fotoğrafınız güvenli yöntemlerle işlenir.'
                      : 'Customers can upload a photo for hair, beard, or nail ideas and get style recommendations before booking. Your photos are securely processed.'}
                 </p>

                 <div className="space-y-6">
                    <div className="flex gap-4">
                       <div className="w-12 h-12 bg-violet-100 dark:bg-violet-900/30 text-violet-600 rounded-xl flex items-center justify-center shrink-0 text-xl font-bold shadow-sm">1</div>
                       <div>
                          <h4 className="font-bold text-lg text-slate-900 dark:text-white mb-1">{language === 'tr' ? 'Fotoğrafla stil önerisi' : 'Style recommendations with photos'}</h4>
                          <p className="text-slate-600 dark:text-slate-400 text-sm">
                             {language === 'tr' ? 'Müşteri kendi saç, sakal veya tırnak fotoğrafını yükleyerek hangi hizmetin daha uygun olabileceğine dair görsel ilham ve öneri alabilir.' : 'The customer can upload their own hair, beard, or nail photo to get visual inspiration and recommendations on what service to book.'}
                          </p>
                       </div>
                    </div>
                    
                    <div className="flex gap-4">
                       <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-xl flex items-center justify-center shrink-0 text-xl font-bold shadow-sm">2</div>
                       <div>
                          <h4 className="font-bold text-lg text-slate-900 dark:text-white mb-1">{language === 'tr' ? 'Randevuya dönüşen öneriler' : 'Recommendations generating bookings'}</h4>
                          <p className="text-slate-600 dark:text-slate-400 text-sm">
                             {language === 'tr' ? 'AI Asistan öneriyi doğrudan uygun hizmet ve randevu akışına bağlayarak müşterinin karar verme sürecini hızlandırır.' : 'The AI Assistant connects the recommendation directly to the matching service and booking flow, speeding up customer decision making.'}
                          </p>
                       </div>
                    </div>

                    <div className="flex gap-4">
                       <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-xl flex items-center justify-center shrink-0 text-xl font-bold shadow-sm">3</div>
                       <div>
                          <h4 className="font-bold text-lg text-slate-900 dark:text-white mb-1">{language === 'tr' ? 'Premium görsel önizleme' : 'Premium visual preview'}</h4>
                          <p className="text-slate-600 dark:text-slate-400 text-sm">
                             {language === 'tr' ? 'Üst paketlerdeki deneyim, müşterinin fotoğrafı üzerinden yeni stil fikrini gösterecek şekilde tasarlanır.' : 'The premium experience shows the new style idea using the customer\'s photo.'}
                          </p>
                       </div>
                    </div>
                 </div>
                 
                 <div className="mt-8 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 text-amber-800 dark:text-amber-400 text-xs p-4 rounded-xl text-left shadow-sm">
                    <strong>{language === 'tr' ? 'Güvenli ve izinli kullanım:' : 'Secure and permission-based:'}</strong> {language === 'tr' ? 'Referans fotoğrafları varsayılan olarak analiz edilmez. Açık izin, veri minimizasyonu ve sunucu tarafı güvenli işleme esas alınır.' : 'Reference photos are not analyzed by default. Explicit permission, data minimization, and secure server-side processing apply.'}
                 </div>
              </div>

              <div className="w-full lg:w-1/2">
                 <div className="bg-slate-100 dark:bg-slate-800 rounded-3xl p-6 md:p-10 flex flex-col items-center justify-center border border-slate-200 dark:border-slate-700 shadow-inner">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6">
                       <div className="flex justify-between items-center mb-6">
                           <h4 className="font-bold text-slate-900 dark:text-white text-sm">AI Stil Asistanı <span className="text-[10px] bg-violet-100 text-violet-700 font-bold px-2 py-0.5 rounded uppercase ml-2">Premium</span></h4>
                       </div>
                       
                       <div className="flex gap-4 mb-6">
                           <div className="w-16 h-16 bg-slate-200 dark:bg-slate-800 rounded-xl shrink-0 flex items-center justify-center border border-dashed border-slate-300 dark:border-slate-600">
                               <span className="text-slate-400 text-xl">+</span>
                           </div>
                           <div className="flex-1">
                               <div className="h-3 w-1/2 bg-slate-200 dark:bg-slate-700 rounded mb-2"></div>
                               <div className="h-2 w-3/4 bg-slate-100 dark:bg-slate-800 rounded mb-1"></div>
                               <div className="h-2 w-2/3 bg-slate-100 dark:bg-slate-800 rounded"></div>
                           </div>
                       </div>
                       
                       <div className="flex gap-2 mb-6">
                           <div className="flex-1 h-8 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/30 rounded text-center text-xs font-bold text-violet-700 dark:text-violet-300 leading-8">Saç</div>
                           <div className="flex-1 h-8 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-center text-xs text-slate-500 dark:text-slate-400 leading-8">Sakal</div>
                           <div className="flex-1 h-8 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-center text-xs text-slate-500 dark:text-slate-400 leading-8">Tırnak</div>
                       </div>
                       
                       <div className="bg-gradient-to-tr from-blue-50 to-violet-50 dark:from-blue-900/10 dark:to-violet-900/10 rounded-xl p-4 border border-blue-100 dark:border-violet-500/20 mb-6 relative overflow-hidden">
                          <div className="h-2 w-full bg-blue-200/50 dark:bg-blue-800/30 rounded mb-2"></div>
                          <div className="h-2 w-5/6 bg-blue-200/50 dark:bg-blue-800/30 rounded mb-2"></div>
                          <div className="h-2 w-2/3 bg-blue-200/50 dark:bg-blue-800/30 rounded"></div>
                       </div>
                       
                       <div className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl py-3 text-center text-sm shadow-md">
                          Bu stiline uygun randevu al
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>

        {/* New AI Section */}
        <div className="mt-32 border-t border-slate-200 dark:border-slate-800 pt-20">
           <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-block bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400 font-bold px-4 py-1.5 rounded-full text-xs mb-6 border border-violet-200 dark:border-violet-800 uppercase tracking-widest">
                 {language === 'tr' ? 'Premium Yapay Zeka Özelliği' : 'Premium AI Feature'}
              </div>
              <h2 className="text-3xl md:text-5xl font-bold mb-6 dark:text-white leading-tight">
                 {language === 'tr' ? 'Yapay zekâ destekli işletme analizi' : 'AI-supported business analysis'}
              </h2>
              <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                 {language === 'tr'
                   ? 'LARİ, randevu ve müşteri geçmişinizi anlamlandırarak işletmenize daha akıllı kararlar aldırmayı hedefler. Güvenilir ve tutarlı iş akışları oluşturur.'
                   : 'LARİ aims to make your business smarter by analyzing booking and customer history securely.'}
              </p>
              <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 text-amber-800 dark:text-amber-400 text-xs md:text-sm p-4 rounded-xl text-left shadow-sm">
                 <strong>{language === 'tr' ? 'Veri Gizliliği Notu:' : 'Privacy Note:'}</strong> {language === 'tr' ? 'Özel müşteri notları ve referans fotoğrafları varsayılan olarak AI analizine gönderilmez. Açık izin, veri minimizasyonu ve güvenli sunucu tarafı işleme esas alınır.' : 'Private customer notes and reference photos are not sent to AI analysis by default. Explicit permission, data minimization, and secure server-side processing principles apply.'}
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-5xl mx-auto">
              <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                 <h3 className="text-xl font-bold mb-3 dark:text-white text-slate-900 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-600 flex items-center justify-center text-lg">📈</span>
                    {language === 'tr' ? 'Yoğun saat ve gün analizi' : 'Peak hour and day analysis'}
                 </h3>
                 <p className="text-slate-600 dark:text-slate-400">
                    {language === 'tr' ? 'Hangi gün ve saatlerde daha fazla randevu aldığınızı görerek personel planlamasını ve kampanya zamanlamasını daha bilinçli yapın.' : 'See which days and times bring the most bookings to plan staff and campaigns more consciously.'}
                 </p>
              </div>

              <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                 <h3 className="text-xl font-bold mb-3 dark:text-white text-slate-900 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center text-lg">✨</span>
                    {language === 'tr' ? 'Müşteri geri dönüş önerileri' : 'Client return recommendations'}
                 </h3>
                 <p className="text-slate-600 dark:text-slate-400">
                    {language === 'tr' ? 'Ziyaret geçmişi ve tercih bilgilerine göre hangi müşteriye ne zaman hatırlatma veya kampanya sunulabileceğini görün.' : 'See which clients should receive reminders or offers, based on their visit history and preferences.'}
                 </p>
              </div>

              <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                 <h3 className="text-xl font-bold mb-3 dark:text-white text-slate-900 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center text-lg">💰</span>
                    {language === 'tr' ? 'Hizmet performansı' : 'Service performance insight'}
                 </h3>
                 <p className="text-slate-600 dark:text-slate-400">
                    {language === 'tr' ? 'En çok tercih edilen hizmetleri, tahmini gelir katkısını ve geliştirme fırsatlarını tek bakışta takip edin.' : 'Track top-performing services, estimated revenue contributions, and growth opportunities at a glance.'}
                 </p>
              </div>

              <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                 <h3 className="text-xl font-bold mb-3 dark:text-white text-slate-900 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-600 flex items-center justify-center text-lg">💡</span>
                    {language === 'tr' ? 'Akıllı öneri kartları' : 'Smart recommendation cards'}
                 </h3>
                 <p className="text-slate-600 dark:text-slate-400">
                    {language === 'tr' ? 'Sistem, yoğunluk, tekrar ziyaret ve müşteri tercihleri gibi sinyallere göre uygulanabilir öneriler sunacak şekilde yapılandırılır.' : 'The system will be designed to offer actionable insights based on traffic, repeat visits, and preferences.'}
                 </p>
              </div>
           </div>
        </div>

        {/* New Mobile App Section */}
        <div className="mt-24 border-t border-slate-200 dark:border-slate-800 pt-20">
           <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-block bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 font-bold px-4 py-1.5 rounded-full text-xs mb-6 border border-blue-200 dark:border-blue-800 uppercase tracking-widest">
                 {language === 'tr' ? 'Platform Gelişimi' : 'Platform Expansion'}
              </div>
              <h2 className="text-3xl md:text-5xl font-bold mb-6 dark:text-white leading-tight">
                 {language === 'tr' ? 'Mobil uygulama ile gelecek avantajlar' : 'Advantages coming with the mobile app'}
              </h2>
              <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                 {language === 'tr'
                   ? 'LARİ’nin mobil uygulaması, müşterilerin tekrar randevu almasını, kampanyaları takip etmesini ve işletmeleri keşfetmesini kolaylaştıracak ek bir büyüme kanalıdır.'
                   : 'LARİ’s mobile app is an additional growth channel to help clients rebook, track campaigns, and discover businesses effortlessly.'}
              </p>
           </div>

           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
                 <div className="w-12 h-12 bg-white dark:bg-slate-700 rounded-full shadow-sm border border-slate-200 dark:border-slate-600 flex items-center justify-center text-blue-600 mx-auto mb-4 text-xl">⚡</div>
                 <h4 className="font-bold text-slate-900 dark:text-white mb-2">{language === 'tr' ? 'Daha hızlı tekrar randevu' : 'Faster rebooking'}</h4>
                 <p className="text-sm text-slate-600 dark:text-slate-400">{language === 'tr' ? 'Müşteriler favori işletmesine ve geçmiş hizmetlerine daha hızlı ulaşarak tekrar randevu oluşturabilir.' : 'Clients can easily access their favorite salon and past services for quick rebooking.'}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
                 <div className="w-12 h-12 bg-white dark:bg-slate-700 rounded-full shadow-sm border border-slate-200 dark:border-slate-600 flex items-center justify-center text-green-600 mx-auto mb-4 text-xl">🔔</div>
                 <h4 className="font-bold text-slate-900 dark:text-white mb-2">{language === 'tr' ? 'Bildirim ve hatırlatma kanalı' : 'Notification channel'}</h4>
                 <p className="text-sm text-slate-600 dark:text-slate-400">{language === 'tr' ? 'Randevu hatırlatmaları, kampanya duyuruları ve uygun saat bilgilendirmeleri için doğrudan bir iletişim.' : 'Direct communication channel for appointment reminders, promos, and availability updates.'}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
                 <div className="w-12 h-12 bg-white dark:bg-slate-700 rounded-full shadow-sm border border-slate-200 dark:border-slate-600 flex items-center justify-center text-amber-500 mx-auto mb-4 text-xl">🎁</div>
                 <h4 className="font-bold text-slate-900 dark:text-white mb-2">{language === 'tr' ? 'Sadakat ve referral' : 'Loyalty & referral'}</h4>
                 <p className="text-sm text-slate-600 dark:text-slate-400">{language === 'tr' ? 'Referans kampanyaları, sadakat avantajları ve geri dönüş teklifleri mobil deneyim içinde görünür hale gelir.' : 'Referral programs, loyalty perks, and client comeback offers become highly visible.'}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
                 <div className="w-12 h-12 bg-white dark:bg-slate-700 rounded-full shadow-sm border border-slate-200 dark:border-slate-600 flex items-center justify-center text-violet-600 mx-auto mb-4 text-xl">🔍</div>
                 <h4 className="font-bold text-slate-900 dark:text-white mb-2">{language === 'tr' ? 'İşletme keşfi' : 'Business discovery'}</h4>
                 <p className="text-sm text-slate-600 dark:text-slate-400">{language === 'tr' ? 'Müşteriler yakınındaki randevulu işletmeleri keşfedebilir.' : 'Clients will be able to discover local businesses.'}</p>
              </div>
           </div>
        </div>
      </div>

      <div className="mt-24 md:mt-32 text-center px-4 max-w-3xl mx-auto">
         <h2 className="text-2xl md:text-4xl font-bold mb-4 dark:text-white leading-tight">
            {language === 'tr' ? 'Önce sistemi örnek işletme üzerinden görün.' : 'See the system in action first with our demo business.'}
         </h2>
         <div className="flex flex-col sm:flex-row justify-center gap-4 mt-8 flex-wrap">
           <Link to="/pilot" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-8 py-3.5 rounded-xl font-bold border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition w-full sm:w-auto text-center shrink-0">
             {language === 'tr' ? 'Örnek İşletmeyi Gör' : 'View Demo Business'}
           </Link>
           <Link to="/demo" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-8 py-3.5 rounded-xl font-bold border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition w-full sm:w-auto text-center shrink-0">
             {language === 'tr' ? 'Kendi İşletmeni Önizle' : 'Preview Your Business'}
           </Link>
           <Link to="/register?planId=professional" className="bg-blue-600 text-white px-8 py-3.5 rounded-xl font-bold shadow-md hover:bg-blue-700 transition w-full sm:w-auto text-center shrink-0">
             {language === 'tr' ? '14 Gün Ücretsiz Başla' : 'Start 14-Day Free'}
           </Link>
         </div>
      </div>
    </div>
  );
};

export default FeaturesPage;
