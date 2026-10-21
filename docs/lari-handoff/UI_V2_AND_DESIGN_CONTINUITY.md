# LARİ — UI-V2 & DESIGN CONTINUITY (`UI_V2_AND_DESIGN_CONTINUITY.md`)

**Verification Timestamp:** `2026-10-21T10:35:00Z`  
**Converged Product & UI-V2 Reference Branch:** [`staging/ci-lari-release-gate-c1-c4-20261017`](https://github.com/MertSGI/Randapp-main/tree/staging/ci-lari-release-gate-c1-c4-20261017)  
**Converged Reference Commit SHA:** [`72911e4fb68dd4f85f7fafef575089104102064e`](https://github.com/MertSGI/Randapp-main/commit/72911e4fb68dd4f85f7fafef575089104102064e)

---

## 1. Architectural Identity of UI-V2 in LARİ

**UI-V2 is NOT a separate product or separate repository.** It is the modernized user interface and storefront design system built directly inside `MertSGI/Randapp-main`, sharing the same multi-tenant domain models, `TenantContext`, `AuthContext`, server-authoritative Supabase RPC contracts (`create_public_booking`, `get_discovery_marketplace_listings`, `get_discovery_marketplace_detail`, manage-token RPCs), and local/Supabase repository adapters.

---

## 2. Remotely Integrated & CI-Verified UI-V2 Surfaces (Do NOT Redevelop)

All of the following UI-V2 surfaces and tests are **already integrated** in `staging/ci-lari-release-gate-c1-c4-20261017` (`72911e4fb68dd4f85f7fafef575089104102064e`) and verified by hosted GitHub Actions runs (`38951741181`, `38998120868`, `38998120843`):

### A. Gated UI-V2 Public Salon Storefront (`SalonWebsiteViewV2.tsx`)
- **Source Files:**
  - [`components/SalonWebsiteViewV2.tsx`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/components/SalonWebsiteViewV2.tsx)
  - [`pages/BookingPage.tsx`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/pages/BookingPage.tsx)
  - [`components/layouts/SalonBookingLayout.tsx`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/components/layouts/SalonBookingLayout.tsx)
- **Integration Commits:**
  - [`3f6342132ee588fa2ba45fc7fdef6fc2eb36e3cd`](https://github.com/MertSGI/Randapp-main/commit/3f6342132ee588fa2ba45fc7fdef6fc2eb36e3cd) (`feat(ui): integrate gated UI-V2 storefront`, 15 Oct 2026)
  - [`820315baa94e3f07edcf4c5e1eee1d6f76ae0502`](https://github.com/MertSGI/Randapp-main/commit/820315baa94e3f07edcf4c5e1eee1d6f76ae0502) (`fix(ui): improve UI-V2 keyboard accessibility`, 15 Oct 2026)
- **Exact Runtime Opt-In Gate in `pages/BookingPage.tsx`:**
  - Checks URL query parameter `ui=v2` (from `window.location.search` or hash query string).
  - Enforces host allowlist: renders `SalonWebsiteViewV2` **only** when `ui === 'v2'` **and** `window.location.hostname` is `localhost`, `127.0.0.1`, or a preview `*.vercel.app` host, while explicitly blocking `randevulari.com`, `www.randevulari.com`, and `lari-staging.vercel.app`.
  - Falls back to `SalonWebsiteView` (V1) whenever `ui=v2` is absent or on blocked hosts.
- **Capabilities & Keyboard Accessibility (`820315ba...`):**
  - Full service catalog filtering, branch selector, staff preference selector (including "No Preference"), interactive date/time slot picker, customer contact & KVKK consent step, and booking confirmation screen with manage-token self-service link.
  - Full WAI-ARIA tablist/tab keyboard navigation (`ArrowRight`, `ArrowLeft`, `Home`, `End`), focus-visible rings, and accessible step transitions.

### B. Marketing Navigation & Responsive Layout Accessibility
- **Source Files:**
  - [`components/layouts/MarketingLayout.tsx`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/components/layouts/MarketingLayout.tsx)
  - [`pages/MarketingHomePage.tsx`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/pages/MarketingHomePage.tsx)
- **Integration Commits & CI:**
  - [`ed3f1232c578ec969fb83e01335ab10659408d1b`](https://github.com/MertSGI/Randapp-main/commit/ed3f1232c578ec969fb83e01335ab10659408d1b) (`fix(ui): complete marketing navigation accessibility`, 11 Oct 2026, hosted CI [`38151286724`](https://github.com/MertSGI/Randapp-main/actions/runs/38151286724) `SUCCESS`).
  - [`3f6342132ee588fa2ba45fc7fdef6fc2eb36e3cd`](https://github.com/MertSGI/Randapp-main/commit/3f6342132ee588fa2ba45fc7fdef6fc2eb36e3cd) (responsive `lg:` breakpoint alignment preventing tablet horizontal overflow).

### C. UI-V2 Discovery Marketplace & Portfolio UI (Phase 7 Node 2 R2/R3 + Convergence)
- **Source Files:**
  - [`src/pages/DiscoveryMarketplace.tsx`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/src/pages/DiscoveryMarketplace.tsx)
  - [`src/components/DiscoveryPortfolio.tsx`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/src/components/DiscoveryPortfolio.tsx)
  - [`services/discoveryMarketplaceService.ts`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/services/discoveryMarketplaceService.ts)
  - [`adapters/discoveryMarketplaceAdapter.ts`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/adapters/discoveryMarketplaceAdapter.ts)
  - [`types/discoveryMarketplaceDTOs.ts`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/types/discoveryMarketplaceDTOs.ts)
- **Integration Commits:**
  - [`1bc7cfdf29f950050e1c4b5d1cf1ab6d67a19d5a`](https://github.com/MertSGI/Randapp-main/commit/1bc7cfdf29f950050e1c4b5d1cf1ab6d67a19d5a) (`Implement Phase 7 Node 2 R2 — Discovery Marketplace Application Service / Adapter Integration`)
  - [`d86ce12a4068e54db75b24cf399d80643b848660`](https://github.com/MertSGI/Randapp-main/commit/d86ce12a4068e54db75b24cf399d80643b848660) (`Implement Phase 7 Node 2 R3 — Customer-facing Discovery / Portfolio UI`)
  - [`e6b30e08819e57be41faef8697b55f2321e5b415`](https://github.com/MertSGI/Randapp-main/commit/e6b30e08819e57be41faef8697b55f2321e5b415) (`fix(lari-ui-v2): correct R3 review defects and CI coverage`)
  - [`36a3b15442b066942a871b957c86fcfa7d3dd05e`](https://github.com/MertSGI/Randapp-main/commit/36a3b15442b066942a871b957c86fcfa7d3dd05e) (`feat(discovery): complete UI V2 marketplace convergence`)
  - [`6e7c84bd55bb836a305d2f2b1471d5dc2db501e2`](https://github.com/MertSGI/Randapp-main/commit/6e7c84bd55bb836a305d2f2b1471d5dc2db501e2) & [`c01e0b662eb04457214691568b074c2eb4b0f62b`](https://github.com/MertSGI/Randapp-main/commit/c01e0b662eb04457214691568b074c2eb4b0f62b) (tenant context refresh & router state handoff from Discovery Marketplace to BookingPage).

### D. Customer Portal, Favorites & Fast Rebooking UI (Phase 7 Node 3 R2 + WP5 Remediation)
- **Source Files:**
  - [`pages/customer/FavoritesSection.tsx`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/pages/customer/FavoritesSection.tsx)
  - [`pages/customer/CustomerPortalPage.tsx`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/pages/customer/CustomerPortalPage.tsx)
  - [`pages/customer/CustomerLoginPage.tsx`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/pages/customer/CustomerLoginPage.tsx)
- **Integration Commits:**
  - [`618993b5cb09139ca45163cb5b03e62f30f22949`](https://github.com/MertSGI/Randapp-main/commit/618993b5cb09139ca45163cb5b03e62f30f22949) (`feat(node3): complete favorites and fast rebooking UI`)
  - [`06ebf176e411faf6820ded34987f894cc5e7dc9e`](https://github.com/MertSGI/Randapp-main/commit/06ebf176e411faf6820ded34987f894cc5e7dc9e) (`fix(customer-portal): remediate customer auth and appointment history under DECISION-024`)

### E. Hosted Playwright Chromium UI-V2 Booking E2E & Integrity Suites
- **Source Files & Workflows:**
  - [`scripts/test-ui-v2-booking-e2e.mjs`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/scripts/test-ui-v2-booking-e2e.mjs) (`npm run qa:ui-v2-booking-e2e`, added in [`b02628584d7a6adc3109d84eb06e2ce9381f33a2`](https://github.com/MertSGI/Randapp-main/commit/b02628584d7a6adc3109d84eb06e2ce9381f33a2))
  - [`scripts/test-ui-v2-booking-integrity.mjs`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/scripts/test-ui-v2-booking-integrity.mjs) (`npm run qa:ui-v2-booking-integrity`, added in [`6f3c04dd292104d2f660ef881f38efc03f060ca4`](https://github.com/MertSGI/Randapp-main/commit/6f3c04dd292104d2f660ef881f38efc03f060ca4))
  - [`scripts/test-local-booking-interval-integrity.mjs`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/scripts/test-local-booking-interval-integrity.mjs) & [`services/bookingInterval.ts`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/services/bookingInterval.ts) (`npm run qa:booking-interval-integrity`, added in [`98d0c4a32e71d10106058896a1efdc6f61dc520e`](https://github.com/MertSGI/Randapp-main/commit/98d0c4a32e71d10106058896a1efdc6f61dc520e) and [`70c6f27adbbeaa906b8fc701f972048fca40f511`](https://github.com/MertSGI/Randapp-main/commit/70c6f27adbbeaa906b8fc701f972048fca40f511))
  - Hosted CI proof: Executed and passed in real headless Chromium inside GitHub Actions runs [`38951741181`](https://github.com/MertSGI/Randapp-main/actions/runs/38951741181) and [`38998120843`](https://github.com/MertSGI/Randapp-main/actions/runs/38998120843).

---

## 3. Reconciliation of Historical Local UI-V2 Branches vs. Remote Converged Lineage

| Lineage / Branch Identifier | Commit SHA | Location | Relationship to Converged Product (`72911e4fb68dd4f85f7fafef575089104102064e`) |
| :--- | :--- | :--- | :--- |
| `feature/lari-ui-v2-20260921-01` | `f0bf06fb6d37ca5158c38bb00826f67ff08a05d9` | Local worktree (`AOS-lari-ui-v2-20260921-01`) | Early standalone UI-V2 prototype branch (22 Sep 2026, branched off `c08d585...` before Phase 2–7 backend work). **Superseded** by remote convergence commits `36a3b154...`, `3f634213...`, and `820315ba...` which integrated UI-V2 into the full Phase 1–7 product codebase. |
| `feature/lari-ui-v2-browser-evidence-20260922-01` | `4a39947281eaf5c084caee43cccf5e701f34586d` | Local worktree (`AOS-lari-ui-v2-browser-evidence-20260922-01`) | Early local browser screenshot capture branch (22 Sep 2026). **Superseded** by hosted Playwright Chromium workflows `lari-ui-v2-booking-e2e.yml` (`b0262858...`), `lari-ui-v2-booking-integrity.yml` (`6f3c04dd...`), and `lari-product-convergence.yml` (`72911e4f...`). |
| `review/fix1-discovery-count-20261008` | `5a208cc9ffad3dfe1200160eea6c054b86c2e2e9` | Local worktree (`LARI-fix1-discovery`) | Unpushed 1-commit local candidate on top of `06ebf176...` distinguishing failed discovery request heading from verified zero results in `src/pages/DiscoveryMarketplace.tsx`. Evaluate for cherry-picking onto `72911e4f...` if desired. |
| `review/fix2-customer-login-20261008` | `c5a25e17691be5bc06bd5af21cb25ffd930c84c7` | Local worktree (`LARI-fix2-login`) | Unpushed 1-commit local candidate on top of `06ebf176...` replacing interactive customer login form with read-only unavailable guidance in `supabase` mode (`pages/customer/CustomerLoginPage.tsx`). Evaluate for cherry-picking onto `72911e4f...` if desired. |

---

## 4. Strict UI-V2 Continuation Constraints

1. **Do NOT recreate `SalonWebsiteViewV2.tsx`, `DiscoveryMarketplace.tsx`, `DiscoveryPortfolio.tsx`, or `FavoritesSection.tsx` from scratch.** All four exist in `72911e4fb68dd4f85f7fafef575089104102064e`.
2. **Do NOT remove the `?ui=v2` opt-in gate in `pages/BookingPage.tsx`** until the owner explicitly authorizes making UI-V2 the default public storefront view across staging and production hosts.
3. **Preserve `react-router-dom` `7.18.4` (`react-router` `7.18.4`)** pinned in Release Gate C1 (`679a7734a6020774abe8a3415499ba0de6f38b87`). Do not downgrade or run `npm audit fix --force`.
4. **Always run the UI-V2 Playwright suites (`npm run qa:booking-interval-integrity`, `npm run qa:ui-v2-booking-e2e`, `npm run qa:ui-v2-booking-integrity`)** whenever modifying booking, availability, or storefront components.
