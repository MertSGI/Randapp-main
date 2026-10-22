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
  assert.ok(typeof text === 'string' && text.includes(value), message ?? `Expected ${value}`);
};

const findBash = () => {
  const candidates = process.platform === 'win32'
    ? [
        process.env.LARI_TEST_BASH,
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
        'C:\\Program Files\\Git\\bin\\bash.exe',
      ]
    : [
        process.env.LARI_TEST_BASH,
        '/bin/bash',
        '/usr/bin/bash',
        'bash',
      ];
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
    name: 'official-format shared Session Pooler with verified system CA trust',
    url: `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=verify-full&sslrootcert=system`,
  },
  {
    name: 'official-format shared Session Pooler with verified custom CA trust',
    url: `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=verify-full&sslrootcert=%2Ftmp%2Fsupabase-ca.pem`,
  },
];

const negativeValidatorCases = [
  ['lookalike pooler hostname', `postgresql://${approvedUser}@${approvedHost}.evil.example:5432/postgres?sslmode=verify-full&sslrootcert=system`],
  ['wrong username for the correct project', `postgresql://postgres@${approvedHost}:5432/postgres?sslmode=verify-full&sslrootcert=system`],
  ['another project pooler username', `postgresql://postgres.anotherprojectref123@${approvedHost}:5432/postgres?sslmode=verify-full&sslrootcert=system`],
  ['direct endpoint instead of the approved shared pooler', 'postgresql://postgres@db.rwedeejhjazwjthdjzrt.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=system'],
  ['transaction pooler port', `postgresql://${approvedUser}@${approvedHost}:6543/postgres?sslmode=verify-full&sslrootcert=system`],
  ['missing TLS mode', `postgresql://${approvedUser}@${approvedHost}:5432/postgres`],
  ['disabled TLS mode', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=disable`],
  ['allow TLS mode', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=allow`],
  ['preferred but non-required TLS', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=prefer`],
  ['unverified required TLS downgrade', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=require`],
  ['unverified required TLS with root cert', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=require&sslrootcert=system`],
  ['verify-ca TLS downgrade without hostname verification', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=verify-ca&sslrootcert=system`],
  ['missing CA trust root certificate', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=verify-full`],
  ['empty CA trust root certificate', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=verify-full&sslrootcert=`],
  ['source URI containing a password', `postgresql://${approvedUser}:offline-test-password@${approvedHost}:5432/postgres?sslmode=verify-full&sslrootcert=system`],
  ['query-string host override', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=verify-full&sslrootcert=system&host=evil.example`],
  ['query-string hostaddr override', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=verify-full&sslrootcert=system&hostaddr=203.0.113.10`],
  ['query-string service override', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=verify-full&sslrootcert=system&service=evil`],
  ['query-string port override', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=verify-full&sslrootcert=system&port=5432`],
  ['query-string passfile override', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=verify-full&sslrootcert=system&passfile=%2Ftmp%2Fevil`],
  ['connection parameter injection', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=verify-full&sslrootcert=system&options=-csearch_path%3Devil`],
  ['duplicated connection parameter', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=verify-full&sslrootcert=system&sslmode=verify-full`],
  ['conflicting connection parameters', `postgresql://${approvedUser}@${approvedHost}:5432/postgres?sslmode=verify-full&sslrootcert=system&sslmode=disable`],
  ['localhost endpoint', `postgresql://${approvedUser}@localhost:5432/postgres?sslmode=verify-full&sslrootcert=system`],
  ['non-approved external host', `postgresql://${approvedUser}@database.example.com:5432/postgres?sslmode=verify-full&sslrootcert=system`],
  ['wrong database name', `postgresql://${approvedUser}@${approvedHost}:5432/template1?sslmode=verify-full&sslrootcert=system`],
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

const customCaFile = path.join(os.tmpdir(), `test-ca-${process.pid}.pem`);
const dummyDer = Buffer.from('offline-test-custom-ca-der-payload');
fs.writeFileSync(customCaFile, `-----BEGIN CERTIFICATE-----\n${dummyDer.toString('base64')}\n-----END CERTIFICATE-----\n`);
const customCaCredentialTest = runCredentialHandling({ SOURCE_DATABASE_SSLROOTCERT: toBashPath(customCaFile) });
fs.rmSync(customCaFile, { force: true });
assert.equal(customCaCredentialTest.result.status, 0, customCaCredentialTest.result.stderr);
assert.ok(customCaCredentialTest.cleanupObserved, 'Private credential directory must be removed after custom CA test');

const tamperedCaFile = path.join(os.tmpdir(), `supabase-tampered-ca-${process.pid}.crt`);
const tamperedDer = Buffer.from('tampered-supabase-ca-payload');
fs.writeFileSync(tamperedCaFile, `-----BEGIN CERTIFICATE-----\n${tamperedDer.toString('base64')}\n-----END CERTIFICATE-----\n`);
const tamperedCaTest = runCredentialHandling({ SOURCE_DATABASE_SSLROOTCERT: toBashPath(tamperedCaFile) });
fs.rmSync(tamperedCaFile, { force: true });
assert.notEqual(tamperedCaTest.result.status, 0, 'Tampered Supabase CA certificate must fail closed');
assert.ok(tamperedCaTest.result.stderr.includes('Configured CA root certificate fingerprint mismatch.'));
assert.ok(tamperedCaTest.cleanupObserved, 'Private credential directory must be removed after tampered CA test');

const malformedCaFile = path.join(os.tmpdir(), `malformed-ca-${process.pid}.pem`);
fs.writeFileSync(malformedCaFile, '-----BEGIN CERTIFICATE-----\nthis-is-not-valid-base64-content!!!\n-----END CERTIFICATE-----\n');
const malformedCaTest = runCredentialHandling({ SOURCE_DATABASE_SSLROOTCERT: toBashPath(malformedCaFile) });
fs.rmSync(malformedCaFile, { force: true });
assert.notEqual(malformedCaTest.result.status, 0, 'Malformed CA root certificate must fail closed');
assert.ok(malformedCaTest.result.stderr.includes('Configured CA root certificate is malformed or unreadable.'));
assert.ok(malformedCaTest.cleanupObserved, 'Private credential directory must be removed after malformed CA test');

const missingCredentialCases = [
  ['missing pooler variable', { SOURCE_POOLER_HOST: '' }],
  ['missing repository password secret', { SOURCE_DATABASE_PASSWORD: '' }],
  ['missing age recipient', { BACKUP_AGE_RECIPIENT: '' }],
  ['missing CA root certificate parameter', { SOURCE_DATABASE_SSLROOTCERT: '' }],
  ['nonexistent custom CA root certificate file', { SOURCE_DATABASE_SSLROOTCERT: '/nonexistent/supabase-ca.pem' }],
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

const runRestoreVerdictHandling = (verdict) => {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), `lari-restore-verdict-${process.pid}-`));
  const artifactDirectory = path.join(testRoot, 'backup-artifacts');
  fs.mkdirSync(artifactDirectory, { mode: 0o700 });
  fs.writeFileSync(path.join(artifactDirectory, 'synthetic.age'), 'offline-only');
  const result = spawnSync(bashExecutable, [runnerPath, '--test-restore-verdict-handling'], {
    cwd: process.cwd(),
    env: sanitizedEnvironment({
      GITHUB_WORKSPACE: toBashPath(testRoot),
      LARI_OFFLINE_TEST_MODE: '1',
      LARI_TEST_RESTORE_VERDICT: verdict,
    }),
    encoding: 'utf8',
  });
  const artifactDirectoryExists = fs.existsSync(artifactDirectory);
  fs.rmSync(testRoot, { recursive: true, force: true });
  return { result, artifactDirectoryExists };
};

const failedRestoreVerdictTest = runRestoreVerdictHandling('NOT_RESTORABLE_IN_DISPOSABLE_POSTGRES_17');
assert.notEqual(failedRestoreVerdictTest.result.status, 0, 'A failed restore verdict must fail the backup step');
assert.ok(!failedRestoreVerdictTest.artifactDirectoryExists, 'A failed restore verdict must remove upload candidates');

const verifiedRestoreVerdictTest = runRestoreVerdictHandling('VERIFIED_LOGICAL_RESTORE');
assert.equal(verifiedRestoreVerdictTest.result.status, 0, verifiedRestoreVerdictTest.result.stderr);
assert.ok(verifiedRestoreVerdictTest.artifactDirectoryExists, 'A verified restore verdict may retain upload candidates');

const toMsysPath = (p) => p.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);

const createMockPgBinaries = (targetDir, versionString, tools = ['pg_dump', 'pg_restore', 'psql', 'pg_dumpall']) => {
  fs.mkdirSync(targetDir, { recursive: true, mode: 0o755 });
  for (const tool of tools) {
    const filePath = path.join(targetDir, tool);
    const content = `#!/bin/sh\necho "${tool} (PostgreSQL) ${versionString}"\n`;
    fs.writeFileSync(filePath, content, { mode: 0o755 });
    if (process.platform === 'win32') {
      spawnSync(bashExecutable, ['-c', `chmod +x "${toMsysPath(filePath)}"`]);
    }
  }
};

const pgSelectionTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), `lari-pg-select-${process.pid}-`));
const pg17MockDir = path.join(pgSelectionTestRoot, 'pg17');
const pg16MockDir = path.join(pgSelectionTestRoot, 'pg16');
const pgIncompleteDir = path.join(pgSelectionTestRoot, 'pg-incomplete');
const pgMixedDir = path.join(pgSelectionTestRoot, 'pg-mixed');
const commonToolsDir = path.join(pgSelectionTestRoot, 'common-tools');

fs.mkdirSync(commonToolsDir, { recursive: true, mode: 0o755 });
if (process.platform === 'win32') {
  const gitUsrBin = path.join(path.dirname(bashExecutable), '..', 'usr', 'bin');
  for (const cmd of ['awk.exe', 'cut.exe']) {
    const src = path.join(gitUsrBin, cmd);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(commonToolsDir, cmd));
    }
  }
} else {
  for (const cmd of ['awk', 'cut']) {
    const src = ['/usr/bin/' + cmd, '/bin/' + cmd].find((p) => fs.existsSync(p));
    if (src) {
      try {
        fs.symlinkSync(src, path.join(commonToolsDir, cmd));
      } catch {
        fs.copyFileSync(src, path.join(commonToolsDir, cmd));
      }
    }
  }
}

createMockPgBinaries(pg17MockDir, '17.2');
createMockPgBinaries(pg16MockDir, '16.4');
createMockPgBinaries(pgIncompleteDir, '17.2', ['pg_dump']);
createMockPgBinaries(pgMixedDir, '17.2', ['pg_dump', 'psql', 'pg_dumpall']);
createMockPgBinaries(pgMixedDir, '16.4', ['pg_restore']);

const runPg17Selection = (extraEnv = {}) => {
  return spawnSync(bashExecutable, [runnerPath, '--test-pg17-client-selection'], {
    cwd: process.cwd(),
    env: sanitizedEnvironment({
      LARI_OFFLINE_TEST_MODE: '1',
      ...extraEnv,
    }),
    encoding: 'utf8',
  });
};

const positivePg17Selection = runPg17Selection({
  LARI_PG17_BIN_DIR: toMsysPath(pg17MockDir),
  PATH: `${toMsysPath(pg16MockDir)}:${toMsysPath(commonToolsDir)}:${process.env.PATH || ''}`,
});
assert.equal(positivePg17Selection.status, 0, `PG17 selection must succeed: ${positivePg17Selection.stderr}`);
mustContain(positivePg17Selection.stdout, 'PostgreSQL 17 client binary verification:');
mustContain(positivePg17Selection.stdout, 'pg_dump:');
mustContain(positivePg17Selection.stdout, '(PostgreSQL) 17.2');
mustContain(positivePg17Selection.stdout, 'PostgreSQL 17 isolated env -i execution: PASS');
mustContain(positivePg17Selection.stdout, 'PostgreSQL 17 client binary selection: PASS');
assertNoOutputLeak(positivePg17Selection, ['offline-test-password', approvedUser, 'postgresql://'], 'PG17 selection');

const pg16FailureSelection = runPg17Selection({
  PATH: `${toMsysPath(pg16MockDir)}:${toMsysPath(commonToolsDir)}`,
  LARI_PG17_BIN_DIR: '',
});
assert.notEqual(pg16FailureSelection.status, 0, 'PG16 client binaries must fail closed');
mustContain(pg16FailureSelection.stderr, 'resolved to major version 16, but PostgreSQL 17 is required');
assertNoOutputLeak(pg16FailureSelection, ['offline-test-password', approvedUser, 'postgresql://'], 'PG16 failure');

const incompletePgFailure = runPg17Selection({
  LARI_PG17_BIN_DIR: toMsysPath(pgIncompleteDir),
  PATH: `${toMsysPath(pgIncompleteDir)}:${toMsysPath(commonToolsDir)}`,
});
assert.notEqual(incompletePgFailure.status, 0, 'Incomplete client binaries must fail closed');
mustContain(incompletePgFailure.stderr, 'NOT FOUND in PATH');
assertNoOutputLeak(incompletePgFailure, ['offline-test-password', approvedUser, 'postgresql://'], 'incomplete tools');

const mixedVersionFailure = runPg17Selection({
  LARI_PG17_BIN_DIR: toMsysPath(pgMixedDir),
  PATH: `${toMsysPath(pgMixedDir)}:${toMsysPath(commonToolsDir)}`,
});
assert.notEqual(mixedVersionFailure.status, 0, 'Mixed version toolset must fail closed');
mustContain(mixedVersionFailure.stderr, 'pg_restore resolved to major version 16, but PostgreSQL 17 is required');
assertNoOutputLeak(mixedVersionFailure, ['offline-test-password', approvedUser, 'postgresql://'], 'mixed versions');

fs.rmSync(pgSelectionTestRoot, { recursive: true, force: true });

// =========================================================================
// POSTGRESQL 17.6 ROLE GRANTOR REPRODUCTION & RESOLUTION FIXTURE
// =========================================================================

class Pg17Engine {
  constructor(bootstrapSuperuser = 'supabase_admin') {
    this.currentUser = bootstrapSuperuser;
    this.roles = new Map();
    this.authMembers = [];

    this.roles.set(bootstrapSuperuser, {
      rolname: bootstrapSuperuser,
      rolsuper: true,
      rolinherit: true,
      rolcreaterole: true,
      rolcreatedb: true,
      rolcanlogin: true,
      rolreplication: true,
      rolbypassrls: true,
      rolconfig: null,
    });
  }

  isAncestor(startRole, targetRole) {
    const visited = new Set();
    const queue = [startRole];
    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr === targetRole) return true;
      if (!visited.has(curr)) {
        visited.add(curr);
        for (const m of this.authMembers) {
          if (m.member === curr && !visited.has(m.role)) {
            queue.push(m.role);
          }
        }
      }
    }
    return false;
  }

  isAdminOfRole(grantor, targetRole) {
    if (!this.roles.has(grantor) || !this.roles.has(targetRole)) {
      return false;
    }
    // In PostgreSQL 17, only the cluster bootstrap superuser (OID 10) has inherent admin option on itself
    if (grantor === this.currentUser) {
      return true;
    }
    // Non-bootstrap roles do NOT have admin on themselves and cannot self-grant
    if (grantor === targetRole) {
      return false;
    }
    return this.authMembers.some(
      (m) => m.role === targetRole && m.member === grantor && m.admin_option === true
    );
  }

  execute(sql) {
    const lines = sql.split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      i++;
      if (!line || line.startsWith('--') || line.startsWith('SET ')) {
        continue;
      }

      if (line.startsWith('DO $lari_role_init$')) {
        let blockContent = '';
        while (i < lines.length && !lines[i].includes('END $lari_role_init$;')) {
          blockContent += lines[i] + '\n';
          i++;
        }
        i++;
        const m = blockContent.match(/CREATE\s+ROLE\s+"?([A-Za-z0-9_]+)"?/i);
        if (m) {
          const roleName = m[1];
          if (!this.roles.has(roleName)) {
            this.roles.set(roleName, {
              rolname: roleName,
              rolsuper: false,
              rolinherit: true,
              rolcreaterole: false,
              rolcreatedb: false,
              rolcanlogin: false,
              rolreplication: false,
              rolbypassrls: false,
              rolconfig: null,
            });
          }
        }
        continue;
      }

      if (line.startsWith('DO $lari_role_grant_bootstrap$')) {
        let blockContent = '';
        while (i < lines.length && !lines[i].includes('END $lari_role_grant_bootstrap$;')) {
          blockContent += lines[i] + '\n';
          i++;
        }
        i++;
        this.executeBootstrapBlock(blockContent);
        continue;
      }

      const createMatch = line.match(/^CREATE\s+ROLE\s+"?([A-Za-z0-9_]+)"?;?/i);
      if (createMatch) {
        const roleName = createMatch[1];
        if (this.roles.has(roleName)) {
          throw new Error(`ERROR: role "${roleName}" already exists`);
        }
        this.roles.set(roleName, {
          rolname: roleName,
          rolsuper: false,
          rolinherit: true,
          rolcreaterole: false,
          rolcreatedb: false,
          rolcanlogin: false,
          rolreplication: false,
          rolbypassrls: false,
          rolconfig: null,
        });
        continue;
      }

      const alterMatch = line.match(/^ALTER\s+ROLE\s+"?([A-Za-z0-9_]+)"?\s+WITH\s+(.*?);?$/i);
      if (alterMatch) {
        const roleName = alterMatch[1];
        const attrs = alterMatch[2].toUpperCase();
        const role = this.roles.get(roleName);
        if (role) {
          if (attrs.includes('SUPERUSER') && !attrs.includes('NOSUPERUSER')) role.rolsuper = true;
          if (attrs.includes('NOSUPERUSER')) role.rolsuper = false;
          if (attrs.includes('CREATEROLE') && !attrs.includes('NOCREATEROLE')) role.rolcreaterole = true;
          if (attrs.includes('LOGIN') && !attrs.includes('NOLOGIN')) role.rolcanlogin = true;
          if (attrs.includes('BYPASSRLS') && !attrs.includes('NOBYPASSRLS')) role.rolbypassrls = true;
        }
        continue;
      }

      const grantMatch = line.match(/^GRANT\s+"?([A-Za-z0-9_]+)"?\s+TO\s+"?([A-Za-z0-9_]+)"?(?:\s+WITH\s+ADMIN\s+OPTION)?(?:\s+GRANTED\s+BY\s+"?([A-Za-z0-9_]+)"?)?;?$/i);
      if (grantMatch) {
        const targetRole = grantMatch[1];
        const memberRole = grantMatch[2];
        const hasAdminOption = /WITH\s+ADMIN\s+OPTION/i.test(line);
        const grantor = grantMatch[3] || this.currentUser;

        if (!this.roles.has(targetRole)) throw new Error(`ERROR: role "${targetRole}" does not exist`);
        if (!this.roles.has(memberRole)) throw new Error(`ERROR: role "${memberRole}" does not exist`);
        if (!this.roles.has(grantor)) throw new Error(`ERROR: role "${grantor}" does not exist`);

        // Membership cycle check in PG17:
        if (targetRole === memberRole || this.isAncestor(targetRole, memberRole)) {
          throw new Error(`ERROR: role "${targetRole}" is a member of role "${memberRole}"`);
        }

        // PostgreSQL 16/17 check_role_grantor validation:
        if (!this.isAdminOfRole(grantor, targetRole)) {
          throw new Error(
            `ERROR: permission denied to grant privileges as role "${grantor}"\nDETAIL: The grantor must have the ADMIN option on role "${targetRole}".`
          );
        }

        const existing = this.authMembers.find(
          (m) => m.role === targetRole && m.member === memberRole && m.grantor === grantor
        );
        if (existing) {
          existing.admin_option = existing.admin_option || hasAdminOption;
        } else {
          this.authMembers.push({
            role: targetRole,
            member: memberRole,
            grantor: grantor,
            admin_option: hasAdminOption,
          });
        }
        continue;
      }
    }
  }

  executeBootstrapBlock(blockContent) {
    const grantRegex = /GRANT\s+([A-Za-z0-9_]+)\s+TO\s+([A-Za-z0-9_]+)\s+WITH\s+ADMIN\s+OPTION\s+GRANTED\s+BY\s+current_user/gi;
    let match;
    while ((match = grantRegex.exec(blockContent)) !== null) {
      const targetRole = match[1];
      const memberRole = match[2];
      if (this.roles.has(targetRole) && this.roles.has(memberRole)) {
        if (this.isAncestor(targetRole, memberRole)) {
          throw new Error(`ERROR: role "${targetRole}" is a member of role "${memberRole}"`);
        }
        const existing = this.authMembers.find(
          (m) => m.role === targetRole && m.member === memberRole && m.grantor === this.currentUser
        );
        if (existing) {
          existing.admin_option = true;
        } else {
          this.authMembers.push({
            role: targetRole,
            member: memberRole,
            grantor: this.currentUser,
            admin_option: true,
          });
        }
      }
    }
  }

  computeRoleMembershipsFingerprint() {
    const filtered = this.authMembers.filter((m) => {
      return !m.role.startsWith('pg_') && !m.member.startsWith('pg_');
    });

    filtered.sort((a, b) => {
      const cmpRole = a.role.localeCompare(b.role);
      if (cmpRole !== 0) return cmpRole;
      const cmpMember = a.member.localeCompare(b.member);
      if (cmpMember !== 0) return cmpMember;
      return a.grantor.localeCompare(b.grantor);
    });

    const lines = filtered.map((m) => `${m.role}|${m.member}|${m.grantor}|${m.admin_option ? 't' : 'f'}`);
    const aggregated = lines.join('\n');
    const hash = createHash('md5').update(aggregated).digest('hex');

    return {
      object_count: filtered.length,
      fingerprint: hash,
      rows: lines,
    };
  }
}

const fixtureRolesSql = [
  'CREATE ROLE "anon";',
  'ALTER ROLE "anon" WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS;',
  'CREATE ROLE "authenticated";',
  'ALTER ROLE "authenticated" WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS;',
  'CREATE ROLE "authenticator";',
  'ALTER ROLE "authenticator" WITH NOSUPERUSER NOINHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS;',
  'CREATE ROLE "dashboard_user";',
  'ALTER ROLE "dashboard_user" WITH NOSUPERUSER INHERIT CREATEROLE CREATEDB NOLOGIN REPLICATION NOBYPASSRLS;',
  'CREATE ROLE "postgres";',
  'ALTER ROLE "postgres" WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS;',
  'CREATE ROLE "service_role";',
  'ALTER ROLE "service_role" WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION BYPASSRLS;',
  'CREATE ROLE "supabase_admin";',
  'ALTER ROLE "supabase_admin" WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS;',
  '-- Role memberships',
  'GRANT "anon" TO "authenticator" GRANTED BY "supabase_admin";',
  'GRANT "authenticated" TO "authenticator" GRANTED BY "supabase_admin";',
  'GRANT "service_role" TO "authenticator" GRANTED BY "supabase_admin";',
  'GRANT "supabase_admin" TO "postgres" WITH ADMIN OPTION GRANTED BY "supabase_admin";',
].join('\n');

const expectedSourceMemberships = [
  'anon|authenticator|supabase_admin|f',
  'authenticated|authenticator|supabase_admin|f',
  'service_role|authenticator|supabase_admin|f',
  'supabase_admin|postgres|supabase_admin|t',
];
expectedSourceMemberships.sort();
const expectedAggregatedSource = expectedSourceMemberships.join('\n');
const expectedSourceFingerprintResult = {
  object_count: expectedSourceMemberships.length,
  fingerprint: createHash('md5').update(expectedAggregatedSource).digest('hex'),
  rows: expectedSourceMemberships,
};

// Test 1: Reproduce actual failed run 39397783444 (un-delegated replay as non-bootstrap user fails closed)
const brokenEngine = new Pg17Engine('non_bootstrap_admin');
let reproductionError = null;
try {
  brokenEngine.execute(fixtureRolesSql);
} catch (err) {
  reproductionError = err.message;
}
assert.ok(reproductionError, 'Un-delegated restore must fail when grantor lacks ADMIN option');
mustContain(reproductionError, 'permission denied to grant privileges as role "supabase_admin"');
mustContain(reproductionError, 'The grantor must have the ADMIN option on role "anon"');

// Test 2: Reproduce controller-flagged reciprocal cycle defect
const cyclicEngine = new Pg17Engine('supabase_admin');
let cycleError = null;
try {
  cyclicEngine.execute([
    'CREATE ROLE test_role_x;',
    'CREATE ROLE test_role_y;',
    'GRANT test_role_x TO test_role_y WITH ADMIN OPTION;',
    'GRANT test_role_y TO test_role_x WITH ADMIN OPTION;',
  ].join('\n'));
} catch (err) {
  cycleError = err.message;
}
assert.ok(cycleError, 'Reciprocal circular role memberships must be rejected');
mustContain(cycleError, 'is a member of role');

// Test 3: Execute runner CLI --test-disposable-role-restore to generate restore-roles.sql
const roleRestoreTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), `lari-role-restore-${process.pid}-`));
const fixtureRolesFile = path.join(roleRestoreTestRoot, 'roles.sql');
const preparedRestoreRolesFile = path.join(roleRestoreTestRoot, 'restore-roles.sql');
fs.writeFileSync(fixtureRolesFile, fixtureRolesSql, 'utf8');

const roleRestoreCliEnv = sanitizedEnvironment({
  LARI_OFFLINE_TEST_MODE: '1',
  ...(process.platform === 'win32' ? { LARI_SOURCE_VALIDATOR_PYTHON: 'python' } : {}),
});
const roleRestoreCliResult = spawnSync(
  bashExecutable,
  [runnerPath, '--test-disposable-role-restore', toBashPath(fixtureRolesFile), toBashPath(preparedRestoreRolesFile)],
  {
    cwd: process.cwd(),
    env: roleRestoreCliEnv,
    encoding: 'utf8',
  }
);
assert.equal(roleRestoreCliResult.status, 0, `Role restore test mode must succeed: ${roleRestoreCliResult.stderr}`);
mustContain(roleRestoreCliResult.stdout, 'Disposable role restore preparation: PASS');
assert.ok(fs.existsSync(preparedRestoreRolesFile), 'Prepared restore roles file must exist');

const preparedRestoreRolesContent = fs.readFileSync(preparedRestoreRolesFile, 'utf8');
mustContain(preparedRestoreRolesContent, 'DO $lari_role_grant_bootstrap$');
mustContain(preparedRestoreRolesContent, 'GRANT "anon" TO "authenticator" GRANTED BY "supabase_admin";');
mustContain(preparedRestoreRolesContent, 'GRANT "authenticated" TO "authenticator" GRANTED BY "supabase_admin";');
mustContain(preparedRestoreRolesContent, 'GRANT "service_role" TO "authenticator" GRANTED BY "supabase_admin";');
mustContain(preparedRestoreRolesContent, 'GRANT "supabase_admin" TO "postgres" WITH ADMIN OPTION GRANTED BY "supabase_admin";');

// Test 4: Positive replay of prepared restore-roles.sql in PG17 engine (aligned bootstrap superuser)
const successEngine = new Pg17Engine('supabase_admin');
successEngine.execute(preparedRestoreRolesContent);
const restoreFingerprintResult = successEngine.computeRoleMembershipsFingerprint();
assert.equal(restoreFingerprintResult.object_count, expectedSourceFingerprintResult.object_count);
assert.equal(restoreFingerprintResult.fingerprint, expectedSourceFingerprintResult.fingerprint);
assert.deepEqual(restoreFingerprintResult.rows, expectedSourceFingerprintResult.rows);

// Test 5a: Negative test - Raw roles dump fails without idempotent preparation
const rawReplayEngine = new Pg17Engine('supabase_admin');
let rawReplayError = null;
try {
  rawReplayEngine.execute(fixtureRolesSql);
} catch (err) {
  rawReplayError = err.message;
}
assert.ok(rawReplayError, 'Raw roles.sql without preparation must fail because bootstrap superuser already exists');
mustContain(rawReplayError, 'role "supabase_admin" already exists');

// Test 5b: Negative test - Stripping GRANTED BY alters grantor attribution in catalog
const customRolesDump = [
  'CREATE ROLE "anon";',
  'CREATE ROLE "custom_grantor";',
  'CREATE ROLE "custom_member";',
  'GRANT "anon" TO "custom_grantor" WITH ADMIN OPTION;',
  'GRANT "anon" TO "custom_member" GRANTED BY "custom_grantor";',
].join('\n');
const customEngine = new Pg17Engine('supabase_admin');
customEngine.execute(customRolesDump);
const customFpOriginal = customEngine.computeRoleMembershipsFingerprint();

const strippedCustomDump = customRolesDump.replace(/\s+GRANTED\s+BY\s+"custom_grantor"/gi, '');
const strippedCustomEngine = new Pg17Engine('supabase_admin');
strippedCustomEngine.execute(strippedCustomDump);
const strippedCustomFp = strippedCustomEngine.computeRoleMembershipsFingerprint();
assert.notEqual(strippedCustomFp.fingerprint, customFpOriginal.fingerprint, 'Stripping GRANTED BY alters grantor attribution and fails catalog fingerprint equivalence');

// Test 6: Negative test - Omitted grant causes fingerprint mismatch
const omittedGrantEngine = new Pg17Engine('supabase_admin');
const omittedGrantSql = preparedRestoreRolesContent.replace(/GRANT\s+"service_role"\s+TO\s+"authenticator"\s+GRANTED\s+BY\s+"supabase_admin";\r?\n?/i, '');
assert.notEqual(omittedGrantSql, preparedRestoreRolesContent, 'Regex must successfully omit the target grant statement');
omittedGrantEngine.execute(omittedGrantSql);
const omittedFingerprintResult = omittedGrantEngine.computeRoleMembershipsFingerprint();
assert.notEqual(omittedFingerprintResult.fingerprint, expectedSourceFingerprintResult.fingerprint);
assert.equal(omittedFingerprintResult.object_count, expectedSourceFingerprintResult.object_count - 1);

// Test 7: Negative test - Missing input file for runner CLI fails closed
const missingFileResult = spawnSync(
  bashExecutable,
  [runnerPath, '--test-disposable-role-restore', '/nonexistent/roles.sql', toBashPath(preparedRestoreRolesFile)],
  {
    cwd: process.cwd(),
    env: roleRestoreCliEnv,
    encoding: 'utf8',
  }
);
assert.notEqual(missingFileResult.status, 0, 'Missing roles file must fail closed');

fs.rmSync(roleRestoreTestRoot, { recursive: true, force: true });


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
mustContain(workflow, 'supabase/postgres:17.6.1.141@sha256:ba10e934f0a59990379f78ab9ed93926f1c291dd61a12fe4026f4202f1b89770', 'Restore service must be pinned official Supabase PostgreSQL 17');
mustContain(workflow, 'POSTGRES_USER: supabase_admin', 'Disposable bootstrap role must match the source cluster bootstrap superuser');
mustContain(runner, 'RESTORE_DATABASE_USER="supabase_admin"', 'Disposable restore user must match supabase_admin');
mustContain(workflow, 'postgresql-client-17', 'PostgreSQL 17 client must be installed');
mustContain(workflow, 'echo "/usr/lib/postgresql/17/bin" >> "$GITHUB_PATH"', 'Workflow must configure GITHUB_PATH for PostgreSQL 17');
mustContain(workflow, 'export PATH="/usr/lib/postgresql/17/bin:$PATH"', 'Workflow step must prioritize PostgreSQL 17 binaries in PATH');
mustContain(workflow, 'for tool in pg_dump pg_restore psql pg_dumpall; do', 'Workflow must iterate and verify all four PostgreSQL tools');
mustContain(workflow, 'PostgreSQL 17 client binary diagnostics:', 'Workflow must emit explicit client diagnostics');
mustContain(workflow, 'timeout-minutes: 30', 'Execution must be bounded');
mustContain(workflow, 'path: backup-artifacts', 'Only the guarded artifact directory may be uploaded');
mustContain(workflow, "steps.backup.outcome == 'success'", 'Partial preparation must never upload an artifact');
mustContain(workflow, "steps.backup.outputs.restore_verdict == 'VERIFIED_LOGICAL_RESTORE'", 'Only a verified restore verdict may upload');
mustContain(workflow, 'compression-level: 0', 'GitHub must not repackage plaintext input');
mustContain(workflow, 'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683', 'Checkout action must be commit-pinned');
mustContain(workflow, 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02', 'Artifact upload action must be commit-pinned');
mustContain(workflow, 'Verify authentic Supabase Root CA certificate', 'Supabase Root CA verification step must be present');
mustContain(workflow, 'EXPECTED_FINGERPRINT="807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa"', 'Workflow must verify pinned CA fingerprint');
mustContain(workflow, 'SOURCE_DATABASE_SSLROOTCERT: scripts/backup/supabase-prod-ca-2021.crt', 'Workflow backup step must supply the verified Supabase Root CA');

assert.ok(!/AGE_(SECRET|PRIVATE|IDENTITY)|PRIVATE_KEY/i.test(workflow), 'Private age key material must never be referenced by the workflow');
assert.ok(!workflow.includes('--identity'), 'Age private identities must never be used in GitHub Actions');
assert.ok(!runner.includes('set -x'), 'Shell tracing could disclose protected values');
assert.ok(!runner.includes('PGPASSWORD='), 'The database password must not be exported as PGPASSWORD');
mustContain(runner, 'unset SOURCE_DATABASE_PASSWORD', 'The repository password must be removed from the inherited process environment');
mustContain(runner, '--validate-source-url-only', 'Source URL validation must be independently executable without a database connection');
mustContain(runner, 'build_and_validate_source_database_url python3', 'The backup path must invoke the tested source URL validator');
mustContain(runner, 'SOURCE_DATABASE_URL="postgresql://${SOURCE_DATABASE_USER}@${SOURCE_POOLER_HOST}', 'The validated source URI must remain passwordless');
mustContain(runner, 'SOURCE_DATABASE_SSLMODE="verify-full"', 'Source database TLS mode must be verify-full');
mustContain(runner, 'DEFAULT_SUPABASE_CA_FILE="scripts/backup/supabase-prod-ca-2021.crt"', 'Default Supabase CA file must be configured');
mustContain(runner, 'PINNED_SUPABASE_ROOT_CA_SHA256="807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa"', 'Pinned Supabase Root CA SHA-256 must be configured');
mustContain(runner, 'SOURCE_DATABASE_SSLROOTCERT="${SOURCE_DATABASE_SSLROOTCERT-$DEFAULT_SUPABASE_CA_FILE}"', 'Source database CA root certificate must default to authentic Supabase CA');
mustContain(runner, 'validate_ca_root_certificate', 'CA root certificate validation must be invoked');
mustContain(runner, 'require_value SOURCE_DATABASE_SSLROOTCERT', 'Source database CA root certificate must be non-empty');
mustContain(runner, 'configure_postgresql17_path', 'Runner must configure PostgreSQL 17 PATH');
mustContain(runner, 'verify_postgres17_client_binaries', 'Runner must verify PostgreSQL 17 client binaries');
mustContain(runner, 'TEST_PG17_CLIENT_SELECTION_ONLY="--test-pg17-client-selection"', 'Runner must support client selection test mode');
mustContain(runner, 'PostgreSQL 17 isolated env -i execution: PASS', 'Runner test mode must verify env -i execution');
mustContain(runner, 'env -i', 'PostgreSQL commands must discard inherited libpq environment overrides');
mustContain(runner, 'PGSSLMODE="$SOURCE_DATABASE_SSLMODE"', 'Source commands must pass PGSSLMODE');
mustContain(runner, 'PGSSLROOTCERT="$SOURCE_DATABASE_SSLROOTCERT"', 'Source commands must pass PGSSLROOTCERT');
mustContain(runner, 'PGPASSFILE="$SOURCE_PGPASSFILE"', 'Source commands must use the private password file');
assert.ok(!runner.includes('SOURCE_DATABASE_SSLMODE="require"'), 'sslmode=require must not be configured as the source database SSL mode');
assert.ok(!runner.includes('ALLOWED_TLS_MODES = {"require"'), 'require must not be an allowed TLS mode in the validator');
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
mustContain(runner, 'enforce_verified_restore', 'A failed restore verdict must terminate before upload');
mustContain(runner, 'rm -rf -- "$ARTIFACT_DIR"', 'Failed restore artifacts must be removed before upload');
mustContain(runner, 'prepare_disposable_role_restore', 'Disposable role restore preparation must be present');
mustContain(runner, 'DO $lari_role_grant_bootstrap$', 'Bootstrap delegation DO block must be configured');
mustContain(runner, 'TEST_DISPOSABLE_ROLE_RESTORE_ONLY="--test-disposable-role-restore"', 'Runner must support disposable role restore test mode');
mustContain(runner, 'prepare_disposable_role_restore "$PRIVATE_DIR/roles.sql" "$PRIVATE_DIR/restore-roles.sql"', 'Runner must prepare restore-roles.sql from roles.sql');
mustContain(runner, '--file="$PRIVATE_DIR/restore-roles.sql"', 'Disposable restore must execute restore-roles.sql');

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
mustContain(runbook, 'sslmode=verify-full', 'Runbook must document sslmode=verify-full');
mustContain(runbook, 'sslrootcert=system', 'Runbook must document sslrootcert=system');
mustContain(runbook, 'official Supabase CA certificate', 'Runbook must document the official Supabase CA certificate requirement');
mustContain(runbook, 'Disposable PostgreSQL 17 role restoration and grantor delegation', 'Runbook must document role grantor delegation');
mustContain(runbook, 'The grantor must have the ADMIN option on role', 'Runbook must document grantor error detail');
mustContain(runbook, 'restore-roles.sql', 'Runbook must document restore-roles.sql preparation');
mustContain(runbook, 'qa:disposable-pg17-role-restore', 'Runbook must document dedicated qualification command');
mustContain(runbook, 'synthetic fixture equivalence', 'Runbook must document synthetic fixture equivalence');
assert.ok(!runbook.includes('sslmode=require'), 'Runbook must not document sslmode=require');
mustContain(runbook, 'REMOTE_BACKUP_EXECUTED=NO', 'Current no-execution state must be explicit');

const packageJson = fs.readFileSync('package.json', 'utf8');
mustContain(packageJson, '"qa:disposable-pg17-role-restore"', 'package.json must configure dedicated qualification script');
mustContain(packageJson, '"test:disposable-pg17-negative"', 'package.json must configure negative qualification test script');
assert.ok(fs.existsSync('scripts/verify-disposable-pg17-role-restore.mjs'), 'Dedicated qualification script must exist');
assert.ok(fs.existsSync('scripts/test-disposable-pg17-negative.mjs'), 'Negative qualification test script must exist');

const qualificationWorkflowPath = '.github/workflows/lari-pg17-role-qualification.yml';
assert.ok(fs.existsSync(qualificationWorkflowPath), 'PR role qualification workflow must exist');
const qualWorkflow = fs.readFileSync(qualificationWorkflowPath, 'utf8');
mustContain(qualWorkflow, 'pull_request:', 'Qualification workflow must trigger on pull_request');
mustContain(qualWorkflow, 'staging/supabase-staging-consistency', 'Qualification workflow must target default base branch');
mustContain(qualWorkflow, 'ubuntu-24.04', 'Qualification workflow must run on ubuntu-24.04');
mustContain(qualWorkflow, 'npm run qa:disposable-pg17-role-restore', 'Qualification workflow must run disposable role restore QA');
mustContain(qualWorkflow, 'npm run qa:supabase-staging-consistency', 'Qualification workflow must run staging consistency QA');

const supabaseCaPath = 'scripts/backup/supabase-prod-ca-2021.crt';
assert.ok(fs.existsSync(supabaseCaPath), 'Authentic Supabase Root CA certificate file must exist');
const supabaseCaContent = fs.readFileSync(supabaseCaPath, 'utf8');
const caB64 = supabaseCaContent
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith('-----'))
  .join('');
const caDer = Buffer.from(caB64, 'base64');
const caDerSha256 = createHash('sha256').update(caDer).digest('hex');
const expectedDerSha256 = '807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa';
assert.equal(caDerSha256, expectedDerSha256, 'Supabase Root CA DER SHA-256 fingerprint must match pinned value');
const expectedFileSha256 = '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7';
const fileSha256 = createHash('sha256').update(fs.readFileSync(supabaseCaPath)).digest('hex');
assert.equal(fileSha256, expectedFileSha256, 'Supabase Root CA file SHA-256 must match official distribution');

console.log(`Source database URL validator positive cases: ${positiveValidatorCases.length}/${positiveValidatorCases.length} PASS`);
console.log(`Source database URL validator negative cases: ${negativeValidatorCases.length}/${negativeValidatorCases.length} PASS`);
console.log(`Credential preflight negative cases: ${missingCredentialCases.length}/${missingCredentialCases.length} PASS`);
console.log('Source database URL validator: PASS');
console.log('Password exposure tests: PASS');
console.log('PGPASSFILE permission and escaping tests: PASS');
console.log('PGPASSFILE normal, failure, and signal cleanup tests: PASS');
console.log('PGPASSFILE artifact exclusion test: PASS');
console.log('Failed restore publication suppression test: PASS');
console.log('Authentic Supabase Root CA certificate integrity: PASS');
console.log('Tampered CA fingerprint mismatch fail-closed test: PASS');
console.log('Malformed CA fail-closed test: PASS');
console.log('PostgreSQL 17 client binary PATH selection test: PASS');
console.log('PostgreSQL 17 client version mismatch fail-closed test: PASS');
console.log('PostgreSQL 17 missing tools fail-closed test: PASS');
console.log('PostgreSQL 17 isolated env -i execution test: PASS');
console.log('PostgreSQL 17.6 role grantor reproduction & resolution fixture: PASS');
console.log('Disposable role restore preparation test: PASS');
console.log('Zero-cost backup workflow static qualification: PASS');
console.log('Remote database connections attempted: 0');
