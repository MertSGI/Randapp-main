# Pilot Demo Presentation Script

This guide provides a structured presentation script for demonstrating the LARİ platform to a salon, barber, or clinic owner.

*For automated sales routing strategy and page tracking on public pages, refer to the [Public Sales Funnel Strategy](./PUBLIC_SALES_FUNNEL_STRATEGY.md).*

## Principles for Demoing

- Do NOT mention "mock", "sandbox", "dry run" or any internal development terms to the customer.
- Focus strictly on business value: Time saved, automated calendar, professional appearance, and AI support.
- If they ask about payments, confidently explain our Iyzico integration provides "secure, compliant card processing," and that it gets connected automatically upon onboarding.

## Demo Data Profile: Lumina Güzellik & Kuaför

When demonstrating the `/pilot` environment, the agent will load a pre-seeded, rich dataset that represents a high-performing salon called "Lumina Güzellik & Kuaför":

- **Services**: 7 realistic services priced appropriately for a mid-to-high end salon (e.g. Saç Kesimi, Dip Boya, Kalıcı Oje, Cilt Bakımı, Lazer).
- **Staff**: 4 distinct staff members mapped logically to services (e.g. Nail Artist handles Kalıcı Oje, Master Saç Stilisti handles kesim & boya).
- **Appointments**: 8 contextual appointments spanning across history, today, and tomorrow. Includes mixed statuses: confirmed, pending, cancelled (with a realistic reason), and no_show.
- **Customers**: 6 pre-seeded customers with CRM notes (e.g., beverage preferences, allergies, referral history).
- **Campaigns**: 1 active "Arkadaşını Getir" campaign with pre-loaded rewarded and booked referrals to show off the CRM tab.
- **Reporting**: Appointments contain source tracking tags (WhatsApp, Instagram, Web, Google Maps, QR) so the Reporting tab looks populated.
- **Visuals**: Realistic placeholder covers and category thumbnails for a professional appearance.

This setup prevents the demo from looking empty and shows the full power of LARİ directly on first load without manual data entry during the pitch.

## Step 1: The Initial Hook
- **Start at Homepage (`/`)**
- Point to the value proposition: "LARİ creates your digital storefront, online booking, and AI assistant instantly."
- Let them see the mobile preview (Product Showcase) running silently.

## Step 2: Customer Booking Experience
- **Click "Müşteri deneyimini incele"** (which opens the public booking view for `Lumina Güzellik & Kuaför`).
- Walk them through the customer perspective:
  - "This is what your clients see: your brand colors, your logo, your services."
  - Book a service (e.g. "Saç Kesimi" or "Manikür").
  - Emphasize the AI Style Assistant: "Your customers can optionally consult with an AI assistant for recommendations before booking."

## Step 3: Salon Owner Admin View
- **Go back to `/pilot` and click "İşletme panelini incele"**.
- This safely opens a read-only preview at `/pilot/admin` without requiring login or exposing real sessions.
- Show the Dashboard: 
  - Point to the day's appointments: "The booking we just made appears right here automatically."
- Point out the metrics: "You get a bird's-eye view of your business, total appointments, and staff usage."
- Emphasize that in the real dashboard they will have full Customer Memory, Settings, Staff configuration, and Reports.

## Step 4: Closing the Demo
- **Show the Billing Tab**: 
  - Briefly show the `Professional` plan active state. "Your billing is managed here directly via secure Iyzico infrastructure."
- **Exit Demo**:
  - Click "Demo'dan Çık". This restores any previous actual testing tenant context without corrupting your real device sessions.
- Call to Action: "Let's set up your actual account now for a 14-day free trial." (Navigate to `/pricing`).
