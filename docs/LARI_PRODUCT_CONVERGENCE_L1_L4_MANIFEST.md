# LARI Product Convergence L1-L4 preservation manifest

Status: `QUALIFICATION_IN_PROGRESS`

## Source identity and preservation

- Verified security/Product base: `e12ada695da17d937b6a32a0a9af01f0e02cbaa1`
- Selected coherent Product base: `70c6f27adbbeaa906b8fc701f972048fca40f511`
- Integration branch: `staging/ci-lari-product-convergence-l1-l4-20261016`
- Isolated workspace: `C:\Projects\LARI-product-convergence-l1-l4-20261016`
- Canonical control read: `14589d3a68a1654281ceeec2f3b9445fbbaa807a` remained unchanged.
- Existing AOS and LARI worktrees were inventoried read-only. No worktree was reset, cleaned, pruned, overwritten, or removed. The dirty AOS `checkpoints/` state was not modified.

The selected base is a strict descendant of the verified Product source and already contains the formerly separate UI and booking lines in this order:

1. `3f6342132ee588fa2ba45fc7fdef6fc2eb36e3cd` - gated UI-V2 storefront
2. `820315baa94e3f07edcf4c5e1eee1d6f76ae0502` - UI-V2 keyboard accessibility
3. `a2ad98959e9118ef0553609476315282869d2298` - PostgreSQL 17 token-hardening qualification
4. `b02628584d7a6adc3109d84eb06e2ce9381f33a2` - UI-V2 booking E2E
5. `6f3c04dd292104d2f660ef881f38efc03f060ca4` - UI-V2 booking integrity qualification
6. `98d0c4a32e71d10106058896a1efdc6f61dc520e` - local interval integrity
7. `70c6f27adbbeaa906b8fc701f972048fca40f511` - Node 20 interval QA support

No earlier rejected work was promoted. The separately diverged default/staging lineage `3faeced52939c65bbbc49da2ee6c7f375c0f9e59` was not merged. Draft backup PR #1 at `51b98d7cbd0a46f863b7888f9dd141d0107bd305` remains a separate, unmerged operational lane.

## Authority and coverage decisions

- Local interval exclusion is local-mode safety only. Supabase booking creation remains bound to `create_public_booking`.
- Public catalog reads are UX guidance. Tenant provisioning remains bound to `provision_tenant_for_authenticated_owner`.
- Supabase plan administration redirects synchronously to the canonical commercial surface before legacy local plan state can be read or mutated.
- Supabase entitlement resolution uses the server subscription snapshot and fails closed on lookup or tenant mismatch. Static `ENTITLEMENTS_MAP` use remains local-mode only.
- Public manage-token read, cancellation, and rescheduling remain RPC-bound. Direct token-table access is not a public authority.
- UI-V2 remains opt-in.

## Migration identity and recovery

- Guarded migration: `supabase/migrations/20261011155623_appointment_access_tokens_table_access_hardening.sql`
- Migration SHA-256 at base: `5FCE2EEE8D21A29C68D7685A744234EAC779FB7BB4D92B6E59CBCBD109826970`
- No duplicate historical migration was created.
- Disposable recovery procedure: `docs/APPOINTMENT_TOKEN_HARDENING_RECOVERY.md`
- Hosted staging state remains OPEN until a recoverable backup and separate owner authorization exist. This branch performs no staging SQL write.

## Qualification evidence tuple

- `PRODUCT_SOURCE_SHA`: pending final commit
- `GITHUB_CI_RUN_IDS`: pending exact-SHA runs
- `PREVIEW_DEPLOYMENT_ID`: pending protected preview observation
- `SUPABASE_PROJECT_REF`: `rwedeejhjazwjthdjzrt` (identity only; no write authorized)
- `MIGRATION_MANIFEST_HASH`: `SHA256:5482DB2A750507AD1BEFFAE0A458515336144AD48F1CD3EC8D67F766E240EBDD`
- `TEST_REPORT_IDS`: pending local and hosted reports
- `BACKUP_AND_RESTORE_STATUS`: `BACKUP_PR_DRAFT_UNMERGED; REMOTE_BACKUP_EXECUTED=NO`
- `OPEN_SECURITY_BLOCKERS`: `LIVE_STAGING_HARDENING_NOT_APPLIED; VERIFIED_RECOVERABLE_BACKUP_ABSENT`

## Prohibited actions preserved

No AOS source/runtime modification, default-branch merge, staging SQL write, customer-data mutation, backup dispatch, paid-plan upgrade, public-domain reassignment, production deployment, or canonical acceptance write is authorized by this manifest.
