# LARİ Program V2 — Canonical Real-Product Roadmap
**Version:** 2026-09-08.1  
**Program ID:** `LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01`  
**Release effect:** NONE  
**Production:** NO_GO

## 1. Program principles

1. Everything must become real. UI presence, localStorage behavior, simulated providers, mock credentials, static-only contracts, and documentation-only readiness do not count as finished product.
2. Company/legal-entity-dependent activations are deferred to the final provider-activation phase. Their interfaces, schemas, secrets boundaries, webhook/idempotency rules, deterministic test providers, sandbox harnesses and cutover runbooks are built earlier.
3. AOS runs continuously in parallel as the visual-design and Design Intelligence lane.
4. Sales claims follow runtime truth. Only capabilities with independently accepted live evidence may be marketed as generally available.
5. Product work, AOS work, release work, Supabase/Vercel mutation and production promotion stay separately authorized.
6. Every phase is evidence-gated rather than calendar-gated.

## 2. Canonical maturity states

- `REAL_LIVE_VERIFIED`
- `REAL_CODE_NOT_LIVE_VERIFIED`
- `PROVIDER_READY_NOT_CONNECTED`
- `CODE_PRESENT_NOT_PRODUCTIZED`
- `MOCK_ONLY`
- `PLANNED`
- `COMPANY_DEPENDENT_FINALIZATION`
- `BLOCKED`

## 3. Program lanes

### A — Core Platform & Security
Canonical Supabase environment, Auth/session hardening, tenant isolation/RLS, SECURITY DEFINER/grant audit, rate limiting, secrets, idempotency, audit events, backups/restores, disaster recovery, performance/load/concurrency, deployment/rollback and observability.

Immediate known targets:
- choose/restore an ACTIVE canonical Supabase staging environment;
- fix or explicitly disposition `public.ht_rate_limit_buckets` RLS;
- harden exposed helper RPCs such as `get_user_role(user_id)` and `get_user_tenant_id(user_id)`;
- review mutable `search_path` functions;
- prove mock auth cannot become a production authority path;
- enable/assess leaked-password protection;
- add restore drills and production-style telemetry.

### B — Booking & Business Operations
Booking, availability, services, staff, branches, resources, cancellation, rescheduling, customer self-service, no-show, waitlist, group appointments, breaks/holidays/time-off, dynamic buffers, capacity rules and deposit/no-show policy hooks.

### C — Owner Workspace / CRM / Growth
Onboarding, dashboard, customer 360/memory, segmentation, referrals, campaigns, share toolkit/QR, reactivation, loyalty, memberships, packages, gift cards, promotions, forms, review/rebooking automation.

### D — Commerce / Billing / Revenue
Before company formation:
- provider-neutral payment adapter;
- checkout-session contracts;
- recurring billing state machine;
- deposit/prepayment domain;
- token references only, never raw card storage;
- refund/correction model;
- webhook signature/replay/idempotency;
- billing ledger;
- dunning/retry scheduler;
- tax/invoice domain interfaces;
- sandbox/replay harness.

Company-dependent late activation:
- iyzico production merchant;
- production API credentials;
- live recurring collection;
- invoice/e-archive/tax provider;
- banking/settlement.

### E — Communications
Before provider activation:
- provider-neutral SMS/email/WhatsApp adapters;
- outbox/retries/dead-letter;
- delivery callbacks;
- templates/localization;
- consent/IYS gates;
- OTP abstraction;
- frequency/rate limits;
- provider failover;
- deterministic test provider.

Late activation:
- production SMS/OTP;
- WhatsApp Business production account;
- production email sender/domain;
- provider/statutory enrollment where required.

### F — Public Web / Brand / Acquisition
`randevulari.com`, tenant mini-sites, wildcard subdomains, SEO, public booking, custom-domain workflow, QR/deep links, portfolios, reviews, discovery foundation, marketing/pricing/features/contact/legal pages, accessibility and performance.

### G — Multi-Branch / Enterprise
Server-enforced branch limits, branch-scoped staff/services/resources, central/branch calendars, permissions, cross-branch reporting, reassignment/transfers, enterprise onboarding, branch URLs and brand controls.

### H — Clinic Vertical
Patient profile, encounter lifecycle, clinical notes/history, practitioner permissions, forms, scheduling/resources, clinical AI transcript/draft, auditability, sensitive-data retention and an explicit Clinic SKU.

### I — Health Tourism Vertical
Public lead intake, lead scoring, agencies/referrers, coordinators, WhatsApp/AI conversation, human handoff, multilingual funnel, treatment journey/quote/itinerary domain, document/checklist flow, SLA/conversion analytics and explicit Health Tourism SKUs.

### J — AI Product Layer
Clinic AI, HT AI, customer visual/style assistant, owner assistants, prompt/version governance, server-side quotas, consent/privacy, evaluation sets, hallucination/failure UX, cost telemetry and provider abstraction.

### K — POS / Inventory / Retail
Products/SKUs, inventory ledger, stock movements, suppliers/purchase orders, mixed service+retail cart, staff commissions/tips, cash register/day close, refunds/adjustments and multi-branch inventory.

### L — Marketplace / Network Effects
Verified reviews, discovery/search, portfolios, favorites, rebooking, ranking/integrity. Marketplace settlement/payment is deferred until legal/company analysis.

### M — Mobile / PWA
Responsive-web first, installable PWA, offline-safe boundaries, push abstraction and owner quick actions. Native apps only after usage data justifies them.

### N — Integrations / Public API
Google Calendar, webhooks, import/export, accounting adapter, support/CRM integrations, API keys/scopes/rate limits/audit and a future integration marketplace.

### O — Analytics / Decision Support
Booking funnel, revenue, utilization, no-show/cancellation, staff performance, campaign attribution, retention/reactivation, HT funnel, branch comparison and privacy-safe product analytics.

### P — Legal / Privacy / Governance
Before company formation: consent/version ledger, data-rights requests, retention/deletion/anonymization, export, sensitive-data boundaries, subprocessor registry model and access/audit logs.

Late finalization: lawyer-reviewed policies/contracts, company identifiers, commercial agreements, DPAs and statutory registrations as applicable.

## 4. AOS parallel design lane

AOS is mandatory for every customer-visible milestone and is not a final cosmetic pass.

For each visual epic AOS should produce:
1. current-state captures at six canonical viewports;
2. user-journey visual critique;
3. grounded reference/competitive analysis where useful;
4. proposed visual direction;
5. affected tokens/components;
6. candidate mockups/renders/assets from a real available provider; otherwise `PROVIDER_MISSING`;
7. accessibility/readability review;
8. responsive evidence;
9. implemented-vs-intended visual diff after implementation;
10. `HUMAN_READY_VISUAL_GATE`.

AOS may keep working autonomously inside read-only/local design scope. Product/release mutations always require a separate child authority.

## 5. Execution phases

### Phase 0 — Canonical Truth & Agent Control Plane

**Mandatory lineage-convergence gate:** accepted product subject and staging/default are currently diverged from merge-base `134c8716c2511c909cd400aee0496ebd70f63bf6`. At the 2026-09-08 audit:
- accepted subject `09bb1f8d8ce070c33d09099a6d0ae20c93787d11` is 301 commits ahead of default;
- default `3faeced52939c65bbbc49da2ee6c7f375c0f9e59` contains 34 commits not in subject.
No broad Program V2 mutation branch may be declared canonical until those 34 commits are semantically reconciled against subject and a single new development base is independently accepted.

Exit:
- one capability registry;
- all current features mapped to canonical maturity;
- stale/contradictory readiness docs classified;
- dependency graph;
- company-dependent boundaries;
- AOS↔Controller autonomous coordination protocol;
- production remains NO_GO.

### Phase 1 — Production Foundation Hardening
Exit:
- canonical Supabase ACTIVE/reproducible;
- P0 security findings resolved or independently dispositioned;
- exposed RPC grants audited;
- production auth fail-closed;
- restore drill PASS;
- staging observability/alerts;
- Vercel deployment noise reduced;
- real staging E2E smoke PASS.

### Phase 2 — Real Paymentless Pilot Core
Exit:
- one real controlled tenant;
- real auth/data/booking/self-service/admin;
- real media storage;
- real communication test channel or explicitly bounded manual fallback;
- no company-dependent money collection;
- incident/support rehearsal;
- AOS customer + owner visual gate.

### Phase 3 — Product Completeness Before External Providers
Exit:
- waitlist;
- advanced scheduling/resources/time-off;
- server-enforced package limits;
- CRM/segmentation;
- reporting;
- multi-branch GA candidate;
- Google Calendar adapter;
- communications adapter;
- payment adapter;
- real server background jobs in staging;
- custom-domain verification provider-ready.

### Phase 4 — Revenue & Retention Suite
Exit:
- deposits/no-show domain;
- memberships;
- packages;
- gift cards;
- loyalty;
- campaigns/reactivation;
- client wallet domain;
- robust analytics;
- provider-independent sandbox/replay evidence.

### Phase 5 — Clinic & Health Tourism Commercialization
Exit:
- explicit vertical SKUs;
- roles/seats/quotas/AI allowances;
- privacy/retention evidence;
- E2E Clinic/HT journeys;
- multilingual UX;
- AOS vertical visual acceptance.

### Phase 6 — POS / Inventory / Retail
Exit:
- products/inventory;
- mixed cart;
- commissions/tips;
- cash/day-close;
- refunds/adjustments;
- multi-branch stock;
- payment terminal remains adapter-only until activation.

### Phase 7 — Discovery / Marketplace / Network
Exit:
- verified reviews;
- discovery/search;
- portfolios;
- favorites/rebooking;
- integrity model.

### Phase 8 — Company-Dependent Provider Activation
Only after technical readiness:
- legal entity/company setup;
- iyzico production merchant;
- production SMS/OTP and WhatsApp;
- production email sender/domain;
- invoice/tax provider;
- banking/settlement;
- final legal/provider contracts.

### Phase 9 — Paid Early Access → GA
Exit:
- paid E2E billing;
- refunds/dunning/invoices;
- production communication proof;
- observability/SLO;
- backup/restore;
- load/security evidence;
- 3–10 real pilot tenants with measured outcomes;
- sales claim matrix equals runtime truth;
- zero P0/P1 launch blockers;
- AOS final consistency gate;
- explicit Independent Controller `PRODUCTION=GO`.

## 6. Current Program V2 priority order

1. Phase 0 truth registry + autonomy/control plane.
2. Phase 1 security and canonical environment.
3. AOS evidence completion in parallel.
4. Real paymentless pilot.
5. Product-completeness gaps that do not require a company/provider contract.
6. Revenue/retention modules.
7. Clinic/HT commercial packaging.
8. POS/inventory.
9. Marketplace/network.
10. Company/provider activation.
11. Paid early access and GA.

## 7. Sales rule
Only `REAL_LIVE_VERIFIED` capabilities may be sold as generally available. Bounded pilot claims require explicit scope.

## 8. Current release rule
`PRODUCTION=NO_GO`.
