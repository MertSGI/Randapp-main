import React from 'react';
import { useDialog } from '../../contexts/DialogContext';

const SuperAdminSettingsPage: React.FC = () => {
  const { alert: showAlert } = useDialog();

  const handleSave = () => {
    showAlert('Genel ayarlar mock ortamında geçici olarak kaydedildi.');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold dark:text-white">Platform Ayarları</h1>
        <button onClick={handleSave} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition">
           Kaydet
        </button>
      </div>
      
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-slate-700">
           <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Genel Ayarlar</h2>
           <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Platform Adı</label>
                <input type="text" className="w-full sm:max-w-md p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-white" defaultValue="LARİ" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Varsayılan Trial Süresi (Gün)</label>
                <input type="number" className="w-full sm:max-w-xs p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:text-white" defaultValue={14} />
              </div>
           </div>
        </div>

        <div className="p-6 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
           <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Özellik Geçişleri (Feature Toggles)</h2>
           <div className="space-y-3">
              <label className="flex items-center gap-3">
                 <input type="checkbox" defaultChecked className="w-4 h-4 text-indigo-600 rounded border-gray-300" />
                 <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Yapay Zeka (Gemini) Modülünü Tüm Kiracılar İçin Aktif Et</span>
              </label>
              <label className="flex items-center gap-3">
                 <input type="checkbox" defaultChecked className="w-4 h-4 text-indigo-600 rounded border-gray-300" />
                 <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Referans ve Puan Sistemini Tüm Kiracılar İçin Aktif Et</span>
              </label>
              <label className="flex items-center gap-3">
                 <input type="checkbox" defaultChecked className="w-4 h-4 text-indigo-600 rounded border-gray-300" />
                 <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Özel Domain Desteğini Aktif Et</span>
              </label>
           </div>
        </div>
      </div>
    </div>
  );
};
export default SuperAdminSettingsPage;
