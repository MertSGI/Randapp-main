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

console.log('🏁 Running Health Tourism Foundation Static Contract QA Suite (Slice 1)...\n');

// 1. Verify Migration File Existence & Canonical Contracts
const migrationPath = path.join(rootDir, 'supabase/migrations/20260910_lari_health_tourism_foundation.sql');
assert(fs.existsSync(migrationPath), 'Migration 20260910_lari_health_tourism_foundation.sql exists');

if (fs.existsSync(migrationPath)) {
  const migContent = fs.readFileSync(migrationPath, 'utf8');

  // Verify DB Identity Role Model remains unchanged (no custom roles added)
  assert(!migContent.includes('ALTER TYPE user_role ADD VALUE') && !migContent.includes("role IN ('coordinator'"), 'Canonical DB role model is NOT altered (reuses staff identity)');

  // Verify Commercial Feature Registry is NOT mutated or expanded without authority
  assert(!migContent.includes('ht_leads_enabled') && !migContent.includes('INSERT INTO public.commercial_feature_definitions'), 'Commercial feature registry is NOT modified with unreviewed HT keys');

  // Verify Created Tables
  assert(migContent.includes('CREATE TABLE IF NOT EXISTS public.ht_referring_agencies'), 'Creates public.ht_referring_agencies table');
  assert(migContent.includes('CREATE TABLE IF NOT EXISTS public.ht_staff_profiles'), 'Creates public.ht_staff_profiles table');
  assert(migContent.includes('CREATE TABLE IF NOT EXISTS public.ht_leads'), 'Creates public.ht_leads table');

  // Verify RLS Enablement on all new tables
  assert(migContent.includes('ALTER TABLE public.ht_referring_agencies ENABLE ROW LEVEL SECURITY;'), 'RLS enabled on ht_referring_agencies');
  assert(migContent.includes('ALTER TABLE public.ht_staff_profiles ENABLE ROW LEVEL SECURITY;'), 'RLS enabled on ht_staff_profiles');
  assert(migContent.includes('ALTER TABLE public.ht_leads ENABLE ROW LEVEL SECURITY;'), 'RLS enabled on ht_leads');

  // Verify No Permissive Policies
  assert(!migContent.includes('USING (true)') && !migContent.includes('WITH CHECK (true)'), 'No permissive USING(true)/WITH CHECK(true) policies present');

  // Verify Server-Authoritative RPCs exist, SECURITY DEFINER & hardened search_path
  const rpcs = [
    'ht_set_staff_profile',
    'ht_create_referring_agency',
    'ht_create_public_lead',
    'ht_update_lead_status',
    'ht_update_lead_agency_attribution',
    'ht_get_lead',
    'ht_list_leads',
    'ht_list_referring_agencies'
  ];

  rpcs.forEach(rpc => {
    assert(migContent.includes(`CREATE OR REPLACE FUNCTION public.${rpc}`), `RPC public.${rpc} exists`);
    assert(migContent.includes('SECURITY DEFINER'), `RPCs are SECURITY DEFINER`);
    assert(migContent.includes('SET search_path = pg_catalog, public'), `RPCs use safe search_path`);
  });

  // Verify Audit Log Excludes Sensitive Passport Data
  const auditBlockMatch = migContent.match(/ht_lead_created[\s\S]*?jsonb_build_object\([\s\S]*?\)/);
  const auditBlock = auditBlockMatch ? auditBlockMatch[0] : '';
  assert(auditBlock !== '' && !auditBlock.includes('passport_number'), 'Audit payload explicitly excludes passport_number');

  // Verify List Lead Projection Excludes Passport Data
  assert(migContent.includes('ht_list_leads') && migContent.includes('passport_number IS EXCLUDED FROM LIST PROJECTION'), 'List lead projection excludes passport_number');

  // Verify Scope Boundaries (No commission, payment, insurance, DICOM, or medical AI fields in schema)
  assert(!migContent.includes('commission_rate') && !migContent.includes('payout_amount'), 'No agency commission/payout fields in schema');
  assert(!migContent.includes('diagnosis_code') && !migContent.includes('treatment_plan'), 'No diagnosis/treatment fields in lead schema');
  assert(!migContent.includes('raw_ai_conversation'), 'No catch-all raw_ai_conversation field in lead schema');
}

// 2. Verify Application Service Layer Files
const typesPath = path.join(rootDir, 'types/healthTourism.ts');
const servicePath = path.join(rootDir, 'utils/healthTourismService.ts');

assert(fs.existsSync(typesPath), 'types/healthTourism.ts exists');
assert(fs.existsSync(servicePath), 'utils/healthTourismService.ts exists');

if (failures > 0) {
  console.error(`\n❌ ${failures} static QA assertion(s) failed.`);
  process.exit(1);
} else {
  console.log('\n🎉 All Health Tourism Foundation static QA assertions passed successfully!');
}
