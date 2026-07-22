import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

// =========================================================================
// A. LIVE SCHEMA MANIFEST DISCOVERY (From Canonical Migrations 1-21)
// =========================================================================
const tables = {
  tenants: ['id', 'name', 'slug', 'status', 'verification_status', 'public_site_status', 'business_risk_status', 'onboarding_status', 'category', 'city', 'district', 'phone', 'address', 'official_business_name', 'public_display_name', 'created_at', 'updated_at'],
  tenant_branding: ['id', 'tenant_id', 'business_name', 'tagline', 'footer_text', 'logo_url', 'primary_color', 'accent_color', 'instagram_url', 'whatsapp_number', 'address', 'created_at', 'updated_at'],
  tenant_business_profiles: ['id', 'tenant_id', 'short_description', 'about_text', 'business_category', 'address', 'city', 'district', 'map_embed_url', 'google_maps_url', 'phone', 'whatsapp_number', 'instagram_url', 'website_url', 'email', 'opening_hours_summary', 'cover_image_url', 'logo_url', 'gallery_images', 'amenities', 'parking_info', 'payment_methods', 'cancellation_policy', 'booking_policy', 'featured_message', 'seo_title', 'seo_description', 'is_public_profile_enabled', 'public_display_name', 'created_at', 'updated_at'],
  users_profile: ['id', 'tenant_id', 'role', 'full_name', 'phone', 'active', 'email', 'avatar_url', 'created_at', 'updated_at'],
  staff: ['id', 'tenant_id', 'name', 'title', 'active', 'is_owner', 'phone', 'email', 'created_at', 'updated_at'],
  services: ['id', 'tenant_id', 'name', 'name_tr', 'duration', 'price', 'active', 'category', 'created_at', 'updated_at'],
  branches: ['id', 'tenant_id', 'name', 'slug', 'is_primary', 'is_active', 'timezone', 'phone', 'address', 'city', 'district', 'created_at', 'updated_at'],
  customers: ['id', 'tenant_id', 'user_profile_id', 'full_name', 'phone', 'email', 'notes', 'created_at', 'updated_at'],
  appointments: ['id', 'tenant_id', 'branch_id', 'customer_id', 'staff_id', 'service_id', 'user_name', 'user_email', 'phone', 'notes', 'appointment_date', 'appointment_time', 'duration_minutes', 'status', 'cancel_reason', 'cancelled_at', 'cancelled_by', 'synced_to_google', 'created_at', 'updated_at'],
  subscriptions: ['id', 'tenant_id', 'plan_id', 'status', 'billing_source', 'paid_through_date', 'trial_end', 'cancel_at_period_end', 'created_at', 'updated_at'],
  appointment_access_tokens: ['id', 'appointment_id', 'tenant_id', 'token', 'action_scope', 'expires_at', 'used_at', 'revoked_at', 'created_at'],
  appointment_change_requests: ['id', 'tenant_id', 'appointment_id', 'request_type', 'proposed_date', 'proposed_time', 'reason', 'status', 'reviewed_by', 'reviewed_at', 'created_at'],
  communication_outbox: ['id', 'tenant_id', 'appointment_id', 'customer_id', 'audience', 'channel', 'type', 'status', 'payload', 'scheduled_for', 'sent_at', 'created_at'],
  audit_events: ['id', 'tenant_id', 'user_id', 'action', 'entity_type', 'entity_id', 'details', 'created_at'],
  support_tickets: ['id', 'tenant_id', 'user_id', 'subject', 'description', 'status', 'priority', 'created_at'],
  policy_acceptances: ['id', 'tenant_id', 'user_id', 'policy_version', 'accepted_at'],
  consent_ledger: ['id', 'tenant_id', 'customer_id', 'consent_type', 'granted', 'timestamp'],
  data_rights_requests: ['id', 'tenant_id', 'customer_id', 'request_type', 'status', 'created_at']
};

const rpcs = {
  get_my_admin_bootstrap: { returnType: 'jsonb', securityDefiner: true, anonExecute: false, authenticatedExecute: true },
  get_my_tenant_appointments: { returnType: 'jsonb', securityDefiner: true, anonExecute: false, authenticatedExecute: true },
  get_my_tenant_dashboard_summary: { returnType: 'jsonb', securityDefiner: true, anonExecute: false, authenticatedExecute: true },
  current_user_owns_customer: { returnType: 'boolean', securityDefiner: true, anonExecute: false, authenticatedExecute: true },
  current_user_can_access_tenant: { returnType: 'boolean', securityDefiner: true, anonExecute: false, authenticatedExecute: true },
  get_public_available_slots: { returnType: 'jsonb', securityDefiner: true, anonExecute: true, authenticatedExecute: true },
  create_public_booking: { returnType: 'jsonb', securityDefiner: true, anonExecute: true, authenticatedExecute: true },
  get_public_booking_eligibility: { returnType: 'jsonb', securityDefiner: true, anonExecute: true, authenticatedExecute: true },
  approve_and_publish_tenant: { returnType: 'jsonb', securityDefiner: true, anonExecute: false, authenticatedExecute: true },
  create_tenant_with_owner: { returnType: 'jsonb', securityDefiner: true, anonExecute: false, authenticatedExecute: true }
};

// =========================================================================
// B. APPLICATION QUERY MANIFEST DISCOVERY
// =========================================================================
const dirsToScan = ['services', 'pages', 'components', 'contexts'];
const appOps = [];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/');

  // Match .from('table') calls
  const fromRegex = /\.from\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = fromRegex.exec(content)) !== null) {
    const tableName = match[1];
    const lineNum = content.substring(0, match.index).split('\n').length;
    const snippet = content.substring(match.index, match.index + 300);

    const isSingle = snippet.includes('.single()');
    const isMaybeSingle = snippet.includes('.maybeSingle()');

    // Extract select columns if present
    const selectMatch = /\.select\s*\(\s*['"]([^'"]+)['"]\s*\)/.exec(snippet);
    const selectCols = selectMatch ? selectMatch[1] : '*';

    appOps.push({
      file: relPath,
      line: lineNum,
      type: 'table_query',
      target: tableName,
      selectCols,
      isSingle,
      isMaybeSingle,
      snippet: snippet.split('\n')[0]
    });
  }

  // Match RPC calls
  const rpcRegex = /(\.rpc\s*\(\s*['"]([^'"]+)['"]|fetchSupabase\s*\(\s*['"]\/rest\/v1\/rpc\/([^'"]+)['"])/g;
  while ((match = rpcRegex.exec(content)) !== null) {
    const rpcName = match[2] || match[3];
    const lineNum = content.substring(0, match.index).split('\n').length;
    appOps.push({
      file: relPath,
      line: lineNum,
      type: 'rpc_call',
      target: rpcName,
      snippet: content.substring(match.index, match.index + 150).split('\n')[0]
    });
  }
}

function traverse(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return;
  const entries = fs.readdirSync(full, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) traverse(p);
    else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.mjs'))) {
      scanFile(path.join(ROOT, p));
    }
  }
}

dirsToScan.forEach(traverse);

// =========================================================================
// C. AUTOMATED CONTRACT MISMATCH COMPARISON
// =========================================================================
const mismatches = [];

for (const op of appOps) {
  if (op.type === 'table_query') {
    // 1. Nonexistent table check
    if (!tables[op.target]) {
      mismatches.push({
        file: op.file,
        line: op.line,
        category: 'NON_EXISTENT_TABLE',
        detail: `App queries table "${op.target}" which is not in live schema manifest.`
      });
    } else {
      // 2. Nonexistent column check if specific columns are selected
      if (op.selectCols !== '*') {
        const cols = op.selectCols.split(',').map(c => c.trim().split('!')[0].split(':')[0].trim());
        for (const col of cols) {
          if (col && col !== '*' && !col.includes('(') && !col.includes('->') && !tables[op.target].includes(col)) {
            mismatches.push({
              file: op.file,
              line: op.line,
              category: 'NON_EXISTENT_COLUMN',
              detail: `App selects column "${col}" from table "${op.target}" which does not exist.`
            });
          }
        }
      }

      // 3. .single() on optional table check (e.g. tenant_branding, tenant_business_profiles)
      if (op.isSingle && (op.target === 'tenant_branding' || op.target === 'tenant_business_profiles')) {
        mismatches.push({
          file: op.file,
          line: op.line,
          category: 'SINGLE_ON_OPTIONAL_ROW',
          detail: `App calls .single() on optional table "${op.target}" which throws PGRST116 when 0 rows match.`
        });
      }

      // 4. Redundant direct query on Admin route that should use get_my_admin_bootstrap
      if (op.file.includes('AdminPage.tsx') || op.file.includes('useAdminBootstrap.ts')) {
        if (['services', 'staff', 'branches', 'subscriptions'].includes(op.target)) {
          mismatches.push({
            file: op.file,
            line: op.line,
            category: 'REDUNDANT_DIRECT_ADMIN_QUERY',
            detail: `Admin page directly queries table "${op.target}" instead of consuming get_my_admin_bootstrap payload.`
          });
        }
      }
    }
  } else if (op.type === 'rpc_call') {
    // 5. Nonexistent RPC check
    if (!rpcs[op.target]) {
      mismatches.push({
        file: op.file,
        line: op.line,
        category: 'NON_EXISTENT_RPC',
        detail: `App calls RPC "${op.target}" which is not defined in live schema.`
      });
    }
  }
}

console.log('=== AUDIT SUMMARY ===');
console.log(`Total Public Tables: ${Object.keys(tables).length}`);
console.log(`Total Public RPCs: ${Object.keys(rpcs).length}`);
console.log(`Total Frontend Query Operations Scanned: ${appOps.length}`);
console.log(`Total Contract Mismatches Found: ${mismatches.length}`);

fs.writeFileSync(path.join(ROOT, 'audit_mismatches.json'), JSON.stringify(mismatches, null, 2));
console.log('Mismatches exported to audit_mismatches.json');
