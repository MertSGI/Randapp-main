# H1E Architecture Decision Record (ADR)
## Canonical Release Control & Paymentless Pilot Gate Architecture

- **Status**: APPROVED / FROZEN DESIGN
- **Stage Baseline**: `c2e07572fd31080f8cfffb4cb7faaf9e0122ec80` (Migration Parity: 46/46)
- **Target Release Mode**: `paymentless_limited_production`
- **Hard Decision Constants**: `PRODUCTION_NO_GO`, `PAYMENTS_DISABLED`, `IYZICO_DISABLED`, `CHECKOUT_DISABLED`

---

## 1. Context & Problem Statement

The system currently relies on client-side environment flags (`VITE_LAUNCH_MODE`, `VITE_PAYMENT_MODE`) and browser `localStorage` (`lari_pilot_customers`) for pilot tracking, while the server-side RPC `can_accept_public_booking` evaluates only basic site status (`published`). This presents an architectural security gap: a malicious client or direct RPC call could bypass frontend guards. 

Stage H1E establishes a **server-enforced, fail-closed release control framework** ensuring that no tenant can accept public bookings in paymentless limited live mode without explicit, auditable Super Admin pilot authorization stored in PostgreSQL.

---

## 2. Resolved Decisions (Q1 – Q7)

### Q1 — Global Release Control Storage & Invariants
- **Decision**: Store global release configuration in a dedicated singleton table `platform_global_release_control` (`CHECK (id = 1)`). Reject key-value or JSON settings tables.
- **Fail-Closed Semantics**: If the singleton row is missing, `can_accept_public_booking` fails closed immediately with primary reason `RELEASE_CONTROL_UNAVAILABLE` (`allowed = false`).
- **Migration 47 Default State**: Seed exactly one row with `release_phase = 'pre_pilot'`, `is_production_authorized = false`, `is_pilot_enforcement_required = true`, `is_payment_collection_enabled = false`, `is_checkout_enabled = false`, `is_iyzico_enabled = false`.
- **Invariants**:
  - `is_checkout_enabled = true` REQUIRES `is_payment_collection_enabled = true`.
  - `is_iyzico_enabled = true` REQUIRES `is_checkout_enabled = true` AND `is_payment_collection_enabled = true`.
  - `release_phase = 'paymentless_pilot'` REQUIRES `is_payment_collection_enabled = false`, `is_checkout_enabled = false`, and `is_iyzico_enabled = false`.
  - Production authorization (`is_production_authorized = true`) MUST NEVER implicitly enable payments.

### Q2 — Pilot Authorization History & Concurrency
- **Decision**: Model pilot approvals as an append-only authorization cycle history in `tenant_pilot_authorizations`. Reject overwriting single tenant rows.
- **Active Authorization Definition**: An active authorization cycle is a record where `revoked_at IS NULL` and `is_approved = true`.
- **Uniqueness Constraint**: Partial unique index `CREATE UNIQUE INDEX idx_tenant_pilot_auth_active_unique ON tenant_pilot_authorizations (tenant_id) WHERE revoked_at IS NULL;` guarantees at most one active authorization cycle per tenant.
- **Concurrency Control**: Use tenant-scoped transaction advisory locks `PERFORM pg_advisory_xact_lock(hashtextextended('tenant_pilot_authorizations:' || p_tenant_id::text, 777777));` and row-level locking (`FOR UPDATE`). Avoid table-wide locks.
- **Recalculation**: Technical eligibility is recalculated dynamically at booking evaluation time; authorization grants rights but does not bypass technical checks.

### Q3 — Deterministic Public Booking Precedence
- **Decision**: Evaluate public booking availability using a single, strict 12-tier precedence hierarchy. Return one deterministic primary reason code and an array of all detected blockers.
- **Precedence Hierarchy**:
  1. `RELEASE_CONTROL_UNAVAILABLE` (Missing singleton table/row)
  2. `GLOBAL_RELEASE_PHASE_BLOCKED` (System in `pre_pilot` phase)
  3. `TENANT_NOT_FOUND` (Invalid tenant ID / slug)
  4. `TENANT_INACTIVE` (Tenant row soft-deleted or inactive)
  5. `CORE_BOOKING_RESTRICTED` (Active `platform_system_restrictions` row on `core_booking`)
  6. `PUBLIC_SITE_STATUS_BLOCKED` (`public_site_status` != `'published'`)
  7. `PILOT_AUTHORIZATION_REQUIRED` (No active authorization cycle exists in `tenant_pilot_authorizations`)
  8. `PILOT_AUTHORIZATION_REVOKED` (Latest authorization cycle was explicitly revoked)
  9. `SUBSCRIPTION_BLOCKED` (`subscriptions.status` not in active/trialing/comped/manual_active)
  10. `REQUIRED_ENTITLEMENT_BLOCKED` (Quota exceeded or feature disabled)
  11. `OPERATIONAL_READINESS_FAILED` (Missing primary branch, active service, or active staff)
  12. `BOOKING_ALLOWED` (All 11 gates pass)

### Q4 — Migration Boundaries (Forward-Only Sequence)
- **Migration 47 / Stage H1E-A**:
  - `platform_global_release_control` table + safe default row.
  - Read helper functions & `super_admin_get_tenant_pilot_eligibility_snapshot` RPC.
  - Read-only grants; NO authorization mutation RPCs; NO public booking behavior changes.
- **Migration 48 / Stage H1E-B**:
  - `tenant_pilot_authorizations` table & partial unique index.
  - Read authorization RPC `super_admin_get_tenant_pilot_authorization`.
  - Mutation RPCs `super_admin_approve_tenant_pilot` & `super_admin_revoke_tenant_pilot`.
  - Audit logging to `audit_events` and idempotency storage in `super_admin_commercial_mutation_idempotency`.
- **Migration 49 / Stage H1E-C**:
  - Update `can_accept_public_booking` to enforce pilot approval & global release controls.
  - Fail-closed reason codes; zero payment enablement.

### Q5 — Super-Admin Authorization & Identity
- **Repository Pattern Reuse**: Reuse canonical helper `public.is_super_admin(v_actor_id)` defined in Migration 8 (`20260619_lari_rls_policy_draft.sql`).
- **Caller Verification**: All Super Admin RPCs must execute `v_actor_id := auth.uid(); IF v_actor_id IS NULL OR NOT public.is_super_admin(v_actor_id) THEN RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized'); END IF;`.
- **Service Role Invariant**: `service_role` execution with null `auth.uid()` MUST BE DENIED for user-facing Super Admin RPCs. `tenant_id IS NULL` alone is rejected as sufficient authorization.

### Q6 — Emergency Shutdown & Decoupled Revocation
- **Decoupled Architecture**: Pilot revocation and platform restriction are separate controls. `super_admin_revoke_tenant_pilot` updates authorization history; it does NOT automatically create a platform restriction row.
- **Defense in Depth**: 
  - Revoking pilot approval causes tier 8 (`PILOT_AUTHORIZATION_REVOKED`) to block booking.
  - Adding a `core_booking` platform restriction causes tier 5 (`CORE_BOOKING_RESTRICTED`) to block booking instantly, overriding any pilot approval.

### Q7 — Idempotency Ledger Selection
- **Repository Reuse**: Reuse `public.super_admin_commercial_mutation_idempotency` table created in Migration 36 (`20260811_h1b_super_admin_commercial_mutations.sql`).
- **Validation**: Table schema (`idempotency_key`, `actor_user_id`, `rpc_name`, `request_fingerprint`, `response_payload`) is completely generic with no RPC name constraints.
- **Helper Integration**: Use `public.check_super_admin_idempotency` and `public.record_super_admin_idempotency` in Migration 48. Migration 47 adds zero idempotency entries.

---

## 3. Rejected Alternatives

1. **Rejected: Storing Release Config in Key-Value JSON Settings Table**:
   - *Reason*: Lacks SQL column-level type safety, default value enforcement, and rigid `CHECK` constraint validation.
2. **Rejected: Overwriting Single Tenant Pilot Rows**:
   - *Reason*: Destroys historical audit trail of who approved/revoked pilots, when, and for what reason.
3. **Rejected: Client Environment Variable Enforcement**:
   - *Reason*: `VITE_LAUNCH_MODE` can be altered in client runtime. Only server SQL RPCs provide true security boundaries.
4. **Rejected: Combining Migration 47, 48, and 49 into a Single Script**:
   - *Reason*: Violates incremental staging deployment safety. Read contracts must be verified before mutation contracts and booking enforcement.

---

## 4. Stage & Migration Boundaries

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ MIGRATION 47 (Stage H1E-A) - READ CONTRACTS & RELEASE CONTROL           │
│ - Table: platform_global_release_control (Seeded with safe row)        │
│ - RPC: super_admin_get_tenant_pilot_eligibility_snapshot(p_tenant_id)   │
│ - Safety: Read-only, no mutation RPCs, no booking enforcement changes   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ MIGRATION 48 (Stage H1E-B) - PILOT AUTHORIZATION MUTATIONS              │
│ - Table: tenant_pilot_authorizations (Partial unique index)            │
│ - RPC: super_admin_get_tenant_pilot_authorization(p_tenant_id)         │
│ - RPC: super_admin_approve_tenant_pilot(p_idemp, p_tenant_id, p_reason)│
│ - RPC: super_admin_revoke_tenant_pilot(p_idemp, p_tenant_id, p_reason) │
│ - Audit: Insert to audit_events & super_admin_commercial_idempotency    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ MIGRATION 49 (Stage H1E-C) - PUBLIC BOOKING PILOT ENFORCEMENT           │
│ - RPC Update: can_accept_public_booking(p_slug)                         │
│ - Safety: Enforces 12-tier precedence hierarchy, fail-closed default     │
└─────────────────────────────────────────────────────────────────────────┘
```
