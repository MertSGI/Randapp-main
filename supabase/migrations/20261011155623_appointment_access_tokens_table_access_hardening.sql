-- Forward-only hardening for the public appointment-management token table.
-- Direct browser access is removed; existing SECURITY DEFINER RPCs remain the
-- public management boundary and existing authenticated owner/admin RLS stays intact.

DO $migration_guard$
DECLARE
    v_table_oid oid;
    v_relkind "char";
    v_owner text;
    v_rls_enabled boolean;
    v_missing_or_changed_columns text[];
    v_policy_command text;
    v_policy_roles name[];
    v_policy_qual text;
BEGIN
    SELECT c.oid, c.relkind, pg_get_userbyid(c.relowner), c.relrowsecurity
      INTO v_table_oid, v_relkind, v_owner, v_rls_enabled
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'appointment_access_tokens';

    IF v_table_oid IS NULL THEN
        RAISE EXCEPTION 'UNEXPECTED_SCHEMA_IDENTITY: public.appointment_access_tokens is missing';
    END IF;
    IF v_relkind <> 'r' THEN
        RAISE EXCEPTION 'UNEXPECTED_SCHEMA_IDENTITY: public.appointment_access_tokens is not a table';
    END IF;
    IF v_owner <> 'postgres' THEN
        RAISE EXCEPTION 'UNEXPECTED_SCHEMA_IDENTITY: public.appointment_access_tokens owner is %, expected postgres', v_owner;
    END IF;
    IF NOT v_rls_enabled THEN
        RAISE EXCEPTION 'UNEXPECTED_SCHEMA_IDENTITY: RLS is not enabled on public.appointment_access_tokens';
    END IF;

    WITH expected(attname, type_name) AS (
        VALUES
            ('id', 'uuid'),
            ('tenant_id', 'text'),
            ('appointment_id', 'uuid'),
            ('token_hash', 'text'),
            ('expires_at', 'timestamp with time zone'),
            ('created_at', 'timestamp with time zone'),
            ('used_at', 'timestamp with time zone')
    )
    SELECT array_agg(expected.attname ORDER BY expected.attname)
      INTO v_missing_or_changed_columns
      FROM expected
      LEFT JOIN pg_catalog.pg_attribute attribute
        ON attribute.attrelid = v_table_oid
       AND attribute.attname = expected.attname
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
     WHERE attribute.attname IS NULL
        OR pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) <> expected.type_name;

    IF v_missing_or_changed_columns IS NOT NULL THEN
        RAISE EXCEPTION
            'UNEXPECTED_SCHEMA_IDENTITY: public.appointment_access_tokens columns missing or changed: %',
            v_missing_or_changed_columns;
    END IF;

    SELECT policy.cmd, policy.roles, policy.qual
      INTO v_policy_command, v_policy_roles, v_policy_qual
      FROM pg_catalog.pg_policies policy
     WHERE policy.schemaname = 'public'
       AND policy.tablename = 'appointment_access_tokens'
       AND policy.policyname = 'Allow public select by token hash';

    IF FOUND AND (
        v_policy_command <> 'SELECT'
        OR v_policy_roles <> ARRAY['public']::name[]
        OR v_policy_qual NOT IN ('true', '(true)')
    ) THEN
        RAISE EXCEPTION
            'UNEXPECTED_SCHEMA_IDENTITY: permissive token policy exists with an unexpected definition';
    END IF;
END;
$migration_guard$;

REVOKE ALL PRIVILEGES ON TABLE public.appointment_access_tokens FROM PUBLIC, anon;

DROP POLICY IF EXISTS "Allow public select by token hash"
    ON public.appointment_access_tokens;

DO $migration_postcondition$
DECLARE
    v_privilege text;
BEGIN
    FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']
    LOOP
        IF pg_catalog.has_table_privilege(
            'anon',
            'public.appointment_access_tokens',
            v_privilege
        ) THEN
            RAISE EXCEPTION
                'TOKEN_TABLE_HARDENING_FAILED: anon still has % on public.appointment_access_tokens',
                v_privilege;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'appointment_access_tokens'
           AND policyname = 'Allow public select by token hash'
    ) THEN
        RAISE EXCEPTION
            'TOKEN_TABLE_HARDENING_FAILED: permissive public token policy still exists';
    END IF;
END;
$migration_postcondition$;
