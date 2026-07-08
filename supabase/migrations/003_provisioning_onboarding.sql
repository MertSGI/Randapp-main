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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  tenant_id IN (
    SELECT tenant_id FROM public.staff WHERE auth_user_id = auth.uid() AND is_owner = true
  )
);

CREATE POLICY "Salon owners can update own onboarding progress" 
ON public.tenant_onboarding_progress 
FOR UPDATE 
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.staff WHERE auth_user_id = auth.uid() AND is_owner = true
  )
);

-- Super admin and service role rules would technically rely on JWT claims or similar structures.
-- A placeholder for super admin:
-- CREATE POLICY "Super admins can manage all onboarding progress" ON public.tenant_onboarding_progress FOR ALL USING (auth.jwt() ->> 'role' = 'super_admin');
