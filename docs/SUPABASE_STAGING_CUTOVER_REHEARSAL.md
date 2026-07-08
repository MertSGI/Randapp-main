# LARİ - Supabase Staging Cutover Rehearsal Playbook

This playbook outlines the operational steps and testing sequence to transition LARİ from its local mode (`localStorage`/hybrid mock data architecture) to a live Supabase staging database instance. 

This is a **technical rehearsal script**; no production endpoints or live merchant keys will be activated.

---

## 1. Local Mode vs. Staging Supabase Mode

| Feature / Domain | Local Mode (Default Sandbox) | Staging Supabase Mode |
|---|---|---|
| **Data Storage** | Native `localStorage` partitions by Tenant ID. | Relational Cloud PostgreSQL (Supabase). |
| **Authentication** | Direct localStorage session hooks (`authService`). | Supabase Auth UI / Client Signups (`supabase.auth`). |
| **Multi-Tenancy** | Client-side separation checks. | Database-level row-level filtering via tenant and user IDs. |
| **Failsafe / Fallback** | Runs offline instantly in all frames. | Fallback gracefully to Local if env parameters are null. |

---

## 2. Required Environment Placeholders (`.env.example`)

Before running the cutover, the following environment variables need to be declared in `.env.example`:

```env
# Required for Supabase client connection
VITE_LARI_DATA_SOURCE=local # Switches to 'supabase' during staging cutover
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

*Note: Frontend clients are strictly restricted from holding Service Role keys. Any server/edge code utilizing elevated access must acquire them on the server side.*

---

## 3. Database Schema Migration Sequence

Before activating the backend tables, they must be created in the target staging environment in this precise sequence to guarantee foreign-key integrity:

1.  `tenants` (Core billing, subscription status, and brand metadata)
2.  `users_profile` (User entity matching Supabase auth.users UID to tenant ID)
3.  `business_profiles` (Web public page details, opening/closing hours)
4.  `business_branches` (Operational locations mapped to a tenant)
5.  `services` (Treatment names, prices, and default durations)
6.  `staff` (Practitioner names, roles, and shift bounds)
7.  `staff_services` (Junction matching staff members with services they perform)
8.  `availability_rules` (Dynamic recurring calendar exception boundaries)
9.  `customers` (Client list record containing name, CRM metrics, and email)
10. `customer_memory` (Private notes and consent confirmations)
11. `appointments` (Transaction logs binding customer, staff, and service)
12. `subscriptions` (Plan parameters, invoice dates, anniversary logs)
13. `payment_events` & `payments` (Iyzico transaction payloads and invoice tracking)
14. `notification_templates` & `notification_logs` (Outbox routing schemas)
15. `platform_referral_programs` & `platform_referrals` (B2B/B2C campaign trackers)

---

## 4. RLS Enablement Sequence

To prevent unauthenticated data leaks or unauthorized cross-tenant operations, activate RLS policies on the following groups:

1.  **Isolation Activation**: Run `ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY;` on all tables immediately after creation.
2.  **Public Policies**: Permit read access (`SELECT`) to `business_profiles`, `services`, `staff`, and `availability_rules` where the business profile belongs to an public active tenant.
3.  **Owner/Admin Policies**: Match `auth.uid()` against `users_profile` to isolate access to `appointments`, `customers`, `customer_memory`, `staff_services`, `subscriptions`, and `notification_logs`. Only the assigned Tenant ID may run insert, update, or select queries.
4.  **Ingestion/Booking Exception**: Allow anonymous users (`INSERT`) or restricted Edge Functions to add records to `appointments` and `customers` during self-service public bookings without granting `SELECT` rights to other sessions.

---

## 5. Seed / Demo Data Handling

To prevent staging databases from containing low-quality or mixed data, adhere to:
*   Use standard, structured mock data generators for clean previews.
*   Isolate test entries with a clear tag label: `[TEST_STAGING_REHEARSAL]`.
*   During initial database migration, execute a clean SQL purge or restore path rather than keeping dirty tables across trial runs.

---

## 6. End-to-End Flow Transitions

### A. Tenant Creation & Manual Provisioning Flow
1.  **Local State**: Super Admin registers owner manually in local memory.
2.  **Supabase State**: Super Admin inserts record to `tenants` and uses Supabase admin API to create an authenticated credentials account, adding the metadata mapping UUID straight to `users_profile`.

### B. Customer Booking Flow
1.  **Local State**: Frontend writes directly to the client's localized appointments schema.
2.  **Supabase State**: Public reservation page inquiries the read-enabled profiles and inserts an isolated appointment row tagged with the correct `tenant_id`.

### C. Admin & Dashboard Flow
1.  **Local State**: Read/write commands query current storage keys by tenant ID.
2.  **Supabase State**: The app Queries endpoints, relying on Supabase client and Postgres schema RLS to enforce security based on the current user JWT.

### D. Super Admin Control Flow
1.  **Local State**: Overrides any local key by resetting or writing values.
2.  **Supabase State**: Must use standard REST controls bounded strictly by a `role = 'super_admin'` designation in `users_profile` OR runs backend edge operations containing `service_role` checks to bypass the user-bound RLS rules.

### E. Subscription & Outbox Log Flow
1.  **Local State**: Logs communication objects directly in localized arrays.
2.  **Supabase State**: Rows are appended to the `notification_logs` or `payments` table. Backend agents or triggers read from the outbox queue periodically.

---

## 7. Export / Import Data Transition Path

For existing local trials running on legacy caches, the migration flow uses `migrationDryRunService`:
1.  **Export**: Export local memory database into a signed `lari_backup_[tenantId]_[timestamp].json` container.
2.  **Validate**: Run static dry-run checks via `migrationDryRunService.validateSnapshotForMigration` to verify fields.
3.  **Upload & Parse**: The validation service checks dependencies, handles foreign-key mappings, strip password credentials/personal sessions, and inserts records into Supabase staging sequentially.

---

## 8. Staging Rollback Strategy

If a staging trial gets stuck, encounters relational errors, or misses target transactions, execute this fast rollback choreography to preserve business continuity:
1.  **Switch Data Mode**: Revert `VITE_LARI_DATA_SOURCE` back to `local` in environment settings or runtime states.
2.  **Preserve Offline Access**: Ensure the local cache fallback logic processes active read/writes without triggering crash screens.
3.  **Flush Dirty Rows**: Run standard setup SQL commands to clear transaction history associated with the tested tenant ID on the staging database.

---

## 9. Storage & Bucket Provisioning Rehearsal

To validate full media and asset handling readiness before moving to a production environment:
1.  **Bucket Creation**: Inside the Supabase Console, provision two buckets:
    -   `lari-public-media` (Set public access to `true`).
    -   `lari-private-secure` (Set public access to `false`).
2.  **Storage RLS Setup**: Configure RLS rules on `storage.objects` to restrict `INSERT`, `UPDATE`, and `DELETE` queries. Ensure tenant users can only affect objects under `tenants/${auth.jwt() -> 'tenant_id'}/` folders.
3.  **Cross-Origin Policy (CORS)**: Set CORS on both buckets to allow requests from verified Turkey domains (`*.randevulari.com`) and local development URLs, allowing `GET`, `POST`, and `DELETE` operations.
4.  **Dry Run Media Check**: Run the `qa:media-storage` script to verify that assets validate correctly, size bounds are respected, and no dangerous script extensions bypass filters.

