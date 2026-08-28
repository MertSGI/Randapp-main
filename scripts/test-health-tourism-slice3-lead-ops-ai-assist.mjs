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

console.log('🏁 Running Health Tourism Slice 3 Static QA Suite...\n');

// 1. Migration 67 Existence & Structure
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
}

// 2. No Direct UI HT DML Check
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

// 3. Converted Status Exclusions in UI
const detailPanelPath = path.join(rootDir, 'components', 'health-tourism', 'HtLeadDetailPanel.tsx');
if (fs.existsSync(detailPanelPath)) {
  const detailContent = fs.readFileSync(detailPanelPath, 'utf8');
  assert(!detailContent.includes("status: 'converted'") && !detailContent.includes("status = 'converted'"),
         'Converted status is not exposed as a coordinator action');
}

// 4. Secret Check in Public Bundle / UI
const chatWidgetPath = path.join(rootDir, 'components', 'health-tourism', 'HtAiChatWidget.tsx');
if (fs.existsSync(chatWidgetPath)) {
  const chatContent = fs.readFileSync(chatWidgetPath, 'utf8');
  assert(!chatContent.includes('GROQ_API_KEY') && !chatContent.includes('OPENAI_API_KEY'),
         'AI secret keys absent from client chat widget');
  assert(chatContent.includes('HealthTourismAiService'),
         'Chat widget uses Edge Function boundary service');
}

// 5. Arabic Back Copy Correction
const translationsPath = path.join(rootDir, 'utils', 'healthTourismTranslations.ts');
if (fs.existsSync(translationsPath)) {
  const transContent = fs.readFileSync(translationsPath, 'utf8');
  assert(!transContent.includes("'السباق →'"), 'Obsolete Arabic back copy "السباق →" is removed');
  assert(transContent.includes("'← السابق'"), 'Correct Arabic back copy "← السابق" is present');
}

// 6. Medical Safety Boundary & Assistive Label
const edgeFnPath = path.join(rootDir, 'supabase', 'functions', 'ht-ai-chat', 'index.ts');
if (fs.existsSync(edgeFnPath)) {
  const fnContent = fs.readFileSync(edgeFnPath, 'utf8');
  assert(fnContent.includes('STRICT MEDICAL BOUNDARY'), 'Medical safety boundary prompt present in Edge Function');
  assert(fnContent.includes('ht_request_handoff'), 'Edge function triggers handoff for medical queries');
}

if (failures > 0) {
  console.error(`\n❌ Total Failures: ${failures}`);
  process.exit(1);
} else {
  console.log('\n✅ All Static QA Contracts Passed Successfully!');
}
