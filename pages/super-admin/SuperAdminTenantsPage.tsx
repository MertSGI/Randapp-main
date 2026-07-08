import React, { useState, useEffect } from 'react';
import { superAdminService, TenantFullData } from '../../services/superAdminService';
import { useDialog } from '../../contexts/DialogContext';
import { Link } from 'react-router-dom';

const SuperAdminTenantsPage: React.FC = () => {
  const [tenants, setTenants] = useState<TenantFullData[]>([]);
  const [loading, setLoading] = useState(true);
  const { alert: showAlert, confirm: showConfirm } = useDialog();

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

  const handlePause = async (id: string, name: string) => {
    const confirmed = await showConfirm({ message: `'${name}' işletmesinin randevularını duraklatmak istediğinize emin misiniz?` });
    if (confirmed) {
      await superAdminService.pauseBookings(id);
      await showAlert(`'${name}' işletmesinin randevuları duraklatıldı.`);
      loadData();
    }
  };

  if (loading) return <div className="p-6 dark:text-white">Yükleniyor...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold dark:text-white">Kiracılar (Tenants)</h1>
      </div>
      
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        {/* Mobile View: Cards */}
        <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700">
          {tenants.map(t => (
            <div key={t.tenant.id} className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-gray-900 dark:text-white">{t.tenant.businessName || 'İsimsiz'}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">ID: {t.tenant.id}</div>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400`}>
                  {t.setupStatus}
                </span>
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Email: {t.tenant.ownerEmail || '-'}
              </div>
              <div className="flex justify-end space-x-3 pt-2 text-sm font-medium">
                <Link to={`/super-admin/tenant-preview/${t.tenant.id}`} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300">
                   Önizle
                </Link>
                <button onClick={() => handlePause(t.tenant.id, t.tenant.businessName || 'İşletme')} className="text-red-600 hover:text-red-900 dark:hover:text-red-400">
                   Durdur
                </button>
              </div>
            </div>
          ))}
          {tenants.length === 0 && (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              Kayıtlı işletme bulunamadı.
            </div>
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
            <thead className="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">İşletme</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">İletişim</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Durum</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">İşlemler</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
              {tenants.map(t => (
                <tr key={t.tenant.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-bold text-gray-900 dark:text-white">{t.tenant.businessName || 'İsimsiz'}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{t.tenant.id}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-700 dark:text-gray-300">{t.tenant.ownerEmail || '-'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400`}>
                      {t.setupStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                    <Link to={`/super-admin/tenant-preview/${t.tenant.id}`} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300">
                       Önizle
                    </Link>
                    <button onClick={() => handlePause(t.tenant.id, t.tenant.businessName || 'İşletme')} className="text-red-600 hover:text-red-900 dark:hover:text-red-400">
                       Durdur
                    </button>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    Kayıtlı işletme bulunamadı.
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
export default SuperAdminTenantsPage;
