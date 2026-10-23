import unittest
from scripts.backup.safe_restore_error import classify

class ErrorClassifierTest(unittest.TestCase):
    def test_redacts_secrets_and_object_names(self):
        for data,expected in [
            ('ERROR: extension "supabase_vault" is not available', 'PG_EXTENSION_MISSING'),
            ('ERROR: schema "auth" already exists','PG_SCHEMA_COLLISION'),
            ('ERROR: role "sensitive_private_role_123" does not exist', 'PG_ROLE_MISSING'),
            ('ERROR: permission denied to grant privileges as role "secret"', 'PG_GRANT_PERMISSION'),
            ('ERROR: relation "secret_schema.private_clients" does not exist', 'PG_OBJECT_MISSING'),
        ]:
            result=classify(data)
            self.assertEqual(result, expected)
            self.assertNotIn('secret',result)
        self.assertEqual(classify('password=TopSecret123'), 'PG_ERROR_UNCLASSIFIED')

if __name__=='__main__':
    unittest.main()
