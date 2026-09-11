---
evidence_id: EV-078
claim_type: CLAIM_ONLY
program_id: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
authority_id: LARI-PROGRAM-V2-PHASE3-R1-CORRECTIONS-AND-PHASE4-CONTINUATION-20260911-01
base_canonical_sha: 09bb1f8d8ce070c33d09099a6d0ae20c93787d11
branch_name: aos/phase4-giftcards-wallet-foundation
commit_sha: 1965eb65bb2a1e7a973b5d7975bfc4008d841720
target_phase: PHASE_4_NODE_3_GIFTCARDS_WALLET
date: 2026-09-11
status: COMPLETED_AND_PUSHED
production_mode: NO_GO
---

# EV-078: Phase 4 Node 3 Gift Cards & Client Wallet Foundation

## 1. Summary of Changes
- Implemented `public.client_wallets`:
  - Currency-bound balances (`CHECK (balance_minor_units >= 0)`) in integer minor units.
  - Unique composite constraint per customer and currency `(tenant_id, customer_id, currency)`.
- Implemented `public.client_wallet_ledger`:
  - Immutable audit trail recording debits, credits, adjustments, refunds, and redemptions.
  - Full before-and-after minor unit balance verification.
  - Unique tenant-scoped idempotency keys (`uq_client_wallet_ledger_idempotency`).
- Implemented `public.gift_cards`:
  - Capability secrecy preserved: redeemable secret codes stored exclusively as SHA-256 digests (`code_hash`).
  - Public display identifier restricted to `code_last_four`.
  - Balance bound checks (`CHECK (current_balance_minor_units <= initial_balance_minor_units)`).
- Implemented `public.gift_card_redemptions`:
  - Immutable redemption audit trail with idempotency deduplication.
- Concurrency-Safe Transaction Primitives:
  - `public.transact_wallet_balance`: Transaction-bound row-level locking (`SELECT ... FOR UPDATE`), anti-double-spend checks, and idempotent replay handling.
  - `public.redeem_gift_card`: Row-level locking on hashed code lookup, expiry verification, and balance debit.
- Security & Invariants:
  - Role-authorized execution for staff and tenant owners.
  - Hardened fixed search path `SET search_path = pg_catalog, public`.
  - Row Level Security enforced on all 4 tables with public access revoked.
  - Zero live gift-card payment/collection activation.

## 2. Verification Evidence
- Contract test runner: `scripts/test-phase4-giftcards-wallet-contracts.mjs`
- Test execution output: 11/11 contract tests passed.
- Git Commit: `1965eb65bb2a1e7a973b5d7975bfc4008d841720`
- Remote Branch: `origin/aos/phase4-giftcards-wallet-foundation`
