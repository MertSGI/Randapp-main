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
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin', 'super_admin'))
);

-- customer_memory (Strictly private)
CREATE POLICY "Tenant staff can read/manage customer_memory" ON public.customer_memory FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin', 'staff', 'super_admin'))
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
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin'))
);

-- notification_templates
CREATE POLICY "Public read notification templates" ON public.notification_templates FOR SELECT USING (true);
CREATE POLICY "Super admins can modify notification templates" ON public.notification_templates FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'super_admin')
);

-- notification_logs
CREATE POLICY "Tenant admins can read notification logs" ON public.notification_logs FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin', 'super_admin'))
);
CREATE POLICY "Super admins can manage notification logs" ON public.notification_logs FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'super_admin')
);
