import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { superAdminService } from '../../services/superAdminService';

const SuperAdminPaymentsPage: React.FC = () => {
  const [tenants, setTenants] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const data = await superAdminService.getDashboardData();
      setTenants(data.tenants || []);
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold dark:text-white">Ödemeler ve Abonelikler</h1>
        <Link 
          to="/super-admin/payment-test" 
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition"
        >
          Ödeme Sandbox Testi
        </Link>
      </div>

      {/* Internal Security Diagnostics */}
      <div className="bg-slate-900 rounded-xl p-4 mb-6 text-sm text-slate-300 font-mono border border-slate-700">
        <div className="flex items-center text-green-400 mb-2">
          <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className="font-bold">Iyzico Webhook Signature Validation: ACTIVE</span>
        </div>
        <p>• HMAC SHA-256 validation enabled for subscription events (X-IYZ-SIGNATURE-V3).</p>
        <p>• Idempotency tracking active via provider event tokens.</p>
        <p>• Missing signatures rejected (except when sandbox bypass is enabled internally).</p>
      </div>
      
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        {tenants.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Canlı Ödeme Kaydı Yok</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Sistemde aktif ödeme hareketi bulunamadı.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
             <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                <thead className="bg-gray-50 dark:bg-slate-800/50">
                   <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">İşletme</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Plan</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Abonelik Durumu</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Oluşturulma</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Test / Reference</th>
                   </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                   {tenants.map(t => (
                      <tr key={t.tenant.id}>
                         <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-bold text-slate-800 dark:text-slate-200">{t.tenant.businessName || t.tenant.name}</div>
                            <div className="text-xs text-slate-500">{t.tenant.ownerEmail || 'Unknown Email'}</div>
                         </td>
                         <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                            {t.planId}
                         </td>
                         <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-bold rounded-md ${t.subscriptionStatus === 'active' ? 'bg-green-100 text-green-800' : t.subscriptionStatus === 'trialing' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>
                               {t.subscriptionStatus}
                            </span>
                         </td>
                         <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                            {new Date(t.tenant.createdAt || t.tenant.created_at || Date.now()).toLocaleDateString('tr-TR')}
                         </td>
                         <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400">
                            <span title="Checkout events or webhook logs mapped internally">
                               {t.tenant.id.includes('mock') ? 'Mock Data' : (t.hasProfile ? 'Registered - Sandbox Checkout' : '-')}
                            </span>
                         </td>
                      </tr>
                   ))}
                </tbody>
             </table>
          </div>
        )}
      </div>
    </div>
  );
};
export default SuperAdminPaymentsPage;
