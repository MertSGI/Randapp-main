import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useTenant } from '../../contexts/TenantContext';
import { planService } from '../../services/planService';
import { entitlementService } from '../../services/entitlementService';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 transition" aria-label="Toggle Dark Mode">
      {theme === 'light' ? (
        <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
      ) : (
        <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
      )}
    </button>
  );
};

const SalonBookingLayout: React.FC = () => {
  const { language, setLanguage, t } = useLanguage();
  const { tenant, branding, isLoadingTenant, tenantStatus } = useTenant();
  const location = useLocation();

  if (isLoadingTenant) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div></div>;
  }

  if (tenantStatus === 'not_found' || !branding) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900"><div className="text-center"><h1 className="text-3xl font-bold dark:text-white">{language === 'tr' ? 'Salon Bulunamadı' : 'Salon Not Found'}</h1><p className="mt-2 text-gray-500">{language === 'tr' ? 'Bu randevu sayfası aktif değil veya henüz yok.' : 'This booking site is not active or doesn\'t exist.'}</p></div></div>;
  }

  if (tenantStatus === 'suspended') {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900"><div className="text-center"><h1 className="text-3xl font-bold dark:text-white">{language === 'tr' ? 'Hesap Askıda' : 'Account Suspended'}</h1><p className="mt-2 text-gray-500">{language === 'tr' ? 'Bu salonun hesabı şu anda askıya alınmış durumda.' : 'This salon\'s account is currently suspended.'}</p></div></div>;
  }

  const businessName = branding.businessName || 'Salon';
  const logoInitial = businessName.charAt(0).toUpperCase();

  const planId = tenant?.planId || 'baslangic';
  const aiEnabled = entitlementService.canUseFeature(planId, 'ai_style_assistant_basic') || entitlementService.canUseFeature(planId, 'ai_style_assistant_full');


  const isBookRoute = location.pathname === '/book' || 
                      location.pathname === `/${tenant?.slug}` ||
                      location.pathname.includes('/pilot/customer') ||
                      location.hash.includes('/pilot/customer');

  // If it's the book route, let the page handle its own full layout
  if (isBookRoute) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-900 transition-colors duration-300">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-900 transition-colors duration-300">
      <nav className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-40 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center gap-2">
                {branding.logoUrl ? (
                   <img src={branding.logoUrl} alt={businessName} className="h-8 w-auto rounded" />
                ) : (
                   <div className="w-8 h-8 bg-black dark:bg-white rounded-lg flex items-center justify-center text-white dark:text-black font-bold tracking-tighter">{logoInitial}</div>
                )}
                <span className="font-semibold text-xl text-primary dark:text-white">{businessName}</span>
              </div>
              
              <div className="hidden sm:ml-8 sm:flex sm:space-x-8">
                <Link 
                  to="/book" 
                  className={`${location.pathname === '/book' ? 'border-accent text-accent dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'} px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  {language === 'tr' ? 'Randevu Al' : 'Book Now'}
                </Link>
                {aiEnabled && (
                  <Link 
                    to="/ai-visualizer" 
                    className={`${location.pathname === '/ai-visualizer' ? 'border-accent text-accent dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'} px-1 pt-1 border-b-2 text-sm font-medium flex items-center gap-1`}
                  >
                    <span>🪄</span>
                    {language === 'tr' ? 'AI Stil Asistanı' : 'AI Style Assistant'}
                  </Link>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-1">
                <button onClick={() => setLanguage('en')} className={`px-3 py-1 rounded-md text-xs font-semibold ${language === 'en' ? 'bg-white text-accent shadow-sm' : 'text-gray-500'}`}>EN</button>
                <button onClick={() => setLanguage('tr')} className={`px-3 py-1 rounded-md text-xs font-semibold ${language === 'tr' ? 'bg-white text-accent shadow-sm' : 'text-gray-500'}`}>TR</button>
              </div>
              <a href="https://wa.me/905555555555" className="hidden md:inline-flex items-center justify-center bg-green-500 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-600 transition">
                İletişim
              </a>
            </div>
          </div>
        </div>
      </nav>
      <main className="flex-grow w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 max-w-7xl">
        <Outlet />
      </main>
      <footer className="bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 mt-auto py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500 dark:text-gray-400">
          &copy; {new Date().getFullYear()} {branding.footerText || businessName}
        </div>
      </footer>
    </div>
  );
};

export default SalonBookingLayout;
