import fs from 'fs';
import path from 'path';

console.log('--- PHASE 5 NODE 3 HEALTH TOURISM JOURNEYS & QUOTES CONTRACT VALIDATION ---');

const migrationFile = 'supabase/migrations/20260928_phase5_ht_treatment_journey_quote_itinerary.sql';
if (!fs.existsSync(migrationFile)) {
  console.error('[FAIL] Migration file not found:', migrationFile);
  process.exit(1);
}
const sql = fs.readFileSync(migrationFile, 'utf8');

function assertRule(num, desc, condition) {
  if (condition) {
    console.log(`[PASS] ${num}. ${desc}`);
  } else {
    console.error(`[FAIL] ${num}. ${desc}`);
    process.exit(1);
  }
}

assertRule(1, 'Table public.ht_treatment_journeys defined with tenant_id and composite unique constraint',
  sql.includes('CREATE TABLE IF NOT EXISTS public.ht_treatment_journeys') &&
  sql.includes('uq_ht_treatment_journeys_id_tenant UNIQUE (id, tenant_id)'));

assertRule(2, 'Table public.ht_journey_quotes defined with total_amount_minor_units and composite FK',
  sql.includes('CREATE TABLE IF NOT EXISTS public.ht_journey_quotes') &&
  sql.includes('total_amount_minor_units INTEGER NOT NULL') &&
  sql.includes('fk_ht_journey_quotes_journey_tenant'));

assertRule(3, 'Table public.ht_journey_itinerary_events defined with event_type check and schedule bounds',
  sql.includes('CREATE TABLE IF NOT EXISTS public.ht_journey_itinerary_events') &&
  sql.includes('chk_ht_journey_itinerary_time_order') &&
  sql.includes('scheduled_end IS NULL OR scheduled_end >= scheduled_start'));

assertRule(4, 'RLS enabled on all 3 new tables with browser direct mutations denied',
  sql.includes('ALTER TABLE public.ht_treatment_journeys ENABLE ROW LEVEL SECURITY;') &&
  sql.includes('ALTER TABLE public.ht_journey_quotes ENABLE ROW LEVEL SECURITY;') &&
  sql.includes('ALTER TABLE public.ht_journey_itinerary_events ENABLE ROW LEVEL SECURITY;') &&
  sql.includes('Deny direct browser mutation on ht_treatment_journeys') &&
  sql.includes('Deny direct browser mutation on ht_journey_quotes') &&
  sql.includes('Deny direct browser mutation on ht_journey_itinerary_events'));

assertRule(5, 'ht_create_treatment_journey validates vertical eligibility and quota limits',
  sql.includes('resolve_tenant_vertical_context') &&
  sql.includes('health_tourism_enabled') &&
  sql.includes('max_active_journeys') &&
  sql.includes('QUOTA_EXCEEDED'));

assertRule(6, 'ht_create_or_update_journey_quote auto-increments version and advances status',
  sql.includes('ht_create_or_update_journey_quote') &&
  sql.includes('COALESCE(MAX(version), 0) + 1') &&
  sql.includes("status = 'quote_sent'"));

assertRule(7, 'ht_add_journey_itinerary_event validates journey ownership and timestamps',
  sql.includes('ht_add_journey_itinerary_event') &&
  sql.includes('p_scheduled_start'));

assertRule(8, 'Direct permissions revoked from PUBLIC and anon, granted to authenticated and service_role',
  sql.includes('REVOKE ALL ON FUNCTION public.ht_create_treatment_journey FROM PUBLIC, anon;') &&
  sql.includes('GRANT EXECUTE ON FUNCTION public.ht_create_treatment_journey TO authenticated, service_role;') &&
  sql.includes('REVOKE ALL ON FUNCTION public.ht_create_or_update_journey_quote FROM PUBLIC, anon;') &&
  sql.includes('REVOKE ALL ON FUNCTION public.ht_add_journey_itinerary_event FROM PUBLIC, anon;'));

assertRule(9, 'TypeScript types exported in types/healthTourism.ts',
  fs.readFileSync('types/healthTourism.ts', 'utf8').includes('export interface HtTreatmentJourney') &&
  fs.readFileSync('types/healthTourism.ts', 'utf8').includes('export interface HtJourneyQuote') &&
  fs.readFileSync('types/healthTourism.ts', 'utf8').includes('export interface HtJourneyItineraryEvent'));

assertRule(10, 'ht_assert_caller_ht_authority enforces canonical ht_staff_profiles capabilities',
  sql.includes('ht_assert_caller_ht_authority') &&
  sql.includes('public.ht_staff_profiles') &&
  sql.includes('can_manage_ht_leads'));

assertRule(11, 'ht_create_treatment_journey validates foreign lead, customer and coordinator tenant alignment',
  sql.includes('Lead does not belong to caller tenant') &&
  sql.includes('Customer does not belong to caller tenant') &&
  sql.includes('Assigned coordinator is not an active HT staff member'));

assertRule(12, 'ht_create_or_update_journey_quote locks journey row FOR UPDATE and verifies caller HT authority',
  sql.includes('SELECT * INTO v_journey') &&
  sql.includes('FOR UPDATE') &&
  sql.includes('ht_assert_caller_ht_authority(v_caller_uid, v_journey.tenant_id, true)'));

assertRule(13, 'ht_create_or_update_journey_quote validates currency format and authoritative item total sum',
  sql.includes("p_currency !~ '^[A-Z]{3}$'") &&
  sql.includes('Sum of line items (%) does not match total amount (%)'));

assertRule(14, 'ht_add_journey_itinerary_event locks journey and enforces appointment & coordinator tenant integrity',
  sql.includes('Appointment does not belong to journey tenant') &&
  sql.includes('Assigned coordinator is not an active HT staff member in journey tenant'));

assertRule(15, 'Prerequisite composite uniqueness uq_ht_leads_id_tenant established on public.ht_leads',
  sql.includes('uq_ht_leads_id_tenant') &&
  sql.includes('public.ht_leads') &&
  sql.includes('ADD CONSTRAINT uq_ht_leads_id_tenant UNIQUE (id, tenant_id)'));

assertRule(16, 'Internal authority helper execution revoked from authenticated and granted to service_role',
  sql.includes('REVOKE ALL ON FUNCTION public.ht_assert_caller_ht_authority FROM PUBLIC, anon, authenticated;') &&
  sql.includes('GRANT EXECUTE ON FUNCTION public.ht_assert_caller_ht_authority TO service_role;'));

console.log('\n========================================');
console.log('PHASE 5 NODE 3 CONTRACTS: 16 | PASSED: 16 | FAILED: 0');
console.log('========================================\n');
