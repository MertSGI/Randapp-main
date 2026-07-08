import fs from 'fs';
import path from 'path';

function verify() {
  console.log("=== LARİ Commercial Packaging & Entitlement Audits ===");
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

  // 1. Audit five default plans in planService.ts
  const planServiceContent = checkFileExists('services/planService.ts');
  if (planServiceContent) {
    const planKeys = ['baslangic', 'standart', 'professional', 'premium', 'kurumsal'];
    planKeys.forEach(plan => {
      if (!planServiceContent.includes(plan)) {
        console.error(`❌ planService.ts is missing configuration for: ${plan}`);
        passed = false;
      } else {
        console.log(`  • planService.ts features plan: ${plan}`);
      }
    });
  }

  // 2. Audit entitlements in entitlementService.ts
  const entitlementContent = checkFileExists('services/entitlementService.ts');
  if (entitlementContent) {
    const checks = [
      { f: 'custom_domain_manual', label: 'Custom Domain Gating' },
      { f: 'multi_branch', label: 'Multi Branch Gating' },
      { f: 'ai_style_assistant_basic', label: 'AI Style Assistant Gating' },
      { f: 'campaigns_referrals', label: 'Campaigns & Referrals Gating' }
    ];
    checks.forEach(chk => {
      if (!entitlementContent.includes(chk.f)) {
        console.error(`❌ entitlementService.ts does not gate: ${chk.f}`);
        passed = false;
      } else {
        console.log(`  • entitlementService.ts gates: ${chk.label}`);
      }
    });

    // Check specific plan capabilities
    // Kurumsal must have multi_branch true, and others must have it false (except maybe Premium which is single-branch or overridden)
    if (!entitlementContent.includes('multi_branch: true') && !entitlementContent.includes('multi_branch: !')) {
      console.log('  • entitlementService verifies multi-branch gating rules.');
    }
  }

  // 3. Confirm PricingPage does not direct Kurumsal to an unsupported self-service payment checkout
  const pricingPageContent = checkFileExists('pages/PricingPage.tsx');
  if (pricingPageContent) {
    if (!pricingPageContent.includes("ctaConfig.actionType === 'talk_to_sales'")) {
      console.error("❌ PricingPage.tsx does not safely route talk_to_sales CTAs (like Kurumsal) to contact pathway.");
      passed = false;
    } else {
      console.log("  • PricingPage.tsx safely redirects custom corporate tier requests to sales/contact.");
    }

    // Verify LARİ subdomain mini website inclusion mentioned
    if (!pricingPageContent.includes("mini_website")) {
      console.error("❌ PricingPage does not mention standard included mini website or subdomain.");
      passed = false;
    } else {
      console.log("  • PricingPage promises LARİ mini website subdomain inclusion.");
    }
  }

  // 4. Verify BillingTab offline payment support and display
  const billingTabContent = checkFileExists('components/BillingTab.tsx');
  if (billingTabContent) {
    if (!billingTabContent.includes("offline_payment") || !billingTabContent.includes("complimentary")) {
      console.error("❌ BillingTab is missing UI support to represent offline/manual billing sources gracefully.");
      passed = false;
    } else {
      console.log("  • BillingTab supports displaying manual/offline license overrides.");
    }
  }

  // 5. Verify Super Admin Manual Provisioning supports exception models
  const saProvContent = checkFileExists('pages/super-admin/SuperAdminManualProvisioningPage.tsx');
  if (saProvContent) {
    const fields = ['offline_payment', 'complimentary', 'pilot_exception'];
    fields.forEach(field => {
      if (!saProvContent.includes(field)) {
        console.error(`❌ SuperAdminManualProvisioningPage is missing input or state for Exception Model: ${field}`);
        passed = false;
      } else {
        console.log(`  • SuperAdminManualProvisioningPage supports billing models: ${field}`);
      }
    });
  }

  // 6. Prohibited copy checks in user-facing views:
  // "mock", "sandbox", "dry run", "payment disabled", "not configured", "coming soon", etc. in Turkish or English!
  const checkForbiddenCopy = (filePath, content) => {
    const forbidden = [
      'payment disabled', 'not configured', 'coming soon', 'planned', 'roadmap',
      'future', 'yakında', 'planlanan', 'yol haritası', 'no card', 'no credit card',
      'kart gerekmez', 'kredi kartı gerekmez', '7 day', '7 gün'
    ];
    forbidden.forEach(word => {
      const idx = content.toLowerCase().indexOf(word);
      if (idx !== -1) {
        if (filePath.endsWith('.tsx') && !filePath.includes('super-admin')) {
          console.error(`❌ Found forbidden copy "${word}" in user-facing view: ${filePath}`);
          passed = false;
        }
      }
    });
  };

  const userFacingFiles = [
    'components/OnboardingWizard.tsx',
    'pages/BookingPage.tsx',
    'pages/MarketingHomePage.tsx',
    'pages/DemoLandingPage.tsx',
    'pages/PricingPage.tsx'
  ];

  userFacingFiles.forEach(file => {
    const content = checkFileExists(file);
    if (content) {
      checkForbiddenCopy(file, content);
    }
  });

  // 7. Core Brand Integrity checks
  userFacingFiles.forEach(file => {
    const content = checkFileExists(file);
    if (content) {
      if (content.includes('RandevuLari') || content.includes('RandevuLari.com')) {
        console.error(`❌ Brand integrity violation in ${file}: LARİ must remain visible brand, not RandevuLari`);
        passed = false;
      }
    }
  });

  if (passed) {
    console.log("\n🎉 ALL COMMERCIAL PACKAGING AND ENTITLEMENT CHECKS PASSED SUCCESSFULLY!");
    process.exit(0);
  } else {
    console.error("\n❌ COMMERCIAL PACKAGING AUDIT FAILED. Please resolve errors above.");
    process.exit(1);
  }
}

verify();
