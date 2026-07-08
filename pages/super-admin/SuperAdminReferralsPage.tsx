import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { PlatformReferralProgram, PlatformReferral, ReferralRewardLedger } from '../../types';
import { referralProgramService } from '../../services/referralProgramService';

const SuperAdminReferralsPage: React.FC = () => {
  const { language } = useLanguage();
  const isTr = language === 'tr';

  const [program, setProgram] = useState<PlatformReferralProgram | null>(null);
  const [referrals, setReferrals] = useState<PlatformReferral[]>([]);
  const [ledgers, setLedgers] = useState<ReferralRewardLedger[]>([]);

  // Manual Reward State
  const [manualTenantId, setManualTenantId] = useState('');
  const [manualMonths, setManualMonths] = useState(1);
  const [manualType, setManualType] = useState<'free_months' | 'manual_credit'>('free_months');

  // Load All Data
  const loadData = () => {
    setProgram(referralProgramService.getActivePlatformReferralProgram());
    setReferrals(referralProgramService.listAllPlatformReferrals());
    setLedgers(referralProgramService.listAllRewardLedgers());
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (!program) return;
    const { name, value, type } = e.target;
    // @ts-ignore
    const checked = type === 'checkbox' ? e.target.checked : undefined;
    
    setProgram(prev => {
       if(!prev) return prev;
       return {
         ...prev,
         [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value)
       };
    });
  };

  const saveSettings = () => {
    if (program) {
      referralProgramService.updatePlatformReferralProgram(program);
      alert(isTr ? 'Ödül program ayarları başarıyla kaydedildi.' : 'Reward program settings successfully saved.');
      loadData();
    }
  };

  const handleUpdateReferralStatus = (id: string, status: PlatformReferral['status']) => {
    referralProgramService.updateReferralStatus(id, status);
    alert(isTr ? `Referans durumu '${status}' olarak güncellendi.` : `Referral status updated to '${status}'.`);
    loadData();
  };

  const handleUpdateLedgerStatus = (id: string, status: ReferralRewardLedger['status']) => {
    referralProgramService.updateLedgerStatus(id, status);
    alert(isTr ? `Ödül durumu '${status}' olarak güncellendi.` : `Reward status updated to '${status}'.`);
    loadData();
  };

  const handleAddManualReward = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTenantId.trim()) {
      alert(isTr ? 'Lütfen geçerli bir İşletme ID girin.' : 'Please enter a valid Tenant ID.');
      return;
    }
    referralProgramService.manuallyCreateRewardLedger(manualTenantId.trim(), manualMonths, manualType);
    alert(isTr ? 'Manuel referans ödülü başarıyla tanımlandı.' : 'Manual referral reward successfully created.');
    setManualTenantId('');
    setManualMonths(1);
    loadData();
  };

  if (!program) return <div className="p-8 text-center text-gray-500">Yükleniyor / Loading...</div>;

  return (
    <div className="space-y-10 max-w-6xl pb-12">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-slate-950 dark:text-white tracking-tight">
          {isTr ? 'Lari Platform Referans Konsolu' : 'Lari Platform Referral Console'}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
          {isTr ? 'İşletmeler arası (B2B) referans kodlarını, ödül limitlerini ve hakediş transferlerini bu ekrandan yönetebilirsiniz.' : 'Manage business-to-business (B2B) referral codes, reward limits, and qualification distributions.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Settings Column */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 border-b border-slate-100 dark:border-slate-800 pb-3">
              {isTr ? '1. Ödül Kuralları & Kampanya Ayarları' : '1. Reward Rules & Program Configuration'}
            </h2>
            
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  name="isActive"
                  id="isActive"
                  checked={program.isActive}
                  onChange={handleChange}
                  className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="text-sm font-bold text-slate-900 dark:text-slate-100 select-none">
                  {isTr ? 'Referans Programı Aktif' : 'Referral Program Active'}
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    {isTr ? 'Doğrudan Tavsiye Ödülü (Ay)' : 'Direct Referral Reward (Months)'}
                  </label>
                  <input 
                    type="number" 
                    name="rewardPerQualifiedReferralMonths" 
                    min={1}
                    value={program.rewardPerQualifiedReferralMonths} 
                    onChange={handleChange}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    {isTr ? 'Her üye olan ve kart doğrulayan referans için.’' : 'Granted for each single qualified referred business.'}
                  </p>
                </div>
                
                <div>
                  <label className="block text-xs uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    {isTr ? 'Milestone Eşiği (Referans Sayısı)' : 'Milestone Target Threshold'}
                  </label>
                  <input 
                    type="number" 
                    name="milestoneRewardThreshold" 
                    min={1}
                    value={program.milestoneRewardThreshold} 
                    onChange={handleChange}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    {isTr ? 'Büyük ödülün kilitleneceği hedeflenen sayı.' : 'Total successful referrals needed to trigger grand milestone reward.'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    {isTr ? 'Milestone Tamamlandığında Verilecek Ödül (Ay)' : 'Grand Milestone Free Period (Months)'}
                  </label>
                  <input 
                    type="number" 
                    name="milestoneRewardMonths" 
                    min={1}
                    value={program.milestoneRewardMonths} 
                    onChange={handleChange}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    {isTr ? 'Hedefe ulaşıldığında hakedilecek kümülatif miktar.' : 'Total equivalent months granted cumulatively upon hitting milestone.'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    {isTr ? 'Ödül Haketme Kuralı' : 'Qualification Trigger Event'}
                  </label>
                  <select 
                    name="qualificationRule" 
                    value={program.qualificationRule} 
                    onChange={handleChange}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="card_verified_trial_started">
                      {isTr ? 'Kart Doğrulanıp Deneme Başladığında (card_verified)' : 'Card-Verified Trial Started'}
                    </option>
                    <option value="subscription_activated">
                      {isTr ? 'Abonelik Tamamen Aktif Olduğunda (İlk Tahsilat)' : 'Fully Charged / Activated'}
                    </option>
                  </select>
                  <p className="text-xs text-slate-400 mt-1">
                    {isTr ? 'Tavsiye edilen üyenin hangi adımda kalifiye sayılacağı.’' : 'Determines when referring tenant officially signs up and is approved.'}
                  </p>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  onClick={saveSettings} 
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition shadow-md shadow-blue-500/15"
                >
                  {isTr ? 'Ayarları Kaydet' : 'Save Program Settings'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Manual Reward Column */}
        <div className="lg:col-span-1">
          <div className="bg-slate-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-900">
            <h2 className="text-lg font-bold text-white mb-4 border-b border-white/10 pb-3">
              {isTr ? 'Manuel Ödül Tanımlama' : 'Direct Manual Adjustment'}
            </h2>
            <form onSubmit={handleAddManualReward} className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">
                  {isTr ? 'Faydalanıcı İşletme ID' : 'Beneficiary Tenant ID'}
                </label>
                <input 
                  type="text" 
                  required 
                  placeholder="örn: lumina-guzellik"
                  value={manualTenantId}
                  onChange={e => setManualTenantId(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500 text-white placeholder-slate-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">
                    {isTr ? 'Süre (Ay)' : 'Duration (mo)'}
                  </label>
                  <input 
                    type="number" 
                    required 
                    min={1}
                    value={manualMonths}
                    onChange={e => setManualMonths(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500 text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">
                    {isTr ? 'Ödül Türü' : 'Reward Type'}
                  </label>
                  <select
                    value={manualType}
                    onChange={e => setManualType(e.target.value as any)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500 text-white"
                  >
                    <option value="free_months">{isTr ? 'Ücretsiz Ay' : 'Free Months'}</option>
                    <option value="manual_credit">{isTr ? 'Manuel Kredi' : 'Manual Credit'}</option>
                  </select>
                </div>
              </div>

              <button 
                type="submit" 
                className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold py-3 rounded-xl transition text-sm mt-2"
              >
                {isTr ? 'Manuel Ödül Tanımla' : 'Manually Grant Reward'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Referrals Review Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-950 dark:text-white">
            {isTr ? '2. Gelen Tavsiyeler & Referans Listesi' : '2. Direct Platform Recommendations & Reviews'}
          </h2>
          <span className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full uppercase">
            {referrals.length} {isTr ? 'Kayıt' : 'Records'}
          </span>
        </div>

        {referrals.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            {isTr ? 'Henüz hiçbir işletme tavsiyesi veya sistem referansı bulunmamaktadır.' : 'No referral entries or recommendation history available.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 text-slate-500 uppercase text-xs font-bold tracking-wider">
                  <th className="px-6 py-4">{isTr ? 'Referans Veren' : 'Referrer'}</th>
                  <th className="px-6 py-4">{isTr ? 'Tavsiye Edilen E-posta' : 'Referred Business Owner Email'}</th>
                  <th className="px-6 py-4">{isTr ? 'Kayıt Yapılan ID' : 'Referred Tenant ID'}</th>
                  <th className="px-6 py-4">{isTr ? 'Referans Kodu' : 'Ref Code'}</th>
                  <th className="px-6 py-4">{isTr ? 'Güncel Durum' : 'Status'}</th>
                  <th className="px-6 py-4 text-right">{isTr ? 'İşlemler' : 'Action Panel'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {referrals.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20">
                    <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white font-mono">{r.referrerTenantId}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{r.referredOwnerEmail}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-mono">{r.referredTenantId || <span className="text-slate-300 dark:text-slate-700">-</span>}</td>
                    <td className="px-6 py-4"><span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-semibold rounded font-mono">{r.referralCode}</span></td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full uppercase ${
                        r.status === 'rewarded' ? 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-400' :
                        r.status === 'qualified' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-400' :
                        r.status === 'trial_started' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-400' :
                        r.status === 'registered' ? 'bg-purple-100 text-purple-800' :
                        r.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                      {r.status !== 'rewarded' && r.status !== 'qualified' && (
                        <button 
                          onClick={() => handleUpdateReferralStatus(r.id, 'qualified')}
                          className="bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/20 dark:text-blue-300 dark:hover:bg-blue-950/40 text-xs font-bold px-3 py-1.5 rounded-lg transition"
                        >
                          {isTr ? 'Onayla (Kalifiye Et)' : 'Qualify'}
                        </button>
                      )}
                      {r.status !== 'rejected' && r.status !== 'rewarded' && (
                        <button 
                          onClick={() => handleUpdateReferralStatus(r.id, 'rejected')}
                          className="bg-red-50 text-red-700 hover:bg-red-100 text-xs font-bold px-3 py-1.5 rounded-lg transition"
                        >
                          {isTr ? 'Reddet' : 'Reject'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rewards Ledger Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-950 dark:text-white">
            {isTr ? '3. Referans Ödül Defteri & Hakedişler' : '3. Subscriptions & Referral Reward Ledger'}
          </h2>
          <span className="bg-green-50 text-green-700 text-xs font-bold px-3 py-1 rounded-full uppercase">
            {ledgers.length} {isTr ? 'Kayıt' : 'Records'}
          </span>
        </div>

        {ledgers.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            {isTr ? 'Henüz kazanılmış veya atanmış ödül ledger kaydı bulunmamaktadır.' : 'No reward ledgers or transaction logs available.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 text-slate-500 uppercase text-xs font-bold tracking-wider">
                  <th className="px-6 py-4">{isTr ? 'Ödül ID' : 'Reward ID'}</th>
                  <th className="px-6 py-4">{isTr ? 'Faydalanıcı İşletme ID' : 'Beneficiary Tenant'}</th>
                  <th className="px-6 py-4">{isTr ? 'Hakedilen Sürer (Ay)' : 'Months Granted'}</th>
                  <th className="px-6 py-4">{isTr ? 'Ödül Türü' : 'Reward Type'}</th>
                  <th className="px-6 py-4">{isTr ? 'Provider Durumu' : 'Status'}</th>
                  <th className="px-6 py-4">{isTr ? 'Tanımlama Zamanı' : 'Timestamp'}</th>
                  <th className="px-6 py-4 text-right">{isTr ? 'İşlemler' : 'Action Panel'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {ledgers.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20">
                    <td className="px-6 py-4 font-mono text-slate-500">{l.id}</td>
                    <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white font-mono">{l.tenantId}</td>
                    <td className="px-6 py-4 text-slate-900 dark:text-white font-bold">{l.monthsGranted} {isTr ? 'Ay' : 'Months'}</td>
                    <td className="px-6 py-4">
                      <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/35 dark:text-indigo-300 font-mono px-2 py-0.5 rounded text-xs">
                        {l.rewardType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full uppercase ${
                        l.status === 'applied' ? 'bg-green-100 text-green-800' :
                        l.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400'
                      }`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-mono">{new Date(l.createdAt).toLocaleString(language === 'en' ? 'en-US' : 'tr-TR')}</td>
                    <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                      {l.status !== 'applied' && (
                        <button 
                          onClick={() => handleUpdateLedgerStatus(l.id, 'applied')}
                          className="bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950/20 dark:text-green-300 dark:hover:bg-green-950/40 text-xs font-bold px-3 py-1.5 rounded-lg transition"
                        >
                          {isTr ? 'Uygula (Geçerli Yap)' : 'Apply'}
                        </button>
                      )}
                      {l.status !== 'cancelled' && (
                        <button 
                          onClick={() => handleUpdateLedgerStatus(l.id, 'cancelled')}
                          className="bg-red-50 text-red-700 hover:bg-red-100 text-xs font-bold px-3 py-1.5 rounded-lg transition"
                        >
                          {isTr ? 'İptal Et' : 'Cancel'}
                        </button>
                      )}
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

export default SuperAdminReferralsPage;
