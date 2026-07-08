-- /supabase/seed.sql

-- 1. Create a Demo Tenant
INSERT INTO public.tenants (id, slug, custom_domain, name, status)
VALUES (
    '11111111-1111-1111-1111-111111111111', 
    'demo', 
    'demo.randapp.local', 
    'Nexus Salon Demo', 
    'active'
) ON CONFLICT (id) DO NOTHING;

-- 2. Create Tenant Branding
INSERT INTO public.tenant_branding (
    id, tenant_id, primary_color, accent_color, business_name, tagline, footer_text
) VALUES (
    '22222222-2222-2222-2222-222222222222', 
    '11111111-1111-1111-1111-111111111111', 
    '#000000', 
    '#333333', 
    'MA Yılmaz Design', 
    'Premium Hair & Beauty', 
    'MA Yılmaz Hair Design. All rights reserved.'
) ON CONFLICT (tenant_id) DO NOTHING;

-- 3. Create Users Profile (IMPORTANT: You must replace the id with a valid auth.users id from Supabase after signing up!)
/*
INSERT INTO public.users_profile (id, tenant_id, name, role, active)
VALUES (
    'REPLACE-WITH-AUTHENTICATED-USER-ID', 
    '11111111-1111-1111-1111-111111111111', 
    'Admin User', 
    'tenant_owner', 
    true
) ON CONFLICT (id) DO NOTHING;
*/

-- 4. Create Staff
INSERT INTO public.staff (id, tenant_id, name, title, is_owner, active)
VALUES 
    ('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'Mehmet Yılmaz', 'Master Barber', true, true),
    ('33333333-3333-3333-3333-333333333332', '11111111-1111-1111-1111-111111111111', 'Ali Veli', 'Stylist', false, true)
ON CONFLICT (id) DO NOTHING;

-- 5. Create Services
INSERT INTO public.services (id, tenant_id, name, name_tr, duration, price, active, category)
VALUES 
    ('44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111', 'Men''s Haircut', 'Saç Kesimi', 45, 300, true, 'Hair'),
    ('44444444-4444-4444-4444-444444444442', '11111111-1111-1111-1111-111111111111', 'Beard Trim & Shape', 'Sakal Tıraşı & Şekillendirme', 30, 200, true, 'Beard'),
    ('44444444-4444-4444-4444-444444444443', '11111111-1111-1111-1111-111111111111', 'Manicure & Pedicure', 'Manikür & Pedikür', 60, 500, true, 'Nails')
ON CONFLICT (id) DO NOTHING;

-- 6. Create a Customer
INSERT INTO public.customers (id, tenant_id, name, email, phone)
VALUES (
    '55555555-5555-5555-5555-555555555555',
    '11111111-1111-1111-1111-111111111111',
    'John Doe',
    'john@example.com',
    '5551234567'
) ON CONFLICT (id) DO NOTHING;

-- 7. Create an Appointment
INSERT INTO public.appointments (id, tenant_id, customer_id, staff_id, service_id, user_name, user_email, appointment_date, appointment_time, status)
VALUES (
    '66666666-6666-6666-6666-666666666666',
    '11111111-1111-1111-1111-111111111111',
    '55555555-5555-5555-5555-555555555555',
    '33333333-3333-3333-3333-333333333331',
    '44444444-4444-4444-4444-444444444441',
    'John Doe',
    'john@example.com',
    CURRENT_DATE,
    '10:00:00',
    'confirmed'
) ON CONFLICT (id) DO NOTHING;
