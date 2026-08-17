# PROJECT_CONTROL.md — LARI Project Control Plane Landing Page

## Executive Summary & Current Status

- **Project**: LARI SaaS Platform (Randapp)
- **Current Core Status**: Commercial Core Foundation Baseline Closed & Verified (`P2A.0` to `P2A.3` `CLOSED_PROVEN`).
- **Core-RC Hardening**: `CORE-RC.1` CLOSED, `CORE-RC.2B` CLOSED_PROVEN, `CORE-RC.3` HOLD_PENDING_LITERAL_EXECUTION_TRUTH.
- **Pilot Arm State**: `P1D.1A` CLOSED_PROVEN / ARMED (Staging data clean, Melis allowed, canonical fixture blocked, Canary A preserved).
- **Master Product Delivery Train**:
  `LARI CORE` -> `PACKAGE / CUSTOMER CUSTOMIZATION` -> `LARI CLINIC` -> `LARI HEALTH TOURISM` -> `FINAL DELIVERY`

---

## Canonical Commit & Ref Matrix

| Component / Workstream | Branch Name | Canonical SHA | Status |
| :--- | :--- | :--- | :--- |
| **Main Pilot Staging** | `staging/supabase-staging-consistency` | `134c8716c2511c909cd400aee0496ebd70f63bf6` | `ARMED_UNCHANGED` |
| **Commercial Core Baseline** | `feature/p2a-commercial-core-foundation` | `80297685cb3fd1c73a41207e6fd3dd1faedfbab2` | `CLOSED_PROVEN` |
| **CI Evidence Trigger** | `ci/p2a2-exact-sha-evidence-20260814` | `ed6d381b9c3843b3089fdc8ab4987cf6c38bb9d9` | `CI_RUN_31797365055_SUCCESS` |
| **Project Control Plane** | `control/lari-project-control-plane` | (Current Branch) | `ACTIVE_GOVERNANCE` |

---

## Milestone Status Summary

### Closed & Verified Gates (`CLOSED_PROVEN` / `CLOSED`)
- **`P1D.1A`**: Technical staging acceptance complete & remote cleanup verified.
- **`P2A.0`**: Server-authoritative atomic tenant provisioning RPC (`provision_tenant_for_authenticated_owner`).
- **`P2A.1`**: Commercial contract alignment & registration boundary tests.
- **`P2A.2`**: Server-authoritative owner onboarding contracts, readiness predicate, least-privilege commercial policies.
- **`P2A.3`**: Onboarding state machine handoff and readiness contracts.
- **`CORE-RC.1`**: Core domain architecture and RPC boundary hardening.
- **`CORE-RC.2B`**: Paymentless pilot authorization and eligibility boundary execution.

### Active / Hold Gates
- **`CORE-RC.3`**: `HOLD_PENDING_LITERAL_EXECUTION_TRUTH` (Integration branch `integration/core-rc3-runtime` pending creation; UI V2 candidate pending input; real browser E2E pending runner invocation).

---

## Authoritative Evidence Log

- **Authoritative P2A Exact-SHA CI Run**: GitHub Actions Run `31797365055` (`push` event, tested product SHA `80297685...`, 4/4 DB acceptance suites PASS, 5-session concurrency PASS).
- **Rejected Claims**:
  - `P2B.1` (Synthesized agent phase — REJECTED).
  - Previous `CORE-RC.3 CLOSED_PROVEN` claim (REJECTED due to missing branch, missing UI V2 candidate, and elevated SQL integration tests).

---

## Quick File Index

- [`docs/project-control/STATE.json`](file:///C:/tmp/p2a_control_worktree/docs/project-control/STATE.json): Machine-readable project state.
- [`docs/project-control/ROADMAP_12W.md`](file:///C:/tmp/p2a_control_worktree/docs/project-control/ROADMAP_12W.md): Master 12-week roadmap & phase tracking.
- [`docs/project-control/EVIDENCE.jsonl`](file:///C:/tmp/p2a_control_worktree/docs/project-control/EVIDENCE.jsonl): Append-only evidence ledger.
- [`docs/project-control/DECISIONS.md`](file:///C:/tmp/p2a_control_worktree/docs/project-control/DECISIONS.md): Architectural decision record.
- [`docs/project-control/NOMENCLATURE.md`](file:///C:/tmp/p2a_control_worktree/docs/project-control/NOMENCLATURE.md): Naming convention mapping.
- [`docs/project-control/AI_HANDOFF.md`](file:///C:/tmp/p2a_control_worktree/docs/project-control/AI_HANDOFF.md): Bootstrap instructions for AI sessions.
- [`docs/project-control/UPDATE_PROTOCOL.md`](file:///C:/tmp/p2a_control_worktree/docs/project-control/UPDATE_PROTOCOL.md): Rules for control plane updates.
