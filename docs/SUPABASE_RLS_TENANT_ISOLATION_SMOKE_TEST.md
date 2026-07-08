# LARİ - Supabase RLS Tenant Isolation Smoke Test Plan

This document outlines the test scenarios, queries, and roles required to verify and enforce absolute multi-tenant data isolation and security in LARİ's production environment under the **paymentless_limited_production** mode.

---

## Preflight Verification Checklist & Gates

Row Level Security policies represent our final defense line. However, static policy drafts and checks are not enough. The RLS isolation smoke tests must be executed as part of the following multi-stage verification pipeline:

1. **Conflict-Free Migrations**: Run `npm run qa:supabase-migration-integrity` to ensure active migrations are free from duplicate statements. 
2. **Apply Active Path**: Ensure migrations are fully pushed in the correct chronological order as described in `/supabase/MIGRATION_APPLY_MANIFEST.md` before applying RLS assertions.
3. **Never Skip Migrations**: Never manually bypass or skip database migrations during execution.
4. **Execute RLS Smoke Test**: Execute the SQL assertions documented below immediately after database migrations are completed.
5. **Execute App-Level Smoke Test**: Run `npm run smoke:supabase-paymentless-staging` only after target staging environment variables are successfully filled in `.env`.

---

## 1. Test Architecture Overview

Row Level Security (RLS) is LARİ's primary defense line against cross-tenant leaks. We simulate different user classes using PostgreSQL's session-level configuration variables (`SET LOCAL`) in a transactional sandbox environment.

```
       [Public Guest]             [Owner A]               [Owner B]
             |                       |                       |
       (No Auth JWT)         (JWT: tenant_id=A)      (JWT: tenant_id=B)
             v                       v                       v
     +-------+-----------------------+-----------------------+-------+
     |                                                               |
     |                     Row Level Security (RLS)                  |
     |                                                               |
     +-------+-----------------------+-----------------------+-------+
             |                       |                       |
     [Can read public profiles] [Can READ/WRITE A]     [Can READ/WRITE B]
     [Cannot read appointments] [Cannot read B data]   [Cannot read A data]
```

---

## 2. Granular RLS Scenarios and Expected Results

### Scenario A: Anonymous Public Guest Booking
1. **Action**: Select services, practitioners, and submit a booking form.
2. **Authorized Reads**:
   - `services` (active/published only) -> **Allowed**
   - `staff` (active only) -> **Allowed**
   - `tenant_business_profiles` (public layout parameters) -> **Allowed**
3. **Forbidden Reads**:
   - `appointments` -> **Blocked** (Returns 0 rows)
   - `customers` (CRM directory) -> **Blocked** (Returns 0 rows)
   - `customer_memory` (Notes) -> **Blocked** (Returns 0 rows)
4. **Authorized Writes**:
   - `appointments` (INSERT only for the current tenant space) -> **Allowed**
   - `customers` (INSERT only on checkout) -> **Allowed**

### Scenario B: Owner A Session
1. **JWT Metadata**: `auth.jwt() ->> 'tenant_id' = 'tenant-a-uuid'`
2. **Authorized Actions**:
   - Read/Write any record in `services`, `staff`, `appointments`, and `customers` where `tenant_id = 'tenant-a-uuid'`.
3. **Forbidden Actions**:
   - Select or modify any record where `tenant_id = 'tenant-b-uuid'`. RLS must transparently return 0 rows for reads and throw violations or affect 0 rows for writes.

### Scenario C: Customer Self-Service Token Action
1. **Action**: Customer wants to cancel an appointment without logging in, using a secure hashed token.
2. **RLS Policy**:
   - Access is mapped via the junction table `appointment_access_tokens`.
   - The token lookup must strictly resolve only to the linked `appointment_id`.
3. **Expected Result**:
   - Guest can execute a SELECT/UPDATE on the single appointment matching that token, but is blocked from listing any other appointment.

---

## 3. SQL Smoke-Testing Scripts (Execution Plan)

Run these queries inside the **Supabase SQL Editor** to dry-run policy assertions.

```sql
-- Start safe test sandbox transaction
BEGIN;

-- Establish Mock Tenant A & B
INSERT INTO tenants (id, slug, name, status, public_site_status)
VALUES 
  ('aaaa-aaaa-aaaa-aaaa', 'salon-a', 'Salon A', 'active', 'published'),
  ('bbbb-bbbb-bbbb-bbbb', 'salon-b', 'Salon B', 'active', 'published');

-- Establish Mock User Profile mapping
INSERT INTO users_profile (id, tenant_id, email, role, full_name)
VALUES
  ('1111-1111-1111-1111', 'aaaa-aaaa-aaaa-aaaa', 'owner-a@test.com', 'tenant_owner', 'Owner A'),
  ('2222-2222-2222-2222', 'bbbb-bbbb-bbbb-bbbb', 'owner-b@test.com', 'tenant_owner', 'Owner B');

-- Seed Data (Owner A Services, Owner B Services)
INSERT INTO services (id, tenant_id, name, price, duration, active)
VALUES
  ('s-aaa-1111', 'aaaa-aaaa-aaaa-aaaa', 'Haircut A', 150, 30, true),
  ('s-bbb-2222', 'bbbb-bbbb-bbbb-bbbb', 'Nails B', 200, 45, true);

-- =========================================================================
-- RUN POLICIES VERIFICATION
-- =========================================================================

-- Test 1: Masquerade as Owner A (Simulated authenticated JWT)
SET LOCAL request.jwt.claim.sub = '1111-1111-1111-1111';
SET LOCAL request.jwt.claim.tenant_id = 'aaaa-aaaa-aaaa-aaaa';
SET LOCAL role = 'authenticated';

-- Verify Owner A can read Service A
SELECT name FROM services WHERE id = 's-aaa-1111'; -- EXPECTED: Haircut A

-- Verify Owner A CANNOT read Service B (RLS returns 0 rows)
SELECT name FROM services WHERE id = 's-bbb-2222'; -- EXPECTED: Empty Result

-- Test 2: Masquerade as Public Guest (Anonymous)
RESET request.jwt.claim.sub;
RESET request.jwt.claim.tenant_id;
SET LOCAL role = 'anon';

-- Public can read published services
SELECT name FROM services WHERE active = true; -- EXPECTED: s-aaa-1111 and s-bbb-2222 are returned because they are active

-- Public cannot view CRM customer directories
SELECT * FROM customers; -- EXPECTED: Empty Result

-- Rollback to keep environment pristine
ROLLBACK;
```

---

## 4. Rollback and Cleanup Instructions

1. **Abort Testing on Leaks**: If any query returns cross-tenant data, do not migrate.
2. **Reset Staging DB**:
   Run `supabase db reset` inside the local project folder, or run a database restore from your Supabase backups panel.
