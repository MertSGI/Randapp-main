import fs from 'fs';
import path from 'path';

const SCRIPT_NAME = 'verify-sales-funnel-navigation';

function assert(condition, message) {
    if (!condition) {
        console.error(`\x1b[31m[${SCRIPT_NAME}] FAILED: ${message}\x1b[0m`);
        process.exit(1);
    }
}

try {
    const projectRoot = process.cwd();

    // 1. MarketingHomePage
    const homePath = path.join(projectRoot, 'pages', 'MarketingHomePage.tsx');
    const homeContent = fs.readFileSync(homePath, 'utf8');
    assert(homeContent.includes('to="/pricing"') || homeContent.includes('navigate(\'/pricing\')'), 'MarketingHomePage must link to /pricing');
    assert(homeContent.includes('to="/demo"') || homeContent.includes('navigate(\'/demo\')'), 'MarketingHomePage must link to /demo');
    assert(homeContent.includes('to="/pilot"') || homeContent.includes('navigate(\'/pilot\')'), 'MarketingHomePage must link to /pilot');
    assert(homeContent.includes('to="/features"') || homeContent.includes('navigate(\'/features\')'), 'MarketingHomePage must link to /features');

    // 2. FeaturesPage
    const featuresPath = path.join(projectRoot, 'pages', 'FeaturesPage.tsx');
    const featuresContent = fs.readFileSync(featuresPath, 'utf8');
    assert(featuresContent.includes('/register'), 'FeaturesPage must link to /register');
    assert(featuresContent.includes('to="/pilot"') || featuresContent.includes('navigate(\'/pilot\')'), 'FeaturesPage must link to /pilot');
    assert(featuresContent.includes('to="/demo"') || featuresContent.includes('navigate(\'/demo\')'), 'FeaturesPage must link to /demo');

    // 3. PricingPage
    const pricingPath = path.join(projectRoot, 'pages', 'PricingPage.tsx');
    const pricingContent = fs.readFileSync(pricingPath, 'utf8');
    assert(pricingContent.includes('to="/contact"') || pricingContent.includes('navigate(\'/contact\')'), 'PricingPage must link to /contact');
    assert(pricingContent.includes('to="/pilot"') || pricingContent.includes('navigate(\'/pilot\')'), 'PricingPage must link to /pilot');
    assert(pricingContent.includes('to="/demo"') || pricingContent.includes('navigate(\'/demo\')'), 'PricingPage must link to /demo');

    // 4. MobileAppPage
    const mobilePath = path.join(projectRoot, 'pages', 'MobileAppPage.tsx');
    const mobileContent = fs.readFileSync(mobilePath, 'utf8');
    assert(mobileContent.includes('/register'), 'MobileAppPage must link to /register');
    assert(mobileContent.includes('to="/pilot/customer"') || mobileContent.includes('navigate(\'/pilot/customer\')'), 'MobileAppPage must link to /pilot/customer');
    assert(mobileContent.includes('to="/pilot/admin"') || mobileContent.includes('navigate(\'/pilot/admin\')'), 'MobileAppPage must link to /pilot/admin');
    assert(mobileContent.includes('to="/demo"') || mobileContent.includes('navigate(\'/demo\')'), 'MobileAppPage must link to /demo');

    // 5. PilotDemoEntryPage
    const pilotEntryPath = path.join(projectRoot, 'pages', 'PilotDemoEntryPage.tsx');
    const pilotEntryContent = fs.readFileSync(pilotEntryPath, 'utf8');
    assert(pilotEntryContent.includes('/pilot/customer'), 'PilotDemoEntryPage must link to /pilot/customer');
    assert(pilotEntryContent.includes('/pilot/admin') || pilotEntryContent.includes('handleStartOwnerDemo'), 'PilotDemoEntryPage must link to /pilot/admin');
    assert(pilotEntryContent.includes('/demo'), 'PilotDemoEntryPage must link to /demo');
    assert(pilotEntryContent.includes('/register'), 'PilotDemoEntryPage must link to /register');

    // 6. RegistrationPage
    const registerPath = path.join(projectRoot, 'pages', 'RegistrationPage.tsx');
    const registerContent = fs.readFileSync(registerPath, 'utf8');
    assert(registerContent.includes('to="/login"') || registerContent.includes('navigate(\'/login\')'), 'RegistrationPage must link to /login');
    assert(registerContent.includes('to="/pricing"') || registerContent.includes('navigate(\'/pricing\')'), 'RegistrationPage must link to /pricing');

    console.log(`\x1b[32m[${SCRIPT_NAME}] PASSED: Sales funnel navigation fully verified.\x1b[0m`);
} catch (error) {
    if (error.code === 'ENOENT') {
        console.error(`\x1b[31m[${SCRIPT_NAME}] ERROR: File not found: ${error.message}\x1b[0m`);
    } else {
        console.error(`\x1b[31m[${SCRIPT_NAME}] ERROR: ${error.message}\x1b[0m`);
    }
    process.exit(1);
}
