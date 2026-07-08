# Self-Service Registration Flow

## Overview
The LARİ platform supports an end-to-end self-service registration flow that allows business owners to seamlessly sign up, select a subscription plan, and proceed to onboarding.

## Architecture & Storage
Depending on the active environment (`VITE_DATA_MODE`), registration data rests in either:
- **Supabase**: Full relational records tracking tenant, owner user, active subscription, and billing states.
- **Mock / Local Storage**:
  - `lari_active_owner_session`: Stores the mock user payload mimicking a JWT or session context.
  - `lari_active_tenant_id`: Denotes the newly generated tenant ID selected by the registered owner.
  - `lari_selected_plan`: The plan ID the user intended to subscribe to.
  - `lari_registration_context`: The form data gathered.
  - `lari_registered_tenants`: An array tracking all locally registered accounts to allow Super Admin visibility and tenant resolution.

## Flow Summary
1. **Initiation**: The owner navigates to `/#/pricing` or homepage CTAs, selecting a plan (e.g. `/#/register?planId=professional`).
2. **Account Creation**: The `/register` form requires owner details (name, email, phone) and basic business contexts (official name, display name, category).
3. **Checkout Handoff**: Upon success, a local `tenantId` is generated. To prevent fake trials going to production, the UI pops up the `CheckoutPreviewModal` mimicking secure checkout handoff. 
4. **Session Hydration**: Clicking "Proceed" redirects the user to `/login?registration=success` which drops them into the admin panel (`/#/admin`) hydrated with the `lari_active_owner_session`.
5. **Admin Continuity**:
   - The user operates solely under their newly created tenant context (`lari_active_tenant_id`).
   - The Billing section reads `lari_selected_plan` (or the underlying data provider) reflecting their correct plan.
   - Using the "Site Preview" correctly displays the owner's chosen business name instead of generic seeded demo data.

## Fallback Modularity
The codebase supports falling back from `lari_*` to `randapp_*` keys dynamically for older data gracefully, but new writes use the explicit architecture to differentiate from legacy pilot hardcoded data.
