import unittest
from scripts.backup.prepare_roles_pg17 import transform, parse_grant

REAL_ROLE_NAMES = [
    'anon', 'authenticated', 'authenticator', 'cli_login_postgres',
    'dashboard_user', 'pgbouncer', 'postgres', 'service_role',
    'supabase_admin', 'supabase_auth_admin', 'supabase_etl_admin',
    'supabase_privileged_role', 'supabase_read_only_user',
    'supabase_realtime_admin', 'supabase_replication_admin',
    'supabase_storage_admin',
]
# Exact NON-SENSITIVE source shape recorded by Controller read-only catalog SQL.
# Format: target role, member, ADMIN, INHERIT, SET. Source grantor always bootstrap.
ACTUAL_SOURCE_SHAPE = [
    ('anon','authenticator',False,False,True),
    ('anon','postgres',True,True,True),
    ('authenticated','authenticator',False,False,True),
    ('authenticated','postgres',True,True,True),
    ('authenticator','postgres',True,True,True),
    ('authenticator','supabase_storage_admin',False,False,True),
    ('postgres','cli_login_postgres',False,False,True),
    ('service_role','authenticator',False,False,True),
    ('service_role','postgres',True,True,True),
    ('supabase_privileged_role','postgres',False,True,True),
    ('supabase_privileged_role','supabase_etl_admin',False,True,True),
]


def build_fixture():
    lines = ['-- pg_dumpall --roles-only non-secret representative source shape\n']
    for role in REAL_ROLE_NAMES:
        lines.extend((f'CREATE ROLE "{role}";\n', f'ALTER ROLE "{role}" WITH LOGIN;\n'))
    for target, member, admin, inherit, can_set in ACTUAL_SOURCE_SHAPE:
        op = lambda b: 'TRUE' if b else 'FALSE'
        lines.append(
            f'GRANT "{target}" TO "{member}" WITH ADMIN {op(admin)}, '
            f'INHERIT {op(inherit)}, SET {op(can_set)} GRANTED BY "supabase_admin";\n'
        )
    return ''.join(lines)


class RoleParserTest(unittest.TestCase):
    def test_exact_source_shaped_counts(self):
        self.assertEqual(len(REAL_ROLE_NAMES),16)
        self.assertEqual(len(ACTUAL_SOURCE_SHAPE),11)
        self.assertEqual(sum(not inh or not set_option for _,_,_,inh,set_option in ACTUAL_SOURCE_SHAPE),5)
        src=build_fixture(); dst, receipt=transform(src)
        self.assertEqual(receipt, {'create_roles':16,'membership_edges':11,'extra_grants':0})
        self.assertIn('DO $lari_role_grant_bootstrap$ BEGIN NULL;',dst)
        self.assertEqual(dst.count('GRANT "'),11)
        self.assertTrue(all(line in dst for line in src.splitlines(keepends=True) if line.startswith('GRANT ')))
        self.assertEqual(dst.count('CREATE ROLE "'),16)

    def test_grant_option_preserved(self):
        rec = parse_grant('GRANT "anon" TO "authenticator" WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY "supabase_admin";')
        self.assertEqual(rec['options'], {'ADMIN':False,'INHERIT':False,'SET':True})
        self.assertEqual(rec['grantor'],'supabase_admin')

    def test_reject_nonbootstrap_grantor(self):
        with self.assertRaisesRegex(ValueError,'NON_BOOTSTRAP'):
            transform('CREATE ROLE "a";\nGRANT "a" TO "b" GRANTED BY "c";\n')

    def test_reject_malformed_flags(self):
        with self.assertRaises(ValueError):
            transform('CREATE ROLE "a";\nGRANT "a" TO "b" WITH SET MAYBE GRANTED BY "supabase_admin";\n')

    def test_reject_cycle(self):
        with self.assertRaisesRegex(ValueError,'CYCLE'):
            transform('CREATE ROLE "a";\nGRANT "a" TO "b";\nGRANT "b" TO "a";\n')

    def test_reject_duplicate_option(self):
        with self.assertRaisesRegex(ValueError, 'DUPLICATE'):
            transform('CREATE ROLE "a";\nGRANT "a" TO "b" WITH SET TRUE, SET FALSE GRANTED BY "supabase_admin";\n')

    def test_quoted_identifier_with_comma(self):
        grant = parse_grant('GRANT "weird, role" TO "member" GRANTED BY "supabase_admin";')
        self.assertEqual(grant['targets'], ['weird, role'])
        self.assertEqual(grant['members'], ['member'])

    def test_parameter_grant_preserved(self):
        s='CREATE ROLE "a";\nGRANT SET ON PARAMETER work_mem TO "a";\n'
        out, stats=transform(s)
        self.assertIn('GRANT SET ON PARAMETER work_mem TO "a";',out)
        self.assertEqual(stats['membership_edges'],0)


if __name__ == '__main__':
    unittest.main()
