import fs from 'fs';
import path from 'path';

const SCRIPT_NAME = 'verify-sales-funnel-logic';

function assert(condition, message) {
    if (!condition) {
        console.error(`\x1b[31m[${SCRIPT_NAME}] FAILED: ${message}\x1b[0m`);
        process.exit(1);
    }
}

try {
    const projectRoot = process.cwd();

    const strategyPath = path.join(projectRoot, 'docs', 'PUBLIC_SALES_FUNNEL_STRATEGY.md');
    assert(fs.existsSync(strategyPath), 'PUBLIC_SALES_FUNNEL_STRATEGY.md must exist');

    // Mismatches verification
    const homePath = path.join(projectRoot, 'pages', 'MarketingHomePage.tsx');
    const homeContent = fs.readFileSync(homePath, 'utf8');
    assert(homeContent.includes('/register?planId=professional') || homeContent.includes('/register'), 'Homepage must have primary register CTA');

    const demoPath = path.join(projectRoot, 'pages', 'DemoLandingPage.tsx');
    const demoContent = fs.readFileSync(demoPath, 'utf8');
    assert(demoContent.includes('Bu görünümü gerçek işletme paneline taşımak ister misiniz'), 'DemoLandingPage must have bottom CTA block');

    const pilotAdminPath = path.join(projectRoot, 'pages', 'PilotAdminPreviewPage.tsx');
    const pilotAdminContent = fs.readFileSync(pilotAdminPath, 'utf8');
    assert(pilotAdminContent.includes('Bu paneli kendi işletmeniz için kurabilirsiniz'), 'PilotAdminPreviewPage must have bottom CTA block');

    const pricingPath = path.join(projectRoot, 'pages', 'PricingPage.tsx');
    const pricingContent = fs.readFileSync(pricingPath, 'utf8');
    assert(pricingContent.includes('emin değil misiniz'), 'PricingPage must ask if unsure and provide fallback link');

    console.log(`\x1b[32m[${SCRIPT_NAME}] PASSED: Sales funnel logic rules verified.\x1b[0m`);
} catch (error) {
    console.error(`\x1b[31m[${SCRIPT_NAME}] ERROR: ${error.message}\x1b[0m`);
    process.exit(1);
}
