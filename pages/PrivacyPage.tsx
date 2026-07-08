import React from 'react';

const PrivacyPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col pt-24 pb-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-100">Gizlilik Politikası ve KVKK Aydınlatma Metni</h1>
        
        <div className="prose dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 space-y-6">
           <p><strong>Son Güncelleme:</strong> {new Date().toLocaleDateString()}</p>
           
           <p>
             LARİ Platformu olarak kuaför ve güzellik salonu işletmelerinin randevu, müşteri hafızası ve iletişim süreçlerini
             dijitalleştiren bir altyapı sunmaktayız. Bu platformu kullanarak rezervasyon yapan müşteriler ve platformu kullanan işletme sahipleri,
             bilgilerinin güvenle ve yasal sınırlamalar çerçevesinde saklandığından emin olabilir.
           </p>

           <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-8 mb-4">1. Veri Sorumlusu Kimdir?</h2>
           <p>
             LARİ altyapısını kullanan her bir işletme kendi müşterilerinin verisinden sorumlu veri sorumlusudur.
             LARİ Platformu ise altyapıyı ve veri işleme sistemlerini sağlayan "Veri İşleyen" konumundadır.
           </p>

           <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-8 mb-4">2. İzinler ve Müşteri Rızası</h2>
           <p>
             İşletmeler aracılığıyla aldığımız veri, doğrudan randevu oluşturma ve temel müşteri süreçlerinin icrası içindir. 
             Müşteri hafızasına dahil edilme, kampanya/promosyon/referans takibi gibi özellikler için ek açık rıza seçenekleri sunulmaktadır.
             Rızası bulunmayan müşterilerin müşteri hafızası özellikleri kapalı tutulmaktadır.
           </p>

           <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-8 mb-4">3. İletişim Bilgileriniz</h2>
           <p>
             Veri silme talepleri, düzeltme talepleri veya KVKK hakları için hizmet aldığınız salon/işletmeye başvurmanız gereklidir. Platform üzerinden oluşturduğunuz talepler, ilgili işletmeye iletilecektir.
           </p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPage;
