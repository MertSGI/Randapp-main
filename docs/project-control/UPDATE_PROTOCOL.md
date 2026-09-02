# Project Control Plane Update Protocol

## When a Control Plane Update IS Required

A dedicated commit to `control/lari-project-control-plane` is **MANDATORY** whenever:

1. **Gate State Change**: A roadmap gate transitions state (e.g. from `IN_PROGRESS` to `CLOSED_PROVEN`, or `HOLD`).
2. **New Product SHA Accepted**: A new product commit SHA is formally accepted as a baseline.
3. **New Authoritative Evidence**: A new GitHub Actions Run ID or live runtime observation is verified that closes or reopens a gate.
4. **Blocker State Change**: A critical blocker is added, resolved, or reclassified.
5. **Architectural Decision**: A core architectural or product decision is made or amended.
6. **Critical-Path Action Shift**: The primary recommended next action changes.
7. **Claim Rejection/Correction**: An agent claim is explicitly rejected, superseded, or corrected with empirical evidence.

---

## When a Control Plane Update IS NOT Required

DO NOT update the control plane for:
- Routine CI retries with no state change.
- Exploratory code reviews or investigatory read-only questions.
- Uncommitted draft code changes.
- Speculative discussions or unverified ideas.
- Duplicate executions of already accepted evidence.

---

## Commit & Branch Discipline

- Updates to `control/lari-project-control-plane` should be isolated in dedicated documentation commits formatted as:
  `docs(control): <short description of control plane update>`
- The `control/lari-project-control-plane` branch must be pushed to `origin` immediately upon commit.
