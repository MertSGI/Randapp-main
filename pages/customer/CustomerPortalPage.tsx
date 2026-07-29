import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { translations } from '../../utils/translations';
import { useTenant } from '../../contexts/TenantContext';
import { Appointment, Staff, Service } from '../../types';
import { getAppointments } from '../../services/appointmentService';
import { getStaffList } from '../../services/staffService';
import { getServices } from '../../services/serviceCatalogService';

const CustomerPortalPage: React.FC = () => {
  const { language } = useLanguage();
  const t = translations[language];
  const { tenant } = useTenant();
  const navigate = useNavigate();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [servicesList, setServicesList] = useState<Service[]>([]);

  useEffect(() => {
    const authData = localStorage.getItem('lari_customer_auth');
    if (!authData || !tenant) {
      navigate('/customer/login');
      return;
    }
    
    try {
      const auth = JSON.parse(authData);
      if (auth.tenantId !== tenant.id) {
        localStorage.removeItem('lari_customer_auth');
        navigate('/customer/login');
        return;
      }
      loadData(auth);
    } catch {
      localStorage.removeItem('lari_customer_auth');
      navigate('/customer/login');
    }
  }, [tenant, navigate]);

  const loadData = async (authObj: any) => {
    if (!tenant) return;
    const staff = await getStaffList(tenant.id);
    const services = await getServices(tenant.id);
    setStaffList(staff);
    setServicesList(services);

    // Filter appointments for this user
    const apts = await getAppointments(tenant.id);
    
    const userApts = apts.filter(a => {
      // Find matches using any of the available authenticated identifiers
      const emailMatch = authObj.email && a.user_email?.toLowerCase() === authObj.email;
      const phoneMatch = authObj.phone && a.phone?.replace(/\D/g, '') === authObj.phone;
      const idMatch = authObj.id && (a.customerId === authObj.id || a.user_email === authObj.id);
      
      return idMatch || emailMatch || phoneMatch;
    });
    
    // Sort descending by date/time
    userApts.sort((a, b) => new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime());
    setAppointments(userApts);
  };

  const handleLogout = () => {
    localStorage.removeItem('lari_customer_auth');
    navigate('/customer/login');
  };

  const now = new Date();
  
  const upcomingApts = appointments.filter(a => {
    const aptDate = new Date(`${a.date}T${a.time}`);
    return aptDate >= now && !a.status.includes('cancel');
  }).reverse(); // Ascending for upcoming

  const pastApts = appointments.filter(a => {
    const aptDate = new Date(`${a.date}T${a.time}`);
    return aptDate < now || a.status.includes('cancel');
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed': return <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">{t.customer_portal.status_confirmed || 'Confirmed'}</span>;
      case 'cancelled': return <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-medium">{t.customer_portal.status_cancelled || 'Cancelled'}</span>;
      case 'cancelled_by_customer': return <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-medium">{t.customer_portal.status_cancelled_by_customer || 'Cancelled by you'}</span>;
      case 'cancelled_by_salon': return <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-medium">{t.customer_portal.status_cancelled_by_salon || 'Cancelled by salon'}</span>;
      case 'completed': return <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-medium">{t.customer_portal.status_completed || 'Completed'}</span>;
      case 'no_show': return <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-medium">{t.customer_portal.status_no_show || 'No Show'}</span>;
      default: return <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-medium">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-12">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex flex-col">
             <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-none">
               {t.customer_portal.title}
             </h1>
             <span className="text-xs text-gray-500 uppercase tracking-widest font-semibold mt-1">{tenant?.name}</span>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            <span className="hidden sm:inline">{t.customer_portal.logout}</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        {/* Safe Explanatory Turkish Banner */}
        <div className="p-4 bg-blue-50/60 dark:bg-blue-950/20 rounded-xl border border-blue-100 dark:border-blue-900/40 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>
            Bu ekrandan güvenli iptal işlemi şu anda desteklenmiyor. Randevu oluşturulduğunda gönderilen yönetim bağlantısını kullanabilir veya işletmeyle iletişime geçebilirsiniz.
          </p>
        </div>

        {/* Upcoming Appointments */}
        <section>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            {t.customer_portal.upcoming}
          </h2>
          {upcomingApts.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 text-center shadow-sm border border-gray-100 dark:border-slate-700">
              <p className="text-gray-500 dark:text-gray-400 text-sm">{t.customer_portal.no_upcoming}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {upcomingApts.map(apt => {
                const service = servicesList.find(s => s.id === apt.serviceId);
                const staff = staffList.find(s => s.id === apt.staffId);
                return (
                  <div key={apt.id} className="bg-white dark:bg-slate-800 rounded-lg p-5 shadow-sm border-l-4 border-accent relative">
                    <div className="flex justify-between items-start">
                       <div>
                          <h3 className="font-bold text-gray-900 dark:text-white text-lg">{service ? (language === 'tr' ? (service.name_tr || service.name) : service.name) : (t.admin.unknown_service || 'Unknown Service')}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1 mt-1">
                            {staff?.name || t.admin.unknown_staff || 'Unknown Staff'}
                          </p>
                          <div className="flex items-center gap-3 mt-3 text-sm text-gray-500 dark:text-gray-400">
                            <span className="flex items-center gap-1"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> {apt.date}</span>
                            <span className="flex items-center gap-1"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> {apt.time}</span>
                          </div>
                       </div>
                       <div className="flex flex-col items-end gap-3">
                         {getStatusBadge(apt.status)}
                       </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Past/Cancelled Appointments */}
        <section>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {t.customer_portal.past}
          </h2>
          {pastApts.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 text-center shadow-sm border border-gray-100 dark:border-slate-700">
              <p className="text-gray-500 dark:text-gray-400 text-sm">{t.customer_portal.no_past}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pastApts.map(apt => {
                const service = servicesList.find(s => s.id === apt.serviceId);
                const staff = staffList.find(s => s.id === apt.staffId);
                return (
                  <div key={apt.id} className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 border border-gray-200 dark:border-slate-700 flex justify-between items-center opacity-80 hover:opacity-100 transition">
                     <div>
                        <h4 className="font-medium text-gray-800 dark:text-gray-200 text-sm">{service ? (language === 'tr' ? (service.name_tr || service.name) : service.name) : (t.admin.unknown_service || 'Unknown Service')}</h4>
                        <p className="text-xs text-gray-500 mt-1">{apt.date} {apt.time} • {staff?.name || t.admin.unknown_staff || 'Unknown Staff'}</p>
                     </div>
                     <div>
                       {getStatusBadge(apt.status)}
                     </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default CustomerPortalPage;
