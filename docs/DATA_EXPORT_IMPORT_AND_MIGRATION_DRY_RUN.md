# DATA EXPORT, IMPORT & MIGRATION DRY-RUN
## PRE-LIVE SAFEGUARDS

### 1. The Context & The Risk
The LARİ platform is currently fully functional, including a robust admin panel, Lumina booking engine, dynamic data stores, multi-branch readiness, and Super Admin features. 
**HOWEVER**, the entire system runs on `VITE_DATA_MODE=mock` (Local Storage) because the actual Supabase database cutover is pending.

**The Risk:** 
If a real pilot customer (e.g. a salon owner) sets up their business on their device, their `businessProfile`, `catalog`, `appointments`, and `customers` live **only in their browser cache**. If they switch devices or clear their cache, they will lose everything.

### 2. The Solution
To safeguard data during this pilot transition and correctly prepare it for the upcoming Supabase cutover, we have introduced the **Data Safety & Migration Readiness System**.

It consists of:
- `dataExportService.ts`: Safely aggregates all local tenant data, trims out secrets, and creates a unified `.json` backup representing the whole tenant namespace.
- `migrationDryRunService.ts`: Scans the unified tenant state to identify blockers, warnings, and required fixes before the data can be migrated safely via script to a real Postgres database.
- **SuperAdminDataExportSection**: A secure UI inside the Super Admin panel to run the export, view migration readiness, and manually import (restore) a pilot's lost data if needed.

### 3. What is Included in the Export
The export snapshot strictly captures domain data required for business continuity.
- `tenantAccount`: The core registration status, limits, email, and subscription mode.
- `businessProfile`: Name, slug, coordinates, basic location mapping.
- `branches`: Any multi-branch configuration data.
- `catalog`: All services, staff, mapping, and availability rules.
- `appointments`: Historical and future appointments.
- `customers`: Customer memory records (CRM Lite).
- `consents`: Explicit customer consent histories and accepted GDPR checkboxes.
- `dataRequests`: Any pending customer "forget me" requests.
- `campaigns & referrals`: Custom active campaigns and ledger metrics.
- `shareChecklist`: Internal state of their marketing share completions.

### 4. What is Excluded
For severe security boundaries, the following are aggressively omitted:
- `active_owner_session`: Access tokens must not travel.
- `passwords/passwordHashes`: Strictly excluded.
- `paymentCards`: The app doesn't collect raw cards, but defensive checks exist in `migrationDryRunService` to block migration if keywords like `cardNumber` or `cvv` are detected.
- `provider keys`: Stripe/Iyzico secret keys do not exist in the frontend scope and are thus unexportable.

### 5. How to Back Up a Pilot Tenant
1. The business owner finalizes their setup (Services, staff, availability).
2. Ask them to share their browser with you OR you perform the setup on behalf of them on your machine.
3. Once completed, as Super Admin, go to **Super Admin -> Sandbox & Go Live Hazırlık**.
4. In the **Veri Yedekleme ve Taşıma Hazırlığı** section, select the tenant.
5. Click **Tara**, ensuring no migration blockers exist.
6. Click **.json Yedeğini İndir**. 
7. Keep this file safe.

### 6. How to Run a Migration Dry-Run
When you click **Tara** in the interface, `migrationDryRunService` computes readiness.
- It detects missing `slug` records which might break PostgreSQL unique constraints.
- It detects orphaned appointments mapped to deleted services.
- It detects missing required tenant setup records (no services, no staff).
- Blockers indicate the JSON will fail injection manually into Supabase later.

### 7. What Requires Real Supabase
This system **Does Not Solve Multi-Device Access**. 
If the pilot user sets up the system on an iPad at the salon, they still cannot manage their calendar on their home PC because they remain completely local.
To solve multi-device access, we must:
1. Deploy Supabase Schema.
2. Change `.env` `VITE_DATA_MODE` to `supabase`.
3. Provide the migration script the exported `.json` payload to seed the live DB.

### 8. Strict Guidelines
- **Do not commit these exported pilot .json files to Git.** They contain real phone numbers and names.
- **Do not mix scopes.** `importTenantSnapshot()` validates inputs, but you should not import `tenant A`'s JSON while logged in actively processing `tenant B`'s appointments via other tabs.
- **Runbooks:** Refer to `LIVE_CUTOVER_EXECUTION_RUNBOOK.md`, `GO_NO_GO_LIVE_CHECKLIST.md`, and `LIVE_SMOKE_TEST_SCRIPT.md` prior to actual cutover operations.
