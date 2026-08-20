// scripts/test-package-branch-concurrency.mjs
// Real Multi-Session Concurrency & Authenticated RLS Test Runner for Package / Customer Customization Slice 1-R2.1
// Governance: EXECUTES ONLY ON DISPOSABLE LOCAL SUPABASE QA DB (127.0.0.1:54322)

import { runPackageBranchConcurrencyHarness } from '../supabase/tests/package_branch_concurrency_harness.ts';

runPackageBranchConcurrencyHarness()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('CONCURRENCY_HARNESS_EXECUTION_FAILURE:', err);
    process.exit(1);
  });
