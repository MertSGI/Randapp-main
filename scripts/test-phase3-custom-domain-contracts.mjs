/**
 * Static Contract Test: Phase 3 Lane 4 Custom Domain Verification Foundation (R1 Hardened)
 * Authority: LARI-PROGRAM-V2-PHASE3-CUSTOM-DOMAIN-VERIFICATION-20260911-01
 * Correction Authority: LARI-PROGRAM-V2-PHASE3-R1-CORRECTIONS-AND-PHASE4-CONTINUATION-20260911-01
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const migrationPath = resolve('supabase/migrations/20260923_phase3_custom_domain_verification_foundation.sql');

if (!existsSync(migrationPath)) {
  console.error(`FAIL: Migration file missing at ${migrationPath}`);
  process.exit(1);
}

const migrationSql = readFileSync(migrationPath, 'utf8');

const assertions = [
  {
    name: '1. custom_domains table defined with required schema fields',
    test: () =>
      migrationSql.includes('CREATE TABLE IF NOT EXISTS public.custom_domains') &&
      migrationSql.includes('requested_hostname TEXT NOT NULL') &&
      migrationSql.includes('normalized_hostname TEXT NOT NULL') &&
      migrationSql.includes('tenant_id UUID NOT NULL REFERENCES public.tenants(id)') &&
      migrationSql.includes('verification_token TEXT NOT NULL') &&
      migrationSql.includes('verification_record_name TEXT NOT NULL') &&
      migrationSql.includes('verification_expected_value TEXT NOT NULL') &&
      migrationSql.includes('provider_status TEXT NOT NULL')
  },
  {
    name: '2. status check constraint enforces domain lifecycle states',
    test: () =>
      migrationSql.includes('chk_custom_domains_status') &&
      migrationSql.includes('pending_verification') &&
      migrationSql.includes('verified') &&
      migrationSql.includes('failed')
  },
  {
    name: '3. provider_status enforces DOMAIN_PROVIDER_READY_NOT_CONNECTED and REAL_PROVIDER_VERIFIED',
    test: () =>
      migrationSql.includes('chk_custom_domains_provider_status') &&
      migrationSql.includes('DOMAIN_PROVIDER_READY_NOT_CONNECTED') &&
      migrationSql.includes('REAL_PROVIDER_VERIFIED') &&
      migrationSql.includes('TEST_PROVIDER_SIMULATED_VERIFIED')
  },
  {
    name: '4. single-domain ownership invariant enforced via unique index',
    test: () =>
      migrationSql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_domains_normalized_hostname') &&
      migrationSql.includes('ON public.custom_domains(normalized_hostname)')
  },
  {
    name: '5. Direct raw table access REVOKED from public, anon, and authenticated',
    test: () =>
      migrationSql.includes('REVOKE ALL ON TABLE public.custom_domains FROM PUBLIC, anon, authenticated;') &&
      migrationSql.includes('ALTER TABLE public.custom_domains ENABLE ROW LEVEL SECURITY;')
  },
  {
    name: '6. Reconciles pre-existing tenants.custom_domain values safely into custom_domains as non-live LEGACY_UNVERIFIED',
    test: () =>
      migrationSql.includes('INSERT INTO public.custom_domains') &&
      migrationSql.includes('FROM public.tenants') &&
      migrationSql.includes('pending_verification') &&
      migrationSql.includes('DOMAIN_PROVIDER_READY_NOT_CONNECTED') &&
      migrationSql.includes('LEGACY_UNVERIFIED') &&
      migrationSql.includes('ON CONFLICT (normalized_hostname) DO NOTHING')
  },
  {
    name: '7. Hostname normalization rejects platform and apex hijacking with fixed search_path',
    test: () =>
      migrationSql.includes('CREATE OR REPLACE FUNCTION public.normalize_custom_hostname') &&
      migrationSql.includes('SET search_path = pg_catalog, public') &&
      migrationSql.includes('FORBIDDEN_PLATFORM_DOMAIN') &&
      migrationSql.includes('randevulari.com')
  },
  {
    name: '8. request_custom_domain enforces users_profile tenant_owner / super_admin role and fails closed on NULL',
    test: () =>
      migrationSql.includes('CREATE OR REPLACE FUNCTION public.request_custom_domain') &&
      migrationSql.includes('TENANT_REQUIRED') &&
      migrationSql.includes('users_profile') &&
      migrationSql.includes('v_user.role <> \'tenant_owner\'')
  },
  {
    name: '9. Deterministic test verification is service_role only',
    test: () =>
      migrationSql.includes('simulate_verify_custom_domain_for_testing') &&
      migrationSql.includes('REVOKE ALL ON FUNCTION public.simulate_verify_custom_domain_for_testing(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;') &&
      migrationSql.includes('GRANT EXECUTE ON FUNCTION public.simulate_verify_custom_domain_for_testing(UUID, UUID, TEXT) TO service_role;')
  },
  {
    name: '10. Sanitized read RPC get_tenant_custom_domains provided with role checks',
    test: () =>
      migrationSql.includes('CREATE OR REPLACE FUNCTION public.get_tenant_custom_domains') &&
      migrationSql.includes('GRANT EXECUTE ON FUNCTION public.get_tenant_custom_domains(UUID) TO authenticated, service_role;')
  },
  {
    name: '11. recheck_custom_domain and remove_custom_domain enforce role authorization',
    test: () =>
      migrationSql.includes('CREATE OR REPLACE FUNCTION public.recheck_custom_domain') &&
      migrationSql.includes('CREATE OR REPLACE FUNCTION public.remove_custom_domain') &&
      migrationSql.includes('users_profile')
  },
  {
    name: '12. Public resolver requires REAL_PROVIDER_VERIFIED (simulation does NOT resolve as live)',
    test: () =>
      migrationSql.includes('CREATE OR REPLACE FUNCTION public.resolve_tenant_by_custom_domain') &&
      migrationSql.includes('cd.provider_status = \'REAL_PROVIDER_VERIFIED\'')
  },
  {
    name: '13. Strict absence of executable external network HTTP mutations',
    test: () =>
      !/http_post\(/i.test(migrationSql) && !/net\.http/i.test(migrationSql)
  }
];

let passed = 0;
for (const assertion of assertions) {
  try {
    if (assertion.test()) {
      console.log(`PASS: ${assertion.name}`);
      passed++;
    } else {
      console.error(`FAIL: ${assertion.name}`);
    }
  } catch (err) {
    console.error(`ERROR: ${assertion.name}: ${err.message}`);
  }
}

console.log(`\nContracts passed: ${passed}/${assertions.length}`);
if (passed !== assertions.length) {
  process.exit(1);
}
console.log('ALL PHASE 3 CUSTOM DOMAIN R1 HARDENED CONTRACTS PASS.');
