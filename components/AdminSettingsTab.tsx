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
    appointmentConfirmationEnabled: true,
    appointmentReminderEnabled: true,
    reminderText: 'Randevunuz yaklaşıyor.',
    kvkkText: 'Kişisel Verilerin Korunması Kanunu uyarınca aydınlatma metni.',
    marketingConsentText: 'İletişim bilgilerime kampanya duyuruları gönderilmesini onaylıyorum.',
    customerMemoryEnabled: true,
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant) return;
    try {
      const localStr = localStorage.getItem(`admin_settings_${tenant.id}`);
      if (localStr) {
        const parsed = JSON.parse(localStr);
        setFormData(prev => ({
          ...prev,
          ...parsed,
          businessName: parsed.businessName || tenant.name,
        }));
      } else {
        setFormData(f => ({ ...f, businessName: tenant.name }));
      }
    } catch (err) {
      console.error('Failed to load admin settings from storage:', err);
      setFormData(f => ({ ...f, businessName: tenant.name }));
      setValidationError('Kayıtlı yerel ayarlar okunurken bir sorun oluştu; varsayılan değerler yüklendi.');
    }
  }, [tenant]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setValidationError(null);
    setSaveSuccess(null);
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const handleSave = () => {
    if (!tenant) {
      setValidationError('Aktif işletme oturumu bulunamadı.');
      return;
    }

    const cancellationHours = Number(formData.cancellationPolicyHours);
    const minAdvanceHours = Number(formData.minAdvanceBookingTime);
    const maxDays = Number(formData.maxDaysAhead);

    if (!Number.isFinite(cancellationHours) || cancellationHours < 0 || cancellationHours > 720) {
      const msg = 'İptal politikası süresi 0 ile 720 saat arasında geçerli bir sayı olmalıdır.';
      setValidationError(msg);
      setSaveSuccess(null);
      showAlert(msg);
      return;
    }

    if (!Number.isFinite(minAdvanceHours) || minAdvanceHours < 0 || minAdvanceHours > 720) {
      const msg = 'Önceden rezervasyon süresi 0 ile 720 saat arasında geçerli bir sayı olmalıdır.';
      setValidationError(msg);
      setSaveSuccess(null);
      showAlert(msg);
      return;
    }

    if (!Number.isFinite(maxDays) || maxDays < 1 || maxDays > 365) {
      const msg = 'Maksimum ileri tarih 1 ile 365 gün arasında geçerli bir sayı olmalıdır.';
      setValidationError(msg);
      setSaveSuccess(null);
      showAlert(msg);
      return;
    }

    if (!formData.kvkkText || formData.kvkkText.trim().length < 10) {
      const msg = 'Müşteri Aydınlatma (KVKK) metni boş bırakılamaz (en az 10 karakter).';
      setValidationError(msg);
      setSaveSuccess(null);
      showAlert(msg);
      return;
    }

    const normalizedData = {
      ...formData,
      cancellationPolicyHours: cancellationHours,
      minAdvanceBookingTime: minAdvanceHours,
      maxDaysAhead: maxDays,
      kvkkText: formData.kvkkText.trim(),
      marketingConsentText: formData.marketingConsentText.trim(),
    };

    try {
      localStorage.setItem(`admin_settings_${tenant.id}`, JSON.stringify(normalizedData));
      setFormData(normalizedData);
      setValidationError(null);
      setSaveSuccess('Ayarlar başarıyla doğrulandı ve kaydedildi.');
      showAlert('Ayarlar başarıyla kaydedildi.');
    } catch (err) {
      console.error('Failed to persist admin settings:', err);
      const msg = 'Ayarlar kaydedilirken tarayıcı depolama hatası oluştu.';
      setValidationError(msg);
      setSaveSuccess(null);
      showAlert(msg);
    }
  };

  if (!tenant) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="admin-settings-empty"
        className="p-6 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 text-sm text-gray-600 dark:text-gray-300"
      >
        İşletme ayarları yükleniyor veya aktif işletme seçilmedi.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">İşletme Yönetim Ayarları</h2>
        <button
          type="button"
          onClick={handleSave}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm font-semibold rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Kaydet
        </button>
      </div>

      {validationError && (
        <div
          role="alert"
          aria-live="assertive"
          data-testid="admin-settings-error"
          className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300 font-medium"
        >
          {validationError}
        </div>
      )}

      {saveSuccess && !validationError && (
        <div
          role="status"
          aria-live="polite"
          data-testid="admin-settings-saved"
          className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm text-emerald-700 dark:text-emerald-300 font-medium"
        >
          {saveSuccess}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {tenant && <ShareToolkitSection tenant={tenant} />}
        {tenant && <BranchManagementSection tenantId={tenant.id} planId={tenant.planId} />}

        {/* İşletme Hesap Ayarları */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Hesap ve Genel Ayarlar</h3>
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 dark:bg-slate-900/50 rounded-lg border border-gray-100 dark:border-slate-700/50">
              <label htmlFor="admin-owner-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hesap Email (Salt Okunur)</label>
              <input id="admin-owner-email" type="email" name="ownerEmail" value={formData.ownerEmail} disabled className="w-full p-2.5 bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-gray-400 opacity-75 cursor-not-allowed" placeholder="owner@salon.com" />
            </div>

            <div className="p-3 bg-gray-50 dark:bg-slate-900/50 rounded-lg border border-gray-100 dark:border-slate-700/50">
              <label htmlFor="admin-business-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Resmi İşletme Adı (Official Name)</label>
              <input id="admin-business-name" type="text" name="businessName" value={formData.businessName} disabled className="w-full p-2.5 bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-gray-400 opacity-75 cursor-not-allowed" />
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">İşletme adı ve canlı domain değişiklikleri platform onayı gerektirir. (Business name and live domain changes require platform review.)</p>
            </div>

            <div>
              <label htmlFor="admin-owner-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Yetkili / Sahip Adı</label>
              <input id="admin-owner-name" type="text" name="ownerName" value={formData.ownerName} onChange={handleChange} className="w-full p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label htmlFor="admin-default-language" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Varsayılan Dil</label>
              <select id="admin-default-language" name="defaultLanguage" value={formData.defaultLanguage} onChange={handleChange} className="w-full p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
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
              <label htmlFor="admin-cancellation-hours" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">İptal Politikası (Saat)</label>
              <input id="admin-cancellation-hours" type="number" min={0} max={720} name="cancellationPolicyHours" value={formData.cancellationPolicyHours} onChange={handleChange} className="w-full p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <p className="text-xs text-gray-500 mt-1">Müşteriler randevuya kaç saat kalana kadar iptal edebilir?</p>
            </div>
            <div>
              <label htmlFor="admin-min-advance-hours" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Önceden Rezervasyon Süresi (Saat)</label>
              <input id="admin-min-advance-hours" type="number" min={0} max={720} name="minAdvanceBookingTime" value={formData.minAdvanceBookingTime} onChange={handleChange} className="w-full p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <p className="text-xs text-gray-500 mt-1">En az kaç saat sonrasına randevu alınabilir?</p>
            </div>
            <div>
              <label htmlFor="admin-max-days-ahead" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Maksimum İleri Tarih (Gün)</label>
              <input id="admin-max-days-ahead" type="number" min={1} max={365} name="maxDaysAhead" value={formData.maxDaysAhead} onChange={handleChange} className="w-full p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
              <input type="checkbox" id="allowNoPreference" name="allowNoPreference" checked={formData.allowNoPreference} onChange={handleChange} className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-2 focus:ring-indigo-500" />
              <label htmlFor="allowNoPreference" className="text-sm font-medium text-gray-700 dark:text-gray-300">"Fark Etmez" Personel Seçimine İzin Ver</label>
            </div>
          </div>
        </div>

        {/* Veri & İletişim */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">İletişim ve Müşteri Verisi</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input type="checkbox" id="customerMemoryEnabled" name="customerMemoryEnabled" checked={formData.customerMemoryEnabled} onChange={handleChange} className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-2 focus:ring-indigo-500" />
              <label htmlFor="customerMemoryEnabled" className="text-sm font-medium text-gray-700 dark:text-gray-300">Müşteri Hafızası (Notlar ve Fotoğraflar) Aktif</label>
            </div>
            <div>
              <label htmlFor="admin-kvkk-text" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Müşteri Aydınlatma (KVKK) Metni</label>
              <textarea id="admin-kvkk-text" name="kvkkText" value={formData.kvkkText} onChange={handleChange} rows={2} className="w-full p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label htmlFor="admin-marketing-consent-text" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pazarlama İzni Metni</label>
              <textarea id="admin-marketing-consent-text" name="marketingConsentText" value={formData.marketingConsentText} onChange={handleChange} rows={2} className="w-full p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
        </div>

        {/* Bildirimler ve İletişim */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Bildirimler ve İletişim</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Randevu bildirimleri, işletme iletişim bilgileriniz ve aktif iletişim kanallarınız üzerinden hazırlanır.</p>
          <div
            role="note"
            data-testid="admin-settings-comm-truth-notice"
            className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 rounded-lg text-xs text-amber-800 dark:text-amber-300"
          >
            <strong>İletişim Kanalı Durumu:</strong> Bildirim tercihleri mesaj şablonlarını yerel iletişim kutusunda (Outbox) hazırlar. Harici SMS/E-posta/WhatsApp API sağlayıcısı bağlı olmadığında otomatik arka plan gönderimi yapılmaz; manuel WhatsApp paylaşım bağlantıları kullanılabilir.
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input type="checkbox" id="appointmentConfirmationEnabled" name="appointmentConfirmationEnabled" checked={formData.appointmentConfirmationEnabled} onChange={handleChange} className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-2 focus:ring-indigo-500" />
              <label htmlFor="appointmentConfirmationEnabled" className="text-sm font-medium text-gray-700 dark:text-gray-300">Randevu Onay Şablonu Hazırlama (Outbox)</label>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="appointmentReminderEnabled" name="appointmentReminderEnabled" checked={formData.appointmentReminderEnabled} onChange={handleChange} className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-2 focus:ring-indigo-500" />
              <label htmlFor="appointmentReminderEnabled" className="text-sm font-medium text-gray-700 dark:text-gray-300">Randevu Hatırlatıcı Şablonu (1 Gün Önce)</label>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="whatsappEnabled" name="whatsappEnabled" checked={formData.whatsappEnabled} onChange={handleChange} className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-2 focus:ring-indigo-500" />
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
