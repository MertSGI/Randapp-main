import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

function check() {
  console.log("--- Verifying Site Provisioning & Manual Sales Readiness ---");
  let passed = true;

  const filesToCheck = [
    'utils/slugUtils.ts',
    'services/publicLinkService.ts',
    'services/siteProvisioningService.ts',
    'services/domainResolverService.ts',
    'services/manualProvisioningService.ts',
    'docs/PRODUCT_CAPABILITY_MATRIX.md'
  ];

  filesToCheck.forEach(file => {
    const fullPath = path.join(process.cwd(), file);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Missing file: ${file}`);
      passed = false;
    } else {
      console.log(`✅ Found ${file}`);
    }
  });

  const slugUtilsContent = fs.readFileSync(path.join(process.cwd(), 'utils/slugUtils.ts'), 'utf-8');
  if (!slugUtilsContent.includes('SLUG_VALIDATION_REASONS')) {
    console.error("❌ utils/slugUtils.ts is missing SLUG_VALIDATION_REASONS typed reason codes");
    passed = false;
  }

  const publicLinkContent = fs.readFileSync(path.join(process.cwd(), 'services/publicLinkService.ts'), 'utf-8');
  if (!publicLinkContent.includes('SLUG_VALIDATION_REASONS.SLUG_TAKEN')) {
    console.error("❌ services/publicLinkService.ts is missing structured SLUG_TAKEN reason classification");
    passed = false;
  }

  const siteProvContent = fs.readFileSync(path.join(process.cwd(), 'services/siteProvisioningService.ts'), 'utf-8');
  if (!siteProvContent.includes('reserveTenantSlug')) {
    console.error("❌ siteProvisioningService.ts is missing reserveTenantSlug");
    passed = false;
  }
  if (!siteProvContent.includes('SLUG_VALIDATION_REASONS.SLUG_TAKEN')) {
    console.error("❌ siteProvisioningService.ts is missing collision-only SLUG_TAKEN policy check");
    passed = false;
  }
  if (!siteProvContent.includes('getBranchPublicSiteUrl')) {
    console.error("❌ siteProvisioningService.ts is missing getBranchPublicSiteUrl");
    passed = false;
  }

  const domainResContent = fs.readFileSync(path.join(process.cwd(), 'services/domainResolverService.ts'), 'utf-8');
  if (!domainResContent.includes('extractTenantSlugFromSubdomain')) {
    console.error("❌ domainResolverService.ts is missing extractTenantSlugFromSubdomain");
    passed = false;
  }

  const manualProvContent = fs.readFileSync(path.join(process.cwd(), 'services/manualProvisioningService.ts'), 'utf-8');
  if (!manualProvContent.includes('offline_payment')) {
    console.error("❌ manualProvisioningService.ts is missing offline_payment support");
    passed = false;
  }
  if (!manualProvContent.includes('pilot_exception')) {
    console.error("❌ manualProvisioningService.ts is missing pilot_exception support");
    passed = false;
  }

  const slugRegressionRun = spawnSync(process.execPath, [path.join(process.cwd(), 'scripts/test-slug-regression.mjs')], {
    cwd: process.cwd(),
    encoding: 'utf-8'
  });
  if (slugRegressionRun.status !== 0) {
    console.error("❌ test-slug-regression.mjs failed during site provisioning verification:");
    console.error(slugRegressionRun.stdout || '');
    console.error(slugRegressionRun.stderr || '');
    passed = false;
  } else {
    console.log("✅ test-slug-regression.mjs behavioral suite passed");
  }

  if (passed) {
    console.log("\n🎉 Site Provisioning & Manual Sales Readiness verification PASSED.");
    process.exit(0);
  } else {
    console.error("\n❌ Site Provisioning & Manual Sales Readiness verification FAILED.");
    process.exit(1);
  }
}

check();
