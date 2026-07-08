import React, { useState, useEffect } from 'react';
import { superAdminService, TenantFullData } from '../../services/superAdminService';
import { useDialog } from '../../contexts/DialogContext';

const SuperAdminSubscriptionsPage: React.FC = () => {
  const [tenants, setTenants] = useState<TenantFullData[]>([]);
  const [loading, setLoading] = useState(true);
  const { alert: showAlert, confirm: showConfirm } = useDialog();
  const isMock = (() => { try { return (import.meta as any).env?.VITE_DATA_MODE === 'mock'; } catch { return true; } })();

  const loadData = async () => {
    try {
      const data = await superAdminService.getDashboardData();
      setTenants(data.tenants);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleForceStatus = async (tenantId: string, businessName: string, status: string) => {
    if (!isMock) {
       await showAlert('Canlı ortamda bu işlem Edge Functions + Supabase (veya Iyzico Callback) üzerinden yönetilir.', 'Bilgi');
       return;
    }
    const confirmed = await showConfirm({ message: `'${businessName}' işletmesinin abonelik durumunu '${status}' yapmak istediğinize emin misiniz?` });
    if (confirmed) {
       await superAdminService.forceSubscriptionStatus(tenantId, status);
       await showAlert(`Abonelik durumu güncellendi.`);
       loadData();
    }
  };

  if (loading) return <div className="p-6 dark:text-white">Yükleniyor...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold dark:text-white">Abonelikler</h1>
      </div>
      
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        {/* Mobile View: Cards */}
        <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700">
          {tenants.map(t => (
            <div key={t.tenant.id} className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div className="font-bold text-gray-900 dark:text-white">{t.tenant.businessName || 'İsimsiz'}</div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    t.subscriptionStatus === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                    t.subscriptionStatus === 'past_due' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    'bg-gray-100 text-gray-800 dark:bg-slate-700 dark:text-gray-300'
                }`}>
                  {t.subscriptionStatus}
                </span>
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Plan: <span className="font-medium">{t.planId}</span>
              </div>
              <div className="flex justify-end gap-2 pt-2 text-sm font-medium flex-wrap">
                <button onClick={() => handleForceStatus(t.tenant.id, t.tenant.businessName || 'İşletme', 'active')} className="px-3 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40">Aktif</button>
                <button onClick={() => handleForceStatus(t.tenant.id, t.tenant.businessName || 'İşletme', 'past_due')} className="px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/40">Gecikmiş</button>
                <button onClick={() => handleForceStatus(t.tenant.id, t.tenant.businessName || 'İşletme', 'canceled')} className="px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40">İptal</button>
              </div>
            </div>
          ))}
          {tenants.length === 0 && (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              Abonelik kaydı bulunamadı.
            </div>
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
            <thead className="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">İşletme</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Durum</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">İşlemler (Mock)</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
              {tenants.map(t => (
                <tr key={t.tenant.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-bold text-gray-900 dark:text-white">{t.tenant.businessName || 'İsimsiz'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-700 dark:text-gray-300">{t.planId}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        t.subscriptionStatus === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                        t.subscriptionStatus === 'past_due' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                        'bg-gray-100 text-gray-800 dark:bg-slate-700 dark:text-gray-300'
                    }`}>
                      {t.subscriptionStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button onClick={() => handleForceStatus(t.tenant.id, t.tenant.businessName || 'İşletme', 'active')} className="text-green-600 hover:text-green-900 dark:text-green-400">Aktif Yap</button>
                    <button onClick={() => handleForceStatus(t.tenant.id, t.tenant.businessName || 'İşletme', 'past_due')} className="text-yellow-600 hover:text-yellow-900 dark:text-yellow-400">Past Due</button>
                    <button onClick={() => handleForceStatus(t.tenant.id, t.tenant.businessName || 'İşletme', 'canceled')} className="text-red-600 hover:text-red-900 dark:text-red-400">İptal</button>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    Abonelik kaydı bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default SuperAdminSubscriptionsPage;
