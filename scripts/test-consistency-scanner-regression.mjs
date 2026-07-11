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
  console.log('🧪 Starting Comprehensive Staging Consistency Scanner Regression Test...');

  // Helper to run scanner and assert expected outcome
  const assertScannerResult = (label, content, writeToNodeModules = false, expectPass = false) => {
    cleanFixtures();
    const targetPath = writeToNodeModules ? nodeModulesFixturePath : srcFixturePath;
    writeFileSync(targetPath, content);
    
    let passed = false;
    try {
      execSync('node scripts/verify-supabase-staging-consistency.mjs', { stdio: 'pipe' });
      passed = true;
    } catch (e) {
      passed = false;
    }

    if (expectPass && !passed) {
      throw new Error(`FAIL: ${label} (Expected PASS, but scanner FAILED)`);
    } else if (!expectPass && passed) {
      throw new Error(`FAIL: ${label} (Expected FAIL, but scanner PASSED)`);
    }
    console.log(`  ✅ ${label}: Passed assertion (${expectPass ? 'PASSED' : 'FAILED'} as expected)`);
  };

  // Case A: service_role in project frontend file
  assertScannerResult('Case A', 'const key = "service_role";', false, false);

  // Case B: service_role with warning comments
  assertScannerResult('Case B', 'const key = "service_role";\n// IMPORTANT: Do not put Service Role in frontend', false, false);

  // Case C: SUPABASE_SERVICE_ROLE_KEY with NEVER comments
  assertScannerResult('Case C', 'const key = "SUPABASE_SERVICE_ROLE_KEY";\n// NEVER expose this', false, false);

  // Case D: service_role inside node_modules/.vite/deps
  assertScannerResult('Case D', 'const key = "service_role";', true, true);

  // Case E: Join pattern
  assertScannerResult('Case E', "import.meta.env[['VITE_SUPABASE', 'SERVICE_ROLE_KEY'].join('_')]", false, false);

  // Case F: Concatenation pattern
  assertScannerResult('Case F', "import.meta.env['SUPABASE_' + 'SERVICE_ROLE_KEY']", false, false);

  // Case G: Template literal suffix suffix pattern
  assertScannerResult('Case G', "const suffix = 'SERVICE_ROLE_KEY';\nimport.meta.env[`VITE_SUPABASE_${suffix}`]", false, false);

  // Case H: VITE_SUPABASE_SERVICE_ROLE_KEY literal check
  assertScannerResult('Case H', "import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY", false, false);

  // Case I: VITE_IYZICO_SECRET_KEY literal check
  assertScannerResult('Case I', "import.meta.env.VITE_IYZICO_SECRET_KEY", false, false);

  // Case J: Safe frontend public keys check
  assertScannerResult('Case J', "const url = import.meta.env.VITE_SUPABASE_URL;\nconst key = import.meta.env.VITE_SUPABASE_ANON_KEY;\nconst mode = import.meta.env.VITE_PAYMENT_MODE;", false, true);

  // Case K: Forbidden strings only inside node_modules/.vite/deps
  assertScannerResult('Case K', "import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY\nimport.meta.env.VITE_IYZICO_SECRET_KEY", true, true);

  cleanFixtures();
  console.log('\n🎉 ALL REGRESSION CASES A–K PASSED PERFECTLY!\n');
  process.exit(0);

} catch (error) {
  console.error('\n❌ Regression Test Failed:', error.message);
  cleanFixtures();
  process.exit(1);
}
