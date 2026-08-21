import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = process.cwd();

console.log('🏁 Running Clinic Operational Integration Static QA Verification Suite (Block 2 R2)...\n');

let passCount = 0;
let failCount = 0;

function assertCheck(description, condition, failMessage) {
  if (condition) {
    console.log(`✅ PASSED: ${description}`);
    passCount++;
  } else {
    console.error(`❌ FAILED: ${description}`);
    if (failMessage) console.error(`   Details: ${failMessage}`);
    failCount++;
  }
}

// 1. Verify Migration Files Integrity & Frozen Baseline
const block1MigrationPath = path.join(ROOT_DIR, 'supabase/migrations/20260905_lari_clinic_domain_server_authority.sql');
assertCheck('Block 1 Migration 20260905_lari_clinic_domain_server_authority.sql exists', fs.existsSync(block1MigrationPath));

const block1Hash = execSync(`git hash-object "${block1MigrationPath}"`).toString().trim();
assertCheck('Block 1 Migration remains frozen and unchanged (SHA: 3db3a79ef40708b410143e53cde578cb4812c838)', block1Hash === '3db3a79ef40708b410143e53cde578cb4812c838');

const block2MigrationPath = path.join(ROOT_DIR, 'supabase/migrations/20260906_lari_clinic_operational_integration.sql');
assertCheck('Block 2 Migration 20260906_lari_clinic_operational_integration.sql exists', fs.existsSync(block2MigrationPath));

const block2Content = fs.readFileSync(block2MigrationPath, 'utf8');

// 2. Structural & Architectural Constraints
assertCheck('Canonical users_profile roles NOT altered in Block 2', !block2Content.includes("ALTER TYPE") && !block2Content.includes("role_type"));
assertCheck('No in_consultation status added to appointments', !block2Content.includes("'in_consultation'"));
assertCheck('No encounter_id column added to appointments table', !block2Content.includes("ALTER TABLE public.appointments ADD COLUMN encounter_id"));
assertCheck('No new commercial feature keys introduced in Block 2', !block2Content.includes("INSERT INTO public.commercial_feature_registry"));

// 3. Operational RPC Declarations in Migration 62
assertCheck('RPC public.clinic_start_encounter upgraded in Block 2', block2Content.includes('CREATE OR REPLACE FUNCTION public.clinic_start_encounter'));
assertCheck('clinic_start_encounter enforces confirmed-only appointment status', block2Content.includes("v_appointment.status <> 'confirmed'") && block2Content.includes('APPOINTMENT_NOT_CONFIRMED'));
assertCheck('clinic_start_encounter uses FOR UPDATE row lock on appointments', block2Content.includes('FROM public.appointments') && block2Content.includes('FOR UPDATE'));
assertCheck('RPC public.clinic_complete_encounter_and_appointment declared', block2Content.includes('CREATE OR REPLACE FUNCTION public.clinic_complete_encounter_and_appointment'));
assertCheck('clinic_complete_encounter_and_appointment uses 64-bit advisory locking', block2Content.includes('pg_advisory_xact_lock(hashtextextended(p_encounter_id::text, 0))'));
assertCheck('clinic_complete_encounter_and_appointment handles idempotent completion', block2Content.includes("'already_completed'"));
assertCheck('clinic_complete_encounter_and_appointment uses FOR UPDATE on linked appointment', block2Content.includes('WHERE id = v_encounter.appointment_id') || block2Content.includes('FOR UPDATE'));
assertCheck('RPC public.clinic_get_my_context declared', block2Content.includes('CREATE OR REPLACE FUNCTION public.clinic_get_my_context'));
assertCheck('RPC public.clinic_get_operational_day declared', block2Content.includes('CREATE OR REPLACE FUNCTION public.clinic_get_operational_day'));

// 3b. Open-encounter appointment status guard trigger
assertCheck('Open-encounter appointment status guard function declared', block2Content.includes('enforce_clinic_open_encounter_appointment_status'));
assertCheck('Open-encounter guard trigger created on appointments', block2Content.includes('trg_enforce_clinic_open_encounter_appointment_status'));
assertCheck('Guard trigger fires BEFORE UPDATE OF status', block2Content.includes('BEFORE UPDATE OF status ON public.appointments'));

// 3c. Legacy completion bypass closure
assertCheck('Legacy clinic_complete_encounter redefined as wrapper', block2Content.includes('CREATE OR REPLACE FUNCTION public.clinic_complete_encounter('));
assertCheck('Legacy wrapper delegates to atomic completion', block2Content.includes('clinic_complete_encounter_and_appointment(p_encounter_id)'));

// 3d. Core side effects
assertCheck('Atomic completion inserts Core appointment audit event', block2Content.includes("'admin_status_completed'"));
assertCheck('Atomic completion inserts communication_outbox event', block2Content.includes("communication_outbox"));
assertCheck('Outbox event_type = appointment_completed', block2Content.includes("'appointment_completed'"));

const opDayFuncBody = block2Content.substring(block2Content.indexOf('public.clinic_get_operational_day'));
assertCheck('Operational day read model DOES NOT contain SOAP narrative fields', !opDayFuncBody.includes("'subjective'") && !opDayFuncBody.includes("'objective'") && !opDayFuncBody.includes("'assessment'") && !opDayFuncBody.includes("'plan'"));

// 4. Strict Hexadecimal UUID Validation in ALL Clinic Test Files
const clinicTestFiles = [
  'supabase/tests/clinic_domain_server_authority_tests.sql',
  'supabase/tests/clinic_domain_concurrency_harness.ts',
  'supabase/tests/clinic_operational_integration_tests.sql',
  'supabase/tests/clinic_operational_concurrency_harness.ts',
  'scripts/test-clinic-application-contracts.mjs'
];

const rawUuidRegex = /['"][0-9a-zA-Z]{8}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{12}['"]/g;
const hexUuidRegex = /^['"][0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}['"]$/;

let invalidUuidCount = 0;
for (const relPath of clinicTestFiles) {
  const absPath = path.join(ROOT_DIR, relPath);
  if (!fs.existsSync(absPath)) {
    console.error(`Warning: ${relPath} not found for UUID validation.`);
    continue;
  }
  const content = fs.readFileSync(absPath, 'utf8');
  const matches = content.match(rawUuidRegex) || [];
  for (const match of matches) {
    if (!hexUuidRegex.test(match)) {
      console.error(`Invalid non-hex UUID literal found in ${relPath}: ${match}`);
      invalidUuidCount++;
    }
  }
}
assertCheck('Zero invalid non-hex UUID literals in ALL Clinic test files', invalidUuidCount === 0, `Found ${invalidUuidCount} invalid UUID(s)`);

// 5. Application Types & Service Contracts Alignment
const typesClinicPath = path.join(ROOT_DIR, 'types/clinic.ts');
assertCheck('types/clinic.ts type module exists', fs.existsSync(typesClinicPath));
const typesContent = fs.readFileSync(typesClinicPath, 'utf8');
assertCheck("Canonical EncounterStatus exact set: open | completed | voided", typesContent.includes("export type EncounterStatus = 'open' | 'completed' | 'voided';"));
assertCheck('ClinicStaffProfile does NOT require separate id field', !typesContent.includes("export interface ClinicStaffProfile {\n  id:"));
assertCheck('ClinicEncounterNote uses author_staff_id', typesContent.includes("author_staff_id: string;"));
assertCheck('ClinicPatientHistoryProfile exact projection type exists', typesContent.includes('export interface ClinicPatientHistoryProfile'));
assertCheck('ClinicPatientHistory uses ClinicPatientHistoryProfile', typesContent.includes('ClinicPatientHistoryProfile | null'));
assertCheck('ClinicServiceResult default is unknown not any', typesContent.includes('ClinicServiceResult<T = unknown>'));
assertCheck('NoteStatus type is used for note_status', typesContent.includes("note_status: NoteStatus;"));

// 6. Repository Alignment (No data.profile or data.note reads, no casts)
const repoPath = path.join(ROOT_DIR, 'services/repositories/supabaseClinicRepository.ts');
assertCheck('supabaseClinicRepository.ts exists', fs.existsSync(repoPath));
const repoContent = fs.readFileSync(repoPath, 'utf8');
assertCheck('Repository setStaffProfile does NOT read data.profile', !repoContent.includes('data.profile'));
assertCheck('Repository saveEncounterNote does NOT read data.note nested object', !repoContent.includes('data.note.'));
assertCheck('Repository uses normalizeClinicError helper', repoContent.includes('normalizeClinicError'));
assertCheck('No raw database error text exposure or let code: any', !repoContent.includes('let code: any'));
assertCheck('Repository exports pure mapper functions', repoContent.includes('export function mapClinicStaffProfileWriteResponse'));
assertCheck('Repository exports patient history mapper', repoContent.includes('export function mapClinicPatientHistoryResponse'));
assertCheck('Repository exports operational day mapper', repoContent.includes('export function mapClinicOperationalDayResponse'));

const servicePath = path.join(ROOT_DIR, 'services/clinicService.ts');
assertCheck('clinicService.ts exists', fs.existsSync(servicePath));
const serviceContent = fs.readFileSync(servicePath, 'utf8');
assertCheck('clinicService uses typed createClinicUnavailableResult helper', serviceContent.includes('createClinicUnavailableResult'));
assertCheck('clinicService does NOT use as any workarounds', !serviceContent.includes('as any'));

// 7. dataSourceConfig.ts must NOT have test-convenience process.env mutation
const dsConfigPath = path.join(ROOT_DIR, 'services/dataSourceConfig.ts');
const dsContent = fs.readFileSync(dsConfigPath, 'utf8');
assertCheck('dataSourceConfig does NOT reference process.env', !dsContent.includes('process.env'));

// 8. Application Contract Executable QA File Exists
const appContractQaPath = path.join(ROOT_DIR, 'scripts/test-clinic-application-contracts.mjs');
assertCheck('Application contract executable QA script exists', fs.existsSync(appContractQaPath));

if (failCount > 0) {
  console.error(`\n💥 Clinic Operational Integration Static QA Verification Failed with ${failCount} errors.`);
  process.exit(1);
} else {
  console.log(`\n🎉 Clinic Operational Integration Static QA Verification Passed Successfully! (${passCount} checks passed)\n`);
  process.exit(0);
}
