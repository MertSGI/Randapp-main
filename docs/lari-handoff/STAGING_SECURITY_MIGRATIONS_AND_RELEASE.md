# LARİ — STAGING, SECURITY, MIGRATIONS & RELEASE TRUTH (`STAGING_SECURITY_MIGRATIONS_AND_RELEASE.md`)

**Verification Timestamp:** `2026-10-21T10:35:00Z`  
**Target Supabase Staging Project:** `lari-staging` (`rwedeejhjazwjthdjzrt`, `https://rwedeejhjazwjthdjzrt.supabase.co`)  
**Converged Release-Gate Source SHA:** [`72911e4fb68dd4f85f7fafef575089104102064e`](https://github.com/MertSGI/Randapp-main/commit/72911e4fb68dd4f85f7fafef575089104102064e) (`staging/ci-lari-release-gate-c1-c4-20261017`)  
**Default Branch Operational SHA:** [`c8dfd3d247c8669b3e21f883451c777a376133ed`](https://github.com/MertSGI/Randapp-main/commit/c8dfd3d247c8669b3e21f883451c777a376133ed) (`staging/supabase-staging-consistency`)  
**Open Backup PR #3 Head SHA:** [`2b238ed66c5ef4f47fd35b613f8dda405c85f60d`](https://github.com/MertSGI/Randapp-main/commit/2b238ed66c5ef4f47fd35b613f8dda405c85f60d) (`review/lari-backup-restore-role-grant-fix-20261020`)  
**Release Verdict:** `PRODUCTION = NO_GO`

---

## 1. CRITICAL P0 SECURITY TRUTH: `public.appointment_access_tokens`

### A. Why Remote Source & CI Success != Live Database Remediation
1. **Source & CI State (`PASS`):**
   - Commit [`87ab5963dce92411db63d4616554eb63ca7f34f8`](https://github.com/MertSGI/Randapp-main/commit/87ab5963dce92411db63d4616554eb63ca7f34f8) (`fix(security): harden appointment token access and QA`) added [`supabase/migrations/20261011155623_appointment_access_tokens_table_access_hardening.sql`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/supabase/migrations/20261011155623_appointment_access_tokens_table_access_hardening.sql).
   - Canonical Git UTF-8 LF SHA-256: `260F727516CFF4CF0754295206A10E56505A9CA9E22AEC099BB7F21099BD5E13` (Windows CRLF checkout SHA-256: `5FCE2EEE8D21A29C68D7685A744234EAC779FB7BB4D92B6E59CBCBD109826970`).
   - Hosted GitHub Actions runs [`38221591965`](https://github.com/MertSGI/Randapp-main/actions/runs/38221591965), [`38951741181`](https://github.com/MertSGI/Randapp-main/actions/runs/38951741181), and [`38998120843`](https://github.com/MertSGI/Randapp-main/actions/runs/38998120843) verified this migration in disposable PostgreSQL 17 containers (including idempotent double-application, rollback via `appointment_access_tokens_security_rollback.sql`, and re-application).
2. **Live Supabase Staging State (`rwedeejhjazwjthdjzrt` — `NOT_APPLIED / EXPOSED`):**
   - Read-only `pg_catalog` inspection of `rwedeejhjazwjthdjzrt` confirms that migration `20261011155623` is **NOT** applied.
   - On live `public.appointment_access_tokens`:
     - `anon` still holds table-level `SELECT`, `INSERT`, `UPDATE`, `DELETE`, and `TRUNCATE` privileges.
     - Row Level Security (RLS) is enabled, **but** the permissive SELECT policy `"Allow public select by token hash"` is present with `roles = {public}` and `qual = true`.
   - Consequently, anonymous callers with the public Supabase `anon` key can still query `public.appointment_access_tokens` directly on live staging until the P0 cutover migration is executed.
   - **Strict Privacy Rule:** Never read rows or `token_hash` values from `public.appointment_access_tokens`. Verify state using catalog privilege and `pg_policies` booleans only.

### B. Prepared Bounded Cutover Wrapper (Ready for Post-Backup Execution)
On `72911e4fb68dd4f85f7fafef575089104102064e`, the bounded operator cutover is fully prepared:
- Runbook: [`docs/APPOINTMENT_TOKEN_HARDENING_STAGING_CUTOVER.md`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/docs/APPOINTMENT_TOKEN_HARDENING_STAGING_CUTOVER.md)
- PowerShell operator entrypoint: [`scripts/Invoke-LariAppointmentTokenHardening.ps1`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/scripts/Invoke-LariAppointmentTokenHardening.ps1)
- Transactional SQL wrapper: [`scripts/sql/apply-appointment-token-hardening-staging.sql`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/scripts/sql/apply-appointment-token-hardening-staging.sql)
- Behavior: Validates `rwedeejhjazwjthdjzrt` connection identity, TLS requirement, and exact migration SHA-256 (`260F727516CFF4CF0754295206A10E56505A9CA9E22AEC099BB7F21099BD5E13` after LF normalization), runs inside a single transaction (`lock_timeout = 5s`, `statement_timeout = 60s`), revokes `PUBLIC` and `anon` table privileges, drops `"Allow public select by token hash"`, verifies that `"Owner/Admin manage appointment tokens"` and all four `SECURITY DEFINER` manage-token RPCs remain intact, and rolls back automatically on any postcondition mismatch.

---

## 2. ZERO-COST LOGICAL BACKUP FAILURE (`39397783444`) & OPEN PR #3 (`2b238ed6...`)

### A. Chronology of the 20 October 2026 Backup Runs on Default Branch (`staging/supabase-staging-consistency`)
1. **PR #1 Merge (`e3169aede3696c59bdea2188046396a60dc5e2bf`, `2026-10-20T07:54:58Z`) & Dispatch #1 ([`39391182171`](https://github.com/MertSGI/Randapp-main/actions/runs/39391182171)):**
   - Failed at Step 4 (`Install PostgreSQL 17 client and encryption tools`) because `postgresql-client-17` required the official PGDG apt repository on `ubuntu-24.04`.
2. **PR #2 Merge (`c8dfd3d247c8669b3e21f883451c777a376133ed`, `2026-10-20T08:59:07Z`), Static QA ([`39397354204`](https://github.com/MertSGI/Randapp-main/actions/runs/39397354204)), & Dispatch #2 ([`39397783444`](https://github.com/MertSGI/Randapp-main/actions/runs/39397783444)):**
   - Static `LARI QA` run `39397354204` succeeded (`SUCCESS`).
   - Manual `workflow_dispatch` run `39397783444` (`LARI Zero-Cost Logical Backup`) passed Step 4 (`Install PostgreSQL 17 client`) and Step 5 (`Verify authentic Supabase Root CA certificate` — `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`), connected to live Supabase staging `rwedeejhjazwjthdjzrt` over `sslmode=verify-full`, exported `roles.sql` and `database.dump`, **and then FAILED at Step 6 (`Create encrypted logical backup and verify disposable restore`)**.
   - Because Step 6 failed closed, Step 7 (`Upload encrypted backup and verified manifest only`) was **skipped**, and Step 8 (`Enforce restore-test verdict`) **failed**. **Zero backup artifacts were uploaded.**
3. **Exact Technical Root Cause of Run `39397783444` Failure:**
   - In live Supabase clusters, `supabase_admin` is the cluster bootstrap superuser (`OID 10`) and exported role memberships in `roles.sql` include `GRANT "supabase_admin" TO "postgres" WITH ADMIN OPTION GRANTED BY "supabase_admin"`.
   - In `c8dfd3d247c8669b3e21f883451c777a376133ed`, the disposable `postgres:17.6-alpine` service container was initialized with `POSTGRES_USER: lari_restore_admin` (`OID 10`), making `supabase_admin` a non-bootstrap superuser.
   - In PostgreSQL 17, `is_admin_of_role(X, X)` is true **only** for the bootstrap superuser (`OID 10`), and a role cannot be granted to itself (`role "X" is a member of role "X"`). Replaying `GRANT "supabase_admin" TO "postgres" WITH ADMIN OPTION GRANTED BY "supabase_admin"` into a cluster where `lari_restore_admin` is OID 10 therefore failed closed with `ERROR: permission denied to grant role "supabase_admin" / DETAIL: The grantor must have the ADMIN option on role "supabase_admin"`.
4. **Open Pull Request #3 ([`#3`](https://github.com/MertSGI/Randapp-main/pull/3), Head [`2b238ed66c5ef4f47fd35b613f8dda405c85f60d`](https://github.com/MertSGI/Randapp-main/commit/2b238ed66c5ef4f47fd35b613f8dda405c85f60d)):**
   - Branch: [`review/lari-backup-restore-role-grant-fix-20261020`](https://github.com/MertSGI/Randapp-main/tree/review/lari-backup-restore-role-grant-fix-20261020)
   - Fixes the disposable container initialization (`POSTGRES_USER: supabase_admin` so `supabase_admin` is `OID 10` in the disposable container just like Supabase), keeps the exported `roles.sql` byte-for-byte untouched inside the encrypted bundle, generates `restore-roles.sql` with idempotent `CREATE ROLE` guards and cycle-checked `ADMIN OPTION` delegation for any non-bootstrap grantors, and enforces exact catalog fingerprint equality (`scripts/backup/catalog-fingerprint.sql`).
   - Hosted CI Qualification on PR #3:
     - [`39485734117`](https://github.com/MertSGI/Randapp-main/actions/runs/39485734117) (`LARI PG17 Role Restore Qualification` at `2b238ed66c5ef4f47fd35b613f8dda405c85f60d`): **`SUCCESS`** (`2026-10-20T19:43:29Z`).
   - **Current Blocker State:** PR #3 is still **`OPEN` (`UNMERGED`)**. Until the owner verifies the Vercel Production Branch quarantine gate, merges PR #3 into `staging/supabase-staging-consistency`, dispatches `LARI Zero-Cost Logical Backup`, obtains `VERIFIED_LOGICAL_RESTORE`, downloads the `.age` ciphertext + `manifest.json` externally, and verifies an offline restore, **no verified live backup exists**.

---

## 3. SUPABASE STAGING MIGRATION RECONCILIATION (`rwedeejhjazwjthdjzrt`)

Authoritative read-only reconciliation recorded in [`docs/evidence/migration-reconciliation-20261011.json`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/docs/evidence/migration-reconciliation-20261011.json) (verified by `npm run qa:migration-reconciliation-evidence`):

- **Total SQL files in `supabase/migrations/` on `72911e4fb68dd4f85f7fafef575089104102064e`:** `97` (`96` baseline migrations + `1` P0 repair migration `20261011155623_appointment_access_tokens_table_access_hardening.sql`)
- **Total SQL files in `supabase/migrations/` on default branch `c8dfd3d247c8669b3e21f883451c777a376133ed`:** `56` (`001` through `20260831_p1c_public_branch_read_contract_runtime_fix.sql`)
- **Total applied entries in `rwedeejhjazwjthdjzrt` (`supabase_migrations.schema_migrations`):** `79`
  - **Common identity count:** `75` (`001` through `20260920_phase3_background_job_calendar_foundation.sql`)
  - **Local-only (in `72911e4f` source, absent from remote ledger):** `21` baseline migrations + `1` P0 repair migration (`20261011155623`)
  - **Remote-only (in `rwedeejhjazwjthdjzrt` ledger, absent as exact filenames in source):** `4`

### Complete Breakdown of the 25 Non-Common Migration Entries (`21 LOCAL_ONLY` + `4 REMOTE_ONLY`)

| # | Side | Filename / Remote Name | Version | Classification | Schema & Version-Collision Details |
| :-: | :--- | :--- | :--- | :--- | :--- |
| 1 | `LOCAL_ONLY` | `20260920_phase3_resource_capacity_foundation.sql` | `20260920` | `DRIFT_OR_CONFLICT` | Collides with occupied version `20260920` (`background_job_calendar_foundation`); objects (`resources`, `appointment_resources`, `create_booking_with_resources`) are absent on remote. |
| 2 | `LOCAL_ONLY` | `20260921_phase3_customer360_segmentation_foundation.sql` | `20260921` | `DRIFT_OR_CONFLICT` | Shares duplicate version `20260921` with `package_limits_multibranch`; `customer_segments` table exists on remote while `customer_segment_members` & `get_customer_360_view` are absent. |
| 3 | `LOCAL_ONLY` | `20260921_phase3_package_limits_multibranch_completeness.sql` | `20260921` | `DRIFT_OR_CONFLICT` | Shares duplicate version `20260921` with `customer360`; `deactivate_tenant_branch` exists on remote while `assign_staff_to_branch` & `get_branch_calendar_appointments` are absent. |
| 4 | `LOCAL_ONLY` | `20260922_phase3_reporting_analytics_foundation.sql` | `20260922` | `MISSING_UNAPPLIED_PROVEN` | `get_tenant_booking_analytics` & `get_tenant_customer_retention_analytics` absent on remote. |
| 5 | `LOCAL_ONLY` | `20260923_phase3_custom_domain_verification_foundation.sql` | `20260923` | `MISSING_UNAPPLIED_PROVEN` | `custom_domains`, `request_custom_domain`, `verify_custom_domain` absent on remote. |
| 6 | `LOCAL_ONLY` | `20260924_phase4_deposit_noshow_policy_foundation.sql` | `20260924` | `MISSING_UNAPPLIED_PROVEN` | `deposit_policies`, `no_show_policies`, `appointment_deposits` absent on remote. |
| 7 | `LOCAL_ONLY` | `20260925_phase4_loyalty_reactivation_foundation.sql` | `20260925` | `DRIFT_OR_CONFLICT` | Objects absent on remote, but shares duplicate version `20260925` with `packages_memberships`. |
| 8 | `LOCAL_ONLY` | `20260925_phase4_packages_memberships_foundation.sql` | `20260925` | `DRIFT_OR_CONFLICT` | Objects absent on remote, but shares duplicate version `20260925` with `loyalty_reactivation`. |
| 9 | `LOCAL_ONLY` | `20260926_phase4_giftcards_wallet_foundation.sql` | `20260926` | `MISSING_UNAPPLIED_PROVEN` | `client_wallets`, `gift_cards`, `transact_wallet_balance`, `redeem_gift_card` absent on remote. |
| 10 | `LOCAL_ONLY` | `20260927_phase5_vertical_skus_commercial_packaging.sql` | `20260927` | `MISSING_UNAPPLIED_PROVEN` | `resolve_tenant_vertical_context`, `enforce_practitioner_quota_limit` absent on remote. |
| 11 | `LOCAL_ONLY` | `20260928_phase5_clinic_practitioners_workspace_hardening.sql` | `20260928` | `DRIFT_OR_CONFLICT` | Shares duplicate version `20260928` with HT journey; `clinic_set_staff_profile` & `clinic_get_my_context` already exist from earlier Clinic migrations (`20260905`–`20260907`). |
| 12 | `LOCAL_ONLY` | `20260928_phase5_ht_treatment_journey_quote_itinerary.sql` | `20260928` | `DRIFT_OR_CONFLICT` | Objects (`ht_treatment_journeys`, `ht_journey_quotes`) absent on remote, but shares duplicate version `20260928` with clinic workspace hardening. |
| 13 | `LOCAL_ONLY` | `20260929_phase5_scheduling_buffer_parity_hardening.sql` | `20260929` | `DRIFT_OR_CONFLICT` | Replaces existing `evaluate_booking_slot` function whose remote body equivalence is unproven. |
| 14 | `LOCAL_ONLY` | `20260930_phase6_product_inventory_foundation.sql` | `20260930` | `MISSING_UNAPPLIED_PROVEN` | `products`, `inventory_balances`, `pos_create_product` absent on remote. |
| 15 | `LOCAL_ONLY` | `20261001_phase6_node2_suppliers_po_receiving.sql` | `20261001` | `MISSING_UNAPPLIED_PROVEN` | `suppliers`, `purchase_orders`, `pos_receive_purchase_order_items` absent on remote. |
| 16 | `LOCAL_ONLY` | `20261002_phase6_node3_pos_mixed_cart_checkout.sql` | `20261002` | `MISSING_UNAPPLIED_PROVEN` | `pos_orders`, `pos_order_items`, `pos_checkout_order` absent on remote. |
| 17 | `LOCAL_ONLY` | `20261003_phase6_node4_staff_commissions_tips.sql` | `20261003` | `MISSING_UNAPPLIED_PROVEN` | `staff_commission_rules`, `pos_tip_allocations`, `staff_earnings_ledger` absent on remote. |
| 18 | `LOCAL_ONLY` | `20261004_phase7_node1_verified_reviews_foundation.sql` | `20261004` | `UNKNOWN` | Objects exist on remote under `wp6_phase7_node1_verified_reviews_foundation` (`20261008063020`), but full function/constraint body equivalence requires restored-clone diffing. |
| 19 | `LOCAL_ONLY` | `20261005_phase7_node2_discovery_marketplace_projection.sql` | `20261005` | `UNKNOWN` | Objects exist on remote under `wp6_phase7_node2_discovery_marketplace_projection` (`20261008063027`); full body equivalence requires restored-clone diffing. |
| 20 | `LOCAL_ONLY` | `20261006_phase7_node3_favorites_fast_rebooking.sql` | `20261006` | `UNKNOWN` | Objects exist on remote under `wp6_phase7_node3_favorites_fast_rebooking` (`20261008063031`); full body equivalence requires restored-clone diffing. |
| 21 | `LOCAL_ONLY` | `20261007_program_v2_security_surface_hardening.sql` | `20261007` | `UNKNOWN` | Applied on remote as `wp6_program_v2_security_surface_hardening` (`20261008063041`); full body equivalence requires restored-clone diffing. |
| 22 | `REMOTE_ONLY` | `wp6_phase7_node1_verified_reviews_foundation` | `20261008063020` | `UNKNOWN` | Remote ledger entry corresponding to `20261004_phase7_node1_verified_reviews_foundation.sql`. |
| 23 | `REMOTE_ONLY` | `wp6_phase7_node2_discovery_marketplace_projection` | `20261008063027` | `UNKNOWN` | Remote ledger entry corresponding to `20261005_phase7_node2_discovery_marketplace_projection.sql`. |
| 24 | `REMOTE_ONLY` | `wp6_phase7_node3_favorites_fast_rebooking` | `20261008063031` | `UNKNOWN` | Remote ledger entry corresponding to `20261006_phase7_node3_favorites_fast_rebooking.sql`. |
| 25 | `REMOTE_ONLY` | `wp6_program_v2_security_surface_hardening` | `20261008063041` | `UNKNOWN` | Remote ledger entry corresponding to `20261007_program_v2_security_surface_hardening.sql`. |

> [!WARNING]
> **Never run blind `npx supabase db push` against `rwedeejhjazwjthdjzrt`!** Because of the duplicate date prefixes (`20260920`, `20260921`, `20260925`, `20260928`) and the 4 `wp6_*` remote-only versions (`20261008063020`–`20261008063041`), running `supabase db push` directly would fail or cause schema drift. Instead:
> 1. Apply the P0 token hardening (`20261011155623_appointment_access_tokens_table_access_hardening.sql`) first via the dedicated bounded wrapper (`scripts/Invoke-LariAppointmentTokenHardening.ps1`) after a verified logical backup is secured.
> 2. Use the restored PostgreSQL 17 backup clone to schema-diff the 21 `LOCAL_ONLY` and 4 `REMOTE_ONLY` migrations and author uniquely timestamped, idempotent forward repair migrations before any canonical migration runner execution.

---

## 4. RELEASE GATES C1–C4 SUMMARY (`72911e4fb68dd4f85f7fafef575089104102064e`)

| Release Gate | Source & CI Qualification State | Live Operational State | Authoritative Reference Document |
| :--- | :--- | :--- | :--- |
| **C1: Dependency Security Audit & Runtime Pinning** | **`PASS` (`HOSTED_CI_VERIFIED`):** Direct runtime dependency `react-router-dom` (and `react-router`) upgraded and pinned to `7.18.4`. `npm audit --omit=dev --audit-level=high` reports **0** production vulnerabilities. Remaining 9 build-only dev dependencies (`@babel/core`, `vite`, `postcss`, etc.) formally classified as non-exploitable in production bundle. | **`COMPLETE`** (in `72911e4fb68dd4f85f7fafef575089104102064e`) | [`docs/LARI_RELEASE_GATE_C1_C4_ACCEPTANCE_EVIDENCE.md`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/docs/LARI_RELEASE_GATE_C1_C4_ACCEPTANCE_EVIDENCE.md) |
| **C2: Zero-Cost Encrypted Logical Backup & Disposable PG17 Restore** | **`PASS` in isolated Docker (`39485734117` on PR #3 `2b238ed6...`).** | **`BLOCKED / NOT_COMPLETE`:** Live dispatch `39397783444` on `c8dfd3d2...` failed at disposable role restore. PR #3 (`2b238ed6...`) must be merged and re-dispatched, followed by external download and offline restore verification. | [`docs/LARI_ZERO_COST_BACKUP_RESTORE.md`](https://github.com/MertSGI/Randapp-main/blob/2b238ed66c5ef4f47fd35b613f8dda405c85f60d/docs/LARI_ZERO_COST_BACKUP_RESTORE.md) & [`docs/LARI_RELEASE_GATE_OWNER_OPERATIONS_CARD.md`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/docs/LARI_RELEASE_GATE_OWNER_OPERATIONS_CARD.md) |
| **C3: Live Staging P0 `appointment_access_tokens` Cutover** | **`PASS` in disposable PostgreSQL 17 (`38221591965`, `38951741181`, `38998120843`).** Wrapper `scripts/Invoke-LariAppointmentTokenHardening.ps1` and `scripts/sql/apply-appointment-token-hardening-staging.sql` verified. | **`NOT_APPLIED` on `rwedeejhjazwjthdjzrt`:** Gated on C2 completion + separate owner authorization (Owner Operations Card Step F). | [`docs/APPOINTMENT_TOKEN_HARDENING_STAGING_CUTOVER.md`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/docs/APPOINTMENT_TOKEN_HARDENING_STAGING_CUTOVER.md) |
| **C4: One-Time Protected-Staging Synthetic E2E** | **`PLAN_VERIFIED` (`docs/LARI_STAGING_SYNTHETIC_E2E_PLAN.md`).** | **`NOT_EXECUTED`:** Permitted only after C3 live P0 cutover postconditions pass and owner issues one-time synthetic fixture authorization. | [`docs/LARI_STAGING_SYNTHETIC_E2E_PLAN.md`](https://github.com/MertSGI/Randapp-main/blob/72911e4fb68dd4f85f7fafef575089104102064e/docs/LARI_STAGING_SYNTHETIC_E2E_PLAN.md) |
