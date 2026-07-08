# LARİ Full System Inventory

This inventory records all currently implemented directories, pages, services, documentation, QA verification scripts, and schemas supporting the LARİ SaaS workspace.

---

## 1. Routes & Page Architecture

*   `App.tsx`: Main route definitions, layout containers, and application state controllers.
*   `/register`: Self-service tenant registration screen, facilitating business profile mapping, administrative credentials creation, plan selection, and initialization.
*   `/admin`: Workspace console for Business Owners. Houses dashboards, appointment logs, calendar, branch lists, customer sheets, and the critical **Billing tab** containing interactive hooks.
*   `/admin/super-admin`: Platform orchestrator dashboard for offline manually-provisioned pilot accounts, custom metrics logs, and subscription switches.
*   `/pricing`: Commercial tier directory (Plan limits, currency locks, custom domain gating flags).
*   `/demo`: Free sandbox simulation of the calendar, appointment booking, and salon management engine (does not save tenant records).
*   `/pilot/customer`: Read-only customer demonstration page presenting Lumina Brand and booking features.
*   `/pilot/admin`: Zero-session read-only salon owner preview dashboard.
*   `/booking`: Booking page router (e.g. `/booking/[slug]`) serving localized merchant websites and online client reservation steps.

---

## 2. Core Service Abstractions (`/services`)

*   `authService.ts`: Local session persistence, Super Admin auth gates, and password validators.
*   `tenantService.ts`: Tenant configuration manager, metadata records, slot policies, and branch profiles.
*   `branchService.ts`: Multiple branch layout registry, addresses, phone mapping, and service assignments.
*   `serviceCatalogService.ts`: Core appointment categorizations, service names, prices, localized tags, active inventory.
*   `staffService.ts`: Staff roster, calendar link constraints, and operating hours.
*   `availabilityService.ts`: Dynamic slot availability planner matching business hours, service duration, and employee assignments.
*   `appointmentService.ts`: Booking creation engine, status transition logs, outbox event hook points.
*   `customerCampaignService.ts`: Target campaigns, loyal subscriber lists, client discount maps, referrals registry.
*   `brandingService.ts`: Logo asset references, primary background colors, page headlines, font layout parameters.
*   `subscriptionService.ts`: Premium state machine (active, trialing, paused, suspended, manual_active, comped, past_due) and upgrade mechanics.
*   `manualProvisioningService.ts`: Super Admin manual override, bypass gateways, custom contracts logging, and operational alerts.
*   `siteProvisioningService.ts`: Brand subdomain resolution, slug allocation, live toggles, custom domain DNS requested rules.
*   `communicationEventService.ts`: Outbound communication triggers, consent validators, metadata logger, queue persistence.
*   `messageTemplateService.ts`: Localized message template dictionaries (TR/EN) for notifications (WhatsApp, SMS, Email).
*   `communicationProviderConfigService.ts`: Communication network switch (running on `local_outbox_only`).
*   `consentService.ts`: KVKK / GDPR compliance engine, storing granular client consents (booking, reminder, marketing).
*   `supabaseClient.ts`: Supabase storage framework wrapper.
*   `dataProvider.ts` & `supabaseDataProvider.ts`: Swappable database adapters facilitating zero-impact local-storage mock database fallback.

---

## 3. Data Schema & Global Entities (`/types.ts`)

*   `Tenant`: Core business configuration, branding options, active subscription keys, branch arrays.
*   `Branch`: Location addresses, operation boundaries, specific staff lists.
*   `Service`: Name, TR/EN localized titles, currency, base price, duration, image reference.
*   `Staff`: Name, operating slots, working breaks, custom ratings.
*   `Appointment`: Date, time slot, user attributes (email, phone, KVKK selection), current state (confirmed, cancelled, completed, no_show).
*   `TenantSubscription`: Subscription state machine variables, trial timelines, scheduled plan transitions, referral month credits.
*   `CommunicationEvent`: Operational notification objects mapped to queue histories, status, metadata, and languages.

---

## 4. Documentation Manifest (`/docs`)

*   `BILLING_AND_SUBSCRIPTION_OPERATIONS.md`: Reference documentation for billing operations.
*   `SUBSCRIPTION_LIFECYCLE.md`: Status lifecycle definitions.
*   `COMMUNICATION_AND_NOTIFICATION_OPERATIONS.md`: Schema detailing templates, outbox UI, and consent restrictions.
*   `PRODUCT_CAPABILITY_MATRIX.md`: Package matrices (Subdomain, Custom Domain, Multi-Branch).
*   `DATA_GOVERNANCE_AND_PRIVACY.md`: Local regulatory requirements, consent storage, and anonymization scripts.
*   `LARI_LIVE_DEPLOYMENT_OPERATIONS_GUIDE.md`: Comprehensive cutover playbooks.

---

## 5. QA Verification Suite (`/scripts` & `package.json`)

*   `verify-subscription-lifecycle-readiness.mjs`: Validates BillingTab states, service APIs, and status exceptions.
*   `verify-communication-notification-readiness.mjs`: Audits copy safety, templates format, and channel APIs.
*   `verify-site-provisioning-and-manual-sales.mjs`: Tests manual setup and custom domains mapping.
*   `verify-commercial-packaging-readiness.mjs`: Asserts package constraints, upgrade blockers, and features toggling.
*   `verify-provisioning-e2e-readiness.mjs`: Confirms registration sequence.
*   `verify-full-saas-gap-audit.mjs` (Pending installation): Validates complete document integrity and zero-exposure validation constraints.
