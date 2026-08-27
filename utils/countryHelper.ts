const ISO_COUNTRY_CODES = [
  'DE', 'GB', 'US', 'RU', 'SA', 'AE', 'KW', 'QA', 'IQ', 'NL', 'BE', 'FR', 'CH', 'AT', 'AZ', 'TR', 'IT', 'ES', 'SE', 'NO', 'DK', 'FI', 'PL', 'CZ', 'UA', 'KZ', 'UZ', 'CA', 'AU'
];

const ISO_COUNTRY_SET = new Set(ISO_COUNTRY_CODES);

export interface LocalizedCountryOption {
  code: string;
  name: string;
}

/**
 * Returns localized country name options sorted alphabetically by localized name.
 */
export function getLocalizedCountries(lang: string): LocalizedCountryOption[] {
  let displayNames: Intl.DisplayNames | null = null;
  try {
    if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
      displayNames = new Intl.DisplayNames([lang], { type: 'region' });
    }
  } catch (e) {
    displayNames = null;
  }

  return ISO_COUNTRY_CODES.map((code) => {
    let name = code;
    if (displayNames) {
      try {
        name = displayNames.of(code) || code;
      } catch (e) {
        name = code;
      }
    }
    return { code, name };
  }).sort((a, b) => a.name.localeCompare(b.name, lang));
}

/**
 * Validates whether a country code is a supported ISO alpha-2 code or null/empty.
 */
export function isValidIsoCountryCode(code: string | null | undefined): boolean {
  if (code === null || code === undefined || code.trim() === '') return true;
  const upper = code.trim().toUpperCase();
  return ISO_COUNTRY_SET.has(upper);
}
