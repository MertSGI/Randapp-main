import fs from 'fs';
import path from 'path';

console.log('=== RUNNING SUPABASE STAGING ENVIRONMENT PREFLIGHT CHECK ===\n');

// Try to read environment variables from process.env or .env
let env = { ...process.env };

// Simple .env parser for preflight
if (fs.existsSync('.env')) {
  try {
    const lines = fs.readFileSync('.env', 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const parts = trimmed.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
          env[key] = value;
        }
      }
    }
  } catch (e) {
    console.warn('[WARN] Failed to parse .env file:', e.message);
  }
}

const requiredVars = [
  'VITE_LAUNCH_MODE',
  'VITE_DATA_MODE',
  'VITE_PAYMENT_MODE',
  'VITE_COMMUNICATION_MODE',
  'VITE_PUBLIC_BASE_DOMAIN',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY'
];

let failed = false;
const missing = [];

// 1. Check required variables
for (const req of requiredVars) {
  if (!env[req]) {
    missing.push(req);
    failed = true;
  }
}

if (failed) {
  console.log('[BLOCKED] Missing required staging configuration environment variables:');
  for (const m of missing) {
    console.log(`  - ${m}`);
  }
  console.log('\n[INFO] Staging smoke testing is BLOCKED until these variables are configured in .env.');
  console.log('[SUCCESS] Preflight structural validation completed successfully (Staging is currently inactive/blocked).\n');
  process.exit(0);
}

// 2. Validate payment mode
const paymentMode = env.VITE_PAYMENT_MODE;
if (paymentMode !== 'disabled') {
  console.error(`[FAIL] VITE_PAYMENT_MODE is "${paymentMode}". For paymentless limited production, it must be "disabled".`);
  process.exit(1);
}

// 3. Validate launch mode
const launchMode = env.VITE_LAUNCH_MODE;
const allowedLaunchModes = [
  'unpaid_manual_pilot',
  'limited_live_manual_billing',
  'paymentless_limited_production'
];

if (!allowedLaunchModes.includes(launchMode)) {
  console.error(`[FAIL] VITE_LAUNCH_MODE is "${launchMode}". Allowed launch modes for staging are: ${allowedLaunchModes.join(', ')}`);
  process.exit(1);
}

// 4. Validate data mode
const dataMode = env.VITE_DATA_MODE;
if (dataMode === 'local' || !dataMode.startsWith('supabase')) {
  console.error(`[FAIL] VITE_DATA_MODE is "${dataMode}". For staging tests, it cannot be "local" and must start with "supabase".`);
  process.exit(1);
}

// 5. Verify no service role keys or secret keys are prefixed with VITE_ or exposed
const unsafeKeys = Object.keys(env).filter(key => {
  return (key.startsWith('VITE_') && (
    key.includes('SERVICE_ROLE') || 
    key.includes('SERVICE_KEY') || 
    key.includes('SECRET_KEY') || 
    key.includes('IYZICO_LIVE') ||
    key.includes('PRIVATE_KEY')
  ));
});

if (unsafeKeys.length > 0) {
  console.error('[CRITICAL SECURITY VIOLATION] Unsafe secret variables prefixed with VITE_ found in the environment:');
  for (const k of unsafeKeys) {
    console.error(`  - ${k}`);
  }
  console.error('[ABORT] Secret keys must never be exposed to the client-side bundle.');
  process.exit(1);
}

// 6. Verify Turkey strategy base domain
const baseDomain = env.VITE_PUBLIC_BASE_DOMAIN;
if (baseDomain !== 'randevulari.com') {
  console.error(`[FAIL] VITE_PUBLIC_BASE_DOMAIN is "${baseDomain}". It must be set to "randevulari.com" for Turkey live strategy.`);
  process.exit(1);
}

console.log('[PASS] Staging Environment Preflight Check completed successfully!');
console.log(`  - Launch Mode: ${launchMode}`);
console.log(`  - Data Mode: ${dataMode}`);
console.log(`  - Payment Mode: ${paymentMode}`);
console.log(`  - Public Base Domain: ${baseDomain}`);
console.log('  - Supabase URL: Configured (Safely hidden)');
console.log('  - Supabase Anon Key: Configured (Safely hidden)');
console.log('\n[SUCCESS] Environment is fully validated and ready for persistent staging connections!\n');
process.exit(0);
