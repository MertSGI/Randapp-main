/**
 * Contract verification test suite for Phase 3 Customer 360 & Segmentation Foundation
 * Authority: LARI-AOS-PROGRAM-V2-CONTINUATION-AND-LIVE-RELAY-R1-20260911-01
 * Program: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}`);
    failed++;
  }
}

console.log('=== Phase 3 Customer 360 & Segmentation Contract Tests ===\n');

// 1. Verify Migration File
const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260921_phase3_customer360_segmentation_foundation.sql');
const migrationSql = readFileSync(migrationPath, 'utf-8');

console.log('1. Database Migration Structural Integrity:');
assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.customer_segments'), 'Defines customer_segments table');
assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.customer_segment_members'), 'Defines customer_segment_members table');
assert(migrationSql.includes('REFERENCES public.customers(id)'), 'Reuses canonical public.customers(id) - no customers_v2');
assert(migrationSql.includes('public.customer_memory'), 'Reuses and secures canonical public.customer_memory');
assert(!migrationSql.includes('CREATE TABLE IF NOT EXISTS public.customers_v2') && !migrationSql.includes('CREATE TABLE public.customers_v2'), 'Zero occurrences of duplicate customers_v2 table creation');

console.log('\n2. Security & Trust Boundaries:');
assert(migrationSql.includes('REVOKE ALL ON public.customer_segments FROM PUBLIC'), 'Revokes direct table SELECT/INSERT/UPDATE from PUBLIC');
assert(migrationSql.includes('REVOKE ALL ON public.customer_segments FROM authenticated'), 'Revokes direct table access from authenticated browser clients');
assert(migrationSql.includes('REVOKE ALL ON public.customer_segment_members FROM authenticated'), 'Revokes segment members direct access from authenticated browser clients');
assert(migrationSql.includes('REVOKE ALL ON public.customer_memory FROM authenticated'), 'Revokes customer memory direct access from authenticated browser clients');
assert(migrationSql.includes('GRANT EXECUTE ON FUNCTION public.get_customer_360_view(UUID, UUID) TO authenticated'), 'Sanitized read RPC granted to authenticated');
assert(migrationSql.includes('GRANT EXECUTE ON FUNCTION public.get_customer_360_view(UUID, UUID) TO service_role'), 'Trusted RPC explicitly granted to service_role');
assert(migrationSql.includes('is_tenant_staff'), 'Enforces tenant staff verification in security definer functions');

console.log('\n3. TypeScript Customer360Service Contract:');
const servicePath = resolve(process.cwd(), 'services/customer360Service.ts');
const serviceTs = readFileSync(servicePath, 'utf-8');
assert(serviceTs.includes('Customer360Service'), 'Exports Customer360Service class');
assert(serviceTs.includes('getCustomer360View'), 'Implements getCustomer360View method');
assert(serviceTs.includes('listSegments'), 'Implements listSegments method');
assert(serviceTs.includes('assignCustomerToSegment'), 'Implements assignCustomerToSegment method');
assert(serviceTs.includes('removeCustomerFromSegment'), 'Implements removeCustomerFromSegment method');

console.log(`\n==================================================`);
console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
console.log(`==================================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
