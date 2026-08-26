import { useState, useEffect, useMemo } from 'react';
import { HtLanguage, HtTranslationDictionary } from '../types/healthTourismPublic';
import { getHtTranslation } from '../utils/healthTourismTranslations';

const VALID_LANGUAGES: HtLanguage[] = ['tr', 'en', 'de', 'ru', 'ar'];
const LOCAL_STORAGE_KEY = 'ht_preferred_language';

/**
 * Determines initial language based on:
 * 1. URL search param ?lang=
 * 2. localStorage saved language
 * 3. Browser language
 * 4. Default 'en'
 */
function getInitialLanguage(): HtLanguage {
  try {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const urlLang = searchParams.get('lang')?.toLowerCase() as HtLanguage;
      if (urlLang && VALID_LANGUAGES.includes(urlLang)) {
        return urlLang;
      }

      const savedLang = localStorage.getItem(LOCAL_STORAGE_KEY)?.toLowerCase() as HtLanguage;
      if (savedLang && VALID_LANGUAGES.includes(savedLang)) {
        return savedLang;
      }

      const navLang = (navigator.language || '').slice(0, 2).toLowerCase() as HtLanguage;
      if (VALID_LANGUAGES.includes(navLang)) {
        return navLang;
      }
    }
  } catch (e) {
    // Ignore error
  }
  return 'en';
}

export interface UseHealthTourismLanguageResult {
  language: HtLanguage;
  setLanguage: (lang: HtLanguage) => void;
  t: HtTranslationDictionary;
  isRtl: boolean;
  supportedLanguages: { code: HtLanguage; label: string }[];
}

export function useHealthTourismLanguage(): UseHealthTourismLanguageResult {
  const [language, setLanguageState] = useState<HtLanguage>(getInitialLanguage);

  const setLanguage = (newLang: HtLanguage) => {
    if (VALID_LANGUAGES.includes(newLang)) {
      setLanguageState(newLang);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, newLang);
      } catch (e) {
        // Ignore storage write error
      }
    }
  };

  const isRtl = language === 'ar';

  const t = useMemo(() => {
    return getHtTranslation(language);
  }, [language]);

  const supportedLanguages = useMemo(
    () => [
      { code: 'tr' as HtLanguage, label: 'Türkçe' },
      { code: 'en' as HtLanguage, label: 'English' },
      { code: 'de' as HtLanguage, label: 'Deutsch' },
      { code: 'ru' as HtLanguage, label: 'Русский' },
      { code: 'ar' as HtLanguage, label: 'العربية' },
    ],
    []
  );

  return {
    language,
    setLanguage,
    t,
    isRtl,
    supportedLanguages,
  };
}
