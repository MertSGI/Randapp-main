-- =========================================================================
-- LARI CANONICAL DATABASE CONSOLIDATED BASELINE (MIGRATIONS 1 TO 39)
-- Environment-neutral baseline excluding staging bootstrap data.
-- =========================================================================

-- >>> FILE: 001_initial_schema.sql <<<
-- 001_initial_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Define trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 1. tenants
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(255) UNIQUE NOT NULL,
    custom_domain VARCHAR(255) UNIQUE,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE TRIGGER update_tenants_modtime BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. tenant_branding
CREATE TABLE public.tenant_branding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    logo_url VARCHAR(1024),
    primary_color VARCHAR(50),
    accent_color VARCHAR(50),
    business_name VARCHAR(255),
    tagline VARCHAR(255),
    footer_text VARCHAR(1024),
    instagram_url VARCHAR(1024),
    whatsapp_number VARCHAR(50),
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id)
);
CREATE TRIGGER update_tenant_branding_modtime BEFORE UPDATE ON public.tenant_branding FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. users_profile (Connecting Auth users to a tenant and managing roles)
CREATE TABLE public.users_profile (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'customer',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE TRIGGER update_users_profile_modtime BEFORE UPDATE ON public.users_profile FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. staff
CREATE TABLE public.staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_profile_id UUID REFERENCES public.users_profile(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    title VARCHAR(255),
    image VARCHAR(1024),
    is_owner BOOLEAN DEFAULT false,
    phone VARCHAR(50),
    calendar_email VARCHAR(255),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE TRIGGER update_staff_modtime BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. services
CREATE TABLE public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    name_tr VARCHAR(255),
    duration INTEGER NOT NULL,
    price INTEGER NOT NULL,
    image VARCHAR(1024),
    active BOOLEAN DEFAULT true,
    category VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE TRIGGER update_services_modtime BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. customers
CREATE TABLE public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_profile_id UUID REFERENCES public.users_profile(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE TRIGGER update_customers_modtime BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. appointments
CREATE TABLE public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
    user_name VARCHAR(255),
    user_email VARCHAR(255),
    phone VARCHAR(50),
    notes TEXT,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    synced_to_google BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE TRIGGER update_appointments_modtime BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. campaigns
CREATE TABLE public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'draft',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. reminders
CREATE TABLE public.reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. whatsapp_logs
CREATE TABLE public.whatsapp_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    to_number VARCHAR(50),
    message TEXT,
    status VARCHAR(50),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. calendar_integrations
CREATE TABLE public.calendar_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
    provider VARCHAR(50) DEFAULT 'google',
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE TRIGGER update_calendar_integrations_modtime BEFORE UPDATE ON public.calendar_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 12. ai_recommendations
CREATE TABLE public.ai_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    context TEXT,
    recommendation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. customer_segments
CREATE TABLE public.customer_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(255),
    criteria JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 14. subscriptions
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    plan_id VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active',
    current_period_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE TRIGGER update_subscriptions_modtime BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 15. payments
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    currency VARCHAR(10) DEFAULT 'TRY',
    status VARCHAR(50) DEFAULT 'pending',
    provider_reference VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 16. audit_logs
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action VARCHAR(255),
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- Indexes
CREATE INDEX idx_users_profile_tenant ON public.users_profile(tenant_id);
CREATE INDEX idx_staff_tenant ON public.staff(tenant_id);
CREATE INDEX idx_services_tenant ON public.services(tenant_id);
CREATE INDEX idx_customers_tenant ON public.customers(tenant_id);
CREATE INDEX idx_appointments_tenant ON public.appointments(tenant_id);
CREATE INDEX idx_appointments_date ON public.appointments(tenant_id, appointment_date);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(tenant_id, status);

-- ROW LEVEL SECURITY (RLS) PREPARATION

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

-- Helper SQL snippets for RLS:
-- Current User Tenant Filter
-- tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid())

-- Policies for public.tenants
CREATE POLICY "Public read tenants" ON public.tenants FOR SELECT USING (true);
CREATE POLICY "Only super admins can modify tenants" ON public.tenants FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'super_admin')
);

-- Policies for public.tenant_branding
CREATE POLICY "Public read branding" ON public.tenant_branding FOR SELECT USING (true);
CREATE POLICY "Tenant owners can modify branding" ON public.tenant_branding FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND (
          up.role = 'super_admin'
          OR (
            up.role = 'tenant_owner'
            AND up.tenant_id = tenant_branding.tenant_id
          )
        )
    )
);

-- Policies for public.users_profile
CREATE POLICY "Users can read own profile" ON public.users_profile FOR SELECT USING (id = auth.uid());
CREATE POLICY "Tenant admins can read all profiles in their tenant" ON public.users_profile FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND (
          up.role = 'super_admin'
          OR (
            up.role = 'tenant_owner'
            AND up.tenant_id = users_profile.tenant_id
          )
        )
    )
);

-- Policies for public.staff
CREATE POLICY "Public read staff" ON public.staff FOR SELECT USING (true);
CREATE POLICY "Tenant admins can manage staff" ON public.staff FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND (
          up.role = 'super_admin'
          OR (
            up.role = 'tenant_owner'
            AND up.tenant_id = staff.tenant_id
          )
        )
    )
);

-- Policies for public.services
CREATE POLICY "Public read services" ON public.services FOR SELECT USING (true);
CREATE POLICY "Tenant admins can manage services" ON public.services FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND (
          up.role = 'super_admin'
          OR (
            up.role = 'tenant_owner'
            AND up.tenant_id = services.tenant_id
          )
        )
    )
);

-- Policies for public.customers
CREATE POLICY "Tenant admins can read/manage customers" ON public.customers FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND (
          up.role = 'super_admin'
          OR (
            up.role IN ('tenant_owner', 'staff')
            AND up.tenant_id = customers.tenant_id
          )
        )
    )
);
CREATE POLICY "Customers can read own customer record" ON public.customers FOR SELECT USING (
    user_profile_id = auth.uid()
);

-- Policies for public.appointments
CREATE POLICY "Public can insert new appointments (guest booking)" ON public.appointments FOR INSERT WITH CHECK (true);
CREATE POLICY "Tenant staff can read/manage appointments" ON public.appointments FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND (
          up.role = 'super_admin'
          OR (
            up.role IN ('tenant_owner', 'staff')
            AND up.tenant_id = appointments.tenant_id
          )
        )
    )
);
CREATE POLICY "Customers can view own appointments" ON public.appointments FOR SELECT USING (
    customer_id IN (SELECT id FROM public.customers WHERE user_profile_id = auth.uid())
);

-- Policies for public.subscriptions
CREATE POLICY "Tenant admins can view subscriptions" ON public.subscriptions FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND (
          up.role = 'super_admin'
          OR (
            up.role = 'tenant_owner'
            AND up.tenant_id = subscriptions.tenant_id
          )
        )
    )
);

-- Policies for public.payments
CREATE POLICY "Tenant admins can view payments" ON public.payments FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND (
          up.role = 'super_admin'
          OR (
            up.role = 'tenant_owner'
            AND up.tenant_id = payments.tenant_id
          )
        )
    )
);

-- Policies for public.audit_logs
CREATE POLICY "Tenant admins can view audit logs" ON public.audit_logs FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND (
          up.role = 'super_admin'
          OR (
            up.role = 'tenant_owner'
            AND up.tenant_id = audit_logs.tenant_id
          )
        )
    )
);
CREATE POLICY "Super admins can manage audit logs" ON public.audit_logs FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'super_admin')
);


-- >>> FILE: 002_subscription_alignment.sql <<<
-- 002_subscription_alignment.sql

-- Add provider_reference to subscriptions if not exists (for saving stripe customer id or iyzico token)
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(255);

-- Add subscription_id to payments
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL;


-- >>> FILE: 003_provisioning_onboarding.sql <<<
-- 003_provisioning_onboarding.sql

-- Part 1: Update tenants table
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS provisioning_status VARCHAR(50) DEFAULT 'onboarding_required',
ADD COLUMN IF NOT EXISTS go_live_status VARCHAR(50),
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS created_from_checkout_session VARCHAR(255),
ADD COLUMN IF NOT EXISTS sales_notes TEXT;

-- Part 2: Create tenant_onboarding_progress table
CREATE TABLE IF NOT EXISTS public.tenant_onboarding_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE NOT NULL,
    salon_info_completed BOOLEAN DEFAULT false,
    branding_completed BOOLEAN DEFAULT false,
    whatsapp_completed BOOLEAN DEFAULT false,
    services_completed BOOLEAN DEFAULT false,
    staff_completed BOOLEAN DEFAULT false,
    calendar_completed BOOLEAN DEFAULT false,
    test_appointment_completed BOOLEAN DEFAULT false,
    reviewed_by_admin BOOLEAN DEFAULT false,
    live_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Part 3: Triggers and RLS
CREATE TRIGGER update_tenant_onboarding_progress_modtime 
BEFORE UPDATE ON public.tenant_onboarding_progress 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.tenant_onboarding_progress ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Salon owners can read own onboarding progress" 
ON public.tenant_onboarding_progress 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1
    FROM public.users_profile up
    WHERE up.id = auth.uid()
      AND up.active = true
      AND (
        up.role = 'super_admin'
        OR (
          up.role = 'tenant_owner'
          AND up.tenant_id = tenant_onboarding_progress.tenant_id
        )
      )
  )
);

CREATE POLICY "Salon owners can update own onboarding progress" 
ON public.tenant_onboarding_progress 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1
    FROM public.users_profile up
    WHERE up.id = auth.uid()
      AND up.active = true
      AND (
        up.role = 'super_admin'
        OR (
          up.role = 'tenant_owner'
          AND up.tenant_id = tenant_onboarding_progress.tenant_id
        )
      )
  )
);

-- Super admin and service role rules would technically rely on JWT claims or similar structures.
-- A placeholder for super admin:
-- CREATE POLICY "Super admins can manage all onboarding progress" ON public.tenant_onboarding_progress FOR ALL USING (auth.jwt() ->> 'role' = 'super_admin');


-- >>> FILE: 004_iyzico_provider_alignment.sql <<<
-- 004_iyzico_provider_alignment.sql

-- Align subscriptions table
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS provider VARCHAR(50),
ADD COLUMN IF NOT EXISTS provider_customer_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS provider_subscription_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS provider_session_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMP WITH TIME ZONE;

-- (current_period_end is already in 001_initial_schema.sql)

-- Align payments table
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS provider VARCHAR(50),
ADD COLUMN IF NOT EXISTS provider_payment_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS provider_event_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS metadata JSONB;


-- >>> FILE: 005_salon_business_profile.sql <<<
-- Migration: 005_salon_business_profile.sql
-- Description: Adds tenant_business_profiles table for salon websites

CREATE TABLE IF NOT EXISTS public.tenant_business_profiles (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    short_description text,
    about_text text,
    business_category text,
    address text,
    city text,
    district text,
    map_embed_url text,
    google_maps_url text,
    phone text,
    whatsapp_number text,
    instagram_url text,
    website_url text,
    email text,
    opening_hours_summary text,
    cover_image_url text,
    logo_url text,
    gallery_images jsonb DEFAULT '[]'::jsonb,
    amenities jsonb DEFAULT '[]'::jsonb,
    parking_info text,
    payment_methods jsonb DEFAULT '[]'::jsonb,
    cancellation_policy text,
    booking_policy text,
    featured_message text,
    seo_title text,
    seo_description text,
    is_public_profile_enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_business_profiles_tenant_id_key ON public.tenant_business_profiles USING btree (tenant_id);

ALTER TABLE public.tenant_business_profiles ENABLE ROW LEVEL SECURITY;

-- Super Admin: All access
CREATE POLICY "Super Admins can manage all business profiles"
    ON public.tenant_business_profiles
    AS PERMISSIVE FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND up.role = 'super_admin'
        )
    );

-- Salon Owner: Read/Write own profile
CREATE POLICY "Salon owners can read own business profile"
    ON public.tenant_business_profiles
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = (select auth.uid()) 
            AND up.tenant_id = tenant_business_profiles.tenant_id
            AND up.role = 'tenant_owner'
        )
    );

CREATE POLICY "Salon owners can insert own business profile"
    ON public.tenant_business_profiles
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = (select auth.uid()) 
            AND up.tenant_id = tenant_business_profiles.tenant_id
            AND up.role = 'tenant_owner'
        )
    );

CREATE POLICY "Salon owners can update own business profile"
    ON public.tenant_business_profiles
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = (select auth.uid()) 
            AND up.tenant_id = tenant_business_profiles.tenant_id
            AND up.role = 'tenant_owner'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = (select auth.uid()) 
            AND up.tenant_id = tenant_business_profiles.tenant_id
            AND up.role = 'tenant_owner'
        )
    );

-- Public: Read only if enabled and tenant is live (simplified to read if enabled for now, gate is applied by the application)
CREATE POLICY "Public can view enabled business profiles"
    ON public.tenant_business_profiles
    FOR SELECT TO public
    USING (is_public_profile_enabled = true);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_tenant_business_profiles_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenant_business_profiles_updated_at
    BEFORE UPDATE ON public.tenant_business_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_tenant_business_profiles_updated_at_column();


-- >>> FILE: 20260601_lari_core_schema_alignment.sql <<<
-- 20260601_lari_core_schema_alignment.sql

-- Aligning tenants with new specific fields if missing
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS official_business_name text,
ADD COLUMN IF NOT EXISTS public_display_name text,
ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS district text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS instagram_handle text,
ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'none',
ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'not_submitted',
ADD COLUMN IF NOT EXISTS public_site_status text DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS business_risk_status text DEFAULT 'normal',
ADD COLUMN IF NOT EXISTS onboarding_status text DEFAULT 'pending';

-- Aligning subscriptions
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS provider text,
ADD COLUMN IF NOT EXISTS provider_subscription_reference_code text,
ADD COLUMN IF NOT EXISTS provider_customer_reference_code text,
ADD COLUMN IF NOT EXISTS trial_starts_at timestamptz,
ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
ADD COLUMN IF NOT EXISTS past_due_at timestamptz;

-- Aligning payments
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS provider_payment_id text,
ADD COLUMN IF NOT EXISTS provider_token text,
ADD COLUMN IF NOT EXISTS paid_at timestamptz,
ADD COLUMN IF NOT EXISTS failed_at timestamptz,
ADD COLUMN IF NOT EXISTS failure_reason text,
ADD COLUMN IF NOT EXISTS raw_event_id text;

-- Create staffs_services junction
CREATE TABLE IF NOT EXISTS public.staff_services (
    staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE,
    service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
    PRIMARY KEY (staff_id, service_id)
);
ALTER TABLE public.staff_services ENABLE ROW LEVEL SECURITY;

-- Create availability_rules
CREATE TABLE IF NOT EXISTS public.availability_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE,
    weekday integer NOT NULL, -- 0-6 (Sun-Sat)
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT NOW()
);
ALTER TABLE public.availability_rules ENABLE ROW LEVEL SECURITY;

-- Aligning appointments
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS ends_at timestamptz,
ADD COLUMN IF NOT EXISTS customer_name text,
ADD COLUMN IF NOT EXISTS customer_phone text,
ADD COLUMN IF NOT EXISTS customer_email text,
ADD COLUMN IF NOT EXISTS source text;

-- Create customer_memory
CREATE TABLE IF NOT EXISTS public.customer_memory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
    preferences jsonb DEFAULT '{}'::jsonb,
    notes text,
    reference_photo_metadata jsonb DEFAULT '[]'::jsonb,
    consent_flags jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);
CREATE TRIGGER update_customer_memory_modtime BEFORE UPDATE ON public.customer_memory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE public.customer_memory ENABLE ROW LEVEL SECURITY;

-- Create payment_events
CREATE TABLE IF NOT EXISTS public.payment_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL,
    event_type text NOT NULL,
    provider_event_id text UNIQUE,
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    status text,
    raw_payload jsonb,
    processed_at timestamptz,
    processing_error text,
    created_at timestamptz DEFAULT NOW()
);
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- Create business_verification_reviews
CREATE TABLE IF NOT EXISTS public.business_verification_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    status text NOT NULL,
    risk_status text,
    submitted_at timestamptz DEFAULT NOW(),
    reviewed_at timestamptz,
    reviewer_id text,
    review_note text,
    rejection_reason text,
    requested_changes text,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);
CREATE TRIGGER update_business_verification_reviews_modtime BEFORE UPDATE ON public.business_verification_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE public.business_verification_reviews ENABLE ROW LEVEL SECURITY;

-- Create notification_templates
CREATE TABLE IF NOT EXISTS public.notification_templates (
    id text PRIMARY KEY,
    channel text NOT NULL,
    audience text NOT NULL,
    title text NOT NULL,
    subject text,
    body text NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb,
    enabled boolean DEFAULT true,
    provider_required boolean DEFAULT false,
    internal_only boolean DEFAULT false,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);
CREATE TRIGGER update_notification_templates_modtime BEFORE UPDATE ON public.notification_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

-- Create notification_logs
CREATE TABLE IF NOT EXISTS public.notification_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    template_id text REFERENCES public.notification_templates(id) ON DELETE SET NULL,
    channel text,
    recipient text,
    status text DEFAULT 'pending',
    provider_message_id text,
    error text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT NOW()
);
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- RLS DRAFT POLICIES

-- staff_services
CREATE POLICY "Public read staff_services" ON public.staff_services FOR SELECT USING (true);
CREATE POLICY "Tenant admins can manage staff_services" ON public.staff_services FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users_profile up WHERE up.id = auth.uid() AND up.tenant_id = staff_services.staff_id) -- (Draft: simplified check)
);

-- availability_rules
CREATE POLICY "Public read availability_rules" ON public.availability_rules FOR SELECT USING (true);
CREATE POLICY "Tenant admins can manage availability_rules" ON public.availability_rules FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND (
          up.role = 'super_admin'
          OR (
            up.role = 'tenant_owner'
            AND up.tenant_id = availability_rules.tenant_id
          )
        )
    )
);

-- customer_memory (Strictly private)
CREATE POLICY "Tenant staff can read/manage customer_memory" ON public.customer_memory FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND (
          up.role = 'super_admin'
          OR (
            up.role IN ('tenant_owner', 'staff')
            AND up.tenant_id = customer_memory.tenant_id
          )
        )
    )
);

-- payment_events
CREATE POLICY "Super admins can manage payment events" ON public.payment_events FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'super_admin')
);

-- business_verification_reviews
CREATE POLICY "Super admins can manage verification reviews" ON public.business_verification_reviews FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "Tenant owners can read own verification reviews" ON public.business_verification_reviews FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = business_verification_reviews.tenant_id
    )
);

-- notification_templates
CREATE POLICY "Public read notification templates" ON public.notification_templates FOR SELECT USING (true);
CREATE POLICY "Super admins can modify notification templates" ON public.notification_templates FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'super_admin')
);

-- notification_logs
CREATE POLICY "Tenant admins can read notification logs" ON public.notification_logs FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND (
          up.role = 'super_admin'
          OR (
            up.role = 'tenant_owner'
            AND up.tenant_id = notification_logs.tenant_id
          )
        )
    )
);
CREATE POLICY "Super admins can manage notification logs" ON public.notification_logs FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'super_admin')
);


-- >>> FILE: 20260619_lari_rls_policy_draft.sql <<<
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

CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS text AS $$
DECLARE
    u_role text;
BEGIN
    SELECT role INTO u_role FROM public.users_profile WHERE id = user_id AND active = true;
    RETURN u_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_user_tenant_id(user_id uuid)
RETURNS uuid AS $$
DECLARE
    u_tenant_id uuid;
BEGIN
    SELECT tenant_id INTO u_tenant_id FROM public.users_profile WHERE id = user_id AND active = true;
    RETURN u_tenant_id;
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
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role IN ('tenant_owner', 'staff')
        AND up.tenant_id = tenants.id
    ) OR owner_user_id = auth.uid()
);

CREATE POLICY "Tenant Owner UPDATE own tenant" 
ON public.tenants FOR UPDATE TO authenticated 
USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = tenants.id
    ) OR owner_user_id = auth.uid()
)
WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = tenants.id
    ) OR owner_user_id = auth.uid()
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
    public.get_user_role(auth.uid()) = 'tenant_owner' 
    AND public.get_user_tenant_id(auth.uid()) = tenant_id
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
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = tenant_business_profiles.tenant_id
    )
)
WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = tenant_business_profiles.tenant_id
    )
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
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = services.tenant_id
    )
)
WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = services.tenant_id
    )
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
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = staff.tenant_id
    )
)
WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = staff.tenant_id
    )
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
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND EXISTS (
          SELECT 1 FROM public.services s
          WHERE s.id = staff_services.service_id
            AND s.tenant_id = up.tenant_id
        )
    )
)
WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND EXISTS (
          SELECT 1 FROM public.services s
          WHERE s.id = staff_services.service_id
            AND s.tenant_id = up.tenant_id
        )
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
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role IN ('tenant_owner', 'staff')
        AND up.tenant_id = availability_rules.tenant_id
    )
)
WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role IN ('tenant_owner', 'staff')
        AND up.tenant_id = availability_rules.tenant_id
    )
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
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role IN ('tenant_owner', 'staff')
        AND up.tenant_id = appointments.tenant_id
    )
)
WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role IN ('tenant_owner', 'staff')
        AND up.tenant_id = appointments.tenant_id
    )
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
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role IN ('tenant_owner', 'staff')
        AND up.tenant_id = customers.tenant_id
    )
)
WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role IN ('tenant_owner', 'staff')
        AND up.tenant_id = customers.tenant_id
    )
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
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role IN ('tenant_owner', 'staff')
        AND up.tenant_id = customer_memory.tenant_id
    )
)
WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role IN ('tenant_owner', 'staff')
        AND up.tenant_id = customer_memory.tenant_id
    )
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
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = subscriptions.tenant_id
    )
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
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = payments.tenant_id
    )
);

CREATE POLICY "Tenant Owner - View own payment_events" 
ON public.payment_events FOR SELECT TO authenticated 
USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = payment_events.tenant_id
    )
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
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role IN ('tenant_owner', 'staff')
        AND up.tenant_id = notification_logs.tenant_id
    )
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
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = campaigns.tenant_id
    )
)
WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = campaigns.tenant_id
    )
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
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role = 'tenant_owner')
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
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role = 'tenant_owner')
)
WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role = 'tenant_owner')
);
*/

-- =========================================================================
-- End of migration draft 20260619_lari_rls_policy_draft.sql
-- =========================================================================



-- >>> FILE: 20260620_paymentless_production_core_tables.sql <<<
-- LARİ Paymentless Production Core Tables Migration
-- Date: 2026-06-20
-- This migration provisions tables supporting self-service tokens, change requests,
-- outbox logs, support tickets, and legal consent tracking under a paymentless setup.

-- 1. Appointment Access Tokens (Self-Service)
CREATE TABLE IF NOT EXISTS appointment_access_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    appointment_id UUID NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    used_at TIMESTAMPTZ
);

ALTER TABLE appointment_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select by token hash" ON appointment_access_tokens
    FOR SELECT USING (true);

CREATE POLICY "Allow tenant owner management" ON appointment_access_tokens
    USING (tenant_id = (auth.jwt() ->> 'tenant_id'));


-- 2. Appointment Change Requests (Cancellations/Rescheduling)
CREATE TABLE IF NOT EXISTS appointment_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    appointment_id UUID NOT NULL,
    request_type TEXT NOT NULL CHECK (request_type IN ('cancel', 'reschedule')),
    requested_by TEXT NOT NULL CHECK (requested_by IN ('customer', 'salon')),
    proposed_date DATE,
    proposed_time TEXT,
    reason TEXT,
    status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT
);

ALTER TABLE appointment_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow tenant owner reads and writes" ON appointment_change_requests
    USING (tenant_id = (auth.jwt() ->> 'tenant_id'));

CREATE POLICY "Allow public inserts" ON appointment_change_requests
    FOR INSERT WITH CHECK (true);


-- 3. Communication Outbox
CREATE TABLE IF NOT EXISTS communication_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    recipient TEXT NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'email')),
    message TEXT NOT NULL,
    status TEXT DEFAULT 'queued' NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE communication_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant owner can read outbox" ON communication_outbox
    FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id'));

CREATE POLICY "System/Admin can manage outbox" ON communication_outbox
    USING (true);


-- 4. Audit Events
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT,
    actor_id TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    payload JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant owner can read own audit logs" ON audit_events
    FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id'));


-- 5. Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'open' NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    priority TEXT DEFAULT 'normal' NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant owner can manage tickets" ON support_tickets
    USING (tenant_id = (auth.jwt() ->> 'tenant_id'));


-- 6. Policy Acceptances (Legal compliance logs)
CREATE TABLE IF NOT EXISTS policy_acceptances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT,
    user_id TEXT,
    policy_type TEXT NOT NULL CHECK (policy_type IN ('terms', 'privacy_policy', 'kvkk_consent', 'cookie_policy')),
    version TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    accepted_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE policy_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select acceptances for reporting" ON policy_acceptances
    FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id') OR user_id = auth.uid()::text);

CREATE POLICY "Allow public insert acceptances" ON policy_acceptances
    FOR INSERT WITH CHECK (true);


-- 7. Consent Ledger
CREATE TABLE IF NOT EXISTS consent_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    consent_type TEXT NOT NULL,
    is_granted BOOLEAN NOT NULL,
    ip_address TEXT,
    digital_signature TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE consent_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant owners can read/write ledger" ON consent_ledger
    USING (tenant_id = (auth.jwt() ->> 'tenant_id'));

CREATE POLICY "Allow public insertion during checkout" ON consent_ledger
    FOR INSERT WITH CHECK (true);


-- 8. Data Rights Requests (KVKK requests)
CREATE TABLE IF NOT EXISTS data_rights_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    requester_name TEXT NOT NULL,
    requester_contact TEXT NOT NULL,
    request_type TEXT NOT NULL CHECK (request_type IN ('export', 'deletion', 'rectification')),
    details TEXT,
    status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE data_rights_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant owners can manage data rights requests" ON data_rights_requests
    USING (tenant_id = (auth.jwt() ->> 'tenant_id'));


-- >>> FILE: 20260621_paymentless_production_repository_columns.sql <<<
-- LARİ Paymentless Production Repository Columns Migration
-- Date: 2026-06-21
-- Adds missing manual/offline billing columns to the subscriptions table to support the paymentless_limited_production launch.

ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS billing_source TEXT,
ADD COLUMN IF NOT EXISTS paid_through_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_reference_note TEXT,
ADD COLUMN IF NOT EXISTS next_manual_review_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS manual_activation_reason TEXT;


-- >>> FILE: 20260622_paymentless_production_rls_identity_alignment.sql <<<
-- 20260622_paymentless_production_rls_identity_alignment.sql
-- Description: Align paymentless production core tables with users_profile lookup canonical RLS identity model.
-- Drops JWT claim dependent policies from 20260620 and implements users_profile checks + Super Admin bypass.

-- =========================================================================
-- 1. appointment_access_tokens
-- =========================================================================
DROP POLICY IF EXISTS "Allow tenant owner management" ON public.appointment_access_tokens;
DROP POLICY IF EXISTS "Super Admins - Full Access on appointment_access_tokens" ON public.appointment_access_tokens;

CREATE POLICY "Owner/Admin manage appointment tokens" ON public.appointment_access_tokens
    USING (
        EXISTS (
          SELECT 1 FROM public.users_profile up
          WHERE up.id = auth.uid()
            AND up.active = true
            AND (
              up.role = 'super_admin'
              OR (
                up.role = 'tenant_owner'
                AND up.tenant_id = appointment_access_tokens.tenant_id::uuid
              )
            )
        )
    );

CREATE POLICY "Super Admins - Full Access on appointment_access_tokens" ON public.appointment_access_tokens
    FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


-- =========================================================================
-- 2. appointment_change_requests
-- =========================================================================
DROP POLICY IF EXISTS "Allow tenant owner reads and writes" ON public.appointment_change_requests;
DROP POLICY IF EXISTS "Super Admins - Full Access on appointment_change_requests" ON public.appointment_change_requests;

CREATE POLICY "Owner/Admin manage change requests" ON public.appointment_change_requests
    USING (
        EXISTS (
          SELECT 1 FROM public.users_profile up
          WHERE up.id = auth.uid()
            AND up.active = true
            AND (
              up.role = 'super_admin'
              OR (
                up.role = 'tenant_owner'
                AND up.tenant_id = appointment_change_requests.tenant_id::uuid
              )
            )
        )
    );

CREATE POLICY "Super Admins - Full Access on appointment_change_requests" ON public.appointment_change_requests
    FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


-- =========================================================================
-- 3. communication_outbox
-- =========================================================================
DROP POLICY IF EXISTS "Tenant owner can read outbox" ON public.communication_outbox;
DROP POLICY IF EXISTS "Super Admins - Full Access on communication_outbox" ON public.communication_outbox;

CREATE POLICY "Owner/Admin view communication outbox" ON public.communication_outbox
    FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.users_profile up
          WHERE up.id = auth.uid()
            AND up.active = true
            AND (
              up.role = 'super_admin'
              OR (
                up.role = 'tenant_owner'
                AND up.tenant_id = communication_outbox.tenant_id::uuid
              )
            )
        )
    );

CREATE POLICY "Super Admins - Full Access on communication_outbox" ON public.communication_outbox
    FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


-- =========================================================================
-- 4. audit_events
-- =========================================================================
DROP POLICY IF EXISTS "Tenant owner can read own audit logs" ON public.audit_events;
DROP POLICY IF EXISTS "Super Admins - Full Access on audit_events" ON public.audit_events;

CREATE POLICY "Owner/Admin view own audit events" ON public.audit_events
    FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.users_profile up
          WHERE up.id = auth.uid()
            AND up.active = true
            AND (
              up.role = 'super_admin'
              OR (
                up.role = 'tenant_owner'
                AND up.tenant_id = audit_events.tenant_id::uuid
              )
            )
        )
    );

CREATE POLICY "Super Admins - Full Access on audit_events" ON public.audit_events
    FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


-- =========================================================================
-- 5. support_tickets
-- =========================================================================
DROP POLICY IF EXISTS "Tenant owner can manage tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Super Admins - Full Access on support_tickets" ON public.support_tickets;

CREATE POLICY "Owner/Admin manage support tickets" ON public.support_tickets
    USING (
        EXISTS (
          SELECT 1 FROM public.users_profile up
          WHERE up.id = auth.uid()
            AND up.active = true
            AND (
              up.role = 'super_admin'
              OR (
                up.role = 'tenant_owner'
                AND up.tenant_id = support_tickets.tenant_id::uuid
              )
            )
        )
    );

CREATE POLICY "Super Admins - Full Access on support_tickets" ON public.support_tickets
    FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


-- =========================================================================
-- 6. policy_acceptances
-- =========================================================================
DROP POLICY IF EXISTS "Allow select acceptances for reporting" ON public.policy_acceptances;
DROP POLICY IF EXISTS "Super Admins - Full Access on policy_acceptances" ON public.policy_acceptances;

CREATE POLICY "Owner/Admin view policy acceptances" ON public.policy_acceptances
    FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.users_profile up
          WHERE up.id = auth.uid()
            AND up.active = true
            AND (
              up.role = 'super_admin'
              OR (
                up.role = 'tenant_owner'
                AND up.tenant_id = policy_acceptances.tenant_id::uuid
              )
            )
        )
        OR user_id = auth.uid()::text
    );

CREATE POLICY "Super Admins - Full Access on policy_acceptances" ON public.policy_acceptances
    FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


-- =========================================================================
-- 7. consent_ledger
-- =========================================================================
DROP POLICY IF EXISTS "Tenant owners can read/write ledger" ON public.consent_ledger;
DROP POLICY IF EXISTS "Super Admins - Full Access on consent_ledger" ON public.consent_ledger;

CREATE POLICY "Owner/Admin manage consent ledger" ON public.consent_ledger
    USING (
        EXISTS (
          SELECT 1 FROM public.users_profile up
          WHERE up.id = auth.uid()
            AND up.active = true
            AND (
              up.role = 'super_admin'
              OR (
                up.role = 'tenant_owner'
                AND up.tenant_id = consent_ledger.tenant_id::uuid
              )
            )
        )
    );

CREATE POLICY "Super Admins - Full Access on consent_ledger" ON public.consent_ledger
    FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


-- =========================================================================
-- 8. data_rights_requests
-- =========================================================================
DROP POLICY IF EXISTS "Tenant owners can manage data rights requests" ON public.data_rights_requests;
DROP POLICY IF EXISTS "Super Admins - Full Access on data_rights_requests" ON public.data_rights_requests;

CREATE POLICY "Owner/Admin manage data rights requests" ON public.data_rights_requests
    USING (
        EXISTS (
          SELECT 1 FROM public.users_profile up
          WHERE up.id = auth.uid()
            AND up.active = true
            AND (
              up.role = 'super_admin'
              OR (
                up.role = 'tenant_owner'
                AND up.tenant_id = data_rights_requests.tenant_id::uuid
              )
            )
        )
    );

CREATE POLICY "Super Admins - Full Access on data_rights_requests" ON public.data_rights_requests
    FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


-- >>> FILE: 20260713_communication_outbox_rls_hardening.sql <<<
-- 20260713_communication_outbox_rls_hardening.sql
-- Forward-only hardening for communication_outbox policies.
-- Removes broad USING (true) write access and replaces it with explicit tenant/role scoping.

DROP POLICY IF EXISTS "System/Admin can manage outbox" ON public.communication_outbox;
DROP POLICY IF EXISTS "Tenant owner can read outbox" ON public.communication_outbox;
DROP POLICY IF EXISTS "Owner/Admin view communication outbox" ON public.communication_outbox;
DROP POLICY IF EXISTS "Super Admins - Full Access on communication_outbox" ON public.communication_outbox;
DROP POLICY IF EXISTS "Tenant Owner/Staff - Read own communication_outbox" ON public.communication_outbox;
DROP POLICY IF EXISTS "Super Admins - Manage communication_outbox" ON public.communication_outbox;

CREATE POLICY "Tenant Owner/Staff - Read own communication_outbox"
ON public.communication_outbox
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users_profile up
    WHERE up.id = auth.uid()
      AND up.active = true
      AND up.role IN ('tenant_owner', 'staff')
      AND up.tenant_id = communication_outbox.tenant_id::uuid
  )
);

CREATE POLICY "Super Admins - Manage communication_outbox"
ON public.communication_outbox
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Server-side delivery workers must use Supabase service-role credentials from Edge Functions or backend jobs.
-- The service role bypasses RLS; no public, anon, or general authenticated write policy is granted here.

-- >>> FILE: 20260714_tenants_update_rls_hardening.sql <<<
-- 20260714_tenants_update_rls_hardening.sql
-- Forward-only hardening for tenants table policies.
-- Removes broad UPDATE access from tenant owners and strips legacy owner_user_id checks.

DROP POLICY IF EXISTS "Tenant Owner UPDATE own tenant" ON public.tenants;
DROP POLICY IF EXISTS "Tenant Owner/Admin SELECT own tenant" ON public.tenants;

-- Safe SELECT: Authenticated tenant users (owner/staff) can view their own tenant row
CREATE POLICY "Tenant Owner/Admin SELECT own tenant" 
ON public.tenants FOR SELECT TO authenticated 
USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role IN ('tenant_owner', 'staff')
        AND up.tenant_id = tenants.id
    )
);

-- Note: No UPDATE policy is granted to tenant_owner or staff.
-- All platform-controlled fields (status, onboarding_status, public_site_status, plan/subscription, etc.)
-- remain writable exclusively by Super Admins via "Super Admins - Full Access on tenants" or backend service roles.


-- >>> FILE: 20260715_super_admin_provisioning_rpc.sql <<<
-- 20260715_super_admin_provisioning_rpc.sql
-- Description: Controlled, atomic PostgreSQL function for Super Admin Tenant Provisioning.
-- Validates readiness constraints, upserts manual active subscription, publishes site status.

CREATE OR REPLACE FUNCTION public.approve_and_publish_tenant(p_tenant_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_caller_role text;
    v_caller_tenant_id uuid;
    v_has_profile boolean;
    v_has_service boolean;
    v_has_staff boolean;
    v_has_staff_service boolean;
    v_has_availability boolean;
    v_sub_id uuid;
    v_sub_exists boolean;
    v_result jsonb;
    v_persisted_tenant jsonb;
    v_persisted_sub jsonb;
BEGIN
    -- 1. Security check: Caller must be super_admin with NULL tenant_id
    SELECT role, tenant_id INTO v_caller_role, v_caller_tenant_id
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF v_caller_role IS DISTINCT FROM 'super_admin' OR v_caller_tenant_id IS NOT NULL THEN
        RAISE EXCEPTION 'Yetkisiz işlem. Yalnızca platform yöneticisi (Super Admin) bu işlemi gerçekleştirebilir.';
    END IF;

    -- 2. Lock/Load tenant row to prevent concurrency issues
    PERFORM 1 FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Belirtilen işletme (tenant) bulunamadı.';
    END IF;

    -- 3. Readiness checklist verification
    -- A. Business profile exists
    SELECT EXISTS (
        SELECT 1 FROM public.tenant_business_profiles WHERE tenant_id = p_tenant_id
    ) INTO v_has_profile;
    IF NOT v_has_profile THEN
        RAISE EXCEPTION 'Hata: İşletme detay profili (tenant_business_profiles) mevcut değil.';
    END IF;

    -- B. Active service exists
    SELECT EXISTS (
        SELECT 1 FROM public.services WHERE tenant_id = p_tenant_id AND active = true
    ) INTO v_has_service;
    IF NOT v_has_service THEN
        RAISE EXCEPTION 'Hata: İşletmeye tanımlı aktif hizmet bulunamadı.';
    END IF;

    -- C. Active staff exists
    SELECT EXISTS (
        SELECT 1 FROM public.staff WHERE tenant_id = p_tenant_id AND active = true
    ) INTO v_has_staff;
    IF NOT v_has_staff THEN
        RAISE EXCEPTION 'Hata: İşletmeye tanımlı aktif çalışan bulunamadı.';
    END IF;

    -- D. Staff-service assignment exists
    SELECT EXISTS (
        SELECT 1 FROM public.staff_services ss
        JOIN public.services s ON s.id = ss.service_id
        JOIN public.staff st ON st.id = ss.staff_id
        WHERE s.tenant_id = p_tenant_id AND st.tenant_id = p_tenant_id AND s.active = true AND st.active = true
    ) INTO v_has_staff_service;
    IF NOT v_has_staff_service THEN
        RAISE EXCEPTION 'Hata: İşletmede çalışan ve hizmet eşleşmesi (tanımlı uzmanlık) bulunamadı.';
    END IF;

    -- E. Usable active availability exists (belongs to an active staff member)
    SELECT EXISTS (
        SELECT 1 FROM public.availability_rules ar
        JOIN public.staff st ON st.id = ar.staff_id
        WHERE ar.tenant_id = p_tenant_id AND st.tenant_id = p_tenant_id AND st.active = true
    ) INTO v_has_availability;
    IF NOT v_has_availability THEN
        RAISE EXCEPTION 'Hata: İşletmeye ait aktif çalışma saatleri veya uygunluk kuralları tanımlanmamış.';
    END IF;

    -- 4. Idempotently create or update the manual active subscription
    -- Since subscriptions table doesn't have a unique constraint on tenant_id, we check explicitly
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions WHERE tenant_id = p_tenant_id
    ) INTO v_sub_exists;

    IF v_sub_exists THEN
        UPDATE public.subscriptions
        SET
            status = 'manual_active',
            plan_id = 'premium_monthly',
            billing_source = 'manual',
            payment_reference_note = 'Süper Admin tarafından manuel onaylandı'
        WHERE tenant_id = p_tenant_id;
    ELSE
        v_sub_id := gen_random_uuid();
        INSERT INTO public.subscriptions (
            id,
            tenant_id,
            plan_id,
            status,
            billing_source,
            payment_reference_note
        )
        VALUES (
            v_sub_id,
            p_tenant_id,
            'premium_monthly',
            'manual_active',
            'manual',
            'Süper Admin tarafından manuel onaylandı'
        );
    END IF;

    -- 5. Update tenant state
    UPDATE public.tenants
    SET
        status = 'active',
        onboarding_status = 'completed',
        public_site_status = 'published',
        provisioning_status = 'live',
        go_live_status = 'live',
        verification_status = 'approved'
    WHERE id = p_tenant_id;

    -- 6. Retrieve actual persisted state
    SELECT row_to_json(t)::jsonb INTO v_persisted_tenant FROM public.tenants t WHERE t.id = p_tenant_id;
    SELECT row_to_json(s)::jsonb INTO v_persisted_sub FROM public.subscriptions s WHERE s.tenant_id = p_tenant_id LIMIT 1;

    -- 7. Build and return result object containing new state
    v_result := jsonb_build_object(
        'tenant', v_persisted_tenant,
        'subscription', v_persisted_sub
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Revoke public execution permissions
REVOKE EXECUTE ON FUNCTION public.approve_and_publish_tenant(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_and_publish_tenant(uuid) FROM anon;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.approve_and_publish_tenant(uuid) TO authenticated;


-- >>> FILE: 20260716_public_booking_eligibility_rpc.sql <<<
-- Description: Public, atomic RPC to resolve public booking eligibility by slug.
-- Accept slug, return safe non-billing metadata.

CREATE OR REPLACE FUNCTION public.can_accept_public_booking(p_slug text)
RETURNS jsonb AS $$
DECLARE
    v_tenant_id uuid;
    v_status text;
    v_onboarding_status text;
    v_public_site_status text;
    v_sub_exists boolean;
    v_sub_status text;
    v_allowed boolean := false;
    v_reason_code text := 'ok';
BEGIN
    -- 1. Resolve tenant details by slug
    SELECT id, status, onboarding_status, public_site_status
    INTO v_tenant_id, v_status, v_onboarding_status, v_public_site_status
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'found', false,
            'allowed', false,
            'reason_code', 'tenant_not_found'
        );
    END IF;

    -- 2. Validate tenant status
    IF v_status IS DISTINCT FROM 'active' AND v_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'tenant_inactive'
        );
    END IF;

    -- 3. Validate onboarding status
    IF v_onboarding_status IS DISTINCT FROM 'completed' THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'onboarding_incomplete'
        );
    END IF;

    -- 4. Validate public site status
    IF v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'site_unpublished'
        );
    END IF;

    -- 5. Query manual active or active subscription status
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions WHERE tenant_id = v_tenant_id
    ) INTO v_sub_exists;

    IF NOT v_sub_exists THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'entitlement_inactive'
        );
    END IF;

    SELECT status INTO v_sub_status
    FROM public.subscriptions
    WHERE tenant_id = v_tenant_id
    LIMIT 1;

    -- Canonical allowed active statuses: 'active', 'manual_active', 'comped', 'trialing'
    IF v_sub_status IS DISTINCT FROM 'active' 
       AND v_sub_status IS DISTINCT FROM 'manual_active' 
       AND v_sub_status IS DISTINCT FROM 'comped' 
       AND v_sub_status IS DISTINCT FROM 'trialing' THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'entitlement_inactive'
        );
    END IF;

    -- 6. All checks passed
    RETURN jsonb_build_object(
        'found', true,
        'allowed', true,
        'reason_code', 'ok'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Explicit Function Permissions
REVOKE EXECUTE ON FUNCTION public.can_accept_public_booking(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_accept_public_booking(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_accept_public_booking(text) FROM authenticated;

-- Grant execution to anon and authenticated
GRANT EXECUTE ON FUNCTION public.can_accept_public_booking(text) TO anon;
GRANT EXECUTE ON FUNCTION public.can_accept_public_booking(text) TO authenticated;


-- >>> FILE: 20260720_public_booking_rpc.sql <<<
-- 20260720_public_booking_rpc.sql
-- Description: Hardened, safe, atomic, SECURITY DEFINER public booking RPC.
-- Enforces advisory transaction locks, correct overlapping duration checks,
-- Europe/Istanbul timezone parsing, token-regeneration on idempotency replay (with old token revocation),
-- explicit 24-hour idempotency key retention, and redacted SQLERRM exceptions.
-- Migration count after this file: 15

-- =========================================================================
-- 1. Hardened Idempotency Table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.public_booking_idempotency (
    idempotency_key TEXT NOT NULL,
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    appointment_id  UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
    expires_at      TIMESTAMPTZ DEFAULT (now() + interval '24 hours') NOT NULL,
    PRIMARY KEY (idempotency_key, tenant_id)
);

-- RLS Enforcement
ALTER TABLE public.public_booking_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner/Admin can inspect idempotency records" ON public.public_booking_idempotency;

CREATE POLICY "Owner/Admin can inspect idempotency records"
    ON public.public_booking_idempotency
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (
                    up.role = 'tenant_owner'
                    AND up.tenant_id = public_booking_idempotency.tenant_id
                )
              )
        )
    );

-- =========================================================================
-- 2. Public Booking RPC
-- =========================================================================

CREATE OR REPLACE FUNCTION public.create_public_booking(
    p_slug              text,
    p_service_id        uuid,
    p_staff_id          uuid,
    p_appointment_date  date,
    p_appointment_time  time,
    p_customer_name     text,
    p_customer_email    text,
    p_customer_phone    text,
    p_required_consent  boolean,
    p_marketing_consent boolean DEFAULT false,
    p_reminder_consent  boolean DEFAULT false,
    p_idempotency_key   text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id             uuid;
    v_tenant_status         text;
    v_onboarding_status     text;
    v_public_site_status    text;
    v_sub_status            text;
    v_sub_exists            boolean;
    v_service_tenant_id     uuid;
    v_service_active        boolean;
    v_staff_tenant_id       uuid;
    v_staff_active          boolean;
    v_staff_service_exists  boolean;
    v_service_duration      integer;
    v_weekday               integer;
    v_avail_start           time;
    v_avail_end             time;
    v_slot_conflict         boolean;
    v_customer_id           uuid;
    v_appointment_id        uuid;
    v_token                 text;
    v_token_hash            text;
    v_expires_at            timestamptz;
    v_existing_apt_id       uuid;
    v_now_in_tz             timestamp;
    v_req_start             timestamp;
    v_req_end               timestamp;
    v_lock_key              bigint;
    v_stage                 text := 'init';
BEGIN
    -- -----------------------------------------------------------------------
    -- Gate 1: Required consent must be granted by customer
    -- -----------------------------------------------------------------------
    v_stage := 'consent_validation';
    IF p_required_consent IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'consent_required');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 2: Minimal customer data validation
    -- -----------------------------------------------------------------------
    v_stage := 'customer_data_validation';
    IF p_customer_name IS NULL OR trim(p_customer_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_customer_data');
    END IF;
    IF (p_customer_email IS NULL OR trim(p_customer_email) = '')
       AND (p_customer_phone IS NULL OR trim(p_customer_phone) = '') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_customer_data');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 3: Tenant resolution and eligibility
    -- -----------------------------------------------------------------------
    v_stage := 'tenant_validation';
    SELECT id, status, onboarding_status, public_site_status
    INTO v_tenant_id, v_tenant_status, v_onboarding_status, v_public_site_status
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_tenant');
    END IF;

    IF v_tenant_status IS DISTINCT FROM 'active'
       AND v_tenant_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    IF v_onboarding_status IS DISTINCT FROM 'completed' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    IF v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 4: Active entitlement check
    -- -----------------------------------------------------------------------
    v_stage := 'entitlement_validation';
    
    -- Select the current deterministic active/manual entitlement honoring active status
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions 
        WHERE tenant_id = v_tenant_id 
          AND status IN ('active', 'manual_active', 'comped', 'trialing')
          AND (current_period_end IS NULL OR current_period_end > now())
    ) INTO v_sub_exists;

    IF NOT v_sub_exists THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 5: Concurrency Safety via Transactional Advisory Lock
    -- -----------------------------------------------------------------------
    v_stage := 'concurrency_lock';
    v_lock_key := hashtextextended(
        v_tenant_id::text || ':' || p_staff_id::text || ':' || p_appointment_date::text,
        0
    );
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- -----------------------------------------------------------------------
    -- Gate 6: Idempotency Replay (with Token Regeneration & Old Token Revocation)
    -- -----------------------------------------------------------------------
    v_stage := 'idempotency_replay';
    -- Delete expired idempotency keys before checking to enforce the retention window
    DELETE FROM public.public_booking_idempotency 
    WHERE expires_at <= now();

    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        SELECT appointment_id INTO v_existing_apt_id
        FROM public.public_booking_idempotency
        WHERE idempotency_key = p_idempotency_key
          AND tenant_id = v_tenant_id;

        IF FOUND THEN
            -- Expire/Revoke all previous access tokens for this appointment to enforce max 1 active token rule
            UPDATE public.appointment_access_tokens
            SET expires_at = now()
            WHERE appointment_id = v_existing_apt_id 
              AND expires_at > now();

            -- Generate a fresh secure manage token on replay and store only its hash
            v_token      := encode(gen_random_bytes(32), 'hex');
            v_token_hash := encode(sha256(v_token::bytea), 'hex');
            v_expires_at := now() + interval '30 days';

            INSERT INTO public.appointment_access_tokens (
                tenant_id,
                appointment_id,
                token_hash,
                expires_at
            ) VALUES (
                v_tenant_id::text,
                v_existing_apt_id,
                v_token_hash,
                v_expires_at
            );

            RETURN jsonb_build_object(
                'success',        true,
                'appointment_id', v_existing_apt_id,
                'manage_token',   v_token,
                'reason_code',    'ok'
            );
        END IF;
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 7: Service validation — must belong to this tenant and be active
    -- -----------------------------------------------------------------------
    v_stage := 'service_validation';
    SELECT tenant_id, active, duration
    INTO v_service_tenant_id, v_service_active, v_service_duration
    FROM public.services
    WHERE id = p_service_id;

    IF NOT FOUND OR v_service_tenant_id IS DISTINCT FROM v_tenant_id OR v_service_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_service');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 8: Staff validation — must belong to this tenant and be active
    -- -----------------------------------------------------------------------
    v_stage := 'staff_validation';
    SELECT tenant_id, active
    INTO v_staff_tenant_id, v_staff_active
    FROM public.staff
    WHERE id = p_staff_id;

    IF NOT FOUND OR v_staff_tenant_id IS DISTINCT FROM v_tenant_id OR v_staff_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_staff');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 9: Staff-service mapping must exist
    -- -----------------------------------------------------------------------
    v_stage := 'staff_service_mapping_validation';
    SELECT EXISTS (
        SELECT 1 FROM public.staff_services
        WHERE staff_id = p_staff_id AND service_id = p_service_id
    ) INTO v_staff_service_exists;

    IF NOT v_staff_service_exists THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_staff');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 10: Date/time must be strictly in the future (timezone-aware)
    -- -----------------------------------------------------------------------
    v_stage := 'timezone_validation';
    v_now_in_tz := now() AT TIME ZONE 'Europe/Istanbul';
    v_req_start := (p_appointment_date + p_appointment_time);

    IF v_req_start <= v_now_in_tz THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'outside_availability');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 11: Availability rule check
    -- -----------------------------------------------------------------------
    v_stage := 'availability_validation';
    v_weekday   := EXTRACT(DOW FROM p_appointment_date)::integer;
    v_req_end   := v_req_start + (COALESCE(v_service_duration, 60) || ' minutes')::interval;

    SELECT start_time, end_time
    INTO v_avail_start, v_avail_end
    FROM public.availability_rules
    WHERE staff_id  = p_staff_id
      AND tenant_id = v_tenant_id
      AND weekday   = v_weekday
      AND is_active = true
      AND start_time <= v_req_start::time
      AND end_time   >= v_req_end::time
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'outside_availability');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 12: Overlapping conflict detection
    -- -----------------------------------------------------------------------
    v_stage := 'slot_conflict_validation';
    SELECT EXISTS (
        SELECT 1 FROM public.appointments a
        JOIN public.services s ON s.id = a.service_id
        WHERE a.staff_id  = p_staff_id
          AND a.tenant_id = v_tenant_id
          AND a.appointment_date = p_appointment_date
          AND a.status NOT IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system', 'no_show')
          -- Check overlapping interval:
          AND (a.appointment_date + a.appointment_time) < v_req_end
          AND ((a.appointment_date + a.appointment_time) + (COALESCE(s.duration, 60) || ' minutes')::interval) > v_req_start
    ) INTO v_slot_conflict;

    IF v_slot_conflict THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'slot_conflict');
    END IF;

    -- -----------------------------------------------------------------------
    -- All gates passed — begin atomic writes
    -- -----------------------------------------------------------------------

    -- Step 1: Resolve or create customer
    v_stage := 'customer_write';
    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE tenant_id = v_tenant_id
      AND (
          (p_customer_email IS NOT NULL AND trim(p_customer_email) != '' AND email = trim(p_customer_email))
          OR
          (p_customer_phone IS NOT NULL AND trim(p_customer_phone) != '' AND phone = trim(p_customer_phone))
      )
    LIMIT 1;

    IF NOT FOUND THEN
        INSERT INTO public.customers (tenant_id, name, email, phone)
        VALUES (
            v_tenant_id,
            trim(p_customer_name),
            NULLIF(trim(p_customer_email), ''),
            NULLIF(trim(p_customer_phone), '')
        )
        RETURNING id INTO v_customer_id;
    END IF;

    -- Step 2: Persist booking consent to consent_ledger
    v_stage := 'consent_write';
    INSERT INTO public.consent_ledger (
        tenant_id,
        customer_id,
        consent_type,
        is_granted,
        digital_signature
    ) VALUES
    (
        v_tenant_id::text,
        v_customer_id::text,
        'booking_transactional',
        p_required_consent,
        'rpc_booking_submit'
    ),
    (
        v_tenant_id::text,
        v_customer_id::text,
        'communication',
        p_reminder_consent,
        'rpc_booking_submit'
    ),
    (
        v_tenant_id::text,
        v_customer_id::text,
        'marketing',
        p_marketing_consent,
        'rpc_booking_submit'
    );

    -- Step 3: Insert appointment
    v_stage := 'appointment_write';
    INSERT INTO public.appointments (
        tenant_id,
        customer_id,
        service_id,
        staff_id,
        user_name,
        user_email,
        phone,
        appointment_date,
        appointment_time,
        status
    ) VALUES (
        v_tenant_id,
        v_customer_id,
        p_service_id,
        p_staff_id,
        trim(p_customer_name),
        NULLIF(trim(p_customer_email), ''),
        NULLIF(trim(p_customer_phone), ''),
        p_appointment_date,
        p_appointment_time,
        'confirmed'
    )
    RETURNING id INTO v_appointment_id;

    -- Step 4: Record idempotency key if provided
    v_stage := 'idempotency_write';
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        INSERT INTO public.public_booking_idempotency (idempotency_key, tenant_id, appointment_id)
        VALUES (p_idempotency_key, v_tenant_id, v_appointment_id)
        ON CONFLICT (idempotency_key, tenant_id) DO NOTHING;
    END IF;

    -- Step 5: Create appointment access token
    v_stage := 'token_write';
    v_token      := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(sha256(v_token::bytea), 'hex');
    v_expires_at := now() + interval '30 days';

    INSERT INTO public.appointment_access_tokens (
        tenant_id,
        appointment_id,
        token_hash,
        expires_at
    ) VALUES (
        v_tenant_id::text,
        v_appointment_id,
        v_token_hash,
        v_expires_at
    );

    RETURN jsonb_build_object(
        'success',        true,
        'appointment_id', v_appointment_id,
        'manage_token',   v_token,
        'reason_code',    'ok'
    );

EXCEPTION WHEN OTHERS THEN
    -- Redact all details: Log only safe stage identifier and SQLSTATE, never log SQLERRM or PII
    RAISE WARNING 'create_public_booking error stage: %, SQLSTATE: %', v_stage, SQLSTATE;
    RETURN jsonb_build_object(
        'success',      false,
        'reason_code',  'temporary_failure'
    );
END;
$$;


-- =========================================================================
-- 3. Explicit Permission Grants
-- =========================================================================
REVOKE EXECUTE ON FUNCTION public.create_public_booking(
    text, uuid, uuid, date, time,
    text, text, text, boolean, boolean, boolean, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_public_booking(
    text, uuid, uuid, date, time,
    text, text, text, boolean, boolean, boolean, text
) TO anon;

GRANT EXECUTE ON FUNCTION public.create_public_booking(
    text, uuid, uuid, date, time,
    text, text, text, boolean, boolean, boolean, text
) TO authenticated;


-- >>> FILE: 20260722_public_booking_search_path_fix.sql <<<
-- 20260722_public_booking_search_path_fix.sql
-- Description: Fix SECURITY DEFINER functions to use search_path = public, extensions.
-- This ensures gen_random_bytes (from pgcrypto) resolves correctly when invoked.
-- Migration count after this file: 16

-- =========================================================================
-- 1. Redefine create_public_booking with corrected search_path
-- =========================================================================
CREATE OR REPLACE FUNCTION public.create_public_booking(
    p_slug              text,
    p_service_id        uuid,
    p_staff_id          uuid,
    p_appointment_date  date,
    p_appointment_time  time,
    p_customer_name     text,
    p_customer_email    text,
    p_customer_phone    text,
    p_required_consent  boolean,
    p_marketing_consent boolean DEFAULT false,
    p_reminder_consent  boolean DEFAULT false,
    p_idempotency_key   text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_tenant_id             uuid;
    v_tenant_status         text;
    v_onboarding_status     text;
    v_public_site_status    text;
    v_sub_status            text;
    v_sub_exists            boolean;
    v_service_tenant_id     uuid;
    v_service_active        boolean;
    v_staff_tenant_id       uuid;
    v_staff_active          boolean;
    v_staff_service_exists  boolean;
    v_service_duration      integer;
    v_weekday               integer;
    v_avail_start           time;
    v_avail_end             time;
    v_slot_conflict         boolean;
    v_customer_id           uuid;
    v_appointment_id        uuid;
    v_token                 text;
    v_token_hash            text;
    v_expires_at            timestamptz;
    v_existing_apt_id       uuid;
    v_now_in_tz             timestamp;
    v_req_start             timestamp;
    v_req_end               timestamp;
    v_lock_key              bigint;
    v_stage                 text := 'init';
BEGIN
    -- -----------------------------------------------------------------------
    -- Gate 1: Required consent must be granted by customer
    -- -----------------------------------------------------------------------
    v_stage := 'consent_validation';
    IF p_required_consent IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'consent_required');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 2: Minimal customer data validation
    -- -----------------------------------------------------------------------
    v_stage := 'customer_data_validation';
    IF p_customer_name IS NULL OR trim(p_customer_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_customer_data');
    END IF;
    IF (p_customer_email IS NULL OR trim(p_customer_email) = '')
       AND (p_customer_phone IS NULL OR trim(p_customer_phone) = '') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_customer_data');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 3: Tenant resolution and eligibility
    -- -----------------------------------------------------------------------
    v_stage := 'tenant_validation';
    SELECT id, status, onboarding_status, public_site_status
    INTO v_tenant_id, v_tenant_status, v_onboarding_status, v_public_site_status
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_tenant');
    END IF;

    IF v_tenant_status IS DISTINCT FROM 'active'
       AND v_tenant_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    IF v_onboarding_status IS DISTINCT FROM 'completed' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    IF v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 4: Active entitlement check
    -- -----------------------------------------------------------------------
    v_stage := 'entitlement_validation';
    
    -- Select the current deterministic active/manual entitlement honoring active status
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions 
        WHERE tenant_id = v_tenant_id 
          AND status IN ('active', 'manual_active', 'comped', 'trialing')
          AND (current_period_end IS NULL OR current_period_end > now())
    ) INTO v_sub_exists;

    IF NOT v_sub_exists THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 5: Concurrency Safety via Transactional Advisory Lock
    -- -----------------------------------------------------------------------
    v_stage := 'concurrency_lock';
    v_lock_key := hashtextextended(
        v_tenant_id::text || ':' || p_staff_id::text || ':' || p_appointment_date::text,
        0
    );
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- -----------------------------------------------------------------------
    -- Gate 6: Idempotency Replay (with Token Regeneration & Old Token Revocation)
    -- -----------------------------------------------------------------------
    v_stage := 'idempotency_replay';
    -- Delete expired idempotency keys before checking to enforce the retention window
    DELETE FROM public.public_booking_idempotency 
    WHERE expires_at <= now();

    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        SELECT appointment_id INTO v_existing_apt_id
        FROM public.public_booking_idempotency
        WHERE idempotency_key = p_idempotency_key
          AND tenant_id = v_tenant_id;

        IF FOUND THEN
            -- Expire/Revoke all previous access tokens for this appointment to enforce max 1 active token rule
            UPDATE public.appointment_access_tokens
            SET expires_at = now()
            WHERE appointment_id = v_existing_apt_id 
              AND expires_at > now();

            -- Generate a fresh secure manage token on replay and store only its hash
            v_token      := encode(gen_random_bytes(32), 'hex');
            v_token_hash := encode(sha256(v_token::bytea), 'hex');
            v_expires_at := now() + interval '30 days';

            INSERT INTO public.appointment_access_tokens (
                tenant_id,
                appointment_id,
                token_hash,
                expires_at
            ) VALUES (
                v_tenant_id::text,
                v_existing_apt_id,
                v_token_hash,
                v_expires_at
            );

            RETURN jsonb_build_object(
                'success',        true,
                'appointment_id', v_existing_apt_id,
                'manage_token',   v_token,
                'reason_code',    'ok'
            );
        END IF;
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 7: Service validation — must belong to this tenant and be active
    -- -----------------------------------------------------------------------
    v_stage := 'service_validation';
    SELECT tenant_id, active, duration
    INTO v_service_tenant_id, v_service_active, v_service_duration
    FROM public.services
    WHERE id = p_service_id;

    IF NOT FOUND OR v_service_tenant_id IS DISTINCT FROM v_tenant_id OR v_service_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_service');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 8: Staff validation — must belong to this tenant and be active
    -- -----------------------------------------------------------------------
    v_stage := 'staff_validation';
    SELECT tenant_id, active
    INTO v_staff_tenant_id, v_staff_active
    FROM public.staff
    WHERE id = p_staff_id;

    IF NOT FOUND OR v_staff_tenant_id IS DISTINCT FROM v_tenant_id OR v_staff_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_staff');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 9: Staff-service mapping must exist
    -- -----------------------------------------------------------------------
    v_stage := 'staff_service_mapping_validation';
    SELECT EXISTS (
        SELECT 1 FROM public.staff_services
        WHERE staff_id = p_staff_id AND service_id = p_service_id
    ) INTO v_staff_service_exists;

    IF NOT v_staff_service_exists THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_staff');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 10: Date/time must be strictly in the future (timezone-aware)
    -- -----------------------------------------------------------------------
    v_stage := 'timezone_validation';
    v_now_in_tz := now() AT TIME ZONE 'Europe/Istanbul';
    v_req_start := (p_appointment_date + p_appointment_time);

    IF v_req_start <= v_now_in_tz THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'outside_availability');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 11: Availability rule check
    -- -----------------------------------------------------------------------
    v_stage := 'availability_validation';
    v_weekday   := EXTRACT(ISODOW FROM p_appointment_date)::integer;
    v_req_end   := v_req_start + (COALESCE(v_service_duration, 60) || ' minutes')::interval;

    SELECT start_time, end_time
    INTO v_avail_start, v_avail_end
    FROM public.availability_rules
    WHERE staff_id  = p_staff_id
      AND tenant_id = v_tenant_id
      AND weekday   = v_weekday
      AND is_active = true
      AND start_time <= v_req_start::time
      AND end_time   >= v_req_end::time
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'outside_availability');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 12: Overlapping conflict detection
    -- -----------------------------------------------------------------------
    v_stage := 'slot_conflict_validation';
    SELECT EXISTS (
        SELECT 1 FROM public.appointments a
        JOIN public.services s ON s.id = a.service_id
        WHERE a.staff_id  = p_staff_id
          AND a.tenant_id = v_tenant_id
          AND a.appointment_date = p_appointment_date
          AND a.status NOT IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system', 'no_show')
          -- Check overlapping interval:
          AND (a.appointment_date + a.appointment_time) < v_req_end
          AND ((a.appointment_date + a.appointment_time) + (COALESCE(s.duration, 60) || ' minutes')::interval) > v_req_start
    ) INTO v_slot_conflict;

    IF v_slot_conflict THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'slot_conflict');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 1: Resolve or create customer (atomically under SECURITY DEFINER)
    -- -----------------------------------------------------------------------
    v_stage := 'customer_write';
    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE tenant_id = v_tenant_id
      AND (
          (p_customer_email IS NOT NULL AND trim(p_customer_email) != '' AND email = trim(p_customer_email))
          OR
          (p_customer_phone IS NOT NULL AND trim(p_customer_phone) != '' AND phone = trim(p_customer_phone))
      )
    LIMIT 1;

    IF NOT FOUND THEN
        INSERT INTO public.customers (tenant_id, name, email, phone)
        VALUES (
            v_tenant_id,
            trim(p_customer_name),
            NULLIF(trim(p_customer_email), ''),
            NULLIF(trim(p_customer_phone), '')
        )
        RETURNING id INTO v_customer_id;
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 2: Persist booking consent to consent_ledger
    -- -----------------------------------------------------------------------
    v_stage := 'consent_write';
    INSERT INTO public.consent_ledger (
        tenant_id,
        customer_id,
        consent_type,
        is_granted,
        digital_signature
    ) VALUES
    (
        v_tenant_id::text,
        v_customer_id::text,
        'booking_transactional',
        p_required_consent,
        'rpc_booking_submit'
    ),
    (
        v_tenant_id::text,
        v_customer_id::text,
        'communication',
        p_reminder_consent,
        'rpc_booking_submit'
    ),
    (
        v_tenant_id::text,
        v_customer_id::text,
        'marketing',
        p_marketing_consent,
        'rpc_booking_submit'
    );

    -- -----------------------------------------------------------------------
    -- Step 3: Insert appointment
    -- -----------------------------------------------------------------------
    v_stage := 'appointment_write';
    INSERT INTO public.appointments (
        tenant_id,
        customer_id,
        service_id,
        staff_id,
        user_name,
        user_email,
        phone,
        appointment_date,
        appointment_time,
        status
    ) VALUES (
        v_tenant_id,
        v_customer_id,
        p_service_id,
        p_staff_id,
        trim(p_customer_name),
        NULLIF(trim(p_customer_email), ''),
        NULLIF(trim(p_customer_phone), ''),
        p_appointment_date,
        p_appointment_time,
        'confirmed'
    )
    RETURNING id INTO v_appointment_id;

    -- -----------------------------------------------------------------------
    -- Step 4: Record idempotency key if provided
    -- -----------------------------------------------------------------------
    v_stage := 'idempotency_write';
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        INSERT INTO public.public_booking_idempotency (idempotency_key, tenant_id, appointment_id)
        VALUES (p_idempotency_key, v_tenant_id, v_appointment_id)
        ON CONFLICT (idempotency_key, tenant_id) DO NOTHING;
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 5: Create appointment access token
    -- -----------------------------------------------------------------------
    v_stage := 'token_write';
    v_token      := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(sha256(v_token::bytea), 'hex');
    v_expires_at := now() + interval '30 days';

    INSERT INTO public.appointment_access_tokens (
        tenant_id,
        appointment_id,
        token_hash,
        expires_at
    ) VALUES (
        v_tenant_id::text,
        v_appointment_id,
        v_token_hash,
        v_expires_at
    );

    RETURN jsonb_build_object(
        'success',        true,
        'appointment_id', v_appointment_id,
        'manage_token',   v_token,
        'reason_code',    'ok'
    );

EXCEPTION WHEN OTHERS THEN
    -- Redact all details: Log only safe stage identifier and SQLSTATE, never log SQLERRM or PII
    RAISE WARNING 'create_public_booking error stage: %, SQLSTATE: %', v_stage, SQLSTATE;
    RETURN jsonb_build_object(
        'success',      false,
        'reason_code',  'temporary_failure'
    );
END;
$$;


-- =========================================================================
-- 2. Redefine can_accept_public_booking with corrected search_path
-- =========================================================================
CREATE OR REPLACE FUNCTION public.can_accept_public_booking(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_tenant_id uuid;
    v_status text;
    v_onboarding_status text;
    v_public_site_status text;
    v_sub_exists boolean;
    v_sub_status text;
    v_allowed boolean := false;
    v_reason_code text := 'ok';
BEGIN
    -- 1. Resolve tenant details by slug
    SELECT id, status, onboarding_status, public_site_status
    INTO v_tenant_id, v_status, v_onboarding_status, v_public_site_status
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'found', false,
            'allowed', false,
            'reason_code', 'tenant_not_found'
        );
    END IF;

    -- 2. Validate tenant status
    IF v_status IS DISTINCT FROM 'active' AND v_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'tenant_inactive'
        );
    END IF;

    -- 3. Validate onboarding status
    IF v_onboarding_status IS DISTINCT FROM 'completed' THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'onboarding_incomplete'
        );
    END IF;

    -- 4. Validate public site status
    IF v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'site_unpublished'
        );
    END IF;

    -- 5. Query manual active or active subscription status
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions WHERE tenant_id = v_tenant_id
    ) INTO v_sub_exists;

    IF NOT v_sub_exists THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'entitlement_inactive'
        );
    END IF;

    SELECT status INTO v_sub_status
    FROM public.subscriptions
    WHERE tenant_id = v_tenant_id
    LIMIT 1;

    -- Canonical allowed active statuses: 'active', 'manual_active', 'comped', 'trialing'
    IF v_sub_status IS DISTINCT FROM 'active' 
       AND v_sub_status IS DISTINCT FROM 'manual_active' 
       AND v_sub_status IS DISTINCT FROM 'comped' 
       AND v_sub_status IS DISTINCT FROM 'trialing' THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'entitlement_inactive'
        );
    END IF;

    -- 6. All checks passed
    RETURN jsonb_build_object(
        'found', true,
        'allowed', true,
        'reason_code', 'ok'
    );
END;
$$;


-- =========================================================================
-- 3. Explicit Permission Grants
-- =========================================================================
REVOKE EXECUTE ON FUNCTION public.create_public_booking(
    text, uuid, uuid, date, time,
    text, text, text, boolean, boolean, boolean, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_public_booking(
    text, uuid, uuid, date, time,
    text, text, text, boolean, boolean, boolean, text
) TO anon;

GRANT EXECUTE ON FUNCTION public.create_public_booking(
    text, uuid, uuid, date, time,
    text, text, text, boolean, boolean, boolean, text
) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_accept_public_booking(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_accept_public_booking(text) TO anon;

GRANT EXECUTE ON FUNCTION public.can_accept_public_booking(text) TO authenticated;


-- >>> FILE: 20260723_booking_lifecycle_foundation.sql <<<
-- 20260723_booking_lifecycle_foundation.sql
-- Description: Stage A Database Scheduling Foundation & Shared Slot Engine (Hardened)
-- Provisions:
--   1. Candidate keys (id, tenant_id) on staff, services, branches for composite FK cross-tenant database-level constraints.
--   2. public.branches with RLS and composite FK to tenants.
--   3. public.staff_branches & public.service_branches junction tables with composite FK constraints and fail-closed RLS.
--   4. public.appointments composite FK constraints:
--        - (branch_id, tenant_id) REFERENCES public.branches(id, tenant_id)
--        - duration_minutes INTEGER CHECK (duration_minutes IS NULL OR (duration_minutes > 0 AND duration_minutes <= 1440))
--   5. Backfills duration_minutes for existing appointments ONLY where valid service duration exists (leaves unresolved as NULL).
--   6. public.evaluate_booking_slot: Shared, internal SECURITY DEFINER slot evaluator engine with strict fail-closed branch mapping requirement and revoked public execution.
--   7. public.get_public_available_slots & public.create_public_booking RPCs with hardened security, auto branch resolution, and safe returns.

-- =========================================================================
-- 1. UNIQUE CANDIDATE KEYS FOR COMPOSITE FK CROSS-TENANT INTEGRITY
-- =========================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_staff_id_tenant'
    ) THEN
        ALTER TABLE public.staff ADD CONSTRAINT uq_staff_id_tenant UNIQUE (id, tenant_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_services_id_tenant'
    ) THEN
        ALTER TABLE public.services ADD CONSTRAINT uq_services_id_tenant UNIQUE (id, tenant_id);
    END IF;
END $$;


-- =========================================================================
-- 2. CANONICAL BRANCHES TABLE & CONSTRAINTS
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    timezone TEXT DEFAULT 'Europe/Istanbul',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_tenant_branch_slug UNIQUE (tenant_id, slug),
    CONSTRAINT uq_branches_id_tenant UNIQUE (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_branches_tenant_id ON public.branches(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_primary_branch_per_tenant 
ON public.branches (tenant_id) 
WHERE is_primary = true AND is_active = true;

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admins - Full Access on branches" ON public.branches;
DROP POLICY IF EXISTS "Tenant Owner - Manage own branches" ON public.branches;
DROP POLICY IF EXISTS "Tenant Staff - Read own branches" ON public.branches;
DROP POLICY IF EXISTS "Tenant Staff - Read/Write own branches" ON public.branches;
DROP POLICY IF EXISTS "Public - SELECT active branches" ON public.branches;

-- Super Admins: Full access
CREATE POLICY "Super Admins - Full Access on branches" 
ON public.branches FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Tenant Owner: CRUD within own tenant
CREATE POLICY "Tenant Owner - Manage own branches" 
ON public.branches FOR ALL TO authenticated 
USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = branches.tenant_id
    )
)
WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = branches.tenant_id
    )
);

-- Tenant Staff: SELECT only within own tenant
CREATE POLICY "Tenant Staff - Read own branches" 
ON public.branches FOR SELECT TO authenticated 
USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'staff'
        AND up.tenant_id = branches.tenant_id
    )
);


-- =========================================================================
-- 3. BRANCH JUNCTION TABLES WITH COMPOSITE FKs (STAFF & SERVICES)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.staff_branches (
    tenant_id UUID NOT NULL,
    staff_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (staff_id, branch_id),
    CONSTRAINT fk_staff_branches_staff_tenant 
        FOREIGN KEY (staff_id, tenant_id) REFERENCES public.staff(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_staff_branches_branch_tenant 
        FOREIGN KEY (branch_id, tenant_id) REFERENCES public.branches(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_staff_branches_tenant ON public.staff_branches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_branches_branch ON public.staff_branches(branch_id);

ALTER TABLE public.staff_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admins - Full Access on staff_branches" ON public.staff_branches;
DROP POLICY IF EXISTS "Tenant Owner - Manage staff_branches" ON public.staff_branches;
DROP POLICY IF EXISTS "Tenant Staff - Manage staff_branches" ON public.staff_branches;

CREATE POLICY "Super Admins - Full Access on staff_branches" 
ON public.staff_branches FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant Owner - Manage staff_branches" 
ON public.staff_branches FOR ALL TO authenticated 
USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = staff_branches.tenant_id
    )
)
WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = staff_branches.tenant_id
    )
);


CREATE TABLE IF NOT EXISTS public.service_branches (
    tenant_id UUID NOT NULL,
    service_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (service_id, branch_id),
    CONSTRAINT fk_service_branches_service_tenant 
        FOREIGN KEY (service_id, tenant_id) REFERENCES public.services(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_service_branches_branch_tenant 
        FOREIGN KEY (branch_id, tenant_id) REFERENCES public.branches(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_service_branches_tenant ON public.service_branches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_branches_branch ON public.service_branches(branch_id);

ALTER TABLE public.service_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admins - Full Access on service_branches" ON public.service_branches;
DROP POLICY IF EXISTS "Tenant Owner - Manage service_branches" ON public.service_branches;
DROP POLICY IF EXISTS "Tenant Staff - Manage service_branches" ON public.service_branches;

CREATE POLICY "Super Admins - Full Access on service_branches" 
ON public.service_branches FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant Owner - Manage service_branches" 
ON public.service_branches FOR ALL TO authenticated 
USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = service_branches.tenant_id
    )
)
WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = service_branches.tenant_id
    )
);


-- =========================================================================
-- 4. APPOINTMENTS CONTRACT ALTERATIONS & SAFE BACKFILL
-- =========================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'branch_id'
    ) THEN
        ALTER TABLE public.appointments ADD COLUMN branch_id UUID NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_appointments_branch_tenant'
    ) THEN
        ALTER TABLE public.appointments ADD CONSTRAINT fk_appointments_branch_tenant 
            FOREIGN KEY (branch_id, tenant_id) REFERENCES public.branches(id, tenant_id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'duration_minutes'
    ) THEN
        ALTER TABLE public.appointments ADD COLUMN duration_minutes INTEGER NULL;
        ALTER TABLE public.appointments ADD CONSTRAINT chk_appointments_duration_positive 
            CHECK (duration_minutes IS NULL OR (duration_minutes > 0 AND duration_minutes <= 1440));
    END IF;
END $$;

-- Backfill duration_minutes ONLY where a valid service duration exists
UPDATE public.appointments a
SET duration_minutes = s.duration
FROM public.services s
WHERE a.service_id = s.id
  AND s.duration IS NOT NULL
  AND s.duration > 0
  AND a.duration_minutes IS NULL;

-- Unresolved legacy appointments without a matching valid service remain NULL.


-- =========================================================================
-- 5. SHARED INTERNAL SLOT EVALUATOR ENGINE (FAIL-CLOSED MAPPINGS)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.evaluate_booking_slot(
    p_tenant_id                UUID,
    p_branch_id                UUID,
    p_service_id               UUID,
    p_staff_id                 UUID,
    p_date                     DATE,
    p_time                     TIME,
    p_exclude_appointment_id   UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_branch_active        BOOLEAN;
    v_branch_tenant        UUID;
    v_svc_tenant           UUID;
    v_svc_active           BOOLEAN;
    v_svc_duration         INTEGER;
    v_svc_branch_match     BOOLEAN;
    v_staff_tenant         UUID;
    v_staff_active         BOOLEAN;
    v_staff_branch_match   BOOLEAN;
    v_staff_svc_match      BOOLEAN;
    v_weekday              INTEGER;
    v_avail_start          TIME;
    v_avail_end            TIME;
    v_req_start            TIMESTAMP;
    v_req_end              TIMESTAMP;
    v_tz                   TEXT := 'Europe/Istanbul';
    v_now_in_tz            TIMESTAMP;
    v_slot_conflict        BOOLEAN;
BEGIN
    -- 1. Validate Branch
    SELECT tenant_id, is_active, COALESCE(timezone, 'Europe/Istanbul')
    INTO v_branch_tenant, v_branch_active, v_tz
    FROM public.branches
    WHERE id = p_branch_id;

    IF NOT FOUND OR v_branch_tenant IS DISTINCT FROM p_tenant_id OR v_branch_active IS NOT TRUE THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'invalid_branch', 'duration_minutes', 0);
    END IF;

    -- 2. Validate Service
    SELECT tenant_id, active, duration
    INTO v_svc_tenant, v_svc_active, v_svc_duration
    FROM public.services
    WHERE id = p_service_id;

    IF NOT FOUND OR v_svc_tenant IS DISTINCT FROM p_tenant_id OR v_svc_active IS NOT TRUE OR v_svc_duration IS NULL OR v_svc_duration <= 0 THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'invalid_service', 'duration_minutes', 0);
    END IF;

    -- Service-Branch Fail-Closed Check: exact service_branches mapping required
    SELECT EXISTS (
        SELECT 1 FROM public.service_branches 
        WHERE service_id = p_service_id AND branch_id = p_branch_id AND tenant_id = p_tenant_id
    ) INTO v_svc_branch_match;

    IF NOT v_svc_branch_match THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'invalid_service', 'duration_minutes', 0);
    END IF;

    -- 3. Validate Staff
    SELECT tenant_id, active
    INTO v_staff_tenant, v_staff_active
    FROM public.staff
    WHERE id = p_staff_id;

    IF NOT FOUND OR v_staff_tenant IS DISTINCT FROM p_tenant_id OR v_staff_active IS NOT TRUE THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'invalid_staff', 'duration_minutes', 0);
    END IF;

    -- Staff-Branch Fail-Closed Check: exact staff_branches mapping required
    SELECT EXISTS (
        SELECT 1 FROM public.staff_branches 
        WHERE staff_id = p_staff_id AND branch_id = p_branch_id AND tenant_id = p_tenant_id
    ) INTO v_staff_branch_match;

    IF NOT v_staff_branch_match THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'invalid_staff', 'duration_minutes', 0);
    END IF;

    -- 4. Validate Staff-Service Mapping
    SELECT EXISTS (
        SELECT 1 FROM public.staff_services
        WHERE staff_id = p_staff_id AND service_id = p_service_id
    ) INTO v_staff_svc_match;

    IF NOT v_staff_svc_match THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'invalid_staff', 'duration_minutes', 0);
    END IF;

    -- 5. Validate Availability Rules (ISO Weekday: 1=Mon..7=Sun)
    v_weekday := EXTRACT(DOW FROM p_date)::INTEGER;
    IF v_weekday = 0 THEN v_weekday := 7; END IF;

    SELECT start_time, end_time
    INTO v_avail_start, v_avail_end
    FROM public.availability_rules
    WHERE staff_id = p_staff_id
      AND tenant_id = p_tenant_id
      AND weekday = v_weekday
      AND is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'outside_availability', 'duration_minutes', v_svc_duration);
    END IF;

    -- Check window bounds
    v_req_start := p_date + p_time;
    v_req_end   := v_req_start + (v_svc_duration || ' minutes')::INTERVAL;

    IF p_time < v_avail_start OR (p_time + (v_svc_duration || ' minutes')::INTERVAL) > v_avail_end THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'outside_availability', 'duration_minutes', v_svc_duration);
    END IF;

    -- 6. Validate Future Slot (Timezone aware)
    v_now_in_tz := now() AT TIME ZONE v_tz;
    IF v_req_start <= v_now_in_tz THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'slot_in_past', 'duration_minutes', v_svc_duration);
    END IF;

    -- 7. Validate Overlapping Active Appointments
    -- Active slot-occupying statuses: 'confirmed', 'pending'
    -- Non-blocking statuses: 'cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system', 'completed', 'no_show'
    -- Unknown status values fail closed by being treated as active/blocking.
    SELECT EXISTS (
        SELECT 1
        FROM public.appointments a
        WHERE a.staff_id = p_staff_id
          AND a.tenant_id = p_tenant_id
          AND a.appointment_date = p_date
          AND (p_exclude_appointment_id IS NULL OR a.id <> p_exclude_appointment_id)
          AND a.status NOT IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system', 'completed', 'no_show')
          AND (a.appointment_date + a.appointment_time) < v_req_end
          AND ((a.appointment_date + a.appointment_time) + (COALESCE(a.duration_minutes, 30) || ' minutes')::INTERVAL) > v_req_start
    ) INTO v_slot_conflict;

    IF v_slot_conflict THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'slot_conflict', 'duration_minutes', v_svc_duration);
    END IF;

    RETURN jsonb_build_object(
        'allowed', true,
        'reason_code', 'ok',
        'duration_minutes', v_svc_duration,
        'slot_start', p_time::text,
        'slot_end', (p_time + (v_svc_duration || ' minutes')::INTERVAL)::text
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('allowed', false, 'reason_code', 'temporary_failure', 'duration_minutes', 0);
END;
$$;

-- Revoke execution from PUBLIC and anon for internal evaluator engine
REVOKE EXECUTE ON FUNCTION public.evaluate_booking_slot(UUID, UUID, UUID, UUID, DATE, TIME, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.evaluate_booking_slot(UUID, UUID, UUID, UUID, DATE, TIME, UUID) FROM anon;


-- =========================================================================
-- 6. SERVER-AUTHORITATIVE PUBLIC SLOT RPC
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_public_available_slots(
    p_slug         TEXT,
    p_branch_id    UUID DEFAULT NULL,
    p_service_id   UUID DEFAULT NULL,
    p_staff_id     UUID DEFAULT NULL,
    p_date         DATE DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_tenant_id          UUID;
    v_tenant_status      TEXT;
    v_onboarding_status  TEXT;
    v_public_site_status TEXT;
    v_sub_exists         BOOLEAN;
    v_effective_branch   UUID := p_branch_id;
    v_active_branches    UUID[];
    v_svc_duration       INTEGER;
    v_weekday            INTEGER;
    v_avail_start        TIME;
    v_avail_end          TIME;
    v_tz                 TEXT := 'Europe/Istanbul';
    v_now_in_tz          TIMESTAMP;
    v_start_min          INTEGER;
    v_end_min            INTEGER;
    v_slot_min           INTEGER;
    v_slot_time          TIME;
    v_slot_label         TEXT;
    v_slot_end_label     TEXT;
    v_eval_res           JSONB;
    v_slots              JSONB := '[]'::jsonb;
BEGIN
    -- 1. Tenant Resolution & Eligibility
    SELECT id, status, onboarding_status, public_site_status
    INTO v_tenant_id, v_tenant_status, v_onboarding_status, v_public_site_status
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_tenant', 'slots', '[]'::jsonb);
    END IF;

    IF v_tenant_status IS DISTINCT FROM 'active' AND v_tenant_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable', 'slots', '[]'::jsonb);
    END IF;

    IF v_onboarding_status IS DISTINCT FROM 'completed' OR v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable', 'slots', '[]'::jsonb);
    END IF;

    -- 2. Entitlement Check
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions
        WHERE tenant_id = v_tenant_id
          AND status IN ('active', 'manual_active', 'comped', 'trialing')
          AND (current_period_end IS NULL OR current_period_end > now())
    ) INTO v_sub_exists;

    IF NOT v_sub_exists THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable', 'slots', '[]'::jsonb);
    END IF;

    -- 3. Branch Resolution
    SELECT ARRAY(
        SELECT id FROM public.branches
        WHERE tenant_id = v_tenant_id AND is_active = true
        ORDER BY is_primary DESC, created_at ASC
    ) INTO v_active_branches;

    IF v_effective_branch IS NULL THEN
        IF array_length(v_active_branches, 1) = 1 THEN
            v_effective_branch := v_active_branches[1];
        ELSIF array_length(v_active_branches, 1) > 1 THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'branch_required', 'slots', '[]'::jsonb);
        ELSIF array_length(v_active_branches, 1) IS NULL OR array_length(v_active_branches, 1) = 0 THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch', 'slots', '[]'::jsonb);
        END IF;
    ELSE
        IF NOT (v_effective_branch = ANY(v_active_branches)) THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch', 'slots', '[]'::jsonb);
        END IF;
    END IF;

    -- Get branch timezone
    SELECT COALESCE(timezone, 'Europe/Istanbul') INTO v_tz
    FROM public.branches WHERE id = v_effective_branch;

    -- 4. Service Duration & Validation
    SELECT duration INTO v_svc_duration FROM public.services WHERE id = p_service_id AND tenant_id = v_tenant_id AND active = true;
    IF NOT FOUND OR v_svc_duration IS NULL OR v_svc_duration <= 0 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_service', 'slots', '[]'::jsonb);
    END IF;

    -- 5. Staff Availability Window
    v_weekday := EXTRACT(DOW FROM p_date)::INTEGER;
    IF v_weekday = 0 THEN v_weekday := 7; END IF;

    SELECT start_time, end_time INTO v_avail_start, v_avail_end
    FROM public.availability_rules
    WHERE staff_id = p_staff_id AND tenant_id = v_tenant_id AND weekday = v_weekday AND is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'outside_availability',
            'branch_id', v_effective_branch,
            'duration_minutes', v_svc_duration,
            'slots', '[]'::jsonb
        );
    END IF;

    -- 6. Slot Iteration at 15-minute Intervals
    v_start_min := EXTRACT(HOUR FROM v_avail_start)::INTEGER * 60 + EXTRACT(MINUTE FROM v_avail_start)::INTEGER;
    v_end_min   := EXTRACT(HOUR FROM v_avail_end)::INTEGER * 60 + EXTRACT(MINUTE FROM v_avail_end)::INTEGER;

    v_slot_min := v_start_min;
    WHILE v_slot_min <= v_end_min - v_svc_duration LOOP
        v_slot_time := (v_slot_min / 60 * interval '1 hour') + (v_slot_min % 60 * interval '1 minute');

        -- Evaluate candidate slot using shared evaluator
        v_eval_res := public.evaluate_booking_slot(
            p_tenant_id  => v_tenant_id,
            p_branch_id  => v_effective_branch,
            p_service_id => p_service_id,
            p_staff_id   => p_staff_id,
            p_date       => p_date,
            p_time       => v_slot_time
        );

        IF (v_eval_res->>'allowed')::boolean THEN
            v_slot_label     := lpad((v_slot_min / 60)::text, 2, '0') || ':' || lpad((v_slot_min % 60)::text, 2, '0');
            v_slot_end_label := lpad(((v_slot_min + v_svc_duration) / 60)::text, 2, '0') || ':' || lpad(((v_slot_min + v_svc_duration) % 60)::text, 2, '0');

            v_slots := v_slots || jsonb_build_object(
                'start', v_slot_label,
                'end', v_slot_end_label
            );
        END IF;

        v_slot_min := v_slot_min + 15;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'branch_id', v_effective_branch,
        'duration_minutes', v_svc_duration,
        'slots', v_slots
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'temporary_failure', 'slots', '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_available_slots(TEXT, UUID, UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_available_slots(TEXT, UUID, UUID, UUID, DATE) TO anon, authenticated;


-- =========================================================================
-- 7. UPDATED CREATE_PUBLIC_BOOKING RPC (CALLING SHARED EVALUATOR)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.create_public_booking(
    p_slug              text,
    p_service_id        uuid,
    p_staff_id          uuid,
    p_appointment_date  date,
    p_appointment_time  time,
    p_customer_name     text,
    p_customer_email    text,
    p_customer_phone    text,
    p_required_consent  boolean,
    p_marketing_consent boolean DEFAULT false,
    p_reminder_consent  boolean DEFAULT false,
    p_idempotency_key   text    DEFAULT NULL,
    p_branch_id         uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_tenant_id             uuid;
    v_tenant_status         text;
    v_onboarding_status     text;
    v_public_site_status    text;
    v_sub_exists            boolean;
    v_effective_branch      uuid := p_branch_id;
    v_active_branches       uuid[];
    v_eval_res              jsonb;
    v_svc_duration          integer;
    v_customer_id           uuid;
    v_appointment_id        uuid;
    v_token                 text;
    v_token_hash            text;
    v_expires_at            timestamptz;
    v_existing_apt_id       uuid;
    v_lock_key              bigint;
    v_stage                 text := 'init';
BEGIN
    -- Gate 1: Consent
    v_stage := 'consent_validation';
    IF p_required_consent IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'consent_required');
    END IF;

    -- Gate 2: Customer Data
    v_stage := 'customer_data_validation';
    IF p_customer_name IS NULL OR trim(p_customer_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_customer_data');
    END IF;
    IF (p_customer_email IS NULL OR trim(p_customer_email) = '') AND (p_customer_phone IS NULL OR trim(p_customer_phone) = '') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_customer_data');
    END IF;

    -- Gate 3: Tenant Resolution
    v_stage := 'tenant_validation';
    SELECT id, status, onboarding_status, public_site_status
    INTO v_tenant_id, v_tenant_status, v_onboarding_status, v_public_site_status
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_tenant');
    END IF;

    IF v_tenant_status IS DISTINCT FROM 'active' AND v_tenant_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    IF v_onboarding_status IS DISTINCT FROM 'completed' OR v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- Gate 4: Entitlement
    v_stage := 'entitlement_validation';
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions
        WHERE tenant_id = v_tenant_id
          AND status IN ('active', 'manual_active', 'comped', 'trialing')
          AND (current_period_end IS NULL OR current_period_end > now())
    ) INTO v_sub_exists;

    IF NOT v_sub_exists THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- Branch Resolution
    SELECT ARRAY(
        SELECT id FROM public.branches
        WHERE tenant_id = v_tenant_id AND is_active = true
        ORDER BY is_primary DESC, created_at ASC
    ) INTO v_active_branches;

    IF v_effective_branch IS NULL THEN
        IF array_length(v_active_branches, 1) = 1 THEN
            v_effective_branch := v_active_branches[1];
        ELSIF array_length(v_active_branches, 1) > 1 THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'branch_required');
        ELSIF array_length(v_active_branches, 1) IS NULL OR array_length(v_active_branches, 1) = 0 THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch');
        END IF;
    ELSE
        IF NOT (v_effective_branch = ANY(v_active_branches)) THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch');
        END IF;
    END IF;

    -- Gate 5: Concurrency Advisory Lock
    v_stage := 'concurrency_lock';
    v_lock_key := hashtextextended(
        v_tenant_id::text || ':' || p_staff_id::text || ':' || p_appointment_date::text,
        0
    );
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- Gate 6: Idempotency Replay
    v_stage := 'idempotency_replay';
    DELETE FROM public.public_booking_idempotency WHERE expires_at <= now();

    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        SELECT appointment_id INTO v_existing_apt_id
        FROM public.public_booking_idempotency
        WHERE idempotency_key = p_idempotency_key AND tenant_id = v_tenant_id;

        IF FOUND THEN
            UPDATE public.appointment_access_tokens
            SET expires_at = now()
            WHERE appointment_id = v_existing_apt_id AND expires_at > now();

            v_token      := encode(gen_random_bytes(32), 'hex');
            v_token_hash := encode(sha256(v_token::bytea), 'hex');
            v_expires_at := now() + interval '30 days';

            INSERT INTO public.appointment_access_tokens (
                tenant_id, appointment_id, token_hash, expires_at
            ) VALUES (
                v_tenant_id::text, v_existing_apt_id, v_token_hash, v_expires_at
            );

            RETURN jsonb_build_object(
                'success',        true,
                'appointment_id', v_existing_apt_id,
                'manage_token',   v_token,
                'reason_code',    'ok'
            );
        END IF;
    END IF;

    -- Gate 7: Shared Slot Evaluator Engine Execution
    v_stage := 'evaluate_booking_slot';
    v_eval_res := public.evaluate_booking_slot(
        p_tenant_id  => v_tenant_id,
        p_branch_id  => v_effective_branch,
        p_service_id => p_service_id,
        p_staff_id   => p_staff_id,
        p_date       => p_appointment_date,
        p_time       => p_appointment_time
    );

    IF NOT (v_eval_res->>'allowed')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', v_eval_res->>'reason_code');
    END IF;

    v_svc_duration := (v_eval_res->>'duration_minutes')::integer;

    -- Gate 8: Customer Upsert
    v_stage := 'customer_upsert';
    IF p_customer_phone IS NOT NULL AND trim(p_customer_phone) != '' THEN
        SELECT id INTO v_customer_id FROM public.customers
        WHERE tenant_id = v_tenant_id AND phone = p_customer_phone LIMIT 1;
    END IF;

    IF v_customer_id IS NULL AND p_customer_email IS NOT NULL AND trim(p_customer_email) != '' THEN
        SELECT id INTO v_customer_id FROM public.customers
        WHERE tenant_id = v_tenant_id AND email = p_customer_email LIMIT 1;
    END IF;

    IF v_customer_id IS NULL THEN
        INSERT INTO public.customers (tenant_id, name, email, phone)
        VALUES (v_tenant_id, trim(p_customer_name), trim(p_customer_email), trim(p_customer_phone))
        RETURNING id INTO v_customer_id;
    END IF;

    -- Gate 9: Consent Ledger Entries
    v_stage := 'consent_ledger_insert';
    INSERT INTO public.consent_ledger (tenant_id, customer_id, consent_type, is_granted, ip_address)
    VALUES
        (v_tenant_id::text, v_customer_id::text, 'booking_terms', true, 'rpc_public_booking'),
        (v_tenant_id::text, v_customer_id::text, 'marketing', COALESCE(p_marketing_consent, false), 'rpc_public_booking'),
        (v_tenant_id::text, v_customer_id::text, 'reminders', COALESCE(p_reminder_consent, false), 'rpc_public_booking');

    -- Gate 10: Appointment Creation
    v_stage := 'appointment_insert';
    INSERT INTO public.appointments (
        tenant_id, branch_id, customer_id, user_name, user_email, phone,
        service_id, staff_id, appointment_date, appointment_time,
        duration_minutes, status
    ) VALUES (
        v_tenant_id, v_effective_branch, v_customer_id, trim(p_customer_name),
        trim(p_customer_email), trim(p_customer_phone), p_service_id, p_staff_id,
        p_appointment_date, p_appointment_time, v_svc_duration, 'confirmed'
    )
    RETURNING id INTO v_appointment_id;

    -- Gate 11: Manage Token Generation
    v_stage := 'token_generation';
    v_token      := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(sha256(v_token::bytea), 'hex');
    v_expires_at := now() + interval '30 days';

    INSERT INTO public.appointment_access_tokens (
        tenant_id, appointment_id, token_hash, expires_at
    ) VALUES (
        v_tenant_id::text, v_appointment_id, v_token_hash, v_expires_at
    );

    -- Gate 12: Idempotency Record
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        INSERT INTO public.public_booking_idempotency (
            idempotency_key, tenant_id, appointment_id, expires_at
        ) VALUES (
            p_idempotency_key, v_tenant_id, v_appointment_id, now() + interval '24 hours'
        );
    END IF;

    RETURN jsonb_build_object(
        'success',        true,
        'appointment_id', v_appointment_id,
        'manage_token',   v_token,
        'reason_code',    'ok'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'temporary_failure');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text, uuid) TO anon, authenticated;


-- >>> FILE: 20260724_admin_rls_and_read_model_fix.sql <<<
-- 20260724_admin_rls_and_read_model_fix.sql
-- Description: Stage B.1 Fix - RLS Hardening & Authenticated Admin Read Model RPCs
-- 1. Drops the offending customer appointments RLS policy referencing auth.users directly.
-- 2. Implements public.current_user_owns_customer helper (SECURITY DEFINER) querying public.customers only.
-- 3. Replaces Registered Customers RLS policy on public.appointments with current_user_owns_customer.
-- 4. Implements public.current_user_can_access_tenant helper (SECURITY DEFINER) querying public.users_profile only.
-- 5. Implements public.get_my_tenant_appointments(p_branch_id) RPC for server-scoped admin appointment listing.
-- 6. Implements public.get_my_tenant_dashboard_summary() RPC for server-scoped admin dashboard counters.
-- Migration count after this file: 18

-- =========================================================================
-- 1. HELPER FUNCTIONS FOR RLS & IDENTITY
-- =========================================================================

-- Helper to check if current auth.uid() owns the given customer record
CREATE OR REPLACE FUNCTION public.current_user_owns_customer(
    p_customer_id uuid,
    p_tenant_id   uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF p_customer_id IS NULL OR p_tenant_id IS NULL OR auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = p_customer_id
          AND c.tenant_id = p_tenant_id
          AND c.user_profile_id = auth.uid()
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_owns_customer(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_owns_customer(uuid, uuid) TO authenticated;

-- Helper to check if current auth.uid() can access target tenant as owner/staff
CREATE OR REPLACE FUNCTION public.current_user_can_access_tenant(
    p_tenant_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF p_tenant_id IS NULL OR auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND up.role IN ('tenant_owner', 'staff')
          AND up.tenant_id = p_tenant_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_can_access_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_can_access_tenant(uuid) TO authenticated;


-- =========================================================================
-- 2. DROP & REPLACE CUSTOMER APPOINTMENT RLS POLICY
-- =========================================================================

DROP POLICY IF EXISTS "Registered Customers - Read own appointments" ON public.appointments;

CREATE POLICY "Registered Customers - Read own appointments"
ON public.appointments FOR SELECT TO authenticated
USING (
    public.current_user_owns_customer(
        appointments.customer_id,
        appointments.tenant_id
    )
);


-- =========================================================================
-- 3. SERVER-SCOPED ADMIN READ RPCS
-- =========================================================================

-- RPC: get_my_tenant_appointments
-- Returns all appointments for the caller's active tenant (derived server-side from users_profile)
CREATE OR REPLACE FUNCTION public.get_my_tenant_appointments(
    p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_tenant_id uuid;
    v_role      text;
    v_active    boolean;
    v_res       jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized', 'appointments', '[]'::jsonb);
    END IF;

    SELECT tenant_id, role, active
    INTO v_tenant_id, v_role, v_active
    FROM public.users_profile
    WHERE id = v_user_id;

    IF v_tenant_id IS NULL OR v_active IS NOT TRUE OR v_role NOT IN ('tenant_owner', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden', 'appointments', '[]'::jsonb);
    END IF;

    IF p_branch_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id) THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch', 'appointments', '[]'::jsonb);
        END IF;
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', a.id,
            'tenant_id', a.tenant_id,
            'branch_id', a.branch_id,
            'user_id', a.user_id,
            'customer_id', a.customer_id,
            'user_name', a.user_name,
            'user_email', a.user_email,
            'phone', a.phone,
            'service_id', a.service_id,
            'staff_id', a.staff_id,
            'appointment_date', a.appointment_date,
            'appointment_time', a.appointment_time,
            'duration_minutes', a.duration_minutes,
            'status', a.status,
            'notes', a.notes,
            'cancel_reason', a.cancel_reason,
            'cancelled_at', a.cancelled_at,
            'cancelled_by', a.cancelled_by,
            'created_at', a.created_at
        ) ORDER BY a.appointment_date ASC, a.appointment_time ASC
    )
    INTO v_res
    FROM public.appointments a
    WHERE a.tenant_id = v_tenant_id
      AND (p_branch_id IS NULL OR a.branch_id = p_branch_id);

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'tenant_id', v_tenant_id,
        'appointments', COALESCE(v_res, '[]'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_tenant_appointments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_appointments(uuid) TO authenticated;

-- RPC: get_my_tenant_dashboard_summary
-- Computes dashboard summary metrics server-side using Europe/Istanbul timezone
CREATE OR REPLACE FUNCTION public.get_my_tenant_dashboard_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id          uuid := auth.uid();
    v_tenant_id        uuid;
    v_role             text;
    v_active           boolean;
    v_tz               text := 'Europe/Istanbul';
    v_today            date;
    v_total_apts       bigint := 0;
    v_confirmed_today  bigint := 0;
    v_completed_total  bigint := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    SELECT tenant_id, role, active
    INTO v_tenant_id, v_role, v_active
    FROM public.users_profile
    WHERE id = v_user_id;

    IF v_tenant_id IS NULL OR v_active IS NOT TRUE OR v_role NOT IN ('tenant_owner', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    -- Resolve branch timezone if primary exists
    SELECT COALESCE(timezone, 'Europe/Istanbul') INTO v_tz
    FROM public.branches
    WHERE tenant_id = v_tenant_id AND is_primary = true AND is_active = true
    LIMIT 1;
    IF v_tz IS NULL THEN
        v_tz := 'Europe/Istanbul';
    END IF;

    v_today := (timezone(v_tz, now()))::date;

    SELECT COUNT(*) INTO v_total_apts
    FROM public.appointments
    WHERE tenant_id = v_tenant_id;

    SELECT COUNT(*) INTO v_confirmed_today
    FROM public.appointments
    WHERE tenant_id = v_tenant_id
      AND appointment_date = v_today
      AND status = 'confirmed';

    SELECT COUNT(*) INTO v_completed_total
    FROM public.appointments
    WHERE tenant_id = v_tenant_id
      AND status = 'completed';

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'tenant_id', v_tenant_id,
        'today_date', v_today,
        'timezone', v_tz,
        'total_appointments', v_total_apts,
        'confirmed_today', v_confirmed_today,
        'completed_total', v_completed_total
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_tenant_dashboard_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_dashboard_summary() TO authenticated;


-- >>> FILE: 20260725_admin_bootstrap_and_runtime_consistency.sql <<<
-- 20260725_admin_bootstrap_and_runtime_consistency.sql
-- Description: Stage B.2 - Server-scoped admin bootstrap RPC delivering tenant profile,
-- active services, active staff, branches, and subscription summary in one server-side call.
-- Migration count after this file: 19

-- =========================================================================
-- PUBLIC.GET_MY_ADMIN_BOOTSTRAP()
-- Returns the full admin bootstrap payload for the authenticated user.
-- Derives tenant server-side from auth.uid() -> users_profile.
-- Requires active tenant_owner or staff role.
-- Excludes auth.users, JWT, manage tokens, customer PII, payment credentials.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_my_admin_bootstrap()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id          uuid := auth.uid();
    v_profile          record;
    v_tenant           record;
    v_business_profile record;
    v_services         jsonb;
    v_staff            jsonb;
    v_branches         jsonb;
    v_subscription     jsonb;
    v_tz               text := 'Europe/Istanbul';
BEGIN
    -- Reject unauthenticated callers
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    -- Resolve user profile
    SELECT id, tenant_id, role, active
    INTO v_profile
    FROM public.users_profile
    WHERE id = v_user_id;

    IF NOT FOUND OR v_profile.tenant_id IS NULL OR v_profile.active IS NOT TRUE
       OR v_profile.role NOT IN ('tenant_owner', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    -- Load tenant
    SELECT id, name, slug, status, created_at, updated_at,
           verification_status, public_site_status, business_risk_status,
           onboarding_status, category, city, district, phone, address,
           official_business_name, public_display_name
    INTO v_tenant
    FROM public.tenants
    WHERE id = v_profile.tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'tenant_not_found');
    END IF;

    -- Load business profile (may not exist)
    SELECT tenant_id, business_category, city, district, address, phone, whatsapp_number,
           website, instagram_handle, facebook_url,
           logo_url, cover_image_url, is_public_profile_enabled, public_display_name
    INTO v_business_profile
    FROM public.tenant_business_profiles
    WHERE tenant_id = v_profile.tenant_id
    LIMIT 1;

    -- Load active services
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'name_tr', s.name_tr,
            'duration', s.duration,
            'price', s.price,
            'active', s.active,
            'category', s.category
        ) ORDER BY s.name ASC
    )
    INTO v_services
    FROM public.services s
    WHERE s.tenant_id = v_profile.tenant_id AND s.active = true;

    -- Load active staff
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', st.id,
            'name', st.name,
            'title', st.title,
            'active', st.active,
            'is_owner', st.is_owner
        ) ORDER BY st.name ASC
    )
    INTO v_staff
    FROM public.staff st
    WHERE st.tenant_id = v_profile.tenant_id AND st.active = true;

    -- Load active branches
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', b.id,
            'name', b.name,
            'slug', b.slug,
            'is_primary', b.is_primary,
            'is_active', b.is_active,
            'timezone', b.timezone
        ) ORDER BY b.is_primary DESC, b.name ASC
    )
    INTO v_branches
    FROM public.branches b
    WHERE b.tenant_id = v_profile.tenant_id AND b.is_active = true;

    -- Resolve tenant timezone from primary branch
    SELECT COALESCE(timezone, 'Europe/Istanbul') INTO v_tz
    FROM public.branches
    WHERE tenant_id = v_profile.tenant_id AND is_primary = true AND is_active = true
    LIMIT 1;
    IF v_tz IS NULL THEN v_tz := 'Europe/Istanbul'; END IF;

    -- Load subscription summary (safe fields only, no provider secrets)
    SELECT jsonb_build_object(
        'plan_id', sub.plan_id,
        'status', sub.status,
        'billing_source', sub.billing_source,
        'paid_through_date', sub.paid_through_date,
        'trial_end', sub.trial_end,
        'cancel_at_period_end', sub.cancel_at_period_end
    )
    INTO v_subscription
    FROM public.subscriptions sub
    WHERE sub.tenant_id = v_profile.tenant_id
    LIMIT 1;

    -- Return consolidated payload
    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'tenant', jsonb_build_object(
            'id', v_tenant.id,
            'name', v_tenant.name,
            'slug', v_tenant.slug,
            'status', v_tenant.status,
            'verification_status', v_tenant.verification_status,
            'public_site_status', v_tenant.public_site_status,
            'business_risk_status', v_tenant.business_risk_status,
            'onboarding_status', v_tenant.onboarding_status,
            'official_business_name', v_tenant.official_business_name,
            'public_display_name', v_tenant.public_display_name,
            'category', v_tenant.category,
            'city', v_tenant.city,
            'district', v_tenant.district,
            'created_at', v_tenant.created_at
        ),
        'business_profile', CASE
            WHEN v_business_profile.tenant_id IS NOT NULL THEN jsonb_build_object(
                'business_category', v_business_profile.business_category,
                'city', v_business_profile.city,
                'district', v_business_profile.district,
                'address', v_business_profile.address,
                'phone', v_business_profile.phone,
                'whatsapp_number', v_business_profile.whatsapp_number,
                'website', v_business_profile.website,
                'instagram_handle', v_business_profile.instagram_handle,
                'logo_url', v_business_profile.logo_url,
                'cover_image_url', v_business_profile.cover_image_url,
                'is_public_profile_enabled', v_business_profile.is_public_profile_enabled,
                'public_display_name', v_business_profile.public_display_name
            )
            ELSE NULL
        END,
        'services', COALESCE(v_services, '[]'::jsonb),
        'staff', COALESCE(v_staff, '[]'::jsonb),
        'branches', COALESCE(v_branches, '[]'::jsonb),
        'subscription', v_subscription,
        'timezone', v_tz,
        'user_role', v_profile.role
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_admin_bootstrap() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_admin_bootstrap() TO authenticated;


-- >>> FILE: 20260726_admin_rpc_execute_acl_hardening.sql <<<
-- 20260726_admin_rpc_execute_acl_hardening.sql
-- Description: Minimal forward-only EXECUTE ACL hardening for Stage B.1/B.2 admin RPCs & helpers.
-- Revokes EXECUTE privileges from PUBLIC and anon roles, granting EXECUTE strictly to authenticated.

BEGIN;

REVOKE ALL ON FUNCTION public.get_my_admin_bootstrap()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_admin_bootstrap()
TO authenticated;


REVOKE ALL ON FUNCTION public.get_my_tenant_appointments(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_tenant_appointments(uuid)
TO authenticated;


REVOKE ALL ON FUNCTION public.get_my_tenant_dashboard_summary()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_tenant_dashboard_summary()
TO authenticated;


REVOKE ALL ON FUNCTION public.current_user_owns_customer(uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.current_user_owns_customer(uuid, uuid)
TO authenticated;


REVOKE ALL ON FUNCTION public.current_user_can_access_tenant(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.current_user_can_access_tenant(uuid)
TO authenticated;

COMMIT;


-- >>> FILE: 20260727_admin_runtime_schema_contract_fix.sql <<<
-- 20260727_admin_runtime_schema_contract_fix.sql
-- Description: Stage B.2 Repair - Fixes PostgreSQL 42703 runtime errors in admin read model RPCs:
-- 1. get_my_admin_bootstrap(): replaces non-existent website/instagram_handle columns with website_url/instagram_url from public.tenant_business_profiles.
-- 2. get_my_tenant_appointments(uuid): replaces non-existent a.user_id with a.customer_id from public.appointments.
-- Migration count after this file: 21

-- =========================================================================
-- 1. PUBLIC.GET_MY_ADMIN_BOOTSTRAP() REPAIR
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_my_admin_bootstrap()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id          uuid := auth.uid();
    v_profile          record;
    v_tenant           record;
    v_business_profile record;
    v_services         jsonb;
    v_staff            jsonb;
    v_branches         jsonb;
    v_subscription     jsonb;
    v_tz               text := 'Europe/Istanbul';
BEGIN
    -- Reject unauthenticated callers
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    -- Resolve user profile
    SELECT id, tenant_id, role, active
    INTO v_profile
    FROM public.users_profile
    WHERE id = v_user_id;

    IF NOT FOUND OR v_profile.tenant_id IS NULL OR v_profile.active IS NOT TRUE
       OR v_profile.role NOT IN ('tenant_owner', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    -- Load tenant
    SELECT id, name, slug, status, created_at, updated_at,
           verification_status, public_site_status, business_risk_status,
           onboarding_status, category, city, district, phone, address,
           official_business_name, public_display_name
    INTO v_tenant
    FROM public.tenants
    WHERE id = v_profile.tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'tenant_not_found');
    END IF;

    -- Load business profile (may not exist) - using actual canonical columns: website_url, instagram_url
    SELECT tenant_id, business_category, city, district, address, phone, whatsapp_number,
           website_url, instagram_url,
           logo_url, cover_image_url, is_public_profile_enabled, public_display_name
    INTO v_business_profile
    FROM public.tenant_business_profiles
    WHERE tenant_id = v_profile.tenant_id
    LIMIT 1;

    -- Load active services
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'name_tr', s.name_tr,
            'duration', s.duration,
            'price', s.price,
            'active', s.active,
            'category', s.category
        ) ORDER BY s.name ASC
    )
    INTO v_services
    FROM public.services s
    WHERE s.tenant_id = v_profile.tenant_id AND s.active = true;

    -- Load active staff
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', st.id,
            'name', st.name,
            'title', st.title,
            'active', st.active,
            'is_owner', st.is_owner
        ) ORDER BY st.name ASC
    )
    INTO v_staff
    FROM public.staff st
    WHERE st.tenant_id = v_profile.tenant_id AND st.active = true;

    -- Load active branches
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', b.id,
            'name', b.name,
            'slug', b.slug,
            'is_primary', b.is_primary,
            'is_active', b.is_active,
            'timezone', b.timezone
        ) ORDER BY b.is_primary DESC, b.name ASC
    )
    INTO v_branches
    FROM public.branches b
    WHERE b.tenant_id = v_profile.tenant_id AND b.is_active = true;

    -- Resolve tenant timezone from primary branch
    SELECT COALESCE(timezone, 'Europe/Istanbul') INTO v_tz
    FROM public.branches
    WHERE tenant_id = v_profile.tenant_id AND is_primary = true AND is_active = true
    LIMIT 1;
    IF v_tz IS NULL THEN v_tz := 'Europe/Istanbul'; END IF;

    -- Load subscription summary (safe fields only, no provider secrets)
    SELECT jsonb_build_object(
        'plan_id', sub.plan_id,
        'status', sub.status,
        'billing_source', sub.billing_source,
        'paid_through_date', sub.paid_through_date,
        'trial_end', sub.trial_end,
        'cancel_at_period_end', sub.cancel_at_period_end
    )
    INTO v_subscription
    FROM public.subscriptions sub
    WHERE sub.tenant_id = v_profile.tenant_id
    LIMIT 1;

    -- Return consolidated payload
    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'tenant', jsonb_build_object(
            'id', v_tenant.id,
            'name', v_tenant.name,
            'slug', v_tenant.slug,
            'status', v_tenant.status,
            'verification_status', v_tenant.verification_status,
            'public_site_status', v_tenant.public_site_status,
            'business_risk_status', v_tenant.business_risk_status,
            'onboarding_status', v_tenant.onboarding_status,
            'official_business_name', v_tenant.official_business_name,
            'public_display_name', v_tenant.public_display_name,
            'category', v_tenant.category,
            'city', v_tenant.city,
            'district', v_tenant.district,
            'created_at', v_tenant.created_at
        ),
        'business_profile', CASE
            WHEN v_business_profile.tenant_id IS NOT NULL THEN jsonb_build_object(
                'business_category', v_business_profile.business_category,
                'city', v_business_profile.city,
                'district', v_business_profile.district,
                'address', v_business_profile.address,
                'phone', v_business_profile.phone,
                'whatsapp_number', v_business_profile.whatsapp_number,
                'website', v_business_profile.website_url,
                'website_url', v_business_profile.website_url,
                'instagram_handle', v_business_profile.instagram_url,
                'instagram_url', v_business_profile.instagram_url,
                'logo_url', v_business_profile.logo_url,
                'cover_image_url', v_business_profile.cover_image_url,
                'is_public_profile_enabled', v_business_profile.is_public_profile_enabled,
                'public_display_name', v_business_profile.public_display_name
            )
            ELSE NULL
        END,
        'services', COALESCE(v_services, '[]'::jsonb),
        'staff', COALESCE(v_staff, '[]'::jsonb),
        'branches', COALESCE(v_branches, '[]'::jsonb),
        'subscription', v_subscription,
        'timezone', v_tz,
        'user_role', v_profile.role
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_admin_bootstrap() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_admin_bootstrap() TO authenticated;


-- =========================================================================
-- 2. PUBLIC.GET_MY_TENANT_APPOINTMENTS(UUID) REPAIR
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_my_tenant_appointments(
    p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_tenant_id uuid;
    v_role      text;
    v_active    boolean;
    v_res       jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized', 'appointments', '[]'::jsonb);
    END IF;

    SELECT tenant_id, role, active
    INTO v_tenant_id, v_role, v_active
    FROM public.users_profile
    WHERE id = v_user_id;

    IF v_tenant_id IS NULL OR v_active IS NOT TRUE OR v_role NOT IN ('tenant_owner', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden', 'appointments', '[]'::jsonb);
    END IF;

    IF p_branch_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id) THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch', 'appointments', '[]'::jsonb);
        END IF;
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', a.id,
            'tenant_id', a.tenant_id,
            'branch_id', a.branch_id,
            'user_id', a.customer_id,
            'customer_id', a.customer_id,
            'user_name', a.user_name,
            'user_email', a.user_email,
            'phone', a.phone,
            'service_id', a.service_id,
            'staff_id', a.staff_id,
            'appointment_date', a.appointment_date,
            'appointment_time', a.appointment_time,
            'duration_minutes', a.duration_minutes,
            'status', a.status,
            'notes', a.notes,
            'cancel_reason', a.cancel_reason,
            'cancelled_at', a.cancelled_at,
            'cancelled_by', a.cancelled_by,
            'created_at', a.created_at
        ) ORDER BY a.appointment_date ASC, a.appointment_time ASC
    )
    INTO v_res
    FROM public.appointments a
    WHERE a.tenant_id = v_tenant_id
      AND (p_branch_id IS NULL OR a.branch_id = p_branch_id);

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'tenant_id', v_tenant_id,
        'appointments', COALESCE(v_res, '[]'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_tenant_appointments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_appointments(uuid) TO authenticated;


-- >>> FILE: 20260728_admin_rpc_live_schema_reconstruction.sql <<<
-- 20260728_admin_rpc_live_schema_reconstruction.sql
-- Description: Stage B.2 Complete Live-Schema Reconstruction for Admin RPCs:
-- 1. get_my_admin_bootstrap(): Reconstructed strictly from real table columns.
--    - Uses COALESCE(official_business_name, name) for public_display_name.
--    - Uses website_url and instagram_url from tenant_business_profiles.
-- 2. get_my_tenant_appointments(uuid): Reconstructed strictly from real columns on public.appointments.
--    - Maps customer_id to user_id for DTO compatibility.
--    - Omits non-existent cancel_reason, cancelled_at, cancelled_by columns.
-- 3. get_my_tenant_dashboard_summary(): Reconstructed with exact column alignment.
-- Reasserts SECURITY DEFINER, SET search_path = pg_catalog, public, REVOKE FROM PUBLIC/anon, GRANT TO authenticated.
-- Migration count after this file: 22

-- =========================================================================
-- 1. GET_MY_ADMIN_BOOTSTRAP() RECONSTRUCTION
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_my_admin_bootstrap()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id          uuid := auth.uid();
    v_profile          record;
    v_tenant           record;
    v_business_profile record;
    v_services         jsonb;
    v_staff            jsonb;
    v_branches         jsonb;
    v_subscription     jsonb;
    v_tz               text := 'Europe/Istanbul';
BEGIN
    -- Reject unauthenticated callers
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    -- Resolve user profile
    SELECT id, tenant_id, role, active
    INTO v_profile
    FROM public.users_profile
    WHERE id = v_user_id;

    IF NOT FOUND OR v_profile.tenant_id IS NULL OR v_profile.active IS NOT TRUE
       OR v_profile.role NOT IN ('tenant_owner', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    -- Load tenant (only columns that actually exist in public.tenants schema)
    SELECT id, name, slug, status, created_at, updated_at,
           verification_status, public_site_status, business_risk_status,
           onboarding_status, category, city, district, phone, address,
           official_business_name
    INTO v_tenant
    FROM public.tenants
    WHERE id = v_profile.tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'tenant_not_found');
    END IF;

    -- Load business profile (only columns that actually exist in public.tenant_business_profiles schema)
    SELECT tenant_id, business_category, city, district, address, phone, whatsapp_number,
           website_url, instagram_url,
           logo_url, cover_image_url, is_public_profile_enabled
    INTO v_business_profile
    FROM public.tenant_business_profiles
    WHERE tenant_id = v_profile.tenant_id
    LIMIT 1;

    -- Load active services
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'name_tr', s.name_tr,
            'duration', s.duration,
            'price', s.price,
            'active', s.active,
            'category', s.category
        ) ORDER BY s.name ASC
    )
    INTO v_services
    FROM public.services s
    WHERE s.tenant_id = v_profile.tenant_id AND s.active = true;

    -- Load active staff
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', st.id,
            'name', st.name,
            'title', st.title,
            'active', st.active,
            'is_owner', st.is_owner
        ) ORDER BY st.name ASC
    )
    INTO v_staff
    FROM public.staff st
    WHERE st.tenant_id = v_profile.tenant_id AND st.active = true;

    -- Load active branches
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', b.id,
            'name', b.name,
            'slug', b.slug,
            'is_primary', b.is_primary,
            'is_active', b.is_active,
            'timezone', b.timezone
        ) ORDER BY b.is_primary DESC, b.name ASC
    )
    INTO v_branches
    FROM public.branches b
    WHERE b.tenant_id = v_profile.tenant_id AND b.is_active = true;

    -- Resolve tenant timezone from primary branch
    SELECT COALESCE(timezone, 'Europe/Istanbul') INTO v_tz
    FROM public.branches
    WHERE tenant_id = v_profile.tenant_id AND is_primary = true AND is_active = true
    LIMIT 1;
    IF v_tz IS NULL THEN v_tz := 'Europe/Istanbul'; END IF;

    -- Load subscription summary (safe fields only)
    SELECT jsonb_build_object(
        'plan_id', sub.plan_id,
        'status', sub.status,
        'billing_source', sub.billing_source,
        'paid_through_date', sub.paid_through_date,
        'trial_end', sub.trial_end,
        'cancel_at_period_end', sub.cancel_at_period_end
    )
    INTO v_subscription
    FROM public.subscriptions sub
    WHERE sub.tenant_id = v_profile.tenant_id
    LIMIT 1;

    -- Return consolidated payload using canonical fallback for public_display_name
    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'tenant', jsonb_build_object(
            'id', v_tenant.id,
            'name', v_tenant.name,
            'slug', v_tenant.slug,
            'status', v_tenant.status,
            'verification_status', v_tenant.verification_status,
            'public_site_status', v_tenant.public_site_status,
            'business_risk_status', v_tenant.business_risk_status,
            'onboarding_status', v_tenant.onboarding_status,
            'official_business_name', v_tenant.official_business_name,
            'public_display_name', COALESCE(v_tenant.official_business_name, v_tenant.name),
            'category', v_tenant.category,
            'city', v_tenant.city,
            'district', v_tenant.district,
            'created_at', v_tenant.created_at
        ),
        'business_profile', CASE
            WHEN v_business_profile.tenant_id IS NOT NULL THEN jsonb_build_object(
                'business_category', v_business_profile.business_category,
                'city', v_business_profile.city,
                'district', v_business_profile.district,
                'address', v_business_profile.address,
                'phone', v_business_profile.phone,
                'whatsapp_number', v_business_profile.whatsapp_number,
                'website', v_business_profile.website_url,
                'website_url', v_business_profile.website_url,
                'instagram_handle', v_business_profile.instagram_url,
                'instagram_url', v_business_profile.instagram_url,
                'logo_url', v_business_profile.logo_url,
                'cover_image_url', v_business_profile.cover_image_url,
                'is_public_profile_enabled', v_business_profile.is_public_profile_enabled,
                'public_display_name', COALESCE(v_tenant.official_business_name, v_tenant.name)
            )
            ELSE NULL
        END,
        'services', COALESCE(v_services, '[]'::jsonb),
        'staff', COALESCE(v_staff, '[]'::jsonb),
        'branches', COALESCE(v_branches, '[]'::jsonb),
        'subscription', v_subscription,
        'timezone', v_tz,
        'user_role', v_profile.role
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_admin_bootstrap() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_admin_bootstrap() TO authenticated;


-- =========================================================================
-- 2. GET_MY_TENANT_APPOINTMENTS(UUID) RECONSTRUCTION
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_my_tenant_appointments(
    p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_tenant_id uuid;
    v_role      text;
    v_active    boolean;
    v_res       jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized', 'appointments', '[]'::jsonb);
    END IF;

    SELECT tenant_id, role, active
    INTO v_tenant_id, v_role, v_active
    FROM public.users_profile
    WHERE id = v_user_id;

    IF v_tenant_id IS NULL OR v_active IS NOT TRUE OR v_role NOT IN ('tenant_owner', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden', 'appointments', '[]'::jsonb);
    END IF;

    IF p_branch_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id) THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch', 'appointments', '[]'::jsonb);
        END IF;
    END IF;

    -- Select strictly columns that exist in public.appointments schema
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', a.id,
            'tenant_id', a.tenant_id,
            'branch_id', a.branch_id,
            'user_id', a.customer_id,
            'customer_id', a.customer_id,
            'user_name', a.user_name,
            'user_email', a.user_email,
            'phone', a.phone,
            'service_id', a.service_id,
            'staff_id', a.staff_id,
            'appointment_date', a.appointment_date,
            'appointment_time', a.appointment_time,
            'duration_minutes', a.duration_minutes,
            'status', a.status,
            'notes', a.notes,
            'created_at', a.created_at,
            'updated_at', a.updated_at
        ) ORDER BY a.appointment_date ASC, a.appointment_time ASC
    )
    INTO v_res
    FROM public.appointments a
    WHERE a.tenant_id = v_tenant_id
      AND (p_branch_id IS NULL OR a.branch_id = p_branch_id);

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'tenant_id', v_tenant_id,
        'appointments', COALESCE(v_res, '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_tenant_appointments(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_appointments(uuid) TO authenticated;


-- =========================================================================
-- 3. GET_MY_TENANT_DASHBOARD_SUMMARY() RECONSTRUCTION
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_my_tenant_dashboard_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id          uuid := auth.uid();
    v_tenant_id        uuid;
    v_role             text;
    v_active           boolean;
    v_tz               text := 'Europe/Istanbul';
    v_today            date;
    v_total_apts       bigint := 0;
    v_confirmed_today  bigint := 0;
    v_completed_total  bigint := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    SELECT tenant_id, role, active
    INTO v_tenant_id, v_role, v_active
    FROM public.users_profile
    WHERE id = v_user_id;

    IF v_tenant_id IS NULL OR v_active IS NOT TRUE OR v_role NOT IN ('tenant_owner', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    SELECT COALESCE(timezone, 'Europe/Istanbul') INTO v_tz
    FROM public.branches
    WHERE tenant_id = v_tenant_id AND is_primary = true AND is_active = true
    LIMIT 1;
    IF v_tz IS NULL THEN
        v_tz := 'Europe/Istanbul';
    END IF;

    v_today := (timezone(v_tz, now()))::date;

    SELECT COUNT(*) INTO v_total_apts
    FROM public.appointments
    WHERE tenant_id = v_tenant_id;

    SELECT COUNT(*) INTO v_confirmed_today
    FROM public.appointments
    WHERE tenant_id = v_tenant_id
      AND appointment_date = v_today
      AND status = 'confirmed';

    SELECT COUNT(*) INTO v_completed_total
    FROM public.appointments
    WHERE tenant_id = v_tenant_id
      AND status = 'completed';

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'tenant_id', v_tenant_id,
        'today_date', v_today,
        'timezone', v_tz,
        'total_appointments', v_total_apts,
        'confirmed_today', v_confirmed_today,
        'completed_total', v_completed_total
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_tenant_dashboard_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_dashboard_summary() TO authenticated;


-- >>> FILE: 20260729_admin_bootstrap_subscription_contract_fix.sql <<<
-- 20260729_admin_bootstrap_subscription_contract_fix.sql
-- Description: Stage B.2 Correction - Fixes PostgreSQL 42703 column reference in get_my_admin_bootstrap():
-- Replaces non-existent sub.trial_end with canonical sub.trial_ends_at from public.subscriptions table.
-- Maps both 'trial_end' and 'trial_ends_at' in returned JSON payload for backward frontend compatibility.
-- Preserves SECURITY DEFINER, SET search_path = pg_catalog, public, REVOKE FROM PUBLIC/anon, GRANT TO authenticated.
-- Migration count after this file: 23

CREATE OR REPLACE FUNCTION public.get_my_admin_bootstrap()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id          uuid := auth.uid();
    v_profile          record;
    v_tenant           record;
    v_business_profile record;
    v_services         jsonb;
    v_staff            jsonb;
    v_branches         jsonb;
    v_subscription     jsonb;
    v_tz               text := 'Europe/Istanbul';
BEGIN
    -- Reject unauthenticated callers
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    -- Resolve user profile
    SELECT id, tenant_id, role, active
    INTO v_profile
    FROM public.users_profile
    WHERE id = v_user_id;

    IF NOT FOUND OR v_profile.tenant_id IS NULL OR v_profile.active IS NOT TRUE
       OR v_profile.role NOT IN ('tenant_owner', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    -- Load tenant (only columns that actually exist in public.tenants schema)
    SELECT id, name, slug, status, created_at, updated_at,
           verification_status, public_site_status, business_risk_status,
           onboarding_status, category, city, district, phone, address,
           official_business_name
    INTO v_tenant
    FROM public.tenants
    WHERE id = v_profile.tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'tenant_not_found');
    END IF;

    -- Load business profile (only columns that actually exist in public.tenant_business_profiles schema)
    SELECT tenant_id, business_category, city, district, address, phone, whatsapp_number,
           website_url, instagram_url,
           logo_url, cover_image_url, is_public_profile_enabled
    INTO v_business_profile
    FROM public.tenant_business_profiles
    WHERE tenant_id = v_profile.tenant_id
    LIMIT 1;

    -- Load active services
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'name_tr', s.name_tr,
            'duration', s.duration,
            'price', s.price,
            'active', s.active,
            'category', s.category
        ) ORDER BY s.name ASC
    )
    INTO v_services
    FROM public.services s
    WHERE s.tenant_id = v_profile.tenant_id AND s.active = true;

    -- Load active staff
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', st.id,
            'name', st.name,
            'title', st.title,
            'active', st.active,
            'is_owner', st.is_owner
        ) ORDER BY st.name ASC
    )
    INTO v_staff
    FROM public.staff st
    WHERE st.tenant_id = v_profile.tenant_id AND st.active = true;

    -- Load active branches
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', b.id,
            'name', b.name,
            'slug', b.slug,
            'is_primary', b.is_primary,
            'is_active', b.is_active,
            'timezone', b.timezone
        ) ORDER BY b.is_primary DESC, b.name ASC
    )
    INTO v_branches
    FROM public.branches b
    WHERE b.tenant_id = v_profile.tenant_id AND b.is_active = true;

    -- Resolve tenant timezone from primary branch
    SELECT COALESCE(timezone, 'Europe/Istanbul') INTO v_tz
    FROM public.branches
    WHERE tenant_id = v_profile.tenant_id AND is_primary = true AND is_active = true
    LIMIT 1;
    IF v_tz IS NULL THEN v_tz := 'Europe/Istanbul'; END IF;

    -- Load subscription summary (canonical sub.trial_ends_at column reference)
    SELECT jsonb_build_object(
        'plan_id', sub.plan_id,
        'status', sub.status,
        'billing_source', sub.billing_source,
        'paid_through_date', sub.paid_through_date,
        'trial_end', sub.trial_ends_at,
        'trial_ends_at', sub.trial_ends_at,
        'cancel_at_period_end', sub.cancel_at_period_end
    )
    INTO v_subscription
    FROM public.subscriptions sub
    WHERE sub.tenant_id = v_profile.tenant_id
    LIMIT 1;

    -- Return consolidated payload
    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'tenant', jsonb_build_object(
            'id', v_tenant.id,
            'name', v_tenant.name,
            'slug', v_tenant.slug,
            'status', v_tenant.status,
            'verification_status', v_tenant.verification_status,
            'public_site_status', v_tenant.public_site_status,
            'business_risk_status', v_tenant.business_risk_status,
            'onboarding_status', v_tenant.onboarding_status,
            'official_business_name', v_tenant.official_business_name,
            'public_display_name', COALESCE(v_tenant.official_business_name, v_tenant.name),
            'category', v_tenant.category,
            'city', v_tenant.city,
            'district', v_tenant.district,
            'created_at', v_tenant.created_at
        ),
        'business_profile', CASE
            WHEN v_business_profile.tenant_id IS NOT NULL THEN jsonb_build_object(
                'business_category', v_business_profile.business_category,
                'city', v_business_profile.city,
                'district', v_business_profile.district,
                'address', v_business_profile.address,
                'phone', v_business_profile.phone,
                'whatsapp_number', v_business_profile.whatsapp_number,
                'website', v_business_profile.website_url,
                'website_url', v_business_profile.website_url,
                'instagram_handle', v_business_profile.instagram_url,
                'instagram_url', v_business_profile.instagram_url,
                'logo_url', v_business_profile.logo_url,
                'cover_image_url', v_business_profile.cover_image_url,
                'is_public_profile_enabled', v_business_profile.is_public_profile_enabled,
                'public_display_name', COALESCE(v_tenant.official_business_name, v_tenant.name)
            )
            ELSE NULL
        END,
        'services', COALESCE(v_services, '[]'::jsonb),
        'staff', COALESCE(v_staff, '[]'::jsonb),
        'branches', COALESCE(v_branches, '[]'::jsonb),
        'subscription', v_subscription,
        'timezone', v_tz,
        'user_role', v_profile.role
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_admin_bootstrap() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_admin_bootstrap() TO authenticated;


-- >>> FILE: 20260730_self_service_token_read_rpc.sql <<<
-- 20260730_self_service_token_read_rpc.sql
-- Description: Secure Read-Only Appointment Self-Service Contract (Stage C1).
-- Provides public.get_public_appointment_by_manage_token(p_token text) RETURNS jsonb.
-- Hashes the raw token server-side using SHA-256 (encode(sha256(p_token::bytea), 'hex')),
-- matches public.appointment_access_tokens.token_hash, checks expiration (expires_at > now()),
-- and returns sanitized appointment summary with joined service, staff, and branch details.
-- Returns neutral { "success": false, "reason_code": "invalid_token" } for invalid/expired tokens.
-- SECURITY DEFINER, SET search_path = pg_catalog, public, REVOKE FROM PUBLIC, GRANT TO anon, authenticated.
-- Migration count after this file: 24

CREATE OR REPLACE FUNCTION public.get_public_appointment_by_manage_token(
    p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_token_hash        text;
    v_token_record      record;
    v_appointment       record;
    v_service           record;
    v_staff             record;
    v_branch            record;
    v_tenant            record;
BEGIN
    -- -----------------------------------------------------------------------
    -- Step 1: Input hygiene — reject NULL, empty, or non-hex/malformed tokens
    -- -----------------------------------------------------------------------
    IF p_token IS NULL OR length(trim(p_token)) < 32 OR length(trim(p_token)) > 128 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 2: Compute SHA-256 digest matching create_public_booking algorithm
    -- -----------------------------------------------------------------------
    v_token_hash := encode(sha256(trim(p_token)::bytea), 'hex');

    -- -----------------------------------------------------------------------
    -- Step 3: Match appointment_access_tokens record
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, appointment_id, expires_at, used_at
    INTO v_token_record
    FROM public.appointment_access_tokens
    WHERE token_hash = v_token_hash
      AND expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 4: Resolve appointment record
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, branch_id, customer_id, service_id, staff_id,
           user_name, user_email, phone, appointment_date, appointment_time,
           duration_minutes, status, notes
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_token_record.appointment_id
      AND tenant_id::text = v_token_record.tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 5: Join service detail
    -- -----------------------------------------------------------------------
    SELECT id, name, name_tr, duration, price
    INTO v_service
    FROM public.services
    WHERE id = v_appointment.service_id;

    -- -----------------------------------------------------------------------
    -- Step 6: Join staff detail
    -- -----------------------------------------------------------------------
    SELECT id, name, title
    INTO v_staff
    FROM public.staff
    WHERE id = v_appointment.staff_id;

    -- -----------------------------------------------------------------------
    -- Step 7: Join branch & tenant detail
    -- -----------------------------------------------------------------------
    SELECT id, name, timezone
    INTO v_branch
    FROM public.branches
    WHERE id = v_appointment.branch_id;

    SELECT id, name, official_business_name
    INTO v_tenant
    FROM public.tenants
    WHERE id = v_appointment.tenant_id;

    -- -----------------------------------------------------------------------
    -- Step 8: Return sanitized response contract
    -- -----------------------------------------------------------------------
    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'appointment', jsonb_build_object(
            'id', v_appointment.id,
            'status', v_appointment.status,
            'appointment_date', v_appointment.appointment_date,
            'appointment_time', v_appointment.appointment_time,
            'duration_minutes', COALESCE(v_appointment.duration_minutes, v_service.duration, 30),
            'customer_name', v_appointment.user_name,
            'customer_phone', v_appointment.phone,
            'notes', v_appointment.notes,
            'service', CASE WHEN v_service.id IS NOT NULL THEN jsonb_build_object(
                'id', v_service.id,
                'name', v_service.name,
                'name_tr', COALESCE(v_service.name_tr, v_service.name),
                'price', v_service.price
            ) ELSE NULL END,
            'staff', CASE WHEN v_staff.id IS NOT NULL THEN jsonb_build_object(
                'id', v_staff.id,
                'name', v_staff.name,
                'title', v_staff.title
            ) ELSE NULL END,
            'branch', CASE WHEN v_branch.id IS NOT NULL THEN jsonb_build_object(
                'id', v_branch.id,
                'name', v_branch.name,
                'timezone', COALESCE(v_branch.timezone, 'Europe/Istanbul')
            ) ELSE jsonb_build_object(
                'name', COALESCE(v_tenant.official_business_name, v_tenant.name, 'Güzellik Salonu'),
                'timezone', 'Europe/Istanbul'
            ) END
        ),
        'allowed_actions', jsonb_build_object(
            'can_cancel', false,
            'can_reschedule', false
        )
    );

EXCEPTION WHEN OTHERS THEN
    -- Redact all error details: Return neutral invalid_token response, never leak SQLERRM
    RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
END;
$$;

-- ---------------------------------------------------------------------------
-- ACL Permissions Management
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_public_appointment_by_manage_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_appointment_by_manage_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_appointment_by_manage_token(text) TO authenticated;


-- >>> FILE: 20260731_admin_appointment_status_mutation_rpc.sql <<<
-- 20260731_admin_appointment_status_mutation_rpc.sql
-- Stage D1: Server-Scoped Admin Appointment Mutation RPC Contract.
--
-- Provides:
--   1. public.admin_mutation_idempotency table (24h TTL, actor + key scoped, conflict tracking)
--   2. public.admin_update_appointment_status(UUID, TEXT, TEXT, TEXT) → jsonb
--      - SECURITY DEFINER, SET search_path = pg_catalog, public
--      - Authorizes active tenant_owner only (staff returns forbidden until staff scope model is defined)
--      - Row-level FOR UPDATE lock on target appointment
--      - Canonical status-transition validation & contract normalization (previous_status, status, changed)
--      - Idempotency replay & conflict detection (same key + diff target/apt → idempotency_conflict)
--      - Transactional audit_events insert (exactly 1 on real state change)
--      - Transactional communication_outbox insert (exactly 1 queued outbox row on real state change)
--      - Neutral response for cross-tenant / missing appointments (appointment_unavailable)
--      - REVOKE FROM PUBLIC/anon, GRANT TO authenticated
--
-- Migration count after this file: 25

-- =========================================================================
-- 1. ADMIN MUTATION IDEMPOTENCY TABLE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.admin_mutation_idempotency (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key     TEXT NOT NULL,
    actor_id            UUID NOT NULL,
    tenant_id           UUID NOT NULL,
    appointment_id      UUID NOT NULL,
    target_status       TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    result_payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_admin_idempotency_key UNIQUE (idempotency_key, actor_id)
);

ALTER TABLE public.admin_mutation_idempotency ENABLE ROW LEVEL SECURITY;

-- Deny direct REST client access — only accessible inside SECURITY DEFINER functions.
CREATE POLICY "Deny direct access" ON public.admin_mutation_idempotency
    FOR ALL USING (false);


-- =========================================================================
-- 2. ADMIN UPDATE APPOINTMENT STATUS RPC
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_update_appointment_status(
    p_appointment_id  UUID,
    p_new_status      TEXT,
    p_reason          TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id             uuid := auth.uid();
    v_profile             record;
    v_appointment         record;
    v_old_status          text;
    v_target_status       text;
    v_outbox_event_type   text;
    v_outbox_msg          text;
    v_is_terminal         boolean;
    v_result              jsonb;
    v_idemp_rec           record;
    v_request_fingerprint text;
BEGIN
    -- -----------------------------------------------------------------------
    -- Gate 1: Authentication
    -- -----------------------------------------------------------------------
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'unauthenticated'
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 2: Profile Resolution & Authorization
    -- In Stage D1, allow active tenant_owner only.
    -- Staff returns forbidden until staff scope model is defined.
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, role, active, name
    INTO v_profile
    FROM public.users_profile
    WHERE id = v_user_id;

    IF NOT FOUND OR v_profile.tenant_id IS NULL OR v_profile.active IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'forbidden'
        );
    END IF;

    IF v_profile.role <> 'tenant_owner' THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'forbidden'
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 3: Target Status Alias Normalization & Validation
    -- Admin allowed vocabulary: confirmed, completed, no_show, cancelled
    -- (Map legacy 'cancelled_by_salon' to canonical 'cancelled')
    -- -----------------------------------------------------------------------
    IF p_new_status = 'cancelled_by_salon' OR p_new_status = 'cancelled' THEN
        v_target_status := 'cancelled';
    ELSIF p_new_status IN ('confirmed', 'completed', 'no_show') THEN
        v_target_status := p_new_status;
    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_status'
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 4: Idempotency Replay & Conflict Check
    -- Clean expired entries first.
    -- If key exists for actor:
    --   - Same appointment & target status → return cached result
    --   - Different appointment or target status → return idempotency_conflict
    -- -----------------------------------------------------------------------
    DELETE FROM public.admin_mutation_idempotency
    WHERE expires_at <= now();

    v_request_fingerprint := md5(p_appointment_id::text || ':' || v_target_status);

    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        SELECT appointment_id, target_status, request_fingerprint, result_payload
        INTO v_idemp_rec
        FROM public.admin_mutation_idempotency
        WHERE idempotency_key = trim(p_idempotency_key)
          AND actor_id = v_user_id;

        IF FOUND THEN
            IF v_idemp_rec.request_fingerprint = v_request_fingerprint THEN
                RETURN v_idemp_rec.result_payload;
            ELSE
                RETURN jsonb_build_object(
                    'success', false,
                    'reason_code', 'idempotency_conflict'
                );
            END IF;
        END IF;
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 5: Load Appointment with Row-Level Lock (FOR UPDATE)
    -- Neutral response 'appointment_unavailable' for non-existent or cross-tenant
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, branch_id, status, appointment_date, appointment_time,
           duration_minutes, service_id, staff_id, user_name, user_email, phone
    INTO v_appointment
    FROM public.appointments
    WHERE id = p_appointment_id
      AND tenant_id = v_profile.tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'appointment_unavailable'
        );
    END IF;

    -- Normalize old status (treat legacy cancellation aliases as canonical 'cancelled')
    IF v_appointment.status IN ('cancelled', 'cancelled_by_salon', 'cancelled_by_customer', 'cancelled_by_system') THEN
        v_old_status := 'cancelled';
    ELSE
        v_old_status := v_appointment.status;
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 6: Idempotent Same-Status (No-Change) Check
    -- Returns success: true, reason_code: no_change, changed: false
    -- No audit_events or communication_outbox rows inserted.
    -- -----------------------------------------------------------------------
    IF v_old_status = v_target_status THEN
        v_result := jsonb_build_object(
            'success', true,
            'reason_code', 'no_change',
            'appointment_id', p_appointment_id,
            'previous_status', v_old_status,
            'status', v_target_status,
            'changed', false
        );

        IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
            INSERT INTO public.admin_mutation_idempotency (
                idempotency_key, actor_id, tenant_id, appointment_id,
                target_status, request_fingerprint, result_payload, expires_at
            ) VALUES (
                trim(p_idempotency_key), v_user_id, v_profile.tenant_id, p_appointment_id,
                v_target_status, v_request_fingerprint, v_result, now() + interval '24 hours'
            )
            ON CONFLICT (idempotency_key, actor_id) DO NOTHING;
        END IF;

        RETURN v_result;
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 7: Status Transition Validation
    -- Terminal states (completed, no_show, cancelled) are immutable.
    -- Unknown status values fail closed.
    -- -----------------------------------------------------------------------
    v_is_terminal := v_old_status IN ('completed', 'no_show', 'cancelled');

    IF v_is_terminal THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_transition'
        );
    END IF;

    IF v_old_status NOT IN ('confirmed', 'pending') THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_transition'
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 8: Execute Status Mutation
    -- Always store canonical status string: confirmed, completed, no_show, cancelled
    -- -----------------------------------------------------------------------
    UPDATE public.appointments
    SET status = v_target_status,
        updated_at = now()
    WHERE id = p_appointment_id;

    -- -----------------------------------------------------------------------
    -- Gate 9: Transactional Audit Trail
    -- Exactly 1 audit_events row per real status change
    -- -----------------------------------------------------------------------
    INSERT INTO public.audit_events (
        tenant_id, actor_id, actor_role, action,
        resource_type, resource_id, payload
    ) VALUES (
        v_profile.tenant_id::text,
        v_user_id::text,
        v_profile.role,
        'admin_status_' || v_target_status,
        'appointment',
        p_appointment_id::text,
        jsonb_build_object(
            'previous_status', v_old_status,
            'new_status', v_target_status,
            'reason', COALESCE(p_reason, ''),
            'actor_name', COALESCE(v_profile.name, '')
        )
    );

    -- -----------------------------------------------------------------------
    -- Gate 10: Transactional Outbox Event
    -- Exactly 1 queued communication_outbox row per real status change
    -- Supported channels: whatsapp (default), recipient: phone or email or customer_id
    -- -----------------------------------------------------------------------
    IF v_target_status = 'confirmed' THEN
        v_outbox_event_type := 'appointment_confirmed';
        v_outbox_msg := 'Randevunuz onaylandı.';
    ELSIF v_target_status = 'completed' THEN
        v_outbox_event_type := 'appointment_completed';
        v_outbox_msg := 'Randevunuz tamamlandı.';
    ELSIF v_target_status = 'no_show' THEN
        v_outbox_event_type := 'appointment_no_show';
        v_outbox_msg := 'Randevunuza katılım sağlanmadı.';
    ELSIF v_target_status = 'cancelled' THEN
        v_outbox_event_type := 'appointment_cancelled_by_business';
        v_outbox_msg := 'Randevunuz işletme tarafından iptal edildi.';
    END IF;

    INSERT INTO public.communication_outbox (
        tenant_id, recipient, channel, message, status, metadata
    ) VALUES (
        v_profile.tenant_id::text,
        COALESCE(v_appointment.phone, v_appointment.user_email, p_appointment_id::text),
        'whatsapp',
        v_outbox_msg,
        'queued',
        jsonb_build_object(
            'event_type', v_outbox_event_type,
            'appointment_id', p_appointment_id::text,
            'previous_status', v_old_status,
            'target_status', v_target_status
        )
    );

    -- -----------------------------------------------------------------------
    -- Gate 11: Build Canonical Success Contract
    -- -----------------------------------------------------------------------
    v_result := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'appointment_id', p_appointment_id,
        'previous_status', v_old_status,
        'status', v_target_status,
        'changed', true
    );

    -- -----------------------------------------------------------------------
    -- Gate 12: Record Idempotency Entry
    -- -----------------------------------------------------------------------
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        INSERT INTO public.admin_mutation_idempotency (
            idempotency_key, actor_id, tenant_id, appointment_id,
            target_status, request_fingerprint, result_payload, expires_at
        ) VALUES (
            trim(p_idempotency_key), v_user_id, v_profile.tenant_id, p_appointment_id,
            v_target_status, v_request_fingerprint, v_result, now() + interval '24 hours'
        )
        ON CONFLICT (idempotency_key, actor_id) DO NOTHING;
    END IF;

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    -- Redact all error details: Return neutral service_error, never leak SQLERRM/SQLSTATE
    RETURN jsonb_build_object(
        'success', false,
        'reason_code', 'service_error'
    );
END;
$$;

-- =========================================================================
-- 3. ACL PERMISSIONS
-- =========================================================================
REVOKE ALL ON FUNCTION public.admin_update_appointment_status(UUID, TEXT, TEXT, TEXT)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_update_appointment_status(UUID, TEXT, TEXT, TEXT)
TO authenticated;


-- >>> FILE: 20260801_cancel_public_appointment_by_manage_token_rpc.sql <<<
-- 20260801_cancel_public_appointment_by_manage_token_rpc.sql
-- Description: Secure Customer Appointment Cancellation via Manage Token (Stage E1).
-- Provides public.cancel_public_appointment_by_manage_token(p_token text, p_reason text DEFAULT NULL) RETURNS jsonb.
-- SECURITY DEFINER, SET search_path = pg_catalog, public.
-- Hashes raw token using SHA-256 (encode(sha256(trim(p_token)::bytea), 'hex')).
-- Locks appointment row with SELECT FOR UPDATE.
-- Transitions confirmed -> cancelled_by_customer.
-- Replays cancelled_by_customer -> cancelled_by_customer as no_change (idempotent retry).
-- Returns invalid_transition for completed/no_show/cancelled/cancelled_by_salon/cancelled_by_system.
-- Inserts audit_events and communication_outbox entries transactionally on real mutation (changed=true).
-- Migration count after this file: 26

CREATE OR REPLACE FUNCTION public.cancel_public_appointment_by_manage_token(
    p_token  text,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_token_hash        text;
    v_token_record      record;
    v_appointment       record;
    v_trimmed_reason    text;
BEGIN
    -- -----------------------------------------------------------------------
    -- Step 1: Input hygiene — reject NULL, empty, or out-of-range tokens
    -- -----------------------------------------------------------------------
    IF p_token IS NULL OR length(trim(p_token)) < 32 OR length(trim(p_token)) > 128 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    v_trimmed_reason := NULLIF(trim(p_reason), '');

    -- -----------------------------------------------------------------------
    -- Step 2: Compute SHA-256 digest matching canonical token creation
    -- -----------------------------------------------------------------------
    v_token_hash := encode(sha256(trim(p_token)::bytea), 'hex');

    -- -----------------------------------------------------------------------
    -- Step 3: Match appointment_access_tokens record (must not be expired)
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, appointment_id, expires_at, used_at
    INTO v_token_record
    FROM public.appointment_access_tokens
    WHERE token_hash = v_token_hash
      AND expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 4: Lock appointment row with SELECT FOR UPDATE
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, branch_id, customer_id, service_id, staff_id,
           user_name, user_email, phone, appointment_date, appointment_time,
           duration_minutes, status, notes
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_token_record.appointment_id
      AND tenant_id::text = v_token_record.tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 5: Transition State Machine
    -- -----------------------------------------------------------------------

    -- A. Idempotent Replay — Already cancelled by customer
    IF v_appointment.status = 'cancelled_by_customer' THEN
        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'no_change',
            'changed', false,
            'appointment_id', v_appointment.id,
            'previous_status', 'cancelled_by_customer',
            'status', 'cancelled_by_customer'
        );
    END IF;

    -- B. Terminal / Invalid Transitions
    IF v_appointment.status IN ('completed', 'no_show', 'cancelled', 'cancelled_by_salon', 'cancelled_by_system') THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_transition',
            'appointment_id', v_appointment.id,
            'status', v_appointment.status
        );
    END IF;

    -- C. Valid Mutation — confirmed -> cancelled_by_customer
    IF v_appointment.status = 'confirmed' THEN
        UPDATE public.appointments
        SET status = 'cancelled_by_customer',
            cancel_reason = COALESCE(v_trimmed_reason, cancel_reason),
            cancelled_at = now(),
            cancelled_by = 'customer',
            updated_at = now()
        WHERE id = v_appointment.id;

        -- Transactional Audit Log
        INSERT INTO public.audit_events (
            tenant_id,
            actor_type,
            category,
            severity,
            action,
            entity_type,
            entity_id,
            summary,
            safe_details
        ) VALUES (
            v_appointment.tenant_id,
            'customer_token',
            'booking',
            'info',
            'appointment_cancelled_by_customer',
            'Appointment',
            v_appointment.id::text,
            'Randevu müşteri tarafından iptal edildi (Manage Token)',
            jsonb_build_object(
                'appointmentId', v_appointment.id,
                'previous_status', 'confirmed',
                'status', 'cancelled_by_customer',
                'cancelReason', v_trimmed_reason
            )
        );

        -- Transactional Communication Outbox Event
        INSERT INTO public.communication_outbox (
            tenant_id,
            event_type,
            recipient_email,
            recipient_phone,
            metadata
        ) VALUES (
            v_appointment.tenant_id,
            'appointment_cancelled_by_customer',
            v_appointment.user_email,
            v_appointment.phone,
            jsonb_build_object(
                'appointment_id', v_appointment.id,
                'appointment_date', v_appointment.appointment_date,
                'appointment_time', v_appointment.appointment_time,
                'status', 'cancelled_by_customer',
                'cancelled_by', 'customer',
                'cancel_reason', v_trimmed_reason
            )
        );

        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'ok',
            'changed', true,
            'appointment_id', v_appointment.id,
            'previous_status', 'confirmed',
            'status', 'cancelled_by_customer'
        );
    END IF;

    -- Fail-closed fallback for any unhandled state
    RETURN jsonb_build_object(
        'success', false,
        'reason_code', 'invalid_transition',
        'appointment_id', v_appointment.id,
        'status', v_appointment.status
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- ACL Privileges
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.cancel_public_appointment_by_manage_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_public_appointment_by_manage_token(text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.cancel_public_appointment_by_manage_token(text, text) IS
'Stage E1: Securely cancels a confirmed appointment using a valid manage access token. Enforces SECURITY DEFINER search_path, server-side token hashing, row locking, audit logging, and communication outbox insertion. Replays cancelled_by_customer as no_change.';


-- >>> FILE: 20260802_cancel_public_appointment_by_manage_token_schema_fix.sql <<<
-- 20260802_cancel_public_appointment_by_manage_token_schema_fix.sql
-- Description: Forward Fix for public.cancel_public_appointment_by_manage_token RPC (Stage E1).
-- Omits non-existent appointment table columns (cancel_reason, cancelled_at, cancelled_by).
-- Preserves status = 'cancelled_by_customer' and updated_at = now() on public.appointments.
-- Preserves full transactional logging of p_reason in audit_events and communication_outbox.
-- SECURITY DEFINER, SET search_path = pg_catalog, public.
-- REVOKE FROM PUBLIC, GRANT TO anon, authenticated.
-- Migration count after this file: 27

CREATE OR REPLACE FUNCTION public.cancel_public_appointment_by_manage_token(
    p_token  text,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_token_hash        text;
    v_token_record      record;
    v_appointment       record;
    v_trimmed_reason    text;
BEGIN
    -- -----------------------------------------------------------------------
    -- Step 1: Input hygiene — reject NULL, empty, or out-of-range tokens
    -- -----------------------------------------------------------------------
    IF p_token IS NULL OR length(trim(p_token)) < 32 OR length(trim(p_token)) > 128 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    v_trimmed_reason := NULLIF(trim(p_reason), '');

    -- -----------------------------------------------------------------------
    -- Step 2: Compute SHA-256 digest matching canonical token creation
    -- -----------------------------------------------------------------------
    v_token_hash := encode(sha256(trim(p_token)::bytea), 'hex');

    -- -----------------------------------------------------------------------
    -- Step 3: Match appointment_access_tokens record (must not be expired)
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, appointment_id, expires_at, used_at
    INTO v_token_record
    FROM public.appointment_access_tokens
    WHERE token_hash = v_token_hash
      AND expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 4: Lock appointment row with SELECT FOR UPDATE
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, branch_id, customer_id, service_id, staff_id,
           user_name, user_email, phone, appointment_date, appointment_time,
           duration_minutes, status, notes
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_token_record.appointment_id
      AND tenant_id::text = v_token_record.tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 5: Transition State Machine
    -- -----------------------------------------------------------------------

    -- A. Idempotent Replay — Already cancelled by customer
    IF v_appointment.status = 'cancelled_by_customer' THEN
        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'no_change',
            'changed', false,
            'appointment_id', v_appointment.id,
            'previous_status', 'cancelled_by_customer',
            'status', 'cancelled_by_customer'
        );
    END IF;

    -- B. Terminal / Invalid Transitions
    IF v_appointment.status IN ('completed', 'no_show', 'cancelled', 'cancelled_by_salon', 'cancelled_by_system') THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_transition',
            'appointment_id', v_appointment.id,
            'status', v_appointment.status
        );
    END IF;

    -- C. Valid Mutation — confirmed -> cancelled_by_customer
    IF v_appointment.status = 'confirmed' THEN
        UPDATE public.appointments
        SET status = 'cancelled_by_customer',
            updated_at = now()
        WHERE id = v_appointment.id;

        -- Transactional Audit Log
        INSERT INTO public.audit_events (
            tenant_id,
            actor_type,
            category,
            severity,
            action,
            entity_type,
            entity_id,
            summary,
            safe_details
        ) VALUES (
            v_appointment.tenant_id,
            'customer_token',
            'booking',
            'info',
            'appointment_cancelled_by_customer',
            'Appointment',
            v_appointment.id::text,
            'Randevu müşteri tarafından iptal edildi (Manage Token)',
            jsonb_build_object(
                'appointmentId', v_appointment.id,
                'previous_status', 'confirmed',
                'status', 'cancelled_by_customer',
                'cancelReason', v_trimmed_reason
            )
        );

        -- Transactional Communication Outbox Event
        INSERT INTO public.communication_outbox (
            tenant_id,
            event_type,
            recipient_email,
            recipient_phone,
            metadata
        ) VALUES (
            v_appointment.tenant_id,
            'appointment_cancelled_by_customer',
            v_appointment.user_email,
            v_appointment.phone,
            jsonb_build_object(
                'appointment_id', v_appointment.id,
                'appointment_date', v_appointment.appointment_date,
                'appointment_time', v_appointment.appointment_time,
                'status', 'cancelled_by_customer',
                'cancelled_by', 'customer',
                'cancel_reason', v_trimmed_reason
            )
        );

        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'ok',
            'changed', true,
            'appointment_id', v_appointment.id,
            'previous_status', 'confirmed',
            'status', 'cancelled_by_customer'
        );
    END IF;

    -- Fail-closed fallback for any unhandled state
    RETURN jsonb_build_object(
        'success', false,
        'reason_code', 'invalid_transition',
        'appointment_id', v_appointment.id,
        'status', v_appointment.status
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- ACL Privileges
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.cancel_public_appointment_by_manage_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_public_appointment_by_manage_token(text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.cancel_public_appointment_by_manage_token(text, text) IS
'Stage E1 Correction: Updates status to cancelled_by_customer without referencing non-existent columns. Enforces SECURITY DEFINER search_path, server-side token hashing, row locking, audit logging, and outbox insertion.';


-- >>> FILE: 20260803_cancel_public_appointment_by_manage_token_audit_outbox_fix.sql <<<
-- 20260803_cancel_public_appointment_by_manage_token_audit_outbox_fix.sql
-- Description: Forward Fix for cancel_public_appointment_by_manage_token RPC audit & outbox column schema (Stage E1).
-- Aligns audit_events column names (tenant_id, actor_id, actor_role, action, resource_type, resource_id, payload)
-- and communication_outbox column names (tenant_id, recipient, channel, message, status, metadata) with canonical schema.
-- SECURITY DEFINER, SET search_path = pg_catalog, public.
-- REVOKE FROM PUBLIC, GRANT TO anon, authenticated.
-- Migration count after this file: 28

CREATE OR REPLACE FUNCTION public.cancel_public_appointment_by_manage_token(
    p_token  text,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_token_hash        text;
    v_token_record      record;
    v_appointment       record;
    v_trimmed_reason    text;
BEGIN
    -- -----------------------------------------------------------------------
    -- Step 1: Input hygiene — reject NULL, empty, or out-of-range tokens
    -- -----------------------------------------------------------------------
    IF p_token IS NULL OR length(trim(p_token)) < 32 OR length(trim(p_token)) > 128 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    v_trimmed_reason := NULLIF(trim(p_reason), '');

    -- -----------------------------------------------------------------------
    -- Step 2: Compute SHA-256 digest matching canonical token creation
    -- -----------------------------------------------------------------------
    v_token_hash := encode(sha256(trim(p_token)::bytea), 'hex');

    -- -----------------------------------------------------------------------
    -- Step 3: Match appointment_access_tokens record (must not be expired)
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, appointment_id, expires_at, used_at
    INTO v_token_record
    FROM public.appointment_access_tokens
    WHERE token_hash = v_token_hash
      AND expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 4: Lock appointment row with SELECT FOR UPDATE
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, branch_id, customer_id, service_id, staff_id,
           user_name, user_email, phone, appointment_date, appointment_time,
           duration_minutes, status, notes
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_token_record.appointment_id
      AND tenant_id::text = v_token_record.tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 5: Transition State Machine
    -- -----------------------------------------------------------------------

    -- A. Idempotent Replay — Already cancelled by customer
    IF v_appointment.status = 'cancelled_by_customer' THEN
        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'no_change',
            'changed', false,
            'appointment_id', v_appointment.id,
            'previous_status', 'cancelled_by_customer',
            'status', 'cancelled_by_customer'
        );
    END IF;

    -- B. Terminal / Invalid Transitions
    IF v_appointment.status IN ('completed', 'no_show', 'cancelled', 'cancelled_by_salon', 'cancelled_by_system') THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_transition',
            'appointment_id', v_appointment.id,
            'status', v_appointment.status
        );
    END IF;

    -- C. Valid Mutation — confirmed -> cancelled_by_customer
    IF v_appointment.status = 'confirmed' THEN
        UPDATE public.appointments
        SET status = 'cancelled_by_customer',
            updated_at = now()
        WHERE id = v_appointment.id;

        -- Transactional Audit Log
        INSERT INTO public.audit_events (
            tenant_id,
            actor_id,
            actor_role,
            action,
            resource_type,
            resource_id,
            payload
        ) VALUES (
            v_appointment.tenant_id::text,
            'customer_token',
            'customer',
            'appointment_cancelled_by_customer',
            'appointment',
            v_appointment.id::text,
            jsonb_build_object(
                'appointment_id', v_appointment.id,
                'previous_status', 'confirmed',
                'status', 'cancelled_by_customer',
                'cancel_reason', v_trimmed_reason
            )
        );

        -- Transactional Communication Outbox Event
        INSERT INTO public.communication_outbox (
            tenant_id,
            recipient,
            channel,
            message,
            status,
            metadata
        ) VALUES (
            v_appointment.tenant_id::text,
            COALESCE(v_appointment.phone, v_appointment.user_email, v_appointment.id::text),
            'whatsapp',
            'Randevunuz iptal edildi.',
            'queued',
            jsonb_build_object(
                'appointment_id', v_appointment.id,
                'appointment_date', v_appointment.appointment_date,
                'appointment_time', v_appointment.appointment_time,
                'status', 'cancelled_by_customer',
                'cancelled_by', 'customer',
                'cancel_reason', v_trimmed_reason
            )
        );

        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'ok',
            'changed', true,
            'appointment_id', v_appointment.id,
            'previous_status', 'confirmed',
            'status', 'cancelled_by_customer'
        );
    END IF;

    -- Fail-closed fallback for any unhandled state
    RETURN jsonb_build_object(
        'success', false,
        'reason_code', 'invalid_transition',
        'appointment_id', v_appointment.id,
        'status', v_appointment.status
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- ACL Privileges
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.cancel_public_appointment_by_manage_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_public_appointment_by_manage_token(text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.cancel_public_appointment_by_manage_token(text, text) IS
'Stage E1 Correction: Aligns audit_events and communication_outbox column names with canonical schema. Enforces SECURITY DEFINER search_path, server-side token hashing, row locking, audit logging, and outbox insertion.';


-- >>> FILE: 20260804_appointments_direct_update_hardening.sql <<<
-- Migration 29: Appointments Direct-Write Database Policy Hardening (Stage D2B)
-- File: supabase/migrations/20260804_appointments_direct_update_hardening.sql
--
-- PURPOSE:
-- Enforces strict database-level hardening on public.appointments table.
-- Revokes broad direct UPDATE privileges from browser roles (anon, authenticated, PUBLIC).
-- Removes obsolete direct UPDATE RLS policies on public.appointments.
-- Ensures all status mutations MUST route through accepted SECURITY DEFINER RPCs:
--   1. public.admin_update_appointment_status
--   2. public.cancel_public_appointment_by_manage_token
--
-- COMPATIBILITY:
-- SECURITY DEFINER RPCs owned by postgres run with owner privileges and remain 100% functional.
-- SELECT and INSERT policies required for reading dashboard and public booking remain intact.

BEGIN;

-- 1. Explicitly REVOKE direct table UPDATE privileges from browser roles
REVOKE UPDATE ON public.appointments FROM PUBLIC;
REVOKE UPDATE ON public.appointments FROM anon;
REVOKE UPDATE ON public.appointments FROM authenticated;

-- 2. Explicitly REVOKE column-level UPDATE privileges if any exist
REVOKE UPDATE (
  id, tenant_id, branch_id, customer_id, service_id, staff_id,
  user_name, user_email, phone, appointment_date, appointment_time,
  duration_minutes, status, notes, created_at, updated_at
) ON public.appointments FROM PUBLIC, anon, authenticated;

-- 3. Drop obsolete direct UPDATE RLS policies on public.appointments if present
DROP POLICY IF EXISTS "tenant_isolation_appointments_update" ON public.appointments;
DROP POLICY IF EXISTS "tenant_isolation_appointments_update_policy" ON public.appointments;
DROP POLICY IF EXISTS "appointments_update_policy" ON public.appointments;
DROP POLICY IF EXISTS "authenticated_appointments_update" ON public.appointments;
DROP POLICY IF EXISTS "anon_appointments_update" ON public.appointments;
DROP POLICY IF EXISTS "allow_tenant_owner_update_appointments" ON public.appointments;

-- 4. Preserve existing SELECT and INSERT policies, ensuring RLS remains ENABLED
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

COMMIT;


-- >>> FILE: 20260805_request_public_appointment_reschedule_by_manage_token_rpc.sql <<<
-- Migration 30: Stage F1 Secure Customer Appointment Rescheduling Request RPC
-- File: supabase/migrations/20260805_request_public_appointment_reschedule_by_manage_token_rpc.sql
--
-- PURPOSE:
-- Implements public.request_public_appointment_reschedule_by_manage_token SECURITY DEFINER RPC.
-- Supports the approval-based customer reschedule-request workflow:
--   1. Validates manage token via SHA-256 server-side digest lookup on public.appointment_access_tokens.
--   2. Locks target appointment FOR UPDATE.
--   3. Validates status eligibility (only 'confirmed' appointments may request reschedule).
--   4. Validates requested date/time against slots and business hours.
--   5. Checks idempotency and duplicate request protection.
--   6. Inserts server-owned change-request record into public.appointment_change_requests with status = 'pending'.
--   7. Inserts audit log and communication outbox events transactionally.
--   8. Returns stable JSON response contract without exposing raw tokens or PII.

BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_reschedule_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL UNIQUE,
    requested_date DATE NOT NULL,
    requested_time TEXT NOT NULL,
    response_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.customer_reschedule_idempotency ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.customer_reschedule_idempotency FROM PUBLIC;
REVOKE ALL ON public.customer_reschedule_idempotency FROM anon;
REVOKE ALL ON public.customer_reschedule_idempotency FROM authenticated;

CREATE OR REPLACE FUNCTION public.request_public_appointment_reschedule_by_manage_token(
    p_token text,
    p_requested_date date,
    p_requested_time text,
    p_reason text DEFAULT NULL,
    p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_trimmed_token text;
    v_token_hash text;
    v_token_record record;
    v_appointment record;
    v_trimmed_reason text;
    v_trimmed_time text;
    v_trimmed_key text;
    v_existing_idem record;
    v_existing_req record;
    v_overlap_count integer;
    v_request_id uuid;
    v_response jsonb;
BEGIN
    -- -----------------------------------------------------------------------
    -- Step 1: Input Validation
    -- -----------------------------------------------------------------------
    IF p_token IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    v_trimmed_token := trim(p_token);
    IF length(v_trimmed_token) < 32 OR length(v_trimmed_token) > 128 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    IF p_requested_date IS NULL OR p_requested_date < current_date THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_date');
    END IF;

    IF p_requested_time IS NULL OR trim(p_requested_time) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_time');
    END IF;

    v_trimmed_time := trim(p_requested_time);
    IF v_trimmed_time !~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_time');
    END IF;

    v_trimmed_reason := NULLIF(trim(p_reason), '');
    v_trimmed_key := NULLIF(trim(p_idempotency_key), '');

    -- -----------------------------------------------------------------------
    -- Step 2: Compute SHA-256 digest matching canonical token creation
    -- -----------------------------------------------------------------------
    v_token_hash := encode(sha256(v_trimmed_token::bytea), 'hex');

    -- -----------------------------------------------------------------------
    -- Step 3: Match appointment_access_tokens record
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, appointment_id, expires_at, used_at
    INTO v_token_record
    FROM public.appointment_access_tokens
    WHERE token_hash = v_token_hash
      AND expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 4: Lock appointment row FOR UPDATE
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, branch_id, customer_id, service_id, staff_id,
           user_name, user_email, phone, appointment_date, appointment_time,
           duration_minutes, status, notes
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_token_record.appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 5: Transition and Eligibility Check
    -- -----------------------------------------------------------------------
    IF v_appointment.status != 'confirmed' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_transition');
    END IF;

    -- Same slot check
    IF v_appointment.appointment_date = p_requested_date AND v_appointment.appointment_time::text = v_trimmed_time THEN
        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'no_change',
            'changed', false,
            'appointment_id', v_appointment.id,
            'appointment_date', v_appointment.appointment_date,
            'appointment_time', v_appointment.appointment_time
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 6: Idempotency & Active Request Replay Check
    -- -----------------------------------------------------------------------
    IF v_trimmed_key IS NOT NULL THEN
        SELECT requested_date, requested_time, response_payload
        INTO v_existing_idem
        FROM public.customer_reschedule_idempotency
        WHERE idempotency_key = v_trimmed_key;

        IF FOUND THEN
            IF v_existing_idem.requested_date = p_requested_date AND v_existing_idem.requested_time = v_trimmed_time THEN
                RETURN v_existing_idem.response_payload;
            ELSE
                RETURN jsonb_build_object('success', false, 'reason_code', 'idempotency_conflict');
            END IF;
        END IF;
    END IF;

    -- Check duplicate pending request
    SELECT id INTO v_existing_req
    FROM public.appointment_change_requests
    WHERE appointment_id = v_appointment.id
      AND request_type = 'reschedule'
      AND status IN ('pending', 'requested')
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'no_change',
            'changed', false,
            'appointment_id', v_appointment.id,
            'change_request_id', v_existing_req.id
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 7: Slot Overlap Check
    -- -----------------------------------------------------------------------
    SELECT COUNT(*) INTO v_overlap_count
    FROM public.appointments
    WHERE staff_id = v_appointment.staff_id
      AND appointment_date = p_requested_date
      AND appointment_time = v_trimmed_time
      AND id != v_appointment.id
      AND status IN ('confirmed', 'completed');

    IF v_overlap_count > 0 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'slot_unavailable');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 8: Transactional Mutation — Insert Change Request Record
    -- -----------------------------------------------------------------------
    INSERT INTO public.appointment_change_requests (
        tenant_id,
        appointment_id,
        request_type,
        requested_by,
        proposed_date,
        proposed_time,
        reason,
        status,
        created_at
    ) VALUES (
        v_appointment.tenant_id,
        v_appointment.id,
        'reschedule',
        'customer',
        p_requested_date,
        v_trimmed_time,
        v_trimmed_reason,
        'pending',
        now()
    ) RETURNING id INTO v_request_id;

    -- Build Success Response Payload
    v_response := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'changed', true,
        'appointment_id', v_appointment.id,
        'change_request_id', v_request_id,
        'proposed_date', p_requested_date,
        'proposed_time', v_trimmed_time,
        'status', 'confirmed'
    );

    -- Record Idempotency Key
    IF v_trimmed_key IS NOT NULL THEN
        INSERT INTO public.customer_reschedule_idempotency (
            appointment_id, idempotency_key, requested_date, requested_time, response_payload
        ) VALUES (
            v_appointment.id, v_trimmed_key, p_requested_date, v_trimmed_time, v_response
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 9: Transactional Side Effects (Audit Event & Communication Outbox)
    -- -----------------------------------------------------------------------
    INSERT INTO public.audit_events (
        tenant_id, actor_id, actor_role, action, resource_type, resource_id, payload, created_at
    ) VALUES (
        v_appointment.tenant_id,
        NULL,
        'customer_token',
        'appointment_reschedule_requested',
        'appointment',
        v_appointment.id,
        jsonb_build_object(
            'change_request_id', v_request_id,
            'proposed_date', p_requested_date,
            'proposed_time', v_trimmed_time
        ),
        now()
    );

    IF v_appointment.phone IS NOT NULL AND trim(v_appointment.phone) != '' THEN
        INSERT INTO public.communication_outbox (
            tenant_id, recipient, channel, message, status, metadata, created_at, updated_at
        ) VALUES (
            v_appointment.tenant_id,
            v_appointment.phone,
            'whatsapp',
            'Randevu değişiklik talebiniz alındı.',
            'queued',
            jsonb_build_object(
                'event_type', 'cancellation_request_created',
                'appointment_id', v_appointment.id,
                'proposed_date', p_requested_date,
                'proposed_time', v_trimmed_time
            ),
            now(),
            now()
        );
    END IF;

    RETURN v_response;
END;
$$;

-- Function Ownership & Search Path
ALTER FUNCTION public.request_public_appointment_reschedule_by_manage_token(text, date, text, text, text) OWNER TO postgres;

-- Explicit EXECUTE ACL Hardening
REVOKE ALL ON FUNCTION public.request_public_appointment_reschedule_by_manage_token(text, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_public_appointment_reschedule_by_manage_token(text, date, text, text, text) TO anon, authenticated;

COMMIT;


-- >>> FILE: 20260806_request_public_appointment_reschedule_outbox_fix.sql <<<
-- Migration 31: Stage F1 Forward-Only Reschedule RPC Outbox & Single Pending Request Correction
-- File: supabase/migrations/20260806_request_public_appointment_reschedule_outbox_fix.sql
--
-- PURPOSE:
-- 1. Updates communication_outbox metadata event_type to 'reschedule_request_created' (replaces legacy 'cancellation_request_created').
-- 2. Adds partial unique index idx_appointment_change_requests_pending_reschedule to enforce at most ONE active pending reschedule request per appointment at the DB engine level.
-- 3. Returns reason_code = 'request_already_pending' with success = false when an active pending reschedule request already exists.

BEGIN;

-- 1. Structural unique constraint for pending reschedule requests per appointment
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointment_change_requests_pending_reschedule
ON public.appointment_change_requests (appointment_id)
WHERE request_type = 'reschedule' AND status IN ('pending', 'requested');

-- 2. Update RPC function
CREATE OR REPLACE FUNCTION public.request_public_appointment_reschedule_by_manage_token(
    p_token text,
    p_requested_date date,
    p_requested_time text,
    p_reason text DEFAULT NULL,
    p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_trimmed_token text;
    v_token_hash text;
    v_token_record record;
    v_appointment record;
    v_trimmed_reason text;
    v_trimmed_time text;
    v_trimmed_key text;
    v_existing_idem record;
    v_existing_req record;
    v_overlap_count integer;
    v_request_id uuid;
    v_response jsonb;
BEGIN
    -- -----------------------------------------------------------------------
    -- Step 1: Input Validation
    -- -----------------------------------------------------------------------
    IF p_token IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    v_trimmed_token := trim(p_token);
    IF length(v_trimmed_token) < 32 OR length(v_trimmed_token) > 128 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    IF p_requested_date IS NULL OR p_requested_date < current_date THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_date');
    END IF;

    IF p_requested_time IS NULL OR trim(p_requested_time) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_time');
    END IF;

    v_trimmed_time := trim(p_requested_time);
    IF v_trimmed_time !~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_time');
    END IF;

    v_trimmed_reason := NULLIF(trim(p_reason), '');
    v_trimmed_key := NULLIF(trim(p_idempotency_key), '');

    -- -----------------------------------------------------------------------
    -- Step 2: Compute SHA-256 digest matching canonical token creation
    -- -----------------------------------------------------------------------
    v_token_hash := encode(sha256(v_trimmed_token::bytea), 'hex');

    -- -----------------------------------------------------------------------
    -- Step 3: Match appointment_access_tokens record
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, appointment_id, expires_at, used_at
    INTO v_token_record
    FROM public.appointment_access_tokens
    WHERE token_hash = v_token_hash
      AND expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 4: Lock appointment row FOR UPDATE
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, branch_id, customer_id, service_id, staff_id,
           user_name, user_email, phone, appointment_date, appointment_time,
           duration_minutes, status, notes
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_token_record.appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 5: Transition and Eligibility Check
    -- -----------------------------------------------------------------------
    IF v_appointment.status != 'confirmed' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_transition');
    END IF;

    -- Same slot check
    IF v_appointment.appointment_date = p_requested_date AND v_appointment.appointment_time::text = v_trimmed_time THEN
        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'no_change',
            'changed', false,
            'appointment_id', v_appointment.id,
            'appointment_date', v_appointment.appointment_date,
            'appointment_time', v_appointment.appointment_time
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 6: Idempotency & Active Request Replay Check
    -- -----------------------------------------------------------------------
    IF v_trimmed_key IS NOT NULL THEN
        SELECT requested_date, requested_time, response_payload
        INTO v_existing_idem
        FROM public.customer_reschedule_idempotency
        WHERE idempotency_key = v_trimmed_key;

        IF FOUND THEN
            IF v_existing_idem.requested_date = p_requested_date AND v_existing_idem.requested_time = v_trimmed_time THEN
                RETURN v_existing_idem.response_payload;
            ELSE
                RETURN jsonb_build_object('success', false, 'reason_code', 'idempotency_conflict');
            END IF;
        END IF;
    END IF;

    -- Check duplicate pending request
    SELECT id INTO v_existing_req
    FROM public.appointment_change_requests
    WHERE appointment_id = v_appointment.id
      AND request_type = 'reschedule'
      AND status IN ('pending', 'requested')
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'request_already_pending',
            'changed', false,
            'appointment_id', v_appointment.id,
            'change_request_id', v_existing_req.id
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 7: Slot Overlap Check
    -- -----------------------------------------------------------------------
    SELECT COUNT(*) INTO v_overlap_count
    FROM public.appointments
    WHERE staff_id = v_appointment.staff_id
      AND appointment_date = p_requested_date
      AND appointment_time = v_trimmed_time
      AND id != v_appointment.id
      AND status IN ('confirmed', 'completed');

    IF v_overlap_count > 0 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'slot_unavailable');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 8: Transactional Mutation — Insert Change Request Record
    -- -----------------------------------------------------------------------
    INSERT INTO public.appointment_change_requests (
        tenant_id,
        appointment_id,
        request_type,
        requested_by,
        proposed_date,
        proposed_time,
        reason,
        status,
        created_at
    ) VALUES (
        v_appointment.tenant_id,
        v_appointment.id,
        'reschedule',
        'customer',
        p_requested_date,
        v_trimmed_time,
        v_trimmed_reason,
        'pending',
        now()
    ) RETURNING id INTO v_request_id;

    -- Build Success Response Payload
    v_response := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'changed', true,
        'appointment_id', v_appointment.id,
        'change_request_id', v_request_id,
        'proposed_date', p_requested_date,
        'proposed_time', v_trimmed_time,
        'status', 'confirmed'
    );

    -- Record Idempotency Key
    IF v_trimmed_key IS NOT NULL THEN
        INSERT INTO public.customer_reschedule_idempotency (
            appointment_id, idempotency_key, requested_date, requested_time, response_payload
        ) VALUES (
            v_appointment.id, v_trimmed_key, p_requested_date, v_trimmed_time, v_response
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 9: Transactional Side Effects (Audit Event & Communication Outbox)
    -- -----------------------------------------------------------------------
    INSERT INTO public.audit_events (
        tenant_id, actor_id, actor_role, action, resource_type, resource_id, payload, created_at
    ) VALUES (
        v_appointment.tenant_id,
        NULL,
        'customer_token',
        'appointment_reschedule_requested',
        'appointment',
        v_appointment.id,
        jsonb_build_object(
            'change_request_id', v_request_id,
            'proposed_date', p_requested_date,
            'proposed_time', v_trimmed_time
        ),
        now()
    );

    IF v_appointment.phone IS NOT NULL AND trim(v_appointment.phone) != '' THEN
        INSERT INTO public.communication_outbox (
            tenant_id, recipient, channel, message, status, metadata, created_at, updated_at
        ) VALUES (
            v_appointment.tenant_id,
            v_appointment.phone,
            'whatsapp',
            'Randevu değişiklik talebiniz alındı.',
            'queued',
            jsonb_build_object(
                'event_type', 'reschedule_request_created',
                'appointment_id', v_appointment.id,
                'proposed_date', p_requested_date,
                'proposed_time', v_trimmed_time
            ),
            now(),
            now()
        );
    END IF;

    RETURN v_response;
END;
$$;

ALTER FUNCTION public.request_public_appointment_reschedule_by_manage_token(text, date, text, text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.request_public_appointment_reschedule_by_manage_token(text, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_public_appointment_reschedule_by_manage_token(text, date, text, text, text) TO anon, authenticated;

COMMIT;


-- >>> FILE: 20260807_get_public_pending_reschedule_request_by_manage_token_rpc.sql <<<
-- Migration 32: Stage F2 Secure Pending Reschedule Request Read RPC
-- File: supabase/migrations/20260807_get_public_pending_reschedule_request_by_manage_token_rpc.sql
--
-- PURPOSE:
-- Implements public.get_public_pending_reschedule_request_by_manage_token(p_token text) RETURNS jsonb.
-- Server-side token validation and pending reschedule request lookup for Stage F2 UI.
-- Hashes the raw token using SHA-256 against public.appointment_access_tokens,
-- resolves appointment server-side, and returns the active pending reschedule request if present.
-- Never exposes raw tokens, token hashes, customer PII, SQLERRM, or SQLSTATE.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_pending_reschedule_request_by_manage_token(
    p_token text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_trimmed_token text;
    v_token_hash text;
    v_token_record record;
    v_appointment record;
    v_req_record record;
BEGIN
    -- Step 1: Input Validation
    IF p_token IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    v_trimmed_token := trim(p_token);
    IF length(v_trimmed_token) < 32 OR length(v_trimmed_token) > 128 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- Step 2: Compute SHA-256 token digest
    v_token_hash := encode(sha256(v_trimmed_token::bytea), 'hex');

    -- Step 3: Match token in appointment_access_tokens
    SELECT id, tenant_id, appointment_id, expires_at
    INTO v_token_record
    FROM public.appointment_access_tokens
    WHERE token_hash = v_token_hash
      AND expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- Step 4: Resolve target appointment
    SELECT id, tenant_id, status
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_token_record.appointment_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- Step 5: Query active pending reschedule request
    SELECT id, proposed_date, proposed_time, status, created_at
    INTO v_req_record
    FROM public.appointment_change_requests
    WHERE appointment_id = v_appointment.id
      AND request_type = 'reschedule'
      AND status IN ('pending', 'requested')
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'ok',
            'has_pending_request', true,
            'change_request_id', v_req_record.id,
            'proposed_date', v_req_record.proposed_date,
            'proposed_time', v_req_record.proposed_time,
            'status', v_req_record.status,
            'created_at', v_req_record.created_at
        );
    ELSE
        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'ok',
            'has_pending_request', false
        );
    END IF;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
END;
$$;

ALTER FUNCTION public.get_public_pending_reschedule_request_by_manage_token(text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_public_pending_reschedule_request_by_manage_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_pending_reschedule_request_by_manage_token(text) TO anon, authenticated;

COMMIT;


-- >>> FILE: 20260808_admin_reschedule_request_decision_rpc.sql <<<
-- Migration 33: Stage F3 Admin Reschedule Request Decision Backend
-- File: supabase/migrations/20260808_admin_reschedule_request_decision_rpc.sql
--
-- PURPOSE:
-- 1. Creates public.admin_reschedule_decision_idempotency table for decision idempotency handling.
-- 2. Implements public.admin_list_pending_reschedule_requests SECURITY DEFINER RPC.
-- 3. Implements public.admin_decide_reschedule_request SECURITY DEFINER RPC.
-- Supports tenant_owner / super_admin approval and rejection of customer reschedule requests.
-- Revalidates proposed slot availability atomically at approval time.
-- Inserts transactional audit log and communication outbox records.
-- Enforces strict server-side authorization and tenant isolation based on auth.uid().

BEGIN;

-- 1. Create Idempotency Table
CREATE TABLE IF NOT EXISTS public.admin_reschedule_decision_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    change_request_id UUID NOT NULL REFERENCES public.appointment_change_requests(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
    response_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.admin_reschedule_decision_idempotency ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_reschedule_decision_idempotency FROM PUBLIC;
REVOKE ALL ON public.admin_reschedule_decision_idempotency FROM anon;
REVOKE ALL ON public.admin_reschedule_decision_idempotency FROM authenticated;

-- 2. Create Admin List Pending Reschedule Requests RPC
CREATE OR REPLACE FUNCTION public.admin_list_pending_reschedule_requests(
    p_limit integer DEFAULT 50,
    p_cursor_created_at timestamptz DEFAULT NULL,
    p_cursor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor record;
    v_limit integer;
    v_requests jsonb;
BEGIN
    -- Check Authentication
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthenticated');
    END IF;

    -- Resolve Actor Profile & Tenant
    SELECT id, tenant_id, role INTO v_actor
    FROM public.users_profile
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthenticated');
    END IF;

    -- Check Role Authorization (tenant_owner or super_admin required)
    IF v_actor.role NOT IN ('tenant_owner', 'super_admin') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);

    -- Query Pending Reschedule Requests
    SELECT jsonb_agg(
        jsonb_build_object(
            'change_request_id', cr.id,
            'appointment_id', cr.appointment_id,
            'tenant_id', cr.tenant_id,
            'request_type', cr.request_type,
            'request_status', cr.status,
            'proposed_date', cr.proposed_date,
            'proposed_time', cr.proposed_time,
            'reason', cr.reason,
            'created_at', cr.created_at,
            'current_appointment_date', a.appointment_date,
            'current_appointment_time', a.appointment_time,
            'current_appointment_status', a.status,
            'customer_name', a.user_name,
            'customer_phone', a.phone,
            'service_name', COALESCE(s.name_tr, s.name, 'Hizmet'),
            'staff_name', COALESCE(st.name, 'Personel'),
            'branch_name', COALESCE(b.name, 'Şube')
        )
    ) INTO v_requests
    FROM public.appointment_change_requests cr
    JOIN public.appointments a ON a.id = cr.appointment_id
    LEFT JOIN public.services s ON s.id = a.service_id
    LEFT JOIN public.staff st ON st.id = a.staff_id
    LEFT JOIN public.branches b ON b.id = a.branch_id
    WHERE cr.request_type = 'reschedule'
      AND cr.status IN ('pending', 'requested')
      AND (
        (v_actor.role = 'super_admin' AND v_actor.tenant_id IS NULL)
        OR
        (cr.tenant_id = v_actor.tenant_id::text)
      )
      AND (
        p_cursor_created_at IS NULL
        OR (cr.created_at, cr.id) < (p_cursor_created_at, p_cursor_id)
      )
    ORDER BY cr.created_at DESC, cr.id DESC
    LIMIT v_limit;

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'requests', COALESCE(v_requests, '[]'::jsonb)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'service_error');
END;
$$;

ALTER FUNCTION public.admin_list_pending_reschedule_requests(integer, timestamptz, uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.admin_list_pending_reschedule_requests(integer, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_pending_reschedule_requests(integer, timestamptz, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_reschedule_requests(integer, timestamptz, uuid) TO authenticated;


-- 3. Create Admin Reschedule Request Decision RPC
CREATE OR REPLACE FUNCTION public.admin_decide_reschedule_request(
    p_change_request_id uuid,
    p_decision text,
    p_reason text DEFAULT NULL,
    p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor record;
    v_trimmed_decision text;
    v_trimmed_reason text;
    v_trimmed_key text;
    v_req record;
    v_appointment record;
    v_existing_idem record;
    v_overlap_count integer;
    v_response jsonb;
    v_prev_date date;
    v_prev_time text;
BEGIN
    -- Check Authentication
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthenticated');
    END IF;

    -- Resolve Actor Profile
    SELECT id, tenant_id, role INTO v_actor
    FROM public.users_profile
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthenticated');
    END IF;

    -- Role Authorization
    IF v_actor.role NOT IN ('tenant_owner', 'super_admin') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    -- Input Hygiene
    IF p_change_request_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'request_unavailable');
    END IF;

    v_trimmed_decision := lower(trim(COALESCE(p_decision, '')));
    IF v_trimmed_decision NOT IN ('approved', 'rejected') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_decision');
    END IF;

    v_trimmed_reason := NULLIF(trim(p_reason), '');
    v_trimmed_key := NULLIF(trim(p_idempotency_key), '');

    -- Check Idempotency Table
    IF v_trimmed_key IS NOT NULL THEN
        SELECT decision, response_payload INTO v_existing_idem
        FROM public.admin_reschedule_decision_idempotency
        WHERE idempotency_key = v_trimmed_key;

        IF FOUND THEN
            IF v_existing_idem.decision = v_trimmed_decision THEN
                RETURN v_existing_idem.response_payload;
            ELSE
                RETURN jsonb_build_object('success', false, 'reason_code', 'idempotency_conflict');
            END IF;
        END IF;
    END IF;

    -- Lock Change Request Row FOR UPDATE
    SELECT id, tenant_id, appointment_id, request_type, proposed_date, proposed_time, reason, status
    INTO v_req
    FROM public.appointment_change_requests
    WHERE id = p_change_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'request_unavailable');
    END IF;

    -- Verify Tenant Isolation
    IF v_actor.role != 'super_admin' AND v_req.tenant_id != v_actor.tenant_id::text THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'request_unavailable');
    END IF;

    -- Check Request Type
    IF v_req.request_type != 'reschedule' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'request_unavailable');
    END IF;

    -- Check Already Resolved Status
    IF v_req.status IN ('approved', 'rejected', 'applied') THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'request_already_resolved',
            'changed', false,
            'change_request_id', v_req.id,
            'request_status', v_req.status
        );
    END IF;

    -- Lock Target Appointment Row FOR UPDATE
    SELECT id, tenant_id, branch_id, service_id, staff_id, appointment_date, appointment_time,
           duration_minutes, status, phone, user_name
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_req.appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'request_unavailable');
    END IF;

    v_prev_date := v_appointment.appointment_date;
    v_prev_time := v_appointment.appointment_time::text;

    -- Handle Decision: REJECTED
    IF v_trimmed_decision = 'rejected' THEN
        UPDATE public.appointment_change_requests
        SET status = 'rejected',
            reason = COALESCE(v_trimmed_reason, reason),
            resolved_at = now(),
            resolved_by = auth.uid()::text
        WHERE id = v_req.id;

        v_response := jsonb_build_object(
            'success', true,
            'reason_code', 'ok',
            'changed', true,
            'decision', 'rejected',
            'change_request_id', v_req.id,
            'appointment_id', v_appointment.id,
            'previous_date', v_prev_date,
            'previous_time', v_prev_time,
            'appointment_date', v_appointment.appointment_date,
            'appointment_time', v_appointment.appointment_time,
            'request_status', 'rejected',
            'appointment_status', v_appointment.status
        );

        IF v_trimmed_key IS NOT NULL THEN
            INSERT INTO public.admin_reschedule_decision_idempotency (
                tenant_id, change_request_id, actor_id, idempotency_key, decision, response_payload
            ) VALUES (
                v_req.tenant_id, v_req.id, auth.uid(), v_trimmed_key, 'rejected', v_response
            );
        END IF;

        -- Audit Log
        INSERT INTO public.audit_events (
            tenant_id, actor_id, actor_role, action, resource_type, resource_id, payload, created_at
        ) VALUES (
            v_appointment.tenant_id,
            auth.uid(),
            'tenant_owner',
            'appointment_reschedule_rejected',
            'appointment',
            v_appointment.id,
            jsonb_build_object(
                'change_request_id', v_req.id,
                'rejection_reason', v_trimmed_reason
            ),
            now()
        );

        -- Communication Outbox
        IF v_appointment.phone IS NOT NULL AND trim(v_appointment.phone) != '' THEN
            INSERT INTO public.communication_outbox (
                tenant_id, recipient, channel, message, status, metadata, created_at, updated_at
            ) VALUES (
                v_appointment.tenant_id,
                v_appointment.phone,
                'whatsapp',
                'Randevu değişiklik talebiniz işletme tarafından reddedildi.',
                'queued',
                jsonb_build_object(
                    'event_type', 'reschedule_request_rejected',
                    'appointment_id', v_appointment.id,
                    'change_request_id', v_req.id,
                    'reason', v_trimmed_reason
                ),
                now(),
                now()
            );
        END IF;

        RETURN v_response;
    END IF;

    -- Handle Decision: APPROVED
    -- Approval requires appointment.status = 'confirmed'
    IF v_appointment.status != 'confirmed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_transition',
            'changed', false,
            'appointment_id', v_appointment.id,
            'appointment_status', v_appointment.status
        );
    END IF;

    -- Validate Proposed Slot
    IF v_req.proposed_date IS NULL OR v_req.proposed_time IS NULL OR trim(v_req.proposed_time) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'slot_unavailable');
    END IF;

    IF v_req.proposed_date < current_date THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'slot_unavailable');
    END IF;

    -- Server-Side Overlap Revalidation against active appointments
    SELECT COUNT(*) INTO v_overlap_count
    FROM public.appointments
    WHERE staff_id = v_appointment.staff_id
      AND appointment_date = v_req.proposed_date
      AND appointment_time = v_req.proposed_time
      AND id != v_appointment.id
      AND status IN ('confirmed', 'completed');

    IF v_overlap_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'slot_unavailable',
            'changed', false,
            'appointment_id', v_appointment.id
        );
    END IF;

    -- Atomic Appointment Schedule Update
    UPDATE public.appointments
    SET appointment_date = v_req.proposed_date,
        appointment_time = v_req.proposed_time
    WHERE id = v_appointment.id;

    -- Update Change Request Status
    UPDATE public.appointment_change_requests
    SET status = 'approved',
        resolved_at = now(),
        resolved_by = auth.uid()::text
    WHERE id = v_req.id;

    v_response := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'changed', true,
        'decision', 'approved',
        'change_request_id', v_req.id,
        'appointment_id', v_appointment.id,
        'previous_date', v_prev_date,
        'previous_time', v_prev_time,
        'appointment_date', v_req.proposed_date,
        'appointment_time', v_req.proposed_time,
        'request_status', 'approved',
        'appointment_status', 'confirmed'
    );

    IF v_trimmed_key IS NOT NULL THEN
        INSERT INTO public.admin_reschedule_decision_idempotency (
            tenant_id, change_request_id, actor_id, idempotency_key, decision, response_payload
        ) VALUES (
            v_req.tenant_id, v_req.id, auth.uid(), v_trimmed_key, 'approved', v_response
        );
    END IF;

    -- Audit Log
    INSERT INTO public.audit_events (
        tenant_id, actor_id, actor_role, action, resource_type, resource_id, payload, created_at
    ) VALUES (
        v_appointment.tenant_id,
        auth.uid(),
        'tenant_owner',
        'appointment_reschedule_approved',
        'appointment',
        v_appointment.id,
        jsonb_build_object(
            'change_request_id', v_req.id,
            'previous_date', v_prev_date,
            'previous_time', v_prev_time,
            'approved_date', v_req.proposed_date,
            'approved_time', v_req.proposed_time
        ),
        now()
    );

    -- Communication Outbox
    IF v_appointment.phone IS NOT NULL AND trim(v_appointment.phone) != '' THEN
        INSERT INTO public.communication_outbox (
            tenant_id, recipient, channel, message, status, metadata, created_at, updated_at
        ) VALUES (
            v_appointment.tenant_id,
            v_appointment.phone,
            'whatsapp',
            'Randevu değişiklik talebiniz işletme tarafından onaylandı.',
            'queued',
            jsonb_build_object(
                'event_type', 'reschedule_request_approved',
                'appointment_id', v_appointment.id,
                'change_request_id', v_req.id,
                'approved_date', v_req.proposed_date,
                'approved_time', v_req.proposed_time
            ),
            now(),
            now()
        );
    END IF;

    RETURN v_response;
END;
$$;

ALTER FUNCTION public.admin_decide_reschedule_request(uuid, text, text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.admin_decide_reschedule_request(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_decide_reschedule_request(uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_reschedule_request(uuid, text, text, text) TO authenticated;

COMMIT;


-- >>> FILE: 20260809_admin_reschedule_decision_lock_and_reason_fix.sql <<<
-- Migration 34: Stage F3 Advisory Lock Alignment & Customer Reason Preservation Correction
-- File: supabase/migrations/20260809_admin_reschedule_decision_lock_and_reason_fix.sql
--
-- PURPOSE:
-- 1. Adds resolution_reason TEXT column to public.appointment_change_requests to preserve original customer reason.
-- 2. Aligns admin_decide_reschedule_request concurrency lock with create_public_booking by acquiring pg_advisory_xact_lock(hashtextextended(tenant_id:staff_id:proposed_date, 0)).
-- 3. Updates admin_decide_reschedule_request so rejection sets resolution_reason while preserving customer reason.
-- 4. Updates admin_list_pending_reschedule_requests to expose both customer reason and resolution_reason.

BEGIN;

-- 1. Schema Enhancement — Add resolution_reason Column
ALTER TABLE public.appointment_change_requests
ADD COLUMN IF NOT EXISTS resolution_reason TEXT;

-- 2. Update Admin List Pending Reschedule Requests RPC
CREATE OR REPLACE FUNCTION public.admin_list_pending_reschedule_requests(
    p_limit integer DEFAULT 50,
    p_cursor_created_at timestamptz DEFAULT NULL,
    p_cursor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor record;
    v_limit integer;
    v_requests jsonb;
BEGIN
    -- Check Authentication
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthenticated');
    END IF;

    -- Resolve Actor Profile & Tenant
    SELECT id, tenant_id, role INTO v_actor
    FROM public.users_profile
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthenticated');
    END IF;

    -- Check Role Authorization (tenant_owner or super_admin required)
    IF v_actor.role NOT IN ('tenant_owner', 'super_admin') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);

    -- Query Pending Reschedule Requests
    SELECT jsonb_agg(
        jsonb_build_object(
            'change_request_id', cr.id,
            'appointment_id', cr.appointment_id,
            'tenant_id', cr.tenant_id,
            'request_type', cr.request_type,
            'request_status', cr.status,
            'proposed_date', cr.proposed_date,
            'proposed_time', cr.proposed_time,
            'customer_reason', cr.reason,
            'resolution_reason', cr.resolution_reason,
            'created_at', cr.created_at,
            'current_appointment_date', a.appointment_date,
            'current_appointment_time', a.appointment_time,
            'current_appointment_status', a.status,
            'customer_name', a.user_name,
            'customer_phone', a.phone,
            'service_name', COALESCE(s.name_tr, s.name, 'Hizmet'),
            'staff_name', COALESCE(st.name, 'Personel'),
            'branch_name', COALESCE(b.name, 'Şube')
        )
    ) INTO v_requests
    FROM public.appointment_change_requests cr
    JOIN public.appointments a ON a.id = cr.appointment_id
    LEFT JOIN public.services s ON s.id = a.service_id
    LEFT JOIN public.staff st ON st.id = a.staff_id
    LEFT JOIN public.branches b ON b.id = a.branch_id
    WHERE cr.request_type = 'reschedule'
      AND cr.status IN ('pending', 'requested')
      AND (
        (v_actor.role = 'super_admin' AND v_actor.tenant_id IS NULL)
        OR
        (cr.tenant_id = v_actor.tenant_id::text)
      )
      AND (
        p_cursor_created_at IS NULL
        OR (cr.created_at, cr.id) < (p_cursor_created_at, p_cursor_id)
      )
    ORDER BY cr.created_at DESC, cr.id DESC
    LIMIT v_limit;

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'requests', COALESCE(v_requests, '[]'::jsonb)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'service_error');
END;
$$;

ALTER FUNCTION public.admin_list_pending_reschedule_requests(integer, timestamptz, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_list_pending_reschedule_requests(integer, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_reschedule_requests(integer, timestamptz, uuid) TO authenticated;

-- 3. Update Admin Reschedule Request Decision RPC with Canonical Advisory Lock and Reason Preservation
CREATE OR REPLACE FUNCTION public.admin_decide_reschedule_request(
    p_change_request_id uuid,
    p_decision text,
    p_reason text DEFAULT NULL,
    p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor record;
    v_trimmed_decision text;
    v_trimmed_reason text;
    v_trimmed_key text;
    v_req record;
    v_appointment record;
    v_existing_idem record;
    v_overlap_count integer;
    v_response jsonb;
    v_prev_date date;
    v_prev_time text;
    v_lock_key bigint;
BEGIN
    -- Check Authentication
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthenticated');
    END IF;

    -- Resolve Actor Profile
    SELECT id, tenant_id, role INTO v_actor
    FROM public.users_profile
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthenticated');
    END IF;

    -- Role Authorization
    IF v_actor.role NOT IN ('tenant_owner', 'super_admin') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    -- Input Hygiene
    IF p_change_request_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'request_unavailable');
    END IF;

    v_trimmed_decision := lower(trim(COALESCE(p_decision, '')));
    IF v_trimmed_decision NOT IN ('approved', 'rejected') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_decision');
    END IF;

    v_trimmed_reason := NULLIF(trim(p_reason), '');
    v_trimmed_key := NULLIF(trim(p_idempotency_key), '');

    -- Check Idempotency Table
    IF v_trimmed_key IS NOT NULL THEN
        SELECT decision, response_payload INTO v_existing_idem
        FROM public.admin_reschedule_decision_idempotency
        WHERE idempotency_key = v_trimmed_key;

        IF FOUND THEN
            IF v_existing_idem.decision = v_trimmed_decision THEN
                RETURN v_existing_idem.response_payload;
            ELSE
                RETURN jsonb_build_object('success', false, 'reason_code', 'idempotency_conflict');
            END IF;
        END IF;
    END IF;

    -- Lock Change Request Row FOR UPDATE
    SELECT id, tenant_id, appointment_id, request_type, proposed_date, proposed_time, reason, status
    INTO v_req
    FROM public.appointment_change_requests
    WHERE id = p_change_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'request_unavailable');
    END IF;

    -- Verify Tenant Isolation
    IF v_actor.role != 'super_admin' AND v_req.tenant_id != v_actor.tenant_id::text THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'request_unavailable');
    END IF;

    -- Check Request Type
    IF v_req.request_type != 'reschedule' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'request_unavailable');
    END IF;

    -- Check Already Resolved Status
    IF v_req.status IN ('approved', 'rejected', 'applied') THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'request_already_resolved',
            'changed', false,
            'change_request_id', v_req.id,
            'request_status', v_req.status
        );
    END IF;

    -- Lock Target Appointment Row FOR UPDATE
    SELECT id, tenant_id, branch_id, service_id, staff_id, appointment_date, appointment_time,
           duration_minutes, status, phone, user_name
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_req.appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'request_unavailable');
    END IF;

    v_prev_date := v_appointment.appointment_date;
    v_prev_time := v_appointment.appointment_time::text;

    -- Handle Decision: REJECTED
    IF v_trimmed_decision = 'rejected' THEN
        -- Preserve customer's original reason in 'reason', store admin rejection reason in 'resolution_reason'
        UPDATE public.appointment_change_requests
        SET status = 'rejected',
            resolution_reason = v_trimmed_reason,
            resolved_at = now(),
            resolved_by = auth.uid()::text
        WHERE id = v_req.id;

        v_response := jsonb_build_object(
            'success', true,
            'reason_code', 'ok',
            'changed', true,
            'decision', 'rejected',
            'change_request_id', v_req.id,
            'appointment_id', v_appointment.id,
            'previous_date', v_prev_date,
            'previous_time', v_prev_time,
            'appointment_date', v_appointment.appointment_date,
            'appointment_time', v_appointment.appointment_time,
            'request_status', 'rejected',
            'appointment_status', v_appointment.status
        );

        IF v_trimmed_key IS NOT NULL THEN
            INSERT INTO public.admin_reschedule_decision_idempotency (
                tenant_id, change_request_id, actor_id, idempotency_key, decision, response_payload
            ) VALUES (
                v_req.tenant_id, v_req.id, auth.uid(), v_trimmed_key, 'rejected', v_response
            );
        END IF;

        -- Audit Log
        INSERT INTO public.audit_events (
            tenant_id, actor_id, actor_role, action, resource_type, resource_id, payload, created_at
        ) VALUES (
            v_appointment.tenant_id,
            auth.uid(),
            'tenant_owner',
            'appointment_reschedule_rejected',
            'appointment',
            v_appointment.id,
            jsonb_build_object(
                'change_request_id', v_req.id,
                'rejection_reason', v_trimmed_reason
            ),
            now()
        );

        -- Communication Outbox
        IF v_appointment.phone IS NOT NULL AND trim(v_appointment.phone) != '' THEN
            INSERT INTO public.communication_outbox (
                tenant_id, recipient, channel, message, status, metadata, created_at, updated_at
            ) VALUES (
                v_appointment.tenant_id,
                v_appointment.phone,
                'whatsapp',
                'Randevu değişiklik talebiniz işletme tarafından reddedildi.',
                'queued',
                jsonb_build_object(
                    'event_type', 'reschedule_request_rejected',
                    'appointment_id', v_appointment.id,
                    'change_request_id', v_req.id,
                    'reason', v_trimmed_reason
                ),
                now(),
                now()
            );
        END IF;

        RETURN v_response;
    END IF;

    -- Handle Decision: APPROVED
    -- Approval requires appointment.status = 'confirmed'
    IF v_appointment.status != 'confirmed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_transition',
            'changed', false,
            'appointment_id', v_appointment.id,
            'appointment_status', v_appointment.status
        );
    END IF;

    -- Validate Proposed Slot
    IF v_req.proposed_date IS NULL OR v_req.proposed_time IS NULL OR trim(v_req.proposed_time) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'slot_unavailable');
    END IF;

    IF v_req.proposed_date < current_date THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'slot_unavailable');
    END IF;

    -- ACQUIRE CANONICAL ADVISORY LOCK (Matching create_public_booking)
    v_lock_key := hashtextextended(
        v_appointment.tenant_id::text || ':' || v_appointment.staff_id::text || ':' || v_req.proposed_date::text,
        0
    );
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- Server-Side Overlap Revalidation against active appointments
    SELECT COUNT(*) INTO v_overlap_count
    FROM public.appointments
    WHERE staff_id = v_appointment.staff_id
      AND appointment_date = v_req.proposed_date
      AND appointment_time = v_req.proposed_time
      AND id != v_appointment.id
      AND status IN ('confirmed', 'completed');

    IF v_overlap_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'slot_unavailable',
            'changed', false,
            'appointment_id', v_appointment.id
        );
    END IF;

    -- Atomic Appointment Schedule Update
    UPDATE public.appointments
    SET appointment_date = v_req.proposed_date,
        appointment_time = v_req.proposed_time
    WHERE id = v_appointment.id;

    -- Update Change Request Status
    UPDATE public.appointment_change_requests
    SET status = 'approved',
        resolution_reason = v_trimmed_reason,
        resolved_at = now(),
        resolved_by = auth.uid()::text
    WHERE id = v_req.id;

    v_response := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'changed', true,
        'decision', 'approved',
        'change_request_id', v_req.id,
        'appointment_id', v_appointment.id,
        'previous_date', v_prev_date,
        'previous_time', v_prev_time,
        'appointment_date', v_req.proposed_date,
        'appointment_time', v_req.proposed_time,
        'request_status', 'approved',
        'appointment_status', 'confirmed'
    );

    IF v_trimmed_key IS NOT NULL THEN
        INSERT INTO public.admin_reschedule_decision_idempotency (
            tenant_id, change_request_id, actor_id, idempotency_key, decision, response_payload
        ) VALUES (
            v_req.tenant_id, v_req.id, auth.uid(), v_trimmed_key, 'approved', v_response
        );
    END IF;

    -- Audit Log
    INSERT INTO public.audit_events (
        tenant_id, actor_id, actor_role, action, resource_type, resource_id, payload, created_at
    ) VALUES (
        v_appointment.tenant_id,
        auth.uid(),
        'tenant_owner',
        'appointment_reschedule_approved',
        'appointment',
        v_appointment.id,
        jsonb_build_object(
            'change_request_id', v_req.id,
            'previous_date', v_prev_date,
            'previous_time', v_prev_time,
            'approved_date', v_req.proposed_date,
            'approved_time', v_req.proposed_time
        ),
        now()
    );

    -- Communication Outbox
    IF v_appointment.phone IS NOT NULL AND trim(v_appointment.phone) != '' THEN
        INSERT INTO public.communication_outbox (
            tenant_id, recipient, channel, message, status, metadata, created_at, updated_at
        ) VALUES (
            v_appointment.tenant_id,
            v_appointment.phone,
            'whatsapp',
            'Randevu değişiklik talebiniz işletme tarafından onaylandı.',
            'queued',
            jsonb_build_object(
                'event_type', 'reschedule_request_approved',
                'appointment_id', v_appointment.id,
                'change_request_id', v_req.id,
                'approved_date', v_req.proposed_date,
                'approved_time', v_req.proposed_time
            ),
            now(),
            now()
        );
    END IF;

    RETURN v_response;
END;
$$;

ALTER FUNCTION public.admin_decide_reschedule_request(uuid, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_decide_reschedule_request(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_reschedule_request(uuid, text, text, text) TO authenticated;

COMMIT;


-- >>> FILE: 20260810_h1a_commercial_catalog_and_read_contracts.sql <<<
-- 20260810_h1a_commercial_catalog_and_read_contracts.sql
-- Stage H1A — Canonical Commercial Schema, Immutable Catalog Versioning, and Read Contracts (Hardened & Concurrency-Safe)
-- Description:
-- Provisions:
--   1. public.commercial_feature_definitions (registered keys, types, categories, maturity, immutable value_type trigger)
--   2. public.plans & public.plan_versions (canonical plans, immutable plan codes, concurrency-safe single published version enforcement, immutable versioning)
--   3. public.plan_entitlements & type consistency triggers
--   4. public.subscriptions schema alignment (plan_version_id, billing_mode, grace_until, commercial_version)
--   5. public.tenant_entitlement_overrides & type consistency triggers
--   6. public.platform_system_restrictions (Level 1 platform restriction foundation)
--   7. public.subscription_events & public.billing_transactions (append-only ledgers, financial integrity constraints)
--   8. public.usage_counters (schema foundation)
--   9. Internal helper: public.resolve_effective_tenant_entitlements (4-level precedence: platform_restriction -> tenant_override -> plan_version -> default_deny)
--  10. Public RPC: public.get_public_commercial_plan_catalog
--  11. Authenticated RPC: public.get_my_commercial_subscription_snapshot
--  12. Super Admin RPCs: public.super_admin_get_commercial_catalog & public.super_admin_get_tenant_commercial_snapshot
--  13. Fail-closed RLS policies and execution grants.

-- =========================================================================
-- 1. COMMERCIAL FEATURE DEFINITIONS TABLE & VALUE TYPE IMMUTABILITY TRIGGER
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.commercial_feature_definitions (
    feature_key TEXT PRIMARY KEY,
    value_type TEXT NOT NULL CHECK (value_type IN ('boolean', 'integer', 'text', 'json')),
    category TEXT NOT NULL CHECK (category IN ('core', 'operations', 'limits', 'channels', 'customization', 'integrations', 'support')),
    public_label TEXT NOT NULL,
    description TEXT,
    maturity TEXT NOT NULL CHECK (maturity IN ('LIVE_ENFORCED', 'LIVE_NOT_PACKAGE_ENFORCED', 'CODE_PRESENT', 'SCHEMA_PRESENT', 'MOCK_ONLY', 'DOCUMENTED_ONLY', 'ROADMAP', 'ABSENT')),
    publicly_claimable BOOLEAN NOT NULL DEFAULT false,
    unit TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_commercial_feature_definitions_modtime
    BEFORE UPDATE ON public.commercial_feature_definitions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enforce value_type Immutability Trigger
CREATE OR REPLACE FUNCTION public.enforce_feature_definition_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.value_type IS DISTINCT FROM OLD.value_type THEN
        RAISE EXCEPTION 'CANNOT_MUTATE_FEATURE_VALUE_TYPE: Changing feature value_type is prohibited as it invalidates existing entitlements and restrictions.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_feature_definition_immutability ON public.commercial_feature_definitions;
CREATE TRIGGER trg_enforce_feature_definition_immutability
    BEFORE UPDATE ON public.commercial_feature_definitions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_feature_definition_immutability();

ALTER TABLE public.commercial_feature_definitions ENABLE ROW LEVEL SECURITY;

-- Seed Feature Definitions
INSERT INTO public.commercial_feature_definitions (feature_key, value_type, category, public_label, description, maturity, publicly_claimable, unit)
VALUES
    ('core_booking', 'boolean', 'core', 'Online Randevu Sistemi', 'Müşterilerin online randevu alabilmesi', 'LIVE_ENFORCED', true, NULL),
    ('customer_self_service', 'boolean', 'core', 'Müşteri Self-Servis Portalı', 'Müşterilerin randevularını yönetebilmesi', 'LIVE_ENFORCED', true, NULL),
    ('customer_cancellation', 'boolean', 'core', 'Randevu İptal Hakkı', 'Müşterilerin online randevu iptali yapabilmesi', 'LIVE_ENFORCED', true, NULL),
    ('customer_reschedule_request', 'boolean', 'core', 'Randevu Değişiklik Talebi', 'Müşterilerin onaylı randevu değişiklik talebi gönderebilmesi', 'LIVE_ENFORCED', true, NULL),
    ('admin_appointment_operations', 'boolean', 'operations', 'İşletme Randevu Yönetimi', 'Admin panelinden randevu takibi ve takvim yönetimi', 'LIVE_ENFORCED', true, NULL),
    ('staff_management', 'boolean', 'operations', 'Personel Yönetimi', 'Personel profilleri ve çalışma saatleri yönetimi', 'LIVE_ENFORCED', true, NULL),
    ('service_management', 'boolean', 'operations', 'Hizmet Kataloğu Yönetimi', 'Hizmet, süre ve fiyat yönetimi', 'LIVE_ENFORCED', true, NULL),
    ('max_staff', 'integer', 'limits', 'Maksimum Aktif Personel', 'Paket kapsamında eklenebilecek aktif personel sayısı', 'LIVE_NOT_PACKAGE_ENFORCED', true, 'personel'),
    ('max_services', 'integer', 'limits', 'Maksimum Aktif Hizmet', 'Paket kapsamında eklenebilecek aktif hizmet sayısı', 'LIVE_NOT_PACKAGE_ENFORCED', true, 'hizmet'),
    ('max_branches', 'integer', 'limits', 'Maksimum Şube Sayısı', 'Paket kapsamında açılabilecek şube sayısı', 'LIVE_NOT_PACKAGE_ENFORCED', true, 'şube'),
    ('max_monthly_appointments', 'integer', 'limits', 'Aylık Randevu Limiti', 'Aylık alınabilecek maksimum randevu sayısı', 'LIVE_NOT_PACKAGE_ENFORCED', true, 'randevu'),
    ('multi_branch', 'boolean', 'operations', 'Çoklu Şube Desteği', 'Birden fazla şube ve lokasyon yönetimi', 'CODE_PRESENT', false, NULL),
    ('notification_allowance', 'integer', 'channels', 'Dış Bildirim Kotası', 'Aylık SMS/WhatsApp dış bildirim kotası', 'CODE_PRESENT', false, 'bildirim'),
    ('ai_allowance', 'integer', 'operations', 'Yapay Zeka Kullanım Kotası', 'Aylık AI stil asistanı kullanım hakkı', 'CODE_PRESENT', false, 'kullanım'),
    ('lari_minisite', 'boolean', 'customization', 'LARİ Mini-Site ve Profili', 'İşletmeye özel açılan online randevu ve tanıtım sayfası', 'LIVE_ENFORCED', true, NULL),
    ('custom_domain_eligible', 'boolean', 'customization', 'Özel Alan Adı Desteği', 'Kendi özel alan adını bağlama', 'MOCK_ONLY', false, NULL),
    ('custom_domain_included', 'boolean', 'customization', 'Dahili Özel Alan Adı', 'Pakete dahil ücretsiz özel alan adı kurulumu', 'MOCK_ONLY', false, NULL),
    ('white_label', 'boolean', 'customization', 'Beyaz Etiket (White-Label)', 'LARİ markasını kaldırıp tamamen işletme markasını öne çıkarma', 'MOCK_ONLY', false, NULL),
    ('calendar_integration', 'boolean', 'integrations', 'Google Takvim Entegrasyonu', 'Dış takvimlerle iki yönlü randevu senkronizasyonu', 'CODE_PRESENT', false, NULL),
    ('advanced_reporting', 'boolean', 'operations', 'Gelişmiş Raporlama', 'Gelir, personel performansı ve doluluk raporları', 'CODE_PRESENT', false, NULL),
    ('crm_level', 'text', 'operations', 'Müşteri Hafızası (CRM)', 'Müşteri geçmişi ve tercih takibi seviyesi (lite/full)', 'CODE_PRESENT', false, NULL),
    ('data_export', 'boolean', 'operations', 'Veri Dışa Aktarma', 'Müşteri ve randevu verilerini Excel/CSV alma', 'CODE_PRESENT', false, NULL),
    ('public_api', 'boolean', 'integrations', 'Geliştirici API Erişimi', 'Özel yazılımlarla entegrasyon için API erişimi', 'ABSENT', false, NULL),
    ('priority_support', 'boolean', 'support', 'Öncelikli Destek', '7/24 öncelikli müşteri ve teknik destek hattı', 'LIVE_ENFORCED', true, NULL),
    ('dedicated_support', 'boolean', 'support', 'Özel Müşteri Temsilcisi', 'Birebir özel müşteri başarı temsilcisi ve yerinde eğitim', 'LIVE_ENFORCED', true, NULL)
ON CONFLICT (feature_key) DO UPDATE SET
    value_type = EXCLUDED.value_type,
    category = EXCLUDED.category,
    public_label = EXCLUDED.public_label,
    description = EXCLUDED.description,
    maturity = EXCLUDED.maturity,
    publicly_claimable = EXCLUDED.publicly_claimable,
    unit = EXCLUDED.unit;


-- =========================================================================
-- 2. PLANS TABLE & PLAN CODE IMMUTABILITY TRIGGER
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL CHECK (trim(code) != ''),
    public_name TEXT NOT NULL,
    internal_description TEXT,
    is_public BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_assignable BOOLEAN NOT NULL DEFAULT true,
    is_legacy BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_plans_modtime
    BEFORE UPDATE ON public.plans
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Plan Code Immutability Trigger
CREATE OR REPLACE FUNCTION public.enforce_plan_code_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION 'CANNOT_MUTATE_PLAN_CODE: Plan codes are immutable identifiers.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_plan_code_immutability ON public.plans;
CREATE TRIGGER trg_enforce_plan_code_immutability
    BEFORE UPDATE ON public.plans
    FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_code_immutability();

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Seed Canonical Plans
INSERT INTO public.plans (code, public_name, internal_description, is_public, is_active, is_assignable, is_legacy, sort_order)
VALUES
    ('baslangic', 'Başlangıç', 'Tek kişilik salon ve bağımsız uzmanlar için temel paket', true, true, true, false, 1),
    ('professional', 'Profesyonel', 'Büyüyen salonlar ve 5 personele kadar ekipler için ideal paket', true, true, true, false, 2),
    ('premium', 'Premium', 'Geniş kadrolu salonlar ve yüksek hacimli işletmeler için tam paket', true, true, true, false, 3),
    ('kurumsal', 'Kurumsal', 'Çoklu şubeli zincir salonlar ve özel gereksinimleri olan kurumsal işletmeler', false, true, true, false, 4),
    ('standart', 'Standart (Miras)', 'Eski Standart paket aboneleri için korunan miras plan snapshot', false, true, false, true, 99)
ON CONFLICT (code) DO UPDATE SET
    public_name = EXCLUDED.public_name,
    internal_description = EXCLUDED.internal_description,
    is_public = EXCLUDED.is_public,
    is_active = EXCLUDED.is_active,
    is_assignable = EXCLUDED.is_assignable,
    is_legacy = EXCLUDED.is_legacy,
    sort_order = EXCLUDED.sort_order;


-- =========================================================================
-- 3. PLAN VERSIONS TABLE, IMMUTABILITY & CONCURRENCY-SAFE OVERLAP TRIGGERS
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.plan_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('draft', 'published', 'retired')),
    currency TEXT CHECK (currency IS NULL OR (length(currency) = 3 AND currency = upper(currency))),
    monthly_price NUMERIC(10,2) CHECK (monthly_price IS NULL OR monthly_price >= 0),
    annual_price NUMERIC(10,2) CHECK (annual_price IS NULL OR annual_price >= 0),
    annual_discount_percent NUMERIC(5,2) CHECK (annual_discount_percent IS NULL OR (annual_discount_percent >= 0 AND annual_discount_percent <= 100)),
    setup_fee NUMERIC(10,2) CHECK (setup_fee IS NULL OR setup_fee >= 0),
    trial_days INTEGER CHECK (trial_days IS NULL OR trial_days >= 0),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_to TIMESTAMPTZ CHECK (effective_to IS NULL OR effective_to > effective_from),
    published_at TIMESTAMPTZ,
    retired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    internal_note TEXT,
    CONSTRAINT uq_plan_versions_plan_version UNIQUE (plan_id, version_number)
);

ALTER TABLE public.plan_versions ENABLE ROW LEVEL SECURITY;

-- 3A. Concurrency-Safe Single Effective Published Version Overlap Prevention Trigger
CREATE OR REPLACE FUNCTION public.enforce_single_published_plan_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_overlap_count INTEGER;
BEGIN
    IF NEW.lifecycle_status = 'published' THEN
        -- Acquire plan-scoped advisory lock to serialize concurrent published version checks for this plan_id
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.plan_id::text, 0));

        SELECT COUNT(*) INTO v_overlap_count
        FROM public.plan_versions pv
        WHERE pv.plan_id = NEW.plan_id
          AND pv.id IS DISTINCT FROM NEW.id
          AND pv.lifecycle_status = 'published'
          AND (
            (NEW.effective_from, COALESCE(NEW.effective_to, '9999-12-31 23:59:59+00'::timestamptz)) OVERLAPS
            (pv.effective_from, COALESCE(pv.effective_to, '9999-12-31 23:59:59+00'::timestamptz))
          );

        IF v_overlap_count > 0 THEN
            RAISE EXCEPTION 'OVERLAPPING_PUBLISHED_PLAN_VERSION: A plan cannot have two simultaneously effective published versions.' USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_published_plan_version ON public.plan_versions;
CREATE TRIGGER trg_enforce_single_published_plan_version
    BEFORE INSERT OR UPDATE ON public.plan_versions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_single_published_plan_version();

-- 3B. Published Plan Version Immutability & Retirement Integrity Trigger
CREATE OR REPLACE FUNCTION public.enforce_plan_version_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.lifecycle_status = 'published' THEN
            RAISE EXCEPTION 'CANNOT_DELETE_PUBLISHED_PLAN_VERSION: Published plan versions are immutable financial records.' USING ERRCODE = 'P0001';
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.lifecycle_status = 'published' THEN
            -- Verify that if transitioning to retired, NO commercial content field was mutated
            IF NEW.lifecycle_status = 'retired' THEN
                IF NEW.plan_id IS DISTINCT FROM OLD.plan_id OR
                   NEW.version_number IS DISTINCT FROM OLD.version_number OR
                   NEW.currency IS DISTINCT FROM OLD.currency OR
                   NEW.monthly_price IS DISTINCT FROM OLD.monthly_price OR
                   NEW.annual_price IS DISTINCT FROM OLD.annual_price OR
                   NEW.annual_discount_percent IS DISTINCT FROM OLD.annual_discount_percent OR
                   NEW.setup_fee IS DISTINCT FROM OLD.setup_fee OR
                   NEW.trial_days IS DISTINCT FROM OLD.trial_days OR
                   NEW.effective_from IS DISTINCT FROM OLD.effective_from THEN
                    RAISE EXCEPTION 'CANNOT_MUTATE_PUBLISHED_PLAN_VERSION: Retirement transition cannot alter commercial content values.' USING ERRCODE = 'P0001';
                END IF;
                RETURN NEW;
            ELSE
                RAISE EXCEPTION 'CANNOT_MUTATE_PUBLISHED_PLAN_VERSION: Published plan versions are immutable. Create a new version for pricing or entitlement changes.' USING ERRCODE = 'P0001';
            END IF;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_plan_version_immutability ON public.plan_versions;
CREATE TRIGGER trg_enforce_plan_version_immutability
    BEFORE UPDATE OR DELETE ON public.plan_versions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_version_immutability();


-- =========================================================================
-- 4. PLAN ENTITLEMENTS TABLE & IMMUTABILITY / TYPE CONSISTENCY TRIGGERS
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.plan_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_version_id UUID NOT NULL REFERENCES public.plan_versions(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL REFERENCES public.commercial_feature_definitions(feature_key) ON DELETE RESTRICT,
    value_type TEXT NOT NULL CHECK (value_type IN ('boolean', 'integer', 'text', 'json')),
    boolean_value BOOLEAN,
    integer_value BIGINT,
    text_value TEXT,
    json_value JSONB,
    is_unlimited BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    CONSTRAINT uq_plan_entitlements_version_feature UNIQUE (plan_version_id, feature_key),
    CONSTRAINT chk_plan_entitlements_value_shape CHECK (
        (value_type = 'boolean' AND boolean_value IS NOT NULL AND integer_value IS NULL AND text_value IS NULL AND json_value IS NULL AND is_unlimited = false) OR
        (value_type = 'integer' AND is_unlimited = false AND integer_value IS NOT NULL AND integer_value >= 0 AND boolean_value IS NULL AND text_value IS NULL AND json_value IS NULL) OR
        (value_type = 'integer' AND is_unlimited = true AND integer_value IS NULL AND boolean_value IS NULL AND text_value IS NULL AND json_value IS NULL) OR
        (value_type = 'text' AND text_value IS NOT NULL AND boolean_value IS NULL AND integer_value IS NULL AND json_value IS NULL AND is_unlimited = false) OR
        (value_type = 'json' AND json_value IS NOT NULL AND boolean_value IS NULL AND integer_value IS NULL AND text_value IS NULL AND is_unlimited = false)
    )
);

ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;

-- Entitlement & Feature Definition Type Consistency Function
CREATE OR REPLACE FUNCTION public.enforce_entitlement_type_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_def_type TEXT;
BEGIN
    SELECT value_type INTO v_def_type
    FROM public.commercial_feature_definitions
    WHERE feature_key = NEW.feature_key;

    IF v_def_type IS NULL THEN
        RAISE EXCEPTION 'UNKNOWN_FEATURE_KEY: Feature key % is not registered.', NEW.feature_key USING ERRCODE = 'P0001';
    END IF;

    IF NEW.value_type != v_def_type THEN
        RAISE EXCEPTION 'ENTITLEMENT_TYPE_MISMATCH: Entitlement value_type (%) does not match feature definition value_type (%).', NEW.value_type, v_def_type USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_plan_entitlements_type_consistency ON public.plan_entitlements;
CREATE TRIGGER trg_enforce_plan_entitlements_type_consistency
    BEFORE INSERT OR UPDATE ON public.plan_entitlements
    FOR EACH ROW EXECUTE FUNCTION public.enforce_entitlement_type_consistency();

-- Immutability Enforcement Function for Plan Entitlements
CREATE OR REPLACE FUNCTION public.enforce_plan_entitlement_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_version_status TEXT;
BEGIN
    SELECT lifecycle_status INTO v_version_status
    FROM public.plan_versions
    WHERE id = COALESCE(OLD.plan_version_id, NEW.plan_version_id);

    IF v_version_status = 'published' THEN
        RAISE EXCEPTION 'CANNOT_MUTATE_PUBLISHED_PLAN_ENTITLEMENTS: Entitlements of published plan versions are immutable.' USING ERRCODE = 'P0001';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_plan_entitlement_immutability ON public.plan_entitlements;
CREATE TRIGGER trg_enforce_plan_entitlement_immutability
    BEFORE INSERT OR UPDATE OR DELETE ON public.plan_entitlements
    FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_entitlement_immutability();


-- =========================================================================
-- SEED VERSION 1 CATALOG AND ENTITLEMENTS
-- =========================================================================

DO $$
DECLARE
    v_baslangic_plan_id   UUID;
    v_pro_plan_id         UUID;
    v_premium_plan_id     UUID;
    v_kurumsal_plan_id    UUID;
    v_standart_plan_id    UUID;
    v_baslangic_ver_id    UUID;
    v_pro_ver_id          UUID;
    v_premium_ver_id      UUID;
    v_kurumsal_ver_id     UUID;
    v_standart_ver_id     UUID;
BEGIN
    SELECT id INTO v_baslangic_plan_id FROM public.plans WHERE code = 'baslangic';
    SELECT id INTO v_pro_plan_id       FROM public.plans WHERE code = 'professional';
    SELECT id INTO v_premium_plan_id   FROM public.plans WHERE code = 'premium';
    SELECT id INTO v_kurumsal_plan_id  FROM public.plans WHERE code = 'kurumsal';
    SELECT id INTO v_standart_plan_id  FROM public.plans WHERE code = 'standart';

    -- 1. Başlangıç Version 1
    SELECT id INTO v_baslangic_ver_id FROM public.plan_versions WHERE plan_id = v_baslangic_plan_id AND version_number = 1;
    IF v_baslangic_ver_id IS NULL THEN
        INSERT INTO public.plan_versions (plan_id, version_number, lifecycle_status, currency, monthly_price, annual_price, annual_discount_percent, setup_fee, trial_days, published_at, internal_note)
        VALUES (v_baslangic_plan_id, 1, 'draft', 'TRY', 990.00, 9504.00, 20.00, 0.00, 14, NULL, 'Approved Version 1 Catalog')
        RETURNING id INTO v_baslangic_ver_id;
    END IF;

    -- 2. Profesyonel Version 1
    SELECT id INTO v_pro_ver_id FROM public.plan_versions WHERE plan_id = v_pro_plan_id AND version_number = 1;
    IF v_pro_ver_id IS NULL THEN
        INSERT INTO public.plan_versions (plan_id, version_number, lifecycle_status, currency, monthly_price, annual_price, annual_discount_percent, setup_fee, trial_days, published_at, internal_note)
        VALUES (v_pro_plan_id, 1, 'draft', 'TRY', 2490.00, 23904.00, 20.00, 0.00, 14, NULL, 'Approved Version 1 Catalog')
        RETURNING id INTO v_pro_ver_id;
    END IF;

    -- 3. Premium Version 1
    SELECT id INTO v_premium_ver_id FROM public.plan_versions WHERE plan_id = v_premium_plan_id AND version_number = 1;
    IF v_premium_ver_id IS NULL THEN
        INSERT INTO public.plan_versions (plan_id, version_number, lifecycle_status, currency, monthly_price, annual_price, annual_discount_percent, setup_fee, trial_days, published_at, internal_note)
        VALUES (v_premium_plan_id, 1, 'draft', 'TRY', 4490.00, 43104.00, 20.00, 0.00, 14, NULL, 'Approved Version 1 Catalog')
        RETURNING id INTO v_premium_ver_id;
    END IF;

    -- 4. Kurumsal Version 1
    SELECT id INTO v_kurumsal_ver_id FROM public.plan_versions WHERE plan_id = v_kurumsal_plan_id AND version_number = 1;
    IF v_kurumsal_ver_id IS NULL THEN
        INSERT INTO public.plan_versions (plan_id, version_number, lifecycle_status, currency, monthly_price, annual_price, annual_discount_percent, setup_fee, trial_days, published_at, internal_note)
        VALUES (v_kurumsal_plan_id, 1, 'draft', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Enterprise Custom Agreements')
        RETURNING id INTO v_kurumsal_ver_id;
    END IF;

    -- 5. Legacy Standart Version 1
    SELECT id INTO v_standart_ver_id FROM public.plan_versions WHERE plan_id = v_standart_plan_id AND version_number = 1;
    IF v_standart_ver_id IS NULL THEN
        INSERT INTO public.plan_versions (plan_id, version_number, lifecycle_status, currency, monthly_price, annual_price, annual_discount_percent, setup_fee, trial_days, published_at, internal_note)
        VALUES (v_standart_plan_id, 1, 'draft', 'TRY', 2490.00, 23904.00, 20.00, 0.00, 14, NULL, 'Legacy Standart compatibility snapshot')
        RETURNING id INTO v_standart_ver_id;
    END IF;

    -- Seed Entitlements for Başlangıç Version 1
    INSERT INTO public.plan_entitlements (plan_version_id, feature_key, value_type, boolean_value, integer_value, text_value, is_unlimited)
    VALUES
        (v_baslangic_ver_id, 'core_booking', 'boolean', true, NULL, NULL, false),
        (v_baslangic_ver_id, 'customer_self_service', 'boolean', true, NULL, NULL, false),
        (v_baslangic_ver_id, 'customer_cancellation', 'boolean', true, NULL, NULL, false),
        (v_baslangic_ver_id, 'customer_reschedule_request', 'boolean', true, NULL, NULL, false),
        (v_baslangic_ver_id, 'admin_appointment_operations', 'boolean', true, NULL, NULL, false),
        (v_baslangic_ver_id, 'staff_management', 'boolean', true, NULL, NULL, false),
        (v_baslangic_ver_id, 'service_management', 'boolean', true, NULL, NULL, false),
        (v_baslangic_ver_id, 'max_staff', 'integer', NULL, 1, NULL, false),
        (v_baslangic_ver_id, 'max_services', 'integer', NULL, 15, NULL, false),
        (v_baslangic_ver_id, 'max_branches', 'integer', NULL, 1, NULL, false),
        (v_baslangic_ver_id, 'max_monthly_appointments', 'integer', NULL, NULL, NULL, true),
        (v_baslangic_ver_id, 'notification_allowance', 'integer', NULL, 0, NULL, false),
        (v_baslangic_ver_id, 'ai_allowance', 'integer', NULL, 0, NULL, false),
        (v_baslangic_ver_id, 'lari_minisite', 'boolean', true, NULL, NULL, false),
        (v_baslangic_ver_id, 'custom_domain_eligible', 'boolean', false, NULL, NULL, false),
        (v_baslangic_ver_id, 'custom_domain_included', 'boolean', false, NULL, NULL, false),
        (v_baslangic_ver_id, 'multi_branch', 'boolean', false, NULL, NULL, false),
        (v_baslangic_ver_id, 'white_label', 'boolean', false, NULL, NULL, false),
        (v_baslangic_ver_id, 'crm_level', 'text', NULL, NULL, 'lite', false),
        (v_baslangic_ver_id, 'priority_support', 'boolean', false, NULL, NULL, false),
        (v_baslangic_ver_id, 'dedicated_support', 'boolean', false, NULL, NULL, false)
    ON CONFLICT (plan_version_id, feature_key) DO NOTHING;

    -- Seed Entitlements for Profesyonel Version 1
    INSERT INTO public.plan_entitlements (plan_version_id, feature_key, value_type, boolean_value, integer_value, text_value, is_unlimited)
    VALUES
        (v_pro_ver_id, 'core_booking', 'boolean', true, NULL, NULL, false),
        (v_pro_ver_id, 'customer_self_service', 'boolean', true, NULL, NULL, false),
        (v_pro_ver_id, 'customer_cancellation', 'boolean', true, NULL, NULL, false),
        (v_pro_ver_id, 'customer_reschedule_request', 'boolean', true, NULL, NULL, false),
        (v_pro_ver_id, 'admin_appointment_operations', 'boolean', true, NULL, NULL, false),
        (v_pro_ver_id, 'staff_management', 'boolean', true, NULL, NULL, false),
        (v_pro_ver_id, 'service_management', 'boolean', true, NULL, NULL, false),
        (v_pro_ver_id, 'max_staff', 'integer', NULL, 5, NULL, false),
        (v_pro_ver_id, 'max_services', 'integer', NULL, 50, NULL, false),
        (v_pro_ver_id, 'max_branches', 'integer', NULL, 1, NULL, false),
        (v_pro_ver_id, 'max_monthly_appointments', 'integer', NULL, NULL, NULL, true),
        (v_pro_ver_id, 'notification_allowance', 'integer', NULL, 0, NULL, false),
        (v_pro_ver_id, 'ai_allowance', 'integer', NULL, 0, NULL, false),
        (v_pro_ver_id, 'lari_minisite', 'boolean', true, NULL, NULL, false),
        (v_pro_ver_id, 'custom_domain_eligible', 'boolean', false, NULL, NULL, false),
        (v_pro_ver_id, 'custom_domain_included', 'boolean', false, NULL, NULL, false),
        (v_pro_ver_id, 'multi_branch', 'boolean', false, NULL, NULL, false),
        (v_pro_ver_id, 'white_label', 'boolean', false, NULL, NULL, false),
        (v_pro_ver_id, 'crm_level', 'text', NULL, NULL, 'full', false),
        (v_pro_ver_id, 'priority_support', 'boolean', true, NULL, NULL, false),
        (v_pro_ver_id, 'dedicated_support', 'boolean', false, NULL, NULL, false)
    ON CONFLICT (plan_version_id, feature_key) DO NOTHING;

    -- Seed Entitlements for Premium Version 1
    INSERT INTO public.plan_entitlements (plan_version_id, feature_key, value_type, boolean_value, integer_value, text_value, is_unlimited)
    VALUES
        (v_premium_ver_id, 'core_booking', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'customer_self_service', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'customer_cancellation', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'customer_reschedule_request', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'admin_appointment_operations', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'staff_management', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'service_management', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'max_staff', 'integer', NULL, 15, NULL, false),
        (v_premium_ver_id, 'max_services', 'integer', NULL, NULL, NULL, true),
        (v_premium_ver_id, 'max_branches', 'integer', NULL, 1, NULL, false),
        (v_premium_ver_id, 'max_monthly_appointments', 'integer', NULL, NULL, NULL, true),
        (v_premium_ver_id, 'notification_allowance', 'integer', NULL, 0, NULL, false),
        (v_premium_ver_id, 'ai_allowance', 'integer', NULL, 0, NULL, false),
        (v_premium_ver_id, 'lari_minisite', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'custom_domain_eligible', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'custom_domain_included', 'boolean', false, NULL, NULL, false),
        (v_premium_ver_id, 'multi_branch', 'boolean', false, NULL, NULL, false),
        (v_premium_ver_id, 'white_label', 'boolean', false, NULL, NULL, false),
        (v_premium_ver_id, 'crm_level', 'text', NULL, NULL, 'full', false),
        (v_premium_ver_id, 'priority_support', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'dedicated_support', 'boolean', true, NULL, NULL, false)
    ON CONFLICT (plan_version_id, feature_key) DO NOTHING;

    -- Seed Entitlements for Kurumsal Version 1
    INSERT INTO public.plan_entitlements (plan_version_id, feature_key, value_type, boolean_value, integer_value, text_value, is_unlimited)
    VALUES
        (v_kurumsal_ver_id, 'core_booking', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'customer_self_service', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'customer_cancellation', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'customer_reschedule_request', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'admin_appointment_operations', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'staff_management', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'service_management', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'max_staff', 'integer', NULL, NULL, NULL, true),
        (v_kurumsal_ver_id, 'max_services', 'integer', NULL, NULL, NULL, true),
        (v_kurumsal_ver_id, 'max_branches', 'integer', NULL, NULL, NULL, true),
        (v_kurumsal_ver_id, 'max_monthly_appointments', 'integer', NULL, NULL, NULL, true),
        (v_kurumsal_ver_id, 'notification_allowance', 'integer', NULL, 0, NULL, false),
        (v_kurumsal_ver_id, 'ai_allowance', 'integer', NULL, 0, NULL, false),
        (v_kurumsal_ver_id, 'lari_minisite', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'custom_domain_eligible', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'custom_domain_included', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'multi_branch', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'white_label', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'crm_level', 'text', NULL, NULL, 'full', false),
        (v_kurumsal_ver_id, 'priority_support', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'dedicated_support', 'boolean', true, NULL, NULL, false)
    ON CONFLICT (plan_version_id, feature_key) DO NOTHING;

    -- Seed Entitlements for Legacy Standart Version 1
    INSERT INTO public.plan_entitlements (plan_version_id, feature_key, value_type, boolean_value, integer_value, text_value, is_unlimited)
    VALUES
        (v_standart_ver_id, 'core_booking', 'boolean', true, NULL, NULL, false),
        (v_standart_ver_id, 'customer_self_service', 'boolean', true, NULL, NULL, false),
        (v_standart_ver_id, 'customer_cancellation', 'boolean', true, NULL, NULL, false),
        (v_standart_ver_id, 'customer_reschedule_request', 'boolean', true, NULL, NULL, false),
        (v_standart_ver_id, 'admin_appointment_operations', 'boolean', true, NULL, NULL, false),
        (v_standart_ver_id, 'staff_management', 'boolean', true, NULL, NULL, false),
        (v_standart_ver_id, 'service_management', 'boolean', true, NULL, NULL, false),
        (v_standart_ver_id, 'max_staff', 'integer', NULL, 3, NULL, false),
        (v_standart_ver_id, 'max_services', 'integer', NULL, 25, NULL, false),
        (v_standart_ver_id, 'max_branches', 'integer', NULL, 1, NULL, false),
        (v_standart_ver_id, 'max_monthly_appointments', 'integer', NULL, NULL, NULL, true),
        (v_standart_ver_id, 'notification_allowance', 'integer', NULL, 0, NULL, false),
        (v_standart_ver_id, 'ai_allowance', 'integer', NULL, 0, NULL, false),
        (v_standart_ver_id, 'lari_minisite', 'boolean', true, NULL, NULL, false),
        (v_standart_ver_id, 'custom_domain_eligible', 'boolean', false, NULL, NULL, false),
        (v_standart_ver_id, 'custom_domain_included', 'boolean', false, NULL, NULL, false),
        (v_standart_ver_id, 'multi_branch', 'boolean', false, NULL, NULL, false),
        (v_standart_ver_id, 'white_label', 'boolean', false, NULL, NULL, false),
        (v_standart_ver_id, 'crm_level', 'text', NULL, NULL, 'lite', false),
        (v_standart_ver_id, 'priority_support', 'boolean', false, NULL, NULL, false),
        (v_standart_ver_id, 'dedicated_support', 'boolean', false, NULL, NULL, false)
    ON CONFLICT (plan_version_id, feature_key) DO NOTHING;

    -- Seed Completeness Guard Verification: Exact Key Set Validation
    -- 1. Verify that every Version 1 plan version contains ALL 21 required canonical feature keys
    IF EXISTS (
        SELECT 1
        FROM (
            VALUES (v_baslangic_ver_id), (v_pro_ver_id), (v_premium_ver_id), (v_kurumsal_ver_id), (v_standart_ver_id)
        ) AS v(ver_id)
        CROSS JOIN (
            VALUES
                ('core_booking'), ('customer_self_service'), ('customer_cancellation'), ('customer_reschedule_request'),
                ('admin_appointment_operations'), ('staff_management'), ('service_management'),
                ('max_staff'), ('max_services'), ('max_branches'), ('max_monthly_appointments'),
                ('notification_allowance'), ('ai_allowance'), ('lari_minisite'),
                ('custom_domain_eligible'), ('custom_domain_included'), ('multi_branch'), ('white_label'),
                ('crm_level'), ('priority_support'), ('dedicated_support')
        ) AS k(feature_key)
        LEFT JOIN public.plan_entitlements pe ON pe.plan_version_id = v.ver_id AND pe.feature_key = k.feature_key
        WHERE pe.id IS NULL
    ) THEN
        RAISE EXCEPTION 'INCOMPLETE_VERSION_1_SEED: Cannot publish Version 1 plan versions because expected entitlement keys are missing.' USING ERRCODE = 'P0001';
    END IF;

    -- 2. Verify exact canonical key count 21 per version (no unexpected key substitution)
    IF (SELECT count(DISTINCT feature_key) FROM public.plan_entitlements WHERE plan_version_id = v_baslangic_ver_id) != 21 OR
       (SELECT count(DISTINCT feature_key) FROM public.plan_entitlements WHERE plan_version_id = v_pro_ver_id) != 21 OR
       (SELECT count(DISTINCT feature_key) FROM public.plan_entitlements WHERE plan_version_id = v_premium_ver_id) != 21 OR
       (SELECT count(DISTINCT feature_key) FROM public.plan_entitlements WHERE plan_version_id = v_kurumsal_ver_id) != 21 OR
       (SELECT count(DISTINCT feature_key) FROM public.plan_entitlements WHERE plan_version_id = v_standart_ver_id) != 21 THEN
        RAISE EXCEPTION 'UNEXPECTED_ENTITLEMENT_KEY_COUNT: Version 1 plan version entitlement key set does not match exact canonical count 21.' USING ERRCODE = 'P0001';
    END IF;

    -- Atomic Transition from Draft to Published
    UPDATE public.plan_versions
    SET lifecycle_status = 'published',
        published_at = now()
    WHERE lifecycle_status = 'draft';
END $$;


-- =========================================================================
-- 5. SUBSCRIPTIONS TABLE ALIGNMENT & COMPATIBILITY BACKFILL
-- =========================================================================

ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS plan_version_id UUID REFERENCES public.plan_versions(id) ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS billing_mode TEXT CHECK (billing_mode IS NULL OR billing_mode IN ('provider', 'manual', 'comped')),
ADD COLUMN IF NOT EXISTS grace_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS commercial_version BIGINT NOT NULL DEFAULT 1 CHECK (commercial_version >= 1);

-- Backfill plan_version_id deterministically for existing subscriptions rows
UPDATE public.subscriptions s
SET plan_version_id = pv.id
FROM public.plans p
JOIN public.plan_versions pv ON pv.plan_id = p.id AND pv.version_number = 1
WHERE s.plan_version_id IS NULL
  AND s.plan_id IS NOT NULL
  AND lower(s.plan_id) = p.code;


-- =========================================================================
-- 6. TENANT ENTITLEMENT OVERRIDES TABLE & TYPE CONSISTENCY TRIGGER
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.tenant_entitlement_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL REFERENCES public.commercial_feature_definitions(feature_key) ON DELETE RESTRICT,
    value_type TEXT NOT NULL CHECK (value_type IN ('boolean', 'integer', 'text', 'json')),
    boolean_value BOOLEAN,
    integer_value BIGINT,
    text_value TEXT,
    json_value JSONB,
    is_unlimited BOOLEAN NOT NULL DEFAULT false,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ CHECK (expires_at IS NULL OR expires_at > starts_at),
    revoked_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    revoked_by UUID REFERENCES auth.users(id),
    reason TEXT NOT NULL CHECK (trim(reason) != ''),
    revoke_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_tenant_overrides_value_shape CHECK (
        (value_type = 'boolean' AND boolean_value IS NOT NULL AND integer_value IS NULL AND text_value IS NULL AND json_value IS NULL AND is_unlimited = false) OR
        (value_type = 'integer' AND is_unlimited = false AND integer_value IS NOT NULL AND integer_value >= 0 AND boolean_value IS NULL AND text_value IS NULL AND json_value IS NULL) OR
        (value_type = 'integer' AND is_unlimited = true AND integer_value IS NULL AND boolean_value IS NULL AND text_value IS NULL AND json_value IS NULL) OR
        (value_type = 'text' AND text_value IS NOT NULL AND boolean_value IS NULL AND integer_value IS NULL AND json_value IS NULL AND is_unlimited = false) OR
        (value_type = 'json' AND json_value IS NOT NULL AND boolean_value IS NULL AND integer_value IS NULL AND text_value IS NULL AND is_unlimited = false)
    )
);

CREATE INDEX IF NOT EXISTS idx_tenant_entitlement_overrides_lookup
ON public.tenant_entitlement_overrides (tenant_id, feature_key, starts_at)
WHERE revoked_at IS NULL;

ALTER TABLE public.tenant_entitlement_overrides ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_enforce_tenant_overrides_type_consistency ON public.tenant_entitlement_overrides;
CREATE TRIGGER trg_enforce_tenant_overrides_type_consistency
    BEFORE INSERT OR UPDATE ON public.tenant_entitlement_overrides
    FOR EACH ROW EXECUTE FUNCTION public.enforce_entitlement_type_consistency();


-- =========================================================================
-- 7. PLATFORM SYSTEM RESTRICTIONS TABLE (LEVEL 1 PRECEDENCE)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.platform_system_restrictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE, -- NULL means global system-wide restriction
    feature_key TEXT NOT NULL REFERENCES public.commercial_feature_definitions(feature_key) ON DELETE RESTRICT,
    is_restricted BOOLEAN NOT NULL DEFAULT true,
    reason TEXT NOT NULL CHECK (trim(reason) != ''),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ CHECK (expires_at IS NULL OR expires_at > starts_at),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_restrictions_lookup
ON public.platform_system_restrictions (tenant_id, feature_key, starts_at);

ALTER TABLE public.platform_system_restrictions ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 8. SUBSCRIPTION EVENTS (APPEND-ONLY LEDGER)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.subscription_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (trim(event_type) != ''),
    previous_state JSONB,
    new_state JSONB,
    internal_reason TEXT NOT NULL CHECK (trim(internal_reason) != ''),
    idempotency_key TEXT UNIQUE CHECK (idempotency_key IS NULL OR trim(idempotency_key) != ''),
    actor_user_id UUID REFERENCES auth.users(id),
    actor_role TEXT,
    effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_tenant_sub
ON public.subscription_events (tenant_id, subscription_id, created_at DESC);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- Append-Only Enforcement & Tenant Consistency Trigger for subscription_events
CREATE OR REPLACE FUNCTION public.enforce_append_only_subscription_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_sub_tenant UUID;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        RAISE EXCEPTION 'APPEND_ONLY_VIOLATION: subscription_events is an immutable append-only audit ledger. UPDATE and DELETE are prohibited.' USING ERRCODE = 'P0001';
    END IF;

    -- Verify tenant_id matches subscription tenant_id
    SELECT tenant_id INTO v_sub_tenant
    FROM public.subscriptions WHERE id = NEW.subscription_id;

    IF v_sub_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_EVENT_VIOLATION: subscription_events tenant_id must match subscription tenant_id.' USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_append_only_subscription_events ON public.subscription_events;
CREATE TRIGGER trg_enforce_append_only_subscription_events
    BEFORE INSERT OR UPDATE OR DELETE ON public.subscription_events
    FOR EACH ROW EXECUTE FUNCTION public.enforce_append_only_subscription_events();


-- =========================================================================
-- 9. BILLING TRANSACTIONS (APPEND-ONLY FINANCIAL LEDGER)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.billing_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('charge', 'payment', 'credit_adjustment', 'debit_adjustment', 'refund', 'reversal', 'void')),
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'TRY' CHECK (length(currency) = 3 AND currency = upper(currency)),
    billing_mode TEXT CHECK (billing_mode IS NULL OR billing_mode IN ('provider', 'manual', 'comped')),
    payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('bank_transfer', 'cash', 'manual_card', 'other')),
    related_transaction_id UUID REFERENCES public.billing_transactions(id) ON DELETE RESTRICT,
    external_provider_reference TEXT,
    reference_note TEXT,
    internal_reason TEXT NOT NULL CHECK (trim(internal_reason) != ''),
    idempotency_key TEXT UNIQUE NOT NULL CHECK (trim(idempotency_key) != ''),
    billing_period_start TIMESTAMPTZ,
    billing_period_end TIMESTAMPTZ CHECK (billing_period_end IS NULL OR billing_period_start IS NULL OR billing_period_end > billing_period_start),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT chk_billing_transactions_self_ref CHECK (related_transaction_id IS NULL OR related_transaction_id != id)
);

CREATE INDEX IF NOT EXISTS idx_billing_transactions_tenant
ON public.billing_transactions (tenant_id, occurred_at DESC);

ALTER TABLE public.billing_transactions ENABLE ROW LEVEL SECURITY;

-- Financial Ledger Integrity & Append-Only Trigger
CREATE OR REPLACE FUNCTION public.enforce_append_only_billing_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_rel_tenant UUID;
    v_rel_sub    UUID;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        RAISE EXCEPTION 'APPEND_ONLY_VIOLATION: billing_transactions is an immutable append-only financial ledger. UPDATE and DELETE are prohibited.' USING ERRCODE = 'P0001';
    END IF;

    -- Refund and Reversal MUST reference an original transaction
    IF NEW.transaction_type IN ('refund', 'reversal') AND NEW.related_transaction_id IS NULL THEN
        RAISE EXCEPTION 'REFUND_REVERSAL_MUST_REFERENCE_TRANSACTION: % transactions must reference a valid original transaction.', NEW.transaction_type USING ERRCODE = 'P0001';
    END IF;

    -- Check related_transaction belongs to same tenant
    IF NEW.related_transaction_id IS NOT NULL THEN
        SELECT tenant_id, subscription_id INTO v_rel_tenant, v_rel_sub
        FROM public.billing_transactions WHERE id = NEW.related_transaction_id;

        IF v_rel_tenant IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_TRANSACTION_VIOLATION: Related transaction must belong to the same tenant.' USING ERRCODE = 'P0001';
        END IF;

        IF NEW.subscription_id IS NOT NULL AND v_rel_sub IS NOT NULL AND v_rel_sub IS DISTINCT FROM NEW.subscription_id THEN
            RAISE EXCEPTION 'SUBSCRIPTION_MISMATCH_TRANSACTION_VIOLATION: Related transaction must belong to the same subscription.' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_append_only_billing_transactions ON public.billing_transactions;
CREATE TRIGGER trg_enforce_append_only_billing_transactions
    BEFORE INSERT OR UPDATE OR DELETE ON public.billing_transactions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_append_only_billing_transactions();


-- =========================================================================
-- 10. USAGE COUNTERS TABLE
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.usage_counters (
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL REFERENCES public.commercial_feature_definitions(feature_key) ON DELETE RESTRICT,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL CHECK (period_end > period_start),
    used_count BIGINT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    reserved_count BIGINT NOT NULL DEFAULT 0 CHECK (reserved_count >= 0),
    version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, feature_key, period_start, period_end)
);

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 11. INTERNAL READ HELPER: resolve_effective_tenant_entitlements (4-LEVEL PRECEDENCE)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.resolve_effective_tenant_entitlements(
    p_tenant_id UUID,
    p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
    feature_key TEXT,
    value_type TEXT,
    boolean_value BOOLEAN,
    integer_value BIGINT,
    text_value TEXT,
    "json_value" JSONB,
    is_unlimited BOOLEAN,
    source TEXT,
    plan_version_id UUID,
    override_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_sub_plan_version_id UUID;
BEGIN
    IF p_tenant_id IS NULL THEN
        RETURN;
    END IF;

    -- Resolve active subscription's plan_version_id for this tenant
    SELECT sub.plan_version_id INTO v_sub_plan_version_id
    FROM public.subscriptions sub
    WHERE sub.tenant_id = p_tenant_id
      AND sub.status IN ('active', 'manual_active', 'comped', 'trialing')
      AND (sub.current_period_end IS NULL OR sub.current_period_end > p_at)
    ORDER BY sub.created_at DESC
    LIMIT 1;

    RETURN QUERY
    WITH all_keys AS (
        SELECT f.feature_key AS fkey, f.value_type AS vtype
        FROM public.commercial_feature_definitions f
    ),
    -- Level 1: Platform / System Restriction (Highest Precedence)
    platform_rest AS (
        SELECT DISTINCT ON (pr.feature_key)
            pr.feature_key AS fkey
        FROM public.platform_system_restrictions pr
        WHERE (pr.tenant_id = p_tenant_id OR pr.tenant_id IS NULL)
          AND pr.is_restricted = true
          AND pr.starts_at <= p_at
          AND (pr.expires_at IS NULL OR pr.expires_at > p_at)
        ORDER BY pr.feature_key, pr.tenant_id NULLS LAST, pr.starts_at DESC
    ),
    -- Level 2: Active Tenant Override
    active_overrides AS (
        SELECT DISTINCT ON (o.feature_key)
            o.id AS ovr_id,
            o.feature_key AS fkey,
            o.value_type AS vtype,
            o.boolean_value AS bval,
            o.integer_value AS ival,
            o.text_value AS tval,
            o.json_value AS jval,
            o.is_unlimited AS unlim
        FROM public.tenant_entitlement_overrides o
        WHERE o.tenant_id = p_tenant_id
          AND o.starts_at <= p_at
          AND (o.expires_at IS NULL OR o.expires_at > p_at)
          AND o.revoked_at IS NULL
        ORDER BY o.feature_key, o.starts_at DESC, o.created_at DESC
    ),
    -- Level 3: Assigned Plan Version Default
    plan_defaults AS (
        SELECT
            pe.feature_key AS fkey,
            pe.value_type AS vtype,
            pe.boolean_value AS bval,
            pe.integer_value AS ival,
            pe.text_value AS tval,
            pe.json_value AS jval,
            pe.is_unlimited AS unlim
        FROM public.plan_entitlements pe
        WHERE pe.plan_version_id = v_sub_plan_version_id
    )
    SELECT
        k.fkey AS feature_key,
        k.vtype AS value_type,
        CASE
            WHEN pr.fkey IS NOT NULL AND k.vtype = 'boolean' THEN false
            WHEN pr.fkey IS NOT NULL AND k.vtype = 'integer' THEN 0::bigint
            WHEN pr.fkey IS NOT NULL THEN NULL
            WHEN o.ovr_id IS NOT NULL THEN o.bval
            WHEN pd.fkey IS NOT NULL THEN pd.bval
            WHEN k.vtype = 'boolean' THEN false
            ELSE NULL
        END AS boolean_value,
        CASE
            WHEN pr.fkey IS NOT NULL THEN 0::bigint
            WHEN o.ovr_id IS NOT NULL THEN o.ival
            WHEN pd.fkey IS NOT NULL THEN pd.ival
            WHEN k.vtype = 'integer' THEN 0::bigint
            ELSE NULL
        END AS integer_value,
        CASE
            WHEN pr.fkey IS NOT NULL THEN NULL
            WHEN o.ovr_id IS NOT NULL THEN o.tval
            WHEN pd.fkey IS NOT NULL THEN pd.tval
            ELSE NULL
        END AS text_value,
        CASE
            WHEN pr.fkey IS NOT NULL THEN NULL
            WHEN o.ovr_id IS NOT NULL THEN o.jval
            WHEN pd.fkey IS NOT NULL THEN pd.jval
            ELSE NULL
        END AS "json_value",
        CASE
            WHEN pr.fkey IS NOT NULL THEN false
            WHEN o.ovr_id IS NOT NULL THEN o.unlim
            WHEN pd.fkey IS NOT NULL THEN pd.unlim
            ELSE false
        END AS is_unlimited,
        CASE
            WHEN pr.fkey IS NOT NULL THEN 'platform_restriction'
            WHEN o.ovr_id IS NOT NULL THEN 'tenant_override'
            WHEN pd.fkey IS NOT NULL THEN 'plan_version'
            ELSE 'default_deny'
        END AS source,
        v_sub_plan_version_id AS plan_version_id,
        o.ovr_id AS override_id
    FROM all_keys k
    LEFT JOIN platform_rest pr ON pr.fkey = k.fkey
    LEFT JOIN active_overrides o ON o.fkey = k.fkey
    LEFT JOIN plan_defaults pd ON pd.fkey = k.fkey;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_effective_tenant_entitlements(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;


-- =========================================================================
-- 12. PUBLIC RPC: get_public_commercial_plan_catalog
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_public_commercial_plan_catalog()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_catalog jsonb;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'plan_code',                p.code,
            'public_name',              p.public_name,
            'sort_order',               p.sort_order,
            'version_number',           pv.version_number,
            'plan_version_id',          pv.id,
            'currency',                 pv.currency,
            'monthly_price',            pv.monthly_price,
            'annual_price',             pv.annual_price,
            'annual_discount_percent',  pv.annual_discount_percent,
            'setup_fee',                pv.setup_fee,
            'trial_days',               pv.trial_days,
            'entitlements',             COALESCE(ents.ent_map, '{}'::jsonb)
        ) ORDER BY p.sort_order ASC
    )
    INTO v_catalog
    FROM public.plans p
    JOIN public.plan_versions pv ON pv.plan_id = p.id AND pv.lifecycle_status = 'published'
    LEFT JOIN LATERAL (
        SELECT jsonb_object_agg(
            pe.feature_key,
            jsonb_build_object(
                'value_type',         pe.value_type,
                'boolean_value',      pe.boolean_value,
                'integer_value',      pe.integer_value,
                'text_value',         pe.text_value,
                'json_value',         pe.json_value,
                'is_unlimited',       pe.is_unlimited,
                'public_label',       fd.public_label,
                'maturity',           fd.maturity,
                'publicly_claimable', fd.publicly_claimable
            )
        ) AS ent_map
        FROM public.plan_entitlements pe
        JOIN public.commercial_feature_definitions fd ON fd.feature_key = pe.feature_key
        WHERE pe.plan_version_id = pv.id
    ) ents ON true
    WHERE p.is_public = true
      AND p.is_active = true
      AND p.is_assignable = true
      AND p.is_legacy = false;

    RETURN COALESCE(v_catalog, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_commercial_plan_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_commercial_plan_catalog() TO anon, authenticated;


-- =========================================================================
-- 13. AUTHENTICATED RPC: get_my_commercial_subscription_snapshot
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_my_commercial_subscription_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id   UUID;
    v_tenant_id UUID;
    v_role      TEXT;
    v_sub_row   RECORD;
    v_plan_row  RECORD;
    v_ver_row   RECORD;
    v_ents      jsonb;
    v_overrides jsonb;
    v_usage     jsonb;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthenticated');
    END IF;

    SELECT up.tenant_id, up.role INTO v_tenant_id, v_role
    FROM public.users_profile up
    WHERE up.id = v_user_id AND up.active = true;

    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'no_tenant_association');
    END IF;

    -- Fetch active subscription
    SELECT s.id, s.plan_id, s.plan_version_id, s.status, s.billing_source, s.billing_mode,
           s.paid_through_date, s.grace_until, s.current_period_start, s.current_period_end,
           s.created_at, s.updated_at
    INTO v_sub_row
    FROM public.subscriptions s
    WHERE s.tenant_id = v_tenant_id
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_sub_row.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'subscription_not_found',
            'tenant_id', v_tenant_id
        );
    END IF;

    -- Fetch assigned plan version and plan metadata
    IF v_sub_row.plan_version_id IS NOT NULL THEN
        SELECT pv.id AS version_id, pv.version_number, pv.currency, pv.monthly_price, pv.annual_price,
               pv.annual_discount_percent, pv.setup_fee, pv.trial_days, pv.lifecycle_status,
               p.code AS plan_code, p.public_name, p.is_legacy
        INTO v_ver_row
        FROM public.plan_versions pv
        JOIN public.plans p ON p.id = pv.plan_id
        WHERE pv.id = v_sub_row.plan_version_id;
    END IF;

    -- Effective entitlements
    SELECT jsonb_object_agg(
        res.feature_key,
        jsonb_build_object(
            'value_type',    res.value_type,
            'boolean_value', res.boolean_value,
            'integer_value', res.integer_value,
            'text_value',    res.text_value,
            'json_value',    res.json_value,
            'is_unlimited',  res.is_unlimited,
            'source',        res.source
        )
    )
    INTO v_ents
    FROM public.resolve_effective_tenant_entitlements(v_tenant_id, now()) res;

    -- Active overrides list
    SELECT jsonb_agg(
        jsonb_build_object(
            'override_id',   o.id,
            'feature_key',   o.feature_key,
            'value_type',    o.value_type,
            'boolean_value', o.boolean_value,
            'integer_value', o.integer_value,
            'text_value',    o.text_value,
            'json_value',    o.json_value,
            'is_unlimited',  o.is_unlimited,
            'starts_at',      o.starts_at,
            'expires_at',     o.expires_at,
            'reason',        o.reason
        ) ORDER BY o.starts_at DESC
    )
    INTO v_overrides
    FROM public.tenant_entitlement_overrides o
    WHERE o.tenant_id = v_tenant_id
      AND o.starts_at <= now()
      AND (o.expires_at IS NULL OR o.expires_at > now())
      AND o.revoked_at IS NULL;

    -- Usage counters
    SELECT jsonb_agg(
        jsonb_build_object(
            'feature_key',    uc.feature_key,
            'period_start',   uc.period_start,
            'period_end',     uc.period_end,
            'used_count',     uc.used_count,
            'reserved_count', uc.reserved_count
        )
    )
    INTO v_usage
    FROM public.usage_counters uc
    WHERE uc.tenant_id = v_tenant_id
      AND uc.period_start <= now()
      AND uc.period_end > now();

    RETURN jsonb_build_object(
        'success',              true,
        'reason_code',           'ok',
        'tenant_id',             v_tenant_id,
        'subscription', jsonb_build_object(
            'subscription_id',    v_sub_row.id,
            'plan_id',            v_sub_row.plan_id,
            'plan_version_id',    v_sub_row.plan_version_id,
            'status',             v_sub_row.status,
            'billing_source',     v_sub_row.billing_source,
            'billing_mode',       v_sub_row.billing_mode,
            'paid_through_date',  v_sub_row.paid_through_date,
            'grace_until',        v_sub_row.grace_until,
            'current_period_start', v_sub_row.current_period_start,
            'current_period_end', v_sub_row.current_period_end
        ),
        'assigned_plan_version', CASE WHEN v_ver_row.version_id IS NOT NULL THEN jsonb_build_object(
            'plan_code',          v_ver_row.plan_code,
            'public_name',        v_ver_row.public_name,
            'version_number',     v_ver_row.version_number,
            'is_legacy',          v_ver_row.is_legacy,
            'currency',           v_ver_row.currency,
            'monthly_price',      v_ver_row.monthly_price,
            'annual_price',       v_ver_row.annual_price,
            'annual_discount_percent', v_ver_row.annual_discount_percent,
            'setup_fee',          v_ver_row.setup_fee,
            'trial_days',         v_ver_row.trial_days
        ) ELSE NULL END,
        'effective_entitlements', COALESCE(v_ents, '{}'::jsonb),
        'active_overrides',       COALESCE(v_overrides, '[]'::jsonb),
        'current_usage_counters', COALESCE(v_usage, '[]'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_commercial_subscription_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_commercial_subscription_snapshot() TO authenticated;


-- =========================================================================
-- 14. SUPER ADMIN RPC: super_admin_get_commercial_catalog
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_get_commercial_catalog()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id   UUID;
    v_catalog   jsonb;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL OR NOT public.is_super_admin(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'plan_id',                  p.id,
            'plan_code',                p.code,
            'public_name',              p.public_name,
            'internal_description',     p.internal_description,
            'is_public',                p.is_public,
            'is_active',                p.is_active,
            'is_assignable',            p.is_assignable,
            'is_legacy',                p.is_legacy,
            'sort_order',               p.sort_order,
            'versions',                 COALESCE(vers.ver_list, '[]'::jsonb)
        ) ORDER BY p.sort_order ASC
    )
    INTO v_catalog
    FROM public.plans p
    LEFT JOIN LATERAL (
        SELECT jsonb_agg(
            jsonb_build_object(
                'version_id',               pv.id,
                'version_number',           pv.version_number,
                'lifecycle_status',         pv.lifecycle_status,
                'currency',                 pv.currency,
                'monthly_price',            pv.monthly_price,
                'annual_price',             pv.annual_price,
                'annual_discount_percent',  pv.annual_discount_percent,
                'setup_fee',                pv.setup_fee,
                'trial_days',               pv.trial_days,
                'effective_from',           pv.effective_from,
                'effective_to',             pv.effective_to,
                'published_at',             pv.published_at,
                'retired_at',               pv.retired_at,
                'internal_note',            pv.internal_note,
                'entitlements',             COALESCE(ents.ent_map, '{}'::jsonb)
            ) ORDER BY pv.version_number DESC
        ) AS ver_list
        FROM public.plan_versions pv
        LEFT JOIN LATERAL (
            SELECT jsonb_object_agg(
                pe.feature_key,
                jsonb_build_object(
                    'value_type',         pe.value_type,
                    'boolean_value',      pe.boolean_value,
                    'integer_value',      pe.integer_value,
                    'text_value',         pe.text_value,
                    'json_value',         pe.json_value,
                    'is_unlimited',       pe.is_unlimited
                )
            ) AS ent_map
            FROM public.plan_entitlements pe
            WHERE pe.plan_version_id = pv.id
        ) ents ON true
        WHERE pv.plan_id = p.id
    ) vers ON true;

    RETURN jsonb_build_object('success', true, 'reason_code', 'ok', 'plans', COALESCE(v_catalog, '[]'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_get_commercial_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.super_admin_get_commercial_catalog() TO authenticated;


-- =========================================================================
-- 15. SUPER ADMIN RPC: super_admin_get_tenant_commercial_snapshot
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_get_tenant_commercial_snapshot(
    p_tenant_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id   UUID;
    v_sub_row   RECORD;
    v_ver_row   RECORD;
    v_ents      jsonb;
    v_overrides jsonb;
    v_events    jsonb;
    v_txs       jsonb;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL OR NOT public.is_super_admin(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_tenant');
    END IF;

    SELECT s.id, s.plan_id, s.plan_version_id, s.status, s.billing_source, s.billing_mode,
           s.paid_through_date, s.grace_until, s.current_period_start, s.current_period_end,
           s.payment_reference_note, s.next_manual_review_at, s.manual_activation_reason,
           s.created_at, s.updated_at
    INTO v_sub_row
    FROM public.subscriptions s
    WHERE s.tenant_id = p_tenant_id
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_sub_row.id IS NOT NULL AND v_sub_row.plan_version_id IS NOT NULL THEN
        SELECT pv.id AS version_id, pv.version_number, pv.currency, pv.monthly_price, pv.annual_price,
               pv.annual_discount_percent, pv.setup_fee, pv.trial_days, pv.lifecycle_status,
               p.code AS plan_code, p.public_name, p.is_legacy
        INTO v_ver_row
        FROM public.plan_versions pv
        JOIN public.plans p ON p.id = pv.plan_id
        WHERE pv.id = v_sub_row.plan_version_id;
    END IF;

    -- Effective entitlements
    SELECT jsonb_object_agg(
        res.feature_key,
        jsonb_build_object(
            'value_type',    res.value_type,
            'boolean_value', res.boolean_value,
            'integer_value', res.integer_value,
            'text_value',    res.text_value,
            'json_value',    res.json_value,
            'is_unlimited',  res.is_unlimited,
            'source',        res.source,
            'override_id',   res.override_id
        )
    )
    INTO v_ents
    FROM public.resolve_effective_tenant_entitlements(p_tenant_id, now()) res;

    -- Overrides
    SELECT jsonb_agg(
        jsonb_build_object(
            'override_id',   o.id,
            'feature_key',   o.feature_key,
            'value_type',    o.value_type,
            'boolean_value', o.boolean_value,
            'integer_value', o.integer_value,
            'text_value',    o.text_value,
            'json_value',    o.json_value,
            'is_unlimited',  o.is_unlimited,
            'starts_at',      o.starts_at,
            'expires_at',     o.expires_at,
            'revoked_at',    o.revoked_at,
            'reason',        o.reason,
            'revoke_reason', o.revoke_reason
        ) ORDER BY o.created_at DESC
    )
    INTO v_overrides
    FROM public.tenant_entitlement_overrides o
    WHERE o.tenant_id = p_tenant_id;

    -- Recent Events Summary (Last 10)
    SELECT jsonb_agg(
        jsonb_build_object(
            'event_id',       se.id,
            'event_type',     se.event_type,
            'internal_reason', se.internal_reason,
            'actor_role',     se.actor_role,
            'effective_at',   se.effective_at,
            'created_at',     se.created_at
        ) ORDER BY se.created_at DESC
    )
    INTO v_events
    FROM (
        SELECT * FROM public.subscription_events
        WHERE tenant_id = p_tenant_id
        ORDER BY created_at DESC LIMIT 10
    ) se;

    -- Recent Transactions Summary (Last 10)
    SELECT jsonb_agg(
        jsonb_build_object(
            'transaction_id',   bt.id,
            'transaction_type', bt.transaction_type,
            'amount',           bt.amount,
            'currency',         bt.currency,
            'billing_mode',     bt.billing_mode,
            'payment_method',   bt.payment_method,
            'reference_note',   bt.reference_note,
            'internal_reason',  bt.internal_reason,
            'occurred_at',      bt.occurred_at
        ) ORDER BY bt.occurred_at DESC
    )
    INTO v_txs
    FROM (
        SELECT * FROM public.billing_transactions
        WHERE tenant_id = p_tenant_id
        ORDER BY occurred_at DESC LIMIT 10
    ) bt;

    RETURN jsonb_build_object(
        'success',              true,
        'reason_code',           'ok',
        'tenant_id',             p_tenant_id,
        'subscription', CASE WHEN v_sub_row.id IS NOT NULL THEN jsonb_build_object(
            'subscription_id',    v_sub_row.id,
            'plan_id',            v_sub_row.plan_id,
            'plan_version_id',    v_sub_row.plan_version_id,
            'status',             v_sub_row.status,
            'billing_source',     v_sub_row.billing_source,
            'billing_mode',       v_sub_row.billing_mode,
            'paid_through_date',  v_sub_row.paid_through_date,
            'grace_until',        v_sub_row.grace_until,
            'payment_reference_note', v_sub_row.payment_reference_note,
            'next_manual_review_at', v_sub_row.next_manual_review_at,
            'manual_activation_reason', v_sub_row.manual_activation_reason,
            'current_period_start', v_sub_row.current_period_start,
            'current_period_end', v_sub_row.current_period_end
        ) ELSE NULL END,
        'assigned_plan_version', CASE WHEN v_ver_row.version_id IS NOT NULL THEN jsonb_build_object(
            'plan_code',          v_ver_row.plan_code,
            'public_name',        v_ver_row.public_name,
            'version_number',     v_ver_row.version_number,
            'is_legacy',          v_ver_row.is_legacy,
            'currency',           v_ver_row.currency,
            'monthly_price',      v_ver_row.monthly_price,
            'annual_price',       v_ver_row.annual_price,
            'annual_discount_percent', v_ver_row.annual_discount_percent,
            'setup_fee',          v_ver_row.setup_fee,
            'trial_days',         v_ver_row.trial_days
        ) ELSE NULL END,
        'effective_entitlements', COALESCE(v_ents, '{}'::jsonb),
        'overrides_history',      COALESCE(v_overrides, '[]'::jsonb),
        'recent_events',          COALESCE(v_events, '[]'::jsonb),
        'recent_transactions',    COALESCE(v_txs, '[]'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_get_tenant_commercial_snapshot(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.super_admin_get_tenant_commercial_snapshot(UUID) TO authenticated;


-- =========================================================================
-- 16. RLS POLICIES & DEFAULT DENY PRIVILEGES FOR NEW TABLES
-- =========================================================================

-- Commercial Feature Definitions
DROP POLICY IF EXISTS "Super Admin Full Access on commercial_feature_definitions" ON public.commercial_feature_definitions;
DROP POLICY IF EXISTS "Public Read Access on commercial_feature_definitions" ON public.commercial_feature_definitions;

CREATE POLICY "Super Admin Full Access on commercial_feature_definitions"
ON public.commercial_feature_definitions FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Public Read Access on commercial_feature_definitions"
ON public.commercial_feature_definitions FOR SELECT TO anon, authenticated
USING (true);

-- Plans
DROP POLICY IF EXISTS "Super Admin Full Access on plans" ON public.plans;
DROP POLICY IF EXISTS "Public Read Access on plans" ON public.plans;

CREATE POLICY "Super Admin Full Access on plans"
ON public.plans FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Public Read Access on plans"
ON public.plans FOR SELECT TO anon, authenticated
USING (is_public = true AND is_active = true);

-- Plan Versions
DROP POLICY IF EXISTS "Super Admin Full Access on plan_versions" ON public.plan_versions;
DROP POLICY IF EXISTS "Public Read Access on plan_versions" ON public.plan_versions;

CREATE POLICY "Super Admin Full Access on plan_versions"
ON public.plan_versions FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Public Read Access on plan_versions"
ON public.plan_versions FOR SELECT TO anon, authenticated
USING (lifecycle_status = 'published');

-- Plan Entitlements
DROP POLICY IF EXISTS "Super Admin Full Access on plan_entitlements" ON public.plan_entitlements;
DROP POLICY IF EXISTS "Public Read Access on plan_entitlements" ON public.plan_entitlements;

CREATE POLICY "Super Admin Full Access on plan_entitlements"
ON public.plan_entitlements FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Public Read Access on plan_entitlements"
ON public.plan_entitlements FOR SELECT TO anon, authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.plan_versions pv
        WHERE pv.id = plan_entitlements.plan_version_id
          AND pv.lifecycle_status = 'published'
    )
);

-- Tenant Entitlement Overrides
DROP POLICY IF EXISTS "Super Admin Full Access on tenant_entitlement_overrides" ON public.tenant_entitlement_overrides;
DROP POLICY IF EXISTS "Tenant Staff Read Access on tenant_entitlement_overrides" ON public.tenant_entitlement_overrides;

CREATE POLICY "Super Admin Full Access on tenant_entitlement_overrides"
ON public.tenant_entitlement_overrides FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant Staff Read Access on tenant_entitlement_overrides"
ON public.tenant_entitlement_overrides FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND up.tenant_id = tenant_entitlement_overrides.tenant_id
    )
);

-- Platform System Restrictions (Strict Client Default-Deny RLS; Internal SECURITY DEFINER Read Only)
DROP POLICY IF EXISTS "Super Admin Full Access on platform_system_restrictions" ON public.platform_system_restrictions;
DROP POLICY IF EXISTS "Public Read Access on platform_system_restrictions" ON public.platform_system_restrictions;
-- RLS remains enabled with ZERO permissive policies for anon or authenticated roles.
-- Direct client/browser table access (SELECT/INSERT/UPDATE/DELETE) is 100% denied.
-- Internal helper public.resolve_effective_tenant_entitlements reads this table via SECURITY DEFINER.

-- Subscription Events
DROP POLICY IF EXISTS "Super Admin Full Access on subscription_events" ON public.subscription_events;
DROP POLICY IF EXISTS "Tenant Staff Read Access on subscription_events" ON public.subscription_events;

CREATE POLICY "Super Admin Full Access on subscription_events"
ON public.subscription_events FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant Staff Read Access on subscription_events"
ON public.subscription_events FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND up.tenant_id = subscription_events.tenant_id
    )
);

-- Billing Transactions
DROP POLICY IF EXISTS "Super Admin Full Access on billing_transactions" ON public.billing_transactions;
DROP POLICY IF EXISTS "Tenant Staff Read Access on billing_transactions" ON public.billing_transactions;

CREATE POLICY "Super Admin Full Access on billing_transactions"
ON public.billing_transactions FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant Staff Read Access on billing_transactions"
ON public.billing_transactions FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND up.tenant_id = billing_transactions.tenant_id
    )
);

-- Usage Counters
DROP POLICY IF EXISTS "Super Admin Full Access on usage_counters" ON public.usage_counters;
DROP POLICY IF EXISTS "Tenant Staff Read Access on usage_counters" ON public.usage_counters;

CREATE POLICY "Super Admin Full Access on usage_counters"
ON public.usage_counters FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant Staff Read Access on usage_counters"
ON public.usage_counters FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND up.tenant_id = usage_counters.tenant_id
    )
);


-- >>> FILE: 20260811_h1b_super_admin_commercial_mutations.sql <<<
-- =========================================================================
-- STAGE H1B — SECURE SUPER ADMIN COMMERCIAL MUTATION BACKEND
-- Migration: 20260811_h1b_super_admin_commercial_mutations.sql
-- Description: Server-authoritative SECURITY DEFINER RPC surface for commercial
--              subscription assignment, status lifecycle, trial management,
--              scheduled plan changes, manual billing transactions, and typed
--              entitlement overrides with concurrency locking and idempotency.
-- Governance: Forward-only migration 36. Payments/iyzico disabled. Production NO-GO.
-- =========================================================================

-- 1. EXTEND SUBSCRIPTIONS TABLE FOR SCHEDULED CHANGES AND PRICING OVERRIDES
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS scheduled_plan_version_id UUID REFERENCES public.plan_versions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS scheduled_change_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS scheduled_change_reason TEXT,
ADD COLUMN IF NOT EXISTS billing_interval TEXT DEFAULT 'monthly' CHECK (billing_interval IS NULL OR billing_interval IN ('monthly', 'annual')),
ADD COLUMN IF NOT EXISTS fixed_discount NUMERIC(10,2) CHECK (fixed_discount IS NULL OR fixed_discount >= 0),
ADD COLUMN IF NOT EXISTS percent_discount NUMERIC(5,2) CHECK (percent_discount IS NULL OR (percent_discount >= 0 AND percent_discount <= 100)),
ADD COLUMN IF NOT EXISTS custom_monthly_price NUMERIC(10,2) CHECK (custom_monthly_price IS NULL OR custom_monthly_price >= 0),
ADD COLUMN IF NOT EXISTS custom_annual_price NUMERIC(10,2) CHECK (custom_annual_price IS NULL OR custom_annual_price >= 0),
ADD COLUMN IF NOT EXISTS trial_start TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_extended_count INT NOT NULL DEFAULT 0 CHECK (trial_extended_count >= 0),
ADD CONSTRAINT chk_subscriptions_discounts_mutual_exclusivity CHECK (
    (fixed_discount IS NULL OR percent_discount IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_scheduled_change
ON public.subscriptions (scheduled_change_at)
WHERE scheduled_plan_version_id IS NOT NULL;


-- 2. SUPER ADMIN COMMERCIAL MUTATION IDEMPOTENCY TABLE
CREATE TABLE IF NOT EXISTS public.super_admin_commercial_mutation_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL UNIQUE CHECK (trim(idempotency_key) != ''),
    actor_user_id UUID NOT NULL REFERENCES auth.users(id),
    rpc_name TEXT NOT NULL CHECK (trim(rpc_name) != ''),
    request_fingerprint TEXT NOT NULL CHECK (trim(request_fingerprint) != ''),
    response_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.super_admin_commercial_mutation_idempotency ENABLE ROW LEVEL SECURITY;

-- Strict default deny RLS on idempotency ledger for browser roles
DROP POLICY IF EXISTS super_admin_idempotency_no_client_read ON public.super_admin_commercial_mutation_idempotency;
CREATE POLICY super_admin_idempotency_no_client_read
ON public.super_admin_commercial_mutation_idempotency
FOR ALL
TO authenticated, anon
USING (false);


-- =========================================================================
-- 3. HELPER: IDEMPOTENCY CHECK AND RECORD
-- =========================================================================

CREATE OR REPLACE FUNCTION public.check_super_admin_idempotency(
    p_idempotency_key TEXT,
    p_rpc_name TEXT,
    p_fingerprint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_rec RECORD;
BEGIN
    IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
        RETURN NULL;
    END IF;

    SELECT actor_user_id, rpc_name, request_fingerprint, response_payload
    INTO v_rec
    FROM public.super_admin_commercial_mutation_idempotency
    WHERE idempotency_key = trim(p_idempotency_key);

    IF v_rec.idempotency_key IS NOT NULL OR v_rec.response_payload IS NOT NULL THEN
        IF v_rec.rpc_name != p_rpc_name OR v_rec.request_fingerprint != p_fingerprint THEN
            RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency key reuse with different parameters or operation.' USING ERRCODE = 'P0001';
        END IF;
        RETURN v_rec.response_payload;
    END IF;

    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_super_admin_idempotency(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.record_super_admin_idempotency(
    p_idempotency_key TEXT,
    p_actor_user_id UUID,
    p_rpc_name TEXT,
    p_fingerprint TEXT,
    p_response_payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
        RETURN;
    END IF;

    INSERT INTO public.super_admin_commercial_mutation_idempotency (
        idempotency_key,
        actor_user_id,
        rpc_name,
        request_fingerprint,
        response_payload
    ) VALUES (
        trim(p_idempotency_key),
        p_actor_user_id,
        p_rpc_name,
        p_fingerprint,
        p_response_payload
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_super_admin_idempotency(TEXT, UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;


-- =========================================================================
-- 4. RPC: super_admin_assign_commercial_plan
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_assign_commercial_plan(
    p_tenant_id UUID,
    p_plan_version_id UUID,
    p_reason TEXT,
    p_billing_mode TEXT DEFAULT 'manual',
    p_billing_interval TEXT DEFAULT 'monthly',
    p_custom_monthly_price NUMERIC DEFAULT NULL,
    p_custom_annual_price NUMERIC DEFAULT NULL,
    p_fixed_discount NUMERIC DEFAULT NULL,
    p_percent_discount NUMERIC DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor_user_id UUID;
    v_fingerprint   TEXT;
    v_cached_resp   JSONB;
    v_sub_id        UUID;
    v_prev_sub      RECORD;
    v_ver_row       RECORD;
    v_plan_row      RECORD;
    v_new_sub       RECORD;
    v_resp          JSONB;
BEGIN
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    IF p_tenant_id IS NULL OR p_plan_version_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_parameters');
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'reason_required');
    END IF;

    IF p_fixed_discount IS NOT NULL AND p_percent_discount IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'conflicting_discounts');
    END IF;

    IF p_percent_discount IS NOT NULL AND (p_percent_discount < 0 OR p_percent_discount > 100) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_discount_percent');
    END IF;

    -- Idempotency check
    v_fingerprint := md5(concat_ws(':', p_tenant_id::text, p_plan_version_id::text, p_billing_mode, p_billing_interval, coalesce(p_custom_monthly_price::text, ''), coalesce(p_custom_annual_price::text, ''), coalesce(p_fixed_discount::text, ''), coalesce(p_percent_discount::text, '')));
    v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_assign_commercial_plan', v_fingerprint);
    IF v_cached_resp IS NOT NULL THEN
        RETURN v_cached_resp;
    END IF;

    -- Lock tenant subscriptions for update
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 42));

    -- Verify target plan version
    SELECT pv.id, pv.plan_id, pv.version_number, pv.lifecycle_status, p.code AS plan_code, p.is_assignable, p.is_legacy
    INTO v_ver_row
    FROM public.plan_versions pv
    JOIN public.plans p ON p.id = pv.plan_id
    WHERE pv.id = p_plan_version_id;

    IF v_ver_row.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'plan_version_not_found');
    END IF;

    IF v_ver_row.lifecycle_status != 'published' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'plan_version_not_published');
    END IF;

    IF NOT v_ver_row.is_assignable OR v_ver_row.is_legacy THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'plan_not_assignable');
    END IF;

    -- Lock active subscription
    SELECT * INTO v_prev_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_prev_sub.id IS NOT NULL THEN
        v_sub_id := v_prev_sub.id;
        UPDATE public.subscriptions
        SET plan_id = v_ver_row.plan_code,
            plan_version_id = v_ver_row.id,
            status = CASE WHEN v_prev_sub.status = 'pending_checkout' THEN 'active' ELSE v_prev_sub.status END,
            billing_mode = coalesce(p_billing_mode, v_prev_sub.billing_mode, 'manual'),
            billing_interval = coalesce(p_billing_interval, v_prev_sub.billing_interval, 'monthly'),
            custom_monthly_price = p_custom_monthly_price,
            custom_annual_price = p_custom_annual_price,
            fixed_discount = p_fixed_discount,
            percent_discount = p_percent_discount,
            scheduled_plan_version_id = NULL,
            scheduled_change_at = NULL,
            scheduled_change_reason = NULL,
            updated_at = now()
        WHERE id = v_sub_id
        RETURNING * INTO v_new_sub;
    ELSE
        INSERT INTO public.subscriptions (
            tenant_id,
            plan_id,
            plan_version_id,
            status,
            billing_source,
            billing_mode,
            billing_interval,
            custom_monthly_price,
            custom_annual_price,
            fixed_discount,
            percent_discount
        ) VALUES (
            p_tenant_id,
            v_ver_row.plan_code,
            v_ver_row.id,
            'active',
            'manual',
            coalesce(p_billing_mode, 'manual'),
            coalesce(p_billing_interval, 'monthly'),
            p_custom_monthly_price,
            p_custom_annual_price,
            p_fixed_discount,
            p_percent_discount
        )
        RETURNING * INTO v_new_sub;
        v_sub_id := v_new_sub.id;
    END IF;

    -- Append audit event
    INSERT INTO public.subscription_events (
        subscription_id,
        tenant_id,
        event_type,
        previous_state,
        new_state,
        internal_reason,
        idempotency_key,
        actor_user_id,
        actor_role
    ) VALUES (
        v_sub_id,
        p_tenant_id,
        'plan_assigned',
        CASE WHEN v_prev_sub.id IS NOT NULL THEN to_jsonb(v_prev_sub) ELSE NULL END,
        to_jsonb(v_new_sub),
        trim(p_reason),
        p_idempotency_key,
        v_actor_user_id,
        'super_admin'
    );

    v_resp := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'subscription_id', v_sub_id,
        'tenant_id', p_tenant_id,
        'plan_code', v_ver_row.plan_code,
        'plan_version_id', v_ver_row.id
    );

    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_assign_commercial_plan', v_fingerprint, v_resp);
    RETURN v_resp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_assign_commercial_plan(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_assign_commercial_plan(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated;


-- =========================================================================
-- 5. RPC: super_admin_change_subscription_status
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_change_subscription_status(
    p_tenant_id UUID,
    p_target_status TEXT,
    p_reason TEXT,
    p_extend_trial_days INT DEFAULT NULL,
    p_paid_through_date TIMESTAMPTZ DEFAULT NULL,
    p_grace_until TIMESTAMPTZ DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor_user_id UUID;
    v_fingerprint   TEXT;
    v_cached_resp   JSONB;
    v_sub           RECORD;
    v_new_sub       RECORD;
    v_new_trial_end TIMESTAMPTZ;
    v_resp          JSONB;
BEGIN
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    IF p_tenant_id IS NULL OR p_target_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_parameters');
    END IF;

    IF p_target_status NOT IN ('pending_checkout', 'trialing', 'active', 'past_due', 'paused', 'suspended', 'cancelled', 'expired') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_status');
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'reason_required');
    END IF;

    -- Idempotency check
    v_fingerprint := md5(concat_ws(':', p_tenant_id::text, p_target_status, coalesce(p_extend_trial_days::text, ''), coalesce(p_paid_through_date::text, ''), coalesce(p_grace_until::text, '')));
    v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_change_subscription_status', v_fingerprint);
    IF v_cached_resp IS NOT NULL THEN
        RETURN v_cached_resp;
    END IF;

    -- Lock tenant subscription
    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_sub.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'subscription_not_found');
    END IF;

    v_new_trial_end := v_sub.trial_end;
    IF p_extend_trial_days IS NOT NULL THEN
        IF p_extend_trial_days <= 0 THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_trial_extension_days');
        END IF;
        v_new_trial_end := coalesce(v_sub.trial_end, now()) + (p_extend_trial_days || ' days')::INTERVAL;
    END IF;

    UPDATE public.subscriptions
    SET status = p_target_status,
        trial_end = v_new_trial_end,
        trial_extended_count = CASE WHEN p_extend_trial_days IS NOT NULL THEN v_sub.trial_extended_count + 1 ELSE v_sub.trial_extended_count END,
        paid_through_date = coalesce(p_paid_through_date, v_sub.paid_through_date),
        grace_until = coalesce(p_grace_until, v_sub.grace_until),
        updated_at = now()
    WHERE id = v_sub.id
    RETURNING * INTO v_new_sub;

    -- Append audit event
    INSERT INTO public.subscription_events (
        subscription_id,
        tenant_id,
        event_type,
        previous_state,
        new_state,
        internal_reason,
        idempotency_key,
        actor_user_id,
        actor_role
    ) VALUES (
        v_sub.id,
        p_tenant_id,
        'status_changed_' || p_target_status,
        to_jsonb(v_sub),
        to_jsonb(v_new_sub),
        trim(p_reason),
        p_idempotency_key,
        v_actor_user_id,
        'super_admin'
    );

    v_resp := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'subscription_id', v_sub.id,
        'previous_status', v_sub.status,
        'new_status', p_target_status
    );

    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_change_subscription_status', v_fingerprint, v_resp);
    RETURN v_resp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_change_subscription_status(UUID, TEXT, TEXT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_change_subscription_status(UUID, TEXT, TEXT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;


-- =========================================================================
-- 6. RPC: super_admin_schedule_plan_change
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_schedule_plan_change(
    p_tenant_id UUID,
    p_target_plan_version_id UUID,
    p_scheduled_change_at TIMESTAMPTZ,
    p_reason TEXT,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor_user_id UUID;
    v_fingerprint   TEXT;
    v_cached_resp   JSONB;
    v_sub           RECORD;
    v_ver_row       RECORD;
    v_new_sub       RECORD;
    v_resp          JSONB;
BEGIN
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    IF p_tenant_id IS NULL OR p_target_plan_version_id IS NULL OR p_scheduled_change_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_parameters');
    END IF;

    IF p_scheduled_change_at <= now() THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'scheduled_time_must_be_in_future');
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'reason_required');
    END IF;

    -- Idempotency check
    v_fingerprint := md5(concat_ws(':', p_tenant_id::text, p_target_plan_version_id::text, p_scheduled_change_at::text));
    v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_schedule_plan_change', v_fingerprint);
    IF v_cached_resp IS NOT NULL THEN
        RETURN v_cached_resp;
    END IF;

    -- Verify target plan version
    SELECT pv.id, pv.plan_id, pv.lifecycle_status, p.code AS plan_code, p.is_assignable, p.is_legacy
    INTO v_ver_row
    FROM public.plan_versions pv
    JOIN public.plans p ON p.id = pv.plan_id
    WHERE pv.id = p_target_plan_version_id;

    IF v_ver_row.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'plan_version_not_found');
    END IF;

    IF v_ver_row.lifecycle_status != 'published' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'plan_version_not_published');
    END IF;

    IF NOT v_ver_row.is_assignable OR v_ver_row.is_legacy THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'plan_not_assignable');
    END IF;

    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_sub.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'subscription_not_found');
    END IF;

    UPDATE public.subscriptions
    SET scheduled_plan_version_id = v_ver_row.id,
        scheduled_change_at = p_scheduled_change_at,
        scheduled_change_reason = trim(p_reason),
        updated_at = now()
    WHERE id = v_sub.id
    RETURNING * INTO v_new_sub;

    INSERT INTO public.subscription_events (
        subscription_id,
        tenant_id,
        event_type,
        previous_state,
        new_state,
        internal_reason,
        idempotency_key,
        actor_user_id,
        actor_role
    ) VALUES (
        v_sub.id,
        p_tenant_id,
        'plan_change_scheduled',
        to_jsonb(v_sub),
        to_jsonb(v_new_sub),
        trim(p_reason),
        p_idempotency_key,
        v_actor_user_id,
        'super_admin'
    );

    v_resp := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'subscription_id', v_sub.id,
        'scheduled_plan_version_id', v_ver_row.id,
        'scheduled_change_at', p_scheduled_change_at
    );

    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_schedule_plan_change', v_fingerprint, v_resp);
    RETURN v_resp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_schedule_plan_change(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_schedule_plan_change(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;


-- =========================================================================
-- 7. RPC: super_admin_cancel_scheduled_plan_change
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_cancel_scheduled_plan_change(
    p_tenant_id UUID,
    p_reason TEXT,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor_user_id UUID;
    v_fingerprint   TEXT;
    v_cached_resp   JSONB;
    v_sub           RECORD;
    v_new_sub       RECORD;
    v_resp          JSONB;
BEGIN
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_parameters');
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'reason_required');
    END IF;

    v_fingerprint := md5(concat_ws(':', p_tenant_id::text, 'cancel_scheduled'));
    v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_cancel_scheduled_plan_change', v_fingerprint);
    IF v_cached_resp IS NOT NULL THEN
        RETURN v_cached_resp;
    END IF;

    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_sub.id IS NULL OR v_sub.scheduled_plan_version_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'no_scheduled_change');
    END IF;

    UPDATE public.subscriptions
    SET scheduled_plan_version_id = NULL,
        scheduled_change_at = NULL,
        scheduled_change_reason = NULL,
        updated_at = now()
    WHERE id = v_sub.id
    RETURNING * INTO v_new_sub;

    INSERT INTO public.subscription_events (
        subscription_id,
        tenant_id,
        event_type,
        previous_state,
        new_state,
        internal_reason,
        idempotency_key,
        actor_user_id,
        actor_role
    ) VALUES (
        v_sub.id,
        p_tenant_id,
        'scheduled_plan_change_cancelled',
        to_jsonb(v_sub),
        to_jsonb(v_new_sub),
        trim(p_reason),
        p_idempotency_key,
        v_actor_user_id,
        'super_admin'
    );

    v_resp := jsonb_build_object('success', true, 'reason_code', 'ok', 'subscription_id', v_sub.id);
    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_cancel_scheduled_plan_change', v_fingerprint, v_resp);
    RETURN v_resp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_cancel_scheduled_plan_change(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_cancel_scheduled_plan_change(UUID, TEXT, TEXT) TO authenticated;


-- =========================================================================
-- 8. RPC: super_admin_record_billing_transaction
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_record_billing_transaction(
    p_tenant_id UUID,
    p_transaction_type TEXT,
    p_amount NUMERIC,
    p_currency TEXT DEFAULT 'TRY',
    p_billing_mode TEXT DEFAULT 'manual',
    p_payment_method TEXT DEFAULT 'bank_transfer',
    p_reference_note TEXT DEFAULT NULL,
    p_related_transaction_id UUID DEFAULT NULL,
    p_internal_reason TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor_user_id UUID;
    v_fingerprint   TEXT;
    v_cached_resp   JSONB;
    v_sub_id        UUID;
    v_rel_tx        RECORD;
    v_new_tx_id     UUID;
    v_resp          JSONB;
BEGIN
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    IF p_tenant_id IS NULL OR p_transaction_type IS NULL OR p_amount IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_parameters');
    END IF;

    IF p_amount < 0 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'negative_amount_invalid');
    END IF;

    IF p_transaction_type NOT IN ('charge', 'payment', 'credit_adjustment', 'debit_adjustment', 'refund', 'reversal', 'void') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_transaction_type');
    END IF;

    IF p_internal_reason IS NULL OR trim(p_internal_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'reason_required');
    END IF;

    -- Idempotency check
    v_fingerprint := md5(concat_ws(':', p_tenant_id::text, p_transaction_type, p_amount::text, p_currency, coalesce(p_related_transaction_id::text, '')));
    v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_record_billing_transaction', v_fingerprint);
    IF v_cached_resp IS NOT NULL THEN
        RETURN v_cached_resp;
    END IF;

    -- Validate related transaction linkage for refunds/reversals
    IF p_related_transaction_id IS NOT NULL THEN
        SELECT * INTO v_rel_tx
        FROM public.billing_transactions
        WHERE id = p_related_transaction_id;

        IF v_rel_tx.id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'related_transaction_not_found');
        END IF;

        IF v_rel_tx.tenant_id != p_tenant_id THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'cross_tenant_transaction_linkage_rejected');
        END IF;
    END IF;

    -- Get subscription_id
    SELECT id INTO v_sub_id
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    INSERT INTO public.billing_transactions (
        tenant_id,
        subscription_id,
        transaction_type,
        amount,
        currency,
        billing_mode,
        payment_method,
        related_transaction_id,
        reference_note,
        internal_reason,
        created_by,
        idempotency_key
    ) VALUES (
        p_tenant_id,
        v_sub_id,
        p_transaction_type,
        p_amount,
        upper(p_currency),
        p_billing_mode,
        p_payment_method,
        p_related_transaction_id,
        p_reference_note,
        trim(p_internal_reason),
        v_actor_user_id,
        p_idempotency_key
    )
    RETURNING id INTO v_new_tx_id;

    v_resp := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'transaction_id', v_new_tx_id,
        'tenant_id', p_tenant_id,
        'amount', p_amount,
        'transaction_type', p_transaction_type
    );

    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_record_billing_transaction', v_fingerprint, v_resp);
    RETURN v_resp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_record_billing_transaction(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_record_billing_transaction(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;


-- =========================================================================
-- 9. RPC: super_admin_manage_tenant_entitlement_override
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_manage_tenant_entitlement_override(
    p_tenant_id UUID,
    p_feature_key TEXT,
    p_action TEXT, -- 'create' or 'revoke'
    p_value_type TEXT DEFAULT NULL,
    p_boolean_value BOOLEAN DEFAULT NULL,
    p_integer_value BIGINT DEFAULT NULL,
    p_text_value TEXT DEFAULT NULL,
    p_json_value JSONB DEFAULT NULL,
    p_is_unlimited BOOLEAN DEFAULT false,
    p_starts_at TIMESTAMPTZ DEFAULT now(),
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor_user_id UUID;
    v_fingerprint   TEXT;
    v_cached_resp   JSONB;
    v_fd            RECORD;
    v_ovr_id        UUID;
    v_resp          JSONB;
BEGIN
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    IF p_tenant_id IS NULL OR p_feature_key IS NULL OR p_action NOT IN ('create', 'revoke') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_parameters');
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'reason_required');
    END IF;

    -- Verify feature key exists
    SELECT * INTO v_fd
    FROM public.commercial_feature_definitions
    WHERE feature_key = p_feature_key;

    IF v_fd.feature_key IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'feature_key_not_found');
    END IF;

    -- Idempotency check
    v_fingerprint := md5(concat_ws(':', p_tenant_id::text, p_feature_key, p_action, coalesce(p_value_type, ''), coalesce(p_starts_at::text, '')));
    v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_manage_tenant_entitlement_override', v_fingerprint);
    IF v_cached_resp IS NOT NULL THEN
        RETURN v_cached_resp;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(concat(p_tenant_id::text, ':', p_feature_key), 99));

    IF p_action = 'revoke' THEN
        UPDATE public.tenant_entitlement_overrides
        SET revoked_at = now(),
            revoked_by = v_actor_user_id,
            revoke_reason = trim(p_reason)
        WHERE tenant_id = p_tenant_id
          AND feature_key = p_feature_key
          AND revoked_at IS NULL;

        v_resp := jsonb_build_object('success', true, 'reason_code', 'ok', 'action', 'revoked');
    ELSE
        -- Verify type matches definition
        IF p_value_type IS NULL OR p_value_type != v_fd.value_type THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'value_type_mismatch');
        END IF;

        -- Automatically revoke previous active override for this feature/tenant
        UPDATE public.tenant_entitlement_overrides
        SET revoked_at = now(),
            revoked_by = v_actor_user_id,
            revoke_reason = 'Superseded by new override'
        WHERE tenant_id = p_tenant_id
          AND feature_key = p_feature_key
          AND revoked_at IS NULL;

        INSERT INTO public.tenant_entitlement_overrides (
            tenant_id,
            feature_key,
            value_type,
            boolean_value,
            integer_value,
            text_value,
            json_value,
            is_unlimited,
            starts_at,
            expires_at,
            reason,
            created_by
        ) VALUES (
            p_tenant_id,
            p_feature_key,
            p_value_type,
            p_boolean_value,
            p_integer_value,
            p_text_value,
            p_json_value,
            coalesce(p_is_unlimited, false),
            coalesce(p_starts_at, now()),
            p_expires_at,
            trim(p_reason),
            v_actor_user_id
        )
        RETURNING id INTO v_ovr_id;

        v_resp := jsonb_build_object(
            'success', true,
            'reason_code', 'ok',
            'override_id', v_ovr_id,
            'feature_key', p_feature_key,
            'action', 'created'
        );
    END IF;

    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_manage_tenant_entitlement_override', v_fingerprint, v_resp);
    RETURN v_resp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_manage_tenant_entitlement_override(UUID, TEXT, TEXT, TEXT, BOOLEAN, BIGINT, TEXT, JSONB, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_manage_tenant_entitlement_override(UUID, TEXT, TEXT, TEXT, BOOLEAN, BIGINT, TEXT, JSONB, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;


-- >>> FILE: 20260812_h1b_apply_due_scheduled_plan_change_rpc.sql <<<
-- =========================================================================
-- STAGE H1B — DUE SCHEDULED PLAN CHANGE EXECUTOR RPC
-- Migration: 20260812_h1b_apply_due_scheduled_plan_change_rpc.sql
-- Description: Server-authoritative SECURITY DEFINER RPC to apply a due
--              scheduled plan change for a tenant subscription with full
--              re-validation, atomic status update, locking, idempotency, and audit logging.
-- Governance: Forward-only migration 37. Payments/iyzico disabled. Production NO-GO.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_apply_due_scheduled_plan_change(
    p_tenant_id UUID,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor_user_id UUID;
    v_fingerprint   TEXT;
    v_cached_resp   JSONB;
    v_sub           RECORD;
    v_ver_row       RECORD;
    v_new_sub       RECORD;
    v_resp          JSONB;
BEGIN
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_parameters');
    END IF;

    -- Idempotency check
    v_fingerprint := md5(concat_ws(':', p_tenant_id::text, 'apply_due_scheduled_plan_change'));
    v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_apply_due_scheduled_plan_change', v_fingerprint);
    IF v_cached_resp IS NOT NULL THEN
        RETURN v_cached_resp;
    END IF;

    -- Lock tenant subscription
    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_sub.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'subscription_not_found');
    END IF;

    IF v_sub.scheduled_plan_version_id IS NULL OR v_sub.scheduled_change_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'no_scheduled_change');
    END IF;

    IF v_sub.scheduled_change_at > now() THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'scheduled_change_not_due');
    END IF;

    -- Re-validate target plan version at execution time
    SELECT pv.id, pv.plan_id, pv.lifecycle_status, p.code AS plan_code, p.is_assignable, p.is_legacy
    INTO v_ver_row
    FROM public.plan_versions pv
    JOIN public.plans p ON p.id = pv.plan_id
    WHERE pv.id = v_sub.scheduled_plan_version_id;

    IF v_ver_row.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'target_plan_version_not_found');
    END IF;

    IF v_ver_row.lifecycle_status != 'published' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'target_plan_version_not_published');
    END IF;

    IF NOT v_ver_row.is_assignable OR v_ver_row.is_legacy THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'target_plan_not_assignable');
    END IF;

    -- Apply scheduled change atomically
    UPDATE public.subscriptions
    SET plan_id = v_ver_row.plan_code,
        plan_version_id = v_ver_row.id,
        scheduled_plan_version_id = NULL,
        scheduled_change_at = NULL,
        scheduled_change_reason = NULL,
        updated_at = now()
    WHERE id = v_sub.id
    RETURNING * INTO v_new_sub;

    -- Append audit event
    INSERT INTO public.subscription_events (
        subscription_id,
        tenant_id,
        event_type,
        previous_state,
        new_state,
        internal_reason,
        idempotency_key,
        actor_user_id,
        actor_role
    ) VALUES (
        v_sub.id,
        p_tenant_id,
        'due_scheduled_plan_change_applied',
        to_jsonb(v_sub),
        to_jsonb(v_new_sub),
        coalesce(v_sub.scheduled_change_reason, 'Applied due scheduled plan change'),
        p_idempotency_key,
        v_actor_user_id,
        'super_admin'
    );

    v_resp := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'subscription_id', v_sub.id,
        'previous_plan_version_id', v_sub.plan_version_id,
        'new_plan_version_id', v_ver_row.id,
        'plan_code', v_ver_row.plan_code
    );

    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_apply_due_scheduled_plan_change', v_fingerprint, v_resp);
    RETURN v_resp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_apply_due_scheduled_plan_change(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_apply_due_scheduled_plan_change(UUID, TEXT) TO authenticated;


-- >>> FILE: 20260813_h1c_commercial_eligibility_and_quota_enforcement.sql <<<
-- =========================================================================
-- STAGE H1C — SERVER-AUTHORITATIVE COMMERCIAL ELIGIBILITY & QUOTA ENFORCEMENT
-- Migration: 20260813_h1c_commercial_eligibility_and_quota_enforcement.sql
-- Description: Implements server-authoritative commercial eligibility checks,
--              feature gates, staff/service/branch quotas, monthly appointment
--              quota with concurrency-safe usage accounting, and enforcement
--              diagnostics. All enforcement occurs inside the mutation transaction.
-- Governance: Forward-only migration 38. Payments/iyzico disabled. Production NO-GO.
-- =========================================================================

-- =========================================================================
-- SECTION 0: CANONICAL STAGING TENANT COMMERCIAL BOOTSTRAP
-- Persistent staging configuration, not a disposable test fixture.
-- =========================================================================

DO $$
DECLARE
    v_tenant_id    UUID := 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
    v_plan_ver_id  UUID;
    v_sub_id       UUID;
BEGIN
    -- Get baslangic Version 1 published plan_version_id
    SELECT pv.id INTO v_plan_ver_id
    FROM public.plan_versions pv
    JOIN public.plans p ON p.id = pv.plan_id
    WHERE p.code = 'baslangic'
      AND pv.version_number = 1
      AND pv.lifecycle_status = 'published'
    LIMIT 1;

    IF v_plan_ver_id IS NULL THEN
        RAISE EXCEPTION 'Cannot bootstrap: baslangic Version 1 published plan not found';
    END IF;

    -- Check if canonical tenant already has a subscription
    SELECT id INTO v_sub_id
    FROM public.subscriptions
    WHERE tenant_id = v_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_sub_id IS NOT NULL THEN
        -- Update existing subscription to active baslangic
        UPDATE public.subscriptions
        SET plan_id = 'baslangic',
            plan_version_id = v_plan_ver_id,
            status = 'active',
            billing_mode = 'manual',
            current_period_start = now(),
            current_period_end = now() + interval '1 year',
            updated_at = now()
        WHERE id = v_sub_id;
    ELSE
        -- Insert new canonical subscription
        INSERT INTO public.subscriptions (
            tenant_id, plan_id, plan_version_id, status, billing_mode,
            current_period_start, current_period_end
        ) VALUES (
            v_tenant_id, 'baslangic', v_plan_ver_id, 'active', 'manual',
            now(), now() + interval '1 year'
        )
        RETURNING id INTO v_sub_id;
    END IF;

    -- Record bootstrap event
    INSERT INTO public.subscription_events (
        subscription_id, tenant_id, event_type,
        previous_state, new_state, internal_reason,
        actor_role
    )
    SELECT
        s.id, v_tenant_id, 'plan_assigned',
        '{}'::jsonb,
        to_jsonb(s),
        'H1C staging commercial enforcement bootstrap',
        'system'
    FROM public.subscriptions s
    WHERE s.id = v_sub_id;

    RAISE NOTICE 'Canonical tenant bootstrapped with baslangic Version 1 active/manual';
END;
$$;

-- Ensure usage_counters has period_key and usage_count columns
ALTER TABLE public.usage_counters
ADD COLUMN IF NOT EXISTS period_key TEXT NOT NULL DEFAULT 'lifetime',
ADD COLUMN IF NOT EXISTS usage_count BIGINT NOT NULL DEFAULT 0 CHECK (usage_count >= 0);

-- Drop old primary key and recreate with period_key if needed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'usage_counters_pkey_period_key'
    ) THEN
        ALTER TABLE public.usage_counters DROP CONSTRAINT IF EXISTS usage_counters_pkey;
        ALTER TABLE public.usage_counters ADD CONSTRAINT usage_counters_pkey_period_key PRIMARY KEY (tenant_id, feature_key, period_key);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL; -- Ignore if constraint modification already applied
END;
$$;

-- =========================================================================
-- SECTION 1: INTERNAL HELPERS (NOT browser-callable)
-- =========================================================================

-- 10. Forward-fix resolve_effective_tenant_entitlements CASE type mismatch (boolean_value)
CREATE OR REPLACE FUNCTION public.resolve_effective_tenant_entitlements(
    p_tenant_id UUID,
    p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
    feature_key TEXT,
    value_type TEXT,
    boolean_value BOOLEAN,
    integer_value BIGINT,
    text_value TEXT,
    "json_value" JSONB,
    is_unlimited BOOLEAN,
    source TEXT,
    plan_version_id UUID,
    override_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_sub_plan_version_id UUID;
BEGIN
    IF p_tenant_id IS NULL THEN
        RETURN;
    END IF;

    -- Resolve active subscription's plan_version_id for this tenant
    SELECT sub.plan_version_id INTO v_sub_plan_version_id
    FROM public.subscriptions sub
    WHERE sub.tenant_id = p_tenant_id
      AND sub.status IN ('active', 'manual_active', 'comped', 'trialing')
      AND (sub.current_period_end IS NULL OR sub.current_period_end > p_at)
    ORDER BY sub.created_at DESC
    LIMIT 1;

    RETURN QUERY
    WITH all_keys AS (
        SELECT f.feature_key AS fkey, f.value_type AS vtype
        FROM public.commercial_feature_definitions f
    ),
    -- Level 1: Platform / System Restriction (Highest Precedence)
    platform_rest AS (
        SELECT DISTINCT ON (pr.feature_key)
            pr.feature_key AS fkey
        FROM public.platform_system_restrictions pr
        WHERE (pr.tenant_id = p_tenant_id OR pr.tenant_id IS NULL)
          AND pr.is_restricted = true
          AND pr.starts_at <= p_at
          AND (pr.expires_at IS NULL OR pr.expires_at > p_at)
        ORDER BY pr.feature_key, pr.tenant_id NULLS LAST, pr.starts_at DESC
    ),
    -- Level 2: Active Tenant Override
    active_overrides AS (
        SELECT DISTINCT ON (o.feature_key)
            o.id AS ovr_id,
            o.feature_key AS fkey,
            o.value_type AS vtype,
            o.boolean_value AS bval,
            o.integer_value AS ival,
            o.text_value AS tval,
            o.json_value AS jval,
            o.is_unlimited AS unlim
        FROM public.tenant_entitlement_overrides o
        WHERE o.tenant_id = p_tenant_id
          AND o.starts_at <= p_at
          AND (o.expires_at IS NULL OR o.expires_at > p_at)
          AND o.revoked_at IS NULL
        ORDER BY o.feature_key, o.starts_at DESC, o.created_at DESC
    ),
    -- Level 3: Assigned Plan Version Default
    plan_defaults AS (
        SELECT
            pe.feature_key AS fkey,
            pe.value_type AS vtype,
            pe.boolean_value AS bval,
            pe.integer_value AS ival,
            pe.text_value AS tval,
            pe.json_value AS jval,
            pe.is_unlimited AS unlim
        FROM public.plan_entitlements pe
        WHERE pe.plan_version_id = v_sub_plan_version_id
    )
    SELECT
        k.fkey AS feature_key,
        k.vtype AS value_type,
        CASE
            WHEN pr.fkey IS NOT NULL AND k.vtype = 'boolean' THEN false
            WHEN pr.fkey IS NOT NULL THEN NULL
            WHEN o.ovr_id IS NOT NULL THEN o.bval
            WHEN pd.fkey IS NOT NULL THEN pd.bval
            WHEN k.vtype = 'boolean' THEN false
            ELSE NULL
        END AS boolean_value,
        CASE
            WHEN pr.fkey IS NOT NULL THEN 0::bigint
            WHEN o.ovr_id IS NOT NULL THEN o.ival
            WHEN pd.fkey IS NOT NULL THEN pd.ival
            WHEN k.vtype = 'integer' THEN 0::bigint
            ELSE NULL
        END AS integer_value,
        CASE
            WHEN pr.fkey IS NOT NULL THEN NULL
            WHEN o.ovr_id IS NOT NULL THEN o.tval
            WHEN pd.fkey IS NOT NULL THEN pd.tval
            ELSE NULL
        END AS text_value,
        CASE
            WHEN pr.fkey IS NOT NULL THEN NULL
            WHEN o.ovr_id IS NOT NULL THEN o.jval
            WHEN pd.fkey IS NOT NULL THEN pd.jval
            ELSE NULL
        END AS "json_value",
        CASE
            WHEN pr.fkey IS NOT NULL THEN false
            WHEN o.ovr_id IS NOT NULL THEN o.unlim
            WHEN pd.fkey IS NOT NULL THEN pd.unlim
            ELSE false
        END AS is_unlimited,
        CASE
            WHEN pr.fkey IS NOT NULL THEN 'platform_restriction'
            WHEN o.ovr_id IS NOT NULL THEN 'tenant_override'
            WHEN pd.fkey IS NOT NULL THEN 'plan_version'
            ELSE 'default_deny'
        END AS source,
        v_sub_plan_version_id AS plan_version_id,
        o.ovr_id AS override_id
    FROM all_keys k
    LEFT JOIN platform_rest pr ON pr.fkey = k.fkey
    LEFT JOIN active_overrides o ON o.fkey = k.fkey
    LEFT JOIN plan_defaults pd ON pd.fkey = k.fkey;
END;
$$;

-- 1a. Resolve tenant commercial eligibility
CREATE OR REPLACE FUNCTION public.resolve_tenant_commercial_eligibility(
    p_tenant_id UUID,
    p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_sub RECORD;
BEGIN
    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object('eligible', false, 'reason_code', 'commercial_tenant_not_found');
    END IF;

    -- Check tenant exists
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
        RETURN jsonb_build_object('eligible', false, 'reason_code', 'commercial_tenant_not_found');
    END IF;

    -- Get most recent subscription
    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_sub.id IS NULL THEN
        RETURN jsonb_build_object('eligible', false, 'reason_code', 'commercial_subscription_missing');
    END IF;

    IF v_sub.plan_version_id IS NULL THEN
        RETURN jsonb_build_object('eligible', false, 'reason_code', 'commercial_plan_version_missing');
    END IF;

    -- Validate plan version is published
    IF NOT EXISTS (
        SELECT 1 FROM public.plan_versions
        WHERE id = v_sub.plan_version_id AND lifecycle_status = 'published'
    ) THEN
        RETURN jsonb_build_object('eligible', false, 'reason_code', 'commercial_plan_version_not_effective');
    END IF;

    -- Lifecycle status check
    IF v_sub.status = 'active' THEN
        RETURN jsonb_build_object(
            'eligible', true, 'reason_code', 'commercial_allowed',
            'subscription_id', v_sub.id, 'plan_version_id', v_sub.plan_version_id,
            'status', v_sub.status
        );
    END IF;

    IF v_sub.status = 'trialing' THEN
        IF v_sub.trial_end IS NOT NULL AND p_at >= v_sub.trial_end THEN
            RETURN jsonb_build_object('eligible', false, 'reason_code', 'commercial_trial_expired');
        END IF;
        RETURN jsonb_build_object(
            'eligible', true, 'reason_code', 'commercial_allowed',
            'subscription_id', v_sub.id, 'plan_version_id', v_sub.plan_version_id,
            'status', v_sub.status, 'trial_end', v_sub.trial_end
        );
    END IF;

    IF v_sub.status = 'past_due' THEN
        IF v_sub.grace_until IS NOT NULL AND p_at >= v_sub.grace_until THEN
            RETURN jsonb_build_object('eligible', false, 'reason_code', 'commercial_grace_expired');
        END IF;
        RETURN jsonb_build_object(
            'eligible', true, 'reason_code', 'commercial_allowed',
            'subscription_id', v_sub.id, 'plan_version_id', v_sub.plan_version_id,
            'status', v_sub.status, 'grace_until', v_sub.grace_until
        );
    END IF;

    -- All other statuses: denied
    RETURN jsonb_build_object('eligible', false, 'reason_code', 'commercial_status_not_eligible');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_tenant_commercial_eligibility(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- 1b. Assert tenant commercial action allowed (eligibility + feature gate)
CREATE OR REPLACE FUNCTION public.assert_tenant_commercial_action_allowed(
    p_tenant_id UUID,
    p_feature_key TEXT,
    p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_elig       JSONB;
    v_ent_row    RECORD;
BEGIN
    -- Check eligibility first
    v_elig := public.resolve_tenant_commercial_eligibility(p_tenant_id, p_at);
    IF NOT (v_elig->>'eligible')::boolean THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', v_elig->>'reason_code');
    END IF;

    -- Check feature entitlement via 4-level resolver
    SELECT * INTO v_ent_row
    FROM public.resolve_effective_tenant_entitlements(p_tenant_id)
    WHERE feature_key = p_feature_key;

    IF v_ent_row.feature_key IS NULL THEN
        -- Feature key not found means default deny
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'commercial_feature_disabled');
    END IF;

    -- Boolean features: must be true
    IF v_ent_row.value_type = 'boolean' THEN
        IF v_ent_row.boolean_value IS NOT TRUE THEN
            RETURN jsonb_build_object('allowed', false, 'reason_code', 'commercial_feature_disabled');
        END IF;
    END IF;

    RETURN jsonb_build_object('allowed', true, 'reason_code', 'commercial_allowed');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_tenant_commercial_action_allowed(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- 1c. Resolve commercial quota for a feature key
CREATE OR REPLACE FUNCTION public.resolve_commercial_quota(
    p_tenant_id UUID,
    p_feature_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_ent_row RECORD;
BEGIN
    SELECT * INTO v_ent_row
    FROM public.resolve_effective_tenant_entitlements(p_tenant_id)
    WHERE feature_key = p_feature_key;

    IF v_ent_row.feature_key IS NULL THEN
        RETURN jsonb_build_object('is_unlimited', false, 'limit_value', 0);
    END IF;

    IF v_ent_row.is_unlimited IS TRUE THEN
        RETURN jsonb_build_object('is_unlimited', true, 'limit_value', NULL);
    END IF;

    IF v_ent_row.value_type = 'integer' AND v_ent_row.integer_value IS NOT NULL THEN
        RETURN jsonb_build_object('is_unlimited', false, 'limit_value', v_ent_row.integer_value);
    END IF;

    -- No integer value and not unlimited = zero allowed
    RETURN jsonb_build_object('is_unlimited', false, 'limit_value', 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_commercial_quota(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- 1d. Resolve quota period key (YYYY-MM for monthly, 'lifetime' for non-periodic)
CREATE OR REPLACE FUNCTION public.resolve_quota_period_key(
    p_tenant_id UUID,
    p_feature_key TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_tz TEXT;
BEGIN
    IF p_feature_key = 'max_monthly_appointments' THEN
        -- Use primary branch timezone, fallback to Europe/Istanbul
        SELECT COALESCE(timezone, 'Europe/Istanbul') INTO v_tz
        FROM public.branches
        WHERE tenant_id = p_tenant_id AND is_primary = true AND is_active = true
        LIMIT 1;

        IF v_tz IS NULL THEN
            v_tz := 'Europe/Istanbul';
        END IF;

        RETURN to_char(timezone(v_tz, now()), 'YYYY-MM');
    END IF;

    RETURN 'lifetime';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_quota_period_key(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- 1e. Consume commercial usage atomically
CREATE OR REPLACE FUNCTION public.consume_commercial_usage(
    p_tenant_id UUID,
    p_feature_key TEXT,
    p_period_key TEXT,
    p_delta INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_quota        JSONB;
    v_is_unlimited BOOLEAN;
    v_limit        BIGINT;
    v_current      BIGINT;
    v_lock_key     BIGINT;
    v_pstart       TIMESTAMPTZ;
    v_pend         TIMESTAMPTZ;
BEGIN
    -- Resolve period timestamps
    IF p_period_key ~ '^\d{4}-\d{2}$' THEN
        v_pstart := to_timestamp(p_period_key || '-01 00:00:00', 'YYYY-MM-DD HH24:MI:SS');
        v_pend   := v_pstart + interval '1 month';
    ELSE
        v_pstart := '1970-01-01 00:00:00+00'::timestamptz;
        v_pend   := '9999-12-31 23:59:59+00'::timestamptz;
    END IF;

    -- Resolve quota
    v_quota := public.resolve_commercial_quota(p_tenant_id, p_feature_key);
    v_is_unlimited := (v_quota->>'is_unlimited')::boolean;

    IF v_is_unlimited THEN
        -- Still track usage but never reject
        INSERT INTO public.usage_counters (tenant_id, feature_key, period_start, period_end, period_key, usage_count, used_count)
        VALUES (p_tenant_id, p_feature_key, v_pstart, v_pend, p_period_key, p_delta, p_delta)
        ON CONFLICT (tenant_id, feature_key, period_key)
        DO UPDATE SET usage_count = public.usage_counters.usage_count + p_delta,
                      used_count = public.usage_counters.used_count + p_delta,
                      updated_at = now();

        SELECT usage_count INTO v_current
        FROM public.usage_counters
        WHERE tenant_id = p_tenant_id AND feature_key = p_feature_key AND period_key = p_period_key;

        RETURN jsonb_build_object('success', true, 'reason_code', 'commercial_allowed',
            'current_usage', v_current, 'limit_value', NULL, 'is_unlimited', true);
    END IF;

    v_limit := (v_quota->>'limit_value')::bigint;

    -- Acquire deterministic lock for this tenant+feature+period
    v_lock_key := hashtextextended(p_tenant_id::text || ':' || p_feature_key || ':' || p_period_key, 0);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- Upsert with initial 0 if missing, then read current
    INSERT INTO public.usage_counters (tenant_id, feature_key, period_start, period_end, period_key, usage_count, used_count)
    VALUES (p_tenant_id, p_feature_key, v_pstart, v_pend, p_period_key, 0, 0)
    ON CONFLICT (tenant_id, feature_key, period_key) DO NOTHING;

    SELECT usage_count INTO v_current
    FROM public.usage_counters
    WHERE tenant_id = p_tenant_id AND feature_key = p_feature_key AND period_key = p_period_key
    FOR UPDATE;

    -- Check quota
    IF v_current + p_delta > v_limit THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'commercial_quota_exceeded',
            'current_usage', v_current, 'limit_value', v_limit, 'is_unlimited', false);
    END IF;

    -- Consume
    UPDATE public.usage_counters
    SET usage_count = usage_count + p_delta,
        used_count = used_count + p_delta,
        updated_at = now()
    WHERE tenant_id = p_tenant_id AND feature_key = p_feature_key AND period_key = p_period_key;

    RETURN jsonb_build_object('success', true, 'reason_code', 'commercial_allowed',
        'current_usage', v_current + p_delta, 'limit_value', v_limit, 'is_unlimited', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_commercial_usage(UUID, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- SECTION 2: QUOTA ENFORCEMENT TRIGGERS (staff, services, branches)
-- =========================================================================

-- 2a. Staff quota trigger
CREATE OR REPLACE FUNCTION public.enforce_staff_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_quota      JSONB;
    v_is_unlimited BOOLEAN;
    v_limit      BIGINT;
    v_count      BIGINT;
    v_lock_key   BIGINT;
BEGIN
    -- Only enforce on active insert or reactivation
    IF TG_OP = 'INSERT' AND NEW.active IS NOT TRUE THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.active = true AND NEW.active = true THEN
            RETURN NEW; -- not changing active count
        END IF;
        IF NEW.active IS NOT TRUE THEN
            RETURN NEW; -- deactivation always allowed
        END IF;
    END IF;

    -- Resolve quota
    v_quota := public.resolve_commercial_quota(NEW.tenant_id, 'max_staff');
    v_is_unlimited := (v_quota->>'is_unlimited')::boolean;
    IF v_is_unlimited THEN
        RETURN NEW;
    END IF;
    v_limit := (v_quota->>'limit_value')::bigint;

    -- Lock and count
    v_lock_key := hashtextextended(NEW.tenant_id::text || ':max_staff', 0);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    SELECT count(*) INTO v_count
    FROM public.staff
    WHERE tenant_id = NEW.tenant_id AND active = true AND id != NEW.id;

    IF v_count >= v_limit THEN
        RAISE EXCEPTION 'commercial_quota_exceeded' USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_staff_quota ON public.staff;
CREATE TRIGGER trg_enforce_staff_quota
    BEFORE INSERT OR UPDATE ON public.staff
    FOR EACH ROW EXECUTE FUNCTION public.enforce_staff_quota();

-- 2b. Service quota trigger
CREATE OR REPLACE FUNCTION public.enforce_service_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_quota      JSONB;
    v_is_unlimited BOOLEAN;
    v_limit      BIGINT;
    v_count      BIGINT;
    v_lock_key   BIGINT;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.active IS NOT TRUE THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.active = true AND NEW.active = true THEN
            RETURN NEW;
        END IF;
        IF NEW.active IS NOT TRUE THEN
            RETURN NEW;
        END IF;
    END IF;

    v_quota := public.resolve_commercial_quota(NEW.tenant_id, 'max_services');
    v_is_unlimited := (v_quota->>'is_unlimited')::boolean;
    IF v_is_unlimited THEN
        RETURN NEW;
    END IF;
    v_limit := (v_quota->>'limit_value')::bigint;

    v_lock_key := hashtextextended(NEW.tenant_id::text || ':max_services', 0);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    SELECT count(*) INTO v_count
    FROM public.services
    WHERE tenant_id = NEW.tenant_id AND active = true AND id != NEW.id;

    IF v_count >= v_limit THEN
        RAISE EXCEPTION 'commercial_quota_exceeded' USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_service_quota ON public.services;
CREATE TRIGGER trg_enforce_service_quota
    BEFORE INSERT OR UPDATE ON public.services
    FOR EACH ROW EXECUTE FUNCTION public.enforce_service_quota();

-- 2c. Branch quota trigger
CREATE OR REPLACE FUNCTION public.enforce_branch_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_quota      JSONB;
    v_is_unlimited BOOLEAN;
    v_limit      BIGINT;
    v_count      BIGINT;
    v_lock_key   BIGINT;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.is_active IS NOT TRUE THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.is_active = true AND NEW.is_active = true THEN
            RETURN NEW;
        END IF;
        IF NEW.is_active IS NOT TRUE THEN
            RETURN NEW;
        END IF;
    END IF;

    v_quota := public.resolve_commercial_quota(NEW.tenant_id, 'max_branches');
    v_is_unlimited := (v_quota->>'is_unlimited')::boolean;
    IF v_is_unlimited THEN
        RETURN NEW;
    END IF;
    v_limit := (v_quota->>'limit_value')::bigint;

    v_lock_key := hashtextextended(NEW.tenant_id::text || ':max_branches', 0);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    SELECT count(*) INTO v_count
    FROM public.branches
    WHERE tenant_id = NEW.tenant_id AND is_active = true AND id != NEW.id;

    IF v_count >= v_limit THEN
        RAISE EXCEPTION 'commercial_quota_exceeded' USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_branch_quota ON public.branches;
CREATE TRIGGER trg_enforce_branch_quota
    BEFORE INSERT OR UPDATE ON public.branches
    FOR EACH ROW EXECUTE FUNCTION public.enforce_branch_quota();

-- =========================================================================
-- SECTION 3: UPDATED PUBLIC BOOKING RPCs
-- =========================================================================

-- 3a. Updated can_accept_public_booking with commercial eligibility
CREATE OR REPLACE FUNCTION public.can_accept_public_booking(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_tenant_id uuid;
    v_status text;
    v_onboarding_status text;
    v_public_site_status text;
    v_elig jsonb;
    v_action jsonb;
BEGIN
    -- 1. Resolve tenant details by slug
    SELECT id, status, onboarding_status, public_site_status
    INTO v_tenant_id, v_status, v_onboarding_status, v_public_site_status
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false, 'allowed', false, 'reason_code', 'tenant_not_found');
    END IF;

    -- 2. Validate tenant status
    IF v_status IS DISTINCT FROM 'active' AND v_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object('found', true, 'allowed', false, 'reason_code', 'tenant_inactive');
    END IF;

    -- 3. Validate onboarding status
    IF v_onboarding_status IS DISTINCT FROM 'completed' THEN
        RETURN jsonb_build_object('found', true, 'allowed', false, 'reason_code', 'onboarding_incomplete');
    END IF;

    -- 4. Validate public site status
    IF v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object('found', true, 'allowed', false, 'reason_code', 'site_unpublished');
    END IF;

    -- 5. Commercial eligibility check
    v_elig := public.resolve_tenant_commercial_eligibility(v_tenant_id);
    IF NOT (v_elig->>'eligible')::boolean THEN
        RETURN jsonb_build_object('found', true, 'allowed', false, 'reason_code', 'entitlement_inactive');
    END IF;

    -- 6. Core booking feature gate
    v_action := public.assert_tenant_commercial_action_allowed(v_tenant_id, 'core_booking');
    IF NOT (v_action->>'allowed')::boolean THEN
        RETURN jsonb_build_object('found', true, 'allowed', false, 'reason_code', 'entitlement_inactive');
    END IF;

    -- 7. All checks passed
    RETURN jsonb_build_object('found', true, 'allowed', true, 'reason_code', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.can_accept_public_booking(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_accept_public_booking(text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text);

-- 3b. Updated create_public_booking with commercial enforcement
CREATE OR REPLACE FUNCTION public.create_public_booking(
    p_slug              text,
    p_service_id        uuid,
    p_staff_id          uuid,
    p_appointment_date  date,
    p_appointment_time  time,
    p_customer_name     text,
    p_customer_email    text,
    p_customer_phone    text,
    p_required_consent  boolean,
    p_marketing_consent boolean DEFAULT false,
    p_reminder_consent  boolean DEFAULT false,
    p_idempotency_key   text    DEFAULT NULL,
    p_branch_id         uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_tenant_id             uuid;
    v_tenant_status         text;
    v_onboarding_status     text;
    v_public_site_status    text;
    v_effective_branch      uuid := p_branch_id;
    v_active_branches       uuid[];
    v_eval_res              jsonb;
    v_svc_duration          integer;
    v_customer_id           uuid;
    v_appointment_id        uuid;
    v_token                 text;
    v_token_hash            text;
    v_expires_at            timestamptz;
    v_existing_apt_id       uuid;
    v_lock_key              bigint;
    v_stage                 text := 'init';
    v_elig                  jsonb;
    v_action                jsonb;
    v_period_key            text;
    v_usage_res             jsonb;
BEGIN
    -- Gate 1: Consent
    v_stage := 'consent_validation';
    IF p_required_consent IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'consent_required');
    END IF;

    -- Gate 2: Customer Data
    v_stage := 'customer_data_validation';
    IF p_customer_name IS NULL OR trim(p_customer_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_customer_data');
    END IF;
    IF (p_customer_email IS NULL OR trim(p_customer_email) = '') AND (p_customer_phone IS NULL OR trim(p_customer_phone) = '') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_customer_data');
    END IF;

    -- Gate 3: Tenant Resolution
    v_stage := 'tenant_validation';
    SELECT id, status, onboarding_status, public_site_status
    INTO v_tenant_id, v_tenant_status, v_onboarding_status, v_public_site_status
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_tenant');
    END IF;

    IF v_tenant_status IS DISTINCT FROM 'active' AND v_tenant_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    IF v_onboarding_status IS DISTINCT FROM 'completed' OR v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- Gate 4: Commercial Eligibility (H1C)
    v_stage := 'commercial_eligibility';
    v_elig := public.resolve_tenant_commercial_eligibility(v_tenant_id);
    IF NOT (v_elig->>'eligible')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- Gate 4b: Core Booking Feature Gate (H1C)
    v_action := public.assert_tenant_commercial_action_allowed(v_tenant_id, 'core_booking');
    IF NOT (v_action->>'allowed')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- Branch Resolution
    SELECT ARRAY(
        SELECT id FROM public.branches
        WHERE tenant_id = v_tenant_id AND is_active = true
        ORDER BY is_primary DESC, created_at ASC
    ) INTO v_active_branches;

    IF v_effective_branch IS NULL THEN
        IF array_length(v_active_branches, 1) = 1 THEN
            v_effective_branch := v_active_branches[1];
        ELSIF array_length(v_active_branches, 1) > 1 THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'branch_required');
        ELSIF array_length(v_active_branches, 1) IS NULL OR array_length(v_active_branches, 1) = 0 THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch');
        END IF;
    ELSE
        IF NOT (v_effective_branch = ANY(v_active_branches)) THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch');
        END IF;
    END IF;

    -- Gate 5: Concurrency Advisory Lock
    v_stage := 'concurrency_lock';
    v_lock_key := hashtextextended(
        v_tenant_id::text || ':' || p_staff_id::text || ':' || p_appointment_date::text,
        0
    );
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- Gate 6: Idempotency Replay
    v_stage := 'idempotency_replay';
    DELETE FROM public.public_booking_idempotency WHERE expires_at <= now();

    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        SELECT appointment_id INTO v_existing_apt_id
        FROM public.public_booking_idempotency
        WHERE idempotency_key = p_idempotency_key AND tenant_id = v_tenant_id;

        IF FOUND THEN
            UPDATE public.appointment_access_tokens
            SET expires_at = now()
            WHERE appointment_id = v_existing_apt_id AND expires_at > now();

            v_token      := encode(gen_random_bytes(32), 'hex');
            v_token_hash := encode(sha256(v_token::bytea), 'hex');
            v_expires_at := now() + interval '30 days';

            INSERT INTO public.appointment_access_tokens (
                tenant_id, appointment_id, token_hash, expires_at
            ) VALUES (
                v_tenant_id::text, v_existing_apt_id, v_token_hash, v_expires_at
            );

            RETURN jsonb_build_object(
                'success',        true,
                'appointment_id', v_existing_apt_id,
                'manage_token',   v_token,
                'reason_code',    'ok'
            );
        END IF;
    END IF;

    -- Gate 7: Monthly Appointment Quota (H1C)
    v_stage := 'appointment_quota';
    v_period_key := public.resolve_quota_period_key(v_tenant_id, 'max_monthly_appointments');
    v_usage_res := public.consume_commercial_usage(v_tenant_id, 'max_monthly_appointments', v_period_key);
    IF NOT (v_usage_res->>'success')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- Gate 8: Shared Slot Evaluator Engine Execution
    v_stage := 'evaluate_booking_slot';
    v_eval_res := public.evaluate_booking_slot(
        p_tenant_id  => v_tenant_id,
        p_branch_id  => v_effective_branch,
        p_service_id => p_service_id,
        p_staff_id   => p_staff_id,
        p_date       => p_appointment_date,
        p_time       => p_appointment_time
    );

    IF NOT (v_eval_res->>'allowed')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', v_eval_res->>'reason_code');
    END IF;

    v_svc_duration := (v_eval_res->>'duration_minutes')::integer;

    -- Gate 9: Customer Upsert
    v_stage := 'customer_upsert';
    IF p_customer_phone IS NOT NULL AND trim(p_customer_phone) != '' THEN
        SELECT id INTO v_customer_id FROM public.customers
        WHERE tenant_id = v_tenant_id AND phone = p_customer_phone LIMIT 1;
    END IF;

    IF v_customer_id IS NULL AND p_customer_email IS NOT NULL AND trim(p_customer_email) != '' THEN
        SELECT id INTO v_customer_id FROM public.customers
        WHERE tenant_id = v_tenant_id AND email = p_customer_email LIMIT 1;
    END IF;

    IF v_customer_id IS NULL THEN
        INSERT INTO public.customers (tenant_id, name, email, phone)
        VALUES (v_tenant_id, trim(p_customer_name), trim(p_customer_email), trim(p_customer_phone))
        RETURNING id INTO v_customer_id;
    END IF;

    -- Gate 10: Consent Ledger Entries
    v_stage := 'consent_ledger_insert';
    INSERT INTO public.consent_ledger (tenant_id, customer_id, consent_type, is_granted, ip_address)
    VALUES
        (v_tenant_id::text, v_customer_id::text, 'booking_terms', true, 'rpc_public_booking'),
        (v_tenant_id::text, v_customer_id::text, 'marketing', COALESCE(p_marketing_consent, false), 'rpc_public_booking'),
        (v_tenant_id::text, v_customer_id::text, 'reminders', COALESCE(p_reminder_consent, false), 'rpc_public_booking');

    -- Gate 11: Appointment Creation
    v_stage := 'appointment_insert';
    INSERT INTO public.appointments (
        tenant_id, branch_id, customer_id, user_name, user_email, phone,
        service_id, staff_id, appointment_date, appointment_time,
        duration_minutes, status
    ) VALUES (
        v_tenant_id, v_effective_branch, v_customer_id, trim(p_customer_name),
        trim(p_customer_email), trim(p_customer_phone), p_service_id, p_staff_id,
        p_appointment_date, p_appointment_time, v_svc_duration, 'confirmed'
    )
    RETURNING id INTO v_appointment_id;

    -- Gate 12: Manage Token Generation
    v_stage := 'token_generation';
    v_token      := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(sha256(v_token::bytea), 'hex');
    v_expires_at := now() + interval '30 days';

    INSERT INTO public.appointment_access_tokens (
        tenant_id, appointment_id, token_hash, expires_at
    ) VALUES (
        v_tenant_id::text, v_appointment_id, v_token_hash, v_expires_at
    );

    -- Gate 13: Idempotency Record
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        INSERT INTO public.public_booking_idempotency (
            idempotency_key, tenant_id, appointment_id, expires_at
        ) VALUES (
            p_idempotency_key, v_tenant_id, v_appointment_id, now() + interval '24 hours'
        );
    END IF;

    RETURN jsonb_build_object(
        'success',        true,
        'appointment_id', v_appointment_id,
        'manage_token',   v_token,
        'reason_code',    'ok'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'temporary_failure', 'debug_stage', v_stage, 'debug_sqlerrm', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text, uuid) TO anon, authenticated;

-- =========================================================================
-- SECTION 4: CUSTOMER OPERATION GATES
-- =========================================================================

-- 4a. Updated cancel_public_appointment_by_manage_token with commercial feature gate
CREATE OR REPLACE FUNCTION public.cancel_public_appointment_by_manage_token(
    p_token  text,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_token_hash        text;
    v_token_record      record;
    v_appointment       record;
    v_trimmed_reason    text;
    v_action            jsonb;
BEGIN
    -- Step 1: Input hygiene
    IF p_token IS NULL OR length(trim(p_token)) < 32 OR length(trim(p_token)) > 128 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    v_trimmed_reason := NULLIF(trim(p_reason), '');

    -- Step 2: Compute SHA-256 digest
    v_token_hash := encode(sha256(trim(p_token)::bytea), 'hex');

    -- Step 3: Match token record
    SELECT id, tenant_id, appointment_id, expires_at, used_at
    INTO v_token_record
    FROM public.appointment_access_tokens
    WHERE token_hash = v_token_hash
      AND expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- Step 4: Lock appointment row
    SELECT id, tenant_id, branch_id, customer_id, service_id, staff_id,
           user_name, user_email, phone, appointment_date, appointment_time,
           duration_minutes, status, notes
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_token_record.appointment_id
      AND tenant_id::text = v_token_record.tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- Step 4b: Commercial feature gate (H1C) — customer_cancellation
    v_action := public.assert_tenant_commercial_action_allowed(v_appointment.tenant_id, 'customer_cancellation');
    IF NOT (v_action->>'allowed')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'feature_unavailable');
    END IF;

    -- Step 5: Transition State Machine
    -- A. Idempotent Replay — Already cancelled by customer
    IF v_appointment.status = 'cancelled_by_customer' THEN
        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'no_change',
            'changed', false,
            'appointment_id', v_appointment.id,
            'previous_status', 'cancelled_by_customer',
            'status', 'cancelled_by_customer'
        );
    END IF;

    -- B. Terminal / Invalid Transitions
    IF v_appointment.status IN ('completed', 'no_show', 'cancelled', 'cancelled_by_salon', 'cancelled_by_system') THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_transition',
            'appointment_id', v_appointment.id,
            'status', v_appointment.status
        );
    END IF;

    -- C. Valid Mutation — confirmed -> cancelled_by_customer
    IF v_appointment.status = 'confirmed' THEN
        UPDATE public.appointments
        SET status = 'cancelled_by_customer',
            updated_at = now()
        WHERE id = v_appointment.id;

        -- Transactional Audit Log
        INSERT INTO public.audit_events (
            tenant_id, actor_id, actor_role, action,
            resource_type, resource_id, payload
        ) VALUES (
            v_appointment.tenant_id::text, 'customer_token', 'customer',
            'appointment_cancelled_by_customer', 'appointment',
            v_appointment.id::text,
            jsonb_build_object(
                'appointment_id', v_appointment.id,
                'previous_status', 'confirmed',
                'status', 'cancelled_by_customer',
                'cancel_reason', v_trimmed_reason
            )
        );

        -- Transactional Communication Outbox Event
        INSERT INTO public.communication_outbox (
            tenant_id, recipient, channel, message, status, metadata
        ) VALUES (
            v_appointment.tenant_id::text,
            COALESCE(v_appointment.phone, v_appointment.user_email, v_appointment.id::text),
            'whatsapp', 'Randevunuz iptal edildi.', 'queued',
            jsonb_build_object(
                'appointment_id', v_appointment.id,
                'appointment_date', v_appointment.appointment_date,
                'appointment_time', v_appointment.appointment_time,
                'status', 'cancelled_by_customer',
                'cancelled_by', 'customer',
                'cancel_reason', v_trimmed_reason
            )
        );

        RETURN jsonb_build_object(
            'success', true, 'reason_code', 'ok', 'changed', true,
            'appointment_id', v_appointment.id,
            'previous_status', 'confirmed',
            'status', 'cancelled_by_customer'
        );
    END IF;

    -- Fail-closed fallback
    RETURN jsonb_build_object(
        'success', false, 'reason_code', 'invalid_transition',
        'appointment_id', v_appointment.id, 'status', v_appointment.status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_public_appointment_by_manage_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_public_appointment_by_manage_token(text, text) TO anon, authenticated;

-- =========================================================================
-- SECTION 5: DIAGNOSTIC RPCs
-- =========================================================================

-- 5a. Self-service enforcement snapshot (authenticated user's own tenant)
CREATE OR REPLACE FUNCTION public.get_my_commercial_enforcement_snapshot()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id   UUID := auth.uid();
    v_tenant_id UUID;
    v_elig      JSONB;
    v_result    JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    SELECT tenant_id INTO v_tenant_id
    FROM public.users_profile
    WHERE id = v_user_id AND active = true;

    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'no_tenant');
    END IF;

    v_elig := public.resolve_tenant_commercial_eligibility(v_tenant_id);

    v_result := jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'eligibility', v_elig,
        'feature_gates', (
            SELECT jsonb_object_agg(feature_key, jsonb_build_object(
                'value_type', value_type,
                'boolean_value', boolean_value,
                'integer_value', integer_value,
                'is_unlimited', is_unlimited,
                'source', source
            ))
            FROM public.resolve_effective_tenant_entitlements(v_tenant_id)
            WHERE feature_key IN ('core_booking', 'customer_cancellation', 'customer_reschedule_request',
                                  'admin_appointment_operations', 'staff_management', 'service_management',
                                  'max_staff', 'max_services', 'max_branches', 'max_monthly_appointments')
        )
    );

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_commercial_enforcement_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_commercial_enforcement_snapshot() TO authenticated;

-- 5b. Super Admin enforcement snapshot for any tenant
CREATE OR REPLACE FUNCTION public.super_admin_get_tenant_commercial_enforcement_snapshot(
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_elig  JSONB;
BEGIN
    IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    v_elig := public.resolve_tenant_commercial_eligibility(p_tenant_id);

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'eligibility', v_elig,
        'feature_gates', (
            SELECT jsonb_object_agg(feature_key, jsonb_build_object(
                'value_type', value_type,
                'boolean_value', boolean_value,
                'integer_value', integer_value,
                'is_unlimited', is_unlimited,
                'source', source
            ))
            FROM public.resolve_effective_tenant_entitlements(p_tenant_id)
            WHERE feature_key IN ('core_booking', 'customer_cancellation', 'customer_reschedule_request',
                                  'admin_appointment_operations', 'staff_management', 'service_management',
                                  'max_staff', 'max_services', 'max_branches', 'max_monthly_appointments')
        ),
        'usage', (
            SELECT COALESCE(jsonb_object_agg(feature_key || ':' || period_key, usage_count), '{}'::jsonb)
            FROM public.usage_counters
            WHERE tenant_id = p_tenant_id
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_get_tenant_commercial_enforcement_snapshot(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.super_admin_get_tenant_commercial_enforcement_snapshot(UUID) TO authenticated;


-- >>> FILE: 20260814_h1c_feature_gate_reason_code_fix.sql <<<
-- =========================================================================
-- STAGE H1C — FEATURE GATE REASON CODE & TRIGGER HARDENING FIX
-- Migration: 20260814_h1c_feature_gate_reason_code_fix.sql
-- Description: Ensures enforce_staff_quota and enforce_service_quota triggers
--              explicitly check staff_management and service_management feature
--              gates before numerical quota evaluation, raising
--              'commercial_feature_disabled' when management features are disabled.
-- Governance: Forward-only migration 39. Payments/iyzico disabled. Production NO-GO.
-- =========================================================================

-- 1. Hardened enforce_staff_quota trigger function
CREATE OR REPLACE FUNCTION public.enforce_staff_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_action     JSONB;
    v_quota      JSONB;
    v_is_unlimited BOOLEAN;
    v_limit      BIGINT;
    v_count      BIGINT;
    v_lock_key   BIGINT;
BEGIN
    -- Only enforce on active insert or reactivation
    IF TG_OP = 'INSERT' AND NEW.active IS NOT TRUE THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.active = true AND NEW.active = true THEN
            RETURN NEW; -- not changing active count
        END IF;
        IF NEW.active IS NOT TRUE THEN
            RETURN NEW; -- deactivation always allowed
        END IF;
    END IF;

    -- 1. Check feature gate for staff_management
    v_action := public.assert_tenant_commercial_action_allowed(NEW.tenant_id, 'staff_management');
    IF NOT (v_action->>'allowed')::boolean THEN
        RAISE EXCEPTION 'commercial_feature_disabled' USING ERRCODE = 'P0001';
    END IF;

    -- 2. Resolve staff numerical quota
    v_quota := public.resolve_commercial_quota(NEW.tenant_id, 'max_staff');
    v_is_unlimited := (v_quota->>'is_unlimited')::boolean;
    IF v_is_unlimited THEN
        RETURN NEW;
    END IF;
    v_limit := (v_quota->>'limit_value')::bigint;

    -- 3. Lock and count
    v_lock_key := hashtextextended(NEW.tenant_id::text || ':max_staff', 0);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    SELECT count(*) INTO v_count
    FROM public.staff
    WHERE tenant_id = NEW.tenant_id AND active = true AND id != NEW.id;

    IF v_count >= v_limit THEN
        RAISE EXCEPTION 'commercial_quota_exceeded' USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

-- 2. Hardened enforce_service_quota trigger function
CREATE OR REPLACE FUNCTION public.enforce_service_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_action     JSONB;
    v_quota      JSONB;
    v_is_unlimited BOOLEAN;
    v_limit      BIGINT;
    v_count      BIGINT;
    v_lock_key   BIGINT;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.active IS NOT TRUE THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.active = true AND NEW.active = true THEN
            RETURN NEW;
        END IF;
        IF NEW.active IS NOT TRUE THEN
            RETURN NEW;
        END IF;
    END IF;

    -- 1. Check feature gate for service_management
    v_action := public.assert_tenant_commercial_action_allowed(NEW.tenant_id, 'service_management');
    IF NOT (v_action->>'allowed')::boolean THEN
        RAISE EXCEPTION 'commercial_feature_disabled' USING ERRCODE = 'P0001';
    END IF;

    -- 2. Resolve service numerical quota
    v_quota := public.resolve_commercial_quota(NEW.tenant_id, 'max_services');
    v_is_unlimited := (v_quota->>'is_unlimited')::boolean;
    IF v_is_unlimited THEN
        RETURN NEW;
    END IF;
    v_limit := (v_quota->>'limit_value')::bigint;

    v_lock_key := hashtextextended(NEW.tenant_id::text || ':max_services', 0);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    SELECT count(*) INTO v_count
    FROM public.services
    WHERE tenant_id = NEW.tenant_id AND active = true AND id != NEW.id;

    IF v_count >= v_limit THEN
        RAISE EXCEPTION 'commercial_quota_exceeded' USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;


