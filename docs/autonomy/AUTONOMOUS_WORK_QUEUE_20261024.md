# Controlled LARİ autonomous source execution queue (2026-10-24)

## Queue governance
**No blanket grants**. The Controller may select bounded safe product work and authorize ordinary source edits/tests/review commits. Owner retains privileged operations. Agent autonomy means fewer routine prompts, durable checkpoints, accurate evidence and safe continuation, not permission to merge/deploy SQL/start paid services.

### W0 — Exact state reconciliation (mandatory before every work session)
Read GitHub PR9/12/14/16, branch heads, CI and issue #10, #11, #13, #15. Re-read LARİ staging default and production quarantine metadata. If refs differ, reconcile read-only; do not silently rebase/reset. Confirm no secret/paid/prod tools active. Read this handoff, roadmap, V1/V2 master plan, and affected code files. Create isolated branch/worktree and journal initial state.

### W1 — Consolidate review chain safely (source-only first)
Review dependency DAG and changed paths for PR9 → 12 → 14 → 16; determine what a controlled sequential staging merge WOULD require. Produce exact safe merge proposal, blast-radius map, branch isolation and CI plan. **No merges permitted by this handoff**. The chain can continue as stacked Draft PRs; do not block other work while merge approvals are pending. Check whether side-line V1/UI-V2 `staging/ci-lari-release-gate-c1-c4-20261017` is divergent: do not blindly combine trees or delete history.

### W2 — Phase E hardening before real provider activation
- Browser-callable `verifiedProviderReceipt?: boolean` in local and Supabase outbox repos is NOT an authoritative provider proof: test spoofed `true`, require trusted server-only attestation / RPC/service endpoint and immutable correlation before allowing any real `sent/delivered` mutation. Do not implement an undocumented browser bypass.
- Confirm tenant-scoped RLS and transport, callback correlation, authenticated server issuer, signature/replay validity, provider delivery vs provider acceptance distinction, idempotent event persistence, outbound consent/opt-out and cost/quota behavior. Local fakes must not claim real provider integration.
- Replace raw tenant/event identifiers in diagnostic exceptions/logs with safe fixed classifications. Keep no-live-send mode.
- Confirm `skipped` mapping to schema `failed+metadata` cannot cause queue worker reenqueue, without staging DB writes; report schema divergence and gate real changes.

### W3 — Phase C payment activation integrity (offline source only)
- Ensure `subscription.created` cannot itself mark `active/paid` without verified settlement and proper entitlement state.
- Remove lookup-then-insert non-atomic replay race in `payment-webhook/index.ts` via defined database uniqueness/upsert contract (SQL changes need separate authorization); until persisted uniqueness proven, keep external activation disabled.
- Check every Supabase audit, subscription update, payment insert error and transaction atomicity; reject fake event/customer/tenant/currency/amount. Avoid logging raw provider IDs or secrets.
- Provider HMAC local fixtures are not official iyzico compatibility; real sandbox requires independently authorized credentials and network use, not covered here.

### W4 — Phase F real salon preparation without activation
- Test demo-only onboarding, synthetic QR booking, staff/branch/service rules, calendar, 5 booking journey, leave/working-hour rules and tenant isolation; ensure no real publish RPC or real source writes.
- Clearly separate SuperAdmin preview approval from `approveGoLive` real RPC, localStatus `DEMO_REHEARSAL_APPROVED` from published, and fake booking/communication data from real production acceptance.
- Produce a practical owner-operated first salon onboarding rehearsal checklist and negative QA; do not import real PII/customer lists or activate provider sends.

### W5 — Broader V1/V2 readiness
- Use 21-Oct V1/V2 master plan and current `docs/PRODUCT_CAPABILITY_MATRIX.md` to create a full user-facing module/source/CI/browser/staging/prod evidence matrix for every promised SaaS feature. Distinguish finished source, integration pending, business/provider/legal gated and V2-only. Do not redesign accepted V1 or ignore divergent UI-V2 lineage.
- Prioritize actual booking/customer experience, tenancy, accessibility, preview, data-mode integrity, Admin/SuperAdmin security and founder handoff; propose bounded independent code WPs.
- Phase G production PREPARATION may include readiness gates and documentation only; not go-live. Phase H multilingual planning can run in parallel if scoped.

### W6 — Proof and handoff loop
For any safe WP: baseline → reproduce → exact source fix → negative+behavior tests → TypeScript/build/secrets → existing CI/PG17 security guard (automated hosted) → evidence → Draft PR. Record tested layers separately. Update issue and `docs/autonomy` as appropriate. All new work must preserve protected workflow blobs and P0 migration HOLD.

### Exit rules
- If one provider/recovery/environment tool unavailable: record as EXTERNAL_PENDING, continue other independent SOURCE_ONLY WPs.
- At any privilege boundary: STOP ONLY that action, return exact required owner GO with SHA/environment/side effects and rollback.
- If AOS V2 remains STOPPED, use human-authorized AG/Codex source executor; do NOT call AOS autonomous execution ready or tamper with its WP2.
- No silent owner notifications, no hidden continuous background tasks or unattended paid compute.

## Next acceptance report format
`SOURCE_SHA, BASE_SHA, DRAFT_PR, CHANGED_PATHS, REPRO, NEGATIVE_TESTS, HOSTED_CI_EXACT_SHA, SIMULATED_VS_LIVE, SECURITY_BLOCKERS, NEXT_SAFE_WP, PRIVILEGED_GO_REQUESTS`.
