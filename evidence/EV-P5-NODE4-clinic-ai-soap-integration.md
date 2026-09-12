# EV-P5-NODE4 Evidence Register: Clinic Encounter AI Dictation & SOAP Draft Integration

- **Authority Directives**:
  - Standing Autonomy: `DECISION-020`
  - Program ID: `LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01`
  - Canonical Product Base: `09bb1f8d8ce070c33d09099a6d0ae20c93787d11`
  - Upstream Base (Node 2 R1): `0e6d4a2597517ec81e63e63312e21a7318e21318`
- **Production Status**: `NO_GO`

---

## 1. Candidate Specification

- **Candidate Branch**: `aos/phase5-clinic-ai-soap-integration`
- **Candidate Commit SHA**: `4130ef3220aadd07fb47594589303f65241cc0e8`
- **Parent / Base**: `0e6d4a2597517ec81e63e63312e21a7318e21318` (Node 2 R1)
- **Remote Push**: `origin/aos/phase5-clinic-ai-soap-integration` verified.
- **Contract Test Suite**: `scripts/test-phase5-node4-clinic-ai-contracts.mjs` (8/8 contracts PASS).
- **Behavioral Suite**: `scripts/test-clinic-ai-assist-behavioral.mjs` (25/25 checks PASS).
- **TypeScript Verification**: `tsc --noEmit` clean (0 errors).

---

## 2. Integrity & Security Invariants Verified

1. **Provider Neutrality & Resilience**:
   - Primary Groq provider with metered OpenAI fallback configured via `resolveTranscriptionCandidates` and `resolveSoapDraftCandidates`.
   - Reverse resolution fallback models properly defaulted (`whisper-large-v3-turbo` and `openai/gpt-oss-120b`).
2. **Zero Live LLM / Provider Credentials**:
   - Zero frontend provider API keys (`OPENAI_API_KEY`, `GROQ_API_KEY`) exposed in client bundles or components.
3. **Zero Audio Persistence & Minimal Data Retention**:
   - Audio payload held strictly in volatile client memory (`MediaRecorder` buffer).
   - Zero database tables, zero bucket storage, and zero transcript logging in edge functions.
4. **Server-Authoritative Quota Consumption**:
   - Consumes `ai_allowance` feature entitlement via zero-argument RPC `clinic_check_and_consume_ai_allowance()`.
   - Concurrency protected under transactional advisory lock `pg_advisory_xact_lock`.
5. **Vertical SKU Commercial Feature Mapping**:
   - Features `clinic_ai_transcribe` and `clinic_ai_soap_draft` bound to vertical plans (`clinic_starter`, `clinic_pro`) via Migration `20260927_phase5_vertical_skus_commercial_packaging.sql`.
6. **Strict Practitioner Authorization**:
   - Requires `can_write_clinical_notes = true` derived server-side via `clinic_get_my_context`.
   - Frontend policy `canUseClinicAiAssist` strictly checks active context and encounter status (`open`).
7. **Authoritative Human-in-the-Loop Approval**:
   - AI draft generation strictly populates the volatile SOAP form editor via `onUseDraft` callback.
   - Zero autonomous note saving or encounter completions. Human clinician review and explicit `Save Note` click required.
8. **RPC Execution Privileges**:
   - Execution strictly revoked from `PUBLIC` and `anon`; granted exclusively to `authenticated` and `service_role`.

---

## 3. Node 4 Gate Ruling

- **Node 4 Gate Status**: `AOS_STANDING_AUTHORITY_ACCEPTED` (Routine technical gate closed autonomously under `DECISION-020`).
