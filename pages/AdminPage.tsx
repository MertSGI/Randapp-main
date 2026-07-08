import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Appointment, Staff } from '../types';
import * as GeminiService from '../services/geminiService';
import { useLanguage } from '../contexts/LanguageContext';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { getAppointments, updateAppointmentStatus } from '../services/appointmentService';
import { getStaffList, createStaff, updateStaff, deleteStaff } from '../services/staffService';
import { getServices, createService, updateService, deleteService } from '../services/serviceCatalogService';
import { Service, BusinessBranch } from '../types';
import { useDialog } from '../contexts/DialogContext';
import { branchService } from '../services/branchService';

import BillingTab from '../components/BillingTab';
import OnboardingWizard from '../components/OnboardingWizard';
import SalonReportsTab from '../components/SalonReportsTab';
import BusinessProfileTab from '../components/BusinessProfileTab';
import CustomerMemoryTab from '../components/CustomerMemoryTab';
import ReferralTab from '../components/ReferralTab';
import AdminSettingsTab from '../components/AdminSettingsTab';
import { ImageUpload } from '../components/ImageUpload';
import { onboardingChecklistService, OnboardingReport } from '../services/onboardingChecklistService';
import { adminFeatureAvailabilityService, AdminFeatureAvailability } from '../services/adminFeatureAvailabilityService';
import { appointmentSelfServiceService } from '../services/appointmentSelfServiceService';

const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, language } = useLanguage();
  const { tenant, refreshTenant } = useTenant();
  const { currentUser, isLoading: authLoading, logout } = useAuth();
  const { alert: showAlert, confirm: showConfirm } = useDialog();
  const getInitialTab = () => {
    const pathSegments = location.pathname.split('/');
    const lastSegment = pathSegments[pathSegments.length - 1];
    const validTabs = ['dashboard', 'setup', 'appointments', 'staff', 'services', 'reports', 'billing', 'profile', 'settings', 'customers', 'referrals'];
    if (validTabs.includes(lastSegment)) return lastSegment;
    return 'dashboard';
  };

  const [activeTab, setActiveTabState] = useState<'dashboard' | 'setup' | 'appointments' | 'staff' | 'services' | 'reports' | 'billing' | 'profile' | 'settings' | 'customers' | 'referrals'>(getInitialTab() as any);

  const setActiveTab = (tab: any) => {
    setActiveTabState(tab);
    navigate(`/admin/${tab}`, { replace: true });
  };

  useEffect(() => {
    setActiveTabState(getInitialTab() as any);
  }, [location.pathname]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [changeRequests, setChangeRequests] = useState<any[]>([]);
  const [bookingPolicy, setBookingPolicy] = useState<any>(null);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [servicesList, setServicesList] = useState<Service[]>([]);
  const [onboardingReport, setOnboardingReport] = useState<OnboardingReport | null>(null);
  const [tabAvailability, setTabAvailability] = useState<Record<string, AdminFeatureAvailability>>({});
  const [adminNextAction, setAdminNextAction] = useState<{message: string, ctaText: string, targetTab: string, isBlocked: boolean} | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [targetAppointmentId, setTargetAppointmentId] = useState<string | null>(null);
  const [branches, setBranches] = useState<BusinessBranch[]>([]);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('all');

  // New/Edit staff form state
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffTitle, setNewStaffTitle] = useState('');
  const [newStaffImage, setNewStaffImage] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');

  const [newStaffActive, setNewStaffActive] = useState(true);

  // New/Edit service form state
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceNameTr, setNewServiceNameTr] = useState('');
  const [newServicePrice, setNewServicePrice] = useState<number>(0);
  const [newServiceDuration, setNewServiceDuration] = useState<number>(30);
  const [newServiceImage, setNewServiceImage] = useState('');
  const [newServiceActive, setNewServiceActive] = useState(true);
  const [isMobileMoreMenuOpen, setIsMobileMoreMenuOpen] = useState(false);

  const renderLockedFeature = (lockReason: string, recommendedAction: string | null) => {
    return (
      <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-sm text-center border border-gray-100 dark:border-slate-700 max-w-2xl mx-auto my-12">
         <div className="w-16 h-16 bg-blue-50 dark:bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-500 dark:text-blue-400">
           <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
         </div>
         <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Özellik Kilitli</h3>
         <p className="text-gray-500 dark:text-gray-400 mb-6">{lockReason}</p>
         {recommendedAction === 'upgrade' && (
           <button onClick={() => setActiveTab('billing')} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm transition">
             Abonelik Planlarını İncele
           </button>
         )}
         {recommendedAction === 'setup' && (
           <button onClick={() => setActiveTab('setup')} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm transition">
             Kurulum Sihirbazına Dön
           </button>
         )}
      </div>
    );
  };

  useEffect(() => {
    if (authLoading) return;
    
    if (!currentUser) {
      navigate('/login');
      return;
    }
    if (tenant) {
      loadData();
    }
  }, [navigate, tenant, currentUser, authLoading]);

  const loadData = async () => {
    if (!tenant) return;
    const data = await getAppointments(tenant.id);
    data.sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.time}`);
        const dateB = new Date(`${b.date}T${b.time}`);
        return dateA.getTime() - dateB.getTime();
    });
    setAppointments(data);
    
    const staffData = await getStaffList(tenant.id);
    setStaffList(staffData);

    const requests = await appointmentSelfServiceService.getAllChangeRequestsAsync(tenant.id);
    setChangeRequests(requests);
    
    const policy = appointmentSelfServiceService.getBookingPolicy(tenant.id);
    setBookingPolicy(policy);

    const servicesData = await getServices(tenant.id);
    setServicesList(servicesData);

    const branchesData = await branchService.listBranches(tenant.id);
    setBranches(branchesData);

    try {
      const report = await onboardingChecklistService.getOnboardingReport(tenant.id);
      setOnboardingReport(report);
      
      const nextAction = await adminFeatureAvailabilityService.getAdminHomeNextActions(tenant.id);
      setAdminNextAction(nextAction);
      
      const available: Record<string, AdminFeatureAvailability> = {};
      const validTabs = ['dashboard', 'setup', 'appointments', 'staff', 'services', 'reports', 'billing', 'profile', 'settings', 'customers', 'referrals'];
      for (const tab of validTabs) {
        available[tab] = await adminFeatureAvailabilityService.getAvailability(tenant.id, tab);
      }
      setTabAvailability(available);
    } catch (e) {
      console.error("Error loading admin data:", e);
    }
  };

  const handleCancel = async (id: string) => {
    if (!tenant) return;
    const confirmed = await showConfirm({ message: t.admin.confirm_cancel });
    if (confirmed) {
      await updateAppointmentStatus(tenant.id, id, 'cancelled_by_salon', '', 'salon');
      loadData();
    }
  };

  const handleComplete = async (id: string) => {
    if (!tenant) return;
    // In a real app we might show a confirm dialog. Here let's just complete.
    await updateAppointmentStatus(tenant.id, id, 'completed', '', 'salon');
    loadData();
  };

  const handleNoShow = async (id: string) => {
    if (!tenant) return;
    await updateAppointmentStatus(tenant.id, id, 'no_show', '', 'salon');
    loadData();
  };

  const runAnalysis = async () => {
    setLoadingAnalysis(true);
    const analysis = await GeminiService.analyzeSchedule(appointments, language);
    setAiAnalysis(analysis);
    setLoadingAnalysis(false);
  };

  const handleToggleStaffActive = async (teacher: Staff) => {
    if (!tenant) return;
    await updateStaff(tenant.id, teacher.id, { active: !teacher.active });
    loadData();
  };

  const handleToggleServiceActive = async (service: Service) => {
    if (!tenant) return;
    await updateService(tenant.id, service.id, { active: !service.active });
    loadData();
  };

  const handleDeleteService = async (id: string) => {
    if (!tenant) return;
    const confirmed = await showConfirm({ message: t.admin.confirm_delete_service });
    if (confirmed) {
      const res = await deleteService(tenant.id, id);
      if (res.ok) {
        if (res.action === 'deactivated') {
          showAlert((t.admin as any).service_deactivated || 'Service deactivated because it has appointments.');
        } else {
          showAlert((t.admin as any).service_deleted || 'Service deleted.');
        }
        loadData();
      } else {
        showAlert((t.admin as any)[res.messageKey as string] || 'Action failed.');
      }
    }
  };

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!newServiceName || !tenant) return;

    if (!editingServiceId) {
      const { subscriptionService } = await import('../services/subscriptionService');
      const canAdd = await subscriptionService.canAddService(tenant.id);
      if (!canAdd) {
        // Final enforcement must happen server-side via Supabase Edge Functions or RLS policies.
        showAlert(t.admin.plan_limit_services);
        return;
      }
    }

    const payload = {
      name: newServiceName,
      name_tr: newServiceNameTr || newServiceName,
      price: newServicePrice,
      duration: newServiceDuration,
      image: newServiceImage || undefined,
      active: newServiceActive
    };

    if (editingServiceId) {
      await updateService(tenant.id, editingServiceId, payload);
    } else {
      await createService(tenant.id, payload);
    }
    
    loadData();
    resetServiceForm();
  };

  const initiateEditService = (service: Service) => {
    setEditingServiceId(service.id);
    setNewServiceName(service.name);
    setNewServiceNameTr(service.name_tr || '');
    setNewServicePrice(service.price);
    setNewServiceDuration(service.duration);
    setNewServiceImage(service.image || '');
    setNewServiceActive(service.active ?? true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetServiceForm = () => {
    setEditingServiceId(null);
    setNewServiceName('');
    setNewServiceNameTr('');
    setNewServicePrice(0);
    setNewServiceDuration(30);
    setNewServiceImage('');
    setNewServiceActive(true);
  };

  const handleDeleteStaff = async (id: string, name: string) => {
    if (!tenant) return;
    const confirmed = await showConfirm({ message: t.admin.confirm_delete_staff });
    if (confirmed) {
      const res = await deleteStaff(tenant.id, id);
      if (res.ok) {
        if (res.action === 'deactivated') {
          showAlert((t.admin as any).staff_deactivated || 'Staff deactivated because they have appointments.');
        } else {
          showAlert((t.admin as any).staff_deleted || 'Staff deleted.');
        }
        loadData();
      } else {
        showAlert((t.admin as any)[res.messageKey as string] || (t.admin as any).action_failed || 'Action failed.');
      }
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!newStaffName || !newStaffTitle || !tenant) return;

    if (!editingStaffId) {
      const { subscriptionService } = await import('../services/subscriptionService');
      const canAdd = await subscriptionService.canAddStaff(tenant.id);
      if (!canAdd) {
        // Final enforcement must happen server-side via Supabase Edge Functions or RLS policies.
        alert(t.admin.plan_limit_staff);
        return;
      }
    }

    if (editingStaffId) {
      await updateStaff(tenant.id, editingStaffId, {
        name: newStaffName,
        title: newStaffTitle,
        image: newStaffImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(newStaffName)}&background=random`,
        calendarEmail: newStaffEmail || undefined,
        phone: newStaffPhone || undefined,
        active: newStaffActive
      });
    } else {
      await createStaff(tenant.id, {
        name: newStaffName,
        title: newStaffTitle,
        image: newStaffImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(newStaffName)}&background=random`,
        calendarEmail: newStaffEmail || undefined,
        phone: newStaffPhone || undefined,
        active: newStaffActive
      });
    }
    
    loadData();
    resetForm();
  };

  const initiateEdit = (staff: Staff) => {
    setEditingStaffId(staff.id);
    setNewStaffName(staff.name);
    setNewStaffTitle(staff.title);
    setNewStaffImage(staff.image || '');
    setNewStaffEmail(staff.calendarEmail || '');
    setNewStaffPhone(staff.phone || '');
    setNewStaffActive(staff.active ?? true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setEditingStaffId(null);
    setNewStaffName('');
    setNewStaffTitle('');
    setNewStaffImage('');
    setNewStaffEmail('');
    setNewStaffPhone('');
    setNewStaffActive(true);
  };

  return (
    <div className="space-y-6 container mx-auto px-4 max-w-7xl pt-6 pb-safe pb-24 md:pb-6">
      {/* Desktop Header & Tabs - Hidden on Mobile */}
      <div className="hidden md:block bg-white dark:bg-slate-800 shadow-sm rounded-xl border border-gray-200 dark:border-slate-700 px-6 py-4 mb-6">
        <div className="flex justify-between items-center pb-4 border-b border-gray-100 dark:border-slate-700">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t.admin.title}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t.admin.subtitle}</p>
          </div>
          <div className="flex gap-2">
             <button 
               onClick={() => { window.open('/#/book?preview=true', '_blank'); }}
               className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-slate-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
             >
               <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
               {t.admin.open_site_preview}
             </button>
          </div>
        </div>
        
        <nav className="-mb-px flex space-x-6 overflow-x-auto pt-4">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`${activeTab === 'dashboard' ? 'border-accent text-accent dark:border-blue-400 dark:text-blue-400 border-b-2' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-slate-500 border-b-2'} whitespace-nowrap py-2 px-1 font-medium text-sm transition-colors duration-300`}
          >
            {(t.admin as any).tab_dashboard || 'Dashboard'}
          </button>
          <button
            onClick={() => setActiveTab('appointments')}
            className={`${activeTab === 'appointments' ? 'border-accent text-accent dark:border-blue-400 dark:text-blue-400 border-b-2' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-slate-500 border-b-2'} whitespace-nowrap py-2 px-1 font-medium text-sm transition-colors duration-300`}
          >
            {t.admin.tab_appointments}
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`${activeTab === 'customers' ? 'border-accent text-accent dark:border-blue-400 dark:text-blue-400 border-b-2' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-slate-500 border-b-2'} whitespace-nowrap py-2 px-1 font-medium text-sm transition-colors duration-300`}
          >
            {t.admin.tab_customers}
          </button>
          <button
            onClick={() => setActiveTab('services')}
            className={`${activeTab === 'services' ? 'border-accent text-accent dark:border-blue-400 dark:text-blue-400 border-b-2' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-slate-500 border-b-2'} whitespace-nowrap py-2 px-1 font-medium text-sm transition-colors duration-300`}
          >
            {t.admin.tab_services}
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={`${activeTab === 'staff' ? 'border-accent text-accent dark:border-blue-400 dark:text-blue-400 border-b-2' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-slate-500 border-b-2'} whitespace-nowrap py-2 px-1 font-medium text-sm transition-colors duration-300`}
          >
            {t.admin.tab_staff}
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`${activeTab === 'profile' ? 'border-accent text-accent dark:border-blue-400 dark:text-blue-400 border-b-2' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-slate-500 border-b-2'} whitespace-nowrap py-2 px-1 font-medium text-sm transition-colors duration-300`}
          >
            {t.admin.tab_profile}
          </button>
          <button
            onClick={() => setActiveTab('referrals')}
            className={`${activeTab === 'referrals' ? 'border-accent text-accent dark:border-blue-400 dark:text-blue-400 border-b-2' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-slate-500 border-b-2'} whitespace-nowrap py-2 px-1 font-medium text-sm transition-colors duration-300`}
          >
            {(t.admin as any).tab_referrals || 'Referrals'}
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`${activeTab === 'reports' ? 'border-accent text-accent dark:border-blue-400 dark:text-blue-400 border-b-2' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-slate-500 border-b-2'} whitespace-nowrap py-2 px-1 font-medium text-sm transition-colors duration-300`}
          >
            {t.admin.tab_reports}
          </button>
          <button
            onClick={() => setActiveTab('billing')}
            className={`${activeTab === 'billing' ? 'border-accent text-accent dark:border-blue-400 dark:text-blue-400 border-b-2' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-slate-500 border-b-2'} whitespace-nowrap py-2 px-1 font-medium text-sm transition-colors duration-300`}
          >
            {t.admin.tab_billing}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`${activeTab === 'settings' ? 'border-accent text-accent dark:border-blue-400 dark:text-blue-400 border-b-2' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-slate-500 border-b-2'} whitespace-nowrap py-2 px-1 font-medium text-sm transition-colors duration-300`}
          >
            {(t.admin as any).tab_settings || 'Settings'}
          </button>
        </nav>
      </div>

      {activeTab === 'setup' && (
        <OnboardingWizard 
          staffList={staffList}
          servicesList={servicesList}
          appointments={appointments}
          onNavigateToTab={(tab) => setActiveTab(tab)}
          refreshData={() => {
             // In future, trigger individual fetches if needed
             if (tenant) {
               refreshTenant(); // Re-fetches tenant branding
             }
          }}
        />
      )}

      {activeTab === 'customers' && (
        tabAvailability['customers']?.isAccessible === false 
          ? renderLockedFeature(tabAvailability['customers']!.lockReason!, tabAvailability['customers']!.recommendedAction) 
          : <CustomerMemoryTab 
              appointments={appointments}
              staffList={staffList}
              servicesList={servicesList}
              targetAppointmentId={targetAppointmentId}
              onClearTarget={() => setTargetAppointmentId(null)}
            />
      )}

      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
             <h2 className="text-xl font-bold dark:text-white">{(t.admin as any).dashboard_today || 'Kayıtlar / Bugün'}</h2>
             <div className="flex gap-2">
                 <button 
                   onClick={() => { window.open('/#/book?preview=true', '_blank'); }}
                   className="inline-flex md:hidden items-center px-4 py-2 border border-gray-300 dark:border-slate-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-slate-700 hover:bg-gray-50 focus:outline-none"
                 >
                   <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                   Site Önizleme
                 </button>
                 <button 
                   onClick={runAnalysis}
                   disabled={loadingAnalysis}
                   className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none disabled:opacity-50"
                 >
                   <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                   {loadingAnalysis ? t.admin.btn_analyzing : t.admin.btn_analysis}
                 </button>
             </div>
          </div>
                 {/* Enhanced Professional Setup & Progress Banner */}
          {onboardingReport && (onboardingReport.progressPercent < 100 || !onboardingReport.isPublished) && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-blue-600"></span>
                    İşletme Kurulum Rehberi
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-450 mt-1">
                    Sitenizin yayına alınması ve online randevu kabul etmesi için kuruluma devam edin.
                  </p>
                </div>
                <div className="flex items-center gap-2 animate-pulse">
                  <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-450 rounded-full">
                    Kurulum %{onboardingReport.progressPercent} Tamamlandı
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out" 
                  style={{ width: `${onboardingReport.progressPercent}%` }}
                ></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {/* Next Action */}
                <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-gray-150 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">Sıradaki Adım</span>
                  {adminNextAction ? (
                     <div className="mt-1">
                       <span className={`text-sm font-semibold ${adminNextAction.isBlocked ? 'text-red-650 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>{adminNextAction.message}</span>
                     </div>
                  ) : onboardingReport.nextStep ? (
                    <div className="mt-1">
                      <span className="text-sm font-semibold text-gray-800 dark:text-slate-205">{onboardingReport.nextStep.title}</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{onboardingReport.nextStep.description}</p>
                    </div>
                  ) : (
                    <div className="mt-1">
                      <span className="text-sm font-semibold text-green-700 dark:text-green-500">Tüm Adımlar Tamam!</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Yayın incelemesine göndermek üzere kurulum sihirbazının son adımına geçebilirsiniz.</p>
                    </div>
                  )}
                </div>

                {/* Publish & Verification Status */}
                <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-gray-150 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">Yayın Uygunluğu</span>
                  <div className="mt-1 text-xs">
                    {onboardingReport.pendingCheckout ? (
                      <p className="text-red-655 dark:text-red-400 font-medium">
                        Deneme süresini başlatmak için ödeme doğrulaması tamamlanmalıdır.
                      </p>
                    ) : onboardingReport.canSubmitForReview ? (
                      <p className="text-green-700 dark:text-green-400 font-medium">
                        Tüm zorunlu adımlar tamamlandı. Yayın incelemesine gönderebilirsiniz!
                      </p>
                    ) : onboardingReport.isPendingReview ? (
                      <p className="text-blue-600 dark:text-blue-450 font-medium">
                        Siteniz LARİ ekibi tarafından incelemede. Kısa süre içinde yayında olacaktır!
                      </p>
                    ) : onboardingReport.isPublished ? (
                      <p className="text-green-700 dark:text-green-405 font-medium">
                        Siteniz aktif ve yayında! Online randevular açık.
                      </p>
                    ) : (
                      <p className="text-gray-600 dark:text-gray-400">
                        Yayın incelemesine gönderebilmek için temel işletme bilgileri, hizmet, uzman ve ödeme doğrulaması tamamlanmalıdır.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-2">
                {adminNextAction ? (
                  <button 
                    onClick={() => setActiveTab(adminNextAction.targetTab)}
                    className="px-4 py-2 border border-blue-600 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                  >
                    {adminNextAction.ctaText}
                  </button>
                ) : onboardingReport.nextStep?.targetTab ? (
                  <button 
                    onClick={() => setActiveTab(onboardingReport.nextStep?.targetTab)}
                    className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold transition"
                  >
                    Hemen Tamamla
                  </button>
                ) : null}
                <button 
                  onClick={() => setActiveTab('setup')}
                  className={`px-4 py-2 ${adminNextAction ? 'bg-white text-gray-700 border-gray-300 border hover:bg-gray-50 dark:bg-slate-700 dark:text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} rounded-lg text-xs font-bold shadow-sm transition`}
                >
                  Kurulum Sihirbazını Aç
                </button>
              </div>
            </div>
          )}

          {/* AI Insight Box */}
          {aiAnalysis && (
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/40 dark:to-blue-900/40 border border-blue-100 dark:border-blue-800 rounded-lg p-4 shadow-sm transition-colors duration-300">
                <h3 className="text-sm font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wide mb-1 transition-colors duration-300">{t.admin.ai_insights}</h3>
                <p className="text-gray-700 dark:text-gray-300 italic transition-colors duration-300">{aiAnalysis}</p>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-slate-700 transition-colors duration-300 cursor-pointer" onClick={() => setActiveTab('appointments')}>
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase transition-colors duration-300">{t.admin.stats_total || 'Toplam Randevu'}</div>
              <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white transition-colors duration-300">{appointments.length}</div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-slate-700 transition-colors duration-300 cursor-pointer" onClick={() => setActiveTab('appointments')}>
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase transition-colors duration-300">{language === 'tr' ? 'Bugün Onaylananlar' : "Today's Confirmed"}</div>
              <div className="mt-2 text-3xl font-bold text-blue-600 dark:text-blue-400 transition-colors duration-300">
                {appointments.filter(a => a.date === new Date().toISOString().split('T')[0] && a.status === 'confirmed').length}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-slate-700 transition-colors duration-300 cursor-pointer" onClick={() => setActiveTab('appointments')}>
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase transition-colors duration-300">{language === 'tr' ? 'Tamamlanan Görüşmeler' : 'Completed'}</div>
              <div className="mt-2 text-3xl font-bold text-green-600 dark:text-green-400 transition-colors duration-300">
                {appointments.filter(a => a.status === 'completed').length}
              </div> 
              <span className="text-xs text-gray-400 dark:text-gray-500 transition-colors duration-300">{language === 'tr' ? 'Tüm zamanlar' : 'All time'}</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'appointments' && (
        tabAvailability['appointments']?.isAccessible === false 
          ? renderLockedFeature(tabAvailability['appointments']!.lockReason!, tabAvailability['appointments']!.recommendedAction) 
          : <div className="space-y-6">
              {/* Onay Bekleyen Talepler */}
              {changeRequests.filter((r: any) => r.status === 'requested').length > 0 && (
                <div className="mb-6 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-xl p-5 shadow-sm text-left">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-block w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping"></span>
                    <h4 className="text-md font-bold text-amber-800 dark:text-amber-400">Onay Bekleyen Değişiklik Talepleri ({changeRequests.filter((r: any) => r.status === 'requested').length})</h4>
                  </div>
                  <div className="space-y-3">
                    {changeRequests.filter((r: any) => r.status === 'requested').map((req: any) => {
                      const relatedApt = appointments.find(a => a.id === req.appointmentId);
                      const service = servicesList.find(s => s.id === relatedApt?.serviceId);
                      return (
                        <div key={req.id} className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-amber-105 dark:border-amber-950/50 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-left">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                req.type === 'cancellation' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-blue-50 text-blue-600 border border-blue-100'
                              }`}>
                                {req.type === 'cancellation' ? 'İptal Talebi' : 'Erteleme Talebi'}
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono">ID: {req.id}</span>
                            </div>
                            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                              {relatedApt?.user_name || 'Müşteri'} • <span className="text-gray-600 dark:text-gray-400">{language === 'tr' ? (service?.name_tr || service?.name) : service?.name}</span>
                            </p>
                            <p className="text-xs text-gray-500">
                              Mevcut Randevu: <strong className="text-gray-700 dark:text-gray-300">{relatedApt?.date} - {relatedApt?.time}</strong>
                            </p>
                            {req.type === 'reschedule' && (
                              <p className="text-xs text-blue-600 dark:text-blue-400">
                                İstenen Yeni Zaman: <strong>{req.requestedDateTime}</strong>
                              </p>
                            )}
                            {req.reason && <p className="text-xs text-gray-500 italic">Sebep: "{req.reason}"</p>}
                            {req.customerNote && <p className="text-xs text-gray-500 italic font-medium">Müşteri Notu: "{req.customerNote}"</p>}
                          </div>
                          <div className="flex gap-2 w-full md:w-auto">
                            <button
                              onClick={async () => {
                                const confirmChange = await showConfirm({ message: 'Bu talebi reddetmek istediğinize emin misiniz?' });
                                if (confirmChange) {
                                  const note = prompt('Müşteriye iletilecek ret nedeni (isteğe bağlı):') || '';
                                  await appointmentSelfServiceService.reviewChangeRequest(tenant!.id, req.id, 'rejected', note);
                                  loadData();
                                }
                              }}
                              className="flex-1 md:flex-none px-3.5 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-semibold"
                            >
                              Reddet
                            </button>
                            <button
                              onClick={async () => {
                                const confirmChange = await showConfirm({ message: 'Bu talebi onaylamak ve randevuyu güncellemek istiyor musunuz?' });
                                if (confirmChange) {
                                  const note = prompt('Müşteriye iletilecek onay mesajı (isteğe bağlı):') || '';
                                  await appointmentSelfServiceService.reviewChangeRequest(tenant!.id, req.id, 'approved', note);
                                  loadData();
                                }
                              }}
                              className="flex-1 md:flex-none px-3.5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold shadow-sm"
                            >
                              Talebi Onayla
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="bg-white dark:bg-slate-800 shadow overflow-hidden sm:rounded-md transition-colors duration-300">
            <div className="px-4 py-5 sm:px-6 bg-gray-50 dark:bg-slate-800/80 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center transition-colors duration-300">
              <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white transition-colors duration-300">{t.admin.recent_title}</h3>
              {branches.length > 1 && (
                <select 
                  value={selectedBranchFilter}
                  onChange={(e) => setSelectedBranchFilter(e.target.value)}
                  className="rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-1.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                >
                  <option value="all">Tüm Şubeler</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
            </div>
            <ul className="divide-y divide-gray-200 dark:divide-slate-700 max-h-[600px] overflow-y-auto">
              {appointments.filter(a => selectedBranchFilter === 'all' || a.branchId === selectedBranchFilter).length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center px-4">
                  <div className="w-16 h-16 bg-gray-50 dark:bg-slate-700/50 rounded-full flex items-center justify-center mb-4 border border-gray-100 dark:border-slate-600">
                    <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Henüz Randevu Yok</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">Müşterileriniz online rezervasyon yaptıkça randevularınız otomatik olarak burada görünecektir.</p>
                  <button onClick={() => window.open('/#/book?preview=true', '_blank')} className="px-5 py-2 bg-white text-gray-700 border border-gray-300 dark:bg-slate-700 dark:text-gray-200 dark:border-slate-600 rounded-lg shadow-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors text-sm">Site Önizlemesini Aç</button>
                </div>
              ) : (
                appointments.filter(a => selectedBranchFilter === 'all' || a.branchId === selectedBranchFilter).map((apt) => {
                  const assignedStaff = staffList.find(s => s.id === apt.staffId);
                  const assignedService = servicesList.find(s => s.id === apt.serviceId);
                  const branchName = branches.find(b => b.id === apt.branchId)?.name;
                  const serviceName = language === 'tr' ? (assignedService?.name_tr || assignedService?.name) : assignedService?.name;
                  return (
                    <li key={apt.id} className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors duration-300">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-accent dark:text-blue-400 truncate transition-colors duration-300">
                            {apt.user_name}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400 transition-colors duration-300 mt-0.5">
                            {apt.date} at {apt.time} • {serviceName || t.admin.unknown_service} {assignedStaff && `(${t.admin.with} ${assignedStaff.name})`} {branchName && `• [${branchName}]`}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center text-xs text-gray-400 dark:text-gray-500 gap-x-2 gap-y-1 transition-colors duration-300">
                              <span>{apt.user_email}</span>
                              <span className="hidden sm:inline">•</span>
                              <span>{apt.phone || t.admin.no_phone}</span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-3 sm:gap-4 justify-between sm:justify-end w-full sm:w-auto mt-2 sm:mt-0">
                          <button 
                            onClick={() => {
                              setTargetAppointmentId(apt.id);
                              setActiveTab('customers');
                            }}
                            className="text-accent hover:text-blue-700 text-sm font-medium"
                          >
                            {t.admin.view_profile || 'View Profile'}
                          </button>
                          <div className="flex flex-col items-end gap-1">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              apt.status === 'confirmed' ? 'bg-blue-100 text-blue-800' : 
                              apt.status === 'completed' ? 'bg-green-100 text-green-800' : 
                              apt.status.includes('cancel') ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {t.customer_portal?.[`status_${apt.status}`] || apt.status}
                            </span>
                            {apt.status.includes('cancel') && apt.cancelReason && (
                              <span className="text-[10px] text-red-500 max-w-[150px] truncate block text-right" title={apt.cancelReason}>
                                {apt.cancelReason}
                              </span>
                            )}
                          </div>
                          {apt.status === 'confirmed' && (
                            <div className="flex flex-col sm:flex-row items-center gap-2">
                              <button
                                onClick={() => handleComplete(apt.id)}
                                className="text-green-600 hover:text-green-900 text-xs font-semibold px-2 py-1 bg-green-50 rounded"
                              >
                                {language === 'tr' ? 'Tamamlandı' : 'Complete'}
                              </button>
                              <button
                                onClick={() => handleNoShow(apt.id)}
                                className="text-orange-600 hover:text-orange-900 text-xs font-semibold px-2 py-1 bg-orange-50 rounded"
                              >
                                {language === 'tr' ? 'Gelmedi' : 'No Show'}
                              </button>
                              <button
                                onClick={() => handleCancel(apt.id)}
                                className="text-red-600 hover:text-red-900 text-xs font-semibold px-2 py-1 bg-red-50 rounded"
                              >
                                {t.admin.cancel}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })
              )}
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'staff' && (
        tabAvailability['staff']?.isAccessible === false 
          ? renderLockedFeature(tabAvailability['staff']!.lockReason!, tabAvailability['staff']!.recommendedAction) 
          : <div className="space-y-8">
          <div className="bg-white dark:bg-slate-800 shadow-sm rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden p-6 transition-colors duration-300">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-700 pb-4 mb-4 transition-colors duration-300">
              {editingStaffId ? t.admin.edit_staff : t.admin.add_staff}
            </h3>
            <form onSubmit={handleAddStaff} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors duration-300">{t.admin.full_name}</label>
                  <input required placeholder="Mustafa Ali Yılmaz" type="text" value={newStaffName} onChange={e => setNewStaffName(e.target.value)} className="mt-1 w-full rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white shadow-sm border p-2 transition-colors duration-300"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors duration-300">{t.admin.title_role}</label>
                  <input required placeholder="Master Designer" type="text" value={newStaffTitle} onChange={e => setNewStaffTitle(e.target.value)} className="mt-1 w-full rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white shadow-sm border p-2 transition-colors duration-300"/>
                </div>
                <div>
                  <ImageUpload label={t.admin.image_url_label} value={newStaffImage} onChange={setNewStaffImage} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors duration-300">{t.admin.google_calendar_email}</label>
                  <input type="email" placeholder="example@gmail.com" value={newStaffEmail} onChange={e => setNewStaffEmail(e.target.value)} className="mt-1 w-full rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white shadow-sm border p-2 transition-colors duration-300"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors duration-300">{t.admin.phone_number}</label>
                  <input type="tel" placeholder="+905554443322" value={newStaffPhone} onChange={e => setNewStaffPhone(e.target.value)} className="mt-1 w-full rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white shadow-sm border p-2 transition-colors duration-300"/>
                </div>
                <div className="flex items-center">
                  <input id="staff-active" type="checkbox" checked={newStaffActive} onChange={e => setNewStaffActive(e.target.checked)} className="h-4 w-4 text-accent focus:ring-accent border-gray-300 rounded"/>
                  <label htmlFor="staff-active" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                    {t.admin.active_booking}
                  </label>
                </div>
              </div>
              <div className="flex gap-3">
                  <button type="submit" className="bg-accent text-white px-4 py-2 rounded-md shadow-sm font-medium hover:bg-blue-600">
                    {editingStaffId ? t.admin.update : t.admin.add_staff_btn}
                  </button>
                  {editingStaffId && (
                      <button type="button" onClick={resetForm} className="bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-md shadow-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors duration-300">
                        {t.admin.cancel}
                      </button>
                  )}
              </div>
            </form>
          </div>

          {staffList.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center px-4 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm">
                <div className="w-16 h-16 bg-gray-50 dark:bg-slate-700/50 rounded-full flex items-center justify-center mb-4 border border-gray-100 dark:border-slate-600">
                  <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Henüz Uzman Eklenmemiş</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">Müşterilerinize hizmet verecek çalışanları yukarıdaki formdan ekleyebilirsiniz.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {staffList.map(staff => {
              const isOwner = staff.id === 'stf_1' || staff.name.toLowerCase().includes('mustafa ali yılmaz');
              return (
              <div key={staff.id} className={`bg-white dark:bg-slate-800 border text-center p-6 border-gray-200 dark:border-slate-700 rounded-xl shadow-sm flex flex-col items-center relative group transition-colors duration-300 ${!staff.active ? 'opacity-60' : ''}`}>
                {!staff.active && (
                   <span className="absolute top-2 left-2 bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-md">{t.admin.inactive}</span>
                )}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                        onClick={() => handleToggleStaffActive(staff)}
                        className={`p-1 text-gray-400 dark:text-gray-500 hover:text-${staff.active ? 'yellow' : 'green'}-500 rounded-full hover:bg-${staff.active ? 'yellow' : 'green'}-50 dark:hover:bg-slate-700 transition-colors duration-300`}
                        title={staff.active ? t.admin.make_inactive : t.admin.make_active}
                    >
                      {staff.active ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      )}
                    </button>
                    <button 
                        onClick={() => initiateEdit(staff)}
                        className="p-1 text-gray-400 dark:text-gray-500 hover:text-accent dark:hover:text-blue-400 rounded-full hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors duration-300"
                        title={t.admin.edit}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                    </button>
                    {!isOwner && (
                    <button 
                        onClick={() => handleDeleteStaff(staff.id, staff.name)}
                        className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 rounded-full hover:bg-red-50 dark:hover:bg-slate-700 transition-colors duration-300"
                        title={t.admin.delete_staff}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                    )}
                </div>
                <img src={staff.image} alt={staff.name} className="w-16 h-16 rounded-full mb-3 object-cover shadow-sm"/>
                <h4 className="font-bold text-gray-900 dark:text-white text-lg transition-colors duration-300">{staff.name}</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 transition-colors duration-300">{staff.title}</p>
                <div className="flex flex-col gap-1 items-center w-full">
                    <div className="text-xs bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 px-3 py-1 rounded-full transition-colors duration-300">{staff.id}</div>
                    {staff.calendarEmail && <div className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-full truncate w-full transition-colors duration-300" title={staff.calendarEmail}>Google: {staff.calendarEmail}</div>}
                    {staff.phone && <div className="text-xs bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-3 py-1 rounded-full truncate w-full transition-colors duration-300">{staff.phone}</div>}
                </div>
              </div>
            );
            })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'services' && (
        tabAvailability['services']?.isAccessible === false 
          ? renderLockedFeature(tabAvailability['services']!.lockReason!, tabAvailability['services']!.recommendedAction) 
          : <div className="space-y-8">
          <div className="bg-white dark:bg-slate-800 shadow-sm rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden p-6 transition-colors duration-300">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-700 pb-4 mb-4 transition-colors duration-300">
              {editingServiceId ? t.admin.edit_service : t.admin.add_service}
            </h3>
            <form onSubmit={handleAddService} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors duration-300">{t.admin.service_name_en}</label>
                  <input required placeholder="Haircut" type="text" value={newServiceName} onChange={e => setNewServiceName(e.target.value)} className="mt-1 w-full rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white shadow-sm border p-2 transition-colors duration-300"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors duration-300">{t.admin.service_name_tr}</label>
                  <input placeholder="Saç Kesimi" type="text" value={newServiceNameTr} onChange={e => setNewServiceNameTr(e.target.value)} className="mt-1 w-full rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white shadow-sm border p-2 transition-colors duration-300"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors duration-300">{t.admin.price}</label>
                  <input required type="number" min="0" step="10" value={newServicePrice} onChange={e => setNewServicePrice(Number(e.target.value))} className="mt-1 w-full rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white shadow-sm border p-2 transition-colors duration-300"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors duration-300">{t.admin.duration}</label>
                  <input required type="number" min="5" step="5" value={newServiceDuration} onChange={e => setNewServiceDuration(Number(e.target.value))} className="mt-1 w-full rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white shadow-sm border p-2 transition-colors duration-300"/>
                </div>
                <div>
                  <ImageUpload label={t.admin.image_url} value={newServiceImage} onChange={setNewServiceImage} />
                </div>
                <div className="flex items-center">
                  <input id="service-active" type="checkbox" checked={newServiceActive} onChange={e => setNewServiceActive(e.target.checked)} className="h-4 w-4 text-accent focus:ring-accent border-gray-300 rounded"/>
                  <label htmlFor="service-active" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                    {t.admin.active_booking}
                  </label>
                </div>
              </div>
              <div className="flex gap-3">
                  <button type="submit" className="bg-accent text-white px-4 py-2 rounded-md shadow-sm font-medium hover:bg-blue-600">
                    {editingServiceId ? t.admin.update : t.admin.add}
                  </button>
                  {editingServiceId && (
                      <button type="button" onClick={resetServiceForm} className="bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-md shadow-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors duration-300">
                        {t.admin.cancel}
                      </button>
                  )}
              </div>
            </form>
          </div>

          {servicesList.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center px-4 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm">
                <div className="w-16 h-16 bg-gray-50 dark:bg-slate-700/50 rounded-full flex items-center justify-center mb-4 border border-gray-100 dark:border-slate-600">
                  <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Henüz Hizmet Eklenmemiş</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">Müşterilerinize online randevu sitenizde sunacağınız hizmetleri yukarıdaki formdan eklemeye başlayın.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {servicesList.map(service => (
              <div key={service.id} className={`bg-white dark:bg-slate-800 border text-center p-6 border-gray-200 dark:border-slate-700 rounded-xl shadow-sm flex flex-col items-center relative group transition-colors duration-300 ${!service.active ? 'opacity-60' : ''}`}>
                {!service.active && (
                   <span className="absolute top-2 left-2 bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-md">{t.admin.inactive}</span>
                )}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                        onClick={() => handleToggleServiceActive(service)}
                        className={`p-1 text-gray-400 dark:text-gray-500 hover:text-${service.active ? 'yellow' : 'green'}-500 rounded-full hover:bg-${service.active ? 'yellow' : 'green'}-50 dark:hover:bg-slate-700 transition-colors duration-300`}
                        title={service.active ? t.admin.make_inactive : t.admin.make_active}
                    >
                      {service.active ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      )}
                    </button>
                    <button 
                        onClick={() => initiateEditService(service)}
                        className="p-1 text-gray-400 dark:text-gray-500 hover:text-accent dark:hover:text-blue-400 rounded-full hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors duration-300"
                        title={t.admin.edit}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                    </button>
                    <button 
                        onClick={() => handleDeleteService(service.id)}
                        className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 rounded-full hover:bg-red-50 dark:hover:bg-slate-700 transition-colors duration-300"
                        title={t.admin.delete_service}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
                <div className="w-full h-32 mb-4 bg-gray-100 dark:bg-slate-700 rounded-lg overflow-hidden">
                  {service.image ? (
                    <img src={service.image} alt={service.name} className="w-full h-full object-cover"/>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400"><span className="text-sm">{t.admin.no_image}</span></div>
                  )}
                </div>
                <h4 className="font-bold text-gray-900 dark:text-white text-lg transition-colors duration-300">{language === 'tr' ? service.name_tr || service.name : service.name}</h4>
                <div className="flex gap-4 mt-2 mb-2 text-sm text-gray-500 dark:text-gray-400">
                   <span>{service.duration} {t.admin.min}</span>
                   <span>•</span>
                   <span className="font-bold text-accent dark:text-blue-400">₺{service.price}</span>
                </div>
                <div className="text-xs bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 px-3 py-1 rounded-full transition-colors duration-300">{service.id}</div>
              </div>
            ))}
            </div>
          )}
        </div>
      )}
      
      {activeTab === 'reports' && (
        tabAvailability['reports']?.isAccessible === false 
          ? renderLockedFeature(tabAvailability['reports']!.lockReason!, tabAvailability['reports']!.recommendedAction) 
          : <SalonReportsTab 
              appointments={appointments.filter(a => selectedBranchFilter === 'all' || a.branchId === selectedBranchFilter)} 
              services={servicesList.filter(s => selectedBranchFilter === 'all' || !s.branchId || s.branchId === selectedBranchFilter)} 
              staff={staffList.filter(st => selectedBranchFilter === 'all' || !st.branchId || st.branchId === selectedBranchFilter)} 
            />
      )}
      
      {activeTab === 'billing' && <BillingTab />}

      {activeTab === 'profile' && (
        tabAvailability['profile']?.isAccessible === false 
          ? renderLockedFeature(tabAvailability['profile']!.lockReason!, tabAvailability['profile']!.recommendedAction) 
          : <BusinessProfileTab />
      )}
      
      {activeTab === 'referrals' && (
        tabAvailability['referrals']?.isAccessible === false 
          ? renderLockedFeature(tabAvailability['referrals']!.lockReason!, tabAvailability['referrals']!.recommendedAction) 
          : <ReferralTab />
      )}
      
      {activeTab === 'settings' && <AdminSettingsTab />}
      
      {/* Spacer for mobile bottom nav */}
      <div className="h-20 md:hidden w-full"></div>

      {/* Mobile Bottom Navigation Menu */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 md:hidden z-[90] px-1 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
         <div className="flex justify-between items-center h-16 w-full">
            <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center justify-center flex-1 h-full ${activeTab === 'dashboard' ? 'text-accent dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
               <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
               <span className="text-[10px] font-medium leading-none">Bugün</span>
            </button>
            <button onClick={() => setActiveTab('appointments')} className={`flex flex-col items-center justify-center flex-1 h-full ${activeTab === 'appointments' ? 'text-accent dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
               <div className="relative">
                 <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                 {appointments.filter(a => a.date === new Date().toISOString().split('T')[0]).length > 0 && (
                   <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white ring-2 ring-white dark:ring-slate-800">
                      {appointments.filter(a => a.date === new Date().toISOString().split('T')[0]).length}
                   </span>
                 )}
               </div>
               <span className="text-[10px] font-medium leading-none truncate w-full text-center px-1 text-ellipsis overflow-hidden">{t.admin.tab_appointments}</span>
            </button>
            <button onClick={() => setActiveTab('customers')} className={`flex flex-col items-center justify-center flex-1 h-full ${activeTab === 'customers' ? 'text-accent dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
               <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
               <span className="text-[10px] font-medium leading-none truncate w-full text-center px-1 text-ellipsis overflow-hidden">{t.admin.tab_customers}</span>
            </button>
            <button onClick={() => setActiveTab('services')} className={`flex flex-col items-center justify-center flex-1 h-full ${activeTab === 'services' ? 'text-accent dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
               <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2m-2-1l-2-1m2 1v2m2-1v-2m0 0l2 1" /></svg>
               <span className="text-[10px] font-medium leading-none truncate w-full text-center px-1 text-ellipsis overflow-hidden">{t.admin.tab_services}</span>
            </button>
            <div className="relative flex-1 h-full flex justify-center dropdown-container">
                <button className={`flex flex-col items-center justify-center w-full h-full ${(['staff', 'reports', 'billing', 'profile', 'referrals', 'settings'].includes(activeTab)) ? 'text-accent dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`} onClick={() => setIsMobileMoreMenuOpen(!isMobileMoreMenuOpen)}>
                   <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/></svg>
                   <span className="text-[10px] font-medium leading-none truncate w-full text-center px-1 text-ellipsis overflow-hidden">Diğer</span>
                </button>
                
                {/* Mobile More Menu Overlay */}
                {isMobileMoreMenuOpen && (
                  <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setIsMobileMoreMenuOpen(false)}></div>
                )}
                
        {/* Mobile More Menu Popup */}
        {isMobileMoreMenuOpen && (
          <div className="absolute bottom-16 right-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 overflow-hidden transform transition-all z-50">
              <div className="py-1 flex flex-col items-start w-full" onClick={() => setIsMobileMoreMenuOpen(false)}>
                  <button onClick={() => setActiveTab('staff')} className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${activeTab === 'staff' ? 'bg-blue-50 dark:bg-slate-700 text-accent font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>
                     {t.admin.tab_staff}
                  </button>
                  <button onClick={() => setActiveTab('reports')} className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${activeTab === 'reports' ? 'bg-blue-50 dark:bg-slate-700 text-accent font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>
                     {t.admin.tab_reports}
                  </button>
                  <button onClick={() => setActiveTab('billing')} className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${activeTab === 'billing' ? 'bg-blue-50 dark:bg-slate-700 text-accent font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>
                     {t.admin.tab_billing}
                  </button>
                  <button onClick={() => setActiveTab('referrals')} className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${activeTab === 'referrals' ? 'bg-blue-50 dark:bg-slate-700 text-accent font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>
                     {(t.admin as any).tab_referrals || 'Referrals'}
                  </button>
                  <button onClick={() => setActiveTab('profile')} className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${activeTab === 'profile' ? 'bg-blue-50 dark:bg-slate-700 text-accent font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>
                     {t.admin.tab_profile}
                  </button>
                  <button onClick={() => setActiveTab('settings')} className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${activeTab === 'settings' ? 'bg-blue-50 dark:bg-slate-700 text-accent font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>
                     {(t.admin as any).tab_settings || 'Settings'}
                  </button>
                  <button onClick={() => { window.open('/#/book?preview=true', '_blank'); }} className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 text-gray-700 dark:text-gray-300 border-t border-gray-100 dark:border-slate-700`}>
                     Site Önizleme
                  </button>
                  <button onClick={() => { logout(); navigate('/login'); }} className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 text-red-600 dark:text-red-400 font-medium border-t border-gray-100 dark:border-slate-700`}>
                     Çıkış Yap
                  </button>
              </div>
          </div>
        )}
            </div>
         </div>
      </div>
    </div>
  );
};

export default AdminPage;
