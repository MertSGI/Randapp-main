import React from 'react';

const SupportPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col pt-24 pb-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-100">Destek ve Yardım</h1>
        
        <div className="prose dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 space-y-6">
           
           <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700">
             <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-2 mb-4">Müşteriler İçin</h2>
             <p>Randevunuz, hizmet almak istediğiniz işletme veya kampanya süreçleri ile ilgili tüm destek talepleriniz için öncelikle doğrudan randevu aldığınız salon/işletme ile iletişime geçmelisiniz.</p>
           </div>

           <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700">
             <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-2 mb-4">İşletmeler İçin</h2>
             <p>LARİ Platformu kullanımı, faturalandırma ve hesabınızla ilgili konularda destek almak için panelinizdeki Destek butonunu veya aşağıdaki kanalları kullanabilirsiniz:</p>
             <ul className="list-disc pl-5 mt-4">
               <li>E-posta: destek@lari.app</li>
               <li>Sistem Durumu: status.lari.app</li>
             </ul>
           </div>

        </div>
      </div>
    </div>
  );
};

export default SupportPage;
