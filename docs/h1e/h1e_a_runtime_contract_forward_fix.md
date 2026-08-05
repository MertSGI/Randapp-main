# H1E-A Runtime Contract Forward-Fix Record

**Stage**: H1E-A — Paymentless Pilot Readiness & Eligibility Read Contracts  
**Target Branch**: `staging/supabase-staging-consistency`  
**Linked Staging Project**: `rwedeejhjazwjthdjzrt`  

---

## 1. Candidate Rejection & Audit Log

- **Rejected SHA**: `3ccbbed8e0b2610691a1e622108ac0ea691ca757`
- **Reason for Rejection**: Adversarial inspection identified 8 critical defects:
  1. Missing global release control singleton substituted `pre_pilot` defaults and returned `success = true` instead of failing closed immediately with `RELEASE_CONTROL_UNAVAILABLE`.
  2. `relationship_verification` returned `VERIFIED_SCHEMA_BOUND` derived from tenant-wide counts instead of performing explicit join queries across branches, staff, services, and junction tables.
  3. `resolve_tenant_commercial_eligibility` was called but its result was omitted from `SUBSCRIPTION_BLOCKED` logic.
  4. `eligible` boolean could remain `true` while tenant eligibility blockers (`CORE_BOOKING_RESTRICTED`, `PUBLIC_SITE_STATUS_BLOCKED`, etc.) were present.
  5. `is_pilot_enforcement_required` was read as an independently mutable table value instead of strictly derived from `release_phase`.
  6. Runner dependency cascade did not explicitly block dependent assertions when canonical snapshot failed.
  7. RPC helper returned unredacted `rawText`.
  8. Migration 47 verification checked only file existence, not cryptographic SHA-256 digest.

---

## 2. Immutability of Migration 47 & Cryptographic Verification

Migration `20260822_h1e_release_control_and_eligibility_read_contracts.sql` is frozen and applied remotely on `rwedeejhjazwjthdjzrt` (47/47).
- **Frozen SHA-256 Digest**: `6b4d45b226d16f54d4a4a6357aa7ab36bf836c47966df34c53857a0ec97f1e82`
- Verified by executable QA `test-h1e-a-migration-48.mjs` on every run.

---

## 3. Corrected Migration 48 Scope

Migration `20260823_h1e_a_eligibility_runtime_contract_fix.sql` (Migration 48) provides the authoritative `CREATE OR REPLACE FUNCTION` correction:

1. **Immediate Fail-Closed Missing Singleton Return**:
   Returns `success = false`, `reason_code = RELEASE_CONTROL_UNAVAILABLE`, `blocking_reason_codes = ["RELEASE_CONTROL_UNAVAILABLE"]`, `eligible = false`, `authorized = false`, `bookable = false`, `production_authorized = false`, `pilot_enforcement_active = false`.
2. **Canonical Phase Derivations**:
   - `pre_pilot` -> `prod_auth = false`, `pilot_enforcement_required = false`
   - `paymentless_pilot` -> `prod_auth = false`, `pilot_enforcement_required = true`
   - `full_production` -> `prod_auth = true`, `pilot_enforcement_required = false`
3. **Explicit Join-Based Relationship Proof**:
   Performs explicit JOIN queries across `branches`, `services`, `staff`, `service_branches`, `staff_branches`, and `staff_services`. Returns `status = VERIFIED` only when primary branch has connected staff, connected services, and staff can perform services. Returns `RELATIONSHIP_VERIFICATION_FAILED` otherwise.
4. **Commercial Resolver Integration**:
   Combines subscription table facts with `public.resolve_tenant_commercial_eligibility(p_tenant_id)` result for `SUBSCRIPTION_BLOCKED` evaluation.
5. **Blocker-Consistent `eligible` Boolean**:
   `eligible` is strictly `false` whenever any tenant eligibility blocker (`TENANT_NOT_FOUND`, `TENANT_INACTIVE`, `CORE_BOOKING_RESTRICTED`, `PUBLIC_SITE_STATUS_BLOCKED`, `SUBSCRIPTION_BLOCKED`, `REQUIRED_ENTITLEMENT_BLOCKED`, `OPERATIONAL_READINESS_FAILED`) exists.
6. **Live Column & Scalar Safety**:
   Uses `services.active` and `staff.active` live columns and safe scalar `FOUND` checks.

---

## 4. Runner & Diagnostic Safety

- `callRpcEndpoint` returns safe structured `{ ok, status, data, error: { code, message, details, hint } }` with all fields passed through `redactSecrets`. `rawText` output is eliminated.
- Dependent tests in `test-h1e-a-credentialed-runner.mjs` throw explicit `DEPENDENCY_UNAVAILABLE: canonical eligibility snapshot` error when snapshot acquisition fails.

---

## 5. Governance & Invariants

- **Migration 48**: H1E-A Eligibility Read Contract Runtime Forward Fix
- **Migration 49**: Stage H1E-B Pilot Authorization History & Management RPCs
- **Migration 50**: Stage H1E-C Public Booking Fail-Closed Enforcement
- **PRODUCTION_NO_GO**: Preserved
- **PAYMENTS_DISABLED**: Preserved
- **CHECKOUT_DISABLED**: Preserved
- **IYZICO_DISABLED**: Preserved
