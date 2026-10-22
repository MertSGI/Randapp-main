#!/usr/bin/env python3
"""Report a fixed allowlist diagnostic from a private PostgreSQL stderr file.

Never emit any external input content; only predefined strings/codes. The caller
must delete private log files after reading (including on exception).
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

# First matching category returned. Reconsider precedence only after fixtures.
RULES = [
    ('PG_EXTENSION_MISSING', re.compile(r'extension\s+.+?\s+is not available', re.I)),
    ('PG_SCHEMA_COLLISION', re.compile(r'schema\s+.+?\s+already exists', re.I)),
    ('PG_ROLE_MISSING', re.compile(r'role\s+.+?\s+does not exist', re.I)),
    ('PG_GRANT_PERMISSION', re.compile(r'(grantor must have the ADMIN option|permission denied to grant privileges)', re.I)),
    ('PG_ROLE_CYCLE', re.compile(r'role\s+.+?\s+is a member of role', re.I)),
    ('PG_PERMISSION_DENIED', re.compile(r'permission denied', re.I)),
    ('PG_OBJECT_MISSING', re.compile(r'(relation|function|schema|type|sequence)\s+.+?\s+does not exist', re.I)),
    ('PG_DUPLICATE_OBJECT', re.compile(r'(table|relation|type|role|extension)\s+.+?\s+already exists', re.I)),
    ('PG_DEPENDENCY_FAILED', re.compile(r'(cannot drop|depends on|dependency)', re.I)),
    ('PG_TRANSACTION_ABORTED', re.compile(r'current transaction is aborted', re.I)),
]

def classify(content: str) -> str:
    # Do not emit full logs or hashed secret-bearing values.
    for tag, regex in RULES:
        if regex.search(content):
            return tag
    return 'PG_ERROR_UNCLASSIFIED'


def main() -> int:
    if len(sys.argv) != 2:
        print('RESTORE_ERROR_CLASS=PG_DIAGNOSTIC_INPUT_INVALID')
        return 2
    try:
        # Bound diagnostic read; no direct stderr content is written to output.
        with Path(sys.argv[1]).open('rb') as f:
            data=f.read(1024 * 1024).decode('utf-8',errors='replace')
        result=classify(data)
    except Exception:
        result='PG_DIAGNOSTIC_READ_FAILED'
    print(f'RESTORE_ERROR_CLASS={result}')
    return 0

if __name__=='__main__':
    raise SystemExit(main())
