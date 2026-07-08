# LARİ Supabase Migration Apply Manifest

This manifest documents the active canonical migration graph, database schema ownership, and execution procedures for LARİ.

---

## 1. Active Migrations Sequence (Chronological)

All migrations in `supabase/migrations/` must be applied in the exact alphabetical/chronological order:

1. **`001_initial_schema.sql`** — Database initialization and primary core tables.
2. **`002_subscription_alignment.sql`** — Adds references between payments and subscriptions.
3. **`003_provisioning_onboarding.sql`** — Provisions onboarding tracking schemas.
4. **`004_iyzico_provider_alignment.sql`** — Adds sandbox subscription alignment structures.
5. **`005_salon_business_profile.sql`** — Provisions tenant public marketing profile tables.
6. **`20260601_lari_core_schema_alignment.sql`** — Aligns appointments, staff mapping, and templates.
7. **`20260619_lari_rls_policy_draft.sql`** — Consolidated unified RLS security rules.
8. **`20260620_paymentless_production_core_tables.sql`** — Self-service and paymentless tracking tables.
9. **`20260621_paymentless_production_repository_columns.sql`** — Manual/offline billing support columns.
10. **`20260622_paymentless_production_rls_identity_alignment.sql`** — Aligns core tables with users_profile lookup canonical RLS identity model.

---

## 2. Archived / Excluded Migrations

* **`20260526_initial_schema.sql`**: Archived to `/supabase/archive/20260526_initial_schema.sql`.
  * *Reason for exclusion*: Redundant draft initial schema that conflicts with `001_initial_schema.sql` on core table definitions.

---

## 3. Canonical Table Ownership Map

| Table Name | Created In | Altered In | RLS Policy File |
| :--- | :--- | :--- | :--- |
| `tenants` | `001_initial_schema.sql` | `003`, `20260601` | `20260619_lari_rls_policy_draft.sql` |
| `tenant_branding` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `users_profile` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `staff` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `services` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `customers` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `appointments` | `001_initial_schema.sql` | `20260601` | `20260619_lari_rls_policy_draft.sql` |
| `campaigns` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `reminders` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `whatsapp_logs` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `calendar_integrations` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `ai_recommendations` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `customer_segments` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `subscriptions` | `001_initial_schema.sql` | `002`, `004`, `20260601`, `20260621` | `20260619_lari_rls_policy_draft.sql` |
| `payments` | `001_initial_schema.sql` | `002`, `004`, `20260601` | `20260619_lari_rls_policy_draft.sql` |
| `audit_logs` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `tenant_onboarding_progress` | `003_provisioning_onboarding.sql` | — | `003_provisioning_onboarding.sql` |
| `tenant_business_profiles` | `005_salon_business_profile.sql` | — | `005_salon_business_profile.sql`, `20260619` |
| `staff_services` | `20260601_lari_core_schema_alignment.sql` | — | `20260601`, `20260619` |
| `availability_rules` | `20260601_lari_core_schema_alignment.sql` | — | `20260601`, `20260619` |
| `customer_memory` | `20260601_lari_core_schema_alignment.sql` | — | `20260601`, `20260619` |
| `payment_events` | `20260601_lari_core_schema_alignment.sql` | — | `20260601`, `20260619` |
| `business_verification_reviews`| `20260601_lari_core_schema_alignment.sql` | — | `20260601`, `20260619` |
| `notification_templates` | `20260601_lari_core_schema_alignment.sql` | — | `20260601`, `20260619` |
| `notification_logs` | `20260601_lari_core_schema_alignment.sql` | — | `20260601`, `20260619` |
| `appointment_access_tokens` | `20260620_paymentless_production_core_tables.sql`| — | `20260622_paymentless_production_rls_identity_alignment.sql` |
| `appointment_change_requests` | `20260620_paymentless_production_core_tables.sql`| — | `20260622_paymentless_production_rls_identity_alignment.sql` |
| `communication_outbox` | `20260620_paymentless_production_core_tables.sql`| — | `20260622_paymentless_production_rls_identity_alignment.sql` |
| `audit_events` | `20260620_paymentless_production_core_tables.sql`| — | `20260622_paymentless_production_rls_identity_alignment.sql` |
| `support_tickets` | `20260620_paymentless_production_core_tables.sql`| — | `20260622_paymentless_production_rls_identity_alignment.sql` |
| `policy_acceptances` | `20260620_paymentless_production_core_tables.sql`| — | `20260622_paymentless_production_rls_identity_alignment.sql` |
| `consent_ledger` | `20260620_paymentless_production_core_tables.sql`| — | `20260622_paymentless_production_rls_identity_alignment.sql` |
| `data_rights_requests` | `20260620_paymentless_production_core_tables.sql`| — | `20260622_paymentless_production_rls_identity_alignment.sql` |

---

## 4. Staging Commands Execution Sequence

Execute the following commands sequentially to apply this manifest onto a fresh staging project:

```bash
# 1. Initialize link with remote staging project
supabase link --project-ref <staging-supabase-project-id>

# 2. Run dry-run validation using CLI to ensure parsing passes
supabase db diff --local

# 3. Apply the canonical active migration path
supabase db push
```

---

## 5. Post-Migration Verification Sequence

After the migrations have successfully been applied:

1. **Verify Static Integrity**: Run `npm run qa:supabase-migration-integrity` to ensure zero table/index/policy duplications.
2. **Verify Repository Schema Hookup**: Run `npm run qa:supabase-priority1-core` to verify that active repositories can cleanly read/write to the database.
3. **Execute SQL Assertions**: Run the SQL-level assertions detailed in `supabase/tests/paymentless_production_rls_smoke.sql` using Supabase CLI test command or SQL editor:
   ```bash
   supabase test db
   ```
4. **App-Level Staging Smoke Test**: Run `npm run smoke:supabase-paymentless-staging` (requires valid staging credentials in `.env`).

---

## 6. Rollback and Reset Notes

* **Local Reset**: To wipe changes locally and rebuild from scratch:
  ```bash
  supabase db reset
  ```
* **Remote Wipe Warning**: Never run `db reset` on shared remote staging databases without explicit confirmation from team members.

---

## 7. DO NOT CONTINUE IF:

1. **Unsafe duplicate tables remain active**: If `20260526_initial_schema.sql` was accidentally restored to the migrations folder, **STOP**.
2. **Missing Env variables**: Staging env vars are unconfigured. The app will boot safely in demo/local fallback mode, but do not push updates until credentials are set.
3. **PCI-DSS storage violations occur**: If any column definition logs credit card fields (`card_number`, `card_cvv`), immediately abort migration and correct definitions.
