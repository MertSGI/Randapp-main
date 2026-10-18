import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const workflowPath = '.github/workflows/lari-zero-cost-logical-backup.yml';
const runnerPath = 'scripts/run-zero-cost-logical-backup.sh';
const catalogPath = 'scripts/backup/catalog-fingerprint.sql';
const dependencyPath = 'scripts/backup/dependency-inventory.sql';
const runbookPath = 'docs/LARI_ZERO_COST_BACKUP_RESTORE.md';

const workflow = fs.readFileSync(workflowPath, 'utf8');
const runner = fs.readFileSync(runnerPath, 'utf8');
const catalog = fs.readFileSync(catalogPath, 'utf8');
const dependencies = fs.readFileSync(dependencyPath, 'utf8');
const runbook = fs.readFileSync(runbookPath, 'utf8');

const mustContain = (text, value, message) => {
  assert.ok(text.includes(value), message ?? `Expected ${value}`);
};

const findBash = () => {
  const candidates = process.platform === 'win32'
    ? [
        process.env.LARI_TEST_BASH,
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
        'C:\\Program Files\\Git\\bin\\bash.exe',
      ]
    : [process.env.LARI_TEST_BASH, 'bash'];
  return candidates.find((candidate) => candidate && (candidate === 'bash' || fs.existsSync(candidate)));
};

const bashExecutable = findBash();
assert.ok(bashExecutable, 'Bash is required to execute the source database URL validator tests');

const runSourceValidator = (sourceDatabaseUrl) => {
  const env = { ...process.env, SOURCE_DATABASE_URL: sourceDatabaseUrl };
  if (process.platform === 'win32') {
    env.LARI_SOURCE_VALIDATOR_PYTHON = 'python';
  } else {
    delete env.LARI_SOURCE_VALIDATOR_PYTHON;
  }
  return spawnSync(bashExecutable, [runnerPath, '--validate-source-url-only'], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });
};

const positiveValidatorCases = [
  {
    name: 'direct staging endpoint with required TLS',
    url: 'postgresql://postgres:offline-test-password@db.rwedeejhjazwjthdjzrt.supabase.co:5432/postgres?sslmode=require',
  },
  {
    name: 'official-format shared Session Pooler with required TLS',
    url: 'postgresql://postgres.rwedeejhjazwjthdjzrt:offline-test-password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require',
  },
  {
    name: 'direct staging endpoint with verified TLS',
    url: 'postgresql://postgres:offline-test-password@db.rwedeejhjazwjthdjzrt.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=%2Ftmp%2Fsupabase-ca.pem',
  },
];

const negativeValidatorCases = [
  ['lookalike hostname containing project reference', 'postgresql://postgres:offline-test-password@db.rwedeejhjazwjthdjzrt.supabase.co.evil.example:5432/postgres?sslmode=require'],
  ['correct direct hostname with wrong username', 'postgresql://postgres.rwedeejhjazwjthdjzrt:offline-test-password@db.rwedeejhjazwjthdjzrt.supabase.co:5432/postgres?sslmode=require'],
  ['another project pooler username', 'postgresql://postgres.anotherprojectref123:offline-test-password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require'],
  ['missing TLS requirement', 'postgresql://postgres:offline-test-password@db.rwedeejhjazwjthdjzrt.supabase.co:5432/postgres'],
  ['disabled TLS', 'postgresql://postgres:offline-test-password@db.rwedeejhjazwjthdjzrt.supabase.co:5432/postgres?sslmode=disable'],
  ['preferred but non-required TLS', 'postgresql://postgres:offline-test-password@db.rwedeejhjazwjthdjzrt.supabase.co:5432/postgres?sslmode=prefer'],
  ['transaction pooler port', 'postgresql://postgres.rwedeejhjazwjthdjzrt:offline-test-password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require'],
  ['query-string host override', 'postgresql://postgres:offline-test-password@db.rwedeejhjazwjthdjzrt.supabase.co:5432/postgres?sslmode=require&host=evil.example'],
  ['query-string hostaddr override', 'postgresql://postgres:offline-test-password@db.rwedeejhjazwjthdjzrt.supabase.co:5432/postgres?sslmode=require&hostaddr=203.0.113.10'],
  ['query-string service override', 'postgresql://postgres:offline-test-password@db.rwedeejhjazwjthdjzrt.supabase.co:5432/postgres?sslmode=require&service=evil'],
  ['query-string port override', 'postgresql://postgres:offline-test-password@db.rwedeejhjazwjthdjzrt.supabase.co:5432/postgres?sslmode=require&port=5432'],
  ['alternate direct port', 'postgresql://postgres:offline-test-password@db.rwedeejhjazwjthdjzrt.supabase.co:5433/postgres?sslmode=require'],
  ['duplicated connection parameter', 'postgresql://postgres:offline-test-password@db.rwedeejhjazwjthdjzrt.supabase.co:5432/postgres?sslmode=require&sslmode=require'],
  ['conflicting connection parameters', 'postgresql://postgres:offline-test-password@db.rwedeejhjazwjthdjzrt.supabase.co:5432/postgres?sslmode=require&sslmode=disable'],
  ['localhost endpoint', 'postgresql://postgres:offline-test-password@localhost:5432/postgres?sslmode=require'],
  ['non-approved external host', 'postgresql://postgres:offline-test-password@database.example.com:5432/postgres?sslmode=require'],
  ['lookalike pooler hostname', 'postgresql://postgres.rwedeejhjazwjthdjzrt:offline-test-password@aws-0-eu-central-1.pooler.supabase.com.evil.example:5432/postgres?sslmode=require'],
  ['wrong database name', 'postgresql://postgres:offline-test-password@db.rwedeejhjazwjthdjzrt.supabase.co:5432/template1?sslmode=require'],
  ['malformed URL', 'this-is-not-a-postgresql-uri'],
];

for (const testCase of positiveValidatorCases) {
  const result = runSourceValidator(testCase.url);
  assert.equal(result.status, 0, `${testCase.name} must pass: ${result.stderr}`);
  assert.equal(result.stdout.trim(), 'Source database URL validation: PASS');
  assert.ok(!`${result.stdout}${result.stderr}`.includes('offline-test-password'), `${testCase.name} leaked credentials`);
}

for (const [name, url] of negativeValidatorCases) {
  const result = runSourceValidator(url);
  assert.notEqual(result.status, 0, `${name} must fail closed`);
  assert.ok(!`${result.stdout}${result.stderr}`.includes('offline-test-password'), `${name} leaked credentials`);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(url), `${name} leaked the connection string`);
}

mustContain(workflow, 'workflow_dispatch:', 'Backup workflow must be explicitly dispatched');
for (const forbiddenTrigger of ['\n  push:', '\n  pull_request:', '\n  schedule:', '\n  repository_dispatch:']) {
  assert.ok(!workflow.includes(forbiddenTrigger), `Forbidden automatic trigger: ${forbiddenTrigger.trim()}`);
}
mustContain(workflow, "inputs.confirmation == 'BACKUP rwedeejhjazwjthdjzrt'", 'Exact operator confirmation gate is required');
mustContain(workflow, "github.ref == 'refs/heads/staging/supabase-staging-consistency'", 'Execution must be bound to the verified default branch');
mustContain(workflow, 'environment: lari-staging-backup', 'Protected environment gate is required');
mustContain(workflow, '${{ secrets.LARI_STAGING_DATABASE_URL }}', 'Database URL must come from an environment secret');
mustContain(workflow, '${{ secrets.LARI_BACKUP_AGE_RECIPIENT }}', 'Age recipient must come from operator configuration');
mustContain(workflow, 'postgres:17.6-alpine', 'Restore service must be PostgreSQL 17.6');
mustContain(workflow, 'POSTGRES_USER: lari_restore_admin', 'Disposable bootstrap role must not collide with source postgres');
mustContain(workflow, 'postgresql-client-17', 'PostgreSQL 17 client must be installed');
mustContain(workflow, 'timeout-minutes: 30', 'Execution must be bounded');
mustContain(workflow, 'path: backup-artifacts', 'Only the guarded artifact directory may be uploaded');
mustContain(workflow, "steps.backup.outcome == 'success'", 'Partial preparation must never upload an artifact');
mustContain(workflow, 'compression-level: 0', 'GitHub must not repackage plaintext input');
mustContain(workflow, 'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683', 'Checkout action must be commit-pinned');
mustContain(workflow, 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02', 'Artifact upload action must be commit-pinned');

assert.ok(!/AGE_(SECRET|PRIVATE|IDENTITY)|PRIVATE_KEY/i.test(workflow), 'Private age key material must never be referenced by the workflow');
assert.ok(!workflow.includes('--identity'), 'Age private identities must never be used in GitHub Actions');
assert.ok(!runner.includes('set -x'), 'Shell tracing could disclose protected values');
mustContain(runner, '--validate-source-url-only', 'Source URL validation must be independently executable without a database connection');
mustContain(runner, 'validate_source_database_url python3', 'The backup path must invoke the tested source URL validator');
mustContain(runner, 'pg_dumpall', 'Role definitions must be captured');
mustContain(runner, '--roles-only', 'Only global role definitions are captured by pg_dumpall');
mustContain(runner, '--no-role-passwords', 'Role password hashes must not be included');
assert.match(runner, /pg_dump \\\n  --format=custom/, 'Database must use a restorable custom-format dump');
assert.match(runner, /pg_restore \\\n    --exit-on-error/, 'Restore verification must fail closed');
mustContain(runner, '--lock-wait-timeout=30000', 'Source lock waiting must be bounded');
mustContain(runner, '--single-transaction', 'Restore verification must be atomic');
assert.match(runner, /age \\\n  --recipient/, 'Encryption must use the public recipient');
mustContain(runner, 'complete_database_backup: false', 'Logical scope must not be mislabeled as a complete platform backup');
mustContain(runner, 'Supabase Storage object bytes are not included', 'Storage byte exclusion must be explicit');
mustContain(runner, 'mapfile -t ARTIFACT_FILES', 'Artifact allowlist must be enforced');

const dumpIndex = runner.search(/pg_dump \\\n  --format=custom/);
const restoreIndex = runner.search(/pg_restore \\\n    --exit-on-error/);
const encryptionIndex = runner.search(/age \\\n  --recipient/);
const manifestIndex = runner.indexOf('>"$ARTIFACT_DIR/manifest.json"');
assert.ok(dumpIndex >= 0 && dumpIndex < restoreIndex, 'The exact dump must precede restore verification');
assert.ok(restoreIndex < encryptionIndex, 'Restore verification must precede encryption');
assert.ok(encryptionIndex < manifestIndex, 'The encrypted SHA must exist before manifest creation');

mustContain(catalog, 'pg_policy', 'Policy definitions must be fingerprinted');
mustContain(catalog, 'pg_get_functiondef', 'RPC/function definitions must be fingerprinted');
mustContain(catalog, 'relrowsecurity', 'RLS state must be fingerprinted');
mustContain(catalog, 'role_memberships', 'Role memberships must be fingerprinted');
mustContain(dependencies, "'extensions'", 'Extension dependencies must be inventoried');
mustContain(dependencies, "'non_system_roles'", 'Role dependencies must be inventoried');

mustContain(runbook, 'workflow must exist on the repository default branch', 'Default-branch dispatch constraint must be documented');
mustContain(runbook, 'private key never enters GitHub', 'Off-GitHub private-key ownership must be documented');
mustContain(runbook, 'Supabase Storage object bytes', 'Storage object exclusion must be documented');
mustContain(runbook, 'not a verified complete Supabase platform backup', 'Completeness boundary must be documented');
mustContain(runbook, 'REMOTE_BACKUP_EXECUTED=NO', 'Current no-execution state must be explicit');

console.log(`Source database URL validator positive cases: ${positiveValidatorCases.length}/${positiveValidatorCases.length} PASS`);
console.log(`Source database URL validator negative cases: ${negativeValidatorCases.length}/${negativeValidatorCases.length} PASS`);
console.log('Source database URL validator: PASS');
console.log('Zero-cost backup workflow static qualification: PASS');
console.log('Remote database connections attempted: 0');
