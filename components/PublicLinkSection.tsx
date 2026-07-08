import React, { useState, useEffect } from 'react';
import { useDialog } from '../contexts/DialogContext';
import { Tenant, BusinessBranch } from '../types';
import { publicLinkService } from '../services/publicLinkService';
import { branchService } from '../services/branchService';
import { useAuth } from '../contexts/AuthContext';

interface PublicLinkSectionProps {
  tenant: Tenant;
}

const PublicLinkSection: React.FC<PublicLinkSectionProps> = ({ tenant }) => {
  const { alert } = useDialog();
  const [branches, setBranches] = useState<BusinessBranch[]>([]);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  useEffect(() => {
    branchService.listBranches(tenant.id).then(setBranches);
  }, [tenant.id]);

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(url);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const statusMap = {
    draft: { label: 'Önizleme Aşamasında', classes: 'bg-yellow-100 text-yellow-800' },
    pending_review: { label: 'İncelemede', classes: 'bg-blue-100 text-blue-800' },
    published: { label: 'Yayında', classes: 'bg-green-100 text-green-800' },
    paused: { label: 'Beklemede', classes: 'bg-gray-100 text-gray-800' },
    not_submitted: { label: 'Başlatılmadı', classes: 'bg-gray-100 text-gray-800' }
  };
  
  // Actually, tenant doesn't directly have publicSiteStatus, business profile does
  // For simplicity, we just use the tenant status or pass it from parent.
  // We'll use published if tenant.status is active, but actually we should warn them.
  
  const publicUrl = publicLinkService.getTenantBookingUrl(tenant);
  const previewUrl = publicLinkService.getAdminPreviewUrl(tenant);
  const domainStatus = publicLinkService.getCustomDomainStatus(tenant);

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm mt-6 lg:col-span-2">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Bağlantılar ve Paylaşım</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Müşterilerinizin randevu alabilmesi için gereken bağlantılar.</p>
      </div>

      <div className="space-y-6">
        {/* Main Tenant Link */}
        <div className="p-4 bg-gray-50 dark:bg-slate-900/50 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex-1 overflow-hidden">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Genel Randevu Bağlantısı</h4>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate mb-2">
              {publicUrl}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Bu bağlantıyı Instagram biyografinize, WhatsApp mesajlarınıza veya Google işletme profilinize ekleyebilirsiniz.
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              onClick={() => handleCopy(publicUrl)}
              className="px-3 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 rounded text-sm font-medium transition-colors"
            >
              {copiedLink === publicUrl ? 'Kopyalandı!' : 'Kopyala'}
            </button>
            <a 
              href={publicLinkService.getQrPayload(publicUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600 rounded text-sm font-medium transition-colors text-center"
            >
              QR Kod
            </a>
          </div>
        </div>

        {/* Branch Specific Links */}
        {branches.length > 1 && (
          <div className="space-y-3">
             <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Şube Özel Randevu Bağlantıları</h4>
             <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Müşteriyi doğrudan belirli bir şubeye yönlendiren bağlantılar.</p>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
               {branches.map(branch => {
                 const branchUrl = publicLinkService.getBranchBookingUrl(tenant, branch.slug || branch.id);
                 return (
                   <div key={branch.id} className="p-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg flex flex-col justify-between">
                     <div>
                       <span className="text-sm font-medium text-gray-900 dark:text-white">{branch.name}</span>
                       <div className="text-xs text-gray-500 truncate mt-1">{branchUrl}</div>
                     </div>
                     <div className="mt-3 flex gap-2">
                       <button 
                        onClick={() => handleCopy(branchUrl)}
                        className="px-2 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600 rounded text-xs font-medium transition-colors"
                       >
                         {copiedLink === branchUrl ? 'Kopyalandı!' : 'Linki Kopyala'}
                       </button>
                     </div>
                   </div>
                 );
               })}
             </div>
          </div>
        )}

        {/* Custom Domain Settings */}
        <div className="pt-4 border-t border-gray-200 dark:border-slate-700">
           <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Özel Alan Adı</h4>
           {domainStatus === 'locked' ? (
             <div className="p-3 bg-gray-50 dark:bg-slate-900/50 rounded-lg text-sm text-gray-500 dark:text-gray-400">
               Özel alan adı desteği Premium ve Kurumsal paketlerde sunulur. Yükseltme yaparak kendi web sitenize entegre edebilirsiniz.
             </div>
           ) : domainStatus === 'active' ? (
             <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-400 rounded-lg text-sm flex justify-between items-center">
               <span>Alan adınız aktif: {tenant.customDomain}</span>
             </div>
           ) : (
             <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400 rounded-lg text-sm">
               Alan adı talebiniz incelenmek üzere kaydedildi. Veya ayarlamak için destek ile iletişime geçin.
             </div>
           )}
        </div>

      </div>
    </div>
  );
}

export default PublicLinkSection;
