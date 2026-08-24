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
- **Isolated E3 Acceptance Project**: `miuecvkkmyvaciticwtm` — `ACCEPTED_CLOSED_PROVEN` (Migrations: 64 / `20260908`, E2 Run: `32624729632`, Recapture ZIP: `7E2954A3...`)
- **Active Milestone**: `LARİ Health Tourism` (`HEALTH_TOURISM_FOUNDATION`)
  - **Immediate Carry-Forward Slice**: `CLINIC_AI_ASSIST_V1` (`CLINIC_AI_ASSIST_SPEECH_TO_TEXT = DEFERRED_CARRY_FORWARD`)
  - **Health Tourism Scope**: Multilingual intake, agency attribution, Web AI Lead Agent, lead scoring, coordinator workflow, Clinic integration.
