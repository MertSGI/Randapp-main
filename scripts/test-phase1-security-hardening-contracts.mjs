import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('--- Phase 1.1 Security Hardening Static Verification ---');

const migrationPath = path.join(rootDir, 'supabase', 'migrations', '20260915_phase1_security_surface_hardening.sql');

if (!fs.existsSync(migrationPath)) {
  console.error('FAIL: Migration file does not exist:', migrationPath);
  process.exit(1);
}

const content = fs.readFileSync(migrationPath, 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

// S-01
assert(content.includes('REVOKE ALL PRIVILEGES ON TABLE public.ht_rate_limit_buckets FROM PUBLIC'), 'S-01: Revokes PUBLIC table privileges on ht_rate_limit_buckets');
assert(content.includes('REVOKE ALL PRIVILEGES ON TABLE public.ht_rate_limit_buckets FROM anon'), 'S-01: Revokes anon table privileges on ht_rate_limit_buckets');
assert(content.includes('REVOKE ALL PRIVILEGES ON TABLE public.ht_rate_limit_buckets FROM authenticated'), 'S-01: Revokes authenticated table privileges on ht_rate_limit_buckets');
assert(content.includes('ALTER TABLE public.ht_rate_limit_buckets ENABLE ROW LEVEL SECURITY'), 'S-01: Enables RLS on ht_rate_limit_buckets');
assert(content.includes('GRANT ALL PRIVILEGES ON TABLE public.ht_rate_limit_buckets TO service_role'), 'S-01: Grants service_role table privileges');

// S-02
assert(content.includes('CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)'), 'S-02: Defines get_user_role');
assert(/get_user_role[\s\S]*?SET search_path = pg_catalog, public/.test(content), 'S-02: get_user_role sets search_path');
assert(content.includes('REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon'), 'S-02: Revokes anon execute on get_user_role');
assert(content.includes('CREATE OR REPLACE FUNCTION public.get_user_tenant_id(user_id uuid)'), 'S-02: Defines get_user_tenant_id');
assert(/get_user_tenant_id[\s\S]*?SET search_path = pg_catalog, public/.test(content), 'S-02: get_user_tenant_id sets search_path');
assert(content.includes('REVOKE EXECUTE ON FUNCTION public.get_user_tenant_id(uuid) FROM anon'), 'S-02: Revokes anon execute on get_user_tenant_id');

// S-03
assert(content.includes('CREATE OR REPLACE FUNCTION public.is_super_admin(user_id uuid)'), 'S-03: Defines is_super_admin');
assert(/is_super_admin[\s\S]*?SET search_path = pg_catalog, public/.test(content), 'S-03: is_super_admin sets search_path');
assert(content.includes('REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon'), 'S-03: Revokes anon execute on is_super_admin');

// S-04
assert(content.includes('CREATE OR REPLACE FUNCTION public.update_updated_at_column()'), 'S-04: Defines update_updated_at_column');
assert(/update_updated_at_column[\s\S]*?SET search_path = pg_catalog, public/.test(content), 'S-04: update_updated_at_column sets search_path');
assert(content.includes('CREATE OR REPLACE FUNCTION public.update_tenant_business_profiles_updated_at_column()'), 'S-04: Defines update_tenant_business_profiles_updated_at_column');
assert(/update_tenant_business_profiles_updated_at_column[\s\S]*?SET search_path = pg_catalog, public/.test(content), 'S-04: update_tenant_business_profiles_updated_at_column sets search_path');

console.log('✅ ALL Phase 1.1 security static contract assertions passed successfully!');
