# Appointment token hardening recovery procedure

This is a guarded recovery procedure for migration `20261011155623_appointment_access_tokens_table_access_hardening.sql`. It is not a migration and must never be added to `supabase db push` history.

The hardening migration removes direct `anon` table privileges and the permissive public SELECT policy. The manage-token, cancellation, and rescheduling RPCs remain the public boundary. Re-enabling the prior table access recreates the P0 exposure and is allowed only for an owner-authorized emergency after a recoverable backup has been created and restored successfully.

## Preconditions

1. Record the exact source SHA and verify the hardening migration SHA-256.
2. Obtain separate owner authorization naming the target project and recovery window.
3. Verify a recent encrypted logical backup by restoring it into a disposable PostgreSQL 17 environment.
4. Confirm the target is not production and stop if the table identity, owner, columns, or RLS state differs from the migration guard.
5. Keep raw manage tokens, database passwords, age identities, and customer rows out of logs.

## Disposable proof

`supabase/tests/fixtures/appointment_access_tokens_security_rollback.sql` reproduces the immediately preceding ACL and policy state only inside the loopback test database. The PostgreSQL 17 test performs this sequence:

1. create the vulnerable historical fixture;
2. apply the hardening migration twice;
3. prove direct anon access is denied while manage-token read, cancellation, rescheduling, owner/admin isolation, and service-role access still work;
4. apply the recovery SQL and verify the prior ACL and policy return;
5. reapply the hardening migration and verify the P0 exposure is removed again.

This proves the SQL recovery path is syntactically and behaviorally viable. It does not authorize or perform a hosted rollback.

## Hosted recovery boundary

If a separately authorized hosted recovery is ever required, run the reviewed SQL in one transaction with statement and lock timeouts, capture only sanitized catalog evidence, execute the minimum RPC smoke matrix, and reapply the hardening migration as soon as the emergency is resolved. Any mismatch or failed postcondition requires transaction rollback and escalation. Never dispatch the backup workflow, apply this recovery, or run `supabase db push` under this Product qualification package.
