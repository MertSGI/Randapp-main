import { Tenant, TenantBranding, Service, Staff, BusinessBranch, SalonBusinessProfile } from '../types';

export const MELIS_FIXTURE_TENANT_ID = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
export const MELIS_FIXTURE_SLUG = 'melis-guzellik';

const BLOCKED_HOSTS = new Set([
  'randevulari.com',
  'www.randevulari.com',
  'lari-staging.vercel.app'
]);

export function isUiV2PreviewHost(hostname: string): boolean {
  if (BLOCKED_HOSTS.has(hostname.toLowerCase())) {
    return false;
  }
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1') {
    return true;
  }
  if (h.endsWith('.vercel.app')) {
    return true;
  }
  return false;
}

export function isMelisFixtureEligible(slug: string, hostname: string): boolean {
  if (slug !== MELIS_FIXTURE_SLUG) {
    return false;
  }
  return isUiV2PreviewHost(hostname);
}

export const MELIS_FIXTURE_TENANT: Tenant = {
  id: MELIS_FIXTURE_TENANT_ID,
  slug: MELIS_FIXTURE_SLUG,
  name: 'Melis Güzellik & Nail Art',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  publicSiteStatus: 'published',
};

export const MELIS_FIXTURE_BRANDING: TenantBranding = {
  tenantId: MELIS_FIXTURE_TENANT_ID,
  businessName: 'Melis Güzellik & Nail Art',
};

export const MELIS_FIXTURE_BUSINESS_PROFILE: SalonBusinessProfile = {
  tenantId: MELIS_FIXTURE_TENANT_ID,
  shortDescription: 'Professional Nail Art, Manicure, and Pedicure salon in Istanbul.',
  isPublicProfileEnabled: true,
};

export const MELIS_FIXTURE_PRIMARY_BRANCH: BusinessBranch = {
  id: 'b0000000-0000-0000-0000-000000000001',
  tenantId: MELIS_FIXTURE_TENANT_ID,
  name: 'Melis Güzellik Merkez Şube',
  slug: 'merkez',
  isActive: true,
  isPrimary: true,
  timezone: 'Europe/Istanbul',
};

export const MELIS_FIXTURE_SERVICES: Service[] = [
  {
    id: '00000000-0000-0000-0000-000000000011',
    name: 'Premium Nail Art',
    duration: 60,
    price: 350,
    active: true,
    category: 'Nail Art',
  },
  {
    id: '00000000-0000-0000-0000-000000000022',
    name: 'Klasik Manikür',
    duration: 30,
    price: 180,
    active: true,
    category: 'Manicure',
  },
  {
    id: '00000000-0000-0000-0000-000000000033',
    name: 'Spa Pedikür',
    duration: 45,
    price: 250,
    active: true,
    category: 'Pedicure',
  },
  {
    id: 'fdc4b301-26ec-40c1-a521-5a864766fbc5',
    name: 'Staging Blowdry',
    duration: 30,
    price: 120,
    active: true,
  },
];

export const MELIS_FIXTURE_STAFF: Staff[] = [
  {
    id: '55555555-5555-5555-5555-555555555555',
    name: 'Melis G.',
    title: 'Nail Specialist & Owner',
    active: true,
    isOwner: true,
    services: [
      '00000000-0000-0000-0000-000000000011',
      '00000000-0000-0000-0000-000000000022',
    ],
  },
  {
    id: '66666666-6666-6666-6666-666666666666',
    name: 'Buse S.',
    title: 'Esthetician',
    active: true,
    isOwner: false,
    services: [
      '00000000-0000-0000-0000-000000000022',
      '00000000-0000-0000-0000-000000000033',
    ],
  },
  {
    id: '6234e7a1-9788-4f04-aa56-54d05c1fafb7',
    name: 'Selin Uzman',
    title: 'Staging Specialist',
    active: true,
    isOwner: false,
    branchId: 'b0000000-0000-0000-0000-000000000001',
    services: [
      'fdc4b301-26ec-40c1-a521-5a864766fbc5',
    ],
  },
];
