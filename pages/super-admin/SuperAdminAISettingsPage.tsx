import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';

const SuperAdminAISettingsPage: React.FC = () => {
    const { language } = useLanguage();
    const [settings, setSettings] = useState(() => {
        const stored = localStorage.getItem('randapp_ai_settings');
        return stored ? JSON.parse(stored) : {
            aiProvider: 'mock',
            systemPrompt: 'You are an AI Style Advisor. Maintain a professional, polite tone. Recommend suitable salon services based on user requests.',
            disclaimerText: 'Premium AI feature is securely processed in our backend. Your data is minimally processed and not used for model training.',
            enableAiRecommendation: true,
            enableAiVisualization: true,
            enableImageGeneration: false,
            safeMode: true,
            doNotUseCustomerMemoryPhotos: true,
            dataRetentionNote: 'Images are deleted immediately after processing.'
        };
    });

    const [saved, setSaved] = useState(false);

    const handleSave = () => {
        localStorage.setItem('randapp_ai_settings', JSON.stringify(settings));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="p-8 max-w-4xl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {language === 'tr' ? 'Platform AI Ayarları (Mock Governance)' : 'Platform AI Settings (Mock Governance)'}
            </h2>
            <p className="text-sm text-gray-500 mb-6">
                {language === 'tr' 
                 ? 'AI özelliklerini tüm kiracılar (tenants) için kontrol edin. Canlı prodüksiyonda, API kimlik bilgileri sadece Edge Functions katmanında bulunur ve frontend\'e sızmaz.'
                 : 'Control AI features for all tenants globally. In production, API credentials exist only in the Edge Functions layer and are never exposed to the frontend.'}
            </p>

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 space-y-6">
                
                <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        {language === 'tr' ? 'AI Sağlayıcısı' : 'AI Provider'}
                    </label>
                    <select 
                       className="w-full rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-2 text-sm dark:text-white"
                       value={settings.aiProvider}
                       onChange={e => setSettings({...settings, aiProvider: e.target.value})}
                    >
                        <option value="mock">Mock / Edge Placeholder</option>
                        <option value="gemini" disabled>Gemini (Backend Edge Function Only)</option>
                    </select>
                    <p className="text-xs text-amber-600 mt-1">
                        {language === 'tr' ? 'Not: API anahtarı ayarları yalnızca backend (.env / Supabase Secrets) üzerinden yapılandırılır.' : 'Note: API key settings are only configured via backend (.env / Supabase Secrets).'}
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        {language === 'tr' ? 'Sistem Promptu (Varsayılan)' : 'System Prompt (Default)'}
                    </label>
                    <textarea 
                       className="w-full rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-3 text-sm dark:text-white"
                       rows={3}
                       value={settings.systemPrompt}
                       onChange={e => setSettings({...settings, systemPrompt: e.target.value})}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{language === 'tr' ? 'AI Tavsiye Etkin' : 'AI Recommendation Enabled'}</h4>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={settings.enableAiRecommendation} onChange={e => setSettings({...settings, enableAiRecommendation: e.target.checked})} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-accent"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{language === 'tr' ? 'AI Görselleştirme Etkin (Premium)' : 'AI Visualization Enabled (Premium)'}</h4>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={settings.enableAiVisualization} onChange={e => setSettings({...settings, enableAiVisualization: e.target.checked})} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-accent"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{language === 'tr' ? 'Güvenli Mod (KVKK)' : 'Safe Mode (Privacy)'}</h4>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={settings.safeMode} onChange={e => setSettings({...settings, safeMode: e.target.checked})} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-accent"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{language === 'tr' ? 'Müşteri Fotoğraflarını Blokla' : 'Block Customer Memory Photos'}</h4>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={settings.doNotUseCustomerMemoryPhotos} onChange={e => setSettings({...settings, doNotUseCustomerMemoryPhotos: e.target.checked})} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-accent"></div>
                        </label>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        {language === 'tr' ? 'Müşteri Yasal Uyarı Metni (Disclaimer)' : 'Customer Disclaimer Text'}
                    </label>
                    <input 
                       type="text"
                       className="w-full rounded-md border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-2 text-sm dark:text-white"
                       value={settings.disclaimerText}
                       onChange={e => setSettings({...settings, disclaimerText: e.target.value})}
                    />
                </div>

                <div className="pt-4 border-t border-gray-200 dark:border-slate-700">
                    <button onClick={handleSave} className="bg-accent text-white px-6 py-2 rounded-md font-medium hover:bg-blue-600">
                        {language === 'tr' ? 'Kaydet' : 'Save Settings'}
                    </button>
                    {saved && <span className="ml-4 text-green-600 text-sm">{language === 'tr' ? 'Doğrulandı ve Kaydedildi!' : 'Saved successfully!'}</span>}
                </div>
            </div>
        </div>
    );
};

export default SuperAdminAISettingsPage;

