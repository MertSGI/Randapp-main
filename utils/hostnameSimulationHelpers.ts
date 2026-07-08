import { domainResolverService } from '../services/domainResolverService';

export const hostnameSimulationHelpers = {
  /**
   * Retrieves the currently simulated hostname for testing and QA validation.
   * If none is set, defaults to the actual window hostname.
   */
  getSimulatedHostname(): string {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('lari_simulated_hostname');
      if (stored) return stored;
      return window.location.hostname;
    }
    return 'localhost';
  },

  /**
   * Overrides the current runtime simulation hostname.
   */
  setSimulatedHostname(hostname: string): void {
    if (typeof window !== 'undefined') {
      if (hostname) {
        localStorage.setItem('lari_simulated_hostname', hostname);
      } else {
        localStorage.removeItem('lari_simulated_hostname');
      }
    }
  },

  /**
   * Clears any active simulated hostname override.
   */
  clearSimulatedHostname(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('lari_simulated_hostname');
    }
  },

  /**
   * Helper to format a virtual subdomain url string for Turkey/Global markets.
   */
  simulateSubdomain(slug: string, domain = 'randevulari.com'): string {
    return `${slug}.${domain}`;
  },

  /**
   * Helper to format a virtual custom domain hostname string.
   */
  simulateCustomDomain(domain: string): string {
    return domain;
  },

  /**
   * Helper to format a virtual platform domain root hostname.
   */
  simulatePlatformRoot(domain = 'randevulari.com'): string {
    return domain;
  },

  /**
   * Performs an isolated domainResolverService lookup on a target hostname
   * to trace the validation pipeline.
   */
  testResolution(hostname: string) {
    const parsed = domainResolverService.parseHostname(hostname);
    return {
      hostname,
      type: parsed.type,
      identifier: parsed.identifier,
      slug: domainResolverService.extractTenantSlugFromSubdomain(hostname),
      isPlatform: domainResolverService.isPlatformDomain(hostname),
      isCustom: domainResolverService.isCustomDomain(hostname)
    };
  }
};
