# LARİ Mock Storage Reset Guide & Diagnostics

This guide documents the layout, keys, and manual cleanup steps for Randapp's storage management inside client-side mock modes.

---

## 1. LocalStorage Mock Schema Overview

Randapp uses **LocalStorage** keys to mimic a complete full-stack database during development when `VITE_DATA_MODE === "mock"`. The keys are structured into separate administrative and tenant contexts:

| Module | Storage Key Pattern | Description |
| :--- | :--- | :--- |
| **Appointments** | `randapp:<tenantId>:appointments` | Lists of customer appointments for a specific salon. |
| **Staff Members** | `randapp:<tenantId>:staff` | List of style experts, titles, and ownership indicators. |
| **Service Catalog** | `randapp:<tenantId>:services` | Core services offered, prices, durations, and images. |
| **Tenant Branding** | `randapp:<tenantId>:branding` | Custom primary colors, hero typography settings, etc. |
| **Business Profiles** | `mock_business_profile_<tenantId>` | Address, description, WhatsApp, and social media URLs. |
| **CRM Notes** | `mock_tenant_customers_<tenantId>` | Customer visual notes, formulae, styles, and photo logs. |
| **Portal Profiles** | `randapp_customer_profile_<tenantId>` | Direct profiles managed by end-users during booking login. |
| **Active Sessions** | `randapp_customer_auth` | Active customer portal connection state. |
| **Referrals & Campaigns**| `randapp_referral_campaigns`<br>`randapp_referral_codes`<br>`randapp_referral_leads` | Marketing automation, tracking leads, and rewards. |
| **Pricing & Plans** | `randapp_plans` | Universal super-admin pricing tier definitions. |
| **Subscription Status**| `mock_subscription_<tenantId>` | Current active billing state of the tenant. |
| **SuperAdmin Auth** | `randapp_mock_user`<br>`nexus_admin_auth` | Logged-in admin session details and security role checking. |
| **Platform Settings** | `randapp_ai_settings` | Platform-wide configurations (such as mock Gemini keys). |
| **Seeded Indicators** | `randapp:<tenantId>:is_seeded` | Marks whether a tenant-wide database has been initialized. |

---

## 2. Dev-Only Diagnostic Overlay Utility

A secure diagnostic interface has been introduced. This helper runs client-side and can be invoked dynamically for diagnostics without exposing data-wiping or reset features to normal visitors.

### Conditions to Activate:
1. **Mode:** `VITE_DATA_MODE` environment variable must be `"mock"`.
2. **Access Token:** Either `?devTools=1` or `?demoTools=1` must be present in the URL query string (supports hash routing as well, e.g., `/#/book?devTools=1` or `/?demoTools=1#/super-admin`).

### Core Actions present in the Panel:
* 🔴 **Reset Mock Data / Mock Veriyi Sıfırla:** Clears only active Randapp keys. Keeps standard browser settings (such as theme and language selection) intact, disables auto-regeneration, and reloads the tab safely.
* 🔍 **List Mock Storage Keys & Sizes:** Real-time scanner identifying active keys, footprint byte counts, and custom viewer payloads.
* 🗑️ **Individual Key Deletion:** Inspect data patterns by removing granular entries (e.g., removing a single rogue appointment list) to test race behaviors.

---

## 3. Storage Self-Limiting Rule (No Ghost Resurrection)

Previously, deleting the last remaining staff member or service caused the mock services to assume that no data had ever been loaded. They would immediately re-read the static fallback demo array and automatically seed local storage, causing deleted items to reappear.

#### How we solved this:
An indicator flag `randapp:<tenantId>:is_seeded` is set after the first initialization (either automatic on first page load or manual via the "Seed" layout actions). 
* When `is_seeded` is `'true'`, fetching an empty list `[]` registers as a valid empty state (all items deleted). No auto-reseeding will occur.
* This guarantees that deleting items stays persistent until you explicitly trigger a **Mock Reset** tool or clean your browser storage.

---

## 4. Manual Browser Cleanup Procedures (Step-by-Step)

If you suspect corrupt local storage is affecting routing or payment logic, you can clear them entirely using browser developer tools:

### Google Chrome & Microsoft Edge
1. Right-click anywhere on the webpage and select **Inspect / İncele** (or press `F12` / `Cmd + Option + I`).
2. Go to the **Application** tab at the top bar. (If hidden, click the `>>` chevron icon).
3. Under the left-hand menu, expand **Local Storage** and select your application's domain (e.g., `localhost` or `randapp.com`).
4. To wipe all mock parameters, click the **Clear All (🚫)** icon, or select single keys and press `Delete`.

### Safari
1. Open the Safari menu and select **Settings / Preferences**.
2. Go to the **Advanced** tab and check **"Show Developer menu in menu bar / Geliştirici menüsünü göster"**.
3. Close settings, right-click on the webpage, and choose **Inspect Element / Ögeyi Denetle**.
4. Navigate to the **Storage** tab.
5. In the left panel, click **Local Storage** and select the active domain.
6. Press the trash can icon or delete specific records.

### Mozilla Firefox
1. Press `F12` (or right-click and select **Inspect / Ögeyi Denetle**).
2. Go to the **Storage / Depolama** tab.
3. Select **Local Storage** from the left navigation tree.
4. Right-click on appropriate keys and select **Delete / Sil** or **Clear All**.

---

**Diagnostic Note:** Wiping `localStorage` is completely safe when running in `mock` mode. The platform will automatically seed fresh initial records on the next layout refresh.
