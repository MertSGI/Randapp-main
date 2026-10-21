# LARİ — Backup PR #3 Selective Source Port Manifest

**Manifest ID:** `LARI-DOC-BACKUP-SOURCE-PORT-20261021`  
**Work Package:** `WP-G`  
**Execution Base:** `work/lari-dev247-batch-20261021`  
**Parent Commit:** `6809b4e7f853a55accbaca2c041ad9823ed43248` (WP-F)  
**Port Status:** `PORT_SOURCE_ONLY`  
**PR #3 GitHub State:** `PR3_STILL_OPEN` (Unmerged, original branch untouched)  
**Live Restore Status:** `LIVE_RESTORE_NOT_ACCEPTED`  

---

## 1. Executive Summary

This manifest documents the selective, isolated source port of zero-cost logical backup and PostgreSQL 17 disposable qualification assets from accepted PR #3 into the current isolated development worktree.

In accordance with Controller instruction `LARI-AG-BATCH-20261021-02`:
- No remote write, git push, or PR merge was performed.
- PR #3 remains `OPEN` and `UNMERGED` in GitHub origin.
- Only specified file paths and their direct static script dependencies were ported.
- Entire `package.json` was NOT overwritten; npm scripts were merged with surgical precision, preserving all WP-B, WP-C, WP-E, and WP-F scripts.
- Exact blob byte parity and certificate fingerprint integrity were verified.

---

## 2. Source Provenance & Method

- **Source Commit Object:** `2b238ed66c5ef4f47fd35b613f8dda405c85f60d`
- **Source Commit Message:** `test(backup): pin Docker endpoint, enforce authoritative cleanup verification, and strengthen negative test suite`
- **Source Author:** Mert Özçelikbaş <mert.ozcelikbass@gmail.com> (Tue Oct 20 22:42:02 2026 +0300)
- **Object Ingestion Method:** Local git object transfer from verified local repository `C:\Projects\LARI-zero-cost-backup-20261015` via `git fetch ... 2b238ed66c5ef4f47fd35b613f8dda405c85f60d` (offline, zero remote network access).
- **Extraction Method:** Selective path checkout `git checkout 2b238ed66c5ef4f47fd35b613f8dda405c85f60d -- <path>` into clean worktree.

---

## 3. Ported File Inventory and Blob Parity

All ported files have been checked against the source tree of commit `2b238ed66c5ef4f47fd35b613f8dda405c85f60d`:

| Path | Mode | Git Blob SHA-1 | Source Parity |
| :--- | :--- | :--- | :--- |
| `.github/workflows/lari-pg17-role-qualification.yml` | 100644 | `fec579744139cdebb981fb5659fba0224eed0cee` | EXACT_MATCH |
| `.github/workflows/lari-zero-cost-logical-backup.yml` | 100644 | `0b77aaf8e91be76366b5441db74b10b059a83570` | EXACT_MATCH |
| `docs/LARI_ZERO_COST_BACKUP_RESTORE.md` | 100644 | `fcabff9339f506a1d22706b30b32cf5a9a9d544f` | EXACT_MATCH |
| `scripts/backup/catalog-fingerprint.sql` | 100644 | `2fc22ef5320d27e31c8000975ad5f1ce9ca5cb61` | EXACT_MATCH |
| `scripts/backup/dependency-inventory.sql` | 100644 | `72222657a03a8c09c569d918b34b43f52e462a7d` | EXACT_MATCH |
| `scripts/backup/supabase-prod-ca-2021.crt` | 100644 | `3d693669b23c340c57a3457bdc8b6fefe1806cc5` | EXACT_MATCH |
| `scripts/run-zero-cost-logical-backup.sh` | 100644 | `6e4786296fdb395f164bffc4f58fbe45cf36ada3` | EXACT_MATCH |
| `scripts/test-disposable-pg17-negative.mjs` | 100644 | `7670caea332a32f0bbb9f2fce6556e4f7a6d5f9c` | EXACT_MATCH |
| `scripts/verify-disposable-pg17-role-restore.mjs` | 100644 | `4d1ef6ddc899df79412cf7ee304425c08cc8b4d2` | EXACT_MATCH |
| `scripts/verify-zero-cost-backup-workflow.mjs` | 100644 | `6c1c1bb27b84749e9e72cfd3789f67b2cfe8d4bb` | EXACT_MATCH |

*Note on static dependencies:* `scripts/backup/dependency-inventory.sql` is a direct static dependency of `scripts/verify-zero-cost-backup-workflow.mjs` (line 11). Per Controller instruction §D ("statik referanslarını çözmek için rg ile yol kontrolü yap"), it was selectively ported from commit `2b238ed66c5ef4f47fd35b613f8dda405c85f60d` with byte parity.

---

## 4. CA Root Certificate Verification

The official Supabase Root CA certificate was validated against pinned integrity fingerprints:
- **File Path:** `scripts/backup/supabase-prod-ca-2021.crt`
- **File Size:** 1338 bytes
- **File SHA-256 (LF):** `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7` (MATCH)
- **DER Certificate SHA-256:** `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa` (MATCH)
- **Tamper Resistance:** Tested and verified fail-closed on tampered fingerprint or malformed payload.

---

## 5. package.json Script Integration

The following three scripts were selectively merged into `package.json`:
```json
    "qa:zero-cost-backup-workflow": "node scripts/verify-zero-cost-backup-workflow.mjs",
    "qa:disposable-pg17-role-restore": "node scripts/verify-disposable-pg17-role-restore.mjs",
    "test:disposable-pg17-negative": "node scripts/test-disposable-pg17-negative.mjs"
```
All existing dependencies (`pg: ^8.23.0`, `tsx`, `typescript`, etc.) and all prior batch scripts (`qa:dev247-runner`, `dev247:once`, `dev247:status`, `qa:payment-client-failclosed`, `qa:communication-failclosed`, `qa:lari-migration-plan`) were fully preserved.

---

## 6. Verification Test Results

### 6.1. Offline Workflow & Security Verification
Executed command:
`node scripts/verify-zero-cost-backup-workflow.mjs`

Results:
- Source database URL validator positive cases: 2/2 PASS
- Source database URL validator negative cases: 27/27 PASS
- Credential preflight negative cases: 5/5 PASS
- Source database URL validator: PASS
- Password exposure tests: PASS
- PGPASSFILE permission and escaping tests: PASS
- PGPASSFILE normal, failure, and signal cleanup tests: PASS
- PGPASSFILE artifact exclusion test: PASS
- Failed restore publication suppression test: PASS
- Authentic Supabase Root CA certificate integrity: PASS
- Tampered CA fingerprint mismatch fail-closed test: PASS
- Malformed CA fail-closed test: PASS
- PostgreSQL 17 client binary PATH selection test: PASS
- PostgreSQL 17 client version mismatch fail-closed test: PASS
- PostgreSQL 17 missing tools fail-closed test: PASS
- PostgreSQL 17 isolated env -i execution test: PASS
- PostgreSQL 17.6 role grantor reproduction & resolution fixture: PASS
- Disposable role restore preparation test: PASS
- Zero-cost backup workflow static qualification: PASS
- Remote database connections attempted: 0
- **Exit Code:** `0`

### 6.2. Docker-Dependent Role Qualification
In accordance with Controller instructions §D.5:
`scripts/verify-disposable-pg17-role-restore.mjs` requires a live Docker container daemon and was **NOT** executed in this offline/sandbox batch. The positive and negative Docker verification was previously established and independently attested by GitHub Actions hosted runner CI run `39485734117` on PR #3. That hosted CI evidence applies to the identical source blobs ported here, but does NOT constitute a newly executed live release pass.

---

## 7. Operational Boundaries & Gating

1. **NO_LIVE_BACKUP_DISPATCH:** `workflow_dispatch` for `lari-zero-cost-logical-backup.yml` was not triggered and cannot be triggered from this non-default branch.
2. **NO_LIVE_RESTORE:** No restore was performed against Supabase staging or production.
3. **NO_REMOTE_PUSH:** All work remains strictly local within the worktree.
4. **PR #3 STATUS:** PR #3 remains open and unmerged on GitHub.
