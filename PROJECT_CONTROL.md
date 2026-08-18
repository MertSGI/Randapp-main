# PROJECT_CONTROL.md — LARİ Project Control Plane Landing Page

## Executive Summary & Current Status

- **Project**: LARİ SaaS Platform (Repository: `MertSGI/Randapp-main`)
- **Current Core Status**: Commercial Core Foundation Baseline Closed & Verified (`P2A.0` to `P2A.3` `CLOSED_PROVEN`).
- **Active Core Milestone**: `CORE-RC.4` (`RC_CANDIDATE_MATERIALIZED` / Candidate SHA `3fc5415eaee70c7207ca2c656be68ba62470a51e`).
- **Core-RC Progress**:
  - `CORE-RC.1`: `INTEGRATION_ALREADY_SATISFIED`
  - `CORE-RC.2A`: `PRESENT_ON_CORE_BASELINE` (Outbox/provider abstraction present; provider config pending)
  - `CORE-RC.2B`: `PRESENT_ON_CORE_BASELINE` (Public Booking Anti-Abuse RPCs present)
  - `CORE-RC.2C`: `PRESENT_ON_CORE_BASELINE` (Demo isolation & tenant subdomain readiness present; wildcard DNS pending)
  - `CORE-RC.3`: `CLOSED_PROVEN` (`E3_ISOLATED_RUNTIME_E2E` - Isolated acceptance runtime E2E proven)
- **Main Pilot Status**: `P1D.1A` `CLOSED_PROVEN_TECHNICAL_ACCEPTANCE_COMPLETE` (Staging data clean, Canary A preserved, real customer/payment mutations = 0, technical browser acceptance verified at 2026-08-14T16:55:15+03:00).
- **Master Product Delivery Train**:
  `LARİ CORE` -> `PACKAGE / CUSTOMER CUSTOMIZATION` -> `LARİ CLINIC` -> `LARİ HEALTH TOURISM` -> `FINAL DELIVERY`

---

## Canonical Commit & Ref Matrix

| Component / Workstream | Branch Name | Canonical SHA | Status |
| :--- | :--- | :--- | :--- |
| **Main Pilot Staging** | `staging/supabase-staging-consistency` | `134c8716c2511c909cd400aee0496ebd70f63bf6` | `CLOSED_PROVEN_TECHNICAL_ACCEPTANCE_COMPLETE` |
| **Commercial Core Baseline** | `feature/p2a-commercial-core-foundation` | `80297685cb3fd1c73a41207e6fd3dd1faedfbab2` | `CLOSED_PROVEN` |
| **CI Evidence Trigger** | `ci/p2a2-exact-sha-evidence-20260814` | `ed6d381b9c3843b3089fdc8ab4987cf6c38bb9d9` | `CI_RUN_31797365055_SUCCESS` |
| **Project Control Plane** | `control/lari-project-control-plane` | (Current Branch) | `ACTIVE_GOVERNANCE` |

---

## Milestone Status Summary

### Closed & Verified Gates
- **`P1D.1A`**: `CLOSED_PROVEN_TECHNICAL_ACCEPTANCE_COMPLETE` (Technical browser acceptance verified at 2026-08-14T16:55:15+03:00; Canary A preserved; zero external message sends; zero real customer/payment mutations).
- **`P2A.0`**: `CLOSED_PROVEN` (Server-authoritative atomic tenant provisioning RPC `provision_tenant_for_authenticated_owner`).
- **`P2A.1`**: `CLOSED_PROVEN` (Commercial contract alignment & registration boundary tests).
- **`P2A.2`**: `CLOSED_PROVEN` (Server-authoritative owner onboarding contracts, readiness predicate, least-privilege commercial policies).
- **`P2A.3`**: `CLOSED_PROVEN` (Onboarding state machine handoff and readiness contracts verified at 2026-08-14T16:13:12+03:00).
- **`CORE-RC.1`**: `INTEGRATION_ALREADY_SATISFIED` (Accepted main-pilot baseline proven as strict ancestor of Commercial Core baseline).

### Active Milestones & Parallel Workstreams
- **`CORE-RC.3`**: `CLOSED_PROVEN` (`E3_ISOLATED_RUNTIME_E2E`).
  - **Lane CORE_RUNTIME** (`CLOSED_PROVEN` - `E3_ISOLATED_RUNTIME_E2E`): Execute real browser `/register` flow, synthetic owner onboarding, `ready_for_review` transition, Super Admin publish, public storefront, customer booking/manage/owner visibility in isolated non-production runtime.
  - **Lane UI_V2** (`DEFERRED_PARALLEL_NON_BLOCKING`): Materialize and integrate the parallel UI redesign later against the proven shared LARI Core.

---

## Authoritative Evidence Log

- **Authoritative P2A Exact-SHA CI Run**: GitHub Actions Run `31797365055` (`push` event, tested product SHA `80297685...`, 4/4 DB acceptance suites PASS, 5-session concurrency PASS).
- **Rejected Claims**:
  - Synthesized agent phases (REJECTED).
  - Previous `CORE-RC.3 CLOSED_PROVEN` claim (REJECTED due to missing branch, missing UI V2 candidate, and elevated SQL integration tests).
  - Generic reuse of Run `31797365055` for non-P2A RC gates (REJECTED).

---

## Quick File Index

- [`docs/project-control/STATE.json`](docs/project-control/STATE.json): Machine-readable project state.
- [`docs/project-control/ROADMAP_12W.md`](docs/project-control/ROADMAP_12W.md): Master 12-week roadmap & phase tracking.
- [`docs/project-control/EVIDENCE.jsonl`](docs/project-control/EVIDENCE.jsonl): Append-only evidence ledger.
- [`docs/project-control/DECISIONS.md`](docs/project-control/DECISIONS.md): Architectural decision register.
- [`docs/project-control/NOMENCLATURE.md`](docs/project-control/NOMENCLATURE.md): Naming convention mapping.
- [`docs/project-control/AI_HANDOFF.md`](docs/project-control/AI_HANDOFF.md): Bootstrap instructions for AI sessions.
- [`docs/project-control/UPDATE_PROTOCOL.md`](docs/project-control/UPDATE_PROTOCOL.md): Rules for control plane updates.


- **CORE-RC.4**: ACTIVE / Final Core Release Candidate Readiness (External configuration dependencies, production/public-launch prerequisites, communication-provider readiness, DNS/domain readiness, payment/launch-mode decision boundary, final Core regression requirements, and explicit GO/NO-GO decision).


