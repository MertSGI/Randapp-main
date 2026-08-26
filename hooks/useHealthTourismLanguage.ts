import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { HtLanguage, HtTranslationDictionary } from '../types/healthTourismPublic';
import { getHtTranslation } from '../utils/healthTourismTranslations';

const VALID_LANGUAGES: HtLanguage[] = ['tr', 'en', 'de', 'ru', 'ar'];
const LOCAL_STORAGE_KEY = 'ht_preferred_language';

/**
 * Validates and returns a valid HtLanguage or null
 */
export function parseValidHtLanguage(raw: string | null | undefined): HtLanguage | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase() as HtLanguage;
  if (VALID_LANGUAGES.includes(lower)) {
    return lower;
  }
  return null;
}

/**
 * Determines initial language based on:
 * 1. URL search param ?lang= (from react-router or window location)
 * 2. localStorage saved language
 * 3. Browser language
 * 4. Default 'en'
 */
function determineLanguage(searchParamsLang?: string | null): HtLanguage {
  try {
    const fromParam = parseValidHtLanguage(searchParamsLang);
    if (fromParam) return fromParam;

    if (typeof window !== 'undefined') {
      const windowParams = new URLSearchParams(window.location.search);
      const urlLang = parseValidHtLanguage(windowParams.get('lang'));
      if (urlLang) return urlLang;

      // Hash mode query check e.g. #/health-tourism?lang=de
      if (window.location.hash.includes('?')) {
        const hashQuery = window.location.hash.split('?')[1];
        const hashParams = new URLSearchParams(hashQuery);
        const hashLang = parseValidHtLanguage(hashParams.get('lang'));
        if (hashLang) return hashLang;
      }

      const savedLang = parseValidHtLanguage(localStorage.getItem(LOCAL_STORAGE_KEY));
      if (savedLang) return savedLang;

      const navLang = parseValidHtLanguage((navigator.language || '').slice(0, 2));
      if (navLang) return navLang;
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
  const [searchParams] = useSearchParams();
  const location = useLocation();

  // Extract lang param across BrowserRouter & HashRouter
  const langFromQuery = useMemo(() => {
    let raw = searchParams.get('lang');
    if (!raw && location.search) {
      const params = new URLSearchParams(location.search);
      raw = params.get('lang');
    }
    return parseValidHtLanguage(raw);
  }, [searchParams, location.search]);

  const [language, setLanguageState] = useState<HtLanguage>(() => determineLanguage(langFromQuery));

  // Sync when query param changes
  useEffect(() => {
    if (langFromQuery && langFromQuery !== language) {
      setLanguageState(langFromQuery);
    }
  }, [langFromQuery]);

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
