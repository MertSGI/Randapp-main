#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

EXPECTED_PROJECT_REF="rwedeejhjazwjthdjzrt"
VALIDATE_SOURCE_URL_ONLY="--validate-source-url-only"

require_value() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    printf 'Required protected input is unavailable: %s\n' "$name" >&2
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
DIRECT_HOST = f"db.{EXPECTED_PROJECT_REF}.supabase.co"
POOLER_HOST = re.compile(r"aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com")
ALLOWED_TLS_MODES = {"require", "verify-ca", "verify-full"}
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
    reject("only the direct or Session Pooler port is allowed")
if source.password is None or source.password == "":
    reject("database password is required")

source_username = unquote(source.username or "")
if source_host == DIRECT_HOST:
    if source_username != "postgres":
        reject("direct connection identity is not approved")
elif POOLER_HOST.fullmatch(source_host):
    if source_username != f"postgres.{EXPECTED_PROJECT_REF}":
        reject("Session Pooler project identity is not approved")
else:
    reject("database host is not an approved Supabase endpoint")

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
    reject("sslmode=require or a verified mode is required")
if "sslrootcert" in query:
    if sslmode not in {"verify-ca", "verify-full"} or not query["sslrootcert"]:
        reject("sslrootcert requires a verified TLS mode")
PY
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

[[ "$#" -eq 0 ]] || {
  printf 'Unexpected command argument.\n' >&2
  exit 1
}

ARTIFACT_DIR="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}/backup-artifacts"
PRIVATE_DIR="$(mktemp -d "${RUNNER_TEMP:?RUNNER_TEMP is required}/lari-logical-backup.XXXXXX")"
CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BACKUP_ID="lari-${EXPECTED_PROJECT_REF}-${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}-${GITHUB_RUN_ATTEMPT:?GITHUB_RUN_ATTEMPT is required}"
ENCRYPTED_NAME="${BACKUP_ID}.tar.gz.age"

cleanup() {
  rm -rf -- "$PRIVATE_DIR"
}
trap cleanup EXIT

for command_name in age jq pg_dump pg_dumpall pg_restore psql sha256sum tar python3; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Required command is unavailable: %s\n' "$command_name" >&2
    exit 1
  }
done

require_value SOURCE_PROJECT_REF
require_value SOURCE_DATABASE_URL
require_value BACKUP_AGE_RECIPIENT
require_value RESTORE_DATABASE_URL

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

validate_source_database_url python3

python3 <<'PY'
import os
from urllib.parse import urlparse

source = urlparse(os.environ["SOURCE_DATABASE_URL"])
target = urlparse(os.environ["RESTORE_DATABASE_URL"])

if target.scheme not in {"postgres", "postgresql"} or target.hostname not in {"127.0.0.1", "localhost", "::1"}:
    raise SystemExit("Restore target must be a loopback PostgreSQL database.")
if source.hostname in {"127.0.0.1", "localhost", "::1"}:
    raise SystemExit("Source and disposable restore targets must be distinct.")
PY

PG_DUMP_MAJOR="$(pg_dump --version | awk '{print $3}' | cut -d. -f1)"
PG_RESTORE_MAJOR="$(pg_restore --version | awk '{print $3}' | cut -d. -f1)"
[[ "$PG_DUMP_MAJOR" == "17" && "$PG_RESTORE_MAJOR" == "17" ]] || {
  printf 'PostgreSQL 17 client binaries are required.\n' >&2
  exit 1
}

rm -rf -- "$ARTIFACT_DIR"
mkdir -p -- "$ARTIFACT_DIR"

export PGCONNECT_TIMEOUT=15

printf 'Creating the bounded logical dump without emitting database output.\n'
pg_dumpall \
  --roles-only \
  --no-role-passwords \
  --database="$SOURCE_DATABASE_URL" \
  >"$PRIVATE_DIR/roles.sql" \
  2>"$PRIVATE_DIR/source-roles.stderr"

pg_dump \
  --format=custom \
  --compress=9 \
  --lock-wait-timeout=30000 \
  --dbname="$SOURCE_DATABASE_URL" \
  --file="$PRIVATE_DIR/database.dump" \
  >"$PRIVATE_DIR/source-dump.stdout" \
  2>"$PRIVATE_DIR/source-dump.stderr"

pg_restore --list "$PRIVATE_DIR/database.dump" \
  >"$PRIVATE_DIR/archive.list" \
  2>"$PRIVATE_DIR/archive-list.stderr"

psql "$SOURCE_DATABASE_URL" \
  -X -qAt --set=ON_ERROR_STOP=1 \
  --file=scripts/backup/catalog-fingerprint.sql \
  >"$PRIVATE_DIR/source-catalog-fingerprint.json" \
  2>"$PRIVATE_DIR/source-catalog-fingerprint.stderr"

psql "$SOURCE_DATABASE_URL" \
  -X -qAt --set=ON_ERROR_STOP=1 \
  --file=scripts/backup/dependency-inventory.sql \
  >"$PRIVATE_DIR/source-dependencies.json" \
  2>"$PRIVATE_DIR/source-dependencies.stderr"

psql "$RESTORE_DATABASE_URL" \
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

SERVER_VERSION_NUM="$(psql "$RESTORE_DATABASE_URL" -X -qAt --set=ON_ERROR_STOP=1 --command='SHOW server_version_num' 2>"$PRIVATE_DIR/restore-version.stderr")"
[[ "$SERVER_VERSION_NUM" == 17* ]] || {
  printf 'Disposable restore server is not PostgreSQL 17.\n' >&2
  exit 1
}

printf 'Restoring the exact dump into disposable PostgreSQL 17.\n'
set +e
psql "$RESTORE_DATABASE_URL" \
  -X -q --set=ON_ERROR_STOP=1 \
  --file="$PRIVATE_DIR/roles.sql" \
  >"$PRIVATE_DIR/restore-roles.stdout" \
  2>"$PRIVATE_DIR/restore-roles.stderr"
ROLES_RESTORE_STATUS=$?

DATABASE_RESTORE_STATUS=1
if [[ "$ROLES_RESTORE_STATUS" -eq 0 ]]; then
  pg_restore \
    --exit-on-error \
    --single-transaction \
    --dbname="$RESTORE_DATABASE_URL" \
    "$PRIVATE_DIR/database.dump" \
    >"$PRIVATE_DIR/restore-database.stdout" \
    2>"$PRIVATE_DIR/restore-database.stderr"
  DATABASE_RESTORE_STATUS=$?
else
  : >"$PRIVATE_DIR/restore-database.stdout"
  printf 'Database restore was not attempted because the role restore failed.\n' >"$PRIVATE_DIR/restore-database.stderr"
fi
set -e

CATALOG_MATCH=false
if [[ "$ROLES_RESTORE_STATUS" -eq 0 && "$DATABASE_RESTORE_STATUS" -eq 0 ]]; then
  psql "$RESTORE_DATABASE_URL" \
    -X -qAt --set=ON_ERROR_STOP=1 \
    --file=scripts/backup/catalog-fingerprint.sql \
    >"$PRIVATE_DIR/restore-catalog-fingerprint.json" \
    2>"$PRIVATE_DIR/restore-catalog-fingerprint.stderr"
  if cmp -s "$PRIVATE_DIR/source-catalog-fingerprint.json" "$PRIVATE_DIR/restore-catalog-fingerprint.json"; then
    CATALOG_MATCH=true
  fi
else
  printf '{}\n' >"$PRIVATE_DIR/restore-catalog-fingerprint.json"
  : >"$PRIVATE_DIR/restore-catalog-fingerprint.stderr"
fi

VERDICT="NOT_RESTORABLE_IN_DISPOSABLE_POSTGRES_17"
if [[ "$ROLES_RESTORE_STATUS" -eq 0 && "$DATABASE_RESTORE_STATUS" -eq 0 && "$CATALOG_MATCH" == "true" ]]; then
  VERDICT="VERIFIED_LOGICAL_RESTORE"
fi

jq -n \
  --arg verdict "$VERDICT" \
  --argjson roles_restore_status "$ROLES_RESTORE_STATUS" \
  --argjson database_restore_status "$DATABASE_RESTORE_STATUS" \
  --argjson catalog_match "$CATALOG_MATCH" \
  --slurpfile dependency_report "$PRIVATE_DIR/dependency-report.json" \
  '{
    verdict: $verdict,
    roles_restore_exit_code: $roles_restore_status,
    database_restore_exit_code: $database_restore_status,
    catalog_fingerprint_match: $catalog_match,
    data_restore_basis: "pg_restore --exit-on-error --single-transaction",
    dependency_report: $dependency_report[0],
    diagnostic_files: [
      "source-roles.stderr",
      "source-dump.stderr",
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
  restore-report.json \
  source-roles.stderr \
  source-dump.stdout \
  source-dump.stderr \
  source-catalog-fingerprint.stderr \
  source-dependencies.stderr \
  archive-list.stderr \
  restore-version.stderr \
  restore-available-extensions.stderr \
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
  --arg encrypted_file "$ENCRYPTED_NAME" \
  --arg encrypted_sha256 "$ENCRYPTED_SHA256" \
  --argjson encrypted_size "$ENCRYPTED_SIZE" \
  --arg verdict "$VERDICT" \
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

mapfile -t ARTIFACT_FILES < <(find "$ARTIFACT_DIR" -maxdepth 1 -type f -printf '%f\n' | sort)
[[ "${#ARTIFACT_FILES[@]}" -eq 2 ]]
[[ "${ARTIFACT_FILES[0]}" == "$ENCRYPTED_NAME" || "${ARTIFACT_FILES[1]}" == "$ENCRYPTED_NAME" ]]
[[ "${ARTIFACT_FILES[0]}" == "manifest.json" || "${ARTIFACT_FILES[1]}" == "manifest.json" ]]

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  printf 'restore_verdict=%s\n' "$VERDICT" >>"$GITHUB_OUTPUT"
  printf 'encrypted_sha256=%s\n' "$ENCRYPTED_SHA256" >>"$GITHUB_OUTPUT"
fi

printf 'Encrypted logical backup prepared; restore verdict: %s.\n' "$VERDICT"
