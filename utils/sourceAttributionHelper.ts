import { HtSourceChannel } from '../types/healthTourism';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string | null | undefined): boolean {
  if (!id) return false;
  return UUID_REGEX.test(id.trim());
}

export function extractReferringAgencyId(searchParams: URLSearchParams | string): string | null {
  const params = typeof searchParams === 'string' ? new URLSearchParams(searchParams) : searchParams;
  const agencyParam = params.get('agency') || params.get('referring_agency_id') || params.get('ref_agency');
  if (agencyParam && isValidUuid(agencyParam)) {
    return agencyParam.trim();
  }
  return null;
}

export function hasInvalidAgencyReferral(searchParams: URLSearchParams | string): boolean {
  const params = typeof searchParams === 'string' ? new URLSearchParams(searchParams) : searchParams;
  const agencyParam = params.get('agency') || params.get('referring_agency_id') || params.get('ref_agency');
  if (agencyParam && !isValidUuid(agencyParam)) {
    return true;
  }
  return false;
}

export function extractSourceChannel(url: string, referrer: string = ''): HtSourceChannel {
  try {
    let searchString = '';
    if (url.includes('?')) {
      searchString = url.slice(url.indexOf('?'));
    }

    if (!searchString && url.includes('#') && url.includes('?')) {
      searchString = url.slice(url.indexOf('?'));
    }

    const searchParams = new URLSearchParams(searchString);
    const utmSource = (searchParams.get('utm_source') || '').toLowerCase();
    const utmMedium = (searchParams.get('utm_medium') || '').toLowerCase();
    const gclid = searchParams.get('gclid');
    const agencyId = extractReferringAgencyId(searchParams);

    if (agencyId) {
      return 'agency_referral';
    }

    if (gclid || utmMedium === 'cpc' || utmMedium === 'ppc' || utmMedium === 'paid_search' || utmSource === 'google-ads') {
      return 'paid_search';
    }

    const socialSources = ['facebook', 'instagram', 'twitter', 'x', 'linkedin', 'tiktok', 'youtube', 'pinterest'];
    if (socialSources.includes(utmSource) || utmMedium === 'social' || utmMedium === 'social_paid') {
      return 'social';
    }

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

    if (!referrer && !utmSource && !utmMedium) {
      return 'direct';
    }

    return 'web';
  } catch {
    return 'web';
  }
}
