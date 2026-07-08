# Row Level Security (RLS) Policy Plan & Table Access Control Matrix

To ensure that the LARİ multi-tenant architecture remains secure and leak-proof, Supabase RLS is configured across all tables. This document outlines the granular table-by-table access controls, parameters, and roles.

---

## 1. Access Control Matrix

| Table Name | Public Read | Owner Read/Write | Customer Write | Super Admin | Service Role | tenant_id Required | branch_id Optional | Audit Fields Required |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **tenants** | ❌ No | ✅ Yes (Read/Edit meta) | ❌ No | ✅ Yes (Full) | ✅ Yes | ✅ Yes (primary) | ❌ No | `created_at`, `updated_at` |
| **business_profiles** | ✅ Yes | ✅ Yes (Full) | ❌ No | ✅ Yes (Full) | ✅ Yes | ✅ Yes (primary) | ❌ No | `created_at`, `updated_at` |
| **services** | ✅ Yes | ✅ Yes (Full) | ❌ No | ✅ Yes (Full) | ✅ Yes | ✅ Yes (primary) | ❌ No | `created_at`, `updated_at` |
| **staff** | ✅ Yes | ✅ Yes (Full) | ❌ No | ✅ Yes (Full) | ✅ Yes | ✅ Yes (primary) | ✅ Yes | `created_at`, `updated_at` |
| **branches** | ✅ Yes | ✅ Yes (Full) | ❌ No | ✅ Yes (Full) | ✅ Yes | ✅ Yes (primary) | ❌ No | `created_at`, `updated_at` |
| **appointments** | ❌ No | ✅ Yes (Full) | ✅ Yes (Booking) | ✅ Yes (Full) | ✅ Yes | ✅ Yes (primary) | ✅ Yes | `created_at`, `updated_at`, `updated_by` |
| **customers** | ❌ No | ✅ Yes (Full) | ✅ Yes (Booking) | ✅ Yes (Full) | ✅ Yes | ✅ Yes (primary) | ❌ No | `created_at`, `updated_at` |
| **customer_memory** | ❌ No | ✅ Yes (Full) | ❌ No | ✅ Yes (Full) | ✅ Yes | ✅ Yes (primary) | ❌ No | `created_at`, `updated_at` |
| **subscriptions** | ❌ No | ✅ Yes (Read-Only) | ❌ No | ✅ Yes (Full) | ✅ Yes | ✅ Yes (primary) | ❌ No | `created_at`, `updated_at` |
| **referrals** | ❌ No | ✅ Yes (Read-Only) | ❌ No | ✅ Yes (Full) | ✅ Yes | ✅ Yes (primary) | ❌ No | `created_at`, `updated_at` |
| **customer_campaigns** | ✅ Yes | ✅ Yes (Full) | ❌ No | ✅ Yes (Full) | ✅ Yes | ✅ Yes (primary) | ❌ No | `created_at`, `updated_at` |
| **communication_outbox**| ❌ No | ✅ Yes (Full) | ❌ No | ✅ Yes (Full) | ✅ Yes | ✅ Yes (primary) | ❌ No | `created_at` |
| **custom_domain_requests**| ❌ No | ✅ Yes (Create/Read) | ❌ No | ✅ Yes (Full) | ✅ Yes | ✅ Yes (primary) | ❌ No | `created_at`, `updated_at` |
| **media_records** | ✅ Yes | ✅ Yes (Full) | ❌ No | ✅ Yes (Full) | ✅ Yes | ✅ Yes (primary) | ❌ No | `created_at` |
| **appointment_access_tokens**| ✅ Yes (Token select)| ✅ Yes (Full) | ❌ No | ✅ Yes (Full) | ✅ Yes | ✅ Yes | ❌ No | `created_at` |
| **appointment_change_requests**| ❌ No | ✅ Yes (Full) | ✅ Yes (Propose) | ✅ Yes (Full) | ✅ Yes | ✅ Yes | ❌ No | `created_at` |
| **communication_outbox** | ❌ No | ✅ Yes (Full) | ❌ No | ✅ Yes (Full) | ✅ Yes | ✅ Yes | ❌ No | `created_at`, `updated_at` |
| **audit_events** | ❌ No | ✅ Yes (Read-only) | ❌ No | ✅ Yes (Full) | ✅ Yes | ✅ Yes | ❌ No | `created_at` |
| **support_tickets** | ❌ No | ✅ Yes (Full) | ❌ No | ✅ Yes (Full) | ✅ Yes | ✅ Yes | ❌ No | `created_at`, `updated_at` |
| **policy_acceptances** | ❌ No | ✅ Yes (Reporting)| ✅ Yes (Accept) | ✅ Yes (Full) | ✅ Yes | ✅ Yes | ❌ No | `accepted_at` |
| **consent_ledger** | ❌ No | ✅ Yes (Full) | ✅ Yes (Insertion) | ✅ Yes (Full) | ✅ Yes | ✅ Yes | ❌ No | `created_at` |
| **data_rights_requests** | ❌ No | ✅ Yes (Full) | ❌ No | ✅ Yes (Full) | ✅ Yes | ✅ Yes | ❌ No | `created_at`, `updated_at` |

---

## 2. Granular Security Policies by Table

### Tenants (`tenants`)
*   **Purpose**: Core tenant workspace subscription parameters and identification.
*   **Policies**:
    *   `SELECT / UPDATE`: Only authenticated owners where `auth.uid()` links to the tenant via `users_profile`.
    *   Super Admin has root access to transition plans or verify accounts.
    *   No dynamic public modifications allowed.

### Business Profiles (`business_profiles`)
*   **Purpose**: Public representation, holding custom aesthetic parameters, hours, logos.
*   **Policies**:
    *   `SELECT`: Public access allowed if profile is enabled.
    *   `UPDATE`: Only authenticated tenant owners.

### Services (`services`) & Staff (`staff`)
*   **Purpose**: The operational catalogue used by the booking public layout.
*   **Policies**:
    *   `SELECT`: Universally viewable if associated with an active public-facing profile.
    *   `INSERT / UPDATE / DELETE`: Only authenticated tenant owners.

### Business Branches (`branches`)
*   **Purpose**: Defines operational workspace subdivisions for Enterprise packaging.
*   **Policies**:
    *   `SELECT`: Public-readable for booking choices.
    *   `INSERT / UPDATE / DELETE`: Restricted to the owning tenant session.

### Appointments (`appointments`) & Customers (`customers`)
*   **Purpose**: Dynamic transactions and CRM metrics entries.
*   **Policies**:
    *   `SELECT`: Only authorized tenant accounts. Standard public sessions **cannot** fetch individual/list appointments.
    *   `INSERT`: Allowed anonymously to support customer-facing reservations, with strict validations mapping parameters to the active tenant space.
    *   `UPDATE / DELETE`: Denied to general public. Authorized owners only.

### Customer Memory / Notes (`customer_memory`)
*   **Purpose**: Private notes, preferences, or visual reference records.
*   **Policies**:
    *   **Strict Block**: Public access entirely denied.
    *   `SELECT / INSERT / UPDATE / DELETE`: Bounded solely to the owning tenant ID to keep notes secure.

### Subscriptions (`subscriptions`)
*   **Purpose**: Plans, periods, prices, and renew cycles.
*   **Policies**:
    *   `SELECT`: Tenant owners can view active limits and invoices.
    *   `INSERT / UPDATE / DELETE`: Prohibited for tenant sessions. Managed exclusively via backend jobs or Super Admin tools using the `service_role` credential.

### Communication / Outbox (`communication_outbox`)
*   **Purpose**: Temporary outbox mapping to SMS/WhatsApp template pipelines.
*   **Policies**:
    *   `SELECT / UPDATE`: Authorized tenant owners (to see notifications ready to send or logged).
    *   `INSERT`: System or Edge Functions.

### Custom Domain Requests (`custom_domain_requests`)
*   **Purpose**: Handles requests processing for custom salon `.com` redirects.
*   **Policies**:
    *   `SELECT / INSERT`: Registered owners wishing to apply their own domain.
    *   `UPDATE / DELETE`: Restricted to Super Admin reviewing certificate logs.

### Media Assets (`media_assets`)
*   **Purpose**: Manages public/private visual attachments, branding, and billing files.
*   **Policies**:
    *   `SELECT`: 
        *   Public can read only active public files: `status = 'active' AND visibility = 'public'`.
        *   Authenticated tenant owners can read any files matching their logged `tenant_id`.
    *   `INSERT / UPDATE`: Only authenticated tenant owners can write or modify documents representing their own `tenant_id`.
    *   `DELETE`: Blocked; files are archived via status updates. Only the server `service_role` can run hard deletion cleanups.

### Appointment Access Tokens (`appointment_access_tokens`)
*   **Purpose**: Self-service verification links.
*   **Policies**:
    *   `SELECT`: Public can query by hashed token.
    *   `INSERT / UPDATE / DELETE`: Tenant owners or systems only.

### Appointment Change Requests (`appointment_change_requests`)
*   **Purpose**: Cancellation and rescheduling requests.
*   **Policies**:
    *   `SELECT`: Tenant owners can see all requests for their tenant.
    *   `INSERT`: Allowed for public bookings.
    *   `UPDATE`: Approved or rejected only by tenant owners.

### Audit Events (`audit_events`)
*   **Purpose**: Security event tracking.
*   **Policies**:
    *   `SELECT`: Read-only for authenticated tenant owners.
    *   `INSERT`: Read-only/write allowed from system actions. No direct public manipulation.

### Support Tickets (`support_tickets`)
*   **Purpose**: Technical assistance logs.
*   **Policies**:
    *   `SELECT / INSERT / UPDATE`: Bound to owning tenant's session.

### Policy Acceptances (`policy_acceptances`) & Consent Ledger (`consent_ledger`)
*   **Purpose**: Digital signatures and legal consent compliance logs.
*   **Policies**:
    *   `SELECT`: Tenant owners can fetch consent summaries.
    *   `INSERT`: Allowed publicly on sign-off/registration events.

### Data Rights Requests (`data_rights_requests`)
*   **Purpose**: KVKK personal data request tracking.
*   **Policies**:
    *   `SELECT / INSERT / UPDATE`: Owner-restricted. No public leaks.

### Supabase Storage Bucket Policies
To enforce folder-level access restrictions directly inside our bucket objects:

#### 1. Public Bucket (`lari-public-media`)
*   **SELECT**: `true` (universal reading access on Edge CDNs for mock/published merchant reservation layout).
*   **INSERT / UPDATE / DELETE**: Allowed for authenticated users only if the object key begins with `tenants/${auth.jwt() -> 'tenant_id'}/`. This ensures tenants cannot overwrite each other's visual assets.

#### 2. Private Bucket (`lari-private-secure`)
*   **SELECT**: Denied universally, except through secure signed URLs: `has_valid_signature()`. Authenticated owners with matching `tenant_id` claims can generate short-lived views.
*   **INSERT / UPDATE**: Restricted strictly to authorized merchant owners saving compliance documents: path prefix must match `tenants/private/${auth.jwt() -> 'tenant_id'}/`.
*   **DELETE**: Only system administrative processes (`service_role` token) can purge records.

---

## 3. Super Admin & Service Role Privileges

*   **Super Admin Override**: Super Admins override isolation filters. A custom database security rule or user attribute flag (`role = 'super_admin'`) bypasses basic `tenant_id` scopes to support customer diagnostics and configuration fixes.
*   **Service Role Safeguards**: The database `service_role` key passes all RLS barriers. It is strictly secluded inside secure cloud runtime contexts (Edge, Express services) and must never be exposed or referenced in client-facing frontend files. All user audit entries must record `updated_by` context to guarantee traceability.

---

## 4. Derived Security Artifacts & Resources
*   **[Göç Taslağı - RLS SQL Migration Draft](../supabase/migrations/20260619_lari_rls_policy_draft.sql):** SQL-ready idempotent RLS policy draft covering core multi-tenant tables.
*   **[İzolasyon Test Senaryoları - RLS Tenant Isolation Scenarios](../supabase/tests/rls_tenant_isolation_scenarios.sql):** Transaksiyonel test gövdesi ve simüle edilmiş rol sorgulamaları.
*   **[Uygulama Kontrol Listesi - Supabase RLS Execution Checklist](./SUPABASE_RLS_EXECUTION_CHECKLIST.md):** Canlı staging aşamasında politikaların uygulanma, test edilme ve acil rollback kılavuzu.
