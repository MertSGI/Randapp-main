# Supabase Test Plan

This document outlines how to manually test the Supabase integration and verify that domain services, branding models, and tenant isolation (RLS) function properly.

## Prerequisites
1. A Supabase project is created.
2. The `001_initial_schema.sql` database migration has been run in your Supabase project.

## QA Steps

### 1. Database Setup & Seed
1. Create a user account in your Supabase project using the built-in Auth UI or an API call. Note the `uid` of the new user.
2. Run the `supabase/seed.sql` script into your database to scaffold the initial tenant (`Nexus Salon Demo`), some staff, services, customers, and an appointment.
3. Link your Auth user to the tenant by creating a record in the `public.users_profile` table:
   ```sql
   INSERT INTO public.users_profile (id, tenant_id, name, role, active)
   VALUES (
       '<YOUR_AUTH_USER_UID>', 
       '11111111-1111-1111-1111-111111111111', 
       'Admin User', 
       'tenant_owner', 
       true
   );
   ```

### 2. Configure Environment
Create or edit your `.env` (or `.env.local`) to configure the Supabase integration:
```env
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_APP_BASE_DOMAIN=randapp.com
```

### 3. Frontend Verification
1. **Tenant Resolution**: Start your local development server (`npm run dev`) and access `localhost:3000`. You should successfully load the "Nexus Salon Demo" thanks to the local routing fallback.
2. **Login**: Go to the login page and sign in using the Email/Password for the Supabase user you just created.
3. **Data Verification**:
    - Navigate to **Services**: Verify that the 3 demo services from public.services load. Create a new service and confirm it persists to Supabase under the tenant ID.
    - Navigate to **Staff**: Verify the 2 demo staff members load.
    - Check the **Dashboard** and **Calendar** for the test appointment. Try updating the appointment to "completed" and verify the DB reflects the change.
    - Go to **Settings -> Branding**: Check out if the businessName, tagline, and custom colors are being loaded and saved properly to `tenant_branding`.

### 4. Row Level Security (RLS) Check (Important)
**Note**: The query filters used by the frontend (like `.eq('tenant_id', tenantId)`) are purely for application logic convenience and are **NOT** meant to be security barriers. Database Row-Level Security (RLS) is the actual security layer.

To verify RLS is working:
1. Create a second user via Supabase Auth.
2. Create a second tenant and link the second user to it via `users_profile`.
3. Log in as User 2 on the frontend.
4. Try to query services or appointments. You should only see data for Tenant 2. Data from Tenant 1 should not be accessible, affirming that cross-tenant leakage is strictly prevented at the database level.
