import React, { useState, useEffect } from 'react';
import { useDialog } from '../contexts/DialogContext';
import { Tenant, BusinessBranch } from '../types';
import { publicLinkService } from '../services/publicLinkService';
import { shareToolkitService } from '../services/shareToolkitService';
import { branchService } from '../services/branchService';

interface ShareToolkitSectionProps {
  tenant: Tenant;
}

const ShareToolkitSection: React.FC<ShareToolkitSectionProps> = ({ tenant }) => {
  const { alert } = useDialog();
  const [branches, setBranches] = useState<BusinessBranch[]>([]);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  useEffect(() => {
    branchService.listBranches(tenant.id).then(setBranches);
    setChecklist(shareToolkitService.getShareChecklist(tenant.id));
  }, [tenant.id]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(id);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const toggleChecklist = (key: string) => {
    const updated = shareToolkitService.updateShareChecklist(tenant.id, { [key]: !checklist[key] });
    setChecklist(updated);
  };

  const publicUrl = publicLinkService.getTenantBookingUrl(tenant);
  const domainStatus = publicLinkService.getCustomDomainStatus(tenant);

  const activeBranchId = branches.length > 1 && selectedBranch !== '' ? selectedBranch : undefined;
  
  const whatsappText = shareToolkitService.getWhatsAppShareText(tenant, activeBranchId);
  const instagramBioText = shareToolkitService.getInstagramBioText(tenant, activeBranchId);
  const instagramStoryText = shareToolkitService.getInstagramStoryText(tenant, activeBranchId);
  const googleBusinessText = shareToolkitService.getGoogleBusinessText(tenant, activeBranchId);
  const launchText = shareToolkitService.getLaunchAnnouncementText(tenant);
  
  const trackingUrl = shareToolkitService.getShareTrackingUrl(tenant, 'qr', activeBranchId);
  const qrPayload = publicLinkService.getQrPayload(trackingUrl);

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm mt-6 lg:col-span-2">
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Müşteri Kazanım ve Paylaşım Araçları</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Randevu bağlantınızı kolayca paylaşın. Müşterilerinize doğrudan ve hızlı bir şekilde ulaşmak için bu kopyalanabilir metinleri kullanın.
          </p>
        </div>
        
        {branches.length > 1 && (
          <div className="min-w-[200px]">
             <select 
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full p-2 bg-gray-50 border border-gray-300 rounded text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white"
             >
                <option value="">Genel (Tüm Şubeler)</option>
                {branches.map(b => (
                   <option key={b.id} value={b.slug || b.id}>{b.name}</option>
                ))}
             </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Sol Kolon: Hızlı Paylaşım Metinleri */}
        <div className="space-y-5">
           <h4 className="font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-700 pb-2">Hızlı Paylaşım Metinleri</h4>
           
           {[
             { id: 'whatsapp', label: 'WhatsApp Mesajı', content: whatsappText },
             { id: 'ig_bio', label: 'Instagram Biyografisi', content: instagramBioText },
             { id: 'ig_story', label: 'Instagram Hikaye Paylaşımı', content: instagramStoryText },
             { id: 'google_biz', label: 'Google İşletme Profili', content: googleBusinessText },
             { id: 'launch', label: 'İlk Duyuru Metni', content: launchText },
           ].map(item => (
             <div key={item.id} className="p-3 bg-gray-50 dark:bg-slate-900/50 rounded-lg border border-gray-100 dark:border-slate-600">
                <div className="flex justify-between items-center mb-2">
                   <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.label}</h5>
                   <button 
                     onClick={() => handleCopy(item.content, item.id)}
                     className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                   >
                     {copiedLink === item.id ? 'Kopyalandı!' : 'Kopyala'}
                   </button>
                </div>
                <div className="text-[13px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono">
                   {item.content}
                </div>
             </div>
           ))}
        </div>

        {/* Sağ Kolon: QR, Checklist ve Domain */}
        <div className="space-y-8">
           
           <div>
              <h4 className="font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-700 pb-2 mb-4">QR ve Salon İçi Kullanım</h4>
              <div className="p-4 bg-gray-50 dark:bg-slate-900/50 rounded-lg border border-gray-200 dark:border-slate-700 flex items-center gap-4">
                 <div className="w-20 h-20 bg-white rounded flex items-center justify-center border border-gray-200 overflow-hidden">
                    <img src={qrPayload} alt="QR Code" className="w-full h-full object-cover" />
                 </div>
                 <div className="flex-1">
                    <h5 className="text-sm font-semibold text-gray-900 dark:text-white">QR Poster veya Etiket</h5>
                    <p className="text-xs text-gray-500 mb-2">Salon içinde müşterilerinizin telefonlarından hemen randevu almasını sağlayın.</p>
                    <a 
                      href={qrPayload} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded hover:bg-indigo-100 transition"
                    >
                       QR Görselini Aç
                    </a>
                 </div>
              </div>
           </div>

           <div>
              <h4 className="font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-700 pb-2 mb-4">Paylaşım Kontrol Listesi</h4>
              {!tenant.isPublished ? (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-lg text-sm mb-4">
                  Siteniz henüz yayında değil. <strong>Yayına alındığında</strong> aşağıdaki adımları tamamlamanız tavsiye edilir.
                </div>
              ) : null}
              <div className="space-y-2">
                 {[
                   { key: 'instagram_bio', label: "Instagram Bio'ya Eklendi" },
                   { key: 'whatsapp_quick_reply', label: "WhatsApp Sabit (Hazır) Mesajına Eklendi" },
                   { key: 'google_business', label: "Google İşletme Profiline Eklendi" },
                   { key: 'announced_to_old_customers', label: "İlk Müşterilere Duyuruldu" },
                   { key: 'qr_printed', label: "Salon İçine QR Etiketi Asıldı" },
                   { key: 'first_booking_tested', label: "İlk Randevu Test Edildi" }
                 ].map(item => (
                    <label key={item.key} className={`flex items-center gap-3 p-2 rounded transition ${tenant.isPublished ? 'hover:bg-gray-50 dark:hover:bg-slate-700/30 cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}>
                       <input 
                         type="checkbox" 
                         disabled={!tenant.isPublished}
                         checked={!!checklist[item.key]} 
                         onChange={() => toggleChecklist(item.key)}
                         className="w-4 h-4 text-indigo-600 rounded border-gray-300 dark:border-slate-500" 
                       />
                       <span className={`text-sm ${checklist[item.key] ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}`}>
                          {item.label}
                       </span>
                    </label>
                 ))}
              </div>
           </div>

           <div>
              <h4 className="font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-700 pb-2 mb-4">Özel Alan Adı</h4>
              {domainStatus === 'locked' ? (
                <div className="p-3 bg-gray-50 dark:bg-slate-900/50 rounded-lg text-sm text-gray-500 dark:text-gray-400">
                  Özel alan adı desteği Premium ve Kurumsal paketlerde sunulur. Kendi domain adınızı randevu sisteminize bağlayabilirsiniz.
                </div>
              ) : domainStatus === 'active' ? (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-400 rounded-lg text-sm">
                  Alan adınız aktif: {tenant.customDomain}
                </div>
              ) : (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400 rounded-lg text-sm">
                  Özel alan adı talebiniz incelenmektedir.
                </div>
              )}
           </div>

        </div>

      </div>
    </div>
  );
};

export default ShareToolkitSection;
