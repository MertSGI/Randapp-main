# LARİ Supabase Canonical Migration Apply Strategy

This document establishes the official database schema baseline and migration lifecycle for LARİ's production and staging environments, guaranteeing a deterministic, reproducible, and safe migration path for fresh and existing databases.

---

## 1. The Danger of Duplicate Initial Migrations

During early phases of development, multiple "initial schema" files were drafted (e.g., `001_initial_schema.sql` and `20260526_initial_schema.sql`). Allowing overlapping or duplicate `CREATE TABLE` definitions in active migration paths causes severe issues:
* **Deployment Failures**: Standard runners (Supabase CLI, Prisma, or Drizzle migrations) run files in alphanumeric order. If a subsequent file tries to re-create an existing table without `IF NOT EXISTS` (or with conflicting columns), the execution halts with fatal database errors.
* **Schema Drift**: If table structures are modified or redefined mid-chain, different environments can end up with slightly different column types, constraints, or foreign keys.
* **Corrupted RLS Boundaries**: Duplicate policies or overlapping definitions block table registration or create silent privilege escalations.

---

## 2. Chosen Canonical Path: Option B (Archived Redundant Migration)

We have formally selected **Option B (Archived Redundant Migration)** to isolate the conflict cleanly:
* **The Archived Draft**: `20260526_initial_schema.sql` is identified as a redundant initial draft for Randapp. It has been moved out of `supabase/migrations/` and into `supabase/archive/`.
* **The Canonical Baseline**: `001_initial_schema.sql` remains the single source of truth for the core tables of the application (`tenants`, `services`, `customers`, `appointments`, etc.).
* **Result**: Fresh staging or production environments running standard Supabase CLI migrations will run a clean, single-pass chain without any schema conflicts.

---

## 3. Fresh Staging/Production DB Migration Path

To initialize a completely fresh Supabase staging or production database:

1. **Prerequisites**:
   * Installed Supabase CLI.
   * Access credentials (URL, API keys) for the target Supabase project.

2. **Standard Execution Path (Supabase CLI)**:
   Ensure your local repository has the `supabase` directory in its current state. Run:
   ```bash
   # Login to your Supabase account
   supabase login

   # Link your local project to the remote Supabase project
   supabase link --project-ref <your-supabase-project-id>

   # Push migrations to the linked remote database
   supabase db push
   ```
   *The CLI scans `supabase/migrations/*` alphabetically, executing them one-by-one and storing execution status in `supabase_migrations.schema_migrations`.*

3. **Fallback Execution Path (Manual SQL Editor)**:
   If CLI access is restricted or in environments without terminal access, apply the migrations sequentially in the **Supabase SQL Editor** in the following exact order:
   1. `001_initial_schema.sql`
   2. `002_subscription_alignment.sql`
   3. `003_provisioning_onboarding.sql`
   4. `004_iyzico_provider_alignment.sql`
   5. `005_salon_business_profile.sql`
   6. `20260601_lari_core_schema_alignment.sql`
   7. `20260619_lari_rls_policy_draft.sql`
   8. `20260620_paymentless_production_core_tables.sql`
   9. `20260621_paymentless_production_repository_columns.sql`
   10. `20260622_paymentless_production_rls_identity_alignment.sql`

---

## 4. Existing DB Repair & Migration Path (For Already-Applied Databases)

If a remote staging/production database was previously initialized using a mix of manual scripts or has a broken migration history, use the following repair procedure:

### Scenario A: Historical migrations already applied but untracked
If tables exist but Supabase CLI does not recognize them:
1. **Baseline the DB**: Use `supabase migration use <migration-timestamp>` or manually insert rows into `supabase_migrations.schema_migrations` representing the already applied files to mark them as completed without re-executing.
2. **Push the rest**: Run `supabase db push` to safely deploy any remaining pending migrations.

### Scenario B: Database contains schema conflicts (e.g., draft tables exist)
If the database was mistakenly configured using the old `20260526_initial_schema.sql` draft:
1. **Backup Data**: Export active tenant configurations and tables.
2. **Safe Reset**: If staging, perform a clean teardown and rebuild:
   ```bash
   supabase db reset
   ```
   *This wipes the local/remote DB and applies all migrations in `supabase/migrations/` sequentially, producing a clean canonical database.*

---

## 5. Guidelines for Future Migrations

To maintain a pristine and deterministic migration path:
* **Avoid Editing Already-Applied Migrations**: Once a migration file has been deployed to a shared staging or production database, **NEVER edit its contents**. Any schema modifications (adding columns, updating types, changing RLS policies) must be implemented by creating a **new sequential migration file** (e.g., `20260701_your_feature_change.sql`).
* **If No Real DB has Used the Migration Yet**: It is safe to update the file directly in the local repository before any remote deployments occur.
* **Strict Idempotency**:
  * Always use `CREATE TABLE IF NOT EXISTS` for post-baseline tables.
  * Always use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for columns.
  * Always drop existing policies using `DROP POLICY IF EXISTS "policy_name" ON public.table_name` before defining new ones.
  * Always use `CREATE INDEX IF NOT EXISTS`.

---

## 6. Stop Conditions (Hard Blocks)

Do **NOT** proceed with a migration run if any of the following conditions are met:
1. **Unresolved Duplicate Conflicts**: Active migration files (files located in `supabase/migrations/`) contain duplicate table creations or unsafe SQL commands that fail static linting.
2. **Missing Repository Schema Integrity**: A core table required by Priority 1 repository flows (e.g. `tenants`, `services`, `customers`, `appointments`, `subscriptions`) is missing from the active migration files.
3. **Leaked Secrets**: Any migration file contains plaintext passwords, IAM credentials, or the Supabase `service_role` key.
4. **Local Smoke Tests Failing**: Pre-live local tests (`npm run qa:supabase-priority1-core`) fail. This acts as a hard gate blocking staging deploy.
