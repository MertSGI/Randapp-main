# Default-Exclusive Commits Semantic Reconciliation Manifest
**Authority**: `LARI-PROGRAM-V2-PRODUCT-FIRST-PHASE3-COMPLETION-20260911-01`  
**Evaluation Mode**: `READ_ONLY` (No merge, no rebase, no cherry-pick, no ref mutation)  
**Subject Canonical Base**: `09bb1f8d8ce070c33d09099a6d0ae20c93787d11`  
**Default Divergence Base (Merge Base)**: `134c8716c2511c909cd400aee0496ebd70f63bf6`  
**Default Branch Head**: `3faeced52939c65bbbc49da2ee6c7f375c0f9e59`  
**Total Diverged Commits Audited**: 34  

---

## 1. Executive Summary & Lineage Verdict

Between merge base `134c8716` and default `3faeced`, exactly 34 commits exist that are not direct ancestors of the canonical subject `09bb1f8`.
Our read-only semantic audit of the complete commit diff reveals that these 34 commits touched **only four workflow files** in `.github/workflows/`:
1. `.github/workflows/lari-health-tourism-slice4-final-e2.yml` (15 commits)
2. `.github/workflows/lari-r31-controller-exact-edge-deploy-20260901.yml` (2 commits)
3. `.github/workflows/lari-r31-v12-final-e3-20260901.yml` (16 commits)
4. `.github/workflows/lari-r31-v12-final-e3-b-20260901.yml` (1 commit)

### Key Semantic Findings:
- **`lari-health-tourism-slice4-final-e2.yml`**:
  A byte-exact `git diff 3faeced 09bb1f8 -- .github/workflows/lari-health-tourism-slice4-final-e2.yml` produces **empty output (0 diff lines)**.
  The changes introduced across commits `1258660` through `3faeced` in default were merged/reconciled into canonical base `09bb1f8d8ce070c33d09099a6d0ae20c93787d11` (commit message: *"fix(ht): pin Final R9 R1.8.16.11 support"*).
  **Classification**: `ALREADY_SEMANTICALLY_PRESENT`.

- **R31 Historical Test & Deployment Workflows**:
  The remaining 19 commits (`64868aa` through `b1035df`) created or updated one-off execution harnesses for historical milestone R31 isolated edge deployment and v12 E3 verification runs:
  - `lari-r31-controller-exact-edge-deploy-20260901.yml`
  - `lari-r31-v12-final-e3-20260901.yml`
  - `lari-r31-v12-final-e3-b-20260901.yml`
  These files do not exist in canonical base `09bb1f8` and represent ephemeral run harnesses for a previously completed CI stage that was superseded by the R9 slice4 final test framework.
  **Classification**: `OBSOLETE_SUPERSEDED`.

- **Zero Product/Schema/Application Code Divergence**:
  None of the 34 commits touched any application code, database migrations, types, components, or services.

---

## 2. Granular Commit Classification Manifest

| Commit Hash | Commit Subject | Files Changed | Classification | Rationale |
|:---|:---|:---|:---|:---|
| `64868aa` | ops: bootstrap exact R31 isolated edge deployment | `lari-r31-controller-exact-edge-deploy-20260901.yml` | `OBSOLETE_SUPERSEDED` | Ephemeral edge deploy harness for R31. |
| `bbe7ea1` | ops: correct canonical R31 edge source hash | `lari-r31-controller-exact-edge-deploy-20260901.yml` | `OBSOLETE_SUPERSEDED` | Source hash calibration for historical R31 run. |
| `835cf98` | test(ht): execute R31 v12 final isolated E3 | `lari-r31-v12-final-e3-20260901.yml` | `OBSOLETE_SUPERSEDED` | Historical isolated E3 test run harness. |
| `7689023` | test(ht): enforce E3 authority result check on canonical workflow | `lari-r31-v12-final-e3-20260901.yml` | `OBSOLETE_SUPERSEDED` | Historical harness assertion. |
| `2e37b8f` | test(ht): execute corrected R31 v12 final E3 | `lari-r31-v12-final-e3-20260901.yml` | `OBSOLETE_SUPERSEDED` | Historical harness rerun. |
| `075dc1c` | test(ht): initialize pre-run baseline sets for accurate delta auditing | `lari-r31-v12-final-e3-20260901.yml` | `OBSOLETE_SUPERSEDED` | Historical harness delta auditing logic. |
| `2628c07` | fix(ht): remove incorrect baseline population of createdLeadIds and createdConvIds | `lari-r31-v12-final-e3-20260901.yml` | `OBSOLETE_SUPERSEDED` | Historical harness bugfix. |
| `94f2ecc` | test(ht): append E3 results.env to GITHUB_STEP_SUMMARY | `lari-r31-v12-final-e3-20260901.yml` | `OBSOLETE_SUPERSEDED` | Historical step summary logger. |
| `45dd2ed` | test(ht): echo results.env to step log output | `lari-r31-v12-final-e3-20260901.yml` | `OBSOLETE_SUPERSEDED` | Historical log output. |
| `f718532` | fix(ht): filter createdMsgIds and createdOutboxIds to only new records | `lari-r31-v12-final-e3-20260901.yml` | `OBSOLETE_SUPERSEDED` | Historical message delta filter. |
| `4bbab7a` | test(ht): log E3_RESULT evaluation status in node script | `lari-r31-v12-final-e3-20260901.yml` | `OBSOLETE_SUPERSEDED` | Historical evaluation logger. |
| `d57c8d0` | test(ht): exit node runner with status 1 if E3_RESULT is not PASS_CANDIDATE | `lari-r31-v12-final-e3-20260901.yml` | `OBSOLETE_SUPERSEDED` | Historical exit condition. |
| `1a2e431` | test(ht): ensure evidence files are written before node process exit | `lari-r31-v12-final-e3-20260901.yml` | `OBSOLETE_SUPERSEDED` | Historical evidence flush. |
| `6a10740` | test(ht): emit E3 report variables as workflow notice annotations | `lari-r31-v12-final-e3-20260901.yml` | `OBSOLETE_SUPERSEDED` | Historical annotation emitter. |
| `e880b99` | test(ht): log detailed cleanup failure reason if cleanup check fails | `lari-r31-v12-final-e3-20260901.yml` | `OBSOLETE_SUPERSEDED` | Historical cleanup diagnostic. |
| `e2d3dfd` | test(ht): log per-case execution outcome in node script | `lari-r31-v12-final-e3-20260901.yml` | `OBSOLETE_SUPERSEDED` | Historical case outcome logging. |
| `465b054` | test(ht): filter notice annotations to key result variables | `lari-r31-v12-final-e3-20260901.yml` | `OBSOLETE_SUPERSEDED` | Historical annotation filtering. |
| `486589a` | chore(ht): clean workflow script formatting | `lari-r31-v12-final-e3-20260901.yml` | `OBSOLETE_SUPERSEDED` | Historical formatting cleanup. |
| `b1035df` | test(ht): execute actual R31 v12 E3-B P2 harness | `lari-r31-v12-final-e3-b-20260901.yml` | `OBSOLETE_SUPERSEDED` | Historical test harness. |
| `1258660` | ci(ht): register Final R9 manual workflow [skip ci] | `lari-health-tourism-slice4-final-e2.yml` | `ALREADY_SEMANTICALLY_PRESENT` | Workflow is identical in `09bb1f8`. |
| `1ef49a0` | ci(ht): register R1.8.6 Final R9 workflow [skip ci] | `lari-health-tourism-slice4-final-e2.yml` | `ALREADY_SEMANTICALLY_PRESENT` | Workflow is identical in `09bb1f8`. |
| `4ae9a11` | ci(ht): register R1.8.7 Final R9 workflow [skip ci] | `lari-health-tourism-slice4-final-e2.yml` | `ALREADY_SEMANTICALLY_PRESENT` | Workflow is identical in `09bb1f8`. |
| `b42130c` | ci(ht): register R1.8.8 Final R9 workflow [skip ci] | `lari-health-tourism-slice4-final-e2.yml` | `ALREADY_SEMANTICALLY_PRESENT` | Workflow is identical in `09bb1f8`. |
| `a48821a` | ci(ht): register R1.8.9 Final R9 workflow [skip ci] | `lari-health-tourism-slice4-final-e2.yml` | `ALREADY_SEMANTICALLY_PRESENT` | Workflow is identical in `09bb1f8`. |
| `3d6e2b4` | ci(ht): register R1.8.10.1 Final R9 workflow [skip ci] | `lari-health-tourism-slice4-final-e2.yml` | `ALREADY_SEMANTICALLY_PRESENT` | Workflow is identical in `09bb1f8`. |
| `b2764b2` | ci(ht): register R1.8.11.2 Final R9 workflow [skip ci] | `lari-health-tourism-slice4-final-e2.yml` | `ALREADY_SEMANTICALLY_PRESENT` | Workflow is identical in `09bb1f8`. |
| `1a82fb5` | ci(ht): register R1.8.12.1 Final R9 workflow [skip ci] | `lari-health-tourism-slice4-final-e2.yml` | `ALREADY_SEMANTICALLY_PRESENT` | Workflow is identical in `09bb1f8`. |
| `51a23ee` | ci(ht): register R1.8.13.2 Final R9 workflow [skip ci] | `lari-health-tourism-slice4-final-e2.yml` | `ALREADY_SEMANTICALLY_PRESENT` | Workflow is identical in `09bb1f8`. |
| `ec80934` | ci(ht): register R1.8.14.1 Final R9 workflow [skip ci] | `lari-health-tourism-slice4-final-e2.yml` | `ALREADY_SEMANTICALLY_PRESENT` | Workflow is identical in `09bb1f8`. |
| `c39d91c` | ci(ht): register R1.8.15 Final R9 workflow [skip ci] | `lari-health-tourism-slice4-final-e2.yml` | `ALREADY_SEMANTICALLY_PRESENT` | Workflow is identical in `09bb1f8`. |
| `ed8d3d9` | ci(ht): register R1.8.16.1 Final R9 workflow [skip ci] | `lari-health-tourism-slice4-final-e2.yml` | `ALREADY_SEMANTICALLY_PRESENT` | Workflow is identical in `09bb1f8`. |
| `1befb6b` | ci(ht): register R1.8.16.9 Final R9 workflow [skip ci] | `lari-health-tourism-slice4-final-e2.yml` | `ALREADY_SEMANTICALLY_PRESENT` | Workflow is identical in `09bb1f8`. |
| `62a1cff` | ci(ht): register R1.8.16.10 Final R9 workflow [skip ci] | `lari-health-tourism-slice4-final-e2.yml` | `ALREADY_SEMANTICALLY_PRESENT` | Workflow is identical in `09bb1f8`. |
| `3faeced` | ci(ht): register R1.8.16.11 Final R9 workflow [skip ci] | `lari-health-tourism-slice4-final-e2.yml` | `ALREADY_SEMANTICALLY_PRESENT` | Workflow is identical in `09bb1f8`. |

---

## 3. Summary Classification Totals

- **ALREADY_SEMANTICALLY_PRESENT**: 15 commits (All changes to `lari-health-tourism-slice4-final-e2.yml` exist byte-for-byte in canonical base `09bb1f8`).
- **OBSOLETE_SUPERSEDED**: 19 commits (All changes to historical R31 CI harnesses).
- **MUST_FORWARD_PORT**: 0 commits.
- **CONFLICT_REQUIRES_CONTROLLER_REVIEW**: 0 commits.

**Lineage Reconciliation Conclusion**:
The canonical review base `09bb1f8d8ce070c33d09099a6d0ae20c93787d11` already possesses all meaningful semantic content from default `3faeced`. The default branch contains no unrepresented product, security, schema, or active CI logic. No cherry-pick, merge, or forward-port is necessary.
