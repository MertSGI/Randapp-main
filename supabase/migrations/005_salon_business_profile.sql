-- Migration: 005_salon_business_profile.sql
-- Description: Adds tenant_business_profiles table for salon websites

CREATE TABLE IF NOT EXISTS public.tenant_business_profiles (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
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
    USING (public.is_super_admin((select auth.uid())));

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
