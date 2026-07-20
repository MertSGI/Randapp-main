-- 20260721_public_booking_staff_validation_fix.sql
-- Description: Create a helper data operation to safely construct the required staff_services mapping
-- for Staging Blowdry and Selin Uzman.

DO $$
DECLARE
  v_staff_id uuid := '6234e7a1-9788-4f04-aa56-54d05c1fafb7';
  v_service_id uuid := 'fdc4b301-26ec-40c1-a521-5a864766fbc5';
BEGIN
  -- Assert that staff and service exist under same tenant before mapping
  IF EXISTS (
    SELECT 1 FROM public.staff st
    JOIN public.services sv ON sv.tenant_id = st.tenant_id
    WHERE st.id = v_staff_id AND sv.id = v_service_id
  ) THEN
    INSERT INTO public.staff_services (staff_id, service_id)
    VALUES (v_staff_id, v_service_id)
    ON CONFLICT (staff_id, service_id) DO NOTHING;
  END IF;
END $$;
