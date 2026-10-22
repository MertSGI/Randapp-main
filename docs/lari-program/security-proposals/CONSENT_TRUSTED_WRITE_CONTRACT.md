# LARI — Consent & Policy Trusted Server Write Contract

**Document Status:** `SOURCE_PROPOSED_ONLY / RLS_PROPOSAL_NOT_ACCEPTED / ARCHITECTURE_CONTRACT`  
**Batch Authority:** `LARI-B04-CORR-20261022-01` (C03 Remediation of WP-K)  
**Security Classification:** Level 3 — Legal Evidence Integrity  
**Target Environment:** Gated Future Staging / Production Implementation (DO NOT EXECUTE ON LIVE STAGING)  

---

## 1. Executive Summary & Verified Schema Grounding

The Controller metadata audit confirmed that live Supabase staging currently exposes permissive public `INSERT` policies on `public.consent_ledger` (`Allow public insertion during checkout`) and `public.policy_acceptances` (`Allow public insert acceptances`), with `anon` and `authenticated` holding table write privileges.

### 1.1 Verified Real Staging Table Schemas
Per `supabase/migrations/20260620_paymentless_production_core_tables.sql` and read-only live staging column metadata:
- **`public.policy_acceptances`**:
  - Columns: `id` (`uuid`), `tenant_id` (`text`), `user_id` (`text`), `policy_type` (`text`), `version` (`text`), `ip_address` (`text`), `user_agent` (`text`), `accepted_at` (`timestamptz`).
  - Note: Does **not** contain an `actor_id` column; the user identifier column is `policy_acceptances.user_id`.
- **`public.consent_ledger`**:
  - Columns: `id` (`uuid`), `tenant_id` (`text`), `customer_id` (`text`), `consent_type` (`text`), `is_granted` (`boolean`), `ip_address` (`text`), `digital_signature` (`text`), `created_at` (`timestamptz`).
  - Note: Does **not** contain an `actor_id` column; the subject identifier column is `consent_ledger.customer_id` (storing `public.customers.id::text` during booking).
- **Canonical Tenant Identity Model (`20260622_paymentless_production_rls_identity_alignment.sql`)**:
  - Tenant ownership and Super Admin status are resolved authoritatively via `public.users_profile` (`up.id = auth.uid() AND up.active = true AND (up.role = 'super_admin' OR (up.role = 'tenant_owner' AND up.tenant_id::text = tenant_id))`), **not** via unverified `app_metadata.tenant_id` JWT claims.

---

## 2. Core Security & Architectural Principles

### 2.1 Zero Client Service-Role Exposure
- The Supabase `service_role` key (`SUPABASE_SERVICE_ROLE_KEY`) must **never** be included in client bundles, Vite environment variables (`VITE_*`), or accessible via frontend JavaScript.
- Direct table `INSERT`, `UPDATE`, and `DELETE` privileges for `public`, `anon`, and `authenticated` roles on `public.consent_ledger` and `public.policy_acceptances` are revoked in `PUBLIC_CONSENT_RLS_FORWARD_PROPOSAL.sql`.
- Over-broad `FOR ALL` policy `"Owner/Admin manage consent ledger"` is replaced with `FOR SELECT` policy `tenant_scoped_consent_ledger_read` so authenticated tenant owners cannot mutate or delete immutable consent ledger rows from the client.

### 2.2 Protection of Existing `SECURITY DEFINER` Public Booking RPC (`create_public_booking`)
- `public.create_public_booking` is an existing `SECURITY DEFINER` function owned by table owner `postgres` that atomically creates customer records, inserts three consent records into `public.consent_ledger` (`booking_terms`, `marketing`, `reminders`), creates the appointment, and issues a hashed self-service manage token in `public.appointment_access_tokens`.
- During anonymous public booking checkout, `create_public_booking` runs with `auth.uid() IS NULL`.
- Enabling `FORCE ROW LEVEL SECURITY` on `public.consent_ledger` without an owner/definer insert policy causes `create_public_booking` to fail if the function/table owner does not hold `BYPASSRLS`.
- Therefore, `PUBLIC_CONSENT_RLS_FORWARD_PROPOSAL.sql` explicitly sets `ENABLE ROW LEVEL SECURITY` and `NO FORCE ROW LEVEL SECURITY` on `public.consent_ledger` and `public.policy_acceptances`:
  - Untrusted client roles (`anon`, `authenticated`) are non-owners with `NOBYPASSRLS` and have `INSERT, UPDATE, DELETE` revoked, so they cannot forge or mutate rows.
  - The trusted `SECURITY DEFINER` function `public.create_public_booking` continues to insert booking consent rows atomically.

### 2.3 Explicit `UNRESOLVED_IDENTITY_BOUNDARY` & Safe Default Deny
- **Customer-to-Auth Mapping (`consent_ledger.customer_id`)**:
  - In the verified schema, `consent_ledger.customer_id` stores `public.customers.id::text` generated during booking, which has no verified foreign key or 1:1 binding to `auth.uid()::text` (`sub`).
  - Naively comparing `auth.uid()::text = consent_ledger.customer_id` is architecturally invalid and could misbind or fail silently.
  - This boundary is formally marked as **`UNRESOLVED_IDENTITY_BOUNDARY`**. Until a server-verified customer identity or token-scoped read RPC is implemented, direct `SELECT` on `public.consent_ledger` is restricted to verified `tenant_owner` and `super_admin` profiles in `public.users_profile` (safe default deny for direct customer reads).
- **Standalone Policy & Consent Writes Outside Public Booking**:
  - For registration (`RegistrationPage`) and standalone consent withdrawal / KVKK requests (`AppointmentSelfServicePage`), no trusted server write RPC currently exists in live staging.
  - These flows are marked `UNRESOLVED_IDENTITY_BOUNDARY` / `LEGAL_PERSISTENCE_REQUIRED` and fail closed in persistent mode without fabricating client-side legal receipts.

### 2.4 Nonce & Replay Prevention for Future Server Endpoints
- Any future standalone server write endpoint must require a single-use idempotency nonce (`nonce_id`) validated within a bounded window to prevent replay and automated flooding.

### 2.5 Server-Authoritative Document Versioning & Timestamps
- Future server write endpoints must resolve active document versions from `public.legal_documents` on the server and record timestamps via `clock_timestamp()`, never trusting client-supplied version strings or timestamps.
- Client IP provenance must be resolved server-side from trusted proxy headers and de-identified (IPv4 `/24` masking, IPv6 `/48` masking) prior to storage.

### 2.6 Immutable Append-Only Ledger for Consent & Revocation
- Consent state is an append-only event stream (`is_granted = true` / `is_granted = false`); `UPDATE` and `DELETE` on `public.consent_ledger` remain prohibited for all client roles.

---

## 3. Future Trusted Server Interface Specification (Not Yet Deployed)

```typescript
/**
 * Proposed contract for future Postgres SECURITY DEFINER RPC or Edge Function.
 * Status: RLS_PROPOSAL_NOT_ACCEPTED / UNRESOLVED_IDENTITY_BOUNDARY
 */
interface RecordPolicyAcceptanceServerPayload {
  documentType: LegalDocumentType;
  bookingCapabilityToken?: string;
  nonce: string;
  // Server-resolved columns:
  // policy_acceptances.tenant_id: from public.users_profile (via auth.uid())
  // policy_acceptances.user_id: auth.uid()::text
  // policy_acceptances.version: resolved from public.legal_documents
  // policy_acceptances.accepted_at: clock_timestamp()
  // policy_acceptances.ip_address: masked proxy IP
}

interface RecordConsentServerPayload {
  consentType: string;
  isGranted: boolean;
  bookingCapabilityToken?: string;
  nonce: string;
  // Server-resolved columns:
  // consent_ledger.tenant_id: from verified booking / tenant context
  // consent_ledger.customer_id: verified public.customers.id::text
  // consent_ledger.created_at: clock_timestamp()
  // consent_ledger.ip_address: masked proxy IP
}
```

---

## 4. Release & Deployment Gate Checklist

Before `PUBLIC_CONSENT_RLS_FORWARD_PROPOSAL.sql` can transition from `RLS_PROPOSAL_NOT_ACCEPTED` to live staging execution:
- [ ] Staging database verified offline logical backup completed and checksum validated.
- [x] Disposable PostgreSQL 17.6 synthetic schema & `create_public_booking` behavioral qualification implemented in CI.
- [ ] Full live staging clone replay verified against production-equivalent dataset.
- [ ] P0 `appointment_access_tokens` security cutover deployed and verified.
- [ ] Trusted server write RPC / Edge Function for registration policy acceptance and customer KVKK requests deployed to resolve `UNRESOLVED_IDENTITY_BOUNDARY`.
