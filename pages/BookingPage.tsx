import React, { useState, useEffect } from 'react';
import { Service, BUSINESS_HOURS, Staff } from '../types';
import * as GeminiService from '../services/geminiService';
import * as NotificationService from '../services/notificationService';
import * as CalendarService from '../services/calendarService';
import { useLanguage } from '../contexts/LanguageContext';
import { useTenant } from '../contexts/TenantContext';
import { getStaffList } from '../services/staffService';
import { getServices } from '../services/serviceCatalogService';
import { createAppointment, getBookedSlots, updateAppointmentStatus } from '../services/appointmentService';
import { subscriptionService, SubscriptionStatus } from '../services/subscriptionService';
import { businessProfileService } from '../services/businessProfileService';
import { availabilityService } from '../services/availabilityService';
import { branchService } from '../services/branchService';
import { customerService } from '../services/customerService';
import { SalonBusinessProfile, BusinessBranch } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { canPreviewTenantSite } from '../utils/previewAuth';
import SalonWebsiteView from '../components/SalonWebsiteView';

const generateTimeSlots = (): string[] => {
  const slots: string[] = [];
  let current = BUSINESS_HOURS.start * 60; // Convert to minutes
  const end = BUSINESS_HOURS.end * 60;

  while (current < end) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    const timeString = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    slots.push(timeString);
    current += BUSINESS_HOURS.interval;
  }
  return slots;
};

const BookingPage: React.FC = () => {
  const { t, language } = useLanguage();
  const { tenant, branding } = useTenant();
  const { currentUser } = useAuth();
  const [step, setStep] = useState<number>(0);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [servicesList, setServicesList] = useState<Service[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', referrerName: '', campaignCode: '' });
  const [consentForms, setConsentForms] = useState({ requiredBookingConsent: false, reminderConsent: false, marketingConsent: false, referralConsent: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ subject: string; body: string } | null>(null);
  const [calendarLink, setCalendarLink] = useState<string>('');
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [subStatus, setSubStatus] = useState<SubscriptionStatus>('active');
  const [setupError, setSetupError] = useState<string>('');
  const [isCheckingSub, setIsCheckingSub] = useState(true);
  const [businessProfile, setBusinessProfile] = useState<SalonBusinessProfile | null>(null);
  const [staffAvailability, setStaffAvailability] = useState<Record<string, {date: string, time: string}>>({});
  const [saveProfile, setSaveProfile] = useState(false);
  const [hasSavedProfile, setHasSavedProfile] = useState(false);
  const [isAnyStaffPreselected, setIsAnyStaffPreselected] = useState(false);
  const [isAiEnabled, setIsAiEnabled] = useState(false);
  const [branches, setBranches] = useState<BusinessBranch[]>([]);
  const [isMultiBranchEnabled, setIsMultiBranchEnabled] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<BusinessBranch | null>(null);

  const timeSlots = generateTimeSlots();
  
  const requestedPreview = new URLSearchParams(window.location.hash.split('?')[1]).get('preview') === 'true';
  const urlSource = new URLSearchParams(window.location.hash.split('?')[1]).get('source') || undefined;
  const isAuthorizedPreview = requestedPreview && canPreviewTenantSite(currentUser, tenant?.id);

  useEffect(() => {
    if (tenant) {
      setIsCheckingSub(true);
      subscriptionService.getCurrentSubscription(tenant.id).then(sub => {
        if (sub) {
          setSubStatus(sub.status);
        }
        setIsCheckingSub(false);
      });
      getStaffList(tenant.id, { activeOnly: true }).then(setStaffList);
      getServices(tenant.id, { activeOnly: true }).then(setServicesList);
      businessProfileService.getPublicBusinessProfile(tenant.id).then(setBusinessProfile);
      
      const requestedBranchSlug = new URLSearchParams(window.location.hash.split('?')[1]).get('branch');
      branchService.listBranches(tenant.id).then(branches => {
         setBranches(branches);
         if (requestedBranchSlug) {
            const b = branches.find(br => br.slug === requestedBranchSlug || br.id === requestedBranchSlug);
            if (b) {
               setSelectedBranch(b);
               // step skip logic is handled down below where step starts at 0 
            }
         }
      });
      
      import('../services/goLiveService').then(({ goLiveService }) => {
        goLiveService.canTenantAcceptBookings(tenant.id).then((status) => {
           if (!status.allowed && !isAuthorizedPreview) {
             setSubStatus('expired'); // Reuse expired state UI for now
             setSetupError(status.reason || 'Online randevu sistemi henüz aktif değil.');
           }
        });
      });

      if (tenant.id === 'biz_pilot_tenant') {
         setIsAiEnabled(true);
         setIsMultiBranchEnabled(true);
      } else {
         subscriptionService.getPlanForTenant(tenant.id).then(plan => {
            setIsAiEnabled(!!(plan && plan.id !== 'free'));
            setIsMultiBranchEnabled(plan?.multiBranchEnabled || false);
         });
      }

      const saved = customerService.getSavedCustomerProfile(tenant.id);
      if (saved) {
        setHasSavedProfile(true);
        setSaveProfile(true);
        setFormData({
           name: saved.fullName || '',
           email: saved.email || '',
           phone: saved.phone || '',
           referrerName: '',
           campaignCode: ''
        });
      }
    }
  }, [tenant, currentUser, isAuthorizedPreview]);

  useEffect(() => {
    if (tenant && selectedDate && selectedStaff) {
      getBookedSlots(tenant.id, selectedDate, selectedStaff.id).then(setBookedSlots);
    }
  }, [tenant, selectedDate, selectedStaff]);

  useEffect(() => {
    if (tenant && staffList.length > 0 && selectedService) {
      staffList.forEach(staff => {
        availabilityService.getNextAvailableSlotForStaff(tenant.id, staff.id, selectedService.id).then(slot => {
          if (slot) {
            setStaffAvailability(prev => ({ ...prev, [staff.id]: slot }));
          }
        });
      });
    }
  }, [tenant, staffList, selectedService]);

  useEffect(() => {
    if (step > 0 && step < 5) {
      setTimeout(() => {
        const bookingSection = document.getElementById('booking-section');
        if (bookingSection) {
          bookingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 50);
    }
  }, [step]);

  const onStartBooking = () => {
    setSelectedService(null);
    setSelectedStaff(null);
    setIsAnyStaffPreselected(false);
    setSelectedDate(new Date().toISOString().split('T')[0]);
    setSelectedTime('');
    
    // Check if we should skip branch selection because a valid branch is already selected
    const branchAlreadySelectedAndValid = isMultiBranchEnabled && selectedBranch && branches.find(b => b.id === selectedBranch.id);
    
    if (isMultiBranchEnabled && branches.length > 1 && !branchAlreadySelectedAndValid) {
       setStep(0.5);
    } else {
       if (branches.length === 1 && !selectedBranch) setSelectedBranch(branches[0]);
       setStep(1);
    }
  };

  const currentBranchId = selectedBranch ? selectedBranch.id : undefined;

  const filteredServices = (!isMultiBranchEnabled || branches.length <= 1 || !currentBranchId)
    ? servicesList
    : servicesList.filter(s => !s.branchId || s.branchId === currentBranchId);

  const filteredStaff = (!isMultiBranchEnabled || branches.length <= 1 || !currentBranchId)
    ? staffList
    : staffList.filter(s => !s.branchId || s.branchId === currentBranchId);

  const handleWebsiteServiceSelect = (service: Service) => {
    setSelectedService(service);
    if (selectedStaff) {
       setStep(3);
    } else {
       setStep(2);
    }
  };

  const handleWebsiteStaffSelect = (staff: Staff | null, isAny: boolean = false) => {
    if (isAny) {
      setSelectedStaff(null);
      setIsAnyStaffPreselected(true);
      setStep(1);
    } else if (staff) {
      setSelectedStaff(staff);
      setIsAnyStaffPreselected(false);
      setStep(1);
    }
  };

  const handleWidgetServiceSelect = async (service: Service) => {
    setSelectedService(service);
    if (isAnyStaffPreselected && tenant) {
       // Auto-calculate earliest staff since they picked Any
       const earliest = await availabilityService.getEarliestAvailableStaff(tenant.id, service.id);
       if (earliest) {
          const earliestStaff = staffList.find(s => s.id === earliest.staffId) || staffList[0];
          setSelectedStaff(earliestStaff);
          setSelectedDate(earliest.date);
          setSelectedTime(earliest.time);
          setStep(4);
          return;
       }
    }
    if (selectedStaff) {
      setStep(3);
    } else {
      setStep(2);
    }
  };

  const handleStaffSelect = async (staff: Staff, isAny: boolean = false) => {
    if (isAny && tenant && selectedService) {
      const earliest = await availabilityService.getEarliestAvailableStaff(tenant.id, selectedService.id);
      if (earliest) {
         const earliestStaff = staffList.find(s => s.id === earliest.staffId) || staffList[0];
         setSelectedStaff(earliestStaff);
         setSelectedDate(earliest.date);
         setSelectedTime(earliest.time);
         setStep(4); // Skip time selection, since we picked earliest
         return;
      }
    }
    
    setSelectedStaff(staff);
    setStep(3);
  };

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    setStep(4);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService || !selectedTime || !selectedStaff || !tenant) return;
    if (!consentForms.requiredBookingConsent) {
       alert('Lütfen randevu işlemini tamamlamak için öncelikle kullanım iznini onaylayınız.');
       return;
    }

    setIsSubmitting(true);
    
    // Anti-Abuse Protection Check
    try {
      const { bookingAbuseProtectionService } = await import('../services/bookingAbuseProtectionService');
      const evaluation = await bookingAbuseProtectionService.evaluateBookingRequest({
        tenantId: tenant.id,
        phone: formData.phone,
        email: formData.email,
        date: selectedDate,
        serviceId: selectedService.id
      });

      if (!evaluation.allowed) {
        bookingAbuseProtectionService.recordBookingAttempt({
          tenantId: tenant.id,
          phone: formData.phone,
          email: formData.email,
          success: false
        });
        alert(evaluation.reason || 'Rezervasyon talebiniz güvenlik politikaları gereğince onaylanamadı.');
        setIsSubmitting(false);
        return;
      }
    } catch (err) {
      console.error('Abuse protection evaluation failed', err);
    }

    // Attempt dynamic import for consent service
    import('../services/consentService').then(({ consentService }) => {
       const customerId = `guest_${Date.now()}`;
       consentService.captureBookingConsent(tenant.id, {
          id: customerId,
          requiredBookingConsent: consentForms.requiredBookingConsent,
          reminderConsent: consentForms.reminderConsent,
          marketingConsent: consentForms.marketingConsent,
          referralConsent: consentForms.referralConsent
       });
    }).catch(console.error);

    import('../services/policyAcceptanceService').then(({ policyAcceptanceService }) => {
       const actorId = formData.phone || formData.email || 'anonymous';
       policyAcceptanceService.recordPolicyAcceptance({
          tenantId: tenant.id,
          actorType: 'customer',
          actorId,
          actorDisplayName: formData.name,
          actorContact: formData.phone || formData.email,
          documentType: 'booking_terms',
          acceptanceSource: 'booking'
       });
       if (consentForms.reminderConsent) {
          policyAcceptanceService.recordPolicyAcceptance({
             tenantId: tenant.id,
             actorType: 'customer',
             actorId,
             actorDisplayName: formData.name,
             actorContact: formData.phone || formData.email,
             documentType: 'communication_consent_text',
             acceptanceSource: 'booking'
          });
       }
       if (consentForms.marketingConsent) {
          policyAcceptanceService.recordPolicyAcceptance({
             tenantId: tenant.id,
             actorType: 'customer',
             actorId,
             actorDisplayName: formData.name,
             actorContact: formData.phone || formData.email,
             documentType: 'marketing_consent_text',
             acceptanceSource: 'booking'
          });
       }
    }).catch(console.error);

    import('../services/consentLedgerService').then(({ consentLedgerService }) => {
       const actorId = formData.phone || formData.email || 'anonymous';
       consentLedgerService.recordConsent({
          tenantId: tenant.id,
          actorType: 'customer',
          actorId,
          contact: formData.phone || formData.email,
          consentType: 'booking_transactional',
          status: consentForms.requiredBookingConsent ? 'granted' : 'denied',
          source: 'booking_page',
          legalDocumentType: 'booking_terms'
       });
       consentLedgerService.recordConsent({
          tenantId: tenant.id,
          actorType: 'customer',
          actorId,
          contact: formData.phone || formData.email,
          consentType: 'communication',
          status: consentForms.reminderConsent ? 'granted' : 'denied',
          source: 'booking_page',
          legalDocumentType: 'communication_consent_text'
       });
       consentLedgerService.recordConsent({
          tenantId: tenant.id,
          actorType: 'customer',
          actorId,
          contact: formData.phone || formData.email,
          consentType: 'marketing',
          status: consentForms.marketingConsent ? 'granted' : 'denied',
          source: 'booking_page',
          legalDocumentType: 'marketing_consent_text'
         });
       consentLedgerService.recordConsent({
          tenantId: tenant.id,
          actorType: 'customer',
          actorId,
          contact: formData.phone || formData.email,
          consentType: 'referral_campaign',
          status: consentForms.referralConsent ? 'granted' : 'denied',
          source: 'booking_page'
       });
    }).catch(console.error);

    if (saveProfile) {
      customerService.saveCustomerProfile(tenant.id, {
        fullName: formData.name,
        email: formData.email,
        phone: formData.phone,
        preferredLanguage: language
      });
      setHasSavedProfile(true);
    } else if (hasSavedProfile) {
      // User unchecked it, maybe we should not clear unless they explicitly clear it.
      // But we can update last appointment if they kept it checked
    } else {
       // if saveProfile is false, and hasSavedProfile is false, we do nothing
    }

    if (saveProfile && hasSavedProfile) {
       customerService.updateLastAppointmentAt(tenant.id);
    }

    const newAppointmentPayload = {
      userId: `guest_${Date.now()}`,
      user_name: formData.name,
      user_email: formData.email,
      phone: formData.phone,
      serviceId: selectedService.id,
      staffId: selectedStaff.id,
      branchId: currentBranchId,
      source: urlSource,
      date: selectedDate,
      time: selectedTime,
      status: 'confirmed' as const,
      syncedToGoogle: false, 
    };

    const newAppointment = await createAppointment(tenant.id, newAppointmentPayload);

    try {
      const { bookingAbuseProtectionService } = await import('../services/bookingAbuseProtectionService');
      bookingAbuseProtectionService.recordBookingAttempt({
        tenantId: tenant.id,
        phone: formData.phone,
        email: formData.email,
        success: true
      });
    } catch (err) {}

    if (formData.referrerName && tenant) {
      try {
        const { customerCampaignService } = await import('../services/customerCampaignService');
        const camps = await customerCampaignService.listCampaigns(tenant.id);
        const activeCamp = camps.find(c => c.isActive) || { id: 'default' };
        
        await customerCampaignService.createCustomerReferral(tenant.id, {
          campaignId: formData.campaignCode || activeCamp.id,
          referrerCustomerId: 'referred_by_' + formData.referrerName,
          referredCustomerName: formData.name,
          referredCustomerPhone: formData.phone,
          status: 'booked',
          appointmentId: newAppointment.id,
        });
      } catch (err) {
        console.warn("Failed to register customer referral during booking:", err);
      }
    }

    let aiResponse = { subject: 'Confirmation', body: 'Your appointment is booked.' };
    try {
      const serviceName = language === 'tr' ? selectedService.name_tr : selectedService.name;
      const generated = await GeminiService.generateBookingConfirmation(newAppointment, serviceName, language);
      if (generated) aiResponse = generated;
      setConfirmation(aiResponse);
    } catch (err) {
      console.error("AI generation failed", err);
    }

    const serviceName = language === 'tr' ? selectedService.name_tr : selectedService.name;
    try {
        await Promise.all([
            NotificationService.sendBookingEmail(newAppointment, serviceName, aiResponse),
            NotificationService.sendBookingSms(newAppointment, serviceName),
            CalendarService.syncToBusinessCalendar(newAppointment, selectedStaff)
        ]);
        
        await updateAppointmentStatus(tenant.id, newAppointment.id, 'confirmed'); 
    } catch (error) {
        console.error("Notification/Sync infrastructure error:", error);
    }

    const link = CalendarService.generateGoogleCalendarLink(newAppointment, selectedService, selectedStaff, language);
    setCalendarLink(link);

    const waText = language === 'tr'
      ? `Merhaba ${newAppointment.user_name}, ${serviceName} randevunuz ${selectedStaff.name} ile onaylandı!\n\nTarih: ${newAppointment.date}\nSaat: ${newAppointment.time}\nUzman Tel: ${selectedStaff.phone || 'Girilmedi'}\n\nTakviminize eklemek için tıklayın: ${link}`
      : `Hello ${newAppointment.user_name}, your ${serviceName} appointment with ${selectedStaff.name} is confirmed!\n\nDate: ${newAppointment.date}\nTime: ${newAppointment.time}\nStaff Phone: ${selectedStaff.phone || 'Not provided'}\n\nAdd to your calendar: ${link}`;

    await NotificationService.sendAutomatedWhatsApp(newAppointment, waText);
    setWhatsappSent(true);

    setIsSubmitting(false);
    setStep(5);
  };

  const renderStepper = () => {
    if (step === 0 || step === 5) return null;
    
    const stepLabels = ['Hizmet Seç', 'Uzman Seç', 'Saat Seç', 'Bilgiler'];
    const activeLabel = stepLabels[step - 1];

    return (
      <div className="mb-6 md:mb-10 max-w-2xl mx-auto">
        {/* Desktop Stepper */}
        <div className="hidden sm:flex items-center justify-between relative px-2">
          <div className="absolute left-6 right-6 top-1/2 h-0.5 bg-gray-200 dark:bg-slate-700 -z-10 w-[calc(100%-3rem)]"></div>
          {[1, 2, 3, 4].map((s, index) => (
            <div key={s} className="flex flex-col items-center z-0 bg-transparent">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 shadow-sm ${step >= s ? 'bg-accent text-white ring-4 ring-blue-50 dark:ring-blue-900/40' : 'bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 text-gray-400'}`}>
                {s}
              </div>
              <span className={`mt-2 text-xs font-semibold ${step >= s ? 'text-gray-900 dark:text-white' : 'text-gray-400'} w-20 text-center whitespace-nowrap`}>
                {stepLabels[index]}
              </span>
            </div>
          ))}
        </div>
        
        {/* Mobile Stepper */}
        <div className="sm:hidden flex flex-col items-center">
            <div className="text-xs font-bold text-accent dark:text-blue-400 uppercase tracking-wider mb-2">
               Adım {step} / 4
            </div>
            <div className="text-lg font-bold text-gray-900 dark:text-white mb-3">
               {activeLabel}
            </div>
            <div className="w-full bg-gray-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden flex">
               {[1, 2, 3, 4].map((s) => (
                 <div key={s} className={`h-full flex-1 ${s <= step ? 'bg-accent' : 'bg-transparent'} ${s < 4 ? 'border-r border-white/20 dark:border-slate-800/20' : ''}`}></div>
               ))}
            </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full min-h-screen">
      {isAuthorizedPreview && location.pathname.includes('super-admin') && (
         <div className="fixed bottom-4 right-4 z-[9999] bg-slate-900 border border-slate-700 text-white px-3 py-1.5 rounded-full text-[10px] font-bold shadow-lg pointer-events-none opacity-50 uppercase tracking-widest leading-none">
            {currentUser?.role === 'super_admin' ? 'Super Admin Preview' : 'Preview'}
         </div>
      )}
      {isCheckingSub ? (
         <div className="text-center py-12 text-gray-500">{language === 'tr' ? 'Yükleniyor...' : 'Loading...'}</div>
      ) : !isAuthorizedPreview && subStatus === 'expired' ? (
         <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-red-200 dark:border-red-900/50 p-8 text-center text-red-600 dark:text-red-400">
           <svg className="mx-auto h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m0 0v2m0-2h2m-2 0H9m-3.5 4a2.5 2.5 0 01-2.5-2.5v-10A2.5 2.5 0 015.5 4h13A2.5 2.5 0 0121 6.5v10a2.5 2.5 0 01-2.5 2.5h-13z" />
           </svg>
           <h2 className="text-2xl font-bold mb-2">{t.salon.account_suspended || 'Hizmet Geçici Olarak Kapalı'}</h2>
           <p>{setupError || '{t.salon.account_suspended_desc}'}</p>
         </div>
      ) : (
      <>
        <SalonWebsiteView 
          tenant={tenant}
          businessProfile={businessProfile}
          staffList={staffList}
          servicesList={servicesList}
          onStartBooking={onStartBooking}
          onServiceSelect={handleWebsiteServiceSelect}
          onStaffSelect={handleWebsiteStaffSelect}
          language={language}
          isBookingOpen={step > 0}
          isAiEnabled={isAiEnabled}
          bookingComponent={
            step > 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl shadow-blue-900/5 border border-gray-100 dark:border-slate-700/50 p-6 md:p-8 lg:p-10 mx-auto w-full mb-12">
                {renderStepper()}
                {/* Steps 1-4 with left/right column structure */}
                {step < 5 && (
                  <div className="grid lg:grid-cols-3 gap-8 md:gap-12 relative mt-8">
                    <div className="lg:col-span-2">
        {/* Step 0.5: Branch Selection */}
        {step === 0.5 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors duration-300">{language === 'tr' ? 'Şube Seçin' : 'Select Branch'}</h2>
              <button onClick={() => setStep(0)} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline transition-colors duration-300">{language === 'tr' ? 'Geri Dön' : 'Go Back'}</button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              {branches.map((branch) => (
                <button
                  key={branch.id}
                  onClick={() => { setSelectedBranch(branch); setStep(1); }}
                  className="flex flex-col p-5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl hover:border-accent hover:shadow-md transition-all text-left"
                >
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                     {branch.name}
                     {branch.isPrimary && <span className="text-[10px] uppercase font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full tracking-wider">Merkez</span>}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{branch.address}, {branch.district}</p>
                  {branch.phone && <p className="text-xs text-gray-400 dark:text-gray-500">📞 {branch.phone}</p>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Service Selection */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors duration-300">{t.booking.steps[1] || 'Hizmet Seçin'}</h2>
              <button onClick={() => setStep(0)} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline transition-colors duration-300">{language === 'tr' ? 'Geri Dön' : 'Go Back'}</button>
            </div>
            
            {filteredServices.length === 0 ? (
              <div className="text-center py-12">
                <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg">Şu anda seçilebilir aktif hizmet bulunmuyor.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
                {filteredServices.map((service) => (
                  <button
                    key={service.id}
                    onClick={() => handleWidgetServiceSelect(service)}
                    className="group relative flex flex-col rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-lg hover:border-accent/50 transition-all duration-300 overflow-hidden text-left"
                  >
                    <div className="w-full h-48 bg-gray-200 dark:bg-slate-700 relative overflow-hidden">
                      {service.image ? (
                          <img src={service.image} alt={service.name} referrerPolicy="no-referrer" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                      ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
                              <span className="text-sm">Görsel Yok</span>
                          </div>
                      )}
                      <div className="absolute top-3 right-3 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md px-3 py-1 rounded-full text-sm font-bold text-gray-900 dark:text-white shadow-sm border border-gray-100 dark:border-slate-700">
                          ${service.price}
                      </div>
                    </div>
                    <div className="p-5 w-full">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white group-hover:text-accent transition-colors">
                        {language === 'tr' ? service.name_tr : service.name}
                      </h3>
                      <div className="mt-3 flex items-center text-sm text-gray-500 dark:text-gray-400 gap-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>{service.duration} {language === 'tr' ? 'dk' : 'mins'}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Staff Selection */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors duration-300">{t.booking.steps[0] || 'Uzman Seçin'}</h2>
              <button onClick={() => setStep(1)} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline transition-colors duration-300">{t.booking.change_service}</button>
            </div>
            
            <div className="bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 p-4 rounded-xl text-sm justify-between shadow-sm flex items-center gap-3 transition-colors duration-300 mb-6">
               <span className="text-gray-500 dark:text-gray-300">{t.booking.selected_service}</span>
               <span className="font-bold text-gray-900 dark:text-white">{language === 'tr' ? selectedService?.name_tr : selectedService?.name}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                 onClick={() => {
                     // For "Bana Fark Etmez", simply select the first staff 
                     // In real scenario, we would calculate earliest slot across all staff
                     if (filteredStaff.length > 0) {
                        handleStaffSelect(filteredStaff[0], true);
                     }
                 }}
                 className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-slate-700 dark:to-slate-600 border-2 border-dashed border-indigo-200 dark:border-slate-500 rounded-2xl hover:border-indigo-400 dark:hover:border-slate-400 transition-colors"
               >
                 <span className="font-bold text-indigo-900 dark:text-white text-lg">{t.booking.no_preference}</span>
                 <span className="text-sm text-indigo-500 dark:text-slate-300 mt-2">{t.booking.earliest_available}</span>
              </button>

              {filteredStaff.map((staff) => (
                <button
                  key={staff.id}
                  onClick={() => handleStaffSelect(staff)}
                  className="flex flex-col md:flex-row items-center border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-2xl p-4 gap-4 hover:border-accent hover:shadow-md transition-all text-left"
                >
                  {staff.image ? (
                    <img src={staff.image} alt={staff.name} referrerPolicy="no-referrer" className="w-16 h-16 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 shrink-0 text-xl font-medium">
                      {staff.name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 dark:text-white">{staff.name}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{staff.title}</p>
                    {staffAvailability[staff.id] ? (
                       <p className="text-xs text-green-600 dark:text-green-400 font-medium mt-2 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          {language === 'tr' ? 'En yakın müsaitlik:' : 'Earliest availability:'} {staffAvailability[staff.id].date === new Date().toISOString().split('T')[0] ? (language === 'tr' ? 'Bugün' : 'Today') : staffAvailability[staff.id].date} {staffAvailability[staff.id].time}
                       </p>
                    ) : (
                       <p className="text-xs text-gray-400 font-medium mt-2 flex items-center gap-1">
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                          {t.booking.searching_availability}
                       </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Date & Time */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors duration-300">{t.booking.step2_title}</h2>
              <button onClick={() => setStep(2)} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline transition-colors duration-300">{t.booking.change_staff}</button>
            </div>
            
            <div className="bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 p-4 rounded-xl text-sm justify-between shadow-sm flex items-center gap-3 transition-colors duration-300 mb-6">
               <span className="text-gray-500 dark:text-gray-300">{t.booking.selected_staff}</span>
               <span className="font-bold text-gray-900 dark:text-white">{selectedStaff?.name}</span>
            </div>

            <div className="flex flex-col md:flex-row gap-8">
              <div className="flex-shrink-0 w-full md:w-1/3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-300">{t.booking.step2_date}</label>
                <input
                  type="date"
                  value={selectedDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="block w-full rounded-xl border-gray-300 dark:border-slate-600 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-3 border bg-gray-50 dark:bg-slate-700 dark:text-white transition-colors duration-300"
                />
              </div>

              <div className="flex-grow">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-300">{t.booking.step2_slots} ({selectedDate})</label>
                {timeSlots.length === 0 || timeSlots.every(time => bookedSlots.includes(time)) ? (
                  <div className="py-8 text-center text-gray-500 dark:text-gray-400 flex flex-col items-center bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700">
                     <svg className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                     <span>{language === 'tr' ? 'Bu gün için uygun saat yok. Başka bir gün seçebilirsiniz.' : 'No available slots for this day. Please select another day.'}</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                    {timeSlots.map((time) => {
                      const isBooked = bookedSlots.includes(time);
                      return (
                        <button
                          key={time}
                          disabled={isBooked}
                          onClick={() => handleTimeSelect(time)}
                          className={`
                            py-3 px-2 rounded-xl text-sm font-medium transition-all text-center
                            ${isBooked 
                              ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 cursor-not-allowed decoration-slice opacity-50' 
                              : 'bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:border-accent hover:text-accent dark:hover:text-accent hover:shadow-md active:bg-accent active:text-white dark:active:text-white'
                            }
                          `}
                        >
                          {time}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: User Details */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors duration-300">{t.booking.step3_title}</h2>
              <button onClick={() => setStep(3)} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline transition-colors duration-300">{t.booking.step3_change}</button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 p-4 rounded-xl text-sm text-gray-600 dark:text-gray-300 mb-4 flex justify-between items-center shadow-sm transition-colors duration-300">
              <div className="flex items-center gap-3">
                  {selectedService?.image && (
                      <img src={selectedService.image} alt="" referrerPolicy="no-referrer" className="w-10 h-10 rounded-full object-cover" />
                  )}
                  <div className="flex flex-col">
                    <span className="font-bold text-gray-900 dark:text-white">{language === 'tr' ? selectedService?.name_tr : selectedService?.name}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{language === 'tr' ? 'Uzman:' : 'with'} {selectedStaff?.name}</span>
                  </div>
              </div>
              <span className="font-semibold bg-white dark:bg-slate-800 px-3 py-1 rounded-md border border-gray-200 dark:border-slate-600 transition-colors duration-300">{selectedDate} @ {selectedTime}</span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {hasSavedProfile && (
                 <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 p-3 rounded-lg text-sm mb-4 flex justify-between items-center border border-blue-100 dark:border-blue-800">
                    <div>
                       <strong>{formData.name}</strong>
                       <p className="opacity-80">{t.booking.form.using_saved_details}</p>
                    </div>
                    <button 
                       type="button"
                       onClick={() => {
                          if (tenant) {
                             customerService.clearSavedCustomerProfile(tenant.id);
                             setHasSavedProfile(false);
                             setSaveProfile(false);
                             setFormData({name: '', email: '', phone: '', referrerName: '', campaignCode: ''});
                          }
                       }}
                       className="text-xs font-semibold bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-md border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-900 transition-colors"
                    >
                       {t.booking.form.clear_details}
                    </button>
                 </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t.booking.form.name}</label>
                <input
                  required
                  type="text"
                  name="name"
                  autoComplete="name"
                  className="mt-1 block w-full rounded-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-3 border transition-colors duration-300"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t.booking.form.email}</label>
                <input
                  required
                  type="email"
                  name="email"
                  autoComplete="email"
                  className="mt-1 block w-full rounded-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-3 border transition-colors duration-300"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t.booking.form.phone}</label>
                <input
                  required
                  type="tel"
                  name="tel"
                  autoComplete="tel"
                  className="mt-1 block w-full rounded-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-3 border transition-colors duration-300"
                  placeholder="0XXX XXX XX XX"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                />
              </div>

              <div className="border-t border-gray-200 dark:border-slate-700 pt-4 mt-2">
                <label className="block text-sm font-semibold text-indigo-950 dark:text-indigo-400 mb-1">
                  {language === 'tr' ? 'Sizi Yönlendiren Biri Var mı? (Opsiyonel)' : 'Who Referred You? (Optional)'}
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  {language === 'tr' ? 'Varsa arkadaşınızın ismini girerek kampanya ödüllerinden yararlanabilirsiniz.' : 'Enter your friend\'s name to benefit from active referrals.'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-500 font-medium mb-1">{language === 'tr' ? 'Öneren Arkadaşınız' : 'Friend\'s Name'}</label>
                    <input
                      type="text"
                      className="block w-full rounded-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white shadow-sm focus:border-accent focus:ring-accent text-xs p-2.5 border"
                      placeholder={language === 'tr' ? 'Arkadaşınızın Adı Soyadı' : 'Friend\'s full name'}
                      value={formData.referrerName}
                      onChange={(e) => setFormData({...formData, referrerName: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-500 font-medium mb-1">{language === 'tr' ? 'Kampanya / Referans Kodu' : 'Campaign/Referral Code'}</label>
                    <input
                      type="text"
                      className="block w-full rounded-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white shadow-sm focus:border-accent focus:ring-accent text-xs p-2.5 border"
                      placeholder="e.g. REF-CODE"
                      value={formData.campaignCode}
                      onChange={(e) => setFormData({...formData, campaignCode: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              {!hasSavedProfile && (
                 <div className="pt-2 px-1">
                    <label className="flex items-center gap-3 cursor-pointer group">
                       <div className="relative flex items-center">
                          <input 
                              type="checkbox" 
                              className="peer sr-only"
                              checked={saveProfile}
                              onChange={(e) => setSaveProfile(e.target.checked)}
                          />
                          <div className="w-5 h-5 border-2 border-gray-300 dark:border-slate-500 rounded bg-white dark:bg-slate-700 peer-checked:bg-accent peer-checked:border-accent transition-all duration-200 flex items-center justify-center">
                             <svg className={`w-3 h-3 text-white fill-current opacity-0 peer-checked:opacity-100 transition-opacity duration-200`} viewBox="0 0 20 20">
                                <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" fillRule="evenodd" />
                             </svg>
                          </div>
                       </div>
                       <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                          {t.booking.form.save_details}
                       </span>
                    </label>
                 </div>
              )}

              {/* Data Consent section */}
              <div className="pt-2 pb-2 space-y-3 border-t border-gray-200 dark:border-slate-700 mt-4">
                 
                 <label className="flex gap-3 cursor-pointer items-start">
                    <input 
                       type="checkbox" 
                       required
                       className="mt-1 w-4 h-4 text-accent border-gray-300 rounded focus:ring-accent"
                       checked={consentForms.requiredBookingConsent}
                       onChange={(e) => setConsentForms({...consentForms, requiredBookingConsent: e.target.checked})}
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-400 leading-tight">
                       Randevu oluşturmak ve gerektiğinde işletmenin benimle iletişime geçebilmesi için bilgilerimin kullanılmasını kabul ediyorum.* 
                       <br/><a href="/#/privacy" target="_blank" rel="noopener noreferrer" className="text-accent underline inline-flex mt-1">Gizlilik sözleşmesini okudum</a>
                    </span>
                 </label>

                 <label className="flex gap-3 cursor-pointer items-start">
                    <input 
                       type="checkbox" 
                       className="mt-0.5 w-4 h-4 text-accent border-gray-300 rounded focus:ring-accent"
                       checked={consentForms.reminderConsent}
                       onChange={(e) => setConsentForms({...consentForms, reminderConsent: e.target.checked})}
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                       Randevu hatırlatmaları, onayları ve anket bildirimleri almak istiyorum.
                    </span>
                 </label>

                 <label className="flex gap-3 cursor-pointer items-start">
                    <input 
                       type="checkbox" 
                       className="mt-0.5 w-4 h-4 text-accent border-gray-300 rounded focus:ring-accent"
                       checked={consentForms.marketingConsent}
                       onChange={(e) => setConsentForms({...consentForms, marketingConsent: e.target.checked})}
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                       Kampanya, duyuru ve avantajlar için benimle SMS/E-posta yoluyla iletişime geçilmesini onaylıyorum.
                    </span>
                 </label>
                 
                 {(formData.referrerName || formData.campaignCode) && (
                   <label className="flex gap-3 cursor-pointer items-start">
                      <input 
                         type="checkbox" 
                         className="mt-0.5 w-4 h-4 text-accent border-gray-300 rounded focus:ring-accent"
                         checked={consentForms.referralConsent}
                         onChange={(e) => setConsentForms({...consentForms, referralConsent: e.target.checked})}
                      />
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                         Referans kampanyası kapsamında bilgilerimin (isim ve işlem) bu işletme tarafından ve referans olan kişiyle kısmen paylaşılmasını/takip edilmesini kabul ediyorum.
                      </span>
                   </label>
                 )}

              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-md text-sm font-bold text-white bg-accent hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isSubmitting ? t.booking.form.processing : t.booking.form.submit}
                </button>
              </div>
            </form>
          </div>
        )}
            </div>

            {/* Desktop Appointment Summary Right Column */}
            <div className="hidden lg:block lg:col-span-1 border-l border-gray-100 dark:border-slate-700/50 pl-8 md:pl-12">
               <div className="sticky top-24 bg-slate-50 dark:bg-slate-800/80 rounded-3xl p-8 border border-gray-100 dark:border-slate-700 shadow-sm">
                  <h3 className="font-bold text-xl text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                     <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                     {language === 'tr' ? 'Randevu Özeti' : 'Booking Summary'}
                  </h3>
                  
                  <div className="space-y-5">
                     {selectedBranch && branches.length > 1 && (
                        <>
                           <div>
                              <div className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">{language === 'tr' ? 'Şube' : 'Branch'}</div>
                              <div className="font-bold text-gray-900 dark:text-white flex justify-between items-center text-base">
                                 <span>{selectedBranch.name}</span>
                              </div>
                           </div>
                           <div className="h-px w-full bg-gray-200 dark:bg-slate-700"></div>
                        </>
                     )}
                     <div>
                        <div className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">{language === 'tr' ? 'Hizmet' : 'Service'}</div>
                        {selectedService ? (
                           <div className="font-bold text-gray-900 dark:text-white flex justify-between items-center text-lg">
                              <span>{language === 'tr' ? selectedService.name_tr : selectedService.name}</span>
                              <span className="text-accent">{selectedService.price} ₺</span>
                           </div>
                        ) : (
                           <div className="text-sm text-gray-400 dark:text-gray-500 italic">{language === 'tr' ? 'Seçilmedi' : 'Not selected'}</div>
                        )}
                     </div>
                     
                     <div className="h-px w-full bg-gray-200 dark:bg-slate-700"></div>

                     <div>
                        <div className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">{language === 'tr' ? 'Uzman' : 'Staff'}</div>
                        {selectedStaff ? (
                           <div className="font-medium text-gray-900 dark:text-white text-base">
                              {selectedStaff.name}
                           </div>
                        ) : (
                           <div className="text-sm text-gray-400 dark:text-gray-500 italic">{language === 'tr' ? 'Seçilmedi' : 'Not selected'}</div>
                        )}
                     </div>

                     <div className="h-px w-full bg-gray-200 dark:bg-slate-700"></div>

                     <div>
                        <div className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">{language === 'tr' ? 'Tarih & Saat' : 'Date & Time'}</div>
                        {selectedTime && selectedDate ? (
                           <div className="font-medium text-gray-900 dark:text-white text-base">
                              {selectedDate} <span className="font-bold text-accent mx-2">•</span> {selectedTime}
                           </div>
                        ) : (
                           <div className="text-sm text-gray-400 dark:text-gray-500 italic">{language === 'tr' ? 'Seçilmedi' : 'Not selected'}</div>
                        )}
                     </div>
                  </div>
                  
                  <div className="mt-8 p-4 bg-blue-50 dark:bg-slate-700/50 rounded-2xl flex items-start gap-3">
                     <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-slate-600 flex items-center justify-center shrink-0 text-accent">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                     </div>
                     <p className="text-xs text-blue-900 dark:text-blue-100 font-medium leading-relaxed">
                        {language === 'tr' 
                           ? 'Randevu bilgilerinizi tamamladıktan sonra uzmanınız ve saatiniz kesinleşecektir.' 
                           : 'Your appointment will be confirmed once you complete your details.'}
                     </p>
                  </div>
               </div>
            </div>
          </div>
        )}

        {/* Step 5: Success */}
        {step === 5 && (
          <div className="text-center py-8">
            <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/40 mb-6 transition-colors duration-300">
              <svg className="h-10 w-10 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-2 transition-colors duration-300">{t.booking.step5_title}</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6 transition-colors duration-300">{t.booking.step5_subtitle}</p>

            {whatsappSent && formData.phone && (
              <div className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 p-4 rounded-xl border border-green-200 dark:border-green-800 mb-6 text-sm font-medium flex items-center gap-3 shadow-sm mx-auto max-w-sm transition-colors duration-300">
                <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                {t.booking.step5_whatsapp_sent_to} {formData.phone}
              </div>
            )}

            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl max-w-sm mx-auto mb-8 overflow-hidden shadow-sm text-left">
              <div className="bg-gray-50 dark:bg-slate-800/80 px-4 py-3 border-b border-gray-200 dark:border-slate-700">
                 <h4 className="font-bold text-gray-900 dark:text-white uppercase tracking-wide text-xs">{language === 'tr' ? 'Randevu Detayları' : 'Appointment Details'}</h4>
              </div>
              <div className="p-4 space-y-4">
                 <div>
                    <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mb-1">{language === 'tr' ? 'İşletme' : 'Business'}</div>
                    <div className="font-medium text-gray-900 dark:text-white">{branding?.businessName || tenant?.name}</div>
                 </div>
                 <div className="h-px border-b border-dashed border-gray-200 dark:border-slate-700"></div>
                 <div>
                    <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mb-1">{language === 'tr' ? 'Hizmet' : 'Service'}</div>
                    <div className="font-medium text-gray-900 dark:text-white">{language === 'tr' ? selectedService?.name_tr : selectedService?.name}</div>
                 </div>
                 <div className="h-px border-b border-dashed border-gray-200 dark:border-slate-700"></div>
                 <div>
                    <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mb-1">{language === 'tr' ? 'Tarih & Saat' : 'Date & Time'}</div>
                    <div className="font-medium text-gray-900 dark:text-white">{selectedDate} <span className="text-accent font-bold">•</span> {selectedTime}</div>
                 </div>
                 <div className="h-px border-b border-dashed border-gray-200 dark:border-slate-700"></div>
                 <div>
                    <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mb-1">{language === 'tr' ? 'Müşteri Bilgisi' : 'Customer Info'}</div>
                    <div className="font-medium text-gray-900 dark:text-white">{formData.name} <span className="opacity-70 font-normal ml-1">({formData.phone})</span></div>
                 </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              {/* Calendar Link Button */}
              {calendarLink && (
                <a 
                  href={calendarLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-blue-100 text-blue-700 px-6 py-3 rounded-xl font-bold transition hover:bg-blue-200"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  {t.booking.add_to_calendar}
                </a>
              )}
              {/* Free WA Share Fallback */}
              <a 
                href={`https://wa.me/?text=${encodeURIComponent(
                  language === 'tr' 
                    ? `Merhaba! ${branding?.businessName || 'Randevu Sistemi'}'ndan randevumu oluşturdum.\nUzman: ${selectedStaff?.name || ''}\nİletişim: ${selectedStaff?.phone || '-'}\nHizmet: ${selectedService?.name_tr || ''}\nTarih: ${selectedDate} ${selectedTime}\nRandevuyu Takvime Ekle: ${calendarLink}` 
                    : `Hello! I booked an appointment at ${branding?.businessName || 'the salon'}.\nStaff: ${selectedStaff?.name || ''}\nContact: ${selectedStaff?.phone || '-'}\nService: ${selectedService?.name || ''}\nDate: ${selectedDate} ${selectedTime}\nAdd to Calendar: ${calendarLink}`
                )}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-[#25D366] text-white px-6 py-3 rounded-xl font-bold transition hover:bg-green-600 shadow-sm"
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                {t.booking.step5_whatsapp_share}
              </a>
            </div>

            {/* 
            {confirmation && (
              <div className="text-left bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-700 rounded-lg p-6 mb-8 shadow-sm transition-colors duration-300">
                <h4 className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 font-semibold mb-3 flex items-center gap-2">
                   <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                   {t.booking.step5_ai_title}
                </h4>
                <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                    <p><span className="font-semibold text-gray-900 dark:text-white">{t.booking.step5_subject}</span> {confirmation.subject}</p>
                    <hr className="border-gray-200 dark:border-slate-600 my-2"/>
                    <p className="whitespace-pre-line leading-relaxed">{confirmation.body}</p>
                </div>
              </div>
            )}
            */}

            <div className="bg-blue-50 dark:bg-slate-800 border border-blue-100 dark:border-slate-700 rounded-xl p-5 mb-8 text-sm text-gray-700 dark:text-gray-300">
              <p className="mb-3">{t.customer_portal?.portal_prompt}</p>
              <button 
                onClick={() => {
                  window.location.href = '/customer/login';
                }}
                className="text-accent font-semibold hover:underline"
              >
                {t.customer_portal?.login_title}
              </button>
            </div>

            <button onClick={() => window.location.reload()} className="text-accent font-medium hover:text-blue-700 transition">
              {t.booking.book_another}
            </button>
          </div>
        )}

      </div>
      ) : null
    }
    />
    </>
    )}
  </div>
);
};

export default BookingPage;
