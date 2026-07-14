# LARİ - Real Supabase Staging Execution Operator Guide

This operator guide is designed for the technical team and system operators to provision, configure, execute, and verify a real, physical Supabase Staging project for LARİ under the **paymentless_limited_production** (Ödemesiz Kısıtlı Canlı Üretim) launch mode.

---

## 🎯 1. Purpose

To define the strict prerequisite gates, configuration sequences, database migration application steps, auth mappings, and smoke verification protocols required to validate the system on a live persistent staging sandbox.

Note that **iyzico is NOT required** for setting up staging or running these validation flows.

**This execution gate is mandatory before deploying to production.** Passing local mock or static preflight QA does not guarantee live cloud readiness.

---

## 📋 2. Prerequisite Checklist

Before starting, ensure you have:
- [ ] Active Supabase account (free or developer tier).
- [ ] Local environment with Node.js and npm installed.
- [ ] Accessible terminal to run `npm` scripts and Supabase CLI.
- [ ] Visual Studio Code or similar editor to manage the local `.env` file.
- [ ] All static preflight scripts passing locally (`npm run qa:supabase-migration-integrity`, `npm run qa:supabase-active-migration-path`, `npm run qa:supabase-auth-rls-bootstrap`).

---

## 🏗️ 3. Step-by-Step Staging Setup

### Step A: Create Supabase Staging Project
1. Log in to the [Supabase Dashboard](https://supabase.com/dashboard).
2. Click **New Project** and select your organization.
3. Set the project parameters:
   - **Name**: `lari-staging` or `lari-sandbox`
   - **Database Password**: Generate a strong password and save it securely.
   - **Region**: Choose a region close to Turkey (e.g., `Frankfurt` or `London`).
   - **Pricing Plan**: Free or Developer tier.
4. Click **Create new project** and wait for provisioning to complete (~1-2 minutes).

### Step B: Copy Credentials to Local `.env` ONLY
1. Navigate to **Project Settings -> API** in your Supabase project.
2. Retrieve the following credentials:
   - **Project URL** (e.g., `https://xxxx.supabase.co`)
   - **Anon Public API Key** (`anon` `public` JWT)
   - **Service Role Key** (`service_role` `secret` - **NEVER expose this to frontend code**)
3. Open your local `.env` file (ensure it is listed in `.gitignore` so secrets are never committed) and configure it as follows:

```env
# ==========================================
# Frontend Staging Configuration
# ==========================================
VITE_LAUNCH_MODE=paymentless_limited_production
VITE_DATA_MODE=supabase_staging
VITE_PAYMENT_MODE=disabled
VITE_COMMUNICATION_MODE=local_outbox_only
VITE_PUBLIC_BASE_DOMAIN=randevulari.com
VITE_APP_BASE_URL=http://localhost:3000
VITE_PUBLIC_SITE_BASE_URL=http://localhost:3000

# Public Staging Connection Credentials
VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-public-key>

# ==========================================
# Backend / Administrative Use ONLY 
# (NEVER commit, NEVER expose to client)
# ==========================================
# SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

> ⚠️ **CRITICAL SECURITY RULE**: Do not prefix `SUPABASE_SERVICE_ROLE_KEY` with `VITE_`. Exposing this secret key to browser clients bypasses all RLS policies and presents an absolute database security violation.

---

## 💾 4. Database Migration Sequence

To prevent schema conflicts or duplication bugs, apply the migrations sequentially as defined in `/supabase/MIGRATION_APPLY_MANIFEST.md`.

### Execution Steps:
1. **Link to Remote Staging**:
   ```bash
   npx supabase link --project-ref <your-supabase-project-ref-id>
   ```
2. **Push Migration Files**:
   ```bash
   npx supabase db push
   ```
   *Alternative*: Copy the migration contents from `/supabase/migrations/` in exact alphabetical order and execute them in the **Supabase SQL Editor**.

### Canonical Sequence to Apply:
1. `001_initial_schema.sql` (Database baseline)
2. `002_subscription_alignment.sql`
3. `003_provisioning_onboarding.sql`
4. `004_iyzico_provider_alignment.sql`
5. `005_salon_business_profile.sql`
6. `20260601_lari_core_schema_alignment.sql`
7. `20260619_lari_rls_policy_draft.sql`
8. `20260620_paymentless_production_core_tables.sql`
9. `20260621_paymentless_production_repository_columns.sql`
10. `20260622_paymentless_production_rls_identity_alignment.sql`
11. `20260713_communication_outbox_rls_hardening.sql`
12. `20260714_tenants_update_rls_hardening.sql`

---

## 🔐 5. Auth User Creation & Identity Mapping

We must establish the primary administrative identities under the canonical model (`users_profile` linked 1:1 to `auth.users`).

### Step A: Configure Auth Providers
1. Go to **Authentication -> Providers -> Email** in the Supabase Dashboard.
2. Turn ON **Enable Email Provider**.
3. (Optional for easy testing) Turn OFF **Confirm Email** to allow instant logins with test accounts.
4. Go to **Authentication -> URL Configuration** and set the site URL or Redirect URLs to match `https://randevulari.com` or `http://localhost:3000`.

### Step B: Create Auth Users
Go to **Authentication -> Users** and click **Add User -> Create User**:
1. **Super Admin**:
   - Email: `superadmin@randevulari.com`
   - Password: [Set a secure password]
   - Copy the generated **User UUID**.
2. **Tenant Owner**:
   - Email: `melis-owner-staging@example.com`
   - Password: [Set a secure password]
   - Copy the generated **User UUID**.

### Step C: Execute SQL Profile Mapping
Paste and execute the following script in the **Supabase SQL Editor** to bind these auth identities to the database profile table:

```sql
-- Map Super Admin Profile (platform-level, tenant_id = NULL)
INSERT INTO public.users_profile (id, tenant_id, name, role, active)
VALUES (
  '<PASTED-SUPER-ADMIN-UUID>',
  NULL,
  'LARİ Super Admin',
  'super_admin',
  true
)
ON CONFLICT (id) DO UPDATE
SET tenant_id = NULL,
    role = 'super_admin',
    active = true;

-- Map Tenant Owner Profile to Melis Güzellik Tenant
INSERT INTO public.users_profile (id, tenant_id, name, role, active)
VALUES (
  '<PASTED-TENANT-OWNER-UUID>',
  'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa',
  'Melis Owner',
  'tenant_owner',
  true
)
ON CONFLICT (id) DO UPDATE
SET tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa',
    role = 'tenant_owner',
    active = true;
```

---

## 🌱 6. Seeding test fixtures and executing RLS tests

To make staging fully interactive, execute the transaction-safe SQL seeds and security rules.

### Step A: Apply Seed Data
1. Open `/supabase/seed/paymentless_staging_seed.sql`.
2. Copy the entire file contents.
3. Paste and run it inside the **Supabase SQL Editor** to populate lookups, catalogs, branches, working hours, and services for the `melis-guzellik` tenant.

### Step B: Run RLS Isolation Assertions
To verify that cross-tenant leaks are mathematically impossible:
1. Open `/supabase/tests/paymentless_production_rls_smoke.sql`.
2. Copy the contents and execute them in the **Supabase SQL Editor**.
3. Verify that the script completes with zero errors and matches all isolation criteria.

---

## 📡 7. Programmatic & Browser Smoke Verification

Once data is seeded and credentials are set in `.env`, execute smoke tests.

### Command Line Verification (Strictly Safe):
- **Preflight Check**:
  ```bash
  npm run qa:supabase-staging-env
  ```
- **Read-Only Anon check**:
  ```bash
  npm run smoke:supabase-paymentless-staging -- --read-only
  ```
- **Fictional Write Smoke (Requires explicit write flag)**:
  ```bash
  npm run smoke:supabase-paymentless-staging -- --write-staging-fixtures
  ```
- **Staging Cleanup (Requires explicit cleanup flag)**:
  ```bash
  npm run smoke:supabase-paymentless-staging -- --cleanup-staging-fixtures
  ```

---

## 🖥️ 8. Browser Smoke testing

To perform end-to-end user flows, run the React frontend locally with the staging `.env` active:
1. Start the server: `npm run dev`
2. Perform all validation flows documented in `docs/SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md`.
3. Record all observations, passed tests, and blocker states inside `docs/SUPABASE_STAGING_EXECUTION_RESULT_LOG.md`.

---

## 🔄 9. Rollback and Reset Strategy

If staging data becomes corrupted or a migration fails:
1. **Reset Database CLI**:
   ```bash
   npx supabase db reset
   ```
2. **Hard Wipe SQL Cascade**:
   Run this in the SQL Editor to wipe the test tenant completely:
   ```sql
   BEGIN;
   DELETE FROM public.appointment_access_tokens WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
   DELETE FROM public.appointments WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
   DELETE FROM public.customers WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
   DELETE FROM public.users_profile WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
   DELETE FROM public.tenants WHERE id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
   COMMIT;
   ```

---

## 🛑 10. Stop Conditions (No-Go Triggers)

Do **NOT** proceed to production under any circumstances if:
1. **RLS Leaks**: Any select queries on anonymous accounts return private customer records or other tenant appointments.
2. **Missing Migrations**: Hand-editing or skipping database migrations occurs.
3. **Secret Key Leaks**: Any private or service keys are detected in the frontend bundle.
4. **Local Fallback Active**: Real-time interactions default back to `localStorage` because Supabase connections failed. Live-critical staging data is not allowed on client storage.
5. **No-Go in Result Log**: Any unresolved high-severity issues exist in the staging execution result log.
