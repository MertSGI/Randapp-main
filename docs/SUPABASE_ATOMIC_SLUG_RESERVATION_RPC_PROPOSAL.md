# LARI Supabase Boundary & Least-Privilege Atomic Slug Reservation RPC Proposal

## 1. Architectural Boundary: Client-Side Queue vs. Distributed Database Lock

In [`services/siteProvisioningService.ts`](file:///C:/Projects/Randapp-lari-p0-slug-fix-20261029/services/siteProvisioningService.ts), `slugReservationQueue` (`runWithSlugReservationLock`) serializes asynchronous calls inside a **single JavaScript runtime / browser tab**.

- **What `slugReservationQueue` guarantees:** Deterministic in-memory serialization for local `mock` mode (`localStorage`) and protection against same-tab double-click UI races.
- **What `slugReservationQueue` does NOT guarantee:** It is **not** a distributed database lock across separate browser tabs, concurrent user sessions, or server instances, and it **does not prove Supabase multi-client reservation correctness**.

---

## 2. Investigation of `tenantService.updateTenant()` & RLS Constraints

### 2.1 Swallowed Database Errors and 0-Row RLS Rejections
Prior to this correction, [`tenantService.updateTenant()`](file:///C:/Projects/Randapp-lari-p0-slug-fix-20261029/services/tenantService.ts) in `supabase` mode executed:
```ts
const { error } = await supabase.from('tenants').update({ ... }).eq('id', tenantId);
if (error) {
  console.error("Error updating tenant in Supabase:", error);
}
return;
```
This created two critical failure modes:
1. **Swallowed Constraint & Permission Errors:** If PostgreSQL returned `23505` (`unique_violation` on `tenants_slug_key`) or `42501` (`insufficient_privilege`), `updateTenant()` logged to console and resolved normally without throwing.
2. **Silent 0-Row RLS No-Op (`20260714_tenants_update_rls_hardening.sql`):**
   - Migration [`supabase/migrations/20260714_tenants_update_rls_hardening.sql`](file:///C:/Projects/Randapp-lari-p0-slug-fix-20261029/supabase/migrations/20260714_tenants_update_rls_hardening.sql) explicitly dropped `"Tenant Owner UPDATE own tenant"` on `public.tenants` to prevent a `tenant_owner` from directly mutating privileged columns (`plan_id`, `status`, `business_risk_status`, `verification_status`).
   - Only `"Super Admin full access tenants"` remained for direct table `UPDATE` on `public.tenants`.
   - Under PostgREST/PostgreSQL RLS, a direct `UPDATE public.tenants` by an authenticated `tenant_owner` without `.select()` returns `error: null` with **0 rows affected**.
   - Additionally, [`tenantService.getTenantById()`](file:///C:/Projects/Randapp-lari-p0-slug-fix-20261029/services/tenantService.ts) previously read only from `localStorage`, so post-write verification could not inspect the Supabase row.

### 2.2 Client-Side Fail-Closed Fixes Applied
1. [`tenantService.getTenantById()`](file:///C:/Projects/Randapp-lari-p0-slug-fix-20261029/services/tenantService.ts) now queries `supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle()` in `supabase` mode and throws on database error.
2. [`tenantService.getTenantBySlug()`](file:///C:/Projects/Randapp-lari-p0-slug-fix-20261029/services/tenantService.ts) now throws on non-`PGRST116` database errors instead of returning `null` (which previously caused `validateSlug` to misclassify DB outages as free slugs).
3. [`tenantService.updateTenant()`](file:///C:/Projects/Randapp-lari-p0-slug-fix-20261029/services/tenantService.ts) now chains `.select('id, slug')` and **throws** both when `error` is returned (`23505`, `42501`, etc.) and when `rows.length === 0` (`PGRST_ZERO_ROWS_RLS`).
4. [`siteProvisioningService.reserveTenantSlug()`](file:///C:/Projects/Randapp-lari-p0-slug-fix-20261029/services/siteProvisioningService.ts) catches all errors from `getTenantById`, `getTenantBySlug`, and `updateTenant` and fails closed (`return false`), never reporting `true` when database persistence fails or affects 0 rows.

---

## 3. Proposed Least-Privilege Atomic RPC (`public.reserve_tenant_slug`)

- **Proposal SQL File:** [`supabase/proposals/20261030_proposed_reserve_tenant_slug_atomic_rpc.sql`](file:///C:/Projects/Randapp-lari-p0-slug-fix-20261029/supabase/proposals/20261030_proposed_reserve_tenant_slug_atomic_rpc.sql) *(Not deployed or executed; `supabase/migrations/` remains untouched).*
- **Client Binding:** [`siteProvisioningService.reserveTenantSlugAtomicRpc()`](file:///C:/Projects/Randapp-lari-p0-slug-fix-20261029/services/siteProvisioningService.ts).

### Security & Atomicity Properties
1. **Least-Privilege Column Isolation:** Keeps direct table `UPDATE` on `public.tenants` closed to `tenant_owner` (preserving `20260714_tenants_update_rls_hardening.sql`), while the `SECURITY DEFINER` function (`SET search_path = public, pg_temp`) updates **only** `slug` and `updated_at`.
2. **Strict Membership Check:** Verifies `auth.uid()` holds an active `tenant_owner` (or `super_admin`) membership in `public.tenant_memberships` for `p_tenant_id`.
3. **Collision-Only Fallback at the Database Boundary:** Rejects empty, short (`<3`), overlong (`>50`), malformed, and reserved slugs immediately without fallback. Catches PostgreSQL `unique_violation` (`23505`) inside a `BEGIN ... EXCEPTION WHEN unique_violation` block and retries only the 4 canonical suffixes (`-studio`, `-guzellik`, `-salon`, `-tr`) that fit within 50 characters.
