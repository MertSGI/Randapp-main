import fs from 'fs';
import path from 'path';

const APP_DIR = path.join(process.cwd(), 'app', 'applet');
const SCRIPT_NAME = 'verify-demo-data-quality';

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

    const pilotDemoServicePath = path.join(projectRoot, 'services', 'pilotDemoService.ts');
    const pilotDemoServiceContent = fs.readFileSync(pilotDemoServicePath, 'utf8');
    
    const adminPreviewPath = path.join(projectRoot, 'pages', 'PilotAdminPreviewPage.tsx');
    const adminPreviewContent = fs.readFileSync(adminPreviewPath, 'utf8');

    const bookingPagePath = path.join(projectRoot, 'pages', 'BookingPage.tsx');
    const bookingPageContent = fs.readFileSync(bookingPagePath, 'utf8');

    // Counts check (rudimentary via matching)
    const servicesCount = (pilotDemoServiceContent.match(/id: 'srv_/g) || []).length;
    const staffCount = (pilotDemoServiceContent.match(/id: 'stf_/g) || []).length;
    const customersCount = (pilotDemoServiceContent.match(/id: 'cus_/g) || []).length;
    const appointmentsCount = (pilotDemoServiceContent.match(/id: 'app_/g) || []).length;
    const galleryCount = (pilotDemoServiceContent.match(/createSVGPlaceholder/g) || []).length;

    assert(servicesCount >= 5, `Must have at least 5 services in demo, found ${servicesCount}`);
    assert(staffCount >= 3, `Must have at least 3 staff in demo, found ${staffCount}`);
    assert(customersCount >= 6, `Must have at least 6 customers in demo, found ${customersCount}`);
    assert(appointmentsCount >= 8, `Must have at least 8 appointments in demo, found ${appointmentsCount}`);
    assert(galleryCount >= 5, `Must have at least 5 gallery/cover visuals in demo, found ${galleryCount}`);

    // Verify contact / location existence
    assert(pilotDemoServiceContent.includes('contact_phone'), 'Demo data must have contact_phone');
    assert(pilotDemoServiceContent.includes('city') && pilotDemoServiceContent.includes('district'), 'Demo data must have city and district');

    // Appointment status checks
    assert(pilotDemoServiceContent.includes('status: \'cancelled\''), 'Demo data must have cancelled appointment example');
    assert(pilotDemoServiceContent.includes('status: \'no_show\''), 'Demo data must have no show appointment example');

    // Verify campaigns and referrals are in demo data
    assert(pilotDemoServiceContent.includes('camp_demo'), 'Demo data must have campaign demo data');
    assert(pilotDemoServiceContent.includes('cref_'), 'Demo data must have referral demo data');

    // Verify source tracking exists
    assert(pilotDemoServiceContent.includes('source: \'whatsapp\''), 'Demo must have whatsapp source example');
    assert(pilotDemoServiceContent.includes('source: \'instagram\''), 'Demo must have instagram source example');

    // Ensure session isolation logic is untouched
    assert(!pilotDemoServiceContent.includes('localStorage.setItem(\'lari_active_owner_session\', JSON.stringify({ ...PILOT_USER, role: \'admin\' }))'), 'Pilot demo must NOT elevate to admin');
    
    // Ensure no dirty demo data words
    assert(!adminPreviewContent.toLowerCase().includes('kredi kartı gerekmez'), 'Admin preview must not show no card messages');
    
    console.log(`\x1b[32m[${SCRIPT_NAME}] PASSED: Demo dataset quality and variety verified successfully.\x1b[0m`);
} catch (error) {
    if (error.code === 'ENOENT') {
        console.error(`\x1b[31m[${SCRIPT_NAME}] FAILED: Could not find required service files at ${error.path}\x1b[0m`);
    } else {
        console.error(`\x1b[31m[${SCRIPT_NAME}] ERROR:\x1b[0m`, error.message);
    }
    process.exit(1);
}
