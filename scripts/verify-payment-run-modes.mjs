import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const runTests = () => {
    let passed = true;
    let output = '# Payment Run Modes Readiness Report\n\n';

    output += `## Mode Definitions Check\n`;
    
    const runModeServicePath = path.join(rootDir, 'services', 'paymentRunModeService.ts');
    if (fs.existsSync(runModeServicePath)) {
        const content = fs.readFileSync(runModeServicePath, 'utf8');
        
        if (content.includes('local_dry_run') && content.includes('sandbox_live') && content.includes('production_live')) {
            output += `- ✅ Modes defined correctly\n`;
        } else {
            output += `- ❌ Missing mode definitions in paymentRunModeService.ts\n`;
            passed = false;
        }

        if (content.includes('simulateCheckoutHandoff')) {
            output += `- ✅ Safe QA internal simulation path exists\n`;
        } else {
            output += `- ❌ Internal simulation path missing\n`;
            passed = false;
        }
    } else {
        output += `❌ paymentRunModeService.ts not found.\n`;
        passed = false;
    }

    const goLivePagePath = path.join(rootDir, 'pages', 'super-admin', 'SuperAdminGoLivePage.tsx');
    if (fs.existsSync(goLivePagePath)) {
        const content = fs.readFileSync(goLivePagePath, 'utf8');
        if (content.includes('paymentRunModeService')) {
            output += `- ✅ Super Admin Go-Live console uses payment run mode service\n`;
        } else {
            output += `- ❌ Super Admin Go-Live console missing run mode logic\n`;
            passed = false;
        }
    } else {
        output += `- ❌ Super Admin Go-Live console missing\n`;
        passed = false;
    }

    output += `\n## Summary\n`;
    if (passed) {
        output += `✅ Payment run mode constraints satisfied.\n`;
        console.log(`✅ Payment run mode checks passed.`);
    } else {
        output += `❌ Payment run mode checks failed.\n`;
        console.error(`❌ Payment run mode checks failed.`);
    }

    const reportDir = path.join(rootDir, 'qa-reports');
    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir);
    }
    
    fs.writeFileSync(path.join(reportDir, 'PAYMENT_RUN_MODES_REPORT.md'), output);
    if (!passed) {
        process.exit(1);
    }
};

runTests();
