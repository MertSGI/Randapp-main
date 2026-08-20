# 12-Week Master Delivery Roadmap & Phase Matrix

## Master Product Delivery Train Priority

```
LARİ CORE [FROZEN / CLOSED_PROVEN]
  └── PACKAGE / CUSTOMER CUSTOMIZATION [CLOSED_PROVEN]
        └── LARİ CLINIC [IN_PROGRESS - BLOCK 1 CLOSED_PROVEN / BLOCK 2 IN_PROGRESS]
              └── LARİ HEALTH TOURISM
                    └── FINAL DELIVERY
```
*Note: UI V2 is a parallel frontend lane and NOT a separate product roadmap phase.*

---

## 12-Week Timeline Overview

- **Duration**: 12 Weeks
- **Day 0**: `UNKNOWN / NEEDS_RECOVERY` (No historical Day 0 date anchor found in prompt history/docs; resetting from today is strictly forbidden).
- **Day 0 State**: `NEEDS_RECOVERY`

---

## Phase Matrix & Progress

| Phase / Layer | Scope / Milestone | Status | Evidence Level |
| :--- | :--- | :--- | :--- |
| **1. LARİ Core** | Technical Staging Browser Acceptance | `CLOSED_PROVEN_TECHNICAL_ACCEPTANCE_COMPLETE` | E4 (Shared Staging Live) |
| **1. LARİ Core** | Provisioning & Idempotency | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **1. LARİ Core** | Commercial Contracts & Boundaries | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **1. LARİ Core** | Onboarding Contracts & Readiness | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **1. LARİ Core** | Onboarding State Handoff | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **1. LARİ Core** | Baseline Integration | `INTEGRATION_ALREADY_SATISFIED` | E1 (Source Proven) |
| **1. LARİ Core** | Outbox / Provider Abstraction | `PRESENT_ON_CORE_BASELINE` | E1 (Source Proven) |
| **1. LARİ Core** | Public Booking Anti-Abuse | `PRESENT_ON_CORE_BASELINE` | E1 (Source Proven) |
| **1. LARİ Core** | Demo Isolation & Subdomain Readiness | `PRESENT_ON_CORE_BASELINE` | E1 (Source Proven) |
| **1. LARİ Core** | Core Runtime Proof (`CORE-RC.3`) | `CLOSED_PROVEN` | E3 (Isolated Runtime E2E) |
| **1. LARİ Core** | Release Candidate Finalization (`CORE-RC.4`) | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **2. Package Customization** | Branch Server Authority (Slice 1) | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **2. Package Customization** | Commercial Source-of-Truth Alignment (Slice 2) | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **3. LARİ Clinic** | Clinical Domain Server Authority (Block 1) | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **3. LARİ Clinic** | Operational Integration & Application Services (Block 2) | `IN_PROGRESS` | N/A |
| **3. LARİ Clinic** | Clinic Workspace UI & E2E Verification (Block 3) | `NOT_STARTED` | N/A |
| **4. LARİ Health Tourism** | International Patient & Agency Operations | `NOT_STARTED` | N/A |
| **5. Final Delivery** | Production Cutover & DNS/Commercial Launch | `NOT_STARTED` | N/A |

---

## Detailed Milestone Descriptions

### Phase 1: LARİ Core (FROZEN / CLOSED_PROVEN)
- **Status**: CLOSED_PROVEN. All core database migrations (59 files), RPCs, entitlement resolvers, onboarding state machine, and release candidate contracts are closed and verified on official RC baseline `release/core-rc4` (`e1bb23dbbc2f1f079ec6bbc93e3cb9b83db1839a`).
- **Milestones**:
  - `CORE-RC.3`: `CLOSED_PROVEN` (`E3_ISOLATED_RUNTIME_E2E`). UI V2 redesign designated as non-blocking parallel workstream (`DEFERRED_PARALLEL_NON_BLOCKING`).
  - `CORE-RC.4`: `CLOSED_PROVEN` (`E2_EXECUTABLE_EXACT_SHA_CI`, GitHub Actions Run `32134598853`). Cross-layer `pending_onboarding` subscription status contract alignment verified.

### Phase 2: Package / Customer Customization (FROZEN / CLOSED_PROVEN)
- **Status**: CLOSED_PROVEN (`E2_EXECUTABLE_EXACT_SHA_CI`, GitHub Actions Run `32363490123`). Integrated Package baseline closed and frozen at exact product SHA `65a53427f52c21e60aa8f92e02a17d693a201601`. Both defined implementation slices are closed and proven together.
  - `Branch Server Authority` (Slice 1): `CLOSED_PROVEN` (`E2_EXECUTABLE_EXACT_SHA_CI`, GitHub Actions Run `32340331307`). Server-authoritative RPC mutations, 64-bit advisory locks, SELECT-only RLS policies, and 5-session concurrency matrix verified on `feature/package-customer-customization-foundation` at exact SHA `83089a0695e0a5f0cf0fda25c7006df5e6ad4c07`.
  - `Commercial Source-of-Truth Alignment` (Slice 2): `CLOSED_PROVEN` (`E2_EXECUTABLE_EXACT_SHA_CI`, GitHub Actions Run `32363490123`). Canonical 25 H1A feature keys, explicit legacy mapping matrix, dynamic legacy plan snapshot rendering, explicit unlimited flags without numeric sentinels, registration RPC server authority, and zero frontend price leaks verified on `feature/package-customer-customization-foundation` at exact SHA `65a53427f52c21e60aa8f92e02a17d693a201601`.

### Phase 3: LARİ Clinic Package (IN_PROGRESS)
- **Status**: IN_PROGRESS. Downstream clinical package extension built on frozen Package customization baseline `65a53427f52c21e60aa8f92e02a17d693a201601`.
  - `Clinical Domain Server Authority` (Block 1): `CLOSED_PROVEN` (`E2_EXECUTABLE_EXACT_SHA_CI`, GitHub Actions Run `32395034938`, evidence SHA `78c3e49a1883aafb74ff2e8f18acd9876e74a01b`). Materialized `clinic_staff_profiles`, `clinic_patient_profiles`, `clinic_encounters`, and `clinic_encounter_notes` (61st migration `20260905_lari_clinic_domain_server_authority.sql`), 6 server-authoritative RPCs, strict RLS policies, 64-bit advisory locking for versioned append-only clinical notes, audit privacy protection, cross-tenant isolation, and 3-session concurrency matrix verified at product SHA `2bb2b32d95387e09da06c7442a8617ccd38e4feb`.
  - `Operational Integration & Application Service Layer` (Block 2): `IN_PROGRESS`. Materializing migration 62 (`20260906_lari_clinic_operational_integration.sql`), confirmed-only encounter start rule, atomic encounter+appointment completion RPC, operational day read model without SOAP fields, `clinicService.ts`, and `supabaseClinicRepository.ts`.

### Phase 4: LARİ Health Tourism Package
- **Status**: Not Started. Extends Clinic Package for international patient coordination and agency workflows.

### Phase 5: Final Delivery
- **Status**: Not Started. Final production cutover, wildcard DNS/SSL configuration, SMS/WhatsApp provider account activation, and commercial launch mode enablement.
