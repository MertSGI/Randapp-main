# Routing and Role QA

## Current Implementation State
- Route `/super-admin/*` is strictly guarded for the `super_admin` role.
- Route `/admin/*` is strictly guarded for the `tenant_owner` role (or `admin` equivalence).
- Unauthenticated users trying to access guarded routes hit `ProtectedRoute` and are met with "Bu alana erişim yetkiniz yok" or get redirected to login, depending on exact URL and login state.
- `LoginPage.tsx` handles automatic role redirection after successful login.
- Mock `superadmin@randapp.com` is configured in `authService.ts`.

## Layout Distribution
- `MarketingLayout`: Used by public-facing non-salon pages (Landing, Login, Pricing).
- `SalonBookingLayout`: Used by customer-facing tenant routes (`/book`, `/ai-visualizer`).
- `AdminLayout`: Used by the salon owner dashboard (`/admin`).
- `SuperAdminLayout`: Used by the super admin dashboard (`/super-admin`).

## Super Admin Routes
- `/#/super-admin`: Renders Overview (metrics, main stats).
- `/#/super-admin/tenants`: Renders Tenants management (list, pause, contact actions).
- `/#/super-admin/subscriptions`: Placeholder for subscriptions flow.
- `/#/super-admin/payments`: Placeholder for mock payment tables.
- `/#/super-admin/onboarding`: Renders go-live queue (ready_for_review) and live tenants with pause controls.
- `/#/super-admin/reports`: Renders platform metrics and stats placeholders.
- `/#/super-admin/settings`: Renders generic platform configurations.

## QA Sign-Off Status
- Layout Mapping Matches Specs: **YES**
- Role Definitions Documented: **YES**
- Unauthorized Fallbacks Established: **YES**
- Admin to Super Admin crossover blocked: **YES** (verified via `ProtectedRoute.tsx`)
- Super Admin Dashboard operational with Mock Actions: **YES**
- Super Admin Nested Routing via Layout Outlet: **YES**
