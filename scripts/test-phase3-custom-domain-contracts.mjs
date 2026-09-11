/**
 * Static Contract Test: Phase 3 Lane 4 Custom Domain Verification Foundation
 * Authority: LARI-PROGRAM-V2-PHASE3-CUSTOM-DOMAIN-VERIFICATION-20260911-01
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
    name: 'custom_domains table defined with required schema fields',
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
    name: 'status check constraint enforces domain lifecycle states',
    test: () =>
      migrationSql.includes('chk_custom_domains_status') &&
      migrationSql.includes('pending_verification') &&
      migrationSql.includes('verified') &&
      migrationSql.includes('failed')
  },
  {
    name: 'provider_status enforces DOMAIN_PROVIDER_READY_NOT_CONNECTED invariant',
    test: () =>
      migrationSql.includes('chk_custom_domains_provider_status') &&
      migrationSql.includes('DOMAIN_PROVIDER_READY_NOT_CONNECTED')
  },
  {
    name: 'single-domain ownership invariant enforced via unique index',
    test: () =>
      migrationSql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_domains_normalized_hostname') &&
      migrationSql.includes('ON public.custom_domains(normalized_hostname)')
  },
  {
    name: 'Row-Level Security enabled on custom_domains',
    test: () =>
      migrationSql.includes('ALTER TABLE public.custom_domains ENABLE ROW LEVEL SECURITY;')
  },
  {
    name: 'hostname normalization function handles trimming, protocol stripping, and validation',
    test: () =>
      migrationSql.includes('CREATE OR REPLACE FUNCTION public.normalize_custom_hostname') &&
      migrationSql.includes('regexp_replace(v_norm, \'^https?://\', \'\', \'i\')')
  },
  {
    name: 'hostname normalization rejects platform and apex hijacking',
    test: () =>
      migrationSql.includes('FORBIDDEN_PLATFORM_DOMAIN') &&
      migrationSql.includes('randevulari.com')
  },
  {
    name: 'request_custom_domain RPC enforces tenant isolation and challenge generation',
    test: () =>
      migrationSql.includes('CREATE OR REPLACE FUNCTION public.request_custom_domain') &&
      migrationSql.includes('DOMAIN_ALREADY_REGISTERED_BY_OTHER_TENANT') &&
      migrationSql.includes('verification_token') &&
      migrationSql.includes('DOMAIN_PROVIDER_READY_NOT_CONNECTED')
  },
  {
    name: 'verify_custom_domain implements deterministic provider-neutral test verification',
    test: () =>
      migrationSql.includes('CREATE OR REPLACE FUNCTION public.verify_custom_domain') &&
      migrationSql.includes('TEST_PROVIDER_SIMULATED_VERIFIED') &&
      migrationSql.includes('TEST_PROVIDER_SIMULATED_FAILED') &&
      migrationSql.includes('DNS_RECORD_MISMATCH')
  },
  {
    name: 'recheck_custom_domain returns full verification lifecycle state',
    test: () =>
      migrationSql.includes('CREATE OR REPLACE FUNCTION public.recheck_custom_domain') &&
      migrationSql.includes('last_checked_at')
  },
  {
    name: 'remove_custom_domain provides safe tenant-scoped revocation',
    test: () =>
      migrationSql.includes('CREATE OR REPLACE FUNCTION public.remove_custom_domain') &&
      migrationSql.includes('DELETE FROM public.custom_domains')
  },
  {
    name: 'resolve_tenant_by_custom_domain resolves verified domain to tenant metadata',
    test: () =>
      migrationSql.includes('CREATE OR REPLACE FUNCTION public.resolve_tenant_by_custom_domain') &&
      migrationSql.includes('cd.status = \'verified\'')
  },
  {
    name: 'Direct public access strictly denied; anon permissions limited to resolution RPC',
    test: () =>
      migrationSql.includes('REVOKE ALL ON TABLE public.custom_domains FROM anon, public;') &&
      migrationSql.includes('GRANT EXECUTE ON FUNCTION public.resolve_tenant_by_custom_domain(TEXT) TO anon')
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
console.log('ALL PHASE 3 LANE 4 CUSTOM DOMAIN CONTRACTS PASS.');
