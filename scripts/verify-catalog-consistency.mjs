import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();

console.log('🔍 Starting QA: Catalog Consistency...');

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failures++;
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// 1. Verify CatalogRepository is defined
const typesPath = path.join(rootDir, 'services', 'repositories', 'types.ts');
const typesContent = fs.readFileSync(typesPath, 'utf8');
assert(typesContent.includes('CatalogRepository'), 'CatalogRepository interface must exist');
assert(typesContent.includes('listServices'), 'CatalogRepository must have listServices');
assert(typesContent.includes('listStaff'), 'CatalogRepository must have listStaff');
assert(typesContent.includes('assignServiceToStaff'), 'CatalogRepository must have assignServiceToStaff');

// 2. Verify LocalCatalogRepository exists and wraps storage keys
const localRepoPath = path.join(rootDir, 'services', 'repositories', 'localCatalogRepository.ts');
if (fs.existsSync(localRepoPath)) {
  const content = fs.readFileSync(localRepoPath, 'utf8');
  assert(content.includes('randapp:${tenantId}:services'), 'Local repo should use the randapp tenant keys for services');
  assert(content.includes('randapp:${tenantId}:staff'), 'Local repo should use the randapp tenant keys for staff');
  assert(content.includes('randapp:${tenantId}:staff_services'), 'Local repo should support staff_services mapping');
} else {
  assert(false, 'LocalCatalogRepository not found');
}

// 3. Verify getCatalogRepository in factory
const factoryPath = path.join(rootDir, 'services', 'repositories', 'index.ts');
const factoryContent = fs.readFileSync(factoryPath, 'utf8');
assert(factoryContent.includes('getCatalogRepository'), 'Factory must export getCatalogRepository');

// 4. Verify original services delegating to repository
const serviceCatalogPath = path.join(rootDir, 'services', 'serviceCatalogService.ts');
const serviceContent = fs.readFileSync(serviceCatalogPath, 'utf8');
assert(serviceContent.includes('getCatalogRepository()'), 'serviceCatalogService should use getCatalogRepository() instead of internal storage');
assert(!serviceContent.includes('export const deleteService = async (tenantId: string, serviceId: string) => { if (isSupabaseMode())'), 'serviceCatalogService should delegate logic explicitly to Repo');

const staffServicePath = path.join(rootDir, 'services', 'staffService.ts');
const staffContent = fs.readFileSync(staffServicePath, 'utf8');
assert(staffContent.includes('getCatalogRepository()'), 'staffService should use getCatalogRepository() instead of internal storage');

if (failures > 0) {
  console.error(`❌ QA finished with ${failures} errors.`);
  process.exit(1);
} else {
  console.log('🎉 All Catalog Consistency QA checks passed successfully.');
  process.exit(0);
}
