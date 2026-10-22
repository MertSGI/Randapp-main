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

SOURCE_DATABASE_PASSWORD_VALUE="${SOURCE_DATABASE_PASSWORD:-}"
unset SOURCE_DATABASE_PASSWORD

PRIVATE_DIR=""
SOURCE_PGPASSFILE=""
RESTORE_PGPASSFILE=""

cleanup() {
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
    if [[ -n "${ARTIFACT_DIR:-}" && -d "$ARTIFACT_DIR" ]]; then
      rm -rf -- "$ARTIFACT_DIR"
    fi
    printf 'Logical restore verification failed; no backup artifact is eligible for upload.\n' >&2
    return 1
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
    printf 'Input roles dump file not found: %s\n' "$input_roles_sql" >&2
    return 1
  }

  "$python_command" - "$input_roles_sql" "$output_restore_sql" <<'PY'
import re
import sys

input_path = sys.argv[1]
output_path = sys.argv[2]

with open(input_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

grant_pattern = re.compile(
    r'^GRANT\s+("?[A-Za-z0-9_]+"?)\s+TO\s+("?[A-Za-z0-9_]+"?)(?:\s+WITH\s+ADMIN\s+OPTION)?(?:\s+GRANTED\s+BY\s+("?[A-Za-z0-9_]+"?))?\s*;?',
    re.IGNORECASE
)
create_role_pattern = re.compile(
    r'^CREATE\s+ROLE\s+("?[A-Za-z0-9_]+"?)\s*;',
    re.IGNORECASE
)

grants = []
for line in lines:
    stripped = line.strip()
    m = grant_pattern.match(stripped)
    if m:
        target = m.group(1).strip('"')
        member = m.group(2).strip('"')
        grantor = m.group(3).strip('"') if m.group(3) else None
        grants.append({'target': target, 'member': member, 'grantor': grantor})

# Build membership graph: member -> set of targets granted to member
graph = {}
for g in grants:
    graph.setdefault(g['member'], set()).add(g['target'])

def is_ancestor(start, target):
    # Returns True if start is a member of target (directly or transitively)
    visited = set()
    queue = [start]
    while queue:
        curr = queue.pop(0)
        if curr == target:
            return True
        if curr not in visited:
            visited.add(curr)
            for parent in graph.get(curr, []):
                if parent not in visited:
                    queue.append(parent)
    return False

delegations = []
seen_pairs = set()
for g in grants:
    target = g['target']
    grantor = g['grantor']
    if not grantor:
        continue
    # In PostgreSQL, a role cannot be granted to itself.
    # The cluster bootstrap superuser has inherent authority; non-bootstrap roles cannot self-grant.
    if target == grantor:
        continue

    pair = (target, grantor)
    if pair in seen_pairs:
        continue
    seen_pairs.add(pair)

    # Adding target to grantor creates edge grantor -> target.
    # Cycle occurs if target is already an ancestor of grantor (i.e. target is a member of grantor).
    if is_ancestor(target, grantor):
        raise ValueError(f"Cycle detected in role dump: granting {target} to {grantor} creates a circular role membership")

    delegations.append(pair)
    graph.setdefault(grantor, set()).add(target)

# Transform content:
# 1. Make CREATE ROLE idempotent so pre-existing bootstrap role does not fail
# 2. Insert minimal cycle-checked bootstrap delegation DO block before first GRANT
out_lines = []
first_grant_idx = None
for line in lines:
    stripped = line.strip()
    if first_grant_idx is None and re.match(r'^GRANT\s+', stripped, re.IGNORECASE):
        first_grant_idx = len(out_lines)

    m_create = create_role_pattern.match(stripped)
    if m_create:
        rolname = m_create.group(1).strip('"')
        idempotent_block = (
            f"DO $lari_role_init$\n"
            f"BEGIN\n"
            f"  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{rolname}') THEN\n"
            f"    CREATE ROLE \"{rolname}\";\n"
            f"  END IF;\n"
            f"END $lari_role_init$;\n"
        )
        out_lines.append(idempotent_block)
    else:
        out_lines.append(line)

bootstrap_statements = []
for target, grantor in delegations:
    bootstrap_statements.append(
        f"  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{grantor}') "
        f"AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{target}') "
        f"AND current_user <> '{grantor}' THEN\n"
        f"    EXECUTE format('GRANT %I TO %I WITH ADMIN OPTION GRANTED BY %I', '{target}', '{grantor}', current_user);\n"
        f"  END IF;\n"
    )

if bootstrap_statements:
    bootstrap_block = (
        "\n-- LARİ Disposable Restore: Minimal cycle-checked ADMIN OPTION delegations\n"
        "DO $lari_role_grant_bootstrap$\n"
        "BEGIN\n"
        + "".join(bootstrap_statements) +
        "END $lari_role_grant_bootstrap$;\n\n"
    )
else:
    bootstrap_block = (
        "\n-- LARİ Disposable Restore: Bootstrap superuser matches dump grantor; no intermediate delegations required\n"
        "DO $lari_role_grant_bootstrap$\n"
        "BEGIN\n"
        "  NULL;\n"
        "END $lari_role_grant_bootstrap$;\n\n"
    )

if first_grant_idx is not None:
    final_lines = out_lines[:first_grant_idx] + [bootstrap_block] + out_lines[first_grant_idx:]
else:
    final_lines = out_lines + [bootstrap_block]

with open(output_path, 'w', encoding='utf-8') as f:
    f.writelines(final_lines)
PY
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
  env -i \
    HOME="$PRIVATE_DIR" \
    PATH="$PATH" \
    LC_ALL=C.UTF-8 \
    PGHOST="$SOURCE_POOLER_HOST" \
    PGPORT="$SOURCE_DATABASE_PORT" \
    PGDATABASE="$SOURCE_DATABASE_NAME" \
    PGUSER="$SOURCE_DATABASE_USER" \
    PGSSLMODE="$SOURCE_DATABASE_SSLMODE" \
    PGSSLROOTCERT="$SOURCE_DATABASE_SSLROOTCERT" \
    PGPASSFILE="$SOURCE_PGPASSFILE" \
    PGCONNECT_TIMEOUT=15 \
    "$@"
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
  template0_info="$(run_restore_postgres_command psql -X -qAt --set=ON_ERROR_STOP=1 --command="SELECT oid || '|' || datistemplate FROM pg_database WHERE datname = 'template0'" 2>>"$PRIVATE_DIR/restore-pristine-target.stderr")" || {
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
  target_meta="$(run_restore_target_postgres_command psql -X -qAt --set=ON_ERROR_STOP=1 --command="SELECT d.oid || '|' || d.datname || '|' || d.datistemplate || '|' || pg_get_userbyid(d.datdba) || '|' || current_setting('server_version_num') FROM pg_database d WHERE d.datname = current_database()" 2>>"$PRIVATE_DIR/restore-pristine-target.stderr")" || {
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

  run_source_postgres_command pg_dump \
    --format=custom \
    --compress=9 \
    --lock-wait-timeout=30000 \
    --file="$PRIVATE_DIR/database.dump" \
    >"$PRIVATE_DIR/source-dump.stdout" \
    2>"$PRIVATE_DIR/source-dump.stderr"

  run_source_postgres_command psql \
    -X -qAt --set=ON_ERROR_STOP=1 \
    --file=scripts/backup/catalog-fingerprint.sql \
    >"$PRIVATE_DIR/source-catalog-fingerprint.json" \
    2>"$PRIVATE_DIR/source-catalog-fingerprint.stderr"

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
if ! prepare_disposable_role_restore "$PRIVATE_DIR/roles.sql" "$PRIVATE_DIR/restore-roles.sql" python3 2>>"$PRIVATE_DIR/restore-roles.stderr"; then
  ROLES_RESTORE_STATUS=1
else
  run_restore_postgres_command psql \
    -X -q --set=ON_ERROR_STOP=1 \
    --file="$PRIVATE_DIR/restore-roles.sql" \
    >"$PRIVATE_DIR/restore-roles.stdout" \
    2>>"$PRIVATE_DIR/restore-roles.stderr"
  ROLES_RESTORE_STATUS=$?
fi

PRISTINE_TARGET_STATUS=1
if [[ "$ROLES_RESTORE_STATUS" -eq 0 ]]; then
  create_and_verify_pristine_restore_database
  PRISTINE_TARGET_STATUS=$?
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
else
  : >"$PRIVATE_DIR/restore-database.stdout"
  if [[ "$ROLES_RESTORE_STATUS" -ne 0 ]]; then
    printf 'Database restore was not attempted because the role restore failed.\n' >"$PRIVATE_DIR/restore-database.stderr"
  else
    printf 'Database restore was not attempted because pristine target database verification failed.\n' >"$PRIVATE_DIR/restore-database.stderr"
  fi
fi
set -e

CATALOG_MATCH=false
if [[ "$ROLES_RESTORE_STATUS" -eq 0 && "$PRISTINE_TARGET_STATUS" -eq 0 && "$DATABASE_RESTORE_STATUS" -eq 0 ]]; then
  VERIFIED_CATALOG_DB="$(run_restore_target_postgres_command psql -X -qAt --set=ON_ERROR_STOP=1 --command='SELECT current_database()' 2>>"$PRIVATE_DIR/restore-catalog-fingerprint.stderr")"
  if [[ "$VERIFIED_CATALOG_DB" == "$RESTORE_TARGET_DATABASE_NAME" && "$VERIFIED_CATALOG_DB" != "$RESTORE_DATABASE_NAME" ]]; then
    run_restore_target_postgres_command psql \
      -X -qAt --set=ON_ERROR_STOP=1 \
      --file=scripts/backup/catalog-fingerprint.sql \
      >"$PRIVATE_DIR/restore-catalog-fingerprint.json" \
      2>>"$PRIVATE_DIR/restore-catalog-fingerprint.stderr"
    if cmp -s "$PRIVATE_DIR/source-catalog-fingerprint.json" "$PRIVATE_DIR/restore-catalog-fingerprint.json"; then
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

VERDICT="NOT_RESTORABLE_IN_DISPOSABLE_POSTGRES_17"
if [[ "$PRISTINE_TARGET_STATUS" -eq 0 && "$ROLES_RESTORE_STATUS" -eq 0 && "$DATABASE_RESTORE_STATUS" -eq 0 && "$CATALOG_MATCH" == "true" && "$UNAVAILABLE_EXT_COUNT" -eq 0 ]]; then
  VERDICT="VERIFIED_LOGICAL_RESTORE"
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
