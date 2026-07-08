import React, { useState, useEffect } from 'react';
import { useTenant } from '../contexts/TenantContext';
import { Staff, Service, Appointment } from '../types';
import { goLiveService, GoLiveReadiness } from '../services/goLiveService';
import { createService } from '../services/serviceCatalogService';
import { createStaff } from '../services/staffService';
import { businessVerificationService } from '../services/businessVerificationService';
import { onboardingChecklistService, OnboardingReport } from '../services/onboardingChecklistService';
import { businessProfileService } from '../services/businessProfileService';
import { useDialog } from '../contexts/DialogContext';

interface OnboardingWizardProps {
  staffList: Staff[];
  servicesList: Service[];
  appointments: Appointment[];
  refreshData: () => void;
  onNavigateToTab?: (tab: 'setup' | 'appointments' | 'staff' | 'services' | 'reports' | 'billing' | 'settings') => void;
}

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ 
  staffList, 
  servicesList, 
  appointments, 
  refreshData,
  onNavigateToTab
}) => {
  const { tenant, refreshTenant, branding } = useTenant();
  const { alert: showAlert, confirm: showConfirm } = useDialog();

  const [activeStep, setActiveStep] = useState(1);
  const [onboardingReport, setOnboardingReport] = useState<OnboardingReport | null>(null);
  const [readiness, setReadiness] = useState<GoLiveReadiness | null>(null);
  const [setupSaving, setSetupSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Draft forms state - recovery from localStorage or DB values
  const [setupSalonName, setSetupSalonName] = useState(() => localStorage.getItem('lari_onboarding_salonName') || tenant?.name || '');
  const [profileCategory, setProfileCategory] = useState(() => localStorage.getItem('lari_onboarding_category') || '');
  const [profileCity, setProfileCity] = useState(() => localStorage.getItem('lari_onboarding_city') || 'İstanbul');
  const [profileDistrict, setProfileDistrict] = useState(() => localStorage.getItem('lari_onboarding_district') || '');
  const [setupSlug, setSetupSlug] = useState(() => localStorage.getItem('lari_onboarding_slug') || tenant?.slug || '');

  const [setupWhatsapp, setSetupWhatsapp] = useState(() => localStorage.getItem('lari_onboarding_whatsapp') || tenant?.branding?.whatsappNumber || '');
  const [setupPhone, setSetupPhone] = useState(() => localStorage.getItem('lari_onboarding_phone') || '');
  const [profileAddress, setProfileAddress] = useState(() => localStorage.getItem('lari_onboarding_address') || tenant?.branding?.address || '');

  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('500');
  const [newServiceDuration, setNewServiceDuration] = useState('60');

  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffTitle, setNewStaffTitle] = useState('Uzman Saç Tasarımcı');

  // Availability state
  const [activeDays, setActiveDays] = useState<string[]>(() => {
    const saved = localStorage.getItem('lari_onboarding_activeDays');
    return saved ? JSON.parse(saved) : ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  });
  const [startTime, setStartTime] = useState(() => localStorage.getItem('lari_onboarding_startTime') || '09:00');
  const [endTime, setEndTime] = useState(() => localStorage.getItem('lari_onboarding_endTime') || '20:05');

  // Branding states
  const [setupLogoUrl, setSetupLogoUrl] = useState(() => localStorage.getItem('lari_onboarding_logoUrl') || tenant?.branding?.logoUrl || '');
  const [setupPrimaryColor, setSetupPrimaryColor] = useState(() => localStorage.getItem('lari_onboarding_primaryColor') || tenant?.branding?.primaryColor || '#14b8a6');
  const [profileShortDesc, setProfileShortDesc] = useState(() => localStorage.getItem('lari_onboarding_shortDesc') || '');

  // Booking rules states
  const [autoApprove, setAutoApprove] = useState(() => localStorage.getItem('lari_onboarding_autoApprove') !== 'false');
  const [cancelPolicy, setCancelPolicy] = useState(() => localStorage.getItem('lari_onboarding_cancelPolicy') || 'Son 24 saate kadar ücretsiz iptal edilebilir.');

  // Interactive Live Preview Simulation State
  const [selectedPreviewService, setSelectedPreviewService] = useState<string | null>(null);
  const [selectedPreviewStaff, setSelectedPreviewStaff] = useState<string | null>(null);
  const [selectedPreviewTime, setSelectedPreviewTime] = useState<string | null>(null);
  const [previewBookingStatus, setPreviewBookingStatus] = useState<'idle' | 'booked'>('idle');

  // Synchronize dynamic updates with local state & recover half-entered data
  useEffect(() => {
    if (tenant) {
      if (!setupSalonName) setSetupSalonName(tenant.name || '');
      if (!setupSlug) setSetupSlug(tenant.slug || '');
      if (!setupWhatsapp) setSetupWhatsapp(tenant.branding?.whatsappNumber || '');
      if (!setupPrimaryColor) setSetupPrimaryColor(tenant.branding?.primaryColor || '#14b8a6');
      if (!profileAddress) setProfileAddress(tenant.branding?.address || '');

      businessProfileService.getBusinessProfile(tenant.id).then(prof => {
        if (prof) {
          if (!profileCategory) setProfileCategory(prof.business_category || 'Güzellik Salonu');
          if (!profileCity) setProfileCity(prof.city || 'İstanbul');
          if (!profileDistrict) setProfileDistrict(prof.district || '');
          if (!profileShortDesc) setProfileShortDesc(prof.short_description || '');
          if (!setupPhone) setSetupPhone(prof.phone || '');
        }
      });

      refreshReport();
    }
  }, [tenant]);

  // Suggest slug dynamically if empty
  useEffect(() => {
    if (setupSalonName && !setupSlug) {
      import('../services/siteProvisioningService').then(({ siteProvisioningService }) => {
        const suggested = siteProvisioningService.generateTenantSlugFromBusinessName(setupSalonName);
        setSetupSlug(suggested);
      });
    }
  }, [setupSalonName]);

  // Sync draft edits instantly to localStorage
  useEffect(() => { localStorage.setItem('lari_onboarding_salonName', setupSalonName); }, [setupSalonName]);
  useEffect(() => { localStorage.setItem('lari_onboarding_category', profileCategory); }, [profileCategory]);
  useEffect(() => { localStorage.setItem('lari_onboarding_city', profileCity); }, [profileCity]);
  useEffect(() => { localStorage.setItem('lari_onboarding_district', profileDistrict); }, [profileDistrict]);
  useEffect(() => { localStorage.setItem('lari_onboarding_slug', setupSlug); }, [setupSlug]);
  useEffect(() => { localStorage.setItem('lari_onboarding_whatsapp', setupWhatsapp); }, [setupWhatsapp]);
  useEffect(() => { localStorage.setItem('lari_onboarding_phone', setupPhone); }, [setupPhone]);
  useEffect(() => { localStorage.setItem('lari_onboarding_address', profileAddress); }, [profileAddress]);
  useEffect(() => { localStorage.setItem('lari_onboarding_startTime', startTime); }, [startTime]);
  useEffect(() => { localStorage.setItem('lari_onboarding_endTime', endTime); }, [endTime]);
  useEffect(() => { localStorage.setItem('lari_onboarding_activeDays', JSON.stringify(activeDays)); }, [activeDays]);
  useEffect(() => { localStorage.setItem('lari_onboarding_logoUrl', setupLogoUrl); }, [setupLogoUrl]);
  useEffect(() => { localStorage.setItem('lari_onboarding_primaryColor', setupPrimaryColor); }, [setupPrimaryColor]);
  useEffect(() => { localStorage.setItem('lari_onboarding_shortDesc', profileShortDesc); }, [profileShortDesc]);
  useEffect(() => { localStorage.setItem('lari_onboarding_autoApprove', String(autoApprove)); }, [autoApprove]);
  useEffect(() => { localStorage.setItem('lari_onboarding_cancelPolicy', cancelPolicy); }, [cancelPolicy]);

  const refreshReport = async () => {
    if (!tenant) return;
    const rep = await onboardingChecklistService.getOnboardingReport(tenant.id);
    setOnboardingReport(rep);
    const read = await goLiveService.getGoLiveReadiness(tenant.id);
    setReadiness(read);
  };

  const steps = [
    { id: 1, key: 'business_profile', name: 'İşletme Bilgileri', description: 'Kategori ve konum', required: true },
    { id: 2, key: 'contact_location', name: 'İletişim & Adres', description: 'WhatsApp ve telefon', required: true },
    { id: 3, key: 'services', name: 'Hizmet Kataloğu', description: 'Randevu seçimi için', required: true },
    { id: 4, key: 'staff', name: 'Uzmanlar/Personel', description: 'Ekip tanımı', required: true },
    { id: 5, key: 'availability', name: 'Çalışma Saatleri', description: 'Rezervasyon takvimi', required: true },
    { id: 6, key: 'gallery_branding', name: 'Marka & Tasarım', description: 'Renk ve Logo', required: false },
    { id: 7, key: 'booking_rules', name: 'Randevu Kuralları', description: 'politika & onay', required: false },
    { id: 8, key: 'payment_verification', name: 'Ödeme Doğrulaması', description: 'Abonelik aktivasyon', required: true },
    { id: 9, key: 'preview_review', name: 'Önizleme & Test', description: 'Tasarım kontrolü', required: true },
    { id: 10, key: 'publish_review', name: 'Yayına Al', description: 'LARİ ekibi onayı', required: true }
  ];

  // Logic to determine step status and clickability
  const isStepClickable = (stepId: number) => {
    if (stepId === 1) return true;
    
    // Check if previous required steps are fulfilled
    for (let i = 1; i < stepId; i++) {
      const stepConfig = steps.find(s => s.id === i);
      if (stepConfig && stepConfig.required) {
        // Evaluate completion using report or current fields
        if (i === 1 && (!setupSalonName || !profileCategory || !profileDistrict)) return false;
        if (i === 2 && (!setupWhatsapp || !profileAddress)) return false;
        if (i === 3 && servicesList.length === 0) return false;
        if (i === 4 && staffList.length === 0) return false;
      }
    }
    return true;
  };

  // Step 1 Save
  const handleSaveBusinessProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    if (!setupSalonName) {
      await showAlert("İşletme adı zorunludur.");
      return;
    }
    if (!profileDistrict) {
      await showAlert("Lütfen ilçe bilgisini doldurun.");
      return;
    }
    if (!setupSlug) {
      await showAlert("Özel web adresi (URL Slug) boş bırakılamaz.");
      return;
    }

    setSetupSaving(true);
    try {
      const { siteProvisioningService } = await import('../services/siteProvisioningService');
      const val = await siteProvisioningService.validateTenantSlug(setupSlug, tenant.id);
      if (!val.isValid) {
        await showAlert(val.error || "Girdiğiniz web adresi başka bir işletme tarafından kullanılıyor veya geçersiz.");
        setSetupSaving(false);
        return;
      }

      const { tenantService } = await import('../services/tenantService');
      await tenantService.updateTenantBranding(tenant.id, {
        businessName: setupSalonName,
      });
      await tenantService.updateTenant(tenant.id, {
        slug: setupSlug
      });
      await businessProfileService.updateBusinessProfile(tenant.id, {
        business_category: profileCategory,
        city: profileCity,
        district: profileDistrict,
      });
      await refreshTenant();
      await refreshReport();
      setActiveStep(2);
    } catch (err) {
      console.error(err);
      await showAlert("Kaydedilirken bir hata oluştu.");
    } finally {
      setSetupSaving(false);
    }
  };

  // Step 2 Save
  const handleSaveContactLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    if (!setupWhatsapp) {
      await showAlert("En azından bir WhatsApp iletişim numarası girilmesi zorunludur.");
      return;
    }
    if (!profileAddress) {
      await showAlert("Müşterilerinizin işletmeyi bulabilmesi için adres girmelisiniz.");
      return;
    }
    setSetupSaving(true);
    try {
      const { tenantService } = await import('../services/tenantService');
      await tenantService.updateTenantBranding(tenant.id, {
        whatsappNumber: setupWhatsapp,
        address: profileAddress
      });
      await businessProfileService.updateBusinessProfile(tenant.id, {
        phone: setupPhone,
        address: profileAddress
      });
      await refreshTenant();
      await refreshReport();
      setActiveStep(3);
    } catch (err) {
      console.error(err);
      await showAlert("Kaydedilirken bir hata oluştu.");
    } finally {
      setSetupSaving(false);
    }
  };

  // Step 3: Add Service
  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !newServiceName) return;
    setIsAdding(true);
    try {
      await createService(tenant.id, {
        name: newServiceName,
        name_tr: newServiceName,
        price: Number(newServicePrice),
        duration: Number(newServiceDuration),
        active: true,
        category: 'Ek Hizmetler',
        image: ''
      } as any);
      setNewServiceName('');
      refreshData();
      await refreshReport();
    } catch (err) {
      console.error(err);
      await showAlert('Hizmet eklenemedi.');
    } finally {
      setIsAdding(false);
    }
  };

  // Step 4: Add Staff
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !newStaffName) return;
    setIsAdding(true);
    try {
      await createStaff(tenant.id, {
        name: newStaffName,
        title: newStaffTitle,
        active: true,
        rating: 5,
        reviewCount: 0
      } as any);
      setNewStaffName('');
      refreshData();
      await refreshReport();
    } catch (err) {
      console.error(err);
      await showAlert('Çalışan eklenemedi.');
    } finally {
      setIsAdding(false);
    }
  };

  // Step 5: Save Hours
  const handleSaveAvailability = async () => {
    if (!tenant) return;
    setSetupSaving(true);
    try {
      localStorage.setItem(`lari_availability_${tenant.id}_configured`, 'true');
      await businessProfileService.updateBusinessProfile(tenant.id, {
        opening_hours_summary: `${activeDays.join(', ')} / ${startTime}-${endTime}`
      });
      await refreshReport();
      setActiveStep(6);
      await showAlert('Çalışma saatleri başarıyla yapılandırıldı.');
    } catch (err) {
      console.error(err);
    } finally {
      setSetupSaving(false);
    }
  };

  const handleToggleDay = (day: string) => {
    if (activeDays.includes(day)) {
      setActiveDays(activeDays.filter(d => d !== day));
    } else {
      setActiveDays([...activeDays, day]);
    }
  };

  // Step 6: Branding Save
  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setSetupSaving(true);
    try {
      const { tenantService } = await import('../services/tenantService');
      await tenantService.updateTenantBranding(tenant.id, {
        logoUrl: setupLogoUrl,
        primaryColor: setupPrimaryColor
      });
      await businessProfileService.updateBusinessProfile(tenant.id, {
        short_description: profileShortDesc,
        logo_url: setupLogoUrl
      });
      await refreshTenant();
      await refreshReport();
      setActiveStep(7);
    } catch (err) {
      console.error(err);
    } finally {
      setSetupSaving(false);
    }
  };

  // Step 7: Booking Rules Save
  const handleSaveBookingRules = async () => {
    if (!tenant) return;
    setSetupSaving(true);
    try {
      await businessProfileService.updateBusinessProfile(tenant.id, {
        booking_policy: autoApprove ? 'Otomatik randevu onayı etkindir.' : 'Tüm randevular salon onayı gerektirir.',
        cancellation_policy: cancelPolicy
      });
      await refreshReport();
      setActiveStep(8);
      await showAlert('Randevu kuralları kaydedildi.');
    } catch (err) {
      console.error(err);
    } finally {
      setSetupSaving(false);
    }
  };

  // Step 8: Action to pay or verify
  const handleCheckoutRedirect = () => {
    if (typeof onNavigateToTab === 'function') {
      onNavigateToTab('billing');
    } else {
      setActiveStep(10);
    }
  };

  // Mock booking event simulator for preview tab
  const handleTriggerMockBooking = async () => {
    if (!selectedPreviewService) {
      await showAlert("Lütfen test için bir hizmet seçin.");
      return;
    }
    if (!selectedPreviewStaff) {
      await showAlert("Lütfen bir uzman seçin.");
      return;
    }
    setPreviewBookingStatus('booked');
    await showAlert("Harika! Test rezervasyon simülasyonu başarıyla oluşturuldu.");
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
      {/* Sidebar with step numbers and progress indicator */}
      <div className="md:col-span-1 border-r border-slate-100 dark:border-slate-800 pr-2">
        <div className="mb-4">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Kurulum Adımları</h2>
          {onboardingReport && (
            <div className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1.5">
              <span>Kurulum İlerlemesi: %{onboardingReport.progressPercent}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          {steps.map(step => {
            const clickable = isStepClickable(step.id);
            const isCurrent = activeStep === step.id;
            return (
              <button
                key={step.id}
                disabled={!clickable}
                onClick={() => setActiveStep(step.id)}
                className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between border ${
                  isCurrent 
                    ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-bold' 
                    : clickable 
                      ? 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-400' 
                      : 'bg-transparent border-transparent text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isCurrent 
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-250' 
                      : 'bg-gray-150 dark:bg-slate-800 text-gray-500'
                  }`}>
                    {step.id}
                  </div>
                  <div>
                    <span className="text-xs block leading-tight">{step.name}</span>
                    <span className="text-[9px] font-normal block text-gray-400 dark:text-gray-500">{step.description}</span>
                  </div>
                </div>
                {step.required && (
                  <span className="text-[9px] text-red-500 dark:text-red-400 font-extrabold px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/20">*</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main step forms content */}
      <div className="md:col-span-3">
        <div className="bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
          
          {/* STEP 1: BUSINESS PROFILE */}
          {activeStep === 1 && (
            <form onSubmit={handleSaveBusinessProfile} className="space-y-5">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">1. Temel İşletme Bilgileri</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Sitenizde görüntülenecek resmi salon adı ve çalışma kategorisidir.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Resmi Salon Adı <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    required 
                    placeholder="Örn: Mia Güzellik & Saç Tasarım"
                    value={setupSalonName} 
                    onChange={e => setSetupSalonName(e.target.value)} 
                    className="w-full rounded-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white p-3 border text-sm" 
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Özel Web Adresi (URL Slug) <span className="text-red-500">*</span></label>
                  <div className="flex rounded-lg shadow-sm">
                    <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-500 dark:text-gray-400 text-xs font-mono select-none">
                      randevulari.com/
                    </span>
                    <input 
                      type="text" 
                      required 
                      placeholder="salon-adi"
                      value={setupSlug} 
                      onChange={e => {
                        const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                        setSetupSlug(val);
                      }} 
                      className="flex-1 min-w-0 block w-full px-3 py-3 rounded-none rounded-r-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white border text-sm font-mono" 
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-550 mt-1">Sadece harf, sayı ve tire içerebilir. Siteniz bu web adresi üzerinden yayına alınacaktır.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">İşletme Kategorisi <span className="text-red-500">*</span></label>
                  <select 
                    value={profileCategory} 
                    onChange={e => setProfileCategory(e.target.value)}
                    className="w-full rounded-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white p-3 border text-sm"
                  >
                    <option value="">Kategori Seçin...</option>
                    <option value="Güzellik Salonu">Güzellik Salonu</option>
                    <option value="Kuaför & Saç Tasarım">Kuaför & Saç Tasarım</option>
                    <option value="Tırnak & El-Ayak Bakımı">Tırnak & El-Ayak Bakımı</option>
                    <option value="Estetik & Cilt Bakımı">Estetik & Cilt Bakımı</option>
                    <option value="Berber / Erkek Kuaförü">Berber / Erkek Kuaförü</option>
                    <option value="Spa & Masaj">Spa & Masaj</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Bulunduğu Şehir <span className="text-red-500">*</span></label>
                    <input 
                      type="text" 
                      required 
                      value={profileCity} 
                      onChange={e => setProfileCity(e.target.value)}
                      className="w-full rounded-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white p-3 border text-sm" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Bulunduğu İlçe <span className="text-red-500">*</span></label>
                    <input 
                      type="text" 
                      required 
                      placeholder="Örn: Beşiktaş"
                      value={profileDistrict} 
                      onChange={e => setProfileDistrict(e.target.value)}
                      className="w-full rounded-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white p-3 border text-sm" 
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end border-t border-slate-100 dark:border-slate-700">
                <button 
                  type="submit" 
                  disabled={setupSaving}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs"
                >
                  {setupSaving ? 'Kaydediliyor...' : 'Kaydet ve Sonraki Adım'}
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: CONTACT & LOCATION */}
          {activeStep === 2 && (
            <form onSubmit={handleSaveContactLocation} className="space-y-5">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">2. İletişim Numaraları & Konum Tarifi</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Müşterilerinizin sizle bağlantı kuracağı ve randevuya geleceği resmi adres.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">WhatsApp İletişim Numarası <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    required 
                    placeholder="Örn: +905551234567"
                    value={setupWhatsapp} 
                    onChange={e => setSetupWhatsapp(e.target.value)} 
                    className="w-full rounded-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white p-3 border text-sm" 
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">NOT: Müşterileriniz bu hat üzerinden doğrudan size WhatsApp yazabilirler.</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Sabit/Cep Telefonu (Alternatif)</label>
                  <input 
                    type="text" 
                    placeholder="Örn: 02120000000"
                    value={setupPhone} 
                    onChange={e => setSetupPhone(e.target.value)} 
                    className="w-full rounded-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white p-3 border text-sm" 
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Açık İşletme Adresi <span className="text-red-500">*</span></label>
                  <textarea 
                    required 
                    rows={3}
                    placeholder="Örn: Levent Mah. Nispetiye Cad. No:12 D:4"
                    value={profileAddress} 
                    onChange={e => setProfileAddress(e.target.value)} 
                    className="w-full rounded-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white p-3 border text-sm"
                  ></textarea>
                </div>
              </div>

              <div className="pt-4 flex justify-between border-t border-slate-100 dark:border-slate-700">
                <button type="button" onClick={() => setActiveStep(1)} className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold">Geri</button>
                <button 
                  type="submit" 
                  disabled={setupSaving}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs"
                >
                  {setupSaving ? 'Kaydediliyor...' : 'Kaydet ve Sonraki Adım'}
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: SERVICES */}
          {activeStep === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">3. Hizmet Listenizi Oluşturun</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Müşterilerinizin online randevu seçerken yaptırmak istediği hizmetler.</p>
              </div>

              {/* Added services list */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-gray-700 dark:text-white">Ekli Hizmetler ({servicesList.length})</h4>
                <div className="border border-slate-100 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden">
                  {servicesList.map(s => (
                    <div key={s.id} className="p-3 bg-slate-50 dark:bg-slate-900/40 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-gray-800 dark:text-white">{s.name_tr || s.name}</span>
                        <span className="mx-2 text-gray-300">|</span>
                        <span className="text-gray-500">{s.duration} Dakika</span>
                      </div>
                      <div className="font-bold text-indigo-600 dark:text-indigo-400">
                        {s.price} TL
                      </div>
                    </div>
                  ))}
                  {servicesList.length === 0 && (
                    <div className="p-6 text-center text-xs text-gray-400">Henüz hiç hizmet eklemediniz. Aşağıdaki formdan ilk hizmetinizi ekleyin!</div>
                  )}
                </div>
              </div>

              {/* Quick Add Form */}
              <form onSubmit={handleAddService} className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-850 space-y-4">
                <h4 className="text-xs font-bold text-gray-800 dark:text-slate-350">Hızlı Hizmet Ekle</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Hizmet Adı</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="Örn: Saç Kesim & Fön"
                      value={newServiceName} 
                      onChange={e => setNewServiceName(e.target.value)}
                      className="w-full text-xs rounded border border-gray-300 dark:border-slate-650 bg-white dark:bg-slate-700 p-2 border-slate-200 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Fiyat (TL)</label>
                    <input 
                      type="number" 
                      required 
                      value={newServicePrice} 
                      onChange={e => setNewServicePrice(e.target.value)}
                      className="w-full text-xs rounded border border-gray-300 dark:border-slate-650 bg-white dark:bg-slate-700 p-2 border-slate-200 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Süre (Dakika)</label>
                    <input 
                      type="number" 
                      required 
                      value={newServiceDuration} 
                      onChange={e => setNewServiceDuration(e.target.value)}
                      className="w-full text-xs rounded border border-gray-300 dark:border-slate-650 bg-white dark:bg-slate-700 p-2 border-slate-200 dark:text-white"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <button 
                    type="submit" 
                    disabled={isAdding || !newServiceName}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold"
                  >
                    {isAdding ? 'Ekleniyor...' : 'Hizmet Listeye Ekle'}
                  </button>
                </div>
              </form>

              <div className="pt-4 flex justify-between border-t border-slate-100 dark:border-slate-700">
                <button type="button" onClick={() => setActiveStep(2)} className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold">Geri</button>
                <button 
                  type="button" 
                  disabled={servicesList.length === 0}
                  onClick={() => setActiveStep(4)}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg font-bold text-xs"
                >
                  Sonraki Adım
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: STAFF */}
          {activeStep === 4 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">4. Ekibinizi ve Uzmanları Tanımlayın</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Sitenizde randevu takvimi olan ve hizmeti gerçekleştirecek çalışanlar.</p>
              </div>

              {/* Added staff list */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-gray-700 dark:text-white">Ekip Üyeleri ({staffList.length})</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {staffList.map(s => (
                    <div key={s.id} className="p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700 rounded-xl flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-xs">
                        {s.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-xs text-gray-800 dark:text-white">{s.name}</div>
                        <div className="text-[10px] text-gray-400">{s.title || 'Uzman'}</div>
                      </div>
                    </div>
                  ))}
                  {staffList.length === 0 && (
                    <div className="p-6 text-center text-xs text-gray-400 col-span-2">Henüz personel eklemediniz. Herhangi bir randevu kaydı için en az 1 personel eklenmesi gerekir.</div>
                  )}
                </div>
              </div>

              {/* Quick Add Staff Form */}
              <form onSubmit={handleAddStaff} className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-850 space-y-4">
                <h4 className="text-xs font-bold text-gray-800 dark:text-slate-350">Hızlı Personel Ekle</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Ad Soyad</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="Örn: Ayşe Yılmaz"
                      value={newStaffName} 
                      onChange={e => setNewStaffName(e.target.value)}
                      className="w-full text-xs rounded border border-gray-300 dark:border-slate-650 bg-white dark:bg-slate-700 p-2 border-slate-200 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Uzmanlık Unvanı</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="Örn: Protez Tırnak Uzmanı"
                      value={newStaffTitle} 
                      onChange={e => setNewStaffTitle(e.target.value)}
                      className="w-full text-xs rounded border border-gray-300 dark:border-slate-650 bg-white dark:bg-slate-700 p-2 border-slate-200 text-gray-700 dark:text-white"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <button 
                    type="submit" 
                    disabled={isAdding || !newStaffName}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold"
                  >
                    {isAdding ? 'Ekleniyor...' : 'Çalışanı Listeye Ekle'}
                  </button>
                </div>
              </form>

              <div className="pt-4 flex justify-between border-t border-slate-100 dark:border-slate-700">
                <button type="button" onClick={() => setActiveStep(3)} className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold">Geri</button>
                <button 
                  type="button" 
                  disabled={staffList.length === 0}
                  onClick={() => setActiveStep(5)}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg font-bold text-xs"
                >
                  Sonraki Adım
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: AVAILABILITY */}
          {activeStep === 5 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">5. Çalışma Günleri ve Saatleri</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Haftalık salon açılış ve kapanış saatleri ile aktif olacağınız randevu günleri.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-650 dark:text-gray-400 mb-2">Çalışılan Günler</label>
                  <div className="flex flex-wrap gap-2">
                    {['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'].map(day => {
                      const isActive = activeDays.includes(day);
                      return (
                        <button
                          type="button"
                          key={day}
                          onClick={() => handleToggleDay(day)}
                          className={`px-3 py-1.5 text-xs rounded-lg border font-medium ${
                            isActive 
                              ? 'bg-blue-600 text-white border-blue-600' 
                              : 'bg-transparent text-gray-500 border-gray-300 dark:border-slate-700'
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Başlangıç Saati</label>
                    <select 
                      value={startTime} 
                      onChange={e => setStartTime(e.target.value)}
                      className="w-full rounded-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white p-3 border text-sm"
                    >
                      {['07:00','08:00','08:30','09:00','09:30','10:00','11:00'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Kapanış Saati</label>
                    <select 
                      value={endTime} 
                      onChange={e => setEndTime(e.target.value)}
                      className="w-full rounded-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white p-3 border text-sm"
                    >
                      {['17:00','18:00','19:00','19:30','20:00','20:30','21:00','22:00'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-between border-t border-slate-100 dark:border-slate-700">
                <button type="button" onClick={() => setActiveStep(4)} className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold">Geri</button>
                <button 
                  type="button" 
                  onClick={handleSaveAvailability}
                  disabled={activeDays.length === 0}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg font-bold text-xs"
                >
                  Ok, Kaydet ve Sonraki
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: BRANDING & GALLERY */}
          {activeStep === 6 && (
            <form onSubmit={handleSaveBranding} className="space-y-5">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">6. Görsel & Marka Kimliği (İsteğe Bağlı)</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Sitenizin müşteri gözünde şık görünmesi için logo, renk ve kısa slogan ekleyin.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Sitenin Birincil Rengi</label>
                  <div className="flex gap-2 items-center">
                    <input 
                      type="color" 
                      value={setupPrimaryColor} 
                      onChange={e => setSetupPrimaryColor(e.target.value)}
                      className="w-10 h-10 border-0 rounded cursor-pointer"
                    />
                    <span className="text-xs font-mono">{setupPrimaryColor}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">İşletme Logosu Bağlantı Adresi (URL)</label>
                  <input 
                    type="text" 
                    placeholder="https://..."
                    value={setupLogoUrl} 
                    onChange={e => setSetupLogoUrl(e.target.value)}
                    className="w-full rounded-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white p-3 border text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Müşteriler İçin Tanıtım Metni (Slogan)</label>
                  <textarea 
                    rows={2}
                    placeholder="Örn: En modern saç, tırnak ve cilt tasarımlarıyla profesyonel dokunuşlar sunuyoruz."
                    value={profileShortDesc} 
                    onChange={e => setProfileShortDesc(e.target.value)}
                    className="w-full rounded-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white p-3 border text-sm"
                  ></textarea>
                </div>
              </div>

              <div className="pt-4 flex justify-between border-t border-slate-100 dark:border-slate-700">
                <button type="button" onClick={() => setActiveStep(5)} className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold">Geri</button>
                <button 
                  type="submit" 
                  disabled={setupSaving}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs"
                >
                  Seçenekleri Kaydet ve Devam
                </button>
              </div>
            </form>
          )}

          {/* STEP 7: BOOKING RULES */}
          {activeStep === 7 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">7. Rezervasyon & Güvenlik Kuralları</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Sitenizden gelecek randevuların iptal süreleri ve onay prosedürleri.</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 rounded-xl">
                  <div>
                    <span className="text-xs font-bold text-gray-800 dark:text-white block">Otomatik Randevu Onayı</span>
                    <span className="text-[10px] text-gray-400 block">Etkinleştirildiğinde randevular sahibin manuel onayı olmadan doğrudan onaylanır.</span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={autoApprove} 
                    onChange={e => setAutoApprove(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 dark:border-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">İptal Politikası Açıklaması</label>
                  <input 
                    type="text" 
                    value={cancelPolicy} 
                    onChange={e => setCancelPolicy(e.target.value)}
                    className="w-full rounded-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white p-3 border text-sm"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-between border-t border-slate-100 dark:border-slate-700">
                <button type="button" onClick={() => setActiveStep(6)} className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold">Geri</button>
                <button 
                  type="button" 
                  onClick={handleSaveBookingRules}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs"
                >
                  Kaydet ve Devam
                </button>
              </div>
            </div>
          )}

          {/* STEP 8: SUBSCRIPTION AND PAYMENT GATE */}
          {activeStep === 8 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">8. Ödeme & Güvenli Doğrulama</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Sitenizin dış dünyaya açılması için ödeme doğrulamasını kontrol edin.</p>
              </div>

              {onboardingReport?.pendingCheckout ? (
                <div className="p-5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl space-y-4">
                  <div className="flex gap-3">
                    <span className="text-2xl">⚠️</span>
                    <div>
                      <h4 className="font-bold text-sm text-red-800 dark:text-red-400">Abonelik Engellendi (Seçili kart gerekiyor)</h4>
                      <p className="text-xs text-red-700 dark:text-red-500 mt-1">Sistemin kötü amaçlı kullanımını engellemek amacıyla 14 günlük deneme süresini başlatmadan önce bir ödeme kartı tanımlanması zorunludur.</p>
                    </div>
                  </div>
                  <div className="border-t border-red-150 pt-3 flex justify-end">
                    <button 
                      onClick={handleCheckoutRedirect}
                      className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold"
                    >
                      Kredi Kartı Ekle / Denemeyi Başlat
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-5 bg-green-50 dark:bg-green-950/25 border border-green-200 dark:border-green-800 rounded-xl space-y-3">
                  <div className="flex gap-3">
                    <span className="text-2xl">✅</span>
                    <div>
                      <h4 className="font-bold text-sm text-green-800 dark:text-green-400">Deneme Süresi / Ödeme Doğrulandı</h4>
                      <p className="text-xs text-green-700 dark:text-green-500 mt-1">14 günlük ücretsiz deneme üyeliğiniz aktiftir. Güvenlik doğrulamaları tamamlanmıştır.</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-between border-t border-slate-100 dark:border-slate-700">
                <button type="button" onClick={() => setActiveStep(7)} className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold">Geri</button>
                <button 
                  type="button" 
                  onClick={() => setActiveStep(9)}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs"
                >
                  Sonraki Adım
                </button>
              </div>
            </div>
          )}

          {/* STEP 9: LIVE PREVIEW SIMULATOR */}
          {activeStep === 9 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">9. Gerçek Zamanlı Müşteri Önizleme Simülatörü</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Yayına çıkmadan önce, müşterilerinizin cep telefonunda göreceği canlı randevu sayfasını test edin!</p>
              </div>

              {/* Interactive Mock Frame representation */}
              <div className="bg-slate-900 text-slate-100 rounded-2xl overflow-hidden border-8 border-slate-800 shadow-xl max-w-sm mx-auto">
                {/* Simulated Header */}
                <div className="p-4 bg-slate-950 text-center relative border-b border-slate-800">
                  <div className="w-1.5 h-1.5 bg-slate-750 rounded-full mx-auto mb-2"></div>
                  {setupLogoUrl ? (
                    <img referrerPolicy="no-referrer" src={setupLogoUrl} className="w-10 h-10 rounded-full mx-auto bg-white p-0.5 object-contain" alt="Logo" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-indigo-500 text-white font-bold flex items-center justify-center mx-auto text-sm">
                      {setupSalonName.substring(0,2).toUpperCase()}
                    </div>
                  )}
                  <h4 className="font-bold text-xs mt-1 text-white">{setupSalonName}</h4>
                  <p className="text-[9px] text-slate-450">{profileCategory || 'Güzellik Hizmetleri'} • {profileCity}/{profileDistrict || 'İstanbul'}</p>
                </div>

                {/* Simulated Body */}
                <div className="p-4 space-y-4 max-h-96 overflow-y-auto bg-slate-900 text-slate-150">
                  
                  {/* Slogan */}
                  {profileShortDesc && (
                    <p className="text-[10px] italic text-slate-400 text-center">"{profileShortDesc}"</p>
                  )}

                  {/* Services step */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-indigo-400 block tracking-wider uppercase">Hizmet Seçiniz</span>
                    <div className="space-y-1">
                      {servicesList.map(s => (
                        <button 
                          type="button"
                          key={s.id} 
                          onClick={() => { setSelectedPreviewService(s.id); setPreviewBookingStatus('idle'); }}
                          className={`w-full text-left p-2.5 rounded-lg border text-xs flex justify-between items-center transition ${
                            selectedPreviewService === s.id 
                              ? 'bg-indigo-950/40 border-indigo-500 text-indigo-300' 
                              : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-350'
                          }`}
                        >
                          <div>
                            <div className="font-bold">{s.name_tr || s.name}</div>
                            <div className="text-[9px] text-slate-500">{s.duration} dk</div>
                          </div>
                          <div className="font-bold text-indigo-400">{s.price} TL</div>
                        </button>
                      ))}
                      {servicesList.length === 0 && (
                        <p className="text-[10px] text-slate-500">Eklenmiş hizmet bulunmuyor.</p>
                      )}
                    </div>
                  </div>

                  {/* Staff selection */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-indigo-400 block tracking-wider uppercase">Uzman Seçiniz</span>
                    <div className="grid grid-cols-2 gap-2">
                      {staffList.map(s => (
                        <button 
                          type="button"
                          key={s.id}
                          onClick={() => { setSelectedPreviewStaff(s.id); setPreviewBookingStatus('idle'); }}
                          className={`text-center p-2 rounded-lg border text-[11px] font-medium transition ${
                            selectedPreviewStaff === s.id 
                              ? 'bg-indigo-950/40 border-indigo-500 text-indigo-300' 
                              : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-350'
                          }`}
                        >
                          <div className="text-xs font-bold">{s.name}</div>
                          <div className="text-[9px] text-slate-500">{s.title || 'Uzman'}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Booking Trigger button */}
                  {previewBookingStatus === 'booked' ? (
                    <div className="p-3 bg-green-950/20 text-green-400 rounded-lg border border-green-800 text-center text-xs">
                      🎉 Test Randevusu Tamamlandı! Gerçek sitede anında bildirim alırsınız.
                    </div>
                  ) : (
                    <button 
                      type="button"
                      onClick={handleTriggerMockBooking}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow"
                    >
                      Randevu Al (Simülasyon)
                    </button>
                  )}
                </div>
              </div>

              <div className="pt-4 flex justify-between border-t border-slate-100 dark:border-slate-700">
                <button type="button" onClick={() => setActiveStep(8)} className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold">Geri</button>
                <button 
                  type="button" 
                  onClick={() => setActiveStep(10)}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs"
                >
                  Son Adım Yayına Gönder
                </button>
              </div>
            </div>
          )}

          {/* STEP 10: PUBLISH ACTION REVIEW */}
          {activeStep === 10 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">10. Sitenizi Yayın İncelemesine Gönderin</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">LARİ editörleri güvenlik kontrollerinden geçirdikten sonra sitenizi yayına alacaktır.</p>
              </div>

              {/* Status indicators */}
              <div className="space-y-3">
                {readiness && !readiness.canGoLive ? (
                  <div className="p-4 bg-red-50 text-red-800 rounded-xl border border-red-200 space-y-2">
                    <h4 className="font-bold text-xs">Lütfen Sitenizi Yayına Göndermeden Önce Eksikleri Tamamlayın:</h4>
                    <ul className="list-disc pl-5 text-[11px] space-y-1">
                      {readiness.blockingReasons.map((reason, idx) => (
                        <li key={idx}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="p-4 bg-green-50 dark:bg-green-950/25 text-green-800 dark:text-green-300 rounded-xl border border-green-200 dark:border-green-850">
                    <p className="text-xs font-bold">Harika! Tüm zorunlu kurulum adımlarını tamamladınız.</p>
                    <p className="text-[11px] text-gray-500 mt-1">Siteniz artık onaylanmaya ve internet aramalarında görünmeye hazırdır.</p>
                  </div>
                )}
              </div>

              {/* Sitenizin Erişim Bağlantıları */}
              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Web Sitesi ve Erişim Bilgileri</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-700 rounded-lg flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400">1. Tasarım Önizleme Bağlantısı</span>
                      <p className="text-[11px] text-gray-500 mt-1">Önizleme bağlantısı, yayına almadan önce sayfanızı kontrol etmeniz içindir.</p>
                    </div>
                    <a 
                      href={`#/pilot/admin?tenant=${tenant?.id}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="mt-3.5 inline-flex items-center text-xs font-bold text-blue-600 hover:text-blue-750 dark:text-blue-400 hover:underline"
                    >
                      Önizleme Sayfasını Aç ↗
                    </a>
                  </div>

                  <div className="p-3 bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-700 rounded-lg flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400">2. Canlı Rezervasyon Bağlantısı</span>
                      {tenant?.publicSiteStatus === 'published' ? (
                        <div className="mt-1">
                          <p className="text-[11px] font-bold text-green-600 dark:text-green-400">Siteniz artık yayında ve erişilebilir!</p>
                          <p className="text-[10px] text-gray-500">Yayına alındığında müşterileriniz bu bağlantıdan randevu alabilir.</p>
                          <a 
                            href={`/booking/${setupSlug || tenant?.slug}`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="mt-1 inline-block text-xs font-mono font-bold text-indigo-600 hover:text-indigo-700 hover:underline"
                          >
                            https://{setupSlug || tenant?.slug || tenant?.id}.randevulari.com ↗
                          </a>
                        </div>
                      ) : (
                        <div className="mt-1 space-y-1">
                          <div className="text-xs font-mono text-gray-400 line-through select-none">
                            https://{setupSlug || tenant?.slug || tenant?.id}.randevulari.com
                          </div>
                          <p className="text-[10px] text-gray-550">Yayına alındığında müşterileriniz bu bağlantıdan randevu alabilir.</p>
                          <span className="inline-block text-[10px] font-bold text-amber-700 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded">
                            ⏳ yayına alındığında kullanılacak bağlantı
                          </span>
                        </div>
                      )}
                    </div>
                    <p className="text-[9px] text-gray-400 mt-2.5 leading-tight">
                      * Alan adı yönlendirmesi canlı yayın ortamında etkinleştirilir. Standart local/pre-live aşamasında olduğumuz için DNS simüle edilmektedir, gerçek wildcard DNS/SSL canlı sunucu geçişinde aktifleşecektir.
                    </p>
                  </div>
                </div>
              </div>

              {tenant?.publicSiteStatus === 'pending_review' ? (
                <div className="p-4 bg-blue-50 text-blue-800 rounded-xl text-center text-xs font-bold border border-blue-200">
                  Siteniz incelemede. LARİ editörleri onayladığında anında SMS ve E-posta alacaksınız.
                </div>
              ) : tenant?.publicSiteStatus === 'published' ? (
                <div className="p-4 bg-green-50 text-green-800 rounded-xl text-center text-xs font-bold border border-green-200">
                  Yayında! Sitenizin kurulumu onaylandı ve müşterilerinize açıldı.
                </div>
              ) : (
                <div className="flex justify-center pt-2">
                  <button 
                    disabled={readiness && !readiness.canGoLive}
                    onClick={async () => {
                      if (!tenant) return;
                      try {
                        const verifiedResult = businessVerificationService.submitForReview(tenant.id, {
                          officialBusinessName: setupSalonName,
                          publicDisplayName: setupSalonName,
                          category: profileCategory
                        });
                        
                        if (!verifiedResult.success) {
                          await showAlert('Onay Başarısız: İşletme kategorisi veya adı Lari yayın politikalarına uygun bulunamadı.');
                          await refreshReport();
                          return;
                        }

                        await goLiveService.markReadyForReview(tenant.id);
                        await showAlert("Yayın incelemesine başarıyla gönderildi. Siteniz kısa sürede aktifleştirilecektir.");
                        await refreshReport();
                      } catch(err) {
                        await showAlert("Hata oluştu.");
                      }
                    }} 
                    className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl font-bold text-xs"
                  >
                    Yayın İncelemesine Gönder
                  </button>
                </div>
              )}

              <div className="pt-4 flex justify-start border-t border-slate-100 dark:border-slate-700">
                <button type="button" onClick={() => setActiveStep(9)} className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold">Geri</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
