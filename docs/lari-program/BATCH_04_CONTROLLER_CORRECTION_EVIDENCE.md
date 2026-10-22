# LARI — BATCH 04 CONTROLLER CORRECTION EVIDENCE (PR #4)

- **Instruction ID:** `LARI-B04-CORR-20261022-01`
- **Execution Model:** Gemini 4 Argon (High Thinking)
- **Repository:** `MertSGI/Randapp-main`
- **Isolated Review Branch:** `work/lari-dev247-batch-20261021`
- **Previous Remote HEAD (Pre-Correction):** `8a2fdc81b43751e6265d6490a28c2c7bc6e4efbf`
- **Corrected Source Implementation HEAD:** `1489046d33cebb462884184727d2a3f6076fd1d0`
- **Review PR:** `https://github.com/MertSGI/Randapp-main/pull/4` (`DRAFT`, `UNMERGED`)
- **Corrected PR Base Branch:** `staging/ci-lari-release-gate-c1-c4-20261017` (`72911e4fb68dd4f85f7fafef575089104102064e`)
- **Protected Default / Backup Lane (Untouched):** `staging/supabase-staging-consistency` (`c8dfd3d247c8669b3e21f883451c777a376133ed`)
- **Backup PR #3 (Untouched):** `https://github.com/MertSGI/Randapp-main/pull/3` (`2b238ed66c5ef4f47fd35b613f8dda405c85f60d`)
- **PostgreSQL 17.6 Disposable Qualification Verdict:** `DISPOSABLE_PG17_FIXTURE_VERIFIED` (Hosted Ubuntu CI) / `SQL_CLONE_TEST_NOT_RUN` (Local Windows without Docker)
- **Legal RLS Proposal Acceptance Status:** `SOURCE_PROPOSED_ONLY` / `RLS_PROPOSAL_NOT_ACCEPTED`
- **Overall Decision Status:** `SOURCE_READY_FOR_CONTROLLER_REVIEW` (NOT `PRODUCTION_GO`, NOT `LEGAL_RLS_ACCEPTED`, NOT `AUTONOMOUS_24_7_ACTIVE`)

---

## 1. C01 — Draft PR #4 Base Correction & Source History Preservation

### 1.1 Readback Before Metadata Update
`gh pr view 4 --repo MertSGI/Randapp-main --json number,isDraft,state,baseRefName,headRefName,headRefOid,mergeable,mergeStateStatus`:
```json
{
  "baseRefName": "staging/supabase-staging-consistency",
  "headRefName": "work/lari-dev247-batch-20261021",
  "headRefOid": "8a2fdc81b43751e6265d6490a28c2c7bc6e4efbf",
  "isDraft": true,
  "mergeStateStatus": "DIRTY",
  "mergeable": "CONFLICTING",
  "number": 4,
  "state": "OPEN"
}
```

### 1.2 Metadata-Only Base Update & Readback Verification
Executed `gh pr edit 4 --repo MertSGI/Randapp-main --base staging/ci-lari-release-gate-c1-c4-20261017` without rebasing, resetting, or rewriting branch history.
Readback after update:
```json
{
  "baseRefName": "staging/ci-lari-release-gate-c1-c4-20261017",
  "headRefName": "work/lari-dev247-batch-20261021",
  "headRefOid": "8a2fdc81b43751e6265d6490a28c2c7bc6e4efbf",
  "isDraft": true,
  "mergeStateStatus": "BLOCKED",
  "mergeable": "MERGEABLE",
  "number": 4,
  "state": "OPEN",
  "url": "https://github.com/MertSGI/Randapp-main/pull/4"
}
```
All 21 prior commits (`cc608da2c6066bd533d085156eb2f8398e0f105d` through `8a2fdc81b43751e6265d6490a28c2c7bc6e4efbf`) remain intact and unmodified atop `72911e4fb68dd4f85f7fafef575089104102064e`.

---

## 2. C02 & C04 — Pre-Correction Failing Behavioral Tests vs. Post-Correction Pass

### 2.1 Pre-Correction Failing Test Evidence Against `8a2fdc81b43751e6265d6490a28c2c7bc6e4efbf`
Before editing `pages/AppointmentSelfServicePage.tsx` or `pages/RegistrationPage.tsx`, the upgraded behavioral test suite `scripts/test-legal-callsites.test.mjs` was executed against the unmodified `8a2fdc81b43751e6265d6490a28c2c7bc6e4efbf` source and failed on 4 assertions:
- **Test 8 (`AppointmentSelfServicePage.tsx` static guard):**
  `AssertionError [ERR_ASSERTION]: Must NOT contain obsolete inline dynamic import(.then) KVKK submission path`
- **Test 13 (Playwright mounted `AppointmentSelfServicePage` in persistent mode):**
  `AssertionError [ERR_ASSERTION]: Must render exactly ONE KVKK form toggle button (no duplicated KVKK section): 2 !== 1`
- **Test 14 (Playwright mounted `AppointmentSelfServicePage` in local demo mode):**
  `AssertionError [ERR_ASSERTION]: Strictly 1 KVKK form must be mounted: 2 !== 1`
- **Test 15 (Playwright mounted `RegistrationPage` in persistent mode):**
  `AssertionError [ERR_ASSERTION]: Downstream onboarding route query must explicitly distinguish provisioningState=TENANT_PROVISIONED and legalReceipt=LEGAL_ACCEPTANCE_PENDING_SERVER_RECEIPT, got: ?tab=kurulum&registration=success`

### 2.2 C02 & C04 Source Corrections (`7eb59e149b12fc7940ba0c19b5d7a8fe459e32eb`)
1. **`pages/AppointmentSelfServicePage.tsx`:**
   - Removed the obsolete first KVKK form block (formerly lines 602–690) that used an inline `import('../services/dataRightsRequestService').then(...)` callback and swallowed errors to `console.error`.
   - Retained the single consolidated KVKK/data-rights form wired to `handleKvkkSubmit` with a synchronous `kvkkSubmittingRef` lock preventing rapid double-click duplicate submissions, a visible `role="alert"` error banner (`data-testid="kvkk-error-banner"`) when `LEGAL_PERSISTENCE_REQUIRED` is thrown in persistent mode, and full retention of the user's typed description (`kvkkDesc`) on failure.
   - Preserved all customer appointment lookup, token validation, cancellation, rescheduling, and Stage C2 self-service UI invariants.
2. **`pages/RegistrationPage.tsx`:**
   - Added `RegistrationLegalReceiptStatus` (`LEGAL_ACCEPTANCE_PENDING_SERVER_RECEIPT` vs `LEGAL_ACCEPTANCE_RECORDED_LOCAL_DEMO`) so persistent-mode tenant registration explicitly differentiates `provisioningState: 'TENANT_PROVISIONED'` from `legalReceiptState: 'LEGAL_ACCEPTANCE_PENDING_SERVER_RECEIPT'` with `legalComplianceSatisfied: false` both in the registration UI banner (`data-testid="registration-legal-receipt-status"`) and in the downstream router transition (`search` query + location `state`), without rolling back or deleting legitimate tenant provisioning.

### 2.3 Post-Correction Behavioral Pass (`npm run qa:legal-callsites`)
All 15 tests in `scripts/test-legal-callsites.test.mjs` pass (`15/15 PASS`, exit code `0`), including Playwright Chromium mounted component tests verifying:
- Strictly `1` KVKK form and `1` toggle button exist in the mounted DOM.
- Submitting the form in persistent mode triggers `LEGAL_PERSISTENCE_REQUIRED`, renders `role="alert"` with the error message, preserves the typed description in the textarea, renders zero success banners, and performs zero database writes.
- Rapid double-clicking the submit button in local demo mode invokes `createDataRightsRequest` exactly once and resets the input only after success.
- Submitting `RegistrationPage` in persistent mode transitions with `provisioningState=TENANT_PROVISIONED`, `legalReceipt=LEGAL_ACCEPTANCE_PENDING_SERVER_RECEIPT`, and `legalComplianceSatisfied: false`.

---

## 3. C03 — Legal RLS Proposal Correction & Disposable PostgreSQL 17.6 Qualification

### 3.1 Pre-Correction Failing Test Evidence Against `8a2fdc81b43751e6265d6490a28c2c7bc6e4efbf`
Before editing `docs/lari-program/security-proposals/PUBLIC_CONSENT_RLS_FORWARD_PROPOSAL.sql` and `CONSENT_TRUSTED_WRITE_CONTRACT.md`, the upgraded test suite `scripts/test-legal-schema-security-plan.test.mjs` failed on 5 assertions against `8a2fdc81`:
- **Test 3:** `AssertionError: Must explicitly set NO FORCE ROW LEVEL SECURITY on consent_ledger to protect SECURITY DEFINER create_public_booking`
- **Test 4:** `AssertionError: Must drop over-broad FOR ALL policy "Owner/Admin manage consent ledger" on consent_ledger`
- **Test 6:** `AssertionError: Executable SQL in PUBLIC_CONSENT_RLS_FORWARD_PROPOSAL.sql must NOT reference non-existent column actor_id`
- **Test 10:** `AssertionError: Contract must document UNRESOLVED_IDENTITY_BOUNDARY`
- **Test 11:** `AssertionError: Proposal header must state status is SOURCE_PROPOSED_ONLY and RLS_PROPOSAL_NOT_ACCEPTED`

Additionally, inside the disposable PostgreSQL 17.6 container (`postgres:17.6-alpine`), executing `CREATE POLICY ... ON public.consent_ledger ... USING (actor_id = 'test')` against the real `public.consent_ledger` schema fails with:
`ERROR: column "actor_id" does not exist`
And enabling `FORCE ROW LEVEL SECURITY` on `public.consent_ledger` after dropping `"Allow public insertion during checkout"` causes `SELECT public.create_public_booking(...)` as `anon` to fail with:
`ERROR: new row violates row-level security policy for table "consent_ledger"` when the function owner does not hold `BYPASSRLS`.

### 3.2 C03 Source Proposal Corrections (`0ecb8488b9dcc67850837670a6ddebae4fe14f21`)
- File remains strictly in `docs/lari-program/security-proposals/PUBLIC_CONSENT_RLS_FORWARD_PROPOSAL.sql` (never copied to `supabase/migrations/`, never executed on live staging or production).
- Removed all `actor_id` and unverified `app_metadata.tenant_id` references.
- Grounded all policy expressions in verified real schema columns (`public.policy_acceptances.user_id`, `public.policy_acceptances.tenant_id`, `public.consent_ledger.tenant_id`, `public.consent_ledger.customer_id`) and the canonical `public.users_profile` table (`20260622_rls_security_audit_fixes.sql`).
- Marked `UNRESOLVED_IDENTITY_BOUNDARY` on customer-direct `public.consent_ledger` reads (since `consent_ledger.customer_id` stores `public.customers.id::text` with no verified 1:1 foreign-key binding to `auth.uid()::text`), defaulting customer-direct table `SELECT` to safe deny rather than naively mapping JWT `sub` to `customer_id`.
- Used `ENABLE ROW LEVEL SECURITY` + `NO FORCE ROW LEVEL SECURITY` on `public.consent_ledger` and `public.policy_acceptances`, and dropped the over-broad `FOR ALL` policy `"Owner/Admin manage consent ledger"` in favor of `FOR SELECT` policy `tenant_scoped_consent_ledger_read`.

### 3.3 Hosted CI Disposable PostgreSQL 17.6 Qualification Verdict (`1489046d33cebb462884184727d2a3f6076fd1d0`)
In GitHub Actions run `39740064584` (Ubuntu job `119694855746`, step `Bounded PostgreSQL 17 disposable SQL proposal validation` with `LARI_REQUIRE_PG17_DOCKER=1`), `scripts/test-legal-schema-security-plan.test.mjs` launched an isolated `--network none` `postgres:17.6-alpine` container and verified all 12 tests (`12/12 PASS`), proving:
1. Non-existent `actor_id` policy expressions fail compilation on PostgreSQL 17.6 (`column "actor_id" does not exist`).
2. Unproven `FORCE ROW LEVEL SECURITY` breaks `SECURITY DEFINER` `public.create_public_booking` when the owner lacks `BYPASSRLS`.
3. `PUBLIC_CONSENT_RLS_FORWARD_PROPOSAL.sql` parses and executes cleanly with zero errors against the verified table definitions.
4. Positive path: `anon` calling `public.create_public_booking(...)` succeeds (`reason_code = 'ok'`) and atomically inserts 3 consent rows into `public.consent_ledger`.
5. Negative path: `anon` and `authenticated` direct `INSERT` / `DELETE` on `public.consent_ledger` and `public.policy_acceptances` fail closed (`permission denied`).
6. Cross-tenant isolation: `anon` `SELECT` returns `0` rows; authenticated Tenant A owner reads only Tenant A's `3` consent rows and `1` policy acceptance row (`0` rows from Tenant B); authenticated Tenant B owner reads `0` Tenant A consent rows and `1` own policy acceptance row.

---

## 4. C05 — Local QA Matrix, Separated Commits & Hosted Exact-SHA CI Verification

### 4.1 Separated Commit Chain on `work/lari-dev247-batch-20261021`
All 21 prior commits (`cc608da2c6066bd533d085156eb2f8398e0f105d` .. `8a2fdc81b43751e6265d6490a28c2c7bc6e4efbf`) were preserved verbatim, followed by:
1. **`7eb59e149b12fc7940ba0c19b5d7a8fe459e32eb`** — `fix(ui): deduplicate self-service KVKK form and distinguish registration legal receipt state`
   - `pages/AppointmentSelfServicePage.tsx`
   - `pages/RegistrationPage.tsx`
2. **`0ecb8488b9dcc67850837670a6ddebae4fe14f21`** — `fix(sql-proposal): align legal RLS proposal columns with verified schema and protect booking RPC`
   - `docs/lari-program/security-proposals/PUBLIC_CONSENT_RLS_FORWARD_PROPOSAL.sql`
   - `docs/lari-program/security-proposals/CONSENT_TRUSTED_WRITE_CONTRACT.md`
3. **`1489046d33cebb462884184727d2a3f6076fd1d0`** — `test(behavioral): add mounted UI callsite tests and disposable PG17 SQL proposal qualification`
   - `scripts/test-legal-callsites.test.mjs`
   - `scripts/test-legal-schema-security-plan.test.mjs`
   - `.github/workflows/lari-dev247-source-review.yml`

### 4.2 Mandatory 16 Local QA Suites (Observed Exit Codes)
| # | Command | Observed Exit Code | Result Summary |
|---|---|---|---|
| 1 | `npm run qa:legal-callsites` | `0` | `15/15 PASS` (includes mounted Playwright DOM tests 13, 14, 15) |
| 2 | `npm run qa:legal-ui-failclosed` | `0` | `7/7 PASS` |
| 3 | `npm run qa:legal-persistence-failclosed` | `0` | `9/9 PASS` |
| 4 | `npm run qa:legal-schema-security-plan` | `0` | `12/12 PASS` (`SQL_CLONE_TEST_NOT_RUN` locally; `DISPOSABLE_PG17_FIXTURE_VERIFIED` in Ubuntu CI) |
| 5 | `npm run qa:migration-reconciliation-evidence` | `0` | `6/6 PASS` |
| 6 | `npm run qa:lari-migration-plan` | `0` | `9/9 PASS` |
| 7 | `npm run qa:zero-cost-backup-workflow` | `0` | `15/15 PASS` |
| 8 | `npm run qa:dev247-runner` | `0` | `11/11 PASS` |
| 9 | `npm run qa:dev247-windows-supervisor` | `0` | `6/6 PASS` |
| 10 | `npm run qa:payment-client-failclosed` | `0` | `15/15 PASS` |
| 11 | `npm run qa:communication-failclosed` | `0` | `8/8 PASS` |
| 12 | `npm run qa:auth-isolation` | `0` | `7/7 PASS` |
| 13 | `npm run lint` | `0` | `0` TypeScript errors (`tsc --noEmit`) |
| 14 | `npm run build` | `0` | Vite production bundle built cleanly |
| 15 | `npm run qa:ui-v2-booking-e2e` | `0` | Playwright Chromium booking E2E `PASS` |
| 16 | `npm run qa:ui-v2-booking-integrity` | `0` | Playwright Chromium booking integrity `PASS` |

### 4.3 Hosted GitHub Actions Exact-SHA Verification for `1489046d33cebb462884184727d2a3f6076fd1d0`
- **Push Workflow Run (`LARI DEV247 Isolated Source QA`):**
  - **Run ID:** `39740064584`
  - **Run URL:** `https://github.com/MertSGI/Randapp-main/actions/runs/39740064584`
  - **Triggered HEAD SHA:** `1489046d33cebb462884184727d2a3f6076fd1d0`
  - **Status / Conclusion:** `completed` / `success`
  - **Ubuntu Job (`Exact SHA V1 source regression`, incl. Disposable PG17 SQL Proposal & Role Qualification):**
    `https://github.com/MertSGI/Randapp-main/actions/runs/39740064584/job/119694855746` (`completed` / `success`)
  - **Windows Job (`Windows runner and agent preflight contracts`):**
    `https://github.com/MertSGI/Randapp-main/actions/runs/39740064584/job/119694855456` (`completed` / `success`)
- **Pull Request Workflow Run (`LARI DEV247 Isolated Source QA` on PR #4 targeting `staging/ci-lari-release-gate-c1-c4-20261017`):**
  - **Run ID:** `39740073331`
  - **Run URL:** `https://github.com/MertSGI/Randapp-main/actions/runs/39740073331`
  - **Triggered HEAD SHA:** `1489046d33cebb462884184727d2a3f6076fd1d0`
  - **Status / Conclusion:** `completed` / `success`
  - **Ubuntu Job:** `https://github.com/MertSGI/Randapp-main/actions/runs/39740073331/job/119694883453` (`completed` / `success`)
  - **Windows Job:** `https://github.com/MertSGI/Randapp-main/actions/runs/39740073331/job/119694883712` (`completed` / `success`)

---

## 5. Remaining Server Implementation Gates & Non-Execution Attestation

1. **Zero Live Database or Production Mutation:**
   - No SQL was applied to Supabase staging or production.
   - No live backup workflow (`lari-zero-cost-logical-backup.yml`) was dispatched.
   - PR #3 (`2b238ed66c5ef4f47fd35b613f8dda405c85f60d`) and protected branches (`staging/supabase-staging-consistency`, `staging/ci-lari-release-gate-c1-c4-20261017`, `main`, `ops/vercel-production-quarantine-20261018`) were not modified or merged.
   - PR #4 remains `DRAFT` and `UNMERGED`.
2. **Remaining Gates Before `LEGAL_RLS_ACCEPTED` or `PRODUCTION_GO`:**
   - **Trusted Server Legal Write Endpoint:** A server-authoritative RPC or Edge Function is required to record `policy_acceptances`, standalone `consent_ledger` updates, and customer `data_rights_requests` in persistent mode (currently fail-closed in client with `LEGAL_PERSISTENCE_REQUIRED` and `LEGAL_ACCEPTANCE_PENDING_SERVER_RECEIPT`).
   - **Unresolved Customer Identity Boundary (`UNRESOLVED_IDENTITY_BOUNDARY`):** `public.consent_ledger.customer_id` has no verified 1:1 link to `auth.uid()`; customer-direct reads remain denied by default until a verified token-scoped or server-mediated read RPC is introduced.
   - **Live Staging Backup & Staging Clone Rehearsal:** `PUBLIC_CONSENT_RLS_FORWARD_PROPOSAL.sql` remains `SOURCE_PROPOSED_ONLY` / `RLS_PROPOSAL_NOT_ACCEPTED` until a verified logical backup and full staging clone rehearsal are completed.
   - **Autonomous 24/7 Runner Gate:** Headless Antigravity CLI adapter remains `HOLD_AGENT_ADAPTER_UNVERIFIED`, and the Windows supervisor remains disabled/dry-run (`AUTONOMOUS_24_7_INACTIVE`).
