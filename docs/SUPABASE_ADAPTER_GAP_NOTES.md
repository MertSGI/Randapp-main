# LARİ - Supabase Backend Adapter Gap Analysis

This analysis maps our existing localized business logic services against their planned or structural Supabase equivalents, establishing a transparent list of gaps before we proceed with live database syncs.

---

## 1. Adapter Status Matrix

| Local Service Module | Supabase Equivalent | Status | Required Table | Required RLS Policy | Affected Flow | Priority |
|---|---|:---:|---|---|---|---|
| **`businessProfileService`** | `SupabaseBusinessProfileRepository` | **Ready** | `business_profiles` | Public-read on active slug; Write is restricted to active tenant user. | Profile configurations, layout rendering. | **P0** |
| **`serviceCatalogService`** | `SupabaseCatalogRepository` | **Ready** | `services`, `staff`, `staff_services` | Public-read enabled; Write restricted to active owner. | Catalog creation, menu displays. | **P0** |
| **`appointmentService`** | `SupabaseBookingRepository` | **Partial** | `appointments`, `customers` | Public insert allowed; Read/write restricted to tenant owner. | Customer reservation flow, admin calendars. | **P0** |
| **`customerService`** | `SupabaseBookingRepository` | **Partial** | `customers`, `customer_memory` | Nonpublic. Read/Write bounded strictly by `tenant_id`. | Customer CRM profiles, history tracking. | **P1** |
| **`subscriptionService`** | Direct edge endpoints | **Missing** | `subscriptions` | Service role only; Read allowed for authenticated tenant owners. | Plan checkouts, upgrade alerts. | **P1** |
| **`communicationEventService`**| Database logs enqueue | **Missing** | `communication_outbox` | Nonpublic. Write restricted to system/tenant owner. | SMS/WhatsApp message validation. | **P2** |
| **`superAdminService`** | Admin actions with service role | **Missing** | Multiple (Bypasses RLS) | Security role checks or strict Super Admin UID policies required. | Manual provisioning, tenant lifecycle overrides. | **P2** |
| **`branchService`** | Multi-branch table mappings | **Missing** | `branches` | Readable by public; Write restricted to tenant owner. | Multi-location switching. | **P3** |

---

## 2. Granular Gap Descriptions & Tasks

### Gap 1 - Customer Memory JSONB Serialization
*   **Affected Flow**: CRM Detail Panel -> Add preferences and record history notes.
*   **Underlying Gap**: In `SupabaseBookingRepository.updateCustomerMemory`, the implementation is currently simplified to a NO-OP.
*   **Action Required**: Replace helper with a Postgres `PATCh` request updating a `customer_memory` JSONB column.

### Gap 2 - Subscription Model Sync
*   **Affected Flow**: Pricing tiers checkout, Trial enforcement.
*   **Underlying Gap**: Admin subscription state matches `planService` using `localStorage` flags. Supabase subscriptions require real integrations communicating with payment processor metadata.
*   **Action Required**: Implement custom `/rest/v1/subscriptions` endpoints managed with a database service-role token.

### Gap 3 - Communication Outbox Logs
*   **Affected Flow**: Outbox queue audit tracking.
*   **Underlying Gap**: `communicationEventService` runs entirely in client-side arrays (`lari_communication_logs`).
*   **Action Required**: Translate file outputs into database calls logging directly into table `communication_outbox`.

### Gap 4 - Manual Tenant Provisioning
*   **Affected Flow**: Super Admin manually starting pilot establishments.
*   **Underlying Gap**: `manualProvisioningService` saves records using client hooks.
*   **Action Required**: Map manual accounts creation to write records directly to `tenants` and provision users via the Supabase Admin API.
