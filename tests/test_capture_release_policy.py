import unittest
from dataclasses import replace
from scripts.backup.capture_release_policy import (Evidence, classify, PROJECT, BRANCH,
    VERIFIED, FAILED, UNTESTED, QUARANTINE, NO_RELEASE)

BASE = Evidence(project=PROJECT, git_ref=BRANCH, source_sha='a'*40,
  expected_sha='a'*40, run_id='39905745697',
  file_name='lari-ciphertext-39905745697.age', ciphertext_sha256='b'*64,
  ciphertext_bytes=321, encrypted_ok=True, sha256_rechecked=True,
  source_capture_ok=True, restore_verdict=VERIFIED,
  opt_in_mode='verified_only', owner_confirmation='')

class PolicyTests(unittest.TestCase):
    def test_verified_only_on_real_verdict(self):
        o=classify(BASE)
        self.assertEqual(o['classification'],VERIFIED)
        self.assertTrue(o['publish_verified'])
        self.assertFalse(o['publish_quarantine'])
        # Even a successful logical restore is not enough for production/P0: offsite recovery remains separately gated.
        self.assertFalse(o['p0_eligible'])

    def test_restore_failure_default_terminates(self):
        self.assertEqual(classify(replace(BASE,restore_verdict=FAILED))['classification'],NO_RELEASE)

    def test_quarantine_needs_distinct_owner_confirmation(self):
        q=replace(BASE,opt_in_mode='quarantine_opt_in',restore_verdict=FAILED)
        self.assertEqual(classify(q)['classification'],NO_RELEASE)
        allowed=replace(q,owner_confirmation=f'QUARANTINE CAPTURE {PROJECT}')
        out=classify(allowed)
        self.assertEqual(out['classification'],QUARANTINE)
        self.assertTrue(out['publish_quarantine'])
        self.assertFalse(out['publish_verified'])
        self.assertFalse(out['p0_eligible'])
        self.assertTrue(out['quarantine_is_not_recovery_backup'])
        self.assertEqual(out['max_retention_days'],1)

    def test_capture_only_quarantine_remains_unverified(self):
        q=replace(BASE,opt_in_mode='quarantine_opt_in',restore_verdict=UNTESTED,
                  owner_confirmation=f'QUARANTINE CAPTURE {PROJECT}')
        out=classify(q)
        self.assertEqual(out['classification'],QUARANTINE)
        self.assertFalse(out['restore_verified'])
        self.assertFalse(out['p0_eligible'])

    def test_quarantine_cannot_become_verified_publication(self):
        q=replace(BASE,opt_in_mode='quarantine_opt_in',owner_confirmation=f'QUARANTINE CAPTURE {PROJECT}')
        self.assertEqual(classify(q)['classification'],NO_RELEASE)

    def test_wrong_ref_and_project_fail(self):
        for e in [replace(BASE,project='another'),replace(BASE,git_ref='refs/heads/main'),
                replace(BASE,source_sha='c'*40),replace(BASE,expected_sha='c'*40)]:
            self.assertEqual(classify(e)['classification'],NO_RELEASE)

    def test_never_upload_when_ciphertext_incomplete(self):
        for e in [replace(BASE,encrypted_ok=False),replace(BASE,sha256_rechecked=False),
                 replace(BASE,source_capture_ok=False),replace(BASE,ciphertext_bytes=0),
                 replace(BASE,ciphertext_sha256='not-a-hash')]:
            self.assertEqual(classify(e)['classification'],NO_RELEASE)

    def test_reject_path_traversal(self):
        for name in ['../dump.age','private/dump.age','a..b.age','dump.tar.gz','']:
            self.assertEqual(classify(replace(BASE,file_name=name))['classification'],NO_RELEASE)

    def test_unexpected_verdict_is_rejected(self):
        self.assertEqual(classify(replace(BASE,restore_verdict='SUCCESS'))['classification'],NO_RELEASE)

    def test_never_print_secret_material(self):
        s=str(classify(BASE))
        for secret in ('password','private_key','database.dump','roles.sql'):
            self.assertNotIn(secret,s)

if __name__=='__main__':unittest.main()
