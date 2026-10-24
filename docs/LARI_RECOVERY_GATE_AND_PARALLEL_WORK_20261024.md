# LARI â€” Recovery Gate and Parallel Engineering Policy (2026-10-24)

**Document Reference:** `LARI-DOC-RECOVERY-GATE-20261024`
**Governing Directive:** `LARI-20261024-CONTROLLER-DEEP-RECOVERY-AND-V1-PARALLEL-WORK`
**Target Architecture:** PostgreSQL 17.6 Logical Quarantine Capture and Truthful V1 Client Contracts
**Status:** `P0_RECOVERY_HOLD` (Parallel Source Work Authorized; Zero Database Writes Authorized)

---

## 1. Immutable Recovery Gate Evidence Matrix

The LARI platform enforces an immutable 8-stage gate separating capture, local verification, independent catalog acceptance, and production authorization. No stage can be bypassed or inferred from another.

| Stage | Gate Description | Real Status | Evidence & Verification Notes |
| :--- | :--- | :--- | :--- |
| **G1** | `CIPHERTEXT_CREATED` | **SUCCESS** | Dispatched run `39959869290` (Job `120434869995`). GH Artifact `12504131775`. Staging commit `2c6a99b0b92ecea4f324c7195b3222f92688f294`. |
| **G2** | `CIPHERTEXT_LOCAL_INTEGRITY` | **PASS** | File: `lari-quarantine-rwedeejhjazwjthdjzrt-39959869290-1.tar.gz.age`. Size: `439,089` bytes. SHA-256: `38b5dbfd3c87a51160c7f5f4cda6368d5ac941e0e3e0ac47342d3cba47f212ea`. Stored in owner local folder `%LOCALAPPDATA%\LARI\quarantine-captures\39959869290`. |
| **G3** | `AGE_DECRYPTED_OWNER_LOCAL` | **HOLD** | **OWNER-ONLY CUSTODY.** Autonomous agent is forbidden from searching for, accessing, or using age identity keys. Awaiting owner-local execution in owner's personal terminal. |
| **G4** | `PG17_REAL_LOCAL_RESTORE` | **HOLD** | Requires local Docker Desktop Linux container running pinned image `supabase/postgres:17.6.1.141@sha256:ba10e934f0a59990379f78ab9ed93926f1c291dd61a12fe4026f4202f1b89770`. Docker currently missing on host. |
| **G5** | `SEVEN_CATEGORY_CATALOG_EQUALITY` | **HOLD** | Schema, tables, columns, constraints, sequences, roles, and grants comparison against target catalogue not yet evaluated. |
| **G6** | `OFFSITE_RECOVERY_ACCEPTANCE` | **HOLD** | Controller receipt audit pending owner-executed recovery tool receipt. |
| **G7** | `P0_STAGING_SQL_OWNER_GO` | **BLOCKED** | Explicit owner write authorization and separate P0 migration instruction strictly required after G1â€“G6. |
| **G8** | `PRODUCTION_GO` | **BLOCKED** | Production environments, DNS, billing, and live traffic completely untouched and frozen. |

---

## 2. Invariant Rules for Recovery and Release Promotion

1. **Unverified Classification Invariant:** The capture artifact is strictly classified as `UNVERIFIED_ENCRYPTED_CAPTURE`. Under no circumstances can static CI green passes, frontend flags, or file presence promote an unverified artifact to `VERIFIED_BACKUP`.
2. **Decryption Sovereignty:** The private X25519 age identity (`%LOCALAPPDATA%\LARI\backup-keys\lari-staging-backup.agekey`) and passphrase recovery file (`lari-staging-backup-recovery.age`) are strictly owner-controlled assets. AG must never search, read, copy, hash, or execute decryption.
3. **No Synthetic Promotion:** Neither green synthetic unit tests nor clean Docker test containers constitute proof of database recoverability.
4. **Decoupled Parallel Engineering:** V1 source hardening (client truthfulness, privacy, fail-closed payment adapters, tenant containment) may proceed in parallel without mutating live database schemas or deploying migrations.

---

## 3. Read-Only P0 Staging Migration Pre-check Specification

For future execution once G1â€“G6 gates pass, any proposed P0 staging migration must satisfy this exact automated dry-read specification before any SQL execution is authorized:

```bash
# Future Pre-check Contract Specification (SPECIFICATION ONLY â€” NOT AUTHORIZED FOR EXECUTION)
Target Repository: MertSGI/Randapp-main
Target Branch: staging/supabase-staging-consistency
Target Commit SHA: 2c6a99b0b92ecea4f324c7195b3222f92688f294 (or exact approved successor)
Target Project Ref: rwedeejhjazwjthdjzrt

Pre-conditions:
1. Verify recovery receipt %LOCALAPPDATA%\LARI\recovery-receipts\39959869290-local-recovery-receipt.json exists.
2. Confirm receipt contains "verdict": "LOCAL_RECOVERY_VERIFIED_POSTGRES_LOGICAL_ONLY".
3. Dry-read migration SQL file and verify sha256 checksum.
4. Verify all migration operations are wrapped in a single rollback-safe explicit transaction (BEGIN ... COMMIT).
5. Confirm no external network calls, payment activations, or destructive DDL (DROP TABLE/SCHEMA) exist.
6. Obtain separate explicit Owner and Controller write authorization before dispatch.
```
