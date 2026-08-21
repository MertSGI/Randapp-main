import React from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { Stethoscope, LogOut, LayoutDashboard, UserCheck, Shield } from 'lucide-react';

const ClinicLayout: React.FC = () => {
  const { currentUser, logout, hasRole } = useAuth();
  const isOwner = hasRole(['tenant_owner']);
  const { tenant } = useTenant();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col text-slate-800 dark:text-slate-100 font-sans">
      {/* Header Bar */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Brand & Context */}
          <div className="flex items-center space-x-4">
            <Link to="/clinic" className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400 font-bold text-xl tracking-tight">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
                <Stethoscope className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <span>LARİ <span className="text-slate-900 dark:text-white font-extrabold">CLINIC</span></span>
            </Link>

            {tenant && (
              <span className="hidden sm:inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                {tenant.name || tenant.slug}
              </span>
            )}
          </div>

          {/* Navigation & User Controls */}
          <div className="flex items-center space-x-3">
            {isOwner && (
              <Link
                to="/admin"
                className="hidden md:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                title="İşletme Yönetim Paneline Dön"
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                <span>İşletme Yönetimi</span>
              </Link>
            )}

            {currentUser && (
              <div className="flex items-center space-x-2 text-xs border-l border-slate-200 dark:border-slate-700 pl-3">
                <div className="text-right hidden sm:block">
                  <div className="font-semibold text-slate-900 dark:text-white">{currentUser.name || currentUser.email}</div>
                  <div className="text-slate-500 dark:text-slate-400 capitalize">{currentUser.role === 'tenant_owner' ? 'İşletme Sahibi' : 'Klinik Personeli'}</div>
                </div>

                <button
                  onClick={handleLogout}
                  className="p-2 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  title="Güvenli Çıkış"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 py-3 text-center text-xs text-slate-400">
        LARİ Clinic Workspace • Güvenli Sağlık Yönetim Platformu
      </footer>
    </div>
  );
};

export default ClinicLayout;
