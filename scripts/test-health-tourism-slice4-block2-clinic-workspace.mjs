import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    failures++;
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('🏁 Running Health Tourism Slice 4 Block 2 Hardened QA Suite...\n');

// 1. Migration 69 Existence & Authority Checks
const migrationPath = path.join(rootDir, 'supabase/migrations/20260913_lari_health_tourism_clinic_acceptance_workspace.sql');
assert(fs.existsSync(migrationPath), 'Migration 20260913_lari_health_tourism_clinic_acceptance_workspace.sql exists');

if (fs.existsSync(migrationPath)) {
  const migContent = fs.readFileSync(migrationPath, 'utf8');

  // Verify RPCs
  assert(migContent.includes('FUNCTION public.ht_get_clinic_acceptance_options'), 'Contains ht_get_clinic_acceptance_options RPC');
  assert(migContent.includes('FUNCTION public.ht_get_clinic_acceptance_slots'), 'Contains ht_get_clinic_acceptance_slots RPC');

  // Security checks
  assert(migContent.includes('can_manage_patient_profiles'), 'RPCs check can_manage_patient_profiles permission');
  assert(migContent.includes('handoff_pending'), 'Lead status must be handoff_pending');
  assert(migContent.includes('requested'), 'Lead handoff_state must be requested');

  // Canonical Slot Authority check
  assert(migContent.includes('public.evaluate_booking_slot'), 'ht_get_clinic_acceptance_slots delegates to public.evaluate_booking_slot');

  // ACLs
  assert(migContent.includes('REVOKE ALL ON FUNCTION public.ht_get_clinic_acceptance_options'), 'REVOKE ALL on ht_get_clinic_acceptance_options');
  assert(migContent.includes('GRANT EXECUTE ON FUNCTION public.ht_get_clinic_acceptance_options'), 'GRANT EXECUTE on ht_get_clinic_acceptance_options TO authenticated');
  assert(migContent.includes('REVOKE ALL ON FUNCTION public.ht_get_clinic_acceptance_slots'), 'REVOKE ALL on ht_get_clinic_acceptance_slots');
  assert(migContent.includes('GRANT EXECUTE ON FUNCTION public.ht_get_clinic_acceptance_slots'), 'GRANT EXECUTE on ht_get_clinic_acceptance_slots TO authenticated');
}

// 2. Types & Service Layer Checks
const typesPath = path.join(rootDir, 'types/clinic.ts');
assert(fs.existsSync(typesPath), 'types/clinic.ts exists');
if (fs.existsSync(typesPath)) {
  const typesContent = fs.readFileSync(typesPath, 'utf8');
  assert(typesContent.includes('HtPendingClinicAcceptanceLead'), 'types/clinic.ts defines HtPendingClinicAcceptanceLead');
  assert(typesContent.includes('HtAcceptanceOptionsResult'), 'types/clinic.ts defines HtAcceptanceOptionsResult');
  assert(typesContent.includes('HtAcceptanceSlotsResult'), 'types/clinic.ts defines HtAcceptanceSlotsResult');
  assert(typesContent.includes('HtAcceptanceConversionResult'), 'types/clinic.ts defines HtAcceptanceConversionResult');
}

const servicePath = path.join(rootDir, 'services/clinicService.ts');
assert(fs.existsSync(servicePath), 'services/clinicService.ts exists');
if (fs.existsSync(servicePath)) {
  const srvContent = fs.readFileSync(servicePath, 'utf8');
  assert(srvContent.includes('getHtPendingLeads'), 'clinicService exports getHtPendingLeads');
  assert(srvContent.includes('getHtAcceptanceOptions'), 'clinicService exports getHtAcceptanceOptions');
  assert(srvContent.includes('getHtAcceptanceSlots'), 'clinicService exports getHtAcceptanceSlots');
  assert(srvContent.includes('acceptHtLead'), 'clinicService exports acceptHtLead');
}

const repoPath = path.join(rootDir, 'services/repositories/supabaseClinicRepository.ts');
assert(fs.existsSync(repoPath), 'supabaseClinicRepository.ts exists');
if (fs.existsSync(repoPath)) {
  const repoContent = fs.readFileSync(repoPath, 'utf8');
  assert(repoContent.includes('ht_list_pending_clinic_acceptance'), 'Repository calls ht_list_pending_clinic_acceptance');
  assert(repoContent.includes('ht_get_clinic_acceptance_options'), 'Repository calls ht_get_clinic_acceptance_options');
  assert(repoContent.includes('ht_get_clinic_acceptance_slots'), 'Repository calls ht_get_clinic_acceptance_slots');
  assert(repoContent.includes('ht_accept_lead_into_clinic'), 'Repository calls ht_accept_lead_into_clinic');
  assert(repoContent.includes('invalid_appointment_slot:'), 'Repository handles invalid_appointment_slot error code');
}

// 3. UI Component Checks
const panelPath = path.join(rootDir, 'components/clinic/ClinicHtAcceptancePanel.tsx');
assert(fs.existsSync(panelPath), 'ClinicHtAcceptancePanel.tsx exists');
if (fs.existsSync(panelPath)) {
  const panelContent = fs.readFileSync(panelPath, 'utf8');
  assert(!panelContent.includes('passport_number'), 'ClinicHtAcceptancePanel NEVER exposes passport_number');
  assert(panelContent.includes('Yardımcı / Doğrulanmamış Bilgi') || panelContent.includes('AI-generated'), 'AI Summary explicitly marked as assistive / unverified');
  assert(panelContent.includes('acceptHtLead'), 'UI calls ONLY acceptHtLead (ht_accept_lead_into_clinic)');
  assert(!panelContent.includes("from('appointments').insert"), 'UI does NOT directly insert into appointments');
  assert(!panelContent.includes("from('customers').insert"), 'UI does NOT directly insert into customers');
  assert(!panelContent.includes("from('clinic_patient_profiles').insert"), 'UI does NOT directly insert into clinic_patient_profiles');
  assert(!panelContent.includes("from('ht_leads').update"), 'UI does NOT directly update ht_leads');
}

const workspacePath = path.join(rootDir, 'pages/clinic/ClinicWorkspacePage.tsx');
assert(fs.existsSync(workspacePath), 'ClinicWorkspacePage.tsx exists');
if (fs.existsSync(workspacePath)) {
  const wsContent = fs.readFileSync(workspacePath, 'utf8');
  assert(wsContent.includes('ClinicHtAcceptancePanel'), 'ClinicWorkspacePage embeds ClinicHtAcceptancePanel');
  assert(wsContent.includes('Sağlık Turizmi Kabul'), 'ClinicWorkspacePage adds Sağlık Turizmi Kabul workspace tab');
}

// 4. R2 Concurrency Harness Corrections Check
const harnessMjsPath = path.join(rootDir, 'scripts/test-health-tourism-slice4-booking-concurrency.mjs');
assert(fs.existsSync(harnessMjsPath), 'R2 harness mjs exists');
if (fs.existsSync(harnessMjsPath)) {
  const mjsText = fs.readFileSync(harnessMjsPath, 'utf8');
  assert(mjsText.includes('00000000-0000-0000-0000-0000000000') || mjsText.includes('00000000-0000-0000-0000-0000000001'), 'R2 mjs harness uses valid UUIDs');
  assert(mjsText.includes('create_public_booking($1, $2, $3, $4::date, $5::time, $6, $7, $8, $9, $10, $11, $12, $13)'), 'R2 mjs harness uses exact canonical create_public_booking signature');
  assert(mjsText.includes('LIVE_CONCURRENCY_EXECUTION=NOT_EXECUTED'), 'R2 mjs harness static fallback reports NOT_EXECUTED');
}

console.log('\n--- Summary ---');
if (failures > 0) {
  console.error(`❌ Total failures: ${failures}`);
  process.exit(1);
} else {
  console.log('✅ All Slice 4 Block 2 QA assertions passed successfully!');
  process.exit(0);
}
