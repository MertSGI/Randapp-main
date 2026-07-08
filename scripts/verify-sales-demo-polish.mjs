import fs from 'fs';
import path from 'path';

const APP_DIR = path.join(process.cwd(), 'app', 'applet');
const SCRIPT_NAME = 'verify-sales-demo-polish';

function assert(condition, message) {
    if (!condition) {
        console.error(`\x1b[31m[${SCRIPT_NAME}] FAILED: ${message}\x1b[0m`);
        process.exit(1);
    }
}

try {
    const cwdFiles = fs.readdirSync(process.cwd());
    const isRoot = cwdFiles.includes('package.json');
    const projectRoot = isRoot ? process.cwd() : process.cwd(); 

    // Check PilotDemoEntryPage
    const pilotEntryPath = path.join(projectRoot, 'pages', 'PilotDemoEntryPage.tsx');
    const pilotEntryContent = fs.readFileSync(pilotEntryPath, 'utf8');
    assert(pilotEntryContent.includes('Müşteri deneyimini incele'), 'PilotDemoEntryPage must use "Müşteri deneyimini incele"');
    assert(pilotEntryContent.includes('İşletme panelini incele'), 'PilotDemoEntryPage must use "İşletme panelini incele"');
    assert(!pilotEntryContent.includes('Randevu Akışını Dene'), 'PilotDemoEntryPage must NOT use "Randevu Akışını Dene"');
    assert(!pilotEntryContent.includes('Salon Sahibi Panelini Gör'), 'PilotDemoEntryPage must NOT use "Salon Sahibi Panelini Gör"');

    // Check DemoLandingPage
    const demoLandingPath = path.join(projectRoot, 'pages', 'DemoLandingPage.tsx');
    const demoLandingContent = fs.readFileSync(demoLandingPath, 'utf8');
    assert(demoLandingContent.includes('navigate(\'/pilot\')'), 'DemoLandingPage must have link back to /pilot');
    
    // Check SalonWebsiteView
    const salonViewPath = path.join(projectRoot, 'components', 'SalonWebsiteView.tsx');
    const salonViewContent = fs.readFileSync(salonViewPath, 'utf8');
    assert(salonViewContent.includes('hidden sm:block'), 'SalonWebsiteView must hide hero CTA on mobile');

    console.log(`\x1b[32m[${SCRIPT_NAME}] PASSED: Sales demo routes polished.\x1b[0m`);
} catch (error) {
    console.error(`\x1b[31m[${SCRIPT_NAME}] ERROR:\x1b[0m`, error.message);
    process.exit(1);
}
