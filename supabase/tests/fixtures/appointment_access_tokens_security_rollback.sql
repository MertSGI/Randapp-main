-- DISPOSABLE RECOVERY TEST ONLY.
-- This reproduces the immediately preceding token-table ACL/policy state so
-- rollback viability can be tested without applying it to a hosted project.

DO $rollback_guard$
BEGIN
    IF to_regclass('public.appointment_access_tokens') IS NULL THEN
        RAISE EXCEPTION 'ROLLBACK_REFUSED: token table is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_class c
          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname = 'appointment_access_tokens'
           AND c.relkind = 'r'
           AND c.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'ROLLBACK_REFUSED: token table identity or RLS state changed';
    END IF;
END;
$rollback_guard$;

GRANT ALL PRIVILEGES ON TABLE public.appointment_access_tokens TO anon;

DROP POLICY IF EXISTS "Allow public select by token hash"
    ON public.appointment_access_tokens;

CREATE POLICY "Allow public select by token hash"
    ON public.appointment_access_tokens
    FOR SELECT
    TO PUBLIC
    USING (true);
