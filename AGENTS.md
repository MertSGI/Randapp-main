# LARİ agent execution contract — 2026-10-24

Read `docs/autonomy/START_HERE_20261024.md` before any code operation. This AGENTS.md is part of the source-only autonomous-continuation handoff and has NOT been merged into staging.

## Source of truth
1. Authenticated current GitHub heads, protected workflow blobs and CI jobs (read them again, never trust stale SHA claims).
2. This branch's `docs/autonomy/` handoff index; root `docs/LARI_NEXT_PHASE_ROADMAP.md`; V1/V2 source lineage and acceptance docs.
3. Owner's private LARİ binding Master Plan v1.1 (Google Docs; link provided separately in private handoff).
4. Past conversation/export files are historical evidence only; older 'next action' guidance is superseded by current owner direction.

## Permitted autonomy (without another routine question)
- Read source/evidence; analyze; design bounded fixes; edit/commit on NEW isolated review branches; run fake/offline tests and ordinary exact-head hosted CI; create/update draft PRs and issue documentation; maintain durable checkpoints.
- Continue independent safe work packages when a tool or provider is missing.
- Propose, NOT execute, staging SQL, real providers, public deployment, DNS/alias, migrations, billing, production or private-key operations.

## Human authorization required
- Every protected live staging SQL / migration or data write; merges into staging/main; production deployment, alias/DNS, public live traffic; real email/SMS/WhatsApp send; sandbox/live financial transaction/provider activation; new backup or quarantine workflow dispatch/retry; any paid service; private age identity/recovery decrypt; destructive Git operations.
- Never infer authorization from stale owner GO, a green CI, or a previous task. No automatic retry of privileged workflow actions.

## Mandatory holds
- GitHub Issue #10 is permanent **PRODUCTION-RELEASE-ONLY** recovery blocker until independently closed. It does NOT block source development/preview/draft PRs. PostgreSQL logical restore is NOT verified; ciphertext capture does NOT satisfy backup recoverability.
- Prior staging migration workflow `lari-staging-migrations.yml` has unconditional first-step HOLD; do not bypass.
- Payment provider and delivery receipt integrity require additional source security acceptance before any real activation.
- AOS V2 runtime WP2 is `FAIL_REPLAN` / `STOPPED` and is NOT an authorized live autonomous executor. AOS continuation requires separate Controller mandate and exact authority reconciliation. Do not touch AOS V1/legacy user resources from LARİ work.

## Exact source frontier at preparation time
- LARİ staging `staging/supabase-staging-consistency`: `2c6a99b0b92ecea4f324c7195b3222f92688f294`.
- Open Draft dependency stack PR9 `59985110ab8bad49d0af036ddda90e6e5ea0defc` -> PR12 `2930c9d018ff858000fbe4273ca9d549d81d1e87` -> PR14 `8c5e0e464dbbe570b978009052d6088075b4e6f5` -> PR16 `752a478c452650030963b315d19b4ee2c9659e3a` (all unmerged). These are readback coordinates, not merge grants.
- Master detailed pointer: `docs/autonomy/EVIDENCE_SOURCE_INDEX_20261024.md`.

## Standard loop
`reconcile authority → pin exact refs → preflight isolation → select bounded source-only work → implement + negative tests → independent QA → draft PR → evidence/checkpoint → STOP at human gate`.

No hidden background execution, no indefinite watches, no unsourced PASS claims, no private secrets in Git, logs, issues, tests or artifacts.
