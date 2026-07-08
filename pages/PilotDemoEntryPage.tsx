import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pilotDemoService, DEMO_PILOT_TENANT_ID } from '../services/pilotDemoService';

const PilotDemoEntryPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initDemo = async () => {
      await pilotDemoService.seedDemoDataOnly();
      setLoading(false);
    };
    initDemo();
  }, []);

  const handleStartOwnerDemo = async () => {
     openInNewTab('/pilot/admin');
  };

  const openInNewTab = (path: string) => {
    const isBrowser = (import.meta as any).env.VITE_ROUTER_MODE === 'browser';
    const url = isBrowser ? path : `/#${path}`;
    window.open(url, '_blank');
  };

  if (loading) {
     return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
           <div className="text-center">
              <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">Demo Ortamı Hazırlanıyor...</h2>
              <p className="text-slate-500 mt-2">Lütfen bekleyin.</p>
           </div>
        </div>
     );
  }

  return (
    <div className="min-h-screen pt-24 pb-16 bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white mb-6 tracking-tight">LARİ Pilot Demo</h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 mb-12 max-w-2xl mx-auto">
           LARİ platformunun salon sahipleri için nasıl çalıştığını inceleyebileceğiniz hazır demo ortamına hoş geldiniz.
           Bu ortamda gerçek verileriniz etkilenmez.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           
           <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-sm border border-slate-200 dark:border-slate-700 text-left flex flex-col h-full">
             <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
             </div>
             <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Müşteri deneyimini incele</h2>
             <p className="text-slate-600 dark:text-slate-400 flex-1 mb-8">
                Müşterilerinizin sizden nasıl randevu alacağını, yapay zeka asistanını ve dijital vitrininizi bir müşteri gözüyle deneyimleyin. Randevu akışını test edin.
             </p>
             <button 
                onClick={() => {
                   // Ensure tenant applies in public mode
                   localStorage.setItem('lari_active_tenant_id', DEMO_PILOT_TENANT_ID);
                   openInNewTab('/pilot/customer');
                }}
                className="w-full py-4 px-6 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white font-bold rounded-xl transition-colors text-center"
             >
                Müşteri deneyimini incele
             </button>
           </div>

           <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-sm border border-slate-200 dark:border-slate-700 text-left flex flex-col h-full">
             <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
             </div>
             <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">İşletme panelini incele</h2>
             <p className="text-slate-600 dark:text-slate-400 flex-1 mb-8">
                Gelen randevuları yönetin, müşteri hafızasını inceleyin ve işletme performansınızı bir işletme sahibi olarak analiz edin.
             </p>
             <button 
                onClick={handleStartOwnerDemo}
                className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-indigo-600/20 text-center"
             >
                İşletme panelini incele
             </button>
           </div>
           
           <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-sm border border-slate-200 dark:border-slate-700 text-left flex flex-col h-full w-full">
             <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/30 text-pink-600 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
             </div>
             <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Hazır Şablonlar Yerine Kendini Gör</h2>
             <p className="text-slate-600 dark:text-slate-400 flex-1 mb-8">
                LARİ'nin işletmeniz için nasıl bir dijital vitrin oluşturacağını kendi bilgilerinizle önizleyin.
             </p>
             <button 
                onClick={() => {
                   openInNewTab('/demo');
                }}
                className="w-full py-4 px-6 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-pink-600/20 text-center mt-auto"
             >
                Kendi İşletmeni Önizle
             </button>
           </div>

           <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-2xl p-8 shadow-sm border border-blue-100 dark:border-blue-900/30 text-left flex flex-col h-full w-full">
             <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center mb-6 shadow-md shadow-blue-500/20">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
             </div>
             <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Sistemi Beğendiniz mi?</h2>
             <p className="text-slate-600 dark:text-slate-400 flex-1 mb-8">
                LARİ'yi kendi işletmeniz için hemen kullanmaya başlayın. 14 gün boyunca ücretsiz deneyin, iptal etmek isterseniz ücret ödemeyin.
             </p>
             <button 
                onClick={() => {
                   openInNewTab('/register?planId=professional');
                }}
                className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-blue-600/20 text-center mt-auto"
             >
                14 Gün Ücretsiz Başla
             </button>
           </div>

        </div>
        
        <div className="mt-12">
            <button 
               onClick={async () => {
                  await pilotDemoService.exitDemoContext();
                  navigate('/');
               }}
               className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium underline"
            >
               Demo'dan Çık
            </button>
        </div>
      </div>
    </div>
  );
};

export default PilotDemoEntryPage;
