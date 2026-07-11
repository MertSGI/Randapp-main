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

try {
  console.log('🧪 Starting Regression Test for Staging Consistency Scanner...');

  // 1. Verify service_role inside project source fails the scanner
  console.log('Step 1: Writing synthetic service_role leak to components...');
  writeFileSync(srcFixturePath, 'const myKey = "service_role";');

  let failedAsExpected = false;
  try {
    execSync('node scripts/verify-supabase-staging-consistency.mjs', { stdio: 'pipe' });
  } catch (e) {
    failedAsExpected = true;
    console.log('✅ Success: Scanner correctly failed with exit code 1 when project leak exists.');
  }

  if (!failedAsExpected) {
    throw new Error('FAIL: Scanner should have failed, but exited with code 0!');
  }

  // Cleanup project leak file
  unlinkSync(srcFixturePath);

  // 2. Verify service_role inside node_modules is ignored
  console.log('Step 2: Writing synthetic service_role to node_modules/.vite/deps...');
  writeFileSync(nodeModulesFixturePath, 'const myKey = "service_role";');

  let passedAsExpected = false;
  try {
    execSync('node scripts/verify-supabase-staging-consistency.mjs', { stdio: 'pipe' });
    passedAsExpected = true;
    console.log('✅ Success: Scanner ignored the file in node_modules and passed.');
  } catch (e) {
    console.error(e.stdout ? e.stdout.toString() : '');
    throw new Error('FAIL: Scanner failed when service_role was only in node_modules.');
  }

  // Cleanup node_modules file
  unlinkSync(nodeModulesFixturePath);

  console.log('🎉 REGRESSION TEST PASSED SUCCESSFULLY!');
  process.exit(0);

} catch (error) {
  console.error('❌ Regression Test Failed:', error.message);
  
  // Final cleanup attempt
  try { if (existsSync(srcFixturePath)) unlinkSync(srcFixturePath); } catch {}
  try { if (existsSync(nodeModulesFixturePath)) unlinkSync(nodeModulesFixturePath); } catch {}
  process.exit(1);
}
