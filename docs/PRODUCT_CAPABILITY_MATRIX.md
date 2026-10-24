# LARİ Product Capability Truth Matrix

This matrix outlines the system capabilities as of pre-live phase, detailing what works locally versus what requires external infrastructure (Supabase, Custom Domains, live SMTP, etc).

| Feature | Status | User-facing? | Requires external setup? | Package/role | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Self-service registration** | Partial | Yes | Yes (Payment Provider) | All | Requires Iyzico/Stripe for real card storage |
| **Manual sales provisioning** | Yes (Mock) | No (Super Admin) | No | Super Admin | Through `manualProvisioningService.ts` |
| **Tenant public site** | Yes | Yes | No (For local/hash routing) | All | Core functionality |
| **Tenant subdomain** | Yes (Routing logic) | Yes | Yes (Wildcard DNS/SSL) | All | `https://tenant.randevulari.com` logic is ready but DNS must be mapped to the CDN. |
| **Branch URLs** | Yes | Yes | Yes (Subdomain logic) | Premium+ | `https://tenant.randevulari.com/branch` or query param fallback. |
| **Custom domains** | Yes (Requested status) | Yes | Yes (DNS A/CNAME) | Premium/Enterprise | Request flow exists; backend automated verification is future. |
| **Booking** | Yes | Yes | No | All | End-to-end UX works |
| **Admin onboarding** | Yes | No (Owner) | No | Owner | |
| **Payments** | Simulated | Yes | Yes (Iyzico/Provider API) | All | Cannot take real money until VITE_PAYMENT_RUN_MODE = production_live |
| **Trial** | Yes | Yes | Yes (Billing setup) | All | 14-days standard logic, verified in checkout. |
| **Campaigns** | Yes | Yes | No | Various | Internal coupon/discount logic works. |
| **Platform referrals** | Yes | Yes | No | All | `referralService.ts` tracks codes |
| **Customer referrals** | Yes | Yes | No | Premium+ | Part of loyalty modules |
| **AI assistant** | Simulated | Yes | Yes (Gemini API / Supabase RLS) | Premium+ | Mocked locally, requires edge functions for secure API key proxy. |
| **Customer memory** | Yes | No (Owner) | No | Premium+ | CRM functionality |
| **Reports** | Yes | No (Owner) | No | Various | Aggregation works locally. |
| **Data export/import** | Yes | No (Owner) | No | All | `dataExportService.ts` handles JSON payloads. |
| **Notifications** | Simulated | Yes | Yes (SMTP/WhatsApp API) | Premium+ | Currently logs to console. |
| **Multi-language** | Yes | Yes | No | All | `i18nLanguageConfig` drives this |
| **Multi-market** | Yes | Yes | No | Platform | Drives currency, defaults, and brand fallback (LARİ vs RandevuLari domain vs lari.app domain). Visible brand is LARİ. |
| **Super Admin** | Yes | No | No | Super Admin | Has pilot tracker, manual provisioning, etc. |
| **Media storage & asset gallery**| Simulated (Local) | Yes | Yes (Supabase Storage / S3) | All | Mock uploading processes base64 preview urls; Production transition requires bucket credentials. See [LARİ Media Operations Kılavuzu](MEDIA_STORAGE_AND_ASSET_OPERATIONS.md). |
| **Customer Self-Service Links** | Yes | Yes | Yes (Comms Gateway) | All | Link dispatching via Outbox. View, confirm, cancel, and reschedule pages. See [Self-Service Guide](BOOKING_SELF_SERVICE_AND_ABUSE_PREVENTION.md). |
| **Booking Abuse Prevention** | Yes | Yes | No | All | Velocity limiters, duplicate selectors, and no-show blacklisting. See [Anti-Abuse Guide](BOOKING_SELF_SERVICE_AND_ABUSE_PREVENTION.md). |

## Subdomain & DNS Requirements
For `*.randevulari.com` and `*.lari.app` to work in production:
1.  **Wildcard DNS**: Map `*.randevulari.com` to the Cloud Run / Vercel / hosting provider ingress IP or CNAME.
2.  **Wildcard SSL**: Provision a wildcard TLS certificate to cover `*.randevulari.com`.
3.  **App Routing**: The host environment will receive `tenantname.randevulari.com`. The `domainResolverService.ts` parses this on startup, extracts `tenantname`, and initializes the app with that tenant context in the booking flow.

## Custom Domain Workflows
When a user requests `booking.myhairsalon.com`, they must point a CNAME to `custom.randevulari.com` (or equivalent). TLS for third-party domains usually requires programmatic SSL certificate generation through the hosting provider's API. This is a manual or semi-automated process outside of the React SPA.

## Core Operational Questions & Answers

### 1. Does `ornekisletme.randevulari.com` open immediately after setup?
* **In product logic**: Yes. The application is completely designed to support automatic slug generation and subdomain resolution.
* **In local & pre-live development mode**: The system simulates this with `/booking/ornekisletme` hash-routing fallbacks.
* **Before live internet usage**: An external **wildcard DNS** (mapping `*.randevulari.com` to the ingress server) and **wildcard SSL/TLS certificates** must be configured on the host server network layer. Real-time wildcard dynamic routing also requires Supabase persistence enabled to query active records globally on ingress.

### 2. Can manual/offline sales be defined?
* **Yes**. Super Admin manual provisioning is fully active via `SuperAdminManualProvisioningPage` and `manualProvisioningService`. This creates a tenant in-system and sets the subscription plan, billing source (`offline_payment`, `complimentary`, or `pilot_exception`), slug, and publish state.

### 3. Can a customer get a custom .com domain?
* **Yes, the workflow is mapped**. The product supports custom domain values on the tenant record. Once requested, the owner receives CNAME instructions; real activation and SSL binding are handled asynchronously via the platform's infrastructure operations.

### 4. How do multi-branch URLs work?
* **Main corporate/general booking page**: `https://{tenant-slug}.randevulari.com` (maps to the tenant's primary hub).
* **Specific branch booking page**: `https://{tenant-slug}.randevulari.com/{branch-slug}` (or with dynamic route query parameter fallbacks). This routes the user specifically to the selected location, pre-filtering services and staff calendar availability.


## Phase A Acceptance Matrix (Controller Directive 20261024)

Authoritative qualification status across core Phase A booking, availability, anti-abuse, and operational contracts:

| Scope Item | Subsystem / Function | Status | Evidence / Verification |
| :--- | :--- | :--- | :--- |
| **1. Available Slot Booking** | `availabilityService.getAvailableSlotsForStaff` & `createAppointment` | `VERIFIED` | Verified by `qa:phase-a-functional-acceptance` (Scenario 1). Slots generated and booked accurately. |
| **2. Conflicting Slot Rejection** | `LocalBookingRepository.createAppointment` | `DEFECT_FOUND_AND_FIXED` | Demonstrated defect: Local repo lacked overlap checks. Fixed: checks duration overlap against active appointments and throws `Slot conflict`. Verified in Scenario 2. |
| **3. Staff Time-Off & Hours Overrides** | `availabilityService.getAvailableSlotsForStaff` | `DEFECT_FOUND_AND_FIXED` | Demonstrated defect: Rule resolution bypassed staff overrides when salon rule existed. Fixed: prioritizes staff-specific rule over tenant-wide fallback. Verified in Scenario 3. |
| **4. Staff Eligibility & Service Durations** | `LocalCatalogRepository`, `availabilityService`, `LocalBookingRepository` | `DEFECT_FOUND_AND_FIXED` | Demonstrated defect: Missing staff-service eligibility checks allowed unassigned bookings; `getServiceById` lacked demo fallback. Fixed & verified in Scenario 4. |
| **5. Cancellation Without Ghost Slots** | `updateAppointmentStatus` & `availabilityService` | `VERIFIED` | Verified by `qa:phase-a-functional-acceptance` (Scenario 5). Cancelled appointments immediately release reserved time window. |
| **6. Self-Service Token Security** | `appointmentSelfServiceService` | `VERIFIED` | Verified by `qa:phase-a-functional-acceptance` (Scenario 6). Expired/invalid tokens reject change and cancel requests. |
| **7. Cross-Tenant Booking Isolation** | `LocalBookingRepository` & partition keys | `VERIFIED` | Verified by `qa:phase-a-functional-acceptance` (Scenario 7). Tenant A data completely isolated from Tenant B. |
| **8. Anti-Abuse Scoping & No-Show Protection** | `bookingAbuseProtectionService` | `VERIFIED` | Verified by `qa:phase-a-functional-acceptance` (Scenario 8). Repeat no-show phone blocking is tenant-scoped without blocking innocent clients. |
| **9. Decoupled Truthful Notifications** | `communicationEventService` & `notificationService` | `VERIFIED` | Verified by `qa:phase-a-functional-acceptance` (Scenario 9). Booking success is strictly decoupled from delivery; no false sent status. |
| **10. Pilot Demo State Restoration** | `pilotDemoService` & `PilotDemoEntryPage` | `DEFECT_FOUND_AND_FIXED` | Demonstrated defect: Demo entry did not save previous real tenant/session. Fixed: `enterDemoContext` preserves and `exitDemoContext` restores them. Verified in Scenario 10. |
| **11. Wildcard DNS & SSL Routing** | Infrastructure / CDN | `EXTERNAL_DEPENDENCY_PENDING` | Requires production CDN/DNS mapping for `*.randevulari.com` and `*.lari.app`. |
| **12. Real External Notification Dispatch** | Live WhatsApp / SMS Providers (Netgsm, Twilio) | `EXTERNAL_DEPENDENCY_PENDING` | Pre-live safely defaults to outbox rendering; external gateway credentials required for live dispatch. |
| **13. Real Online Card Processing** | Iyzico / Payment Gateway | `EXTERNAL_DEPENDENCY_PENDING` | Client-side simulation active; server-side tokenization and merchant keys required for real collection. |
| **14. Supabase Staging Database Cutover** | Remote PostgreSQL 17 Staging | `EXTERNAL_DEPENDENCY_PENDING` | Tracked in Issue #10. Production cutover strictly blocked pending recovery resolution. |
