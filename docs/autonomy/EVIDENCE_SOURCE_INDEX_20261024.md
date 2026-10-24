# LARİ evidence and source map — 2026-10-24

## Primary GitHub evidence (re-read before use)
- Production source and Default staging: https://github.com/MertSGI/Randapp-main/tree/staging/supabase-staging-consistency
- Current source-only accepted frontier (unmerged PR16): https://github.com/MertSGI/Randapp-main/tree/review/lari-phase-e-f-product-execution-20261024
- PR9→PR12→PR14→PR16 chain: https://github.com/MertSGI/Randapp-main/pull/9 ; /pull/12 ; /pull/14 ; /pull/16
- PR16 exact SHA CI: https://github.com/MertSGI/Randapp-main/actions/runs/40116627084 (PR) and https://github.com/MertSGI/Randapp-main/actions/runs/40116591795 (push).
- Source-only roadmap `docs/LARI_NEXT_PHASE_ROADMAP.md` and `docs/PRODUCT_CAPABILITY_MATRIX.md` at PR16 HEAD; Phase B cutover proposal `docs/PHASE_B_STAGING_CUTOVER_PROPOSAL.md`.
- Phase A source `scripts/verify-phase-a-functional-acceptance.mjs`, Phase B `scripts/verify-phase-b-staging-source-readiness.mjs`, Phase C `scripts/verify-payment-mode-safety.mjs`, `scripts/verify-iyzico-webhook-cryptography.mjs`, `scripts/verify-subscription-lifecycle-integrity.mjs`, Phase D `scripts/verify-phase-d-routing-rehearsal.mjs`, Phase E `scripts/verify-communication-provider-rehearsal.mjs`, Phase F `scripts/verify-synthetic-salon-onboarding.mjs`.
- QA orchestration `.github/workflows/lari-pg17-role-qualification.yml` with real CI logs; protected backup and quarantine workflows remain manual-only.
- Recovery/production blocker https://github.com/MertSGI/Randapp-main/issues/10
- Phase A/B progress https://github.com/MertSGI/Randapp-main/issues/11
- Phase C/D progress and payment risks https://github.com/MertSGI/Randapp-main/issues/13
- Phase E/F accepted source and AG report https://github.com/MertSGI/Randapp-main/issues/15#issuecomment-6387380805

## Privately-held project materials — not auto-committed to public GitHub
Owner handoff ZIP accompanying this document provides:
- Historical foundational project inputs: `AOS V.1.1.txt`, `AOS V2 Uygulama Kararı.txt`, `Branch · 1308206LARISONPROJEDURUMU.txt`, `Mimariyi yeniden hizalama.txt`, `Proje Devralma Analizi.txt`, `Yürütme Planı Özeti.txt`.
- `LARI_EKSIKSIZ_DEVIR_2026-10-21(1).md`, `LARI_V1_V2_MASTER_YAYIN_PLANI_2026-10-21.md`, `NEW_CHAT_START_LARI.md`. Historical; superseded state and no new execution authority.
- Prior Controller-generated bounded implementation orders and source ZIPs for PG17 backup, Batch14/15 security, owner-local recovery, PR9 hosted acceptance; these are provenance/reference only. Do NOT blindly replay historical commands or one-shot GOs.
- Private Master Plan Google Doc titled `LARİ — V1/V2 + 7/24 Otonom Geliştirme | Bağlayıcı Master Plan v1.1 | 2026-10-21`. Appended decisions #35–#48 and the current handoff #49. Read in authenticated private context; DO NOT mirror full private 100k+ character history into public GitHub.
- AOS+LARİ private parallel controller plan and AOS V2 corrective history; AOS execution currently STOPPED (separate authority).

## Evidence classifications and red flags
- `SCHEMA/CODE_PRESENT` ≠ `STAGING_DEPLOYED` ≠ `RUNNING_PROVIDER` ≠ `OWNER_ACCEPTED`.
- Real PostgreSQL encrypted capture is **not** full Supabase backup: excludes Storage object bytes, platform/provider secrets, offsite accessibility checks, Edge Function deployment, Vault root keys and acceptance.
- No actual final AOS V2 agentic execution proof: accepted AOS WP1 source foundation only; WP2 FAIL_REPLAN, accepted_head null.
- Stacked Draft PRs are **NOT integrated into default staging**; CI green on review HEADs is not a merge warrant.
- Production quarantine, preview deployment and source-only pilot claims remain distinct.
- Old 21-Oct portable handoff contains now-obsolete PR3/staging SHAs. Always read the new 24-Oct handoff FIRST, keep old material as full historical ledger.
