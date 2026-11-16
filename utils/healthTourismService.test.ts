import assert from 'node:assert/strict';
import { HealthTourismService } from './healthTourismService.ts';

const SYNTH_LEAD_ID = '11111111-1111-4111-8111-111111111111';
const SYNTH_JOURNEY_ID = '22222222-2222-4222-8222-222222222222';

export async function runHealthTourismServiceTests(): Promise<void> {
  let rpcInvoked = false;
  const neverCalledClient = {
    rpc: async () => {
      rpcInvoked = true;
      return { data: null, error: { message: 'SHOULD_NOT_CALL' } };
    },
  };

  const guardSvc = new HealthTourismService(neverCalledClient);

  // 1. Execution authority & EXTERNAL_HOLD regulatory classification
  assert.equal(guardSvc.getExecutionAuthority('supabase'), 'DB_AUTHORITATIVE');
  assert.equal(guardSvc.getExecutionAuthority('local'), 'LOCAL_SIMULATION');

  const hold = guardSvc.getRegulatoryHoldStatus();
  assert.equal(hold.classification, 'EXTERNAL_HOLD');
  assert.equal(hold.kvkkSpecialCategoryHealthDataApproval, 'EXTERNAL_HOLD');
  assert.equal(hold.healthTourismAuthorizationCertificate, 'EXTERNAL_HOLD');
  assert.equal(hold.liveWhatsappAndMessagingDispatch, 'EXTERNAL_HOLD');
  assert.equal(hold.productionGoLive, 'NO_GO');

  // 2. Negative: local simulation mode fails closed across all public & coordinator RPCs
  const localLead = await guardSvc.createPublicLead(
    { slug: 'synth-clinic', full_name: 'Synth Patient', phone: '+447700900111' },
    { mode: 'local' }
  );
  assert.equal(localLead.success, false);
  assert.equal(localLead.reason_code, 'LOCAL_SIMULATION_DB_RPC_UNAVAILABLE');

  const localCtx = await guardSvc.getMyHtContext({ mode: 'local' });
  assert.equal(localCtx.success, false);
  assert.equal(localCtx.reason_code, 'LOCAL_SIMULATION_DB_RPC_UNAVAILABLE');

  const localList = await guardSvc.listLeads({}, { mode: 'local' });
  assert.equal(localList.success, false);

  const localHandoff = await guardSvc.enqueueWhatsAppHandoff({ lead_id: SYNTH_LEAD_ID }, { mode: 'local' });
  assert.equal(localHandoff.success, false);

  const localJourney = await guardSvc.createTreatmentJourney(
    { title: 'Synth Journey', lead_id: SYNTH_LEAD_ID },
    { mode: 'local' }
  );
  assert.equal(localJourney.success, false);
  assert.equal(rpcInvoked, false);

  // 3. Negative: RPC error returns sanitized failure
  const errSvc = new HealthTourismService({
    rpc: async () => ({ data: null, error: { message: 'FORBIDDEN: Staff lacks can_manage_ht_leads' } }),
  });
  const deniedLead = await errSvc.createPublicLead(
    { slug: 'synth-clinic', full_name: 'Synth Patient', phone: '+447700900111' },
    { mode: 'supabase' }
  );
  assert.equal(deniedLead.success, false);
  assert.equal(deniedLead.reason_code, 'PUBLIC_INTAKE_FAILED');

  // 4. Positive: synthetic supabase RPC flow + passport redaction + no-real-send outbox handoff
  const calls: Array<{ fn: string; args: Record<string, any> }> = [];
  const okSvc = new HealthTourismService({
    rpc: async (fn, args) => {
      calls.push({ fn, args: args ?? {} });
      if (fn === 'ht_get_lead') {
        return {
          data: {
            success: true,
            lead: {
              id: SYNTH_LEAD_ID,
              tenant_id: 'aaaa1111-a1a1-41a1-81a1-aaaaaaaaaaaa',
              status: 'handoff_pending',
              source_channel: 'web',
              preferred_language: 'en',
              country_code: 'GB',
              full_name: 'Synth International',
              email: 'synth.int@example.test',
              phone: '+447700900111',
              handoff_state: 'requested',
              last_activity_at: '2026-11-16T10:00:00Z',
              created_at: '2026-11-16T10:00:00Z',
              updated_at: '2026-11-16T10:00:00Z',
            },
          },
          error: null,
        };
      }
      if (fn === 'ht_enqueue_whatsapp_handoff') {
        return {
          data: { success: true, outbox_id: 'outbox-synth-1', channel: 'whatsapp' },
          error: null,
        };
      }
      if (fn === 'ht_create_treatment_journey') {
        return {
          data: { success: true, journey_id: SYNTH_JOURNEY_ID },
          error: null,
        };
      }
      if (fn === 'ht_create_or_update_journey_quote') {
        return {
          data: { success: true, quote_id: 'quote-synth-1', version: 1 },
          error: null,
        };
      }
      if (fn === 'ht_add_journey_itinerary_event') {
        return {
          data: { success: true, event_id: 'event-synth-1' },
          error: null,
        };
      }
      return { data: { success: true }, error: null };
    },
  });

  const leadRes = await okSvc.getLead(SYNTH_LEAD_ID, { mode: 'supabase' });
  assert.equal(leadRes.success, true);
  assert.equal('passport_number' in (leadRes.lead ?? {}), false);
  assert.equal('passport_last_four' in (leadRes.lead ?? {}), false);

  const handoffRes = await okSvc.enqueueWhatsAppHandoff({ lead_id: SYNTH_LEAD_ID }, { mode: 'supabase' });
  assert.equal(handoffRes.success, true);
  assert.equal(handoffRes.outbox_id, 'outbox-synth-1');

  const journeyRes = await okSvc.createTreatmentJourney(
    { title: 'Synth Dental Package', lead_id: SYNTH_LEAD_ID, target_treatment_category: 'dental' },
    { mode: 'supabase' }
  );
  assert.equal(journeyRes.success, true);
  assert.equal(journeyRes.journey_id, SYNTH_JOURNEY_ID);

  const quoteRes = await okSvc.createOrUpdateJourneyQuote(
    {
      journey_id: SYNTH_JOURNEY_ID,
      currency: 'EUR',
      total_amount_minor_units: 120000,
      items: [{ description: 'Dental Package', category: 'clinical', amount_minor_units: 120000 }],
    },
    { mode: 'supabase' }
  );
  assert.equal(quoteRes.success, true);

  const itinRes = await okSvc.addJourneyItineraryEvent(
    {
      journey_id: SYNTH_JOURNEY_ID,
      event_type: 'airport_pickup',
      title: 'Synth Arrival',
      scheduled_start: '2026-12-01T10:00:00Z',
    },
    { mode: 'supabase' }
  );
  assert.equal(itinRes.success, true);
  assert.equal(calls.length, 5);

  console.log('[PASS] healthTourismService tests verified');
}

await runHealthTourismServiceTests();
