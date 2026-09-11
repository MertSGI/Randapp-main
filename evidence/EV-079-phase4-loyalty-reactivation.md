---
evidence_id: EV-079
claim_type: CLAIM_ONLY
program_id: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
authority_id: LARI-PROGRAM-V2-PHASE3-R1-CORRECTIONS-AND-PHASE4-CONTINUATION-20260911-01
base_canonical_sha: 09bb1f8d8ce070c33d09099a6d0ae20c93787d11
branch_name: aos/phase4-loyalty-reactivation-foundation
commit_sha: b95b1827efc200cd5d701a2de50793bc0d72ada2
target_phase: PHASE_4_NODE_4_LOYALTY_REACTIVATION
date: 2026-09-11
status: COMPLETED_AND_PUSHED
production_mode: NO_GO
---

# EV-079: Phase 4 Node 4 Loyalty & Client Reactivation Foundation

## 1. Summary of Changes
- Reuses canonical `public.customers` and `public.tenants` without schema duplication.
- Implemented `public.tenant_loyalty_configs`:
  - Earning rate configuration, minimum redemption thresholds, and point validity windows.
- Implemented `public.customer_loyalty_balances`:
  - Total earned, redeemed, and current available points with non-negative constraints.
- Implemented `public.customer_loyalty_ledger`:
  - Immutable audit trail capturing earn, redeem, adjust, and expire events.
  - Unique tenant-scoped idempotency keys (`uq_loyalty_ledger_tenant_idempotency`).
  - Strict anti-double-spend row-level locking (`SELECT ... FOR UPDATE`).
- Implemented `public.customer_reactivation_events`:
  - Server-authoritative reactivation cohort detection for 60/90-day inactivity intervals.
  - Outbox hook pattern for communication pipeline integration with frequency rules.
  - Zero live SMS/Email/WhatsApp external provider activation.
- Application Service Layer:
  - TypeScript service `services/loyaltyReactivationService.ts` exposing `getLoyaltyProfile`, `earnPoints`, and `redeemPoints`.
- Security & Invariants:
  - Direct table mutations revoked from `PUBLIC, anon, authenticated`.
  - Points operations restricted to internal service role and authorized staff RPCs.
  - Hardened fixed search paths.

## 2. Verification Evidence
- Contract test runner: `scripts/test-phase4-loyalty-contracts.mjs`
- Test execution output: 13/13 contract tests passed.
- Git Commit: `b95b1827efc200cd5d701a2de50793bc0d72ada2`
- Remote Branch: `origin/aos/phase4-loyalty-reactivation-foundation`
