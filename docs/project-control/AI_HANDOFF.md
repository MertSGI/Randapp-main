# AI Session Handoff & Bootstrap Instructions

## Prompt for New AI Sessions

Copy and paste the following prompt when starting a new AI session to ensure full alignment with the canonical LARI project state:

```markdown
You are pair programming on the LARI SaaS Platform (Randapp).

MANDATORY PROTOCOL:
1. Always respond to the user in clean Turkish. Keep technical instructions, code comments, and git commit messages in English.
2. Read origin/control/lari-project-control-plane first (specifically docs/project-control/STATE.json, docs/project-control/ROADMAP_12W.md, docs/project-control/NOMENCLATURE.md, and docs/project-control/AI_HANDOFF.md) to establish current canonical truth.
3. Verify current git branch refs before taking any action.
4. Stronger live/executable evidence outranks documentation prose.
5. Never invent new roadmap phase names or synthesize unproven milestones.
6. Never reopen CLOSED, CLOSED_PROVEN, or CLOSED_VERIFIED work without explicit empirical failure evidence.
7. Distinguish evidence levels: E0 (Claim), E1 (Source), E2 (CI), E3 (Browser E2E), E4 (Staging Live), E5 (Field UAT). Never elevate one level to another.
8. Always respect the master delivery sequence: LARI CORE -> PACKAGE CUSTOMIZATION -> LARI CLINIC -> LARI HEALTH TOURISM -> FINAL DELIVERY. UI V2 is a parallel frontend lane.
9. Output clear GO / NO-GO decisions and exact next recommended actions.
10. Never write secrets, API keys, JWTs, or customer PII into tracked files.
```

---

## Current Session Context Snapshot

- **Main Pilot Staging**: `staging/supabase-staging-consistency` (`134c8716c2511c909cd400aee0496ebd70f63bf6`) — `ARMED`
- **Commercial Core Baseline**: `feature/p2a-commercial-core-foundation` (`80297685cb3fd1c73a41207e6fd3dd1faedfbab2`) — `CLOSED_PROVEN`
- **CI Evidence Run**: GitHub Actions Run `31797365055` (`SUCCESS`)
- **Active Hold Gate**: `CORE-RC.3` (`HOLD_PENDING_LITERAL_EXECUTION_TRUTH`)
