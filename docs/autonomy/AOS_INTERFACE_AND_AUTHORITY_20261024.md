# AOS autonomy handoff boundary — not a runtime activation

**Separate repository:** https://github.com/MertSGI/AOS . As independently read on 2026-10-24: main `9d3168afb35edf5ad06e6b5e419801493fe04572`, AOS V2 work branch `feature/aos-v2-execution-seam-20261018` `cc172aeade0df68380857e4ce4a4deb0e139b3fa` (later remote HEAD; actual code/runtime acceptance not implied).

## Canonical AOS control plane
Read current `docs/project-control/STATE.json`, `DECISIONS.md`, `EVIDENCE.jsonl`, `docs/aos-v2/RESUME_HERE.md`, `docs/aos-v2/14_IMPLEMENTATION_CONTRACT.md`, `docs/aos-v2/06_EXECUTOR_PACKETS/02_WP2_CORRECTION_20261019.md` and accepted provenance on pinned branch.

**Observed canonical decision:** `extensions.aos_v2.operational_status=INCOMPLETE_WP2_FAIL_REPLAN_CURRENT_APPROACH_STOPPED`; `WP2.status=FAIL_REPLAN`; `WP2.accepted_head=null`; `WP3 WAITING_PREDECESSOR`, WP4 NOT_RUN, WP5 WAITING. Owner/Controller STOP for prior correction applied; no implicit authorization to resume.

## Desired architecture (NOT implemented acceptance)
AOS is **ZERO-COST-FIRST RESOURCE ORCHESTRATOR**, NOT merely rotating free LLMs. Durable canonical Git/project state → capability/task/resource planner → native task executors → local Qwen (user previously described 16 GB RAM, i5, no discrete GPU) → free cloud providers / FreeLLMAPI → costly but high-value AG/Codex/Cline agentic workers when appropriate. AG quota exhaustion must produce durable checkpoint + capability fallback, not project failure. Paid fallback DISABLED without explicit owner approval. AG is a privileged high-complexity execution worker, not generic provider #N. Keep capability, health, quota, cost, evidence provenance and stop gates. Protected V1/history must not be modified.

## What the next Controller should do
1. Decide whether LARİ should remain in a manual Controller→AG/Codex pipeline or a separately authorized AOS WP2 remediation/acceptance project can resume; **NO launch by this handoff**.
2. Reconcile exact AOS branch, canonical STOP, local unpushed work and AOS CI without resetting, cleaning, rebasing, merging, replaying old corrective GOs or falsely promoting test PASS.
3. Draft separately recorded, minimal scoped WP2 source-remediation authority preserving 14 contract and Q01–Q20 if owner approves. No AOS V1/legacy/LARİ/paid/production cross-write.
4. Only after independent real HTTP native execution, trusted evaluator boundary, Linux and Windows OS sandbox negatives, durable exact receipt and exact-head CI acceptance may future LARI work be delegated to AOS runtime.
5. LARI work remains safe via isolated review branch + bounded AG/Codex source jobs independent of AOS availability. No direct service credential/key relay to AOS.

**Important:** This file is an interface contract/proposed intake packet. It does not start an AOS job, update an AOS state file, authorize WP2 source coding, or claim the agent runs 7/24.
