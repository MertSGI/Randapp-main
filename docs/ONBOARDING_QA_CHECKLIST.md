# Onboarding & Roles QA Checklist

## 1. Authentication & Role Guards
- [ ] Log in as `admin@randapp.com`. Verify routing goes directly to `/admin`.
- [ ] As `admin@randapp.com`, manually try to navigate to `/super-admin`. Verify "Bu alana erişim yetkiniz yok" view appears.
- [ ] Log in as `superadmin@randapp.com`. Verify routing goes directly to `/super-admin`.
- [ ] As `superadmin@randapp.com`, try navigating to `/admin`. Verify restriction or behavior.
- [ ] As an unauthenticated user, verify `/admin` and `/super-admin` redirect to `/login`.

## 2. Onboarding Wizard Actions
- [ ] In `/admin`, open Kurulum Sihirbazı.
- [ ] Step 1: Blank business name / whatsapp should disable Next button.
- [ ] Step 1: Valid save advances to Step 2.
- [ ] Step 2: Saving advances to Step 3.
- [ ] Step 3: Delete all services (via Services tab), verify Step 3 shows incomplete and prevents advancement.
- [ ] Step 3: Add one active service, verify Step 3 is complete and allows Next.
- [ ] Step 4: Same test procedure as Step 3 but for Staff tab.
- [ ] Step 7: Verify "Yayına Hazır Olarak İşaretle" is disabled if Step 1, 3, or 4 is incomplete.
- [ ] Step 7: Un-mock mode (simulate real data): Verify clicking "Yayına Hazır Olarak İşaretle" sets status to `ready_for_review` and disables "Yayına Al" for standard admin unless overridden by roles.

## 3. Super Admin Flow & Navigation
- [ ] Log in as `superadmin@randapp.com`. Verify routing goes directly to `/super-admin`.
- [ ] Verify Sidebar items navigate correctly to nested routes (`/super-admin/tenants`, `/super-admin/onboarding`, etc).
- [ ] Verify active sidebar styling updates as routes change.
- [ ] Navigate to `/super-admin/onboarding` and look at "Ready for Review".
- [ ] Click "Approve Go-Live" on a pending salon. Verify it transitions to "live".
- [ ] Click "Send Back" and provide a note. Verify tenant drops off "Ready for Review" list.
- [ ] In Onboarding or Tenants page, test "Pause Bookings". Verify status goes to `paused`.

## 4. Booking Page Gate
- [ ] Open incognito tab (unauthenticated). Navigate to booking page of a tenant that is `ready_for_review` or `paused`.
- [ ] Verify banner appears: "Hizmet Geçici Olarak Kapalı" (or similar) preventing bookings.
- [ ] Once super admin approves (Tenant `live`), refresh page and verify the booking wizard restores.
