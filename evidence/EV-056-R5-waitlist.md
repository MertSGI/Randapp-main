---
evidence_id: EV-056-R5
claim_type: CLAIM_ONLY
program_id: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
authority_id: LARI-PROGRAM-V2-PHASE3-FINAL-CORRECTIONS-AND-PHASE4-INTEGRATION-20260911-01
base_canonical_sha: 83116c659dd9d2ab238a5a02c9f9bf70eab58d0a
branch_name: aos/phase3-waitlist-foundation-r5
commit_sha: fae1d76518fc63b47dda7118bdebc66ca5a20ba7
target_phase: PHASE_3_LANE_WAITLIST
date: 2026-09-11
status: COMPLETED_AND_PUSHED
production_mode: NO_GO
---

# EV-056-R5: Waitlist Foundation (R5 Fail-Closed Anti-Abuse and Branch-Scoped Access Correction)

## 1. Summary of Corrections
- Removed fail-open anti-abuse behavior in `public.join_booking_waitlist`:
  - Eliminated `WHEN undefined_function OR undefined_table THEN NULL` silent bypass.
  - Required anti-abuse infrastructure now fails closed (`RAISE EXCEPTION 'RATE_LIMITER_UNAVAILABLE: Required anti-abuse infrastructure missing' USING ERRCODE = '55000'`).
- Aligned sanitized waitlist listing `public.get_sanitized_waitlist_entries` with real branch permissions:
  - `tenant_owner` / `super_admin`: allowed full tenant-wide waitlist access.
  - `staff`: restricted strictly to waitlist entries where requested `branch_id` or `offered_branch_id` matches an assigned branch in `public.staff_branches` joined on canonical `s.user_profile_id = v_caller_uid`.
  - Ordinary staff lacking assigned branch access cannot inspect whole-tenant customer phone, email, and intake notes.
- Maintained:
  - All-or-nothing quota ordering (quota checked and consumed after slot validation).
  - Cryptographic token hashing (`offer_waitlist_slot`).
  - Strict state transition machine (`trg_enforce_waitlist_state_transition`).
  - Fixed search paths and public revoke.

## 2. Verification Evidence
- Contract test runner: `scripts/test-phase3-waitlist-contracts.mjs`
- Test execution output: 22/22 contract tests passed.
- Git Commit: `fae1d76518fc63b47dda7118bdebc66ca5a20ba7`
- Remote Branch: `origin/aos/phase3-waitlist-foundation-r5`
