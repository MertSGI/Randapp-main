# LARİ - Supabase Staging Execution Checklist

This document details the exact, step-by-step checklist that **must** be executed sequentially prior to releasing any build to the **paymentless_limited_production** target.

---

## 📋 Sequential Staging Execution Checklist

- [ ] **1. Create Supabase Staging Project**
  - Provision a fresh, isolated project in your Supabase Dashboard named `lari-staging`.
  - Do NOT reuse production or local development databases.

- [ ] **2. Store URL and Anon Key in Local `.env` Only**
  - Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` inside your local `.env`.
  - Ensure `.env` is listed in `.gitignore` to prevent secret commits.

- [ ] **3. Confirm Service-Role Key is Never Exposed to Frontend**
  - Scan the code tree to confirm `service_role` keys are entirely absent from `/src` and `/components`.
  - Run `npm run check:secrets` to verify compliance.

- [ ] **4. Apply Active Migrations from Manifest**
  - Link to remote staging: `supabase link --project-ref <staging-ref>`
  - Push database migrations: `supabase db push`

- [ ] **5. Run Migration Integrity QA**
  - Run the static duplicate statement detector:
    ```bash
    npm run qa:supabase-migration-integrity
    ```

- [ ] **6. Run Active Migration Path QA**
  - Parse the active database migration files to guarantee matching parentheses, open comments, or bracket balances:
    ```bash
    npm run qa:supabase-active-migration-path
    ```

- [ ] **7. Configure Auth**
  - Enable the email authentication provider.
  - Set custom redirect parameters to point to `https://randevulari.com`.

- [ ] **8. Create Super Admin Auth User**
  - Register a fictional administrator email in the Supabase console.
  - Keep the generated user UUID handy for the mapping table.

- [ ] **9. Create Tenant Owner Auth User**
  - Register `melis-owner-staging@example.com` representing our pilot salon owner.
  - Copy the generated user UUID.

- [ ] **10. Insert `users_profile` Mappings**
  - Run the SQL queries documented in `docs/SUPABASE_AUTH_RLS_BOOTSTRAP_RUNBOOK.md` to link the auth user UUIDs to `super_admin` and `tenant_owner` roles respectively.

- [ ] **11. Seed Melis Güzellik Tenant**
  - Apply the safe, fictional test data directly to the staging database:
    ```bash
    # Run the seed.sql script via the SQL Editor or Supabase CLI
    # (Located at /supabase/seed/paymentless_staging_seed.sql)
    ```

- [ ] **12. Run RLS SQL Smoke Test**
  - Run the transactional policy isolation assertions on the staging DB using `supabase test db` or copy-pasting from `supabase/tests/paymentless_production_rls_smoke.sql`.

- [ ] **13. Run App-Level Read-Only Smoke**
  - Run the hardened staging smoke test in default read-only mode to verify schema connection:
    ```bash
    node scripts/smoke-supabase-paymentless-staging.mjs --mode=read-only
    ```

- [ ] **14. Run App-Level Write Smoke with Explicit Flag**
  - Execute insertion tests with the confirmation flag:
    ```bash
    node scripts/smoke-supabase-paymentless-staging.mjs --mode=write-smoke --write-staging-fixtures
    ```

- [ ] **15. Verify Owner / Admin Login**
  - Run manual checks inside the live browser to verify that owners are logged in correctly and cannot read from other tenants.

- [ ] **16. Verify Public Booking**
  - Navigate to `randevulari.com/melis-guzellik`.
  - Select active services, staff, and a free slot, and confirm that checkout reservations can be placed successfully.

- [ ] **17. Verify Appointment Self-Service Token**
  - Access the self-service reservation link using the hashed token and verify that guest cancellations/rescheduling can be performed securely.

- [ ] **18. Verify Manual Billing Display**
  - Ensure that no-card descriptions, manual activation requests, and trial-limit warnings appear on salon dashboards correctly without online payment options.

- [ ] **19. Verify Export / Backup**
  - Trigger a manual database dump to verify that backups are stable and complete:
    ```bash
    supabase db dump
    ```

- [ ] **20. Decide Go/No-Go for Paymentless Production**
  - Review the results of the 19 preflight steps and document them in [Staging Execution Result Log](./SUPABASE_STAGING_EXECUTION_RESULT_LOG.md).
  - Perform all browser validation flows detailed in [Staging Browser Smoke Checklist](./SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md).
  - Verify that no service-role secrets are exposed or committed.
  - If all tests pass with zero critical leakage alerts, sign off the result log with a clear **PASS** and proceed with production release approval!

---

## 🔗 Related Resources
- **[Real Staging Operator Guide](./REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md)**: Physical staging workflow and configuration.
- **[Staging Execution Result Log](./SUPABASE_STAGING_EXECUTION_RESULT_LOG.md)**: Staging run results evidence sheet.
- **[Staging Browser Smoke Checklist](./SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md)**: End-to-end browser verification checklist.
- **[Staging Command Sheet](./SUPABASE_STAGING_COMMAND_SHEET.md)**: Developer quick command references.
- **[Supabase Staging Execution Runbook](./SUPABASE_STAGING_EXECUTION_RUNBOOK.md)**: Standard runbook for staging execution.

---

## 🚫 Gate Warnings
- **STAGING IS REQUIRED**: Paymentless production cannot proceed until real physical staging passes and results are logged.
- **ONLINE PAYMENT NOT REQUIRED**: Real online payment via iyzico, SMS providers, or email providers is NOT required for staging or launch.
- **NO LOCALSTORAGE FOR LIVE**: Using browser `localStorage` is strictly forbidden for live operational tenant data. Real persistent databases (Supabase Postgres) are mandatory.

