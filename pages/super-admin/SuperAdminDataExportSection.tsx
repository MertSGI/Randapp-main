import React, { useState, useEffect } from 'react';
import { dataExportService, TenantSnapshot } from '../../services/dataExportService';
import { migrationDryRunService, MigrationDryRunResult } from '../../services/migrationDryRunService';

interface SuperAdminDataExportSectionProps {
   // Add any needed props
}

export const SuperAdminDataExportSection: React.FC<SuperAdminDataExportSectionProps> = () => {
    const [tenants, setTenants] = useState<any[]>([]);
    const [selectedTenantId, setSelectedTenantId] = useState<string>('');
    const [snapshot, setSnapshot] = useState<TenantSnapshot | null>(null);
    const [dryRunResult, setDryRunResult] = useState<MigrationDryRunResult | null>(null);
    const [importDataStr, setImportDataStr] = useState<string>('');
    const [importMsg, setImportMsg] = useState<{type: 'error' | 'success', text: string} | null>(null);

    useEffect(() => {
        setTenants(dataExportService.getAllLocalTenants());
    }, []);

    const handleExport = () => {
        if (!selectedTenantId) return;
        const snap = dataExportService.exportTenantSnapshot(selectedTenantId);
        if (snap) {
            setSnapshot(snap);
            setDryRunResult(migrationDryRunService.validateSnapshotForMigration(snap));
        } else {
            setSnapshot(null);
            setDryRunResult(null);
            alert("Could not export data for this tenant.");
        }
    };

    const handleDownload = () => {
        if (!snapshot) return;
        const filename = dataExportService.createBackupFileName(snapshot.tenantId);
        const jsonStr = JSON.stringify(snapshot, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportSnapshot = () => {
        setImportMsg(null);
        try {
            const parsed = JSON.parse(importDataStr);
            const { valid, errors } = dataExportService.validateTenantSnapshot(parsed);
            if (!valid) {
                 setImportMsg({ type: 'error', text: 'Geçersiz snapshot: ' + errors.join(' ') });
                 return;
            }
            const ok = dataExportService.importTenantSnapshot(parsed);
            if (ok) {
                 setImportMsg({ type: 'success', text: `Veriler (${parsed.tenantId}) için başarıyla geri yüklendi! Lütfen sayfayı yenileyin.`});
                 setTenants(dataExportService.getAllLocalTenants());
                 setImportDataStr('');
            } else {
                 setImportMsg({ type: 'error', text: 'Yükleme başarısız. Bilinmeyen bir hata oluştu.' });
            }
        } catch (e: any) {
             setImportMsg({ type: 'error', text: 'Geçersiz JSON formatı: ' + e.message });
        }
    };

    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-6">
            <div className="border-b border-slate-100 dark:border-slate-700 pb-4">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Veri Yedekleme ve Taşıma Hazırlığı</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Pre-live veri güvenliği, local backup ve Supabase aktarım öncesi (dry-run) sistemidir.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* EXPORT PANEL */}
                <div className="space-y-4">
                    <h3 className="font-semibold text-slate-700 dark:text-slate-200">1. Local Tenant Yedeği Al (Export)</h3>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tenant Seçiniz</label>
                        <div className="flex gap-2">
                           <select 
                               className="flex-1 rounded-md border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white text-sm"
                               value={selectedTenantId}
                               onChange={(e) => setSelectedTenantId(e.target.value)}
                           >
                               <option value="">-- Tenant --</option>
                               {tenants.map(t => (
                                   <option key={t.id} value={t.id}>{t.businessName || t.id}</option>
                               ))}
                           </select>
                           <button 
                               onClick={handleExport}
                               disabled={!selectedTenantId}
                               className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium disabled:opacity-50"
                           >
                               Tara
                           </button>
                        </div>
                    </div>

                    {snapshot && dryRunResult && (
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700/50 space-y-4">
                            <div>
                                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Özet</h4>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                     <div className="bg-white dark:bg-slate-800 px-3 py-2 rounded border border-slate-100 dark:border-slate-700">
                                         <div className="text-slate-500 dark:text-slate-400">Şubeler</div>
                                         <div className="font-semibold text-slate-800 dark:text-slate-200">{snapshot.branches?.length || 1}</div>
                                     </div>
                                     <div className="bg-white dark:bg-slate-800 px-3 py-2 rounded border border-slate-100 dark:border-slate-700">
                                         <div className="text-slate-500 dark:text-slate-400">Hizmetler</div>
                                         <div className="font-semibold text-slate-800 dark:text-slate-200">{snapshot.catalog?.services?.length || 0}</div>
                                     </div>
                                     <div className="bg-white dark:bg-slate-800 px-3 py-2 rounded border border-slate-100 dark:border-slate-700">
                                         <div className="text-slate-500 dark:text-slate-400">Uzmanlar</div>
                                         <div className="font-semibold text-slate-800 dark:text-slate-200">{snapshot.catalog?.staff?.length || 0}</div>
                                     </div>
                                     <div className="bg-white dark:bg-slate-800 px-3 py-2 rounded border border-slate-100 dark:border-slate-700">
                                         <div className="text-slate-500 dark:text-slate-400">Randevular</div>
                                         <div className="font-semibold text-slate-800 dark:text-slate-200">{snapshot.appointments?.length || 0}</div>
                                     </div>
                                </div>
                            </div>
                            
                            <div>
                                <h4 className="text-sm font-bold flex items-center justify-between mb-2">
                                     <span className="text-slate-700 dark:text-slate-300">Migration Readiness (Dry Run)</span>
                                     {dryRunResult.ready 
                                        ? <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs">HAZIR</span>
                                        : <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs">BLOKLANDI</span>
                                     }
                                </h4>
                                {dryRunResult.blockers.length > 0 && (
                                   <div className="text-xs space-y-1 mb-2 text-red-700 dark:text-red-400 font-medium">
                                       {dryRunResult.blockers.map((b, i) => <div key={i}>❌ {b}</div>)}
                                   </div>
                                )}
                                {dryRunResult.warnings.length > 0 && (
                                   <div className="text-xs space-y-1 mb-2 text-amber-700 dark:text-amber-400">
                                       {dryRunResult.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
                                   </div>
                                )}
                                {dryRunResult.recommendedFixes.length > 0 && (
                                   <div className="text-xs space-y-1 text-slate-600 dark:text-slate-400 italic">
                                       {dryRunResult.recommendedFixes.map((f, i) => <div key={i}>💡 {f}</div>)}
                                   </div>
                                )}
                            </div>

                            <button onClick={handleDownload} className="w-full py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white rounded-md text-sm font-medium transition">
                                .json Yedeğini İndir
                            </button>
                        </div>
                    )}
                </div>

                {/* IMPORT PANEL */}
                <div className="space-y-4">
                     <h3 className="font-semibold text-slate-700 dark:text-slate-200">2. Local Yedeği Yükle (Import)</h3>
                     <p className="text-xs text-slate-500 leading-relaxed">
                         Bu işlem girdiğiniz tenant verisini mevcut LocalStorage ortamına yükler veya üzerine yazar. Pilot kurulumlarının kurtarılması ve taşınması için kullanılır. 
                     </p>
                     
                     <textarea
                         value={importDataStr}
                         onChange={(e) => setImportDataStr(e.target.value)}
                         placeholder="Yedek JSON içeriğini buraya yapıştırın..."
                         className="w-full h-40 p-3 rounded-md border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white text-xs font-mono"
                     />
                     
                     {importMsg && (
                         <div className={`text-sm p-3 rounded-md ${importMsg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>
                              {importMsg.text}
                         </div>
                     )}

                     <button
                         onClick={handleImportSnapshot}
                         disabled={!importDataStr}
                         className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm font-medium disabled:opacity-50"
                     >
                         Veriyi Geri Yükle (Import)
                     </button>
                </div>
            </div>
        </div>
    );
};
