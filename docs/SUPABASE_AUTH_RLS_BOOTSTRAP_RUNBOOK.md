# LARİ - Supabase Auth & RLS Bootstrap Runbook

This runbook documents the sequential engineering checklist, procedures, and architectural mappings required to bootstrap Supabase Authentication and Row Level Security (RLS) for the Turkish salon software platform **LARİ** under **paymentless_limited_production** mode.

---

## 1. Architectural Role Mapping & Hierarchy

Authentication states in LARİ are resolved via `public.users_profile` lookup mapped to `auth.uid()`. Under this model, **we do not require or rely on custom JWT claims in the Auth token**, making local, staging, and production bootstrapping completely self-contained and stable without complex database-level triggers.

The canonical roles registered in `public.users_profile.role` are:

| Role Name | Scope | Description |
| :--- | :--- | :--- |
| `super_admin` | Platform-wide | Bypass RLS policies on all tables. Authorized to perform global actions. |
| `tenant_owner` | Tenant-scoped | Full read/write within their specified `tenant_id` namespace. Equivalent to `'tenant_owner'`. |
| `admin` | Tenant-scoped | Full operational read/write access (catalog, staff, slots) within their tenant workspace. |
| `staff` | Tenant-scoped | Restricted operational read access (assigned appointments and calendars). |
| `customer` | Tenant-scoped | Access limited to own reservations, customer profile, and personal history logs. |

---

## 2. Bootstrapping Steps for Staging / Live

Follow these exact steps when launching a fresh Supabase staging database:

### Step 2.1: Supabase CLI Connection & Schema Application
1. **Initialize CLI link** to the remote project:
   ```bash
   supabase link --project-ref <staging-supabase-project-id>
   ```
2. **Push active migrations**: Ensure migrations are fully applied in the sequence mandated in `/supabase/MIGRATION_APPLY_MANIFEST.md`:
   ```bash
   supabase db push
   ```
3. **Verify static graph**: Run the preflight static dry-run parser to capture any broken syntax or mismatched blocks:
   ```bash
   npm run qa:supabase-active-migration-path
   npm run qa:supabase-migration-integrity
   ```

### Step 2.2: Staging Auth Configuration
1. Go to **Supabase Dashboard > Authentication > Providers > Email**.
2. **Enable Email Signup** and set the SMTP config (in staging/live only; use dummy placeholders during dry runs).
3. Under **Authentication > Templates**, customize confirmation email paths to map `https://randevulari.com`.
4. **Disable external registration** if you want to strictly control salon onboarding manually, or keep it open for self-service signup.

### Step 2.3: Creating the Super Admin Auth User
1. Go to **Supabase Dashboard > Authentication > Users > Add User**.
2. Create a user (e.g., `admin-staging@randevulari.com`).
3. Copy the newly generated **User ID (UUID)**.
4. Execute the following SQL in the **Supabase SQL Editor** to insert the corresponding Super Admin profile:
   ```sql
   -- Paste the Copied UUID as the id parameter
   INSERT INTO public.users_profile (id, tenant_id, name, role, active)
   VALUES ('<PASTED-SUPER-ADMIN-UUID>', NULL, 'Lari Staging Super Admin', 'super_admin', true)
   ON CONFLICT (id) DO UPDATE SET role = 'super_admin';
   ```

### Step 2.4: Creating the Tenant Owner Auth User
1. Go to **Supabase Dashboard > Authentication > Users > Add User**.
2. Create a fictional salon owner user (e.g., `melis-salon@example.com` representing our active pilot tenant **Melis Güzellik & Nail Art**).
3. Copy the newly generated **User ID (UUID)**.
4. Execute the following SQL to provision the Tenant and the Owner profile context:
   ```sql
   -- Create Tenant first
   INSERT INTO public.tenants (id, slug, name, status)
   VALUES ('aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', 'melis-guzellik', 'Melis Güzellik & Nail Art', 'active')
   ON CONFLICT (id) DO NOTHING;

   -- Link owner UUID to Tenant ID
   INSERT INTO public.users_profile (id, tenant_id, name, role, active)
   VALUES ('<PASTED-TENANT-OWNER-UUID>', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', 'Melis Owner', 'tenant_owner', true)
   ON CONFLICT (id) DO UPDATE SET tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', role = 'tenant_owner';
   ```

---

## 3. Row Level Security (RLS) Operational Boundaries

### 3.1 Public Booking Anonymous Access Boundary
- **Table Reading**: Public anonymous users (`TO public`, `TO anon`) can access published business profiles, active services, staff, and availability rules to map open slots.
- **Table Insertion**: Public anonymous users can create records in `appointments` and `customers` during reservation checkout.
- **Information Leaks Block**: No anonymous read access is allowed on `appointments` or `customers`. Attempting to retrieve lists returns empty data arrays (`[]`) preventing consumer exposure.

### 3.2 Customer Self-Service Token Boundary
- Users modifying or cancelling their reservation act anonymously via a specific token link (e.g., `/appointment/manage/:token`).
- Permissions are granted using RLS on `appointment_access_tokens` that verify standard UUID token matching. No standard user registration is required for these guest modifications.

### 3.3 Serverless Service-Role Boundaries
- **Frontend Isolation**: The Supabase `service_role` bypass key **MUST NEVER** exist inside the frontend bundle. Doing so disables RLS completely and leaks multi-tenant data.
- **REST Limits**: Staging/production REST requests from the browser must only use the public `anon` key. Elevated database writes are locked behind secure serverless proxies or Edge functions on isolated containers.

---

## 4. Rollback and Disaster Reset Steps

In case of a security leakage or broken migrations during staging:

1. **Transaction Isolation**: All schema additions are wrapped inside transactions where supported.
2. **Manual Cleanup Execution**:
   ```sql
   -- Clean test fixtures from active staging
   DELETE FROM public.appointments WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
   DELETE FROM public.users_profile WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa' OR id = '<SUPER-ADMIN-UUID>';
   DELETE FROM public.tenants WHERE id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
   ```
3. **Full Database Re-migration**: If the staging database schema is corrupted, trigger a complete rebuild (Warning: this wipes non-seeded staging logs):
   ```bash
   # Execute only on staging, never production!
   supabase db reset --remote
   ```

---

## 5. Pre-launch Stop Conditions (Safety Gates)

Do not cut over to production or mark a staging smoke test as "Passed" if:
1. **Unsafe duplicate tables** exist (e.g., a redundant initial schema file was loaded).
2. **Service role keys** are identified anywhere in `/src` or `/components`.
3. **No-card copies or trial limits** are shown on user billing screens (paymentless limited production means manual backend-controlled billing, online card fields must remain completely hidden).
4. **Turkey domain strategy** is bypassed (all public booking URL lookups must bind to `randevulari.com`).
