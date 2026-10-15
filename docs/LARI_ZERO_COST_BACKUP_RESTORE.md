# LARI zero-cost logical backup and restore runbook

This workflow prepares an encrypted PostgreSQL logical backup for Supabase project `rwedeejhjazwjthdjzrt` and tests that exact dump in a disposable PostgreSQL 17.6 service before upload. It is not scheduled and does not run on a branch push or pull request.

## Operator gate

The workflow uses only `workflow_dispatch`. GitHub requires that a manually dispatched workflow must exist on the repository default branch. Publishing this file on a review branch neither runs it nor makes it dispatchable. The job is additionally bound in source to the currently verified default branch, `staging/supabase-staging-consistency`; a future default-branch change fails closed until reviewed in source. Before any live run, an owner must review and place the workflow on the default branch through the normal protected process.

Create a GitHub Environment named `lari-staging-backup` and configure:

- Required reviewers.
- Prevent self-review, if a second owner is available.
- No administrator bypass of the environment gate.
- Deployment branch policy restricted to the repository default branch.
- Environment secret `LARI_STAGING_DATABASE_URL`: the protected PostgreSQL direct or session-pooler connection string for the exact source project, with TLS required. Do not use the transaction pooler or a frontend key. Rotate it after any suspected disclosure.
- Environment secret `LARI_BACKUP_AGE_RECIPIENT`: an operator-owned age X25519 public recipient beginning with `age1`.

The private key never enters GitHub. Generate and retain it only on an operator-controlled machine or offline secret store:

```text
age-keygen -o lari-staging-backup.agekey
age-keygen -y lari-staging-backup.agekey
```

Store the first file outside GitHub. Put only the second command's public `age1...` value into `LARI_BACKUP_AGE_RECIPIENT`. Losing the private key makes the artifact unrecoverable.

For an authorized run, select the default branch, enter project reference `rwedeejhjazwjthdjzrt`, and enter the exact confirmation `BACKUP rwedeejhjazwjthdjzrt`. The protected environment must then be approved before its secrets are released. Concurrency permits only one backup run at a time, and the job is bounded to 30 minutes.

## Backup and verification behavior

The runner installs PostgreSQL 17 client binaries and uses:

- `pg_dumpall --roles-only --no-role-passwords` for non-secret role definitions and grants.
- `pg_dump --format=custom` for database schema, table data, RLS policies, ACLs, functions/RPCs, large objects, and visible extension definitions.
- Source catalog fingerprints for schemas, tables and RLS flags, policies, routines, roles, and extensions.
- A disposable `postgres:17.6-alpine` restore target reachable only at loopback.
- `psql` role restoration and `pg_restore --exit-on-error --single-transaction` for atomic, fail-closed restore testing.
- A source-versus-restored catalog fingerprint comparison.

Exact source role and extension inventories, unavailable PostgreSQL 17 extensions, and sanitized restore diagnostics are placed inside the encrypted bundle. A managed role, missing extension, ownership failure, restore error, or catalog mismatch produces `NOT_RESTORABLE_IN_DISPOSABLE_POSTGRES_17`; it is never reported as a verified restore.

Only after the restore attempt does the workflow create an age-encrypted bundle. It deletes the temporary plaintext bundle and allows exactly two uploaded files: the `.age` ciphertext and `manifest.json`. The manifest records the encrypted artifact SHA256, source project identifier, UTC creation time, source revision, PostgreSQL versions, and restore-test verdict. The workflow recomputes and verifies the ciphertext hash before upload.

GitHub retains the encrypted artifact for seven days. The owner must download it before expiry, verify its SHA256 against the manifest, and retain both in operator-controlled storage. GitHub artifact retention is not an archival strategy.

## Restore use after an incident

On an operator-controlled machine with the private age identity:

1. Verify the downloaded ciphertext SHA256 against `manifest.json`.
2. Decrypt with `age --decrypt --identity lari-staging-backup.agekey`.
3. Extract the tar bundle locally without printing its contents to shared logs.
4. Read `restore-report.json` and dependency diagnostics first.
5. Provision the required Supabase-managed roles, extensions, platform schemas, and encryption keys in the authorized recovery target.
6. Restore `roles.sql`, then `database.dump`, stopping on any error.
7. Re-run catalog, application, RLS, RPC, Auth, Storage, and tenant-isolation validation before accepting recovery.

Never restore into production or staging without separate authorization and a confirmed target. The workflow's restore URL is hard-coded to a loopback service and is rejected if it is not local.

## Completeness limitations

This is a PostgreSQL logical database backup, not a physical backup or point-in-time recovery image. It is not a verified complete Supabase platform backup.

- Supabase Storage object bytes live outside PostgreSQL and are not included. Database rows in `storage` describe metadata only. Object bytes require a separate authorized export.
- Supabase project settings, Auth provider secrets, SMTP/API credentials, Vault encryption root keys, Edge Function deployments and secrets, Realtime/platform configuration, network settings, and custom domains are outside this logical dump.
- Supabase-managed roles, ownership rules, extensions, and platform schema dependencies may not restore into stock PostgreSQL 17. The workflow reports these incompatibilities and fails its verification gate.
- Custom changes in managed `auth` and `storage` schemas can need a separate Supabase-supported migration/diff process.
- Role globals and the per-database custom dump are separate logical snapshots. A role change during the narrow backup window can cause fingerprint or restore verification failure.
- A successful disposable restore verifies the logical archive and catalog equivalence available to the backup credential. It does not prove recovery of excluded platform services or Storage bytes.

Current preparation state: `REMOTE_BACKUP_EXECUTED=NO`. No Supabase connection or remote database operation is part of the local qualification test.
