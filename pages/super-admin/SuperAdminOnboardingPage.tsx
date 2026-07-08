import React, { useState, useEffect } from 'react';
import { superAdminService, TenantFullData } from '../../services/superAdminService';
import { useDialog } from '../../contexts/DialogContext';
import { Link } from 'react-router-dom';

const SuperAdminOnboardingPage: React.FC = () => {
  const [tenants, setTenants] = useState<TenantFullData[]>([]);
  const [loading, setLoading] = useState(true);
  const { alert: showAlert, confirm: showConfirm } = useDialog();

  const loadData = async () => {
    try {
      const data = await superAdminService.getDashboardData();
      // Onboarding focuses on non-live ones
      setTenants(data.tenants.filter(t => t.setupStatus !== 'live' && t.setupStatus !== 'paused'));
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApprove = async (id: string, name: string) => {
    const confirmed = await showConfirm({ message: `'${name}' işletmesinin randevu sistemini (Go-Live) onaylamak istediğinize emin misiniz?` });
    if (confirmed) {
      await superAdminService.approveGoLive(id);
      await showAlert(`'${name}' işletmesi yayına alındı.`);
      loadData();
    }
  };

  const handleSendBack = async (id: string, name: string) => {
    const confirmed = await showConfirm({ message: `'${name}' işletmesini eksikleri gidermesi için Kurulum (Setup) aşamasına geri göndermek istediğinize emin misiniz?` });
    if (confirmed) {
      await superAdminService.sendBackToSetup(id, 'Admin request');
      await showAlert(`'${name}' kurulum aşamasına geri yollandı.`);
      loadData();
    }
  };

  if (loading) return <div className="p-6 dark:text-white">Yükleniyor...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold dark:text-white">Kurulum Onayları</h1>
      </div>
      
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        {/* Mobile View: Cards */}
        <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700">
          {tenants.map(t => (
            <div key={t.tenant.id} className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-gray-900 dark:text-white">{t.tenant.businessName || 'İsimsiz'}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{t.tenant.ownerEmail || 'Email yok'}</div>
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                  {t.setupStatus === 'ready_for_review' ? 'Onay Bekliyor' : 'Kurulumda'}
                </span>
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Profil Doluluğu: <span className="font-medium text-gray-900 dark:text-white">{t.hasProfile ? 'Mevcut' : 'Eksik'}</span>
              </div>
              <div className="flex justify-end gap-2 pt-2 text-sm font-medium flex-wrap">
                <Link to={`/super-admin/tenant-preview/${t.tenant.id}`} className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/40">İncele</Link>
                <button onClick={() => handleApprove(t.tenant.id, t.tenant.businessName || 'İşletme')} className="px-3 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40">Onayla Yayına Al</button>
                <button onClick={() => handleSendBack(t.tenant.id, t.tenant.businessName || 'İşletme')} className="px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40">Geri Gönder</button>
              </div>
            </div>
          ))}
          {tenants.length === 0 && (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              Kurulum onayı bekleyen işletme bulunamadı.
            </div>
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
            <thead className="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">İşletme</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aşama</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Profil Doluluğu</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">İşlemler</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
              {tenants.map(t => (
                <tr key={t.tenant.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-bold text-gray-900 dark:text-white">{t.tenant.businessName || 'İsimsiz'}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{t.tenant.ownerEmail || 'Email yok'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                      {t.setupStatus === 'ready_for_review' ? 'Onay Bekliyor' : 'Kurulumda'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {t.hasProfile ? 'Mevcut' : 'Eksik'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                    <Link to={`/super-admin/tenant-preview/${t.tenant.id}`} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900">İncele</Link>
                    <button onClick={() => handleApprove(t.tenant.id, t.tenant.businessName || 'İşletme')} className="text-green-600 hover:text-green-900 dark:text-green-400">Onayla Yayına Al</button>
                    <button onClick={() => handleSendBack(t.tenant.id, t.tenant.businessName || 'İşletme')} className="text-red-600 hover:text-red-900 dark:text-red-400">Geri Gönder</button>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    Kurulum onayı bekleyen işletme bulunamadı.
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
export default SuperAdminOnboardingPage;
