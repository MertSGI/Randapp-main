# LARİ Multi-Branch Foundation

This document traces the foundation established to safely support multi-branch salon and business models (clinics, chains, franchises) within the LARİ platform, while preventing single-branch merchants from suffering UX overload.

## 1. Architectural Strategy

We chose a localized "Tenant → Branch → Service/Staff/Appointment" scaling model:
- **Tenant:** Denotes the primary business entity or corporate account. All subscriptions, payments, and global policies belong here.
- **Branch (`BusinessBranch`):** Denotes physical or distinct operational locations.
  - A singleton tenant will silently operate under an automatically derived **Primary Branch**.
  - A Kurumsal (Enterprise) tenant can define and manage multiple branches.

## 2. Entitlement Gating

The multi-branch features are tightly enclosed within `entitlementService.ts`.
- **Başlangıç, Standart, Profesyonel, Premium:** `maxBranches = 1`, `multi_branch = false`.
- **Kurumsal:** `maxBranches = 999`, `multi_branch = true`.
- Attempted expansion by a non-Kurumsal user will result in a visual upsell/lock message inside the `BranchManagementSection`.

## 3. Public Booking Routing & Branch Awareness

### Implementation state:
- **Public Booking**: If `branches > 1` and `multi_branch` is enabled, the `BookingPage` intercepts the standard flow with an interactive `Step 0.5: Şube Seçin` selector.
- **Service/Staff Segregation**: Staff and Services optionally bind to a `branchId`. When a customer selects a branch during booking, `BookingPage` filters available staff and services exclusively to that branch (while globally-attributed items fall back seamlessly).
- **Appointment Capture**: Successfully books the appointment attaching the `branchId`, enabling location-specific confirmation messages.
- **Admin Visibility**: `AdminPage` detects multiple branches and introduces a dynamic filter dropdown, dividing the dashboard list seamlessly between "Tüm Şubeler" and individual locations.

### Backward Compatibility (Singleton Fallback):
If a tenant downgrades or only operates one location, the UI automatically skips Step 0.5, locking down the exact identical flow that has operated flawlessly.

## 4. Supabase DB Schema Implications (Migration Preview)

While currently simulated in `branchService.ts` via structured `localStorage`, the data-source adapter strategy dictates the following Supabase footprint when formally migrating:

```sql
CREATE TABLE public.business_branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    city TEXT,
    district TEXT,
    is_primary BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    public_site_status TEXT DEFAULT 'published',
    verification_status TEXT DEFAULT 'not_submitted',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Related future alters:
-- ALTER TABLE public.staff ADD COLUMN branch_id UUID REFERENCES public.business_branches(id);
-- ALTER TABLE public.appointments ADD COLUMN branch_id UUID REFERENCES public.business_branches(id);
```

## 5. Branch URL Strategy
Multi-branch routing integrates seamlessly with domain configurations via `siteProvisioningService.ts`.
- **Preferred Path URL Format**: `https://{tenantSlug}.randevulari.com/{branchSlug}`
- **Fallback URL Format**: `https://{tenantSlug}.randevulari.com?branch={branchSlug}`
- Users traversing directly to a branch-specific link automatically bypass the "Select Branch" UI prompt in the booking flow.

## 6. Super Admin Visibility

The platform infrastructure correctly isolates tenants but now has the schema headroom to iterate `branchId` rollups across financial reporting and analytics, separating regional performances for top-tier merchants.
