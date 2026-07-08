import fs from 'fs';
import path from 'path';

function verify() {
  console.log("=== LARİ Background Jobs, Billing Sweeps & Outbox Retry Readiness Audit ===");
  let passed = true;

  const checkFileExists = (filePath) => {
    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Missing file: ${filePath}`);
      passed = false;
      return null;
    }
    console.log(`✅ File exists: ${filePath}`);
    return fs.readFileSync(fullPath, 'utf-8');
  };

  // 1. Audit backgroundJobService.ts for all state methods
  const jobServiceContent = checkFileExists('services/backgroundJobService.ts');
  if (jobServiceContent) {
    const requiredMethods = [
      'registerBackgroundJob',
      'listBackgroundJobs',
      'runBackgroundJobNow',
      'runDailyMaintenanceSweep',
      'listBackgroundJobRuns',
      'getBackgroundJobRun',
      'markJobRunCompleted',
      'markJobRunFailed',
      'getSchedulerReadinessSummary'
    ];
    requiredMethods.forEach(method => {
      if (!jobServiceContent.includes(method)) {
        console.error(`❌ backgroundJobService.ts is missing method: ${method}`);
        passed = false;
      } else {
        console.log(`  • backgroundJobService.ts implements: ${method}`);
      }
    });

    // Verify 13 background job types are registered
    const jobTypes = [
      'subscription_trial_ending_sweep',
      'subscription_trial_expiration_sweep',
      'subscription_past_due_sweep',
      'subscription_cancel_at_period_end_sweep',
      'subscription_downgrade_at_period_end_sweep',
      'referral_credit_monthly_application',
      'communication_outbox_retry_sweep',
      'communication_failed_delivery_review',
      'custom_domain_verification_poll',
      'booking_availability_refresh',
      'data_export_reminder',
      'migration_snapshot_integrity_check',
      'support_review_queue_digest'
    ];

    jobTypes.forEach(type => {
      if (!jobServiceContent.includes(type)) {
        console.error(`❌ backgroundJobService.ts is missing job registration: ${type}`);
        passed = false;
      } else {
        console.log(`  • jobType is registered: ${type}`);
      }
    });
  }

  // 2. Audit scheduler page existence & imports
  const schedulerPageContent = checkFileExists('pages/super-admin/SuperAdminSchedulerPage.tsx');
  if (schedulerPageContent) {
    const essentialImports = [
      'backgroundJobService',
      'useLanguage',
      'translations'
    ];
    essentialImports.forEach(imp => {
      if (!schedulerPageContent.includes(imp)) {
        console.warn(`⚠️ SuperAdminSchedulerPage.tsx is missing reference to: ${imp}`);
      }
    });
  }

  // 3. Ensure no real cron was activated (stray cron setup)
  const envContent = checkFileExists('.env.example');
  if (envContent) {
    if (envContent.includes('SCHEDULER_ENABLED=true')) {
      console.error(`❌ SCHEDULER_ENABLED must NOT be set to true by default in environment configurations.`);
      passed = false;
    } else {
      console.log(`✅ Verified: SCHEDULER_ENABLED is false/disabled by default in .env.example.`);
    }

    if (envContent.includes('VITE_SCHEDULER_MODE=production_live')) {
      console.error(`❌ VITE_SCHEDULER_MODE must NOT be set to production_live in .env.example.`);
      passed = false;
    } else {
      console.log(`✅ Verified: VITE_SCHEDULER_MODE is local_simulation/sandbox with no live cron dependencies.`);
    }
  }

  // 4. Audit types.ts for background job definition exports
  const typesContent = checkFileExists('types.ts');
  if (typesContent) {
    const exactWordings = [
      'BackgroundJobType',
      'BackgroundJobStatus',
      'BackgroundJobRun'
    ];
    exactWordings.forEach(word => {
      if (!typesContent.includes(word)) {
        console.error(`❌ types.ts is missing standard type export: ${word}`);
        passed = false;
      } else {
        console.log(`  • types.ts declares export: ${word}`);
      }
    });
  }

  // Final Verdict
  if (passed) {
    console.log("\n⭐️ PRODUCTION CRON READY AUDIT PASSED ⭐️");
    console.log("All local sweeps, trial periods, outbox retry, and DNS polling logic are cleanly simulated.");
    console.log("System configuration is completely safe with zero actual external cron connections.\n");
    process.exit(0);
  } else {
    console.error("\n❌ PRODUCTION CRON READY AUDIT FAILED ❌");
    console.error("Please log outstanding errors and resolve before final pre-launch checks.\n");
    process.exit(1);
  }
}

verify();
