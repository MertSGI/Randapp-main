import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { translations } from '../../utils/translations';
import { marketConfigService } from '../../services/marketConfigService';

const AdminLayout: React.FC = () => {
  const { logout, currentUser } = useAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const t = translations[language];

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 h-16 flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-xl font-bold text-accent dark:text-blue-400 font-sans tracking-wide">
            {marketConfigService.getBrandName()}
          </span>
          <div className="h-6 w-px bg-gray-300 dark:bg-slate-600"></div>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {tenant ? tenant.name : (t.admin.panel_title || "İşletme Admin Paneli")}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
            {currentUser?.email}
          </div>
          <button
            onClick={handleLogout}
            className="hidden sm:block text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
          >
            {t.admin.logout || "Çıkış Yap"}
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-900">
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
