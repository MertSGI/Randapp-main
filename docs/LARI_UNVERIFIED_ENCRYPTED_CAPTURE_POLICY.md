# LARI Dual-Lane Capture and Quarantine Policy

**Status:** PROPOSED ARCHITECTURAL POLICY (Draft PR Review Only)  
**Authority:** Controller / Architecture Directive `LARI-B15-CONTROLLER-LED-EXECUTION-20261023`  
**Target Repository:** `MertSGI/Randapp-main`  
**Target Project:** `rwedeejhjazwjthdjzrt`  
**Staging Branch:** `staging/supabase-staging-consistency`  

---

## 1. Executive Summary

This document specifies the dual-lane capture policy governing database backups and candidate snapshots for LARI:

1. **Lane 1: Verified Logical Restore (`lari-zero-cost-logical-backup.yml`)**  
   The primary, fail-closed backup workflow. It exports a custom-format logical dump, verifies the complete dump restoration into an isolated PostgreSQL 17 disposable database created from `TEMPLATE template0`, validates catalog fingerprint equivalence, and publishes an encrypted artifact only when `restore_verdict == 'VERIFIED_LOGICAL_RESTORE'`. Artifact retention is 7 days. Even when verified, P0 migration eligibility remains separately gated until offsite recovery evidence is accepted by the owner.

2. **Lane 2: Unverified Encrypted Quarantine Capture (`lari-zero-cost-quarantine-capture.yml`)**  
   A secondary, strictly opt-in, capture-only workflow proposed under Draft PR. It performs read-only source export and client-side encryption using the owner-held public age key, but deliberately does **NOT** execute a disposable restore phase. Its evidence classification is fixed as `UNVERIFIED_ENCRYPTED_CAPTURE` with `p0_eligible = false`. Artifact retention is strictly 1 day.

> [!IMPORTANT]
> A quarantined encrypted capture is **NOT** a verified backup, is **NOT** disaster-recovery certified, and does **NOT** satisfy P0 migration preconditions. It cannot unblock production migrations or database schema changes.

---

## 2. Dual-Lane Policy Comparison

| Property | Lane 1: Verified Logical Restore | Lane 2: Unverified Quarantine Capture |
| :--- | :--- | :--- |
| **Workflow File** | `.github/workflows/lari-zero-cost-logical-backup.yml` | `.github/workflows/lari-zero-cost-quarantine-capture.yml` |
| **Runner Script** | `scripts/run-zero-cost-logical-backup.sh` | `scripts/run-zero-cost-quarantine-capture.sh` |
| **Trigger** | `workflow_dispatch` only | `workflow_dispatch` only |
| **Confirmation Token** | `BACKUP rwedeejhjazwjthdjzrt` | `QUARANTINE CAPTURE rwedeejhjazwjthdjzrt` |
| **Target Branch** | `staging/supabase-staging-consistency` | `staging/supabase-staging-consistency` |
| **Commit SHA Check** | Operator-selected dispatch ref | Exact check: `expected_staging_sha == github.sha` |
| **Restore Verification** | Mandated in PostgreSQL 17 disposable container | Skipped (`restore_verdict = RESTORE_NOT_TESTED`) |
| **Policy Classification** | `VERIFIED_LOGICAL_RESTORE` | `UNVERIFIED_ENCRYPTED_CAPTURE` |
| **P0 Migration Precondition** | Requires offsite recovery verification | **NEVER ELIGIBLE (`p0_eligible = false`)** |
| **Artifact Upload Name** | `lari-staging-encrypted-logical-backup-<run-id>-<attempt>` | `lari-UNVERIFIED-ENCRYPTED-CAPTURE-<run-id>-<attempt>` |
| **Artifact Retention** | 7 days | 1 day |
| **Publication Gating** | `steps.backup.outputs.restore_verdict == 'VERIFIED_LOGICAL_RESTORE'` | `steps.capture.outputs.classification == 'UNVERIFIED_ENCRYPTED_CAPTURE' && steps.capture.outputs.publish_quarantine == 'true'` |

---

## 3. Strict Safety and Security Invariants

1. **Fail-Closed Policy Classification (`capture_release_policy.py`):**
   - Candidate evidence is evaluated by the Controller-authored classification engine.
   - Any negative condition (wrong branch, mismatched SHA, altered confirmation token, incomplete ciphertext, missing checksum proof) immediately returns `classification = NO_ARTIFACT_ELIGIBLE`.
   - On `NO_ARTIFACT_ELIGIBLE`, the runner wipes all artifacts from disk and exits with code 1. Zero uploadable files remain.

2. **Zero Plaintext Credential Exposure:**
   - Both workflows use strict TLS (`sslmode=verify-full`), pinned Supabase Root CA DER fingerprint check (`807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`), session pooler host restrictions, and `PGPASSFILE` with `chmod 0600` inside an isolated temporary directory (`umask 077`).
   - Inherited libpq environments are wiped via `env -i`.
   - Temporary plaintext bundles are securely shredded from disk immediately following age encryption.

3. **Asymmetric Encryption with Off-Platform Private Key:**
   - Snapshots are encrypted with the owner-held public age recipient (`age1...`).
   - The private age key is held exclusively off GitHub by the owner and is never provided to GitHub Actions, workflows, logs, or runner scripts.

4. **Scope Limitations:**
   - Logical captures contain only PostgreSQL global roles (without hashes) and custom-format database dumps.
   - Supabase Storage object bytes, platform secrets, Edge Functions, and Vault root keys are excluded.

---

## 4. Operational Governance

- **Draft PR Status:** The quarantine capture workflow is implemented as a proposal on an isolated review branch (`review/lari-b15-encrypted-quarantine-source-20261023`).
- **No Live Capture Authorized:** The owner has authorized code preparation only. No live workflow dispatch or quarantine capture execution may occur without separate, explicit owner authorization.
- **Original Workflow Preserved:** `.github/workflows/lari-zero-cost-logical-backup.yml` remains byte-identical to Git blob `d0c48d60be9144606551c04e2b89a4dde031f8b6`.
