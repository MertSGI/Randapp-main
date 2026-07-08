import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const REQUIRED_BACKEND_SECRETS = [
    'IYZICO_API_KEY',
    'IYZICO_SECRET_KEY',
    'IYZICO_BASE_URL',
    // 'IYZICO_CALLBACK_URL',
    // 'IYZICO_WEBHOOK_SECRET', // optional depending on verification logic
    'PUBLIC_APP_URL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
];

const PLAN_MAP = [
    { title: 'Starter' },
    { title: 'Professional' },
    { title: 'Premium' }
];

const main = () => {
    let output = '# Sandbox Readiness Report\n\n';
    let passed = true;

    // Check .env.example for required names
    const envExamplePath = path.join(rootDir, '.env.example');
    let envContent = '';
    if (fs.existsSync(envExamplePath)) {
        envContent = fs.readFileSync(envExamplePath, 'utf8');
        output += `## Backend Secrets Defined in .env.example\n`;
        REQUIRED_BACKEND_SECRETS.forEach(secret => {
            if (envContent.includes(secret)) {
                output += `- ✅ ${secret}\n`;
            } else {
                output += `- ❌ ${secret} (Missing)\n`;
                passed = false;
            }
        });
    } else {
        output += `❌ .env.example not found.\n`;
        passed = false;
    }

    output += `\n## Plan Mapping Readiness\n`;
    output += `Plans should map to Iyzico Product and Pricing Plan reference codes in the Edge function or shared config.\n`;
    
    // We check if the subscriptionService or planService mentions the mapping
    const planServicePath = path.join(rootDir, 'services', 'planService.ts');
    const trialConfigPath = path.join(rootDir, 'services', 'trialConfigService.ts');

    output += `\n## Trial Configuration Readiness\n`;
    if (fs.existsSync(trialConfigPath)) {
        const trialContent = fs.readFileSync(trialConfigPath, 'utf8');
        if (trialContent.includes('trialDayCount: 14')) {
            output += `- ✅ Trial configured to 14 days.\n`;
        } else {
            output += `- ❌ Trial not configured to 14 days.\n`;
            passed = false;
        }
    } else {
        output += `❌ trialConfigService.ts not found.\n`;
        passed = false;
    }

    let planServiceContent = '';
    if (fs.existsSync(planServicePath)) {
        planServiceContent = fs.readFileSync(planServicePath, 'utf8');
        PLAN_MAP.forEach(plan => {
            if (planServiceContent.includes('iyzicoProductReferenceCode') || planServiceContent.includes('iyzicoPricingPlanReferenceCode')) {
                output += `- ✅ ${plan.title} plan reference mapping fields exist.\n`;
            } else {
                output += `- ⚠️ ${plan.title} plan reference mapping fields might be missing in planService.\n`;
            }
        });
    } else {
        output += `❌ planService.ts not found.\n`;
        passed = false;
    }

    output += `\n## URLs and Configuration\n`;
    output += `- ℹ️ Ensure PUBLIC_APP_URL is not localhost in production.\n`;
    output += `- ℹ️ Ensure Edge function URLs are registered in Iyzico Sandbox (Webhook / Callback).\n\n`;

    output += `## Summary\n`;
    if (passed) {
        output += `✅ Readiness check passed. See setup guides to continue.\n`;
    } else {
        output += `❌ Readiness check failed. Please resolve the missing configurations.\n`;
    }

    const reportDir = path.join(rootDir, 'qa-reports');
    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir);
    }
    
    fs.writeFileSync(path.join(reportDir, 'SANDBOX_READINESS_REPORT.md'), output);
    console.log(`Report written to qa-reports/SANDBOX_READINESS_REPORT.md`);
    if (!passed) {
        console.error("Sandbox readiness check failed.");
        process.exit(1);
    }
};

main();
