# Architectural & Product Decision Register

## DECISION-001: Visible Product Brand & Domain Strategy
- **Status**: ACCEPTED
- **Decision**: LARİ is the canonical visible product brand for the multi-tenant SaaS platform.
- **Domain Strategy**: `randevulari.com` is the primary production domain strategy for tenant public links, manage URLs, and customer booking portals.
- **Legacy Context**: The repository name `MertSGI/Randapp-main` remains the legacy git path identifier.

## DECISION-002: Master Delivery Train Priority
- **Status**: ACCEPTED
- **Decision**: All platform engineering strictly follows the master delivery sequence:
  `LARİ CORE -> PACKAGE / CUSTOMER CUSTOMIZATION -> LARİ CLINIC -> LARİ HEALTH TOURISM -> FINAL DELIVERY`.
- **Constraint**: Clinic and Health Tourism are downstream package extensions on the same core, NOT separate standalone products. UI V2 is a parallel frontend lane, NOT a separate product roadmap phase.

## DECISION-003: Commercial Payment Isolation & Control State
- **Status**: ACCEPTED
- **Decision**: `paymentless_pilot` and `payment-disabled` mode is a temporary operational control state for pilot onboarding and technical acceptance, NOT a final architectural commitment.
- **Provider Activation**: External payment gateway (Iyzico) activation and subscription charges remain explicitly disabled until production cutover.

## DECISION-004: Real Human Customer UAT Non-Blocking Policy
- **Status**: ACCEPTED
- **Decision**: Real external human participant UAT is a deferred, non-blocking field validation step and is NOT on the critical path for technical acceptance of release candidates.

## DECISION-005: External Infrastructure Launch Dependencies
- **Status**: ACCEPTED
- **Decision**: External provider activation (SMS/Email providers) and wildcard DNS configuration (`*.randevulari.com`) are tracked external launch dependencies required before final production deployment.

## DECISION-006: AI Agent Roadmap Authority Boundary
- **Status**: ACCEPTED
- **Decision**: Coding assistants and AI agents orchestrate execution against the approved project control plane. Agents NEVER synthesize or invent new canonical roadmap phases (e.g., P2B).

## DECISION-007: CORE-RC.4 Closure & Main Delivery Train Advancement
- **Status**: ACCEPTED
- **Decision**: Milestone `CORE-RC.4` is closed as proven (`CLOSED_PROVEN` at level `E2_EXECUTABLE_EXACT_SHA_CI`, exact product SHA `e1bb23dbbc2f1f079ec6bbc93e3cb9b83db1839a`, GitHub Actions Run `32134598853`). Cross-layer `pending_onboarding` subscription status contract alignment is verified and frozen. The main product delivery train is advanced to `Package/Customer Customization`.

## DECISION-008: Package Customization Slice 2 Commercial Source-of-Truth Alignment Closure
- **Status**: ACCEPTED
- **Decision**: Milestone `Package Customization Commercial Source-of-Truth Alignment` (Slice 2) is closed as proven (`CLOSED_PROVEN` at level `E2_EXECUTABLE_EXACT_SHA_CI`, exact product SHA `65a53427f52c21e60aa8f92e02a17d693a201601`, evidence branch `ci/package-commercial-source-of-truth-exact-sha-r1-20260820` at `a337d85276728beffbec4a129aefc703328624d2`, GitHub Actions Run `32363490123`). The two-commit evidence lineage is accepted (intermediate `7c14a998` superseded by final exact-SHA product binding `a337d852`). Package / Customer Customization overall status remains `IN_PROGRESS`.

## DECISION-009: Package / Customer Customization Phase Closure & Advancement to LARİ Clinic
- **Status**: ACCEPTED
- **Decision**: The integrated Package / Customer Customization phase (Phase 2) is closed as proven (`CLOSED_PROVEN` at level `E2_EXECUTABLE_EXACT_SHA_CI`, exact product SHA `65a53427f52c21e60aa8f92e02a17d693a201601`, GitHub Actions Run `32363490123`). Both defined implementation slices (Branch Server Authority and Commercial Source-of-Truth Alignment) are proven together on the integrated baseline. No additional Package implementation slice is defined. The main product delivery train advances to `LARİ Clinic`. `LARİ Clinic` remains `NOT_STARTED` until its foundation materialization task is separately authorized. The frozen Package baseline must not be casually mutated after phase closure.

## DECISION-010: LARİ Clinic Identity & Core Appointment Model Preservation Policy
- **Status**: ACCEPTED
- **Decision**: LARİ Clinic preserves the canonical platform identity-role and Core appointment-status models. Clinical practitioner permissions are represented through clinic_staff_profiles; clinical encounter lifecycle remains separate from Core appointment lifecycle; tenant_owner and super_admin receive no implicit clinical-content bypass.

## DECISION-011: LARİ Clinic Dedicated Application Surface & Clinical Authorization Boundary
- **Status**: ACCEPTED
- **Decision**: LARİ Clinic uses a dedicated authenticated application surface separate from the owner Admin and Super Admin routes. tenant_owner and staff may reach the Clinic shell, but clinical-content loading and rendering is authorized by the server-derived clinic_get_my_context contract. super_admin receives no implicit Clinic workspace access. A tenant_owner without an active Clinic staff context is limited to Clinic setup operations and receives no clinical patient content.

## DECISION-012: LARİ Clinic Core Milestone Formal Control-Plane Closure
- **Status**: ACCEPTED
- **Decision**: Milestone LARİ Clinic Core is formally closed as proven (`CLINIC_CORE_MILESTONE = CLOSED_PROVEN`, `CLINIC_BLOCK3_E3 = ACCEPTED_CLOSED_PROVEN`). Product SHA `008ebac4496d592d271d612713c437d316c416f0`, isolated Supabase acceptance project `miuecvkkmyvaciticwtm`, remote migrations 64 (`20260908`). All Clinic Blocks 1, 2, and 3 are closed and proven (`E2_EXECUTABLE_EXACT_SHA_CI` Run `32624729632` and `E3_ISOLATED_RUNTIME_E2E` read-only recapture `7E2954A3...`).

## DECISION-013: Clinic AI Assist Speech-to-Text Carry-Forward & Human-in-the-Loop Architecture
- **Status**: ACCEPTED
- **Decision**: Speech-to-text assistive dictation is deferred (`CLINIC_AI_ASSIST_SPEECH_TO_TEXT = DEFERRED_CARRY_FORWARD`) as a non-blocking extension into the immediate next product slice `CLINIC_AI_ASSIST_V1`. Architecture hard safety rule: AI/transcription must NEVER directly persist a clinical note without explicit clinician approval (`audio -> transcription -> editable draft -> explicit approve/reject -> canonical clinic_save_encounter_note`). Clinician remains final author; no autonomous diagnosis, treatment, prescribing, or hidden clinical narrative in audit logs.

## DECISION-014: Master Delivery Train Advancement to LARİ Health Tourism
- **Status**: ACCEPTED
- **Decision**: Main product delivery train advances to `LARİ Health Tourism` (`HEALTH_TOURISM_FOUNDATION`). Scope includes multilingual public/intake experience, source/agency attribution, Web AI Lead Agent, lead capture & scoring, conversation summary, coordinator workflow, and Clinic integration. AI remains assistive (not a doctor). No autonomous medical diagnosis, e-prescriptions, DICOM/PACS, or split payments unless separately authorized.

## DECISION-015: LARİ Clinic AI Assist V1 Formal Control-Plane Closure
- **Status**: ACCEPTED
- **Decision**: Milestone LARİ Clinic AI Assist V1 is formally closed as proven (`CLOSED_PROVEN` at level `E3_ISOLATED_RUNTIME_E2E`). Product SHA `451081f2619f0342df2a8c64ae401dffb7697363`, evidence branch `ci/clinic-ai-assist-v1-groq-exact-sha-r2-20260825` at SHA `332c276b69f5d46524d57302a0ee62336380d8e8`, GitHub Actions Run `32840780417`, isolated Supabase acceptance project `miuecvkkmyvaciticwtm`, remote migrations 65 (`20260909_clinic_ai_assist_commercial_authority.sql`). Real Groq transcription (`whisper-large-v3-turbo`) and SOAP draft (`openai/gpt-oss-120b`) proven under practitioner authority (`can_write_clinical_notes`) with atomic commercial quota metering (+1 STT, +1 SOAP draft, total +2 delta verified), zero raw audio DB persistence, strict human approval boundary, and zero autonomous clinical completions.

## DECISION-016: Health Tourism Corrected 37-Row Historical Scope Reconciliation Matrix Submission
- **Status**: CANDIDATE_SUBMITTED_FOR_REVIEW
- **Decision**: Corrected 37-row historical scope reconciliation matrix for LARİ Health Tourism is formally established, canonically persisted in [HEALTH_TOURISM_SCOPE_MATRIX.md](file:///C:/Users/mozcelikbas/Desktop/Randapp/Randapp-control/docs/project-control/HEALTH_TOURISM_SCOPE_MATRIX.md), and submitted for controller review. Every historical candidate item (1 through 37) is classified using strictly one of 4 allowed classifications: `COMMITTED` (24 items), `DEFERRED` (3 items), `EXPLICITLY_OUT_OF_SCOPE` (10 items), `SUPERSEDED` (0 items in 37 rows; 2 cross-cutting superseded items). Zero invalid classifications, zero missing item IDs, zero duplicate item IDs (`NUMBERED_MATRIX_ROW_COUNT=37`). Implementation mode and specific HT obligations are explicitly assigned. Implementation remains forbidden until controller authorization (`IMPLEMENTATION_START_ALLOWED=false`).



