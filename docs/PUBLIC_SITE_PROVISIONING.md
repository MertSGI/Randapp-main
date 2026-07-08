# Public Site Provisioning Architecture

This document describes the intended architecture for generating and managing public-facing salon websites on the LARİ platform.

## 1. Flow Overview

1. **Purchase/Trial**: A professional completes checkout or begins a 14-day card-required trial.
2. **Onboarding Checklist (10 Steps)**: They complete a structured, 10-step setup checklist with real-time feedback and draft persistence:
   - **İşletme Bilgileri**: Official business name, category, and city/district.
   - **İletişim & Konum**: Phone, WhatsApp, and full open address.
   - **Hizmet Kataloğu**: En least 1 active service.
   - **Çalışanlar**: En least 1 active staff member.
   - **Çalışma Saatleri**: Configured opening and closing hours.
   - **Marka & Tasarım**: Accent brand colour, logo, and about description. (See [Media Operations Guide](MEDIA_STORAGE_AND_ASSET_OPERATIONS.md) for public logo and cover storage constraints).
   - **Randevu Kuralları**: Auto-approval preference and cancellation terms.
   - **Ödeme Doğrulaması**: Valid active or trialing trial subscription. `pending_checkout` is blocked.
   - **Önizleme & Test**: An interactive customer page preview simulator on the dashboard.
   - **Yayın İncelemesi**: Submit to LARİ team for and review.
3. **Admin Dashboard Progress Tracker**: A bento-style setup banner on the dashboard shows real-time progress %, next steps CTAs, and publish eligibility clearly in Turkish.
4. **Draft Recovery**: Unsubmitted onboarding inputs are mirrored directly to standard `localStorage` to safeguard against reloading data loss.
5. **Verification Gate**: Business submits profile for review. `publicSiteStatus` becomes `pending_review`. Verification checks run against prohibited business policies.
4. **Tenant & Profile Updates**:
   - `tenant` table holds core details (status, `publicSiteStatus`, `verificationStatus`).
   - `salon_business_profiles` table holds rich display data.
5. **Site Generation (Virtual)**: Once fields are complete, subscription is valid, and verification is approved, their domain becomes active.
6. **Publishing**: `publicSiteStatus` becomes `published`. Their website becomes accessible at `{slug}.lari.com` or their custom domain.

## 2. Slug & Subdomain Rules

We enforce specific rules to ensure URLs are web-safe and distinct from platform routes:

- **Validation**: Lowercase ASCII alphanumeric and hyphens only (`^[a-z0-9][a-z0-9-]*[a-z0-9]$`), no consecutive hyphens. Length between 3 and 50 chars.
- **Auto-generation**: `generateSlugFromName("Nexus Güzellik")` handles Turkish character mapping and formats cleanly to `nexus-guzellik`.
- **Reserved Words**: Slugs like `admin`, `api`, `app`, `www`, `lari`, `book`, etc., are strictly blocked to prevent routing collisions.
- **Decoupling**: The business `public_display_name` is separate from the `slug`, giving them full control over their URL without affecting their display brand.

## 3. URL Router Resolution Design

To serve a dynamic tenant website, the infrastructure executes the following resolution pattern:

1. **Host Header Check**: Request matches subdomain to a verified and published tenant.
2. **Custom Domain Check**: Request matches hostname against configured custom domains.
3. **Fallback Path Validation**: For direct linking, routes like `/book` check `tenant` ID and their `publicSiteStatus`.

## 4. Provisioning States

Public websites respect exactly the tenant's current setup & billing state:

- **Draft / Preview Ready**: Website returns standard graceful unavailability message to the public. Admin can see it via Preview.
- **Pending Review**: Profile submitted for verification. Public site is unavailable.
- **Published**: Website is live, accepting bookings. Requires active subscription or trial, and approved verification.
- **Paused**: Temporarily disabled by the business owner.
- **Suspended / Expired**: If the trial ends, payment fails, or Super Admin triggers a suspension, the public site shows a graceful, neutral unavailability banner without exposing internal errors.

## 5. Security & Verification

- **Prohibited Business Policy**: Adult, illegal, or fake business content is automatically flagged. Suspected accounts are assigned a string `businessRiskStatus` (e.g. `prohibited`), which prevents publication.
- **No Early Access**: `pending_checkout` tenants or those without valid trial entries cannot expose their links or submit for review. 

## 6. Super Admin Manual Provisioning

The `manualProvisioningService.ts` handles offline sales explicitly:
- Creates a tenant profile manually without card input.
- Assigns plans, billing status (like `offline_payment`, `complimentary`, or `pilot_exception`).
- Manages slug reservation.
- Safe workflow ensures no frontend Supabase secrets are bypassed publicly, retaining the capability for Super Admins to manually verify and launch pilot salons.

## 7. Current Subdomain & Hostname Constraints
- In pre-live dev mode, routing utilizes `/#/book?tenant=slug` due to `localhost` hostname constraints.
- In production, wildcard DNS pointing `*.randevulari.com` to the CDN ingress allows `domainResolverService.ts` to decode the subdomain natively and route correctly into the booking engine.

