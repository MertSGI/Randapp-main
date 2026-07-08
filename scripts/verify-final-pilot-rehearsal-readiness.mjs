import fs from 'fs';
import path from 'path';

function verify() {
  console.log("=== LARİ Final Pilot Rehearsal & End-to-End Simulation QA Audit ===");
  let passed = true;

  const checkFileExists = (filePath, isOptional = false) => {
    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      if (!isOptional) {
        console.error(`❌ Missing file: ${filePath}`);
        passed = false;
      }
      return null;
    }
    console.log(`✅ File exists: ${filePath}`);
    return fs.readFileSync(fullPath, 'utf-8');
  };

  // 1. Check newly created pilot rehearsal docs
  const doc1 = checkFileExists('docs/FIRST_REAL_SALON_END_TO_END_REHEARSAL.md');
  const doc2 = checkFileExists('docs/FIRST_PILOT_ACCEPTANCE_CRITERIA.md');
  const doc3 = checkFileExists('docs/FOUNDER_PILOT_REHEARSAL_CHECKLIST.md');
  const doc4 = checkFileExists('docs/FIRST_PILOT_FIXTURE_DATA_PLAN.md');

  if (doc1 && doc2 && doc3 && doc4) {
    console.log("✅ All new pilot rehearsal documents verified successfully.");
  } else {
    passed = false;
  }

  // 2. Check existing operational docs
  const indexDoc = checkFileExists('docs/PILOT_DOCS_INDEX.md');
  if (indexDoc) {
    const requiredLinks = [
      'FIRST_REAL_SALON_END_TO_END_REHEARSAL.md',
      'FIRST_PILOT_ACCEPTANCE_CRITERIA.md',
      'FOUNDER_PILOT_REHEARSAL_CHECKLIST.md',
      'FIRST_PILOT_FIXTURE_DATA_PLAN.md'
    ];
    requiredLinks.forEach(link => {
      if (!indexDoc.includes(link)) {
        console.error(`❌ PILOT_DOCS_INDEX.md is missing reference link to: ${link}`);
        passed = false;
      } else {
        console.log(`  • PILOT_DOCS_INDEX.md correctly links to: ${link}`);
      }
    });
  }

  checkFileExists('docs/BOOKING_SELF_SERVICE_AND_ABUSE_PREVENTION.md');
  checkFileExists('docs/BACKGROUND_JOBS_AND_SCHEDULER_OPERATIONS.md');
  checkFileExists('docs/OBSERVABILITY_AUDIT_AND_SUPPORT_OPERATIONS.md');
  checkFileExists('docs/MEDIA_STORAGE_AND_ASSET_OPERATIONS.md');
  checkFileExists('docs/COMMUNICATION_PROVIDER_CONTRACT_MATRIX.md');
  checkFileExists('docs/CUSTOM_DOMAIN_STRATEGY.md');

  // 3. Check Super Admin pilot tracker UI references
  const trackerContent = checkFileExists('pages/super-admin/SuperAdminPilotTrackerPage.tsx');
  if (trackerContent) {
    const requiredUIElements = [
      'End-to-End Pilot Rehearsal Console',
      'FIRST_REAL_SALON_END_TO_END_REHEARSAL.md',
      'FIRST_PILOT_ACCEPTANCE_CRITERIA.md',
      'FOUNDER_PILOT_REHEARSAL_CHECKLIST.md',
      'FIRST_PILOT_FIXTURE_DATA_PLAN.md'
    ];
    requiredUIElements.forEach(el => {
      if (!trackerContent.includes(el)) {
        console.error(`❌ SuperAdminPilotTrackerPage.tsx is missing rehearsal section component: ${el}`);
        passed = false;
      } else {
        console.log(`  • SuperAdminPilotTrackerPage.tsx implements rehearsal section: ${el}`);
      }
    });
  }

  // 4. Commercial & Brand Compliance Checks
  const checkBrandingAndStraits = (filePath) => {
    const content = checkFileExists(filePath);
    if (content) {
      // Must use LARİ as brand
      if (!content.includes('lari') && !content.includes('Lari') && !content.includes('LARİ')) {
        console.warn(`⚠️ Warning: ${filePath} might not contain LARİ brand references.`);
      }

      // Check for Turkish domain strategy randevulari.com
      if (content.includes('randevulari.com')) {
        console.log(`  • Checked ${filePath}: correctly utilizes Turkish domain target randevulari.com`);
      } else if (filePath === 'App.tsx') {
        console.error(`❌ App.tsx is missing randevulari.com domain target strategy references.`);
        passed = false;
      }

      // Check for "no credit card required" marketing statements to avoid commercial misrepresentation
      if (content.includes('no credit card required') || content.includes('kredi kartı gerekmez')) {
        console.error(`❌ Commercial safety breach in ${filePath}: contains forbidden 'no credit card required' copy.`);
        passed = false;
      }

      // Check for trial period durations. LARİ standardizes on 14-day trials, never 7 days.
      if (content.includes('7-day trial') || content.includes('7 günlük deneme')) {
        console.error(`❌ Commercial period misrepresentation in ${filePath}: contains unauthorized 7-day trial mentions instead of 14 days.`);
        passed = false;
      }
    }
  };

  console.log("🔍 Running branding, commercial safety & Turkish domain strategy checks...");
  checkBrandingAndStraits('App.tsx');
  checkBrandingAndStraits('pages/super-admin/SuperAdminPilotTrackerPage.tsx');

  // 5. Raw card inputs prevention & secrets scan
  const envContent = checkFileExists('.env.example');
  if (envContent) {
    const secretsFound = [
      'TWILIO_AUTH_TOKEN',
      'RESEND_API_KEY',
      'IYZICO_API_KEY',
      'IYZICO_SECRET_KEY',
      'NETGSM_PASSWORD',
      'SUPABASE_SERVICE_ROLE_KEY'
    ].filter(s => {
      const match = envContent.match(new RegExp(`${s}=[^\\s#]+`));
      return match && match[0].split('=')[1].trim().length > 0;
    });

    if (secretsFound.length > 0) {
      console.error(`❌ .env.example contains raw active keys/secrets for: ${secretsFound.join(', ')}`);
      passed = false;
    } else {
      console.log("  • .env.example secrets scan completed: No active secrets committed.");
    }
  }

  console.log("------------------------------------------------------------------------");
  if (passed) {
    console.log("⭐️ [SUCCESS] LARİ Pilot Rehearsal Readiness QA Audit PASSED!");
    process.exit(0);
  } else {
    console.error("❌ [FAILURE] LARİ Pilot Rehearsal Readiness QA Audit FAILED!");
    process.exit(1);
  }
}

verify();
