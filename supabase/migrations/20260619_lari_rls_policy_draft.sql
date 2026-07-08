-- 20260619_lari_rls_policy_draft.sql
-- Description: Consolidated Row Level Security (RLS) Policy draft for LARİ Multi-Tenant separation.
-- This migration enables RLS on all active tables and defines strict isolating boundaries.
-- Safe Draft Mode: Contains idempotent commands and handles fallback conditions gracefully.

-- =========================================================================
-- Pre-checks and Schema Alignment Setup
-- =========================================================================

-- Safety check helper function for Super Admin role validation
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users_profile 
        WHERE id = user_id AND role = 'super_admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- Part 1: RLS Enablement Commands
-- =========================================================================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_verification_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_business_profiles ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- Part 2: Drop Existing Overlapping Policies for Safe Re-runability
-- =========================================================================
DROP POLICY IF EXISTS "Public read tenants" ON public.tenants;
DROP POLICY IF EXISTS "Only super admins can modify tenants" ON public.tenants;
DROP POLICY IF EXISTS "Public read branding" ON public.tenant_branding;
DROP POLICY IF EXISTS "Tenant owners can modify branding" ON public.tenant_branding;
DROP POLICY IF EXISTS "Users can read own profile" ON public.users_profile;
DROP POLICY IF EXISTS "Tenant admins can read all profiles in their tenant" ON public.users_profile;
DROP POLICY IF EXISTS "Public read staff" ON public.staff;
DROP POLICY IF EXISTS "Tenant admins can manage staff" ON public.staff;
DROP POLICY IF EXISTS "Public read services" ON public.services;
DROP POLICY IF EXISTS "Tenant admins can manage services" ON public.services;
DROP POLICY IF EXISTS "Tenant admins can read/manage customers" ON public.customers;
DROP POLICY IF EXISTS "Customers can read own customer record" ON public.customers;
DROP POLICY IF EXISTS "Public can insert new appointments (guest booking)" ON public.appointments;
DROP POLICY IF EXISTS "Tenant staff can read/manage appointments" ON public.appointments;
DROP POLICY IF EXISTS "Customers can view own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Tenant staff can read/manage customer_memory" ON public.customer_memory;
DROP POLICY IF EXISTS "Super admins can manage payment events" ON public.payment_events;
DROP POLICY IF EXISTS "Tenant owners can read own verification reviews" ON public.business_verification_reviews;
DROP POLICY IF EXISTS "Super admins can manage verification reviews" ON public.business_verification_reviews;
DROP POLICY IF EXISTS "Super admins can manage notification logs" ON public.notification_logs;
DROP POLICY IF EXISTS "Tenant admins can read notification logs" ON public.notification_logs;


-- =========================================================================
-- Part 3: Table-by-Table Selective RLS Formulation
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. tenants
-- -------------------------------------------------------------------------
-- Super Admins can manage all records
CREATE POLICY "Super Admins - Full Access on tenants" 
ON public.tenants FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Tenant owners and staff can only SELECT and UPDATE their specific tenant profile context
CREATE POLICY "Tenant Owner/Admin SELECT own tenant" 
ON public.tenants FOR SELECT TO authenticated 
USING (
    id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid()) OR
    owner_user_id = auth.uid()
);

CREATE POLICY "Tenant Owner UPDATE own tenant" 
ON public.tenants FOR UPDATE TO authenticated 
USING (
    id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin')) OR
    owner_user_id = auth.uid()
)
WITH CHECK (
    id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin')) OR
    owner_user_id = auth.uid()
);

-- Public layout reading (required for slug routing mapping inside randevulari.com lookup)
CREATE POLICY "Public SELECT published tenants" 
ON public.tenants FOR SELECT TO public 
USING (status = 'active' AND public_site_status = 'published');


-- -------------------------------------------------------------------------
-- 2. users_profile
-- -------------------------------------------------------------------------
-- Super Admins manage everything
CREATE POLICY "Super Admins - Full Access on users_profile" 
ON public.users_profile FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Users can read and update their own profile configuration
CREATE POLICY "Users - Read own profile" 
ON public.users_profile FOR SELECT TO authenticated 
USING (id = auth.uid());

CREATE POLICY "Users - Update own profile" 
ON public.users_profile FOR UPDATE TO authenticated 
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Tenant operators (Owners/Admins) can see all profiles within their registered tenant space
CREATE POLICY "Tenant Admin - SELECT employee/customer profiles" 
ON public.users_profile FOR SELECT TO authenticated 
USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin'))
);


-- -------------------------------------------------------------------------
-- 3. tenant_business_profiles (Salon Websites Profile)
-- -------------------------------------------------------------------------
-- Super Admins manage everything
CREATE POLICY "Super Admins - Full Access on business profiles" 
ON public.tenant_business_profiles FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Tenant owners/admins can fully select and modify their profile
CREATE POLICY "Tenant Admin - Manage own business profile" 
ON public.tenant_business_profiles FOR ALL TO authenticated 
USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin'))
)
WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin'))
);

-- Public clients view profiles if enabled
CREATE POLICY "Public - SELECT published business profiles" 
ON public.tenant_business_profiles FOR SELECT TO public 
USING (is_public_profile_enabled = true);


-- -------------------------------------------------------------------------
-- 4. services
-- -------------------------------------------------------------------------
-- Super Admins manage everything
CREATE POLICY "Super Admins - Full Access on services" 
ON public.services FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Tenant admins can manage services
CREATE POLICY "Tenant Admin - Manage services" 
ON public.services FOR ALL TO authenticated 
USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin'))
)
WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin'))
);

-- Public layout reading active treatment choices
CREATE POLICY "Public - SELECT active public services" 
ON public.services FOR SELECT TO public 
USING (active = true);


-- -------------------------------------------------------------------------
-- 5. staff
-- -------------------------------------------------------------------------
-- Super Admins manage everything
CREATE POLICY "Super Admins - Full Access on staff" 
ON public.staff FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Tenant admins manage practitioners list
CREATE POLICY "Tenant Admin - Manage staff" 
ON public.staff FOR ALL TO authenticated 
USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin'))
)
WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin'))
);

-- Public layout reading practitioner availability selection
CREATE POLICY "Public - SELECT active public staff" 
ON public.staff FOR SELECT TO public 
USING (active = true);


-- -------------------------------------------------------------------------
-- 6. staff_services (Junction table matching staff and services)
-- -------------------------------------------------------------------------
-- Super Admins manage everything
CREATE POLICY "Super Admins - Full Access on staff_services" 
ON public.staff_services FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Tenant admins manage mapping
CREATE POLICY "Tenant Admin - Manage staff_services" 
ON public.staff_services FOR ALL TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.services s
        JOIN public.users_profile up ON up.tenant_id = s.tenant_id
        WHERE up.id = auth.uid() AND up.role IN ('salon_owner', 'admin') AND s.id = staff_services.service_id
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.services s
        JOIN public.users_profile up ON up.tenant_id = s.tenant_id
        WHERE up.id = auth.uid() AND up.role IN ('salon_owner', 'admin') AND s.id = staff_services.service_id
    )
);

-- Public SELECT mapping to populate the interactive book interface
CREATE POLICY "Public - SELECT active staff_services mappings" 
ON public.staff_services FOR SELECT TO public 
USING (true);


-- -------------------------------------------------------------------------
-- 7. availability_rules
-- -------------------------------------------------------------------------
-- Super Admins manage everything
CREATE POLICY "Super Admins - Full Access on availability_rules" 
ON public.availability_rules FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Tenant owners/staff manage rules
CREATE POLICY "Tenant Staff - Manage availability_rules" 
ON public.availability_rules FOR ALL TO authenticated 
USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin', 'staff'))
)
WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin', 'staff'))
);

-- Public SELECT to check calendar slots/exceptions during reservation
CREATE POLICY "Public - SELECT availability_rules to map open calendar slots" 
ON public.availability_rules FOR SELECT TO public 
USING (is_active = true);


-- -------------------------------------------------------------------------
-- 8. appointments
-- -------------------------------------------------------------------------
-- Super Admins manage everything
CREATE POLICY "Super Admins - Full Access on appointments" 
ON public.appointments FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Tenant owners and staff read/write appointments
CREATE POLICY "Tenant Staff - Manage own appointments" 
ON public.appointments FOR ALL TO authenticated 
USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin', 'staff'))
)
WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin', 'staff'))
);

-- Authenticated customers can see their OWN appointments
CREATE POLICY "Registered Customers - Read own appointments" 
ON public.appointments FOR SELECT TO authenticated 
USING (
    customer_id IN (SELECT id FROM public.customers WHERE user_profile_id = auth.uid()) OR
    user_email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- PUBLIC BOOKING INGESTION: Public anonymous clients can INSERT appointments 
-- provided that the appointment target matches a published tenant workspace.
CREATE POLICY "Public - Insert appointments anonymously" 
ON public.appointments FOR INSERT TO public 
WITH CHECK (
    tenant_id IN (SELECT id FROM public.tenants WHERE status = 'active' AND public_site_status = 'published')
);


-- -------------------------------------------------------------------------
-- 9. customers
-- -------------------------------------------------------------------------
-- Super Admins manage everything
CREATE POLICY "Super Admins - Full Access on customers" 
ON public.customers FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Tenant staff can view and manage all customers within their tenant index
CREATE POLICY "Tenant Staff - Manage customers index" 
ON public.customers FOR ALL TO authenticated 
USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin', 'staff'))
)
WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin', 'staff'))
);

-- Registered customer can view/update their own CRM record
CREATE POLICY "Registered Customers - View/Update own record" 
ON public.customers FOR SELECT TO authenticated 
USING (user_profile_id = auth.uid());

-- PUBLIC BOOKING INGESTION: Public anonymous users can insert/register customer CRM records 
-- when submitting a reservation to an active tenant.
CREATE POLICY "Public - Create customer records anonymously during booking" 
ON public.customers FOR INSERT TO public 
WITH CHECK (
    tenant_id IN (SELECT id FROM public.tenants WHERE status = 'active' AND public_site_status = 'published')
);


-- -------------------------------------------------------------------------
-- 10. customer_memory (Strictly Private Treatment Formulas / Notes)
-- -------------------------------------------------------------------------
-- Super Admins manage everything
CREATE POLICY "Super Admins - Full Access on customer_memory" 
ON public.customer_memory FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Tenant staff manage memory journals (Completely hidden from Public)
CREATE POLICY "Tenant Staff - Manage customer_memory" 
ON public.customer_memory FOR ALL TO authenticated 
USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin', 'staff'))
)
WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin', 'staff'))
);

-- Standard customers and public CANNOT read, insert or alter these records!
-- Public Select/Write policies are omitted on purpose (Strict Deny-by-default is enforced).


-- -------------------------------------------------------------------------
-- 11. subscriptions
-- -------------------------------------------------------------------------
-- Super Admins manage everything
CREATE POLICY "Super Admins - Full Access on subscriptions" 
ON public.subscriptions FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Tenant owners and admins can VIEW their active limits (Read-Only)
CREATE POLICY "Tenant Admin - View own subscription" 
ON public.subscriptions FOR SELECT TO authenticated 
USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin'))
);

-- Standard WRITE commands (INSERT/UPDATE/DELETE) are denied to all tenants.
-- Modifications must only occur via Edge Functions / Stripe webhooks running elevated Service Role bypass.


-- -------------------------------------------------------------------------
-- 12. payments & payment_events
-- -------------------------------------------------------------------------
-- Super Admins manage everything
CREATE POLICY "Super Admins - Full Access on payments" 
ON public.payments FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super Admins - Full Access on payment_events" 
ON public.payment_events FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Tenant owners view their invoices (Read-Only)
CREATE POLICY "Tenant Owner - View own payments" 
ON public.payments FOR SELECT TO authenticated 
USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin'))
);

CREATE POLICY "Tenant Owner - View own payment_events" 
ON public.payment_events FOR SELECT TO authenticated 
USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin'))
);

-- INSERT/UPDATE are strictly restricted. Live writing only happens via iyzico/payment outbox in modern backends.


-- -------------------------------------------------------------------------
-- 13. notification_logs (Communication Outbox / Temporary SMS Log Store)
-- -------------------------------------------------------------------------
-- Super Admins manage everything
CREATE POLICY "Super Admins - Full Access on notification_logs" 
ON public.notification_logs FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Tenant staff can read their outbox audit
CREATE POLICY "Tenant Staff - Read own communication logs" 
ON public.notification_logs FOR SELECT TO authenticated 
USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin', 'staff'))
);

-- Public cannot view SMS queue items to protect customer variables (e.g. otp tokens, booking names).
-- System/Edge services insert alerts autonomously.


-- -------------------------------------------------------------------------
-- 14. campaigns (Customer Campaigns)
-- -------------------------------------------------------------------------
-- Super Admins manage everything
CREATE POLICY "Super Admins - Full Access on campaigns" 
ON public.campaigns FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Tenant admins fully manage local customer marketing campaigns
CREATE POLICY "Tenant Admin - Manage campaigns" 
ON public.campaigns FOR ALL TO authenticated 
USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin'))
)
WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin'))
);

-- Public SELECT campaigns to display localized discount incentives on landing page
CREATE POLICY "Public - SELECT active tenant campaigns" 
ON public.campaigns FOR SELECT TO public 
USING (status = 'active');


-- =========================================================================
-- Part 4: TODOs and Stubs for Pending Staging Schema Components
-- =========================================================================

/*
-- TODO B3.1: business_branches / branches table integration
-- If the enterprise multi-location module is activated, execute this policy setup on your database:

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admins - Full Access on branches" 
ON public.branches FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant Admin - Manage own branches" 
ON public.branches FOR ALL TO authenticated USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin'))
);

CREATE POLICY "Public - SELECT published branches" 
ON public.branches FOR SELECT TO public USING (true);
*/

/*
-- TODO B3.2: platform_referrals table integration
-- B2B system tracks signups of other physical salon businesses.

ALTER TABLE public.platform_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admins - Full Access on referrals" 
ON public.platform_referrals FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant Owners - SELECT own referrer credits statistics" 
ON public.platform_referrals FOR SELECT TO authenticated USING (
    referrer_tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid())
);
*/

/*
-- TODO B3.3: custom_domain_requests table integration
-- Allows request cataloging for vanity subdomains / domain mappings onto randevulari.com.

ALTER TABLE public.custom_domain_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admins - Full Access on custom_domain_requests" 
ON public.custom_domain_requests FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant Owners - Initiate and read own vanity request" 
ON public.custom_domain_requests FOR ALL TO authenticated USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin'))
)
WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('salon_owner', 'admin'))
);
*/

-- =========================================================================
-- End of migration draft 20260619_lari_rls_policy_draft.sql
-- =========================================================================
