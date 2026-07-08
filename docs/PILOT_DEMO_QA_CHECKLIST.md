# Pilot Demo QA Checklist

Before conducting a live demo with a prospect, run through this checklist to ensure the demo environment is stable and visually correct.

## 1. Flow & Navigation
- [x] Marketing Homepage correctly routes to `/pilot` via "Örnek İşletmeyi Gör" button
- [x] Demo landing page (`/demo`) still functions correctly for custom preview generation
- [x] `/pilot` securely enters the `tenant_pilot_demo` environment without breaking registered arrays

## 2. Public Booking Experience
- [x] Selecting "Rezervasyon Sayfasını Aç" opens `/#/tenant_pilot_demo`
- [x] Business Identity: Logo, Brand Color, Cover image are rendering correctly
- [x] Services List: 'Saç Kesimi', 'Saç Boyama', etc. are visible and selectable
- [x] Staff List: Realistic names (Elif, Zeynep) are visible
- [x] Customer booking flow can be completed successfully
- [x] AI Visualizer component appears

## 3. Salon Owner Admin Experience
- [x] Selecting "Admin Paneline Git" routes to `/#/admin`
- [x] Dashboard reflects realistic appointment loads
- [x] Bookings made from public experience appear instantly in the Admin calendar
- [x] Customer Memory contains useful mock notes (e.g., "Ahmet: Asimetrik kesim sever")
- [x] Safe mock Billing state ("Professional Plan - Active") is visible
- [x] NO "mock/dry-run" labels are visible in the customer-facing views

## 4. Environment Safety
- [x] Exiting the demo cleanly restores previous testing tenants if applicable
- [x] No `IYZICO_API_KEY` or other sensitive real secrets leak to the frontend
- [x] No deprecated branding (e.g., Randapp) leaks onto demo screens
