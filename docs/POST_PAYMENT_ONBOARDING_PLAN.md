# Post-Payment Onboarding Plan

## Payment Success Flow
1. **User Checkout:** The salon manager selects a plan on the billing/pricing page and completes checkout via the payment provider (Stripe, iyzico, etc.).
2. **Webhook Reception:** The payment provider sends a web notification to our server (`POST /functions/v1/payment-webhook`).
3. **Webhook Verification:** The Edge Function securely verifies the signature to ensure the payload is authentic.
4. **Provisioning Execution:**
   - **Create Tenant:** A new tenant record is inserted.
   - **Create Subscription:** The subscription details (plan, status: `active`, reference ID) are recorded.
   - **Create Profiles:** The salon owner profile (Staff marked as owner) is linked to their `auth_user_id`.
   - **Create Onboarding Track:** A `tenant_onboarding_progress` record is created.
5. **Redirect & State Updates:** The user is redirected back to the app (`/admin?tab=kurulum`). The app recognizes the setup state.

## Tenant Creation Steps & Manual Support
The automated tenant creation sets `provisioning_status` = `onboarding_required`. 
If payment is delayed or requires manual bank transfer, the status remains `pending_payment`.

### What is Automatic vs Manual?
- **Automatic:** Creating db rows for Tenant, Staff (Owner), Branding, Onboarding Tracker, and basic Services/Staff templates.
- **Manual (Salon Owner):** Filling in the specific details via the Onboarding Setup Wizard (Services, Pricing, Logo, Working Hours).
- **After Onboarding:** Tenant enters `ready_for_review`.
- **Manual Review:** Can optionally approve to `live`.
- **Public Booking:** Only opens when `go_live_status` = `live`.
- **Failed/Incomplete:** Keeps public booking locked.
- **Manual Support (Super Admin):** 
  - Viewing tenants stuck in `setup_in_progress`.
  - Manual review of branding and setup (`reviewed_by_admin = true`).
  - Switching `go_live_status` if necessary for final approvals.

## Setup Fee Explanation
The initial checkout incorporates a one-time `setupFee` + the initial `monthlyPrice`. The setup fee covers white-glove onboarding and configuration support from the sales/support team if needed.

## Go-Live Checklist
Before a tenant goes fully `live` and begins accepting real customers:
1. `salon_info_completed`: Name, Address, Instagram
2. `branding_completed`: Logo and Colors
3. `whatsapp_completed`: Contact number set
4. `services_completed`: At least one active service
5. `staff_completed`: At least one staff member available
6. `test_appointment_completed`: A test booking was successfully made

## Failure Handling
- If the webhook fails or throws an exception during DB insert, the `provisioning_status` is explicitly set to `failed`. 
- The super-admin panel should list tenants with `failed` status to intervene manually and trigger the onboarding creation.
