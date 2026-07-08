export type LanguageCode = 'tr' | 'en' | 'de' | 'es' | 'fr' | 'it' | 'ar' | 'nl' | 'ru' | 'pt';

export interface LanguageConfig {
  languageCode: LanguageCode;
  displayName: string;
  nativeName: string;
  locale: string;
  direction: 'ltr' | 'rtl';
  enabled: boolean;
  marketAvailability: ('tr' | 'global')[];
}

export const supportedLanguages: Record<LanguageCode, LanguageConfig> = {
  tr: {
    languageCode: 'tr',
    displayName: 'Turkish',
    nativeName: 'Türkçe',
    locale: 'tr-TR',
    direction: 'ltr',
    enabled: true,
    marketAvailability: ['tr', 'global'],
  },
  en: {
    languageCode: 'en',
    displayName: 'English',
    nativeName: 'English',
    locale: 'en-US',
    direction: 'ltr',
    enabled: true,
    marketAvailability: ['global', 'tr'],
  },
  de: {
    languageCode: 'de',
    displayName: 'German',
    nativeName: 'Deutsch',
    locale: 'de-DE',
    direction: 'ltr',
    enabled: false,
    marketAvailability: ['global'],
  },
  es: {
    languageCode: 'es',
    displayName: 'Spanish',
    nativeName: 'Español',
    locale: 'es-ES',
    direction: 'ltr',
    enabled: false,
    marketAvailability: ['global'],
  },
  fr: {
    languageCode: 'fr',
    displayName: 'French',
    nativeName: 'Français',
    locale: 'fr-FR',
    direction: 'ltr',
    enabled: false,
    marketAvailability: ['global'],
  },
  it: {
    languageCode: 'it',
    displayName: 'Italian',
    nativeName: 'Italiano',
    locale: 'it-IT',
    direction: 'ltr',
    enabled: false,
    marketAvailability: ['global'],
  },
  ar: {
    languageCode: 'ar',
    displayName: 'Arabic',
    nativeName: 'العربية',
    locale: 'ar-SA',
    direction: 'rtl',
    enabled: false,
    marketAvailability: ['global'],
  },
  nl: {
    languageCode: 'nl',
    displayName: 'Dutch',
    nativeName: 'Nederlands',
    locale: 'nl-NL',
    direction: 'ltr',
    enabled: false,
    marketAvailability: ['global'],
  },
  ru: {
    languageCode: 'ru',
    displayName: 'Russian',
    nativeName: 'Русский',
    locale: 'ru-RU',
    direction: 'ltr',
    enabled: false,
    marketAvailability: ['global'],
  },
  pt: {
    languageCode: 'pt',
    displayName: 'Portuguese',
    nativeName: 'Português',
    locale: 'pt-PT',
    direction: 'ltr',
    enabled: false,
    marketAvailability: ['global'],
  }
};

export const getEnabledLanguages = () => {
  return Object.values(supportedLanguages).filter(lang => lang.enabled);
};

export const getLanguageConfig = (code: LanguageCode): LanguageConfig | undefined => {
  return supportedLanguages[code];
};
