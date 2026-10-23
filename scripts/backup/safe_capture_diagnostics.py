#!/usr/bin/env python3
"""Fail-safe quarantine-capture error telemetry. No raw stderr is ever printed.

Scope: only predetermined stderr basenames from the runner's private temp dir.
Output format: a fixed-stage label and a fixed allowlisted PG error class.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

# The classifier is intentionally self-contained and has no filesystem imports
# from private backup modules, so tests and the hosted runner behave identically.
_CLASS_RULES = (
    ("PG_EXTENSION_MISSING", re.compile(r"extension\s+.+?\s+is not available", re.I)),
    ("PG_SCHEMA_COLLISION", re.compile(r"schema\s+.+?\s+already exists", re.I)),
    ("PG_ROLE_MISSING", re.compile(r"role\s+.+?\s+does not exist", re.I)),
    ("PG_GRANT_PERMISSION", re.compile(r"(grantor must have the ADMIN option|permission denied to grant privileges)", re.I)),
    ("PG_ROLE_CYCLE", re.compile(r"role\s+.+?\s+is a member of role", re.I)),
    ("PG_PERMISSION_DENIED", re.compile(r"permission denied", re.I)),
    ("PG_OBJECT_MISSING", re.compile(r"(relation|function|schema|type|sequence)\s+.+?\s+does not exist", re.I)),
    ("PG_DUPLICATE_OBJECT", re.compile(r"(table|relation|type|role|extension)\s+.+?\s+already exists", re.I)),
    ("PG_DEPENDENCY_FAILED", re.compile(r"(cannot drop|depends on|dependency)", re.I)),
    ("PG_TRANSACTION_ABORTED", re.compile(r"current transaction is aborted", re.I)),
)


def classify(content: str) -> str:
    for tag, pattern in _CLASS_RULES:
        if pattern.search(content):
            return tag
    return "PG_ERROR_UNCLASSIFIED"


# Whitelist the private runner's known error-log sources. No arbitrary paths,
# customer object names or filesystem-derived labels are ever published.
PRIVATE_LOG_STAGES = (
    ("SOURCE_ROLE_EXPORT", "source-roles.stderr"),
    ("SOURCE_DATABASE_EXPORT", "source-dump.stderr"),
    ("SOURCE_CATALOG", "source-catalog-fingerprint.stderr"),
    ("SOURCE_DEPENDENCIES", "source-dependencies.stderr"),
    ("DUMP_ARCHIVE_INSPECTION", "archive-list.stderr"),
    ("AGE_ENCRYPTION", "age.stderr"),
)
MAX_READ_BYTES = 65536
SAFE_CLASS = re.compile(r"PG_[A-Z_]+\Z")


def emit(private_dir: Path, stream) -> None:
    found = False
    # os.open(O_NOFOLLOW) prevents symlink-induced inspection of unrelated files.
    nofollow = getattr(os, "O_NOFOLLOW", 0)
    for stage, name in PRIVATE_LOG_STAGES:
        try:
            fd = os.open(private_dir / name, os.O_RDONLY | nofollow)
            with os.fdopen(fd, "rb") as handle:
                data = handle.read(MAX_READ_BYTES)
        except (OSError, ValueError, TypeError):
            continue
        if not data.strip():
            continue
        found = True
        # Source data is ONLY used for fixed-enum classification, never printed.
        error_class = classify(data.decode("utf-8", errors="replace"))
        if not SAFE_CLASS.fullmatch(error_class):
            error_class = "PG_ERROR_UNCLASSIFIED"
        print(f"CAPTURE_FAILURE_STAGE={stage} RESTORE_ERROR_CLASS={error_class}", file=stream)
    if not found:
        print("CAPTURE_FAILURE_STAGE=PRECHECK RESTORE_ERROR_CLASS=PG_ERROR_UNCLASSIFIED", file=stream)


def main() -> int:
    if len(sys.argv) != 2:
        print("CAPTURE_FAILURE_STAGE=DIAGNOSTIC_INPUT_INVALID", file=sys.stderr)
        return 2
    try:
        emit(Path(sys.argv[1]), sys.stderr)
        return 0
    except Exception:
        # Do not display exception text, which could reveal a private path.
        print("CAPTURE_FAILURE_STAGE=DIAGNOSTIC_UNAVAILABLE", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
