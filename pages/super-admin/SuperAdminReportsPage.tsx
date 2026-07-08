import React, { useState, useEffect } from 'react';
import { superAdminService } from '../../services/superAdminService';

const SuperAdminReportsPage: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    superAdminService.getDashboardData().then(data => {
      setStats(data.stats);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="p-6 dark:text-white">Yükleniyor...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold dark:text-white">Platform Raporları</h1>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-gray-100 dark:border-slate-700">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Toplam Kiracı</div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{stats?.totalSalons || 0}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-gray-100 dark:border-slate-700">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Aktif (Live)</div>
          <div className="mt-2 text-3xl font-bold text-green-600 dark:text-green-400">{stats?.liveSalons || 0}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-gray-100 dark:border-slate-700">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Kurulum Bekleyen</div>
          <div className="mt-2 text-3xl font-bold text-yellow-600 dark:text-yellow-400">{stats?.awaitingSetup || 0}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-gray-100 dark:border-slate-700">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tahmini Aylık Ciro</div>
          <div className="mt-2 text-3xl font-bold text-indigo-600 dark:text-indigo-400">₺{stats?.monthlyRecurringRevenue?.toLocaleString() || 0}</div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Detaylı Analitik Yakında</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
             Mock modundayken sadece üst düzey metrikler hesaplanır. Supabase Edge Functions / Time Series Metrics aktif edildiğinde detaylı grafikler burada yer alacaktır.
          </p>
        </div>
      </div>
    </div>
  );
};
export default SuperAdminReportsPage;
