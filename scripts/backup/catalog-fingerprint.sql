WITH schemas AS (
  SELECT
    count(*) AS object_count,
    md5(coalesce(string_agg(
      format('%I|%I|%s', n.nspname, pg_get_userbyid(n.nspowner), coalesce(n.nspacl::text, '')),
      E'\n' ORDER BY n.nspname
    ), '')) AS fingerprint
  FROM pg_namespace AS n
  WHERE n.nspname <> 'information_schema'
    AND n.nspname !~ '^pg_'
), tables AS (
  SELECT
    count(*) AS object_count,
    md5(coalesce(string_agg(
      format(
        '%I.%I|%s|%s|%I|%s',
        n.nspname,
        c.relname,
        c.relrowsecurity,
        c.relforcerowsecurity,
        pg_get_userbyid(c.relowner),
        coalesce(c.relacl::text, '')
      ),
      E'\n' ORDER BY n.nspname, c.relname
    ), '')) AS fingerprint
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p')
    AND n.nspname <> 'information_schema'
    AND n.nspname !~ '^pg_'
), policies AS (
  SELECT
    count(*) AS object_count,
    md5(coalesce(string_agg(
      format(
        '%I.%I|%I|%s|%s|%s|%s',
        n.nspname,
        c.relname,
        p.polname,
        p.polpermissive,
        ARRAY(
          SELECT policy_role.role_name
          FROM (
            SELECT 'PUBLIC'::name AS role_name
            WHERE 0::oid = ANY (p.polroles)
            UNION ALL
            SELECT r.rolname
            FROM pg_roles AS r
            WHERE r.oid = ANY (p.polroles)
          ) AS policy_role
          ORDER BY policy_role.role_name
        )::text,
        coalesce(pg_get_expr(p.polqual, p.polrelid), ''),
        coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
      ),
      E'\n' ORDER BY n.nspname, c.relname, p.polname
    ), '')) AS fingerprint
  FROM pg_policy AS p
  JOIN pg_class AS c ON c.oid = p.polrelid
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname <> 'information_schema'
    AND n.nspname !~ '^pg_'
), routines AS (
  SELECT
    count(*) AS object_count,
    md5(coalesce(string_agg(
      format(
        '%I.%I(%s)|%s|%I|%s|%s',
        n.nspname,
        p.proname,
        pg_get_function_identity_arguments(p.oid),
        p.prosecdef,
        pg_get_userbyid(p.proowner),
        coalesce(p.proacl::text, ''),
        pg_get_functiondef(p.oid)
      ),
      E'\n' ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
    ), '')) AS fingerprint
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE p.prokind IN ('f', 'p')
    AND n.nspname <> 'information_schema'
    AND n.nspname !~ '^pg_'
), roles AS (
  SELECT
    count(*) AS object_count,
    md5(coalesce(string_agg(
      format(
        '%I|%s|%s|%s|%s|%s|%s|%s|%s',
        rolname,
        rolsuper,
        rolinherit,
        rolcreaterole,
        rolcreatedb,
        rolcanlogin,
        rolreplication,
        rolbypassrls,
        rolconfig::text
      ),
      E'\n' ORDER BY rolname
    ), '')) AS fingerprint
  FROM pg_roles
  WHERE rolname !~ '^pg_'
), role_memberships AS (
  SELECT
    count(*) AS object_count,
    md5(coalesce(string_agg(
      format('%I|%I|%I|%s|%s|%s', role.rolname, member.rolname, grantor.rolname, m.admin_option, m.inherit_option, m.set_option),
      E'\n' ORDER BY role.rolname, member.rolname, grantor.rolname
    ), '')) AS fingerprint
  FROM pg_auth_members AS m
  JOIN pg_roles AS role ON role.oid = m.roleid
  JOIN pg_roles AS member ON member.oid = m.member
  JOIN pg_roles AS grantor ON grantor.oid = m.grantor
), extensions AS (
  SELECT
    count(*) AS object_count,
    md5(coalesce(string_agg(
      format('%I|%s|%I', e.extname, e.extversion, n.nspname),
      E'\n' ORDER BY e.extname
    ), '')) AS fingerprint
  FROM pg_extension AS e
  JOIN pg_namespace AS n ON n.oid = e.extnamespace
)
SELECT jsonb_build_object(
  'schemas', to_jsonb(schemas),
  'tables', to_jsonb(tables),
  'policies', to_jsonb(policies),
  'routines', to_jsonb(routines),
  'roles', to_jsonb(roles),
  'role_memberships', to_jsonb(role_memberships),
  'extensions', to_jsonb(extensions)
)::text
FROM schemas, tables, policies, routines, roles, role_memberships, extensions;
