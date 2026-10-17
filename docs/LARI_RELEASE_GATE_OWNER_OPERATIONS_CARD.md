# LARI owner operations card

Operating model: authorized single-owner Option A. Automated review is not independent human approval. Each letter below is a distinct authorization; completing one does not authorize the next.

## A. Backup PR 1 merge approval

1. Confirm PR 1 is still draft, unmerged, and exactly at 51b98d7cbd0a46f863b7888f9dd141d0107bd305.
2. Re-run npm run qa:zero-cost-backup-workflow from that exact head.
3. Confirm the only target is staging/supabase-staging-consistency.
4. Before merge, read back Vercel Production Branch tracking or disconnect Git so this documentation/workflow merge cannot create a production-target deployment or move an alias.
5. Record the owner approval separately. Do not treat this card or Codex execution as approval.

## B. Environment and secrets readiness

In Repository Settings > Environments > lari-staging-backup, verify:

1. Required reviewers remain disabled for the selected single-owner model.
2. Custom deployment branch policy allows exactly staging/supabase-staging-consistency with no wildcard.
3. Environment secret names are exactly LARI_STAGING_DATABASE_URL and LARI_BACKUP_AGE_RECIPIENT.
4. There are no repository- or organization-level copies.
5. The database URL identifies rwedeejhjazwjthdjzrt and requires TLS.
6. The age value is only the public age1 recipient; retain the private identity offline.
7. Confirm the repository account's Actions-minutes and artifact-retention billing policy; the workflow requests no paid Supabase feature but cannot prove account billing from source.

Record names and policy only. Never print values. If any setting cannot be read, readiness is UNKNOWN.

## C. One guarded backup dispatch

Only after separate owner authorization:

1. Select workflow LARI Zero-Cost Logical Backup on the exact default branch.
2. Enter source_project_ref rwedeejhjazwjthdjzrt.
3. Enter exact confirmation BACKUP rwedeejhjazwjthdjzrt.
4. Verify the displayed ref and inputs, then authorize one run.
5. Require the final manifest verdict VERIFIED_LOGICAL_RESTORE. Any other verdict is failure.

This step authorizes one backup run only. It does not authorize P0 SQL.

## D. External encrypted retention

Before the seven-day GitHub artifact expiry:

1. Download the .age ciphertext and manifest.json.
2. Recompute ciphertext SHA-256 and compare it with manifest.json.
3. Store both in operator-controlled external storage.
4. Keep the private age identity outside GitHub and outside the artifact location.
5. Record the retained object identity, SHA-256, size, and retention location without secrets.

## E. Actual restore verification

1. Use an isolated PostgreSQL 17 recovery target, never staging or production.
2. Verify ciphertext SHA-256 before decryption.
3. Decrypt offline, restore roles and database with stop-on-error and a single transaction.
4. Compare the source and restored catalog fingerprints.
5. Review extension and managed-role incompatibilities.
6. Require application, RLS, RPC, Auth, Storage-metadata, and tenant-isolation validation.

The workflow's loopback restore is required evidence; an owner-controlled second restore is the retention/recovery acceptance gate.

## F. Separate P0 migration approval

Only after A-E are reviewed:

1. Verify the exact migration checksum 5FCE2EEE8D21A29C68D7685A744234EAC779FB7BB4D92B6E59CBCBD109826970.
2. Verify the connection identity is rwedeejhjazwjthdjzrt without printing credentials.
3. Review APPOINTMENT_TOKEN_HARDENING_STAGING_CUTOVER.md.
4. Issue a separate approval for exactly one transactional application.
5. Run sanitized catalog postconditions.
6. Only then authorize the one-time synthetic staging E2E plan.

Do not combine backup dispatch, migration application, synthetic E2E, merge, or production promotion into one approval.
