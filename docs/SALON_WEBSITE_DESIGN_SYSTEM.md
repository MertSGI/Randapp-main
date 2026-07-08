# Salon Website Design System

The product architecture implements a "Website First, Booking Second" philosophy. The public-facing system acts as a mini-website for salons before funneling users into the complex booking workflow.

## 1. Core Principles
1. **Vertical SaaS Generalization**: While initially targeted for barbers/salons, the vocabulary and layout should scale gently to dentists, clinics, and studios.
2. **Desktop Professionalism**: The desktop layout uses an expansive layout on desktop (e.g. `max-w-4xl`), giving it the feel of a full-fledged corporate website, rather than just a scaled-up mobile canvas constrained to 500px.
3. **No Top Stepper in Marketing**: The user should never see booking steps ("Hizmet Seç, Saat Seç, vb.") when hitting the landing page.
4. **Booking Flow Semantic Order**: The stepper enforces a strict semantic funnel: Service -> Staff -> Nearest Availability & Time -> Customer Details -> Success.

## 2. Shared Components (`SalonWebsiteView.tsx`)
This component is the true rendering engine for:
- Demo Site generated previews
- App Admin Preview Site (`SitePreviewPage`)
- Super Admin Tenant Preview (`SuperAdminTenantPreviewPage`)
- Live Customer Site (`BookingPage` -> Step 0)

## 3. Upload UX & Asset Consolidation
To streamline the onboarding process and reduce cognitive load for business owners:
- **Logo / Profil Görseli**: Single local upload.
- **Kapak Fotoğrafları / İşletme Görselleri**: N-ary local upload. These images serve a dual purpose—they populate the primary cover slider *and* act as the main gallery.
- **No Separate Gallery Tab**: The concept of a separate standalone gallery section has been removed to avoid redundancy, enforcing the "Cover = Gallery" mental model.
URL fields are now placed inside a collapsible context `<details>` to prevent confusing standard users who expect a raw file picker.

## 4. Lightbox & Immersiveness
- Gallery taps use a localized state variable to stretch a high z-index Fixed absolute block masking the entire viewport to give immersive gallery views.
- Cover blocks support native arrows + fallback dots + Lightbox expand.
