import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { translations } from '../utils/translations';
import { marketConfigService } from '../services/marketConfigService';

type Language = 'en' | 'tr';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof translations.en;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      // Check URL parameters first
      const searchParams = new URLSearchParams(window.location.search);
      const langParam = searchParams.get('lang');
      if (langParam === 'en' || langParam === 'tr') {
        localStorage.setItem('lari_selected_language', langParam);
        return langParam;
      }
      
      const stored = localStorage.getItem('lari_selected_language') || localStorage.getItem('randapp_language');
      if (stored === 'en' || stored === 'tr') return stored;
    } catch (e) {}
    
    // Check market config default
    try {
      const marketDefault = marketConfigService.getCurrentMarketConfig().defaultLanguage;
      if (marketDefault === 'en' || marketDefault === 'tr') return marketDefault as Language;
    } catch (e) {}

    return 'tr';
  });

  useEffect(() => {
    localStorage.setItem('lari_selected_language', language);
    // clean up legacy storage
    localStorage.removeItem('randapp_language');
    document.documentElement.lang = language;
  }, [language]);

  const value = {
    language,
    setLanguage,
    t: translations[language],
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};