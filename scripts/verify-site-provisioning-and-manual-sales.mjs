import fs from 'fs';
import path from 'path';

function check() {
  console.log("--- Verifying Site Provisioning & Manual Sales Readiness ---");
  let passed = true;

  const filesToCheck = [
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

  const siteProvContent = fs.readFileSync(path.join(process.cwd(), 'services/siteProvisioningService.ts'), 'utf-8');
  if (!siteProvContent.includes('reserveTenantSlug')) {
    console.error("❌ siteProvisioningService.ts is missing reserveTenantSlug");
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

  if (passed) {
    console.log("\n🎉 Site Provisioning & Manual Sales Readiness verification PASSED.");
    process.exit(0);
  } else {
    console.error("\n❌ Site Provisioning & Manual Sales Readiness verification FAILED.");
    process.exit(1);
  }
}

check();
