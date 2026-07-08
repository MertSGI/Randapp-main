# LARİ - Supabase Staging Browser Smoke Checklist

This checklist defines the end-to-end user actions that must be manually verified in a browser pointing to a real Supabase Staging project before going live.

---

## 🎯 Purpose

To ensure that the React user interface, routing guards, backend repositories, and security boundaries work seamlessly together on the physical cloud database. 

* **Target Mode**: `paymentless_limited_production` (Ödemesiz Kısıtlı Canlı Üretim)
* **Verify**: Zero online payment dependencies, zero card UI elements, and absolute multi-tenant safety.

---

## 📋 Browser Smoke Checklist

### 🔑 1. Super Admin Portal Verification
- [ ] **A. Login as Super Admin**
  - Navigate to `/login`.
  - Enter credentials for `superadmin@randevulari.com`.
  - Verify redirection to `/super-admin` with zero console errors.
- [ ] **B. Create/Verify Pilot Tenant**
  - Verify that the `melis-guzellik` tenant is visible with an active `manual_active` status.
  - Verify that subscription plans can be modified manually without requiring credit cards.

---

### 💼 2. Tenant Owner Portal Verification
- [ ] **A. Login as Tenant Owner**
  - Navigate to `/login`.
  - Enter credentials for `melis-owner-staging@example.com`.
  - Verify successful authentication and redirection to the `/admin` dashboard.
- [ ] **B. Update Business Profile**
  - Go to Profile Settings.
  - Modify the business name, address, or banner description (e.g., adding "Staging Verified").
  - Click **Save**. Refresh the browser and verify the updates are persistent.
- [ ] **C. Manage Catalog Services**
  - Go to the Services tab.
  - Add a new test service (e.g., "Staging Blowdry", price: `120 TL`, duration: `30 mins`).
  - Verify that the service appears in the listing instantly and is persisted in the database.
- [ ] **D. Manage Staff Members**
  - Go to the Staff tab.
  - Create a new staff member (e.g., "Selin Uzman").
  - Assign working hours and link her to the "Staging Blowdry" service.
  - Verify the entry updates correctly.
- [ ] **E. Validate Billing Tab & Offline Banner**
  - Go to the Billing/Subscription tab.
  - Confirm that the system displays **"Çevrimdışı Ödemeli Sürüm"** or **"Manuel Plan"** with an active license.
  - **CRITICAL**: Verify that **NO credit card entry fields, payment gateway forms, or auto-recurring checkout forms exist**.

---

### 🌐 3. Anonymous Public Customer Booking
- [ ] **A. Open Public Salon Page**
  - Open a clean private browsing window (or log out) and navigate to the public salon link:
    `randevulari.com/booking/melis-guzellik` (or local port equivalent `http://localhost:3000/booking/melis-guzellik`).
  - Verify that the salon branding, active staff list, and published services load with status `200`.
- [ ] **B. Book an Appointment**
  - Select "Staging Blowdry" service.
  - Select "Selin Uzman" as the practitioner.
  - Select an available calendar slot.
  - Fill out the booking form:
    - Name: `Staging Guest Client`
    - Email: `smoke-guest-staging@example.com`
    - Phone: `+905001112233`
  - Accept the KVKK Privacy Agreement checkbox.
  - Click **Rezervasyon Tamamla** (Book Appointment).
  - Verify that the customer is successfully redirected to the appointment success page with a secure URL containing an access token.

---

### 🔄 4. Appointments & Self-Service Token Action
- [ ] **A. Verify Appointment in Admin Panel**
  - Return to the logged-in Tenant Owner browser session.
  - Go to the Appointments tab.
  - Verify that the new booking for `Staging Guest Client` at the selected time displays instantly.
- [ ] **B. Customer Self-Service Reschedule/Cancellation Request**
  - Copy the unique management URL from the public customer checkout success page (e.g., `/appointment/manage?token=xxxx`).
  - Paste it into an anonymous browser window.
  - Verify that only details for this specific booking are rendered, and that other customers' histories are completely isolated.
  - Click **İptal Talebi Oluştur** (Request Cancellation).
  - Fill out the reason: "Staging Test Cancel" and submit.
  - Go back to the Tenant Owner panel, find the appointment, and verify the cancellation request appears as a pending notification or badge.
  - Approve the cancellation.
  - Go back to the customer page, and verify the status is now shown as "Cancelled".

---

### 📊 5. Audit & Outbox Inspections
- [ ] **A. Outbox Delivery Check**
  - Check the simulated communication queue or audit events.
  - Confirm that notification traces were generated in `communication_outbox` for the initial reservation and subsequent cancellation, marked as `local_outbox_only`.
- [ ] **B. Data Export / Snapshot Check**
  - From the Tenant Owner panel, run the manual "Data Export" tool.
  - Download the tenant's snapshot JSON and verify that the exported payload contains correct appointments, staff, and customer entries, confirming CSV/JSON data integrity.

---

## 🏁 Go/No-Go Decision Criteria

If any item below fails, mark the staging run as **FAIL** and resolve before proceeding:
1. **Raw Card Input Fields**: If any credit card input fields are displayed -> **ABORT**.
2. **Empty Booking Catalog**: If services do not appear on the public booking page due to RLS blockages -> **ABORT**.
3. **Cross-Tenant Data Leak**: If logging in as `Owner A` displays *any* appointments or customer names from `Owner B` -> **ABORT**.
4. **localStorage Fallback**: If appointments write to local browser storage instead of the physical Supabase Postgres database -> **ABORT**.
