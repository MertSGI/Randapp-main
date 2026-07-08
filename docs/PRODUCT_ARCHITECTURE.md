# Product Architecture & Tenant Model

The application follows a strict separation of concerns regarding user experience, split into four distinct layers (layouts) to ensure clean navigation and prevent context-mixing.

## 1. Marketing / Public LARİ Site (`MarketingLayout`)
- **Target Audience:** Salon owners seeking a SaaS solution.
- **Goal:** Act as a conversion-focused landing site emphasizing that Randapp provides a "Mini Website + Online Booking + AI Advisor" instead of just a raw booking widget.
- **Routes:** `/`, `/features`, `/pricing`, `/demo`, `/contact`, `/login`.
- **Navigation:** Shows product-centric links ("Özellikler", "Demo Oluştur", "Giriş Yap"). Hidden routes from end users.
- **Behavior:** This is the default layout when accessing the root domain without a specific tenant context. The `/#/` route explicitly renders this in Preview Mode.

## 2. Salon Public Booking Site (`SalonBookingLayout`)
- **Target Audience:** Salon clients / end-users.
- **Routes:** `/book`, `/ai-visualizer`, or root when a specific tenant domain/context is detected.
- **Navigation:** Striped down completely. Only shows the specific salon's logo, business name, "Randevu Al" (Book), and conditionally "Yapay Zeka" (if enabled on the salon's plan).
- **Rule:** It must *never* show "Demo Oluştur", "Yönetici Paneli" or global Randapp marketing links.
- **AI Integration:** The AI Visualizer (`/ai-visualizer`) acts as an inspiration and advisory layer *before* booking. It is feature-gated via `planService` and should NOT appear in global admin or marketing layouts.

## 3. Salon Admin Panel (`AdminLayout`)
- **Target Audience:** The specific salon owner/staff.
- **Routes:** `/admin/*`.
- **Navigation:** Admin header with quick navigation back to the booking site, showing the logged-in user email. Contains tabs for Kurulum (Setup), Randevular, Hizmetler, Çalışanlar, Raporlar, and Abonelik.

## 4. Super Admin Platform Panel (`SuperAdminLayout`)
- **Target Audience:** The platform owner (Randapp founders/operators).
- **Routes:** `/super-admin/*`.
- **Navigation:** A robust structural sidebar detailing platform metrics (Tenants, Subscriptions, Payments).
- **Role Guard:** Protected exclusively for users with the `super_admin` role. Returns a Forbidden or Redirects if accessed by a standard user or salon owner.

## Why this Separation?
Previously, the header was tightly coupled, mixing demo requests, AI tools, and salon bookings in one place. A customer coming to "Vibes Hair Studio" doesn't care about the SaaS platform hosting it. They only care about booking. Strict routing and layout boundaries ensure this pristine white-label experience.
