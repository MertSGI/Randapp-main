import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();

console.log('🔍 Starting QA: Data Source Adapters verification...');

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failures++;
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// 1. Verify dataSourceConfig exists
const configPath = path.join(rootDir, 'services', 'dataSourceConfig.ts');
if (fs.existsSync(configPath)) {
  const content = fs.readFileSync(configPath, 'utf8');
  assert(content.includes('VITE_LARI_DATA_SOURCE'), 'dataSourceConfig.ts must check VITE_LARI_DATA_SOURCE');
  assert(content.includes('local'), 'dataSourceConfig.ts must support local mode');
  assert(content.includes('supabase'), 'dataSourceConfig.ts must support supabase mode');
} else {
  assert(false, `dataSourceConfig.ts not found at ${configPath}`);
}

// 2. Verify repository layer
const typesPath = path.join(rootDir, 'services', 'repositories', 'types.ts');
assert(fs.existsSync(typesPath), 'Repository types.ts not found');

const indexPath = path.join(rootDir, 'services', 'repositories', 'index.ts');
if (fs.existsSync(indexPath)) {
  const content = fs.readFileSync(indexPath, 'utf8');
  assert(content.includes('getBusinessProfileRepository'), 'Factory missing getBusinessProfileRepository');
} else {
  assert(false, `Repository factory index.ts not found`);
}

// 3. Verify Supabase stubs do NOT expose service role keys
function scanDirForServiceRole(dir) {
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDirForServiceRole(fullPath);
    } else if (stat.isFile() && (item.endsWith('.tsx') || item.endsWith('.ts') || item.endsWith('.js'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const hasSecrets = /SUPABASE_SERVICE_ROLE_KEY/g.test(content);
      if (hasSecrets) {
        assert(false, `Exposed service role key found in ${path.relative(rootDir, fullPath)}. Do not use service role key in frontend.`);
      }
    }
  }
}
scanDirForServiceRole(path.join(rootDir, 'services', 'repositories'));
assert(true, 'Checked repository implementations for exposed backend secrets (service role).');

if (failures > 0) {
  console.error(`❌ Data Source Adapters QA finished with ${failures} errors.`);
  process.exit(1);
} else {
  console.log('🎉 All Data Source Adapters QA checks passed successfully.');
  process.exit(0);
}
