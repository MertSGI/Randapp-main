import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const runIsolationTests = () => {
    let passed = true;
    let output = '# Auth & Session Isolation QA Report\n\n';

    output += `## 1. Verifying Pilot Service Methods\n`;
    const pilotSvcPath = path.join(rootDir, 'services', 'pilotDemoService.ts');
    if (fs.existsSync(pilotSvcPath)) {
        const content = fs.readFileSync(pilotSvcPath, 'utf8');
        
        if (content.includes('seedDemoDataOnly()') && content.includes('startPilotOwnerDemoSession()')) {
            output += `- ✅ pilotDemoService has separated 'seedDemoDataOnly' and 'startPilotOwnerDemoSession' methods.\n`;
        } else {
            output += `- ❌ pilotDemoService does not have correctly separated methods.\n`;
            passed = false;
        }

        if (content.includes("localStorage.setItem('lari_demo_context', 'true')") && content.includes("localStorage.setItem('lari_active_demo_tenant_id'")) {
            output += `- ✅ pilotDemoService correctly uses safe demo context keys (lari_demo_context, lari_active_demo_tenant_id).\n`;
        } else {
            output += `- ❌ pilotDemoService is missing allowed public keys.\n`;
            passed = false;
        }

        const seedDemoDataContent = content.substring(content.indexOf('seedDemoDataOnly()'), content.indexOf('seedAndEnterDemoContext()'));
        if (content.includes("lari_active_owner_session") && !seedDemoDataContent.includes('lari_active_owner_session')) {
            output += `- ✅ pilotDemoService does not set lari_active_owner_session inside seedDemoDataOnly.\n`;
        } else {
            output += `- ❌ pilotDemoService incorrectly sets lari_active_owner_session inside seedDemoDataOnly.\n`;
            passed = false;
        }
    } else {
        output += `- ❌ pilotDemoService.ts not found.\n`;
        passed = false;
    }

    output += `\n## 2. Verifying Tenant Service Resolution Bypasses Auto-login\n`;
    const tenantSvcPath = path.join(rootDir, 'services', 'tenantService.ts');
    if (fs.existsSync(tenantSvcPath)) {
        const content = fs.readFileSync(tenantSvcPath, 'utf8');
        if (content.includes('pilotDemoService.seedDemoDataOnly()') && !content.includes('pilotDemoService.seedAndEnterDemoContext()')) {
            output += `- ✅ tenantService calls seedDemoDataOnly on pilot route detection, preserving guest isolation.\n`;
        } else {
            output += `- ❌ tenantService still triggers seedAndEnterDemoContext or is missing necessary guest bypass.\n`;
            passed = false;
        }
    } else {
        output += `- ❌ tenantService.ts not found.\n`;
        passed = false;
    }

    output += `\n## 3. Verifying Entry Page CTAs\n`;
    const entryPagePath = path.join(rootDir, 'pages', 'PilotDemoEntryPage.tsx');
    if (fs.existsSync(entryPagePath)) {
        const content = fs.readFileSync(entryPagePath, 'utf8');
        
        if (content.includes('pilotDemoService.seedDemoDataOnly()') && !content.includes('pilotDemoService.seedAndEnterDemoContext()')) {
            output += `- ✅ Pilot entry page loads with seedDemoDataOnly to ensure no automatic login on page visit.\n`;
        } else {
            output += `- ❌ Pilot entry page still auto-triggers seedAndEnterDemoContext on mount.\n`;
            passed = false;
        }

        if (content.includes('onClick={handleStartOwnerDemo}')) {
            output += `- ✅ Admin portal CTA triggers explicit handleStartOwnerDemo action.\n`;
        } else {
            output += `- ❌ Admin portal CTA is not wired to handleStartOwnerDemo action.\n`;
            passed = false;
        }
    } else {
        output += `- ❌ PilotDemoEntryPage.tsx not found.\n`;
        passed = false;
    }

    output += `\n## Summary\n`;
    if (passed) {
        output += `✅ Authentication & Session Isolation tests passed.\n`;
        console.log(`✅ Authentication & Session Isolation tests passed.`);
    } else {
        output += `❌ Authentication & Session Isolation tests failed.\n`;
        console.error(`❌ Authentication & Session Isolation tests failed.`);
    }

    const reportDir = path.join(rootDir, 'qa-reports');
    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir);
    }
    
    fs.writeFileSync(path.join(reportDir, 'AUTH_ISOLATION_REPORT.md'), output);
    if (!passed) {
        process.exit(1);
    }
};

runIsolationTests();
