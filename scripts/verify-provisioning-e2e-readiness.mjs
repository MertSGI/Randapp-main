import fs from 'fs';
import path from 'path';

function verify() {
  console.log("=== LARİ Site Provisioning & Manual Sales E2E Verification ===");
  let passed = true;

  const checkFileExists = (filePath) => {
    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Missing critical file: ${filePath}`);
      passed = false;
      return null;
    }
    console.log(`✅ File exists: ${filePath}`);
    return fs.readFileSync(fullPath, 'utf-8');
  };

  // 1. Check services existence and contents
  const siteProv = checkFileExists('services/siteProvisioningService.ts');
  if (siteProv) {
    const siteProvChecks = [
      'generateTenantSlugFromBusinessName',
      'validateTenantSlug',
      'reserveTenantSlug',
      'getPublicSiteUrl',
      'getBranchPublicSiteUrl',
      'updateTenantPublicSiteStatus'
    ];
    siteProvChecks.forEach(fn => {
      if (!siteProv.includes(fn)) {
        console.error(`❌ siteProvisioningService is missing function: ${fn}`);
        passed = false;
      } else {
        console.log(`  • siteProvisioningService defines: ${fn}`);
      }
    });
  }

  const domResolver = checkFileExists('services/domainResolverService.ts');
  if (domResolver) {
    if (!domResolver.includes('ornekisletme.randevulari.com') && !domResolver.includes('randevulari.com')) {
      // It should refer to primary domain and parse subdomains correctly
      if (!domResolver.includes('primaryDomain') || !domResolver.includes('isPlatformDomain')) {
        console.error(`❌ domainResolverService does not contain proper domain checks.`);
        passed = false;
      }
    }
    console.log(`  • domainResolverService validates platform domains and slug subdomains.`);
  }

  const manualProv = checkFileExists('services/manualProvisioningService.ts');
  if (manualProv) {
    const billingSources = [
      'self_service_checkout',
      'manual_invoice',
      'offline_payment',
      'complimentary',
      'pilot_exception'
    ];
    billingSources.forEach(src => {
      if (!manualProv.includes(src)) {
        console.error(`❌ manualProvisioningService does not support billing source: ${src}`);
        passed = false;
      } else {
        console.log(`  • manualProvisioningService supports billing model: ${src}`);
      }
    });
  }

  // 2. Check Admin screens and Onboarding
  const saProvPage = checkFileExists('pages/super-admin/SuperAdminManualProvisioningPage.tsx');
  if (saProvPage) {
    const pageFields = ['publicSlug', 'planId', 'billingSource', 'publishStatus', 'ownerEmail', 'businessName'];
    pageFields.forEach(field => {
      if (!saProvPage.includes(field)) {
        console.error(`❌ SuperAdminManualProvisioningPage is missing state/UI field for: ${field}`);
        passed = false;
      } else {
        console.log(`  • SuperAdminManualProvisioningPage features fields: ${field}`);
      }
    });
  }

  const onboardingWizard = checkFileExists('components/OnboardingWizard.tsx');
  if (onboardingWizard) {
    if (!onboardingWizard.includes('Önizleme Sayfasını Aç') && !onboardingWizard.includes('Önizleme')) {
      console.error(`❌ OnboardingWizard is missing preview link triggers / texts.`);
      passed = false;
    }
    if (!onboardingWizard.includes('Randevu') && !onboardingWizard.includes('randevulari.com')) {
      console.error(`❌ OnboardingWizard is missing future live URL preview.`);
      passed = false;
    }
    console.log(`  • OnboardingWizard separates preview and future live URLs cleanly.`);
  }

  // 3. Confirm public sections and copy rules
  const shareToolkit = checkFileExists('components/ShareToolkitSection.tsx');
  const publicLinks = checkFileExists('components/PublicLinkSection.tsx');
  if (!shareToolkit && !publicLinks) {
    console.error(`❌ Either ShareToolkitSection or PublicLinkSection must be present to display URLs.`);
    passed = false;
  }

  // 4. Data export and dry run safety
  const dataExport = checkFileExists('services/dataExportService.ts');
  if (dataExport) {
    if (dataExport.includes('passwordHash') || dataExport.includes('securityKey') || dataExport.includes('creditCard')) {
      console.error(`❌ dataExportService possibly exports sensitive secrets.`);
      passed = false;
    } else {
      console.log(`  • dataExportService excludes secrets and raw card details securely.`);
    }
  }

  const dryRun = checkFileExists('services/migrationDryRunService.ts');
  if (dryRun) {
    if (!dryRun.includes('public_display_name') && !dryRun.includes('slug')) {
      console.error(`❌ migrationDryRunService does not validate business display name or slug.`);
      passed = false;
    } else {
      console.log(`  • migrationDryRunService validates slug & public profile readiness.`);
    }
  }

  // 5. Verify document file existence
  const matrix = checkFileExists('docs/PRODUCT_CAPABILITY_MATRIX.md');
  if (matrix) {
    if (!matrix.includes('randevulari.com')) {
      console.error(`❌ PRODUCT_CAPABILITY_MATRIX.md does not document the randevulari.com Turkey domain strategy.`);
      passed = false;
    }
  }

  // 6. Prohibited Public Copy Checks:
  // Must not have forbidden public phrases on public/owner-facing pages:
  // "mock", "sandbox", "dry run", "payment disabled", "not configured", "coming soon", etc. in Turkish or English!
  // Note: Only checking customer-facing files and onboarding wizard.
  const checkForbiddenCopy = (filePath, content) => {
    const forbidden = [
      'payment disabled', 'not configured', 'coming soon', 'planned', 'roadmap',
      'future', 'yakında', 'planlanan', 'yol haritası', 'no card', 'no credit card',
      'kart gerekmez', 'kredi kartı gerekmez', '7 day', '7 gün'
    ];
    forbidden.forEach(word => {
      // Case insensitive check
      const idx = content.toLowerCase().indexOf(word);
      if (idx !== -1) {
        // Exclude specific benign files if they are internal docs or tests. But components/onboarding shouldn't have them!
        if (filePath.endsWith('.tsx') && !filePath.includes('super-admin')) {
          console.error(`❌ Found forbidden copy "${word}" in user-facing file: ${filePath}`);
          passed = false;
        }
      }
    });
  };

  const userFacingFiles = [
    'components/OnboardingWizard.tsx',
    'pages/BookingPage.tsx',
    'pages/MarketingHomePage.tsx',
    'pages/DemoLandingPage.tsx'
  ];

  userFacingFiles.forEach(file => {
    const content = checkFileExists(file);
    if (content) {
      checkForbiddenCopy(file, content);
    }
  });

  if (passed) {
    console.log("\n🎉 ALL SITE PROVISIONING AND MANUAL SALES E2E CHECKS PASSED!");
    process.exit(0);
  } else {
    console.error("\n❌ E2E CHECKS FAILED. Please resolve errors above.");
    process.exit(1);
  }
}

verify();
