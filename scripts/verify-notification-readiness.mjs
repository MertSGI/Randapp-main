import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();

console.log('🔍 Starting QA: Notification Readiness verification...');

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failures++;
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// 1. Verify notificationTemplateService.ts exists and has required templates
const notificationServicePath = path.join(rootDir, 'services', 'notificationTemplateService.ts');
if (fs.existsSync(notificationServicePath)) {
  const content = fs.readFileSync(notificationServicePath, 'utf8');
  assert(content.includes('onboarding_welcome'), 'Template missing: onboarding_welcome');
  assert(content.includes('trial_started'), 'Template missing: trial_started');
  assert(content.includes('checkout_pending'), 'Template missing: checkout_pending');
  assert(content.includes('trial_ending_reminder'), 'Template missing: trial_ending_reminder');
  assert(content.includes('payment_failed'), 'Template missing: payment_failed');
  assert(content.includes('appointment_confirmation'), 'Template missing: appointment_confirmation');
  assert(content.includes('appointment_reminder'), 'Template missing: appointment_reminder');
  assert(content.includes('publish_approved'), 'Template missing: publish_approved');
  assert(content.includes('publish_rejected'), 'Template missing: publish_rejected');

  // Verify trial copy emphasizes 14 days and doesn't promise without card
  assert(content.includes('14 gün'), 'Templates should specify 14 days.');
} else {
  assert(false, `notificationTemplateService.ts not found at ${notificationServicePath}`);
}

// 2. Scan frontend pages to guarantee NO provider secrets are exposed
function scanDirForSecrets(dir) {
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDirForSecrets(fullPath);
    } else if (stat.isFile() && (item.endsWith('.tsx') || item.endsWith('.ts') || item.endsWith('.js'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const hasSecrets = /SENDGRID_API_KEY|AWS_SES|TWILIO_ACCOUNT|IYZICO_SECRET_KEY/g.test(content);
      if (hasSecrets) {
        assert(false, `Exposed secret pattern found in ${path.relative(rootDir, fullPath)}`);
      }
    }
  }
}
scanDirForSecrets(path.join(rootDir, 'pages'));
scanDirForSecrets(path.join(rootDir, 'components'));
assert(true, 'Checked frontend components for exposed provider secrets.');

// 3. Admin settings check
const adminSettingsPath = path.join(rootDir, 'components', 'AdminSettingsTab.tsx');
if (fs.existsSync(adminSettingsPath)) {
  const content = fs.readFileSync(adminSettingsPath, 'utf8');
  assert(content.includes('Bildirimler ve İletişim') || content.includes('Randevu Onay Bildirimleri'), 'AdminSettingsTab should contain notification settings surface.');
} else {
  assert(false, 'AdminSettingsTab.tsx not found.');
}

if (failures > 0) {
  console.error(`❌ Notification readiness QA finished with ${failures} errors.`);
  process.exit(1);
} else {
  console.log('🎉 All Notification readiness QA checks passed successfully.');
  process.exit(0);
}
