import React, { useState, useEffect } from 'react';
import { goLiveReadinessService, ReadinessReport, ReadinessCheck } from '../../services/goLiveReadinessService';
import { paymentRunModeService, RunModeStatus, PaymentRunMode } from '../../services/paymentRunModeService';
import { customerPilotReadinessService } from '../../services/customerPilotReadinessService';
import { notificationTemplateService } from '../../services/notificationTemplateService';
import { SuperAdminDataExportSection } from './SuperAdminDataExportSection';

const StatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case 'passed':
       return <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">PASSED</span>;
    case 'warning':
       return <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">PENDING</span>;
    case 'failed':
       return <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">ERROR</span>;
    default:
       return <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400">IDLE</span>;
  }
};

const SuperAdminGoLivePage: React.FC = () => {
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [runModeStatus, setRunModeStatus] = useState<RunModeStatus | null>(null);

  useEffect(() => {
    goLiveReadinessService.getReport().then(r => {
      setReport(r);
      setRunModeStatus(paymentRunModeService.getStatus(r.blockers.length));
    });
  }, []);

  const handleSetMode = (mode: PaymentRunMode) => {
    paymentRunModeService.setInternalDiagnosticsMode(mode);
    setRunModeStatus(paymentRunModeService.getStatus(report?.blockers.length || 0));
  };

  if (!report || !runModeStatus) {
    return <div className="p-8 text-center dark:text-white">Yükleniyor...</div>;
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800 text-white shadow-xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Sandbox ve Yayın Hazırlığı</h1>
          <p className="text-sm text-slate-400">Sistem deployment ve entegrasyon kontrol konsolu (INTERNAL ONLY)</p>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold text-slate-300">Last Checked</div>
          <div className="text-xs text-slate-500">{new Date(report.lastChecked).toLocaleString()}</div>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl p-5 flex items-start gap-3">
        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
          <p className="font-bold">Güvenlik ve Konfigürasyon Bilgilendirmesi</p>
          <p>
            Gizli anahtarlar ve API şifreleri (Iyzico ve Supabase servis anahtarları) <strong>veri güvenliği nedeniyle hiçbir şekilde bu panelden veya arayüz üzerinden girilemez, saklanamaz veya güncellenemez.</strong>
          </p>
          <p>
            Tüm gizli değişkenler doğrudan <strong>Supabase secrets (CLI) üzerinden tanımlanmalı</strong> ve saklanmalıdır. Bu panel yalnızca mevcut kurulum durumunu ve eksiklikleri gösterir.
          </p>
          <p className="text-xs font-mono opacity-80 mt-1">
            Örn: supabase secrets set IYZICO_API_KEY="your-key"
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Payment Run Mode</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
           {['local_dry_run', 'sandbox_live', 'production_live'].map(mode => {
              const isActive = runModeStatus.mode === mode;
              return (
                 <button 
                  key={mode} 
                  onClick={() => handleSetMode(mode as PaymentRunMode)}
                  className={`p-4 rounded-xl text-left border-2 transition-all ${
                     isActive 
                     ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-500' 
                     : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-slate-600'
                  }`}
                 >
                   <div className="flex items-center justify-between mb-2">
                     <span className={`font-bold ${isActive ? 'text-indigo-900 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>
                       {mode === 'local_dry_run' ? 'QA Dry Run' : mode === 'sandbox_live' ? 'Sandbox Live' : 'Production Live'}
                     </span>
                     {isActive && <span className="bg-indigo-600 w-2.5 h-2.5 rounded-full animate-pulse"></span>}
                   </div>
                   <p className="text-xs text-slate-500 dark:text-slate-400">
                      {mode === 'local_dry_run' && 'Local simülasyon. Iyzico bağlantısı yok.'}
                      {mode === 'sandbox_live' && 'Gerçek test. Supabase + Iyzico Sandbox.'}
                      {mode === 'production_live' && 'Gerçek para. Tamamlanan testler sonrası canlı ortam.'}
                   </p>
                 </button>
              );
           })}
        </div>
        
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
           <h3 className="font-semibold text-slate-800 dark:text-slate-200">{runModeStatus.label}</h3>
           <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{runModeStatus.description}</p>
           
           {runModeStatus.missingBlockers.length > 0 && (
             <div className="mt-3 text-sm text-red-600 dark:text-red-400">
               <strong>Uyarı:</strong> {runModeStatus.missingBlockers.join(' ')}
             </div>
           )}
           
           {!runModeStatus.canRunCheckout && (
               <div className="mt-3 text-sm text-orange-600 dark:text-orange-400">
                   Bu modda test işlemi yapmak şu an için bloklanmıştır. Aşağıdaki eksiklikleri kontrol ediniz.
               </div>
           )}
           
           {runModeStatus.canRunCheckout && runModeStatus.mode === 'sandbox_live' && (
              <a href="/#/pricing" target="_blank" className="mt-4 inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition">
                 Start Sandbox Test (Pricing Flow)
                 <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                 </svg>
              </a>
           )}
        </div>

        <div className="mt-6 bg-amber-50 dark:bg-amber-950/20 p-5 rounded-lg border border-amber-200 dark:border-amber-900/50">
          <h3 className="font-bold text-amber-900 dark:text-amber-500 mb-3 flex items-center">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            İlk Sandbox Ödeme Koşusu (Sandbox Runbook)
          </h3>
          <p className="text-sm text-amber-800 dark:text-amber-400 mb-4 opacity-90">
            Real Sandbox transaction aşamasına geçmeden önce aşağıdaki adımları Supabase CLI üzerinden uyguladığınızdan emin olun. <span className="font-semibold underline">docs/FIRST_IYZICO_SANDBOX_RUN.md</span> referans alın.
          </p>
          <ul className="space-y-2 text-sm text-amber-900 dark:text-amber-300">
            <li className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-amber-200 dark:bg-amber-800 shrink-0"></div>
               <span>Edge Functions (create-checkout-session, payment-webhook, subscription-sync) deploy edildi.</span>
            </li>
            <li className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-amber-200 dark:bg-amber-800 shrink-0"></div>
               <span>IYZICO_API_KEY ve IYZICO_S*CRET_KEY Supabase secrets olarak eklendi.</span>
            </li>
            <li className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-amber-200 dark:bg-amber-800 shrink-0"></div>
               <span>Iyzico Sandbox ürün ve 14-günlük deneme planları oluşturulup referans kodları eşlendi.</span>
            </li>
            <li className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-amber-200 dark:bg-amber-800 shrink-0"></div>
               <span>Edge Function Callback URL, ortam değişkenlerine eklendi.</span>
            </li>
            <li className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-amber-200 dark:bg-amber-800 shrink-0"></div>
               <span>Buradan Sandbox Live modu aktifleştirildi.</span>
            </li>
          </ul>
        </div>

        <div className="mt-4 bg-emerald-50 dark:bg-emerald-950/20 p-5 rounded-lg border border-emerald-200 dark:border-emerald-900/50">
          <h3 className="font-bold text-emerald-900 dark:text-emerald-500 mb-3 flex items-center">
             <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
             </svg>
             Sandbox Koşusu Kanıtları (Post-Run Checklist)
          </h3>
          <p className="text-sm text-emerald-800 dark:text-emerald-400 mb-3 opacity-90">
             Koşuyu tamamladıktan sonra <span className="font-semibold">docs/SANDBOX_RUN_EVIDENCE_TEMPLATE.md</span> şablonunu kullanarak kanıt raporunuzu oluşturun.
          </p>
          <ul className="space-y-1.5 text-sm text-emerald-900 dark:text-emerald-300">
             <li className="flex items-center gap-2 px-1">
                <div className="w-3 h-3 rounded-sm border border-emerald-500 bg-emerald-100 dark:bg-emerald-800 shrink-0"></div>
                <span>Checkout aşaması ekran görüntüsü alındı (Screenshot captured)</span>
             </li>
             <li className="flex items-center gap-2 px-1">
                <div className="w-3 h-3 rounded-sm border border-emerald-500 bg-emerald-100 dark:bg-emerald-800 shrink-0"></div>
                <span>Uygulamaya başarıyla dönüldü (Callback returned)</span>
             </li>
             <li className="flex items-center gap-2 px-1">
                <div className="w-3 h-3 rounded-sm border border-emerald-500 bg-emerald-100 dark:bg-emerald-800 shrink-0"></div>
                <span>Supabase Logs: Webhook doğrulandı (Webhook verified)</span>
             </li>
             <li className="flex items-center gap-2 px-1">
                <div className="w-3 h-3 rounded-sm border border-emerald-500 bg-emerald-100 dark:bg-emerald-800 shrink-0"></div>
                <span>Admin paneli abonelik durumu güncellendi (Billing updated)</span>
             </li>
             <li className="flex items-center gap-2 px-1">
                <div className="w-3 h-3 rounded-sm border border-emerald-500 bg-emerald-100 dark:bg-emerald-800 shrink-0"></div>
                <span>Super Admin paneli ödemeler ve abonelikler güncellendi (Super Admin updated)</span>
             </li>
             <li className="flex items-center gap-2 px-1">
                <div className="w-3 h-3 rounded-sm border border-emerald-500 bg-emerald-100 dark:bg-emerald-800 shrink-0"></div>
                <span>Tekrarlanan ve iptal edilen akışlar test edildi (Negative tests)</span>
             </li>
             <li className="flex items-center gap-2 px-1">
                <div className="w-3 h-3 rounded-sm border border-emerald-500 bg-emerald-100 dark:bg-emerald-800 shrink-0"></div>
                <span>Kanıt raporu kaydedildi (Evidence report completed)</span>
             </li>
          </ul>
        </div>
      </div>

      {report.blockers.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/10 border border-red-500 rounded-xl p-6">
          <h2 className="text-red-800 dark:text-red-400 font-bold text-lg mb-3 flex items-center">
             <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
             </svg>
             Remaining Blockers Before Go-Live
          </h2>
          <ul className="space-y-2 list-disc pl-5 text-sm text-red-700 dark:text-red-300">
            {report.blockers.map((blocker, idx) => (
              <li key={idx} className="font-medium">{blocker}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {Object.entries(report.categories).map(([key, category]) => (
           <div key={key} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
             <div className="bg-slate-50 dark:bg-slate-800/80 p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-bold text-gray-900 dark:text-white">{category.title}</h3>
                {category.description && (
                   <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{category.description}</p>
                )}
             </div>
             <ul className="divide-y divide-slate-100 dark:divide-slate-700/50 p-2">
                {category.checks.map(check => (
                   <li key={check.id} className="p-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-755 rounded-lg transition-colors">
                      <div className="flex-1 min-w-0 pr-4">
                         <div className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">{check.title}</div>
                         {check.hint && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 truncate">{check.hint}</div>
                         )}
                      </div>
                      <div className="flex flex-col items-end shrink-0 gap-1">
                         <StatusBadge status={check.status} />
                         {check.value && (
                            <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-mono">
                               {check.value}
                            </span>
                         )}
                      </div>
                   </li>
                ))}
             </ul>
           </div>
        ))}
      </div>

      <SuperAdminDataExportSection />

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Pilot Bildirim Şablonları & Sözleşmeleri (Scaffolding)</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Gelecekte entegre edilecek olan SMTP ve WhatsApp servisleri için tasarlanmış şablon listesi (Merchants/Customers)
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Kayıtlı Bildirim Şablonları ({notificationTemplateService.getTemplates().length})</h3>
            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2">
              {notificationTemplateService.getTemplates().map(tpl => (
                <div key={tpl.id} className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-100 dark:border-slate-800 text-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-slate-700 dark:text-slate-300">{tpl.title}</span>
                    <div className="flex gap-1.5 items-center">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 font-mono uppercase">
                        {tpl.channel}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 font-mono">
                        {tpl.audience === 'business_owner' ? 'Salon Sahibine' : tpl.audience === 'customer' ? 'Müşteriye' : 'Admin'}
                      </span>
                    </div>
                  </div>
                  {tpl.subject && <div className="text-slate-650 dark:text-slate-400 font-medium mb-1"><span className="opacity-75">Konu:</span> {tpl.subject}</div>}
                  <div className="text-slate-500 dark:text-slate-400 italic bg-white dark:bg-slate-900 p-2 rounded border border-slate-150 dark:border-slate-850 font-mono whitespace-pre-wrap">{tpl.body}</div>
                  <div className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">Değişkenler: {tpl.variables.length > 0 ? tpl.variables.join(', ') : 'Yok'}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Operasyonel Destek & Sorumlular</h3>
              <div className="space-y-2">
                {customerPilotReadinessService.getOperationalContacts().map((contact, idx) => (
                  <div key={idx} className="p-3 bg-indigo-50/50 dark:bg-indigo-950/10 rounded-lg border border-indigo-100 dark:border-indigo-900/30 text-xs">
                    <div className="font-bold text-slate-800 dark:text-slate-200 mb-1">{contact.role}</div>
                    <div className="text-slate-600 dark:text-slate-400"><strong>Adı:</strong> {contact.name}</div>
                    <div className="text-slate-600 dark:text-slate-400"><strong>Mail:</strong> {contact.email}</div>
                    <div className="text-slate-600 dark:text-slate-400"><strong>Destek Telefon/WP:</strong> {contact.whatsapp}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Entegrasyon Sağlayıcıları</h3>
              <div className="space-y-2">
                {customerPilotReadinessService.getProviders().map((provider, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-100 dark:border-slate-800 text-xs flex justify-between items-start gap-4">
                    <div>
                      <div className="font-semibold text-slate-700 dark:text-slate-300">{provider.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{provider.hint}</div>
                    </div>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400 font-bold uppercase whitespace-nowrap">
                      {provider.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminGoLivePage;
