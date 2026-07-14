# LARİ - Supabase Staging Execution Runbook

This runbook outlines the steps to provision, configure, and execute a smoke test against a real Supabase Staging project for LARİ under the **paymentless_limited_production** mode.

---

## 1. Purpose

To verify all database migrations, Row Level Security (RLS) policies, authentication setups, tenant isolation configurations, and public booking core workflows against a real physical Supabase backend before deploying to production.

> **CRITICAL WARNING**:
> - Credentials (API keys, connection strings) must be stored ONLY in local `.env` files or secure deployment secrets (e.g., Cloud Run environment variables).
> - The **Supabase Service Role Key** (`SUPABASE_SERVICE_ROLE_KEY`) **must NEVER** be exposed to frontend browser clients or prefixed with `VITE_`.
> - Staging success **must** be verified using real Supabase response data (HTTP status codes, returned row payloads), never with simulated file checks.

---

## 2. Staging Project Creation Checklist

1. **Sign Up/Log In**: Access the [Supabase Dashboard](https://supabase.com/dashboard).
2. **Create New Project**:
   - **Name**: `lari-staging` or `lari-sandbox`
   - **Database Password**: Generate a secure password and store it in a password manager.
   - **Region**: West Europe or Turkey proximity (e.g., Frankfurt/London).
   - **Pricing Tier**: Free tier or Developer tier.
3. **Retrieve Credentials**:
   - Go to **Project Settings -> API**.
   - Copy the **Project URL**, **Anon Public Key** (`anon` `public`), and **Service Role Key** (`service_role` `secret`).
   - Store these securely. **Only** use Project URL and Anon Key in the frontend `VITE_*` env vars.

---

## 3. Safe Credential Handling

### Staging Environment Variables

Add these strictly to your staging environment (`.env` for local testing against staging or server configuration variables):

```env
# Frontend Safe Configuration
VITE_LAUNCH_MODE=paymentless_limited_production
VITE_DATA_MODE=supabase_staging
VITE_PAYMENT_MODE=disabled
VITE_COMMUNICATION_MODE=local_outbox_only
VITE_PUBLIC_BASE_DOMAIN=randevulari.com
VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-public-key>

# Backend / Administrative Use ONLY (NEVER commit, NEVER expose to client)
# SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

---

## 4. Migration Application Order & Preflight Verification

> **CRITICAL GATE**: Static QA passing locally is beneficial but does not guarantee live database success. Active migrations **must** be conflict-free before deploying to real staging. 

To prevent table duplication and execution errors, we have isolated historical conflicts:
* **Archived**: `20260526_initial_schema.sql` has been moved to `/supabase/archive/` to prevent duplicate table creation errors during alphanumeric execution.
* **Never manually skip migrations**: The migrations folder contains only the canonical active sequence. Never skip active migrations unless explicitly instructed by the `MIGRATION_APPLY_MANIFEST.md`.

### Mandatory Pre-staging QA Sequence:
1. **Run Migration Integrity QA**: Run `npm run qa:supabase-migration-integrity` to verify that there are no duplicate tables, types, indexes, or policies.
2. **Apply Migrations**: Push migrations via Supabase CLI (`supabase db push`) or execute them in the exact order specified in `/supabase/MIGRATION_APPLY_MANIFEST.md`.
3. **Run RLS Isolation Tests**: Execute the SQL assertions in `supabase/tests/paymentless_production_rls_smoke.sql` to verify Row Level Security boundaries.
4. **Run App-Level Smoke Tests**: Execute `npm run smoke:supabase-paymentless-staging` only after target staging credentials are fully configured in `.env`.

### Canonical Active Sequence:
1. `001_initial_schema.sql` (Canonical initial database baseline)
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
13. `20260715_super_admin_provisioning_rpc.sql` (Super Admin Provisioning RPC)

*Applying Migrations*:
- Using Supabase CLI: `supabase db push`
- Using Supabase SQL Editor: Copy and paste active migrations in exact order as detailed in `/supabase/MIGRATION_APPLY_MANIFEST.md`.

---

## 5. RLS Enablement & Auth Setup

### Step 1: Enable RLS on All Tables
Ensure every table created has RLS explicitly enabled. If not, execute:
```sql
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_rights_requests ENABLE ROW LEVEL SECURITY;
```

### Step 2: Apply Tenant-Isolation Policies
Apply the RLS policy matrices described in `docs/RLS_POLICY_PLAN.md`. For example:
```sql
CREATE POLICY "Tenant owners can read own services" ON services
    FOR SELECT TO authenticated
    USING (tenant_id = (auth.jwt() ->> 'tenant_id'));
```

---

## 6. Tenant and User Account Setup

### Step 1: Create a Super Admin account
- Add a user in **Supabase Auth** dashboard (e.g., `superadmin@randevulari.com`).
- Copy the generated **User UUID**.
- Map the Super Admin profile with `tenant_id = NULL` (platform-level, not tenant-scoped):
   ```sql
   INSERT INTO public.users_profile (id, tenant_id, name, role, active)
   VALUES (
     '<SUPER-ADMIN-AUTH-UUID>',
     NULL,
     'LARİ Super Admin',
     'super_admin',
     true
   )
   ON CONFLICT (id) DO UPDATE
   SET tenant_id = NULL,
       role = 'super_admin',
       active = true;
   ```

### Step 2: Create Seed Tenant & Owner
1. Insert the target pilot tenant:
   ```sql
   INSERT INTO tenants (id, slug, name, status, public_site_status)
   VALUES ('aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', 'melis-guzellik', 'Melis Güzellik & Nail Art', 'active', 'published');
   ```
2. Link the tenant to an owner auth profile:
   ```sql
   INSERT INTO users_profile (id, tenant_id, name, role, active)
   VALUES (
     '<TENANT-OWNER-AUTH-UUID>',
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
3. Set the manual subscription model:
   ```sql
   INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_end)
   VALUES ('aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', 'pilot_plan', 'manual_active', '2027-01-01 00:00:00+00');
   ```

---

## 7. Staging Smoke Test Pipeline

Execute these manual or programmatic verification steps against the live endpoints:

1. **Public Booking Smoke Test**:
   - Access `randevulari.com/melis-guzellik` (or local simulation).
   - Verify published services are returned from `/rest/v1/services` with status `200`.
   - Submit a new booking. Verify client payload successfully records a customer and appointment in the DB.
2. **Manual Billing Smoke Test**:
   - Log in as the owner.
   - Confirm the billing banner remains inactive and launch mode displays "Çevrimdışı Ödemeli Sürüm" with no live credit card fields.
3. **Self-Service Token Smoke Test**:
   - Request cancellation using the client-side self-service token.
   - Verify token lookup from `appointment_access_tokens` executes without general auth cookies and blocks other customer actions.
4. **Support/Audit/Outbox Smoke Test**:
   - Check `audit_events` or `support_tickets` for logs created during administrative saves.
   - Confirm records write safely with matching `tenant_id` context.

---

## 8. Rollback and Reset Strategy

If a migration fails or data pollution occurs on staging:

1. **Recreate database schema**:
   - In Supabase settings under Database, you can execute a full backup restore or reset the DB using CLI: `supabase db reset`.
2. **Hard-Delete polluted tenant**:
   - Run the cascade script in SQL Editor:
     ```sql
     BEGIN;
     DELETE FROM appointment_access_tokens WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
     DELETE FROM appointments WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
     DELETE FROM services WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
     DELETE FROM users_profile WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
     DELETE FROM tenants WHERE id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
     COMMIT;
     ```

---

## 10. Related Resources

For detailed bootstrap steps, identity designs, and checklists, consult these related resources:
- **[Real Staging Operator Guide](./REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md)**: Physical staging workflow and configuration.
- **[Staging Execution Result Log](./SUPABASE_STAGING_EXECUTION_RESULT_LOG.md)**: Staging run results evidence sheet.
- **[Staging Browser Smoke Checklist](./SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md)**: End-to-end browser verification checklist.
- **[Staging Command Sheet](./SUPABASE_STAGING_COMMAND_SHEET.md)**: Developer quick command references.
- **[Supabase Auth RLS Bootstrap Runbook](./SUPABASE_AUTH_RLS_BOOTSTRAP_RUNBOOK.md)**: Detailed step-by-step auth/role setup.
- **[Supabase RLS Identity Model Decision](./SUPABASE_RLS_IDENTITY_MODEL_DECISION.md)**: Details on why we use users_profile database lookup.
- **[Supabase Staging Auth Seed Plan](./SUPABASE_STAGING_AUTH_SEED_PLAN.md)**: Seeding rules and sequence.
- **[Supabase Staging Execution Checklist](./SUPABASE_STAGING_EXECUTION_CHECKLIST.md)**: The sequential preflight checklist.
- **[Paymentless Staging Seed SQL](../supabase/seed/paymentless_staging_seed.sql)**: Transaction-safe repeatable seed script.

---

## 11. Production Release Gates & Prerequisites

1. **Mandatory Real Staging Smoke Pass**: Paymentless production cannot proceed under any circumstances before a real physical Supabase Staging smoke test passes. This pass must be fully documented and evidenced in the [Staging Execution Result Log](./SUPABASE_STAGING_EXECUTION_RESULT_LOG.md) with a clear `PASS` status.
2. **Third-Party Integrations Exempt**: Online payment via **iyzico is NOT required** for staging or paymentless launch. Similarly, real SMS, WhatsApp, or email provider integrations are not required.
3. **No localStorage for Live Data**: Using `localStorage` is strictly forbidden for live-critical operational data. Real persistent databases (Supabase Postgres) are mandatory for live salon operations.


