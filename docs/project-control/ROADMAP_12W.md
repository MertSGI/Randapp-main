# 12-Week Master Delivery Roadmap & Phase Matrix

## Master Product Delivery Train Priority

```
LARI CORE
  └── PACKAGE / CUSTOMER CUSTOMIZATION
        └── LARI CLINIC
              └── LARI HEALTH TOURISM
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

| Phase / Layer | Scope / Milestone | Baseline Gate | Status | Evidence Level |
| :--- | :--- | :--- | :--- | :--- |
| **1. LARI Core** | Foundation, Staging, Arming | `P1D.1A` | `CLOSED_PROVEN` | E4 (Shared Staging Live) |
| **1. LARI Core** | Provisioning & Idempotency | `P2A.0` | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **1. LARI Core** | Commercial Contracts & Boundaries | `P2A.1` | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **1. LARI Core** | Onboarding Contracts & Readiness | `P2A.2` | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **1. LARI Core** | Onboarding Handoff | `P2A.3` | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **1. LARI Core** | Domain Architecture Hardening | `CORE-RC.1` | `CLOSED` | E1 (Source Proven) |
| **1. LARI Core** | Paymentless Pilot Authorization | `CORE-RC.2B` | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **1. LARI Core** | Full Browser & UI V2 Runtime Proof | `CORE-RC.3` | `HOLD_PENDING_LITERAL_EXECUTION_TRUTH` | E0 / Pending Input |
| **1. LARI Core** | Release Candidate Finalization | `CORE-RC.4` | `NOT_STARTED` | N/A |
| **2. Package Customization** | Multi-Branch & Tenant Overrides | `PKG-01` | `NOT_STARTED` | N/A |
| **3. LARI Clinic** | Medical Appointment & Clinical Workflows | `CLN-01` | `NOT_STARTED` | N/A |
| **4. LARI Health Tourism** | International Patient & Agency Operations | `HT-01` | `NOT_STARTED` | N/A |
| **5. Final Delivery** | Production Cutover & DNS/Commercial Launch | `LAUNCH-01` | `NOT_STARTED` | N/A |

---

## Detailed Milestone Descriptions

### Phase 1: LARI Core (Current Active Focus)
- **Status**: Substantially Closed. Core database migrations (59 files), RPCs, entitlement resolvers, and onboarding state machine are fully closed and verified on exact product SHA `80297685...`.
- **Remaining Gap**: `CORE-RC.3` runtime proof awaiting real browser E2E runner invocation and UI V2 candidate branch input.

### Phase 2: Package / Customer Customization
- **Status**: Not Started. Depends on full Core-RC stabilization. Will handle tenant-specific branding, custom field extensions, and bespoke package hooks without touching core schema contracts.

### Phase 3: LARI Clinic Package
- **Status**: Not Started. Depends on Package Customization baseline. Extends LARI Core for medical clinics, consultation scheduling, and doctor/treatment availability.

### Phase 4: LARI Health Tourism Package
- **Status**: Not Started. Depends on LARI Clinic package. Extends platform for international patient travel, multi-currency pricing, and agency referral operations.

### Phase 5: Final Delivery
- **Status**: Not Started. Final production cutover, external DNS wildcard resolution, and payment provider activation.
