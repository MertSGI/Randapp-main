import React from 'react';

const TermsPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col pt-24 pb-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-100">Kullanım Şartları</h1>
        
        <div className="prose dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 space-y-6">
           <p><strong>Son Güncelleme:</strong> {new Date().toLocaleDateString()}</p>
           
           <p>
             LARİ Platformunu kullanmadan önce aşağıdaki koşulları dikkatlice okuyunuz.
           </p>

           <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-8 mb-4">1. Hizmet Tanımı</h2>
           <p>
             LARİ, işletmeler için bulut tabanlı bir hizmet platformudur (SaaS). İşletmeler ile müşterileri arasındaki randevu, iletişim ve kampanya yönetimini sağlar.
           </p>

           <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-8 mb-4">2. Yükümlülükler</h2>
           <p>
             Platformda alınan randevular tamamen ilgili işletme ile müşteri arasına dair geçerlidir. LARİ, randevunun gerçekleşeceği veya hizmet kalitesine dair hiçbir garanti vermez, aracı platform olarak işlev görür.
           </p>

           <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-8 mb-4">3. Abonelik ve İptaller</h2>
           <p>
             İşletmeler diledikleri an aboneliklerini sonlandırabilirler. Ancak geçmiş dönemler için herhangi bir iade yapılmamaktadır. Müşterilerin iptalleri ise ilgili işletmenin kurallarına tabidir.
           </p>
        </div>
      </div>
    </div>
  );
};

export default TermsPage;
