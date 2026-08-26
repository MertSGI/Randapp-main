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
 * Extracts referring agency ID from URL search parameters if valid UUID
 */
export function extractReferringAgencyId(searchParams: URLSearchParams): string | null {
  const agencyParam = searchParams.get('agency') || searchParams.get('referring_agency_id') || searchParams.get('ref_agency');
  if (agencyParam && isValidUuid(agencyParam)) {
    return agencyParam.trim();
  }
  return null;
}

/**
 * Deterministically maps public URL context into valid HtSourceChannel
 */
export function extractSourceChannel(url: string, referrer: string = ''): HtSourceChannel {
  try {
    const urlObj = new URL(url, 'http://localhost');
    const searchParams = urlObj.searchParams;
    const utmSource = (searchParams.get('utm_source') || '').toLowerCase();
    const utmMedium = (searchParams.get('utm_medium') || '').toLowerCase();
    const gclid = searchParams.get('gclid');
    const agencyId = extractReferringAgencyId(searchParams);

    // 1. Agency Referral if agency ID query param present
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
