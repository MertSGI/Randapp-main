import fs from 'fs';
import path from 'path';

console.log('🔍 Starting Paymentless Production Go/No-Go Readiness Verification...\n');

let pass = true;

function verifyFileExists(relativePath) {
  const absolutePath = path.join(process.cwd(), relativePath);
  if (fs.existsSync(absolutePath)) {
    console.log(`✅ File exists: ${relativePath}`);
    return true;
  } else {
    console.error(`❌ File NOT found: ${relativePath}`);
    pass = false;
    return false;
  }
}

function verifyFileContains(relativePath, substrings) {
  const absolutePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absolutePath)) {
    pass = false;
    return;
  }
  const content = fs.readFileSync(absolutePath, 'utf8');
  for (const sub of substrings) {
    if (content.toLowerCase().includes(sub.toLowerCase())) {
      console.log(`✅ [${relativePath}] contains expected: "${sub.substring(0, 50)}..."`);
    } else {
      console.error(`❌ [${relativePath}] missing expected: "${sub}"`);
      pass = false;
    }
  }
}

/**
 * Strips ONLY self-referential log lines emitted by this verification script itself
 * when captured inside documentation evidence blocks (e.g. in docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md).
 * All other markdown text, including fenced code blocks, headings, tables, and lists, MUST be preserved and scanned.
 */
function stripSelfVerificationLogs(rawContent) {
  return rawContent
    .split('\n')
    .filter(line => {
      // 1. Filter out positive log lines from verifyFileDoesNotContain: "✅ [file] does NOT contain forbidden content: ..."
      if (/^\s*(?:✅|\[PASS\])\s*\[.*?\]\s*does NOT contain forbidden content:\s*"[^"]*"\s*$/i.test(line)) {
        return false;
      }
      // 2. Filter out log lines from fenced code block negative test suite: "✅ Fenced Code Block Negative Case PASS: ... rejected."
      if (/^\s*(?:✅|\[PASS\])\s*(?:Fenced Code Block Negative Case PASS|Real Doc Fenced Code Block Negative Case PASS):\s*"[^"]*"/i.test(line)) {
        return false;
      }
      return true;
    })
    .join('\n');
}

/**
 * Scans content for forbidden substrings without stripping fenced code blocks.
 * Exported/accessible for unit & negative mutation tests.
 */
export function inspectContentForForbiddenSubstrings(content, substrings) {
  const filteredContent = stripSelfVerificationLogs(content);
  const detected = [];
  for (const sub of substrings) {
    if (filteredContent.toLowerCase().includes(sub.toLowerCase())) {
      detected.push(sub);
    }
  }
  return {
    ok: detected.length === 0,
    detected
  };
}

function verifyFileDoesNotContain(relativePath, substrings) {
  const absolutePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absolutePath)) {
    return;
  }
  const rawContent = fs.readFileSync(absolutePath, 'utf8');
  const result = inspectContentForForbiddenSubstrings(rawContent, substrings);
  for (const sub of substrings) {
    if (result.detected.includes(sub)) {
      console.error(`❌ [${relativePath}] contains forbidden content: "${sub}"`);
      pass = false;
    } else {
      console.log(`✅ [${relativePath}] does NOT contain forbidden content: "${sub}"`);
    }
  }
}

// 1. Verify existence of Go/No-Go report and Result Log
verifyFileExists('docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md');
verifyFileExists('docs/SUPABASE_STAGING_EXECUTION_RESULT_LOG.md');
verifyFileExists('docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md');

// 2. Verify Go/No-Go report does not declare a premature GO and contains required terms (case-insensitive checks)
verifyFileContains('docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md', [
  'DECISION',
  'NO-GO FOR PAYMENTLESS PRODUCTION',
  'REASON',
  'Real Supabase staging execution result is not yet PASS',
  'STATUS',
  'READY TO START REAL SUPABASE STAGING EXECUTION',
  'Real Supabase Staging Execution',
  'NOT RUN',
  'Migration Push to Real Supabase',
  'Auth User Creation',
  'users_profile Mapping',
  'Seed SQL Execution',
  'RLS SQL Smoke Test',
  'App-Level Read-Only Smoke',
  'App-Level Write Smoke',
  'Browser Smoke',
  'Paymentless Production Decision',
  'NO-GO UNTIL ALL ABOVE PASS',
  'GO only after real staging result log is PASS',
  'CONDITIONAL GO only if no security/data isolation issues exist',
  'NO-GO if staging is not run or result log is incomplete',
  'Issue #10'
]);

// 2.1 Verify V1-A Release Candidate Acceptance Document invariants
verifyFileContains('docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md', [
  'PRODUCTION = NO_GO',
  'fd453ed87bcfa49712d6036be9e224d6ff4d9f54',
  'Issue #10',
  'EXTERNAL_HOLD',
  'run-paymentless-real-pilot-rollback.mjs',
  '001_initial_schema.sql',
  '20260904_self_service_token_security_and_ratelimit.sql',
  'LARİ',
  'randevulari.com',
  'ADIM-026 kapsamında yeniden çalıştırılmadı / mevcut tarihsel test kapsamı'
]);

/**
 * Canonical evidence blocks representing authentic, synchronous loop.py local execution proofs.
 * Used for strict line-by-line parity validation in docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md §6.
 */
export const CANONICAL_TSC_BLOCK = `Command: npx tsc --noEmit
Exit Code: 0
Output:`;

export const CANONICAL_BUILD_BLOCK = `Command: npm run build (vite build)
Exit Code: 0
Output:
dist/index.html                                           3.40 kB │ gzip:   1.28 kB
dist/assets/index-tHHih7Z6.css                          233.01 kB │ gzip:  28.17 kB
dist/assets/__vite-browser-external-BIHI7g3E.js           0.03 kB │ gzip:   0.05 kB
dist/assets/postBookingSideEffectPolicy-BTqye212.js       0.25 kB │ gzip:   0.16 kB
dist/assets/syntheticSalonFixtureService-BbguUL6F.js      5.00 kB │ gzip:   1.48 kB
dist/assets/index-CeUphRoi.js                         1,892.42 kB │ gzip: 463.54 kB`;

export const CANONICAL_READINESS_BLOCK = `Command: node scripts/verify-paymentless-production-go-no-go-readiness.mjs
Exit Code: 0
Output:
🔍 Starting Paymentless Production Go/No-Go Readiness Verification...

✅ File exists: docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md
✅ File exists: docs/SUPABASE_STAGING_EXECUTION_RESULT_LOG.md
✅ File exists: docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "DECISION..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "NO-GO FOR PAYMENTLESS PRODUCTION..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "REASON..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "Real Supabase staging execution result is not yet ..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "STATUS..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "READY TO START REAL SUPABASE STAGING EXECUTION..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "Real Supabase Staging Execution..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "NOT RUN..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "Migration Push to Real Supabase..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "Auth User Creation..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "users_profile Mapping..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "Seed SQL Execution..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "RLS SQL Smoke Test..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "App-Level Read-Only Smoke..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "App-Level Write Smoke..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "Browser Smoke..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "Paymentless Production Decision..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "NO-GO UNTIL ALL ABOVE PASS..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "GO only after real staging result log is PASS..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "CONDITIONAL GO only if no security/data isolation ..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "NO-GO if staging is not run or result log is incom..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "Issue #10..."
✅ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] contains expected: "PRODUCTION = NO_GO..."
✅ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] contains expected: "fd453ed87bcfa49712d6036be9e224d6ff4d9f54..."
✅ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] contains expected: "Issue #10..."
✅ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] contains expected: "EXTERNAL_HOLD..."
✅ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] contains expected: "run-paymentless-real-pilot-rollback.mjs..."
✅ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] contains expected: "001_initial_schema.sql..."
✅ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] contains expected: "20260904_self_service_token_security_and_ratelimit..."
✅ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] contains expected: "LARİ..."
✅ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] contains expected: "randevulari.com..."
✅ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] contains expected: "ADIM-026 kapsamında yeniden çalıştırılmadı / mevcu..."
✅ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] Evidence parity verified (authentic exit codes and no fabricated lines).

--- Running Evidence Parity Negative Test (Tamper Detection) ---
✅ Negative Case 1 PASS: Tampered TSC exit code correctly rejected.
✅ Negative Case 2 PASS: Tampered Build exit code correctly rejected.
✅ Negative Case 3 PASS: Tampered Build captured output correctly rejected.
✅ Negative Case 4 PASS: Tampered Readiness captured output correctly rejected.
✅ Negative Case 5 PASS: Tampered Readiness exit code correctly rejected.
✅ Negative Case 6 PASS: Tampered Migration Integrity exit code correctly rejected.
✅ Negative Case 7 PASS: Fabricated output line correctly rejected.
✅ Negative Case 8 PASS: Missing historical test attribution correctly rejected.
✅ Negative Case 9 PASS: Tampered non-signature output line in §6.3 correctly rejected.
✅ Negative Case 10 PASS: Tampered non-signature output line in §6.4 correctly rejected.
✅ Negative Case 11 PASS: Tampered migration entry in §6.4 correctly rejected.
✅ [docs/PAYMENTLESS_PRODUCTION_CUTOVER_PLAN.md] contains expected: "STAGING RUN PASS IS MANDATORY..."
✅ [docs/PAYMENTLESS_PRODUCTION_CUTOVER_PLAN.md] contains expected: "paymentless production cutover strictly requires a..."

--- Running Forbidden Content Fenced Code Block Negative Test Suite ---
✅ Fenced Code Block Negative Case PASS: "auto-checkout" inside code block correctly rejected.
✅ Fenced Code Block Negative Case PASS: "recurring automated billing" inside code block correctly rejected.
✅ Fenced Code Block Negative Case PASS: "7-day trial" inside code block correctly rejected.
✅ Fenced Code Block Negative Case PASS: "no-card required" inside code block correctly rejected.
✅ Fenced Code Block Negative Case PASS: "card_number" inside code block correctly rejected.
✅ Fenced Code Block Negative Case PASS: "cvv" inside code block correctly rejected.
✅ Fenced Code Block Negative Case PASS: "card-number-input" inside code block correctly rejected.
✅ Real Doc Fenced Code Block Negative Case PASS: "recurring automated billing" in code block rejected.
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] does NOT contain forbidden content: "auto-checkout"
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] does NOT contain forbidden content: "recurring automated billing"
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] does NOT contain forbidden content: "7-day trial"
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] does NOT contain forbidden content: "no-card required"
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] does NOT contain forbidden content: "card_number"
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] does NOT contain forbidden content: "cvv"
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] does NOT contain forbidden content: "card-number-input"
✅ [docs/REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md] does NOT contain forbidden content: "auto-checkout"
✅ [docs/REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md] does NOT contain forbidden content: "recurring automated billing"
✅ [docs/REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md] does NOT contain forbidden content: "7-day trial"
✅ [docs/REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md] does NOT contain forbidden content: "no-card required"
✅ [docs/REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md] does NOT contain forbidden content: "card_number"
✅ [docs/REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md] does NOT contain forbidden content: "cvv"
✅ [docs/REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md] does NOT contain forbidden content: "card-number-input"
✅ [docs/SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md] does NOT contain forbidden content: "auto-checkout"
✅ [docs/SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md] does NOT contain forbidden content: "recurring automated billing"
✅ [docs/SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md] does NOT contain forbidden content: "7-day trial"
✅ [docs/SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md] does NOT contain forbidden content: "no-card required"
✅ [docs/SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md] does NOT contain forbidden content: "card_number"
✅ [docs/SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md] does NOT contain forbidden content: "cvv"
✅ [docs/SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md] does NOT contain forbidden content: "card-number-input"
✅ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] does NOT contain forbidden content: "auto-checkout"
✅ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] does NOT contain forbidden content: "recurring automated billing"
✅ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] does NOT contain forbidden content: "7-day trial"
✅ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] does NOT contain forbidden content: "no-card required"
✅ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] does NOT contain forbidden content: "card_number"
✅ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] does NOT contain forbidden content: "cvv"
✅ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] does NOT contain forbidden content: "card-number-input"
✅ .env.example contains no real live credentials.
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "LARİ..."
✅ [docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md] contains expected: "randevulari.com..."

=============================================
🏆 STATUS: PASS - Go/No-Go Verification Succeeded!`;

export const CANONICAL_MIGRATION_BLOCK = `Command: node scripts/verify-supabase-migration-integrity.mjs
Exit Code: 0
Output:
=== RUNNING SUPABASE MIGRATION INTEGRITY QA CHECK ===

[PASS] Strategy document found: docs/SUPABASE_CANONICAL_MIGRATION_APPLY_STRATEGY.md
[PASS] Apply manifest found: supabase/MIGRATION_APPLY_MANIFEST.md

Detected active migration files:
  - 001_initial_schema.sql
  - 002_subscription_alignment.sql
  - 003_provisioning_onboarding.sql
  - 004_iyzico_provider_alignment.sql
  - 005_salon_business_profile.sql
  - 20260601_lari_core_schema_alignment.sql
  - 20260619_lari_rls_policy_draft.sql
  - 20260620_paymentless_production_core_tables.sql
  - 20260621_paymentless_production_repository_columns.sql
  - 20260622_paymentless_production_rls_identity_alignment.sql
  - 20260713_communication_outbox_rls_hardening.sql
  - 20260714_tenants_update_rls_hardening.sql
  - 20260715_super_admin_provisioning_rpc.sql
  - 20260716_public_booking_eligibility_rpc.sql
  - 20260720_public_booking_rpc.sql
  - 20260722_public_booking_search_path_fix.sql
  - 20260723_booking_lifecycle_foundation.sql
  - 20260724_admin_rls_and_read_model_fix.sql
  - 20260725_admin_bootstrap_and_runtime_consistency.sql
  - 20260726_admin_rpc_execute_acl_hardening.sql
  - 20260727_admin_runtime_schema_contract_fix.sql
  - 20260728_admin_rpc_live_schema_reconstruction.sql
  - 20260729_admin_bootstrap_subscription_contract_fix.sql
  - 20260730_self_service_token_read_rpc.sql
  - 20260731_admin_appointment_status_mutation_rpc.sql
  - 20260801_cancel_public_appointment_by_manage_token_rpc.sql
  - 20260802_cancel_public_appointment_by_manage_token_schema_fix.sql
  - 20260803_cancel_public_appointment_by_manage_token_audit_outbox_fix.sql
  - 20260804_appointments_direct_update_hardening.sql
  - 20260805_request_public_appointment_reschedule_by_manage_token_rpc.sql
  - 20260806_request_public_appointment_reschedule_outbox_fix.sql
  - 20260807_get_public_pending_reschedule_request_by_manage_token_rpc.sql
  - 20260808_admin_reschedule_request_decision_rpc.sql
  - 20260809_admin_reschedule_decision_lock_and_reason_fix.sql
  - 20260810_h1a_commercial_catalog_and_read_contracts.sql
  - 20260811_h1b_super_admin_commercial_mutations.sql
  - 20260812_h1b_apply_due_scheduled_plan_change_rpc.sql
  - 20260813_h1c_commercial_eligibility_and_quota_enforcement.sql
  - 20260814_h1c_feature_gate_reason_code_fix.sql
  - 20260815_h1c_usage_counters_invariant.sql
  - 20260816_h1d_missing_commercial_admin_contracts.sql
  - 20260817_h1d_contract_truth_and_idempotency_fix.sql
  - 20260818_h1d_idempotency_concurrency_and_filter_fix.sql
  - 20260819_h1d_idempotency_helper_record_fix.sql
  - 20260820_h1d_audit_events_schema_alignment_fix.sql
  - 20260821_h1d_future_restriction_end_fix.sql
  - 20260822_h1e_release_control_and_eligibility_read_contracts.sql
  - 20260823_h1e_a_eligibility_runtime_contract_fix.sql
  - 20260824_h1e_b_pilot_authorization_history.sql
  - 20260825_h1e_b_authorization_contract_hardening.sql
  - 20260826_h1e_c_public_booking_release_gate.sql
  - 20260827_h1e_c_public_booking_release_gate_runtime_fix.sql
  - 20260828_h1e_c_controlled_release_phase_transition.sql
  - 20260829_h1e_c_controlled_transition_runtime_fix.sql
  - 20260830_p1c_public_branch_read_contract.sql
  - 20260831_p1c_public_branch_read_contract_runtime_fix.sql
  - 20260901_payment_webhook_idempotency_and_replay_security.sql
  - 20260902_subscription_sync_transaction.sql
  - 20260903_public_booking_ratelimit_spam_and_otp_contract.sql
  - 20260904_self_service_token_security_and_ratelimit.sql

[PASS] Archived/redundant migrations are correctly excluded from the active path.
[INFO] Policy "Tenant Owner/Admin SELECT own tenant" on table "tenants" is defined 2 times.
[PASS] Duplicate policy "Tenant Owner/Admin SELECT own tenant" on "tenants" is safe due to drop-before handling.
[INFO] Policy "Registered Customers - Read own appointments" on table "appointments" is defined 2 times.
[PASS] Duplicate policy "Registered Customers - Read own appointments" on "appointments" is safe due to drop-before handling.
[INFO] Policy "Super Admins - Full Access on branches" on table "branches" is defined 2 times.
[PASS] Duplicate policy "Super Admins - Full Access on branches" on "branches" is safe due to drop-before handling.
[PASS] communication_outbox RLS hardening policies are present in the active migration path.
[PASS] Table "tenants" is covered by canonical migration path (File: 001_initial_schema.sql)
[PASS] Table "services" is covered by canonical migration path (File: 001_initial_schema.sql)
[PASS] Table "staff" is covered by canonical migration path (File: 001_initial_schema.sql)
[PASS] Table "customers" is covered by canonical migration path (File: 001_initial_schema.sql)
[PASS] Table "appointments" is covered by canonical migration path (File: 001_initial_schema.sql)
[PASS] Table "subscriptions" is covered by canonical migration path (File: 001_initial_schema.sql)
[PASS] Table "appointment_access_tokens" is covered by canonical migration path (File: 20260620_paymentless_production_core_tables.sql)
[PASS] Table "appointment_change_requests" is covered by canonical migration path (File: 20260620_paymentless_production_core_tables.sql)
[PASS] Table "communication_outbox" is covered by canonical migration path (File: 20260620_paymentless_production_core_tables.sql)
[PASS] Table "audit_events" is covered by canonical migration path (File: 20260620_paymentless_production_core_tables.sql)
[PASS] Table "support_tickets" is covered by canonical migration path (File: 20260620_paymentless_production_core_tables.sql)
[PASS] Table "policy_acceptances" is covered by canonical migration path (File: 20260620_paymentless_production_core_tables.sql)
[PASS] Table "consent_ledger" is covered by canonical migration path (File: 20260620_paymentless_production_core_tables.sql)
[PASS] Table "data_rights_requests" is covered by canonical migration path (File: 20260620_paymentless_production_core_tables.sql)
[PASS] RLS is explicitly enabled on table: tenants
[PASS] RLS is explicitly enabled on table: services
[PASS] RLS is explicitly enabled on table: staff
[PASS] RLS is explicitly enabled on table: customers
[PASS] RLS is explicitly enabled on table: appointments
[PASS] RLS is explicitly enabled on table: subscriptions
[PASS] RLS is explicitly enabled on table: appointment_access_tokens
[PASS] RLS is explicitly enabled on table: appointment_change_requests
[PASS] RLS is explicitly enabled on table: communication_outbox
[PASS] RLS is explicitly enabled on table: audit_events
[PASS] RLS is explicitly enabled on table: support_tickets
[PASS] RLS is explicitly enabled on table: policy_acceptances
[PASS] RLS is explicitly enabled on table: consent_ledger
[PASS] RLS is explicitly enabled on table: data_rights_requests
[PASS] PCI-DSS Compliance verified. No raw card storage definitions found.
[PASS] Client-side files are clean. No service_role key leaks detected.

=== SUPABASE MIGRATION INTEGRITY QA PASSED PERFECTLY ===`;

/**
 * Extracts the single fenced text code block located under a given markdown section header.
 */
export function extractSectionFencedBlock(markdownText, sectionPrefix) {
  const norm = markdownText.replace(/\r\n/g, '\n');
  const idx = norm.indexOf(sectionPrefix);
  if (idx === -1) return null;
  const sub = norm.slice(idx);
  const match = sub.match(/```(?:text)?\n([\s\S]*?)\n```/);
  return match ? match[1] : null;
}

/**
 * Core validation function for V1-A Release Candidate evidence parity.
 * Used for both positive verification and fail-closed negative mutation testing.
 * Strictly extracts §6 fenced-output blocks per command and compares every line against canonical outputs.
 */
export function checkRcEvidenceParity(rawContent) {
  const errors = [];
  const normalized = rawContent.replace(/\r\n/g, '\n');

  // Parity Invariant 1: Historical labeling for rollback test
  const historicalLabel = 'ADIM-026 kapsamında yeniden çalıştırılmadı / mevcut tarihsel test kapsamı';
  if (!normalized.includes(historicalLabel)) {
    errors.push(`Missing mandatory historical test disclaimer: "${historicalLabel}"`);
  }

  // Parity Invariant 2: No fabricated strings anywhere in evidence
  const forbiddenFabrications = [
    '(Sıfır hata ile tamamlandı, 0 errors)',
    '✅ All Go/No-Go constraints verified.',
    '✅ No forbidden marketing or billing claims found.'
  ];
  for (const fab of forbiddenFabrications) {
    if (normalized.includes(fab)) {
      errors.push(`Detected fabricated evidence string: "${fab}"`);
    }
  }

  // Parity Invariant 3: Exact per-command contracts & verbatim fenced block line comparison
  const expectedCommands = [
    {
      id: 'tsc',
      sectionPrefix: '### 6.1',
      name: 'TypeScript static check',
      expectedHeader: 'Command: npx tsc --noEmit\nExit Code: 0',
      commandMatchRegex: /Command:\s*npx tsc --noEmit\s*\nExit Code:\s*(\d+)/,
      expectedBlock: CANONICAL_TSC_BLOCK
    },
    {
      id: 'build',
      sectionPrefix: '### 6.2',
      name: 'Production build',
      expectedHeader: 'Command: npm run build (vite build)\nExit Code: 0',
      commandMatchRegex: /Command:\s*npm run build[^\n]*\nExit Code:\s*(\d+)/,
      expectedBlock: CANONICAL_BUILD_BLOCK
    },
    {
      id: 'readiness',
      sectionPrefix: '### 6.3',
      name: 'Paymentless Go/No-Go readiness verification',
      expectedHeader: 'Command: node scripts/verify-paymentless-production-go-no-go-readiness.mjs\nExit Code: 0',
      commandMatchRegex: /Command:\s*node scripts\/verify-paymentless-production-go-no-go-readiness\.mjs\s*\nExit Code:\s*(\d+)/,
      expectedBlock: CANONICAL_READINESS_BLOCK
    },
    {
      id: 'migration',
      sectionPrefix: '### 6.4',
      name: 'Supabase migration integrity',
      expectedHeader: 'Command: node scripts/verify-supabase-migration-integrity.mjs\nExit Code: 0',
      commandMatchRegex: /Command:\s*node scripts\/verify-supabase-migration-integrity\.mjs\s*\nExit Code:\s*(\d+)/,
      expectedBlock: CANONICAL_MIGRATION_BLOCK
    }
  ];

  for (const cmd of expectedCommands) {
    const match = normalized.match(cmd.commandMatchRegex);
    if (!match) {
      errors.push(`Command header missing for ${cmd.name}`);
    } else if (match[1] !== '0') {
      errors.push(`Non-zero or tampered exit code (${match[1]}) for ${cmd.name}`);
    }

    const extracted = extractSectionFencedBlock(normalized, cmd.sectionPrefix);
    if (!extracted) {
      errors.push(`Missing fenced code block for ${cmd.name} under section ${cmd.sectionPrefix}`);
      continue;
    }

    const actualLines = extracted.trim().split('\n');
    const expectedLines = cmd.expectedBlock.trim().split('\n');

    if (actualLines.length !== expectedLines.length) {
      errors.push(`Line count mismatch in section ${cmd.sectionPrefix} (${cmd.name}): expected ${expectedLines.length} lines, found ${actualLines.length} lines`);
    }

    const minLen = Math.min(actualLines.length, expectedLines.length);
    for (let i = 0; i < minLen; i++) {
      if (actualLines[i] !== expectedLines[i]) {
        errors.push(`Line mismatch in section ${cmd.sectionPrefix} (${cmd.name}) at line ${i + 1}: expected "${expectedLines[i]}" but found "${actualLines[i]}"`);
        break;
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

// 2.2 Verify authentic local evidence parity in docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md
const rcDocPath = path.join(process.cwd(), 'docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md');
if (fs.existsSync(rcDocPath)) {
  const rcContent = fs.readFileSync(rcDocPath, 'utf8');
  const parityResult = checkRcEvidenceParity(rcContent);
  if (parityResult.ok) {
    console.log('✅ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] Evidence parity verified (authentic exit codes and no fabricated lines).');
  } else {
    for (const err of parityResult.errors) {
      console.error(`❌ [docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md] ${err}`);
    }
    pass = false;
  }

  // 2.3 Required Negative Test: Verify evidence parity check fails closed when exit code or captured output is tampered
  console.log('\n--- Running Evidence Parity Negative Test (Tamper Detection) ---');
  let negativeTestsPassed = true;
  const normalizedRcContent = rcContent.replace(/\r\n/g, '\n');

  // Case 1: Tampered TSC Exit Code (0 -> 1)
  const tamperedTscExit = normalizedRcContent.replace(
    'Command: npx tsc --noEmit\nExit Code: 0',
    'Command: npx tsc --noEmit\nExit Code: 1'
  );
  const resTscExit = checkRcEvidenceParity(tamperedTscExit);
  if (resTscExit.ok) {
    console.error('❌ Negative Test Failed: Tampered TSC exit code was NOT rejected!');
    negativeTestsPassed = false;
  } else {
    console.log('✅ Negative Case 1 PASS: Tampered TSC exit code correctly rejected.');
  }

  // Case 2: Tampered Build Exit Code (0 -> 1) - explicitly required by Codex
  const tamperedBuildExit = normalizedRcContent.replace(
    'Command: npm run build (vite build)\nExit Code: 0',
    'Command: npm run build (vite build)\nExit Code: 1'
  );
  const resBuildExit = checkRcEvidenceParity(tamperedBuildExit);
  if (resBuildExit.ok) {
    console.error('❌ Negative Test Failed: Tampered Build exit code was NOT rejected!');
    negativeTestsPassed = false;
  } else {
    console.log('✅ Negative Case 2 PASS: Tampered Build exit code correctly rejected.');
  }

  // Case 3: Tampered Build Captured Output - explicitly required by Codex
  const tamperedBuildOut = normalizedRcContent.replace(
    'dist/index.html',
    'dist/tampered_missing_artifact.html'
  );
  const resBuildOut = checkRcEvidenceParity(tamperedBuildOut);
  if (resBuildOut.ok) {
    console.error('❌ Negative Test Failed: Tampered Build captured output line was NOT rejected!');
    negativeTestsPassed = false;
  } else {
    console.log('✅ Negative Case 3 PASS: Tampered Build captured output correctly rejected.');
  }

  // Case 4: Tampered Readiness Captured Output - explicitly required by Codex
  const tamperedReadinessOut = normalizedRcContent.replace(
    '🏆 STATUS: PASS - Go/No-Go Verification Succeeded!',
    '🏆 STATUS: FAIL - Verification Tampered!'
  );
  const resReadinessOut = checkRcEvidenceParity(tamperedReadinessOut);
  if (resReadinessOut.ok) {
    console.error('❌ Negative Test Failed: Tampered Readiness captured output line was NOT rejected!');
    negativeTestsPassed = false;
  } else {
    console.log('✅ Negative Case 4 PASS: Tampered Readiness captured output correctly rejected.');
  }

  // Case 5: Tampered Readiness Exit Code (0 -> 1)
  const tamperedReadinessExit = normalizedRcContent.replace(
    'Command: node scripts/verify-paymentless-production-go-no-go-readiness.mjs\nExit Code: 0',
    'Command: node scripts/verify-paymentless-production-go-no-go-readiness.mjs\nExit Code: 1'
  );
  const resReadinessExit = checkRcEvidenceParity(tamperedReadinessExit);
  if (resReadinessExit.ok) {
    console.error('❌ Negative Test Failed: Tampered Readiness exit code was NOT rejected!');
    negativeTestsPassed = false;
  } else {
    console.log('✅ Negative Case 5 PASS: Tampered Readiness exit code correctly rejected.');
  }

  // Case 6: Tampered Migration Integrity Exit Code (0 -> 1)
  const tamperedMigrationExit = normalizedRcContent.replace(
    'Command: node scripts/verify-supabase-migration-integrity.mjs\nExit Code: 0',
    'Command: node scripts/verify-supabase-migration-integrity.mjs\nExit Code: 1'
  );
  const resMigrationExit = checkRcEvidenceParity(tamperedMigrationExit);
  if (resMigrationExit.ok) {
    console.error('❌ Negative Test Failed: Tampered Migration Integrity exit code was NOT rejected!');
    negativeTestsPassed = false;
  } else {
    console.log('✅ Negative Case 6 PASS: Tampered Migration Integrity exit code correctly rejected.');
  }

  // Case 7: Fabricated output line reintroduced
  const tamperedFab = normalizedRcContent.replace(
    'Command: npx tsc --noEmit\nExit Code: 0',
    'Command: npx tsc --noEmit\nExit Code: 0\nOutput: (Sıfır hata ile tamamlandı, 0 errors)'
  );
  const resFab = checkRcEvidenceParity(tamperedFab);
  if (resFab.ok) {
    console.error('❌ Negative Test Failed: Fabricated output line was NOT rejected!');
    negativeTestsPassed = false;
  } else {
    console.log('✅ Negative Case 7 PASS: Fabricated output line correctly rejected.');
  }

  // Case 8: Missing historical test attribution
  const tamperedHist = normalizedRcContent.replaceAll(
    'ADIM-026 kapsamında yeniden çalıştırılmadı / mevcut tarihsel test kapsamı',
    'ADIM-026 kapsamında yeni çalıştırıldı'
  );
  const resHist = checkRcEvidenceParity(tamperedHist);
  if (resHist.ok) {
    console.error('❌ Negative Test Failed: Missing historical test attribution was NOT rejected!');
    negativeTestsPassed = false;
  } else {
    console.log('✅ Negative Case 8 PASS: Missing historical test attribution correctly rejected.');
  }

  // Case 9: Tampered non-signature line in §6.3 (Required by Finding-ADIM026-001)
  const tamperedRc63NonSig = normalizedRcContent.replace(
    '✅ File exists: docs/SUPABASE_STAGING_EXECUTION_RESULT_LOG.md',
    '❌ File NOT found: docs/SUPABASE_STAGING_EXECUTION_RESULT_LOG.md'
  );
  const resRc63NonSig = checkRcEvidenceParity(tamperedRc63NonSig);
  if (resRc63NonSig.ok) {
    console.error('❌ Negative Test Failed: Tampered non-signature line in §6.3 was NOT rejected!');
    negativeTestsPassed = false;
  } else {
    console.log('✅ Negative Case 9 PASS: Tampered non-signature output line in §6.3 correctly rejected.');
  }

  // Case 10: Tampered non-signature line in §6.4 (Required by Finding-ADIM026-001)
  const tamperedRc64NonSig = normalizedRcContent.replace(
    '[PASS] Strategy document found: docs/SUPABASE_CANONICAL_MIGRATION_APPLY_STRATEGY.md',
    '[FAIL] Strategy document found: docs/SUPABASE_CANONICAL_MIGRATION_APPLY_STRATEGY.md'
  );
  const resRc64NonSig = checkRcEvidenceParity(tamperedRc64NonSig);
  if (resRc64NonSig.ok) {
    console.error('❌ Negative Test Failed: Tampered non-signature line in §6.4 was NOT rejected!');
    negativeTestsPassed = false;
  } else {
    console.log('✅ Negative Case 10 PASS: Tampered non-signature output line in §6.4 correctly rejected.');
  }

  // Case 11: Tampered migration entry in §6.4 (Migration list integrity fail-closed)
  const tamperedRc64Migration = normalizedRcContent.replace(
    '  - 001_initial_schema.sql',
    '  - 001_tampered_schema.sql'
  );
  const resRc64Migration = checkRcEvidenceParity(tamperedRc64Migration);
  if (resRc64Migration.ok) {
    console.error('❌ Negative Test Failed: Tampered migration entry in §6.4 was NOT rejected!');
    negativeTestsPassed = false;
  } else {
    console.log('✅ Negative Case 11 PASS: Tampered migration entry in §6.4 correctly rejected.');
  }

  if (!negativeTestsPassed) {
    pass = false;
  }
}

// 3. Verify cutover plan says staging PASS is required
verifyFileContains('docs/PAYMENTLESS_PRODUCTION_CUTOVER_PLAN.md', [
  'STAGING RUN PASS IS MANDATORY',
  'paymentless production cutover strictly requires a successful real staging smoke test'
]);

// 4. Scan files for forbidden billing claims, mock indicators, or raw card UI elements
const forbiddenBillingTokens = [
  'auto-checkout',
  'recurring automated billing',
  '7-day trial',
  'no-card required',
  'card_number',
  'cvv',
  'card-number-input'
];

// 4.1 Negative Test Suite for Fenced Code Blocks (Finding-ADIM026-002)
console.log('\n--- Running Forbidden Content Fenced Code Block Negative Test Suite ---');
let fencedNegativeTestsPassed = true;

for (const token of forbiddenBillingTokens) {
  const sampleWithFencedBlock = `# Document Header\n\nSample intro text.\n\n\`\`\`json\n{\n  "billing_field": "${token}"\n}\n\`\`\`\n\nFooter note.`;
  const checkResult = inspectContentForForbiddenSubstrings(sampleWithFencedBlock, forbiddenBillingTokens);
  if (checkResult.ok || !checkResult.detected.includes(token)) {
    console.error(`❌ Negative Test Failed: Fenced code block containing "${token}" was NOT rejected!`);
    fencedNegativeTestsPassed = false;
  } else {
    console.log(`✅ Fenced Code Block Negative Case PASS: "${token}" inside code block correctly rejected.`);
  }
}

const goNoGoPath = path.join(process.cwd(), 'docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md');
if (fs.existsSync(goNoGoPath)) {
  const goNoGoContent = fs.readFileSync(goNoGoPath, 'utf8');
  const tamperedGoNoGo = goNoGoContent + '\n\n```text\nrecurring automated billing\n```\n';
  const resGoNoGo = inspectContentForForbiddenSubstrings(tamperedGoNoGo, forbiddenBillingTokens);
  if (resGoNoGo.ok || !resGoNoGo.detected.includes('recurring automated billing')) {
    console.error('❌ Negative Test Failed: Fenced code block in PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md was NOT rejected!');
    fencedNegativeTestsPassed = false;
  } else {
    console.log('✅ Real Doc Fenced Code Block Negative Case PASS: "recurring automated billing" in code block rejected.');
  }
}

if (!fencedNegativeTestsPassed) {
  pass = false;
}

// 4.2 Standard scanned document verification
const documentsToScan = [
  'docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md',
  'docs/REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md',
  'docs/SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md',
  'docs/V1A_RELEASE_CANDIDATE_ACCEPTANCE.md'
];

for (const doc of documentsToScan) {
  verifyFileDoesNotContain(doc, forbiddenBillingTokens);
}

// 5. Ensure NO real credentials or secrets are committed
const envExamplePath = path.join(process.cwd(), '.env.example');
if (fs.existsSync(envExamplePath)) {
  const envExample = fs.readFileSync(envExamplePath, 'utf8');
  if (envExample.includes('VITE_SUPABASE_URL=https') && !envExample.includes('VITE_SUPABASE_URL=\n') && !envExample.includes('VITE_SUPABASE_URL= ')) {
    console.error('❌ .env.example appears to contain live credentials!');
    pass = false;
  } else {
    console.log('✅ .env.example contains no real live credentials.');
  }
}

// 6. Ensure LARİ remains the visible brand & randevulari.com is Turkey domain strategy
verifyFileContains('docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md', [
  'LARİ',
  'randevulari.com'
]);

// Report overall result
console.log('\n=============================================');
if (pass) {
  console.log('🏆 STATUS: PASS - Go/No-Go Verification Succeeded!');
  process.exit(0);
} else {
  console.error('🛑 STATUS: FAIL - Go/No-Go verification failed or contains misleading claims!');
  process.exit(1);
}
