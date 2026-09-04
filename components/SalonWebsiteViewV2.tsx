import React, { useState, useEffect } from 'react';
import { SalonBusinessProfile, Staff, Service } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
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
  const tenantDisplayName = businessProfile?.public_display_name || tenant?.name || 'Salon';
  const tenantDescription = businessProfile?.short_description || businessProfile?.about_text;
  const tenantSeoTitle = businessProfile?.seo_title;

  return (
    <div className="w-full min-h-screen bg-stone-950 text-stone-100 font-sans selection:bg-amber-500 selection:text-stone-950 pb-24">
      {/* Top Banner / Identity Bar */}
      <header className="sticky top-0 z-40 bg-stone-950/90 backdrop-blur-md border-b border-stone-800/80 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {businessProfile?.logo_url ? (
              <img
                src={businessProfile.logo_url}
                alt={tenantDisplayName}
                className="w-11 h-11 rounded-full object-cover ring-1 ring-stone-700 shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center font-serif text-lg font-bold text-amber-400 shrink-0">
                {tenantDisplayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold tracking-tight text-stone-100 truncate">
                {tenantDisplayName}
              </h1>
              {businessProfile?.address && (
                <p className="text-xs text-stone-400 truncate flex items-center gap-1">
                  <span>📍</span> {businessProfile.address}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isAiEnabled && (
              <button
                onClick={() => setIsAIOpen(true)}
                className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-stone-900 border border-stone-700 text-stone-300 hover:border-amber-500/50 hover:text-amber-300 transition-all"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <span>{isTr ? 'Stil Önerisi Al' : 'Style Recommendations'}</span>
              </button>
            )}

            <button
              onClick={onStartBooking}
              className="px-5 py-2.5 rounded-lg font-medium text-sm bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-md shadow-amber-500/10 transition-all active:scale-[0.98]"
            >
              {isTr ? 'Randevu Al' : 'Book Appointment'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Hero Section - Tenant First */}
      <section className="relative overflow-hidden pt-10 pb-14 md:pt-16 md:pb-20 border-b border-stone-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7 space-y-6">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-normal tracking-tight text-stone-100 leading-tight">
                {tenantSeoTitle || tenantDisplayName}
              </h2>

              <p className="text-base text-stone-300 max-w-2xl leading-relaxed">
                {tenantDescription || (isTr ? 'Hizmetlerimizi inceleyin ve size en uygun randevuyu kolayca planlayın.' : 'Explore our services and book your appointment easily.')}
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-4">
                <button
                  onClick={onStartBooking}
                  className="px-8 py-3.5 rounded-lg font-semibold text-sm bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-lg shadow-amber-500/10 transition-all active:scale-[0.98]"
                >
                  {isTr ? 'Randevunuzu Planlayın' : 'Schedule Your Visit'}
                </button>

                {isAiEnabled && (
                  <button
                    onClick={() => setIsAIOpen(true)}
                    className="px-5 py-3.5 rounded-lg font-medium text-sm bg-stone-900 border border-stone-800 text-stone-300 hover:border-stone-700 hover:text-white transition-all"
                  >
                    ✨ {isTr ? 'Stil Önerisi' : 'Style Guide'}
                  </button>
                )}
              </div>

              {savedCustomer && (
                <div className="pt-2 flex items-center gap-3 text-sm text-stone-400 bg-stone-900/80 border border-stone-800 p-4 rounded-xl max-w-md">
                  <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
                    ✓
                  </div>
                  <div>
                    <span className="font-medium text-stone-200">{isTr ? 'Tekrar Hoşgeldiniz,' : 'Welcome back,'} {savedCustomer.fullName}</span>
                    <p className="text-xs text-stone-400">{isTr ? 'Bilgileriniz hazır, hızlıca randevu alabilirsiniz.' : 'Your details are ready for quick booking.'}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-5 relative">
              <div className="relative mx-auto rounded-2xl overflow-hidden border border-stone-800 bg-stone-900 aspect-[4/3] sm:aspect-[16/10] lg:aspect-[4/5]">
                {galleryImages.length > 0 ? (
                  <img
                    src={galleryImages[0]}
                    alt={tenantDisplayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-stone-900 flex items-center justify-center text-stone-500 p-8 text-center">
                    <span className="text-sm font-medium">{tenantDisplayName}</span>
                  </div>
                )}
                {businessProfile?.opening_hours_summary && (
                  <div className="absolute bottom-4 left-4 right-4 p-3.5 rounded-xl bg-stone-950/85 backdrop-blur-md border border-stone-800">
                    <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">
                      {isTr ? 'Çalışma Saatleri' : 'Working Hours'}
                    </p>
                    <p className="text-xs font-medium text-stone-200">
                      {businessProfile.opening_hours_summary}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Embedded Booking Flow Container (If open) */}
      {isBookingOpen && bookingComponent && (
        <section id="booking-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 md:p-8 shadow-xl">
            {bookingComponent}
          </div>
        </section>
      )}

      {/* Services Discovery Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1">
              {isTr ? 'Hizmetler' : 'Services'}
            </h3>
            <h2 className="text-2xl sm:text-3xl font-serif text-stone-100">
              {isTr ? 'Hizmet Kataloğu' : 'Service Offerings'}
            </h2>
          </div>

          {categories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              <button
                onClick={() => setActiveCategory('all')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                  activeCategory === 'all'
                    ? 'bg-amber-500 text-stone-950 font-semibold'
                    : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800'
                }`}
              >
                {isTr ? 'Tüm Hizmetler' : 'All Services'}
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                    activeCategory === cat
                      ? 'bg-amber-500 text-stone-950 font-semibold'
                      : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredServices.map((service) => (
            <div
              key={service.id}
              className="bg-stone-900/70 border border-stone-800/90 hover:border-stone-700 rounded-xl p-5 flex flex-col justify-between transition-all"
            >
              <div>
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h4 className="font-medium text-base text-stone-100">
                    {isTr ? service.name_tr || service.name : service.name}
                  </h4>
                  <span className="px-2.5 py-0.5 rounded bg-stone-800 text-stone-400 text-xs font-mono shrink-0">
                    {service.duration} {isTr ? 'dk' : 'min'}
                  </span>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-stone-800/80 flex items-center justify-between">
                <div>
                  <span className="text-lg font-semibold text-stone-100">
                    ₺{service.price}
                  </span>
                </div>
                <button
                  onClick={() => onServiceSelect(service)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-stone-800 text-stone-200 hover:bg-amber-500 hover:text-stone-950 transition-colors"
                >
                  {isTr ? 'Seç' : 'Select'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Staff / Team Section */}
      {staffList.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 border-t border-stone-800/60">
          <div className="mb-8">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1">
              {isTr ? 'Ekibimiz' : 'Team'}
            </h3>
            <h2 className="text-2xl sm:text-3xl font-serif text-stone-100">
              {isTr ? 'Ekip Üyeleri' : 'Our Team Members'}
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {staffList.map((staff) => (
              <div
                key={staff.id}
                onClick={() => onStaffSelect && onStaffSelect(staff)}
                className="bg-stone-900/70 border border-stone-800/90 rounded-xl p-5 text-center cursor-pointer hover:border-stone-700 transition-all"
              >
                {staff.image ? (
                  <img
                    src={staff.image}
                    alt={staff.name}
                    className="w-16 h-16 rounded-full mx-auto mb-3 object-cover ring-1 ring-stone-700"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center mx-auto mb-3 text-lg font-serif text-amber-400 font-bold">
                    {staff.name.charAt(0)}
                  </div>
                )}
                <h4 className="font-medium text-sm text-stone-100">
                  {staff.name}
                </h4>
                {staff.title && (
                  <p className="text-xs text-stone-400 mt-0.5">
                    {staff.title}
                  </p>
                )}
                <div className="mt-3 pt-3 border-t border-stone-800/80">
                  <span className="text-xs font-medium text-amber-400 hover:underline">
                    {isTr ? 'Randevu Seç' : 'Book with'} →
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Gallery Section */}
      {galleryImages.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 border-t border-stone-800/60">
          <div className="mb-8">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1">
              {isTr ? 'Galeri' : 'Gallery'}
            </h3>
            <h2 className="text-2xl sm:text-3xl font-serif text-stone-100">
              {isTr ? 'Görseller' : 'Photo Gallery'}
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {galleryImages.map((img, idx) => (
              <div
                key={idx}
                onClick={() => setLightboxImage(img)}
                className="aspect-square rounded-xl overflow-hidden bg-stone-900 border border-stone-800 cursor-pointer group relative"
              >
                <img
                  src={img}
                  alt={`Gallery image ${idx + 1}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-stone-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-xs font-medium text-stone-200 bg-stone-900/80 px-3 py-1 rounded-md border border-stone-700">
                    🔍 {isTr ? 'Büyüt' : 'View'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Location / Contact Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 border-t border-stone-800/60">
        <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-6 md:p-10 grid lg:grid-cols-2 gap-8 items-center">
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400">
              {isTr ? 'İletişim' : 'Contact'}
            </h3>
            <h2 className="text-2xl sm:text-3xl font-serif text-stone-100">
              {tenantDisplayName}
            </h2>

            {businessProfile?.address && (
              <div className="flex items-start gap-3 text-stone-300 text-sm">
                <span className="text-amber-400 font-bold shrink-0">📍</span>
                <span>{businessProfile.address}</span>
              </div>
            )}

            {businessProfile?.phone && (
              <div className="flex items-center gap-3 text-stone-300 text-sm">
                <span className="text-amber-400 font-bold shrink-0">📞</span>
                <a href={`tel:${businessProfile.phone}`} className="hover:text-amber-300 transition-colors">
                  {businessProfile.phone}
                </a>
              </div>
            )}

            <div className="pt-2">
              <button
                onClick={onStartBooking}
                className="px-5 py-2.5 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-md shadow-amber-500/10 transition-all"
              >
                {isTr ? 'Randevu Al' : 'Book Now'}
              </button>
            </div>
          </div>

          <div className="bg-stone-950 border border-stone-800/80 rounded-xl p-6 text-center space-y-3">
            <h4 className="font-medium text-stone-200 text-sm">
              {isTr ? 'Online Randevu' : 'Online Booking'}
            </h4>
            <p className="text-xs text-stone-400 leading-relaxed max-w-sm mx-auto">
              {isTr
                ? 'Dilediğiniz gün ve saat için kolayca randevunuzu oluşturun.'
                : 'Select your preferred date and time to confirm your appointment.'}
            </p>
          </div>
        </div>
      </section>

      {/* Mobile Sticky CTA Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-stone-950/95 backdrop-blur-lg border-t border-stone-800 p-3.5 flex items-center justify-between gap-3 shadow-2xl">
        <div className="min-w-0">
          <p className="text-xs text-stone-400 truncate">{tenantDisplayName}</p>
          <p className="text-xs font-semibold text-stone-200 truncate">{isTr ? 'Online Randevu' : 'Online Booking'}</p>
        </div>
        <button
          onClick={onStartBooking}
          className="px-5 py-2.5 rounded-lg font-medium text-xs bg-amber-500 text-stone-950 shrink-0"
        >
          {isTr ? 'Randevu Al' : 'Book Now'}
        </button>
      </div>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-stone-950/90 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="relative max-w-4xl w-full max-h-[90vh]">
            <img
              src={lightboxImage}
              alt="Expanded view"
              className="w-full h-full object-contain rounded-xl"
            />
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-stone-900 border border-stone-700 text-stone-200 flex items-center justify-center font-bold text-sm"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* AI Assistant Modal */}
      {isAIOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 relative space-y-5">
            <button
              onClick={() => setIsAIOpen(false)}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-200 text-sm font-bold"
            >
              ✕
            </button>

            <div className="flex items-center gap-3">
              <span className="text-xl">✨</span>
              <div>
                <h3 className="font-semibold text-base text-stone-100">
                  {isTr ? 'Stil & Hizmet Önerisi' : 'Style & Service Guide'}
                </h3>
                <p className="text-xs text-stone-400">
                  {isTr ? 'Kişiselleştirilmiş hizmet eşleşmesi' : 'Personalized service matching'}
                </p>
              </div>
            </div>

            {aiStep === 'input' && (
              <div className="space-y-4 text-sm">
                <p className="text-stone-300 text-xs leading-relaxed">
                  {isTr
                    ? 'İhtiyacınıza uygun hizmeti belirlemek için danışmanlığı başlatabilirsiniz.'
                    : 'Start recommendation flow to match appropriate service offerings.'}
                </p>
                <label className="flex items-start gap-3 cursor-pointer text-xs text-stone-400">
                  <input
                    type="checkbox"
                    checked={aiConsentChecked}
                    onChange={(e) => setAiConsentChecked(e.target.checked)}
                    className="mt-0.5 rounded border-stone-700 bg-stone-950 text-amber-500 focus:ring-amber-500"
                  />
                  <span>
                    {isTr
                      ? 'Analiz koşullarını kabul ediyorum.'
                      : 'I consent to analysis for recommendations.'}
                  </span>
                </label>
                <button
                  disabled={!aiConsentChecked}
                  onClick={handleAiSimulate}
                  className="w-full py-2.5 rounded-lg font-medium bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-400 text-stone-950 transition-all text-xs"
                >
                  {isTr ? 'Analizi Başlat' : 'Start Analysis'}
                </button>
              </div>
            )}

            {aiStep === 'processing' && (
              <div className="py-8 text-center space-y-3">
                <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-medium text-stone-300">
                  {isTr ? 'Hizmet seçenekleri değerlendiriliyor...' : 'Evaluating service options...'}
                </p>
              </div>
            )}

            {aiStep === 'result' && (
              <div className="space-y-4 text-sm">
                <div className="p-4 rounded-xl bg-stone-950 border border-stone-800 text-stone-200">
                  <p className="font-semibold text-xs uppercase tracking-wider text-amber-400 mb-1">
                    {isTr ? 'Önerilen Hizmet' : 'Recommended Service'}
                  </p>
                  <p className="font-semibold text-stone-100">
                    {servicesList[0]?.name || (isTr ? 'Bakım Hizmeti' : 'Care Service')}
                  </p>
                </div>
                <button
                  onClick={handleAiBook}
                  className="w-full py-2.5 rounded-lg font-medium bg-amber-500 text-stone-950 text-xs transition-all"
                >
                  {isTr ? 'Bu Hizmeti Seç & Randevu Al' : 'Select Service & Book'}
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
