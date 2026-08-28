# 12-Week Master Delivery Roadmap & Phase Matrix

## Master Product Delivery Train Priority

```
LARİ CORE [FROZEN / CLOSED_PROVEN]
  └── PACKAGE / CUSTOMER CUSTOMIZATION [CLOSED_PROVEN]
        └── LARİ CLINIC [CLOSED_PROVEN]
              └── LARİ HEALTH TOURISM [IN_PROGRESS - SLICE 1 & SLICE 2 CLOSED_PROVEN]
                    └── FINAL DELIVERY
```
*Note: UI V2 is a parallel frontend lane and NOT a separate product roadmap phase.*

---

## 12-Week Timeline Overview

- **Duration**: 12 Weeks
- **Day 0**: `UNKNOWN / NEEDS_RECOVERY` (No historical Day 0 date anchor found in prompt history/docs; resetting from today is strictly forbidden).
- **Day 0 State**: `NEEDS_RECOVERY`

---

## Phase Matrix & Progress

| Phase / Layer | Scope / Milestone | Status | Evidence Level |
| :--- | :--- | :--- | :--- |
| **1. LARİ Core** | Technical Staging Browser Acceptance | `CLOSED_PROVEN_TECHNICAL_ACCEPTANCE_COMPLETE` | E4 (Shared Staging Live) |
| **1. LARİ Core** | Provisioning & Idempotency | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **1. LARİ Core** | Commercial Contracts & Boundaries | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **1. LARİ Core** | Onboarding Contracts & Readiness | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **1. LARİ Core** | Onboarding State Handoff | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **1. LARİ Core** | Baseline Integration | `INTEGRATION_ALREADY_SATISFIED` | E1 (Source Proven) |
| **1. LARİ Core** | Outbox / Provider Abstraction | `PRESENT_ON_CORE_BASELINE` | E1 (Source Proven) |
| **1. LARİ Core** | Public Booking Anti-Abuse | `PRESENT_ON_CORE_BASELINE` | E1 (Source Proven) |
| **1. LARİ Core** | Demo Isolation & Subdomain Readiness | `PRESENT_ON_CORE_BASELINE` | E1 (Source Proven) |
| **1. LARİ Core** | Core Runtime Proof (`CORE-RC.3`) | `CLOSED_PROVEN` | E3 (Isolated Runtime E2E) |
| **1. LARİ Core** | Release Candidate Finalization (`CORE-RC.4`) | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **2. Package Customization** | Branch Server Authority (Slice 1) | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **2. Package Customization** | Commercial Source-of-Truth Alignment (Slice 2) | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **3. LARİ Clinic** | Clinical Domain Server Authority (Block 1) | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **3. LARİ Clinic** | Operational Integration & Application Services (Block 2) | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **3. LARİ Clinic** | Clinic Workspace UI & Isolated E3 Acceptance (Block 3) | `CLOSED_PROVEN` | E3 (Isolated Runtime E2E) |
| **3. LARİ Clinic** | Clinic Core Milestone | `CLOSED_PROVEN` | E3 (Isolated Runtime E2E) |
| **3. LARİ Clinic** | Speech-to-Text & SOAP Draft Assist (`CLINIC_AI_ASSIST_V1`) | `CLOSED_PROVEN` | E3 (Isolated Runtime E2E) |
| **4. LARİ Health Tourism** | International Patient & Agency Operations Scope | `CLOSED_ACCEPTED` | E1 (Source Proven) |
| **4. LARİ Health Tourism** | Server Authority & Lead Domain Core (Foundation Slice 1) | `CLOSED_PROVEN` | E2 (Exact-SHA CI) |
| **4. LARİ Health Tourism** | Multilingual Public Intake & Surface (Slice 2) | `CLOSED_PROVEN` | E3 (Isolated Runtime E2E) |
| **5. Final Delivery** | Production Cutover & DNS/Commercial Launch | `NOT_STARTED` | N/A |

---

## Detailed Milestone Descriptions

### Phase 1: LARİ Core (FROZEN / CLOSED_PROVEN)
- **Status**: CLOSED_PROVEN. All core database migrations (59 files), RPCs, entitlement resolvers, onboarding state machine, and release candidate contracts are closed and verified on official RC baseline `release/core-rc4` (`e1bb23dbbc2f1f079ec6bbc93e3cb9b83db1839a`).
- **Milestones**:
  - `CORE-RC.3`: `CLOSED_PROVEN` (`E3_ISOLATED_RUNTIME_E2E`). UI V2 redesign designated as non-blocking parallel workstream (`DEFERRED_PARALLEL_NON_BLOCKING`).
  - `CORE-RC.4`: `CLOSED_PROVEN` (`E2_EXECUTABLE_EXACT_SHA_CI`, GitHub Actions Run `32134598853`). Cross-layer `pending_onboarding` subscription status contract alignment verified.

### Phase 2: Package / Customer Customization (FROZEN / CLOSED_PROVEN)
- **Status**: CLOSED_PROVEN (`E2_EXECUTABLE_EXACT_SHA_CI`, GitHub Actions Run `32363490123`). Integrated Package baseline closed and frozen at exact product SHA `65a53427f52c21e60aa8f92e02a17d693a201601`. Both defined implementation slices are closed and proven together.
  - `Branch Server Authority` (Slice 1): `CLOSED_PROVEN` (`E2_EXECUTABLE_EXACT_SHA_CI`, GitHub Actions Run `32340331307`). Server-authoritative RPC mutations, 64-bit advisory locks, SELECT-only RLS policies, and 5-session concurrency matrix verified on `feature/package-customer-customization-foundation` at exact SHA `83089a0695e0a5f0cf0fda25c7006df5e6ad4c07`.
  - `Commercial Source-of-Truth Alignment` (Slice 2): `CLOSED_PROVEN` (`E2_EXECUTABLE_EXACT_SHA_CI`, GitHub Actions Run `32363490123`). Canonical 25 H1A feature keys, explicit legacy mapping matrix, dynamic legacy plan snapshot rendering, explicit unlimited flags without numeric sentinels, registration RPC server authority, and zero frontend price leaks verified on `feature/package-customer-customization-foundation` at exact SHA `65a53427f52c21e60aa8f92e02a17d693a201601`.

### Phase 3: LARİ Clinic Package (CLOSED_PROVEN)
- **Status**: CLOSED_PROVEN (`008ebac4496d592d271d612713c437d316c416f0` / `451081f2619f0342df2a8c64ae401dffb7697363`). Downstream clinical package extension closed on accepted baselines.
  - `Clinical Domain Server Authority` (Block 1): `CLOSED_PROVEN` (`E2_EXECUTABLE_EXACT_SHA_CI`, GitHub Actions Run `32395034938`, evidence SHA `78c3e49a1883aafb74ff2e8f18acd9876e74a01b`). Materialized `clinic_staff_profiles`, `clinic_patient_profiles`, `clinic_encounters`, and `clinic_encounter_notes` (61st migration `20260905_lari_clinic_domain_server_authority.sql`), 6 server-authoritative RPCs, strict RLS policies, 64-bit advisory locking for versioned append-only clinical notes, audit privacy protection, cross-tenant isolation, and 3-session concurrency matrix verified at product SHA `2bb2b32d95387e09da06c7442a8617ccd38e4feb`.
  - `Operational Integration & Application Service Layer` (Block 2): `CLOSED_PROVEN` (`E2_EXECUTABLE_EXACT_SHA_CI`, GitHub Actions Run `32457917961`, evidence SHA `4432d95b7335689242db61ba5562f0560b2d1585`). Materialized migration 62 (`20260906_lari_clinic_operational_integration.sql`), confirmed-only encounter start rule, atomic encounter+appointment completion RPC, operational day read model without SOAP fields, `clinicService.ts`, and `supabaseClinicRepository.ts`.
  - `Clinic Workspace UI & Isolated Real-Browser Acceptance` (Block 3): `CLOSED_PROVEN` (`E3_ISOLATED_RUNTIME_E2E`, GitHub Actions Run `32624729632`, isolated project `miuecvkkmyvaciticwtm`). Verified workspace UI, authenticated role context switching, read-only evidence recapture (`7E2954A3...`), distinct UI screenshots, and DB immutability.
  - `Speech-to-Text & SOAP Draft Assist` (`CLINIC_AI_ASSIST_V1`): `CLOSED_PROVEN` (`E3_ISOLATED_RUNTIME_E2E`, GitHub Actions Run `32840780417`, isolated project `miuecvkkmyvaciticwtm`, product SHA `451081f2619f0342df2a8c64ae401dffb7697363`). Real Groq transcription (`whisper-large-v3-turbo`) and SOAP draft (`openai/gpt-oss-120b`) proven under practitioner authority with atomic commercial quota metering, strict human approval boundary, zero raw audio DB persistence, and 0 autonomous clinical completions.

### Phase 4: LARİ Health Tourism Package (IN_PROGRESS)
- **Status**: IN_PROGRESS. Canonical 37-row scope matrix accepted (24 COMMITTED, 3 DEFERRED, 10 EXPLICITLY_OUT_OF_SCOPE, 0 SUPERSEDED in matrix).
  - `Health Tourism Foundation Slice 1` (Server Authority & Lead Domain Core): `CLOSED_PROVEN` (`E2_EXECUTABLE_EXACT_SHA_CI`, GitHub Actions Run `32996883374`, Job `98268377731`, Artifact `9616929855`, evidence SHA `93d852f9c0ddcbddf3d25f476cee17e8d00aa3f7`, product SHA `401dbf9a10ffccef594a19c7c1070a256ae279bf`). Materialized 66th migration `20260910_lari_health_tourism_foundation.sql`, `ht_agency_profiles`, `ht_leads`, `ht_lead_audit_logs`, 4 server-authoritative RPCs (`ht_create_public_lead`, `ht_get_lead`, `ht_list_leads`, `ht_update_lead_status`), strict RLS policies denying direct table SELECT for authenticated & anon roles, optional passport storage in DB intake with zero passport exposure in RPC outputs/audits, 100-item pagination limit with negative-offset clamping, lead status lifecycle audit logging (`new` -> `contacted`), zero Clinic/Core side-effect patient/encounter creation, staff quota trigger alignment, and 32/32 pgTAP behavioral tests verified.
  - `Multilingual Public Intake & Surface` (Slice 2): `CLOSED_PROVEN` (`E3_ISOLATED_RUNTIME_E2E`, product SHA `6e8d423083d44510c8446c7a858c26d1555cac0c`, E2 evidence SHA `c89dab28e9784d400c8643ac9d57a132701a4d82`, GitHub Actions Run `33145277911`, Job `98764791271`, isolated Supabase project `miuecvkkmyvaciticwtm`). Verified 5-language parity (TR, EN, DE, RU, AR), RTL direction for AR, multi-step public intake UI, passport default OFF, ISO-2 country selection, tenant publication gate (ACTIVE + PUBLISHED allowed, INACTIVE/SUSPENDED/DRAFT blocked), source channel & agency attribution, cross-tenant isolation, post-submit PII form clearing, 20/20 E2 exact-SHA named checks, and direct real-browser lead creation (`d49baafa-c144-4a24-9482-804fcdeca4cb`). Zero Clinic patient/encounter/appointment side-effects. Arabic back-button copy polish recorded as `OPEN_NON_BLOCKING_COPY_POLISH`.

### Phase 5: Final Delivery
- **Status**: Not Started. Final production cutover, wildcard DNS/SSL configuration, SMS/WhatsApp provider account activation, payment activation (Iyzico), and commercial launch mode enablement.
