# Onboarding Wizard Flow

The onboarding wizard guides salon owners through setting up their salon on the platform. It is located in the Admin Panel (`/admin`) and acts as a central hub before the salon goes "live" to accept bookings.

## Steps

1. **İşletme Bilgileri (Salon Name & Category)**:
   - **Required**: Salon Name, Category (Select), City, District.
2. **İletişim & Konum**:
   - **Required**: WhatsApp Number, Open Address.
   - *Optional*: Phone (Alternative).
3. **Hizmet Kataloğu**:
   - **Required**: At least one active service. Features inline quick service add.
4. **Çalışanlar**:
   - **Required**: At least one active staff member. Features inline quick staff add.
5. **Çalışma Saatleri**:
   - **Required**: Selected operational week days, startup and closure times.
6. **Marka & Tasarım**:
   - *Optional*: Brand accent color, logo url, and public short about description.
7. **Randevu Kuralları**:
   - *Optional*: Auto-approve checkbox, custom cancellation policy.
8. **Ödeme Doğrulaması**:
   - **Required**: Trial subscription is fully verified or card added. Blocked if `pending_checkout`.
9. **Önizleme & Test**:
   - **Required**: High-fidelity live interactive micro-preview simulator showing how the public mobile app/site renders and testing slot selection.
10. **Yayına Al**:
    - **Required**: Publishes request submit checklist which invokes verification and safety gates.

## State Management & Features
- **Checklist Service**: `/services/onboardingChecklistService.ts` computes exact progress percentages and next actionable steps dynamically.
- **Admin Feature Availability**: The admin panel strictly locks advanced features and conditionally routes incomplete setups to the Setup Wizard by enforcing `adminFeatureAvailabilityService`. Only essential tabs (`settings`, `billing`, `dashboard`, `staff`, `services`) are available until certain onboarding criteria are met. Advanced tabs (like `customers`, `referrals`, `appointments`) are gated by progress and subscription entitlements.
- **Draft Recovery**: Unsaved drafts are written instantly to `localStorage` representing complete reload-data-loss protection.
- **Live Preview Simulator**: Step 9 simulates customer booking directly within the onboarding wizard for quick testing.
- **Payment Verification**: Integrates securely with billing states, enforcing trial or card additions before submission.
