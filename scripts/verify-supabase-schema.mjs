import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();

console.log('🔍 Starting QA: Supabase Schema Alignment verification...');

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failures++;
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// 1. Verify 20260601_lari_core_schema_alignment.sql exists
const migrationPath = path.join(rootDir, 'supabase', 'migrations', '20260601_lari_core_schema_alignment.sql');
if (fs.existsSync(migrationPath)) {
  const content = fs.readFileSync(migrationPath, 'utf8');
  assert(content.includes('staff_services'), 'Table missing: staff_services');
  assert(content.includes('availability_rules'), 'Table missing: availability_rules');
  assert(content.includes('customer_memory'), 'Table missing: customer_memory');
  assert(content.includes('payment_events'), 'Table missing: payment_events');
  assert(content.includes('business_verification_reviews'), 'Table missing: business_verification_reviews');
  assert(content.includes('notification_templates'), 'Table missing: notification_templates');
  assert(content.includes('notification_logs'), 'Table missing: notification_logs');
  assert(content.includes('ENABLE ROW LEVEL SECURITY'), 'RLS enable statements missing or incomplete');
  
  // Verify publish/verification fields aligning on tenants
  assert(content.includes('verification_status'), 'Field missing on tenants: verification_status');
  assert(content.includes('public_site_status'), 'Field missing on tenants: public_site_status');
  assert(content.includes('subscription_status'), 'Field missing on tenants: subscription_status');
} else {
  assert(false, `Migration file not found at ${migrationPath}`);
}

// 2. Scan frontend pages to guarantee NO raw card fields are added
function scanDirForRawCardForms(dir) {
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDirForRawCardForms(fullPath);
    } else if (stat.isFile() && (item.endsWith('.tsx') || item.endsWith('.ts') || item.endsWith('.js'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const hasCardInput = /<input[^>]*name=["']cardNumber["']|<input[^>]*name=["']cvv["']/gi.test(content);
      if (hasCardInput) {
        assert(false, `Exposed raw card input found in ${path.relative(rootDir, fullPath)}`);
      }
    }
  }
}
scanDirForRawCardForms(path.join(rootDir, 'pages'));
scanDirForRawCardForms(path.join(rootDir, 'components'));
assert(true, 'Checked frontend components for raw card inputs.');

// 3. Scan for exposed provider secrets
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
      const hasSecrets = /SUPABASE_SERVICE_ROLE_KEY|IYZICO_SECRET_KEY|SENDGRID_API_KEY/g.test(content);
      if (hasSecrets) {
        assert(false, `Exposed backend secret found in ${path.relative(rootDir, fullPath)}`);
      }
    }
  }
}
scanDirForSecrets(path.join(rootDir, 'pages'));
scanDirForSecrets(path.join(rootDir, 'components'));
assert(true, 'Checked frontend components for exposed backend secrets.');

if (failures > 0) {
  console.error(`❌ Supabase Schema Alignment QA finished with ${failures} errors.`);
  process.exit(1);
} else {
  console.log('🎉 All Supabase Schema Alignment QA checks passed successfully.');
  process.exit(0);
}
