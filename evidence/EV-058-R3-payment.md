---
evidence_id: EV-058-R3
claim_type: CLAIM_ONLY
program_id: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
authority_id: LARI-PROGRAM-V2-PHASE3-FINAL-CORRECTIONS-AND-PHASE4-INTEGRATION-20260911-01
base_canonical_sha: 10787e72fb3400d62a00cd0eda421f2b129e8fe5
branch_name: aos/phase3-provider-neutral-payment-foundation-r3
commit_sha: f1f0b19711b37c499de953982bc14d96b7d92bb6
target_phase: PHASE_3_LANE_PROVIDER_NEUTRAL_PAYMENT
date: 2026-09-11
status: COMPLETED_AND_PUSHED
production_mode: NO_GO
---

# EV-058-R3: Provider-Neutral Payment Foundation (R3 Unique Provider Reference Ownership Correction)

## 1. Summary of Corrections
- Enforced strict provider-scoped reference ownership:
  - Replaced non-unique index with `CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_intents_provider_reference ON public.payment_intents(provider_id, provider_reference) WHERE provider_id IS NOT NULL AND provider_reference IS NOT NULL`.
  - Guarantees `UNIQUE_PROVIDER_REFERENCE_OWNER=YES`: a trusted external provider reference may bind to at most one payment intent.
- Hardened `public.bind_payment_intent_provider`:
  - Added fail-closed check: if another payment intent already owns `(provider_id, provider_reference)`, rejects immediately with error `PROVIDER_REFERENCE_ALREADY_BOUND`.
  - Transaction-bound row-level locking (`FOR UPDATE`) prevents concurrent binding race conditions (`EXACTLY_ONE_WINS=YES`).
- Preserved:
  - Integer minor units only.
  - Trusted provider binding before callback ingestion.
  - Event replay and out-of-order protection.
  - Monotonic terminal state preservation.
  - Service-role mutation boundaries.
  - Paymentless release control invariants (no live gateways).

## 2. Verification Evidence
- Contract test runner: `scripts/test-phase3-payment-foundation-contracts.mjs`
- Test execution output: 21/21 contract tests passed.
- Git Commit: `f1f0b19711b37c499de953982bc14d96b7d92bb6`
- Remote Branch: `origin/aos/phase3-provider-neutral-payment-foundation-r3`
