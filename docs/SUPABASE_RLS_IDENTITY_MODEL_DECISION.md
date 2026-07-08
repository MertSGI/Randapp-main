# LARİ - Supabase RLS Identity Model Decision

This document details the formal architectural decision regarding Row Level Security (RLS) identity resolution, multi-tenant isolation, and tenant-boundary enforcement within the LARİ platform.

---

## 1. Decision Summary

We formally decide to adopt **users_profile lookup based on `auth.uid()`** as the canonical identity model for both **staging** and **production** environments.

We **reject** relying on `auth.jwt() ->> 'tenant_id'` custom JWT claims for standard database RLS policies.

---

## 2. Technical Evaluation

| Criteria | Model A: JWT Custom Claims (`auth.jwt() ->> 'tenant_id'`) | Model B: Database Lookup (`users_profile` via `auth.uid()`) |
| :--- | :--- | :--- |
| **Complexity** | **High**: Requires custom auth hooks, triggers on `auth.users`, or external services to inject metadata into tokens during signups. | **Low**: Pure SQL query against the existing `users_profile` table. Completely self-contained within Postgres. |
| **Stability** | **Medium**: JWT claims can be desynchronized if a user's tenant or role is updated in the database but the user does not refresh their token. | **High**: Real-time evaluation of the user's role and tenant_id directly from the database table on every query. |
| **CLI / Local Testing** | **Medium**: Local SQL smoke tests must mock JWT parameters via `SET LOCAL request.jwt.claim.sub` AND `SET LOCAL request.jwt.claim.tenant_id`. | **High**: Requires only standard mocking of user UUID via `SET LOCAL request.jwt.claim.sub` (`auth.uid()`). |
| **Staging/Prod Alignment** | **Medium**: Requires synchronization of auth metadata hooks across different environments. | **High**: Identical code path across local, staging, and live production databases. |

---

## 3. Canonical Architecture Mapping

### 3.1 Primary Lookup Pattern (SQL)
To find a user's tenant context and ensure multi-tenant boundary compliance, we execute a fast indexed subquery:
```sql
SELECT tenant_id FROM public.users_profile WHERE id = auth.uid();
```

To enforce this inside RLS policy rules, the canonical syntax is:
```sql
USING (tenant_id::uuid IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid()));
```

### 3.2 Table and Operation Matrix

| Table Name | Super Admin | Tenant Owner / Admin | Public Anonymous (Read) | Public Anonymous (Write) | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `tenants` | Full Access | Select & Update own | Only if `status = 'active'` and `public_site_status = 'published'` | None | Read needed for slug routing. |
| `users_profile` | Full Access | View tenant list | None | None | Used for operational lookup. |
| `tenant_business_profiles` | Full Access | Manage own | Only if `is_public_profile_enabled = true` | None | Web landing profile data. |
| `services` | Full Access | Manage own | Only if `active = true` | None | Public service selection. |
| `staff` | Full Access | Manage own | Only if `active = true` | None | Practitioner lists. |
| `appointments` | Full Access | Manage own | None | Insert (Checkout only) | No public reads allowed to prevent leaks. |
| `customers` | Full Access | Manage own | None | Insert (Checkout only) | No public reads allowed to prevent leaks. |
| `customer_memory` | Full Access | Manage own | None | None | Strict deny-all for public / customers. |
| `subscriptions` | Full Access | View own limit (Read-Only) | None | None | Writes reserved for service role. |
| `payments` | Full Access | View own invoices (Read-Only) | None | None | Writes reserved for service role. |
| `communication_outbox` | Full Access | View own logs (Read-Only) | None | None | Locked to protect OTP tokens. |
| `audit_events` | Full Access | View own logs (Read-Only) | None | None | Tenant-scoped logging trail. |
| `support_tickets` | Full Access | Manage own | None | None | Operational feedback line. |

### 3.3 Canonical Identity Model and Role Hierarchy

The `public.users_profile` table stores the 1:1 mapping between `auth.users.id` and the LARİ application role:

```
users_profile.id = auth.uid()   (1:1 link to auth.users)
```

| Role | `tenant_id` Value | Scope | Description |
| :--- | :--- | :--- | :--- |
| `super_admin` | `NULL` | Platform-wide | Platform operator; not scoped to any tenant. Bypasses all RLS via `is_super_admin(auth.uid())`. |
| `tenant_owner` | Valid tenant UUID | Tenant-scoped | Salon owner; full CRUD within their tenant boundary. |
| `staff` | Valid tenant UUID | Tenant-scoped | Salon employee; limited access within their tenant. |

> **Critical Rule**: `super_admin` must always have `tenant_id = NULL`. Assigning a fake or placeholder tenant UUID to a super_admin breaks the canonical identity model and may cause incorrect RLS behavior.

---

## 4. Policy Alignment Resolution

The newly introduced core tables in migration `20260620_paymentless_production_core_tables.sql` originally drafted policies based on `auth.jwt() ->> 'tenant_id'`.

To resolve this structural mismatch and enforce a unified identity pattern, we have applied migration **`20260622_paymentless_production_rls_identity_alignment.sql`**. This migration:
1. Safely drops all JWT-dependent policies on `appointment_access_tokens`, `appointment_change_requests`, `communication_outbox`, `audit_events`, `support_tickets`, `policy_acceptances`, `consent_ledger`, and `data_rights_requests`.
2. Re-implements those policies using the canonical **`users_profile` lookup pattern**, coupled with strict **Super Admin bypasses** (`is_super_admin(auth.uid())`).
3. Standardizes security checks across the entire database schema, making it robust and prepared for the real staging smoke tests.
