# EV-086 Evidence Register: Phase 5 Node 5 Multilingual Intake Funnel & AI Handoff

- **Authority Directives**:
  - Standing Autonomy: `DECISION-020`
  - Program ID: `LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01`
  - Canonical Product Base: `09bb1f8d8ce070c33d09099a6d0ae20c93787d11`
  - Upstream Base (Node 3 R2): `58cc2363c958ea52d335793945de16c36b210eed`
- **Production Status**: `NO_GO`

---

## 1. Candidate Specification

- **Branch**: `aos/phase5-ht-funnel-multilingual`
- **Commit SHA**: `e097136b534147cc86b3f66716905442105567b5`
- **Remote Ref**: `origin/aos/phase5-ht-funnel-multilingual`
- **Component Scope**:
  - `components/health-tourism/HealthTourismIntakeForm.tsx`
  - `components/health-tourism/HtAiChatWidget.tsx`
  - `pages/health-tourism/HealthTourismLandingPage.tsx`
  - `scripts/test-phase5-node5-funnel-contracts.mjs`

---

## 2. Implemented Features & Invariants Verified

1. **Multilingual Intake Support**:
   - 5 languages fully supported: Turkish (`tr`), English (`en`), German (`de`), Russian (`ru`), Arabic (`ar`).
   - Verified Arabic RTL layout support (`dir="rtl"`) and localized labels/back-navigation.
   - Fixed Arabic summary translation (`emailSummary: 'البريد الإلكتروني'`).
2. **Tenant Branding Integration**:
   - Passthrough tenant primary branding color (`primaryColor`) applied to stepper headers, active pills, and action buttons.
3. **Strict Zero Direct UI Table DML**:
   - Verified no direct `.from('ht_leads')` insert/update operations in form or chat widget.
   - All intake persists strictly through server-authoritative `ht_create_public_lead` RPC.
4. **AI Safety Boundaries & Guardrails**:
   - Chat capability boundary and medical boundary deferrals enforced client and server-side.
   - No direct table DML for AI messages or conversations.
5. **Static Contract Test Suite**:
   - `scripts/test-phase5-node5-funnel-contracts.mjs`: 34/34 assertions PASSED.
6. **Typecheck & Build Cleanliness**:
   - `tsc --noEmit` cleanly passes with 0 type errors.
