# LARI - Local to Supabase Paymentless Production Cutover Runbook

This runbook describes the step-by-step process of migrating salon metadata from a local/demo state (`localStorage`) into a persistent Supabase Postgres production database when transitioning to **paymentless_limited_production** mode.

---

## 1. Migration Overview

This migration takes place entirely offline/pre-live before routing active traffic to `randevulari.com`. It ensures that early pilot tenants (such as **Vogue Erkek Kuaförü**) do not lose their catalog, staff list, or booking structures.

```
+-----------------------------------+
|  Local Browser Storage (JSON)     |
+-----------------+-----------------+
                  |
        [dataExportService]
                  |
                  v
+-----------------+-----------------+
|   Validated Transition Payload     |
+-----------------+-----------------+
                  |
         [migrationDryRun]
                  |
                  v
+-----------------+-----------------+
|     Supabase Production DB        |
+-----------------------------------+
```

---

## 2. Step-by-Step Cutover Sequence

### Step 1: Export Local Tenant Data
1. Authenticate to the local demo panel.
2. Navigate to **Super Admin -> Observability -> Data Export**.
3. Generate the export payload for your target tenant ID (e.g., `vogue-erkek-kuaforu`).
4. Download the generated `.json` backup file.

### Step 2: Run Parity Preflight Checks
1. Navigate to **Migration Dry-Run Panel** on the Super Admin Dashboard.
2. Upload the exported `.json` payload.
3. Validate that:
   - All services match catalog categories.
   - All staff records have valid weekly hour intervals.
   - All appointment dates are future-valid.
   - All legal consent entries have explicit version mappings.

### Step 3: Provision Tenant on Supabase Staging/Production
1. Execute the `insert_tenant` operation using the Supabase Dashboard SQL Editor or administrative API:
   ```sql
   INSERT INTO tenants (id, slug, name, status, plan_id)
   VALUES ('vogue-erkek-kuaforu', 'vogue', 'Vogue Erkek Kuaförü', 'active', 'pilot_plan');
   ```
2. Set up the matching subscription manually with a verified paid-through date:
   ```sql
   INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_end)
   VALUES ('vogue-erkek-kuaforu', 'pilot_plan', 'manual_active', '2027-01-01 00:00:00+00');
   ```

### Step 4: Import Tenant Tables
Using the parsed JSON arrays, insert records into their respective production tables (manually or via administrative dry-run importer scripts):
1. **Business Profiles**: Insert profile layout, visual themes, address, and city.
2. **Services & Staff**: Insert services and matching staff definitions.
3. **Availability & Working Hours**: Seed calendar exception tables.
4. **Policy Acceptances & Legal Consent**: Backfill the compliance logs to ensure absolute regulatory safety.

---

## 3. Live Verification & Sanity Checks

Before announcing the transition complete:

1. **Verify Services/Staff/Hours**: 
   - Load `randevulari.com/vogue` in an incognito window.
   - Confirm that all services are priced correctly, personnel are listed, and working hours are active.
2. **Verify Public Booking Route**:
   - Create a test reservation.
   - Verify that the slot write-in records directly to the `appointments` table in Supabase.
3. **Verify Self-Service Token**:
   - Confirm that clicking the cancellation link from the SMS outbox loads the self-service panel.
4. **Verify Manual Subscription State**:
   - Confirm that the salon owner workspace displays `manual_active` status and shows no billing banners.

---

## 4. Rollback Strategy

If a critical failure occurs during import or RLS validation:

1. **Revert Routing**:
   - Point the DNS or custom domain record back to the local demo portal or a graceful maintenance screen.
2. **Purge Partial Records**:
   - If the database was polluted with incomplete imports, run the purge transaction:
     ```sql
     BEGIN;
     DELETE FROM appointment_access_tokens WHERE tenant_id = 'vogue-erkek-kuaforu';
     DELETE FROM appointments WHERE tenant_id = 'vogue-erkek-kuaforu';
     DELETE FROM services WHERE tenant_id = 'vogue-erkek-kuaforu';
     DELETE FROM tenants WHERE id = 'vogue-erkek-kuaforu';
     COMMIT;
     ```
3. **Audit and Redo**:
   - Re-evaluate JSON payload alignments inside `migrationDryRunService` and try again.
