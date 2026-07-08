import { marketConfigService } from './marketConfigService';

export const domainResolverService = {
  parseHostname(hostname: string): { type: 'platform' | 'tenant' | 'custom', identifier?: string } {
    const market = marketConfigService.getCurrentMarketConfig();
    const primaryDomain = market.primaryDomain;
    const appDomain = market.appDomain;

    // Platform root
    if (hostname === primaryDomain || hostname === `www.${primaryDomain}`) {
      return { type: 'platform' };
    }

    // App/Admin domain
    if (hostname === appDomain) {
      return { type: 'platform' };
    }

    // Subdomain check
    if (hostname.endsWith(`.${primaryDomain}`)) {
      const slug = hostname.replace(`.${primaryDomain}`, '');
      if (slug !== 'www' && slug !== 'app') {
         return { type: 'tenant', identifier: slug };
      }
    }

    // Otherwise, treat as custom domain or local testing
    if (hostname === 'localhost' || hostname.includes('127.0.0.1')) {
       return { type: 'platform' }; 
    }

    return { type: 'custom', identifier: hostname };
  },

  isPlatformDomain(hostname: string): boolean {
    return this.parseHostname(hostname).type === 'platform';
  },

  extractTenantSlugFromSubdomain(hostname: string): string | null {
    const parsed = this.parseHostname(hostname);
    if (parsed.type === 'tenant' && parsed.identifier) {
      return parsed.identifier;
    }
    return null;
  },

  isCustomDomain(hostname: string): boolean {
    return this.parseHostname(hostname).type === 'custom';
  },

  getMarketFromHostname(hostname: string): string {
    // Already handled globally by marketConfigService, but keeping here for signature compat.
    if (hostname.includes('lari.app')) return 'global';
    if (hostname.includes('randevulari.com')) return 'tr';
    return 'tr';
  }
};
