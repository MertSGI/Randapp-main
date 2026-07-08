import React, { useState, useEffect } from 'react';
import { useTenant } from '../contexts/TenantContext';
import { useLanguage } from '../contexts/LanguageContext';
import { businessProfileService } from '../services/businessProfileService';
import { mediaUploadService } from '../services/mediaUploadService';
import { SalonBusinessProfile } from '../types';

const BusinessProfileTab: React.FC = () => {
  const { tenant } = useTenant();
  const { language } = useLanguage();
  const [profile, setProfile] = useState<Partial<SalonBusinessProfile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

  useEffect(() => {
    if (tenant) {
      businessProfileService.getBusinessProfile(tenant.id).then(data => {
        if (data) setProfile(data);
        setLoading(false);
      });
    }
  }, [tenant]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setSaving(true);
    setMessage(null);
    try {
      await businessProfileService.updateBusinessProfile(tenant.id, profile);
      setMessage({ type: 'success', text: language === 'tr' ? 'Profil başarıyla güncellendi.' : 'Profile updated successfully.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Bir hata oluştu.' });
    }
    setSaving(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
     if (!e.target.files || e.target.files.length === 0 || !tenant) return;
     const file = e.target.files[0];
     try {
        const url = await mediaUploadService.uploadCoverImage(tenant.id, file); // We use same bucket or you can add uploadLogo in service
        setProfile({ ...profile, logo_url: url });
     } catch (err) {
        setMessage({ type: 'error', text: 'Logo yüklenemedi.' });
     }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
     if (!e.target.files || e.target.files.length === 0 || !tenant) return;
     const newUrls: string[] = [];
     try {
        for (let i = 0; i < e.target.files.length; i++) {
           const url = await mediaUploadService.uploadCoverImage(tenant.id, e.target.files[i]);
           newUrls.push(url);
        }
        const existingImages = profile.cover_images && profile.cover_images.length > 0 
           ? profile.cover_images 
           : (profile.cover_image_url ? [profile.cover_image_url] : []);
        setProfile({ ...profile, cover_images: [...existingImages, ...newUrls] });
     } catch (err) {
        setMessage({ type: 'error', text: 'Kapak fotoğrafları yüklenemedi.' });
     }
  };

  const removeCoverImage = (indexToRemove: number) => {
     const newImages = [...(profile.cover_images || [])];
     newImages.splice(indexToRemove, 1);
     setProfile({ ...profile, cover_images: newImages });
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
     if (!e.target.files || e.target.files.length === 0 || !tenant) return;
     const newUrls: string[] = [];
     try {
        for (let i = 0; i < e.target.files.length; i++) {
           const url = await mediaUploadService.uploadGalleryImage(tenant.id, e.target.files[i]);
           newUrls.push(url);
        }
        setProfile({ ...profile, gallery_images: [...(profile.gallery_images || []), ...newUrls] });
     } catch (err) {
        setMessage({ type: 'error', text: 'Galeri yüklenemedi.' });
     }
  };

  const removeGalleryImage = (indexToRemove: number) => {
     const newImages = [...(profile.gallery_images || [])];
     newImages.splice(indexToRemove, 1);
     setProfile({ ...profile, gallery_images: newImages });
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Yükleniyor...</div>;

  return (
    <div className="bg-white dark:bg-slate-800 shadow-sm rounded-lg border border-gray-200 dark:border-slate-700 p-6 transition-colors duration-300">
      <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-slate-700 pb-4">
         <h2 className="text-xl font-bold text-gray-900 dark:text-white">İşletme Profili & Web Sitesi</h2>
         <a 
           href={`/#/admin-preview`} 
           target="_blank" 
           rel="noopener noreferrer"
           className="text-sm bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-800 dark:text-white px-4 py-2 rounded-md transition font-medium border border-gray-200 dark:border-slate-600"
         >
           Site Önizlemesini Aç
         </a>
      </div>

      {message && (
        <div className={`p-4 rounded-md mb-6 font-medium ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* Toggle Public Profile */}
        <div className="flex items-center">
            <input 
              id="is_public_profile_enabled" 
              type="checkbox" 
              checked={profile.is_public_profile_enabled ?? true} 
              onChange={e => setProfile({...profile, is_public_profile_enabled: e.target.checked})} 
              className="h-4 w-4 text-accent focus:ring-accent border-gray-300 rounded"
            />
            <label htmlFor="is_public_profile_enabled" className="ml-2 block text-sm font-medium text-gray-900 dark:text-gray-300">
              Profil Web Sitesini Etkinleştir (Müşteriler salon sayfasını görebilir)
            </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Açık Profil Adı (Display Name)</label>
            <input 
              type="text" 
              value={profile.public_display_name || ''} 
              onChange={e => setProfile({...profile, public_display_name: e.target.value})}
              className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-2 text-sm dark:text-white focus:ring-accent focus:border-accent"
              placeholder="Web sitenizde gözükecek isim"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kısa Açıklama (Slogan)</label>
            <input 
              type="text" 
              value={profile.short_description || ''} 
              onChange={e => setProfile({...profile, short_description: e.target.value})}
              className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-2 text-sm dark:text-white focus:ring-accent focus:border-accent"
              placeholder="Şehrin en iyi tasarım stüdyosu"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kategori</label>
            <input 
              type="text" 
              value={profile.business_category || ''} 
              onChange={e => setProfile({...profile, business_category: e.target.value})}
              className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-2 text-sm dark:text-white focus:ring-accent focus:border-accent"
              placeholder="Güzellik & Kuaför, Klinik vb."
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hakkımızda Metni</label>
          <textarea 
            rows={4}
            value={profile.about_text || ''} 
            onChange={e => setProfile({...profile, about_text: e.target.value})}
            className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-2 text-sm dark:text-white focus:ring-accent focus:border-accent"
            placeholder="İşletmenizin hikayesi, deneyimleriniz ve misyonunuz..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <div>
              <h3 className="text-md font-semibold text-gray-900 dark:text-white mb-3">İletişim & Konum</h3>
              <div className="space-y-3">
                 <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">WhatsApp Numarası</label>
                    <input 
                       type="text" value={profile.whatsapp_number || ''} onChange={e => setProfile({...profile, whatsapp_number: e.target.value})}
                       className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-2 text-sm dark:text-white"
                       placeholder="+905551234567"
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Açık Adres</label>
                    <textarea 
                       rows={2} value={profile.address || ''} onChange={e => setProfile({...profile, address: e.target.value})}
                       className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-2 text-sm dark:text-white"
                    />
                 </div>
                 <div className="flex gap-2">
                    <div className="flex-1">
                       <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">İlçe</label>
                       <input type="text" value={profile.district || ''} onChange={e => setProfile({...profile, district: e.target.value})} className="w-full rounded-md border p-2 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                    </div>
                    <div className="flex-1">
                       <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">İl</label>
                       <input type="text" value={profile.city || ''} onChange={e => setProfile({...profile, city: e.target.value})} className="w-full rounded-md border p-2 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                    </div>
                 </div>
                 <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Google Haritalar URL (Opsiyonel)</label>
                    <div className="flex gap-2">
                       <input 
                          type="text" value={profile.google_maps_url || ''} onChange={e => setProfile({...profile, google_maps_url: e.target.value})}
                          className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-2 text-sm dark:text-white"
                          placeholder="https://maps.app.goo.gl/..."
                       />
                       {(profile.google_maps_url || profile.address) && (
                          <a 
                             href={profile.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${profile.address} ${profile.district || ''} ${profile.city || ''}`)}`}
                             target="_blank" rel="noreferrer"
                             className="px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-md text-xs font-medium flex items-center whitespace-nowrap"
                          >
                             Test Et
                          </a>
                       )}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">Bu link müşterilerin kolayca yol tarifi alması için kullanılacaktır. Google Haritalar'dan "Paylaş" &gt; "Bağlantıyı kopyala" diyerek alabilirsiniz.</p>
                 </div>
                 <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Instagram URL</label>
                    <input 
                       type="text" value={profile.instagram_url || ''} onChange={e => setProfile({...profile, instagram_url: e.target.value})}
                       className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-2 text-sm dark:text-white"
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Çalışma Saatleri (Özet Metin)</label>
                    <input 
                       type="text" value={profile.opening_hours_summary || ''} onChange={e => setProfile({...profile, opening_hours_summary: e.target.value})}
                       className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-2 text-sm dark:text-white"
                       placeholder="Hafta içi 09:00 - 19:00"
                    />
                 </div>
              </div>
           </div>

           <div>
              <h3 className="text-md font-semibold text-gray-900 dark:text-white mb-1">Görseller</h3>
              <div className="text-[11px] text-gray-500 dark:text-slate-400 space-y-0.5 mb-4 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-md border border-gray-100 dark:border-slate-700/60 transition-colors duration-300">
                 <p>• Görseller yayın öncesi önizleme için hazırlanır.</p>
                 <p>• Canlı medya depolama yayın ortamında etkinleştirilir.</p>
                 <p>• Logo, kapak ve galeri görselleriniz LARİ sayfanızda kullanılabilir.</p>
              </div>
              <div className="space-y-4">
                 <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Logo Yükle</label>
                    <input 
                       type="file" 
                       accept="image/*"
                       onChange={handleLogoUpload}
                       className="block w-full text-sm text-gray-500
                                  file:mr-4 file:py-2 file:px-4
                                  file:rounded-md file:border-0
                                  file:text-sm file:font-semibold
                                  file:bg-blue-50 file:text-blue-700
                                  hover:file:bg-blue-100 dark:file:bg-slate-700 dark:file:text-slate-300"
                    />
                    {profile.logo_url && (
                        <div className="relative inline-block mt-2">
                           <img src={profile.logo_url} alt="Logo Preview" className="h-20 w-20 rounded-full object-cover shadow-sm bg-white" />
                           <button type="button" onClick={() => setProfile({...profile, logo_url: ''})} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity">
                               <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                           </button>
                        </div>
                    )}
                 </div>
                 <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Kapak Fotoğrafları / İşletme Görselleri (Birden fazla seçebilirsiniz)</label>
                    <p className="text-[10px] text-gray-500 mb-2">Bu görseller web sitenizin kapak alanında otomatik geçiş yapar ve tıklanınca büyütülür.</p>
                    <input 
                       type="file" 
                       multiple
                       accept="image/*"
                       onChange={handleCoverUpload}
                       className="block w-full text-sm text-gray-500
                                  file:mr-4 file:py-2 file:px-4
                                  file:rounded-md file:border-0
                                  file:text-sm file:font-semibold
                                  file:bg-blue-50 file:text-blue-700
                                  hover:file:bg-blue-100 dark:file:bg-slate-700 dark:file:text-slate-300 mb-2"
                    />
                    {profile.cover_images && profile.cover_images.length > 0 ? (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {profile.cover_images.map((img, idx) => (
                                <div key={idx} className="relative group">
                                   <img src={img} className="h-16 w-24 object-cover rounded-md shadow-sm" />
                                   <button type="button" onClick={() => removeCoverImage(idx)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                       <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                   </button>
                                </div>
                            ))}
                        </div>
                    ) : profile.cover_image_url && (
                        <div className="mt-2 text-xs text-amber-600">Tekil kapak url'si mevcut, çoklu fotoğraf yüklediğinizde bu alan geçersiz sayılacaktır.</div>
                    )}
                 </div>
              </div>
           </div>
        </div>

        <div className="pt-4 border-t border-gray-200 dark:border-slate-700 flex justify-end">
          <button 
            type="submit" 
            disabled={saving}
            className="bg-accent hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-md shadow-sm disabled:opacity-50 transition"
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BusinessProfileTab;
