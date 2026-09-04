import React, { useState, useEffect, useCallback } from 'react';
import { SalonBusinessProfile, Staff, Service } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { customerService } from '../services/customerService';

interface SalonWebsiteViewV2Props {
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

const SalonWebsiteViewV2: React.FC<SalonWebsiteViewV2Props> = ({
  tenant,
  businessProfile,
  staffList,
  servicesList,
  onStartBooking,
  onServiceSelect,
  onStaffSelect,
  language,
  isBookingOpen = false,
  bookingComponent,
  isAiEnabled = false,
}) => {
  const { t } = useLanguage();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [savedCustomer, setSavedCustomer] = useState<any>(null);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [aiStep, setAiStep] = useState<'input' | 'processing' | 'result'>('input');
  const [aiConsentChecked, setAiConsentChecked] = useState(false);

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

  const galleryImages = [...new Set([...rawCoverImages, ...(businessProfile?.gallery_images || [])])].filter(Boolean);

  const categories = Array.from(
    new Set(servicesList.map((s) => s.category).filter(Boolean))
  ) as string[];

  const filteredServices = activeCategory === 'all'
    ? servicesList
    : servicesList.filter((s) => s.category === activeCategory);

  // Lightbox keyboard navigation
  useEffect(() => {
    if (!lightboxImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxImage(null);
      if (e.key === 'ArrowRight') {
        const idx = galleryImages.indexOf(lightboxImage);
        if (idx > -1) setLightboxImage(galleryImages[(idx + 1) % galleryImages.length]);
      }
      if (e.key === 'ArrowLeft') {
        const idx = galleryImages.indexOf(lightboxImage);
        if (idx > -1) setLightboxImage(galleryImages[idx === 0 ? galleryImages.length - 1 : idx - 1]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage, galleryImages]);

  const handleAiSimulate = () => {
    if (!aiConsentChecked) return;
    setAiStep('processing');
    setTimeout(() => {
      setAiStep('result');
    }, 1800);
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

  const isTr = language === 'tr';

  return (
    <div className="w-full min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white pb-24">
      {/* Top Banner / Identity Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {businessProfile?.logo_url ? (
              <img
                src={businessProfile.logo_url}
                alt={tenant?.name || 'Salon'}
                className="w-11 h-11 rounded-2xl object-cover ring-2 ring-indigo-500/30 shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20 shrink-0">
                {(tenant?.name || 'S').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-white truncate tracking-tight">
                {businessProfile?.public_display_name || tenant?.name || 'LARI Salon'}
              </h1>
              {businessProfile?.address && (
                <p className="text-xs text-slate-400 truncate flex items-center gap-1">
                  <span>📍</span> {businessProfile.address}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isAiEnabled && (
              <button
                onClick={() => setIsAIOpen(true)}
                className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-950/80 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-900/60 hover:border-indigo-400/50 transition-all shadow-sm"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
                <span>{isTr ? 'AI Stil Danışmanı' : 'AI Style Preview'}</span>
              </button>
            )}

            <button
              onClick={onStartBooking}
              className="px-5 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-400 hover:to-pink-400 text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all active:scale-[0.98]"
            >
              {isTr ? 'Hemen Randevu Al' : 'Book Appointment'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/20 via-slate-950 to-slate-950 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold tracking-wide uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {isTr ? 'Canlı Randevu Sistemi V2' : 'Online Booking V2'}
              </div>

              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.1]">
                {businessProfile?.seo_title || (isTr ? 'Kendinize Zaman Ayırın, Profesyonel Dokunuşla Yenilenin.' : 'Elevate Your Look with Professional Care.')}
              </h2>

              <p className="text-lg text-slate-300 max-w-2xl leading-relaxed">
                {businessProfile?.short_description || businessProfile?.about_text || (isTr ? 'En iyi güzellik ve bakım hizmetleri için hemen randevunuzu oluşturun. Uzman kadromuz ve hijyenik ortamımızla sizleri bekliyoruz.' : 'Book your appointment effortlessly. Premium beauty and care services tailored just for you.')}
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-4">
                <button
                  onClick={onStartBooking}
                  className="px-8 py-4 rounded-2xl font-bold text-base bg-white text-slate-950 hover:bg-slate-100 shadow-xl shadow-white/10 hover:shadow-white/20 transition-all active:scale-[0.98]"
                >
                  {isTr ? 'Randevunu Hemen Planla' : 'Plan Your Visit Now'}
                </button>

                {isAiEnabled && (
                  <button
                    onClick={() => setIsAIOpen(true)}
                    className="px-6 py-4 rounded-2xl font-semibold text-base bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white transition-all"
                  >
                    ✨ {isTr ? 'AI Deneyimi' : 'AI Experience'}
                  </button>
                )}
              </div>

              {savedCustomer && (
                <div className="pt-4 flex items-center gap-3 text-sm text-slate-400 bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl max-w-md">
                  <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold shrink-0">
                    ✓
                  </div>
                  <div>
                    <span className="font-semibold text-slate-200">{isTr ? 'Tekrar Hoşgeldiniz,' : 'Welcome back,'} {savedCustomer.fullName}</span>
                    <p className="text-xs text-slate-400">{isTr ? 'Bilgileriniz hazır, tek tıkla randevu alabilirsiniz.' : 'Your details are ready for fast checkout.'}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-5 relative">
              <div className="relative mx-auto rounded-3xl overflow-hidden shadow-2xl border border-slate-800 bg-slate-900 group aspect-[4/3] sm:aspect-[16/10] lg:aspect-[4/5]">
                {galleryImages.length > 0 ? (
                  <img
                    src={galleryImages[0]}
                    alt={tenant?.name || 'Salon visual'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center text-slate-600 p-8 text-center">
                    <span className="text-sm font-medium">{isTr ? 'Görsel Galerisi' : 'Visual Gallery'}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80" />
                <div className="absolute bottom-6 left-6 right-6 p-4 rounded-2xl bg-slate-900/80 backdrop-blur-md border border-slate-800/80">
                  <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-1">
                    {isTr ? 'Çalışma Saatleri' : 'Working Hours'}
                  </p>
                  <p className="text-sm font-medium text-slate-200">
                    {businessProfile?.opening_hours_summary || (isTr ? 'Pazartesi - Cumartesi: 09:00 - 20:00' : 'Mon - Sat: 09:00 - 20:00')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Embedded Booking Flow Container (If open) */}
      {isBookingOpen && bookingComponent && (
        <section id="booking-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-10 shadow-2xl">
            {bookingComponent}
          </div>
        </section>
      )}

      {/* Services Discovery Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">
              {isTr ? 'Hizmet Kataloğu' : 'Service Catalog'}
            </h3>
            <h2 className="text-3xl font-extrabold text-white">
              {isTr ? 'Popüler Bakım & Güzellik Hizmetleri' : 'Featured Services & Treatments'}
            </h2>
          </div>

          {categories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              <button
                onClick={() => setActiveCategory('all')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  activeCategory === 'all'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {isTr ? 'Tüm Hizmetler' : 'All Services'}
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                    activeCategory === cat
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredServices.map((service) => (
            <div
              key={service.id}
              className="bg-slate-900/60 border border-slate-800/80 hover:border-indigo-500/50 rounded-3xl p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/5 group"
            >
              <div>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <h4 className="font-bold text-lg text-white group-hover:text-indigo-300 transition-colors">
                    {isTr ? service.name_tr || service.name : service.name}
                  </h4>
                  <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-indigo-400 text-xs font-bold shrink-0">
                    {service.duration} {isTr ? 'dk' : 'min'}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800/60 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 block">{isTr ? 'Ücret' : 'Price'}</span>
                  <span className="text-xl font-extrabold text-white">
                    ₺{service.price}
                  </span>
                </div>
                <button
                  onClick={() => onServiceSelect(service)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all"
                >
                  {isTr ? 'Seç & Devam Et' : 'Select'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Staff / Experts Presentation */}
      {staffList.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="mb-10">
            <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">
              {isTr ? 'Uzman Kadromuz' : 'Our Team'}
            </h3>
            <h2 className="text-3xl font-extrabold text-white">
              {isTr ? 'Deneyimli ve Profesyonel Ekibimiz' : 'Meet Our Specialists'}
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {staffList.map((staff) => (
              <div
                key={staff.id}
                onClick={() => onStaffSelect && onStaffSelect(staff)}
                className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 text-center cursor-pointer hover:border-indigo-500/40 transition-all duration-300 group"
              >
                {staff.image ? (
                  <img
                    src={staff.image}
                    alt={staff.name}
                    className="w-20 h-20 rounded-full mx-auto mb-4 object-cover ring-2 ring-slate-700 group-hover:ring-indigo-500 transition-all"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-slate-300 group-hover:text-indigo-400 transition-all">
                    {staff.name.charAt(0)}
                  </div>
                )}
                <h4 className="font-bold text-base text-white group-hover:text-indigo-300 transition-colors">
                  {staff.name}
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  {staff.title || (isTr ? 'Uzman Estetisyen' : 'Specialist')}
                </p>
                <div className="mt-4 pt-4 border-t border-slate-800/60">
                  <span className="text-xs font-semibold text-indigo-400 group-hover:underline">
                    {isTr ? 'Randevu Seç' : 'Book with'} →
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Gallery Lightbox Section */}
      {galleryImages.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="mb-10">
            <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">
              {isTr ? 'Salon Atmosferi' : 'Gallery'}
            </h3>
            <h2 className="text-3xl font-extrabold text-white">
              {isTr ? 'Salonumuzdan Kareler' : 'Inside Our Salon'}
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {galleryImages.map((img, idx) => (
              <div
                key={idx}
                onClick={() => setLightboxImage(img)}
                className="aspect-square rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 cursor-pointer group relative"
              >
                <img
                  src={img}
                  alt={`Gallery ${idx + 1}`}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-xs font-bold text-white bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-700">
                    🔍 {isTr ? 'Büyüt' : 'View'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Location / Contact Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 md:p-12 grid lg:grid-cols-2 gap-8 items-center">
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-400">
              {isTr ? 'İletişim & Lokasyon' : 'Location & Contact'}
            </h3>
            <h2 className="text-3xl font-extrabold text-white">
              {businessProfile?.public_display_name || tenant?.name || 'LARI Salon'}
            </h2>

            {businessProfile?.address && (
              <div className="flex items-start gap-3 text-slate-300 text-sm">
                <span className="text-indigo-400 font-bold shrink-0">📍</span>
                <span>{businessProfile.address}</span>
              </div>
            )}

            {businessProfile?.phone && (
              <div className="flex items-center gap-3 text-slate-300 text-sm">
                <span className="text-indigo-400 font-bold shrink-0">📞</span>
                <a href={`tel:${businessProfile.phone}`} className="hover:text-indigo-300 transition-colors">
                  {businessProfile.phone}
                </a>
              </div>
            )}

            <div className="pt-4">
              <button
                onClick={onStartBooking}
                className="px-6 py-3 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all"
              >
                {isTr ? 'Yol Tarifi Al / Randevu Al' : 'Get Directions & Book'}
              </button>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 text-center space-y-3">
            <span className="text-3xl">💈</span>
            <h4 className="font-bold text-white text-base">
              {isTr ? 'Online Randevu Kolaylığı' : 'Seamless Booking'}
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
              {isTr
                ? 'Sıra beklemeden, dilediğiniz gün ve saat için anında onaylı randevunuzu oluşturun.'
                : 'Skip the line and confirm your appointment in seconds with our online platform.'}
            </p>
          </div>
        </div>
      </section>

      {/* Mobile Sticky CTA Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-slate-900/90 backdrop-blur-lg border-t border-slate-800 p-4 flex items-center justify-between gap-3 shadow-2xl">
        <div className="min-w-0">
          <p className="text-xs text-slate-400 truncate">{tenant?.name || 'Salon'}</p>
          <p className="text-sm font-bold text-white truncate">{isTr ? 'Anında Randevu' : 'Quick Booking'}</p>
        </div>
        <button
          onClick={onStartBooking}
          className="px-6 py-3 rounded-xl font-bold text-xs bg-gradient-to-r from-indigo-500 to-pink-500 text-white shadow-lg shadow-indigo-500/30 shrink-0"
        >
          {isTr ? 'Randevu Al' : 'Book Now'}
        </button>
      </div>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="relative max-w-4xl w-full max-h-[90vh]">
            <img
              src={lightboxImage}
              alt="Expanded view"
              className="w-full h-full object-contain rounded-2xl"
            />
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-slate-900/80 border border-slate-700 text-white flex items-center justify-center font-bold text-lg"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* AI Assistant Modal */}
      {isAIOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 relative space-y-6">
            <button
              onClick={() => setIsAIOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold"
            >
              ✕
            </button>

            <div className="flex items-center gap-3">
              <span className="text-2xl">✨</span>
              <div>
                <h3 className="font-bold text-lg text-white">
                  {isTr ? 'AI Stil & Bakım Danışmanı' : 'AI Style Advisor'}
                </h3>
                <p className="text-xs text-slate-400">
                  {isTr ? 'Kişiselleştirilmiş hizmet önerisi' : 'Personalized service recommendations'}
                </p>
              </div>
            </div>

            {aiStep === 'input' && (
              <div className="space-y-4 text-sm">
                <p className="text-slate-300 text-xs">
                  {isTr
                    ? 'İhtiyacınıza uygun bakımı simüle etmek ve en doğru hizmeti seçmek için devam edin.'
                    : 'Simulate your personalized care needs for optimal service matching.'}
                </p>
                <label className="flex items-start gap-3 cursor-pointer text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={aiConsentChecked}
                    onChange={(e) => setAiConsentChecked(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    {isTr
                      ? 'AI danışmanlık analizi için şartları kabul ediyorum.'
                      : 'I consent to AI analysis for personal recommendations.'}
                  </span>
                </label>
                <button
                  disabled={!aiConsentChecked}
                  onClick={handleAiSimulate}
                  className="w-full py-3 rounded-xl font-bold bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-500 text-white transition-all"
                >
                  {isTr ? 'Analizi Başlat' : 'Start Analysis'}
                </button>
              </div>
            )}

            {aiStep === 'processing' && (
              <div className="py-8 text-center space-y-3">
                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-medium text-slate-300">
                  {isTr ? 'Stil ve hizmet verileri analiz ediliyor...' : 'Analyzing style and service options...'}
                </p>
              </div>
            )}

            {aiStep === 'result' && (
              <div className="space-y-4 text-sm">
                <div className="p-4 rounded-2xl bg-indigo-950/60 border border-indigo-500/30 text-indigo-200">
                  <p className="font-bold text-xs uppercase tracking-wider text-indigo-400 mb-1">
                    {isTr ? 'Önerilen Hizmet' : 'Recommended Treatment'}
                  </p>
                  <p className="font-semibold text-white">
                    {servicesList[0]?.name || (isTr ? 'Premium Saç & Cilt Bakımı' : 'Premium Care Package')}
                  </p>
                  <p className="text-xs text-slate-300 mt-2">
                    {isTr
                      ? 'Profilinize ve saç tipinize en uygun profesyonel bakım kombinasyonu.'
                      : 'Matched based on optimal scalp and care requirements.'}
                  </p>
                </div>
                <button
                  onClick={handleAiBook}
                  className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-indigo-500 to-pink-500 text-white transition-all"
                >
                  {isTr ? 'Bu Hizmetle Randevuya Git' : 'Proceed to Booking'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SalonWebsiteViewV2;
