import io
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts' / 'backup'))
from safe_capture_diagnostics import emit


class SafeCaptureDiagnosticsTest(unittest.TestCase):
    def test_secret_bearing_pg_error_is_redacted(self):
        with tempfile.TemporaryDirectory() as directory:
            confidential = 'MY_PASSWORD_IS_NEVER_TO_PRINT_123'
            (Path(directory) / 'source-dump.stderr').write_text(
                f'ERROR: role "{confidential}" does not exist\n'
                'DATABASE_URL=postgresql://private:secret@internal-host/db\n'
            )
            output = io.StringIO()
            emit(Path(directory), output)
            msg = output.getvalue()
            self.assertIn('CAPTURE_FAILURE_STAGE=SOURCE_DATABASE_EXPORT', msg)
            self.assertIn('RESTORE_ERROR_CLASS=PG_ROLE_MISSING', msg)
            for forbidden in (confidential, 'postgresql://', 'internal-host', 'secret', 'DATABASE_URL='):
                self.assertNotIn(forbidden, msg)

    def test_other_stderr_categories_are_fixed_names(self):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / 'age.stderr').write_text('ERROR: private-token=VerySecretValue!')
            output = io.StringIO()
            emit(Path(directory), output)
            self.assertEqual(output.getvalue().strip(),
                             'CAPTURE_FAILURE_STAGE=AGE_ENCRYPTION RESTORE_ERROR_CLASS=PG_ERROR_UNCLASSIFIED')

    def test_precheck_without_any_private_logs(self):
        with tempfile.TemporaryDirectory() as directory:
            output = io.StringIO()
            emit(Path(directory), output)
            self.assertEqual(output.getvalue().strip(),
                             'CAPTURE_FAILURE_STAGE=PRECHECK RESTORE_ERROR_CLASS=PG_ERROR_UNCLASSIFIED')

    def test_unlisted_error_files_are_never_inspected_or_named(self):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / 'custom-customer-password.stderr').write_text('private_secret')
            output = io.StringIO()
            emit(Path(directory), output)
            self.assertNotIn('custom', output.getvalue())
            self.assertNotIn('private', output.getvalue())

    def test_symlink_private_log_is_never_followed(self):
        if not hasattr(os, 'O_NOFOLLOW'):
            self.skipTest('O_NOFOLLOW unavailable')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'very-secret.txt').write_text('ERROR: role "SECRET" does not exist')
            (root / 'source-dump.stderr').symlink_to(root / 'very-secret.txt')
            output = io.StringIO()
            emit(root, output)
            self.assertNotIn('SOURCE_DATABASE_EXPORT', output.getvalue())
            self.assertNotIn('SECRET', output.getvalue())


if __name__ == '__main__':
    unittest.main()
