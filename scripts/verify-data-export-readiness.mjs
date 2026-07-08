import fs from 'fs';
import path from 'path';

console.log('--- Verifying Data Export & Migration Dry-Run Readiness ---');

let hasErrors = false;

function checkFileExists(filepath, name) {
    if (!fs.existsSync(filepath)) {
        console.error(`❌ Missing file: ${filepath} (${name})`);
        hasErrors = true;
        return;
    }
    console.log(`✅ ${name} exists`);
}

function checkContent(filepath, name, requiredStrings, forbiddenStrings) {
    if (!fs.existsSync(filepath)) return;
    const content = fs.readFileSync(filepath, 'utf8');
    
    if (requiredStrings) {
        requiredStrings.forEach(str => {
            if (!content.includes(str)) {
                console.error(`❌ ${name} is missing required string: "${str}"`);
                hasErrors = true;
            }
        });
    }

    if (forbiddenStrings) {
        forbiddenStrings.forEach(str => {
            if (content.includes(str)) {
                console.error(`❌ ${name} contains forbidden string: "${str}"`);
                hasErrors = true;
            }
        });
    }
}

// 1. Check Files Exit
checkFileExists(path.join(process.cwd(), 'services', 'dataExportService.ts'), 'Data Export Service');
checkFileExists(path.join(process.cwd(), 'services', 'migrationDryRunService.ts'), 'Migration Dry Run Service');
checkFileExists(path.join(process.cwd(), 'pages', 'super-admin', 'SuperAdminDataExportSection.tsx'), 'SuperAdmin Export UI');
checkFileExists(path.join(process.cwd(), 'docs', 'DATA_EXPORT_IMPORT_AND_MIGRATION_DRY_RUN.md'), 'Data Export Docs');

// 2. Check Data Export Service Content
const dataExportServicePath = path.join(process.cwd(), 'services', 'dataExportService.ts');
checkContent(dataExportServicePath, 'Data Export Service', [
    'exportTenantSnapshot',
    'importTenantSnapshot',
    'validateTenantSnapshot',
    'lari-local-v1',
    'mock_business_profile'
], [
    'lari_active_owner_session' // Explicitly making sure active owner session is NOT exported
]);

// 3. Check Migration Dry Run Validator
const migrationPath = path.join(process.cwd(), 'services', 'migrationDryRunService.ts');
checkContent(migrationPath, 'Migration Dry Run Service', [
    '.blockers.push',
    '.warnings.push',
    'cardNumber',
    'password'
]);

// 4. Overall Audit is intact
checkFileExists(path.join(process.cwd(), 'docs', 'MASTER_END_TO_END_SYSTEM_AUDIT.md'), 'Master System Audit Report');

if (hasErrors) {
    console.error('\n❌ Data Export & Migration Readiness verification FAILED.');
    process.exit(1);
} else {
    console.log('\n🎉 Data Export & Migration Readiness verification PASSED.');
}
