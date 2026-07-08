import fs from 'fs';
import path from 'path';

const APP_DIR = path.join(process.cwd(), 'app', 'applet');
const SCRIPT_NAME = 'verify-pilot-admin-preview';

function assert(condition, message) {
    if (!condition) {
        console.error(`\x1b[31m[${SCRIPT_NAME}] FAILED: ${message}\x1b[0m`);
        process.exit(1);
    }
}

try {
    const cwdFiles = fs.readdirSync(process.cwd());
    const isRoot = cwdFiles.includes('package.json') && cwdFiles.includes('src') || cwdFiles.includes('app');
    const projectRoot = isRoot ? process.cwd() : process.cwd(); // Assume we are in right dir or adjust

    const pilotPreviewPath = path.join(projectRoot, 'pages', 'PilotAdminPreviewPage.tsx');
    assert(fs.existsSync(pilotPreviewPath), 'PilotAdminPreviewPage.tsx must exist');

    const appPath = path.join(projectRoot, 'App.tsx');
    const appContent = fs.readFileSync(appPath, 'utf8');
    assert(appContent.includes('path="/pilot/admin"'), 'App.tsx must define /pilot/admin route');
    assert(appContent.includes('PilotAdminPreviewPage'), 'App.tsx must import and use PilotAdminPreviewPage');

    const pilotEntryPath = path.join(projectRoot, 'pages', 'PilotDemoEntryPage.tsx');
    const pilotEntryContent = fs.readFileSync(pilotEntryPath, 'utf8');
    assert(pilotEntryContent.includes("openInNewTab('/pilot/admin')"), 'PilotDemoEntryPage must open /pilot/admin');
    assert(!pilotEntryContent.includes("pilotDemoService.startPilotOwnerDemoSession()"), 'PilotDemoEntryPage must NOT call startPilotOwnerDemoSession() in handleStartOwnerDemo directly');

    console.log(`\x1b[32m[${SCRIPT_NAME}] PASSED: Pilot Admin Preview configured correctly.\x1b[0m`);
} catch (error) {
    console.error(`\x1b[31m[${SCRIPT_NAME}] ERROR:\x1b[0m`, error.message);
    process.exit(1);
}
