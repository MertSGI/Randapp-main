# 12-Week Master Delivery Roadmap & Phase Matrix

## Master Product Delivery Train Priority

```
LARİ CORE
  └── PACKAGE / CUSTOMER CUSTOMIZATION
        └── LARİ CLINIC
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
| **1. LARİ Core** | Core Runtime Proof & UI V2 Parallel Converge | `HOLD_UI_V2_INPUT_PENDING` | E3 (Isolated Runtime E2E) |
| **1. LARİ Core** | Release Candidate Finalization | `NOT_STARTED` | N/A |
| **2. Package Customization** | Multi-Branch & Tenant Overrides | `NOT_STARTED` | N/A |
| **3. LARİ Clinic** | Medical Appointment & Clinical Workflows | `NOT_STARTED` | N/A |
| **4. LARİ Health Tourism** | International Patient & Agency Operations | `NOT_STARTED` | N/A |
| **5. Final Delivery** | Production Cutover & DNS/Commercial Launch | `NOT_STARTED` | N/A |

---

## Detailed Milestone Descriptions

### Phase 1: LARİ Core (Current Active Focus)
- **Status**: Substantially Closed. Core database migrations (59 files), RPCs, entitlement resolvers, and onboarding state machine are fully closed and verified on exact product SHA `80297685...`.
- **Active Focus (`CORE-RC.3`)**: Parallel sub-workstreams:
  - **Lane CORE_RUNTIME** (`CLOSED_PROVEN` - `E3_ISOLATED_RUNTIME_E2E`): Execute real browser `/register` flow, synthetic owner onboarding, `ready_for_review` transition, Super Admin publish, public storefront, customer booking/manage/owner visibility in isolated non-production runtime.
  - **Lane UI_V2** (`INPUT_PENDING`): Materialize parallel UI V2 candidate from dedicated UI workstream, verify backend compatibility, and integrate when ready.

### Phase 2: Package / Customer Customization
- **Status**: Not Started. Depends on full Core-RC stabilization. Will handle tenant-specific branding, custom field extensions, and bespoke package hooks without touching core schema contracts.

### Phase 3: LARİ Clinic Package
- **Status**: Not Started. Depends on Package Customization baseline. Extends LARİ Core for medical clinics, consultation scheduling, and doctor/treatment availability.

### Phase 4: LARİ Health Tourism Package
- **Status**: Not Started. Depends on LARİ Clinic package. Extends platform for international patient travel, multi-currency pricing, and agency referral operations.

### Phase 5: Final Delivery
- **Status**: Not Started. Final production cutover, external DNS wildcard resolution, and payment provider activation.



