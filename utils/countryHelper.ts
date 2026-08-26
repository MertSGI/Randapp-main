const ISO_COUNTRY_CODES = [
  'DE', 'GB', 'US', 'RU', 'SA', 'AE', 'KW', 'QA', 'IQ', 'NL', 'BE', 'FR', 'CH', 'AT', 'AZ', 'TR', 'IT', 'ES', 'SE', 'NO', 'DK', 'FI', 'PL', 'CZ', 'UA', 'KZ', 'UZ', 'CA', 'AU'
];

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
 * Validates whether a country code is a valid 2-letter uppercase ISO alpha-2 code or null/empty.
 */
export function isValidIsoCountryCode(code: string | null | undefined): boolean {
  if (!code) return true;
  return /^[A-Z]{2}$/.test(code.trim());
}
