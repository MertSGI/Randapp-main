import fs from 'fs';
import path from 'path';

const APP_DIR = path.join(process.cwd(), 'app', 'applet');
const SCRIPT_NAME = 'verify-route-link-integrity';

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

    // Check PilotAdminPreviewPage
    const pilotAdminPath = path.join(projectRoot, 'pages', 'PilotAdminPreviewPage.tsx');
    const pilotAdminContent = fs.readFileSync(pilotAdminPath, 'utf8');
    assert(pilotAdminContent.includes('navigate(\'/pilot/customer\')'), 'PilotAdminPreviewPage must link to /pilot/customer');
    assert(pilotAdminContent.includes('navigate(\'/demo\')'), 'PilotAdminPreviewPage must link to /demo');
    assert(pilotAdminContent.includes('navigate(\'/register\')') || pilotAdminContent.includes('navigate(\'/register?planId='), 'PilotAdminPreviewPage must link to /register');
    assert(!pilotAdminContent.includes('navigate(\'/admin\')'), 'PilotAdminPreviewPage must NOT link directly to /admin protected content');

    // Check PilotDemoEntryPage
    const pilotEntryPath = path.join(projectRoot, 'pages', 'PilotDemoEntryPage.tsx');
    const pilotEntryContent = fs.readFileSync(pilotEntryPath, 'utf8');
    assert(pilotEntryContent.includes('openInNewTab(\'/pilot/customer\')') || pilotEntryContent.includes('navigate(\'/pilot/customer\')'), 'PilotDemoEntryPage must link to /pilot/customer');
    assert(pilotEntryContent.includes('openInNewTab(\'/pilot/admin\')') || pilotEntryContent.includes('navigate(\'/pilot/admin\')'), 'PilotDemoEntryPage must link to /pilot/admin');
    
    console.log(`\x1b[32m[${SCRIPT_NAME}] PASSED: Route integrity verified.\x1b[0m`);
} catch (error) {
    console.error(`\x1b[31m[${SCRIPT_NAME}] ERROR:\x1b[0m`, error.message);
    process.exit(1);
}
