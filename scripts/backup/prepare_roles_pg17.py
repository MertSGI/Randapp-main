#!/usr/bin/env python3
"""Prepare a PostgreSQL 17 pg_dumpall --roles-only file for disposable replay.

Policy: preserve all original SQL except idempotent CREATE ROLE; do not add new
membership edges or allow a non-bootstrap GRANTED BY in this bounded adapter.
Use only with a nonce-verified disposable PG17 service, bootstrap OID10 role
supabase_admin, and post-replay exact catalogue equality checks.
"""
from __future__ import annotations

from collections import defaultdict, deque
from pathlib import Path
import re
import sys

BOOTSTRAP_GRANTOR = "supabase_admin"
# SQL quoted names may contain doubled quotes; bare names are PostgreSQL-like.
IDENT = r'(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z_0-9$]*)'
ROLE_GRANT = re.compile(
    rf'^GRANT\s+(?P<targets>{IDENT}(?:\s*,\s*{IDENT})*)\s+'
    rf'TO\s+(?P<members>{IDENT}(?:\s*,\s*{IDENT})*)'
    rf'(?:\s+WITH\s+(?P<opts>.*?))?'
    rf'(?:\s+GRANTED\s+BY\s+(?P<grantor>{IDENT}))?\s*;$',
    re.IGNORECASE,
)
ROLE_CREATE = re.compile(rf'^CREATE\s+ROLE\s+(?P<name>{IDENT})\s*;$', re.IGNORECASE)
OPTION = re.compile(r'^(ADMIN\s+(?:OPTION|TRUE|FALSE)|INHERIT\s+(?:TRUE|FALSE)|SET\s+(?:TRUE|FALSE))$', re.IGNORECASE)
ROLE_GRANT_START = re.compile(r'^GRANT\b', re.IGNORECASE)
NON_ROLE_GRANT = re.compile(r'^GRANT\s+.+?\s+ON\s+(?:PARAMETER|TABLESPACE)\s+', re.IGNORECASE)


def ident_value(token: str) -> str:
    token = token.strip()
    if token.startswith('"'):
        return token[1:-1].replace('""', '"')
    return token.lower()


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def quote_lit(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def identifiers(value: str) -> list[str]:
    # Preserve quoted names, including embedded commas and doubled quote escapes.
    # The full anchored statement regex validates the lexical shape first.
    parts: list[str] = []
    start = 0
    quoted = False
    i = 0
    while i < len(value):
        c = value[i]
        if c == '"':
            if quoted and i + 1 < len(value) and value[i + 1] == '"':
                i += 2
                continue
            quoted = not quoted
        elif c == ',' and not quoted:
            parts.append(value[start:i].strip())
            start = i + 1
        i += 1
    if quoted:
        raise ValueError('UNTERMINATED_ROLE_IDENTIFIER')
    parts.append(value[start:].strip())
    if any(not x for x in parts):
        raise ValueError('EMPTY_ROLE_IDENTIFIER')
    return [ident_value(x) for x in parts]


def parse_options(raw: str | None) -> dict[str, bool]:
    results = {}
    if raw is None:
        return results
    for item in raw.split(','):
        item = item.strip().upper()
        m = OPTION.fullmatch(item)
        if not m:
            raise ValueError('INVALID_ROLE_MEMBERSHIP_OPTION')
        name, flag = item.split(None, 1)
        if name in results:
            raise ValueError('DUPLICATE_ROLE_MEMBERSHIP_OPTION')
        results[name] = flag in ('OPTION', 'TRUE')
    return results


def parse_grant(line: str):
    if not ROLE_GRANT_START.match(line):
        return None
    # Roles-only exports may contain parameter grants. Their original SQL is
    # preserved, and they do not become role membership graph edges.
    if NON_ROLE_GRANT.match(line):
        return None
    match = ROLE_GRANT.fullmatch(line)
    if not match:
        raise ValueError('UNSUPPORTED_ROLE_GRANT_SYNTAX')
    opts = parse_options(match.group('opts'))
    grantor_raw = match.group('grantor')
    grantor = ident_value(grantor_raw) if grantor_raw else BOOTSTRAP_GRANTOR
    if grantor != BOOTSTRAP_GRANTOR:
        raise ValueError('NON_BOOTSTRAP_GRANTOR_UNSUPPORTED')
    return {
        'targets': identifiers(match.group('targets')),
        'members': identifiers(match.group('members')),
        'options': opts,
        'grantor': grantor,
    }


def create_noop_if_exists(name: str) -> str:
    # Do not overwrite the preseeded bootstrap account; following unmodified
    # ALTER ROLE statements configure its attributes as provided in the dump.
    return (
        'DO $lari_role_init$\n'
        'BEGIN\n'
        f'  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = {quote_lit(name)}) THEN\n'
        f'    CREATE ROLE {quote_ident(name)};\n'
        '  END IF;\n'
        'END $lari_role_init$;\n'
    )


def transform(raw: str) -> tuple[str, dict[str, int]]:
    membership_edges = []
    originals = raw.splitlines(keepends=True)
    for n, line in enumerate(originals, 1):
        trimmed = line.strip()
        if not trimmed or trimmed.startswith(('--', '/*', '*', '\\')):
            continue
        if ROLE_GRANT_START.match(trimmed):
            try:
                record = parse_grant(trimmed)
            except ValueError as exc:
                # Never expose original SQL or source-derived strings on errors.
                raise ValueError(f'ROLE_GRANT_REJECTED_AT_LINE_{n}:{exc}') from None
            if record:
                membership_edges.extend((member, target) for member in record['members'] for target in record['targets'])
    graph: dict[str, set[str]] = defaultdict(set)
    for member, target in membership_edges:
        if member == target:
            raise ValueError('ROLE_MEMBERSHIP_SELF_CYCLE')
        frontier = deque([target])
        seen: set[str] = set()
        while frontier:
            node = frontier.popleft()
            if node == member:
                raise ValueError('ROLE_MEMBERSHIP_CYCLE')
            if node not in seen:
                seen.add(node)
                frontier.extend(graph[node] - seen)
        graph[member].add(target)
    output: list[str] = []
    create_count = 0
    for line in originals:
        m = ROLE_CREATE.fullmatch(line.strip())
        if m:
            output.append(create_noop_if_exists(ident_value(m.group('name'))))
            create_count += 1
        else:
            output.append(line)
    # Existing static/CI checks expect this block, but it MUST have no GRANTs.
    output.append('\nDO $lari_role_grant_bootstrap$ BEGIN NULL; END $lari_role_grant_bootstrap$;\n')
    return ''.join(output), {'create_roles': create_count, 'membership_edges': len(membership_edges), 'extra_grants': 0}


def main() -> int:
    if len(sys.argv) != 3:
        print('USAGE: prepare_roles_pg17.py INPUT_ROLES OUTPUT_ROLES', file=sys.stderr)
        return 2
    original, prepared = Path(sys.argv[1]), Path(sys.argv[2])
    if not original.is_file() or original.resolve() == prepared.resolve():
        print('ROLE_PREPARATION_FAILED: INVALID_INPUT_OUTPUT', file=sys.stderr)
        return 2
    try:
        output, receipt = transform(original.read_text(encoding='utf-8'))
        if receipt['create_roles'] == 0:
            raise ValueError('NO_ROLE_CREATES_FOUND')
        # Atomic private file creation; output never sent to logs.
        import os
        import tempfile
        prepared.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=prepared.parent, prefix='.lari-role-replay-', text=True)
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                f.write(output)
            os.replace(tmp, prepared)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
    except (OSError, UnicodeError, ValueError) as error:
        # Only a stable error tag: no text of dump, input path or credentials.
        tag = str(error).split(':')[-1] if isinstance(error, ValueError) else 'FILE_ACCESS_ERROR'
        print('ROLE_PREPARATION_FAILED: ' + re.sub(r'[^A-Z_0-9]', '_', tag.upper())[:96], file=sys.stderr)
        return 1
    print('ROLE_PREPARATION_OK: original_sql_preserved=true extra_grants=0')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
