import React, { useState, useEffect } from 'react';
import { planService, PricingPlan } from '../../services/planService';
import { Plus, Trash2, Save, Star } from 'lucide-react';
import { useDialog } from '../../contexts/DialogContext';

const SuperAdminPlansPage: React.FC = () => {
    const [plans, setPlans] = useState<PricingPlan[]>([]);
    const [saved, setSaved] = useState(false);
    const { confirm: showConfirm, alert: showAlert } = useDialog();

    useEffect(() => {
        setPlans(planService.getAllPlans());
    }, []);

    const handleUpdate = (planId: string, updates: Partial<PricingPlan>) => {
        planService.updatePlan(planId, updates);
        setPlans(planService.getAllPlans());
    };

    const handleAddPlan = async () => {
        const id = `plan_${Date.now()}`;
        const newPlan: PricingPlan = {
            id,
            name: 'Yeni Paket',
            monthlyPrice: 1000,
            annualPrice: 10000,
            annualDiscountPercent: 20,
            setupFee: 0,
            currency: 'TRY',
            maxStaff: 5,
            maxServices: 20,
            maxMonthlyAppointments: 200,
            customDomainEnabled: false,
            includedSubdomain: true,
            customComDomainIncluded: false,
            multiBranchEnabled: false,
            maxBranches: 1,
            aiRecommendationsEnabled: false,
            aiVisualizationEnabled: false,
            aiMonthlyQuota: 0,
            campaignsEnabled: false,
            advancedReportsEnabled: false,
            whatsappAutomationEnabled: true,
            googleCalendarEnabled: false,
            supportLevel: 'standard',
            referralEligible: false,
            isActive: true,
            isRecommended: false,
            trialDays: 7
        };
        const res = await planService.addPlan(newPlan);
        if (res.ok) {
            await showAlert('Yeni plan başarıyla eklendi.');
        } else {
            await showAlert('Plan eklenirken hata oluştu.');
        }
        setPlans(planService.getAllPlans());
    };

    const handleDeletePlan = async (planId: string, planName: string) => {
        const confirmed = await showConfirm({ message: `'${planName}' planını silmek istediğinize emin misiniz?` });
        if(confirmed) {
            const res = await planService.deletePlan(planId);
            if(res.ok) {
                if(res.action === 'deactivated') {
                    await showAlert(`'${planName}' başarıyla inaktif yapıldı. (Varsayılan veya kullanımda olduğu için tamamen silinmedi)`);
                } else {
                    await showAlert(`'${planName}' başarıyla silindi.`);
                }
                setPlans(planService.getAllPlans());
            } else {
                await showAlert('Silme işlemi başarısız.');
            }
        }
    };

    const handleSave = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 sm:mb-6">
                <div>
                   <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Planlar ve Fiyatlandırma Yönetimi</h2>
                   <p className="text-sm text-gray-500 mt-1">Paketleri dinamik olarak oluşturun, fiyatları ve deneme sürelerini ayarlayın.</p>
                </div>
                <div className="flex flex-wrap gap-2 sm:gap-3">
                   <button onClick={handleAddPlan} className="flex items-center gap-2 border border-accent text-accent hover:bg-accent/10 px-3 sm:px-4 py-2 rounded-md font-medium transition text-sm sm:text-base">
                      <Plus className="w-4 h-4" /> Yeni
                   </button>
                   <button onClick={handleSave} className="flex items-center gap-2 bg-accent hover:bg-blue-600 text-white px-4 sm:px-6 py-2 rounded-md font-medium transition text-sm sm:text-base">
                      <Save className="w-4 h-4" /> Kaydet
                   </button>
                </div>
            </div>
            
            <p className="text-sm text-yellow-600 bg-yellow-50 p-3 rounded-md mb-6 border border-yellow-200">
                Not: Mock modunda bu değişiklikler tüm platformda anında yansır. Canlı ödeme sisteminde (Iyzico/Stripe), dinamik abonelik paket ID'lerini de eşleştirmeniz gerekecektir.
            </p>

            {saved && <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm mb-4 border border-green-200">Ayarlar başarıyla kaydedildi ve tüm platformda güncellendi.</div>}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {plans.map(plan => (
                    <div key={plan.id} className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border ${plan.isRecommended ? 'border-accent ring-1 ring-accent' : 'border-gray-200 dark:border-slate-700'} p-6 space-y-4 relative transition-all`}>
                        {!plan.isActive && (
                            <div className="absolute top-0 right-0 bg-red-100 text-red-700 text-xs px-2 py-1 rounded-bl-lg rounded-tr-xl font-medium">İnaktif</div>
                        )}
                        {plan.isRecommended && (
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-white text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full flex items-center gap-1">
                                <Star className="w-3 h-3 fill-current" /> Tavsiye Edilen
                            </div>
                        )}
                        
                        <div className="flex justify-between items-start pt-2">
                           <input 
                               value={plan.name} 
                               onChange={e => handleUpdate(plan.id, { name: e.target.value })}
                               className="text-lg font-bold text-gray-900 dark:text-white bg-transparent border-b border-dashed border-gray-300 dark:border-slate-600 focus:border-accent outline-none pb-1"
                           />
                           <button onClick={() => handleDeletePlan(plan.id, plan.name)} className="text-gray-400 hover:text-red-500 transition">
                              <Trash2 className="w-4 h-4" />
                           </button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Aylık Fiyat (₺)</label>
                                <input 
                                   type="number" 
                                   value={plan.monthlyPrice} 
                                   onChange={e => handleUpdate(plan.id, { monthlyPrice: Number(e.target.value) })}
                                   className="w-full border-gray-300 dark:border-slate-600 rounded-md p-2 text-sm bg-gray-50 dark:bg-slate-700 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Yıllık Fiyat (₺)</label>
                                <input 
                                   type="number" 
                                   value={plan.annualPrice} 
                                   onChange={e => handleUpdate(plan.id, { annualPrice: Number(e.target.value) })}
                                   className="w-full border-gray-300 dark:border-slate-600 rounded-md p-2 text-sm bg-gray-50 dark:bg-slate-700 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Yıllık İndirim(%)</label>
                                <input 
                                   type="number" 
                                   value={plan.annualDiscountPercent || 0} 
                                   onChange={e => handleUpdate(plan.id, { annualDiscountPercent: Number(e.target.value) })}
                                   className="w-full border-gray-300 dark:border-slate-600 rounded-md p-2 text-sm bg-gray-50 dark:bg-slate-700 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Deneme Süresi(Gün)</label>
                                <input 
                                   type="number" 
                                   value={plan.trialDays !== undefined ? plan.trialDays : 7} 
                                   onChange={e => handleUpdate(plan.id, { trialDays: Number(e.target.value) })}
                                   className="w-full border-gray-300 dark:border-slate-600 rounded-md p-2 text-sm bg-gray-50 dark:bg-slate-700 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Max Uzman</label>
                                <input 
                                   type="number" 
                                   value={plan.maxStaff} 
                                   onChange={e => handleUpdate(plan.id, { maxStaff: Number(e.target.value) })}
                                   className="w-full border-gray-300 dark:border-slate-600 rounded-md p-2 text-sm bg-white dark:bg-slate-700 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Max Hizmet</label>
                                <input 
                                   type="number" 
                                   value={plan.maxServices} 
                                   onChange={e => handleUpdate(plan.id, { maxServices: Number(e.target.value) })}
                                   className="w-full border-gray-300 dark:border-slate-600 rounded-md p-2 text-sm bg-white dark:bg-slate-700 dark:text-white"
                                />
                            </div>
                        </div>

                        <div className="pt-4 grid grid-cols-1 gap-4 border-t border-gray-100 dark:border-slate-700">
                             <details className="group">
                               <summary className="text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer list-none flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-slate-700/50 transition">
                                 <span>Gelişmiş: Ödeme Altyapısı Eşleştirmeleri</span>
                                 <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                               </summary>
                               <div className="pt-3 space-y-3 px-2">
                                 <div>
                                     <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Provider Product Reference <span className="font-normal text-[10px] text-gray-500">(Sandbox/Prod config)</span></label>
                                     <input 
                                        type="text" 
                                        placeholder="e.g. prd_1234..."
                                        value={plan.iyzicoProductReferenceCode || ''} 
                                        onChange={e => handleUpdate(plan.id, { iyzicoProductReferenceCode: e.target.value })}
                                        className="w-full border-gray-300 dark:border-slate-600 rounded-md p-2 text-sm bg-gray-50 dark:bg-slate-700 dark:text-white"
                                     />
                                 </div>
                                 <div>
                                     <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Provider Plan Reference (Monthly) <span className="font-normal text-[10px] text-gray-500">(Sandbox/Prod config)</span></label>
                                     <input 
                                        type="text" 
                                        placeholder="e.g. 1a2b3c4d-..."
                                        value={plan.iyzicoPlanReferenceCodeMonthly || ''} 
                                        onChange={e => handleUpdate(plan.id, { iyzicoPlanReferenceCodeMonthly: e.target.value })}
                                        className="w-full border-gray-300 dark:border-slate-600 rounded-md p-2 text-sm bg-gray-50 dark:bg-slate-700 dark:text-white"
                                     />
                                 </div>
                                 <div>
                                     <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Provider Plan Reference (Annual) <span className="font-normal text-[10px] text-gray-500">(Sandbox/Prod config)</span></label>
                                     <input 
                                        type="text" 
                                        placeholder="e.g. 5e6f7g8h-..."
                                        value={plan.iyzicoPlanReferenceCodeAnnual || ''} 
                                        onChange={e => handleUpdate(plan.id, { iyzicoPlanReferenceCodeAnnual: e.target.value })}
                                        className="w-full border-gray-300 dark:border-slate-600 rounded-md p-2 text-sm bg-gray-50 dark:bg-slate-700 dark:text-white"
                                     />
                                 </div>
                               </div>
                             </details>
                        </div>

                        <div className="pt-2 space-y-2 border-t border-gray-100 dark:border-slate-700">
                           <label className="flex items-center space-x-2">
                               <input type="checkbox" checked={plan.isActive !== false} onChange={e => handleUpdate(plan.id, { isActive: e.target.checked })} className="rounded text-accent focus:ring-accent" />
                               <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Plan Aktif (Satışta)</span>
                           </label>
                           <label className="flex items-center space-x-2">
                               <input type="checkbox" checked={!!plan.isRecommended} onChange={e => handleUpdate(plan.id, { isRecommended: e.target.checked })} className="rounded text-accent focus:ring-accent" />
                               <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Tavsiye Edilen (Vurgula)</span>
                           </label>
                           <label className="flex items-center space-x-2">
                               <input type="checkbox" checked={plan.aiRecommendationsEnabled} onChange={e => handleUpdate(plan.id, { aiRecommendationsEnabled: e.target.checked })} className="rounded text-accent focus:ring-accent" />
                               <span className="text-sm font-medium text-gray-700 dark:text-gray-300">AI Tavsiyeler</span>
                           </label>
                           <label className="flex items-center space-x-2">
                               <input type="checkbox" checked={plan.aiVisualizationEnabled} onChange={e => handleUpdate(plan.id, { aiVisualizationEnabled: e.target.checked })} className="rounded text-accent focus:ring-accent" />
                               <span className="text-sm font-medium text-gray-700 dark:text-gray-300">AI Görselleştirme</span>
                           </label>
                           <div className="flex items-center space-x-2">
                               <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-24">AI Kota:</span>
                               <input type="number" value={plan.aiMonthlyQuota} onChange={e => handleUpdate(plan.id, { aiMonthlyQuota: Number(e.target.value) })} className="w-20 rounded border-gray-300 dark:border-slate-600 p-1 text-sm bg-gray-50 dark:bg-slate-700 dark:text-white" />
                           </div>
                           <label className="flex items-center space-x-2">
                               <input type="checkbox" checked={plan.customDomainEnabled} onChange={e => handleUpdate(plan.id, { customDomainEnabled: e.target.checked })} className="rounded text-accent focus:ring-accent" />
                               <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Kendi Alan Adını Bağlama (Custom Domain)</span>
                           </label>
                           <label className="flex items-center space-x-2">
                               <input type="checkbox" checked={plan.whatsappAutomationEnabled} onChange={e => handleUpdate(plan.id, { whatsappAutomationEnabled: e.target.checked })} className="rounded text-accent focus:ring-accent" />
                               <span className="text-sm font-medium text-gray-700 dark:text-gray-300">WhatsApp Bildirimleri</span>
                           </label>
                           <label className="flex items-center space-x-2">
                               <input type="checkbox" checked={plan.campaignsEnabled} onChange={e => handleUpdate(plan.id, { campaignsEnabled: e.target.checked })} className="rounded text-accent focus:ring-accent" />
                               <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Kampanya ve Referans Sistemi</span>
                           </label>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SuperAdminPlansPage;
