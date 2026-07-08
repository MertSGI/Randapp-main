# LARİ Platform Data Governance and Privacy Strategy

This document outlines the approach and implementation mechanisms for handling data privacy, KVKK/GDPR compliance, consent collection, and general data governance across LARİ.

## Core Design Philosophy

LARİ acts as a platform (Veri İşleyen / Data Processor) for its business tenants (Veri Sorumlusu / Data Controller).
Our technical architecture isolates consent boundaries clearly between what the platform needs for its own operation vs what the tenant needs for their customer relationship.

## 1. Customer Booking Consent

When a customer books an appointment via the public `/book` or `/:tenantSlug` link, we collect explicit consent for the following:

- **Required**: General terms & conditions, KVKK acknowledgment. Essential for the booking contract to occur.
- **Optional**: SMS/WhatsApp reminders.
- **Optional**: Marketing & Kampanya (Campaigns).
- **Optional**: Customer memory (Veri Bütünlüğü), which allows notes, hair color, and style preferences to be stored.

### Implementation Reference
- Interfaces: `/types.ts` `CustomerConsentFlags`.
- Services: `/services/consentService.ts`.
- Controller logic: Hooked up inside `BookingPage.tsx` at checkout.
- Rıza Durumu Gösterimi (Consent Display): Exposed to Admin inside `CustomerMemoryTab.tsx`. If `customerMemoryConsent` is false, admins see an Orange Mask indicating "Limited Customer Memory" and cannot process personal style notes.

## 2. Business Owner Terms & Conditions

Upon signup at `/register`, business owners must accept the Terms of Service and Privacy Policy indicating their responsibility as Data Controllers.

### Implementation Reference
- `tenantRegistrationService.ts` ensures terms acceptance is flagged.
- `consentService.recordBusinessOwnerTermsAcceptance()` records it with audit timestamps.

## 3. The "Right to be Forgotten" & "Right to Access"

Data Governance is not just recording; it's providing porting and deletion tools.
Future-readiness is integrated into:
- `types.ts -> CustomerDataRequest` interface.
- Super Admin status checks on Sandbox/Go-live.

### Action Plan for Full Pilot
1. **Anonimleştirme (Anonymization)**: If a customer requests deletion, appointment records should not be dropped directly (to avoid ruining business owner financial metrics/reports), but the `name`, `email`, `phone`, and `notes` should be hashed or scrambled.
2. **Dışa Aktarım (Export)**: A future Admin "Veri Dışa Aktar" button is pending.

## 4. Legal Disclaimers

The provided static pages (`/privacy`, `/terms`) are functional examples in `PrivacyPage.tsx` and `TermsPage.tsx`. They explicitly state LARİ's position as a facilitator. Ensure real legal counsel validates the final copies before deploying to a top-level .com.tr domain.
