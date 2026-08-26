import { HtSourceChannel } from '../types/healthTourism';

/**
 * UUID v4 format validator
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates whether a string is a valid UUID
 */
export function isValidUuid(id: string | null | undefined): boolean {
  if (!id) return false;
  return UUID_REGEX.test(id.trim());
}

/**
 * Extracts referring agency ID from URL search parameters if valid UUID.
 * If an agency query param is present but malformed, returns null.
 */
export function extractReferringAgencyId(searchParams: URLSearchParams | string): string | null {
  const params = typeof searchParams === 'string' ? new URLSearchParams(searchParams) : searchParams;
  const agencyParam = params.get('agency') || params.get('referring_agency_id') || params.get('ref_agency');
  if (agencyParam && isValidUuid(agencyParam)) {
    return agencyParam.trim();
  }
  return null;
}

/**
 * Detects if an invalid/malformed agency referral parameter was provided in URL search parameters.
 */
export function hasInvalidAgencyReferral(searchParams: URLSearchParams | string): boolean {
  const params = typeof searchParams === 'string' ? new URLSearchParams(searchParams) : searchParams;
  const agencyParam = params.get('agency') || params.get('referring_agency_id') || params.get('ref_agency');
  if (agencyParam && !isValidUuid(agencyParam)) {
    return true;
  }
  return false;
}

/**
 * Deterministically maps public URL context into valid HtSourceChannel across BrowserRouter & HashRouter modes.
 */
export function extractSourceChannel(url: string, referrer: string = ''): HtSourceChannel {
  try {
    let searchString = '';
    if (url.includes('?')) {
      searchString = url.slice(url.indexOf('?'));
    }
    
    // Hash mode check e.g. /#/health-tourism?utm_source=facebook
    if (!searchString && url.includes('#') && url.includes('?')) {
      searchString = url.slice(url.indexOf('?'));
    }

    const searchParams = new URLSearchParams(searchString);
    const utmSource = (searchParams.get('utm_source') || '').toLowerCase();
    const utmMedium = (searchParams.get('utm_medium') || '').toLowerCase();
    const gclid = searchParams.get('gclid');
    const agencyId = extractReferringAgencyId(searchParams);

    // 1. Agency Referral if agency ID query param present and valid
    if (agencyId) {
      return 'agency_referral';
    }

    // 2. Paid Search (Google Ads gclid or explicit paid/cpc/ppc utm)
    if (gclid || utmMedium === 'cpc' || utmMedium === 'ppc' || utmMedium === 'paid_search' || utmSource === 'google-ads') {
      return 'paid_search';
    }

    // 3. Social Media
    const socialSources = ['facebook', 'instagram', 'twitter', 'x', 'linkedin', 'tiktok', 'youtube', 'pinterest'];
    if (socialSources.includes(utmSource) || utmMedium === 'social' || utmMedium === 'social_paid') {
      return 'social';
    }

    // 4. Organic Search
    if (utmMedium === 'organic') {
      return 'organic';
    }

    const lowerReferrer = referrer.toLowerCase();
    if (lowerReferrer) {
      const searchEngines = ['google.com', 'bing.com', 'yahoo.com', 'duckduckgo.com', 'yandex.com', 'yandex.ru'];
      if (searchEngines.some((se) => lowerReferrer.includes(se))) {
        return 'organic';
      }
    }

    // 5. Direct or Default Web
    if (!referrer && !utmSource && !utmMedium) {
      return 'direct';
    }

    return 'web';
  } catch (e) {
    return 'web';
  }
}
