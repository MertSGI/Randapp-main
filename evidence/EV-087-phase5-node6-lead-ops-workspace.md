# EV-087 Evidence Register: Phase 5 Node 6 Coordinator Lead Ops Workspace & Treatment Journey Integration

- **Authority Directives**:
  - Standing Autonomy: `DECISION-020`
  - Program ID: `LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01`
  - Canonical Product Base: `09bb1f8d8ce070c33d09099a6d0ae20c93787d11`
  - Upstream Base (Node 3 R2): `58cc2363c958ea52d335793945de16c36b210eed`
- **Production Status**: `NO_GO`

---

## 1. Candidate Specification

- **Branch**: `aos/phase5-ht-lead-ops-workspace`
- **Commit SHA**: `3b472e43473b0d37a3a4e21e21bf2cb47a513012`
- **Remote Ref**: `origin/aos/phase5-ht-lead-ops-workspace`
- **Component Scope**:
  - `components/health-tourism/HtLeadDetailPanel.tsx`
  - `pages/health-tourism/HtCoordinatorWorkspacePage.tsx`
  - `utils/healthTourismService.ts`
  - `scripts/test-phase5-node6-lead-ops-contracts.mjs`

---

## 2. Implemented Features & Invariants Verified

1. **Coordinator Workspace Role Authorization**:
   - Server-authoritative capability resolution via `getMyHtContext()` (`ht_get_my_context` RPC).
   - Coordinators cannot arbitrarily escalate privileges or manage beyond their tenant boundary.
2. **Treatment Journey & Quote Management Integration**:
   - Added service client methods `createTreatmentJourney`, `createOrUpdateJourneyQuote`, `addJourneyItineraryEvent` calling server-authoritative RPCs (`ht_create_treatment_journey`, `ht_create_or_update_journey_quote`, `ht_add_journey_itinerary_event`).
   - Integrated "Yolculuk Başlat" action in `HtLeadDetailPanel` allowing coordinators to initiate a treatment journey for an intake lead.
3. **Strict Converted Status Invariant**:
   - The status `converted` is strictly reserved and cannot be manually selected or set from coordinator status selection controls.
   - Lead status selection enforces canonical transitions.
4. **Zero Direct UI Table DML**:
   - Verified no direct `.from('ht_leads')` or `.from('ht_treatment_journeys')` mutations in UI components.
   - All mutations execute through vetted RPCs with strict tenant authorization.
5. **Contract Test Suite Execution**:
   - `scripts/test-health-tourism-slice3-lead-ops-ai-assist.mjs`: 100% PASSED (all static QA contracts clean).
   - `scripts/test-phase5-node6-lead-ops-contracts.mjs`: 16/16 assertions PASSED.
6. **Typecheck & Build Cleanliness**:
   - `tsc --noEmit` cleanly passes with 0 type errors.
