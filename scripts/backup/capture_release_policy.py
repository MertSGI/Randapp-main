#!/usr/bin/env python3
"""LARİ source-only candidate artifact classification policy.

This module does NOT capture, restore, encrypt, upload, or authorize anything.
A live workflow must independently validate all supplied evidence from local
filesystem and CI context, and separately enforce GitHub upload gates.
"""
from __future__ import annotations

from dataclasses import dataclass
import argparse
import json
import re
import sys

PROJECT = 'rwedeejhjazwjthdjzrt'
BRANCH = 'refs/heads/staging/supabase-staging-consistency'
VERIFIED = 'VERIFIED_LOGICAL_RESTORE'
FAILED = 'NOT_RESTORABLE_IN_DISPOSABLE_POSTGRES_17'
UNTESTED = 'RESTORE_NOT_TESTED'
QUARANTINE = 'UNVERIFIED_ENCRYPTED_CAPTURE'
NO_RELEASE = 'NO_ARTIFACT_ELIGIBLE'
SHA256 = re.compile(r'[0-9a-f]{64}\Z')
COMMIT = re.compile(r'[0-9a-f]{40}\Z')
NAME = re.compile(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,119}\.age\Z')
RUN = re.compile(r'[1-9][0-9]{0,18}\Z')


@dataclass(frozen=True)
class Evidence:
    project: str
    git_ref: str
    source_sha: str
    expected_sha: str
    run_id: str
    file_name: str
    ciphertext_sha256: str
    ciphertext_bytes: int
    encrypted_ok: bool
    sha256_rechecked: bool
    source_capture_ok: bool
    restore_verdict: str
    opt_in_mode: str = 'verified_only'
    owner_confirmation: str = ''


def _eligible(e: Evidence) -> bool:
    return all((
        e.project == PROJECT,
        e.git_ref == BRANCH,
        bool(COMMIT.fullmatch(e.source_sha)),
        e.source_sha == e.expected_sha,
        bool(RUN.fullmatch(e.run_id)),
        bool(NAME.fullmatch(e.file_name)),
        '..' not in e.file_name,
        bool(SHA256.fullmatch(e.ciphertext_sha256)),
        isinstance(e.ciphertext_bytes, int) and not isinstance(e.ciphertext_bytes, bool) and e.ciphertext_bytes > 0,
        e.encrypted_ok is True,
        e.sha256_rechecked is True,
        e.source_capture_ok is True,
        e.restore_verdict in (VERIFIED, FAILED, UNTESTED),
        e.opt_in_mode in ('verified_only', 'quarantine_opt_in'),
    ))


def classify(e: Evidence) -> dict:
    """Return fixed enums and public nonsecret integrity metadata only.

    In particular, quarantine never returns VERIFIED and is NEVER P0 eligible.
    No unencrypted artifact name is ever emitted.
    """
    if not _eligible(e):
        return {'classification': NO_RELEASE, 'publish_verified': False,
                'publish_quarantine': False, 'p0_eligible': False}
    if e.restore_verdict == VERIFIED:
        if e.opt_in_mode == 'verified_only':
            return _receipt(e, VERIFIED, True, False, False)
        # A quarantine-specific workflow must not impersonate a verified lane.
        return {'classification': NO_RELEASE, 'publish_verified': False,
                'publish_quarantine': False, 'p0_eligible': False}
    if (e.restore_verdict in (FAILED, UNTESTED)
            and e.opt_in_mode == 'quarantine_opt_in'
            and e.owner_confirmation == f'QUARANTINE CAPTURE {PROJECT}'):
        return _receipt(e, QUARANTINE, False, True, False)
    return {'classification': NO_RELEASE, 'publish_verified': False,
            'publish_quarantine': False, 'p0_eligible': False}


def _receipt(e: Evidence, status: str, verified: bool, quarantine: bool, p0: bool) -> dict:
    return {
        'classification': status,
        'publish_verified': verified,
        'publish_quarantine': quarantine,
        'p0_eligible': p0,
        'source_project_ref': PROJECT,
        'source_revision': e.source_sha,
        'run_id': e.run_id,
        'encrypted_file': e.file_name,
        'encrypted_sha256': e.ciphertext_sha256,
        'encrypted_size_bytes': e.ciphertext_bytes,
        'encrypted_integrity_checked': True,
        'restore_verified': verified,
        'quarantine_is_not_recovery_backup': quarantine,
        'max_retention_days': 1 if quarantine else 7,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description='Offline LARI source-only artifact policy evaluator')
    parser.add_argument('evidence_json', help='Private, nonsecret evidence file')
    args = parser.parse_args()
    try:
        with open(args.evidence_json, 'r', encoding='utf-8') as f:
            raw = json.load(f)
        if not isinstance(raw, dict) or set(raw) != set(Evidence.__dataclass_fields__):
            raise ValueError('schema')
        e = Evidence(**raw)
        receipt = classify(e)
    except (OSError, UnicodeError, ValueError, TypeError):
        receipt = {'classification': NO_RELEASE, 'publish_verified': False,
                   'publish_quarantine': False, 'p0_eligible': False}
    print(json.dumps(receipt, sort_keys=True, separators=(',', ':')))
    return 0 if receipt['classification'] != NO_RELEASE else 1


if __name__ == '__main__':
    raise SystemExit(main())
