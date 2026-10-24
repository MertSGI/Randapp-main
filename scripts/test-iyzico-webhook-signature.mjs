import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Running LARI iyzico webhook signature verification suite...');

const rootDir = path.resolve(__dirname, '..');
try {
  execSync('npx tsx scripts/verify-iyzico-webhook-cryptography.mjs', {
    stdio: 'inherit',
    cwd: rootDir
  });
  console.log('[SUCCESS] All iyzico webhook security & cryptographic suites passed.');
} catch (err) {
  console.error('[FAIL] iyzico webhook cryptographic verification failed.');
  process.exit(1);
}
