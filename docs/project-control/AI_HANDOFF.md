# AI Session Handoff & Bootstrap Instructions

## Prompt for New AI Sessions

Copy and paste the following prompt when starting a new AI session to ensure full alignment with the canonical LARİ project state:

```markdown
You are pair programming on the LARİ SaaS Platform (Repository: MertSGI/Randapp-main).

MANDATORY PROTOCOL:
1. Always respond to the user in clean Turkish. Keep technical instructions, code comments, and git commit messages in English.
2. Read origin/control/lari-project-control-plane first (specifically docs/project-control/STATE.json, docs/project-control/ROADMAP_12W.md, docs/project-control/NOMENCLATURE.md, and docs/project-control/AI_HANDOFF.md) to establish current canonical truth.
3. Verify current git branch refs before taking any action.
4. Stronger live/executable evidence outranks documentation prose.
5. Never invent new roadmap phase names or synthesize unproven milestones.
6. Never reopen CLOSED, CLOSED_PROVEN, or CLOSED_VERIFIED work without explicit empirical failure evidence.
7. Distinguish evidence levels: E0 (Claim), E1 (Source), E2 (CI), E3 (Browser E2E), E4 (Staging Live), E5 (Field UAT). Never elevate one level to another.
8. Always respect the master delivery sequence: LARİ CORE -> PACKAGE CUSTOMIZATION -> LARİ CLINIC -> LARİ HEALTH TOURISM -> FINAL DELIVERY. UI V2 is a parallel frontend lane.
9. Output clear GO / NO-GO decisions and exact next recommended actions.
10. Never write secrets, API keys, JWTs, or customer PII into tracked files.
```

---

## Current Session Context Snapshot

- **Main Pilot Staging**: `staging/supabase-staging-consistency` (`134c8716c2511c909cd400aee0496ebd70f63bf6`) — `CLOSED_PROVEN_TECHNICAL_ACCEPTANCE_COMPLETE`
- **Commercial Core Baseline**: `feature/p2a-commercial-core-foundation` (`80297685cb3fd1c73a41207e6fd3dd1faedfbab2`) — `CLOSED_PROVEN`
- **Package Customization Baseline**: `feature/package-customer-customization-foundation` (`65a53427f52c21e60aa8f92e02a17d693a201601`) — `CLOSED_PROVEN`
- **Clinic Core Baseline**: `feature/lari-clinic-foundation` (`008ebac4496d592d271d612713c437d316c416f0`) — `CLOSED_PROVEN`
- **Clinic AI Assist V1 Baseline**: `feature/clinic-ai-assist-v1-provider-resilience` (`451081f2619f0342df2a8c64ae401dffb7697363`) — `CLOSED_PROVEN`
- **Isolated E3 Acceptance Project**: `miuecvkkmyvaciticwtm` — `ACCEPTED_CLOSED_PROVEN` (Migrations: 65 / `20260909_clinic_ai_assist_commercial_authority.sql`, E2 Run: `32840780417`, Artifact: `9560421750`)
- **Active Milestone**: `LARİ Health Tourism` — `HEALTH_TOURISM_FOUNDATION_SLICE1_CLOSED_PROVEN`
  - **Foundation Slice 1**: `CLOSED_PROVEN` (`E2_EXECUTABLE_EXACT_SHA_CI`, Product SHA `401dbf9a10ffccef594a19c7c1070a256ae279bf`, Evidence SHA `93d852f9c0ddcbddf3d25f476cee17e8d00aa3f7`, GitHub Actions Run `32996883374`, Job `98263359495`, Artifact `9616929855` digest `sha256:b3cca4afd2620080d3b2237a811f3f99cd281e345a6bfcb90b193aa197e0680d`). 66 migrations applied, staff quota trigger O->D->O aligned, 32/32 pgTAP assertions, 17/17 named behavioral proofs verified.
  - **Scope Reconciliation**: `ACCEPTED_CLOSED` (37/37 numbered items classified: 24 COMMITTED, 3 DEFERRED to Final Delivery, 10 EXPLICITLY_OUT_OF_SCOPE, 0 SUPERSEDED in matrix; 2 cross-cutting superseded items). Canonically persisted in [HEALTH_TOURISM_SCOPE_MATRIX.md](./HEALTH_TOURISM_SCOPE_MATRIX.md). EV-030 ACCEPTED by controller.
  - **Next Gate**: `HEALTH_TOURISM_SLICE2_MULTILINGUAL_PUBLIC_INTAKE_AND_SURFACE`
  - **Non-Blocking Security Follow-up**: Recorded `OBSERVED_DEPENDENCY_AUDIT_RISK / REVIEW_REQUIRED_BEFORE_PRODUCTION` (6 vulnerabilities: 1 low, 5 high reported during R7 npm ci).
