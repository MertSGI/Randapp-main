import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { useTenant } from '../contexts/TenantContext';
import { useDialog } from '../contexts/DialogContext';
import { entitlementService } from '../services/entitlementService';
import { referralProgramService } from '../services/referralProgramService';
import { customerCampaignService } from '../services/customerCampaignService';
import { getBookingRepository } from '../services/repositories';
import { BusinessCustomerCampaign, BusinessCustomerReferral, CustomerCampaignReward } from '../types';

interface TempCampaignInput {
  name: string;
  type: 'refer_friend' | 'discount' | 'loyalty';
  customerReward: string;
  referredCustomerReward: string;
  terms: string;
  maxUses?: number;
}

const ReferralTab: React.FC = () => {
  const { language } = useLanguage();
  const t = translations[language];
  const { tenant } = useTenant();
  const { alert: showAlert, confirm: showConfirm } = useDialog();

  const [campaigns, setCampaigns] = useState<BusinessCustomerCampaign[]>([]);
  const [customerReferrals, setCustomerReferrals] = useState<BusinessCustomerReferral[]>([]);
  const [customerRewards, setCustomerRewards] = useState<CustomerCampaignReward[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [platformReferrals, setPlatformReferrals] = useState<any[]>([]);
  const [platformLedgers, setPlatformLedgers] = useState<any[]>([]);

  // Modals / Form States
  const [showAddCampaignModal, setShowAddCampaignModal] = useState(false);
  const [showEditCampaignModal, setShowEditCampaignModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<BusinessCustomerCampaign | null>(null);
  const [showAddReferralModal, setShowAddReferralModal] = useState(false);

  // New Campaign Form values
  const [newCampaign, setNewCampaign] = useState<TempCampaignInput>({
    name: 'Arkadaşını Getir',
    type: 'refer_friend',
    customerReward: 'Bir sonraki randevuda %15 indirim',
    referredCustomerReward: 'İlk randevuda %10 indirim',
    terms: 'Ödül, referansla gelen müşterinin randevusunu tamamlaması sonrası geçerlidir.',
    maxUses: 100,
  });

  // New Referral Form values
  const [referrerId, setReferrerId] = useState('');
  const [targetCampaignId, setTargetCampaignId] = useState('');
  const [referredName, setReferredName] = useState('');
  const [referredPhone, setReferredPhone] = useState('');

  const planId = tenant?.planId || 'baslangic';
  const hasAccess = entitlementService.canUseFeature(planId, 'campaigns_referrals');

  const reloadData = async () => {
    if (tenant) {
      try {
        const camps = await customerCampaignService.listCampaigns(tenant.id);
        setCampaigns(camps);

        const refs = await customerCampaignService.listCustomerReferrals(tenant.id);
        setCustomerReferrals(refs);

        const rewardsList = await customerCampaignService.listCustomerRewards(tenant.id);
        setCustomerRewards(rewardsList);

        const platRefs = referralProgramService.listTenantReferrals(tenant.id);
        setPlatformReferrals(platRefs);

        const platLeds = referralProgramService.listReferralRewards(tenant.id);
        setPlatformLedgers(platLeds);

        // Load customers for manuals list
        const bookingRepo = getBookingRepository();
        const custs = await bookingRepo.listCustomers(tenant.id);
        setCustomers(custs || []);
      } catch (err) {
        console.error('Failed to load campaigns/referrals data', err);
      }
    }
  };

  useEffect(() => {
    reloadData();
  }, [tenant]);

  const referralCode = tenant?.id ? referralProgramService.createReferralCode(tenant.id) : '';
  const referralLink = `${window.location.origin}/#/register?ref=${referralCode}&planId=${planId}`;

  const program = referralProgramService.getActivePlatformReferralProgram();
  const qualifiedCount = platformReferrals.filter(r => r.status === 'qualified' || r.status === 'rewarded').length;
  const earnedMonths = platformLedgers.reduce((acc, curr) => acc + curr.monthsGranted, 0);

  // Stats computation for active campaigns
  const totalStats = customerReferrals.reduce(
    (acc, ref) => {
      acc.total++;
      if (ref.status === 'booked') acc.booked++;
      if (ref.status === 'completed') acc.completed++;
      if (ref.status === 'rewarded') acc.rewarded++;
      if (ref.status === 'rejected') acc.rejected++;
      if (ref.status === 'pending') acc.pending++;
      return acc;
    },
    { total: 0, pending: 0, booked: 0, completed: 0, rewarded: 0, rejected: 0 }
  );

  const rewardsAvailable = customerRewards.filter(rw => rw.status === 'available').length;
  const rewardsUsed = customerRewards.filter(rw => rw.status === 'used').length;

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    if (!hasAccess) {
      showAlert(language === 'tr' ? 'Bu işlem yetkiniz dışında.' : 'Unauthorized action.');
      return;
    }
    try {
      await customerCampaignService.createCampaign(tenant.id, {
        name: newCampaign.name,
        type: newCampaign.type,
        customerReward: newCampaign.customerReward,
        referredCustomerReward: newCampaign.referredCustomerReward,
        rewardDescription: newCampaign.terms,
        terms: newCampaign.terms,
        maxUses: newCampaign.maxUses,
        isActive: true,
      });
      setShowAddCampaignModal(false);
      showAlert(language === 'tr' ? 'Kampanya başarıyla oluşturuldu.' : 'Campaign successfully created.');
      reloadData();
    } catch (err: any) {
      showAlert(err.message || 'Hata oluştu');
    }
  };

  const handleUpdateCampaignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaign) return;
    if (!hasAccess) {
      showAlert(language === 'tr' ? 'Bu işlem yetkiniz dışında.' : 'Unauthorized action.');
      return;
    }
    try {
      await customerCampaignService.updateCampaign(selectedCampaign.id, {
        name: selectedCampaign.name,
        type: selectedCampaign.type,
        customerReward: selectedCampaign.customerReward,
        referredCustomerReward: selectedCampaign.referredCustomerReward,
        rewardDescription: selectedCampaign.terms,
        terms: selectedCampaign.terms,
        maxUses: selectedCampaign.maxUses,
        isActive: selectedCampaign.isActive,
      });
      setShowEditCampaignModal(false);
      setSelectedCampaign(null);
      showAlert(language === 'tr' ? 'Kampanya başarıyla güncellendi.' : 'Campaign successfully updated.');
      reloadData();
    } catch (err: any) {
      showAlert(err.message || 'Hata oluştu');
    }
  };

  const toggleCampaignActive = async (campaign: BusinessCustomerCampaign) => {
    if (!hasAccess) return;
    try {
      await customerCampaignService.updateCampaign(campaign.id, {
        isActive: !campaign.isActive,
      });
      reloadData();
    } catch (err: any) {
      showAlert(err.message || 'Hata oluştu');
    }
  };

  const createManualReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    if (!referrerId || !targetCampaignId || !referredName) {
      showAlert(language === 'tr' ? 'Lütfen tüm mecburi alanları doldurun.' : 'Please fill in all required fields.');
      return;
    }
    try {
      // Find customer name
      const referrerCust = customers.find(c => c.id === referrerId);
      const referrerLabel = referrerCust ? referrerCust.name : referrerId;

      await customerCampaignService.createCustomerReferral(tenant.id, {
        campaignId: targetCampaignId,
        referrerCustomerId: referrerId,
        referredCustomerName: referredName,
        referredCustomerPhone: referredPhone,
        status: 'pending',
      });

      setShowAddReferralModal(false);
      setReferrerId('');
      setTargetCampaignId('');
      setReferredName('');
      setReferredPhone('');
      showAlert(language === 'tr' ? 'Müşteri referansı başarıyla kaydedildi.' : 'Customer referral successfully logged.');
      reloadData();
    } catch (err: any) {
      showAlert(err.message || 'Hata oluştu');
    }
  };

  const updateReferralStatusAction = async (id: string, action: 'completed' | 'rewarded' | 'rejected') => {
    try {
      if (action === 'completed') {
        const confirm = await showConfirm({
          message: language === 'tr' ? 'Bu referansla gelen müşterinin randevusu tamamlandı olarak işaretlenecek. Emin misiniz?' : 'Mark referred appointment as completed for this referral. Are you sure?',
        });
        if (confirm) {
          await customerCampaignService.markReferralCompleted(id);
          reloadData();
        }
      } else if (action === 'rewarded') {
        const confirm = await showConfirm({
          message: language === 'tr' ? 'Müşteriye hak ettiği ödülün teslim edildiğini onaylıyor musunuz?' : 'Confirm that the customer received their earned reward?',
        });
        if (confirm) {
          await customerCampaignService.markReferralRewarded(id);
          reloadData();
        }
      } else if (action === 'rejected') {
        const confirm = await showConfirm({
          message: language === 'tr' ? 'Bu referans kaydını reddetmek istediğinize emin misiniz?' : 'Are you sure you want to reject this referral record?',
        });
        if (confirm) {
          await customerCampaignService.rejectReferral(id, 'Admin manually rejected');
          reloadData();
        }
      }
    } catch (err: any) {
      showAlert(err.message || 'Hata oluştu');
    }
  };

  const handleMarkRewardUsed = async (rewardId: string) => {
    try {
      const confirm = await showConfirm({
        message: language === 'tr' ? 'Bu ödülü kullanıldı olarak işaretlemek istiyor musunuz?' : 'Are you sure you want to mark this reward as used?',
      });
      if (confirm) {
        await customerCampaignService.markRewardUsed(rewardId);
        showAlert(language === 'tr' ? 'Ödül kullanımı başarıyla kaydedildi.' : 'Reward marked as used.');
        reloadData();
      }
    } catch (err: any) {
      showAlert(err.message || 'Hata oluştu');
    }
  };

  const handleCancelReward = async (rewardId: string) => {
    try {
      const confirm = await showConfirm({
        message: language === 'tr' ? 'Bu ödülü iptal etmek istediğinize emin misiniz?' : 'Are you sure you want to cancel this reward?',
      });
      if (confirm) {
        await customerCampaignService.cancelReward(rewardId, 'İşletme sahibi iptal etti');
        showAlert(language === 'tr' ? 'Ödül başarıyla iptal edildi.' : 'Reward successfully cancelled.');
        reloadData();
      }
    } catch (err: any) {
      showAlert(err.message || 'Hata oluştu');
    }
  };

  const getCampaignName = (campaignId: string) => {
    const found = campaigns.find(c => c.id === campaignId);
    return found ? found.name : campaignId === 'default' ? 'Arkadaşını Getir v1' : campaignId;
  };

  const getCustomerName = (customerId: string) => {
    const found = customers.find(c => c.id === customerId);
    return found ? found.name : customerId;
  };

  return (
    <div className="space-y-10">
      {/* SECTION A: LARİ Referans Programı */}
      <div id="lari-platform-referral-section" className="space-y-6">
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 shadow-lg rounded-2xl border border-indigo-800 p-8 text-white relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
            <div>
              <h2 className="text-2xl font-bold mb-2">
                {language === 'tr' ? 'LARİ Referans Programı' : 'LARİ Referral Program'}
              </h2>
              <p className="text-indigo-200">
                {language === 'tr'
                  ? `İşletme önerin, ücretsiz kullanım kazanın. ${program.rewardPerQualifiedReferralMonths} referans = ${program.rewardPerQualifiedReferralMonths} ay hediye!`
                  : `Refer a business, earn free months. ${program.rewardPerQualifiedReferralMonths} referral = ${program.rewardPerQualifiedReferralMonths} month free!`}
              </p>
            </div>
            <div className="bg-indigo-950/50 backdrop-blur border border-indigo-800 rounded-xl p-4 flex gap-8 items-center shrink-0">
              <div className="text-center">
                <p className="text-indigo-300 text-xs uppercase tracking-widest mb-1">{language === 'tr' ? 'Kalifiye' : 'Qualified'}</p>
                <p className="text-3xl font-bold text-white leading-none">{qualifiedCount}</p>
              </div>
              <div className="w-px h-10 bg-indigo-800"></div>
              <div className="text-center">
                <p className="text-indigo-300 text-xs uppercase tracking-widest mb-1">{language === 'tr' ? 'Kazanılan (Ay)' : 'Earned (Mo)'}</p>
                <p className="text-3xl font-bold text-green-400 leading-none">{earnedMonths}</p>
              </div>
            </div>
          </div>

          <div className="bg-white/10 border border-white/20 rounded-xl p-6 relative z-10 flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-1 w-full">
              <p className="text-indigo-200 text-xs uppercase tracking-widest mb-2 font-semibold">
                {language === 'tr' ? 'Sizin Referans Linkiniz' : 'Your Referral Link'}
              </p>
              <input
                readOnly
                value={referralLink}
                className="w-full bg-indigo-950/50 border border-indigo-500/30 text-white rounded-lg px-4 py-3 outline-none select-all"
              />
            </div>
            <div className="shrink-0 pt-6">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(referralLink);
                  showAlert(language === 'tr' ? 'Link kopyalandı!' : 'Link copied!');
                }}
                className="w-full sm:w-auto bg-white text-indigo-900 hover:bg-indigo-50 font-bold py-3 px-6 rounded-lg transition"
              >
                {language === 'tr' ? 'Kopyala' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION B: Müşteri Referans Kampanyaları */}
      <div id="business-customer-campaigns-section" className="space-y-6">
        {hasAccess ? (
          <div className="space-y-8">
            {/* Real Campaign Dashboard Header */}
            <div className="bg-white dark:bg-slate-800 shadow-sm rounded-lg border border-gray-200 dark:border-slate-700 p-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    {language === 'tr' ? 'Müşteri Referans Kampanyaları' : 'Customer Referral Campaigns'}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    {language === 'tr'
                      ? 'Salonunuz için müşterilerinizin arkadaşlarını davet etmesini sağlayan kampanyaları yönetin.'
                      : 'Create campaigns for your salon that encourage your clients to invite their friends.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddReferralModal(true)}
                    className="border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 font-semibold py-2 px-4 rounded-md transition text-sm"
                  >
                    {language === 'tr' ? 'Manuel Referans Ekle' : 'Log Manual Referral'}
                  </button>
                  <button
                    onClick={() => setShowAddCampaignModal(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md shadow transition text-sm"
                  >
                    {language === 'tr' ? '+ Yeni Kampanya' : '+ Create Campaign'}
                  </button>
                </div>
              </div>

              {/* STATS TILES */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-4 border border-gray-100 dark:border-slate-800">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">{language === 'tr' ? 'Toplam Davet' : 'Total Invites'}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{totalStats.total}</p>
                </div>
                <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-4 border border-gray-100 dark:border-slate-800">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">{language === 'tr' ? 'Bekliyor' : 'Pending'}</p>
                  <p className="text-2xl font-bold text-yellow-600 mt-1">{totalStats.pending}</p>
                </div>
                <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-4 border border-gray-100 dark:border-slate-800">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">{language === 'tr' ? 'Randevu Alındı' : 'Booked'}</p>
                  <p className="text-2xl font-bold text-indigo-600 mt-1">{totalStats.booked}</p>
                </div>
                <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-4 border border-gray-100 dark:border-slate-800">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">{language === 'tr' ? 'Tamamlanan' : 'Completed'}</p>
                  <p className="text-2xl font-bold text-teal-600 mt-1">{totalStats.completed}</p>
                </div>
                <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-4 border border-gray-100 dark:border-slate-800">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">{language === 'tr' ? 'Aktif Ödüller' : 'Active Rewards'}</p>
                  <p className="text-2xl font-bold text-purple-600 mt-1">{rewardsAvailable}</p>
                </div>
                <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-4 border border-gray-100 dark:border-slate-800">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">{language === 'tr' ? 'Kullanılan Ödüller' : 'Used Rewards'}</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">{rewardsUsed}</p>
                </div>
              </div>
            </div>

            {/* CAMPAIGN LIST */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{language === 'tr' ? 'Aktif Kampanyalar' : 'Active Campaigns'}</h3>
              {campaigns.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 p-8 rounded-lg border border-gray-200 dark:border-slate-700 text-center">
                  <p className="text-gray-500">{language === 'tr' ? 'Henüz müşteri kampanyası tanımlanmadı.' : 'No customer campaigns declared yet.'}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {campaigns.map(c => (
                    <div key={c.id} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-6 flex flex-col justify-between relative overflow-hidden">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <span className="text-xs uppercase font-semibold text-indigo-600 tracking-wider bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded">
                              {c.type === 'refer_friend' ? (language === 'tr' ? 'Arkadaşını Getir' : 'Refer a Friend') : c.type}
                            </span>
                            <h4 className="text-lg font-bold text-gray-900 dark:text-white mt-2">{c.name}</h4>
                          </div>
                          <button
                            onClick={() => toggleCampaignActive(c)}
                            className={`px-3 py-1 text-xs rounded-full font-bold transition ${
                              c.isActive ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                            }`}
                          >
                            {c.isActive ? (language === 'tr' ? 'Aktif' : 'Active') : (language === 'tr' ? 'Pasif' : 'Passive')}
                          </button>
                        </div>
                        <div className="space-y-2 mb-6">
                          <div className="text-sm">
                            <strong className="text-gray-600 dark:text-gray-400 font-medium">{language === 'tr' ? 'Öneren Ödülü: ' : 'Referrer Reward: '}</strong>
                            <span className="text-gray-800 dark:text-gray-200 font-semibold">{c.customerReward}</span>
                          </div>
                          <div className="text-sm">
                            <strong className="text-gray-600 dark:text-gray-400 font-medium">{language === 'tr' ? 'Yeni Müşteri Ödülü: ' : 'Referred Customer Reward: '}</strong>
                            <span className="text-gray-800 dark:text-gray-200 font-semibold">{c.referredCustomerReward}</span>
                          </div>
                          <p className="text-xs text-gray-500 italic mt-2">{c.terms}</p>
                        </div>
                      </div>

                      <div className="border-t border-gray-100 dark:border-slate-700 pt-4 mt-2 flex justify-between items-center text-sm">
                        <span className="text-xs text-gray-400">
                          {language === 'tr' ? 'Max Kullanım: ' : 'Limit: '} {c.maxUses || 'Limitsiz'}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setSelectedCampaign(c);
                              setShowEditCampaignModal(true);
                            }}
                            className="text-indigo-600 hover:text-indigo-800 font-semibold"
                          >
                            {language === 'tr' ? 'Düzenle' : 'Edit'}
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={async () => {
                              const confirm = await showConfirm({
                                message: language === 'tr' ? 'Bu kampanyayı silmek istediğinizden emin misiniz?' : 'Are you sure you want to delete this campaign?',
                              });
                              if (confirm) {
                                await customerCampaignService.deleteCampaign(c.id);
                                reloadData();
                              }
                            }}
                            className="text-red-500 hover:text-red-700"
                          >
                            {language === 'tr' ? 'Sil' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CUSTOMER REFERRAL TRACKING TABLE */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{language === 'tr' ? 'Müşteri Davet Kayıtları' : 'Customer Referrals Ledger'}</h3>
              {customerReferrals.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 p-8 rounded-lg border border-gray-200 dark:border-slate-700 text-center">
                  <p className="text-gray-500">{language === 'tr' ? 'Davet kaydı bulunmamaktadır.' : 'No referrals logged yet.'}</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-800 shadow-sm rounded-lg border border-gray-200 dark:border-slate-700 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                    <thead className="bg-gray-50 dark:bg-slate-700 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      <tr>
                        <th className="px-6 py-3 text-left">{language === 'tr' ? 'Öneren Müşteri' : 'Referrer Customer'}</th>
                        <th className="px-6 py-3 text-left">{language === 'tr' ? 'Davet Edilen' : 'Guest Name'}</th>
                        <th className="px-6 py-3 text-left">{language === 'tr' ? 'Kampanya' : 'Campaign'}</th>
                        <th className="px-6 py-3 text-left">{language === 'tr' ? 'Durum' : 'Status'}</th>
                        <th className="px-6 py-3 text-left">{language === 'tr' ? 'Kayıt Tarihi' : 'Date'}</th>
                        <th className="px-6 py-3 text-right">{language === 'tr' ? 'Aksiyon' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-slate-700 text-sm">
                      {customerReferrals.map(ref => (
                        <tr key={ref.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-900/50">
                          <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">
                            {getCustomerName(ref.referrerCustomerId)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-medium text-gray-800 dark:text-gray-200">{ref.referredCustomerName}</div>
                            {ref.referredCustomerPhone && (
                              <div className="text-xs text-gray-400">{ref.referredCustomerPhone}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                            {getCampaignName(ref.campaignId)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                              ref.status === 'completed' ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/20' :
                              ref.status === 'rewarded' ? 'bg-green-50 text-green-700 dark:bg-green-900/20' :
                              ref.status === 'booked' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20' :
                              ref.status === 'rejected' ? 'bg-red-50 text-red-700 dark:bg-red-900/20' :
                              'bg-amber-50 text-amber-700 dark:bg-amber-900/20'
                            }`}>
                              {ref.status === 'pending' ? (language === 'tr' ? 'Bekliyor' : 'Pending') :
                               ref.status === 'booked' ? (language === 'tr' ? 'Randevu Alındı' : 'Booked') :
                               ref.status === 'completed' ? (language === 'tr' ? 'Tamamlandı' : 'Completed') :
                               ref.status === 'rewarded' ? (language === 'tr' ? 'Ödüllendirildi' : 'Rewarded') :
                               ref.status === 'rejected' ? (language === 'tr' ? 'Reddedildi' : 'Rejected') : ref.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400">
                            {new Date(ref.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right font-medium">
                            <div className="flex gap-2 justify-end">
                              {ref.status === 'booked' && (
                                <button
                                  onClick={() => updateReferralStatusAction(ref.id, 'completed')}
                                  className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-2 py-1 hover:bg-indigo-50"
                                >
                                  {language === 'tr' ? 'Tamamla' : 'Complete'}
                                </button>
                              )}
                              {ref.status === 'completed' && (
                                <button
                                  onClick={() => updateReferralStatusAction(ref.id, 'rewarded')}
                                  className="text-xs text-green-600 hover:text-green-800 border border-green-200 rounded px-2 py-1 hover:bg-green-50"
                                >
                                  {language === 'tr' ? 'Ödüllendir' : 'Grant Reward'}
                                </button>
                              )}
                              {ref.status !== 'rewarded' && ref.status !== 'rejected' && (
                                <button
                                  onClick={() => updateReferralStatusAction(ref.id, 'rejected')}
                                  className="text-xs text-red-600 hover:text-red-800 border border-red-200 rounded px-2 py-1 hover:bg-red-50"
                                >
                                  {language === 'tr' ? 'Reddet' : 'Reject'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* B2C CUSTOMER REWARD LEDGER LIST */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white-900 md:text-lg">
                {language === 'tr' ? 'Müşteri Kampanya Ödül Defteri' : 'Customer Campaign Reward Ledger'}
              </h3>
              {customerRewards.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 p-8 rounded-lg border border-gray-200 dark:border-slate-700 text-center">
                  <p className="text-gray-500">
                    {language === 'tr' ? 'Hak edilmiş kampanya ödülü bulunmamaktadır.' : 'No earned campaign rewards found.'}
                  </p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-800 shadow-sm rounded-lg border border-gray-200 dark:border-slate-700 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                    <thead className="bg-gray-50 dark:bg-slate-700 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      <tr>
                        <th className="px-6 py-3 text-left">{language === 'tr' ? 'Ödül Sahibi Müşteri' : 'Reward Owner Client'}</th>
                        <th className="px-6 py-3 text-left">{language === 'tr' ? 'Alıcı Tipi' : 'Recipient Type'}</th>
                        <th className="px-6 py-3 text-left">{language === 'tr' ? 'Açıklama / Kupon' : 'Description / Coupon'}</th>
                        <th className="px-6 py-3 text-left">{language === 'tr' ? 'Durum' : 'Status'}</th>
                        <th className="px-6 py-3 text-left">{language === 'tr' ? 'Veriliş Tarihi' : 'Issued Date'}</th>
                        <th className="px-6 py-3 text-right">{language === 'tr' ? 'Eylemler' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-slate-700 text-sm">
                      {customerRewards.map(rw => (
                        <tr key={rw.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-900/50">
                          <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">
                            {rw.customerId.startsWith('cref_') || rw.customerId.includes('+') || rw.customerId.length > 20 ? (
                              <span className="italic text-gray-400">{rw.customerId}</span>
                            ) : (
                              getCustomerName(rw.customerId)
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-700 dark:text-gray-300">
                            {rw.rewardOwnerType === 'referrer_customer' ? (
                              <span className="text-xs bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 px-2.5 py-1 rounded-md font-semibold">
                                {language === 'tr' ? 'Öneren / Davet Eden' : 'Referrer'}
                              </span>
                            ) : (
                              <span className="text-xs bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-md font-semibold">
                                {language === 'tr' ? 'Davetle Gelen Arkadaş' : 'Referee Friend'}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-gray-800 dark:text-gray-200">
                            <div className="font-semibold">{rw.rewardDescription}</div>
                            {rw.customerReferralId && (
                              <div className="text-xs text-gray-400">Ref ID: {rw.customerReferralId.substring(0, 10)}...</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                              rw.status === 'available' ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/20' :
                              rw.status === 'used' ? 'bg-green-50 text-green-700 dark:bg-green-900/20' :
                              rw.status === 'reserved' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20' :
                              rw.status === 'cancelled' ? 'bg-red-50 text-red-700 dark:bg-red-900/20' :
                              'bg-gray-50 text-gray-700 dark:bg-gray-900/20'
                            }`}>
                              {rw.status === 'available' ? (language === 'tr' ? 'Kullanılabilir' : 'Available') :
                               rw.status === 'used' ? (language === 'tr' ? 'Kullanıldı' : 'Used') :
                               rw.status === 'reserved' ? (language === 'tr' ? 'Rezerve Edildi' : 'Reserved') :
                               rw.status === 'cancelled' ? (language === 'tr' ? 'İptal Edildi' : 'Cancelled') :
                               rw.status === 'expired' ? (language === 'tr' ? 'Süresi Doldu' : 'Expired') : rw.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400">
                            {new Date(rw.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right font-medium">
                            <div className="flex gap-2 justify-end">
                              {rw.status === 'available' && (
                                <>
                                  <button
                                    onClick={() => handleMarkRewardUsed(rw.id)}
                                    className="text-xs text-green-600 hover:text-green-800 border border-green-200 rounded px-2.5 py-1 hover:bg-green-50"
                                  >
                                    {language === 'tr' ? 'Kullanıldı' : 'Mark Used'}
                                  </button>
                                  <button
                                    onClick={() => handleCancelReward(rw.id)}
                                    className="text-xs text-red-600 hover:text-red-800 border border-red-200 rounded px-2.5 py-1 hover:bg-red-50"
                                  >
                                    {language === 'tr' ? 'İptal' : 'Cancel'}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 shadow-sm rounded-lg border border-gray-200 dark:border-slate-700 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {language === 'tr' ? 'Müşteri Kampanyaları Mevcut Paketinizde Yer Almıyor' : 'Feature not included in your current plan'}
            </h2>
            <p className="text-gray-500 mb-6 max-w-md mx-auto text-sm">
              {language === 'tr'
                ? 'Müşterileriniz için referans kampanyaları oluşturma özelliği Profesyonel ve üstü paketlerde kullanılabilir. İşletmeniz için yeni müşteriler kazanmak üzere paketinizi yükseltin.'
                : 'Customer campaign management is available in Professional plan and above. Upgrade your plan to win new customers.'}
            </p>
            <p className="text-xs text-red-500 font-semibold mb-6">
              {language === 'tr'
                ? 'Bu özellik mevcut paketinizde yer almıyor. Müşteri referans kampanyalarını kullanmak için Profesyonel pakete geçebilirsiniz.'
                : 'This feature is not included in your current plan. You can upgrade to the Professional plan to use customer referral campaigns.'}
            </p>
            <a href="#/admin/billing" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-6 rounded-md shadow transition inline-block">
              {language === 'tr' ? 'Paketleri İncele' : 'View Plans'}
            </a>
          </div>
        )}
      </div>

      {/* MODAL 1: ADD CAMPAIGN */}
      {showAddCampaignModal && (
        <div className="fixed inset-0 bg-black/50 overflow-y-auto flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full border border-gray-200 dark:border-slate-700 p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {language === 'tr' ? 'Yeni Kampanya Tanımla' : 'Create Customer Campaign'}
            </h3>
            <form onSubmit={handleCreateCampaign} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Kampanya Adı' : 'Campaign Name'}</label>
                <input
                  type="text"
                  required
                  value={newCampaign.name}
                  onChange={e => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded p-2 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Kampanya Türü' : 'Type'}</label>
                <select
                  value={newCampaign.type}
                  onChange={e => setNewCampaign({ ...newCampaign, type: e.target.value as any })}
                  className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded p-2 text-sm text-gray-900 dark:text-white"
                >
                  <option value="refer_friend">{language === 'tr' ? 'Arkadaşını Getir' : 'Refer a Friend'}</option>
                  <option value="discount">{language === 'tr' ? 'İndirim Kampanyası' : 'Discount Program'}</option>
                  <option value="loyalty">{language === 'tr' ? 'Sadakat Programı' : 'Loyalty Program'}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Öneren Müşteri Ödülü' : 'Referrer Reward'}</label>
                <input
                  type="text"
                  required
                  value={newCampaign.customerReward}
                  onChange={e => setNewCampaign({ ...newCampaign, customerReward: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded p-2 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Davet Edilen Müşteri Ödülü' : 'Referred Guest Reward'}</label>
                <input
                  type="text"
                  required
                  value={newCampaign.referredCustomerReward}
                  onChange={e => setNewCampaign({ ...newCampaign, referredCustomerReward: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded p-2 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Kurallar / Koşullar' : 'Terms & Conditions'}</label>
                <textarea
                  value={newCampaign.terms}
                  onChange={e => setNewCampaign({ ...newCampaign, terms: e.target.value })}
                  rows={2}
                  className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded p-2 text-sm text-gray-900 dark:text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Max Katılım Limiti' : 'Max Limit Usage'}</label>
                <input
                  type="number"
                  value={newCampaign.maxUses}
                  onChange={e => setNewCampaign({ ...newCampaign, maxUses: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded p-2 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddCampaignModal(false)}
                  className="border border-gray-300 rounded px-4 py-2 hover:bg-gray-100 dark:border-slate-600 text-gray-700 dark:text-gray-300 text-sm font-medium"
                >
                  {language === 'tr' ? 'Vazgeç' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded px-4 py-2 text-sm font-semibold shadow"
                >
                  {language === 'tr' ? 'Oluştur' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT CAMPAIGN */}
      {showEditCampaignModal && selectedCampaign && (
        <div className="fixed inset-0 bg-black/50 overflow-y-auto flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full border border-gray-200 dark:border-slate-700 p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {language === 'tr' ? 'Kampanyayı Düzenle' : 'Edit Customer Campaign'}
            </h3>
            <form onSubmit={handleUpdateCampaignSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Kampanya Adı' : 'Campaign Name'}</label>
                <input
                  type="text"
                  required
                  value={selectedCampaign.name}
                  onChange={e => setSelectedCampaign({ ...selectedCampaign, name: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded p-2 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Öneren Ödülü' : 'Referrer Reward'}</label>
                <input
                  type="text"
                  required
                  value={selectedCampaign.customerReward}
                  onChange={e => setSelectedCampaign({ ...selectedCampaign, customerReward: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded p-2 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Davet Edilen Ödülü' : 'Referred Reward'}</label>
                <input
                  type="text"
                  required
                  value={selectedCampaign.referredCustomerReward}
                  onChange={e => setSelectedCampaign({ ...selectedCampaign, referredCustomerReward: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded p-2 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Şartlar ve Koşullar' : 'Terms'}</label>
                <textarea
                  value={selectedCampaign.terms || ''}
                  onChange={e => setSelectedCampaign({ ...selectedCampaign, terms: e.target.value })}
                  rows={2}
                  className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded p-2 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Max Kullanım Limiti' : 'Max Limit'}</label>
                <input
                  type="number"
                  value={selectedCampaign.maxUses || ''}
                  onChange={e => setSelectedCampaign({ ...selectedCampaign, maxUses: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded p-2 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditCampaignModal(false);
                    setSelectedCampaign(null);
                  }}
                  className="border border-gray-300 rounded px-4 py-2 hover:bg-gray-100 dark:border-slate-600 text-gray-700 dark:text-gray-300 text-sm font-medium"
                >
                  {language === 'tr' ? 'Vazgeç' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded px-4 py-2 text-sm font-semibold shadow"
                >
                  {language === 'tr' ? 'Kaydet' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ADD REFERRAL */}
      {showAddReferralModal && (
        <div className="fixed inset-0 bg-black/50 overflow-y-auto flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full border border-gray-200 dark:border-slate-700 p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {language === 'tr' ? 'Manuel Referans Girişi' : 'Log Manual Customer Referral'}
            </h3>
            <form onSubmit={createManualReferral} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Öneren Müşteri' : 'Referrer Customer'}</label>
                <select
                  required
                  value={referrerId}
                  onChange={e => setReferrerId(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded p-2 text-sm text-gray-900 dark:text-white"
                >
                  <option value="">{language === 'tr' ? '-- Seçiniz --' : '-- Choose customer --'}</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone || c.email})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Kampanya' : 'Campaign Code'}</label>
                <select
                  required
                  value={targetCampaignId}
                  onChange={e => setTargetCampaignId(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded p-2 text-sm text-gray-900 dark:text-white"
                >
                  <option value="">{language === 'tr' ? '-- Seçiniz --' : '-- Choose campaign --'}</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  {campaigns.length === 0 && <option value="default">Arkadaşını Getir v1 (Default)</option>}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Davet Edilen Müşteri Adı Soyadı' : 'Referred Guest Full Name'}</label>
                <input
                  type="text"
                  required
                  value={referredName}
                  onChange={e => setReferredName(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded p-2 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Davet Edilen Telefon No (Opsiyonel)' : 'Referred Guest Phone (Optional)'}</label>
                <input
                  type="text"
                  value={referredPhone}
                  onChange={e => setReferredPhone(e.target.value)}
                  placeholder="+90 5xx xxx xx xx"
                  className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded p-2 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddReferralModal(false)}
                  className="border border-gray-300 rounded px-4 py-2 hover:bg-gray-100 dark:border-slate-600 text-gray-700 dark:text-gray-300 text-sm font-medium"
                >
                  {language === 'tr' ? 'Vazgeç' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded px-4 py-2 text-sm font-semibold shadow"
                >
                  {language === 'tr' ? 'Kaydet' : 'Log'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReferralTab;
