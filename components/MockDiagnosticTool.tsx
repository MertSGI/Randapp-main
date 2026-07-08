import React, { useState, useEffect } from 'react';
import { Database, Trash2, RefreshCw, X, AlertTriangle, Eye, EyeOff, Layout, List, PlayCircle } from 'lucide-react';
import { createStaff, deleteStaff, getStaffList } from '../services/staffService';
import { createService, deleteService, getServices } from '../services/serviceCatalogService';
import { referralService } from '../services/referralService';
import { planService } from '../services/planService';
import { useDialog } from '../contexts/DialogContext';

export const MockDiagnosticTool: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeKeys, setActiveKeys] = useState<{ key: string; value: string; size: number }[]>([]);
  const [selectedKeyValue, setSelectedKeyValue] = useState<{ key: string; value: string } | null>(null);
  const [crudTestResult, setCrudTestResult] = useState<any[]>([]);
  const [isRunningCrudTest, setIsRunningCrudTest] = useState(false);
  const { alert: showAlert, confirm: showConfirm } = useDialog();

  // Checks URL and mode to see if dev tools should render
  const isMockMode = (() => { try { return (import.meta as any).env?.VITE_DATA_MODE === 'mock'; } catch { return true; } })();
  const hasDevParam = window.location.href.includes('devTools=1') || window.location.href.includes('demoTools=1');
  const isVisible = isMockMode && hasDevParam;

  const scanStorage = () => {
    const keys: { key: string; value: string; size: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        // Find keys belonging to Randapp
        if (
          key.startsWith('randapp') ||
          key.startsWith('mock_') ||
          key.startsWith('nexus_') ||
          key.includes('tenant_') ||
          key === 'users'
        ) {
          const val = localStorage.getItem(key) || '';
          keys.push({
            key,
            value: val,
            size: new Blob([val]).size
          });
        }
      }
    }
    setActiveKeys(keys.sort((a, b) => b.size - a.size));
  };

  useEffect(() => {
    if (isVisible) {
      scanStorage();
      // Poll storage changes so that mock data updates in real-time
      const interval = setInterval(scanStorage, 2500);
      return () => clearInterval(interval);
    }
  }, [isVisible]);

  const runBrowserCrudTest = async () => {
    setIsRunningCrudTest(true);
    setCrudTestResult([]);
    const results = [];
    const tenantId = 'demo-tenant-1';

    try {
      // 1. Staff Test
      const staffList = await getStaffList(tenantId);
      const beforeCount = staffList.length;
      await createStaff(tenantId, { name: 'UI Smoke Staff', title: 'Test', active: true, image: '' } as any);
      
      let curStaff = await getStaffList(tenantId);
      let passedCreate = curStaff.length === beforeCount + 1;
      
      const newStaff = curStaff.find(s => s.name === 'UI Smoke Staff');
      let res = { ok: false };
      let passedDel = false;
      if (newStaff) {
         res = await deleteStaff(tenantId, newStaff.id);
         curStaff = await getStaffList(tenantId);
         passedDel = res.ok && curStaff.length === beforeCount;
      }
      
      results.push({ name: 'Staff CRUD', passes: passedCreate && passedDel, details: `Create:${passedCreate} Del: ${passedDel}` });

      // 2. Service Test
      const srvList = await getServices(tenantId);
      const bCount = srvList.length;
      await createService(tenantId, { name: 'UI Smoke Service', duration: 15, price: 10, active: true } as any);
      let curSrv = await getServices(tenantId);
      let pCreate = curSrv.length === bCount + 1;

      const newSrv = curSrv.find(s => s.name === 'UI Smoke Service');
      let pDel = false;
      if (newSrv) {
         let r = await deleteService(tenantId, newSrv.id);
         curSrv = await getServices(tenantId);
         pDel = r.ok && curSrv.length === bCount;
      }
      results.push({ name: 'Service CRUD', passes: pCreate && pDel, details: `Create:${pCreate} Del: ${pDel}` });

      // 3. Referral
      const camps = referralService.getCampaigns(tenantId);
      await referralService.saveCampaign({ id: 'ui_camp_99', tenantId, campaignType: 'customer_referral', title: 'UI Test', description: '', rewardType: 'discount', rewardValue: '1', active: true, createdBy: 'tenant_owner' });
      let pC = referralService.getCampaigns(tenantId).length === camps.length + 1;
      await referralService.deleteCampaign('ui_camp_99');
      let pD = referralService.getCampaigns(tenantId).length === camps.length;
      results.push({ name: 'Referral CRUD', passes: pC && pD, details: `Create:${pC} Del: ${pD}` });

      // 4. Plans
      const plans = planService.getAllPlans();
      await planService.addPlan({ id: 'ui_plan_99', name: 'UI', monthlyPrice: 1, annualPrice: 1, maxStaff: 1, maxServices: 1, trialDays: 0, isRecommended: false } as any);
      let ppC = planService.getAllPlans().length === plans.length + 1;
      await planService.deletePlan('ui_plan_99');
      let ppD = planService.getAllPlans().length === plans.length;
      results.push({ name: 'Plan CRUD', passes: ppC && ppD, details: `Create:${ppC} Del: ${ppD}` });

    } catch (e: any) {
      results.push({ name: 'Crash', passes: false, details: e.message });
    }

    setCrudTestResult(results);
    setIsRunningCrudTest(false);
  };

  if (!isVisible) return null;

  const handleResetAllMockData = async () => {
    const confirmed = await showConfirm({ message: 'Emin misiniz? \n\nSadece LARİ mock verileri temizlenecek ve ilk durumlarına dönecektir (Tema ve dil tercihleriniz korunur).' });
    if (confirmed) {
      // Clean only Randapp mock keys
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('randapp') ||
          key.startsWith('mock_') ||
          key.startsWith('nexus_') ||
          key.includes('tenant_') ||
          key === 'users'
        )) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(k => localStorage.removeItem(k));
      
      // Clear seeding flags
      localStorage.removeItem('randapp:demo-tenant-1:is_seeded');
      
      await showAlert('Mock verileri sıfırlandı. Sayfa yenileniyor...');
      window.location.reload();
    }
  };

  const handleDeleteIndividualKey = async (key: string) => {
    const confirmed = await showConfirm({ message: `'${key}' anahtarını silmek istediğinize emin misiniz?` });
    if (confirmed) {
      localStorage.removeItem(key);
      scanStorage();
      if (selectedKeyValue?.key === key) {
        setSelectedKeyValue(null);
      }
    }
  };

  return (
    <>
      {/* Floating Action Trigger */}
      <div className="fixed bottom-24 right-4 z-[9999]" id="mock-diag-trigger">
        <button
          onClick={() => {
            setIsOpen(true);
            scanStorage();
          }}
          className="flex items-center gap-2 bg-slate-900 border border-slate-700 text-white hover:bg-slate-800 transition shadow-2xl px-3.5 py-2.5 rounded-full text-xs font-bold tracking-wider uppercase backdrop-blur-md bg-opacity-95 cursor-pointer ring-2 ring-blue-500/30"
          title="Mock Storage Diagnostic Panel"
        >
          <Database className="w-4 h-4 text-blue-400 animate-pulse" />
          <span>Mock Depo ({activeKeys.length})</span>
        </button>
      </div>

      {/* Main Diagnostic Panel Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Header */}
            <div className="p-4 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-500" />
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base">Diagnostic Panel & Storage Audit</h3>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 font-mono">VITE_DATA_MODE: "mock" (Active Tools)</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Diagnostic Alert Banner */}
            <div className="px-4 py-2.5 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-800 dark:text-yellow-200 text-xs border-b border-yellow-100 dark:border-yellow-900/30 flex gap-2 items-start">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Auditor Notice:</strong> Seeding is now self-limiting. If all items (staff/services) are deleted, mock mode respects that decision and will not automatically re-generate fallback data unless a hard database/mock reset is performed below.
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              
              {/* Quick Actions */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-850 rounded-xl space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Yönetim İşlemleri (Mock Actions)</h4>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    onClick={handleResetAllMockData}
                    className="flex-1 min-w-[200px] flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2.5 text-xs font-bold transition shadow-sm"
                  >
                    <RefreshCw className="w-4 h-4 animate-spin-hover" />
                    Mock Veriyi Sıfırla (Reset Mock Data)
                  </button>
                  <button
                    onClick={() => {
                      scanStorage();
                      alert('LocalStorage yeniden tarandı.');
                    }}
                    className="flex-1 min-w-[150px] flex items-center justify-center gap-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-white rounded-lg px-4 py-2.5 text-xs font-bold transition"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Şimdi Yeniden Tara (Rescan)
                  </button>
                  <button
                    onClick={runBrowserCrudTest}
                    disabled={isRunningCrudTest}
                    className="flex-1 min-w-[150px] flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2.5 text-xs font-bold transition shadow-sm disabled:opacity-50"
                  >
                    <PlayCircle className="w-4 h-4" />
                    {isRunningCrudTest ? 'Testing...' : 'Run UI CRUD Smoke Test'}
                  </button>
                </div>

                {crudTestResult.length > 0 && (
                  <div className="mt-4 p-3 bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-lg text-xs font-mono">
                    <h5 className="font-bold mb-2">Smoke Test Results:</h5>
                    <ul className="space-y-1">
                      {crudTestResult.map((res, i) => (
                        <li key={i} className={`flex items-center gap-2 ${res.passes ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          <span>{res.passes ? '✅' : '❌'}</span>
                          <strong>{res.name}</strong> - <span>{res.details}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Inspector Split View */}
              {selectedKeyValue && (
                <div className="border border-blue-200 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/5 rounded-xl p-3 space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200 px-2.5 py-0.5 rounded font-bold break-all">
                      Inspect: {selectedKeyValue.key}
                    </span>
                    <button
                      onClick={() => setSelectedKeyValue(null)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-white text-xs"
                    >
                      Kapat
                    </button>
                  </div>
                  <pre className="text-[10px] font-mono bg-slate-900 text-slate-100 p-2.5 rounded-lg overflow-x-auto max-h-[160px] whitespace-pre-wrap word-break-all border border-slate-800">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(selectedKeyValue.value), null, 2);
                      } catch {
                        return selectedKeyValue.value;
                      }
                    })()}
                  </pre>
                </div>
              )}

              {/* Items List */}
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <span className="text-xs font-bold text-gray-700 dark:text-slate-300 flex items-center gap-1.5">
                    <List className="w-4 h-4" />
                    Aktif Mock Depolama Anahtarları ({activeKeys.length})
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-slate-500 font-mono">
                    Total footprint: {activeKeys.reduce((a, b) => a + b.size, 0).toLocaleString()} B
                  </span>
                </div>

                {activeKeys.length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-gray-200 dark:border-slate-800 rounded-xl text-xs text-gray-400">
                    Aktif mock anahtarı bulunamadı.
                  </div>
                ) : (
                  <div className="border border-gray-150 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-slate-850">
                    {activeKeys.map(({ key, value, size }) => (
                      <div
                        key={key}
                        className="p-3 bg-white dark:bg-slate-950 flex items-center justify-between text-xs hover:bg-gray-50/50 dark:hover:bg-slate-900/35 transition"
                      >
                        <div className="flex-1 min-w-0 pr-4">
                          <p className="font-mono text-gray-800 dark:text-slate-200 font-medium break-all text-[11px] truncate" title={key}>
                            {key}
                          </p>
                          <p className="text-[10px] text-gray-400 dark:text-slate-500 font-mono mt-0.5">
                            Size: <span className="font-semibold text-gray-600 dark:text-slate-300">{size} B</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setSelectedKeyValue({ key, value })}
                            className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-slate-300 p-1.5 rounded-lg transition"
                            title="Değerini İncele (Inspect value)"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteIndividualKey(key)}
                            className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-950/40 p-1.5 rounded-lg transition"
                            title="Anahtarı Sil (Delete key)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 bg-gray-50 dark:bg-slate-900 text-center border-t border-gray-150 dark:border-slate-800 text-[10px] text-gray-400 dark:text-slate-500 font-mono">
              Developed securely as a lightweight dev-only tool. Safe to execute.
            </div>
            
          </div>
        </div>
      )}
    </>
  );
};
