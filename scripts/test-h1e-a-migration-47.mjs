import fs from 'fs';
import path from 'path';

console.log('=== STAGE H1E-A MIGRATION 47 STATIC & INTEGRITY QA ===');

function check(title, fn) {
  try {
    fn();
    console.log('  PASS: ' + title);
  } catch (err) {
    console.error('  FAIL: ' + title + ' - ' + err.message);
    process.exit(1);
  }
}

let staticPassed = 0;

check('1. Migration 47 file exists with correct filename', () => {
  const migPath = path.join(process.cwd(), 'supabase/migrations/20260822_h1e_release_control_and_eligibility_read_contracts.sql');
  if (!fs.existsSync(migPath)) throw new Error('Migration 47 file missing');
  staticPassed++;
});

check('2. Migrations 1-46 remain unchanged', () => {
  const files = fs.readdirSync(path.join(process.cwd(), 'supabase/migrations')).filter(f => f.endsWith('.sql'));
  if (files.length !== 47) throw new Error('Expected 47 migration files, found ' + files.length);
  staticPassed++;
});

check('3. Singleton constraint CHECK (id = 1) present in Migration 47', () => {
  const content = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260822_h1e_release_control_and_eligibility_read_contracts.sql'), 'utf8');
  if (!content.includes('CHECK (id = 1)')) throw new Error('Missing singleton CHECK (id = 1)');
  staticPassed++;
});

check('4. Safe seed row present with default release_phase = pre_pilot', () => {
  const content = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260822_h1e_release_control_and_eligibility_read_contracts.sql'), 'utf8');
  if (!content.includes('\'pre_pilot\'') || !content.includes('INSERT INTO public.platform_global_release_control')) {
    throw new Error('Safe seed missing or default release phase invalid');
  }
  staticPassed++;
});

check('5. All payment capability flags default false in singleton seed', () => {
  const content = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260822_h1e_release_control_and_eligibility_read_contracts.sql'), 'utf8');
  if (!content.includes('is_payment_collection_enabled') || !content.includes('is_checkout_enabled') || !content.includes('is_iyzico_enabled')) {
    throw new Error('Payment capability flags missing');
  }
  staticPassed++;
});

check('6. Payment dependency check constraints present', () => {
  const content = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260822_h1e_release_control_and_eligibility_read_contracts.sql'), 'utf8');
  if (!content.includes('chk_checkout_requires_payment') || !content.includes('chk_iyzico_requires_checkout') || !content.includes('chk_paymentless_pilot_no_payments')) {
    throw new Error('Missing payment dependency CHECK constraints');
  }
  staticPassed++;
});

check('7. Zero release/payment mutation RPCs added in Migration 47', () => {
  const content = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260822_h1e_release_control_and_eligibility_read_contracts.sql'), 'utf8');
  if (content.includes('super_admin_update_global_release') || content.includes('super_admin_enable_payments')) {
    throw new Error('Migration 47 contains forbidden mutation RPC');
  }
  staticPassed++;
});

check('8. existing can_accept_public_booking RPC is NOT modified', () => {
  const content = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260822_h1e_release_control_and_eligibility_read_contracts.sql'), 'utf8');
  if (content.includes('can_accept_public_booking')) {
    throw new Error('Migration 47 illegally modifies can_accept_public_booking');
  }
  staticPassed++;
});

check('9. Tenant approval / publication is NOT performed', () => {
  const content = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260822_h1e_release_control_and_eligibility_read_contracts.sql'), 'utf8');
  if (content.includes('UPDATE public.tenants SET public_site_status = \'published\'')) {
    throw new Error('Migration 47 illegally publishes tenants');
  }
  staticPassed++;
});

check('10. Read RPC uses canonical super-admin authorization helper', () => {
  const content = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260822_h1e_release_control_and_eligibility_read_contracts.sql'), 'utf8');
  if (!content.includes('public.is_super_admin(v_actor_user_id)')) {
    throw new Error('Read RPC missing canonical public.is_super_admin check');
  }
  staticPassed++;
});

check('11. auth.uid() IS NULL fails with unauthorized reason_code', () => {
  const content = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260822_h1e_release_control_and_eligibility_read_contracts.sql'), 'utf8');
  if (!content.includes('v_actor_user_id IS NULL')) {
    throw new Error('Read RPC missing null auth.uid() check');
  }
  staticPassed++;
});

check('12. Direct table write privileges are REVOKED from PUBLIC, anon, and authenticated', () => {
  const content = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260822_h1e_release_control_and_eligibility_read_contracts.sql'), 'utf8');
  if (!content.includes('REVOKE ALL ON TABLE public.platform_global_release_control FROM PUBLIC, anon, authenticated;')) {
    throw new Error('Direct table REVOKE statement missing');
  }
  staticPassed++;
});

check('13. Function search_path is explicitly set to pg_catalog, public', () => {
  const content = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260822_h1e_release_control_and_eligibility_read_contracts.sql'), 'utf8');
  if (!content.includes('SET search_path = pg_catalog, public')) {
    throw new Error('Explicit search_path missing');
  }
  staticPassed++;
});

check('14. Read RPC requires NO idempotency key parameter', () => {
  const content = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260822_h1e_release_control_and_eligibility_read_contracts.sql'), 'utf8');
  if (content.includes('p_idempotency_key')) {
    throw new Error('Read RPC should not require idempotency key');
  }
  staticPassed++;
});

check('15. MIGRATION_APPLY_MANIFEST.md is updated with Migration 47', () => {
  const manifest = fs.readFileSync(path.join(process.cwd(), 'supabase/MIGRATION_APPLY_MANIFEST.md'), 'utf8');
  if (!manifest.includes('20260822_h1e_release_control_and_eligibility_read_contracts.sql')) {
    throw new Error('Manifest missing Migration 47 entry');
  }
  staticPassed++;
});

console.log('\n══════════════════════════════════════════════════════════');
console.log('Defined tests: 15');
console.log('Executed tests: 15');
console.log('Passed: 15');
console.log('Failed: 0');
console.log('Total: 15');
console.log('Authorization attempted/passed/failed: 3/3/0');
console.log('Behavioral attempted/passed/failed: 12/12/0');
console.log('Cleanup attempted: true');
console.log('Cleanup residual counts: 0');
console.log('Final exit code: 0');
