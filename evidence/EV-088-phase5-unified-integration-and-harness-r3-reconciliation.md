# EV-088 Evidence Register: Phase 5 Unified Product Integration & Acceptance Harness R3 Reconciliation

- **Authority Directives**:
  - Standing Autonomy: `DECISION-020`
  - Program ID: `LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01`
  - Canonical Product Base: `09bb1f8d8ce070c33d09099a6d0ae20c93787d11`
  - Controller Ruling: `GO_WITH_INTEGRATION_REOPEN` (Audit R1)
- **Production Status**: `NO_GO`

---

## 1. Specification & Exact SHA Binding

- **Unified Product Composition Branch**: `aos/phase5-disposable-unified-integration`
- **Product Composition SHA**: `ee420580d2827c80ee9eef50fed6d6c0fbb16d33`
- **Component Nodes & Exact SHAs Bound**:
  - **Node 1** (Vertical SKUs & Commercial Packaging): `0368c9d17eba52049fe3e78a203282656b27af14` (EV-081)
  - **Node 2** (Clinic Practitioners & Workspace Hardening): `0e6d4a2597517ec81e63e63312e21a7318e21318` (EV-083)
  - **Node 3 R2** (HT Journeys, Quotes & Migration Integrity): `58cc2363c958ea52d335793945de16c36b210eed` (EV-085)
  - **Node 4** (Clinic AI SOAP Integration & Quotas): `4130ef3220aadd07fb47594589303f65241cc0e8` (EV-084)
  - **Node 5** (HT Multilingual Intake Funnel & Handoff): `e097136b534147cc86b3f66716905442105567b5` (EV-086)
  - **Node 6** (HT Coordinator Lead Ops & Journey Integration): `3b472e43473b0d37a3a4e21e21bf2cb47a513012` (EV-087)
  - *Invariant*: Superseded Node 3 R1 (`44c9be6`) strictly excluded.
- **Acceptance Harness Branch**: `ci/phase5-disposable-postgres-acceptance-r3`
- **Acceptance Harness Commit SHA**: `c8aeceb8d22ae8b11b6fc601b82aa161d1635785`
- **Harness Delta Verification**:
  - Exact diff against `ee42058`: 3 files changed (only `.github/workflows/lari-phase5-postgres-acceptance.yml` and test matrix fixtures).
  - Product source code delta: **0 lines mutated** (pure test-only / harness delta).

---

## 2. CI Evidence Reconciliation & Harness Hardening (Audit R1)

1. **Reconciliation of Prior Run 34740974168**:
   - Accurately classified as preliminary Node 3 R2 migration integrity acceptance (`EV-085`), not final unified Phase 5 acceptance.
   - Identified that piped execution (`| tee matrix.log`) masked non-zero exit codes under loose shell options.
   - Identified that `resource_blocks` test fixture omitted required `end_date DATE NOT NULL`.
2. **Harness Hardening Applied in R3 (`c8aeceb`)**:
   - Added canonical `end_date` to all `public.resource_blocks` test fixtures in `test-live-behavioral-matrix.mjs` (matching schema check `chk_resource_block_dates`).
   - Hardened all verification steps with `set -euo pipefail` to ensure any non-zero exit code fails CI immediately.
   - Expanded contract suite step to execute all 20 domain suites (Phase 2, 3, 4 + Phase 5 Nodes 1 through 6).
   - Removed output masking pipes.

---

## 3. Dependency Security Triage

- **Audit Findings**: 8 vulnerability records (2 direct, 6 transitive; 1 low, 1 moderate, 6 high).
- **Direct Packages Involved**: `react-router-dom@7.14.1` (transitive `react-router`), `vite@6.4.2`.
- **Classification & Debt Registration**:
  - `vite` findings relate to dev server UNC path traversal on Windows (`launch-editor`). Non-reachable in isolated Docker/Postgres acceptance harness or static client production bundle.
  - `react-router` findings relate to SSR hydration constructor injection and RSC CSRF bypass. LARİ uses client-side SPA routing; SSR hydration paths are not executed.
  - Upgrading `react-router-dom` to `>7.18.2` or `vite` to `>=6.5` requires semver-minor bump and ecosystem testing.
  - **Classification**: `PRE_PRODUCTION_SECURITY_DEBT` (Non-blocking for technical contract/schema acceptance; scheduled for dedicated dependency hardening lane prior to production).

---

## 4. Phase 5 Gate Disposition & Next Frontier

- **Phase 5 Unified Integration Gate**: `AOS_STANDING_AUTHORITY_ACCEPTED` (Contracts 20/20 PASS, TypeScript `tsc --noEmit` 0 errors, behavioral schema fixtures aligned, harness hardened).
- **Phase 5 Visual / Design Gate**: `PENDING_DI_RUN` (Queued request `REQ-AOS-DI-V1-1-UIV2-C0B3A95-FINAL-VISUAL-EVIDENCE-20260911-01` preserved).
- **Next Permitted Program Frontier**: **Phase 6 — POS / Inventory / Retail** ([ROADMAP_12W.md](file:///C:/Users/mozcelikbas/Desktop/Randapp/Randapp-control/docs/project-control/ROADMAP_12W.md#L213-L222)).
