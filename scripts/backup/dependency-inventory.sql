SELECT jsonb_build_object(
  'server_version_num', current_setting('server_version_num'),
  'extensions', coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'name', e.extname,
        'version', e.extversion,
        'schema', n.nspname
      ) ORDER BY e.extname
    )
    FROM pg_extension AS e
    JOIN pg_namespace AS n ON n.oid = e.extnamespace
  ), '[]'::jsonb),
  'non_system_roles', coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'name', rolname,
        'can_login', rolcanlogin,
        'superuser', rolsuper,
        'bypass_rls', rolbypassrls
      ) ORDER BY rolname
    )
    FROM pg_roles
    WHERE rolname !~ '^pg_'
  ), '[]'::jsonb),
  'non_system_schemas', coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'name', nspname,
        'owner', pg_get_userbyid(nspowner)
      ) ORDER BY nspname
    )
    FROM pg_namespace
    WHERE nspname <> 'information_schema'
      AND nspname !~ '^pg_'
  ), '[]'::jsonb)
)::text;
