# LARI - Supabase Auth Paymentless Production Readiness Guide

This guide establishes the production-grade authentication, role-mapping, and RLS dependencies required for launching LARİ under the **paymentless_limited_production** mode.

---

## 1. Authentication Roles and Core Mapping

We map Supabase Auth users to custom application roles to guarantee tenant boundaries and secure workspace administration.

```
                  +------------------------+
                  |  Supabase Auth Users   |
                  +-----------+------------+
                              |
                     [users_profile map]
                              |
         +--------------------+--------------------+
         |                                         |
         v                                         v
+--------+--------+                       +--------+--------+
|  Role: Owner    |                       |Role:Super Admin |
+--------+--------+                       +--------+--------+
         |                                         |
   (tenant_id)                              (global bypass)
```

### Owner Login Requirements
- **Tenant Isolation**: Every salon owner is authenticated via Supabase Auth.
- **`tenant_id` Metadata**: During owner session initialization, the `auth.jwt() ->> 'tenant_id'` claim must be extracted. This is the cornerstone of RLS isolation.
- **Verification Gate**: Owners are blocked from modifying profiles or listings until their Tenant status has been changed to `approved` in the DB.

### Super Admin Role Requirements
- **Administrative Bypass**: The LARİ administrative team requires a global role parameter (`role = 'super_admin'` or a record in `super_admins` table).
- **Manual Activation Route**: Super Admins use our internal pages to trigger the manual transition of tenant subscriptions without executing online credit card payments.
- **Security Constraint**: Under no circumstances should the browser state store a general-purpose Super Admin secret. All admin writes must run through REST endpoints guarded by authenticated JWTs or secure Cloud Run proxies.

---

## 2. Profile and Access Mappings

### `users_profile` Mapping
A standard table `users_profile` matches Auth UUIDs to Tenant scopes:
```sql
CREATE TABLE IF NOT EXISTS users_profile (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT DEFAULT 'staff' CHECK (role IN ('super_admin', 'tenant_owner', 'staff')),
    full_name TEXT,
    onboarding_completed BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

### `tenant_owner` Role Mapping
- The RLS policy for critical operational tables uses the `tenant_id` claim:
  ```sql
  CREATE POLICY "Owner write access" ON services
      FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id'));
  ```

### Staff Role Future Mapping
- Future practitioners will log in with restricted access limits. They will only have read access to their assigned appointments and calendar schedules (`role = 'staff'`).

---

## 3. Public and Self-Service Access Pathways

### Public Booking Anonymous Access
- End-user customers visiting `randevulari.com/<slug>` do not authenticate.
- Public read access is granted anonymously via RLS policies on `business_profiles`, `services`, and `staff`.
- Public appointment insertions (`INSERT`) are permitted anonymously into the `appointments` table but must not reveal existing patient details or other customers' contact details.

### Self-Service Token Access
- Customers modifying or canceling their appointments do so via secure hashed-token links (e.g. `randevulari.com/appointment/manage/:token`).
- Token verification checks against `appointment_access_tokens` to grant transient edit permissions on that single appointment record without full registration.

---

## 4. Service-Role Boundaries

- **Frontend Security (CRITICAL)**: The frontend **MUST NEVER** access or import the Supabase `service_role` key. Doing so disables RLS and permits cross-tenant data leaks.
- **Edge Boundaries**: Administrative schema updates and global statistics aggregations are restricted to backend microservices or Supabase Edge Functions.

---

## 5. Auth Smoke Test Checklist

Before executing the cutover to `paymentless_limited_production`, run this manual verification checklist:

- [ ] **No Local Mock Login**: Verify that signing in with fake credentials does not resolve a session when `VITE_DATA_MODE=supabase`.
- [ ] **Cross-Tenant Prevention**: Log in as Owner A; attempt to retrieve Owner B's catalog page. Verify that a `406 Not Acceptable` or empty list is returned.
- [ ] **Anonymous Insert Block**: Attempt to SELECT from `/rest/v1/appointments` without an auth header. Verify that the response is empty (`[]`).
- [ ] **Service-Role Sweep**: Ensure no references to `service-role-key` exist inside `/src` or `/pages` files.
- [ ] **JWT Validation**: Inspect JWT claims inside the Supabase Console to confirm `tenant_id` is appended correctly during signup.
