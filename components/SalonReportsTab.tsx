import React, { useState, useMemo, useEffect } from 'react';
import { Appointment, Service, Staff } from '../types';
import { reportingService } from '../services/reportingService';
import { useTenant } from '../contexts/TenantContext';
import { entitlementService } from '../services/entitlementService';
import { useLanguage } from '../contexts/LanguageContext';

interface SalonReportsTabProps {
  appointments: Appointment[];
  services: Service[];
  staff: Staff[];
}

const SalonReportsTab: React.FC<SalonReportsTabProps> = ({ appointments, services, staff }) => {
  const [dateRange, setDateRange] = useState<'this_month' | 'last_month' | 'last_30_days'>('this_month');
  const { tenant } = useTenant();
  const { language } = useLanguage();
  const [campaignStats, setCampaignStats] = useState<{
    totalConversions: number;
    rewardsGenerated: number;
    rewardsClaimed: number;
    topCampaign: string;
  }>({
    totalConversions: 0,
    rewardsGenerated: 0,
    rewardsClaimed: 0,
    topCampaign: '-',
  });

  const planId = tenant?.planId || 'baslangic';
  const hasAccess = entitlementService.canUseFeature(planId, 'reports_basic') || entitlementService.canUseFeature(planId, 'reports_advanced');

  const metrics = useMemo(() => {
    return reportingService.getReportMetrics(appointments, services, dateRange);
  }, [appointments, services, dateRange]);

  useEffect(() => {
    if (tenant) {
      import('../services/customerCampaignService').then(({ customerCampaignService }) => {
        customerCampaignService.listCustomerReferrals(tenant.id).then(allRefs => {
          const completedCount = allRefs.filter(r => r.status === 'completed' || r.status === 'rewarded').length;
          
          customerCampaignService.listCustomerRewards(tenant.id).then(allRewards => {
            const generated = allRewards.length;
            const claimed = allRewards.filter(rw => rw.status === 'used').length;
            
            const counts: Record<string, number> = {};
            let maxCount = 0;
            let bestCampaignId = '-';
            allRefs.forEach(r => {
              counts[r.campaignId] = (counts[r.campaignId] || 0) + 1;
              if (counts[r.campaignId] > maxCount) {
                maxCount = counts[r.campaignId];
                bestCampaignId = r.campaignId;
              }
            });

            const topCampaignName = bestCampaignId === 'default' 
              ? (language === 'tr' ? 'Arkadaşını Getir v1' : 'Refer a Friend v1') 
              : bestCampaignId === '-' ? '-' : bestCampaignId;

            setCampaignStats({
              totalConversions: completedCount,
              rewardsGenerated: generated,
              rewardsClaimed: claimed,
              topCampaign: topCampaignName
            });
          }).catch(err => console.warn(err));
        }).catch(err => console.warn(err));
      }).catch(err => console.warn(err));
    }
  }, [tenant, language]);

  if (!hasAccess) {
    return (
      <div className="space-y-8">
        <div className="bg-white dark:bg-slate-800 shadow-sm rounded-lg border border-gray-200 dark:border-slate-700 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {language === 'tr' ? 'Raporlar özelliği mevcut paketinizde yer almıyor' : 'Reports are not included in your current plan'}
          </h2>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            {language === 'tr' 
              ? 'Raporlama ve istatistik özellikleri Standart ve üstü paketlerde kullanılabilir.'
              : 'Reporting and statistical features are available in the Standard plan and above.'}
          </p>
          <a href="#/admin/billing" className="bg-accent hover:bg-blue-600 text-white font-bold py-2.5 px-6 rounded-md shadow transition inline-block">
            {language === 'tr' ? 'Paketleri İncele' : 'View Plans'}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Raporlar & İstatistikler</h2>
        <select 
          value={dateRange}
          onChange={(e: any) => setDateRange(e.target.value)}
          className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white rounded-lg px-4 py-2"
        >
          <option value="this_month">Bu Ay</option>
          <option value="last_month">Geçen Ay</option>
          <option value="last_30_days">Son 30 Gün</option>
        </select>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg border border-blue-100 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
        <strong>Not:</strong> Bu gelir tahmini, uygulama üzerinden oluşturulan (ve iptal edilmeyen) randevulardaki güncel hizmet fiyatlarına göre hesaplanır. Tahsilat garantisi veya kesin finansal tablo değildir.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: 'Toplam Randevu', value: metrics.totalAppointments },
          { label: 'Tamamlanan', value: metrics.completedAppointments, color: 'text-green-600' },
          { label: 'İptal Edilen', value: metrics.canceledAppointments, color: 'text-red-600' },
          { label: 'Tahmini Gelir', value: `₺${metrics.estimatedRevenue}`, color: 'text-blue-600' },
          { label: 'Ort. Randevu Değeri', value: `₺${metrics.averageAppointmentValue.toFixed(0)}` },
        ].map((m, i) => (
          <div key={i} className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm text-center">
            <div className="text-xs font-semibold text-gray-500 uppercase">{m.label}</div>
            <div className={`mt-2 text-2xl font-bold ${m.color || 'text-gray-900 dark:text-white'}`}>{m.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">En Çok Tercih Edilen Hizmet</h3>
          <div className="text-xl font-medium text-accent">{metrics.mostBookedService || 'Yeterli veri yok'}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">En Yüksek Ciro Getiren Hizmet</h3>
          <div className="text-xl font-medium text-green-600">
            {metrics.topRevenueService || 'Yeterli veri yok'}
          </div>
        </div>
      </div>

      {/* CAMPAIGN PERFORMANCE BLOCK */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-lg font-bold mb-4 text-purple-700 dark:text-purple-400 flex items-center gap-2">
          <span>{language === 'tr' ? 'Müşteri Davet Kampanyası Performansı' : 'Customer Referral Campaign Performance'}</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-purple-50/40 dark:bg-purple-950/10 p-4 rounded-lg border border-purple-100/40 dark:border-purple-800/20 text-center">
            <div className="text-xs font-semibold text-gray-500 uppercase">{language === 'tr' ? 'Toplam Dönüşüm' : 'Total Referral Conversions'}</div>
            <div className="mt-2 text-2xl font-bold text-purple-700 dark:text-purple-400">{campaignStats.totalConversions}</div>
          </div>
          <div className="bg-purple-50/40 dark:bg-purple-950/10 p-4 rounded-lg border border-purple-100/40 dark:border-purple-800/20 text-center">
            <div className="text-xs font-semibold text-gray-500 uppercase">{language === 'tr' ? 'Üretilen Ödüller' : 'Rewards Generated'}</div>
            <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{campaignStats.rewardsGenerated}</div>
          </div>
          <div className="bg-purple-50/40 dark:bg-purple-950/10 p-4 rounded-lg border border-purple-100/40 dark:border-purple-800/20 text-center">
            <div className="text-xs font-semibold text-gray-500 uppercase">{language === 'tr' ? 'Kullanılan Ödüller' : 'Rewards Claimed'}</div>
            <div className="mt-2 text-2xl font-bold text-green-600">{campaignStats.rewardsClaimed}</div>
          </div>
          <div className="bg-purple-50/40 dark:bg-purple-950/10 p-4 rounded-lg border border-purple-100/40 dark:border-purple-800/20 text-center">
            <div className="text-xs font-semibold text-gray-500 uppercase">{language === 'tr' ? 'En Popüler Kampanya' : 'Top Campaign'}</div>
            <div className="mt-2 text-sm font-semibold truncate text-gray-900 dark:text-white" title={campaignStats.topCampaign}>
              {campaignStats.topCampaign}
            </div>
          </div>
        </div>
      </div>

      {/* SOURCE BREAKDOWN BLOCK */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm mt-6">
        <h3 className="text-lg font-bold mb-4 text-indigo-700 dark:text-indigo-400">
          Randevu Kaynakları (Müşteri Kazanım)
        </h3>
        {Object.keys(metrics.sourceBreakdown || {}).length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {Object.entries(metrics.sourceBreakdown).map(([source, count]) => {
                const sourceMap: any = {
                  whatsapp: 'WhatsApp',
                  instagram: 'Instagram Bio',
                  instagram_story: 'Instagram Story',
                  google_business: 'Google Business',
                  launch: 'İlk Duyuru',
                  qr: 'QR Kod',
                  reminder: 'Hatırlatıcı Mesaj'
                };
                return (
                  <div key={source} className="bg-gray-50 dark:bg-slate-900 p-4 rounded-lg border border-gray-100 dark:border-slate-700 text-center">
                    <div className="text-xs font-semibold text-gray-500 uppercase truncate" title={sourceMap[source] || source}>{sourceMap[source] || source}</div>
                    <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{count as number}</div>
                  </div>
                );
            })}
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 dark:bg-slate-900/50 rounded-lg border border-dashed border-gray-200 dark:border-slate-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Henüz tanımlı paylaşım kaynaklarından randevu alınmadı.<br/>
              Paylaşım araçları üzerinden linklerinizi daha fazla kişiye ulaştırarak rezervasyon sayınızı artırın!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalonReportsTab;
