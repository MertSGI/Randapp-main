import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
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
assert.ok(bashExecutable, 'Bash is required to execute the offline backup security tests');

const sanitizedEnvironment = (overrides = {}) => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key.startsWith('PG')
      || key.startsWith('SOURCE_DATABASE')
      || key.startsWith('SOURCE_POOLER')
      || key.startsWith('BACKUP_AGE')
      || key.startsWith('LARI_OFFLINE_TEST')
    ) {
      delete env[key];
    }
  }
  return { ...env, ...overrides };
};

const runSourceValidator = (sourceDatabaseUrl) => {
  const env = sanitizedEnvironment({ SOURCE_DATABASE_URL: sourceDatabaseUrl });
  if (process.platform === 'win32') {
    env.LARI_SOURCE_VALIDATOR_PYTHON = 'python';
  }
  return spawnSync(bashExecutable, [runnerPath, '--validate-source-url-only'], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });
};

const assertNoOutputLeak = (result, forbiddenValues, label) => {
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  for (const forbiddenValue of forbiddenValues.filter(Boolean)) {
    assert.ok(!output.includes(forbiddenValue), `${label} leaked protected connection material`);
  }
};

const approvedHost = 'aws-0-eu-central-1.pooler.supabase.com';
const approvedUser = 'postgres.rwedeejhjazwjthdjzrt';
const positiveValidatorCases = [
  {
    name: 'official-format shared Session Pooler with required TLS',
    url: `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=require`,
  },
  {
    name: 'official-format shared Session Pooler with verified TLS',
    url: `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=verify-full&sslrootcert=%2Ftmp%2Fsupabase-ca.pem`,
  },
];

const negativeValidatorCases = [
  ['lookalike pooler hostname', `postgresql://${approvedUser}@${approvedHost}.evil.example:5432/postgres?sslmode=require`],
  ['wrong username for the correct project', `postgresql://postgres@${approvedHost}:5432/postgres?sslmode=require`],
  ['another project pooler username', `postgresql://postgres.anotherprojectref123@${approvedHost}:5432/postgres?sslmode=require`],
  ['direct endpoint instead of the approved shared pooler', 'postgresql://postgres@db.rwedeejhjazwjthdjzrt.supabase.co:5432/postgres?sslmode=require'],
  ['transaction pooler port', `postgresql://${approvedUser}@${approvedHost}:6543/postgres?sslmode=require`],
  ['missing TLS requirement', `postgresql://${approvedUser}@${approvedHost}:5432/postgres`],
  ['disabled TLS', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=disable`],
  ['preferred but non-required TLS', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=prefer`],
  ['source URI containing a password', `postgresql://${approvedUser}:offline-test-password@${approvedHost}:5432/postgres?sslmode=require`],
  ['query-string host override', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=require&host=evil.example`],
  ['query-string hostaddr override', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=require&hostaddr=203.0.113.10`],
  ['query-string service override', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=require&service=evil`],
  ['query-string port override', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=require&port=5432`],
  ['query-string passfile override', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=require&passfile=%2Ftmp%2Fevil`],
  ['connection parameter injection', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=require&options=-csearch_path%3Devil`],
  ['duplicated connection parameter', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=require&sslmode=require`],
  ['conflicting connection parameters', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=require&sslmode=disable`],
  ['localhost endpoint', `postgresql://${approvedUser}@localhost:5432/postgres?sslmode=require`],
  ['non-approved external host', `postgresql://${approvedUser}@database.example.com:5432/postgres?sslmode=require`],
  ['wrong database name', `postgresql://${approvedUser}@${approvedHost}:5432/template1?sslmode=require`],
  ['malformed URL', 'this-is-not-a-postgresql-uri'],
];

for (const testCase of positiveValidatorCases) {
  const result = runSourceValidator(testCase.url);
  assert.equal(result.status, 0, `${testCase.name} must pass: ${result.stderr}`);
  assert.equal(result.stdout.trim(), 'Source database URL validation: PASS');
  assertNoOutputLeak(result, [testCase.url, approvedHost, approvedUser], testCase.name);
}

for (const [name, url] of negativeValidatorCases) {
  const result = runSourceValidator(url);
  assert.notEqual(result.status, 0, `${name} must fail closed`);
  assertNoOutputLeak(result, [url, 'offline-test-password', approvedHost, approvedUser], name);
}

let credentialTestCounter = 0;
const toBashPath = (value) => value.replaceAll('\\', '/');
const runCredentialHandling = (overrides = {}) => {
  credentialTestCounter += 1;
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), `lari-pgpass-${process.pid}-${credentialTestCounter}-`));
  const runnerTemp = path.join(testRoot, 'runner');
  const workspace = path.join(testRoot, 'workspace');
  fs.mkdirSync(runnerTemp, { mode: 0o700 });
  fs.mkdirSync(workspace, { mode: 0o700 });

  const values = {
    SOURCE_POOLER_HOST: approvedHost,
    SOURCE_DATABASE_PASSWORD: 'offline:synthetic\\credential',
    BACKUP_AGE_RECIPIENT: 'age1offlinepublicrecipientonly',
    ...overrides,
  };
  const escapedPassword = values.SOURCE_DATABASE_PASSWORD.replaceAll('\\', '\\\\').replaceAll(':', '\\:');
  const expectedPgpass = `${values.SOURCE_POOLER_HOST}:5432:postgres:${approvedUser}:${escapedPassword}\n`;
  values.LARI_EXPECTED_SOURCE_PGPASS_SHA256 = createHash('sha256').update(expectedPgpass).digest('hex');
  const env = sanitizedEnvironment({
    ...values,
    RUNNER_TEMP: toBashPath(runnerTemp),
    GITHUB_WORKSPACE: toBashPath(workspace),
    LARI_OFFLINE_TEST_MODE: '1',
  });
  if (process.platform === 'win32') {
    env.LARI_SOURCE_VALIDATOR_PYTHON = 'python';
  }

  const result = spawnSync(bashExecutable, [runnerPath, '--test-source-credential-handling'], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });
  const cleanupObserved = fs.readdirSync(runnerTemp).length === 0;
  const artifactDirectoryCreated = fs.existsSync(path.join(workspace, 'backup-artifacts'));
  fs.rmSync(testRoot, { recursive: true, force: true });
  return { result, values, cleanupObserved, artifactDirectoryCreated };
};

const successfulCredentialTest = runCredentialHandling();
assert.equal(successfulCredentialTest.result.status, 0, successfulCredentialTest.result.stderr);
assert.equal(
  successfulCredentialTest.result.stdout.trim(),
  [
    'Source credential configuration: PASS',
    'PGPASSFILE permission: PASS',
    'PGPASSFILE escaping: PASS',
    'PGPASSFILE artifact exclusion: PASS',
  ].join('\n'),
);
assert.ok(successfulCredentialTest.cleanupObserved, 'Private credential directory must be removed on normal completion');
assert.ok(!successfulCredentialTest.artifactDirectoryCreated, 'Credential handling must not place files in the artifact directory');
assertNoOutputLeak(
  successfulCredentialTest.result,
  Object.values(successfulCredentialTest.values).concat(approvedUser, 'postgresql://'),
  'successful credential handling',
);

const missingCredentialCases = [
  ['missing pooler variable', { SOURCE_POOLER_HOST: '' }],
  ['missing repository password secret', { SOURCE_DATABASE_PASSWORD: '' }],
  ['missing age recipient', { BACKUP_AGE_RECIPIENT: '' }],
];

for (const [name, overrides] of missingCredentialCases) {
  const attempt = runCredentialHandling(overrides);
  assert.notEqual(attempt.result.status, 0, `${name} must fail closed`);
  assert.ok(attempt.cleanupObserved, `${name} must clean the private temporary directory`);
  assert.ok(!attempt.artifactDirectoryCreated, `${name} must not create an artifact directory`);
  assertNoOutputLeak(attempt.result, Object.values(attempt.values).concat(approvedUser, 'postgresql://'), name);
}

const failureCredentialTest = runCredentialHandling({ LARI_OFFLINE_TEST_FAILURE: '1' });
assert.notEqual(failureCredentialTest.result.status, 0, 'Post-credential failure test must fail');
assert.ok(failureCredentialTest.cleanupObserved, 'Private credential directory must be removed after a failure');
assert.ok(!failureCredentialTest.artifactDirectoryCreated, 'Failure cleanup must not create an artifact directory');
assertNoOutputLeak(
  failureCredentialTest.result,
  Object.values(failureCredentialTest.values).concat(approvedUser, 'postgresql://'),
  'failure credential cleanup',
);

const signalCredentialTest = runCredentialHandling({ LARI_OFFLINE_TEST_SIGNAL: 'TERM' });
assert.notEqual(signalCredentialTest.result.status, 0, 'Signal cleanup test must terminate non-successfully');
assert.ok(signalCredentialTest.cleanupObserved, 'Private credential directory must be removed on a termination signal');
assert.ok(!signalCredentialTest.artifactDirectoryCreated, 'Signal cleanup must not create an artifact directory');
assertNoOutputLeak(
  signalCredentialTest.result,
  Object.values(signalCredentialTest.values).concat(approvedUser, 'postgresql://'),
  'signal credential cleanup',
);

mustContain(workflow, 'workflow_dispatch:', 'Backup workflow must be explicitly dispatched');
for (const forbiddenTrigger of ['\n  push:', '\n  pull_request:', '\n  schedule:', '\n  repository_dispatch:']) {
  assert.ok(!workflow.includes(forbiddenTrigger), `Forbidden automatic trigger: ${forbiddenTrigger.trim()}`);
}
mustContain(workflow, "inputs.confirmation == 'BACKUP rwedeejhjazwjthdjzrt'", 'Exact operator confirmation gate is required');
mustContain(workflow, "github.ref == 'refs/heads/staging/supabase-staging-consistency'", 'Execution must be bound to the verified default branch');
mustContain(workflow, 'environment: lari-staging-backup', 'Protected environment gate is required');
mustContain(workflow, '${{ secrets.STAGING_DB_PASSWORD }}', 'Existing repository password secret must be reused');
mustContain(workflow, '${{ vars.LARI_STAGING_POOLER_HOST }}', 'Session Pooler host must come from the protected environment variable');
mustContain(workflow, '${{ secrets.LARI_BACKUP_AGE_RECIPIENT }}', 'Age recipient must come from operator configuration');
assert.ok(!workflow.includes('LARI_STAGING_DATABASE_URL'), 'The missing database URL secret must no longer be referenced');
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
assert.ok(!runner.includes('PGPASSWORD='), 'The database password must not be exported as PGPASSWORD');
mustContain(runner, 'unset SOURCE_DATABASE_PASSWORD', 'The repository password must be removed from the inherited process environment');
mustContain(runner, '--validate-source-url-only', 'Source URL validation must be independently executable without a database connection');
mustContain(runner, 'build_and_validate_source_database_url python3', 'The backup path must invoke the tested source URL validator');
mustContain(runner, 'SOURCE_DATABASE_URL="postgresql://${SOURCE_DATABASE_USER}@${SOURCE_POOLER_HOST}', 'The validated source URI must remain passwordless');
mustContain(runner, 'env -i', 'PostgreSQL commands must discard inherited libpq environment overrides');
mustContain(runner, 'PGPASSFILE="$SOURCE_PGPASSFILE"', 'Source commands must use the private password file');
mustContain(runner, "trap 'terminate_on_signal 143' TERM", 'Signal cleanup must be installed');
mustContain(runner, 'run_source_postgres_command pg_dumpall', 'Role capture must use the approved source identity');
mustContain(runner, 'run_source_postgres_command pg_dump', 'Database capture must use the approved source identity');
assert.equal((runner.match(/run_source_postgres_command psql/g) || []).length, 2, 'Both source catalog queries must use the approved source identity');
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
const archiveBlock = runner.slice(runner.indexOf('tar -C "$PRIVATE_DIR"'), encryptionIndex);
assert.ok(!archiveBlock.includes('pgpass'), 'Password files must be excluded from the encrypted archive');
assert.ok(!archiveBlock.includes('database-credentials'), 'Credential directories must be excluded from the encrypted archive');

mustContain(catalog, 'pg_policy', 'Policy definitions must be fingerprinted');
mustContain(catalog, 'pg_get_functiondef', 'RPC/function definitions must be fingerprinted');
mustContain(catalog, 'relrowsecurity', 'RLS state must be fingerprinted');
mustContain(catalog, 'role_memberships', 'Role memberships must be fingerprinted');
mustContain(dependencies, "'extensions'", 'Extension dependencies must be inventoried');
mustContain(dependencies, "'non_system_roles'", 'Role dependencies must be inventoried');

mustContain(runbook, 'workflow must exist on the repository default branch', 'Default-branch dispatch constraint must be documented');
mustContain(runbook, 'repository-scoped secret has broader availability', 'Repository secret scope must be documented');
mustContain(runbook, '`LARI_STAGING_POOLER_HOST`', 'Owner pooler-host configuration must be documented');
mustContain(runbook, 'password validity remains unverified', 'Unverified password validity must be documented');
mustContain(runbook, 'private key never enters GitHub', 'Off-GitHub private-key ownership must be documented');
mustContain(runbook, 'seven days', 'GitHub artifact retention must remain documented');
mustContain(runbook, 'Supabase Storage object bytes', 'Storage object exclusion must be documented');
mustContain(runbook, 'not a verified complete Supabase platform backup', 'Completeness boundary must be documented');
mustContain(runbook, 'REMOTE_BACKUP_EXECUTED=NO', 'Current no-execution state must be explicit');

console.log(`Source database URL validator positive cases: ${positiveValidatorCases.length}/${positiveValidatorCases.length} PASS`);
console.log(`Source database URL validator negative cases: ${negativeValidatorCases.length}/${negativeValidatorCases.length} PASS`);
console.log(`Credential preflight negative cases: ${missingCredentialCases.length}/${missingCredentialCases.length} PASS`);
console.log('Source database URL validator: PASS');
console.log('Password exposure tests: PASS');
console.log('PGPASSFILE permission and escaping tests: PASS');
console.log('PGPASSFILE normal, failure, and signal cleanup tests: PASS');
console.log('PGPASSFILE artifact exclusion test: PASS');
console.log('Zero-cost backup workflow static qualification: PASS');
console.log('Remote database connections attempted: 0');
