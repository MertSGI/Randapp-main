# LARI zero-cost logical backup and restore runbook

This workflow prepares an encrypted PostgreSQL logical backup for Supabase project `rwedeejhjazwjthdjzrt` and tests that exact dump in a disposable PostgreSQL 17.6 service before upload. It is not scheduled and does not run on a branch push or pull request.

## Operator gate

The workflow uses only `workflow_dispatch`. GitHub requires that a manually dispatched workflow must exist on the repository default branch. Publishing this file on a review branch neither runs it nor makes it dispatchable. The job is additionally bound in source to the currently verified default branch, `staging/supabase-staging-consistency`; a future default-branch change fails closed until reviewed in source. Before any live run, an owner must review and place the workflow on the default branch through the normal protected process.

### Selected operating model: single-owner Option A

The owner has selected a single-owner, manually authorized operating model because no independent second GitHub reviewer exists. The `lari-staging-backup` environment therefore has no required reviewer and does not use Prevent self-review. Automated or AI technical review is not independent human approval.

This is a deliberate security limitation: one owner controls the repository and the protected environment. The owner must make three separate, explicit decisions that do not authorize one another:

1. Authorize and merge the reviewed backup-workflow pull request.
2. Authorize each backup dispatch after confirming the workflow inputs and environment configuration.
3. Authorize any later P0 staging migration only after a recoverable backup and its restore evidence have been reviewed.

Configure the GitHub Environment exactly as follows:

1. Open **Repository Settings > Environments**, create `lari-staging-backup`, and leave **Required reviewers** disabled with no reviewers listed.
2. Under **Deployment branches and tags**, select **Selected branches and tags** and add exactly `staging/supabase-staging-consistency`. Do not add wildcards, tags, or another branch.
3. Retain the existing repository-scoped `STAGING_DB_PASSWORD` secret. Reusing it for this manually authorized backup is an owner-approved exception to the earlier environment-only credential model. A repository-scoped secret has broader availability than an environment-scoped secret; do not reveal, retrieve, copy, rotate, or reset it for this workflow. Its password validity remains unverified until a separately authorized execution.
4. Add `LARI_STAGING_POOLER_HOST` under **Environment variables**. Copy the exact hostname from **Supabase Dashboard > Connect > Session Pooler**. Do not infer it from the region and do not include a scheme, username, password, port, path, or query string.
5. Add `LARI_BACKUP_AGE_RECIPIENT` under **Environment secrets**. It must be an operator-owned age X25519 public recipient beginning with `age1`.
6. Reopen the environment and verify the exact branch restriction, the `LARI_STAGING_POOLER_HOST` variable name, and the `LARI_BACKUP_AGE_RECIPIENT` secret name before authorizing a run. Do not create repository-level or organization-level copies of the age recipient.

The workflow has no automated trigger: `workflow_dispatch` is its only event. The environment branch restriction is an additional gate and does not replace the workflow's exact source-project and confirmation checks.

The age private identity stays outside GitHub: the private key never enters GitHub. Generate and retain it only on an operator-controlled machine or offline secret store:

```text
age-keygen -o lari-staging-backup.agekey
age-keygen -y lari-staging-backup.agekey
```

Store the first file outside GitHub. Put only the second command's public `age1...` value into `LARI_BACKUP_AGE_RECIPIENT`. Losing the private key makes the artifact unrecoverable.

For a separately authorized run, select the exact default branch `staging/supabase-staging-consistency`, enter project reference `rwedeejhjazwjthdjzrt`, and enter the exact confirmation `BACKUP rwedeejhjazwjthdjzrt`. Confirm the displayed ref and inputs before selecting **Run workflow**. In the selected single-owner model there is no second environment approval after dispatch, so this final manual check is the authorization boundary. Concurrency permits only one backup run at a time, and the job is bounded to 30 minutes.

## Vercel production gate before merge

The repository default branch is also the observed Vercel Production Branch for the Git-linked `lari-staging` project. Merging even workflow-only files into `staging/supabase-staging-consistency` can therefore create a production-target deployment and update production aliases.

Before approving the pull-request merge, the owner must first protect the production aliases using one of Vercel's explicit Git controls: either open **Project Settings > Environments > Production > Branch Tracking** and move Production tracking away from `staging/supabase-staging-consistency` to an owner-controlled quarantine branch that will not receive the merge, or open **Project Settings > Git > Connected Git Repository** and disconnect the repository. Read the setting back and verify that a commit to `staging/supabase-staging-consistency` cannot create a production-target deployment or move a production/custom-domain alias. Do not rely on the absence of application-file changes. Restoring Production Branch tracking or reconnecting Git is a separate production authorization after the merge is verified; this backup-workflow approval does not grant it.

## Backup and verification behavior

The runner installs PostgreSQL 17 client binaries and uses:

- The exact shared Session Pooler identity `postgres.rwedeejhjazwjthdjzrt` on the owner-supplied host, port `5432`, database `postgres`, and `sslmode=require`. The password is never embedded in a URI or process argument.
- A source-only `PGPASSFILE` created under the job's private temporary directory with mode `0600`. Password-file metacharacters are escaped, inherited libpq settings are discarded, disposable restore credentials use a separate password file, and cleanup runs after success, failure, or a termination signal.
- `pg_dumpall --roles-only --no-role-passwords` for non-secret role definitions and grants.
- `pg_dump --format=custom` for database schema, table data, RLS policies, ACLs, functions/RPCs, large objects, and visible extension definitions.
- Source catalog fingerprints for schemas, tables and RLS flags, policies, routines, roles, and extensions.
- A disposable `postgres:17.6-alpine` restore target reachable only at loopback.
- `psql` role restoration and `pg_restore --exit-on-error --single-transaction` for atomic, fail-closed restore testing.
- A source-versus-restored catalog fingerprint comparison.

Exact source role and extension inventories, unavailable PostgreSQL 17 extensions, and sanitized restore diagnostics are placed inside the encrypted bundle. A managed role, missing extension, ownership failure, restore error, or catalog mismatch produces `NOT_RESTORABLE_IN_DISPOSABLE_POSTGRES_17`; it is never reported as a verified restore.

Only after the restore attempt does the workflow create an age-encrypted bundle. It deletes the temporary plaintext bundle and allows exactly two uploaded files: the `.age` ciphertext and `manifest.json`. The manifest records the encrypted artifact SHA256, source project identifier, UTC creation time, source revision, PostgreSQL versions, and restore-test verdict. The workflow recomputes and verifies the ciphertext hash before upload.

GitHub retains the encrypted artifact for seven days. The owner must download it before expiry, verify its SHA256 against the manifest, and retain both in operator-controlled storage. GitHub artifact retention is not an archival strategy.

External ciphertext retention and owner-controlled restore verification remain mandatory. The workflow never resets the staging database password, and an offline qualification pass does not establish that the existing secret is valid or that a future live backup is recoverable.

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
