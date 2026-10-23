#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

EXPECTED_PROJECT_REF="rwedeejhjazwjthdjzrt"
EXPECTED_STAGING_BRANCH="refs/heads/staging/supabase-staging-consistency"
EXPECTED_CONFIRMATION="QUARANTINE CAPTURE ${EXPECTED_PROJECT_REF}"
SOURCE_DATABASE_USER="postgres.${EXPECTED_PROJECT_REF}"
SOURCE_DATABASE_PORT="5432"
SOURCE_DATABASE_NAME="postgres"
SOURCE_DATABASE_SSLMODE="verify-full"
DEFAULT_SUPABASE_CA_FILE="scripts/backup/supabase-prod-ca-2021.crt"
PINNED_SUPABASE_ROOT_CA_SHA256="807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa"
SOURCE_DATABASE_SSLROOTCERT="${SOURCE_DATABASE_SSLROOTCERT-$DEFAULT_SUPABASE_CA_FILE}"

VALIDATE_SOURCE_URL_ONLY="--validate-source-url-only"
TEST_SOURCE_CREDENTIALS_ONLY="--test-source-credential-handling"
TEST_PG17_CLIENT_SELECTION_ONLY="--test-pg17-client-selection"
TEST_OFFLINE_SYNTHETIC_CAPTURE_ONLY="--test-offline-synthetic-capture"

SOURCE_DATABASE_PASSWORD_VALUE="${SOURCE_DATABASE_PASSWORD:-}"
unset SOURCE_DATABASE_PASSWORD

PRIVATE_DIR=""
SOURCE_PGPASSFILE=""
CAPTURE_COMPLETED_SUCCESSFULLY=0

cleanup() {
  if [[ "$CAPTURE_COMPLETED_SUCCESSFULLY" -ne 1 ]]; then
    if [[ -n "$PRIVATE_DIR" && -d "$PRIVATE_DIR" ]]; then
      for err_file in "$PRIVATE_DIR"/*.stderr; do
        if [[ -f "$err_file" && -s "$err_file" ]]; then
          printf '=== %s ===\n' "$(basename "$err_file")" >&2
          cat "$err_file" >&2
        fi
      done
    fi
    if [[ -n "${ARTIFACT_DIR:-}" && -d "$ARTIFACT_DIR" ]]; then
      rm -rf -- "$ARTIFACT_DIR"
    fi
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

prepare_private_credentials() {
  local credentials_dir="$PRIVATE_DIR/database-credentials"
  mkdir -m 0700 -- "$credentials_dir"
  SOURCE_PGPASSFILE="$credentials_dir/source.pgpass"

  write_pgpass_file \
    "$SOURCE_PGPASSFILE" \
    "$SOURCE_POOLER_HOST" \
    "$SOURCE_DATABASE_PORT" \
    "$SOURCE_DATABASE_NAME" \
    "$SOURCE_DATABASE_USER" \
    "$SOURCE_DATABASE_PASSWORD_VALUE"
  unset SOURCE_DATABASE_PASSWORD_VALUE
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

if [[ "${1:-}" == "$VALIDATE_SOURCE_URL_ONLY" ]]; then
  [[ "$#" -eq 1 ]] || {
    printf 'Source URL validation does not accept additional arguments.\n' >&2
    exit 1
  }
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
    printf 'Credential handling test mode does not accept additional arguments.\n' >&2
    exit 1
  }
  [[ "${LARI_OFFLINE_TEST_MODE:-}" == "1" ]] || {
    printf 'Offline test guard is not enabled.\n' >&2
    exit 1
  }
  ARTIFACT_DIR="${LARI_TEST_ARTIFACT_DIR:-/tmp/lari-test-artifacts}"
  PRIVATE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lari-test-private.XXXXXX")"
  SOURCE_POOLER_HOST="aws-0-eu-central-1.pooler.supabase.com"
  SOURCE_DATABASE_PASSWORD_VALUE='test:pass\word'
  prepare_private_credentials
  assert_private_source_credentials
  printf 'Protected source credential handling: PASS\n'
  exit 0
fi

if [[ "${1:-}" == "$TEST_PG17_CLIENT_SELECTION_ONLY" ]]; then
  [[ "$#" -eq 1 ]] || {
    printf 'PostgreSQL 17 client selection test does not accept additional arguments.\n' >&2
    exit 1
  }
  configure_postgresql17_path
  verify_postgres17_client_binaries
  env_i_major="$(env -i PATH="$PATH" LC_ALL=C.UTF-8 pg_dump --version 2>&1 | awk '{print $3}' | cut -d. -f1)"
  if [[ "$env_i_major" != "17" ]]; then
    printf 'PostgreSQL 17 isolated env -i execution check failed: expected 17, got %s\n' "$env_i_major" >&2
    exit 1
  fi
  printf 'PostgreSQL 17 isolated env -i execution: PASS\n'
  printf 'PostgreSQL 17 client binary selection: PASS\n'
  exit 0
fi

OFFLINE_SOURCE_FIXTURE_DIR=""
if [[ "${1:-}" == "$TEST_OFFLINE_SYNTHETIC_CAPTURE_ONLY" ]]; then
  [[ "$#" -eq 2 ]] || {
    printf 'Offline synthetic capture test mode requires a fixture directory path.\n' >&2
    exit 1
  }
  [[ "${LARI_OFFLINE_TEST_MODE:-}" == "1" ]] || {
    printf 'Offline test guard is not enabled.\n' >&2
    exit 1
  }
  OFFLINE_SOURCE_FIXTURE_DIR="$2"
  [[ -d "$OFFLINE_SOURCE_FIXTURE_DIR" ]] || {
    printf 'Offline fixture directory not found: %s\n' "$OFFLINE_SOURCE_FIXTURE_DIR" >&2
    exit 1
  }
elif [[ "$#" -ne 0 ]]; then
  printf 'Unexpected command argument.\n' >&2
  exit 1
fi

ARTIFACT_DIR="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}/backup-artifacts"
PRIVATE_DIR="$(mktemp -d "${RUNNER_TEMP:?RUNNER_TEMP is required}/lari-quarantine-capture.XXXXXX")"
CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BACKUP_ID="lari-quarantine-${EXPECTED_PROJECT_REF}-${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}-${GITHUB_RUN_ATTEMPT:?GITHUB_RUN_ATTEMPT is required}"
ENCRYPTED_NAME="${BACKUP_ID}.tar.gz.age"

rm -rf -- "$ARTIFACT_DIR"

require_value SOURCE_PROJECT_REF
require_value EXPECTED_STAGING_SHA
require_value CONFIRMATION
require_value BACKUP_AGE_RECIPIENT

[[ "$SOURCE_PROJECT_REF" == "$EXPECTED_PROJECT_REF" ]] || {
  printf 'Source project gate rejected the requested project.\n' >&2
  exit 1
}

[[ "$CONFIRMATION" == "$EXPECTED_CONFIRMATION" ]] || {
  printf 'Confirmation gate rejected the operator token.\n' >&2
  exit 1
}

[[ "$BACKUP_AGE_RECIPIENT" == age1* ]] || {
  printf 'The encryption recipient must be an age X25519 public recipient.\n' >&2
  exit 1
}

[[ "$EXPECTED_STAGING_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'Expected staging SHA must be a 40-character lowercase hex string.\n' >&2
  exit 1
}

require_value GITHUB_SHA
[[ "$GITHUB_SHA" == "$EXPECTED_STAGING_SHA" ]] || {
  printf 'Source revision mismatch: GITHUB_SHA does not match expected_staging_sha.\n' >&2
  exit 1
}

if [[ "${LARI_OFFLINE_TEST_MODE:-0}" != "1" ]]; then
  require_value GITHUB_REF
  [[ "$GITHUB_REF" == "$EXPECTED_STAGING_BRANCH" ]] || {
    printf 'Git reference gate rejected: workflow must execute on %s (got: %s).\n' "$EXPECTED_STAGING_BRANCH" "$GITHUB_REF" >&2
    exit 1
  }
else
  GITHUB_REF="${GITHUB_REF:-$EXPECTED_STAGING_BRANCH}"
fi

configure_postgresql17_path
for command_name in age jq pg_dump pg_dumpall pg_restore psql sha256sum tar; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Required command is unavailable: %s\n' "$command_name" >&2
    exit 1
  }
done

VALIDATOR_PYTHON="${LARI_SOURCE_VALIDATOR_PYTHON:-python3}"
command -v "$VALIDATOR_PYTHON" >/dev/null 2>&1 || {
  printf 'Required python runtime is unavailable: %s\n' "$VALIDATOR_PYTHON" >&2
  exit 1
}

unset \
  PGAPPNAME PGCHANNELBINDING PGCLIENTENCODING PGCONNECT_TIMEOUT PGDATABASE \
  PGHOST PGHOSTADDR PGOPTIONS PGPASSFILE PGPASSWORD PGPORT PGREQUIRESSL \
  PGSERVICE PGSERVICEFILE PGSSLCERT PGSSLCRL PGSSLCRLDIR PGSSLKEY \
  PGSSLMODE PGSSLROOTCERT PGSSLSNI PGTARGETSESSIONATTRS PGUSER \
  SOURCE_DATABASE_URL

verify_postgres17_client_binaries

if [[ -n "$OFFLINE_SOURCE_FIXTURE_DIR" ]]; then
  for req_file in roles.sql database.dump source-catalog-fingerprint.json source-dependencies.json; do
    [[ -f "$OFFLINE_SOURCE_FIXTURE_DIR/$req_file" ]] || {
      printf 'Required offline fixture file is missing: %s\n' "$req_file" >&2
      exit 1
    }
    cp -- "$OFFLINE_SOURCE_FIXTURE_DIR/$req_file" "$PRIVATE_DIR/$req_file"
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
  validate_ca_root_certificate "$VALIDATOR_PYTHON"
  build_and_validate_source_database_url "$VALIDATOR_PYTHON"
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

tar -C "$PRIVATE_DIR" -czf "$PRIVATE_DIR/quarantine-bundle.tar.gz" \
  roles.sql \
  database.dump \
  archive.list \
  source-catalog-fingerprint.json \
  source-dependencies.json \
  source-roles.stderr \
  source-dump.stdout \
  source-dump.stderr \
  source-catalog-fingerprint.stderr \
  source-dependencies.stderr \
  archive-list.stderr

printf 'Encrypting the quarantine bundle before artifact publication.\n'
age \
  --recipient "$BACKUP_AGE_RECIPIENT" \
  --output "$ARTIFACT_DIR/$ENCRYPTED_NAME" \
  "$PRIVATE_DIR/quarantine-bundle.tar.gz" \
  2>"$PRIVATE_DIR/age.stderr"

rm -f -- "$PRIVATE_DIR/quarantine-bundle.tar.gz"

ENCRYPTED_SHA256="$(sha256sum "$ARTIFACT_DIR/$ENCRYPTED_NAME" | awk '{print $1}')"
ENCRYPTED_SIZE="$(stat -c %s "$ARTIFACT_DIR/$ENCRYPTED_NAME")"

# Construct private non-secret JSON evidence for capture release policy classification
cat <<EOF >"$PRIVATE_DIR/policy-evidence.json"
{
  "project": "${SOURCE_PROJECT_REF}",
  "git_ref": "${GITHUB_REF}",
  "source_sha": "${GITHUB_SHA}",
  "expected_sha": "${EXPECTED_STAGING_SHA}",
  "run_id": "${GITHUB_RUN_ID}",
  "file_name": "${ENCRYPTED_NAME}",
  "ciphertext_sha256": "${ENCRYPTED_SHA256}",
  "ciphertext_bytes": ${ENCRYPTED_SIZE},
  "encrypted_ok": true,
  "sha256_rechecked": true,
  "source_capture_ok": true,
  "restore_verdict": "RESTORE_NOT_TESTED",
  "opt_in_mode": "quarantine_opt_in",
  "owner_confirmation": "${CONFIRMATION}"
}
EOF

POLICY_OUTPUT="$("$VALIDATOR_PYTHON" scripts/backup/capture_release_policy.py "$PRIVATE_DIR/policy-evidence.json")" || {
  printf 'Capture release policy rejected the candidate artifact evidence.\n' >&2
  rm -rf -- "$ARTIFACT_DIR"
  exit 1
}

POLICY_CLASSIFICATION="$(jq -r '.classification' <<<"$POLICY_OUTPUT")"
POLICY_PUBLISH_QUARANTINE="$(jq -r '.publish_quarantine' <<<"$POLICY_OUTPUT")"
POLICY_PUBLISH_VERIFIED="$(jq -r '.publish_verified' <<<"$POLICY_OUTPUT")"
POLICY_P0_ELIGIBLE="$(jq -r '.p0_eligible' <<<"$POLICY_OUTPUT")"
POLICY_ENCRYPTED_SHA256="$(jq -r '.encrypted_sha256' <<<"$POLICY_OUTPUT")"

if [[ "$POLICY_CLASSIFICATION" != "UNVERIFIED_ENCRYPTED_CAPTURE" || \
      "$POLICY_PUBLISH_QUARANTINE" != "true" || \
      "$POLICY_PUBLISH_VERIFIED" != "false" || \
      "$POLICY_P0_ELIGIBLE" != "false" || \
      "$POLICY_ENCRYPTED_SHA256" != "$ENCRYPTED_SHA256" ]]; then
  printf 'Policy classification gate failed: expected UNVERIFIED_ENCRYPTED_CAPTURE (quarantine=true, verified=false, p0=false), got %s (quarantine=%s, verified=%s, p0=%s)\n' \
    "$POLICY_CLASSIFICATION" "$POLICY_PUBLISH_QUARANTINE" "$POLICY_PUBLISH_VERIFIED" "$POLICY_P0_ELIGIBLE" >&2
  rm -rf -- "$ARTIFACT_DIR"
  exit 1
fi

jq -n \
  --arg manifest_version "1" \
  --arg capture_scope "postgresql-logical-database-quarantine" \
  --arg classification "$POLICY_CLASSIFICATION" \
  --arg source_project_ref "$EXPECTED_PROJECT_REF" \
  --arg created_at "$CREATED_AT" \
  --arg source_revision "$GITHUB_SHA" \
  --arg run_id "$GITHUB_RUN_ID" \
  --arg encrypted_file "$ENCRYPTED_NAME" \
  --arg encrypted_sha256 "$ENCRYPTED_SHA256" \
  --argjson encrypted_size "$ENCRYPTED_SIZE" \
  '{
    manifest_version: $manifest_version,
    capture_scope: $capture_scope,
    classification: $classification,
    restore_verified: false,
    p0_eligible: false,
    source_project_ref: $source_project_ref,
    created_at_utc: $created_at,
    source_revision: $source_revision,
    run_id: $run_id,
    encrypted_capture: {
      file: $encrypted_file,
      encryption: "age X25519 recipient",
      sha256: $encrypted_sha256,
      size_bytes: $encrypted_size
    },
    restore_test: {
      verdict: "RESTORE_NOT_TESTED",
      note: "Quarantine capture lane does not verify restoration in PostgreSQL 17"
    },
    limitations: [
      "Supabase Storage object bytes are not included",
      "Supabase platform configuration, secrets, Edge Functions, and encryption root keys are not included",
      "This artifact is not a disaster-recovery certified backup",
      "This artifact is UNVERIFIED and does NOT attest to restorable database state",
      "This artifact does NOT satisfy P0 migration preconditions"
    ]
  }' >"$ARTIFACT_DIR/manifest.json"

test "$(jq -r '.encrypted_capture.sha256' "$ARTIFACT_DIR/manifest.json")" = \
  "$(sha256sum "$ARTIFACT_DIR/$ENCRYPTED_NAME" | awk '{print $1}')"
test "$(jq -r '.source_project_ref' "$ARTIFACT_DIR/manifest.json")" = "$EXPECTED_PROJECT_REF"
test "$(jq -r '.classification' "$ARTIFACT_DIR/manifest.json")" = "UNVERIFIED_ENCRYPTED_CAPTURE"
test "$(jq -r '.restore_verified' "$ARTIFACT_DIR/manifest.json")" = "false"
test "$(jq -r '.p0_eligible' "$ARTIFACT_DIR/manifest.json")" = "false"

mapfile -t ARTIFACT_FILES < <(find "$ARTIFACT_DIR" -maxdepth 1 -type f -printf '%f\n' | sort)
[[ "${#ARTIFACT_FILES[@]}" -eq 2 ]]
[[ "${ARTIFACT_FILES[0]}" == "$ENCRYPTED_NAME" || "${ARTIFACT_FILES[1]}" == "$ENCRYPTED_NAME" ]]
[[ "${ARTIFACT_FILES[0]}" == "manifest.json" || "${ARTIFACT_FILES[1]}" == "manifest.json" ]]

CAPTURE_COMPLETED_SUCCESSFULLY=1

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  printf 'classification=%s\n' "$POLICY_CLASSIFICATION" >>"$GITHUB_OUTPUT"
  printf 'publish_quarantine=true\n' >>"$GITHUB_OUTPUT"
  printf 'restore_verdict=RESTORE_NOT_TESTED\n' >>"$GITHUB_OUTPUT"
  printf 'encrypted_sha256=%s\n' "$ENCRYPTED_SHA256" >>"$GITHUB_OUTPUT"
fi

printf 'Encrypted quarantine capture prepared; classification: %s (p0_eligible: false).\n' "$POLICY_CLASSIFICATION"
