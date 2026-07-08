# LARİ - Supabase Adapter Parity & Contract Matrix

This matrix evaluates our client-side `localStorage` data layers against their planned or implemented Supabase equivalents, establishing structural rules to enforce multi-tenant separation.

---

## 1. Multi-Tenant Interface Matrix

| Domain | Local Adapter | Supabase Adapter | Contract Status | tenant_id Filter | JSONB Fields | Public Access? | Super Admin Access? | Priority | Notes |
|---|---|---|:---:|:---:|---|:---:|:---:|:---:|---|
| **tenant** | `tenantService` | Included (Client) | **Ready** | Primary Key | `branding` (merged visual colors metadata) | ❌ No | ✅ Yes | **P0** | Resolves dynamic slugs for custom domain entry |
| **tenant registration**| `tenantRegistrationService`| Stubbed | **Ready** | Primary Key | None | ❌ No | ✅ Yes | **P0** | Handles owner creation and initializes default metadata |
| **business profile** | `LocalBusinessProfileRepository`| `SupabaseBusinessProfileRepository`| **Ready** | `tenant_id` | `cover_images`, `gallery_images`, `amenities` | ✅ Yes | ✅ Yes (Full) | **P0** | Enables public layout configurations |
| **services / catalog** | `LocalCatalogRepository` | `SupabaseCatalogRepository` | **Ready** | `tenant_id` | None | ✅ Yes | ✅ Yes (Full) | **P0** | Feeds the active booking page options |
| **staff** | `LocalCatalogRepository` | `SupabaseCatalogRepository` | **Ready** | `tenant_id` | `workingHours` exceptions | ✅ Yes | ✅ Yes (Full) | **P0** | Holds practitioner calendar assignment links |
| **branches** | `branchService` | `SupabaseBranchRepository` | **Partial** | `tenant_id` | `workingHours` details | ✅ Yes | ✅ Yes (Full) | **P1** | Multi-branch logic for Enterprise expansions |
| **appointments** | `LocalBookingRepository` | `SupabaseBookingRepository` | **Ready** | `tenant_id` | None | ✅ Yes (Inserts) | ✅ Yes | **P0** | Appointment registration engine |
| **customers** | `LocalBookingRepository` | `SupabaseBookingRepository` | **Ready** | `tenant_id` | `consentFlags` | ❌ No | ✅ Yes | **P0** | Client directory and CRM logs |
| **customer memory** | `LocalBookingRepository` | `SupabaseBookingRepository` | **Ready** | `tenant_id` | `internalNotes`, `referencePhotos` | ❌ No | ✅ Yes | **P1** | Client notes. Completely isolated |
| **subscriptions** | `subscriptionService` | REST Restored | **Partial** | `tenant_id` | None | ❌ No | ✅ Yes (Full) | **P1** | Plan limits and billing periods |
| **payment events** | `paymentSandboxTestService`| Outbox Stub | **Partial** | `tenant_id` | `rawPayload` | ❌ No | ✅ Yes | **P2** | Webhook verification (Backend only) |
| **site provisioning** | `siteProvisioningService`| Stubbed | **Ready** | `tenant_id` | None | ✅ Yes (Read) | ✅ Yes | **P1** | Tracks subdomain mappings |
| **public links** | `publicLinkService` | Inline Fallback | **Ready** | `tenant_id` | None | ✅ Yes | ❌ No | **P1** | Resolves reservation links |
| **custom domain requests**| `superAdminService` | Stubbed | **Partial** | `tenant_id` | None | ❌ No | ✅ Yes | **P2** | B2B customized salon `.com` redirects |
| **communication outbox**| `communicationEventService`| Stubbed | **Ready** | `tenant_id` | `metadata` | ❌ No | ✅ Yes | **P2** | Outbox logging system |
| **platform referrals** | `referralService` | Stubbed | **Partial** | `referrer_tenant_id`| None | ❌ No | ✅ Yes | **P2** | SaaS B2B referral reward counters |
| **customer campaigns** | `LocalCampaignRepository` | `SupabaseCampaignRepository` | **Ready** | `tenant_id` | None | ✅ Yes | ✅ Yes | **P2** | Friend-to-friend discounts tracker |
| **manual provisioning**| `manualProvisioningService`| Database logs mapping | **Ready** | `tenant_id` | `setupNotes` | ❌ No | ✅ Yes (Full) | **P2** | Backdoor creation for offline pilots |
| **data export** | `dataExportService` | Active | **Ready** | `tenant_id` | All nested elements | ❌ No | ✅ Yes | **P1** | Packs tenant's store into JSON |
| **migration dry-run** | `migrationDryRunService`| Active | **Ready** | `tenant_id` | All validated arrays | ❌ No | ✅ Yes | **P1** | Validates exported payloads before import |

---

## 2. Core Operational Rules & Separation Metrics

1.  **Strict Fallback Mode (`VITE_DATA_MODE`)**:
    If `VITE_DATA_MODE !== "supabase"`, the app operates entirely in offline hybrid mode using client-side caches. Live databases are only touched when explicitly toggled.
2.  **No Frontend Secrets**:
    The system uses the client-facing *Anonymous Key* (`VITE_SUPABASE_ANON_KEY`) in browser frames. Frontend clients are strictly restricted from performing SQL bypasses or loading elevated permissions keys.
3.  **JSONB Helpers**:
    To maximize Postgres flexibility, highly unstructured or nested data elements (such as visual consent histories, practitioner time grids, campaign rules, and Super Admin logs) are stored directly inside JSONB columns. Payloads are serialized using standard sanitizers to prevent injection strings.
4.  **Row Level Security (RLS)**:
    Database RLS limits all table reads and writes to rows where `tenant_id = current_tenant_auth_id`, excluding specific public layout records which are whitelisted by target policies. No direct cross-tenant records can be read, updated, or returned.
