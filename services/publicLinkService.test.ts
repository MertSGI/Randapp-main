import assert from 'node:assert/strict';
import { publicLinkService, RESERVED_SLUGS } from './publicLinkService.ts';
import { extractTenantSlugFromSegments } from './tenantService.ts';
import type { Tenant } from '../types.ts';

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  const id = overrides.id ?? 'aaaa1111-a1a1-41a1-81a1-aaaaaaaaaaaa';
  const name = overrides.name ?? 'Melis Güzellik';
  return {
    id,
    slug: 'melis-guzellik',
    name,
    status: 'active',
    createdAt: '2026-11-16T00:00:00Z',
    updatedAt: '2026-11-16T00:00:00Z',
    branding: {
      tenantId: id,
      businessName: name,
    },
    ...overrides,
  };
}

export async function runPublicLinkServiceTests(): Promise<void> {
  // 1. Slug normalization & reserved slug enforcement
  assert.equal(publicLinkService.normalizeSlug('Çiçek Güzellik Salonu!'), 'cicek-guzellik-salonu');
  assert.equal(publicLinkService.isReservedSlug('admin'), true);
  assert.equal(publicLinkService.isReservedSlug('melis-guzellik'), false);
  assert.ok(RESERVED_SLUGS.includes('login'));

  // 2. V1 direct storefront URLs remain independent of Discovery Marketplace activation
  const tenant = makeTenant();
  const whenMarketplaceOff = publicLinkService.resolveDirectStorefrontIndependence(tenant, {
    marketplaceEnabled: false,
    origin: 'https://randevulari.com',
    baseDomain: 'randevulari.com',
  });
  assert.equal(whenMarketplaceOff.marketplaceEnabled, false);
  assert.equal(whenMarketplaceOff.marketplaceRequired, false);
  assert.equal(whenMarketplaceOff.storefrontAccessibleWhenMarketplaceDisabled, true);
  assert.equal(whenMarketplaceOff.legacySUrl, 'https://randevulari.com/#/s/melis-guzellik');
  assert.equal(whenMarketplaceOff.directBookingUrl, 'https://randevulari.com/#/book?tenant=melis-guzellik');
  assert.equal(whenMarketplaceOff.subdomainUrl, 'https://melis-guzellik.randevulari.com');
  assert.equal(whenMarketplaceOff.discoveryUrl, null);

  const whenMarketplaceOn = publicLinkService.resolveDirectStorefrontIndependence(tenant, {
    marketplaceEnabled: true,
    origin: 'https://randevulari.com',
    baseDomain: 'randevulari.com',
  });
  assert.equal(whenMarketplaceOn.legacySUrl, whenMarketplaceOff.legacySUrl);
  assert.equal(whenMarketplaceOn.directBookingUrl, whenMarketplaceOff.directBookingUrl);
  assert.equal(whenMarketplaceOn.subdomainUrl, whenMarketplaceOff.subdomainUrl);
  assert.equal(whenMarketplaceOn.discoveryUrl, 'https://randevulari.com/#/discovery/melis-guzellik');

  // 3. Direct storefront helper variants (/s/:slug, /booking/:slug, subdomain, custom domain, ui=v2)
  assert.equal(
    publicLinkService.getDirectStorefrontUrl(tenant, {
      origin: 'http://127.0.0.1:4175',
      style: 'legacy_s',
      uiV2: true,
    }),
    'http://127.0.0.1:4175/#/s/melis-guzellik?ui=v2'
  );

  assert.equal(
    publicLinkService.getDirectStorefrontUrl(tenant, {
      origin: 'http://127.0.0.1:4175',
      style: 'booking',
      branchSlugOrId: 'nisantasi',
    }),
    'http://127.0.0.1:4175/#/booking/melis-guzellik?branch=nisantasi'
  );

  assert.equal(
    publicLinkService.getDirectStorefrontUrl(tenant, {
      preferSubdomain: true,
      baseDomain: 'randevulari.com',
    }),
    'https://melis-guzellik.randevulari.com'
  );

  const customDomainTenant = makeTenant({ customDomain: 'randevu.melissalon.com' });
  assert.equal(
    publicLinkService.getDirectStorefrontUrl(customDomainTenant),
    'https://randevu.melissalon.com'
  );

  // 4. URL segment extraction handles /s/:slug, /booking/:slug, /:slug and rejects reserved routes
  assert.equal(extractTenantSlugFromSegments('#/s/tenant_pilot_demo'), 'tenant_pilot_demo');
  assert.equal(extractTenantSlugFromSegments('#/s/melis-guzellik?ui=v2'), 'melis-guzellik');
  assert.equal(extractTenantSlugFromSegments('/s/tenant_pilot_demo'), 'tenant_pilot_demo');
  assert.equal(extractTenantSlugFromSegments('#/booking/tenant_pilot_demo?ui=v2'), 'tenant_pilot_demo');
  assert.equal(extractTenantSlugFromSegments('#/tenant_pilot_demo'), 'tenant_pilot_demo');
  assert.equal(extractTenantSlugFromSegments('#/discovery'), '');
  assert.equal(extractTenantSlugFromSegments('#/discovery/tenant_pilot_demo'), '');
  assert.equal(extractTenantSlugFromSegments('#/s'), '');

  console.log('[PASS] publicLinkService V1 storefront independence tests verified');
}

await runPublicLinkServiceTests();
