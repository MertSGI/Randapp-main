SET search_path = pg_catalog;

WITH schemas_rows AS (
  SELECT
    n.nspname AS obj_key,
    pg_catalog.pg_get_userbyid(n.nspowner) AS owner_name,
    CASE
      WHEN n.nspacl IS NULL THEN '<default>'
      ELSE coalesce((
        SELECT pg_catalog.string_agg(
          pg_catalog.format(
            '%s|%s|%s|%s',
            pg_catalog.pg_get_userbyid(a.grantor),
            CASE WHEN a.grantee = 0::oid THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
            a.privilege_type,
            a.is_grantable
          ),
          ',' ORDER BY
            pg_catalog.pg_get_userbyid(a.grantor) COLLATE "C",
            (CASE WHEN a.grantee = 0::oid THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END) COLLATE "C",
            a.privilege_type COLLATE "C",
            a.is_grantable
        )
        FROM pg_catalog.aclexplode(n.nspacl) AS a
        WHERE NOT (
          n.nspname IN ('graphql', 'graphql_public')
          AND a.is_grantable = false
          AND pg_catalog.pg_get_userbyid(a.grantor) IN ('postgres', 'supabase_admin')
          AND a.grantee <> 0::oid
          AND (
            (
              pg_catalog.pg_get_userbyid(a.grantee) IN ('postgres', 'supabase_admin')
              AND a.privilege_type IN ('USAGE', 'CREATE')
            )
            OR (
              pg_catalog.pg_get_userbyid(a.grantee) IN ('supabase_read_only_user', 'dashboard_user', 'cli_login_postgres')
              AND a.privilege_type = 'USAGE'
            )
          )
        )
      ), '<default>')
    END AS acl_norm
  FROM pg_catalog.pg_namespace AS n
  WHERE n.nspname <> 'information_schema'
    AND n.nspname !~ '^pg_'
), schemas AS (
  SELECT
    count(*) AS object_count,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.format('%I|%I|%s', obj_key, owner_name, acl_norm),
      E'\n' ORDER BY obj_key COLLATE "C"
    ), '')) AS fingerprint
  FROM schemas_rows
), tables_rows AS (
  SELECT
    pg_catalog.format('%I.%I', n.nspname, c.relname) AS obj_key,
    n.nspname AS schema_name,
    c.relname AS rel_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS force_rls,
    pg_catalog.pg_get_userbyid(c.relowner) AS owner_name,
    CASE
      WHEN c.relacl IS NULL THEN '<default>'
      ELSE coalesce((
        SELECT pg_catalog.string_agg(
          pg_catalog.format(
            '%s|%s|%s|%s',
            pg_catalog.pg_get_userbyid(a.grantor),
            CASE WHEN a.grantee = 0::oid THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
            a.privilege_type,
            a.is_grantable
          ),
          ',' ORDER BY
            pg_catalog.pg_get_userbyid(a.grantor) COLLATE "C",
            (CASE WHEN a.grantee = 0::oid THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END) COLLATE "C",
            a.privilege_type COLLATE "C",
            a.is_grantable
        )
        FROM pg_catalog.aclexplode(c.relacl) AS a
        WHERE NOT (
          n.nspname = 'realtime' AND c.relname = 'schema_migrations'
          AND a.is_grantable = false
          AND pg_catalog.pg_get_userbyid(a.grantor) IN ('postgres', 'supabase_admin', 'supabase_realtime_admin')
          AND a.grantee <> 0::oid
          AND (
            (
              a.grantor = c.relowner
              AND a.grantee = c.relowner
              AND pg_catalog.pg_get_userbyid(a.grantee) IN ('postgres', 'supabase_admin', 'supabase_realtime_admin')
            )
            OR (
              pg_catalog.pg_get_userbyid(a.grantee) IN ('postgres', 'supabase_admin', 'supabase_realtime_admin')
              AND a.privilege_type IN ('SELECT', 'INSERT', 'UPDATE')
            )
            OR (
              pg_catalog.pg_get_userbyid(a.grantee) IN ('supabase_read_only_user', 'dashboard_user', 'cli_login_postgres')
              AND a.privilege_type = 'SELECT'
            )
          )
        )
      ), '<default>')
    END AS acl_norm
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p')
    AND n.nspname <> 'information_schema'
    AND n.nspname !~ '^pg_'
), tables AS (
  SELECT
    count(*) AS object_count,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.format('%s|%s|%s|%I|%s', obj_key, rls_enabled, force_rls, owner_name, acl_norm),
      E'\n' ORDER BY schema_name COLLATE "C", rel_name COLLATE "C"
    ), '')) AS fingerprint
  FROM tables_rows
), policies_rows AS (
  SELECT
    pg_catalog.format('%I.%I.%I', n.nspname, c.relname, p.polname) AS obj_key,
    n.nspname AS schema_name,
    c.relname AS rel_name,
    p.polname AS pol_name,
    p.polcmd::text AS pol_cmd,
    p.polpermissive AS pol_permissive,
    ARRAY(
      SELECT policy_role.role_name
      FROM (
        SELECT 'PUBLIC'::name AS role_name
        WHERE 0::oid = ANY (p.polroles)
        UNION ALL
        SELECT r.rolname
        FROM pg_catalog.pg_roles AS r
        WHERE r.oid = ANY (p.polroles)
      ) AS policy_role
      ORDER BY policy_role.role_name COLLATE "C"
    )::text AS roles_norm,
    coalesce((
      SELECT pg_catalog.string_agg(
        CASE
          WHEN m.tok[1] ~ '^=\s*ANY\s*\(' THEN
            pg_catalog.regexp_replace(
              pg_catalog.regexp_replace(
                m.tok[1],
                '\(ARRAY\[((?:''(?:[^'']|'''')*''::(?:character varying|varchar|bpchar|text|name)(?:,\s*''(?:[^'']|'''')*''::(?:character varying|varchar|bpchar|text|name))*))\]\)::text\[\]',
                'ARRAY[\1]',
                'g'
              ),
              '\((''(?:[^'']|'''')*''::(?:character varying|varchar|bpchar|text|name))\)::text',
              '\1',
              'g'
            )
          ELSE m.tok[1]
        END,
        '' ORDER BY m.ord
      )
      FROM pg_catalog.regexp_matches(
        coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), ''),
        '(=\s*ANY\s*\(\(ARRAY\[(?:''(?:[^'']|'''')*''::(?:character varying|varchar|bpchar|text|name)(?:,\s*''(?:[^'']|'''')*''::(?:character varying|varchar|bpchar|text|name))*)\]\)::text\[\]\)|=\s*ANY\s*\(ARRAY\[\(''(?:[^'']|'''')*''::(?:character varying|varchar|bpchar|text|name)\)::text(?:,\s*\(''(?:[^'']|'''')*''::(?:character varying|varchar|bpchar|text|name)\)::text)*\]\)|''(?:[^'']|'''')*''|"(?:[^"]|"")*"|[^''"=]+|=|''|")',
        'g'
      ) WITH ORDINALITY AS m(tok, ord)
    ), '') AS qual_expr,
    coalesce((
      SELECT pg_catalog.string_agg(
        CASE
          WHEN m.tok[1] ~ '^=\s*ANY\s*\(' THEN
            pg_catalog.regexp_replace(
              pg_catalog.regexp_replace(
                m.tok[1],
                '\(ARRAY\[((?:''(?:[^'']|'''')*''::(?:character varying|varchar|bpchar|text|name)(?:,\s*''(?:[^'']|'''')*''::(?:character varying|varchar|bpchar|text|name))*))\]\)::text\[\]',
                'ARRAY[\1]',
                'g'
              ),
              '\((''(?:[^'']|'''')*''::(?:character varying|varchar|bpchar|text|name))\)::text',
              '\1',
              'g'
            )
          ELSE m.tok[1]
        END,
        '' ORDER BY m.ord
      )
      FROM pg_catalog.regexp_matches(
        coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''),
        '(=\s*ANY\s*\(\(ARRAY\[(?:''(?:[^'']|'''')*''::(?:character varying|varchar|bpchar|text|name)(?:,\s*''(?:[^'']|'''')*''::(?:character varying|varchar|bpchar|text|name))*)\]\)::text\[\]\)|=\s*ANY\s*\(ARRAY\[\(''(?:[^'']|'''')*''::(?:character varying|varchar|bpchar|text|name)\)::text(?:,\s*\(''(?:[^'']|'''')*''::(?:character varying|varchar|bpchar|text|name)\)::text)*\]\)|''(?:[^'']|'''')*''|"(?:[^"]|"")*"|[^''"=]+|=|''|")',
        'g'
      ) WITH ORDINALITY AS m(tok, ord)
    ), '') AS withcheck_expr
  FROM pg_catalog.pg_policy AS p
  JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname <> 'information_schema'
    AND n.nspname !~ '^pg_'
), policies AS (
  SELECT
    count(*) AS object_count,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.format(
        '%I.%I|%I|%s|%s|%s|%s|%s',
        schema_name,
        rel_name,
        pol_name,
        pol_cmd,
        pol_permissive,
        roles_norm,
        qual_expr,
        withcheck_expr
      ),
      E'\n' ORDER BY schema_name COLLATE "C", rel_name COLLATE "C", pol_name COLLATE "C"
    ), '')) AS fingerprint
  FROM policies_rows
), routines_base AS (
  SELECT
    p.oid AS proc_oid,
    pg_catalog.format('%I.%I(%s)', n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)) AS obj_key,
    n.nspname AS schema_name,
    p.proname AS proc_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS proc_args,
    p.prosecdef AS proc_secdef,
    p.proowner AS proc_owner_oid,
    p.proacl AS proc_acl,
    (
      NOT p.prosecdef
      AND n.nspname = 'extensions'
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_depend AS d
        JOIN pg_catalog.pg_extension AS e
          ON e.oid = d.refobjid
         AND d.refclassid = 'pg_catalog.pg_extension'::regclass
        WHERE d.classid = 'pg_catalog.pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
          AND e.extname IN ('pgcrypto', 'pg_stat_statements')
      )
    ) AS is_normalized_ext_routine,
    coalesce(pg_catalog.pg_get_functiondef(p.oid), '') AS func_def
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE p.prokind IN ('f', 'p')
    AND n.nspname <> 'information_schema'
    AND n.nspname !~ '^pg_'
), routines_rows AS (
  SELECT
    rb.obj_key,
    rb.schema_name,
    rb.proc_name,
    rb.proc_args,
    rb.proc_secdef,
    CASE
      WHEN rb.is_normalized_ext_routine AND pg_catalog.pg_get_userbyid(rb.proc_owner_oid) IN ('postgres', 'supabase_admin')
        THEN '<extension_installer>'
      ELSE pg_catalog.pg_get_userbyid(rb.proc_owner_oid)
    END AS owner_name,
    CASE
      WHEN rb.proc_acl IS NULL THEN '<default>'
      ELSE coalesce((
        SELECT pg_catalog.string_agg(
          pg_catalog.format(
            '%s|%s|%s|%s',
            CASE
              WHEN rb.is_normalized_ext_routine
               AND a.is_grantable = false
               AND pg_catalog.pg_get_userbyid(a.grantor) IN ('postgres', 'supabase_admin')
                THEN '<extension_installer>'
              ELSE pg_catalog.pg_get_userbyid(a.grantor)
            END,
            CASE WHEN a.grantee = 0::oid THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
            a.privilege_type,
            a.is_grantable
          ),
          ',' ORDER BY
            (CASE
              WHEN rb.is_normalized_ext_routine
               AND a.is_grantable = false
               AND pg_catalog.pg_get_userbyid(a.grantor) IN ('postgres', 'supabase_admin')
                THEN '<extension_installer>'
              ELSE pg_catalog.pg_get_userbyid(a.grantor)
            END) COLLATE "C",
            (CASE WHEN a.grantee = 0::oid THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END) COLLATE "C",
            a.privilege_type COLLATE "C",
            a.is_grantable
        )
        FROM pg_catalog.aclexplode(rb.proc_acl) AS a
      ), '')
    END AS acl_norm,
    rb.func_def
  FROM routines_base AS rb
), routines AS (
  SELECT
    count(*) AS object_count,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.format('%s|%s|%I|%s|%s', obj_key, proc_secdef, owner_name, acl_norm, func_def),
      E'\n' ORDER BY schema_name COLLATE "C", proc_name COLLATE "C", proc_args COLLATE "C"
    ), '')) AS fingerprint
  FROM routines_rows
), roles AS (
  SELECT
    count(*) AS object_count,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.format(
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
      E'\n' ORDER BY rolname COLLATE "C"
    ), '')) AS fingerprint
  FROM pg_catalog.pg_roles
  WHERE rolname !~ '^pg_'
), role_memberships AS (
  SELECT
    count(*) AS object_count,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.format('%I|%I|%I|%s|%s|%s', role.rolname, member.rolname, grantor.rolname, m.admin_option, m.inherit_option, m.set_option),
      E'\n' ORDER BY role.rolname COLLATE "C", member.rolname COLLATE "C", grantor.rolname COLLATE "C"
    ), '')) AS fingerprint
  FROM pg_catalog.pg_auth_members AS m
  JOIN pg_catalog.pg_roles AS role ON role.oid = m.roleid
  JOIN pg_catalog.pg_roles AS member ON member.oid = m.member
  JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = m.grantor
), extensions AS (
  SELECT
    count(*) AS object_count,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.format('%I|%s|%I', e.extname, e.extversion, n.nspname),
      E'\n' ORDER BY e.extname COLLATE "C"
    ), '')) AS fingerprint
  FROM pg_catalog.pg_extension AS e
  JOIN pg_catalog.pg_namespace AS n ON n.oid = e.extnamespace
), diagnostic AS (
  SELECT pg_catalog.jsonb_build_object(
    'runtime', pg_catalog.jsonb_build_object(
      'server_version_num', pg_catalog.current_setting('server_version_num'),
      'search_path', pg_catalog.current_setting('search_path')
    ),
    'objects', pg_catalog.jsonb_build_object(
      'schemas', coalesce((
        SELECT pg_catalog.jsonb_object_agg(
          obj_key,
          pg_catalog.jsonb_build_object(
            'owner_hash', pg_catalog.md5(owner_name),
            'acl_hash', pg_catalog.md5(acl_norm)
          )
        )
        FROM schemas_rows
      ), '{}'::jsonb),
      'tables', coalesce((
        SELECT pg_catalog.jsonb_object_agg(
          obj_key,
          pg_catalog.jsonb_build_object(
            'rls', rls_enabled,
            'force_rls', force_rls,
            'owner_hash', pg_catalog.md5(owner_name),
            'acl_hash', pg_catalog.md5(acl_norm)
          )
        )
        FROM tables_rows
      ), '{}'::jsonb),
      'policies', coalesce((
        SELECT pg_catalog.jsonb_object_agg(
          obj_key,
          pg_catalog.jsonb_build_object(
            'cmd', pol_cmd,
            'permissive', pol_permissive,
            'roles_hash', pg_catalog.md5(roles_norm),
            'qual_hash', pg_catalog.md5(qual_expr),
            'withcheck_hash', pg_catalog.md5(withcheck_expr)
          )
        )
        FROM policies_rows
      ), '{}'::jsonb),
      'routines', coalesce((
        SELECT pg_catalog.jsonb_object_agg(
          obj_key,
          pg_catalog.jsonb_build_object(
            'secdef', proc_secdef,
            'owner_hash', pg_catalog.md5(owner_name),
            'acl_hash', pg_catalog.md5(acl_norm),
            'def_hash', pg_catalog.md5(func_def)
          )
        )
        FROM routines_rows
      ), '{}'::jsonb)
    ),
    'acl_probe', pg_catalog.jsonb_build_object(
      'schemas', coalesce((
        SELECT pg_catalog.jsonb_object_agg(
          n.nspname,
          pg_catalog.jsonb_build_object(
            'owner', pg_catalog.pg_get_userbyid(n.nspowner),
            'raw_acl', CASE
              WHEN n.nspacl IS NULL THEN '<default>'
              ELSE coalesce((
                SELECT pg_catalog.string_agg(
                  pg_catalog.format(
                    '%s|%s|%s|%s',
                    pg_catalog.pg_get_userbyid(a.grantor),
                    CASE WHEN a.grantee = 0::oid THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
                    a.privilege_type,
                    a.is_grantable
                  ),
                  ',' ORDER BY
                    pg_catalog.pg_get_userbyid(a.grantor) COLLATE "C",
                    (CASE WHEN a.grantee = 0::oid THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END) COLLATE "C",
                    a.privilege_type COLLATE "C",
                    a.is_grantable
                )
                FROM pg_catalog.aclexplode(n.nspacl) AS a
              ), '<empty>')
            END,
            'init_privs', coalesce((
              SELECT pg_catalog.string_agg(
                ip.privtype::text || ':' || coalesce((
                  SELECT pg_catalog.string_agg(
                    pg_catalog.format(
                      '%s|%s|%s|%s',
                      pg_catalog.pg_get_userbyid(a.grantor),
                      CASE WHEN a.grantee = 0::oid THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
                      a.privilege_type,
                      a.is_grantable
                    ),
                    ',' ORDER BY
                      pg_catalog.pg_get_userbyid(a.grantor) COLLATE "C",
                      (CASE WHEN a.grantee = 0::oid THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END) COLLATE "C",
                      a.privilege_type COLLATE "C",
                      a.is_grantable
                  )
                  FROM pg_catalog.aclexplode(ip.initprivs) AS a
                ), '<empty>'),
                ';' ORDER BY ip.privtype::text COLLATE "C"
              )
              FROM pg_catalog.pg_init_privs AS ip
              WHERE ip.objoid = n.oid
                AND ip.classoid = 'pg_catalog.pg_namespace'::regclass
                AND ip.objsubid = 0
            ), '<none>')
          )
        )
        FROM pg_catalog.pg_namespace AS n
        WHERE n.nspname IN ('graphql', 'graphql_public')
      ), '{}'::jsonb),
      'ext_routines', coalesce((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'ext', ext_grp.ext_name,
            'owner', ext_grp.owner_name,
            'count', ext_grp.cnt,
            'samples', ext_grp.samples,
            'raw_acl', ext_grp.raw_acl,
            'init_privs', ext_grp.init_privs_sig
          )
          ORDER BY ext_grp.ext_name COLLATE "C", ext_grp.cnt DESC
        )
        FROM (
          SELECT
            ext_sub.ext_name,
            ext_sub.owner_name,
            ext_sub.raw_acl,
            ext_sub.init_privs_sig,
            count(*) AS cnt,
            (pg_catalog.array_agg(ext_sub.obj_key ORDER BY ext_sub.obj_key COLLATE "C"))[1:3] AS samples
          FROM (
            SELECT
              e.extname AS ext_name,
              rb.obj_key,
              pg_catalog.pg_get_userbyid(rb.proc_owner_oid) AS owner_name,
              CASE
                WHEN rb.proc_acl IS NULL THEN '<default>'
                ELSE coalesce((
                  SELECT pg_catalog.string_agg(
                    pg_catalog.format(
                      '%s|%s|%s|%s',
                      pg_catalog.pg_get_userbyid(a.grantor),
                      CASE WHEN a.grantee = 0::oid THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
                      a.privilege_type,
                      a.is_grantable
                    ),
                    ',' ORDER BY
                      pg_catalog.pg_get_userbyid(a.grantor) COLLATE "C",
                      (CASE WHEN a.grantee = 0::oid THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END) COLLATE "C",
                      a.privilege_type COLLATE "C",
                      a.is_grantable
                  )
                  FROM pg_catalog.aclexplode(rb.proc_acl) AS a
                ), '<empty>')
              END AS raw_acl,
              coalesce((
                SELECT pg_catalog.string_agg(
                  ip.privtype::text || ':' || coalesce((
                    SELECT pg_catalog.string_agg(
                      pg_catalog.format(
                        '%s|%s|%s|%s',
                        pg_catalog.pg_get_userbyid(a.grantor),
                        CASE WHEN a.grantee = 0::oid THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
                        a.privilege_type,
                        a.is_grantable
                      ),
                      ',' ORDER BY
                        pg_catalog.pg_get_userbyid(a.grantor) COLLATE "C",
                        (CASE WHEN a.grantee = 0::oid THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END) COLLATE "C",
                        a.privilege_type COLLATE "C",
                        a.is_grantable
                    )
                    FROM pg_catalog.aclexplode(ip.initprivs) AS a
                  ), '<empty>'),
                  ';' ORDER BY ip.privtype::text COLLATE "C"
                )
                FROM pg_catalog.pg_init_privs AS ip
                WHERE ip.objoid = rb.proc_oid
                  AND ip.classoid = 'pg_catalog.pg_proc'::regclass
                  AND ip.objsubid = 0
              ), '<none>') AS init_privs_sig
            FROM routines_base AS rb
            JOIN pg_catalog.pg_depend AS d
              ON d.classid = 'pg_catalog.pg_proc'::regclass
             AND d.objid = rb.proc_oid
             AND d.deptype = 'e'
            JOIN pg_catalog.pg_extension AS e
              ON e.oid = d.refobjid
             AND d.refclassid = 'pg_catalog.pg_extension'::regclass
            WHERE rb.schema_name = 'extensions'
              AND e.extname IN ('pgcrypto', 'pg_stat_statements')
          ) AS ext_sub
          GROUP BY ext_sub.ext_name, ext_sub.owner_name, ext_sub.raw_acl, ext_sub.init_privs_sig
        ) AS ext_grp
      ), '[]'::jsonb)
    )
  ) AS payload
)
SELECT pg_catalog.jsonb_build_object(
  'schemas', pg_catalog.to_jsonb(schemas),
  'tables', pg_catalog.to_jsonb(tables),
  'policies', pg_catalog.to_jsonb(policies),
  'routines', pg_catalog.to_jsonb(routines),
  'roles', pg_catalog.to_jsonb(roles),
  'role_memberships', pg_catalog.to_jsonb(role_memberships),
  'extensions', pg_catalog.to_jsonb(extensions),
  'diagnostic', diagnostic.payload
)::text
FROM schemas, tables, policies, routines, roles, role_memberships, extensions, diagnostic;
