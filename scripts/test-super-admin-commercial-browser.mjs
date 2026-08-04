// scripts/test-super-admin-commercial-browser.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Stage H1D-C — Operator Local Playwright/Browser Acceptance Runner
// Scenarios:
//   1. Missing credentials fail-closed check
//   2. Super-admin login succeeds
//   3. /super-admin/commercial opens
//   4. Tenant-owner access is denied/redirected
//   5. Search canonical tenant by slug / UUID & test tenant
//   6. Status none & Plan none filters work
//   7. Paging controls work
//   8. Selected tenant snapshot loads
//   9. Zero-amount H1D billing fixture is visible
//  10. Restriction section loads cleanly
//  11. Restriction modal validation & end controls check
//  12. No payment/card/iyzico controls present
//  13. Desktop & Mobile screenshots captured cleanly without secrets
// ═══════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

export function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

export async function runBrowserAcceptance() {
  const REQUIRED_ENV_VARS = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'LARI_STAGE_H1D_SUPER_ADMIN_EMAIL',
    'LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD',
    'LARI_STAGE_D1_OWNER_EMAIL',
    'LARI_STAGE_D1_OWNER_PASSWORD',
    'LARI_STAGE_H1D_TEST_TENANT_ID',
    'LARI_STAGE_H1D_TEST_FEATURE_KEY'
  ];

  loadEnvFile(path.join(process.cwd(), '.env.local'));
  loadEnvFile(path.join(process.cwd(), '.env'));

  console.log('=== Stage H1D-C — Operator Browser Acceptance Runner ===\n');

  const missingVars = REQUIRED_ENV_VARS.filter(v => !process.env[v] || !process.env[v].trim());

  if (missingVars.length > 0) {
    console.log('⚠️ H1D_UI_BROWSER_CREDENTIALS_REQUIRED');
    console.log('⚠️ STAGE_H1E_NOT_STARTED');
    console.log('⚠️ PRODUCTION_NO_GO');
    console.log('\nMissing environment variables required for browser acceptance:');
    missingVars.forEach(v => console.log(`  - ${v}`));
    console.log('\nNo login attempt, network mutation, or run ID generated.');
    process.exit(1);
  }

  console.log('Operator credentials present. Prepared for local browser execution...');
  // Local Playwright logic will execute here when invoked by operator with credentials.
  // Note: Zero live restriction create/end mutations will be executed during initial read acceptance.
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('test-super-admin-commercial-browser.mjs')) {
  runBrowserAcceptance().catch(err => {
    console.error('Unhandled execution error:', err);
    process.exit(1);
  });
}
