import fs from 'fs';
import path from 'path';

let passCount = 0;
let failCount = 0;

const assert = (condition, message) => {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failCount++;
  }
};

console.log('🔍 Starting QA: Booking & Customer Consistency...');

const cwd = process.cwd();

const typesPath = path.join(cwd, 'services', 'repositories', 'types.ts');
const localRepoPath = path.join(cwd, 'services', 'repositories', 'localBookingRepository.ts');
const supabaseRepoPath = path.join(cwd, 'services', 'repositories', 'supabaseBookingRepository.ts');
const factoryPath = path.join(cwd, 'services', 'repositories', 'index.ts');
const adminCustomerServicePath = path.join(cwd, 'services', 'adminCustomerService.ts');
const appointmentServicePath = path.join(cwd, 'services', 'appointmentService.ts');

const typesContent = fs.readFileSync(typesPath, 'utf8');
const localRepoContent = fs.readFileSync(localRepoPath, 'utf8');
const supabaseRepoContent = fs.readFileSync(supabaseRepoPath, 'utf8');
const factoryContent = fs.readFileSync(factoryPath, 'utf8');
const adminCustomerServiceContent = fs.readFileSync(adminCustomerServicePath, 'utf8');
const appointmentServiceContent = fs.readFileSync(appointmentServicePath, 'utf8');

// 1. Contract
assert(typesContent.includes('export interface BookingRepository'), 'BookingRepository interface must exist');
assert(typesContent.includes('createAppointment('), 'BookingRepository must have createAppointment');
assert(typesContent.includes('listAppointments('), 'BookingRepository must have listAppointments');
assert(typesContent.includes('findCustomerByPhoneOrEmail('), 'BookingRepository must have findCustomerByPhoneOrEmail');

// 2. Local Implementation
assert(localRepoContent.includes('class LocalBookingRepository implements BookingRepository'), 'Local repo exists');
assert(localRepoContent.includes('localStorage.getItem(') || localRepoContent.includes('dataProvider.getList'), 'Local repo uses storage');
assert(localRepoContent.includes('deriveCustomerFromAppointment'), 'Local repo auto-derives customers from appointments');
assert(localRepoContent.includes('appointments_seeded'), 'Local repo handles appointments seeding');

// 3. Supabase Stub
assert(supabaseRepoContent.includes('class SupabaseBookingRepository implements BookingRepository'), 'Supabase stub exists');
assert(supabaseRepoContent.includes('/rest/v1/appointments'), 'Supabase stub references appointments table');
assert(supabaseRepoContent.includes('/rest/v1/customers'), 'Supabase stub references customers table');

// 4. Factory 
assert(factoryContent.includes('getBookingRepository'), 'Factory exports getBookingRepository');

// 5. Booking / Appointment Service integration
assert(appointmentServiceContent.includes('getBookingRepository()'), 'appointmentService uses getBookingRepository()');
assert(!appointmentServiceContent.includes('supabase.from('), 'appointmentService should not use raw supabase anymore');

// 6. Admin Customer Service integration
assert(adminCustomerServiceContent.includes('getBookingRepository().listCustomers('), 'adminCustomerService uses getBookingRepository() for listCustomers');
assert(adminCustomerServiceContent.includes('getBookingRepository().addCustomerNote('), 'adminCustomerService uses getBookingRepository() for addCustomerNote');
assert(!adminCustomerServiceContent.includes('localStorage.getItem'), 'adminCustomerService should not directly use localStorage anymore');

if (failCount > 0) {
  console.log(`\n⚠️ QA complete with ${failCount} failures.`);
  process.exit(1);
} else {
  console.log('\n🎉 All Booking/Customer QA checks passed successfully.');
  process.exit(0);
}
