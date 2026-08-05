# H1E-A Runtime Contract Forward-Fix Record

**Stage**: H1E-A — Paymentless Pilot Readiness & Eligibility Read Contracts  
**Target Branch**: `staging/supabase-staging-consistency`  
**Linked Staging Project**: `rwedeejhjazwjthdjzrt`  

---

## 1. Failed Execution Summary

- **Run ID**: `h1e_a_credentialed_run_1785916380590`
- **Result**: Defined: 25 | Executed: 25 | Passed: 8 | Failed: 17
- **Authorization Result**: 6 attempted / 5 passed / 1 failed
- **Behavioral Result**: 19 attempted / 3 passed / 16 failed
- **First Failure**: Test 6 (`Super Admin call allowed with full structured envelope`) returned **HTTP status 400 Bad Request**.

### Runtime Diagnostics Analysis
1. **Negative Path Success**: Unauthenticated/anon calls were correctly denied with HTTP `401`/`403` and PostgreSQL error code `42501` (`insufficient privilege`). Non-super-admin authenticated identities (`nonmember`, `staff`, `owner`, `otherOwner`) correctly received structured `{"success": false, "reason_code": "unauthorized"}` responses.
2. **Super Admin Failure Root Cause**: Super admin RPC execution failed at runtime due to database column mismatches (`services.is_active` vs live `services.active`, `staff.is_active` vs live `staff.active`) and unassigned `RECORD` dereferences (`v_tenant.public_site_status`, `v_sub.id`) when no row was returned.

---

## 2. Immutability of Migration 47

Migration `20260822_h1e_release_control_and_eligibility_read_contracts.sql` was successfully applied and recorded remotely on linked staging project `rwedeejhjazwjthdjzrt` (Remote Parity: **47/47**).

Per database governance rules:
- Migration 47 is **frozen and immutable**.
- All corrections must be delivered via forward-only migration.

---

## 3. Forward-Fix Migration 48 Scope

Migration `20260823_h1e_a_eligibility_runtime_contract_fix.sql` (Migration 48) provides a `CREATE OR REPLACE FUNCTION` update for `public.super_admin_get_tenant_pilot_eligibility_snapshot(uuid)`:

1. **Column Name Alignment**:
   - Replaces `services.is_active` with canonical live column `services.active`.
   - Replaces `staff.is_active` with canonical live column `staff.active`.
   - Preserves `branches.is_active` and `branches.is_primary`.
2. **Safe Scalar State & `FOUND` Checks**:
   - Replaces generic uninitialized `RECORD` dereferencing with explicit scalar variables (`v_tenant_exists`, `v_tenant_status`, `v_public_site_status`, `v_sub_exists`, `v_sub_status`, `v_billing_mode`).
   - Non-existent tenants and tenants without subscriptions complete execution gracefully without throwing unhandled PL/pgSQL runtime exceptions.
3. **Precedence & Envelope Structure**:
   - Implements all 12 reason code precedence levels in strict order (`RELEASE_CONTROL_UNAVAILABLE` through `BOOKING_ALLOWED`).
   - Preserves `pending_h1e_b` transitional authorization state, `authorized = false`, `bookable = false`, and default `pre_pilot` release control state.

---

## 4. Migration Numbering Governance Shift

To accommodate the forward-fix Migration 48:
- **Migration 48**: H1E-A Eligibility Read Contract Runtime Forward Fix
- **Migration 49**: Stage H1E-B Pilot Authorization History & Management RPCs (Previously planned as 48)
- **Migration 50**: Stage H1E-C Public Booking Fail-Closed Enforcement (Previously planned as 49)

---

## 5. Release & Safety Invariants

- **PRODUCTION_NO_GO**: Preserved
- **PAYMENTS_DISABLED**: Preserved
- **CHECKOUT_DISABLED**: Preserved
- **IYZICO_DISABLED**: Preserved
- **Data Mutations**: 0
- **Credentialed Acceptance**: Deferred until Migration 48 is applied remotely.
