import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();

// Setup paths
const srcDir = join(ROOT, 'components');
const mockNodeModulesDir = join(ROOT, 'node_modules', '.vite', 'deps');

if (!existsSync(srcDir)) mkdirSync(srcDir, { recursive: true });
if (!existsSync(mockNodeModulesDir)) mkdirSync(mockNodeModulesDir, { recursive: true });

const srcFixturePath = join(srcDir, 'dummy_test_leak_file.tsx');
const nodeModulesFixturePath = join(mockNodeModulesDir, 'dummy_test_leak_file.tsx');

const cleanFixtures = () => {
  try { if (existsSync(srcFixturePath)) unlinkSync(srcFixturePath); } catch {}
  try { if (existsSync(nodeModulesFixturePath)) unlinkSync(nodeModulesFixturePath); } catch {}
};

try {
  console.log('🧪 Starting Advanced Regression Test for Staging Consistency Scanner...');

  // ────────────────────────────────────────────────────────────────────────
  // Case A: A project frontend file contains `service_role`
  // ────────────────────────────────────────────────────────────────────────
  console.log('Case A: service_role in project frontend file...');
  cleanFixtures();
  writeFileSync(srcFixturePath, 'const key = "service_role";');
  
  let failedA = false;
  try {
    execSync('node scripts/verify-supabase-staging-consistency.mjs', { stdio: 'pipe' });
  } catch (e) {
    failedA = true;
    console.log('  ✅ Expected FAIL achieved.');
  }
  if (!failedA) throw new Error('Case A FAILED: scanner did not block "service_role" in project code.');

  // ────────────────────────────────────────────────────────────────────────
  // Case B: A project frontend file contains `service_role` and safety comments
  // ────────────────────────────────────────────────────────────────────────
  console.log('Case B: service_role in project frontend file with safety comments...');
  cleanFixtures();
  writeFileSync(srcFixturePath, 'const key = "service_role";\n// IMPORTANT: Do not put Service Role in frontend');
  
  let failedB = false;
  try {
    execSync('node scripts/verify-supabase-staging-consistency.mjs', { stdio: 'pipe' });
  } catch (e) {
    failedB = true;
    console.log('  ✅ Expected FAIL achieved.');
  }
  if (!failedB) throw new Error('Case B FAILED: scanner was bypassed by safety comments.');

  // ────────────────────────────────────────────────────────────────────────
  // Case C: A project frontend file contains `SUPABASE_SERVICE_ROLE_KEY`
  // ────────────────────────────────────────────────────────────────────────
  console.log('Case C: SUPABASE_SERVICE_ROLE_KEY in project frontend file...');
  cleanFixtures();
  writeFileSync(srcFixturePath, 'const key = "SUPABASE_SERVICE_ROLE_KEY";\n// NEVER expose this');
  
  let failedC = false;
  try {
    execSync('node scripts/verify-supabase-staging-consistency.mjs', { stdio: 'pipe' });
  } catch (e) {
    failedC = true;
    console.log('  ✅ Expected FAIL achieved.');
  }
  if (!failedC) throw new Error('Case C FAILED: scanner was bypassed by "NEVER" comments.');

  // ────────────────────────────────────────────────────────────────────────
  // Case D: The same strings exist only under node_modules/.vite/deps
  // ────────────────────────────────────────────────────────────────────────
  console.log('Case D: service_role only inside node_modules/.vite/deps...');
  cleanFixtures();
  writeFileSync(nodeModulesFixturePath, 'const key = "service_role";\nconst key2 = "SUPABASE_SERVICE_ROLE_KEY";');
  
  let passedD = false;
  try {
    execSync('node scripts/verify-supabase-staging-consistency.mjs', { stdio: 'pipe' });
    passedD = true;
    console.log('  ✅ Expected PASS achieved.');
  } catch (e) {
    console.error(e.stdout ? e.stdout.toString() : '');
    throw new Error('Case D FAILED: scanner flagged files in node_modules.');
  }

  // Final cleanup
  cleanFixtures();

  console.log('🎉 ALL REGRESSION CASES A–D PASSED PERFECTLY!');
  process.exit(0);

} catch (error) {
  console.error('❌ Regression Test Failed:', error.message);
  cleanFixtures();
  process.exit(1);
}
