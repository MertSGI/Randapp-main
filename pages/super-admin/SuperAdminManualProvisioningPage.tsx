import React, { useState } from 'react';
import { manualProvisioningService } from '../../services/manualProvisioningService';
import { CheckCircle, XCircle, ArrowLeft, Globe, ShieldAlert } from 'lucide-react';

export const SuperAdminManualProvisioningPage: React.FC = () => {
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [publicSlug, setPublicSlug] = useState('');
  const [planId, setPlanId] = useState('standard');
  const [billingSource, setBillingSource] = useState<'offline_payment' | 'complimentary' | 'pilot_exception' | 'self_service_checkout'>('offline_payment');
  const [publishStatus, setPublishStatus] = useState(true);
  const [isProvisioning, setIsProvisioning] = useState(false);
  
  const [status, setStatus] = useState<{success?: boolean; error?: string; tenantId?: string}>({});

  const handleSlugChange = (val: string) => {
    // lowercase alphanumeric and dashes only
    setPublicSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  };

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProvisioning(true);
    setStatus({});
    try {
      const result = await manualProvisioningService.provisionTenant({
        businessName,
        ownerName,
        ownerEmail,
        ownerPhone: '',
        planId,
        billingSource,
        subscriptionStatus: 'active',
        publicSlug,
        publishStatus
      });
      setStatus(result);
    } catch (err: any) {
      setStatus({ success: false, error: err.message || 'Bir hata oluştu.' });
    } finally {
      setIsProvisioning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 sm:px-6 lg:px-8 font-sans transition-colors duration-200">
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* Header Block */}
        <div className="text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 justify-center md:justify-start">
              <span className="px-2.5 py-1 bg-red-500 text-white text-[10px] uppercase font-black rounded-md tracking-wider">Super Admin</span>
              <span className="text-xs font-mono text-slate-400">LARİ Suite 5.0</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-1.5 tracking-tight uppercase">LARİ Manuel Kurulum ve Offline Satış Paneli</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Özel satış, offline fatura ödemesi veya pilot üyelikler için anında sistem kurulumu.</p>
          </div>
        </div>

        {/* Informative Guard */}
        <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-250 dark:border-amber-800/40 rounded-xl flex gap-3 text-slate-700 dark:text-slate-300">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold text-amber-800 dark:text-amber-400">Offline Aktivasyon Güvenlik Uyarısı</p>
            <p>Bu alandan oluşturulan her işletme ödeme duvarlarını aşarak anında yetkilendirilir. Lütfen ödemenin tahsil edildiğinden veya pilot onayının sisteme işlendiğinden emin olun.</p>
          </div>
        </div>

        {/* Provision Form */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-150 dark:border-slate-800/80 p-6 md:p-8">
          <form onSubmit={handleProvision} className="space-y-6">
            
            {/* Section 1: Business profile information */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2">1. İşletme ve Marka Detayları</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Resmi Salon Adı</label>
                  <input 
                    type="text" 
                    value={businessName} 
                    onChange={e => setBusinessName(e.target.value)} 
                    required 
                    placeholder="Mia Güzellik & Saç Tasarım"
                    className="w-full rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white p-3 border text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Özel Web Adresi (URL Slug)</label>
                  <div className="flex rounded-lg shadow-sm">
                    <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 text-slate-500 text-xs font-mono select-none">
                      randevulari.com/
                    </span>
                    <input 
                      type="text" 
                      value={publicSlug} 
                      onChange={e => handleSlugChange(e.target.value)} 
                      required 
                      placeholder="mia-guzellik"
                      className="flex-1 min-w-0 block w-full px-3 py-3 rounded-none rounded-r-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white border text-sm font-mono focus:ring-2 focus:ring-indigo-500" 
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Owner profile */}
            <div className="space-y-4 pt-2">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2">2. İşletme Sahibi ve Yetkili Profil Tanımı</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Owner / Sahibi Tam Adı</label>
                  <input 
                    type="text" 
                    value={ownerName} 
                    onChange={e => setOwnerName(e.target.value)} 
                    required 
                    placeholder="Ahmet Yılmaz"
                    className="w-full rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white p-3 border text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Owner / Sahibi E-Posta Adresi</label>
                  <input 
                    type="email" 
                    value={ownerEmail} 
                    onChange={e => setOwnerEmail(e.target.value)} 
                    required 
                    placeholder="ahmet@example.com"
                    className="w-full rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white p-3 border text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Billing & Subscription Tier */}
            <div className="space-y-4 pt-2">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2">3. Lisans Seviyesi ve Ödeme Tipi</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Hizmet Paketi (Plan Level)</label>
                  <select 
                    value={planId} 
                    onChange={e => setPlanId(e.target.value)} 
                    className="w-full rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white p-3 border text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="free">Başlangıç (Free - 1 Branch)</option>
                    <option value="standard">Standart (3 Branches)</option>
                    <option value="professional">Profesyonel (5 Branches)</option>
                    <option value="premium">Premium (Unlimited Branches)</option>
                    <option value="enterprise">Kurumsal (Custom Setup)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Sözleşme Modeli (Billing Source)</label>
                  <select 
                    value={billingSource} 
                    onChange={e => setBillingSource(e.target.value as any)} 
                    className="w-full rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white p-3 border text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="offline_payment">Offline EFT / Havale Ödeme</option>
                    <option value="complimentary">Complimentary / Hediye Üyelik</option>
                    <option value="pilot_exception">Pilot Deal / Demo İstisnası</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Publishing checkboxes */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 rounded-xl space-y-3">
              <div className="flex items-start gap-3">
                <input 
                  id="publish_check"
                  type="checkbox" 
                  checked={publishStatus} 
                  onChange={e => setPublishStatus(e.target.checked)} 
                  className="mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <label htmlFor="publish_check" className="block text-xs font-bold text-slate-900 dark:text-white">Genel Rezervasyon Bağlantısını Anında Aktifleştir (Multi-Branch Ready)</label>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">İşletmeye ait tüm şubeler için randevulari.com alt şube URL'leri otomatik hazırlanacaktır. Onay inceleme sürecini pas geçerek doğrudan yayın statüsünü 'published' yapar.</p>
                </div>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isProvisioning || !businessName || !publicSlug || !ownerEmail}
              className="w-full py-3 px-4 border border-transparent rounded-xl shadow-sm text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 focus:outline-none transition-colors"
            >
              {isProvisioning ? 'Kurulum Başlatılıyor...' : 'İşletmeyi Kur ve Lisansı Aktifleştir'}
            </button>

            {/* Output status boxes */}
            {status.success && (
              <div className="p-6 bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-250 dark:border-slate-800 pb-3">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  <h4 className="text-sm font-black uppercase text-emerald-800 dark:text-emerald-400">LARİ E2E Kurulum Özet Raporu (Internal Only)</h4>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <p><span className="text-slate-500 font-medium">Salon Adı:</span> <strong className="text-slate-950 dark:text-white">{businessName}</strong></p>
                    <p><span className="text-slate-500 font-medium">Sahibi / Owner Auth:</span> <strong className="text-slate-950 dark:text-white">{ownerName} ({ownerEmail})</strong></p>
                    <p><span className="text-slate-500 font-medium">Paket Seviyesi:</span> <strong className="text-slate-950 dark:text-white uppercase font-black text-indigo-600">{planId}</strong></p>
                    <p><span className="text-slate-500 font-medium">Billing Model:</span> <strong className="text-slate-950 dark:text-white uppercase font-bold">{billingSource.replace('_', ' ')}</strong></p>
                  </div>
                  <div className="space-y-1.5">
                    <p><span className="text-slate-500 font-medium font-mono text-[10px]">Tenant ID:</span> <span className="font-mono text-[10px] bg-slate-200 dark:bg-slate-800 p-1 rounded font-bold">{status.tenantId}</span></p>
                    <p><span className="text-slate-500 font-medium">Slug Değeri:</span> <strong className="text-indigo-600 font-mono">{publicSlug}</strong></p>
                    <p><span className="text-slate-500 font-medium">Yayın Statüsü:</span> {publishStatus ? <span className="text-emerald-600 font-bold">● PUBLISHED</span> : <span className="text-amber-600 font-bold">● DRAFT</span>}</p>
                    <p><span className="text-slate-500 font-medium">Grup URL:</span> <a href={`/booking/${publicSlug}`} target="_blank" rel="noreferrer" className="underline font-mono text-[11px] font-bold">https://{publicSlug}.randevulari.com</a></p>
                  </div>
                </div>

                <div className="p-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                  <h5 className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Super Admin Operasyonel Yol Haritası (Next Actions)</h5>
                  <ul className="text-[11px] space-y-1 text-slate-600 dark:text-slate-400 list-disc list-inside">
                    <li><strong className="text-slate-800 dark:text-slate-200">Onboarding Tamamlama:</strong> İşletme sahibi kendi paneline şifresiz geçiş yaparak şubelerini kurabilir.</li>
                    <li><strong className="text-slate-800 dark:text-slate-200">Veri Yedekleme:</strong> Snapshot dışa aktarma (dataExportService) ile bu kurulumu lokal olarak saklayabilirsiniz.</li>
                    <li><strong className="text-slate-800 dark:text-slate-200">Entegrasyon & Paylaşım:</strong> İşletmeye ait randevulari.com/shubeler URL yapısını ve QR kodları Share-Toolkit ile sahibine bildirin.</li>
                  </ul>
                </div>
              </div>
            )}

            {status.error && (
              <div className="p-4 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-300 rounded-xl border border-red-200 dark:border-red-900 flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-bold">Kurulum Hatası!</p>
                  <p>{status.error}</p>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminManualProvisioningPage;
