# LARI — Consent & Policy Trusted Server Write Contract

**Document Status:** `SOURCE_PROPOSED_ONLY / ARCHITECTURE_CONTRACT`  
**Batch Authority:** `LARI-AG-BATCH-20261021-03` (WP-K)  
**Security Classification:** Level 3 — Legal Evidence Integrity  
**Target Environment:** Gated Future Staging / Production Implementation  

---

## 1. Executive Summary & Problem Definition

The controller metadata audit identified that the existing Supabase staging schema exposed direct write policies on `public.consent_ledger` (`Allow public insertion during checkout`) and `public.policy_acceptances` (`Allow public insert acceptances`), with `anon` granted direct `INSERT` permissions.

This structure introduces severe legal evidentiary risk:
1. Untrusted browser clients can spoof `actorId`, `tenantId`, `ip_address`, `digital_signature`, and `accepted_at`.
2. Compromised or malicious clients can forge consent records for non-existent users or alternate tenants.
3. Client-side mutations (`UPDATE`/`PATCH`) on `consent_ledger` violate immutable audit trail principles under KVKK / GDPR regulations.

This contract defines the strict server-authoritative boundary required before any live SQL or server function is deployed. **No live server implementation is created or deployed in Batch 03; this document establishes the binding architectural contract.**

---

## 2. Core Security & Architectural Principles

### 2.1 Zero Client Service-Role Exposure
- The Supabase `service_role` key (and `SUPABASE_SERVICE_ROLE_KEY`) must **never** be included in client bundles, Vite environment variables (`VITE_*`), or accessible via frontend JavaScript. The browser runtime has zero access to the `service_role` credential.
- Direct table `INSERT`, `UPDATE`, and `DELETE` privileges for `public`, `anon`, and `authenticated` roles are revoked in the companion proposal `PUBLIC_CONSENT_RLS_FORWARD_PROPOSAL.sql`.

### 2.2 Authoritative Identity Extraction
All legal records must bind identity exclusively on the server side:
1. **Authenticated Users (Staff / Logged-in Customers):**
   - `tenant_id` and `actor_id` (`sub`) are extracted authoritatively from the cryptographically verified Supabase Auth JWT (`auth.jwt()`).
   - Any client-supplied tenant or actor identifier in request payloads is ignored or rejected upon mismatch.
2. **Anonymous / Public Booking Checkout:**
   - Public users completing appointment bookings cannot write arbitrary tenant or customer IDs.
   - The server write must require a cryptographically signed one-time booking capability token (HMAC-SHA256 or ephemeral JWT) containing `booking_id`, `tenant_id`, and `expires_at`.
   - The token is verified server-side against an active pending booking before any consent row is generated.

### 2.3 Nonce & Replay Prevention
- Each write request must include a single-use idempotency nonce (`nonce_id`).
- The server validates that the nonce has not been previously consumed within a 15-minute sliding window, preventing replay and automated flooding attacks.

### 2.4 Server-Authoritative Document Versioning
- Clients specify the document key (e.g. `'terms_of_service'`, `'privacy_policy'`).
- The trusted server queries `public.legal_documents` to resolve the current active, published version ID and document hash.
- Browser clients are strictly prohibited from declaring arbitrary version numbers, effective dates, or custom terms texts.

### 2.5 Server Timestamp and Network Provenance
- `accepted_at` and `recorded_at` timestamps are generated using PostgreSQL `clock_timestamp()` on the server. Client timestamps are discarded.
- Client IP addresses are resolved from trusted reverse proxy headers (e.g., Cloudflare `CF-Connecting-IP`, `X-Real-IP`, or validated `X-Forwarded-For`).
- **IP De-Identification / Redaction:**
  - IPv4: The final octet is masked (e.g., `198.51.100.0/24`).
  - IPv6: The final 80 bits are masked.
  - This satisfies both regulatory auditability (demonstrating reasonable geographic/network proof of origin) and privacy minimization standards under KVKK Article 4.

### 2.6 Immutable Append-Only Ledger for Consent & Revocation
- Consent status is modeled as an immutable event stream.
- When a user grants consent, a row is inserted with `is_granted = true`.
- When a user revokes or withdraws consent, an `UPDATE` or `PATCH` on the existing row is **strictly prohibited**.
- Revocation is recorded by appending a **new** event row with:
  - `is_granted = false`
  - `revoked_at = clock_timestamp()`
  - `revocation_reason = <sanitized_reason>`
  - `supersedes_record_id = <original_record_id>`
- The latest active state is resolved via view or indexed window query (`SELECT ... ORDER BY recorded_at DESC LIMIT 1`).

### 2.7 Tenant-Scoped Read Access
- Frontend reads (`listAcceptances`, `listConsentRecords`) remain accessible to authenticated users strictly scoped to their verified `tenant_id` via Postgres Row Level Security (RLS).
- Read failures must return typed machine-readable errors (`LEGAL_READ_FAILED`) rather than collapsing to empty arrays (`[]`), ensuring auditing failures are not masked.

---

## 3. Trusted Server Interface Specification (Future RPC / Edge Endpoint)

```typescript
/**
 * Proposed interface for future Edge Function or Postgres SECURITY DEFINER RPC.
 * Executed solely in trusted server runtime with service_role permissions.
 */
interface RecordPolicyAcceptanceServerPayload {
  // Provided by client:
  documentType: LegalDocumentType;
  bookingCapabilityToken?: string; // Required for unauthenticated checkout
  nonce: string;

  // Resolved strictly server-side:
  // tenantId: extracted from auth.jwt() OR verified bookingCapabilityToken
  // actorId: extracted from auth.jwt() OR verified customer identity
  // documentVersion: resolved from public.legal_documents
  // recordedAt: clock_timestamp()
  // clientIpMasked: anonymized proxy header
}

interface RecordConsentServerPayload {
  consentType: string;
  isGranted: boolean;
  bookingCapabilityToken?: string;
  nonce: string;
  revocationReason?: string;
  supersedesRecordId?: string;
}
```

---

## 4. Release & Deployment Gate Checklist

Before this trusted write architecture can be applied to staging or production:
- [ ] Staging database verified offline backup completed and checksum validated.
- [ ] Disposable PostgreSQL 17 clone verification passed.
- [ ] P0 `appointment_access_tokens` security cutover deployed and verified.
- [ ] Trusted Edge Function / RPC deployed and end-to-end integration tested.
- [ ] `PUBLIC_CONSENT_RLS_FORWARD_PROPOSAL.sql` executed with zero regression on booking flow.
