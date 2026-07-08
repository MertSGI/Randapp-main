# Vertical Market Expansion Model

LARİ is currently focused and marketed as a premium SaaS for Salons, Barbershops, and Beauty Centers. However, the core platform architecture is built generically to afford horizontal/vertical scaling into other appointment-based domains.

## 1. Terminology Constraints
When building generic backend features, the terminology must remain neutral:
- **Tenant/İşletme:** Over "Kuaför/Salon"
- **Staff/Uzman:** Over "Berber/Kuaför"
- **Service/Hizmet:** Over "Kesim/Boya"

Marketing content and immediate vertical-specific pages (like Demo Generator) are allowed to use customized terminology, but the base models must remain flexible.

## 2. Future Verticals
The architecture successfully accommodates:
- Dental Clinics / Diş Hekimleri
- Private Health Clinics / Özel Muayenehaneler
- Personal Trainers / Kişisel Antrenörler
- Spa & Wellness Centers
- Consulting & Coaching / Danışmanlık
- Pet Grooming / Evcil Hayvan Kuaförleri
- Auto Detailing & Wash / Oto Kuaför

## 3. Current Implementation Status
- The general `Staff`, `Service`, `Appointment`, and `Tenant` data models reflect pure scheduling domain entities without rigid beauty-industry schemas.
- AI integrations (like the Style Advisor) are highly specific to the beauty industry at present. Future models should read custom prompts from the Tenant context.
- Landing pages utilize Salon-specific marketing copy to maximize initial conversion block efficiency.

No other vertical market landing pages have been implemented. The strategy is to establish robust product-market fit for beauty centers before rolling out alternative UI variants. By swapping out terminology in `translations.ts` and updating feature flags (`services/planService.ts`), Randapp can transition from "Hair Design" to "Dental Clinic" effortlessly in seconds. The foundational AI, RLS models, and payment abstraction are deeply un-opinionated ensuring multi-tenant capabilities are completely extensible.
