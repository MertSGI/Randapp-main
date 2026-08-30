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

console.log('🏁 Running Health Tourism Slice 3 Hardened Static QA Suite...\n');

// 1. Migration 67 Existence & Authority Checks
const migrationPath = path.join(rootDir, 'supabase/migrations/20260911_lari_health_tourism_lead_ops_ai_assist.sql');
assert(fs.existsSync(migrationPath), 'Migration 20260911_lari_health_tourism_lead_ops_ai_assist.sql exists');

if (fs.existsSync(migrationPath)) {
  const migContent = fs.readFileSync(migrationPath, 'utf8');

  assert(migContent.includes('ht_ai_conversations'), 'Migration creates ht_ai_conversations table');
  assert(migContent.includes('ht_ai_messages'), 'Migration creates ht_ai_messages table');
  assert(migContent.includes('assigned_coordinator_staff_id'), 'Migration adds assigned_coordinator_staff_id column');
  assert(migContent.includes('lead_score'), 'Migration adds lead_score column');
  assert(migContent.includes('lead_score_band'), 'Migration adds lead_score_band column');
  assert(migContent.includes('handoff_state'), 'Migration adds handoff_state column');

  // Verify transition matrix
  assert(migContent.includes('INVALID_TRANSITION: The converted status is reserved'), 'Migration blocks converted status');

  // Verify RPCs
  assert(migContent.includes('FUNCTION public.ht_assign_coordinator'), 'Contains ht_assign_coordinator RPC');
  assert(migContent.includes('FUNCTION public.ht_score_lead'), 'Contains ht_score_lead RPC');
  assert(migContent.includes('FUNCTION public.ht_acknowledge_handoff'), 'Contains ht_acknowledge_handoff RPC');
  assert(migContent.includes('FUNCTION public.ht_cleanup_expired_ai_data'), 'Contains ht_cleanup_expired_ai_data RPC');
  assert(migContent.includes('FUNCTION public.ht_enqueue_whatsapp_handoff'), 'Contains ht_enqueue_whatsapp_handoff RPC');
  assert(migContent.includes('FUNCTION public.ht_get_my_context'), 'Contains ht_get_my_context RPC for server-authoritative staff context');

  // Verify Tightened AI Persistence RPC Permissions (REVOKED from anon/authenticated, GRANTED to service_role)
  assert(migContent.includes('REVOKE ALL ON FUNCTION public.ht_create_ai_conversation FROM PUBLIC, anon, authenticated;'),
    'ht_create_ai_conversation is REVOKED from anon and authenticated');
  assert(migContent.includes('REVOKE ALL ON FUNCTION public.ht_add_ai_message FROM PUBLIC, anon, authenticated;'),
    'ht_add_ai_message is REVOKED from anon and authenticated');
  assert(migContent.includes('REVOKE ALL ON FUNCTION public.ht_get_ai_conversation_by_session FROM PUBLIC, anon, authenticated;'),
    'ht_get_ai_conversation_by_session is REVOKED from anon and authenticated');
  assert(migContent.includes('REVOKE ALL ON FUNCTION public.ht_cleanup_expired_ai_data FROM PUBLIC, anon, authenticated;'),
    'ht_cleanup_expired_ai_data is REVOKED from anon and authenticated');

  // Verify service_role explicit grants
  assert(migContent.includes('GRANT EXECUTE ON FUNCTION public.ht_create_ai_conversation TO service_role;'),
    'ht_create_ai_conversation is explicitly GRANTED to service_role');
  assert(migContent.includes('GRANT EXECUTE ON FUNCTION public.ht_link_ai_conversation_to_lead TO service_role;'),
    'ht_link_ai_conversation_to_lead is explicitly GRANTED to service_role');
  assert(migContent.includes('GRANT EXECUTE ON FUNCTION public.ht_update_ai_conversation_summary TO service_role;'),
    'ht_update_ai_conversation_summary is explicitly GRANTED to service_role');
  assert(migContent.includes('GRANT EXECUTE ON FUNCTION public.ht_request_handoff TO service_role;'),
    'ht_request_handoff is explicitly GRANTED to service_role');
  assert(migContent.includes('GRANT EXECUTE ON FUNCTION public.ht_create_public_lead TO service_role;'),
    'ht_create_public_lead is explicitly GRANTED to service_role');

  // Verify staff view-only gate on handoff
  assert(migContent.includes('v_hsp.can_manage_ht_leads = false THEN'),
    'ht_request_handoff requires can_manage_ht_leads=true for staff callers');

  // Ensure NO invalid grants exist for internal AI persistence RPCs to anon
  assert(!migContent.includes('GRANT EXECUTE ON FUNCTION public.ht_create_ai_conversation TO anon'),
    'Zero GRANT EXECUTE on ht_create_ai_conversation TO anon');
  assert(!migContent.includes('GRANT EXECUTE ON FUNCTION public.ht_add_ai_message TO anon'),
    'Zero GRANT EXECUTE on ht_add_ai_message TO anon');
  assert(!migContent.includes('GRANT EXECUTE ON FUNCTION public.ht_get_ai_conversation_by_session TO anon'),
    'Zero GRANT EXECUTE on ht_get_ai_conversation_by_session TO anon');

  // R11/R12 Migration 67 Overload & ACL Determinism Contracts
  assert(migContent.includes('DROP FUNCTION IF EXISTS public.ht_list_leads(text, integer, integer);'),
    'Migration 67 explicitly drops legacy 3-argument ht_list_leads overload');
  assert(!migContent.includes('DROP FUNCTION IF EXISTS public.ht_list_leads(text, integer, integer) CASCADE;'),
    'Drop legacy ht_list_leads overload does NOT use CASCADE');
  assert(migContent.includes('CREATE OR REPLACE FUNCTION public.ht_list_leads(\n    p_status TEXT DEFAULT NULL,\n    p_limit INT DEFAULT 50,\n    p_offset INT DEFAULT 0,\n    p_score_band TEXT DEFAULT NULL,\n    p_source_channel TEXT DEFAULT NULL\n)'),
    'Canonical 5-argument ht_list_leads exists with p_status, p_limit, p_offset, p_score_band, p_source_channel');
  assert(migContent.includes('REVOKE ALL ON FUNCTION public.ht_list_leads(text, integer, integer, text, text) FROM PUBLIC, anon;'),
    'ACL statements use exact 5-argument ht_list_leads REVOKE signature');
  assert(migContent.includes('GRANT EXECUTE ON FUNCTION public.ht_list_leads(text, integer, integer, text, text) TO authenticated;'),
    'ACL statements use exact 5-argument ht_list_leads GRANT signature');
  assert(!migContent.includes('GRANT EXECUTE ON FUNCTION public.ht_list_leads TO authenticated;'),
    'No signature-less GRANT EXECUTE on ht_list_leads');
  assert(!migContent.includes('REVOKE ALL ON FUNCTION public.ht_list_leads FROM'),
    'No signature-less REVOKE on ht_list_leads');
  assert(!migContent.includes('GRANT EXECUTE ON FUNCTION public.ht_list_leads(text, integer, integer, text, text) TO anon') &&
         !migContent.includes('GRANT EXECUTE ON FUNCTION public.ht_list_leads TO anon'),
    'No GRANT EXECUTE of ht_list_leads to anon');
  assert(migContent.includes('l.lead_score_band = lower(trim(p_score_band))') && migContent.includes('l.source_channel = lower(trim(p_source_channel))') && migContent.includes('passport_number IS EXCLUDED'),
    'Canonical ht_list_leads retains score_band/source_channel filtering and passport exclusion');
  assert(migContent.includes('extensions.gen_random_bytes(32)'),
    'Migration contains qualified extensions.gen_random_bytes(32) call');
  assert(!/\b(?<!extensions\.)gen_random_bytes\s*\(/i.test(migContent),
    'Migration contains zero unqualified gen_random_bytes calls');
  assert(migContent.includes('SET search_path = pg_catalog, public'),
    'Migration functions maintain hardened search_path = pg_catalog, public');
  assert(!/SET\s+search_path\s*=[^;\n]*\bextensions\b/i.test(migContent),
    'Migration search_path does NOT broaden to include extensions schema');
}

// 2. Edge Function Canonical Tenant Authority & Handoff Flow Check
const edgeFnPath = path.join(rootDir, 'supabase', 'functions', 'ht-ai-chat', 'index.ts');
assert(fs.existsSync(edgeFnPath), 'Edge Function ht-ai-chat exists');

if (fs.existsSync(edgeFnPath)) {
  const fnContent = fs.readFileSync(edgeFnPath, 'utf8');

  // Forbidden schema references check
  assert(!fnContent.includes('salon_business_profiles'), 'Edge Function does NOT reference non-canonical salon_business_profiles');
  assert(!fnContent.includes('ht_leads_published'), 'Edge Function does NOT reference non-canonical ht_leads_published');

  // Canonical tenant resolution check
  assert(fnContent.includes('.from("tenants")'), 'Edge Function queries canonical tenants table');
  assert(fnContent.includes('public_site_status'), 'Edge Function checks canonical public_site_status');
  assert(fnContent.includes('verification_status === "suspended"'), 'Edge Function checks verification_status suspension');

  // Contact capture & lead linking check
  assert(fnContent.includes('ht_create_public_lead'), 'Edge Function creates lead via canonical ht_create_public_lead authority');
  assert(fnContent.includes('ht_link_ai_conversation_to_lead'), 'Edge Function links conversation to lead via server primitive');
  assert(fnContent.includes('ht_update_ai_conversation_summary'), 'Edge Function persists summary via server primitive');
  assert(fnContent.includes('requires_contact'), 'Edge Function prompts for contact before claiming coordinator reached out');

  // R4/R5 RPC Error handling & message limit handoff checks
  assert(fnContent.includes('getConvErr') && fnContent.includes('createConvErr') && fnContent.includes('leadErr') && fnContent.includes('linkErr') && fnContent.includes('handoffErr') && fnContent.includes('userMsgErr') && fnContent.includes('aiMsgErr') && fnContent.includes('summaryErr'),
    'Edge Function checks error results for all Supabase RPC calls');
  assert(!fnContent.includes('AI chat service error: ${errorMessage}') && !fnContent.includes('AI chat service error: ${internalErrorMessage}'),
    'Edge Function does NOT leak raw internal error messages in public JSON responses');
  assert(fnContent.includes('LIMIT_REACHED_HANDOFF_COMPLETED') && fnContent.includes('limitHandoffErr'),
    'Edge Function message-limit branch persists handoff via RPC before returning handoff_triggered=true');

  // R6/R7/R8 Anti-Abuse Rate Limiting & Fail-Closed Boundary Checks
  assert(fnContent.includes('ht_check_rate_limit'), 'Edge Function invokes ht_check_rate_limit anti-abuse RPC');
  assert(fnContent.includes('RATE_LIMITED') && fnContent.includes('Retry-After'), 'Edge Function handles rate limit response with HTTP 429 and Retry-After header');
  assert(!fnContent.includes('p_raw_ip') && fnContent.includes('hashedRequester'), 'Edge Function hashes requester identity before persistence (no raw IP storage)');
  assert(!fnContent.includes('SUPABASE_SERVICE_ROLE_KEY.slice'), 'Requester hashing does NOT depend on SUPABASE_SERVICE_ROLE_KEY prefix');
  assert(fnContent.includes('HT_RATE_LIMIT_HASH_KEY'), 'Requester hashing uses dedicated HT_RATE_LIMIT_HASH_KEY secret');
  assert(fnContent.includes('"HMAC"') && fnContent.includes('"SHA-256"'), 'Requester hashing algorithm uses HMAC-SHA-256');
  // In-script selftest & structural matcher for jsonError("ANTI_ABUSE_UNAVAILABLE", ..., 503)
  const antiAbuse503Regex = /jsonError\s*\(\s*["']ANTI_ABUSE_UNAVAILABLE["']\s*,\s*["'][^"']+["']\s*,\s*503\s*\)/;
  
  // Selftest
  assert(antiAbuse503Regex.test('jsonError("ANTI_ABUSE_UNAVAILABLE", "Service unavailable.", 503)'), 'Selftest positive: matched 503 anti-abuse error');
  assert(!antiAbuse503Regex.test('jsonError("ANTI_ABUSE_UNAVAILABLE", "Service unavailable.", 500)'), 'Selftest negative 1: rejected 500 status');
  assert(!antiAbuse503Regex.test('jsonError("OTHER_ERROR", "Service unavailable.", 503)'), 'Selftest negative 2: rejected non-anti-abuse 503 error');
  
  assert(antiAbuse503Regex.test(fnContent), 'Rate limit RPC failure fails closed with HTTP 503 ANTI_ABUSE_UNAVAILABLE');
  assert(fnContent.includes('isHandoffOrContactProtocol') && fnContent.includes('isHandoffRequest'), 'Edge Function classifies handoff and contact protocol requests before rate limit consumption');
  assert(fnContent.includes('typeof rlResult.allowed !== "boolean"') && fnContent.includes('rlResult.allowed === true'), 'rateLimitAllowed requires explicit rlResult.allowed === true decision (fails closed on null/malformed)');

  // Verify anti-abuse check occurs BEFORE expensive AI provider fetch call
  const rlIndex = fnContent.indexOf('ht_check_rate_limit');
  const providerIndex = fnContent.indexOf('fetch(');
  assert(rlIndex !== -1 && (providerIndex === -1 || rlIndex < providerIndex), 'Anti-abuse rate limit check executes BEFORE AI provider fetch call');

  // R6 Medical boundary & localized safety response check
  assert(fnContent.includes('MEDICAL_SAFETY_BOUNDARY'), 'Edge Function returns MEDICAL_SAFETY_BOUNDARY outcome code for medical queries');
  assert(!fnContent.includes('safetyResponse = "I\'m an intake assistant'), 'Edge Function does NOT return hard-coded English medical safety text');
  assert(fnContent.includes('ht_request_handoff'), 'Edge Function triggers handoff for medical queries');

  // R19 Product Capability Grounding assertions
  assert(fnContent.includes('PRODUCT CAPABILITY GROUNDING — DO NOT CLAIM OR INVENT'), 'Edge Function prompt contains PRODUCT CAPABILITY GROUNDING section heading');
  assert(fnContent.includes('CURRENTLY AVAILABLE THROUGH THIS ASSISTANT'), 'Edge Function prompt contains CURRENTLY AVAILABLE THROUGH THIS ASSISTANT section');
  assert(fnContent.includes('Do not invent platform features, operational processes, integrations, communications, logistics, prices, timelines, or workflows'), 'Edge Function prompt forbids inventing platform features or workflows');
  assert(fnContent.includes('Accepts passport, ID, or medical document/report uploads'), 'Edge Function prompt explicitly guards against passport/ID/document upload claims');
  assert(fnContent.includes('Processes visas or handles visa documentation') && fnContent.includes('Books flights, hotels, accommodations, or airport transfers/transportation'), 'Edge Function prompt explicitly guards against visa/flight/hotel/transfer claims');
  assert(fnContent.includes('Takes payments, deposits, or provides payment plans'), 'Edge Function prompt explicitly guards against payment/deposit claims');
  assert(fnContent.includes('Sends automatic confirmation emails or automatic SMS messages') && fnContent.includes('Performs real WhatsApp delivery or automated external messaging'), 'Edge Function prompt explicitly guards against auto-email/SMS/WhatsApp claims');
  assert(fnContent.includes('Performs appointment booking or Lead -> Booking -> Clinic conversion'), 'Edge Function prompt explicitly guards against booking/clinic conversion claims');
  assert(fnContent.includes('UNKNOWN OR UNSUPPORTED CAPABILITIES') && fnContent.includes('Offer to collect their inquiry or connect them with a human coordinator instead'), 'Edge Function prompt includes unknown-capability rule directing callers to human coordination');

  // R20-R25 Executable Classifier Extraction & Matrix Testing
  const match = fnContent.match(/function containsUnsupportedCapabilityQuery\([\s\S]*?\n\}/);
  assert(match !== null, 'A. Deterministic capability classifier exists');

  let containsUnsupportedCapabilityQuery = null;
  if (match) {
    let code = match[0];
    // Convert TypeScript annotations for Node execution
    code = code.replace(/message:\s*string/g, 'message');
    code = code.replace(/:\s*boolean/g, '');
    try {
      containsUnsupportedCapabilityQuery = eval('(' + code + ')');
      assert(typeof containsUnsupportedCapabilityQuery === 'function', 'Literal classifier extracted and instantiated successfully');
    } catch (e) {
      assert(false, `Failed to instantiate literal classifier: ${e.message}`);
    }
  }

  if (containsUnsupportedCapabilityQuery) {
    const positiveCases = [
      "Can I upload my passport here?",
      "Can you process my visa?",
      "Can you book my flight?",
      "Can you arrange my hotel or airport transfer?",
      "Can I pay a deposit here?",
      "Do you provide payment plans?",
      "Will I receive an automatic SMS confirmation?",
      "Do you send WhatsApp messages automatically?",
      "Can you book my appointment?",
      "Does the platform automatically match me with a clinic?",
      "Which countries are available on this platform?",
      "Which clinics are available?",
      "What treatment types are offered on this platform?",
      "Pasaportumu yükle.",
      "Randevu oluştur.",
      "Transferimi ayarla.",
      "Vizemi işle.",
      "Beni otomatik olarak bir klinikle eşleştiriyor musunuz?",
      "Visum bearbeiten",
      "оформить визу",
      "معالجة التأشيرة"
    ];

    const negativeCases = [
      "Can you process my inquiry?",
      "Can you arrange a human coordinator handoff?",
      "My passport is ready. How can I submit my inquiry?",
      "My hotel is already booked. Can you summarize my inquiry?",
      "I already have a visa. Can you continue in German?",
      "I paid a deposit elsewhere. Can you summarize my inquiry?",
      "My flight arrives tomorrow. Can you collect my contact information?",
      "Randevu aldım. Şimdi talebime nasıl devam ederim?",
      "Otelimi ayarladım. İletişim bilgilerimi verebilir miyim?",
      "Vize işlemlerim hazır. Talebimi özetler misin?",
      "Uçak biletimi aldım. Almanca devam edebilir miyiz?",
      "Seçtiğim klinikle görüşüyorum. Talebimi özetler misin?"
    ];

    positiveCases.forEach(input => {
      assert(containsUnsupportedCapabilityQuery(input) === true, `Classifier POSITIVE check: "${input}" -> true`);
    });

    negativeCases.forEach(input => {
      assert(containsUnsupportedCapabilityQuery(input) === false, `Classifier NEGATIVE check: "${input}" -> false`);
    });
  }

  // R24 Action-Specific Coupling & Generic Modal Removal Guards
  assert(!fnContent.includes('hasCapabilityIntent && hasUnsupportedTopic'),
    'GENERIC_MODAL_GLOBAL_AUTHORITY_REMOVED_RESULT: Uncoupled generic modal intent is removed as global classifier authority');
  assert(!/hasCapabilityIntent\s*=[^;]*['"]can you['"]/i.test(fnContent) && !/hasCapabilityIntent\s*=[^;]*['"]can i['"]/i.test(fnContent),
    'GENERIC_CAN_YOU_NOT_GLOBAL_CAPABILITY_AUTHORITY: Generic "can you" / "can i" are not global uncoupled capability authority');

  assert(fnContent.includes('isDocumentCapabilityQuery') && fnContent.includes('passport'),
    'DOCUMENT_INTENT_TOPIC_COUPLING_RESULT: Document intent is explicitly coupled to document topic');
  assert(fnContent.includes('isTravelCapabilityQuery') && (fnContent.includes('visa') || fnContent.includes('hotel')),
    'TRAVEL_INTENT_TOPIC_COUPLING_RESULT: Travel intent is explicitly coupled to travel topic');
  assert(fnContent.includes('isPaymentCapabilityQuery') && (fnContent.includes('deposit') || fnContent.includes('payment')),
    'PAYMENT_INTENT_TOPIC_COUPLING_RESULT: Payment intent is explicitly coupled to payment topic');
  assert(fnContent.includes('isAutoCommunicationCapabilityQuery') && (fnContent.includes('sms') || fnContent.includes('email')),
    'AUTO_COMM_INTENT_TOPIC_COUPLING_RESULT: Auto-communication intent is explicitly coupled to communication topic');
  assert(fnContent.includes('isAppointmentCapabilityQuery') && (fnContent.includes('appointment') || fnContent.includes('randevu')),
    'APPOINTMENT_INTENT_TOPIC_COUPLING_RESULT: Appointment intent is explicitly coupled to appointment topic');
  assert(fnContent.includes('isClinicMatchingCapabilityQuery') && (fnContent.includes('match') || fnContent.includes('eşleştir')),
    'CLINIC_MATCHING_INTENT_TOPIC_COUPLING_RESULT: Clinic matching intent is explicitly coupled to clinic matching topic');

  assert(fnContent.includes('isCatalogOfferingQuery') && (fnContent.includes('which') || fnContent.includes('what')),
    'CATALOG_DEDICATED_AUTHORITY_RESULT: Catalog offering authority remains a dedicated separate predicate');

  // Restored R22 Guards
  assert(!/hasCapabilityIntent\s*=[^;]*['"]which['"]/i.test(fnContent) && !/hasCapabilityIntent\s*=[^;]*['"]what['"]/i.test(fnContent),
    'GLOBAL_BARE_WHAT_WHICH_GUARD_RESTORED: Bare what/which excluded from global capability intent');
  assert(fnContent.includes('isCatalogOfferingQuery') && (fnContent.includes('country') || fnContent.includes('treatment') || fnContent.includes('tedavi')),
    'CATALOG_DEDICATED_INTENT_GUARD_RESTORED: Dedicated catalog offering intent preserved');
  assert(fnContent.includes('isClinicMatchingCapabilityQuery') && fnContent.includes('clinic'),
    'CLINIC_MATCHING_GUARDS_RESTORED: Clinic matching predicate and topic coverage restored');
  assert(fnContent.includes('directActionPatterns') && fnContent.includes('pattern.test'),
    'DIRECT_ACTION_BOUNDED_MATCH_RESULT: Direct action phrases use bounded regex patterns with word boundaries');
  assert(!fnContent.includes('directActionPhrases.some'),
    'LOOSE_DIRECT_ACTION_SUBSTRING_LIST_REMOVED: Loose directActionPhrases substring list is removed');

  // Preserved R23 Multilingual & Boundary Guards
  assert(fnContent.includes('vizemi') && fnContent.includes('işle'),
    'TURKISH_VIZEMI_DIRECT_ACTION_GUARD: Bounded Turkish vizemi işle direct action exists');
  assert(fnContent.includes('\\p{L}') && fnContent.includes('/u'),
    'UNICODE_SAFE_DIRECT_ACTION_BOUNDARY_GUARD: Direct action patterns use Unicode-aware property escape boundaries');
  assert(!/\b(записаться|паспорт|визу)\b/.test(fnContent.slice(fnContent.indexOf('directActionPatterns'), fnContent.indexOf('isDocumentCapabilityQuery'))),
    'LOOSE_NON_LATIN_WORD_BOUNDARY_DEPENDENCY_REMOVED: ASCII-only word boundary \\b is avoided for Cyrillic/Arabic direct action phrases');

  assert(fnContent.includes('buildUnsupportedCapabilityResponse'), 'H. Localized TR/EN/DE/RU/AR capability-boundary response helper exists');
  assert(fnContent.includes('case "tr"') && fnContent.includes('case "de"') && fnContent.includes('case "ru"') && fnContent.includes('case "ar"'), 'H2. TR/EN/DE/RU/AR language cases present');

  assert(fnContent.includes('outcome_code: "UNSUPPORTED_CAPABILITY"') || fnContent.includes('outcome_code: \n        "UNSUPPORTED_CAPABILITY"'), 'I. Explicit UNSUPPORTED_CAPABILITY outcome code exists');

  // Runtime call-site order anchors (ensures execution order checks call-sites, NOT function definitions)
  const capCallSiteIndex = fnContent.indexOf('const isUnsupportedCapabilityQuery = containsUnsupportedCapabilityQuery(message);');
  const medCallSiteIndex = fnContent.indexOf('const isMedicalQuery = containsMedicalQuery(message);');
  const providerFetchCallSiteIndex = fnContent.indexOf('const aiResponse = await fetch(apiUrl,');

  assert(capCallSiteIndex !== -1 && medCallSiteIndex !== -1 && capCallSiteIndex < medCallSiteIndex, 'CAPABILITY_BOUNDARY_BEFORE_MEDICAL_RESULT: Capability boundary call site executes BEFORE medical boundary call site');
  assert(capCallSiteIndex !== -1 && providerFetchCallSiteIndex !== -1 && capCallSiteIndex < providerFetchCallSiteIndex, 'CAPABILITY_BOUNDARY_BEFORE_PROVIDER_RESULT: Capability boundary call site executes BEFORE AI provider fetch call site');
  assert(medCallSiteIndex !== -1 && providerFetchCallSiteIndex !== -1 && medCallSiteIndex < providerFetchCallSiteIndex, 'MEDICAL_BOUNDARY_BEFORE_PROVIDER_RESULT: Medical boundary call site executes BEFORE AI provider fetch call site');

  assert(fnContent.includes('ht_add_ai_message') && fnContent.includes('capability assistant'), 'L. Deterministic response is persisted via ht_add_ai_message');
}

// 2B. Supabase Client Export & Coordinator Workspace Import Check
const supabaseClientPath = path.join(rootDir, 'services', 'supabaseClient.ts');
assert(fs.existsSync(supabaseClientPath), 'services/supabaseClient.ts exists');
if (fs.existsSync(supabaseClientPath)) {
  const clientContent = fs.readFileSync(supabaseClientPath, 'utf8');
  assert(clientContent.includes('export const isSupabaseMode'), 'services/supabaseClient.ts exports isSupabaseMode helper');
}

// 3. SQL Test Suite Canonical Clinic Table & Privilege Checks
const sqlTestPath = path.join(rootDir, 'supabase', 'tests', 'health_tourism_lead_ops_ai_assist_tests.sql');
assert(fs.existsSync(sqlTestPath), 'SQL test suite exists');

if (fs.existsSync(sqlTestPath)) {
  const sqlContent = fs.readFileSync(sqlTestPath, 'utf8');
  assert(!sqlContent.includes('public.patients'), 'SQL test suite does NOT query non-canonical public.patients');
  assert(!sqlContent.includes('public.encounters'), 'SQL test suite does NOT query non-canonical public.encounters');
  assert(sqlContent.includes('public.clinic_patient_profiles'), 'SQL test suite queries canonical public.clinic_patient_profiles');
  assert(sqlContent.includes('public.clinic_encounters'), 'SQL test suite queries canonical public.clinic_encounters');

  // R5/R6 TAP Plan and count assertions
  const planMatch = sqlContent.match(/SELECT plan\((\d+)\);/);
  const plannedCount = planMatch ? parseInt(planMatch[1], 10) : 0;
  const tapMatches = sqlContent.match(/SELECT\s+(is|has_table|throws_ok)\s*\(/g) || [];
  const actualCount = tapMatches.length;
  assert(plannedCount === actualCount, `TAP plan count (${plannedCount}) matches actual TAP assertion count (${actualCount})`);

  // R4/R5/R6 SQL Test additions
  assert(sqlContent.includes('has_function_privilege'), 'SQL test suite contains executable privilege assertions');
  assert(sqlContent.includes('View-only staff and cross-tenant staff handoff mutation denied'), 'SQL test suite tests cross-tenant handoff mutation denial');
  assert(sqlContent.includes('PASSPORT_PRIVACY_LEAK'), 'SQL test suite tests multi-surface passport privacy (case-insensitive across audit, outbox, summaries)');
  assert(sqlContent.includes('Expired AI messages and conversations deleted by retention cleanup'), 'SQL test suite tests post-delete retention assertion');
  assert(sqlContent.includes('ht_check_rate_limit'), 'SQL test suite tests anti-abuse rate limit primitive');
}

// 4. Landing & Chat Widget Attribution Propagation Check
const landingPath = path.join(rootDir, 'pages', 'health-tourism', 'HealthTourismLandingPage.tsx');
if (fs.existsSync(landingPath)) {
  const landingContent = fs.readFileSync(landingPath, 'utf8');
  assert(landingContent.includes('sourceChannel={sourceChannel}') && landingContent.includes('referringAgencyId={referringAgencyId'),
    'HealthTourismLandingPage passes sourceChannel and referringAgencyId into HtAiChatWidget');
}

// 5. UI Context & Permission Gating Check
const workspacePath = path.join(rootDir, 'pages', 'health-tourism', 'HtCoordinatorWorkspacePage.tsx');
if (fs.existsSync(workspacePath)) {
  const wsContent = fs.readFileSync(workspacePath, 'utf8');

  // Verify setCanManage is NOT derived merely from list success
  assert(!wsContent.includes('setCanManage(true) // Will be verified per-action'),
    'UI does NOT setCanManage(true) based only on list success');
  assert(wsContent.includes('getMyHtContext()'),
    'UI resolves capabilities server-authoritatively via getMyHtContext()');
}

// 5. No Direct UI HT DML Check
const componentsDir = path.join(rootDir, 'components', 'health-tourism');
const pagesDir = path.join(rootDir, 'pages', 'health-tourism');

function checkNoDirectDml(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    assert(!content.includes('.from(\'ht_leads\').insert') &&
           !content.includes('.from(\'ht_leads\').update') &&
           !content.includes('.from(\'ht_leads\').delete'),
           `No direct ht_leads DML in ${file}`);
    assert(!content.includes('.from(\'ht_ai_conversations\').insert') &&
           !content.includes('.from(\'ht_ai_conversations\').update'),
           `No direct ht_ai_conversations DML in ${file}`);
    assert(!content.includes('.from(\'ht_ai_messages\').insert'),
           `No direct ht_ai_messages DML in ${file}`);
  }
}

checkNoDirectDml(componentsDir);
checkNoDirectDml(pagesDir);

// 6. Converted Status Exclusions in UI
const detailPanelPath = path.join(rootDir, 'components', 'health-tourism', 'HtLeadDetailPanel.tsx');
if (fs.existsSync(detailPanelPath)) {
  const detailContent = fs.readFileSync(detailPanelPath, 'utf8');
  assert(!detailContent.includes("status: 'converted'") && !detailContent.includes("status = 'converted'"),
         'Converted status is not exposed as a coordinator action');
}

// 7. Secret Check & Error Localization in Public Bundle / UI
const chatWidgetPath = path.join(rootDir, 'components', 'health-tourism', 'HtAiChatWidget.tsx');
if (fs.existsSync(chatWidgetPath)) {
  const chatContent = fs.readFileSync(chatWidgetPath, 'utf8');
  assert(!chatContent.includes('GROQ_API_KEY') && !chatContent.includes('OPENAI_API_KEY'),
         'AI secret keys absent from client chat widget');
  assert(chatContent.includes('HealthTourismAiService'),
         'Chat widget uses Edge Function boundary service');
  assert(!chatContent.includes('addMessage(\'assistant\', response.error?.message'),
         'Chat widget does NOT display raw response.error.message directly to public UI');
  assert(chatContent.includes('t.chatMedicalSafetyDeferral'),
         'Chat widget renders localized chatMedicalSafetyDeferral for medical boundary');
  assert(chatContent.includes('t.rateLimitedErr'),
         'Chat widget renders localized rateLimitedErr on RATE_LIMITED response');
}

// 8. Translation Parity Check (TR, EN, DE, RU, AR)
const translationsPath = path.join(rootDir, 'utils', 'healthTourismTranslations.ts');
if (fs.existsSync(translationsPath)) {
  const transContent = fs.readFileSync(translationsPath, 'utf8');
  assert(!transContent.includes("'السباق →'"), 'Obsolete Arabic back copy "السباق →" is removed');
  assert(transContent.includes("'← السابق'"), 'Correct Arabic back copy "← السابق" is present');

  // Verify chatMedicalSafetyDeferral in all 5 languages
  const safetyMatches = (transContent.match(/chatMedicalSafetyDeferral:/g) || []).length;
  assert(safetyMatches === 5, `chatMedicalSafetyDeferral present in all 5 languages (found ${safetyMatches}/5)`);

  // Verify rateLimitedErr in all 5 languages
  const rateMatches = (transContent.match(/rateLimitedErr:/g) || []).length;
  assert(rateMatches === 5, `rateLimitedErr present in all 5 languages (found ${rateMatches}/5)`);
}

if (failures > 0) {
  console.error(`\n❌ Total Failures: ${failures}`);
  process.exit(1);
} else {
  console.log('\n✅ All Hardened Static QA Contracts Passed Successfully!');
}
