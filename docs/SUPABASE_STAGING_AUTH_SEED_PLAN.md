# LARİ - Supabase Staging Auth Seed Plan

This plan documents the strategy, schema requirements, and safety compliance rules for seeding mock/fictional staging data onto active staging databases under the **paymentless_limited_production** mode.

---

## 1. Compliance & Security Rules (KVKK / GDPR)

1. **Strictly Fictional Data**: Under no circumstances should real personal data (emails, real names, phone numbers) exist in the seed files. All emails must use test domains like `@example.com` or `@randevulari.com`.
2. **Deterministic IDs**: Standard UUIDs are used for tenants, services, staff, and appointments to prevent duplicates on multiple runs and ensure stable query assertions.
3. **Frontend Service Role Shield**: Seed scripts must only be run through standard DB migrations, SQL editors, or CLI seeding tools. The frontend bundle **MUST NOT** load or use the `service_role` bypass key to create these fixtures.

---

## 2. Seed Identity Mappings

The staging environment seeds two distinct authentication contexts:

### 2.1 Super Admin Context
- **Fictional Email**: `super-admin-staging@randevulari.com`
- **Assigned Role**: `super_admin`
- **Tenant Scope**: `NULL`

### 2.2 Active Pilot Tenant: Melis Güzellik & Nail Art
- **Fictional Tenant Owner Email**: `melis-owner-staging@example.com`
- **Tenant Slug**: `melis-guzellik`
- **Tenant UUID**: `aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa`
- **Assigned Role**: `tenant_owner`

---

## 3. Seeding Sequence & Dependencies

Seeding must occur in the exact sequential order below to avoid foreign key violations:

```
+--------------------+
|  1. Seed Tenant    | (Melis Güzellik)
+---------+----------+
          |
          v
+--------------------+
|  2. Seed Profiles  | (users_profile mapping - pending Auth User creation)
+---------+----------+
          |
          v
+--------------------+
| 3. Seed Services   | (Pedicure, Manicure, Nail Art)
+---------+----------+
          |
          v
+--------------------+
|  4. Seed Staff     | (Melis A, Buse B)
+---------+----------+
          |
          v
+--------------------+
|5. Seed Availability| (Working hours, off-days)
+---------+----------+
          |
          v
+--------------------+
|  6. Seed Billing   | (Manual/Offline Active Subscription)
+--------------------+
```

---

## 4. Seeding SQL Script

A safe, transactional seeding script is provided at `supabase/seed/paymentless_staging_seed.sql`.

### Manual Coordination Step:
Because Supabase Auth manages users inside the `auth.users` schema (which is completely isolated and cannot be pre-seeded via simple INSERT statements without password-hashing integration), the staging administrator must:
1. Create the Auth users manually via the **Supabase Console > Authentication**.
2. Copy the resulting **User UUIDs**.
3. Replace the placeholder UUIDs in the database `users_profile` table using the queries provided in the runbook.

---

## 5. Clean-up & Reset Procedure

To remove the seeded staging assets and restore the environment:
```sql
BEGIN;
DELETE FROM public.appointments WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
DELETE FROM public.availability_rules WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
DELETE FROM public.staff WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
DELETE FROM public.services WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
DELETE FROM public.users_profile WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
DELETE FROM public.subscriptions WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
DELETE FROM public.tenants WHERE id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
COMMIT;
```
