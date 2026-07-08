import React, { useEffect, useState } from 'react';
import { TenantFullData, superAdminService } from '../services/superAdminService';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { useDialog } from '../contexts/DialogContext';
import { Link } from 'react-router-dom';

const SuperAdminDashboard: React.FC = () => {
  const [data, setData] = useState<{stats: any, tenants: TenantFullData[]} | null>(null);
  const [loading, setLoading] = useState(true);
  const { language } = useLanguage();
  const trl = translations[language];
  const { alert: showAlert, confirm: showConfirm } = useDialog();

  const loadData = () => {
    setLoading(true);
    superAdminService.getDashboardData().then(d => {
      setData(d);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApprove = async (tenantId: string) => {
    const confirmed = await showConfirm({ message: trl.super_admin?.approve_prompt || 'Approve this business for live bookings?' });
    if (confirmed) {
        await superAdminService.approveGoLive(tenantId);
        await showAlert(trl.super_admin?.approve_success || 'Business is live.');
        loadData();
    }
  };

  if (loading) return <div className="p-8 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary dark:border-white"></div></div>;
  if (!data) return <div className="p-8">Error loading data.</div>;

  const reviewTenants = data.tenants.filter(t => t.setupStatus === 'ready_for_review');
  const otherTenants = data.tenants.filter(t => t.setupStatus !== 'ready_for_review');

  return (
    <div className="space-y-6 md:space-y-8 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Platform Overview</h1>
        <p className="text-gray-500">Super Admin Dashboard</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Salons', value: data.stats.totalSalons },
          { label: 'Active (Live)', value: data.stats.liveSalons, color: 'text-green-600' },
          { label: 'Ready for Review', value: data.stats.awaitingSetup - (otherTenants.filter(t => t.setupStatus === 'setup_in_progress').length), color: 'text-yellow-600' },
          { label: 'MRR (Est.)', value: `₺${data.stats.monthlyRecurringRevenue}`, color: 'text-blue-600' },
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col justify-center">
            <div className="text-xs md:text-sm font-medium text-gray-500 uppercase">{stat.label}</div>
            <div className={`mt-2 text-2xl md:text-3xl font-bold ${stat.color || 'text-gray-900 dark:text-white'}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {reviewTenants.length > 0 && (
         <div className="bg-yellow-50 dark:bg-yellow-900/20 shadow-sm rounded-xl border border-yellow-200 dark:border-yellow-700 overflow-hidden mb-8">
          <div className="px-4 py-3 md:px-6 md:py-4 border-b border-yellow-200 dark:border-yellow-700 flex justify-between items-center">
            <h2 className="text-base md:text-lg font-bold text-yellow-900 dark:text-yellow-100">Ready for Review ({reviewTenants.length})</h2>
            <Link to="/super-admin/onboarding" className="text-sm text-yellow-700 dark:text-yellow-300 font-medium hover:underline">View All</Link>
          </div>
          <div className="p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
             {reviewTenants.slice(0, 3).map((t) => (
                <div key={t.tenant.id} className="bg-white dark:bg-slate-800 border border-yellow-200 dark:border-yellow-700/50 rounded-lg p-4 shadow-sm flex flex-col">
                    <div className="font-bold text-gray-900 dark:text-white truncate">{t.tenant.businessName || 'Unnamed'}</div>
                    <div className="text-sm text-gray-500 truncate mb-4">{t.tenant.ownerEmail}</div>
                    <div className="mt-auto flex flex-col gap-2">
                       <button onClick={() => handleApprove(t.tenant.id)} className="w-full bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-md text-sm font-bold shadow-sm transition-colors text-center">{trl.super_admin?.approve || 'Approve Go-Live'}</button>
                       <Link to="/super-admin/onboarding" className="w-full bg-yellow-100 text-yellow-800 hover:bg-yellow-200 px-3 py-2 rounded-md text-sm font-bold shadow-sm transition-colors text-center">Manage</Link>
                    </div>
                </div>
             ))}
          </div>
         </div>
      )}
    </div>
  );
};

export default SuperAdminDashboard;
