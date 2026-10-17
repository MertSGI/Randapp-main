\set ON_ERROR_STOP on

\if :{?expected_project_ref}
\else
  \echo expected_project_ref is required
  \quit 3
\endif

SELECT :'expected_project_ref' = 'rwedeejhjazwjthdjzrt' AS expected_project_ref_matches \gset
\if :expected_project_ref_matches
\else
  \echo expected_project_ref does not match the protected staging project
  \quit 3
\endif

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '90s';

DO $preflight$
DECLARE
    v_expected_rpc text;
BEGIN
    IF pg_catalog.to_regclass('public.appointment_access_tokens') IS NULL THEN
        RAISE EXCEPTION 'P0_PREFLIGHT_FAILED: token table is missing';
    END IF;

    IF pg_catalog.to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
        RAISE EXCEPTION 'P0_PREFLIGHT_FAILED: migration history table is missing';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM supabase_migrations.schema_migrations
         WHERE version::text = '20261011155623'
    ) THEN
        RAISE EXCEPTION 'P0_PREFLIGHT_FAILED: migration ledger already contains 20261011155623';
    END IF;

    FOREACH v_expected_rpc IN ARRAY ARRAY[
        'public.get_public_appointment_by_manage_token(text)',
        'public.cancel_public_appointment_by_manage_token(text,text)',
        'public.request_public_appointment_reschedule_by_manage_token(text,date,text,text,text)',
        'public.get_public_pending_reschedule_request_by_manage_token(text)'
    ]
    LOOP
        IF pg_catalog.to_regprocedure(v_expected_rpc) IS NULL THEN
            RAISE EXCEPTION 'P0_PREFLIGHT_FAILED: required RPC is missing: %', v_expected_rpc;
        END IF;
    END LOOP;
END;
$preflight$;

\ir ../../supabase/migrations/20261011155623_appointment_access_tokens_table_access_hardening.sql

DO $postcondition$
DECLARE
    v_privilege text;
    v_expected_rpc text;
    v_rpc_oid oid;
    v_server_major integer := current_setting('server_version_num')::integer / 10000;
    v_privileges text[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
    v_policy_names text[];
BEGIN
    IF v_server_major >= 17 THEN
        v_privileges := v_privileges || 'MAINTAIN';
    END IF;

    FOREACH v_privilege IN ARRAY v_privileges
    LOOP
        IF pg_catalog.has_table_privilege(
            'anon',
            'public.appointment_access_tokens',
            v_privilege
        ) THEN
            RAISE EXCEPTION 'P0_POSTCONDITION_FAILED: anon still has %', v_privilege;
        END IF;
    END LOOP;

    SELECT array_agg(policyname ORDER BY policyname)
      INTO v_policy_names
      FROM pg_catalog.pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'appointment_access_tokens';

    IF v_policy_names IS DISTINCT FROM ARRAY['Owner/Admin manage appointment tokens']::text[] THEN
        RAISE EXCEPTION 'P0_POSTCONDITION_FAILED: policy invariant mismatch';
    END IF;

    IF NOT (
        SELECT c.relrowsecurity
          FROM pg_catalog.pg_class c
          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname = 'appointment_access_tokens'
           AND c.relkind = 'r'
           AND pg_catalog.pg_get_userbyid(c.relowner) = 'postgres'
    ) THEN
        RAISE EXCEPTION 'P0_POSTCONDITION_FAILED: table identity, owner, or RLS mismatch';
    END IF;

    FOREACH v_expected_rpc IN ARRAY ARRAY[
        'public.get_public_appointment_by_manage_token(text)',
        'public.cancel_public_appointment_by_manage_token(text,text)',
        'public.request_public_appointment_reschedule_by_manage_token(text,date,text,text,text)',
        'public.get_public_pending_reschedule_request_by_manage_token(text)'
    ]
    LOOP
        v_rpc_oid := pg_catalog.to_regprocedure(v_expected_rpc);
        IF v_rpc_oid IS NULL THEN
            RAISE EXCEPTION 'P0_POSTCONDITION_FAILED: required RPC is missing';
        END IF;
        IF NOT pg_catalog.has_function_privilege('anon', v_rpc_oid, 'EXECUTE')
           OR NOT pg_catalog.has_function_privilege('authenticated', v_rpc_oid, 'EXECUTE') THEN
            RAISE EXCEPTION 'P0_POSTCONDITION_FAILED: intended RPC execute ACL is missing';
        END IF;
        IF EXISTS (
            SELECT 1
              FROM pg_catalog.pg_proc p
              CROSS JOIN LATERAL pg_catalog.aclexplode(
                  COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
              ) acl
             WHERE p.oid = v_rpc_oid
               AND acl.grantee = 0
               AND acl.privilege_type = 'EXECUTE'
        ) THEN
            RAISE EXCEPTION 'P0_POSTCONDITION_FAILED: PUBLIC can execute a protected RPC';
        END IF;
        IF NOT EXISTS (
            SELECT 1
              FROM pg_catalog.pg_proc p
             WHERE p.oid = v_rpc_oid
               AND p.prosecdef
               AND 'search_path=pg_catalog, public' = ANY(COALESCE(p.proconfig, ARRAY[]::text[]))
        ) THEN
            RAISE EXCEPTION 'P0_POSTCONDITION_FAILED: RPC security/search_path invariant mismatch';
        END IF;
    END LOOP;
END;
$postcondition$;

SELECT
    'P0_POSTCONDITIONS_PASS' AS verdict,
    current_setting('server_version_num')::integer / 10000 AS postgres_major,
    NOT pg_catalog.has_table_privilege('anon', 'public.appointment_access_tokens', 'SELECT') AS anon_select_revoked,
    NOT pg_catalog.has_table_privilege('anon', 'public.appointment_access_tokens', 'TRUNCATE') AS anon_truncate_revoked,
    NOT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'appointment_access_tokens'
           AND policyname = 'Allow public select by token hash'
    ) AS permissive_policy_absent;

COMMIT;
