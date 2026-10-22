# LARI — BATCH 05 EVIDENCE: RESTORE-AWARE MIGRATION AND P0 ACCEPTANCE ENGINE

- **Instruction ID:** `LARI-AG-BATCH05-RESTORE-P0-20261022-01`
- **Execution Model:** Gemini 3.8 Flash (High Thinking)
- **Repository:** `MertSGI/Randapp-main`
- **Worktree:** `C:\Projects\LARI-dev247-batch-20261021`
- **Branch:** `work/lari-dev247-batch-20261021`
- **Starting HEAD:** `d55f5877bff263f0982edcf1e5c73e1570127eec` (all 26 prior commits preserved intact)
- **Review PR #4:** `https://github.com/MertSGI/Randapp-main/pull/4` (`isDraft: true`, `state: OPEN` / `UNMERGED`, `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`)
- **Review PR #4 Target Base:** `staging/ci-lari-release-gate-c1-c4-20261017` (`72911e4fb68dd4f85f7fafef575089104102064e`)
- **Protected Staging Base:** `staging/supabase-staging-consistency` (`c8dfd3d247c8669b3e21f883451c777a376133ed`) (UNTOUCHED)
- **Backup PR #3:** `https://github.com/MertSGI/Randapp-main/pull/3` (`2b238ed66c5ef4f47fd35b613f8dda405c85f60d`) (UNTOUCHED)
- **Final Decision Status:** `SOURCE_READY_FOR_CONTROLLER_REVIEW`
- **Operational Next Gate:** `PR3_MERGE_OWNER_GO_REQUIRED`

---

## 1. WP-05A — Identity, Dependency Gates & Backup Blob Parity

### 1.1 Git Blob Parity Verification Against PR #3 (`2b238ed66c5ef4f47fd35b613f8dda405c85f60d`)
All 4 backup source files on `work/lari-dev247-batch-20261021` match approved PR #3 byte-for-byte:

| File Path | HEAD Blob SHA | PR #3 Blob SHA | Staging Default Blob SHA | Parity Verdict |
|---|---|---|---|---|
| `.github/workflows/lari-zero-cost-logical-backup.yml` | `0b77aaf8e91be76366b5441db74b10b059a83570` | `0b77aaf8e91be76366b5441db74b10b059a83570` | `084411e573cb087f85f12f0e2ebd8829fcc0ab87` | `EXACT_MATCH_PR3` (Differs from staging default) |
| `scripts/verify-disposable-pg17-role-restore.mjs` | `4d1ef6ddc899df79412cf7ee304425c08cc8b4d2` | `4d1ef6ddc899df79412cf7ee304425c08cc8b4d2` | *(MISSING)* | `EXACT_MATCH_PR3` (New in PR #3) |
| `scripts/run-zero-cost-logical-backup.sh` | `6e4786296fdb395f164bffc4f58fbe45cf36ada3` | `6e4786296fdb395f164bffc4f58fbe45cf36ada3` | `1082cd6d3bbd819f33234aafddb15464225d8e66` | `EXACT_MATCH_PR3` (Differs from staging default) |
| `scripts/backup/supabase-prod-ca-2021.crt` | `3d693669b23c340c57a3457bdc8b6fefe1806cc5` | `3d693669b23c340c57a3457bdc8b6fefe1806cc5` | `3d693669b23c340c57a3457bdc8b6fefe1806cc5` | `EXACT_MATCH_PR3` (Identical) |

- **Staging Default Workflow State:** The default branch `staging/supabase-staging-consistency` still contains the legacy backup workflow (`lari_restore_admin`), not the tested `supabase_admin` workflow from PR #3.
- **Workflow Dispatch Attestation:** No live backup workflow dispatch was executed.
- **Status:** `BACKUP_PR3_MERGE_PENDING_OWNER_GO`.

### 1.2 Migration Reconciliation Matrix & Evidence Attestation
- Validated `docs/evidence/migration-reconciliation-20261011.json` and `docs/lari-program/MIGRATION_RECONCILIATION_MATRIX.json`:
  - `total_entries`: `26`
  - `total_differences_count`: `25`
  - `local_only`: `21`
  - `remote_only`: `4` (`20261008063020`, `20261008063027`, `20261008063031`, `20261008063041`)
  - `collision_groups`: `4` (`COLLISION_20260920`, `COLLISION_20260921`, `COLLISION_20260925`, `COLLISION_20260928`)
  - `p0_cutover`: `1` (`20261011155623_appointment_access_tokens_table_access_hardening.sql`, LF digest: `260F727516CFF4CF0754295206A10E56505A9CA9E22AEC099BB7F21099BD5E13`)
- All 21 local migration files and the 1 P0 migration file exist on disk and match expected SHA-256 digests.

---

## 2. WP-05B — Restore-Aware, Read-Only Reconciliation Verifier

### 2.1 Implementation Architecture
Created:
- `scripts/lari-recovery/clone-connection-boundary.mjs`: Loopback-only (`localhost`, `127.0.0.1`, `::1`) connection boundary with strict credential redaction, dedicated `lari_restore_*` database naming requirement, mandatory `LARI_RESTORE_CLONE_CONFIRMED=1` guard, statement timeout (10s), connection timeout (5s), and `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY` enforcement.
- `scripts/lari-recovery/verify-restored-clone.mjs`: Catalog extraction (tables, views, functions, RLS policies, table privileges, applied migrations in `supabase_migrations.schema_migrations`), deterministic SHA-256 catalog fingerprinting, and reconciliation against the migration matrix.
  - Reports `NEEDS_CLONE_DIFF` for unproven semantic matches without recommending ledger surgery or fabricating resolutions.
  - Reports `CATALOG_BASELINE_MISSING` if no baseline manifest is provided (never fabricates `PARITY_PASS`).
  - Emits local sanitized JSON receipt under `test-results/lari-recovery/reconciliation-clone-receipt.json` with `staging_restore_status: "STAGING_RESTORE_NOT_ATTESTED"`.
  - Exits cleanly with `RESTORED_CLONE_REQUIRED` when no local clone is configured.

### 2.2 Test Suite Coverage (`scripts/test-lari-restored-clone.test.mjs`) — 12/12 PASS
1. Rejects live Supabase hostname and pooler hosts (`supabase.co`, `pooler.supabase.com`).
2. Rejects non-loopback hostnames and obfuscated IP addresses (octal, hex, dword, remote IPs).
3. Rejects default database names (`postgres`, `template1`, `supabase_admin`) — requires `lari_restore_*`.
4. Rejects execution when `LARI_RESTORE_CLONE_CONFIRMED=1` is absent.
5. Rejects missing or empty database URL with `RESTORED_CLONE_REQUIRED`.
6. Rejects DDL injection and malformed parameters in database name.
7. Redacts passwords and sensitive tokens in all outputs and error messages.
8. Validates migration matrix counts (21 LOCAL_ONLY, 4 REMOTE_ONLY, 4 collision groups, 1 P0).
9. Reports `NEEDS_CLONE_DIFF` for unproven remote-only versions without fabricated resolutions.
10. Returns `RESTORED_CLONE_REQUIRED` with no fabricated PASS when clone is omitted.
11. Reports `CATALOG_BASELINE_MISSING` when no verified baseline manifest is provided.
12. Docker PG17 clone fixture integration test (executes catalog extraction, migration query, and receipt writing when Docker daemon is available).

---

## 3. WP-05C — P0 Cutover Postcondition Verifier for Restored Clone

### 3.1 Implementation Architecture
Created:
- `scripts/lari-recovery/verify-p0-cutover.mjs`: Read-only catalog evaluation of `public.appointment_access_tokens`:
  - Table existence, relkind (`'r'`), owner (`'postgres'`), and RLS enabled (`relrowsecurity = true`).
  - Strict 7-column schema parity (`id`, `tenant_id`, `appointment_id`, `token_hash`, `expires_at`, `created_at`, `used_at`).
  - Absence of pre-hardening open policy `"Allow public select by token hash"` (`P0_NOT_APPLIED` if present).
  - Absence of any unrestricted `USING (true)` or `WITH CHECK (true)` policy for `public` or `anon` (`P0_POSTCONDITION_FAILED` if present).
  - Zero direct table privileges for role `anon` (`SELECT`, `INSERT`, `UPDATE`, `DELETE` must all be false via `has_table_privilege`).
  - Presence of all 5 required token-management RPCs (`create_public_booking`, `get_public_appointment_by_manage_token`, `cancel_public_appointment_by_manage_token`, `request_public_appointment_reschedule_by_manage_token`, `get_public_pending_reschedule_request_by_manage_token`) as `SECURITY DEFINER` with `anon` EXECUTE grant.
  - Verdicts: `P0_NOT_APPLIED`, `P0_POSTCONDITION_FAILED`, or `P0_CLONE_POSTCONDITION_PASS`.
  - Invariant: `live_p0_accepted: false` strictly enforced (clone postcondition success is never conflated with live staging acceptance).

### 3.2 Test Suite Coverage (`scripts/test-lari-p0-cutover.test.mjs`) — 10/10 PASS
1. Rejects non-loopback hostnames and live Supabase URLs.
2. Returns `RESTORED_CLONE_REQUIRED` without fabricated PASS when DB URL is omitted.
3. Missing `public.appointment_access_tokens` returns `P0_NOT_APPLIED` (`TABLE_MISSING`).
4. Pre-hardening open policy fixture returns `P0_NOT_APPLIED` (`PRE_HARDENING_OPEN_POLICY_PRESENT`).
5. RLS disabled fixture returns `P0_POSTCONDITION_FAILED` (`RLS_NOT_ENABLED`).
6. Non-postgres table owner returns `P0_POSTCONDITION_FAILED` (`UNEXPECTED_OWNER`).
7. Column schema mismatch fixture returns `P0_POSTCONDITION_FAILED` (`COLUMN_SCHEMA_MISMATCH`).
8. Direct anon table privilege retained fixture returns `P0_POSTCONDITION_FAILED` (`ANON_PRIVILEGES_RETAINED`).
9. Missing or non-SECURITY DEFINER token RPC fixture returns `P0_POSTCONDITION_FAILED` (`TOKEN_RPC_POSTCONDITION_FAILED`).
10. Hardened clone fixture passes with `P0_CLONE_POSTCONDITION_PASS` and `live_p0_accepted: false`.

---

## 4. WP-05D — Local QA Matrix, Separated Commits & Hosted CI Verification

### 4.1 Local QA Matrix (17/17 Suites — Exit Code `0`)

| Suite Command | Exit Code | Result Summary |
|---|---|---|
| `npm run qa:lari-restored-clone-verifier` | `0` | `12/12 PASS` |
| `npm run qa:lari-p0-postconditions` | `0` | `10/10 PASS` |
| `npm run qa:legal-callsites` | `0` | `15/15 PASS` (mounted Playwright DOM tests included) |
| `npm run qa:legal-ui-failclosed` | `0` | `7/7 PASS` |
| `npm run qa:legal-persistence-failclosed` | `0` | `9/9 PASS` |
| `npm run qa:legal-schema-security-plan` | `0` | `12/12 PASS` |
| `npm run qa:migration-reconciliation-evidence` | `0` | `6/6 PASS` |
| `npm run qa:lari-migration-plan` | `0` | `9/9 PASS` |
| `npm run qa:zero-cost-backup-workflow` | `0` | `15/15 PASS` |
| `npm run qa:dev247-runner` | `0` | `11/11 PASS` |
| `npm run qa:dev247-windows-supervisor` | `0` | `6/6 PASS` |
| `npm run qa:payment-client-failclosed` | `0` | `15/15 PASS` |
| `npm run qa:communication-failclosed` | `0` | `8/8 PASS` |
| `npm run qa:auth-isolation` | `0` | `7/7 PASS` |
| `npm run lint` | `0` | `0` TypeScript errors (`tsc --noEmit`) |
| `npm run build` | `0` | Vite production bundle built cleanly (25.24s) |
| `npm run check:secrets` | `0` | `0` frontend secret exposures found |

### 4.2 Separated Commit Chain on `work/lari-dev247-batch-20261021`

| Commit Order | SHA | Commit Message |
|---|---|---|
| 27 | `f7df5ce13926868840d869273619a9d7010461f3` | `feat(recovery): implement restore-aware migration reconciliation verifier (WP-05B)` |
| 28 | `da2edb00be27e8a939fdf577a7f85dc732dafa49` | `feat(recovery): implement P0 cutover postcondition verifier for restored clone (WP-05C)` |
| 29 | `d381586da6ca95aa86975ffdde7e9126aea036ed` | `ci(dev247): register clone recovery verifier suites in source review CI (WP-05D)` |

### 4.3 Hosted GitHub Actions CI Results for Triggering HEAD `d381586da6ca95aa86975ffdde7e9126aea036ed`
- **Push Workflow Run:** `39746683043` (`https://github.com/MertSGI/Randapp-main/actions/runs/39746683043`)
  - **Status / Conclusion:** `COMPLETED / SUCCESS`
  - **Linux Job (`Exact SHA V1 source regression`, incl. disposable PG17 qualification + Batch05 verifiers):** `https://github.com/MertSGI/Randapp-main/actions/runs/39746683043/job/119716770703` (`SUCCESS` in 2m55s)
  - **Windows Job (`Windows runner and agent preflight contracts`, incl. Batch05 verifiers):** `https://github.com/MertSGI/Randapp-main/actions/runs/39746683043/job/119716770895` (`SUCCESS` in 1m01s)
- **Pull Request #4 Workflow Run:** `39746689784` (`https://github.com/MertSGI/Randapp-main/actions/runs/39746689784`)
  - **Status / Conclusion:** `COMPLETED / SUCCESS`
  - **Linux Job:** `https://github.com/MertSGI/Randapp-main/actions/runs/39746689784/job/119718139976` (`SUCCESS` in 3m48s)
  - **Windows Job:** `https://github.com/MertSGI/Randapp-main/actions/runs/39746689784/job/119718142581` (`SUCCESS` in 1m14s)

---

## 5. WP-05E — Operational Decision Record & Next Owner Gate

### 5.1 Current GitHub API Metadata for PR #3
- **PR Number:** `3`
- **PR Title:** `test(backup): isolate PostgreSQL 17.6 role qualification in ephemeral network-disabled Docker container`
- **Head Ref:** `review/lari-backup-restore-role-grant-fix-20261020` at `2b238ed66c5ef4f47fd35b613f8dda405c85f60d`
- **Base Ref:** `staging/supabase-staging-consistency` at `c8dfd3d247c8669b3e21f883451c777a376133ed`
- **Mergeable Status:** `MERGEABLE` (`mergeStateStatus: CLEAN`, `isDraft: false`, `state: OPEN`)
- **Qualification Run:** Action `39485734117` (`PASS` on synthetic Docker PostgreSQL 17.6 qualification, *not* live staging restore).
- **Merge Governance:** PR #3 requires explicit, separate Controller/owner authorization before merge into default staging (`staging/supabase-staging-consistency`). No auto-merge was performed or authorized by this batch.

### 5.2 Gated Operational Sequence
1. **Gate 1 (`PR3_MERGE_OWNER_GO_REQUIRED`):**
   - The repository owner / Controller must independently authorize and execute the merge of PR #3 (`2b238ed66c5ef4f47fd35b613f8dda405c85f60d`) into `staging/supabase-staging-consistency`.
2. **Gate 2 (Post-Merge Single Backup Workflow Dispatch):**
   - Once merged and read back on the default branch, the repaired backup workflow (`.github/workflows/lari-zero-cost-logical-backup.yml`) becomes eligible for a **new, single-run** `workflow_dispatch` against staging project `rwedeejhjazwjthdjzrt`.
   - Requires verified secret names only (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`), expected ref, and fail-stop on restore verification failure.
3. **Gate 3 (Verified Offline Staging Restore):**
   - Actual backup success requires non-empty encrypted logical dump + `VERIFIED_LOGICAL_RESTORE` receipt against disposable PostgreSQL 17 + offsite encrypted copy verification.
4. **Gate 4 (Owner-Gated Live P0 Application):**
   - Only after Gate 3 is achieved, execute `20261011155623_appointment_access_tokens_table_access_hardening.sql` on live staging under separate owner approval. Run `verify-p0-cutover.mjs` against live staging read-only catalog to verify postconditions.
5. **Gate 5 (Restored-Clone Migration Reconciliation):**
   - Run `verify-restored-clone.mjs` against the restored staging clone to diff unproven remote versions (`20261008063020`..`20261008063041`) and collision groups before any migration ledger resolution. Never run `supabase db push` or forge ledger entries.

---

## 6. Open Gates Summary (Attestation of Non-Execution)

| Gate | Status | Attestation |
|---|---|---|
| **PR #3 Merge** | `OPEN` / `PR3_MERGE_OWNER_GO_REQUIRED` | NOT merged; awaiting Controller authorization |
| **PR #4 Merge** | `OPEN` / `DRAFT` | NOT merged; remains draft review PR |
| **Live Backup Dispatch** | `OPEN` / `GATED_BY_PR3_MERGE` | NOT dispatched |
| **Staging SQL Execution** | `OPEN` / `GATED_BY_BACKUP_RESTORE` | NO SQL applied to Supabase staging |
| **Production Deployment** | `LOCKED` / `QUARANTINED` | NO production deployment or alias modified |
| **Live P0 Acceptance** | `OPEN` / `NOT_APPLIED_ON_STAGING` | Only verified on disposable test fixtures |
| **Migration Reconciliation** | `OPEN` / `NEEDS_CLONE_DIFF` | Awaiting restored staging clone metadata diff |
