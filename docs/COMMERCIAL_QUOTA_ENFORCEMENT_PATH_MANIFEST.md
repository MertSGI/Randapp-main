# Commercial Quota Enforcement Architecture & Path Manifest
**Authority**: `LARI-PROGRAM-V2-PHASE3-R1-CORRECTIONS-AND-PHASE4-CONTINUATION-20260911-01`  
**Program ID**: `LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01`  
**Baseline Migration**: `20260813_h1c_commercial_eligibility_and_quota_enforcement.sql`  
**Evaluation Target**: Server-Side Enforcement Paths for Plan Quotas  

---

## 1. Architectural Truth & Pre-existing Authority

The canonical repository **already contains** comprehensive server-side commercial quota enforcement implemented in `20260813_h1c_commercial_eligibility_and_quota_enforcement.sql`:
1. `public.resolve_commercial_quota(p_tenant_id, p_feature_key)` determines the effective quota limit from the active subscription and plan version definitions.
2. `public.consume_commercial_usage(p_tenant_id, p_feature_key, p_period_key)` atomically increments usage within a transaction with concurrency safety (`usage_counters`).
3. Database triggers directly intercept INSERT/UPDATE mutations on core domain tables.

---

## 2. Granular Enforcement-Path Manifest

### A. Feature: `max_staff`
- **Mutation Entrypoints**:
  - `INSERT INTO public.staff` (e.g. staff creation in admin or onboarding).
  - `UPDATE public.staff` (specifically when `active` transitions from `false` to `true`).
- **Quota Resolver**: `public.resolve_commercial_quota(NEW.tenant_id, 'max_staff')`.
- **Locking Primitives**: Transactional advisory lock: `pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || ':max_staff', 0))`.
- **Count / Usage Authority**: Authoritative table count query under lock:
  ```sql
  SELECT count(*) FROM public.staff WHERE tenant_id = NEW.tenant_id AND active = true AND id != NEW.id;
  ```
- **Failure Behavior**: Fails closed before commit with `RAISE EXCEPTION 'commercial_quota_exceeded' USING ERRCODE = 'P0001'`.
- **Reactivation Behavior**: Trigger specifically evaluates `OLD.active IS NOT TRUE AND NEW.active IS TRUE`. Reactivating an inactive staff member respects quota limit and aborts if limit is reached.
- **Rollback Behavior**: Mutation transaction aborts; zero staff inserted/updated; zero counters modified.

### B. Feature: `max_services`
- **Mutation Entrypoints**:
  - `INSERT INTO public.services` (e.g. service creation in admin or onboarding).
  - `UPDATE public.services` (specifically when `active` transitions from `false` to `true`).
- **Quota Resolver**: `public.resolve_commercial_quota(NEW.tenant_id, 'max_services')`.
- **Locking Primitives**: Transactional advisory lock: `pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || ':max_services', 0))`.
- **Count / Usage Authority**: Authoritative table count query under lock:
  ```sql
  SELECT count(*) FROM public.services WHERE tenant_id = NEW.tenant_id AND active = true AND id != NEW.id;
  ```
- **Failure Behavior**: Fails closed before commit with `RAISE EXCEPTION 'commercial_quota_exceeded' USING ERRCODE = 'P0001'`.
- **Reactivation Behavior**: Trigger specifically evaluates `OLD.active IS NOT TRUE AND NEW.active IS TRUE`. Reactivating an inactive service respects quota limit and aborts if limit is reached.
- **Rollback Behavior**: Mutation transaction aborts; zero services inserted/updated; zero counters modified.

### C. Feature: `max_branches`
- **Mutation Entrypoints**:
  - `INSERT INTO public.branches` (e.g. branch creation in admin).
  - `UPDATE public.branches` (specifically when `is_active` transitions from `false` to `true`).
- **Quota Resolver**: `public.resolve_commercial_quota(NEW.tenant_id, 'max_branches')`.
- **Locking Primitives**: Transactional advisory lock: `pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || ':max_branches', 0))`.
- **Count / Usage Authority**: Authoritative table count query under lock:
  ```sql
  SELECT count(*) FROM public.branches WHERE tenant_id = NEW.tenant_id AND is_active = true AND id != NEW.id;
  ```
- **Failure Behavior**: Fails closed before commit with `RAISE EXCEPTION 'commercial_quota_exceeded' USING ERRCODE = 'P0001'`.
- **Reactivation Behavior**: Trigger specifically evaluates `OLD.is_active IS NOT TRUE AND NEW.is_active IS TRUE`. Reactivating an inactive branch respects quota limit and aborts if limit is reached.
- **Rollback Behavior**: Mutation transaction aborts; zero branches inserted/updated; zero counters modified.

### D. Feature: `max_monthly_appointments`
- **Mutation Entrypoints**:
  - `public.create_public_booking` / `public.create_booking_with_resources`.
- **Quota Resolver**: `public.resolve_quota_period_key(v_tenant_id, 'max_monthly_appointments')` + `public.resolve_commercial_quota(v_tenant_id, 'max_monthly_appointments')`.
- **Locking Primitives**: Row-level locking on `public.usage_counters` (`SELECT ... FOR UPDATE`) inside `public.consume_commercial_usage`.
- **Count / Usage Authority**: `public.usage_counters.usage_count` partitioned by `(tenant_id, feature_key, period_key)`.
- **Failure Behavior**: When usage reaches or exceeds limit, `consume_commercial_usage` returns `{ "success": false, "reason_code": "quota_exceeded" }`. The calling booking RPC aborts before inserting appointments with reason code `booking_unavailable`.
- **Rollback & Zero-Consumption Invariant**: If booking validation subsequently fails (slot collision, invalid customer data, resource exhaustion), the transaction aborts and the counter increment rolls back completely (`zero consumption on failure`).

---

## 3. Multi-Branch Permissions & Calendar Access Rules

1. **Role Authorization**:
   - `super_admin`: Full central access across all tenants and branches.
   - `tenant_owner`: Authorized for tenant-wide central calendar and all tenant branches.
   - `staff`: Authorized ONLY for branches to which the staff member is explicitly mapped via `public.staff_branches`. Calling `get_branch_calendar_appointments` with `p_branch_id = NULL` does NOT give ordinary staff access to all branches; it restricts results to the staff member's assigned branches.
2. **Primary Branch Invariant**:
   - Matches existing index: `idx_unique_primary_branch_per_tenant` (`WHERE is_primary = true AND is_active = true`).
   - Demotion of other primary branches occurs before insert/update, preventing unique index violation.
   - Safe deactivation RPC checks future active appointments before allowing deactivation.
