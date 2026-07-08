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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'draft',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. reminders
CREATE TABLE public.reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. whatsapp_logs
CREATE TABLE public.whatsapp_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    to_number VARCHAR(50),
    message TEXT,
    status VARCHAR(50),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. calendar_integrations
CREATE TABLE public.calendar_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    context TEXT,
    recommendation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. customer_segments
CREATE TABLE public.customer_segments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(255),
    criteria JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 14. subscriptions
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    currency VARCHAR(10) DEFAULT 'TRY',
    status VARCHAR(50) DEFAULT 'pending',
    provider_reference VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 16. audit_logs
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin', 'super_admin'))
);

-- Policies for public.users_profile
CREATE POLICY "Users can read own profile" ON public.users_profile FOR SELECT USING (id = auth.uid());
CREATE POLICY "Tenant admins can read all profiles in their tenant" ON public.users_profile FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin', 'super_admin'))
);

-- Policies for public.staff
CREATE POLICY "Public read staff" ON public.staff FOR SELECT USING (true);
CREATE POLICY "Tenant admins can manage staff" ON public.staff FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin', 'super_admin'))
);

-- Policies for public.services
CREATE POLICY "Public read services" ON public.services FOR SELECT USING (true);
CREATE POLICY "Tenant admins can manage services" ON public.services FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin', 'super_admin'))
);

-- Policies for public.customers
CREATE POLICY "Tenant admins can read/manage customers" ON public.customers FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin', 'staff', 'super_admin'))
);
CREATE POLICY "Customers can read own customer record" ON public.customers FOR SELECT USING (
    user_profile_id = auth.uid()
);

-- Policies for public.appointments
CREATE POLICY "Public can insert new appointments (guest booking)" ON public.appointments FOR INSERT WITH CHECK (true);
CREATE POLICY "Tenant staff can read/manage appointments" ON public.appointments FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin', 'staff', 'super_admin'))
);
CREATE POLICY "Customers can view own appointments" ON public.appointments FOR SELECT USING (
    customer_id IN (SELECT id FROM public.customers WHERE user_profile_id = auth.uid())
);

-- Policies for public.subscriptions
CREATE POLICY "Tenant admins can view subscriptions" ON public.subscriptions FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin', 'super_admin'))
);

-- Policies for public.payments
CREATE POLICY "Tenant admins can view payments" ON public.payments FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin', 'super_admin'))
);

-- Policies for public.audit_logs
CREATE POLICY "Tenant admins can view audit logs" ON public.audit_logs FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin', 'super_admin'))
);
CREATE POLICY "Super admins can manage audit logs" ON public.audit_logs FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'super_admin')
);
