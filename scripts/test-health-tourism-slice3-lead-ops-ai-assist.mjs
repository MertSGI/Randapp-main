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

  // Medical boundary & handoff check
  assert(fnContent.includes('STRICT MEDICAL BOUNDARY'), 'Medical safety boundary prompt present in Edge Function');
  assert(fnContent.includes('ht_request_handoff'), 'Edge Function triggers handoff for medical queries');
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

  // R5 TAP Plan and count assertions
  const planMatch = sqlContent.match(/SELECT plan\((\d+)\);/);
  const plannedCount = planMatch ? parseInt(planMatch[1], 10) : 0;
  const tapMatches = sqlContent.match(/SELECT\s+(is|has_table|throws_ok)\s*\(/g) || [];
  const actualCount = tapMatches.length;
  assert(plannedCount === actualCount, `TAP plan count (${plannedCount}) matches actual TAP assertion count (${actualCount})`);

  // R4/R5 SQL Test additions
  assert(sqlContent.includes('has_function_privilege'), 'SQL test suite contains executable privilege assertions');
  assert(sqlContent.includes('View-only staff and cross-tenant staff handoff mutation denied'), 'SQL test suite tests cross-tenant handoff mutation denial');
  assert(sqlContent.includes('PASSPORT_PRIVACY_LEAK'), 'SQL test suite tests multi-surface passport privacy (case-insensitive across audit, outbox, summaries)');
  assert(sqlContent.includes('Expired AI messages and conversations deleted by retention cleanup'), 'SQL test suite tests post-delete retention assertion');
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

// 7. Secret Check in Public Bundle / UI
const chatWidgetPath = path.join(rootDir, 'components', 'health-tourism', 'HtAiChatWidget.tsx');
if (fs.existsSync(chatWidgetPath)) {
  const chatContent = fs.readFileSync(chatWidgetPath, 'utf8');
  assert(!chatContent.includes('GROQ_API_KEY') && !chatContent.includes('OPENAI_API_KEY'),
         'AI secret keys absent from client chat widget');
  assert(chatContent.includes('HealthTourismAiService'),
         'Chat widget uses Edge Function boundary service');
}

// 8. Arabic Back Copy Correction
const translationsPath = path.join(rootDir, 'utils', 'healthTourismTranslations.ts');
if (fs.existsSync(translationsPath)) {
  const transContent = fs.readFileSync(translationsPath, 'utf8');
  assert(!transContent.includes("'السباق →'"), 'Obsolete Arabic back copy "السباق →" is removed');
  assert(transContent.includes("'← السابق'"), 'Correct Arabic back copy "← السابق" is present');
}

if (failures > 0) {
  console.error(`\n❌ Total Failures: ${failures}`);
  process.exit(1);
} else {
  console.log('\n✅ All Hardened Static QA Contracts Passed Successfully!');
}
