// scripts/test-phase7-node1-verified-reviews-contracts.mjs
// Phase 7 Node 1: Verified Reviews Foundation Static Contracts
// Directly asserts all required schema, function, pagination, boundary, and security contracts.

import fs from 'fs';
import path from 'path';

const migrationPath = path.resolve('supabase/migrations/20261004_phase7_node1_verified_reviews_foundation.sql');
const workflowPath = path.resolve('.github/workflows/lari-phase5-postgres-acceptance.yml');

console.log('===============================================================');
console.log('STARTING PHASE 7 NODE 1 STATIC CONTRACT VERIFICATION');
console.log(`Checking migration: ${migrationPath}`);
console.log('===============================================================\n');

if (!fs.existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');
const workflowYaml = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';

let testsExecuted = 0;
let testsPassed = 0;
let testsFailed = 0;

function assertContract(name, checkFn, detail = '') {
  testsExecuted++;
  let passed = false;
  try {
    passed = Boolean(checkFn());
  } catch (err) {
    passed = false;
    detail = err.message;
  }

  if (passed) {
    testsPassed++;
    console.log(`  [PASS] ${name}`);
  } else {
    testsFailed++;
    console.error(`  [FAIL] ${name}${detail ? ' - ' + detail : ''}`);
  }
}

// -----------------------------------------------------------------------------
// 1. Table Definitions & Structural Constraints
// -----------------------------------------------------------------------------
assertContract(
  '1. Migration header references 20261004_phase7_node1_verified_reviews_foundation.sql',
  () => sql.includes('20261004_phase7_node1_verified_reviews_foundation.sql')
);

assertContract(
  '2. public.reviews table defined with canonical columns and foreign keys',
  () => sql.includes('CREATE TABLE IF NOT EXISTS public.reviews') &&
        sql.includes('tenant_id           UUID NOT NULL REFERENCES public.tenants(id)') &&
        sql.includes('branch_id           UUID NOT NULL REFERENCES public.branches(id)') &&
        sql.includes('appointment_id      UUID NOT NULL REFERENCES public.appointments(id)') &&
        sql.includes('customer_id         UUID NOT NULL REFERENCES public.customers(id)') &&
        sql.includes('service_id          UUID NOT NULL REFERENCES public.services(id)') &&
        sql.includes('staff_id            UUID NOT NULL REFERENCES public.staff(id)')
);

assertContract(
  '3. public.reviews rating column bounded between 1 and 5 (SMALLINT internally)',
  () => sql.includes('rating              SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5)')
);

assertContract(
  '4. public.reviews title and content bounded (160 and 4000 characters)',
  () => sql.includes('title               TEXT NULL CHECK (title IS NULL OR length(trim(title)) <= 160)') &&
        sql.includes('content             TEXT NULL CHECK (content IS NULL OR length(trim(content)) <= 4000)')
);

assertContract(
  '5. public.reviews response_text bounded to 4000 characters',
  () => sql.includes('response_text       TEXT NULL CHECK (response_text IS NULL OR length(trim(response_text)) <= 4000)')
);

assertContract(
  '6. public.reviews supports responder staff and responder user identity (responded_by_user_id)',
  () => sql.includes('responded_by        UUID NULL REFERENCES public.staff(id)') &&
        sql.includes('responded_by_user_id UUID NULL REFERENCES public.users_profile(id)')
);

assertContract(
  '7. Dual-layer uniqueness constraints on public.reviews',
  () => sql.includes('CONSTRAINT uq_reviews_tenant_appointment_customer UNIQUE (tenant_id, appointment_id, customer_id)') &&
        sql.includes('CONSTRAINT uq_reviews_tenant_idempotency UNIQUE (tenant_id, idempotency_key)') &&
        sql.includes('CONSTRAINT uq_reviews_id_tenant UNIQUE (id, tenant_id)')
);

assertContract(
  '8. public.review_idempotency_keys table defined with composite primary key',
  () => sql.includes('CREATE TABLE IF NOT EXISTS public.review_idempotency_keys') &&
        sql.includes('tenant_id           UUID NOT NULL REFERENCES public.tenants(id)') &&
        sql.includes('review_id           UUID NOT NULL REFERENCES public.reviews(id)') &&
        sql.includes('PRIMARY KEY (tenant_id, idempotency_key)')
);

// -----------------------------------------------------------------------------
// 2. Security, RLS, and Revocation Controls
// -----------------------------------------------------------------------------
assertContract(
  '9. Row Level Security enabled on both reviews tables',
  () => sql.includes('ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;') &&
        sql.includes('ALTER TABLE public.review_idempotency_keys ENABLE ROW LEVEL SECURITY;')
);

assertContract(
  '10. Direct table access revoked from PUBLIC, anon, authenticated',
  () => sql.includes('REVOKE ALL ON TABLE public.reviews FROM PUBLIC, anon, authenticated;') &&
        sql.includes('REVOKE ALL ON TABLE public.review_idempotency_keys FROM PUBLIC, anon, authenticated;')
);

assertContract(
  '11. Explicit service_role grants on reviews and review_idempotency_keys',
  () => sql.includes('GRANT SELECT, INSERT, UPDATE ON TABLE public.reviews TO service_role;') &&
        sql.includes('GRANT SELECT, INSERT ON TABLE public.review_idempotency_keys TO service_role;')
);

assertContract(
  '12. All 4 RPCs define SECURITY DEFINER and SET search_path = pg_catalog, public',
  () => {
    const rpcCount = (sql.match(/CREATE OR REPLACE FUNCTION public\.(create_verified_review|get_public_reviews|get_tenant_reviews|moderate_review)/g) || []).length;
    const secDefCount = (sql.match(/SECURITY DEFINER/g) || []).length;
    const searchPathCount = (sql.match(/SET search_path = pg_catalog, public/g) || []).length;
    return rpcCount === 4 && secDefCount >= 4 && searchPathCount >= 4;
  }
);

assertContract(
  '13. Canonical audit_events inserted on create and moderate',
  () => {
    const auditMatches = sql.match(/INSERT INTO public\.audit_events/g) || [];
    return auditMatches.length >= 2 &&
           sql.includes("'review_created'") &&
           sql.includes("'review_moderated'") &&
           sql.includes("'reviews'");
  }
);

// -----------------------------------------------------------------------------
// 3. create_verified_review Contracts
// -----------------------------------------------------------------------------
assertContract(
  '14. create_verified_review signature uses INTEGER for p_rating and legal default for p_idempotency_key',
  () => /CREATE OR REPLACE FUNCTION public\.create_verified_review\(\s*p_appointment_id\s+UUID,\s*p_rating\s+INTEGER,\s*p_title\s+TEXT DEFAULT NULL,\s*p_content\s+TEXT DEFAULT NULL,\s*p_idempotency_key\s+TEXT DEFAULT NULL\s*\)/.test(sql)
);

assertContract(
  '15. create_verified_review exact REVOKE and GRANT use (UUID, INTEGER, TEXT, TEXT, TEXT)',
  () => sql.includes('REVOKE ALL ON FUNCTION public.create_verified_review(UUID, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon;') &&
        sql.includes('GRANT EXECUTE ON FUNCTION public.create_verified_review(UUID, INTEGER, TEXT, TEXT, TEXT) TO authenticated;')
);

assertContract(
  '16. create_verified_review safely casts rating::smallint for storage',
  () => sql.includes('p_rating::smallint')
);

assertContract(
  '17. create_verified_review validates non-null, non-blank, max 200 char idempotency key',
  () => sql.includes("p_idempotency_key IS NULL OR trim(p_idempotency_key) = ''") &&
        sql.includes('idempotency_key is required') &&
        sql.includes('length(v_idempotency_clean) > 200')
);

assertContract(
  '18. create_verified_review explicitly checks p_rating IS NULL or out of bounds (1..5)',
  () => sql.includes('p_rating IS NULL OR p_rating < 1 OR p_rating > 5') &&
        sql.includes('Rating must be between 1 and 5.')
);

assertContract(
  '19. create_verified_review bounds p_title <= 160 and p_content <= 4000',
  () => sql.includes('length(v_title_clean) > 160') &&
        sql.includes('length(v_content_clean) > 4000')
);

assertContract(
  '20. create_verified_review binds customer identity using appointment customer_id, tenant_id, and caller uid',
  () => sql.includes('c.id = v_appointment.customer_id') &&
        sql.includes('c.tenant_id = v_appointment.tenant_id') &&
        sql.includes('c.user_profile_id = v_caller_uid')
);

assertContract(
  '21. create_verified_review acquires tenant-scoped idempotency lock then appointment lock before decision logic',
  () => {
    const idemLockIdx = sql.indexOf("'review:idempotency:' ||");
    const appLockIdx = sql.indexOf("'review:appointment:' ||");
    const replayIdx = sql.indexOf('SELECT 1 FROM public.review_idempotency_keys');
    const dupIdx = sql.indexOf('SELECT 1 FROM public.reviews');
    return idemLockIdx > 0 &&
           appLockIdx > idemLockIdx &&
           replayIdx > appLockIdx &&
           dupIdx > appLockIdx &&
           sql.includes('hashtextextended');
  }
);

assertContract(
  '22. create_verified_review enforces payload equality on replay and raises IDEMPOTENCY_CONFLICT on mismatch',
  () => sql.includes('IDEMPOTENCY_CONFLICT: Idempotency key reused with different request payload') &&
        sql.includes('v_existing_review.appointment_id = p_appointment_id') &&
        sql.includes('v_existing_review.customer_id = v_customer.id') &&
        sql.includes('v_existing_review.rating = p_rating') &&
        sql.includes('(v_existing_review.title IS NOT DISTINCT FROM v_title_clean)') &&
        sql.includes('(v_existing_review.content IS NOT DISTINCT FROM v_content_clean)')
);

assertContract(
  '23. create_verified_review handles same-appointment/customer duplicate with duplicate_review',
  () => sql.includes("'reason_code', 'duplicate_review'")
);

assertContract(
  '24. create_verified_review preserves completed-appointment eligibility gate',
  () => sql.includes("v_appointment.status <> 'completed'") &&
        sql.includes("'reason_code', 'appointment_not_completed'")
);

// -----------------------------------------------------------------------------
// 4. get_public_reviews Contracts
// -----------------------------------------------------------------------------
assertContract(
  '25. get_public_reviews signature uses INTEGER for p_min_rating',
  () => /CREATE OR REPLACE FUNCTION public\.get_public_reviews\(\s*p_tenant_slug\s+TEXT,\s*p_branch_id\s+UUID DEFAULT NULL,\s*p_service_id\s+UUID DEFAULT NULL,\s*p_staff_id\s+UUID DEFAULT NULL,\s*p_min_rating\s+INTEGER DEFAULT NULL/.test(sql) &&
        sql.includes('REVOKE ALL ON FUNCTION public.get_public_reviews(TEXT, UUID, UUID, UUID, INTEGER, INTEGER, INTEGER)') &&
        sql.includes('GRANT EXECUTE ON FUNCTION public.get_public_reviews(TEXT, UUID, UUID, UUID, INTEGER, INTEGER, INTEGER)')
);

assertContract(
  '26. get_public_reviews validates bounds for p_limit (explicit IS NULL or 1..100) and p_offset (explicit IS NULL or >=0)',
  () => sql.includes('p_limit IS NULL OR p_limit < 1 OR p_limit > 100') &&
        sql.includes('p_offset IS NULL OR p_offset < 0') &&
        sql.includes('p_min_rating IS NOT NULL AND (p_min_rating < 1 OR p_min_rating > 5)')
);

assertContract(
  '27. get_public_reviews applies ORDER BY + LIMIT/OFFSET in subquery/CTE before json aggregation and orders jsonb_agg',
  () => sql.includes('WITH paged_reviews AS (') &&
        sql.includes('ORDER BY r.created_at DESC, r.id DESC') &&
        sql.includes('LIMIT p_limit OFFSET p_offset') &&
        sql.includes('ORDER BY pr.created_at DESC, pr.id DESC')
);

assertContract(
  '28. get_public_reviews aggregate statistics calculate totals over complete filtered result',
  () => {
    const subqueryLimitIdx = sql.indexOf('LIMIT p_limit OFFSET p_offset');
    const aggIdx = sql.indexOf('-- Aggregate statistics over complete filtered set (unaffected by LIMIT / OFFSET)');
    return subqueryLimitIdx > 0 && aggIdx > subqueryLimitIdx;
  }
);

// -----------------------------------------------------------------------------
// 5. get_tenant_reviews Contracts
// -----------------------------------------------------------------------------
assertContract(
  '29. get_tenant_reviews signature uses INTEGER for p_min_rating',
  () => /CREATE OR REPLACE FUNCTION public\.get_tenant_reviews\(\s*p_branch_id\s+UUID DEFAULT NULL,\s*p_service_id\s+UUID DEFAULT NULL,\s*p_staff_id\s+UUID DEFAULT NULL,\s*p_customer_id\s+UUID DEFAULT NULL,\s*p_is_published\s+BOOLEAN DEFAULT NULL,\s*p_min_rating\s+INTEGER DEFAULT NULL/.test(sql) &&
        sql.includes('REVOKE ALL ON FUNCTION public.get_tenant_reviews(UUID, UUID, UUID, UUID, BOOLEAN, INTEGER, INTEGER, INTEGER)') &&
        sql.includes('GRANT EXECUTE ON FUNCTION public.get_tenant_reviews(UUID, UUID, UUID, UUID, BOOLEAN, INTEGER, INTEGER, INTEGER)')
);

assertContract(
  '30. get_tenant_reviews validates bounds for p_limit (explicit IS NULL or 1..100) and p_offset (explicit IS NULL or >=0)',
  () => sql.includes('p_limit IS NULL OR p_limit < 1 OR p_limit > 100') &&
        sql.includes('p_offset IS NULL OR p_offset < 0') &&
        sql.includes('p_min_rating IS NOT NULL AND (p_min_rating < 1 OR p_min_rating > 5)')
);

assertContract(
  '31. get_tenant_reviews resolves authority deterministically from users_profile without unqualified LIMIT 1',
  () => sql.includes('FROM public.users_profile up') &&
        sql.includes('up.id = v_caller_uid') &&
        sql.includes('up.active = true') &&
        !sql.includes('ORDER BY s.created_at DESC\n    LIMIT 1')
);

assertContract(
  '32. get_tenant_reviews supports tenant_owner without staff entity',
  () => sql.includes("v_up.role = 'tenant_owner'") &&
        sql.includes('Owner has direct tenant authority without requiring a staff entity')
);

assertContract(
  '33. get_tenant_reviews uses subquery/CTE pagination and orders jsonb_agg',
  () => sql.includes('WITH paged_reviews AS (') &&
        sql.includes('ORDER BY pr.created_at DESC, pr.id DESC') &&
        sql.includes('r.responded_by_user_id')
);

// -----------------------------------------------------------------------------
// 6. moderate_review Contracts
// -----------------------------------------------------------------------------
assertContract(
  '34. moderate_review resolves authority from users_profile and preserves tenant fail-closed semantics',
  () => sql.includes('v_review.tenant_id <> v_tenant_id') &&
        sql.includes('CROSS_TENANT_VIOLATION')
);

assertContract(
  '35. moderate_review supports tenant owner moderation without staff foreign key constraint violation',
  () => sql.includes('responded_by_user_id = v_caller_uid') &&
        sql.includes('responded_by = v_staff_id')
);

assertContract(
  '36. moderate_review validates response_text bounds (required and max 4000 chars)',
  () => sql.includes("p_response_text IS NULL OR trim(p_response_text) = ''") &&
        sql.includes('length(v_response_clean) > 4000')
);

// -----------------------------------------------------------------------------
// 7. CI Workflow Introspection Verification
// -----------------------------------------------------------------------------
assertContract(
  '37. Workflow inspects public.reviews and public.review_idempotency_keys tables',
  () => workflowYaml.includes("table_name = 'reviews'") &&
        workflowYaml.includes("table_name = 'review_idempotency_keys'")
);

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n===============================================================');
console.log(`STATIC CONTRACT VERIFICATION COMPLETE: ${testsPassed}/${testsExecuted} PASSED | ${testsFailed} FAILED`);
console.log('===============================================================\n');

if (testsFailed > 0) {
  console.error(`Static contract verification failed with ${testsFailed} failing assertions.`);
  process.exit(1);
}

console.log('STATIC CONTRACT VERIFICATION PASSED CLEANLY');