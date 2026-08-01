import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const migDir = 'supabase/migrations';
const files = readdirSync(migDir).filter(f => f.endsWith('.sql')).sort();

let baselineSql = '-- =========================================================================\n';
baselineSql += '-- LARI CANONICAL DATABASE CONSOLIDATED BASELINE (MIGRATIONS 1 TO 40)\n';
baselineSql += '-- Environment-neutral baseline excluding staging bootstrap data.\n';
baselineSql += '-- =========================================================================\n\n';

for (const file of files) {
  let content = readFileSync(join(migDir, file), 'utf8');
  if (file.includes('20260813_h1c_commercial_eligibility_and_quota_enforcement.sql')) {
    const startIdx = content.indexOf('-- SECTION 0: STAGING CANONICAL TENANT SUBSCRIPTION BOOTSTRAP');
    const endIdx = content.indexOf('-- SECTION 1: INTERNAL COMMERCIAL ELIGIBILITY HELPERS');
    if (startIdx !== -1 && endIdx !== -1) {
      content = content.slice(0, startIdx) + '-- [SECTION 0 EXCLUDED IN ENVIRONMENT-NEUTRAL BASELINE]\n\n' + content.slice(endIdx);
    }
  }
  baselineSql += '-- >>> FILE: ' + file + ' <<<\n' + content + '\n\n';
}

const targetPath = 'supabase/baselines/20260815_canonical_baseline_1_to_40.sql';
mkdirSync('supabase/baselines', { recursive: true });
writeFileSync(targetPath, baselineSql);

const hash = createHash('sha256').update(readFileSync(targetPath)).digest('hex').toUpperCase();

console.log('✅ Baseline generation complete.');
console.log('  File:', targetPath);
console.log('  Lines:', baselineSql.split('\n').length);
console.log('  SHA-256 Checksum:', hash);
