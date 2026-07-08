import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { translations } from '../../utils/translations';
import { getAppointments } from '../../services/appointmentService';
import { useTenant } from '../../contexts/TenantContext';

const CustomerLoginPage: React.FC = () => {
  const { language } = useLanguage();
  const t = translations[language];
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [contactInfo, setContactInfo] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactInfo.trim()) return;

    if (!tenant) {
      setError('Tenant not found.');
      return;
    }

    const appointments = await getAppointments(tenant.id);
    const normalizedAttempt = contactInfo.trim().toLowerCase();
    
    // Find customer by email or phone
    const appointment = appointments.find(c => {
      const normalizedPhoneAttempt = normalizedAttempt.replace(/\D/g, '');
      return c.user_email?.toLowerCase() === normalizedAttempt || 
        (c.phone && normalizedPhoneAttempt && c.phone.replace(/\D/g, '').includes(normalizedPhoneAttempt));
    });

    if (appointment) {
      // Mock login: save to local storage
      const customerId = appointment.customerId || appointment.user_email || normalizedAttempt;
      localStorage.setItem('randapp_customer_auth', JSON.stringify({ 
        id: customerId, 
        tenantId: tenant.id,
        email: appointment.user_email?.toLowerCase() || '',
        phone: appointment.phone?.replace(/\D/g, '') || ''
      }));
      navigate('/customer/appointments');
    } else {
      setError(t.customer_portal.error_not_found);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-slate-800 p-8 rounded-xl shadow-lg border border-gray-100 dark:border-slate-700">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 bg-accent/10 rounded-full flex items-center justify-center mb-4">
            <svg className="h-6 w-6 text-accent transform -rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
            </svg>
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-2">
            {t.customer_portal.login_title}
          </h2>
          <p className="text-sm text-gray-500">
            {t.customer_portal.login_subtitle}
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="contactInfo" className="sr-only">
                {t.customer_portal.phone_or_email}
              </label>
              <input
                id="contactInfo"
                name="contactInfo"
                type="text"
                required
                className="appearance-none rounded relative block w-full px-3 py-3 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                placeholder={t.customer_portal.phone_or_email}
                value={contactInfo}
                onChange={(e) => {
                  setContactInfo(e.target.value);
                  setError('');
                }}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center font-medium">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={!contactInfo.trim()}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-accent hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 transition"
            >
              {t.customer_portal.login_btn}
            </button>
          </div>
        </form>
        
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-400 mt-6 max-w-sm mx-auto leading-relaxed">
            {t.customer_portal.privacy_note}
          </p>
        </div>
      </div>
    </div>
  );
};

export default CustomerLoginPage;
