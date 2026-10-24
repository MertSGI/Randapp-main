import { marketConfigService } from './marketConfigService';

export type DomainType = 'platform' | 'tenant' | 'custom' | 'invalid';

export interface ParsedHostnameResult {
  type: DomainType;
  identifier?: string;
  normalizedHostname: string;
  reason?: string;
}

export interface RouteResolutionResult {
  tenantSlug: string | null;
  branchSlug: string | null;
  isPlatform: boolean;
  isPreview: boolean;
  normalizedPath: string;
}

const RESERVED_SLUGS = new Set([
  'www',
  'app',
  'api',
  'admin',
  'super-admin',
  'mail',
  'smtp',
  'static',
  'assets',
  'cdn',
  'auth',
  'login',
  'pilot',
  'demo',
  'booking',
  'appointment',
  'book'
]);

export const domainResolverService = {
  // Normalize hostname: lowercase, trim, remove port, strip trailing dot
  normalizeHostname(rawHostname: string): string {
    if (!rawHostname || typeof rawHostname !== 'string') return '';
    let host = rawHostname.trim().toLowerCase();
    
    // Remove protocol if accidentally passed
    if (host.includes('://')) {
      try {
        host = new URL(host).hostname;
      } catch {
        host = host.split('://')[1] || host;
      }
    }

    // Strip port
    if (host.includes(':')) {
      host = host.split(':')[0];
    }

    // Strip trailing dot if present (FQDN)
    if (host.endsWith('.')) {
      host = host.slice(0, -1);
    }

    return host;
  },

  // Validate hostname against RFC 1123 DNS standards to prevent host header injection
  isValidHostname(hostname: string): boolean {
    if (!hostname || hostname.length > 253) return false;
    
    // Reject control characters, whitespace, traversal, quotes, semicolons
    if (/[\s\r\n\0\t/\\<>;:"'`$*]/.test(hostname)) {
      return false;
    }

    // Check individual DNS labels
    const labels = hostname.split('.');
    for (const label of labels) {
      if (!label || label.length > 63) return false;
      // Labels must be alphanumeric + hyphens, cannot start or end with hyphen
      if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) {
        return false;
      }
    }

    return true;
  },

  parseHostname(rawHostname: string): ParsedHostnameResult {
    const normalized = this.normalizeHostname(rawHostname);

    // Malicious or malformed host detection
    if (!this.isValidHostname(normalized)) {
      return {
        type: 'invalid',
        normalizedHostname: normalized,
        reason: 'MALICIOUS_OR_INVALID_HOSTNAME'
      };
    }

    const market = marketConfigService.getCurrentMarketConfig();
    const primaryDomain = market.primaryDomain.toLowerCase();
    const appDomain = market.appDomain.toLowerCase();

    // Local / dev environment check
    if (normalized === 'localhost' || normalized === '127.0.0.1' || normalized.endsWith('.localhost')) {
      return { type: 'platform', normalizedHostname: normalized };
    }

    // Cloud Run / container default domains
    if (normalized.endsWith('.run.app') || normalized.endsWith('.pages.dev') || normalized.endsWith('.vercel.app')) {
      return { type: 'platform', normalizedHostname: normalized };
    }

    // Platform root (e.g. randevulari.com, www.randevulari.com)
    if (normalized === primaryDomain || normalized === `www.${primaryDomain}`) {
      return { type: 'platform', normalizedHostname: normalized };
    }

    // App/Admin domain (e.g. app.randevulari.com)
    if (normalized === appDomain) {
      return { type: 'platform', normalizedHostname: normalized };
    }

    // Subdomain check (e.g. salon-nexus.randevulari.com)
    if (normalized.endsWith(`.${primaryDomain}`)) {
      const slug = normalized.slice(0, normalized.length - primaryDomain.length - 1);
      
      // Multi-level subdomains or reserved words are not tenant slugs
      if (slug.includes('.') || RESERVED_SLUGS.has(slug)) {
        return { type: 'platform', normalizedHostname: normalized };
      }

      return { type: 'tenant', identifier: slug, normalizedHostname: normalized };
    }

    // Global market check (e.g. *.lari.app)
    if (normalized.endsWith('.lari.app')) {
      const slug = normalized.replace('.lari.app', '');
      if (!slug.includes('.') && !RESERVED_SLUGS.has(slug)) {
        return { type: 'tenant', identifier: slug, normalizedHostname: normalized };
      }
      return { type: 'platform', normalizedHostname: normalized };
    }

    // Otherwise, treat as potential custom domain
    return { type: 'custom', identifier: normalized, normalizedHostname: normalized };
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
    const normalized = this.normalizeHostname(hostname);
    if (normalized.includes('lari.app')) return 'global';
    if (normalized.includes('randevulari.com')) return 'tr';
    return 'tr';
  },

  // Resolve tenant and branch context from hostname + path + query parameters
  resolveRouteTarget(
    hostname: string,
    pathname: string,
    searchParams?: URLSearchParams
  ): RouteResolutionResult {
    const parsedHost = this.parseHostname(hostname);
    let tenantSlug: string | null = parsedHost.type === 'tenant' ? (parsedHost.identifier || null) : null;
    let branchSlug: string | null = searchParams?.get('branch') || null;
    let isPreview = false;

    // Clean normalized pathname
    let cleanPath = pathname.trim();
    if (cleanPath.startsWith('#')) {
      cleanPath = cleanPath.slice(1);
    }
    if (cleanPath.includes('?')) {
      cleanPath = cleanPath.split('?')[0];
    }
    if (!cleanPath.startsWith('/')) {
      cleanPath = `/${cleanPath}`;
    }

    // Check preview routes
    if (cleanPath.startsWith('/admin/site-preview') || cleanPath.startsWith('/super-admin/tenant-preview')) {
      isPreview = true;
      const previewTenant = searchParams?.get('tenant') || cleanPath.split('/')[3];
      if (previewTenant) {
        tenantSlug = previewTenant;
      }
    }

    const segments = cleanPath.split('/').filter(Boolean);

    // If tenant was resolved from subdomain, check path for branch context
    if (tenantSlug) {
      if (segments.length >= 1 && !RESERVED_SLUGS.has(segments[0])) {
        // e.g. nexus.randevulari.com/kadikoy
        branchSlug = branchSlug || segments[0];
      }
    } else {
      // Dynamic path-based tenant extraction if not resolved from subdomain
      if (segments[0] === 'booking' && segments[1]) {
        tenantSlug = segments[1];
        if (segments[2]) {
          branchSlug = branchSlug || segments[2];
        }
      } else if (segments.length === 1 && !RESERVED_SLUGS.has(segments[0])) {
        // e.g. /nexus-studio
        tenantSlug = segments[0];
      } else if (segments.length === 2 && !RESERVED_SLUGS.has(segments[0])) {
        // e.g. /nexus-studio/kadikoy
        tenantSlug = segments[0];
        branchSlug = branchSlug || segments[1];
      }
    }

    return {
      tenantSlug,
      branchSlug,
      isPlatform: parsedHost.type === 'platform',
      isPreview,
      normalizedPath: cleanPath
    };
  }
};
