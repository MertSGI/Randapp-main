# Micro Fix Queue

| ID | Area | Route/Component | Issue | Severity | Status | Expected Behavior |
|---|---|---|---|---|---|---|
| MF-01 | CRUD | AdminPage.tsx | UI delete handlers need full proof validation with dev tool | P0 | fixed | `useDialog` integrated, avoiding iframe block |
| MF-02 | UI/UX | /book | Inactive services/staff still visible | P1 | fixed | `activeOnly: true` confirmed working |
| MF-03 | Content | Public | Mixed TR/EN in public pages | P2 | fixed | Component correctly varies syntax by language |
| MF-04 | Admin | CustomerMemoryTab.tsx | Deletion of notes/photos doesn't work locally | P2 | fixed | Confirmed state object reference swap resolves view |
| MF-05 | System | Supabase | Storage/Edge functions missing ID checks | P1 | open | Edge functions properly validate JWT and tenant boundaries |
| MF-06 | Super Admin | SuperAdminTenantsPage.tsx | Missing page functionality | P0 | fixed | Implemented functional list of tenants |
| MF-07 | Super Admin | SuperAdminSubscriptionsPage.tsx | Missing page functionality | P0 | fixed | Hooked to mock dashboard data |
| MF-08 | Super Admin | SuperAdminOnboardingPage.tsx | Missing page functionality | P0 | fixed | Go-live approval and setup send-back implemented |
| MF-09 | Super Admin | SuperAdminReportsPage.tsx | Missing page functionality | P0 | fixed | Functional overview with mock data stats |
| MF-10 | Super Admin | SuperAdminSettingsPage.tsx | Missing page functionality | P0 | fixed | Setup basic feature toggles |
| MF-11 | Admin | AdminSettingsTab.tsx | Need actual Admin Settings implementation | P0 | fixed | Implemented saving settings in Admin Dashboard |
| MF-12 | Permissions | AdminSettingsTab.tsx | Business Name logic overlap | P0 | fixed | Differentiated officialName (read-only) and displayName (editable) |
| MF-13 | UI/UX | SuperAdmin | Mobile tables squeezed | P1 | fixed | Implemented responsive mobile cards for tables in Super Admin pages |
| MF-14 | UI/UX | AdminSettingsTab.tsx | Duplicate Public Profile config | P1 | fixed | Removed duplicated public settings, left only AI governance warning |
| MF-15 | UX | BusinessProfileTab.tsx | Missing display name control | P1 | fixed | Moved public_display_name to Business Profile Tab where it belongs |
| MF-16 | UI/UX | SalonWebsiteView.tsx | Using plain tenant.name | P1 | fixed | Enforced public_display_name fallback overriding tenant.name on public UI |
| MF-17 | Refactor | SuperAdminDashboard.tsx | Contains duplicate legacy tables | P1 | fixed | Replaced heavy desktop list with quick overview cards |
| MF-18 | UX | PricingPage.tsx | raw window.alert used for checks | P2 | fixed | Substituted iframe-breaking window.alert with useDialog |
| MF-19 | Copy | MarketingHomePage.tsx | Too salon-specific | P2 | fixed | Adjusted rotating text to represent all SaaS targets |
| MF-20 | Super Admin | SuperAdminAISettingsPage.tsx | Non-blocking backlog for AI integration | P3 | open | Integrate Edge Functions, fix mobile view, and enforce privacy defaults |
