// supabase/tests/program-v2/phase7-live/test-phase7-node2-discovery-marketplace-r3-ui.mjs
// Phase 7 Node 2 R3: Discovery Marketplace & Portfolio UI Verification Test
// Authority: DECISION-022 / LARI-P7-N2-DISCOVERY-MARKETPLACE-R3
//
// Invariants:
// - Verifies the presence, export contracts, and structural invariants of R3 UI components.
// - Confirms that DiscoveryMarketplace and DiscoveryPortfolio integrate with the authoritative service boundary.
// - Confirms that routes (/discovery, /discovery/:slug) are wired correctly.
// - Confirms zero unauthorized direct database calls or leaking mock implementations.
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

console.log('==================================================================');
console.log('STARTING PHASE 7 NODE 2 R3 DISCOVERY UI STATIC & CONTRACT TESTS');
console.log('==================================================================\n');

// -----------------------------------------------------------------------------
// 1. COMPONENT EXISTENCE & STATICS
// -----------------------------------------------------------------------------
console.log('--- TEST GROUP 1: Component File Existence & Exports ---');

const marketplacePath = path.resolve('src/pages/DiscoveryMarketplace.tsx');
const portfolioPath = path.resolve('src/components/DiscoveryPortfolio.tsx');
const tenantServicePath = path.resolve('services/tenantService.ts');
const routesPath = path.resolve('src/routes.tsx');
const appPath = path.resolve('App.tsx');

assert(fs.existsSync(marketplacePath), 'src/pages/DiscoveryMarketplace.tsx exists');
assert(fs.existsSync(portfolioPath), 'src/components/DiscoveryPortfolio.tsx exists');
assert(fs.existsSync(tenantServicePath), 'services/tenantService.ts exists');
assert(fs.existsSync(appPath), 'App.tsx exists');
assert(!fs.existsSync(routesPath), 'unused duplicate src/routes.tsx is absent');

const marketplaceContent = fs.readFileSync(marketplacePath, 'utf8');
const portfolioContent = fs.readFileSync(portfolioPath, 'utf8');
const tenantServiceContent = fs.readFileSync(tenantServicePath, 'utf8');
const appContent = fs.readFileSync(appPath, 'utf8');

assert(
  marketplaceContent.includes('export const DiscoveryMarketplace') ||
  marketplaceContent.includes('export default DiscoveryMarketplace'),
  'DiscoveryMarketplace exports component correctly'
);

assert(
  portfolioContent.includes('export const DiscoveryPortfolio') ||
  portfolioContent.includes('export default DiscoveryPortfolio'),
  'DiscoveryPortfolio exports component correctly'
);

// -----------------------------------------------------------------------------
// 2. AUTHORITATIVE SERVICE INTEGRATION
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 2: Authoritative Service Integration ---');

assert(
  marketplaceContent.includes('discoveryMarketplaceService.getListings'),
  'DiscoveryMarketplace invokes discoveryMarketplaceService.getListings'
);

assert(
  marketplaceContent.includes('tenantService.getTenantDiscoveryConfig'),
  'DiscoveryMarketplace resolves detail through the canonical tenant service boundary'
);

assert(
  tenantServiceContent.includes('discoveryMarketplaceService.getDetail({ slug })'),
  'tenantService delegates discovery detail to discoveryMarketplaceService.getDetail'
);

assert(
  marketplaceContent.includes('DiscoveryPortfolio'),
  'DiscoveryMarketplace embeds DiscoveryPortfolio for detail view'
);

assert(
  !marketplaceContent.includes('supabase.from('),
  'DiscoveryMarketplace has zero direct unmediated supabase table queries'
);

assert(
  !portfolioContent.includes('supabase.from('),
  'DiscoveryPortfolio has zero direct unmediated supabase table queries'
);

// -----------------------------------------------------------------------------
// 3. ROUTE WIRING
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 3: Route Integration & Wiring ---');

assert(
  appContent.includes('/discovery'),
  'active App.tsx router registers /discovery route'
);

assert(
  appContent.includes('/discovery/:slug'),
  'active App.tsx router registers /discovery/:slug route'
);

assert(
  marketplaceContent.includes('/booking/${encodeURIComponent(selectedBusiness.slug)}'),
  'booking handoff uses canonical /booking/:tenantSlug route'
);

assert(
  !marketplaceContent.includes('/book?tenant=') && !marketplaceContent.includes('serviceId='),
  'booking handoff does not emit unsupported tenant/service query parameters'
);

// -----------------------------------------------------------------------------
// 4. PORTFOLIO & MARKETPLACE PROJECTIONS CONTRACTS
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 4: Portfolio Feature Contracts ---');

assert(
  portfolioContent.includes('galleryImages'),
  'DiscoveryPortfolio supports business gallery images'
);

assert(
  portfolioContent.includes('amenities'),
  'DiscoveryPortfolio supports business amenities'
);

assert(
  portfolioContent.includes('reviewsSummary'),
  'DiscoveryPortfolio displays reviews summary'
);

assert(
  portfolioContent.includes('services'),
  'DiscoveryPortfolio displays services list'
);

assert(
  !marketplaceContent.includes("'5.0'") && !portfolioContent.includes("'5.0'"),
  'zero-review state does not fabricate a 5.0 rating'
);

assert(
  marketplaceContent.includes('item.reviewCount > 0') && portfolioContent.includes('reviewCount > 0'),
  'rating presentation is gated by authoritative review counts'
);

console.log('\n==================================================================');
console.log(`ALL R3 UI VERIFICATION TESTS PASSED: ${testsPassed}/${testsExecuted} tests`);
console.log('==================================================================');
