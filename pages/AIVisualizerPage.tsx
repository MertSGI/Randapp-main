import React, { useState, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTenant } from '../contexts/TenantContext';

const AIVisualizerPage: React.FC = () => {
  const { language } = useLanguage();
  const { tenant } = useTenant();
  
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [serviceGoal, setServiceGoal] = useState<string>('Saç');
  const [styleGoal, setStyleGoal] = useState<string>('Modern');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [showResult, setShowResult] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setUploadedImage(event.target.result as string);
        setShowResult(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDemoPhoto = () => {
    // A safe grey placeholder or a generated placeholder pattern
    setUploadedImage('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="%23e2e8f0"/><text x="50%" y="50%" font-family="sans-serif" font-size="20" fill="%2364748b" text-anchor="middle" dominant-baseline="middle">Örnek Fotoğraf</text></svg>');
    setShowResult(false);
  };

  const handleConsultation = () => {
    setIsGenerating(true);
    // Simulate generation
    setTimeout(() => {
      setIsGenerating(false);
      setShowResult(true);
    }, 1500);
  };

  const t = {
    en: {
      title: "Pre-Booking AI Style Assistant",
      subtitle: "Visualize your hair, beard, or nail ideas and easily choose which service to book.",
      uploadTitle: "1. Upload Photo (Optional)",
      uploadDesc: "Your photo is securely used for style matching.",
      uploadBtn: "Upload Photo",
      demoBtn: "Use Demo Photo",
      serviceGoalObj: "2. What is your goal?",
      styleGoalObj: "3. Preferred Style",
      generateBtn: "Get Recommendation",
      generating: "Analyzing...",
      resultsTitle: "Your Style Recommendation",
      recommendationDesc: `Based on your selections (${serviceGoal} - ${styleGoal}), we recommend a modern touch that fits your facial structure. For a long-lasting effect, a restorative care addition is suitable.`,
      suggestedService: "Suggested Service:",
      serviceName: `${serviceGoal} Styling & Care`,
      durationLabel: "Est. Duration:",
      durationValue: "45-60 min",
      bookBtn: "Book with this recommendation",
      premiumNotice: "Premium Plan Visual Preview",
      premiumNoticeDesc: "In the premium plan, a high-quality visual preview based on your photo will appear here.",
      privacyNote: "Privacy Note: Your photo is only processed to generate style recommendations. Asking to save your photo to the customer memory requires your explicit consent. This analysis is not used for biometric identification or medical diagnosis."
    },
    tr: {
      title: "Randevu öncesi AI Stil Asistanı",
      subtitle: "Saç, sakal veya tırnak fikrinizi görselleştirin; hangi hizmete randevu almanız gerektiğini daha kolay seçin.",
      uploadTitle: "1. Fotoğraf Yükle (Opsiyonel)",
      uploadDesc: "Fotoğrafınız stil eşleştirmesi için güvenle kullanılır.",
      uploadBtn: "Fotoğraf Seç",
      demoBtn: "Demo Fotoğraf Kullan",
      serviceGoalObj: "2. Hedefiniz Nedir?",
      styleGoalObj: "3. Tercih Edilen Stil",
      generateBtn: "Tavsiye Al",
      generating: "Analiz Ediliyor...",
      resultsTitle: "Stil Öneriniz",
      recommendationDesc: `Seçimlerinize (${serviceGoal} - ${styleGoal}) dayanarak yüz hatlarınıza uyum sağlayacak modern bir dokunuş öneriyoruz. Uzun süreli kalıcılık için onarıcı bakım eklentisi de uygundur.`,
      suggestedService: "Önerilen Hizmet:",
      serviceName: `${serviceGoal} Şekillendirme ve Bakım`,
      durationLabel: "Tahmini Süre:",
      durationValue: "45-60 dk",
      bookBtn: "Bu öneriyle randevu al",
      premiumNotice: "Premium Plan Görsel Önizleme",
      premiumNoticeDesc: "Premium planda, fotoğrafınıza uygulanan yüksek kaliteli yapay zeka destekli yeni stilinizin görsel önizlemesi burada gösterilecektir.",
      privacyNote: "Gizlilik Notu: Fotoğrafınız yalnızca stil önerisi oluşturmak için işlenir. Fotoğrafınızı müşteri hafızasına kaydetmek isterseniz ayrıca onayınız alınır. Bu analiz kimlik tanıma, yüz eşleştirme veya sağlık teşhisi amacıyla kullanılmaz."
    }
  }[language];

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Badge and Title */}
      <div className="text-center mb-10">
        <div className="inline-block bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400 font-bold px-4 py-1 rounded-full text-[10px] sm:text-xs mb-4 border border-violet-200 dark:border-violet-800 uppercase tracking-widest">
           {language === 'tr' ? 'Premium Yapay Zeka Özelliği' : 'Premium AI Feature'}
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white mb-4 leading-tight">{t.title}</h1>
        <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400 mx-auto max-w-2xl">{t.subtitle}</p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200 dark:border-slate-700 p-6 md:p-8 transition-colors duration-300">
        
        <div className="space-y-8">
            {/* Upload Section */}
            <div className="bg-slate-50 dark:bg-slate-700/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-600">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                 <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-lg">{t.uploadTitle}</h3>
                    <p className="text-xs text-gray-500">{t.uploadDesc}</p>
                 </div>
                 <button 
                  onClick={handleDemoPhoto}
                  className="text-sm bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg font-medium transition-colors"
                 >
                   {t.demoBtn}
                 </button>
              </div>
              
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                />
                
                {uploadedImage ? (
                  <div className="w-32 h-32 rounded-2xl overflow-hidden shrink-0 border-2 border-violet-500 shadow-md">
                    <img src={uploadedImage} alt="Uploaded" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-32 h-32 rounded-2xl bg-slate-200 dark:bg-slate-600 flex items-center justify-center shrink-0 border-2 border-dashed border-slate-300 dark:border-slate-500">
                    <svg className="w-10 h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 rounded-xl font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-sm"
                >
                  {uploadedImage ? (language === 'tr' ? 'Değiştir' : 'Change') : t.uploadBtn}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
               {/* Categories */}
               <div>
                  <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">{t.serviceGoalObj}</label>
                  <div className="flex gap-2">
                     {['Saç', 'Sakal', 'Tırnak'].map(goal => (
                        <button 
                          key={goal}
                          onClick={() => setServiceGoal(goal)}
                          className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${serviceGoal === goal ? 'bg-violet-100 border-violet-500 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-500' : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                        >
                           {language==='en' ? (goal==='Saç'?'Hair':goal==='Sakal'?'Beard':'Nails') : goal}
                        </button>
                     ))}
                  </div>
               </div>

               <div>
                  <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">{t.styleGoalObj}</label>
                  <select 
                     className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg px-4 py-2.5 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                     value={styleGoal}
                     onChange={(e) => setStyleGoal(e.target.value)}
                  >
                     <option value="Doğal">{language === 'tr' ? 'Doğal' : 'Natural'}</option>
                     <option value="Modern">{language === 'tr' ? 'Modern' : 'Modern'}</option>
                     <option value="Cesur">{language === 'tr' ? 'Cesur' : 'Bold'}</option>
                     <option value="Bakımlı">{language === 'tr' ? 'Bakımlı' : 'Groomed'}</option>
                     <option value="Özel Gün">{language === 'tr' ? 'Özel Gün' : 'Special Occasion'}</option>
                  </select>
               </div>
            </div>

            <button
               onClick={handleConsultation}
               disabled={isGenerating}
               className="w-full py-4 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 shadow-lg shadow-violet-500/20 disabled:opacity-70 disabled:shadow-none transition-all"
            >
               {isGenerating ? t.generating : t.generateBtn}
            </button>
            
            {showResult && (
               <div className="mt-10 pt-8 border-t border-slate-200 dark:border-slate-700 animate-slideUpFade">
                  <h3 className="font-bold text-2xl text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                     <span className="text-2xl">✨</span> {t.resultsTitle}
                  </h3>
                  
                  <div className="flex flex-col md:flex-row gap-8">
                     {/* Recommendation Details */}
                     <div className="w-full md:w-1/2 flex flex-col justify-between">
                         <div>
                           <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-6">
                              {t.recommendationDesc}
                           </p>

                           <div className="bg-blue-50 dark:bg-slate-700/50 rounded-xl p-4 border border-blue-100 dark:border-slate-600 mb-6">
                              <div className="flex justify-between items-center mb-2">
                                 <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t.suggestedService}</span>
                                 <span className="text-xs text-blue-600 dark:text-blue-400 font-bold bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded">{t.durationValue}</span>
                              </div>
                              <div className="font-bold text-lg text-blue-900 dark:text-white">
                                 {t.serviceName}
                              </div>
                           </div>
                         </div>
                         
                         <button className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl py-3.5 hover:bg-slate-800 dark:hover:bg-gray-100 transition-colors shadow-md">
                           {t.bookBtn}
                         </button>
                     </div>

                     {/* Premium Preview Mock */}
                     <div className="w-full md:w-1/2">
                         <div className="rounded-2xl bg-gradient-to-br from-violet-100 to-amber-50 dark:from-violet-900/20 dark:to-amber-900/10 border border-violet-200 dark:border-violet-800/30 relative flex flex-col items-center justify-center p-8 text-center h-full min-h-[250px]">
                             <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full shadow-sm flex items-center justify-center text-2xl mb-4 border border-violet-100 dark:border-slate-700">
                                🪄
                             </div>
                             <h4 className="font-bold text-violet-900 dark:text-violet-300 mb-2">{t.premiumNotice}</h4>
                             <p className="text-xs text-violet-700/70 dark:text-violet-400/70 leading-relaxed">
                                {t.premiumNoticeDesc}
                             </p>
                             <div className="absolute top-3 right-3 flex gap-1">
                                <div className="w-2 h-2 rounded-full bg-violet-400/50"></div>
                                <div className="w-2 h-2 rounded-full bg-amber-400/50"></div>
                             </div>
                         </div>
                     </div>
                  </div>
               </div>
            )}
            
            <div className="mt-8 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 text-amber-800 dark:text-amber-400 text-xs p-4 rounded-xl shadow-sm text-center">
               {t.privacyNote}
            </div>
        </div>
      </div>
    </div>
  );
};

export default AIVisualizerPage;
