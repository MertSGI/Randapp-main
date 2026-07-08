-- Phase 4: Initial Supabase Schema Draft for Randapp
-- This migration provides the foundational schema for the production Supabase backend.
-- Note: This is a draft for future deployment. MVP mode continues to use mock local storage.

-- 1. tenants
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(255) UNIQUE NOT NULL,
    business_name VARCHAR(255) NOT NULL,
    business_type VARCHAR(100),
    owner_user_id UUID NOT NULL, -- References auth.users
    public_status VARCHAR(50) DEFAULT 'setup_in_progress', -- live, paused, setup_in_progress
    plan_id VARCHAR(100),
    subscription_status VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. tenant_profiles
CREATE TABLE public.tenant_profiles (
    tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    about_text TEXT,
    phone VARCHAR(50),
    email VARCHAR(255),
    whatsapp VARCHAR(50),
    address TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    cover_images JSONB DEFAULT '[]',
    business_hours JSONB,
    cancellation_policy_hours INTEGER DEFAULT 24,
    privacy_notice TEXT,
    marketing_consent_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. services
CREATE TABLE public.services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. staff_members
CREATE TABLE public.staff_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    title VARCHAR(255),
    active BOOLEAN DEFAULT TRUE,
    image_url TEXT,
    calendar_email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. staff_services
CREATE TABLE public.staff_services (
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    staff_id UUID NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    PRIMARY KEY (staff_id, service_id)
);

-- 6. customers
CREATE TABLE public.customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    normalized_phone VARCHAR(50),
    phone_display VARCHAR(50),
    normalized_email VARCHAR(255),
    email_display VARCHAR(255),
    marketing_consent BOOLEAN DEFAULT FALSE,
    operational_contact_allowed BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, normalized_phone)
);

-- 7. appointments
CREATE TABLE public.appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id),
    service_id UUID REFERENCES public.services(id),
    staff_id UUID REFERENCES public.staff_members(id),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) DEFAULT 'confirmed', -- confirmed, cancelled_by_customer, cancelled_by_salon, completed, no_show
    price_snapshot DECIMAL(10, 2),
    customer_note TEXT,
    cancel_reason TEXT,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancelled_by UUID, -- References auth.users or customer portal user
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. customer_notes (Internal to salon)
CREATE TABLE public.customer_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    note_text TEXT NOT NULL,
    created_by_user_id UUID,
    visibility VARCHAR(50) DEFAULT 'internal', -- Default to internal/private
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. customer_style_preferences
CREATE TABLE public.customer_style_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    hair_style_preference TEXT,
    color_formula TEXT,
    avoid_notes TEXT,
    care_notes TEXT,
    preferred_staff_id UUID REFERENCES public.staff_members(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. customer_reference_photos
CREATE TABLE public.customer_reference_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    caption TEXT,
    consent_status VARCHAR(50) DEFAULT 'internal_reference_only', -- Ensures no AI use without explicit consent
    created_by_user_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. plans
CREATE TABLE public.plans (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    monthly_price DECIMAL(10, 2),
    annual_price DECIMAL(10, 2),
    annual_discount_percent INTEGER,
    setup_fee DECIMAL(10, 2),
    active BOOLEAN DEFAULT TRUE,
    recommended BOOLEAN DEFAULT FALSE,
    trial_enabled BOOLEAN DEFAULT FALSE,
    trial_days INTEGER,
    features JSONB, -- Includes flags like aiMonthlyQuota, aiVisualizationEnabled
    limits JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. subscriptions
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    plan_id VARCHAR(100) REFERENCES public.plans(id),
    provider VARCHAR(50), -- e.g., 'iyzico'
    provider_customer_id VARCHAR(255),
    provider_subscription_id VARCHAR(255),
    status VARCHAR(50),
    trial_start TIMESTAMP WITH TIME ZONE,
    trial_end TIMESTAMP WITH TIME ZONE,
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. payments
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.subscriptions(id),
    provider VARCHAR(50),
    provider_payment_id VARCHAR(255),
    amount DECIMAL(10, 2),
    currency VARCHAR(10) DEFAULT 'TRY',
    status VARCHAR(50),
    paid_at TIMESTAMP WITH TIME ZONE,
    raw_event JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 14. referral_campaigns
CREATE TABLE public.referral_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE, -- Nullable for platform/global campaigns
    campaign_type VARCHAR(50),
    title VARCHAR(255),
    description TEXT,
    reward_type VARCHAR(50),
    reward_value VARCHAR(100),
    active BOOLEAN DEFAULT TRUE,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    max_uses INTEGER,
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 15. referral_codes
CREATE TABLE public.referral_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES public.referral_campaigns(id),
    code VARCHAR(50) UNIQUE NOT NULL,
    referrer_type VARCHAR(50), -- 'customer' | 'tenant'
    referrer_customer_id UUID REFERENCES public.customers(id),
    referrer_tenant_id UUID REFERENCES public.tenants(id),
    usage_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 16. referral_leads
CREATE TABLE public.referral_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES public.referral_campaigns(id),
    referral_code_id UUID REFERENCES public.referral_codes(id),
    lead_name VARCHAR(255),
    lead_phone VARCHAR(50),
    lead_email VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending', -- pending, converted
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 17. ai_settings
CREATE TABLE public.ai_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE, -- Nullable for global defaults
    provider VARCHAR(50) DEFAULT 'mock',
    system_prompt TEXT,
    disclaimer TEXT,
    recommendation_enabled BOOLEAN DEFAULT TRUE,
    visualization_enabled BOOLEAN DEFAULT FALSE,
    image_generation_allowed BOOLEAN DEFAULT FALSE,
    safe_mode_enabled BOOLEAN DEFAULT TRUE,
    use_customer_memory_by_default BOOLEAN DEFAULT FALSE,
    use_reference_photos_by_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 18. ai_usage
CREATE TABLE public.ai_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id),
    feature_type VARCHAR(100),
    request_count INTEGER DEFAULT 1,
    month_key VARCHAR(7), -- e.g., '2023-10'
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 19. audit_logs
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    actor_type VARCHAR(50), -- e.g. 'user', 'customer', 'system'
    actor_id UUID,
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- End of schema
