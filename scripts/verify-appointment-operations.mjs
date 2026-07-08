import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

let hasErrors = false;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    hasErrors = true;
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('Running Appointment Operations QA Check...\n');

const adminPagePath = path.join(rootDir, 'src/pages/AdminPage.tsx');
const adminPageContent = fs.readFileSync(fs.existsSync(adminPagePath) ? adminPagePath : path.join(rootDir, 'pages/AdminPage.tsx'), 'utf-8');

assert(
  adminPageContent.includes("handleComplete(") && adminPageContent.includes("handleNoShow("),
  "AdminPage must have handleComplete and handleNoShow actions explicitly defined."
);

assert(
  adminPageContent.includes("('completed')") || adminPageContent.includes("status === 'completed'"),
  "AdminPage dashboard stats must explicitly count 'completed' appointments."
);

assert(
  adminPageContent.includes("status === 'confirmed'") && adminPageContent.includes("appointments.filter(a => a.date ==="),
  "AdminPage dashboard stats must track today's confirmed appointments separately."
);

if (hasErrors) {
  console.error('\n❌ Appointment Operations QA check failed. Please fix the above issues.');
  process.exit(1);
} else {
  console.log('\n🎉 Appointment Operations QA passed successfully!');
  process.exit(0);
}
