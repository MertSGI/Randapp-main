import React, { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { translations } from '../../utils/translations';
import { marketConfigService } from '../../services/marketConfigService';

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

const SuperAdminLayout: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { currentUser, logout } = useAuth();
  const location = useLocation();
  const { language } = useLanguage();
  const t = translations[language];

  const links = [
    { label: t.super_admin.dashboard || 'Overview', path: '/super-admin' },
    { label: t.super_admin.tenants || 'Tenants', path: '/super-admin/tenants' },
    { label: t.super_admin.subscriptions || 'Subscriptions', path: '/super-admin/subscriptions' },
    { label: t.super_admin_nav?.payments || 'Payments', path: '/super-admin/payments' },
    { label: t.super_admin_nav?.onboarding || 'Onboarding', path: '/super-admin/onboarding' },
    { label: t.super_admin_nav?.reports || 'Reports', path: '/super-admin/reports' },
    { label: t.super_admin_nav?.settings || 'Settings', path: '/super-admin/settings' },
    { label: t.super_admin_nav?.payment_test || 'Payment Test', path: '/super-admin/payment-test' },
    { label: 'AI Ayarları', path: '/super-admin/ai-settings' },
    { label: 'Planlar & Fiyatlar', path: '/super-admin/plans' },
    { label: 'Referans Kampanyaları', path: '/super-admin/referrals' },
    { label: 'Sandbox ve Yayın Hazırlığı', path: '/super-admin/go-live' },
    { label: 'Pilot Müşteriler', path: '/super-admin/pilots' },
    { label: 'Zamanlayıcı & Arka Plan', path: '/super-admin/scheduler' },
    { label: 'Gözlemlenebilirlik & Destek', path: '/super-admin/observability' },
    { label: 'Hukuk & KVKK Paneli', path: '/super-admin/legal' },
  ];

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-slate-900 transition-colors duration-300">
      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden block"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 w-64 bg-slate-900 dark:bg-slate-950 text-white flex flex-col shrink-0 z-50 transform transition-transform duration-300 md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800">
          <span className="font-bold text-lg tracking-wide">{t.super_admin.panel_title || 'Master'} ({marketConfigService.getBrandName()})</span>
          <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {links.map((l) => (
            <NavLink
              key={l.path}
              to={l.path}
              onClick={() => setIsMobileMenuOpen(false)}
              end={l.path === '/super-admin'}
              className={({ isActive }) => `block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <div className="text-xs text-slate-400 mb-2 truncate">{currentUser?.email}</div>
          <button onClick={logout} className="w-full text-left px-4 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-slate-800 hover:text-red-300 transition-colors">
            {t.super_admin.logout || 'Log out'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-0">
        <header className="h-16 bg-white dark:bg-slate-800 shadow-sm flex items-center justify-between px-4 sm:px-8 z-10 shrink-0">
          <div className="flex items-center gap-3">
             <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
               <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
             </button>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] sm:text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 px-2 py-1 rounded-full border border-purple-200 dark:border-purple-800">SUPER ADMIN</span>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default SuperAdminLayout;
