import React, { useState, useEffect } from 'react';
import { useDialog } from '../contexts/DialogContext';
import { useTenant } from '../contexts/TenantContext';
import BranchManagementSection from './BranchManagementSection';
import ShareToolkitSection from './ShareToolkitSection';

const AdminSettingsTab: React.FC = () => {
  const { alert: showAlert } = useDialog();
  const { tenant } = useTenant();
  
  const [formData, setFormData] = useState({
    businessName: '',
    ownerName: '',
    ownerEmail: '',
    defaultLanguage: 'tr',
    cancellationPolicyHours: 12,
    minAdvanceBookingTime: 2,
    maxDaysAhead: 30,
    allowNoPreference: true,
    whatsappEnabled: true,
    reminderText: 'Randevunuz yaklaşıyor.',
    kvkkText: 'Kişisel Verilerin Korunması Kanunu uyarınca aydınlatma metni.',
    marketingConsentText: 'İletişim bilgilerime kampanya duyuruları gönderilmesini onaylıyorum.',
    customerMemoryEnabled: true,
  });

  useEffect(() => {
    if (!tenant) return;
    const localStr = localStorage.getItem(`admin_settings_${tenant.id}`);
    if (localStr) {
      setFormData(JSON.parse(localStr));
    } else {
      setFormData(f => ({ ...f, businessName: tenant.name }));
    }
  }, [tenant]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const handleSave = () => {
    if (!tenant) return;
    localStorage.setItem(`admin_settings_${tenant.id}`, JSON.stringify(formData));
    showAlert('Ayarlar başarıyla kaydedildi.');
  };

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">İşletme Yönetim Ayarları</h2>
        <button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm font-semibold rounded-lg shadow-sm">
          Kaydet
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {tenant && <ShareToolkitSection tenant={tenant} />}
        {tenant && <BranchManagementSection tenantId={tenant.id} planId={tenant.planId} />}
        
        {/* İşletme Hesap Ayarları */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Hesap ve Genel Ayarlar</h3>
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 dark:bg-slate-900/50 rounded-lg border border-gray-100 dark:border-slate-700/50">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hesap Email (Salt Okunur)</label>
              <input type="email" name="ownerEmail" value={formData.ownerEmail} disabled className="w-full p-2.5 bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-gray-400 opacity-75 cursor-not-allowed" placeholder="owner@salon.com" />
            </div>
            
            <div className="p-3 bg-gray-50 dark:bg-slate-900/50 rounded-lg border border-gray-100 dark:border-slate-700/50">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Resmi İşletme Adı (Official Name)</label>
              <input type="text" name="businessName" value={formData.businessName} disabled className="w-full p-2.5 bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-gray-400 opacity-75 cursor-not-allowed" />
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">İşletme adı ve canlı domain değişiklikleri platform onayı gerektirir. (Business name and live domain changes require platform review.)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Yetkili / Sahip Adı</label>
              <input type="text" name="ownerName" value={formData.ownerName} onChange={handleChange} className="w-full p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Varsayılan Dil</label>
              <select name="defaultLanguage" value={formData.defaultLanguage} onChange={handleChange} className="w-full p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-white">
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>

        {/* Rezervasyon Kuralları */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Rezervasyon Kuralları</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">İptal Politikası (Saat)</label>
              <input type="number" name="cancellationPolicyHours" value={formData.cancellationPolicyHours} onChange={handleChange} className="w-full p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-white" />
              <p className="text-xs text-gray-500 mt-1">Müşteriler randevuya kaç saat kalana kadar iptal edebilir?</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Önceden Rezervasyon Süresi (Saat)</label>
              <input type="number" name="minAdvanceBookingTime" value={formData.minAdvanceBookingTime} onChange={handleChange} className="w-full p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-white" />
              <p className="text-xs text-gray-500 mt-1">En az kaç saat sonrasına randevu alınabilir?</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Maksimum İleri Tarih (Gün)</label>
              <input type="number" name="maxDaysAhead" value={formData.maxDaysAhead} onChange={handleChange} className="w-full p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-white" />
            </div>
            <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
               <input type="checkbox" id="allowNoPreference" name="allowNoPreference" checked={formData.allowNoPreference} onChange={handleChange} className="w-4 h-4 text-indigo-600 rounded border-gray-300" />
               <label htmlFor="allowNoPreference" className="text-sm font-medium text-gray-700 dark:text-gray-300">"Fark Etmez" Personel Seçimine İzin Ver</label>
            </div>
          </div>
        </div>

        {/* Veri & İletişim */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">İletişim ve Müşteri Verisi</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
               <input type="checkbox" id="customerMemoryEnabled" name="customerMemoryEnabled" checked={formData.customerMemoryEnabled} onChange={handleChange} className="w-4 h-4 text-indigo-600 rounded border-gray-300" />
               <label htmlFor="customerMemoryEnabled" className="text-sm font-medium text-gray-700 dark:text-gray-300">Müşteri Hafızası (Notlar ve Fotoğraflar) Aktif</label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Müşteri Aydınlatma (KVKK) Metni</label>
              <textarea name="kvkkText" value={formData.kvkkText} onChange={handleChange} rows={2} className="w-full p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pazarlama İzni Metni</label>
              <textarea name="marketingConsentText" value={formData.marketingConsentText} onChange={handleChange} rows={2} className="w-full p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-white" />
            </div>
          </div>
        </div>

        {/* Bildirimler ve İletişim */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Bildirimler ve İletişim</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Randevu bildirimleri, işletme iletişim bilgileriniz ve aktif iletişim kanallarınız üzerinden hazırlanır.</p>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
               <input type="checkbox" id="appointmentConfirmationEnabled" name="appointmentConfirmationEnabled" defaultChecked className="w-4 h-4 text-indigo-600 rounded border-gray-300" />
               <label htmlFor="appointmentConfirmationEnabled" className="text-sm font-medium text-gray-700 dark:text-gray-300">Randevu Onay Bildirimleri (Müşteriye)</label>
            </div>
            <div className="flex items-center gap-3">
               <input type="checkbox" id="appointmentReminderEnabled" name="appointmentReminderEnabled" defaultChecked className="w-4 h-4 text-indigo-600 rounded border-gray-300" />
               <label htmlFor="appointmentReminderEnabled" className="text-sm font-medium text-gray-700 dark:text-gray-300">Randevu Hatırlatıcı (1 Gün Önce)</label>
            </div>
            <div className="flex items-center gap-3">
               <input type="checkbox" id="whatsappEnabled" name="whatsappEnabled" checked={formData.whatsappEnabled} onChange={handleChange} className="w-4 h-4 text-indigo-600 rounded border-gray-300" />
               <label htmlFor="whatsappEnabled" className="text-sm font-medium text-gray-700 dark:text-gray-300">WhatsApp İletişim / Randevu Linklerini Göster</label>
            </div>
            <div className="pt-2 border-t border-gray-100 dark:border-slate-700">
               <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Şablon Önizleme (Örnek Randevu Onayı)</label>
               <div className="p-3 bg-gray-50 dark:bg-slate-900 rounded-lg text-[13px] text-gray-600 dark:text-gray-400 font-mono">
                 "Randevunuz oluşturuldu. İşletme, hizmet ve saat bilgilerinizi aşağıda görebilirsiniz: {formData.businessName || 'İşletme'} - Saç Kesimi - 12 Kasım 14:00."
               </div>
            </div>
          </div>
        </div>

        {/* Yapay Zeka & Ek Hizmetler */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Platform Limitleri & AI Yönergeleri</h3>
          <div className="space-y-4">
            <div className="bg-purple-50 dark:bg-purple-900/30 p-4 rounded-lg">
              <h4 className="text-sm font-bold text-purple-900 dark:text-purple-300 mb-1">Yapay Zeka (AI) ve Platform İzinleri</h4>
              <p className="text-xs text-purple-700 dark:text-purple-400 mb-3">AI Asistan kuralları, kota yönetimi, abonelik durumu ve global özellik aç/kapa yetkileri üst paket (Platform Super Admin) kontrolündedir. Bu ayarları değiştirmek için platform yöneticinizle iletişime geçin.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
export default AdminSettingsTab;
