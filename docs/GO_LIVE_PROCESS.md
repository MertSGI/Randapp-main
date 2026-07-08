# Go-Live Process

## Overview

A new salon on the platform must be approved before they can accept live bookings from customers. This ensures data quality and payment readiness before exposure.

## Workflow

1. **Salon Registration & Onboarding**
   - A salon owner registers or is provisioned an account.
   - They complete the Onboarding Wizard (`/admin`).
   - The provisioning status is `setup_in_progress`.

2. **Submission for Review**
   - Once all mandatory steps (Info, Services, Staff) are complete, the owner clicks "Mark as Ready for Review" in Step 7 of the wizard.
   - The tenant status changes to `ready_for_review`.

3. **Super Admin Review**
   - The Super Admin logs in (`/super-admin`).
   - The Dashboard (`/super-admin`) and Onboarding Page (`/super-admin/onboarding`) show a "Ready for Review" section.
   - The Super Admin verifies the salon details.
   - **Actions:**
     - **Approve Go-Live**: Tenant status becomes `live`. The booking page is unlocked.
     - **Send Back**: Tenant status becomes `setup_in_progress` (Go Live status `needs_changes`). The Super Admin can leave an internal note.
     - **Pause Bookings**: If a live salon needs to be halted, the Super Admin can set status to `paused` from the Tenants or Onboarding page.

4. **Booking Gate Enforcement**
   - The `BookingPage` calls `goLiveService.canTenantAcceptBookings(tenant.id)`.
   - If the salon is `setup_in_progress`, `ready_for_review`, or `paused`, the booking page displays a "Service Temporarily Closed" banner and prevents form access.

## Manual Setup Support Process
In cases where customers need configuration assistance (e.g. they paid a Setup Fee), support agents or super-admins can help fill in remaining services, pricing, and settings, acting on their behalf before hitting "Approve Go-Live".

## Production Security Note
The frontend UI enforces go-live mock steps, but **final go-live approval must happen server-side**. In Supabase mode, updating `go_live_status` or accepting DB writes to public endpoints MUST be secured by RLS policies or Edge Functions enforcing these state checks.
