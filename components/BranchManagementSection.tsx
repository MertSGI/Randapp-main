import React, { useState, useEffect } from 'react';
import { useDialog } from '../contexts/DialogContext';
import { entitlementService } from '../services/entitlementService';
import { branchService } from '../services/branchService';
import { BusinessBranch } from '../types';

interface BranchManagementSectionProps {
  tenantId: string;
  planId?: string;
}

const BranchManagementSection: React.FC<BranchManagementSectionProps> = ({ tenantId, planId = 'baslangic' }) => {
  const { alert } = useDialog();
  const [branches, setBranches] = useState<BusinessBranch[]>([]);
  const isMultiBranchAllowed = entitlementService.canUseFeature(planId, 'multi_branch');
  const maxBranches = entitlementService.getLimit(planId, 'maxBranches');

  const [isAdding, setIsAdding] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const loadBranches = async () => {
    // ensuring we have at least primary
    await branchService.ensurePrimaryBranchForTenant(tenantId);
    const list = branchService.getStoredBranches(tenantId);
    setBranches(list.filter(b => b.isActive));
  };

  useEffect(() => {
    loadBranches();
  }, [tenantId]);

  const handleAddBranch = async () => {
    if (!newBranchName.trim()) return;
    
    if (!isMultiBranchAllowed) {
      alert('Çok şubeli yapı Kurumsal paket kapsamında sunulur. Bu yapıyı kullanmak için bizimle iletişime geçebilirsiniz.');
      setIsAdding(false);
      return;
    }

    if (branches.length >= maxBranches) {
      alert(`Maksimum şube sınırına (${maxBranches}) ulaştınız.`);
      return;
    }

    await branchService.createBranch(tenantId, { name: newBranchName, isPrimary: false });
    setNewBranchName('');
    setIsAdding(false);
    loadBranches();
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm mt-6 lg:col-span-2">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Şube Yönetimi</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">İşletmenizin şubelerini (lokasyonlarını) yönetin.</p>
        </div>
        {!isAdding && isMultiBranchAllowed && (
          <button 
            onClick={() => setIsAdding(true)} 
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
          >
            + Şube Ekle
          </button>
        )}
      </div>

      <div className="space-y-3">
        {branches.map(branch => (
          <div key={branch.id} className="p-3 bg-gray-50 dark:bg-slate-900/50 rounded-lg border border-gray-100 dark:border-slate-700/50 flex justify-between items-center">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                {branch.name}
                {branch.isPrimary && <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Merkez</span>}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{branch.city || 'Şehir belirtilmedi'} - {branch.phone || 'Telefon yok'}</div>
            </div>
          </div>
        ))}
        
        {isAdding && (
          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-lg">
            <label className="block text-xs font-bold text-indigo-900 dark:text-indigo-300 mb-1">Yeni Şube Adı</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={newBranchName}
                onChange={e => setNewBranchName(e.target.value)}
                placeholder="Örn: Kadıköy Şubesi"
                className="flex-1 p-2 text-sm border border-indigo-200 dark:border-indigo-700 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
              />
              <button 
                onClick={handleAddBranch}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 text-sm font-semibold rounded"
              >
                Ekle
              </button>
              <button 
                onClick={() => setIsAdding(false)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-2 text-sm font-semibold rounded"
              >
                İptal
              </button>
            </div>
          </div>
        )}

        {!isMultiBranchAllowed && (
          <div className="mt-4 p-4 border border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-center">
             <div className="text-xl mb-2">🏢</div>
             <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Çok Şubeli Yapı</h4>
             <p className="text-xs text-gray-500 dark:text-gray-400">Çok şubeli yapı (Multi-branch) <b>Kurumsal</b> paket kapsamında tam destekli olarak sunulur. Yapınızı büyütmek için bizimle iletişime geçebilirsiniz.</p>
          </div>
        )}
      </div>
    </div>
  );
};
export default BranchManagementSection;
