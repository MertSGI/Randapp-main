# Appointment-token staging P0 cutover

Status: PREPARED_NOT_AUTHORIZED

Target project: rwedeejhjazwjthdjzrt

Exact migration: supabase/migrations/20261011155623_appointment_access_tokens_table_access_hardening.sql

Canonical Git LF SHA-256: 260F727516CFF4CF0754295206A10E56505A9CA9E22AEC099BB7F21099BD5E13

Windows CRLF SHA-256: 5FCE2EEE8D21A29C68D7685A744234EAC779FB7BB4D92B6E59CBCBD109826970

The wrapper accepts only those two raw representations and always requires the normalized UTF-8 LF content to match the canonical Git hash. The migration itself is unchanged.

## Preconditions

Stop unless all conditions hold:

1. Owner operations card A-E is complete and retained backup evidence is available.
2. A separate owner approval explicitly authorizes this migration once.
3. The connection URL identity contains rwedeejhjazwjthdjzrt in its username or host, uses PostgreSQL, requires TLS, and is not loopback.
4. The raw migration checksum is one of the two documented checkout representations and its normalized LF checksum matches the canonical Git hash exactly.
5. The live table is public.appointment_access_tokens, owned by postgres, has RLS enabled, and has the seven expected columns/types.
6. Current P0 facts still match the Controller baseline: anon SELECT and TRUNCATE granted, permissive policy present, migration ledger version absent.
7. No unrelated migration or db push is queued.

Never print the URL, tokens, hashes stored in the table, or row contents.

## Bounded application

The operator runs scripts/Invoke-LariAppointmentTokenHardening.ps1 from the repository root after setting LARI_STAGING_DATABASE_URL and the one-time confirmation variable described by the script. The wrapper verifies project identity and checksum, then invokes psql with:

- clean startup using -X
- ON_ERROR_STOP
- one explicit transaction
- lock_timeout of 5 seconds
- statement_timeout of 60 seconds
- idle_in_transaction_session_timeout of 90 seconds
- the existing migration included by relative path
- catalog-only postconditions

The SQL wrapper is scripts/sql/apply-appointment-token-hardening-staging.sql. It commits only if every guard and postcondition succeeds. Any exception rolls back the transaction.

The procedure does not write supabase_migrations.schema_migrations. Do not manually mark history. The exact migration is idempotent and disposable qualification includes repeat application, so a later separately authorized canonical migration runner can apply and record it normally.

## Sanitized postconditions

Record booleans/counts only:

1. anon has none of SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, and PostgreSQL-17 MAINTAIN.
2. The permissive Allow public select by token hash policy is absent.
3. Owner/Admin manage appointment tokens remains the sole table policy.
4. RLS remains enabled and the owner remains postgres.
5. The four manage-token RPCs still exist, are SECURITY DEFINER with explicit search_path, deny PUBLIC execute, and allow the intended anon/authenticated roles.
6. No unrelated table ACL is changed.

Do not run mutation compatibility against staging. Run the full RPC and tenant matrix only against the disposable fixture or an authorized restored clone.

## Abort and recovery

- Lock or statement timeout: transaction rolls back; collect only the sanitized PostgreSQL error class and stop.
- Identity or checksum mismatch: do not connect/apply.
- Postcondition failure: transaction rolls back; do not improvise SQL.
- Unexpected policy, owner, column, or RPC signature: stop for Controller review.
- Backup unavailable or restore evidence rejected: do not start.
