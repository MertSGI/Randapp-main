# EV-P5-NODE2-NODE3 Evidence Register: Phase 5 Parallel Expansion

- **Authority Directives**:
  - Autonomous Multi-Lane Standing Autonomy: `DECISION-020`
  - Program ID: `LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01`
  - Canonical Product Base: `09bb1f8d8ce070c33d09099a6d0ae20c93787d11`
  - Node 1 Upstream Base: `0368c9d17eba52049fe3e78a203282656b27af14`
- **Production Status**: `NO_GO`

---

## 1. Phase 5 Node 2: Clinic Practitioner Permissions & Clinical Workspace Hardening

- **Candidate Branch**: `aos/phase5-clinic-practitioners-workspace`
- **Candidate Commit SHA**: `278737303be10da0ce9d89efe54d948a7fb46671`
- **Parent / Base**: `0368c9d17eba52049fe3e78a203282656b27af14` (Node 1)
- **Remote Push**: `origin/aos/phase5-clinic-practitioners-workspace` verified.
- **Migration**: `20260928_phase5_clinic_practitioners_workspace_hardening.sql`
- **Implementation & Invariants**:
  1. Reused canonical `clinic_staff_profiles` and `resolve_tenant_vertical_context`.
  2. Hardened `clinic_set_staff_profile` to strictly verify subscription eligibility and `clinic_enabled = true`.
  3. Enforced note-writing implies record-viewing invariant (`can_write_clinical_notes = true` forces `can_view_clinical_records = true`).
  4. Hardened `clinic_get_my_context` to fail closed with `clinic_vertical_disabled` if tenant subscription is inactive or missing clinic vertical entitlement.
  5. Recorded audit events with zero clinical narrative or sensitive PII.
  6. Permissions revoked from `PUBLIC` and `anon`; granted to `authenticated` and `service_role`.
  7. TypeScript validation: `tsc --noEmit` clean (0 errors).
  8. Contract test suite `scripts/test-phase5-clinic-practitioner-contracts.mjs`: 9/9 contracts PASSED.
- **Node 2 Gate Status**: `AOS_STANDING_AUTHORITY_ACCEPTED`

---

## 2. Phase 5 Node 3: Health Tourism Treatment Journey, Quote & Itinerary Domain

- **Candidate Branch**: `aos/phase5-ht-journey-domain`
- **Candidate Commit SHA**: `920fdd05cf3073d675b34f878a2c5df3211bf9b7`
- **Parent / Base**: `0368c9d17eba52049fe3e78a203282656b27af14` (Node 1)
- **Remote Push**: `origin/aos/phase5-ht-journey-domain` verified.
- **Migration**: `20260928_phase5_ht_treatment_journey_quote_itinerary.sql`
- **Implementation & Invariants**:
  1. Implemented `public.ht_treatment_journeys` with composite uniqueness `(id, tenant_id)`, status lifecycle check, and foreign keys to `ht_leads`, `customers`, and `staff`.
  2. Implemented `public.ht_journey_quotes` with currency, `total_amount_minor_units INTEGER NOT NULL`, version auto-increment, and composite FK.
  3. Implemented `public.ht_journey_itinerary_events` with categorized event types and strict chronological validation (`scheduled_end >= scheduled_start`).
  4. RLS enabled on all three tables; direct browser mutation policies strictly denied (`USING (false)`).
  5. Implemented server-authoritative RPC `ht_create_treatment_journey` with vertical eligibility check and `max_active_journeys` quota enforcement.
  6. Implemented server-authoritative RPC `ht_create_or_update_journey_quote` auto-incrementing version and advancing journey state to `quote_sent`.
  7. Implemented server-authoritative RPC `ht_add_journey_itinerary_event` for coordinator scheduling.
  8. TypeScript types updated in `types/healthTourism.ts`; `tsc --noEmit` clean (0 errors).
  9. Contract test suite `scripts/test-phase5-ht-journey-contracts.mjs`: 9/9 contracts PASSED.
- **Node 3 Gate Status**: `AOS_STANDING_AUTHORITY_ACCEPTED`
