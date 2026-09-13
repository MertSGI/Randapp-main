import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function runAssertions() {
  console.log('--- Phase 5 Node 6 Lead Ops Workspace Contract Assertions ---');

  const root = process.cwd();
  let passCount = 0;
  let failCount = 0;

  function assert(name, condition, details) {
    if (condition) {
      console.log(`✅ PASSED: ${name}`);
      passCount++;
    } else {
      console.error(`❌ FAILED: ${name}`);
      if (details) console.error(`   Details: ${details}`);
      failCount++;
    }
  }

  // 1. Check HtLeadDetailPanel.tsx exists
  const leadDetailPath = resolve(root, 'components/health-tourism/HtLeadDetailPanel.tsx');
  assert('HtLeadDetailPanel.tsx exists', existsSync(leadDetailPath));
  const leadDetailSrc = readFileSync(leadDetailPath, 'utf8');

  // 2. Check createTreatmentJourney integration exists
  assert(
    'HtLeadDetailPanel calls createTreatmentJourney',
    leadDetailSrc.includes('createTreatmentJourney')
  );

  // 3. Invariant: Converted status is NOT selectable or set via coordinator manual dropdown
  assert(
    'Converted status is not in coordinator status choices dropdown',
    !leadDetailSrc.includes('<option value="converted">')
  );

  // 4. Invariant: No direct DML from UI
  assert(
    'HtLeadDetailPanel does not execute direct table DML (from("ht_leads").insert)',
    !leadDetailSrc.includes(".from('ht_leads').insert") && !leadDetailSrc.includes('.from("ht_leads").insert')
  );
  assert(
    'HtLeadDetailPanel does not execute direct table DML (from("ht_leads").update)',
    !leadDetailSrc.includes(".from('ht_leads').update") && !leadDetailSrc.includes('.from("ht_leads").update')
  );
  assert(
    'HtLeadDetailPanel does not execute direct table DML (from("ht_treatment_journeys").insert)',
    !leadDetailSrc.includes(".from('ht_treatment_journeys')") && !leadDetailSrc.includes('.from("ht_treatment_journeys")')
  );

  // 5. Check healthTourismService.ts exports
  const servicePath = resolve(root, 'utils/healthTourismService.ts');
  assert('healthTourismService.ts exists', existsSync(servicePath));
  const serviceSrc = readFileSync(servicePath, 'utf8');

  assert(
    'HealthTourismService implements createTreatmentJourney',
    serviceSrc.includes('createTreatmentJourney(params: {')
  );
  assert(
    'HealthTourismService implements createOrUpdateJourneyQuote',
    serviceSrc.includes('createOrUpdateJourneyQuote(params: {')
  );
  assert(
    'HealthTourismService implements addJourneyItineraryEvent',
    serviceSrc.includes('addJourneyItineraryEvent(params: {')
  );

  // 6. Check RPC usage in healthTourismService
  assert(
    'createTreatmentJourney calls ht_create_treatment_journey RPC',
    serviceSrc.includes("rpc('ht_create_treatment_journey'") || serviceSrc.includes('rpc("ht_create_treatment_journey"')
  );
  assert(
    'createOrUpdateJourneyQuote calls ht_create_or_update_journey_quote RPC',
    serviceSrc.includes("rpc('ht_create_or_update_journey_quote'") || serviceSrc.includes('rpc("ht_create_or_update_journey_quote"')
  );
  assert(
    'addJourneyItineraryEvent calls ht_add_journey_itinerary_event RPC',
    serviceSrc.includes("rpc('ht_add_journey_itinerary_event'") || serviceSrc.includes('rpc("ht_add_journey_itinerary_event"')
  );

  // 7. Check server-authoritative role verification in HtCoordinatorWorkspacePage
  const workspacePagePath = resolve(root, 'pages/health-tourism/HtCoordinatorWorkspacePage.tsx');
  assert('HtCoordinatorWorkspacePage.tsx exists', existsSync(workspacePagePath));
  const workspacePageSrc = readFileSync(workspacePagePath, 'utf8');

  assert(
    'HtCoordinatorWorkspacePage uses getMyHtContext for server-authoritative role resolution',
    workspacePageSrc.includes('getMyHtContext')
  );

  // 8. Invariant: Converted status is NOT exposed as a coordinator action in workspace page
  assert(
    'Converted status not exposed as action in HtCoordinatorWorkspacePage',
    !workspacePageSrc.includes("status: 'converted'") && !workspacePageSrc.includes('status: "converted"')
  );

  console.log(`\nResults: ${passCount} passed, ${failCount} failed.`);
  if (failCount > 0) {
    process.exit(1);
  }
}

runAssertions();
