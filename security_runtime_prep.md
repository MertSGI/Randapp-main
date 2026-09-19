# Security Runtime Validation Preparation (EV058-R1)

## Prerequisites
- Local Supabase/PostgreSQL instance reachable from the CI environment.
- Service account credentials with read/write access to the `security` schema.

## Steps
1. Deploy the Supabase Docker image (`supabase/postgres:15.1.0.147`).
2. Apply the `security` migrations located in `migrations/security/`.
3. Run the integration test suite `npm run test:security-runtime`.
4. Verify that all RLS policies are enforced by attempting unauthorized queries.

## Acceptance Criteria
- All migration scripts apply without error.
- Test suite reports **PASS**.
- No unauthorized data access is possible.
