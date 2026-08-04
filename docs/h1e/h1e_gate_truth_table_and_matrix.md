# H1E Gate Truth Table, Authorization & Audit Matrix

This document provides the complete, deterministic release-gate truth table, role authorization matrix, audit/idempotency rules, and negative testing cases for Stage H1E.

---

## 1. Public Booking Release-Gate Truth Table (12 Precedence Tiers)

Evaluation algorithm processes inputs strictly top-to-bottom. The first failing condition sets `primary_reason_code` and returns `allowed = false`.

| Case ID | Global Release Phase | Release Row Exists? | Core Booking Restricted? | Public Site Status | Pilot Authorized? | Sub Status | Readiness Facts | Primary Reason Code (Returned) | All Detected Blockers | Allowed? |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- | :---: |
| **TC-01** | *Any* | ❌ NO | *Any* | *Any* | *Any* | *Any* | *Any* | `RELEASE_CONTROL_UNAVAILABLE` | `[RELEASE_CONTROL_UNAVAILABLE]` | ❌ `false` |
| **TC-02** | `pre_pilot` | ✅ YES | ❌ NO | `published` | ✅ YES | `active` | Valid | `GLOBAL_RELEASE_PHASE_BLOCKED` | `[GLOBAL_RELEASE_PHASE_BLOCKED]` | ❌ `false` |
| **TC-03** | `paymentless_pilot` | ✅ YES | ❌ NO | `published` | ✅ YES | `active` | Valid | `BOOKING_ALLOWED` | `[]` | ✅ `true` |
| **TC-04** | `paymentless_pilot` | ✅ YES | ✅ YES | `published` | ✅ YES | `active` | Valid | `CORE_BOOKING_RESTRICTED` | `[CORE_BOOKING_RESTRICTED]` | ❌ `false` |
| **TC-05** | `paymentless_pilot` | ✅ YES | ❌ NO | `paused` | ✅ YES | `active` | Valid | `PUBLIC_SITE_STATUS_BLOCKED` | `[PUBLIC_SITE_STATUS_BLOCKED]` | ❌ `false` |
| **TC-06** | `paymentless_pilot` | ✅ YES | ❌ NO | `published` | ❌ NO | `active` | Valid | `PILOT_AUTHORIZATION_REQUIRED` | `[PILOT_AUTHORIZATION_REQUIRED]` | ❌ `false` |
| **TC-07** | `paymentless_pilot` | ✅ YES | ❌ NO | `published` | Revoked | `active` | Valid | `PILOT_AUTHORIZATION_REVOKED` | `[PILOT_AUTHORIZATION_REVOKED]` | ❌ `false` |
| **TC-08** | `paymentless_pilot` | ✅ YES | ❌ NO | `published` | ✅ YES | `past_due` | Valid | `SUBSCRIPTION_BLOCKED` | `[SUBSCRIPTION_BLOCKED]` | ❌ `false` |
| **TC-09** | `paymentless_pilot` | ✅ YES | ❌ NO | `published` | ✅ YES | `active` | Staff = 0 | `OPERATIONAL_READINESS_FAILED` | `[OPERATIONAL_READINESS_FAILED]` | ❌ `false` |
| **TC-10** | `paymentless_pilot` | ✅ YES | ✅ YES | `paused` | ❌ NO | `past_due` | Staff = 0 | `CORE_BOOKING_RESTRICTED` | `[CORE_BOOKING_RESTRICTED, PUBLIC_SITE_STATUS_BLOCKED, PILOT_AUTHORIZATION_REQUIRED, SUBSCRIPTION_BLOCKED, OPERATIONAL_READINESS_FAILED]` | ❌ `false` |
| **TC-11** | `full_production` | ✅ YES | ❌ NO | `published` | ❌ NO | `active` | Valid | `BOOKING_ALLOWED` (Pilot enforcement off in prod) | `[]` | ✅ `true` |

---

## 2. Role Authorization Matrix

| RPC / Action | anon | authenticated non-member | staff | tenant_owner | other tenant_owner | super_admin | service_role |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `can_accept_public_booking(p_slug)` | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| `super_admin_get_tenant_pilot_eligibility_snapshot(p_tenant_id)` | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ✅ Allowed | ❌ Denied (auth.uid null) |
| `super_admin_get_tenant_pilot_authorization(p_tenant_id)` | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ✅ Allowed | ❌ Denied (auth.uid null) |
| `super_admin_approve_tenant_pilot(...)` | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ✅ Allowed | ❌ Denied (auth.uid null) |
| `super_admin_revoke_tenant_pilot(...)` | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ✅ Allowed | ❌ Denied (auth.uid null) |
| `super_admin_create_platform_restriction(...)` | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ✅ Allowed | ❌ Denied (auth.uid null) |
| Direct DB Insert/Update on `platform_global_release_control` | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied (RPC only) | ❌ Denied |

---

## 3. Audit Logging & Idempotency Rules

### Audit Event Logging (`audit_events`)
All Super Admin pilot mutations (`super_admin_approve_tenant_pilot` and `super_admin_revoke_tenant_pilot`) MUST transactionally insert exactly one record into `public.audit_events`:

```sql
INSERT INTO public.audit_events (
    tenant_id,
    actor_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    payload,
    created_at
) VALUES (
    p_tenant_id::text,
    v_actor_user_id::text,
    'super_admin',
    'tenant_pilot_approved', -- or 'tenant_pilot_revoked'
    'tenant_pilot_authorization',
    v_authorization_id::text,
    jsonb_build_object(
        'reason', p_reason,
        'idempotency_key', trim(p_idempotency_key),
        'version', v_version
    ),
    now()
);
```

### Idempotency Enforcement (`super_admin_commercial_mutation_idempotency`)
- **Key Check**: Check `public.check_super_admin_idempotency(p_idempotency_key, rpc_name, fingerprint)`.
- **Replay Response**: If key exists with matching RPC and fingerprint, return cached `response_payload` with `'replayed': true`.
- **Conflict Exception**: If key exists with different RPC or fingerprint, raise exception `'IDEMPOTENCY_CONFLICT'` (Error code `P0001`).
- **Record Entry**: Transactionally record result via `public.record_super_admin_idempotency(...)`.

---

## 4. Adversarial Negative Test Matrix

| Test ID | Test Scenario | Input / Vector | Expected Behavior | Verification Assertions |
| :---: | :--- | :--- | :--- | :--- |
| **NEG-01** | Null `auth.uid()` invocation | `select super_admin_approve_tenant_pilot(...)` without JWT | Return `{ success: false, reason_code: 'unauthorized' }` | Zero rows inserted into `tenant_pilot_authorizations` or `audit_events`. |
| **NEG-02** | Non-super-admin caller | Call approval RPC as `tenant_owner` or `staff` JWT | Return `{ success: false, reason_code: 'unauthorized' }` | Auth guard fails at tier 1. |
| **NEG-03** | Empty operator reason | `p_reason = ''` or `p_reason = '   '` | Return `{ success: false, reason_code: 'invalid_reason' }` | SQL `CHECK (trim(approval_reason) != '')` or RPC parameter validation fails. |
| **NEG-04** | Idempotency key reuse conflict | Reuse key with different `p_reason` | Throw SQL Exception `P0001` (Idempotency conflict) | Transaction rolls back completely. |
| **NEG-05** | Approval of ineligible tenant | Call `super_admin_approve_tenant_pilot` when `staff_count = 0` | Return `{ success: false, reason_code: 'OPERATIONAL_READINESS_FAILED' }` | Approval blocked by eligibility check before DB write. |
| **NEG-06** | Revocation of revoked/unapproved tenant | Call `super_admin_revoke_tenant_pilot` on unapproved tenant | Return `{ success: true, replayed: false }` with updated status | Idempotent revocation; audit event recorded. |
| **NEG-07** | Client environment spoofing | Override `VITE_LAUNCH_MODE` in browser console | `can_accept_public_booking` evaluates DB singleton phase | Booking evaluated server-side; client override ignored. |
