import React, { useState, useEffect, useCallback } from 'react';
import { SalonBusinessProfile, Staff, Service } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { customerService } from '../services/customerService';

interface SalonWebsiteViewProps {
  tenant: any;
  businessProfile: SalonBusinessProfile | null;
  staffList: Staff[];
  servicesList: Service[];
  onStartBooking: () => void;
  onServiceSelect: (service: Service) => void;
  onStaffSelect?: (staff: Staff | null, isAny?: boolean) => void;
  language: string;
  isBookingOpen?: boolean;
  bookingComponent?: React.ReactNode;
  isAiEnabled?: boolean;
}

const SalonWebsiteView: React.FC<SalonWebsiteViewProps> = ({
  tenant, businessProfile, staffList, servicesList, onStartBooking, onServiceSelect, onStaffSelect, language, isBookingOpen, bookingComponent, isAiEnabled = false
}) => {
  const [currentCoverIndex, setCurrentCoverIndex] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [savedCustomer, setSavedCustomer] = useState<any>(null);
  
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [aiStep, setAiStep] = useState<'input' | 'processing' | 'result'>('input');
  const [aiConsentChecked, setAiConsentChecked] = useState(false);
  const [aiSelectedGoal, setAiSelectedGoal] = useState('Hair');
  const [aiSelectedStyle, setAiSelectedStyle] = useState('Natural');
  
  const handleAiSimulate = () => {
     if (!aiConsentChecked) return;
     setAiStep('processing');
     setTimeout(() => {
        setAiStep('result');
     }, 2000);
  };
  
  const handleAiBook = () => {
     setIsAIOpen(false);
     setAiStep('input');
     if (servicesList.length > 0) {
        onServiceSelect(servicesList[0]);
     } else {
        onStartBooking();
     }
  };

  useEffect(() => {
    if (tenant?.id) {
       setSavedCustomer(customerService.getSavedCustomerProfile(tenant.id));
    }
  }, [tenant?.id]);

  const rawCoverImages = businessProfile?.cover_images?.length 
    ? businessProfile.cover_images 
    : businessProfile?.cover_image_url 
      ? [businessProfile.cover_image_url] 
      : [];
  
  const coverImages = [...new Set([...rawCoverImages, ...(businessProfile?.gallery_images || [])])].filter(Boolean).slice(0, 10);

  const handleNextCover = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (coverImages.length > 0) {
      setCurrentCoverIndex((prev) => (prev + 1) % coverImages.length);
    }
  }, [coverImages.length]);

  const handlePrevCover = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (coverImages.length > 0) {
       setCurrentCoverIndex((prev) => (prev === 0 ? coverImages.length - 1 : prev - 1));
    }
  }, [coverImages.length]);

  useEffect(() => {
    if (coverImages.length <= 1 || isPaused || lightboxImage) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;
    const interval = setInterval(() => handleNextCover(), 8000);
    return () => clearInterval(interval);
  }, [coverImages.length, isPaused, lightboxImage, handleNextCover]);

  // Lightbox keyboard navigation
  useEffect(() => {
     if (!lightboxImage) return;
     const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setLightboxImage(null);
        if (e.key === 'ArrowRight') {
           const idx = coverImages.indexOf(lightboxImage);
           if (idx > -1) setLightboxImage(coverImages[(idx + 1) % coverImages.length]);
        }
        if (e.key === 'ArrowLeft') {
           const idx = coverImages.indexOf(lightboxImage);
           if (idx > -1) setLightboxImage(coverImages[idx === 0 ? coverImages.length - 1 : idx - 1]);
        }
     };
     window.addEventListener('keydown', handleKeyDown);
     return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage, coverImages]);

  const directionsUrl = businessProfile?.address 
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${businessProfile.address} ${businessProfile.district || ''} ${businessProfile.city || ''}`)}` 
    : undefined;

  const displayName = businessProfile?.public_display_name || tenant?.name || 'LARİ Studio';
  const categoryStr = language === 'tr' ? 'Kuaför & Güzellik' : 'Hair & Beauty';
  const heroSlogan = businessProfile?.short_description || (language === 'tr' ? 'Şehrin en iyi saç tasarım stüdyosu.' : 'The best hair design studio in town.');

  return (
    <div className="w-full bg-slate-50 dark:bg-slate-900 min-h-[100dvh] pb-[100px] md:pb-0 font-sans text-gray-900 dark:text-white">
      
      {/* 1. Header Desktop & Mobile */}
      <header className="sticky top-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md z-40 border-b border-gray-200 dark:border-slate-800 px-4 xl:px-8 py-3 flex items-center justify-between shadow-sm">
         <div className="flex items-center gap-3">
            {businessProfile?.logo_url ? (
               <img src={businessProfile.logo_url} alt="Logo" className="w-10 h-10 rounded-lg object-cover shadow-sm bg-white border border-gray-100 dark:border-slate-700" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            ) : (
               <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm bg-accent">
                 {displayName.charAt(0)}
               </div>
            )}
            <span className="font-bold text-gray-900 dark:text-white truncate max-w-[150px] sm:max-w-xs">{displayName}</span>
         </div>

         {/* Desktop Nav */}
         <div className="hidden md:flex items-center gap-6 font-medium text-sm text-gray-600 dark:text-gray-300">
             <button onClick={() => { document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-accent transition-colors">{language === 'tr' ? 'Hizmetler' : 'Services'}</button>
             <button onClick={() => { document.getElementById('staff')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-accent transition-colors">{language === 'tr' ? 'Uzmanlar' : 'Staff'}</button>
             <button onClick={() => { document.getElementById('gallery')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-accent transition-colors">{language === 'tr' ? 'Galeri' : 'Gallery'}</button>
             <button onClick={() => { document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-accent transition-colors">{language === 'tr' ? 'Konum' : 'Location'}</button>
             {isAiEnabled && (
               <button onClick={() => setIsAIOpen(true)} className="text-violet-600 dark:text-violet-400 hover:text-violet-800 transition-colors flex items-center gap-1 font-bold">
                  <span className="text-lg">🪄</span> {language === 'tr' ? 'AI Stil Asistanı' : 'AI Style'}
               </button>
             )}
         </div>

         {/* Header CTAs */}
         <div className="flex items-center gap-3">
            <button onClick={onStartBooking} className="px-5 py-2.5 bg-accent text-white rounded-xl font-bold border border-transparent hover:bg-blue-600 hover:shadow-md transition-all truncate">
               {language === 'tr' ? 'Randevu Al' : 'Book Now'}
            </button>
         </div>
      </header>

      {/* 2. Hero Section (Gallery) */}
      <section 
         id="hero" 
         className="relative w-full h-[65vh] min-h-[550px] md:min-h-[600px] flex items-center justify-center bg-gray-900 overflow-hidden cursor-pointer"
         onMouseEnter={() => setIsPaused(true)}
         onMouseLeave={() => setIsPaused(false)}
         onClick={() => coverImages.length > 0 && setLightboxImage(coverImages[currentCoverIndex])}
      >
         {/* Background Slides */}
         {coverImages.length > 0 ? (
           coverImages.map((img, idx) => (
             <img 
                key={idx}
                src={img} 
                alt={`Slide ${idx}`} 
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${currentCoverIndex === idx ? 'opacity-70' : 'opacity-0'}`} 
                onError={(e) => { e.currentTarget.style.display = 'none'; }} 
             />
           ))
         ) : (
           <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900 opacity-80" />
         )}
         
         {/* Carousel Controls */}
         {coverImages.length > 1 && (
            <>
               <button onClick={handlePrevCover} className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 flex items-center justify-center rounded-full bg-black/30 hover:bg-black/60 text-white backdrop-blur-md transition-all sm:left-8 border border-white/10" aria-label="Previous image">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
               </button>
               <button onClick={handleNextCover} className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 flex items-center justify-center rounded-full bg-black/30 hover:bg-black/60 text-white backdrop-blur-md transition-all sm:right-8 border border-white/10" aria-label="Next image">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
               </button>
               
               {/* Indicators */}
               <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {coverImages.map((_, idx) => (
                     <button 
                       key={idx}
                       onClick={() => setCurrentCoverIndex(idx)}
                       className={`w-2 h-2 rounded-full transition-all ${currentCoverIndex === idx ? 'bg-white w-6' : 'bg-white/50 hover:bg-white/80'}`}
                       aria-label={`Go to slide ${idx + 1}`}
                     />
                  ))}
               </div>
            </>
         )}

         {/* Gradient Overlay */}
         <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-slate-900/10 pointer-events-none" />

         <div className="relative z-10 container mx-auto px-6 text-center pt-10" onClick={(e) => e.stopPropagation()}>
            <div className="cursor-default">
            {businessProfile?.logo_url ? (
              <img src={businessProfile.logo_url} alt="Profile" className="w-24 h-24 sm:w-32 sm:h-32 bg-white rounded-full border-4 border-white/20 shadow-2xl mx-auto mb-6 object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            ) : (
              <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full border-4 border-white/20 shadow-2xl mx-auto mb-6 flex items-center justify-center text-white font-bold text-4xl bg-accent bg-opacity-90">
                {displayName.charAt(0)}
              </div>
            )}
            
            <div className="inline-block px-4 py-1.5 bg-white/10 backdrop-blur-md rounded-full text-white/90 font-medium text-sm tracking-wider mb-4 border border-white/20">
               {categoryStr}
            </div>
            
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white mb-4 tracking-tight shadow-sm leading-tight max-w-4xl mx-auto">
               {displayName}
            </h1>
            
            <p className="text-lg sm:text-xl text-gray-300 font-medium max-w-2xl mx-auto leading-relaxed mb-8 text-shadow-sm">
               {heroSlogan}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 mb-10 text-sm font-semibold text-gray-300">
               <span className="flex items-center gap-1.5"><svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg> {language === 'tr' ? 'Online Randevu' : 'Online Booking'}</span>
               <span className="flex items-center gap-1.5"><svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg> {language === 'tr' ? 'Uzman Seçimi' : 'Staff Choice'}</span>
               {isAiEnabled && (
                  <span className="flex items-center gap-1.5 text-violet-300"><span className="text-lg">🪄</span> {language === 'tr' ? 'AI Stil Asistanı' : 'AI Assistant'}</span>
               )}
            </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-lg mx-auto pointer-events-auto">
               <button onClick={onStartBooking} className="hidden sm:block w-full sm:w-auto px-8 py-4 bg-accent text-white rounded-2xl font-bold text-lg shadow-xl shadow-blue-900/50 hover:-translate-y-1 hover:bg-blue-600 hover:shadow-2xl transition-all border border-blue-400/30">
                  {language === 'tr' ? 'Randevu Al' : 'Book Your Appointment'}
               </button>
               {isAiEnabled && (
                  <button onClick={() => setIsAIOpen(true)} className="hidden sm:flex w-full sm:w-auto px-8 py-4 bg-white/10 hover:bg-white/20 text-white backdrop-blur-md rounded-2xl font-bold text-lg shadow-lg hover:-translate-y-1 transition-all border border-white/20 items-center justify-center gap-2">
                     <span>🪄</span> {language === 'tr' ? 'AI Stil Asistanı ile Fikir Al' : 'AI Style Advice'}
                  </button>
               )}
            </div>
         </div>
      </section>

      {/* 2.5 Quick Action Strip */}
      <div className="w-full max-w-5xl mx-auto px-4 -mt-6 relative z-30 mb-8 hidden md:block">
         <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700/50 p-2 flex items-center justify-between gap-2 overflow-x-auto hide-scrollbar">
            <button onClick={onStartBooking} className="flex-1 flex items-center justify-center gap-2 py-3 px-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded-xl transition-colors font-bold text-gray-900 dark:text-white">
               <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
               {language === 'tr' ? 'Randevu Al' : 'Book Now'}
            </button>
            <div className="w-px h-8 bg-gray-200 dark:bg-slate-700 shrink-0" />
            {isAiEnabled && (
               <>
                  <button onClick={() => setIsAIOpen(true)} className="flex-1 flex items-center justify-center gap-2 py-3 px-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded-xl transition-colors font-bold text-violet-600 dark:text-violet-400">
                     <span className="text-xl leading-none">🪄</span>
                     {language === 'tr' ? 'AI Stil Fikri' : 'AI Style Idea'}
                  </button>
                  <div className="w-px h-8 bg-gray-200 dark:bg-slate-700 shrink-0" />
               </>
            )}
            {businessProfile?.whatsapp_number && (
               <>
                  <a href={`https://wa.me/${businessProfile.whatsapp_number.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 py-3 px-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded-xl transition-colors font-bold text-gray-900 dark:text-white">
                     <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                     WhatsApp
                  </a>
                  <div className="w-px h-8 bg-gray-200 dark:bg-slate-700 shrink-0" />
               </>
            )}
            <button onClick={() => { document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }); }} className="flex-1 flex items-center justify-center gap-2 py-3 px-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded-xl transition-colors font-bold text-gray-900 dark:text-white">
               <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
               {language === 'tr' ? 'Konum' : 'Location'}
            </button>
         </div>
      </div>

      {isBookingOpen && bookingComponent && (
         <div className="max-w-7xl mx-auto px-4 xl:px-8 py-8 animate-in slide-in-from-top-10 fade-in duration-500" id="booking-section">
            {bookingComponent}
         </div>
      )}

      <div className={`max-w-7xl mx-auto px-4 xl:px-8 space-y-24 py-16 pb-32 md:pb-16 ${isBookingOpen ? 'hidden md:block opacity-50 pointer-events-none' : ''}`}>
          
          {/* 3 & 4. Services + AI Combined Section */}
          <div className="flex flex-col xl:flex-row gap-8 items-start">
             {/* Left: Services */}
             {servicesList.length > 0 && (
                <section className="flex-1 w-full scroll-mt-24" id="services">
                   <div className="flex items-center justify-between mb-8">
                      <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">{language === 'tr' ? 'Popüler Hizmetler' : 'Popular Services'}</h2>
                      <span className="bg-blue-50 dark:bg-slate-800 text-accent px-3 py-1 text-sm font-bold rounded-full">{servicesList.length}</span>
                   </div>
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                      {servicesList.map(service => (
                          <div key={service.id} className="group flex flex-col bg-white dark:bg-slate-800 rounded-3xl border border-gray-200 dark:border-slate-700 hover:shadow-xl hover:border-accent/40 transition-all overflow-hidden h-full">
                              <div className="h-40 bg-slate-100 dark:bg-slate-700 relative overflow-hidden group/img">
                                  <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center">
                                     <svg className="w-12 h-12 text-blue-200 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
                                  </div>
                                  {service.image && (
                                      <img src={service.image} alt={service.name} className="absolute inset-0 z-10 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 group-hover/img:scale-105" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                  )}
                                  <div className="absolute top-4 right-4 z-20 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md px-3 py-1 rounded-full text-sm font-bold shadow-sm whitespace-nowrap dark:shadow-black text-gray-900 dark:text-white">
                                     {service.price} ₺
                                  </div>
                              </div>
                              <div className="p-5 flex-1 flex flex-col">
                                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">
                                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                      {service.duration} {language === 'tr' ? 'dk' : 'mins'}
                                  </div>
                                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 leading-tight group-hover:text-accent transition-colors">{language === 'tr' ? service.name_tr : service.name}</h3>
                                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 line-clamp-2">
                                     {(service as any).description || (language === 'tr' ? 'Profesyonel hizmet randevunuzu hemen oluşturun.' : 'Book this professional service today.')}
                                  </p>
                                  
                                  <button 
                                      onClick={() => onServiceSelect(service)}
                                      className="mt-auto w-full py-2.5 px-4 rounded-xl font-bold bg-blue-50 hover:bg-accent text-accent hover:text-white dark:bg-slate-700/50 dark:text-accent dark:hover:bg-accent dark:hover:text-white transition-colors border border-transparent text-center text-sm"
                                  >
                                      {language === 'tr' ? 'Bu Hizmete Randevu Al' : 'Book This'}
                                  </button>
                              </div>
                          </div>
                      ))}
                   </div>
                </section>
             )}

             {/* Right: AI Card (vertical layout) */}
             <section className="w-full xl:w-[350px] 2xl:w-[400px] shrink-0 sticky top-24 scroll-mt-24" id="ai-assistant">
                 <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-violet-900 via-indigo-900 to-fuchsia-900 p-8 text-white shadow-2xl border border-violet-700/30 w-full flex flex-col items-center text-center">
                     <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-inner border border-white/20">🪄</div>
                     <h2 className="text-2xl font-bold mb-3 tracking-tight">{language === 'tr' ? 'Ne yaptıracağınıza karar veremediniz mi?' : 'Not sure what to book?'}</h2>
                     <p className="text-violet-200 mb-8 font-medium text-sm leading-relaxed">
                          {language === 'tr' 
                             ? 'Saç, sakal veya tırnak fotoğrafınızla stil önerisi alın; size uygun hizmeti seçip randevuya devam edin.' 
                             : 'Upload your photo and let the AI Style Assistant recommend the best service for you.'}
                     </p>
                     
                     <div className="flex flex-col w-full gap-3">
                         <button 
                            onClick={() => setIsAIOpen(true)}
                            className="w-full py-4 bg-white text-violet-900 font-bold rounded-xl shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all text-sm"
                         >
                            {language === 'tr' ? 'AI ile Fikir Al' : 'Get AI Advice'}
                         </button>
                         <button 
                            onClick={onStartBooking}
                            className="w-full py-3 bg-violet-800/50 hover:bg-violet-700 text-white border border-violet-400/30 font-bold rounded-xl transition-colors text-sm"
                         >
                            {language === 'tr' ? 'Öneriye Göre Randevu Al' : 'Book Based on Advice'}
                         </button>
                     </div>
                     
                     <p className="text-[10px] text-violet-300/60 mt-8 mb-1 leading-tight">
                          {language === 'tr' 
                             ? 'Fotoğrafınız yalnızca stil önerisi amacıyla kullanılır. Kimlik tanıma veya sağlık teşhisi yapılmaz.' 
                             : 'Photos are processed for styling recommendations only. No biometric data is stored.'}
                     </p>
                 </div>
             </section>
          </div>

          {/* 5. Staff Section */}
          {staffList.length > 0 && (
            <section id="staff" className="scroll-mt-24">
              <div className="flex items-center justify-between mb-8">
                 <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">{language === 'tr' ? 'Uzmanlarımız' : 'Our Team'}</h2>
              </div>
              <div className="flex flex-wrap justify-center items-stretch gap-6">
                 
                 {/* No Preference Card */}
                 <div className="flex-1 min-w-[260px] max-w-[300px] group flex flex-col bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-slate-800 dark:to-slate-700/80 rounded-3xl border border-indigo-100 dark:border-slate-600 hover:shadow-xl hover:border-indigo-300 transition-all p-6 text-center h-full">
                    <div className="w-24 h-24 mx-auto rounded-full bg-indigo-100 dark:bg-slate-600 flex items-center justify-center text-indigo-500 dark:text-indigo-300 mb-4 shadow-inner">
                        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h3 className="font-bold text-xl text-gray-900 dark:text-white mb-2 leading-tight">{language === 'tr' ? 'Bana Fark Etmez' : 'No Preference'}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 flex-1">
                       {language === 'tr' ? 'En erken uygun uzman ve saati sizin için önerir.' : 'We will find the earliest available staff and slot for you.'}
                    </p>
                    <button 
                       onClick={() => onStaffSelect && onStaffSelect(null, true)}
                       className="w-full py-3 rounded-xl font-bold bg-white text-indigo-600 border border-indigo-200 shadow-sm hover:bg-indigo-600 hover:text-white hover:border-transparent dark:bg-slate-900 dark:text-indigo-400 dark:border-slate-700 dark:hover:bg-indigo-600 dark:hover:text-white transition-all text-sm"
                    >
                       {language === 'tr' ? 'En Erken Randevuyu Bul' : 'Find Earliest Slot'}
                    </button>
                 </div>

                 {/* Staff Cards */}
                 {staffList.map((staff) => (
                    <div key={staff.id} className="flex-1 min-w-[260px] max-w-[300px] group flex flex-col bg-white dark:bg-slate-800 rounded-3xl p-6 border border-gray-200 dark:border-slate-700 text-center hover:shadow-xl hover:border-accent/40 transition-all h-full relative">
                        {staff.id === 'stf_1' && <div className="absolute top-0 right-0 bg-gradient-to-r from-amber-400 to-yellow-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-bl-[1.5rem] shadow-sm tracking-widest uppercase">MASTER</div>}
                        
                         <div className="relative mx-auto mb-4 w-24 h-24 group/img">
                            <div className="absolute inset-0 w-24 h-24 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 font-bold text-4xl shadow-sm border-[3px] border-white dark:border-slate-800 transition-transform group-hover:scale-105">
                               {staff.name.charAt(0)}
                            </div>
                            {staff.image && (
                               <img src={staff.image} alt={staff.name} className="absolute inset-0 z-10 w-24 h-24 rounded-full object-cover shadow-sm border-[3px] border-gray-50 dark:border-slate-700 transition-transform group-hover:scale-105 group-hover/img:scale-105" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            )}
                            <div className="absolute bottom-1 right-1 z-20 w-5 h-5 bg-green-500 border-2 border-white dark:border-slate-800 rounded-full" title="Müsait"></div>
                         </div>
                        
                        <h3 className="font-bold text-xl text-gray-900 dark:text-white leading-tight mb-1">{staff.name}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-4 flex-1">{staff.title}</p>
                        
                        <button 
                           onClick={() => onStaffSelect ? onStaffSelect(staff) : onStartBooking()}
                           className="w-full py-3 px-2 rounded-xl font-bold bg-slate-50 hover:bg-accent text-slate-700 hover:text-white border border-slate-200 hover:border-transparent dark:bg-slate-700/50 dark:border-slate-600 dark:text-gray-200 dark:hover:bg-accent transition-all text-sm whitespace-nowrap overflow-hidden text-ellipsis"
                        >
                           {language === 'tr' ? 'Bu Uzmanla Randevu Al' : 'Book with Staff'}
                        </button>
                    </div>
                 ))}
              </div>
            </section>
          )}

          {/* 6. Gallery / Instagram Showcase */}
          <section id="gallery" className="scroll-mt-24">
               <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
                 <div>
                   <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white mb-2">{language === 'tr' ? 'Instagram\'dan Kareler' : 'Instagram Showcase'}</h2>
                   <p className="text-gray-500 max-w-2xl">{language === 'tr' ? 'Bizi Instagram\'da takip ederek en güncel tasarımlarımızı ve stüdyo ambiyansımızı keşfedin.' : 'Follow us on Instagram to discover our latest styles and studio ambiance.'}</p>
                 </div>
                 {businessProfile?.instagram_url && (
                    <a href={businessProfile.instagram_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-pink-50 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400 font-bold rounded-xl hover:bg-pink-100 dark:hover:bg-pink-900/50 transition-colors shrink-0">
                       <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                       {language === 'tr' ? 'Takip Et' : 'Follow'}
                    </a>
                 )}
               </div>
               
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Using gallery images if available */}
                  {(businessProfile?.gallery_images && businessProfile.gallery_images.length > 0) ? (
                      businessProfile.gallery_images.slice(0, 4).map((img, i) => (
                        <div key={i} className="aspect-square rounded-3xl overflow-hidden group bg-slate-100 dark:bg-slate-800 relative group/img">
                           <div className="absolute inset-0 bg-gradient-to-br from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center">
                              <svg className="w-8 h-8 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                           </div>
                           <img src={img} alt={`Insta fallback ${i}`} className="absolute inset-0 z-10 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 group-hover/img:scale-110" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                           <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors z-20 flex items-center justify-center opacity-0 group-hover:opacity-100">
                             <div className="flex gap-4 text-white font-bold drop-shadow-md">
                                <span className="flex items-center gap-1"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg> 124</span>
                             </div>
                           </div>
                        </div>
                      ))
                  ) : (
                      <div className="col-span-2 md:col-span-4 p-12 text-center border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-3xl">
                         <svg className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                         <p className="text-gray-500 font-medium">{language === 'tr' ? 'Instagram gönderileri burada listelenecek' : 'Instagram posts will be listed here'}</p>
                      </div>
                  )}
               </div>
          </section>

          {/* 7. Location & Contact Footer-style */}
          <section id="contact" className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 md:p-12 border border-gray-200 dark:border-slate-700 shadow-sm scroll-mt-24">
             <div className="grid md:grid-cols-2 gap-12 items-center">
                <div className="space-y-6">
                   <div>
                       <h2 className="text-3xl font-extrabold mb-4 text-gray-900 dark:text-white">{language === 'tr' ? 'İletişim & Konum' : 'Contact & Location'}</h2>
                       <p className="text-gray-600 dark:text-gray-400 font-medium leading-relaxed max-w-md">
                          {businessProfile?.about_text || (language === 'tr' ? 'Stüdyomuzu ziyaret etmek için haritadaki konumumuzu kullanabilir veya bizimle iletişime geçebilirsiniz.' : 'Visit our studio using the location details or contact us directly.')}
                       </p>
                   </div>
                   
                   <div className="bg-gray-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-gray-100 dark:border-slate-700/50 space-y-4">
                       <div className="flex items-start gap-4">
                          <div className="mt-1 text-gray-400">
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          </div>
                          <div>
                             <p className="text-sm font-medium text-gray-500 mb-1">{language === 'tr' ? 'Adres' : 'Address'}</p>
                             <p className="font-bold text-gray-900 dark:text-white line-clamp-2 leading-relaxed">
                                {businessProfile?.address ? `${businessProfile.address} ${businessProfile.district || ''} / ${businessProfile.city || ''}` : 'Örnek Mah. Güzellik Sok. No: 12 Kadıköy / İstanbul'}
                             </p>
                          </div>
                       </div>
                       
                       <div className="flex items-start gap-4">
                          <div className="mt-1 text-gray-400">
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          </div>
                          <div>
                             <p className="text-sm font-medium text-gray-500 mb-1">{language === 'tr' ? 'Çalışma Saatleri' : 'Working Hours'}</p>
                             <p className="font-bold text-gray-900 dark:text-white text-sm">{language === 'tr' ? 'Pazartesi - Cumartesi: 09:00 - 20:00' : 'Mon-Sat: 09:00-20:00'}</p>
                             <p className="font-bold text-gray-400 text-sm mt-0.5">{language === 'tr' ? 'Pazar: Kapalı' : 'Sun: Closed'}</p>
                          </div>
                       </div>

                       {businessProfile?.phone && (
                          <div className="flex items-start gap-4">
                             <div className="mt-1 text-gray-400">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                             </div>
                             <div>
                                <p className="text-sm text-gray-500 font-medium mb-1">{language === 'tr' ? 'Telefon' : 'Phone'}</p>
                                <p className="font-bold text-gray-900 dark:text-white">{businessProfile.phone}</p>
                             </div>
                          </div>
                       )}
                   </div>

                   <div className="grid grid-cols-2 gap-3 max-w-md">
                      {directionsUrl && (
                          <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white py-3 rounded-xl font-bold shadow-sm hover:shadow-md transition-all border border-gray-200 dark:border-slate-600 flex items-center justify-center gap-2 text-sm">
                             <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
                             {language === 'tr' ? 'Haritada Aç' : 'Directions'}
                          </a>
                      )}
                      
                      {businessProfile?.whatsapp_number && (
                          <a href={`https://wa.me/${businessProfile.whatsapp_number.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white dark:bg-[#25D366]/20 dark:hover:bg-[#25D366] py-3 rounded-xl font-bold shadow-sm hover:shadow-md transition-all border border-transparent flex items-center justify-center gap-2 text-sm">
                             <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                             WhatsApp
                          </a>
                      )}
                      
                      {businessProfile?.instagram_url && (
                          <a href={businessProfile.instagram_url} target="_blank" rel="noopener noreferrer" className="col-span-2 bg-pink-50 text-pink-600 hover:bg-pink-600 hover:text-white dark:bg-pink-900/20 dark:text-pink-400 dark:hover:bg-pink-600 dark:hover:text-white py-3 rounded-xl font-bold shadow-sm hover:shadow-md transition-all border border-transparent flex items-center justify-center gap-2 text-sm">
                             <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                             Instagram
                          </a>
                      )}
                      
                      <button onClick={onStartBooking} className="col-span-2 w-full bg-accent text-white py-3.5 rounded-xl font-bold shadow-md hover:bg-blue-600 hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 mt-2">
                         {language === 'tr' ? 'Hemen Randevu Al' : 'Book Now'}
                      </button>
                   </div>
                </div>
                
                {/* Map/Location Card */}
                <div className="bg-slate-100 dark:bg-slate-900 rounded-3xl h-full min-h-[400px] border border-gray-200 dark:border-slate-700 overflow-hidden relative flex flex-col items-center justify-center text-center group">
                    <div className="absolute inset-0 opacity-40 dark:opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#cbd5e1 2px, transparent 2px)', backgroundSize: '30px 30px' }}></div>
                    <div className="relative z-10 w-16 h-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center text-red-500 shadow-lg border border-gray-100 dark:border-slate-700 shadow-red-500/10">
                       <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                    </div>
                </div>
             </div>
          </section>

      </div>

      {/* Website Footer */}
      <footer className="w-full bg-slate-900 border-t border-slate-800 text-slate-300 py-12 md:py-16 overflow-hidden mt-8">
         <div className="max-w-7xl mx-auto px-4 xl:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
               <div>
                  <h3 className="text-2xl font-bold text-white mb-4 line-clamp-1">{displayName}</h3>
                  <p className="text-slate-400 max-w-sm leading-relaxed">{heroSlogan}</p>
               </div>
               <div>
                  <h4 className="font-bold text-white mb-4 uppercase tracking-wider text-sm">{language === 'tr' ? 'Hızlı Erişim' : 'Quick Links'}</h4>
                  <ul className="space-y-3 font-medium text-slate-400">
                     <li><button onClick={() => { document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-accent transition-colors">{language === 'tr' ? 'Hizmetler' : 'Services'}</button></li>
                     <li><button onClick={() => { document.getElementById('staff')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-accent transition-colors">{language === 'tr' ? 'Uzmanlar' : 'Staff'}</button></li>
                     <li><button onClick={() => setIsAIOpen(true)} className="hover:text-violet-400 transition-colors flex items-center gap-1.5"><span className="text-lg">🪄</span> {language === 'tr' ? 'AI Stil Asistanı' : 'AI Style'}</button></li>
                     <li><button onClick={() => { document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-accent transition-colors">{language === 'tr' ? 'Konum' : 'Location'}</button></li>
                  </ul>
               </div>
               <div>
                  <h4 className="font-bold text-white mb-4 uppercase tracking-wider text-sm">{language === 'tr' ? 'Destek & İletişim' : 'Support'}</h4>
                  <div className="flex items-center gap-3 mb-6">
                      {businessProfile?.whatsapp_number && (
                           <a href={`https://wa.me/${businessProfile.whatsapp_number.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-[#25D366] hover:text-white transition-colors" title="WhatsApp">
                               <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                           </a>
                      )}
                      {businessProfile?.instagram_url && (
                          <a href={businessProfile.instagram_url} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-pink-600 hover:text-white transition-colors">
                             <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                          </a>
                      )}
                  </div>
                  <button onClick={onStartBooking} className="w-full sm:w-auto px-6 py-2.5 bg-accent/20 text-accent hover:bg-accent hover:text-white rounded-xl font-bold transition-all inline-flex items-center justify-center border border-accent/30">
                     {language === 'tr' ? 'Randevu Al' : 'Book Now'}
                  </button>
               </div>
            </div>
            
            <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
               <div>&copy; {new Date().getFullYear()} {displayName}. {language === 'tr' ? 'Tüm hakları saklıdır.' : 'All rights reserved.'}</div>
               <div className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
                  <span>{language === 'tr' ? 'Bu web sitesi' : 'This website is designed with'} <strong className="text-slate-300">LARİ</strong> {language === 'tr' ? 'altyapısıyla hazırlanmıştır.' : 'infrastructure.'}</span>
               </div>
            </div>
         </div>
      </footer>

      {/* Sticky Mobile Bottom CTA Bar */}
      <div className="fixed sm:hidden bottom-0 left-0 right-0 p-4 bg-white/90 dark:bg-slate-900/95 backdrop-blur-xl border-t border-gray-200/50 dark:border-slate-800/50 z-50 flex gap-3 shadow-[0_-20px_40px_-15px_rgba(0,0,0,0.1)] pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button onClick={onStartBooking} className="flex-1 bg-accent text-white font-bold h-[52px] rounded-2xl shadow-[0_8px_16px_-6px_rgba(59,130,246,0.4)] active:scale-[0.98] transition-transform text-lg flex items-center justify-center">
             {language === 'tr' ? 'Randevu Al' : 'Book Now'}
          </button>
          {isAiEnabled && (
             <button onClick={() => setIsAIOpen(true)} className="w-[52px] h-[52px] shrink-0 bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300 font-bold rounded-2xl border border-violet-100 dark:border-violet-800 active:scale-[0.98] transition-transform text-2xl flex items-center justify-center shadow-sm">
                🪄
             </button>
          )}
      </div>

      {/* Lightbox */}
      {lightboxImage && (
         <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setLightboxImage(null)}>
            <div className="relative w-full max-w-5xl h-full flex items-center justify-center group/lightbox">
               <button className="absolute top-4 right-4 text-white hover:text-gray-300 z-50 bg-black/40 hover:bg-black/80 rounded-full w-10 h-10 flex items-center justify-center transition-colors border border-white/10" onClick={() => setLightboxImage(null)} title="Kapat">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
               </button>
               
               {coverImages.length > 1 && (
                  <>
                     <button 
                         onClick={(e) => {
                             e.stopPropagation();
                             const idx = coverImages.indexOf(lightboxImage);
                             if (idx > -1) setLightboxImage(coverImages[idx === 0 ? coverImages.length - 1 : idx - 1]);
                         }} 
                         className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 z-50 bg-black/40 hover:bg-black/80 rounded-full w-12 h-12 flex items-center justify-center transition-colors border border-white/10" 
                         title="Önceki"
                     >
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                     </button>
                     <button 
                         onClick={(e) => {
                             e.stopPropagation();
                             const idx = coverImages.indexOf(lightboxImage);
                             if (idx > -1) setLightboxImage(coverImages[(idx + 1) % coverImages.length]);
                         }} 
                         className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 z-50 bg-black/40 hover:bg-black/80 rounded-full w-12 h-12 flex items-center justify-center transition-colors border border-white/10" 
                         title="Sonraki"
                     >
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                     </button>
                  </>
               )}

               <img src={lightboxImage} alt="Enlarged" className="max-w-full max-h-[90vh] object-contain mx-auto rounded-lg shadow-2xl transition-all" onClick={(e) => e.stopPropagation()} />
            </div>
         </div>
      )}

      {/* AI Assistant Modal */}
      {isAIOpen && (
         <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center transition-all">
             <div className="bg-white dark:bg-slate-900 w-full sm:w-auto sm:min-w-[500px] max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col p-6 sm:p-8 animate-in slide-in-from-bottom-5 sm:slide-in-from-bottom-0 sm:fade-in-0 duration-300 relative border border-gray-100 dark:border-slate-800 h-[85vh] sm:h-auto overflow-y-auto">
                 <button onClick={() => setIsAIOpen(false)} className="absolute top-4 right-4 w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                 </button>
                 
                 <div className="text-center mb-6 pt-4">
                     <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/40 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 border border-violet-200 dark:border-violet-700">🪄</div>
                     <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{language === 'tr' ? 'Randevu öncesi AI Stil Asistanı' : 'AI Style Assistant'}</h3>
                     <p className="text-sm text-gray-500 dark:text-gray-400">
                         {language === 'tr' 
                            ? 'Saç, sakal veya tırnak fikrinizi görselleştirin; hangi hizmete randevu almanız gerektiğini daha kolay seçin.'
                            : 'Visualize your idea before booking.'}
                     </p>
                 </div>
                 
                 {aiStep === 'input' && (
                     <div className="flex flex-col gap-5 flex-1">
                         <div className="grid grid-cols-2 gap-3">
                             <button className="py-4 rounded-xl border border-dashed border-gray-300 dark:border-slate-700 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 text-gray-600 dark:text-gray-300 font-bold transition-all flex flex-col items-center justify-center gap-2">
                                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                                {language === 'tr' ? 'Fotoğraf Seç' : 'Upload Photo'}
                             </button>
                             <button className="py-4 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 text-gray-600 dark:text-gray-300 font-bold transition-all flex flex-col items-center justify-center gap-2">
                                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                {language === 'tr' ? 'Demo Fotoğraf Kullan' : 'Use Demo Photo'}
                             </button>
                         </div>
                         
                         <div>
                             <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">{language === 'tr' ? 'Hedef Alan' : 'Target Area'}</label>
                             <div className="flex gap-2">
                                 {['Saç', 'Sakal', 'Tırnak'].map(goal => (
                                     <button 
                                        key={goal}
                                        onClick={() => setAiSelectedGoal(goal)}
                                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${aiSelectedGoal === goal ? 'bg-violet-600 text-white border-violet-500' : 'bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:border-violet-300'}`}
                                     >
                                         {goal}
                                     </button>
                                 ))}
                             </div>
                         </div>

                         <div>
                             <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">{language === 'tr' ? 'İstenen Stil' : 'Desired Style'}</label>
                             <div className="flex flex-wrap gap-2">
                                 {['Doğal', 'Modern', 'Cesur', 'Bakımlı', 'Özel Gün'].map(style => (
                                     <button 
                                        key={style}
                                        onClick={() => setAiSelectedStyle(style)}
                                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${aiSelectedStyle === style ? 'bg-violet-600 text-white border-violet-500' : 'bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:border-violet-300'}`}
                                     >
                                         {style}
                                     </button>
                                 ))}
                             </div>
                         </div>
                         
                         <label className="flex items-start gap-3 mt-2 cursor-pointer group">
                             <div className="relative flex items-center justify-center shrink-0 mt-0.5">
                                 <input type="checkbox" checked={aiConsentChecked} onChange={(e) => setAiConsentChecked(e.target.checked)} className="peer appearance-none w-5 h-5 border-2 border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 checked:bg-violet-600 checked:border-violet-600 transition-all cursor-pointer" />
                                 <svg className="w-3.5 h-3.5 text-white absolute pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                             </div>
                             <span className="text-xs text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-300 transition-colors leading-relaxed">
                                {language === 'tr' ? 'Fotoğrafımın stil önerisi oluşturmak amacıyla işlenmesini kabul ediyorum.' : 'I agree that my photo may be processed for styling recommendations.'}
                             </span>
                         </label>

                         <button 
                            disabled={!aiConsentChecked}
                            onClick={handleAiSimulate}
                            className="w-full py-4 mt-2 bg-violet-600 text-white font-bold rounded-xl shadow-lg hover:bg-violet-700 disabled:opacity-50 disabled:hover:bg-violet-600 disabled:shadow-none transition-all flex justify-center items-center gap-2"
                         >
                            <span className="text-xl">✨</span> {language === 'tr' ? 'Tavsiye Al' : 'Get Advice'}
                         </button>
                         <p className="text-[10px] text-center text-gray-400 mt-2">
                             {language === 'tr' ? 'Fotoğrafınız yalnızca stil önerisi amacıyla kullanılır. Kimlik tanıma, yüz eşleştirme veya sağlık teşhisi yapılmaz.' : 'We do not run facial recognition or health diagnosis.'}
                         </p>
                     </div>
                 )}

                 {aiStep === 'processing' && (
                     <div className="flex flex-col items-center justify-center py-12 flex-1">
                         <div className="w-16 h-16 border-4 border-violet-100 border-t-violet-600 dark:border-violet-900/30 dark:border-t-violet-500 rounded-full animate-spin mb-6"></div>
                         <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{language === 'tr' ? 'Stiliniz Analiz Ediliyor' : 'Analyzing Style...'}</h4>
                         <p className="text-gray-500 dark:text-gray-400">{language === 'tr' ? 'En iyi hizmeti buluyoruz...' : 'Finding the best service...'}</p>
                     </div>
                 )}

                 {aiStep === 'result' && (
                     <div className="flex flex-col flex-1 animate-in fade-in zoom-in-95 duration-500">
                         <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 p-4 rounded-xl mb-6">
                            <p className="text-sm font-medium leading-relaxed">
                               {language === 'tr' ? `Harika bir seçim! ${aiSelectedStyle} tarzı bir görünüm için size profesyonel ekibimiz yardımcı olabilir. İsteğiniz için tavsiye ettiğimiz hizmeti aşağıda görebilirsiniz.` : 'Great choice! Our professionals can help you achieve that look.'}
                            </p>
                         </div>
                         
                         {servicesList.length > 0 ? (
                             <div className="bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded-2xl p-5 mb-6 shadow-sm relative overflow-hidden group">
                                 <div className="absolute top-0 right-0 bg-violet-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
                                     {language === 'tr' ? 'Önerilen Hizmet' : 'Recommended'}
                                 </div>
                                 <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-1 pr-24">{language === 'tr' ? servicesList[0].name_tr : servicesList[0].name}</h4>
                                 <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
                                     <span className="flex items-center gap-1"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> {servicesList[0].duration} dk</span>
                                     <span className="font-bold text-gray-900 dark:text-white">{servicesList[0].price} ₺</span>
                                 </div>
                                 <p className="text-xs text-gray-500 line-clamp-2">{(servicesList[0] as any).description}</p>
                             </div>
                         ) : (
                             <div className="bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-6 text-center mb-6 text-sm text-gray-600">
                                 Stüdyomuz size özel bir deneyim sunmak için hazır.
                             </div>
                         )}

                         <div className="mt-auto flex flex-col sm:flex-row gap-3">
                             <button onClick={() => setAiStep('input')} className="py-3 px-4 flex-1 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-white font-bold rounded-xl transition-colors">
                                {language === 'tr' ? 'Tekrar Dene' : 'Try Again'}
                             </button>
                             <button onClick={handleAiBook} className="py-3 px-4 flex-[2] bg-accent hover:bg-blue-600 text-white font-bold rounded-xl shadow-lg transition-colors border border-transparent shadow-blue-500/20">
                                {language === 'tr' ? 'Bu Öneriyle Randevu Al' : 'Book with this Advice'}
                             </button>
                         </div>
                     </div>
                 )}
             </div>
         </div>
      )}
    </div>
  );
};

export default SalonWebsiteView;
