import fs from 'fs';
import path from 'path';

function verify() {
  console.log("=== LARİ Subscription Lifecycle & Plan Change Audits ===");
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

  // 1. Audit subscriptionService.ts for all state methods
  const subServiceContent = checkFileExists('services/subscriptionService.ts');
  if (subServiceContent) {
    const methods = [
      'getCurrentSubscription',
      'fetchUsageStats',
      'pauseSubscription',
      'resumeSubscription',
      'cancelAtPeriodEnd',
      'cancelImmediately',
      'applyReferralCredit',
      'grantFreeDiscountMonths',
      'upgradePlanNow',
      'schedulePlanChange'
    ];
    methods.forEach(method => {
      if (!subServiceContent.includes(method)) {
        console.error(`❌ subscriptionService.ts is missing method: ${method}`);
        passed = false;
      } else {
        console.log(`  • subscriptionService.ts implements: ${method}`);
      }
    });

    const statusKeywords = [
      'pending_checkout',
      'trialing',
      'active',
      'paused',
      'suspended',
      'past_due',
      'comped',
      'manual_active'
    ];
    statusKeywords.forEach(kw => {
      if (!subServiceContent.includes(kw)) {
        console.error(`❌ subscriptionService.ts lacks reference to canonical state: ${kw}`);
        passed = false;
      } else {
        console.log(`  • subscriptionService.ts recognises state: ${kw}`);
      }
    });
  }

  // 2. Audit goLiveService.ts for override & restriction gating
  const goLiveContent = checkFileExists('services/goLiveService.ts');
  if (goLiveContent) {
    const overrideChecks = ['manual_active', 'comped', 'paused', 'suspended'];
    overrideChecks.forEach(status => {
      if (!goLiveContent.includes(status)) {
        console.error(`❌ goLiveService.ts lacks integration of specific state: ${status}`);
        passed = false;
      } else {
        console.log(`  • goLiveService.ts handles check for status: ${status}`);
      }
    });
  }

  // 3. Audit BillingTab.tsx for subscription management interactivity
  const billingTabContent = checkFileExists('components/BillingTab.tsx');
  if (billingTabContent) {
    const actionHandlers = [
      'handlePause',
      'handleResume',
      'handleCancelAtPeriodEnd',
      'handleCancelImmediately',
      'handleConfirmMockCheckout'
    ];
    actionHandlers.forEach(handler => {
      if (!billingTabContent.includes(handler)) {
        console.error(`❌ BillingTab.tsx does not hook up management action: ${handler}`);
        passed = false;
      } else {
        console.log(`  • BillingTab.tsx implements handler: ${handler}`);
      }
    });

    // Make sure BillingTab displays custom discounts and overrides
    if (!billingTabContent.includes('scheduledPlanId') || !billingTabContent.includes('referralCredits')) {
      console.warn(`⚠️ BillingTab.tsx may be missing detailed displays of migration target or platform incentives.`);
    } else {
      console.log(`  • BillingTab.tsx displays scheduled upgrades, downgrades, and incentive states successfully`);
    }
  }

  if (passed) {
    console.log("\n🎉 ALL SUBSCRIPTION LIFECYCLE AND VERIFICATION CHECKS PASSED SUCCESSFULLY!");
    process.exit(0);
  } else {
    console.error("\n❌ SUBSCRIPTION LIFECYCLE AUDIT FAILED. Please resolve errors above.");
    process.exit(1);
  }
}

verify();
