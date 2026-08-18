# PROJECT_CONTROL.md — LARİ Project Control Plane Landing Page

## Executive Summary & Current Status

- **Project**: LARİ SaaS Platform (Repository: `MertSGI/Randapp-main`)
- **Current Core Status**: LARİ Core Release Candidates Closed & Frozen (`CORE-RC.1` through `CORE-RC.4` `CLOSED_PROVEN`).
- **Active Delivery Milestone**: `Package/Customer Customization` (Auditing Core extension points and defining shared package/customer customization contracts against frozen Core RC baseline).
- **Core-RC Progress**:
  - `CORE-RC.1`: `INTEGRATION_ALREADY_SATISFIED`
  - `CORE-RC.2A`: `PRESENT_ON_CORE_BASELINE` (Outbox/provider abstraction present; provider config pending)
  - `CORE-RC.2B`: `PRESENT_ON_CORE_BASELINE` (Public Booking Anti-Abuse RPCs present)
  - `CORE-RC.2C`: `PRESENT_ON_CORE_BASELINE` (Demo isolation & tenant subdomain readiness present; wildcard DNS pending)
  - `CORE-RC.3`: `CLOSED_PROVEN` (`E3_ISOLATED_RUNTIME_E2E` - Isolated acceptance runtime E2E proven)
  - `CORE-RC.4`: `CLOSED_PROVEN` (`E2_EXECUTABLE_EXACT_SHA_CI` - Official release candidate `release/core-rc4` at `e1bb23dbbc2f1f079ec6bbc93e3cb9b83db1839a` proven via GitHub Actions Run `32134598853`)
- **Main Pilot Status**: `P1D.1A` `CLOSED_PROVEN_TECHNICAL_ACCEPTANCE_COMPLETE` (Staging data clean, Canary A preserved, real customer/payment mutations = 0, technical browser acceptance verified at 2026-08-14T16:55:15+03:00).
- **Master Product Delivery Train**:
  `LARİ CORE` [FROZEN] -> `PACKAGE / CUSTOMER CUSTOMIZATION` [ACTIVE] -> `LARİ CLINIC` -> `LARİ HEALTH TOURISM` -> `FINAL DELIVERY`

---

## Canonical Commit & Ref Matrix

| Component / Workstream | Branch Name | Canonical SHA | Status |
| :--- | :--- | :--- | :--- |
| **Main Pilot Staging** | `staging/supabase-staging-consistency` | `134c8716c2511c909cd400aee0496ebd70f63bf6` | `CLOSED_PROVEN_TECHNICAL_ACCEPTANCE_COMPLETE` |
| **Commercial Core Baseline** | `feature/p2a-commercial-core-foundation` | `80297685cb3fd1c73a41207e6fd3dd1faedfbab2` | `CLOSED_PROVEN` |
| **Official Core RC Baseline** | `release/core-rc4` | `e1bb23dbbc2f1f079ec6bbc93e3cb9b83db1839a` | `CLOSED_PROVEN` |
| **CI Evidence Trigger** | `ci/core-rc4-exact-sha-evidence-r2-20260818` | `61b39627692df4e0784edcfb5b2d2ed695726ec2` | `CI_RUN_32134598853_SUCCESS` |
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
- **`CORE-RC.3`**: `CLOSED_PROVEN` (`E3_ISOLATED_RUNTIME_E2E` - Isolated acceptance runtime E2E proven).
- **`CORE-RC.4`**: `CLOSED_PROVEN` (`E2_EXECUTABLE_EXACT_SHA_CI` - Official release candidate `release/core-rc4` at `e1bb23dbbc2f1f079ec6bbc93e3cb9b83db1839a` proven via GitHub Actions Run `32134598853`).

### Active Delivery Phase
- **`Package/Customer Customization`**: Auditing Core extension points and defining shared package/customer customization contracts against frozen Core RC baseline (`e1bb23dbbc2f1f079ec6bbc93e3cb9b83db1839a`).

---

## Authoritative Evidence Log

- **Authoritative CORE-RC.4 Exact-SHA CI Run**: GitHub Actions Run `32134598853` (`push` event, tested product SHA `e1bb23dbbc2f1f079ec6bbc93e3cb9b83db1839a`, 24/24 steps PASS).
- **Authoritative P2A Exact-SHA CI Run**: GitHub Actions Run `31797365055` (`push` event, tested product SHA `80297685...`, 4/4 DB acceptance suites PASS, 5-session concurrency PASS).

---

## Quick File Index

- [`docs/project-control/STATE.json`](docs/project-control/STATE.json): Machine-readable project state.
- [`docs/project-control/ROADMAP_12W.md`](docs/project-control/ROADMAP_12W.md): 12-week roadmap and phase matrix.
- [`docs/project-control/TIMELINE.md`](docs/project-control/TIMELINE.md): Append-only event history.
- [`docs/project-control/EVIDENCE.jsonl`](docs/project-control/EVIDENCE.jsonl): Append-only evidence ledger.
- [`docs/project-control/DECISIONS.md`](docs/project-control/DECISIONS.md): Architectural decisions log.
