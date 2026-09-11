# EV-CORR-P3P4-01 & EV-P5-NODE1 Evidence Register

- **Authority Directives**:
  - Independent Controller Ruling: `ACCEPTED_WITH_EVIDENCE_METADATA_CORRECTIONS`
  - Standing Autonomy: `DECISION-020`
  - Program ID: `LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01`
- **Control Plane Reference**: `d7db5786050b2750f4b45ca70e25b6d889b33d01`
- **Postgres Acceptance Run**: GitHub Actions `34620971501` (Job `103334549721`)
- **Production Status**: `NO_GO`

---

## Part 1: Append-Only Evidence Metadata Correction (P3/P4 Postgres Acceptance)

Independent Controller inspection of GitHub Actions Run `34620971501` confirmed runtime proof with the following canonical metadata corrections:

1. **Migration Count & Final Migration**:
   - `TOTAL_MIGRATIONS=84`
   - `ALL_84_MIGRATIONS_SUCCESSFULLY_APPLIED=YES`
   - Final Migration: `20260926_phase4_giftcards_wallet_foundation.sql` (not merely `20260925_phase4_loyalty_reactivation_foundation.sql`).
2. **Node Test Runtime Classification**:
   - `PRODUCT_TEST_NODE_RUNTIME=v20.20.2` (npm 10.8.2) under `actions/setup-node`.
   - Distinct from GitHub Actions internal workflow runner runtime (Node 24 warning).
3. **Postgres Replay Qualification**:
   - Classification: `REAL_POSTGRES_RUNTIME_PROOF_WITH_MANAGED_RUNTIME_AND_HISTORICAL_REPLAY_FIXTURES`
   - Real PostgreSQL execution verified on `supabase/postgres:15.1.0.147` container with canonical fixtures:
     - `supabase/tests/fixtures/p2a_managed_runtime_bootstrap.sql`
     - `supabase/tests/fixtures/p2a_historical_replay_bridge_before_migration_38.sql`
     - Composite key prerequisites (`uq_appointments_id_tenant`, `uq_payment_intents_id_tenant`, `customer_segments` relation alignment).
4. **Gate Status**:
   - `P3P4_RUNTIME_GATE=ACCEPTED_QUALIFIED_E2_EXECUTABLE_CI`
   - 14/14 domain contract suites passed; 13 functions verified `SECURITY DEFINER`; composite FKs, checks, and unique constraints verified on live Postgres.

---

## Part 2: Phase 5 Node 1 (Vertical SKUs & Commercial Packaging) Proof

- **Candidate Branch**: `aos/phase5-vertical-skus-commercial-packaging`
- **Candidate Commit SHA**: `0368c9d17eba52049fe3e78a203282656b27af14`
- **Parent / Base**: `09bb1f8d8ce070c33d09099a6d0ae20c93787d11`
- **Remote Push**: `origin/aos/phase5-vertical-skus-commercial-packaging` verified.
- **Migration**: `20260927_phase5_vertical_skus_commercial_packaging.sql`
- **Implementation & Invariants**:
  1. Reused canonical commercial infrastructure (`public.plans`, `public.plan_versions`, `public.plan_entitlements`, `public.commercial_features`) with zero duplicate commercial tables.
  2. Registered vertical features:
     - Clinic: `clinic_workspace`, `max_practitioners`, `clinic_ai_transcribe`, `clinic_ai_soap_draft`.
     - Health Tourism: `ht_lead_ops`, `ht_multilingual_funnel`, `max_active_journeys`, `max_coordinators`, `ht_agency_network`, `ht_ai_chat`, `ht_journey_quote`.
  3. Seeded vertical plans (`clinic_starter`, `clinic_pro`, `ht_starter`, `ht_enterprise`) with published version 1 entitlements.
  4. Server-authoritative RPC `resolve_tenant_vertical_context(p_tenant_id, p_at)` verifying subscription lifecycle, vertical enablement, and quotas.
  5. Quota enforcement triggers on `clinic_staff_profiles` (`trg_enforce_practitioner_quota_limit`) and `ht_staff_profiles` (`trg_enforce_ht_coordinator_quota_limit`).
  6. Direct mutation permissions revoked from `PUBLIC` and `anon`; granted strictly to `authenticated` and `service_role`.
  7. TypeScript service `VerticalCommercialService` and types updated; `tsc --noEmit` clean.
  8. Contract test suite `scripts/test-phase5-vertical-skus-contracts.mjs`: 13/13 contracts PASSED.
- **Node 1 Gate Status**: `AOS_STANDING_AUTHORITY_ACCEPTED` (Routine technical gate closed autonomously).
