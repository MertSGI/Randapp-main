# LARİ - Supabase Staging Command Sheet

This command sheet is a quick-reference guide for system operators to run all local QA suites, apply migrations, seed the database, and execute the physical smoke test scripts.

---

## 🛠️ 1. Local Preflight & Static QA Commands

Prior to connecting to any remote cloud staging project, execute these local static verification suites to check migration syntax and role mappings:

### A. Run All Static QA Suite (Safe)
```bash
npm run qa:supabase-migration-integrity
npm run qa:supabase-active-migration-path
npm run qa:supabase-auth-rls-bootstrap
npm run qa:supabase-priority1-core
```

*These scripts are static validation checks; they parse SQL files, check table duplication, and verify repository class mappings without connecting to any live cloud database.*

---

## ☁️ 2. Staging Connection & Migration Commands

Once local preflight passes, link your local workspace to the physical Supabase Staging project:

### A. Link local repository to remote staging
```bash
npx supabase link --project-ref <your-supabase-staging-project-ref-id>
```

### B. Dry-Run Schema Comparison
```bash
npx supabase db diff --local
```

### C. Push migrations sequentially to staging
```bash
npx supabase db push
```

*This command automatically applies the chronological sequence defined in the `MIGRATION_APPLY_MANIFEST.md` to the remote staging project.*

---

## 💻 3. Seeding, RLS Assertions, and Seeding SQL

These actions must be performed inside the **Supabase Dashboard SQL Editor** as they contain manual setup steps:

### A. Run Repeating Test Seed
1. Open `/supabase/seed/paymentless_staging_seed.sql`.
2. Copy all queries.
3. Paste and execute in the **Supabase SQL Editor** to populate lookups and services for `melis-guzellik`.

### B. Run RLS Tenant Isolation Asserter
1. Open `/supabase/tests/paymentless_production_rls_smoke.sql`.
2. Copy all tests.
3. Paste and execute in the **Supabase SQL Editor** to verify that multi-tenant isolation works flawlessly.

---

## 📡 4. Programmatic Staging Smoke Test Commands

Use the hardened smoke testing script to perform automated tests on the staging endpoints. Make sure your local `.env` has valid values for `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

### A. Run Environmental Preflight Only
```bash
npm run smoke:supabase-paymentless-staging -- --env-only
```

### B. Run Read-Only Public Catalog checks (Default)
```bash
npm run smoke:supabase-paymentless-staging -- --read-only
```

### C. Run Guest Reservation Write test (Requires explicit flag)
```bash
npm run smoke:supabase-paymentless-staging -- --write-staging-fixtures
```

### D. Run Staging Cleanup (Requires explicit flag)
```bash
npm run smoke:supabase-paymentless-staging -- --cleanup-staging-fixtures
```

---

## 📝 5. Capturing Evidence & Logging Results

1. After completing both programmatic commands and browser smoke testing, open the result log template:
   `docs/SUPABASE_STAGING_EXECUTION_RESULT_LOG.md`
2. Duplicate or fill out the log with the current staging results.
3. Capture screenshots of:
   - Supabase project credentials panel
   - Passing console output of the smoke scripts
   - Successful public booking screen
   - Logged-in Tenant Owner dashboard showing the appointment
4. Save the completed log as staging proof prior to launching paymentless production.
