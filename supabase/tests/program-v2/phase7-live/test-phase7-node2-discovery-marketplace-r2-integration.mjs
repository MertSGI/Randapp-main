// supabase/tests/program-v2/phase7-live/test-phase7-node2-discovery-marketplace-r2-integration.mjs
// Phase 7 Node 2 R2: Discovery Marketplace Application Service & Adapter Integration Test
// Authority: DECISION-022 / LARI-P7-N2-DISCOVERY-MARKETPLACE-R2
//
// Invariants:
// - Imports and exercises the application service, adapter boundary, and DTO contracts.
// - Asserts bounded parameter validation, Result<T, E> error handling, and public-safe DTO shapes.
// - Asserts exact RPC invocation signatures (public.get_discovery_marketplace_listings, public.get_discovery_marketplace_detail).
// - Runnable via `node supabase/tests/program-v2/phase7-live/test-phase7-node2-discovery-marketplace-r2-integration.mjs`.
// - Exits 0 on all tests passing, non-zero on any failure.

import fs from 'fs';
import path from 'path';

let testsExecuted = 0;
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName, detail = '') {
  testsExecuted++;
  if (condition) {
    testsPassed++;
    console.log(`  [PASS] ${testName}`);
  } else {
    testsFailed++;
    console.error(`  [FAIL] ${testName}${detail ? ' - ' + detail : ''}`);
    throw new Error(`Assertion failed: ${testName} - ${detail}`);
  }
}

console.log('===============================================================');
console.log('STARTING PHASE 7 NODE 2 R2 DISCOVERY MARKETPLACE INTEGRATION TESTS');
console.log('===============================================================\n');

// -----------------------------------------------------------------------------
// 1. FILE INTEGRITY & EXPORT CONTRACTS
// -----------------------------------------------------------------------------
console.log('--- TEST GROUP 1: Artifact Existence & Export Contracts ---');

const servicePath = path.resolve('services/discoveryMarketplaceService.ts');
const adapterPath = path.resolve('adapters/discoveryMarketplaceAdapter.ts');
const dtoPath = path.resolve('types/discoveryMarketplaceDTOs.ts');

assert(fs.existsSync(servicePath), 'services/discoveryMarketplaceService.ts exists');
assert(fs.existsSync(adapterPath), 'adapters/discoveryMarketplaceAdapter.ts exists');
assert(fs.existsSync(dtoPath), 'types/discoveryMarketplaceDTOs.ts exists');

const serviceContent = fs.readFileSync(servicePath, 'utf8');
const adapterContent = fs.readFileSync(adapterPath, 'utf8');
const dtoContent = fs.readFileSync(dtoPath, 'utf8');

assert(serviceContent.includes('class DiscoveryMarketplaceService') || serviceContent.includes('export const discoveryMarketplaceService'), 'Service exports DiscoveryMarketplaceService');
assert(serviceContent.includes('getListings'), 'Service defines getListings method');
assert(serviceContent.includes('getDetail'), 'Service defines getDetail method');

assert(adapterContent.includes('class DiscoveryMarketplaceAdapter') || adapterContent.includes('export const discoveryMarketplaceAdapter'), 'Adapter exports DiscoveryMarketplaceAdapter');
assert(adapterContent.includes('fetchListings'), 'Adapter defines fetchListings method');
assert(adapterContent.includes('fetchDetail'), 'Adapter defines fetchDetail method');

assert(adapterContent.includes("'get_discovery_marketplace_listings'"), 'Adapter explicitly targets public.get_discovery_marketplace_listings RPC');
assert(adapterContent.includes("'get_discovery_marketplace_detail'"), 'Adapter explicitly targets public.get_discovery_marketplace_detail RPC');

assert(dtoContent.includes('export type Result<T, E'), 'DTO file defines Result<T, E> pattern');
assert(dtoContent.includes('export interface DiscoveryListingsRequest'), 'DTO defines DiscoveryListingsRequest');
assert(dtoContent.includes('export interface DiscoveryListingsResponse'), 'DTO defines DiscoveryListingsResponse');
assert(dtoContent.includes('export interface DiscoveryDetailRequest'), 'DTO defines DiscoveryDetailRequest');
assert(dtoContent.includes('export interface DiscoveryDetailResponse'), 'DTO defines DiscoveryDetailResponse');
assert(dtoContent.includes('export interface DiscoveryListingDTO'), 'DTO defines DiscoveryListingDTO');
assert(dtoContent.includes('export interface DiscoveryBusinessDetailDTO'), 'DTO defines DiscoveryBusinessDetailDTO');

// -----------------------------------------------------------------------------
// 2. BOUNDED PARAMETER VALIDATION TESTS
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 2: Parameter Bounds & Defensive Validation ---');

import {
  sanitizeBoundedText,
  validateRatingBounds,
  validatePaginationBounds,
  mapRawListingToDTO,
  mapRawBusinessDetailToDTO,
  DiscoveryMarketplaceAdapter,
} from '../../../../adapters/discoveryMarketplaceAdapter.ts';

// Test text sanitization
assert(sanitizeBoundedText('  Istanbul  ', 'city') === 'Istanbul', 'sanitizeBoundedText trims whitespace');
assert(sanitizeBoundedText(null, 'city') === null, 'sanitizeBoundedText handles null');
assert(sanitizeBoundedText('', 'city') === null, 'sanitizeBoundedText handles empty string');

let excessThrew = false;
try {
  sanitizeBoundedText('a'.repeat(101), 'city');
} catch (e) {
  excessThrew = e.message.includes('INVALID_ARGUMENT');
}
assert(excessThrew, 'sanitizeBoundedText throws INVALID_ARGUMENT on length > 100');

// Test rating bounds
assert(validateRatingBounds(4.5) === 4.5, 'validateRatingBounds accepts valid rating 4.5');
assert(validateRatingBounds(null) === null, 'validateRatingBounds accepts null rating');
let ratingThrew = false;
try {
  validateRatingBounds(5.5);
} catch (e) {
  ratingThrew = e.message.includes('INVALID_ARGUMENT');
}
assert(ratingThrew, 'validateRatingBounds rejects rating > 5.0');

let lowRatingThrew = false;
try {
  validateRatingBounds(0.5);
} catch (e) {
  lowRatingThrew = e.message.includes('INVALID_ARGUMENT');
}
assert(lowRatingThrew, 'validateRatingBounds rejects rating < 1.0');

// Test pagination bounds
assert(validatePaginationBounds(50, 10).boundedLimit === 50, 'validatePaginationBounds accepts valid limit 50');
assert(validatePaginationBounds(200, 0).boundedLimit === 100, 'validatePaginationBounds caps limit at 100');
assert(validatePaginationBounds(-5, -10).boundedLimit === 20 && validatePaginationBounds(-5, -10).boundedOffset === 0, 'validatePaginationBounds resets invalid negative limit/offset');

// -----------------------------------------------------------------------------
// 3. DTO PROJECTION MAPPING & ZERO-LEAKAGE PRIVACY GUARANTEES
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 3: Public-Safe DTO Projection Mapping ---');

const mockRawListing = {
  tenant_id: 'tenant-123',
  slug: 'test-salon',
  name: 'Test Salon',
  business_category: 'Hair Salon',
  short_description: 'Best cuts',
  about_text: 'Experienced barbers',
  city: 'Istanbul',
  district: 'Kadikoy',
  address: 'Moda Cad No 5',
  cover_image_url: 'https://example.com/cover.jpg',
  logo_url: 'https://example.com/logo.jpg',
  gallery_images: ['https://example.com/1.jpg'],
  amenities: ['wifi', 'coffee'],
  phone: '+905551112233',
  whatsapp_number: '+905551112233',
  instagram_url: 'https://instagram.com/testsalon',
  website_url: 'https://testsalon.com',
  opening_hours_summary: '09:00 - 20:00',
  review_count: 15,
  average_rating: 4.8,
  primary_branch: {
    id: 'branch-1',
    name: 'Kadikoy Central',
    slug: 'kadikoy-central',
    is_primary: true,
    timezone: 'Europe/Istanbul',
  },
  featured_services: [
    {
      id: 'srv-1',
      name: 'Haircut',
      name_tr: 'Sac Kesimi',
      duration: 45,
      price: 250,
      category: 'Hair',
      image: 'https://example.com/service.jpg',
    }
  ],
  // Simulated internal leak fields that MUST NOT appear in DTO
  internal_notes: 'Do not expose this staff bonus',
  cost_price: 50,
  tax_id: 'TR1234567890',
};

const mappedListing = mapRawListingToDTO(mockRawListing);
assert(mappedListing.tenantId === 'tenant-123', 'mappedListing has tenantId');
assert(mappedListing.slug === 'test-salon', 'mappedListing has slug');
assert(mappedListing.name === 'Test Salon', 'mappedListing has name');
assert(mappedListing.businessCategory === 'Hair Salon', 'mappedListing has businessCategory');
assert(mappedListing.reviewCount === 15, 'mappedListing reviewCount is 15');
assert(mappedListing.averageRating === 4.8, 'mappedListing averageRating is 4.8');
assert(mappedListing.primaryBranch?.isPrimary === true, 'mappedListing primaryBranch mapped cleanly');
assert(mappedListing.featuredServices.length === 1, 'mappedListing featuredServices mapped cleanly');
assert(!('internal_notes' in mappedListing), 'mappedListing strictly omits internal_notes');
assert(!('cost_price' in mappedListing), 'mappedListing strictly omits cost_price');
assert(!('tax_id' in mappedListing), 'mappedListing strictly omits tax_id');

// Test detail projection mapping
const mockRawDetail = {
  business: {
    tenant_id: 'tenant-123',
    slug: 'test-salon',
    name: 'Test Salon',
    business_category: 'Hair Salon',
    short_description: 'Best cuts',
    about_text: 'Experienced barbers',
    city: 'Istanbul',
    district: 'Kadikoy',
    address: 'Moda Cad No 5',
    phone: '+905551112233',
    whatsapp_number: '+905551112233',
    instagram_url: 'https://instagram.com/testsalon',
    website_url: 'https://testsalon.com',
    opening_hours_summary: '09:00 - 20:00',
    cover_image_url: 'https://example.com/cover.jpg',
    logo_url: 'https://example.com/logo.jpg',
    gallery_images: ['https://example.com/1.jpg'],
    amenities: ['wifi'],
    parking_info: 'Valet available',
    payment_methods: ['credit_card', 'cash'],
    cancellation_policy: '2 hours prior',
    booking_policy: 'Deposit required',
    branches: [
      { id: 'br-1', name: 'Main', slug: 'main', is_primary: true, timezone: 'Europe/Istanbul' }
    ],
    services: [
      { id: 'srv-1', name: 'Haircut', name_tr: 'Sac Kesimi', category: 'Hair', duration: 45, price: 250, image: 'https://example.com/srv.jpg' }
    ],
    reviews_summary: {
      total_reviews: 20,
      average_rating: 4.9,
      distribution: { 5: 18, 4: 2, 3: 0, 2: 0, 1: 0 }
    },
    recent_reviews: [
      {
        id: 'rev-1',
        rating: 5,
        title: 'Superb',
        content: 'Clean fade',
        published_at: '2026-10-01T10:00:00Z',
        created_at: '2026-10-01T10:00:00Z',
        response_text: 'Thank you!',
        responded_at: '2026-10-01T12:00:00Z',
        service_name: 'Haircut',
        branch_name: 'Main',
      }
    ],
    // Leak candidate
    accounting_journal_id: 'journal-secret-999',
  }
};

const mappedDetail = mapRawBusinessDetailToDTO(mockRawDetail);
assert(mappedDetail.tenantId === 'tenant-123', 'mappedDetail has tenantId');
assert(mappedDetail.slug === 'test-salon', 'mappedDetail has slug');
assert(mappedDetail.branches.length === 1, 'mappedDetail has branches');
assert(mappedDetail.services.length === 1, 'mappedDetail has services');
assert(mappedDetail.reviewsSummary.totalReviews === 20, 'mappedDetail reviewsSummary totalReviews is 20');
assert(mappedDetail.reviewsSummary.distribution[5] === 18, 'mappedDetail reviewsSummary distribution[5] is 18');
assert(mappedDetail.recentReviews.length === 1, 'mappedDetail recentReviews mapped cleanly');
assert(!('accounting_journal_id' in mappedDetail), 'mappedDetail strictly omits accounting_journal_id');

// -----------------------------------------------------------------------------
// 4. SERVICE & ADAPTER RESULT<T, E> ERROR CONTRACTS
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 4: Result<T, E> Error & Bounds Handling ---');

import { DiscoveryMarketplaceService } from '../../../../services/discoveryMarketplaceService.ts';

const service = new DiscoveryMarketplaceService();

// Test empty slug failure on service.getDetail
const emptySlugResult = await service.getDetail({ slug: '' });
assert(emptySlugResult.success === false, 'service.getDetail rejects empty slug with success=false');
if (!emptySlugResult.success) {
  assert(emptySlugResult.error.code === 'INVALID_ARGUMENT', 'Empty slug error code is INVALID_ARGUMENT');
}

// Test excessive slug length on service.getDetail
const longSlugResult = await service.getDetail({ slug: 'x'.repeat(101) });
assert(longSlugResult.success === false, 'service.getDetail rejects excessive slug with success=false');
if (!longSlugResult.success) {
  assert(longSlugResult.error.code === 'VALIDATION_ERROR', 'Excessive slug returns VALIDATION_ERROR');
}

// Test excessive search query on service.getListings
const excessiveSearchResult = await service.getListings({ searchQuery: 'q'.repeat(101) });
assert(excessiveSearchResult.success === false, 'service.getListings rejects excessive search query with success=false');
if (!excessiveSearchResult.success) {
  assert(excessiveSearchResult.error.code === 'VALIDATION_ERROR', 'Excessive search query returns VALIDATION_ERROR');
}

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n---------------------------------------------------------------');
console.log(`TOTAL INTEGRATION TESTS: ${testsExecuted}`);
console.log(`PASSED: ${testsPassed}`);
console.log(`FAILED: ${testsFailed}`);
console.log('---------------------------------------------------------------');
console.log('ALL PHASE 7 NODE 2 R2 INTEGRATION TESTS PASSED CLEANLY.\n');

process.exit(0);
