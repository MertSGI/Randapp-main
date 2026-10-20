import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// LARI — Dedicated Mandatory PostgreSQL 17.6 Role Restore Qualification Suite
// ---------------------------------------------------------------------------

console.log('='.repeat(72));
console.log('LARI — MANDATORY POSTGRESQL 17.6 ROLE RESTORE QUALIFICATION');
console.log('='.repeat(72));

// 1. Tool and Environment Resolution (Strictly Generic & Non-Machine-Specific)
const findPsql = () => {
  const candidates = [
    process.env.LARI_TEST_PSQL,
    process.env.LARI_PG17_BIN_DIR
      ? path.join(process.env.LARI_PG17_BIN_DIR, process.platform === 'win32' ? 'psql.exe' : 'psql')
      : null,
    process.platform === 'win32' ? null : '/usr/lib/postgresql/17/bin/psql',
  ];
  const found = candidates.find((c) => c && fs.existsSync(c));
  if (found) return found;

  // Check system PATH
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['psql'], {
    encoding: 'utf8',
  });
  if (probe.status === 0 && probe.stdout.trim()) {
    return probe.stdout.trim().split(/\r?\n/)[0];
  }
  return null;
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

const psqlExecutable = findPsql();
if (!psqlExecutable) {
  console.error('FATAL: PostgreSQL psql client not found.');
  console.error('Specify LARI_TEST_PSQL or LARI_PG17_BIN_DIR, or install psql in PATH.');
  process.exit(1);
}

const bashExecutable = findBash();
if (!bashExecutable) {
  console.error('FATAL: Bash executable not found.');
  console.error('Specify LARI_TEST_BASH or install Git bash in PATH.');
  process.exit(1);
}

const host = process.env.LARI_TEST_PG_HOST || '127.0.0.1';
const port = process.env.LARI_TEST_PG_PORT || '54333';
const user = process.env.LARI_TEST_PG_USER || 'supabase_admin';
const database = process.env.LARI_TEST_PG_DATABASE || 'postgres';

console.log(`psql Client:      ${psqlExecutable}`);
console.log(`Target Instance:  ${host}:${port}`);
console.log(`Superuser Role:   ${user}`);
console.log(`Database:         ${database}`);
console.log('-'.repeat(72));

// 2. Strict Server Connection & Version Verification (Mandatory & Fail-Closed)
const versionCheck = spawnSync(
  psqlExecutable,
  ['-X', '-qAt', '-h', host, '-p', port, '-U', user, '-d', database, '-c', 'SHOW server_version; SHOW server_version_num;'],
  {
    encoding: 'utf8',
    env: { ...process.env, PGCONNECT_TIMEOUT: '5' },
  }
);

if (versionCheck.status !== 0) {
  console.error(`FATAL: Connection to PostgreSQL server at ${host}:${port} as ${user} failed.`);
  console.error(`Status code: ${versionCheck.status}`);
  console.error(`Error details:\n${versionCheck.stderr || versionCheck.error}`);
  console.error('PostgreSQL 17.6 integration testing is MANDATORY. Missing server fails closed.');
  process.exit(1);
}

const versionLines = versionCheck.stdout.trim().split(/\r?\n/).filter(Boolean);
const rawServerVersion = versionLines[0] || '';
const rawServerVersionNum = versionLines[1] || '';

console.log(`Detected Engine:  PostgreSQL ${rawServerVersion} (version_num: ${rawServerVersionNum})`);

if (!rawServerVersion.startsWith('17') && !rawServerVersionNum.startsWith('17')) {
  console.error(`FATAL: PostgreSQL major version mismatch. Required: PostgreSQL 17.x (target 17.6), found: ${rawServerVersion}`);
  process.exit(1);
}

console.log('PostgreSQL 17.6 connectivity & version assertion: PASS\n');

// 3. Execution Helpers with Strict Exit Status Verification on Every Operation
const toBashPath = (filePath) => {
  if (process.platform !== 'win32') return filePath;
  const resolved = path.resolve(filePath).replace(/\\/g, '/');
  return resolved.replace(/^([A-Za-z]):\//, (_, drive) => `/${drive.toLowerCase()}/`);
};

const runPsql = (sqlOrArgs, { userOverride, stopOnError = true, input } = {}) => {
  const psqlUser = userOverride || user;
  const args = [
    '-X',
    '-h', host,
    '-p', port,
    '-U', psqlUser,
    '-d', database,
  ];
  if (stopOnError) {
    args.push('-v', 'ON_ERROR_STOP=1');
  }
  if (typeof sqlOrArgs === 'string') {
    args.push('-c', sqlOrArgs);
  } else if (Array.isArray(sqlOrArgs)) {
    args.push(...sqlOrArgs);
  }
  const result = spawnSync(psqlExecutable, args, {
    encoding: 'utf8',
    input,
    env: { ...process.env, PGCONNECT_TIMEOUT: '5' },
  });
  return result;
};

const execPsql = (sqlOrArgs, { userOverride, description } = {}) => {
  const res = runPsql(sqlOrArgs, { userOverride, stopOnError: true });
  assert.equal(
    res.status,
    0,
    `Operation failed [${description || 'SQL'}]: status=${res.status}, stderr=${res.stderr}`
  );
  return res;
};

const execPsqlExpectingFailure = (sqlOrArgs, { userOverride, description, expectedErrorPatterns = [] } = {}) => {
  const res = runPsql(sqlOrArgs, { userOverride, stopOnError: true });
  assert.notEqual(
    res.status,
    0,
    `Negative operation unexpectedly succeeded [${description}]: stdout=${res.stdout}`
  );
  for (const pattern of expectedErrorPatterns) {
    const matched = res.stderr.includes(pattern) || res.stdout.includes(pattern);
    assert.ok(
      matched,
      `Expected error in [${description}] to contain "${pattern}", but received:\n${res.stderr}`
    );
  }
  return res;
};

// 4. Pre-qualification Clean Slate
const globalTestRolesCleanupSql = `
DROP ROLE IF EXISTS authenticator;
DROP ROLE IF EXISTS anon, authenticated, dashboard_user, postgres, service_role,
                    t_anon, t_auth, t_grantor, t_admin,
                    t_rx, t_ry,
                    t_super, t_regular, t_target, t_grantee;
`;
execPsql(globalTestRolesCleanupSql, { description: 'Initial clean slate teardown' });

// ===========================================================================
// Test 1: Original Grantor Failure (Reproduction of failed run 39397783444)
// ===========================================================================
console.log('--- Test 1: Original Grantor Failure Reproduction ---');
execPsql(
  'CREATE ROLE t_admin SUPERUSER LOGIN; CREATE ROLE t_grantor; CREATE ROLE t_anon; CREATE ROLE t_auth;',
  { description: 'Setup roles for grantor failure test' }
);

const grantorFailureRes = execPsqlExpectingFailure(
  'GRANT t_anon TO t_auth GRANTED BY t_grantor;',
  {
    userOverride: 't_admin',
    description: 'Grant with unauthorized grantor lacking ADMIN option',
    expectedErrorPatterns: ['The grantor must have the ADMIN option on role "t_anon"'],
  }
);
console.log(`Observed expected PostgreSQL error: ${grantorFailureRes.stderr.trim().split(/\r?\n/)[0]}`);
execPsql(
  'DROP ROLE IF EXISTS t_anon, t_auth, t_grantor, t_admin;',
  { description: 'Teardown grantor failure test roles' }
);
console.log('Test 1 PASS: Original grantor failure faithfully reproduced on actual PG 17.6\n');

// ===========================================================================
// Test 2: Reciprocal Membership Rejection (PostgreSQL 17 Cycle Detection)
// ===========================================================================
console.log('--- Test 2: Reciprocal Membership Rejection (Cycle Detection) ---');
execPsql(
  'CREATE ROLE t_rx; CREATE ROLE t_ry; GRANT t_rx TO t_ry WITH ADMIN OPTION;',
  { description: 'Setup roles and initial non-cyclic grant' }
);

const reciprocalFailureRes = execPsqlExpectingFailure(
  'GRANT t_ry TO t_rx WITH ADMIN OPTION;',
  {
    description: 'Reciprocal grant creating circular membership',
    expectedErrorPatterns: ['is a member of role'],
  }
);
console.log(`Observed expected cycle rejection: ${reciprocalFailureRes.stderr.trim().split(/\r?\n/)[0]}`);
execPsql(
  'DROP ROLE IF EXISTS t_rx, t_ry;',
  { description: 'Teardown cycle test roles' }
);
console.log('Test 2 PASS: Reciprocal circular membership rejection verified on actual PG 17.6\n');

// ===========================================================================
// Test 3: Self-Grant and Bootstrap Superuser Behavior
// ===========================================================================
console.log('--- Test 3: Self-Grant & Bootstrap Superuser Authority ---');
execPsql(
  'CREATE ROLE t_super SUPERUSER LOGIN; CREATE ROLE t_regular LOGIN; CREATE ROLE t_target; CREATE ROLE t_grantee;',
  { description: 'Setup roles for bootstrap and self-grant authority testing' }
);

// 3a. Non-bootstrap superuser cannot grant without holding ADMIN OPTION on target
execPsqlExpectingFailure(
  'GRANT t_target TO t_grantee GRANTED BY t_super;',
  {
    userOverride: 't_super',
    description: 'Non-bootstrap superuser granting without ADMIN option',
    expectedErrorPatterns: ['The grantor must have the ADMIN option on role "t_target"'],
  }
);

// 3b. Non-bootstrap superuser cannot self-grant ADMIN OPTION
execPsqlExpectingFailure(
  'GRANT t_target TO t_super WITH ADMIN OPTION GRANTED BY t_super;',
  {
    userOverride: 't_super',
    description: 'Non-bootstrap superuser self-grant without ADMIN option',
    expectedErrorPatterns: ['The grantor must have the ADMIN option on role "t_target"'],
  }
);

// 3c. Regular user cannot self-grant
execPsqlExpectingFailure(
  'GRANT t_target TO t_regular WITH ADMIN OPTION GRANTED BY t_regular;',
  {
    userOverride: 't_regular',
    description: 'Regular user self-grant attempt',
    expectedErrorPatterns: ['permission denied'],
  }
);

// 3d. Bootstrap superuser (supabase_admin) has inherent authority to grant ADMIN OPTION
execPsql(
  'GRANT t_target TO t_super WITH ADMIN OPTION;',
  { description: 'Bootstrap superuser granting ADMIN OPTION to t_super' }
);

// 3e. Once granted ADMIN OPTION by bootstrap superuser, t_super can validly grant as grantor
execPsql(
  'GRANT t_target TO t_grantee GRANTED BY t_super;',
  {
    userOverride: 't_super',
    description: 'Delegated grant by t_super after receiving ADMIN option from bootstrap superuser',
  }
);

execPsql(
  'DROP ROLE IF EXISTS t_super, t_regular, t_target, t_grantee;',
  { description: 'Teardown self-grant & bootstrap test roles' }
);
console.log('Test 3 PASS: Self-grant restrictions and bootstrap superuser inherent authority verified\n');

// ===========================================================================
// Test 4: Faithful Role Replay via prepare_disposable_role_restore
// ===========================================================================
console.log('--- Test 4: Faithful Role Replay on Actual PG 17.6 ---');

const syntheticFixtureRolesDump = [
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

const testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), `lari-pg17-qa-${process.pid}-`));
const fixtureDumpFile = path.join(testTempDir, 'roles.sql');
const preparedRestoreFile = path.join(testTempDir, 'restore-roles.sql');
fs.writeFileSync(fixtureDumpFile, syntheticFixtureRolesDump, 'utf8');

const runnerPath = 'scripts/run-zero-cost-logical-backup.sh';
const prepEnv = {
  ...process.env,
  LARI_OFFLINE_TEST_MODE: '1',
  ...(process.platform === 'win32' ? { LARI_SOURCE_VALIDATOR_PYTHON: 'python' } : {}),
};

const prepResult = spawnSync(
  bashExecutable,
  [runnerPath, '--test-disposable-role-restore', toBashPath(fixtureDumpFile), toBashPath(preparedRestoreFile)],
  {
    cwd: process.cwd(),
    env: prepEnv,
    encoding: 'utf8',
  }
);

assert.equal(prepResult.status, 0, `Runner role restore preparation failed: ${prepResult.stderr}`);
assert.ok(fs.existsSync(preparedRestoreFile), 'Prepared restore-roles.sql file must exist');

const preparedRestoreContent = fs.readFileSync(preparedRestoreFile, 'utf8');
assert.ok(preparedRestoreContent.includes('DO $lari_role_grant_bootstrap$'), 'Prepared restore must contain cycle-checked delegation block');
assert.ok(preparedRestoreContent.includes('GRANT "anon" TO "authenticator" GRANTED BY "supabase_admin";'), 'Must preserve exact grant statement');

// Clean target roles prior to replay
execPsql(
  'DROP ROLE IF EXISTS authenticator, anon, authenticated, dashboard_user, postgres, service_role;',
  { description: 'Clean target managed roles prior to replay' }
);

// Replay prepared file into actual PostgreSQL 17.6
execPsql(
  ['-v', 'ON_ERROR_STOP=1', '-f', preparedRestoreFile],
  { description: 'Replay restore-roles.sql on actual PG 17.6' }
);

console.log('Test 4 PASS: Faithful role replay succeeded with 0 errors on actual PG 17.6\n');

// ===========================================================================
// Test 5: Synthetic Fixture Catalog Equivalence
// ===========================================================================
console.log('--- Test 5: Synthetic Fixture Catalog Equivalence ---');

const catalogQuery = `
SELECT
  count(*) AS object_count,
  md5(coalesce(string_agg(
    format('%I|%I|%I|%s', role.rolname, member.rolname, grantor.rolname, m.admin_option),
    E'\\n' ORDER BY role.rolname, member.rolname, grantor.rolname
  ), '')) AS fingerprint,
  coalesce(string_agg(
    format('%I|%I|%I|%s', role.rolname, member.rolname, grantor.rolname, m.admin_option),
    E'\\n' ORDER BY role.rolname, member.rolname, grantor.rolname
  ), '') AS rows
FROM pg_auth_members AS m
JOIN pg_roles AS role ON role.oid = m.roleid
JOIN pg_roles AS member ON member.oid = m.member
JOIN pg_roles AS grantor ON grantor.oid = m.grantor
WHERE role.rolname !~ '^pg_'
  AND member.rolname !~ '^pg_';
`;

const catalogRes = execPsql(
  ['-X', '-qAt', '-c', catalogQuery],
  { description: 'Query pg_auth_members catalog equivalence' }
);

const [objCountStr, actualFingerprint, ...rawRowData] = catalogRes.stdout.trim().split('|');
const actualRows = rawRowData.join('|').split(/\r?\n/).filter(Boolean);

const expectedMemberships = [
  'anon|authenticator|supabase_admin|f',
  'authenticated|authenticator|supabase_admin|f',
  'service_role|authenticator|supabase_admin|f',
  'supabase_admin|postgres|supabase_admin|t',
];
expectedMemberships.sort();

const expectedAggregated = expectedMemberships.join('\n');
const expectedFingerprint = createHash('md5').update(expectedAggregated).digest('hex');

console.log(`Catalog Memberships Count: ${objCountStr} (expected: 4)`);
console.log(`Catalog MD5 Fingerprint:   ${actualFingerprint}`);
console.log(`Expected MD5 Fingerprint:  ${expectedFingerprint}`);
console.log('Catalog Membership Rows:');
actualRows.forEach((r) => console.log(`  - ${r}`));

assert.equal(objCountStr, '4', 'Must contain exactly 4 non-system role memberships');
assert.equal(actualFingerprint, expectedFingerprint, 'MD5 catalog fingerprint must match synthetic fixture');
assert.deepEqual(actualRows, expectedMemberships, 'Role membership rows must match expected synthetic fixture rows');

console.log('\n[QUALIFICATION REPORT]');
console.log('STATUS: PASS');
console.log('EVALUATION LEVEL: SYNTHETIC FIXTURE EQUIVALENCE (4/4 roles)');
console.log('NOTE: Full source-to-restored catalog matching against live Supabase remains a later live acceptance requirement.');
console.log('Test 5 PASS: Synthetic fixture catalog equivalence verified on actual PG 17.6\n');

// Teardown test artifacts and roles
execPsql(
  'DROP ROLE IF EXISTS authenticator, anon, authenticated, dashboard_user, postgres, service_role;',
  { description: 'Final cleanup of restored roles' }
);
fs.rmSync(testTempDir, { recursive: true, force: true });

console.log('='.repeat(72));
console.log('ALL MANDATORY POSTGRESQL 17.6 QUALIFICATION TESTS PASSED');
console.log('='.repeat(72));
