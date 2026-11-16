const ISO_COUNTRY_CODES = [
  'DE', 'GB', 'US', 'RU', 'SA', 'AE', 'KW', 'QA', 'IQ', 'NL', 'BE', 'FR', 'CH', 'AT', 'AZ', 'TR', 'IT', 'ES', 'SE', 'NO', 'DK', 'FI', 'PL', 'CZ', 'UA', 'KZ', 'UZ', 'CA', 'AU'
];

const ISO_COUNTRY_SET = new Set(ISO_COUNTRY_CODES);

export interface LocalizedCountryOption {
  code: string;
  name: string;
}

function normalizeLocaleTag(lang: string | null | undefined): string {
  if (typeof lang !== 'string') return 'en';
  const trimmed = lang.trim();
  if (!trimmed || !/^[a-zA-Z]{2,3}(?:[-_][a-zA-Z0-9]{2,8})*$/.test(trimmed)) {
    return 'en';
  }
  return trimmed.replace(/_/g, '-');
}

/**
 * Returns localized country name options sorted alphabetically by localized name.
 */
export function getLocalizedCountries(lang: string): LocalizedCountryOption[] {
  const safeLang = normalizeLocaleTag(lang);
  let displayNames: Intl.DisplayNames | null = null;
  try {
    if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
      displayNames = new Intl.DisplayNames([safeLang], { type: 'region' });
    }
  } catch {
    displayNames = null;
  }

  return ISO_COUNTRY_CODES.map((code) => {
    let name = code;
    if (displayNames) {
      try {
        name = displayNames.of(code) || code;
      } catch {
        name = code;
      }
    }
    return { code, name };
  }).sort((a, b) => {
    try {
      return a.name.localeCompare(b.name, safeLang);
    } catch {
      return a.name.localeCompare(b.name, 'en');
    }
  });
}

/**
 * Normalizes a supported ISO alpha-2 country code, or returns null when empty/invalid.
 */
export function normalizeCountryCode(code: string | null | undefined): string | null {
  if (typeof code !== 'string') return null;
  const upper = code.trim().toUpperCase();
  return ISO_COUNTRY_SET.has(upper) ? upper : null;
}

/**
 * Returns localized display name for a supported ISO alpha-2 code (falls back safely to code).
 */
export function getCountryDisplayName(code: string, lang = 'en'): string {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return '';
  const safeLang = normalizeLocaleTag(lang);
  try {
    if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
      const displayNames = new Intl.DisplayNames([safeLang], { type: 'region' });
      return displayNames.of(normalized) || normalized;
    }
  } catch {
    // fallback to code
  }
  return normalized;
}

/**
 * Validates whether a country code is a supported ISO alpha-2 code or null/empty.
 */
export function isValidIsoCountryCode(code: string | null | undefined): boolean {
  if (code === null || code === undefined || code.trim() === '') return true;
  const upper = code.trim().toUpperCase();
  return ISO_COUNTRY_SET.has(upper);
}
