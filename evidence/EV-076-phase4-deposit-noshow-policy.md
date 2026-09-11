---
evidence_id: EV-076
claim_type: CLAIM_ONLY
program_id: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
authority_id: LARI-PROGRAM-V2-PHASE3-R1-CORRECTIONS-AND-PHASE4-CONTINUATION-20260911-01
base_canonical_sha: 09bb1f8d8ce070c33d09099a6d0ae20c93787d11
branch_name: aos/phase4-deposit-noshow-policy-foundation
commit_sha: a589e496300e8752d343ce11e8e90e8d0f9ba92c
target_phase: PHASE_4_NODE_1_DEPOSIT_NOSHOW_POLICY
date: 2026-09-11
status: COMPLETED_AND_PUSHED
production_mode: NO_GO
---

# EV-076: Phase 4 Node 1 Deposit & No-Show Policy Foundation

## 1. Summary of Changes
- Implemented `public.deposit_policies` supporting:
  - Tenant default and service-specific overrides via unique constraints and composite foreign key `(service_id, tenant_id)`.
  - Fixed minor-unit amounts and percentage requirements.
  - Integer minor units only (`CHECK (deposit_value >= 0)`).
- Implemented `public.no_show_policies` supporting:
  - Cancellation deadline hours.
  - No-show consequences: `forfeit_deposit`, `strike_record`, `block_booking`, `none`.
  - Refund eligible window hours and late cancellation fees in minor units.
- Implemented `public.appointment_deposits` tracking:
  - Required minor units, currency, and lifecycle statuses (`required`, `held`, `applied`, `forfeited`, `refunded`, `waived`).
  - Refund eligibility states: `eligible_if_cancelled_in_time`, `non_refundable`, `refund_issued`, `forfeited`.
- Strict Domain Separation:
  - Financial requirement evaluation is handled in `public.evaluate_booking_confirmation_deposit_policy` during booking confirmation.
  - Distinct from slot availability (`evaluate_booking_slot`), answering strictly `WHAT_FINANCIAL_OR_POLICY_REQUIREMENT_APPLIES_TO_CONFIRMATION`.
- Administrative RPCs:
  - `public.admin_set_deposit_policy` and `public.admin_set_no_show_policy` protected with explicit role allowlists (`super_admin`, `tenant_owner`), failing closed on missing/unauthorized identities.
  - Hardened search path: `SET search_path = pg_catalog, public`.
- Security & Invariants:
  - Zero live payment gateway activation / zero payment provider SDK mutations.
  - RLS enabled on all three tables with `PUBLIC, anon, authenticated` revoked by default.

## 2. Verification Evidence
- Contract test runner: `scripts/test-phase4-deposit-noshow-contracts.mjs`
- Test execution output: 12/12 contract tests passed.
- Git Commit: `a589e496300e8752d343ce11e8e90e8d0f9ba92c`
- Remote Branch: `origin/aos/phase4-deposit-noshow-policy-foundation`
