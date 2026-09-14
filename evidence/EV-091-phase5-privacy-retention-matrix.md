# EV-091: Phase 5 Sensitive Data Privacy, Retention & Technical Enforcement Audit

- **Authority Directives**:
  - Controller Authority ID: `LARI-PHASE5-RETENTION-VISUAL-CLOSEOUT-PHASE6-FOUNDATION-20260914-01`
  - Derives From Authority ID: `LARI-P3P4-FINAL-NONPROD-ACCEPTANCE-PHASE5-CLOSEOUT-FORWARD-EXECUTION-20260914-01`
  - Program ID: `LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01`
  - Classification: `AUDIT_MATRIX_AND_RETENTION_ENFORCEMENT_BOUNDARIES`
- **Production Status**: `NO_GO`

---

## 1. Executive Summary

In accordance with Section 3 of `LARI-PHASE5-RETENTION-VISUAL-CLOSEOUT-PHASE6-FOUNDATION-20260914-01`, this document registers the source-truth and runtime-verified privacy and sensitive data retention matrix across all data classes for both **Clinic** and **Health Tourism** verticals.

### Core Privacy Architecture Guarantees
1. **Zero Raw Audio / Speech Retention**:
   - Audio recorded for AI clinical dictation is buffered strictly in volatile client memory (`MediaRecorder` RAM buffer).
   - Zero database tables, zero Supabase storage buckets, and zero edge function log sinks store audio binaries or transcripts.
2. **Strict Append-Only Clinical Encounters**:
   - Encounter notes are strictly append-only and versioned (`uq_clinic_encounter_notes_encounter_version`).
   - Historical versions cannot be mutated or silently overwritten; amendments create a new version referencing `supersedes_note_id`.
3. **Audit Trail PII Sanitization**:
   - High-sensitivity identifiers (passport numbers, full clinical narrative, emergency phone numbers) are stripped before writing to `public.audit_events`.
4. **Ephemeral AI Transcripts with Server-Enforced Cleanup Primitives**:
   - Health Tourism AI conversation messages are bounded with `expires_at = now() + INTERVAL '30 days'`.
   - Technical purge primitive `public.ht_cleanup_expired_ai_data()` removes expired messages and conversations server-side.

---

## 2. Comprehensive Privacy & Retention Technical Matrix

| Data Class | Authoritative Table / Storage Location | Tenant Boundary | Read / Write Authority | Retention Behavior | Deletion / Anonymization Behavior | Auditability | AI / Provider Exposure Boundary | Raw Sensitive-Data Persistence Behavior |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **Clinical Encounters** | `public.clinic_encounters` | `tenant_id UUID NOT NULL REFERENCES public.tenants(id)` | Read: Active staff with `can_view_clinical_records`. Write: Assigned practitioner via `clinic_start_encounter`, `clinic_complete_encounter`. | Retained for lifetime of clinical record. Direct table DML revoked; RLS enforced. | Encounter voiding supported via `status = 'voided'`. Physical deletion cascade only on tenant deletion. Legal medical record retention period: `COMPANY_DEPENDENT_FINALIZATION`. | Emits `clinic_encounter_started`, `clinic_encounter_completed` metadata (no clinical narrative). | Zero provider exposure. | Reason for visit stored in encrypted Postgres volume; no external sync. |
| **Clinical Notes (SOAP)** | `public.clinic_encounter_notes` | `tenant_id UUID NOT NULL REFERENCES public.tenants(id)` | Read: Active staff with `can_view_clinical_records`. Write: Assigned practitioner via `clinic_save_encounter_note` (requires `can_write_clinical_notes`). | Versioned append-only (`version > 0`, `uq_clinic_encounter_notes_encounter_version`). Notes transition `draft` -> `final`. | Immutability enforced: no UPDATE or DELETE permitted. Legal medical retention period: `COMPANY_DEPENDENT_FINALIZATION`. | Emits `clinic_encounter_note_version_created` with version and note_id only. Subjective/Objective/Assessment/Plan stripped from audit log. | Zero provider exposure once saved. | Stored in PostgreSQL with RLS defense-in-depth. Direct table access revoked from PUBLIC/anon. |
| **SOAP Drafts (In-Flight)** | Ephemeral client memory (`useState`) | Client browser session | Authenticated clinician only. | Volatile memory only. Cleared upon modal close or form submit. | Destroyed upon browser tab close, refresh, or submission. | None (volatile). | Sent to Groq/OpenAI as ephemeral prompt context with zero training retention. | Zero persistent storage in database or edge storage. |
| **AI Audio / Speech Recordings** | Client RAM buffer (`MediaRecorder`) | Browser session | Authenticated clinician only. | Exists solely during active dictation. Destroyed immediately after transcription. | Never written to disk or storage bucket. | None (volatile). | Sent to Whisper endpoint via edge function buffer. | Zero persistence. No audio file or streaming chunk is stored. |
| **Clinic Patient Profiles** | `public.clinic_patient_profiles` | `tenant_id UUID NOT NULL REFERENCES public.tenants(id)` | Read: Staff with `can_view_clinical_records` or `can_manage_patient_profiles`. Write: Staff with `can_manage_patient_profiles`. | Retained with customer record. Direct table DML revoked. | Cascade delete on customer/tenant deletion. Emergency contacts updateable. Anonymization on customer deletion. | Emits `clinic_patient_profile_changed` with customer_id and profile_id only. Allergies/conditions stripped. | Zero provider exposure. | Blood type, allergies, chronic conditions stored in DB table with RLS. |
| **Health Tourism Leads** | `public.ht_leads` | `tenant_id UUID NOT NULL REFERENCES public.tenants(id)` | Public write via `ht_create_public_lead`. Read: Staff with `can_view_ht_leads`. Update: Staff with `can_manage_ht_leads`. | Retained through CRM lead lifecycle (`new` -> `converted` / `closed`). | Cascade delete on tenant deletion. Lead records survive AI transcript cleanup. | Emits `ht_lead_created`, `ht_lead_status_changed`. Passport number strictly excluded from audit payload. | Zero provider exposure except when AI chat actively queries lead context. | Passport number, email, phone stored in `ht_leads`. Table access REVOKED from PUBLIC, anon, authenticated; accessible only via SECURITY DEFINER RPCs. |
| **Health Tourism Lead Contact Data** | `public.ht_leads` (`email`, `phone`, `passport_number`) | `tenant_id UUID` | Coordinator staff only. | Retained through lead conversion. | Updateable via coordinator RPCs. | Audit log captures lead_id only. | Zero provider exposure. | Stripped of whitespace, validated with regex before storage. |
| **HT Treatment Journeys** | `public.ht_treatment_journeys` | `tenant_id UUID NOT NULL REFERENCES public.tenants(id)` | Read/Write: Authorized coordinator staff via `ht_create_treatment_journey`. | Retained through journey completion or cancellation. | Status transition to `cancelled`. Cascade delete on tenant deletion. | Audit log tracks journey status changes. | Zero provider exposure. | Medical travel notes stored in DB with row-level security. |
| **HT Journey Quotes** | `public.ht_journey_quotes` | `tenant_id UUID NOT NULL REFERENCES public.tenants(id)` | Read/Write: Authorized coordinator via `ht_create_or_update_journey_quote`. | Versioned monotonically (`uq_ht_journey_quotes_journey_version`). | Status transitions (`draft`, `sent`, `accepted`, `rejected`, `expired`). | Audit log records quote version, amount, currency. | Zero provider exposure. | Structured line items JSONB with strict numeric integrity. |
| **HT Journey Itineraries** | `public.ht_journey_itinerary_events` | `tenant_id UUID NOT NULL REFERENCES public.tenants(id)` | Read/Write: Authorized coordinator via `ht_add_journey_itinerary_event`. | Retained with journey. | Event deletion / update via authorized RPCs. | Audit log records event creation. | Zero provider exposure. | Flight, hotel, and clinical appointment linkages. |
| **HT AI Conversations & Messages** | `public.ht_ai_conversations`, `public.ht_ai_messages` | `tenant_id UUID NOT NULL REFERENCES public.tenants(id)` | Server-authoritative chat RPCs. Read: Authorized coordinator staff. | Bounded TTL: `expires_at = now() + INTERVAL '30 days'`. | Auto-purge via `ht_cleanup_expired_ai_data()`: messages deleted when `expires_at < now()`, conversations deleted when empty. | Audit log tracks conversation creation. | Sent to LLM provider for conversational response generation only. | Stored in PostgreSQL with 30-day expiration timestamps; direct table access revoked. |
| **Communication Records** | `public.communication_outbox` | `tenant_id UUID NOT NULL REFERENCES public.tenants(id)` | Server-authoritative enqueue/lease RPCs. Direct table access revoked. | Enqueued messages transition `queued` -> `processing` -> `delivered` / `failed`. | Delivered/failed records retained for idempotency and delivery proof. | Audit log captures outbox message ID and channel. | Sent to communication adapters (mock in test/sandbox; external provider deferred). | Payload sanitized; no payment card data or clinical SOAP narratives permitted. |
| **System Audit Records** | `public.audit_events` | `tenant_id TEXT` | Append-only via trusted RPCs. Read: Tenant owner / super admin only. | Retained indefinitely for security compliance and incident review. | Immutable append-only. Zero UPDATE or DELETE permitted. | Self-auditing ledger. | Zero provider exposure. | Sensitive fields explicitly stripped prior to insertion across all domains. |

---

## 3. Findings, Gap Analysis & Classification

1. **Audio / Speech Data**:
   - **Classification**: `PROVEN`
   - **Proof**: Ephemeral client RAM buffer only. Zero persistence in any storage medium.
2. **Clinical Encounters & Notes**:
   - **Classification**: `PROVEN`
   - **Proof**: Strict versioning and append-only semantics. Direct table DML revoked. Audit logs sanitized.
3. **AI Chat Conversations & Transcripts**:
   - **Classification**: `PROVEN`
   - **Proof**: Database schema enforces `expires_at` (30-day default). Purge primitive `ht_cleanup_expired_ai_data()` implemented and verified.
4. **Lead PII Sanitization in Audit**:
   - **Classification**: `PROVEN`
   - **Proof**: `ht_create_public_lead` explicitly excludes `passport_number` and sensitive contact info from `audit_events`.
5. **Medical Record Retention Horizon (Legal Minimums)**:
   - **Classification**: `COMPANY_DEPENDENT_FINALIZATION`
   - **Details**: Specific legal retention duration (e.g., Turkish KVKK/Health Ministry 10-20 year medical record retention vs GDPR right-to-erasure) is dependent on legal entity registration and formal compliance policies.
   - **Technical Enforcement**: Primitives for status-based archiving (`status = 'voided'`, `status = 'closed'`) and hard-deletion cascade exist and function as intended.

---

## 4. Exit Matrix Updated Disposition

- **Phase 5 Criterion C (Privacy & Sensitive-Data Retention)**: Advanced from `PARTIALLY_PROVEN_PENDING_VERTICAL_RETENTION_AUDIT` to **`PROVEN_WITH_COMPANY_DEPENDENT_HORIZON_FINALIZATION`**.
- **Phase 5 Criterion G (AOS Vertical Visual Acceptance)**: Retained as **`PARTIALLY_PROVEN_AWAITING_DESIGN_INTELLIGENCE`** (Request `REQ-AOS-DI-V1-1-UIV2-C0B3A95-FINAL-VISUAL-EVIDENCE-20260911-01`).
