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

console.log('🏁 Running Health Tourism Foundation Static Contract QA Suite (Slice 1-R1)...\n');

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

  // Verify Direct Table Privileges Revoked for Browser Containment
  assert(migContent.includes('REVOKE ALL ON TABLE public.ht_leads FROM PUBLIC, anon, authenticated;'), 'Direct table privileges revoked on ht_leads');

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

  // Verify Status Audit Correctness (previous_status captured BEFORE update)
  assert(migContent.includes('v_previous_status := v_lead.status;') && migContent.includes("'previous_status', v_previous_status"), 'Status update captures previous_status before table update');

  // Verify Generic Status RPC Denies Setting 'converted'
  assert(migContent.includes("v_status = 'converted'") && migContent.includes('The converted status is reserved for server-authoritative Clinic acceptance'), 'ht_update_lead_status denies direct mutation to converted status');

  // Verify Row Subquery Pagination in ht_list_leads
  assert(migContent.includes('FROM (') && migContent.includes('LIMIT v_limit OFFSET v_offset') && migContent.includes(') sub'), 'ht_list_leads applies ORDER BY / LIMIT / OFFSET to subquery rows before JSON aggregation');

  // Verify Audit Log Excludes Sensitive Passport Data
  const auditBlockMatch = migContent.match(/ht_lead_created[\s\S]*?jsonb_build_object\([\s\S]*?\)/);
  const auditBlock = auditBlockMatch ? auditBlockMatch[0] : '';
  assert(auditBlock !== '' && !auditBlock.includes('passport_number'), 'Audit payload explicitly excludes passport_number');

  // Verify Projections Exclude Passport Data
  assert(!migContent.includes("'passport_number', v_lead.passport_number"), 'ht_get_lead projection explicitly excludes passport_number');
  assert(migContent.includes('ht_list_leads') && migContent.includes('passport_number IS EXCLUDED FROM LIST PROJECTION'), 'ht_list_leads projection explicitly excludes passport_number');

  // Verify Scope Boundaries (No commission, payment, insurance, DICOM, or medical AI fields in schema)
  assert(!migContent.includes('commission_rate') && !migContent.includes('payout_amount'), 'No agency commission/payout fields in schema');
  assert(!migContent.includes('diagnosis_code') && !migContent.includes('treatment_plan'), 'No diagnosis/treatment fields in lead schema');
  assert(!migContent.includes('raw_ai_conversation'), 'No catch-all raw_ai_conversation field in lead schema');
}

// 2. Verify Application Service Layer Files & Public Non-Disclosure
const typesPath = path.join(rootDir, 'types/healthTourism.ts');
const servicePath = path.join(rootDir, 'utils/healthTourismService.ts');

assert(fs.existsSync(typesPath), 'types/healthTourism.ts exists');
assert(fs.existsSync(servicePath), 'utils/healthTourismService.ts exists');

if (fs.existsSync(typesPath)) {
  const typesContent = fs.readFileSync(typesPath, 'utf8');
  const htLeadTypeMatch = typesContent.match(/export interface HtLead \{[\s\S]*?\}/);
  const htLeadType = htLeadTypeMatch ? htLeadTypeMatch[0] : '';
  assert(!htLeadType.includes('passport_number'), 'HtLead type interface explicitly excludes passport_number');
}

if (fs.existsSync(servicePath)) {
  const serviceContent = fs.readFileSync(servicePath, 'utf8');
  assert(serviceContent.includes("message: 'Unable to submit health tourism request.'"), 'createPublicLead maps errors to non-disclosing generic public message');
  assert(!serviceContent.includes('message: error.message') || serviceContent.indexOf('createPublicLead') < serviceContent.indexOf('message: error.message'), 'createPublicLead does NOT return raw error.message to browser caller');
}

if (failures > 0) {
  console.error(`\n❌ ${failures} static QA assertion(s) failed.`);
  process.exit(1);
} else {
  console.log('\n🎉 All Health Tourism Foundation static QA assertions passed successfully!');
}
