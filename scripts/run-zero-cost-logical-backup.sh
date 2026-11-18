#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

EXPECTED_PROJECT_REF="rwedeejhjazwjthdjzrt"
SOURCE_DATABASE_USER="postgres.${EXPECTED_PROJECT_REF}"
SOURCE_DATABASE_PORT="5432"
SOURCE_DATABASE_NAME="postgres"
SOURCE_DATABASE_SSLMODE="verify-full"
DEFAULT_SUPABASE_CA_FILE="scripts/backup/supabase-prod-ca-2021.crt"
PINNED_SUPABASE_ROOT_CA_SHA256="807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa"
SOURCE_DATABASE_SSLROOTCERT="${SOURCE_DATABASE_SSLROOTCERT-$DEFAULT_SUPABASE_CA_FILE}"
VALIDATE_SOURCE_URL_ONLY="--validate-source-url-only"
TEST_SOURCE_CREDENTIALS_ONLY="--test-source-credential-handling"
TEST_RESTORE_VERDICT_ONLY="--test-restore-verdict-handling"
TEST_PG17_CLIENT_SELECTION_ONLY="--test-pg17-client-selection"
TEST_DISPOSABLE_ROLE_RESTORE_ONLY="--test-disposable-role-restore"
TEST_DISPOSABLE_PRISTINE_RESTORE_ONLY="--test-disposable-pristine-restore"
TEST_SOURCE_SNAPSHOT_FLOW_ONLY="--test-source-snapshot-flow"

SOURCE_DATABASE_PASSWORD_VALUE="${SOURCE_DATABASE_PASSWORD:-}"
unset SOURCE_DATABASE_PASSWORD

PRIVATE_DIR=""
SOURCE_PGPASSFILE=""
RESTORE_PGPASSFILE=""
OFFLINE_SNAPSHOT_TEST_MODE="0"

SNAPSHOT_SESSION_TIMEOUT_SECONDS=600
SNAPSHOT_FIFO_READ_TIMEOUT_SECONDS=60
SNAPSHOT_EXPORT_TIMEOUT_SECONDS=20
SNAPSHOT_PSQL_WAIT_TIMEOUT_SECONDS=60
SNAPSHOT_SESSION_PID=""
SNAP_PSQL_PID=""
SNAP_DUMP_PID=""
SNAP_IN_FD_OPEN=0
SNAP_OUT_FD_OPEN=0
SOURCE_SNAPSHOT_BOUND="false"

RESTORE_STAGE="NOT_REACHED"
TELEMETRY_EMITTED=0
ROLE_PREP_STATUS=0
ROLES_RESTORE_STATUS=0
PRISTINE_TARGET_STATUS=0
DATABASE_RESTORE_STATUS=0
UNAVAILABLE_EXT_COUNT=0
CATALOG_MATCH="false"

emit_restore_failure_telemetry() {
  if [[ "$TELEMETRY_EMITTED" -eq 1 ]]; then
    return 0
  fi
  TELEMETRY_EMITTED=1

  local stage="${RESTORE_STAGE:-}"
  if [[ -z "$stage" || "$stage" == "NOT_REACHED" ]]; then
    if [[ "${ROLE_PREP_STATUS:-0}" -ne 0 ]]; then
      stage="ROLE_PREPARATION_FAILED"
    elif [[ "${ROLES_RESTORE_STATUS:-0}" -ne 0 ]]; then
      stage="ROLE_REPLAY_FAILED"
    elif [[ "${PRISTINE_TARGET_STATUS:-1}" -ne 0 ]]; then
      stage="PRISTINE_TARGET_FAILED"
    elif [[ "${DATABASE_RESTORE_STATUS:-1}" -ne 0 ]]; then
      stage="DATABASE_RESTORE_FAILED"
    elif [[ "${UNAVAILABLE_EXT_COUNT:-0}" -gt 0 ]]; then
      stage="EXTENSION_COMPATIBILITY_FAILED"
    elif [[ "${CATALOG_MATCH:-false}" != "true" ]]; then
      stage="CATALOG_MISMATCH"
    elif [[ "${VERDICT:-}" == "VERIFIED_LOGICAL_RESTORE" ]]; then
      stage="VERIFIED_LOGICAL_RESTORE"
    else
      stage="UNKNOWN_RESTORE_FAILURE"
    fi
  fi

  printf '%s\n' "" "--- LARI RESTORE TELEMETRY ---" >&2
  printf 'Restore Stage: %s\n' "$stage" >&2

  case "$stage" in
    ROLE_PREPARATION_FAILED)
      printf 'Detail: Role preparation failed; check dump statement syntax or circular memberships.\n' >&2
      ;;
    ROLE_REPLAY_FAILED)
      printf 'Detail: Replay of prepared restore-roles.sql failed in disposable PostgreSQL 17 (exit code %s).\n' "${ROLES_RESTORE_STATUS:-1}" >&2
      if [[ -n "${PRIVATE_DIR:-}" && -f "$PRIVATE_DIR/restore-roles.stderr" ]]; then
        "${LARI_SOURCE_VALIDATOR_PYTHON:-python3}" scripts/backup/safe_restore_error.py \
          "$PRIVATE_DIR/restore-roles.stderr" >&2 || true
      fi
      ;;
    PRISTINE_TARGET_FAILED)
      local reason="unknown"
      if [[ -n "${PRIVATE_DIR:-}" && -f "$PRIVATE_DIR/pristine-target-receipt.json" ]]; then
        reason="$(jq -r '.failure_reason // "pristine_target_verification_failed"' "$PRIVATE_DIR/pristine-target-receipt.json" 2>/dev/null || printf 'unknown')"
      fi
      printf 'Detail: Pristine target creation/verification failed (reason: %s).\n' "$reason" >&2
      ;;
    DATABASE_RESTORE_FAILED)
      printf 'Detail: pg_restore failed into pristine database (exit code %s).\n' "${DATABASE_RESTORE_STATUS:-1}" >&2
      if [[ -n "${PRIVATE_DIR:-}" && -f "$PRIVATE_DIR/restore-database.stderr" ]]; then
        "${LARI_SOURCE_VALIDATOR_PYTHON:-python3}" scripts/backup/safe_restore_error.py \
          "$PRIVATE_DIR/restore-database.stderr" >&2 || true
      fi
      ;;
    EXTENSION_COMPATIBILITY_FAILED)
      local missing_exts="none"
      if [[ -n "${PRIVATE_DIR:-}" && -f "$PRIVATE_DIR/dependency-report.json" ]]; then
        missing_exts="$(jq -r '[.unavailable_on_disposable_postgres17[].name] | join(", ")' "$PRIVATE_DIR/dependency-report.json" 2>/dev/null || printf 'parse_error')"
      fi
      printf 'Detail: Required extensions unavailable on disposable PostgreSQL 17: [%s].\n' "$missing_exts" >&2
      ;;
    CATALOG_MISMATCH)
      printf 'Detail: Catalog fingerprint mismatch between source and restored database.\n' >&2
      printf 'Catalog category comparisons:\n' >&2
      if [[ -n "${PRIVATE_DIR:-}" && -f "$PRIVATE_DIR/source-catalog-fingerprint.json" && -f "$PRIVATE_DIR/restore-catalog-fingerprint.json" ]]; then
        local cat_py="${LARI_SOURCE_VALIDATOR_PYTHON:-python3}"
        "$cat_py" - "$PRIVATE_DIR/source-catalog-fingerprint.json" "$PRIVATE_DIR/restore-catalog-fingerprint.json" <<'PY' >&2
import json, sys
try:
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        src = json.load(f)
    with open(sys.argv[2], 'r', encoding='utf-8') as f:
        rst = json.load(f)

    src_rt = (src.get('diagnostic') or {}).get('runtime') or {}
    rst_rt = (rst.get('diagnostic') or {}).get('runtime') or {}
    if src_rt or rst_rt:
        print(
            f"  runtime: source_pg={src_rt.get('server_version_num', 'unknown')} "
            f"restore_pg={rst_rt.get('server_version_num', 'unknown')} "
            f"source_search_path={src_rt.get('search_path', '')} "
            f"restore_search_path={rst_rt.get('search_path', '')}"
        )

    categories = ['schemas', 'tables', 'policies', 'routines', 'roles', 'role_memberships', 'extensions']
    mismatched_cats = []
    for cat in categories:
        src_cat = src.get(cat, {})
        rst_cat = rst.get(cat, {})
        src_cnt = src_cat.get('object_count', 0)
        rst_cnt = rst_cat.get('object_count', 0)
        src_fp = src_cat.get('fingerprint', '')
        rst_fp = rst_cat.get('fingerprint', '')
        matches = (src_fp == rst_fp and src_cnt == rst_cnt and bool(src_fp))
        print(f"  {cat}: match={str(matches).lower()}, source_count={src_cnt}, restore_count={rst_cnt}")
        if not matches:
            mismatched_cats.append(cat)

    src_objs = (src.get('diagnostic') or {}).get('objects') or {}
    rst_objs = (rst.get('diagnostic') or {}).get('objects') or {}
    for cat in mismatched_cats:
        if cat not in src_objs and cat not in rst_objs:
            continue
        s_map = src_objs.get(cat) or {}
        r_map = rst_objs.get(cat) or {}
        all_keys = sorted(set(s_map.keys()) | set(r_map.keys()))
        diffs = []
        for k in all_keys:
            sv = s_map.get(k)
            rv = r_map.get(k)
            if sv != rv:
                if sv is None:
                    diffs.append((k, ['MISSING_ON_SOURCE'], {}, rv))
                elif rv is None:
                    diffs.append((k, ['MISSING_ON_RESTORE'], sv, {}))
                else:
                    changed = [fk for fk in sorted(set(sv.keys()) | set(rv.keys())) if sv.get(fk) != rv.get(fk)]
                    diffs.append((k, changed, {fk: sv.get(fk) for fk in changed}, {fk: rv.get(fk) for fk in changed}))
        print(f"  Object field diffs for {cat} (total={len(diffs)}, showing up to 25):")
        for k, fields, sh, rh in diffs[:25]:
            print(f"    [DIFF] {cat} {k}: fields={fields} src={sh} rst={rh}")
    if 'schemas' in mismatched_cats or 'routines' in mismatched_cats:
        src_probe = (src.get('diagnostic') or {}).get('acl_probe') or {}
        rst_probe = (rst.get('diagnostic') or {}).get('acl_probe') or {}
        if src_probe or rst_probe:
            print("  [ACL_PROBE_SRC] " + json.dumps(src_probe, sort_keys=True))
            print("  [ACL_PROBE_RST] " + json.dumps(rst_probe, sort_keys=True))
except Exception as e:
    print(f"  Failed to parse catalog comparisons: {e}")
PY
        if [[ -f "$PRIVATE_DIR/archive.list" && -f "$PRIVATE_DIR/database.dump" ]]; then
          local acl_toc_list="$PRIVATE_DIR/acl-probe.list"
          grep -E '; (ACL|SCHEMA|EXTENSION) .* (graphql|graphql_public|pgcrypto|pg_stat_statements|armor|digest|encrypt|decrypt|gen_salt|gen_random_bytes|hmac|pgp_)' "$PRIVATE_DIR/archive.list" | head -n 40 >"$acl_toc_list" || true
          if [[ -s "$acl_toc_list" ]]; then
            printf '  [DUMP_ACL_TOC]\n' >&2
            sed 's/^/    /' "$acl_toc_list" >&2 || true
            local acl_only_toc="$PRIVATE_DIR/acl-only-probe.list"
            grep '; ACL ' "$acl_toc_list" >"$acl_only_toc" || true
            if [[ -s "$acl_only_toc" ]]; then
              printf '  [DUMP_ACL_DDL]\n' >&2
              pg_restore --use-list="$acl_only_toc" -f - "$PRIVATE_DIR/database.dump" 2>/dev/null | grep -E '^(GRANT|REVOKE|ALTER) ' | head -n 40 | sed 's/^/    /' >&2 || true
            else
              printf '  [DUMP_ACL_DDL] <none_in_matched_toc>\n' >&2
            fi
          else
            printf '  [DUMP_ACL_TOC] <no_matching_graphql_or_ext_entries>\n' >&2
          fi
        fi
      fi
      ;;
    SNAPSHOT_EXPORT_FAILED)
      printf 'Detail: Source snapshot export or synchronization failed before logical dump; zero backup artifacts permitted.\n' >&2
      ;;
    SNAPSHOT_IMPORT_FAILED)
      printf 'Detail: Consistent snapshot pg_dump --snapshot or catalog capture failed; zero backup artifacts permitted.\n' >&2
      ;;
    VERIFIED_LOGICAL_RESTORE)
      printf 'Detail: All restore gates passed. Full catalog equivalence verified.\n' >&2
      ;;
    *)
      printf 'Detail: Verification failed before restore execution.\n' >&2
      ;;
  esac
  printf '%s\n\n' "------------------------------" >&2
}

terminate_pid_gracefully() {
  local pid="$1"
  [[ -n "$pid" ]] || return 0
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
    local reap_tick=0
    while kill -0 "$pid" 2>/dev/null && [[ "$reap_tick" -lt 10 ]]; do
      sleep 0.1
      reap_tick=$((reap_tick + 1))
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  fi
  wait "$pid" 2>/dev/null || true
}

terminate_pid_file_process() {
  local pid_file="$1"
  [[ -n "$pid_file" && -f "$pid_file" ]] || return 0
  local recorded_pid=""
  IFS= read -r recorded_pid <"$pid_file" || recorded_pid=""
  rm -f -- "$pid_file"
  if [[ "$recorded_pid" =~ ^[0-9]+$ ]]; then
    terminate_pid_gracefully "$recorded_pid"
  fi
}

close_snapshot_transaction_handles() {
  if [[ "${SNAP_IN_FD_OPEN:-0}" -eq 1 ]]; then
    exec 3>&- || true
    SNAP_IN_FD_OPEN=0
  fi
  if [[ "${SNAP_OUT_FD_OPEN:-0}" -eq 1 ]]; then
    exec 4<&- || true
    SNAP_OUT_FD_OPEN=0
  fi
  terminate_pid_gracefully "${SNAP_DUMP_PID:-}"
  SNAP_DUMP_PID=""
  terminate_pid_gracefully "${SNAP_PSQL_PID:-}"
  SNAP_PSQL_PID=""
  terminate_pid_gracefully "${SNAPSHOT_SESSION_PID:-}"
  SNAPSHOT_SESSION_PID=""
  if [[ -n "${PRIVATE_DIR:-}" && -d "$PRIVATE_DIR" ]]; then
    terminate_pid_file_process "$PRIVATE_DIR/snap-dump.pid"
    terminate_pid_file_process "$PRIVATE_DIR/snap-psql.pid"
  fi
}

cleanup() {
  close_snapshot_transaction_handles || true
  if [[ "${VERDICT:-}" != "VERIFIED_LOGICAL_RESTORE" ]]; then
    emit_restore_failure_telemetry || true
  fi
  if [[ -n "$PRIVATE_DIR" && -d "$PRIVATE_DIR" ]]; then
    rm -rf -- "$PRIVATE_DIR"
  fi
}

terminate_on_signal() {
  local status="$1"
  trap - EXIT HUP INT TERM
  cleanup
  exit "$status"
}

trap cleanup EXIT
trap 'terminate_on_signal 129' HUP
trap 'terminate_on_signal 130' INT
trap 'terminate_on_signal 143' TERM

require_value() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    printf 'Required protected input is unavailable: %s\n' "$name" >&2
    exit 1
  fi
}

require_source_database_password() {
  if [[ -z "$SOURCE_DATABASE_PASSWORD_VALUE" ]]; then
    printf 'Required protected input is unavailable: SOURCE_DATABASE_PASSWORD\n' >&2
    exit 1
  fi
}

enforce_verified_restore() {
  if [[ "${VERDICT:-}" != "VERIFIED_LOGICAL_RESTORE" ]]; then
    emit_restore_failure_telemetry
    if [[ -n "${ARTIFACT_DIR:-}" && -d "$ARTIFACT_DIR" ]]; then
      rm -rf -- "$ARTIFACT_DIR"
    fi
    printf 'Logical restore verification failed; no backup artifact is eligible for upload.\n' >&2
    return 1
  else
    RESTORE_STAGE="VERIFIED_LOGICAL_RESTORE"
    emit_restore_failure_telemetry
  fi
}

validate_ca_root_certificate() {
  local python_command="$1"
  require_value SOURCE_DATABASE_SSLROOTCERT

  if [[ "$SOURCE_DATABASE_SSLROOTCERT" == "system" ]]; then
    return 0
  fi

  if [[ ! -f "$SOURCE_DATABASE_SSLROOTCERT" ]]; then
    printf 'Configured CA root certificate file does not exist.\n' >&2
    exit 1
  fi

  local cert_sha256
  cert_sha256="$("$python_command" -c "
import base64, hashlib, sys
try:
    content = open(sys.argv[1], 'r', encoding='utf-8').read()
    b64 = ''.join([line.strip() for line in content.splitlines() if not line.startswith('-----')])
    der = base64.b64decode(b64)
    print(hashlib.sha256(der).hexdigest())
except Exception:
    sys.exit(1)
" "$SOURCE_DATABASE_SSLROOTCERT" 2>/dev/null)" || {
    printf 'Configured CA root certificate is malformed or unreadable.\n' >&2
    exit 1
  }

  local expected_sha256="${LARI_EXPECTED_CA_SHA256:-}"
  if [[ -z "$expected_sha256" && "$SOURCE_DATABASE_SSLROOTCERT" == *"supabase"* ]]; then
    expected_sha256="$PINNED_SUPABASE_ROOT_CA_SHA256"
  fi

  if [[ -n "$expected_sha256" && "$cert_sha256" != "$expected_sha256" ]]; then
    printf 'Configured CA root certificate fingerprint mismatch.\n' >&2
    exit 1
  fi
}

configure_postgresql17_path() {
  if [[ -n "${LARI_PG17_BIN_DIR+x}" ]]; then
    if [[ -n "$LARI_PG17_BIN_DIR" && -d "$LARI_PG17_BIN_DIR" ]]; then
      if [[ ":$PATH:" != *":$LARI_PG17_BIN_DIR:"* ]]; then
        PATH="$LARI_PG17_BIN_DIR:$PATH"
      fi
    fi
  elif [[ -d "/usr/lib/postgresql/17/bin" ]]; then
    if [[ ":$PATH:" != *":/usr/lib/postgresql/17/bin:"* ]]; then
      PATH="/usr/lib/postgresql/17/bin:$PATH"
    fi
  fi
  export PATH
}

verify_postgres17_client_binaries() {
  local tool
  local tool_path
  local tool_version
  local tool_major
  local failure=0

  printf 'PostgreSQL 17 client binary verification:\n'
  for tool in pg_dump pg_restore psql pg_dumpall; do
    tool_path="$(command -v "$tool" 2>/dev/null || true)"
    if [[ -z "$tool_path" ]]; then
      printf '  %s: NOT FOUND in PATH\n' "$tool" >&2
      failure=1
      continue
    fi
    tool_version="$("$tool" --version 2>&1 || true)"
    printf '  %s: %s (%s)\n' "$tool" "$tool_path" "$tool_version"
    tool_major="$(printf '%s' "$tool_version" | awk '{print $3}' | cut -d. -f1)"
    if [[ "$tool_major" != "17" ]]; then
      printf '  ERROR: %s resolved to major version %s, but PostgreSQL 17 is required.\n' "$tool" "$tool_major" >&2
      failure=1
    fi
  done

  if [[ "$failure" -ne 0 ]]; then
    printf 'PostgreSQL 17 client binaries verification failed.\n' >&2
    exit 1
  fi
}

validate_source_database_url() {
  local python_command="$1"

  "$python_command" <<'PY'
import os
import re
import sys
from urllib.parse import parse_qsl, unquote, urlsplit

EXPECTED_PROJECT_REF = "rwedeejhjazwjthdjzrt"
POOLER_HOST = re.compile(r"aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com")
ALLOWED_TLS_MODES = {"verify-full"}
ALLOWED_QUERY_KEYS = {"sslmode", "sslrootcert"}
ROUTING_OVERRIDE_KEYS = {
    "database",
    "dbname",
    "host",
    "hostaddr",
    "passfile",
    "port",
    "service",
    "servicefile",
    "user",
}


def reject(reason):
    print(f"Source database URL rejected: {reason}.", file=sys.stderr)
    raise SystemExit(1)


source_url = os.environ.get("SOURCE_DATABASE_URL", "")
if not source_url or any(character.isspace() or ord(character) < 32 for character in source_url):
    reject("invalid PostgreSQL URI")

try:
    source = urlsplit(source_url)
    source_port = source.port
    source_host = source.hostname
except (TypeError, ValueError):
    reject("invalid PostgreSQL URI")

if source.scheme not in {"postgres", "postgresql"}:
    reject("invalid PostgreSQL URI scheme")
if source.fragment or not source.netloc or source_host is None:
    reject("invalid PostgreSQL URI structure")
if source.path != "/postgres":
    reject("database name must be postgres")
if source_port != 5432:
    reject("only the Session Pooler port is allowed")
if source.password is not None:
    reject("database passwords are not allowed in the source URI")

source_username = unquote(source.username or "")
if not POOLER_HOST.fullmatch(source_host):
    reject("database host is not an approved Supabase shared pooler endpoint")
if source_username != f"postgres.{EXPECTED_PROJECT_REF}":
    reject("Session Pooler project identity is not approved")

try:
    query_pairs = parse_qsl(
        source.query,
        keep_blank_values=True,
        strict_parsing=True,
        separator="&",
    )
except ValueError:
    reject("invalid or conflicting connection parameters")

query = {}
for key, value in query_pairs:
    if key != key.lower():
        reject("connection parameter names must be lowercase")
    if key in query:
        reject("duplicate connection parameters are not allowed")
    if key in ROUTING_OVERRIDE_KEYS:
        reject("connection routing overrides are not allowed")
    if key not in ALLOWED_QUERY_KEYS:
        reject("unsupported connection parameter")
    query[key] = value

sslmode = query.get("sslmode")
if sslmode not in ALLOWED_TLS_MODES:
    reject("sslmode=verify-full is required")
sslrootcert = query.get("sslrootcert")
if not sslrootcert:
    reject("sslrootcert is required for CA trust verification")
PY
}

build_and_validate_source_database_url() {
  local python_command="$1"
  SOURCE_DATABASE_URL="postgresql://${SOURCE_DATABASE_USER}@${SOURCE_POOLER_HOST}:${SOURCE_DATABASE_PORT}/${SOURCE_DATABASE_NAME}?sslmode=${SOURCE_DATABASE_SSLMODE}&sslrootcert=${SOURCE_DATABASE_SSLROOTCERT}"
  export SOURCE_DATABASE_URL
  validate_source_database_url "$python_command"
  unset SOURCE_DATABASE_URL
}

prepare_disposable_role_restore() {
  local input_roles_sql="$1"
  local output_restore_sql="$2"
  local python_command="${3:-python3}"
  [[ -f "$input_roles_sql" ]] || {
    printf 'ROLE_PREPARATION_FAILED: INPUT_NOT_FOUND\n' >&2
    return 1
  }
  "$python_command" scripts/backup/prepare_roles_pg17.py \
    "$input_roles_sql" "$output_restore_sql"
}

escape_pgpass_field() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//:/\\:}"
  printf '%s' "$value"
}

write_pgpass_file() {
  local output_path="$1"
  local host="$2"
  local port="$3"
  local database="$4"
  local username="$5"
  local password="$6"

  if [[ "$password" == *$'\n'* || "$password" == *$'\r'* ]]; then
    printf 'Database credential contains an unsupported control character.\n' >&2
    exit 1
  fi

  printf '%s:%s:%s:%s:%s\n' \
    "$(escape_pgpass_field "$host")" \
    "$(escape_pgpass_field "$port")" \
    "$(escape_pgpass_field "$database")" \
    "$(escape_pgpass_field "$username")" \
    "$(escape_pgpass_field "$password")" \
    >"$output_path"
  chmod 0600 "$output_path"
}

append_pgpass_file() {
  local output_path="$1"
  local host="$2"
  local port="$3"
  local database="$4"
  local username="$5"
  local password="$6"

  if [[ "$password" == *$'\n'* || "$password" == *$'\r'* ]]; then
    printf 'Database credential contains an unsupported control character.\n' >&2
    exit 1
  fi

  printf '%s:%s:%s:%s:%s\n' \
    "$(escape_pgpass_field "$host")" \
    "$(escape_pgpass_field "$port")" \
    "$(escape_pgpass_field "$database")" \
    "$(escape_pgpass_field "$username")" \
    "$(escape_pgpass_field "$password")" \
    >>"$output_path"
  chmod 0600 "$output_path"
}

prepare_private_credentials() {
  local credentials_dir="$PRIVATE_DIR/database-credentials"
  mkdir -m 0700 -- "$credentials_dir"
  SOURCE_PGPASSFILE="$credentials_dir/source.pgpass"
  RESTORE_PGPASSFILE="$credentials_dir/restore.pgpass"

  write_pgpass_file \
    "$SOURCE_PGPASSFILE" \
    "$SOURCE_POOLER_HOST" \
    "$SOURCE_DATABASE_PORT" \
    "$SOURCE_DATABASE_NAME" \
    "$SOURCE_DATABASE_USER" \
    "$SOURCE_DATABASE_PASSWORD_VALUE"
  write_pgpass_file \
    "$RESTORE_PGPASSFILE" \
    "$RESTORE_DATABASE_HOST" \
    "$RESTORE_DATABASE_PORT" \
    "$RESTORE_DATABASE_NAME" \
    "$RESTORE_DATABASE_USER" \
    "$RESTORE_DATABASE_PASSWORD"
  if [[ -n "${RESTORE_TARGET_DATABASE_NAME:-}" && "${RESTORE_TARGET_DATABASE_NAME}" != "${RESTORE_DATABASE_NAME}" ]]; then
    append_pgpass_file \
      "$RESTORE_PGPASSFILE" \
      "$RESTORE_DATABASE_HOST" \
      "$RESTORE_DATABASE_PORT" \
      "$RESTORE_TARGET_DATABASE_NAME" \
      "$RESTORE_DATABASE_USER" \
      "$RESTORE_DATABASE_PASSWORD"
  fi
  unset SOURCE_DATABASE_PASSWORD_VALUE
}

prepare_restore_only_credentials() {
  local credentials_dir="$PRIVATE_DIR/database-credentials"
  mkdir -m 0700 -- "$credentials_dir"
  RESTORE_PGPASSFILE="$credentials_dir/restore.pgpass"

  write_pgpass_file \
    "$RESTORE_PGPASSFILE" \
    "$RESTORE_DATABASE_HOST" \
    "$RESTORE_DATABASE_PORT" \
    "$RESTORE_DATABASE_NAME" \
    "$RESTORE_DATABASE_USER" \
    "$RESTORE_DATABASE_PASSWORD"
  if [[ -n "${RESTORE_TARGET_DATABASE_NAME:-}" && "${RESTORE_TARGET_DATABASE_NAME}" != "${RESTORE_DATABASE_NAME}" ]]; then
    append_pgpass_file \
      "$RESTORE_PGPASSFILE" \
      "$RESTORE_DATABASE_HOST" \
      "$RESTORE_DATABASE_PORT" \
      "$RESTORE_TARGET_DATABASE_NAME" \
      "$RESTORE_DATABASE_USER" \
      "$RESTORE_DATABASE_PASSWORD"
  fi
}

assert_private_source_credentials() {
  [[ "$(stat -c '%a' "$PRIVATE_DIR")" == "700" ]] || {
    printf 'Private temporary directory permissions are invalid.\n' >&2
    exit 1
  }
  [[ "$(stat -c '%a' "$(dirname "$SOURCE_PGPASSFILE")")" == "700" ]] || {
    printf 'Protected credential directory permissions are invalid.\n' >&2
    exit 1
  }
  [[ "$(stat -c '%a' "$SOURCE_PGPASSFILE")" == "600" ]] || {
    printf 'Protected source credential file permissions are invalid.\n' >&2
    exit 1
  }
  [[ "$SOURCE_PGPASSFILE" == "$PRIVATE_DIR/"* ]] || {
    printf 'Protected source credential file is outside the private temporary directory.\n' >&2
    exit 1
  }
  [[ "$SOURCE_PGPASSFILE" != "$ARTIFACT_DIR" && "$SOURCE_PGPASSFILE" != "$ARTIFACT_DIR/"* ]] || {
    printf 'Protected source credential file overlaps the artifact directory.\n' >&2
    exit 1
  }
}

run_source_postgres_command() {
  local -a env_args=(
    HOME="$PRIVATE_DIR"
    PATH="$PATH"
    LC_ALL=C.UTF-8
    PGHOST="$SOURCE_POOLER_HOST"
    PGPORT="$SOURCE_DATABASE_PORT"
    PGDATABASE="$SOURCE_DATABASE_NAME"
    PGUSER="$SOURCE_DATABASE_USER"
    PGPASSFILE="$SOURCE_PGPASSFILE"
    PGCONNECT_TIMEOUT=15
  )
  if [[ "${OFFLINE_SNAPSHOT_TEST_MODE:-0}" == "1" && "${LARI_OFFLINE_TEST_MODE:-}" == "1" && "$SOURCE_POOLER_HOST" == "127.0.0.1" ]]; then
    env_args+=(PGSSLMODE=disable)
  else
    env_args+=(PGSSLMODE="$SOURCE_DATABASE_SSLMODE" PGSSLROOTCERT="$SOURCE_DATABASE_SSLROOTCERT")
  fi
  if [[ "${LARI_INTERNAL_EXEC_SOURCE_CMD:-0}" == "1" ]]; then
    exec env -i "${env_args[@]}" "$@"
  fi
  env -i "${env_args[@]}" "$@"
}

wait_for_snapshot_psql() {
  local timeout_secs="${1:-$SNAPSHOT_PSQL_WAIT_TIMEOUT_SECONDS}"
  local deadline=$((SECONDS + timeout_secs))
  while kill -0 "$SNAP_PSQL_PID" 2>/dev/null; do
    if (( SECONDS >= deadline )); then
      printf 'Timed out waiting for background snapshot psql process after %ss.\n' "$timeout_secs" >&2
      close_snapshot_transaction_handles
      return 124
    fi
    sleep 0.1
  done
  local wait_rc=0
  wait "$SNAP_PSQL_PID" || wait_rc=$?
  SNAP_PSQL_PID=""
  return "$wait_rc"
}

read_snapshot_fifo_into_file() {
  local output_file="$1"
  local timeout_secs="${2:-$SNAPSHOT_FIFO_READ_TIMEOUT_SECONDS}"
  local deadline=$((SECONDS + timeout_secs))
  local line=""
  : >"$output_file"
  while true; do
    local remaining=$((deadline - SECONDS))
    if (( remaining <= 0 )); then
      printf 'Timed out reading catalog fingerprint from snapshot FIFO after %ss.\n' "$timeout_secs" >&2
      return 124
    fi
    local read_rc=0
    IFS= read -r -t "$remaining" line <&4 || read_rc=$?
    if [[ "$read_rc" -eq 0 ]]; then
      printf '%s\n' "$line" >>"$output_file"
      continue
    fi
    if [[ -n "$line" ]]; then
      printf '%s' "$line" >>"$output_file"
      line=""
    fi
    if (( read_rc > 128 )); then
      printf 'Timed out reading catalog fingerprint from snapshot FIFO after %ss.\n' "$timeout_secs" >&2
      return 124
    fi
    break
  done
  return 0
}

fail_snapshot_capture() {
  local stage="$1"
  local message="$2"
  RESTORE_STAGE="$stage"
  SOURCE_SNAPSHOT_BOUND="false"
  VERDICT="NOT_RESTORABLE_IN_DISPOSABLE_POSTGRES_17"
  close_snapshot_transaction_handles
  if [[ -n "${ARTIFACT_DIR:-}" && -d "$ARTIFACT_DIR" ]]; then
    rm -rf -- "$ARTIFACT_DIR"
  fi
  printf '%s\n' "$message" >&2
  return 1
}

run_snapshot_capture_session() {
  local dump_file="$1"
  local catalog_file="$2"
  local stage_file="$3"
  local session_deadline="$4"

  trap 'close_snapshot_transaction_handles; exit 143' TERM INT HUP

  local snap_in="$PRIVATE_DIR/source-snapshot.in"
  local snap_out="$PRIVATE_DIR/source-snapshot.out"
  local psql_pid_file="$PRIVATE_DIR/snap-psql.pid"
  local dump_pid_file="$PRIVATE_DIR/snap-dump.pid"
  rm -f -- "$snap_in" "$snap_out" "$psql_pid_file" "$dump_pid_file"
  printf 'SNAPSHOT_EXPORT_FAILED\n' >"$stage_file"
  mkfifo "$snap_in" "$snap_out"

  if [[ "${LARI_OFFLINE_TEST_MODE:-}" == "1" && "${LARI_TEST_SIMULATE_FIFO_UNOPENED_PEER:-}" == "1" ]]; then
    sleep "$((SNAPSHOT_SESSION_TIMEOUT_SECONDS + 30))" &
    SNAP_PSQL_PID=$!
  else
    LARI_INTERNAL_EXEC_SOURCE_CMD=1 run_source_postgres_command psql \
      -X -qAt --set=ON_ERROR_STOP=1 \
      <"$snap_in" \
      >"$snap_out" \
      2>"$PRIVATE_DIR/source-catalog-fingerprint.stderr" &
    SNAP_PSQL_PID=$!
  fi
  printf '%s\n' "$SNAP_PSQL_PID" >"$psql_pid_file"

  exec 3>"$snap_in"
  SNAP_IN_FD_OPEN=1
  exec 4<"$snap_out"
  SNAP_OUT_FD_OPEN=1

  if [[ "${LARI_OFFLINE_TEST_MODE:-}" == "1" && "${LARI_TEST_SIMULATE_SNAPSHOT_EXPORT_FAIL:-}" == "1" ]]; then
    printf 'SELECT 1/0;\n' >&3
  else
    printf 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n' >&3
    printf 'SELECT pg_catalog.pg_export_snapshot();\n' >&3
  fi

  local now_epoch remaining_session export_wait_secs
  now_epoch="$(date +%s)"
  remaining_session=$((session_deadline - now_epoch))
  if (( remaining_session <= 0 )); then
    printf 'Snapshot session deadline exceeded before snapshot ID read.\n' >&2
    close_snapshot_transaction_handles
    return 124
  fi
  export_wait_secs="$SNAPSHOT_EXPORT_TIMEOUT_SECONDS"
  if (( remaining_session < export_wait_secs )); then
    export_wait_secs="$remaining_session"
  fi

  local read_export_rc=0
  SOURCE_SNAPSHOT_ID=""
  IFS= read -r -t "$export_wait_secs" SOURCE_SNAPSHOT_ID <&4 || read_export_rc=$?
  SOURCE_SNAPSHOT_ID="${SOURCE_SNAPSHOT_ID%$'\r'}"

  if [[ "$read_export_rc" -ne 0 || -z "$SOURCE_SNAPSHOT_ID" || ! "$SOURCE_SNAPSHOT_ID" =~ ^[0-9A-Za-z_-]+$ ]]; then
    printf 'Failed to export a valid consistent PostgreSQL source snapshot over FIFO (rc=%s); aborting fail-closed without running pg_dump.\n' "$read_export_rc" >&2
    close_snapshot_transaction_handles
    return 1
  fi

  printf 'SNAPSHOT_IMPORT_FAILED\n' >"$stage_file"

  local effective_snapshot_id="$SOURCE_SNAPSHOT_ID"
  if [[ "${LARI_OFFLINE_TEST_MODE:-}" == "1" && -n "${LARI_TEST_OVERRIDE_SNAPSHOT_ID:-}" ]]; then
    effective_snapshot_id="$LARI_TEST_OVERRIDE_SNAPSHOT_ID"
  fi

  local dump_rc=0
  set +e
  LARI_INTERNAL_EXEC_SOURCE_CMD=1 run_source_postgres_command pg_dump \
    --format=custom \
    --compress=9 \
    --lock-wait-timeout=30000 \
    --snapshot="$effective_snapshot_id" \
    --file="$dump_file" \
    >"$PRIVATE_DIR/source-dump.stdout" \
    2>"$PRIVATE_DIR/source-dump.stderr" &
  SNAP_DUMP_PID=$!
  printf '%s\n' "$SNAP_DUMP_PID" >"$dump_pid_file"
  wait "$SNAP_DUMP_PID"
  dump_rc=$?
  SNAP_DUMP_PID=""
  rm -f -- "$dump_pid_file"
  set -e

  if [[ "$dump_rc" -ne 0 ]]; then
    printf 'Consistent pg_dump --snapshot failed (exit code %s); aborting fail-closed with zero backup artifacts.\n' "$dump_rc" >&2
    close_snapshot_transaction_handles
    return 1
  fi

  printf '\\i scripts/backup/catalog-fingerprint.sql\nCOMMIT;\n' >&3
  exec 3>&-
  SNAP_IN_FD_OPEN=0

  now_epoch="$(date +%s)"
  remaining_session=$((session_deadline - now_epoch))
  if (( remaining_session <= 0 )); then
    printf 'Snapshot session deadline exceeded before catalog FIFO read.\n' >&2
    close_snapshot_transaction_handles
    return 124
  fi
  local fifo_wait_secs="$SNAPSHOT_FIFO_READ_TIMEOUT_SECONDS"
  if (( remaining_session < fifo_wait_secs )); then
    fifo_wait_secs="$remaining_session"
  fi

  local fifo_read_rc=0
  read_snapshot_fifo_into_file "$catalog_file" "$fifo_wait_secs" || fifo_read_rc=$?
  exec 4<&-
  SNAP_OUT_FD_OPEN=0
  if [[ "$fifo_read_rc" -ne 0 ]]; then
    printf 'Snapshot catalog fingerprint FIFO read failed or timed out (rc=%s); aborting fail-closed.\n' "$fifo_read_rc" >&2
    close_snapshot_transaction_handles
    return 1
  fi

  now_epoch="$(date +%s)"
  remaining_session=$((session_deadline - now_epoch))
  if (( remaining_session <= 0 )); then
    printf 'Snapshot session deadline exceeded before background psql wait.\n' >&2
    close_snapshot_transaction_handles
    return 124
  fi
  local psql_wait_secs="$SNAPSHOT_PSQL_WAIT_TIMEOUT_SECONDS"
  if (( remaining_session < psql_wait_secs )); then
    psql_wait_secs="$remaining_session"
  fi

  local wait_rc=0
  wait_for_snapshot_psql "$psql_wait_secs" || wait_rc=$?
  rm -f -- "$psql_pid_file"
  if [[ "$wait_rc" -ne 0 ]]; then
    printf 'Background snapshot psql session failed or timed out (exit code %s); aborting fail-closed.\n' "$wait_rc" >&2
    close_snapshot_transaction_handles
    return 1
  fi
  return 0
}

capture_snapshot_bound_database_and_catalog() {
  local dump_file="$1"
  local catalog_file="$2"
  SOURCE_SNAPSHOT_BOUND="false"

  local session_timeout="$SNAPSHOT_SESSION_TIMEOUT_SECONDS"
  if [[ "${LARI_OFFLINE_TEST_MODE:-}" == "1" && -n "${LARI_TEST_SNAPSHOT_SESSION_TIMEOUT_SECONDS:-}" ]]; then
    if [[ ! "$LARI_TEST_SNAPSHOT_SESSION_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
      fail_snapshot_capture "SNAPSHOT_EXPORT_FAILED" \
        "Invalid offline snapshot session timeout value; aborting fail-closed."
      return 1
    fi
    session_timeout="$LARI_TEST_SNAPSHOT_SESSION_TIMEOUT_SECONDS"
  fi

  local stage_file="$PRIVATE_DIR/snapshot-session.stage"
  printf 'SNAPSHOT_EXPORT_FAILED\n' >"$stage_file"
  local session_deadline=$(( $(date +%s) + session_timeout ))

  run_snapshot_capture_session "$dump_file" "$catalog_file" "$stage_file" "$session_deadline" &
  SNAPSHOT_SESSION_PID=$!

  local timed_out=0
  while kill -0 "$SNAPSHOT_SESSION_PID" 2>/dev/null; do
    if (( $(date +%s) >= session_deadline )); then
      timed_out=1
      break
    fi
    sleep 0.1
  done

  if [[ "$timed_out" -eq 1 ]]; then
    local stage_on_timeout="SNAPSHOT_EXPORT_FAILED"
    if [[ -f "$stage_file" ]]; then
      IFS= read -r stage_on_timeout <"$stage_file" || stage_on_timeout="SNAPSHOT_EXPORT_FAILED"
    fi
    [[ "$stage_on_timeout" == "SNAPSHOT_IMPORT_FAILED" ]] || stage_on_timeout="SNAPSHOT_EXPORT_FAILED"
    fail_snapshot_capture "$stage_on_timeout" \
      "Snapshot capture session exceeded overall ${session_timeout}s timeout (stage=${stage_on_timeout}); aborting fail-closed."
    return 1
  fi

  local session_rc=0
  wait "$SNAPSHOT_SESSION_PID" || session_rc=$?
  SNAPSHOT_SESSION_PID=""

  if [[ "$session_rc" -ne 0 ]]; then
    local recorded_stage="SNAPSHOT_EXPORT_FAILED"
    if [[ -f "$stage_file" ]]; then
      IFS= read -r recorded_stage <"$stage_file" || recorded_stage="SNAPSHOT_EXPORT_FAILED"
    fi
    [[ "$recorded_stage" == "SNAPSHOT_IMPORT_FAILED" ]] || recorded_stage="SNAPSHOT_EXPORT_FAILED"
    fail_snapshot_capture "$recorded_stage" \
      "Snapshot-bound source capture session failed (stage=${recorded_stage}, rc=${session_rc}); aborting fail-closed."
    return 1
  fi

  [[ -s "$dump_file" && -s "$catalog_file" ]] || {
    fail_snapshot_capture "SNAPSHOT_IMPORT_FAILED" \
      "Snapshot-bound dump or catalog fingerprint output is empty; aborting fail-closed."
    return 1
  }

  jq -e 'type == "object" and has("schemas") and has("tables") and has("policies") and has("routines") and has("roles") and has("role_memberships") and has("extensions")' \
    "$catalog_file" >/dev/null 2>&1 || {
    fail_snapshot_capture "SNAPSHOT_IMPORT_FAILED" \
      "Snapshot-bound catalog fingerprint JSON is invalid or incomplete; aborting fail-closed."
    return 1
  }

  SOURCE_SNAPSHOT_BOUND="true"
  return 0
}

run_restore_postgres_command() {
  env -i \
    HOME="$PRIVATE_DIR" \
    PATH="$PATH" \
    LC_ALL=C.UTF-8 \
    PGHOST="$RESTORE_DATABASE_HOST" \
    PGPORT="$RESTORE_DATABASE_PORT" \
    PGDATABASE="$RESTORE_DATABASE_NAME" \
    PGUSER="$RESTORE_DATABASE_USER" \
    PGSSLMODE=disable \
    PGPASSFILE="$RESTORE_PGPASSFILE" \
    PGCONNECT_TIMEOUT=15 \
    "$@"
}

run_restore_target_postgres_command() {
  env -i \
    HOME="$PRIVATE_DIR" \
    PATH="$PATH" \
    LC_ALL=C.UTF-8 \
    PGHOST="$RESTORE_DATABASE_HOST" \
    PGPORT="$RESTORE_DATABASE_PORT" \
    PGDATABASE="$RESTORE_TARGET_DATABASE_NAME" \
    PGUSER="$RESTORE_DATABASE_USER" \
    PGSSLMODE=disable \
    PGPASSFILE="$RESTORE_PGPASSFILE" \
    PGCONNECT_TIMEOUT=15 \
    "$@"
}

reject_pristine_target() {
  local reason="$1"
  if [[ -n "${PRIVATE_DIR:-}" && -d "$PRIVATE_DIR" ]]; then
    printf 'HOLD: %s\n' "$reason" | tee -a "$PRIVATE_DIR/restore-pristine-target.stderr" >&2
  else
    printf 'HOLD: %s\n' "$reason" >&2
  fi
  return 1
}

validate_disposable_restore_endpoint() {
  if [[ "${LARI_DISPOSABLE_DB:-}" != "1" ]]; then
    reject_pristine_target "Disposable restore guard LARI_DISPOSABLE_DB=1 is not enabled."
    return 1
  fi
  if [[ "${RESTORE_DATABASE_HOST:-}" != "127.0.0.1" ]]; then
    reject_pristine_target "Non-disposable restore endpoint rejected (host must be 127.0.0.1, got: ${RESTORE_DATABASE_HOST:-})."
    return 1
  fi
  if [[ "${RESTORE_DATABASE_PORT:-}" != "5432" ]]; then
    reject_pristine_target "Non-disposable restore port rejected (port must be 5432, got: ${RESTORE_DATABASE_PORT:-})."
    return 1
  fi
  if [[ "${RESTORE_DATABASE_USER:-}" != "supabase_admin" ]]; then
    reject_pristine_target "Wrong disposable restore user rejected (must be supabase_admin, got: ${RESTORE_DATABASE_USER:-})."
    return 1
  fi
  if [[ "${RESTORE_DATABASE_NAME:-}" != "restore_verification" ]]; then
    reject_pristine_target "Bootstrap control database name must be restore_verification (got: ${RESTORE_DATABASE_NAME:-})."
    return 1
  fi
  if [[ ! "${RESTORE_TARGET_DATABASE_NAME:-}" =~ ^[a-z_][a-z0-9_]{0,62}$ ]]; then
    reject_pristine_target "Invalid restore target database identifier: ${RESTORE_TARGET_DATABASE_NAME:-}."
    return 1
  fi
  case "$RESTORE_TARGET_DATABASE_NAME" in
    restore_verification|postgres|template0|template1)
      reject_pristine_target "Wrong restore target selected (${RESTORE_TARGET_DATABASE_NAME}); refusing to restore into bootstrap control or system database."
      return 1
      ;;
  esac
}

write_failed_pristine_target_receipt() {
  local reason="${1:-pristine_target_verification_failed}"
  jq -n \
    --arg bootstrap_control_db "${RESTORE_DATABASE_NAME:-restore_verification}" \
    --arg target_db_name "${RESTORE_TARGET_DATABASE_NAME:-lari_restore_verification}" \
    --arg template_source "template0" \
    --arg failure_reason "$reason" \
    '{
      bootstrap_control_database: $bootstrap_control_db,
      target_database_name: $target_db_name,
      target_database_oid: null,
      template_source: $template_source,
      template0_oid: null,
      datistemplate: null,
      database_owner: null,
      bootstrap_superuser_oid10: null,
      server_version_num: null,
      pre_restore_application_schemas: null,
      pre_restore_user_tables_count: null,
      pristine_verified: false,
      failure_reason: $failure_reason
    }' >"$PRIVATE_DIR/pristine-target-receipt.json"
}

create_and_verify_pristine_restore_database() {
  validate_disposable_restore_endpoint || {
    write_failed_pristine_target_receipt "endpoint_or_target_name_rejected"
    return 1
  }

  local expected_owner="supabase_admin"
  if [[ "${LARI_OFFLINE_TEST_MODE:-}" == "1" && -n "${LARI_EXPECTED_RESTORE_OWNER:-}" ]]; then
    expected_owner="$LARI_EXPECTED_RESTORE_OWNER"
  fi

  local server_ver
  server_ver="$(run_restore_postgres_command psql -X -qAt --set=ON_ERROR_STOP=1 --command='SHOW server_version_num' 2>>"$PRIVATE_DIR/restore-pristine-target.stderr")" || {
    write_failed_pristine_target_receipt "control_db_version_query_failed"
    return 1
  }
  if [[ "$server_ver" != "170006" ]]; then
    write_failed_pristine_target_receipt "server_version_mismatch"
    reject_pristine_target "Disposable restore server_version_num must be 170006, got: ${server_ver}."
    return 1
  fi

  local bootstrap_super
  bootstrap_super="$(run_restore_postgres_command psql -X -qAt --set=ON_ERROR_STOP=1 --command='SELECT rolname FROM pg_roles WHERE oid = 10' 2>>"$PRIVATE_DIR/restore-pristine-target.stderr")" || {
    write_failed_pristine_target_receipt "bootstrap_superuser_query_failed"
    return 1
  }
  if [[ "$bootstrap_super" != "$expected_owner" ]]; then
    write_failed_pristine_target_receipt "wrong_bootstrap_superuser"
    reject_pristine_target "Wrong disposable server bootstrap superuser (OID 10): expected ${expected_owner}, got ${bootstrap_super}."
    return 1
  fi

  local template0_info
  template0_info="$(run_restore_postgres_command psql -X -qAt --set=ON_ERROR_STOP=1 --command="SELECT oid || '|' || CASE WHEN datistemplate THEN 't' ELSE 'f' END FROM pg_database WHERE datname = 'template0'" 2>>"$PRIVATE_DIR/restore-pristine-target.stderr")" || {
    write_failed_pristine_target_receipt "template0_lookup_failed"
    return 1
  }
  local template0_oid="${template0_info%%|*}"
  local template0_flag="${template0_info##*|}"
  if [[ -z "$template0_oid" || "$template0_flag" != "t" ]]; then
    write_failed_pristine_target_receipt "template0_invalid"
    reject_pristine_target "Canonical template0 database is missing or not marked as template."
    return 1
  fi

  local existing_count
  existing_count="$(run_restore_postgres_command psql -X -qAt --set=ON_ERROR_STOP=1 --command="SELECT count(*) FROM pg_database WHERE datname = '${RESTORE_TARGET_DATABASE_NAME}'" 2>>"$PRIVATE_DIR/restore-pristine-target.stderr")" || {
    write_failed_pristine_target_receipt "target_existence_check_failed"
    return 1
  }
  if [[ "$existing_count" != "0" ]]; then
    write_failed_pristine_target_receipt "target_database_already_exists"
    reject_pristine_target "Pristine restore target database \"${RESTORE_TARGET_DATABASE_NAME}\" already exists; refusing blind drop or overwrite."
    return 1
  fi

  local create_owner="$RESTORE_DATABASE_USER"
  if [[ "${LARI_OFFLINE_TEST_MODE:-}" == "1" && -n "${LARI_TEST_TARGET_DB_OWNER:-}" ]]; then
    if [[ ! "$LARI_TEST_TARGET_DB_OWNER" =~ ^[a-z_][a-z0-9_]{0,62}$ ]]; then
      write_failed_pristine_target_receipt "invalid_test_target_owner_identifier"
      reject_pristine_target "Invalid test target database owner identifier."
      return 1
    fi
    create_owner="$LARI_TEST_TARGET_DB_OWNER"
  fi

  run_restore_postgres_command psql \
    -X -q --set=ON_ERROR_STOP=1 \
    --command="CREATE DATABASE \"${RESTORE_TARGET_DATABASE_NAME}\" WITH TEMPLATE template0 OWNER \"${create_owner}\";" \
    >>"$PRIVATE_DIR/restore-pristine-target.stdout" \
    2>>"$PRIVATE_DIR/restore-pristine-target.stderr" || {
    write_failed_pristine_target_receipt "create_database_failed"
    reject_pristine_target "Failed to create pristine restore target database \"${RESTORE_TARGET_DATABASE_NAME}\" from template0."
    return 1
  }

  local target_meta
  target_meta="$(run_restore_target_postgres_command psql -X -qAt --set=ON_ERROR_STOP=1 --command="SELECT d.oid || '|' || d.datname || '|' || CASE WHEN d.datistemplate THEN 't' ELSE 'f' END || '|' || pg_get_userbyid(d.datdba) || '|' || current_setting('server_version_num') FROM pg_database d WHERE d.datname = current_database()" 2>>"$PRIVATE_DIR/restore-pristine-target.stderr")" || {
    write_failed_pristine_target_receipt "target_metadata_verification_failed"
    return 1
  }

  local target_oid target_name target_istemplate target_owner target_ver
  IFS='|' read -r target_oid target_name target_istemplate target_owner target_ver <<<"$target_meta"

  if [[ "$target_name" != "$RESTORE_TARGET_DATABASE_NAME" || "$target_name" == "$RESTORE_DATABASE_NAME" ]]; then
    write_failed_pristine_target_receipt "target_database_identity_mismatch"
    reject_pristine_target "Pristine target connection verification failed: connected to \"${target_name}\" instead of \"${RESTORE_TARGET_DATABASE_NAME}\"."
    return 1
  fi
  if [[ "$target_istemplate" != "f" ]]; then
    write_failed_pristine_target_receipt "target_datistemplate_invalid"
    reject_pristine_target "Pristine target database datistemplate must be false, got: ${target_istemplate}."
    return 1
  fi
  if [[ "$target_owner" != "$expected_owner" ]]; then
    write_failed_pristine_target_receipt "wrong_target_database_owner"
    reject_pristine_target "Wrong target database owner: expected ${expected_owner}, got ${target_owner}."
    return 1
  fi
  if [[ "$target_ver" != "170006" ]]; then
    write_failed_pristine_target_receipt "target_server_version_mismatch"
    reject_pristine_target "Pristine target database server_version_num must be 170006, got: ${target_ver}."
    return 1
  fi

  local unexpected_schemas
  unexpected_schemas="$(run_restore_target_postgres_command psql -X -qAt --set=ON_ERROR_STOP=1 --command="SELECT coalesce(string_agg(nspname, ',' ORDER BY nspname), '') FROM pg_namespace WHERE nspname <> 'information_schema' AND nspname !~ '^pg_' AND nspname <> 'public'" 2>>"$PRIVATE_DIR/restore-pristine-target.stderr")" || {
    write_failed_pristine_target_receipt "target_schema_inspection_failed"
    return 1
  }
  if [[ -n "$unexpected_schemas" ]]; then
    write_failed_pristine_target_receipt "pre_existing_application_schemas_present"
    reject_pristine_target "Pristine target database \"${RESTORE_TARGET_DATABASE_NAME}\" contains pre-existing non-template0 schemas before restore: ${unexpected_schemas}."
    return 1
  fi

  local supabase_app_schemas_count
  supabase_app_schemas_count="$(run_restore_target_postgres_command psql -X -qAt --set=ON_ERROR_STOP=1 --command="SELECT count(*) FROM pg_namespace WHERE nspname IN ('auth', 'vault', 'extensions', 'graphql_public', 'storage', 'realtime', 'graphql', 'pgsodium', 'supabase_functions', 'supabase_migrations')" 2>>"$PRIVATE_DIR/restore-pristine-target.stderr")" || {
    write_failed_pristine_target_receipt "supabase_schema_inspection_failed"
    return 1
  }
  if [[ "$supabase_app_schemas_count" != "0" ]]; then
    write_failed_pristine_target_receipt "supabase_schemas_present_before_restore"
    reject_pristine_target "Pristine target database \"${RESTORE_TARGET_DATABASE_NAME}\" is not clean; Supabase application schemas exist before restore."
    return 1
  fi

  local pre_restore_tables_count
  pre_restore_tables_count="$(run_restore_target_postgres_command psql -X -qAt --set=ON_ERROR_STOP=1 --command="SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r', 'p') AND n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'" 2>>"$PRIVATE_DIR/restore-pristine-target.stderr")" || {
    write_failed_pristine_target_receipt "pre_restore_tables_inspection_failed"
    return 1
  }
  if [[ "$pre_restore_tables_count" != "0" ]]; then
    write_failed_pristine_target_receipt "unexpected_tables_before_restore"
    reject_pristine_target "Pristine target database \"${RESTORE_TARGET_DATABASE_NAME}\" contains ${pre_restore_tables_count} unexpected tables before restore."
    return 1
  fi

  jq -n \
    --arg bootstrap_control_db "$RESTORE_DATABASE_NAME" \
    --arg target_db_name "$target_name" \
    --argjson target_db_oid "$target_oid" \
    --arg template_source "template0" \
    --argjson template0_oid "$template0_oid" \
    --argjson datistemplate false \
    --arg database_owner "$target_owner" \
    --arg bootstrap_superuser_oid10 "$bootstrap_super" \
    --arg server_version_num "$target_ver" \
    --argjson pre_restore_user_tables_count 0 \
    --argjson pristine_verified true \
    '{
      bootstrap_control_database: $bootstrap_control_db,
      target_database_name: $target_db_name,
      target_database_oid: $target_db_oid,
      template_source: $template_source,
      template0_oid: $template0_oid,
      datistemplate: $datistemplate,
      database_owner: $database_owner,
      bootstrap_superuser_oid10: $bootstrap_superuser_oid10,
      server_version_num: $server_version_num,
      pre_restore_application_schemas: [],
      pre_restore_user_tables_count: $pre_restore_user_tables_count,
      pristine_verified: $pristine_verified
    }' >"$PRIVATE_DIR/pristine-target-receipt.json"
}

if [[ "${1:-}" == "$VALIDATE_SOURCE_URL_ONLY" ]]; then
  [[ "$#" -eq 1 ]] || {
    printf 'Source database URL validation mode accepts no additional arguments.\n' >&2
    exit 1
  }
  require_value SOURCE_DATABASE_URL
  VALIDATOR_PYTHON="${LARI_SOURCE_VALIDATOR_PYTHON:-python3}"
  command -v "$VALIDATOR_PYTHON" >/dev/null 2>&1 || {
    printf 'Required validator runtime is unavailable.\n' >&2
    exit 1
  }
  validate_source_database_url "$VALIDATOR_PYTHON"
  printf 'Source database URL validation: PASS\n'
  exit 0
fi

if [[ "${1:-}" == "$TEST_SOURCE_CREDENTIALS_ONLY" ]]; then
  [[ "$#" -eq 1 ]] || {
    printf 'Offline credential test mode accepts no additional arguments.\n' >&2
    exit 1
  }
  [[ "${LARI_OFFLINE_TEST_MODE:-}" == "1" ]] || {
    printf 'Offline credential test guard is not enabled.\n' >&2
    exit 1
  }
  require_value RUNNER_TEMP
  require_value GITHUB_WORKSPACE
  PRIVATE_DIR="$(mktemp -d "${RUNNER_TEMP}/lari-logical-backup.XXXXXX")"
  ARTIFACT_DIR="${GITHUB_WORKSPACE}/backup-artifacts"
  RESTORE_DATABASE_HOST="127.0.0.1"
  RESTORE_DATABASE_PORT="5432"
  RESTORE_DATABASE_NAME="restore_verification"
  RESTORE_TARGET_DATABASE_NAME="lari_restore_verification"
  RESTORE_DATABASE_USER="supabase_admin"
  RESTORE_DATABASE_PASSWORD="disposable-only"
  require_value SOURCE_POOLER_HOST
  require_source_database_password
  require_value BACKUP_AGE_RECIPIENT
  [[ "$BACKUP_AGE_RECIPIENT" == age1* ]] || {
    printf 'The encryption recipient must be an age X25519 public recipient.\n' >&2
    exit 1
  }
  VALIDATOR_PYTHON="${LARI_SOURCE_VALIDATOR_PYTHON:-python3}"
  command -v "$VALIDATOR_PYTHON" >/dev/null 2>&1 || {
    printf 'Required validator runtime is unavailable.\n' >&2
    exit 1
  }
  command -v sha256sum >/dev/null 2>&1 || {
    printf 'Required credential test runtime is unavailable.\n' >&2
    exit 1
  }
  require_value LARI_EXPECTED_SOURCE_PGPASS_SHA256
  validate_ca_root_certificate "$VALIDATOR_PYTHON"
  build_and_validate_source_database_url "$VALIDATOR_PYTHON"
  prepare_private_credentials
  assert_private_source_credentials
  ACTUAL_SOURCE_PGPASS_SHA256="$(sha256sum "$SOURCE_PGPASSFILE" | awk '{print $1}')"
  [[ "$ACTUAL_SOURCE_PGPASS_SHA256" == "$LARI_EXPECTED_SOURCE_PGPASS_SHA256" ]] || {
    printf 'Protected source credential escaping check failed.\n' >&2
    exit 1
  }
  unset ACTUAL_SOURCE_PGPASS_SHA256 LARI_EXPECTED_SOURCE_PGPASS_SHA256
  printf 'Source credential configuration: PASS\n'
  printf 'PGPASSFILE permission: PASS\n'
  printf 'PGPASSFILE escaping: PASS\n'
  printf 'PGPASSFILE artifact exclusion: PASS\n'
  if [[ "${LARI_OFFLINE_TEST_FAILURE:-}" == "1" ]]; then
    printf 'Synthetic post-credential failure.\n' >&2
    exit 1
  fi
  if [[ "${LARI_OFFLINE_TEST_SIGNAL:-}" == "TERM" ]]; then
    kill -TERM "$$"
  fi
  exit 0
fi

if [[ "${1:-}" == "$TEST_RESTORE_VERDICT_ONLY" ]]; then
  [[ "$#" -eq 1 ]] || {
    printf 'Offline restore-verdict test mode accepts no additional arguments.\n' >&2
    exit 1
  }
  [[ "${LARI_OFFLINE_TEST_MODE:-}" == "1" ]] || {
    printf 'Offline restore-verdict test guard is not enabled.\n' >&2
    exit 1
  }
  require_value GITHUB_WORKSPACE
  require_value LARI_TEST_RESTORE_VERDICT
  ARTIFACT_DIR="${GITHUB_WORKSPACE}/backup-artifacts"
  VERDICT="$LARI_TEST_RESTORE_VERDICT"
  enforce_verified_restore
  printf 'Verified restore publication gate: PASS\n'
  exit 0
fi

if [[ "${1:-}" == "$TEST_PG17_CLIENT_SELECTION_ONLY" ]]; then
  [[ "$#" -eq 1 ]] || {
    printf 'PostgreSQL 17 client selection test mode accepts no additional arguments.\n' >&2
    exit 1
  }
  [[ "${LARI_OFFLINE_TEST_MODE:-}" == "1" ]] || {
    printf 'Offline test guard is not enabled.\n' >&2
    exit 1
  }
  configure_postgresql17_path
  verify_postgres17_client_binaries
  env_i_version="$(env -i PATH="$PATH" LC_ALL=C.UTF-8 pg_dump --version 2>&1 || true)"
  env_i_major="$(printf '%s' "$env_i_version" | awk '{print $3}' | cut -d. -f1)"
  if [[ "$env_i_major" != "17" ]]; then
    printf 'PostgreSQL 17 isolated env -i execution check failed: expected 17, got %s\n' "$env_i_major" >&2
    exit 1
  fi
  printf 'PostgreSQL 17 isolated env -i execution: PASS\n'
  printf 'PostgreSQL 17 client binary selection: PASS\n'
  exit 0
fi

if [[ "${1:-}" == "$TEST_DISPOSABLE_ROLE_RESTORE_ONLY" ]]; then
  [[ "$#" -eq 3 ]] || {
    printf 'Disposable role restore test mode requires input and output file paths.\n' >&2
    exit 1
  }
  [[ "${LARI_OFFLINE_TEST_MODE:-}" == "1" ]] || {
    printf 'Offline test guard is not enabled.\n' >&2
    exit 1
  }
  input_roles="$2"
  output_roles="$3"
  VALIDATOR_PYTHON="${LARI_SOURCE_VALIDATOR_PYTHON:-python3}"
  command -v "$VALIDATOR_PYTHON" >/dev/null 2>&1 || {
    printf 'Required validator runtime is unavailable.\n' >&2
    exit 1
  }
  prepare_disposable_role_restore "$input_roles" "$output_roles" "$VALIDATOR_PYTHON"
  [[ -f "$output_roles" ]] || {
    printf 'Prepared restore roles file was not created.\n' >&2
    exit 1
  }
  grep -q 'DO \$lari_role_grant_bootstrap\$' "$output_roles" || {
    printf 'Prepared restore roles file is missing the bootstrap delegation block.\n' >&2
    exit 1
  }
  printf 'Disposable role restore preparation: PASS\n'
  exit 0
fi

if [[ "${1:-}" == "$TEST_SOURCE_SNAPSHOT_FLOW_ONLY" ]]; then
  [[ "$#" -eq 1 ]] || {
    printf 'Source snapshot flow test mode accepts no additional arguments.\n' >&2
    exit 1
  }
  [[ "${LARI_OFFLINE_TEST_MODE:-}" == "1" ]] || {
    printf 'Offline test guard is not enabled.\n' >&2
    exit 1
  }

  SOURCE_POOLER_HOST="${LARI_TEST_SOURCE_HOST:-127.0.0.1}"
  [[ "$SOURCE_POOLER_HOST" == "127.0.0.1" ]] || {
    printf 'HOLD: Snapshot flow test mode only permits loopback 127.0.0.1 endpoint.\n' >&2
    exit 1
  }
  SOURCE_DATABASE_PORT="${LARI_TEST_SOURCE_PORT:-5432}"
  [[ "$SOURCE_DATABASE_PORT" =~ ^[0-9]+$ ]] || {
    printf 'HOLD: Invalid snapshot flow test port.\n' >&2
    exit 1
  }
  SOURCE_DATABASE_NAME="${LARI_TEST_SOURCE_DB:-postgres}"
  SOURCE_DATABASE_USER="${LARI_TEST_SOURCE_USER:-supabase_admin}"
  local_test_password="${LARI_TEST_SOURCE_PASSWORD:-}"
  [[ -n "$local_test_password" ]] || {
    printf 'Required snapshot test password is unavailable.\n' >&2
    exit 1
  }

  ARTIFACT_DIR=""
  PRIVATE_DIR="$(mktemp -d "${RUNNER_TEMP:?RUNNER_TEMP is required}/lari-snapshot-test.XXXXXX")"

  configure_postgresql17_path
  verify_postgres17_client_binaries

  credentials_dir="$PRIVATE_DIR/database-credentials"
  mkdir -m 0700 -- "$credentials_dir"
  SOURCE_PGPASSFILE="$credentials_dir/source.pgpass"
  write_pgpass_file \
    "$SOURCE_PGPASSFILE" \
    "$SOURCE_POOLER_HOST" \
    "$SOURCE_DATABASE_PORT" \
    "$SOURCE_DATABASE_NAME" \
    "$SOURCE_DATABASE_USER" \
    "$local_test_password"
  unset local_test_password

  OFFLINE_SNAPSHOT_TEST_MODE="1"
  capture_snapshot_bound_database_and_catalog \
    "$PRIVATE_DIR/database.dump" \
    "$PRIVATE_DIR/source-catalog-fingerprint.json"

  pg_restore --list "$PRIVATE_DIR/database.dump" >/dev/null
  jq -c -n \
    --arg snapshot_bound "$SOURCE_SNAPSHOT_BOUND" \
    --slurpfile fp "$PRIVATE_DIR/source-catalog-fingerprint.json" \
    '{
      snapshot_bound: ($snapshot_bound == "true"),
      tables_count: ($fp[0].tables.object_count // 0),
      schemas_count: ($fp[0].schemas.object_count // 0)
    }' >"$PRIVATE_DIR/snapshot-test-receipt.json"

  VERDICT="VERIFIED_LOGICAL_RESTORE"
  RESTORE_STAGE="VERIFIED_LOGICAL_RESTORE"
  printf 'SNAPSHOT_TEST_RECEIPT=%s\n' "$(cat "$PRIVATE_DIR/snapshot-test-receipt.json")"
  printf 'Snapshot-bound source capture: PASS\n'
  exit 0
fi

OFFLINE_PRISTINE_FIXTURE_DIR=""
if [[ "${1:-}" == "$TEST_DISPOSABLE_PRISTINE_RESTORE_ONLY" ]]; then
  [[ "$#" -eq 2 ]] || {
    printf 'Disposable pristine restore test mode requires a fixture directory path.\n' >&2
    exit 1
  }
  [[ "${LARI_OFFLINE_TEST_MODE:-}" == "1" ]] || {
    printf 'Offline test guard is not enabled.\n' >&2
    exit 1
  }
  OFFLINE_PRISTINE_FIXTURE_DIR="$2"
  [[ -d "$OFFLINE_PRISTINE_FIXTURE_DIR" ]] || {
    printf 'Disposable pristine restore fixture directory not found: %s\n' "$OFFLINE_PRISTINE_FIXTURE_DIR" >&2
    exit 1
  }
elif [[ "$#" -ne 0 ]]; then
  printf 'Unexpected command argument.\n' >&2
  exit 1
fi

ARTIFACT_DIR="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}/backup-artifacts"
PRIVATE_DIR="$(mktemp -d "${RUNNER_TEMP:?RUNNER_TEMP is required}/lari-logical-backup.XXXXXX")"
RESTORE_DATABASE_HOST="127.0.0.1"
RESTORE_DATABASE_PORT="5432"
RESTORE_DATABASE_NAME="restore_verification"
RESTORE_TARGET_DATABASE_NAME="lari_restore_verification"
RESTORE_DATABASE_USER="supabase_admin"
RESTORE_DATABASE_PASSWORD="disposable-only"
if [[ "${LARI_OFFLINE_TEST_MODE:-}" == "1" && -n "$OFFLINE_PRISTINE_FIXTURE_DIR" ]]; then
  RESTORE_DATABASE_HOST="${LARI_TEST_RESTORE_HOST:-127.0.0.1}"
  RESTORE_DATABASE_PORT="${LARI_TEST_RESTORE_PORT:-5432}"
  RESTORE_DATABASE_NAME="${LARI_TEST_RESTORE_CONTROL_DB:-restore_verification}"
  RESTORE_TARGET_DATABASE_NAME="${LARI_RESTORE_TARGET_DB:-lari_restore_verification}"
  RESTORE_DATABASE_USER="${LARI_TEST_RESTORE_USER:-supabase_admin}"
fi
CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BACKUP_ID="lari-${EXPECTED_PROJECT_REF}-${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}-${GITHUB_RUN_ATTEMPT:?GITHUB_RUN_ATTEMPT is required}"
ENCRYPTED_NAME="${BACKUP_ID}.tar.gz.age"

rm -rf -- "$ARTIFACT_DIR"

require_value SOURCE_PROJECT_REF
require_value BACKUP_AGE_RECIPIENT

[[ "$SOURCE_PROJECT_REF" == "$EXPECTED_PROJECT_REF" ]] || {
  printf 'Source project gate rejected the requested project.\n' >&2
  exit 1
}
[[ "${LARI_DISPOSABLE_DB:-}" == "1" ]] || {
  printf 'Disposable restore guard is not enabled.\n' >&2
  exit 1
}
[[ "$BACKUP_AGE_RECIPIENT" == age1* ]] || {
  printf 'The encryption recipient must be an age X25519 public recipient.\n' >&2
  exit 1
}

: >"$PRIVATE_DIR/restore-pristine-target.stdout"
: >"$PRIVATE_DIR/restore-pristine-target.stderr"
validate_disposable_restore_endpoint || {
  VERDICT="NOT_RESTORABLE_IN_DISPOSABLE_POSTGRES_17"
  enforce_verified_restore
  exit 1
}

configure_postgresql17_path
for command_name in age jq pg_dump pg_dumpall pg_restore psql sha256sum tar python3; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Required command is unavailable: %s\n' "$command_name" >&2
    exit 1
  }
done

unset \
  PGAPPNAME PGCHANNELBINDING PGCLIENTENCODING PGCONNECT_TIMEOUT PGDATABASE \
  PGHOST PGHOSTADDR PGOPTIONS PGPASSFILE PGPASSWORD PGPORT PGREQUIRESSL \
  PGSERVICE PGSERVICEFILE PGSSLCERT PGSSLCRL PGSSLCRLDIR PGSSLKEY \
  PGSSLMODE PGSSLROOTCERT PGSSLSNI PGTARGETSESSIONATTRS PGUSER \
  SOURCE_DATABASE_URL

verify_postgres17_client_binaries
PG_DUMP_MAJOR="$(pg_dump --version | awk '{print $3}' | cut -d. -f1)"
PG_RESTORE_MAJOR="$(pg_restore --version | awk '{print $3}' | cut -d. -f1)"
[[ "$PG_DUMP_MAJOR" == "17" && "$PG_RESTORE_MAJOR" == "17" ]] || {
  printf 'PostgreSQL 17 client binaries are required.\n' >&2
  exit 1
}

if [[ -n "$OFFLINE_PRISTINE_FIXTURE_DIR" ]]; then
  prepare_restore_only_credentials
  for req_file in roles.sql database.dump source-catalog-fingerprint.json source-dependencies.json; do
    [[ -f "$OFFLINE_PRISTINE_FIXTURE_DIR/$req_file" ]] || {
      printf 'Required offline fixture file is missing: %s\n' "$req_file" >&2
      exit 1
    }
    cp -- "$OFFLINE_PRISTINE_FIXTURE_DIR/$req_file" "$PRIVATE_DIR/$req_file"
  done
  : >"$PRIVATE_DIR/source-roles.stderr"
  : >"$PRIVATE_DIR/source-dump.stdout"
  : >"$PRIVATE_DIR/source-dump.stderr"
  : >"$PRIVATE_DIR/source-catalog-fingerprint.stderr"
  : >"$PRIVATE_DIR/source-dependencies.stderr"
  mkdir -p -- "$ARTIFACT_DIR"
else
  require_value SOURCE_POOLER_HOST
  require_source_database_password
  validate_ca_root_certificate python3
  build_and_validate_source_database_url python3
  prepare_private_credentials
  assert_private_source_credentials

  mkdir -p -- "$ARTIFACT_DIR"

  printf 'Creating the bounded logical dump without emitting database output.\n'
  run_source_postgres_command pg_dumpall \
    --roles-only \
    --no-role-passwords \
    >"$PRIVATE_DIR/roles.sql" \
    2>"$PRIVATE_DIR/source-roles.stderr"

  capture_snapshot_bound_database_and_catalog \
    "$PRIVATE_DIR/database.dump" \
    "$PRIVATE_DIR/source-catalog-fingerprint.json"

  run_source_postgres_command psql \
    -X -qAt --set=ON_ERROR_STOP=1 \
    --file=scripts/backup/dependency-inventory.sql \
    >"$PRIVATE_DIR/source-dependencies.json" \
    2>"$PRIVATE_DIR/source-dependencies.stderr"
fi

pg_restore --list "$PRIVATE_DIR/database.dump" \
  >"$PRIVATE_DIR/archive.list" \
  2>"$PRIVATE_DIR/archive-list.stderr"

run_restore_postgres_command psql \
  -X -qAt --set=ON_ERROR_STOP=1 \
  --command="SELECT jsonb_agg(jsonb_build_object('name', name, 'default_version', default_version) ORDER BY name) FROM pg_available_extensions" \
  >"$PRIVATE_DIR/restore-available-extensions.json" \
  2>"$PRIVATE_DIR/restore-available-extensions.stderr"

jq -n \
  --slurpfile source "$PRIVATE_DIR/source-dependencies.json" \
  --slurpfile available "$PRIVATE_DIR/restore-available-extensions.json" \
  '{
    source: $source[0],
    unavailable_on_disposable_postgres17: [
      $source[0].extensions[] as $extension
      | select(($available[0] | map(.name) | index($extension.name)) == null)
      | $extension
    ]
  }' >"$PRIVATE_DIR/dependency-report.json"

UNAVAILABLE_EXT_COUNT="$(jq -r '.unavailable_on_disposable_postgres17 | length' "$PRIVATE_DIR/dependency-report.json")"

SERVER_VERSION_NUM="$(run_restore_postgres_command psql -X -qAt --set=ON_ERROR_STOP=1 --command='SHOW server_version_num' 2>"$PRIVATE_DIR/restore-version.stderr")"
[[ "$SERVER_VERSION_NUM" == 17* ]] || {
  printf 'Disposable restore server is not PostgreSQL 17.\n' >&2
  exit 1
}

printf 'Restoring the exact dump into disposable PostgreSQL 17.\n'
set +e
ROLE_PREP_STATUS=0
if ! prepare_disposable_role_restore "$PRIVATE_DIR/roles.sql" "$PRIVATE_DIR/restore-roles.sql" python3 2>>"$PRIVATE_DIR/restore-roles.stderr"; then
  ROLE_PREP_STATUS=1
  ROLES_RESTORE_STATUS=1
  RESTORE_STAGE="ROLE_PREPARATION_FAILED"
else
  run_restore_postgres_command psql \
    -X -q --set=ON_ERROR_STOP=1 \
    --file="$PRIVATE_DIR/restore-roles.sql" \
    >"$PRIVATE_DIR/restore-roles.stdout" \
    2>>"$PRIVATE_DIR/restore-roles.stderr"
  ROLES_RESTORE_STATUS=$?
  if [[ "$ROLES_RESTORE_STATUS" -ne 0 ]]; then
    RESTORE_STAGE="ROLE_REPLAY_FAILED"
  fi
fi

PRISTINE_TARGET_STATUS=1
if [[ "$ROLES_RESTORE_STATUS" -eq 0 ]]; then
  create_and_verify_pristine_restore_database
  PRISTINE_TARGET_STATUS=$?
  if [[ "$PRISTINE_TARGET_STATUS" -ne 0 ]]; then
    RESTORE_STAGE="PRISTINE_TARGET_FAILED"
  fi
else
  write_failed_pristine_target_receipt "skipped_due_to_role_restore_failure"
fi

DATABASE_RESTORE_STATUS=1
if [[ "$ROLES_RESTORE_STATUS" -eq 0 && "$PRISTINE_TARGET_STATUS" -eq 0 ]]; then
  run_restore_target_postgres_command pg_restore \
    --exit-on-error \
    --single-transaction \
    --dbname="$RESTORE_TARGET_DATABASE_NAME" \
    "$PRIVATE_DIR/database.dump" \
    >"$PRIVATE_DIR/restore-database.stdout" \
    2>"$PRIVATE_DIR/restore-database.stderr"
  DATABASE_RESTORE_STATUS=$?
  if [[ "$DATABASE_RESTORE_STATUS" -ne 0 ]]; then
    RESTORE_STAGE="DATABASE_RESTORE_FAILED"
  fi
else
  : >"$PRIVATE_DIR/restore-database.stdout"
  if [[ "$ROLES_RESTORE_STATUS" -ne 0 ]]; then
    printf 'Database restore was not attempted because the role restore failed.\n' >"$PRIVATE_DIR/restore-database.stderr"
  else
    printf 'Database restore was not attempted because pristine target database verification failed.\n' >"$PRIVATE_DIR/restore-database.stderr"
  fi
fi
set -e

replay_source_platform_init_schema_acls() {
  local src_fp_json="$PRIVATE_DIR/source-catalog-fingerprint.json"
  local replay_sql="$PRIVATE_DIR/replay-platform-init-schema-acls.sql"
  [[ -f "$src_fp_json" ]] || return 0

  if ! "${LARI_SOURCE_VALIDATOR_PYTHON:-python3}" - "$src_fp_json" "$replay_sql" <<'PY'
import json, re, sys

src_path, out_path = sys.argv[1], sys.argv[2]
with open(src_path, 'r', encoding='utf-8') as f:
    src = json.load(f)

schemas_probe = ((src.get('diagnostic') or {}).get('acl_probe') or {}).get('schemas') or {}
ident_re = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')
allowed_schemas = ('graphql', 'graphql_public')
allowed_privs = {'USAGE', 'CREATE'}

def q_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'

def q_lit(val: str) -> str:
    return "'" + val.replace("'", "''") + "'"

lines = []
for schema_name in allowed_schemas:
    entry = schemas_probe.get(schema_name)
    if not isinstance(entry, dict):
        continue
    init_privs = entry.get('init_privs') or ''
    if not init_privs or init_privs == '<none>':
        continue
    grants = []
    for section in init_privs.split(';'):
        if not section.startswith('e:'):
            continue
        body = section[2:]
        if not body or body == '<empty>':
            continue
        for item in body.split(','):
            parts = item.split('|')
            if len(parts) != 4:
                continue
            grantor, grantee, priv, grantable = parts
            if not ident_re.fullmatch(grantor):
                raise ValueError(f'Invalid grantor in init_privs for {schema_name}: {grantor!r}')
            if grantee != 'PUBLIC' and not ident_re.fullmatch(grantee):
                raise ValueError(f'Invalid grantee in init_privs for {schema_name}: {grantee!r}')
            if priv not in allowed_privs:
                raise ValueError(f'Unsupported schema privilege in init_privs for {schema_name}: {priv!r}')
            if grantable not in ('t', 'f', 'true', 'false'):
                raise ValueError(f'Invalid is_grantable flag in init_privs for {schema_name}: {grantable!r}')
            grants.append((grantor, grantee, priv, grantable in ('t', 'true')))
    if not grants:
        continue
    lines.append('DO $$ BEGIN')
    lines.append(
        f'  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = {q_lit(schema_name)} AND nspacl IS NULL) THEN'
    )
    for grantor, grantee, priv, is_grantable in grants:
        target = 'PUBLIC' if grantee == 'PUBLIC' else q_ident(grantee)
        opt = ' WITH GRANT OPTION' if is_grantable else ''
        lines.append(f'    SET LOCAL ROLE {q_ident(grantor)};')
        lines.append(f'    GRANT {priv} ON SCHEMA {q_ident(schema_name)} TO {target}{opt};')
        lines.append('    RESET ROLE;')
    lines.append('  END IF;')
    lines.append('END $$;')

with open(out_path, 'w', encoding='utf-8') as out:
    out.write('\n'.join(lines) + ('\n' if lines else ''))
PY
  then
    printf 'Failed to prepare platform init schema ACL replay SQL.\n' >>"$PRIVATE_DIR/restore-catalog-fingerprint.stderr"
    return 1
  fi

  if [[ -s "$replay_sql" ]]; then
    run_restore_target_postgres_command psql \
      -X -qAt --set=ON_ERROR_STOP=1 \
      --file="$replay_sql" \
      >>"$PRIVATE_DIR/restore-catalog-fingerprint.stderr" 2>&1
  fi
}

CATALOG_MATCH=false
if [[ "$ROLES_RESTORE_STATUS" -eq 0 && "$PRISTINE_TARGET_STATUS" -eq 0 && "$DATABASE_RESTORE_STATUS" -eq 0 ]]; then
  VERIFIED_CATALOG_DB="$(run_restore_target_postgres_command psql -X -qAt --set=ON_ERROR_STOP=1 --command='SELECT current_database()' 2>>"$PRIVATE_DIR/restore-catalog-fingerprint.stderr")"
  if [[ "$VERIFIED_CATALOG_DB" == "$RESTORE_TARGET_DATABASE_NAME" && "$VERIFIED_CATALOG_DB" != "$RESTORE_DATABASE_NAME" ]]; then
    replay_source_platform_init_schema_acls
    run_restore_target_postgres_command psql \
      -X -qAt --set=ON_ERROR_STOP=1 \
      --file=scripts/backup/catalog-fingerprint.sql \
      >"$PRIVATE_DIR/restore-catalog-fingerprint.json" \
      2>>"$PRIVATE_DIR/restore-catalog-fingerprint.stderr"
    if "${LARI_SOURCE_VALIDATOR_PYTHON:-python3}" - "$PRIVATE_DIR/source-catalog-fingerprint.json" "$PRIVATE_DIR/restore-catalog-fingerprint.json" <<'PY'
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    src = json.load(f)
with open(sys.argv[2], 'r', encoding='utf-8') as f:
    rst = json.load(f)
cats = ('schemas', 'tables', 'policies', 'routines', 'roles', 'role_memberships', 'extensions')
ok = all(
    isinstance(src.get(c), dict)
    and isinstance(rst.get(c), dict)
    and bool(src[c].get('fingerprint'))
    and src[c].get('fingerprint') == rst[c].get('fingerprint')
    and src[c].get('object_count') == rst[c].get('object_count')
    for c in cats
)
raise SystemExit(0 if ok else 1)
PY
    then
      CATALOG_MATCH=true
    fi
  else
    printf '{}\n' >"$PRIVATE_DIR/restore-catalog-fingerprint.json"
    printf 'Catalog fingerprint verification failed: wrong target database connection (%s).\n' "$VERIFIED_CATALOG_DB" >>"$PRIVATE_DIR/restore-catalog-fingerprint.stderr"
  fi
else
  printf '{}\n' >"$PRIVATE_DIR/restore-catalog-fingerprint.json"
  : >"$PRIVATE_DIR/restore-catalog-fingerprint.stderr"
fi

if [[ "$UNAVAILABLE_EXT_COUNT" -gt 0 ]]; then
  RESTORE_STAGE="EXTENSION_COMPATIBILITY_FAILED"
elif [[ "$CATALOG_MATCH" != "true" && "$DATABASE_RESTORE_STATUS" -eq 0 && "$ROLES_RESTORE_STATUS" -eq 0 && "$PRISTINE_TARGET_STATUS" -eq 0 ]]; then
  RESTORE_STAGE="CATALOG_MISMATCH"
fi

SNAPSHOT_VERIFIED="false"
if [[ -n "$OFFLINE_PRISTINE_FIXTURE_DIR" && "${LARI_OFFLINE_TEST_MODE:-}" == "1" ]]; then
  SNAPSHOT_VERIFIED="true"
elif [[ "${SOURCE_SNAPSHOT_BOUND:-false}" == "true" ]]; then
  SNAPSHOT_VERIFIED="true"
fi

VERDICT="NOT_RESTORABLE_IN_DISPOSABLE_POSTGRES_17"
if [[ "$SNAPSHOT_VERIFIED" == "true" && "$PRISTINE_TARGET_STATUS" -eq 0 && "$ROLES_RESTORE_STATUS" -eq 0 && "$DATABASE_RESTORE_STATUS" -eq 0 && "$CATALOG_MATCH" == "true" && "$UNAVAILABLE_EXT_COUNT" -eq 0 ]]; then
  VERDICT="VERIFIED_LOGICAL_RESTORE"
  RESTORE_STAGE="VERIFIED_LOGICAL_RESTORE"
fi

jq -n \
  --arg verdict "$VERDICT" \
  --argjson pristine_target_status "$PRISTINE_TARGET_STATUS" \
  --argjson roles_restore_status "$ROLES_RESTORE_STATUS" \
  --argjson database_restore_status "$DATABASE_RESTORE_STATUS" \
  --argjson catalog_match "$CATALOG_MATCH" \
  --slurpfile pristine_receipt "$PRIVATE_DIR/pristine-target-receipt.json" \
  --slurpfile dependency_report "$PRIVATE_DIR/dependency-report.json" \
  '{
    verdict: $verdict,
    pristine_target_exit_code: $pristine_target_status,
    roles_restore_exit_code: $roles_restore_status,
    database_restore_exit_code: $database_restore_status,
    catalog_fingerprint_match: $catalog_match,
    data_restore_basis: "pg_restore --exit-on-error --single-transaction",
    pristine_target_receipt: $pristine_receipt[0],
    dependency_report: $dependency_report[0],
    diagnostic_files: [
      "source-roles.stderr",
      "source-dump.stderr",
      "restore-pristine-target.stderr",
      "restore-roles.stderr",
      "restore-database.stderr",
      "restore-catalog-fingerprint.stderr"
    ]
  }' >"$PRIVATE_DIR/restore-report.json"

tar -C "$PRIVATE_DIR" -czf "$PRIVATE_DIR/backup-bundle.tar.gz" \
  roles.sql \
  database.dump \
  archive.list \
  source-catalog-fingerprint.json \
  restore-catalog-fingerprint.json \
  source-dependencies.json \
  restore-available-extensions.json \
  dependency-report.json \
  pristine-target-receipt.json \
  restore-report.json \
  source-roles.stderr \
  source-dump.stdout \
  source-dump.stderr \
  source-catalog-fingerprint.stderr \
  source-dependencies.stderr \
  archive-list.stderr \
  restore-version.stderr \
  restore-available-extensions.stderr \
  restore-pristine-target.stdout \
  restore-pristine-target.stderr \
  restore-roles.stdout \
  restore-roles.stderr \
  restore-database.stdout \
  restore-database.stderr \
  restore-catalog-fingerprint.stderr

printf 'Encrypting the backup bundle before artifact publication.\n'
age \
  --recipient "$BACKUP_AGE_RECIPIENT" \
  --output "$ARTIFACT_DIR/$ENCRYPTED_NAME" \
  "$PRIVATE_DIR/backup-bundle.tar.gz" \
  2>"$PRIVATE_DIR/age.stderr"

rm -f -- "$PRIVATE_DIR/backup-bundle.tar.gz"
ENCRYPTED_SHA256="$(sha256sum "$ARTIFACT_DIR/$ENCRYPTED_NAME" | awk '{print $1}')"
ENCRYPTED_SIZE="$(stat -c %s "$ARTIFACT_DIR/$ENCRYPTED_NAME")"

jq -n \
  --arg manifest_version "1" \
  --arg source_project_ref "$EXPECTED_PROJECT_REF" \
  --arg created_at "$CREATED_AT" \
  --arg source_revision "${GITHUB_SHA:?GITHUB_SHA is required}" \
  --arg pg_dump_major "$PG_DUMP_MAJOR" \
  --arg restore_server_version_num "$SERVER_VERSION_NUM" \
  --arg bootstrap_control_db "$RESTORE_DATABASE_NAME" \
  --arg target_db_name "$RESTORE_TARGET_DATABASE_NAME" \
  --arg template_source "template0" \
  --arg encrypted_file "$ENCRYPTED_NAME" \
  --arg encrypted_sha256 "$ENCRYPTED_SHA256" \
  --argjson encrypted_size "$ENCRYPTED_SIZE" \
  --arg verdict "$VERDICT" \
  --argjson pristine_target_status "$PRISTINE_TARGET_STATUS" \
  --argjson roles_restore_status "$ROLES_RESTORE_STATUS" \
  --argjson database_restore_status "$DATABASE_RESTORE_STATUS" \
  --argjson catalog_match "$CATALOG_MATCH" \
  '{
    manifest_version: $manifest_version,
    backup_scope: "postgresql-logical-database",
    complete_database_backup: false,
    source_project_ref: $source_project_ref,
    created_at_utc: $created_at,
    source_revision: $source_revision,
    encrypted_backup: {
      file: $encrypted_file,
      encryption: "age X25519 recipient",
      sha256: $encrypted_sha256,
      size_bytes: $encrypted_size
    },
    restore_test: {
      postgresql_client_major: $pg_dump_major,
      postgresql_server_version_num: $restore_server_version_num,
      bootstrap_control_database: $bootstrap_control_db,
      target_database_name: $target_db_name,
      template_source: $template_source,
      pristine_target_exit_code: $pristine_target_status,
      roles_restore_exit_code: $roles_restore_status,
      database_restore_exit_code: $database_restore_status,
      catalog_fingerprint_match: $catalog_match,
      verdict: $verdict,
      detailed_report: "restore-report.json inside encrypted bundle"
    },
    limitations: [
      "Supabase Storage object bytes are not included",
      "Supabase platform configuration, secrets, Edge Functions, and encryption root keys are not included",
      "This artifact is not a physical backup or point-in-time recovery image",
      "Managed role or extension incompatibilities make the restore verdict non-passing"
    ]
  }' >"$ARTIFACT_DIR/manifest.json"

test "$(jq -r '.encrypted_backup.sha256' "$ARTIFACT_DIR/manifest.json")" = \
  "$(sha256sum "$ARTIFACT_DIR/$ENCRYPTED_NAME" | awk '{print $1}')"
test "$(jq -r '.source_project_ref' "$ARTIFACT_DIR/manifest.json")" = "$EXPECTED_PROJECT_REF"
test "$(jq -r '.restore_test.verdict' "$ARTIFACT_DIR/manifest.json")" = "$VERDICT"
test "$(jq -r '.restore_test.target_database_name' "$ARTIFACT_DIR/manifest.json")" = "$RESTORE_TARGET_DATABASE_NAME"
test "$(jq -r '.restore_test.template_source' "$ARTIFACT_DIR/manifest.json")" = "template0"

mapfile -t ARTIFACT_FILES < <(find "$ARTIFACT_DIR" -maxdepth 1 -type f -printf '%f\n' | sort)
[[ "${#ARTIFACT_FILES[@]}" -eq 2 ]]
[[ "${ARTIFACT_FILES[0]}" == "$ENCRYPTED_NAME" || "${ARTIFACT_FILES[1]}" == "$ENCRYPTED_NAME" ]]
[[ "${ARTIFACT_FILES[0]}" == "manifest.json" || "${ARTIFACT_FILES[1]}" == "manifest.json" ]]

enforce_verified_restore

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  printf 'restore_verdict=%s\n' "$VERDICT" >>"$GITHUB_OUTPUT"
  printf 'encrypted_sha256=%s\n' "$ENCRYPTED_SHA256" >>"$GITHUB_OUTPUT"
fi

printf 'Encrypted logical backup prepared; restore verdict: %s.\n' "$VERDICT"
