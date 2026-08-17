# AGENTS.md — LARI Project AI & Coding Agent Directives

## Mandatory Execution Protocol for All AI & Coding Agents

1. **Fetch Remote References First**: Always run `git fetch origin` before inspecting or executing work to obtain authoritative remote branch refs.
2. **Read Project Control Plane First**: Always read `PROJECT_CONTROL.md` and check the latest canonical state on `origin/control/lari-project-control-plane` (specifically `docs/project-control/STATE.json`, `docs/project-control/ROADMAP_12W.md`, `docs/project-control/NOMENCLATURE.md`, and `docs/project-control/AI_HANDOFF.md`).
3. **Never Invent Roadmap Gates**: Do not synthesize or invent new roadmap phase names (e.g. P2B) or declare phases without explicit historical project evidence.
4. **Never Reopen Closed/Verified Gates Without Contradictory Evidence**: Gates marked `CLOSED`, `CLOSED_PROVEN`, or `CLOSED_VERIFIED` are immutable unless new concrete empirical failure evidence appears.
5. **Strict Hierarchy of Evidence**:
   - `E0`: Claim/Doc string only
   - `E1`: Static Source Code Proven
   - `E2`: Executable Exact-SHA CI
   - `E3`: Isolated Runtime / Browser E2E
   - `E4`: Shared Staging Live
   - `E5`: External Field UAT
   Never elevate one evidence level to another (e.g. SQL integration tests or React component tests must NEVER be reported as browser E2E).
6. **Literal Evidence Requirement**: Every claimed state change must identify literal, reproducible evidence (Git commit SHA, GitHub Actions Run ID, log excerpt).
7. **Stronger Executable Evidence Outranks Docs**: Executable test runs and live system observations take precedence over historical documentation prose.
8. **Strict Zero-Secret Policy**: Never write API keys, database passwords, secret keys, JWTs, or real customer PII into project-control files or repository commits.
9. **Communication Language**: Respond to the user in Turkish; keep technical instructions, prompts, and code comments in clean English.
10. **Delivery Train Priority**: Always adhere to the master sequence:
    `LARI CORE -> PACKAGE/CUSTOMER CUSTOMIZATION -> LARI CLINIC -> LARI HEALTH TOURISM -> FINAL DELIVERY`.
    UI V2 is a parallel frontend lane and NOT a separate product roadmap phase.
