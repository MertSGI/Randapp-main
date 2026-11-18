import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// LARI — Controller-Designed Isolated PostgreSQL 17.6 Docker Role Qualification
// ---------------------------------------------------------------------------

console.log('='.repeat(72));
console.log('LARI — POSTGRESQL 17.6 ISOLATED DOCKER CONTAINER QUALIFICATION');
console.log('='.repeat(72));

// 1. Generate unique run ID and container identifiers
const uniqueId = randomBytes(16).toString('hex');
const containerName = `lari-pg17-role-qa-${uniqueId}`;
const nonceLabel = `lari.qa.nonce=${uniqueId}`;
const disposablePassword = randomBytes(24).toString('hex');

console.log(`Run Unique ID:    ${uniqueId}`);
console.log(`Container Name:   ${containerName}`);
console.log(`Nonce Label:      ${nonceLabel}`);
console.log('-'.repeat(72));

// 2. Verify and pin Docker daemon endpoint
const dockerBin = process.env.LARI_TEST_SIMULATE_DOCKER_BIN || process.env.LARI_DOCKER_BIN || 'docker';

const endpoint = process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock';
if (process.env.DOCKER_HOST && process.env.DOCKER_HOST !== endpoint) {
  throw new Error('UNAPPROVED_DOCKER_ENDPOINT');
}
if (process.env.DOCKER_CONTEXT && process.env.DOCKER_CONTEXT !== 'default') {
  throw new Error('UNAPPROVED_DOCKER_CONTEXT');
}
const dockerEnv = { ...process.env };
delete dockerEnv.DOCKER_HOST;
delete dockerEnv.DOCKER_CONTEXT;
delete dockerEnv.DOCKER_TLS_VERIFY;
delete dockerEnv.DOCKER_CERT_PATH;
const dockerCmd = (args, options = {}) => spawnSync(dockerBin, ['-H', endpoint, ...args], {
  encoding: 'utf8',
  ...options,
  env: dockerEnv,
});

const probeDaemon = dockerCmd(['info', '--format', '{{.OperatingSystem}}'], {
  timeout: 10000,
});

if (probeDaemon.error || probeDaemon.status !== 0) {
  console.error('FATAL: Docker is not available or local daemon cannot be verified.');
  console.error(`Status code: ${probeDaemon.status}`);
  console.error(`Error details: ${probeDaemon.stderr || probeDaemon.error?.message || 'unknown'}`);
  process.exit(1);
}

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

const toBashPath = (filePath) => {
  if (process.platform !== 'win32') return filePath;
  const resolved = path.resolve(filePath).replace(/\\/g, '/');
  return resolved.replace(/^([A-Za-z]):\//, (_, drive) => `/${drive.toLowerCase()}/`);
};

let verifiedContainerId = null;

if (process.platform === 'linux') {
  if (!fs.existsSync('/var/run/docker.sock') || !fs.statSync('/var/run/docker.sock').isSocket()) {
    console.error('FATAL: /var/run/docker.sock does not exist or is not a Unix domain socket.');
    process.exit(1);
  }
}

// 3. Launch isolated container using pinned official Supabase PostgreSQL 17 image
const qualifiedImage = 'supabase/postgres:17.6.1.141@sha256:ba10e934f0a59990379f78ab9ed93926f1c291dd61a12fe4026f4202f1b89770';

console.log(`Pulling qualified Supabase PostgreSQL 17 image [${qualifiedImage}]...`);
const pullRes = dockerCmd(['pull', qualifiedImage], { timeout: 300000 });
if (pullRes.status !== 0) {
  console.error(`FATAL: Failed to pull qualified Supabase PostgreSQL 17 image: ${pullRes.stderr}`);
  process.exit(1);
}

console.log(`Launching isolated container [${containerName}]...`);
const runArgs = [
  'run',
  '--detach',
  '--rm',
  '--network', 'none',
  '--name', containerName,
  '--label', nonceLabel,
  '-e', 'POSTGRES_USER=supabase_admin',
  '-e', 'POSTGRES_DB=postgres',
  '-e', `POSTGRES_PASSWORD=${disposablePassword}`,
  qualifiedImage,
];

const runRes = dockerCmd(runArgs);
if (runRes.status !== 0 || !runRes.stdout.trim()) {
  console.error(`FATAL: Failed to launch isolated container: ${runRes.stderr}`);
  process.exit(1);
}

verifiedContainerId = runRes.stdout.trim().split(/\r?\n/)[0];
assert.match(
  verifiedContainerId,
  /^[a-f0-9]{64}$/,
  `Docker run must return full 64-character container ID, got: "${verifiedContainerId}"`
);
console.log(`Verified Container ID: ${verifiedContainerId}\n`);

// Invariant: track pre-flight completion to guard against early destructive SQL
let preflightPassed = false;

const isDestructiveSql = (sql) => {
  return /\b(CREATE\s+ROLE|DROP\s+ROLE|ALTER\s+ROLE|GRANT\s+|REVOKE\s+)\b/i.test(sql);
};

const execDockerPsql = (sql, { user = 'supabase_admin', stopOnError = true, description = 'SQL execution', isPreflight = false } = {}) => {
  if (!preflightPassed && !isPreflight && isDestructiveSql(sql)) {
    throw new Error(`BLOCKED: Destructive SQL execution disallowed before pre-flight completion [${description}]`);
  }

  const args = [
    'exec',
    '-i',
    '--user', 'postgres',
    verifiedContainerId,
    'psql',
    '-X',
  ];
  if (stopOnError) {
    args.push('-v', 'ON_ERROR_STOP=1');
  }
  args.push('-h', '/var/run/postgresql', '-U', user, '-d', 'postgres', '-f', '-');

  return dockerCmd(args, { input: sql, timeout: 30000 });
};

const execPsql = (sql, { user = 'supabase_admin', description, isPreflight = false } = {}) => {
  const res = execDockerPsql(sql, { user, stopOnError: true, description, isPreflight });
  assert.equal(
    res.status,
    0,
    `Operation failed [${description || 'SQL'}]: status=${res.status}, stderr=${res.stderr}`
  );
  return res;
};

const execPsqlExpectingFailure = (sql, { user = 'supabase_admin', description, expectedErrorPatterns = [] } = {}) => {
  const res = execDockerPsql(sql, { user, stopOnError: true, description });
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

try {
  // 4. Mandatory Pre-Flight Validation Before Destructive SQL
  console.log('--- Mandatory Pre-Flight Validation ---');

  // 4.1 Nonce label check
  const inspectLabelsRes = dockerCmd([
    'inspect',
    '--format', '{{json .Config.Labels}}',
    verifiedContainerId,
  ]);
  assert.equal(inspectLabelsRes.status, 0, 'Container inspection for labels must succeed');
  const labels = JSON.parse(inspectLabelsRes.stdout.trim() || '{}');
  const activeNonce = process.env.LARI_TEST_SIMULATE_NONCE_MISMATCH ? 'tampered-nonce' : labels['lari.qa.nonce'];
  assert.equal(activeNonce, uniqueId, `Nonce mismatch: expected ${uniqueId}, found ${activeNonce}`);

  // 4.2 Running state check
  const inspectStateRes = dockerCmd([
    'inspect',
    '--format', '{{.State.Running}}',
    verifiedContainerId,
  ]);
  assert.equal(inspectStateRes.status, 0, 'Container inspection for running state must succeed');
  assert.equal(inspectStateRes.stdout.trim(), 'true', 'Container must be actively running');

  // 4.3 PostgreSQL readiness via pg_isready inside container (up to 120s)
  console.log('Waiting for PostgreSQL inside container to be ready (up to 120s)...');
  let isReady = false;
  const startWait = Date.now();
  while (Date.now() - startWait < 120000) {
    const logsRes = dockerCmd(['logs', verifiedContainerId]);
    const logs = (logsRes.stdout || '') + (logsRes.stderr || '');

    const initComplete =
      logs.includes('PostgreSQL init process complete; ready for start up.') ||
      logs.includes('ready for start up') ||
      logs.includes('PostgreSQL Database directory appears to contain a database; Skipping initialization') ||
      (Date.now() - startWait > 30000);

    if (initComplete) {
      const readyProbe = dockerCmd([
        'exec',
        '-i',
        '--user', 'postgres',
        verifiedContainerId,
        'pg_isready',
        '-h', '/var/run/postgresql',
        '-U', 'supabase_admin',
        '-d', 'postgres',
      ]);
      if (readyProbe.status === 0) {
        const queryProbe = dockerCmd([
          'exec',
          '-i',
          '--user', 'postgres',
          verifiedContainerId,
          'psql',
          '-X',
          '-h', '/var/run/postgresql',
          '-U', 'supabase_admin',
          '-d', 'postgres',
          '-c', 'SELECT 1;',
        ], { timeout: 5000 });
        if (queryProbe.status === 0) {
          isReady = true;
          break;
        }
      }
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  assert.ok(isReady, 'PostgreSQL server inside container failed to become ready within 120s');
  console.log(`PostgreSQL is ready (${Math.round((Date.now() - startWait) / 1000)}s).`);

  // 4.4 Engine version checks
  const versionQueryRes = execPsql('\\set QUIET 1\n\\pset tuples_only on\n\\pset format unaligned\nSHOW server_version_num;\nSHOW server_version;\n', {
    user: 'supabase_admin',
    description: 'Version verification',
    isPreflight: true,
  });
  const versionLines = versionQueryRes.stdout.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const versionNum = process.env.LARI_TEST_SIMULATE_VERSION_MISMATCH
    ? '160000'
    : (versionLines.find((l) => /^\d{6}$/.test(l)) || versionLines[0]);
  const versionStr = versionLines.find((l) => /^17\.\d+/.test(l)) || versionLines.find((l) => l.includes('17.')) || '';

  console.log(`server_version_num: ${versionNum} (required: 170006)`);
  console.log(`server_version:     ${versionStr} (required: 17.6)`);

  assert.equal(versionNum, '170006', `PostgreSQL version rejection: server_version_num must be exactly 170006, got: ${versionNum}`);
  assert.ok(versionStr.includes('17.6'), `PostgreSQL version rejection: server_version must show PostgreSQL 17.6, got: ${versionStr}`);

  // 4.5 Bootstrap superuser OID 10 is supabase_admin
  const oidQueryRes = execPsql('\\set QUIET 1\n\\pset tuples_only on\n\\pset format unaligned\nSELECT rolname FROM pg_roles WHERE oid = 10;\n', {
    user: 'supabase_admin',
    description: 'OID 10 bootstrap superuser verification',
    isPreflight: true,
  });
  const oidLines = oidQueryRes.stdout.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const oidRole = oidLines.find((l) => l === 'supabase_admin') || oidLines[oidLines.length - 1];
  console.log(`OID 10 role:        ${oidRole} (required: supabase_admin)`);
  assert.equal(oidRole, 'supabase_admin', `pg_roles OID 10 must be supabase_admin, got: ${oidRole}`);

  // 4.6 Ensure local container domain socket allows trust authentication for ephemeral test users
  const hbaPathRes = execPsql('\\set QUIET 1\n\\pset tuples_only on\n\\pset format unaligned\nSHOW hba_file;\n', {
    user: 'supabase_admin',
    description: 'Query hba_file path',
    isPreflight: true,
  });
  const hbaFile = hbaPathRes.stdout.trim().split(/\r?\n/)[0].trim();
  console.log(`hba_file path: ${hbaFile}`);
  if (hbaFile) {
    const patchHbaRes = dockerCmd([
      'exec',
      '-i',
      '--user', 'postgres',
      verifiedContainerId,
      'sh',
      '-c',
      `printf 'local all all trust\\nhost all all 127.0.0.1/32 trust\\nhost all all ::1/128 trust\\n' | cat - "${hbaFile}" > "${hbaFile}.tmp" && mv "${hbaFile}.tmp" "${hbaFile}"`,
    ]);
    assert.equal(patchHbaRes.status, 0, `Failed to update pg_hba.conf: ${patchHbaRes.stderr}`);
    execPsql('SELECT pg_reload_conf();', {
      user: 'supabase_admin',
      description: 'Reload PostgreSQL configuration after pg_hba update',
      isPreflight: true,
    });
    console.log('Local container trust authentication configured and reloaded.');
  }

  preflightPassed = true;
  console.log('Pre-flight container & database verification: PASS\n');

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
      user: 't_admin',
      description: 'Grant with unauthorized grantor lacking ADMIN option',
      expectedErrorPatterns: ['The grantor must have the ADMIN option on role "t_anon"'],
    }
  );
  console.log(`Observed expected PostgreSQL error: ${grantorFailureRes.stderr.trim().split(/\r?\n/)[0]}`);
  execPsql(
    'DROP ROLE IF EXISTS t_anon, t_auth, t_grantor, t_admin;',
    { description: 'Teardown grantor failure test roles' }
  );
  console.log('Test 1 PASS: Original grantor failure faithfully reproduced on container PG 17.6\n');

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
      user: 'supabase_admin',
      description: 'Reciprocal grant creating circular membership',
      expectedErrorPatterns: ['is a member of role'],
    }
  );
  console.log(`Observed expected cycle rejection: ${reciprocalFailureRes.stderr.trim().split(/\r?\n/)[0]}`);
  execPsql(
    'DROP ROLE IF EXISTS t_rx, t_ry;',
    { description: 'Teardown cycle test roles' }
  );
  console.log('Test 2 PASS: Reciprocal circular membership rejection verified on container PG 17.6\n');

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
      user: 't_super',
      description: 'Non-bootstrap superuser granting without ADMIN option',
      expectedErrorPatterns: ['The grantor must have the ADMIN option on role "t_target"'],
    }
  );

  // 3b. Non-bootstrap superuser cannot self-grant ADMIN OPTION
  execPsqlExpectingFailure(
    'GRANT t_target TO t_super WITH ADMIN OPTION GRANTED BY t_super;',
    {
      user: 't_super',
      description: 'Non-bootstrap superuser self-grant without ADMIN option',
      expectedErrorPatterns: ['The grantor must have the ADMIN option on role "t_target"'],
    }
  );

  // 3c. Regular user cannot self-grant
  execPsqlExpectingFailure(
    'GRANT t_target TO t_regular WITH ADMIN OPTION GRANTED BY t_regular;',
    {
      user: 't_regular',
      description: 'Regular user self-grant attempt',
      expectedErrorPatterns: ['permission denied'],
    }
  );

  // 3d. Bootstrap superuser (supabase_admin) has inherent authority to grant ADMIN OPTION
  execPsql(
    'GRANT t_target TO t_super WITH ADMIN OPTION;',
    { user: 'supabase_admin', description: 'Bootstrap superuser granting ADMIN OPTION to t_super' }
  );

  // 3e. Once granted ADMIN OPTION by bootstrap superuser, t_super can validly grant as grantor
  execPsql(
    'GRANT t_target TO t_grantee GRANTED BY t_super;',
    { user: 't_super', description: 'Delegated grant by t_super after receiving ADMIN option from bootstrap superuser' }
  );

  execPsql(
    'DROP ROLE IF EXISTS t_super, t_regular, t_target, t_grantee;',
    { description: 'Teardown self-grant & bootstrap test roles' }
  );
  console.log('Test 3 PASS: Self-grant restrictions and bootstrap superuser inherent authority verified\n');

  // ===========================================================================
  // Test 4: Faithful Role Replay via prepare_disposable_role_restore
  // ===========================================================================
  console.log('--- Test 4: Faithful Role Replay on Container PG 17.6 ---');

  const syntheticFixtureRolesDump = [
    'CREATE ROLE "anon";',
    'ALTER ROLE "anon" WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS;',
    'CREATE ROLE "authenticated";',
    'ALTER ROLE "authenticated" WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS;',
    'CREATE ROLE "authenticator";',
    'ALTER ROLE "authenticator" WITH NOSUPERUSER NOINHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS;',
    'CREATE ROLE "cli_login_postgres";',
    'ALTER ROLE "cli_login_postgres" WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS;',
    'CREATE ROLE "dashboard_user";',
    'ALTER ROLE "dashboard_user" WITH NOSUPERUSER INHERIT CREATEROLE CREATEDB NOLOGIN REPLICATION NOBYPASSRLS;',
    'CREATE ROLE "pgbouncer";',
    'ALTER ROLE "pgbouncer" WITH NOSUPERUSER NOINHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS;',
    'CREATE ROLE "postgres";',
    'ALTER ROLE "postgres" WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS;',
    'CREATE ROLE "service_role";',
    'ALTER ROLE "service_role" WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION BYPASSRLS;',
    'CREATE ROLE "supabase_admin";',
    'ALTER ROLE "supabase_admin" WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS;',
    'CREATE ROLE "supabase_auth_admin";',
    'ALTER ROLE "supabase_auth_admin" WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN NOREPLICATION BYPASSRLS;',
    'CREATE ROLE "supabase_etl_admin";',
    'ALTER ROLE "supabase_etl_admin" WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS;',
    'CREATE ROLE "supabase_privileged_role";',
    'ALTER ROLE "supabase_privileged_role" WITH NOSUPERUSER NOINHERIT CREATEROLE CREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS;',
    'CREATE ROLE "supabase_read_only_user";',
    'ALTER ROLE "supabase_read_only_user" WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS;',
    'CREATE ROLE "supabase_realtime_admin";',
    'ALTER ROLE "supabase_realtime_admin" WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN NOREPLICATION BYPASSRLS;',
    'CREATE ROLE "supabase_replication_admin";',
    'ALTER ROLE "supabase_replication_admin" WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB LOGIN REPLICATION NOBYPASSRLS;',
    'CREATE ROLE "supabase_storage_admin";',
    'ALTER ROLE "supabase_storage_admin" WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN NOREPLICATION BYPASSRLS;',
    '-- Role memberships',
    'GRANT "anon" TO "authenticator" WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "anon" TO "postgres" WITH ADMIN TRUE, INHERIT TRUE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "authenticated" TO "authenticator" WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "authenticated" TO "postgres" WITH ADMIN TRUE, INHERIT TRUE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "authenticator" TO "postgres" WITH ADMIN TRUE, INHERIT TRUE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "authenticator" TO "supabase_storage_admin" WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "postgres" TO "cli_login_postgres" WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "service_role" TO "authenticator" WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "service_role" TO "postgres" WITH ADMIN TRUE, INHERIT TRUE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "supabase_privileged_role" TO "postgres" WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "supabase_privileged_role" TO "supabase_etl_admin" WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "pg_create_subscription" TO "postgres" WITH ADMIN TRUE, INHERIT TRUE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "pg_monitor" TO "postgres" WITH ADMIN TRUE, INHERIT TRUE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "pg_monitor" TO "supabase_etl_admin" WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "pg_monitor" TO "supabase_read_only_user" WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "pg_read_all_data" TO "postgres" WITH ADMIN TRUE, INHERIT TRUE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "pg_read_all_data" TO "supabase_etl_admin" WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "pg_read_all_data" TO "supabase_read_only_user" WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "pg_read_all_settings" TO "pg_monitor" WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "pg_read_all_stats" TO "pg_monitor" WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "pg_signal_backend" TO "postgres" WITH ADMIN TRUE, INHERIT TRUE, SET TRUE GRANTED BY "supabase_admin";',
    'GRANT "pg_stat_scan_tables" TO "pg_monitor" WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY "supabase_admin";',
  ].join('\n');

  const testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), `lari-role-prep-${process.pid}-`));
  const fixtureDumpFile = path.join(testTempDir, 'roles.sql');
  const preparedRestoreFile = path.join(testTempDir, 'restore-roles.sql');
  fs.writeFileSync(fixtureDumpFile, syntheticFixtureRolesDump, 'utf8');

  const bashExecutable = findBash();
  assert.ok(bashExecutable, 'Bash is required for runner script role preparation');
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
  const preparedRestoreContent = fs.readFileSync(preparedRestoreFile, 'utf8');
  fs.rmSync(testTempDir, { recursive: true, force: true });

  assert.ok(preparedRestoreContent.includes('DO $lari_role_grant_bootstrap$'), 'Prepared restore must contain cycle-checked delegation block');
  assert.ok(preparedRestoreContent.includes('GRANT "anon" TO "authenticator" WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY "supabase_admin";'), 'Must preserve exact grant statement');

  // Reset role memberships prior to replay inside container
  execPsql(
    `DO $lari_clean$
    DECLARE
      rec RECORD;
    BEGIN
      FOR rec IN (
        SELECT role.rolname AS role_name, member.rolname AS member_name
        FROM pg_auth_members m
        JOIN pg_roles role ON role.oid = m.roleid
        JOIN pg_roles member ON member.oid = m.member
        WHERE member.rolname !~ '^pg_'
      ) LOOP
        EXECUTE format('REVOKE %I FROM %I CASCADE', rec.role_name, rec.member_name);
      END LOOP;
    END $lari_clean$;`,
    { description: 'Reset role memberships prior to replay' }
  );

  // Send content strictly via stdin to psql -f - inside container
  execPsql(preparedRestoreContent, {
    user: 'supabase_admin',
    description: 'Replay restore-roles.sql via stdin into container PG 17.6',
  });

  console.log('Test 4 PASS: Faithful role replay succeeded with 0 errors on container PG 17.6\n');

  // ===========================================================================
  // Test 5: Synthetic Fixture Catalog Equivalence
  // ===========================================================================
  console.log('--- Test 5: Synthetic Fixture Catalog Equivalence ---');

  const catalogQuery = `
  SELECT
    count(*) AS object_count,
    md5(coalesce(string_agg(
      format('%I|%I|%I|%s|%s|%s', role.rolname, member.rolname, grantor.rolname, m.admin_option, m.inherit_option, m.set_option),
      E'\\n' ORDER BY role.rolname, member.rolname, grantor.rolname
    ), '')) AS fingerprint,
    coalesce(string_agg(
      format('%I|%I|%I|%s|%s|%s', role.rolname, member.rolname, grantor.rolname, m.admin_option, m.inherit_option, m.set_option),
      E'\\n' ORDER BY role.rolname, member.rolname, grantor.rolname
    ), '') AS rows
  FROM pg_auth_members AS m
  JOIN pg_roles AS role ON role.oid = m.roleid
  JOIN pg_roles AS member ON member.oid = m.member
  JOIN pg_roles AS grantor ON grantor.oid = m.grantor;
  `;

  const catalogRes = execPsql('\\set QUIET 1\n\\pset tuples_only on\n\\pset format unaligned\n\\pset fieldsep \'|\'\n' + catalogQuery, {
    user: 'supabase_admin',
    description: 'Query pg_auth_members catalog equivalence',
  });

  const lines = catalogRes.stdout.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const headerLine = lines.find((l) => /^\d+\|[a-f0-9]{32}\|/.test(l));
  assert.ok(headerLine, `Catalog output must contain count and fingerprint: ${catalogRes.stdout}`);

  const headerIdx = lines.indexOf(headerLine);
  const parts = headerLine.split('|');
  const objCountStr = parts[0];
  const actualFingerprint = parts[1];
  const firstRow = parts.slice(2).join('|');
  const actualRows = [firstRow, ...lines.slice(headerIdx + 1)].filter(Boolean);

  const expectedMemberships = [
    'anon|authenticator|supabase_admin|f|f|t',
    'anon|postgres|supabase_admin|t|t|t',
    'authenticated|authenticator|supabase_admin|f|f|t',
    'authenticated|postgres|supabase_admin|t|t|t',
    'authenticator|postgres|supabase_admin|t|t|t',
    'authenticator|supabase_storage_admin|supabase_admin|f|f|t',
    'pg_create_subscription|postgres|supabase_admin|t|t|t',
    'pg_monitor|postgres|supabase_admin|t|t|t',
    'pg_monitor|supabase_etl_admin|supabase_admin|f|t|t',
    'pg_monitor|supabase_read_only_user|supabase_admin|f|t|t',
    'pg_read_all_data|postgres|supabase_admin|t|t|t',
    'pg_read_all_data|supabase_etl_admin|supabase_admin|f|t|t',
    'pg_read_all_data|supabase_read_only_user|supabase_admin|f|t|t',
    'pg_read_all_settings|pg_monitor|supabase_admin|f|t|t',
    'pg_read_all_stats|pg_monitor|supabase_admin|f|t|t',
    'pg_signal_backend|postgres|supabase_admin|t|t|t',
    'pg_stat_scan_tables|pg_monitor|supabase_admin|f|t|t',
    'postgres|cli_login_postgres|supabase_admin|f|f|t',
    'service_role|authenticator|supabase_admin|f|f|t',
    'service_role|postgres|supabase_admin|t|t|t',
    'supabase_privileged_role|postgres|supabase_admin|f|t|t',
    'supabase_privileged_role|supabase_etl_admin|supabase_admin|f|t|t',
  ];
  expectedMemberships.sort();

  const expectedAggregated = expectedMemberships.join('\n');
  const expectedFingerprint = createHash('md5').update(expectedAggregated).digest('hex');

  console.log(`Catalog Memberships Count: ${objCountStr} (expected: 22)`);
  console.log(`Catalog MD5 Fingerprint:   ${actualFingerprint}`);
  console.log(`Expected MD5 Fingerprint:  ${expectedFingerprint}`);
  console.log('Catalog Membership Rows:');
  actualRows.forEach((r) => console.log(`  - ${r}`));

  if (process.env.LARI_TEST_SIMULATE_CATALOG_MISMATCH) {
    throw new Error('Catalog mismatch: simulated fingerprint or role membership mismatch');
  }

  assert.equal(objCountStr, '22', 'Catalog mismatch: must contain exactly 22 role memberships');
  assert.equal(actualFingerprint, expectedFingerprint, 'Catalog mismatch: MD5 catalog fingerprint must match synthetic fixture');
  assert.deepEqual(actualRows, expectedMemberships, 'Catalog mismatch: role membership rows must match expected synthetic fixture rows');

  console.log('Test 5 PASS: Synthetic fixture catalog equivalence verified on container PG 17.6\n');

  // ===========================================================================
  // Test 6: Official Supabase Extension Qualification (supabase_vault)
  // ===========================================================================
  console.log('--- Test 6: Official Supabase Extension Qualification ---');

  // 6a. Verify supabase_vault presence in pg_available_extensions
  const extAvailRes = execPsql(
    "\\set QUIET 1\n\\pset tuples_only on\n\\pset format unaligned\nSELECT default_version FROM pg_available_extensions WHERE name = 'supabase_vault';",
    { user: 'supabase_admin', description: 'Query supabase_vault availability in pg_available_extensions' }
  );
  const vaultVersion = extAvailRes.stdout.trim();
  console.log(`Available supabase_vault default version: ${vaultVersion}`);
  assert.ok(vaultVersion.length > 0, 'supabase_vault extension must be available in official Supabase PG17 container');

  // 6b. Real extension creation in dedicated schema
  execPsql(
    'CREATE SCHEMA IF NOT EXISTS vault; CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;',
    { user: 'supabase_admin', description: 'Create supabase_vault extension in schema vault' }
  );

  // 6c. Verify extension installation in pg_extension
  const extInstalledRes = execPsql(
    "\\set QUIET 1\n\\pset tuples_only on\n\\pset format unaligned\nSELECT extname, extversion FROM pg_extension WHERE extname = 'supabase_vault';",
    { user: 'supabase_admin', description: 'Verify supabase_vault installed in pg_extension' }
  );
  const installedInfo = extInstalledRes.stdout.trim();
  console.log(`Installed extension info: ${installedInfo}`);
  assert.ok(installedInfo.startsWith('supabase_vault|'), `supabase_vault must be present in pg_extension, got: ${installedInfo}`);

  // 6d. Fail-closed verification: attempting to create a non-existent or fake extension fails closed
  execPsqlExpectingFailure(
    'CREATE EXTENSION nonexistent_fake_extension_failclosed;',
    { user: 'supabase_admin', description: 'Nonexistent extension creation rejection', expectedErrorPatterns: ['extension "nonexistent_fake_extension_failclosed" is not available'] }
  );

  // 6e. Clean up qualified test extension
  execPsql(
    'DROP EXTENSION IF EXISTS supabase_vault CASCADE; DROP SCHEMA IF EXISTS vault CASCADE;',
    { user: 'supabase_admin', description: 'Teardown qualified test extension and schema' }
  );

  console.log('Test 6 PASS: Real supabase_vault extension creation and fail-closed unknown extension rejection verified on container PG 17.6\n');

  // -------------------------------------------------------------------------
  // Test 7: Fail-Closed FIFO Snapshot Bound Capture on Linux PostgreSQL 17.6
  // -------------------------------------------------------------------------
  if (process.platform === 'linux') {
    console.log('--- Test 7: Fail-Closed FIFO Snapshot Export & Import on PG 17.6 ---');
    const bashExec = findBash();
    assert.ok(bashExec, 'Bash must be available for FIFO snapshot flow verification');

    const snapNonce = `${uniqueId}-snap`;
    const snapContainerName = `lari-pg17-snap-qa-${uniqueId}`;
    const snapRoot = fs.mkdtempSync(path.join(os.tmpdir(), `lari-snap-flow-${uniqueId.slice(0, 8)}-`));
    let snapContainerId = null;

    const runSnapshotFlowCase = (port, overrides = {}) => {
      const caseDir = fs.mkdtempSync(path.join(snapRoot, 'case-'));
      const runnerTemp = path.join(caseDir, 'runner');
      const workspace = path.join(caseDir, 'workspace');
      const existingArtifactDir = path.join(workspace, 'backup-artifacts');
      fs.mkdirSync(runnerTemp, { recursive: true, mode: 0o700 });
      fs.mkdirSync(existingArtifactDir, { recursive: true, mode: 0o700 });
      const sentinelPath = path.join(existingArtifactDir, 'existing-backup.sentinel');
      fs.writeFileSync(sentinelPath, 'keep-existing-backup', 'utf8');

      const caseEnv = {
        ...process.env,
        RUNNER_TEMP: toBashPath(runnerTemp),
        GITHUB_WORKSPACE: toBashPath(workspace),
        LARI_OFFLINE_TEST_MODE: '1',
        LARI_TEST_SOURCE_HOST: '127.0.0.1',
        LARI_TEST_SOURCE_PORT: String(port),
        LARI_TEST_SOURCE_DB: 'postgres',
        LARI_TEST_SOURCE_USER: 'supabase_admin',
        LARI_TEST_SOURCE_PASSWORD: disposablePassword,
        ...overrides,
      };
      const startedAt = Date.now();
      const res = spawnSync(
        bashExec,
        ['scripts/run-zero-cost-logical-backup.sh', '--test-source-snapshot-flow'],
        { cwd: process.cwd(), env: caseEnv, encoding: 'utf8', timeout: 60000 }
      );
      return { res, artifactDir: existingArtifactDir, sentinelPath, elapsedMs: Date.now() - startedAt };
    };

    const assertPreservedBackupDir = (caseResult, label) => {
      assert.ok(fs.existsSync(caseResult.sentinelPath), `${label}: existing backup sentinel must not be deleted`);
      assert.equal(fs.readFileSync(caseResult.sentinelPath, 'utf8'), 'keep-existing-backup', `${label}: existing backup sentinel must be untouched`);
      assert.deepEqual(fs.readdirSync(caseResult.artifactDir), ['existing-backup.sentinel'], `${label}: no test files or artifacts may be written into backup-artifacts`);
    };

    try {
      const snapRunRes = dockerCmd([
        'run',
        '--detach',
        '--rm',
        '--name', snapContainerName,
        '--label', `lari.qa.nonce=${snapNonce}`,
        '-p', '127.0.0.1:0:5432',
        '-e', 'POSTGRES_USER=supabase_admin',
        '-e', 'POSTGRES_DB=postgres',
        '-e', `POSTGRES_PASSWORD=${disposablePassword}`,
        qualifiedImage,
      ]);
      assert.equal(snapRunRes.status, 0, `Snapshot test container launch failed: ${snapRunRes.stderr}`);
      snapContainerId = snapRunRes.stdout.trim().split(/\r?\n/)[0];
      assert.match(snapContainerId, /^[a-f0-9]{64}$/, 'Snapshot container must return 64-char ID');

      const portRes = dockerCmd(['port', snapContainerId, '5432/tcp']);
      assert.equal(portRes.status, 0, `Failed to inspect published loopback port: ${portRes.stderr}`);
      const portMatch = portRes.stdout.trim().match(/127\.0\.0\.1:(\d+)/);
      assert.ok(portMatch, `Snapshot container port must bind strictly to 127.0.0.1, got: ${portRes.stdout}`);
      const snapPort = Number(portMatch[1]);

      let ready = false;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const probe = dockerCmd([
          'exec', '--user', 'postgres', snapContainerId,
          'pg_isready', '-h', '127.0.0.1', '-p', '5432', '-U', 'supabase_admin', '-d', 'postgres',
        ]);
        if (probe.status === 0) {
          ready = true;
          break;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
      }
      assert.ok(ready, 'Snapshot PG 17.6 container failed to become ready');

      const seedRes = dockerCmd([
        'exec', '-i', '--user', 'postgres', snapContainerId,
        'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-h', '/var/run/postgresql', '-U', 'supabase_admin', '-d', 'postgres',
      ], {
        input: 'CREATE TABLE IF NOT EXISTS public.lari_snapshot_probe (id integer PRIMARY KEY, note text);\nINSERT INTO public.lari_snapshot_probe (id, note) VALUES (1, \'ok\') ON CONFLICT DO NOTHING;\n',
        timeout: 15000,
      });
      assert.equal(seedRes.status, 0, `Failed seeding snapshot probe table: ${seedRes.stderr}`);

      // 7a. Positive: FIFO snapshot export + pg_dump --snapshot + catalog-fingerprint.sql
      const pos = runSnapshotFlowCase(snapPort);
      assert.equal(
        pos.res.status,
        0,
        `Positive FIFO snapshot flow must succeed: stdout=${pos.res.stdout}\nstderr=${pos.res.stderr}`
      );
      assert.ok(pos.res.stdout.includes('Snapshot-bound source capture: PASS'), 'Must emit PASS marker');
      const receiptLine = (pos.res.stdout || '').split(/\r?\n/).find((line) => line.startsWith('SNAPSHOT_TEST_RECEIPT='));
      assert.ok(receiptLine, 'Positive test must emit SNAPSHOT_TEST_RECEIPT on stdout');
      const receipt = JSON.parse(receiptLine.slice('SNAPSHOT_TEST_RECEIPT='.length));
      assert.equal(receipt.snapshot_bound, true, 'Snapshot receipt must confirm SOURCE_SNAPSHOT_BOUND=true');
      assert.ok(receipt.tables_count >= 1, `Expected >= 1 fingerprinted table, got ${receipt.tables_count}`);
      assertPreservedBackupDir(pos, 'Test 7a positive');

      // 7b. Negative: Fail-closed on pg_export_snapshot() failure -> zero artifacts
      const negExport = runSnapshotFlowCase(snapPort, { LARI_TEST_SIMULATE_SNAPSHOT_EXPORT_FAIL: '1' });
      assert.notEqual(negExport.res.status, 0, 'Snapshot export failure must exit non-zero');
      assert.ok(
        (negExport.res.stderr || '').includes('SNAPSHOT_EXPORT_FAILED'),
        `Snapshot export failure must emit SNAPSHOT_EXPORT_FAILED telemetry, got: ${negExport.res.stderr}`
      );
      assertPreservedBackupDir(negExport, 'Test 7b export fail');

      // 7c. Negative: Fail-closed on pg_dump --snapshot failure (invalid snapshot ID) -> zero artifacts, no fallback
      const negImport = runSnapshotFlowCase(snapPort, { LARI_TEST_OVERRIDE_SNAPSHOT_ID: '00000000-00000000-1' });
      assert.notEqual(negImport.res.status, 0, 'Invalid --snapshot import failure must exit non-zero');
      assert.ok(
        (negImport.res.stderr || '').includes('SNAPSHOT_IMPORT_FAILED'),
        `Invalid --snapshot failure must emit SNAPSHOT_IMPORT_FAILED telemetry, got: ${negImport.res.stderr}`
      );
      assertPreservedBackupDir(negImport, 'Test 7c import fail');

      // 7d. Negative: Bounded session timeout when FIFO peer never opens opposite end -> terminates and produces zero artifacts
      const negFifoBlock = runSnapshotFlowCase(snapPort, {
        LARI_TEST_SIMULATE_FIFO_UNOPENED_PEER: '1',
        LARI_TEST_SNAPSHOT_SESSION_TIMEOUT_SECONDS: '2',
      });
      assert.notEqual(negFifoBlock.res.status, 0, 'Unopened FIFO peer timeout must exit non-zero');
      assert.ok(
        (negFifoBlock.res.stderr || '').includes('exceeded overall 2s timeout') &&
        (negFifoBlock.res.stderr || '').includes('SNAPSHOT_EXPORT_FAILED'),
        `Unopened FIFO peer must trigger bounded session timeout and SNAPSHOT_EXPORT_FAILED, got: ${negFifoBlock.res.stderr}`
      );
      assert.ok(negFifoBlock.elapsedMs < 15000, `Session timeout test took too long (${negFifoBlock.elapsedMs}ms)`);
      assertPreservedBackupDir(negFifoBlock, 'Test 7d unopened FIFO peer');

      // 7e. Negative: Live PG17 psql + pg_dump lock-wait hit by 2s session timeout -> clients and DB sessions close, backup dir preserved
      const lockHolder = spawn(
        dockerBin,
        [
          '-H', endpoint,
          'exec', '-i', '--user', 'postgres', snapContainerId,
          'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '/var/run/postgresql', '-U', 'supabase_admin', '-d', 'postgres',
        ],
        { env: dockerEnv, stdio: ['pipe', 'pipe', 'pipe'] }
      );
      let lockHolderStdout = '';
      lockHolder.stdout.on('data', (chunk) => {
        lockHolderStdout += chunk.toString('utf8');
      });
      lockHolder.stdin.write(
        "SET application_name = 'lari_qa_lock_holder';\nBEGIN;\nLOCK TABLE public.lari_snapshot_probe IN ACCESS EXCLUSIVE MODE;\nSELECT 'LOCK_ACQUIRED';\nSELECT pg_sleep(30);\nCOMMIT;\n"
      );
      lockHolder.stdin.end();

      const lockDeadline = Date.now() + 10000;
      while (!lockHolderStdout.includes('LOCK_ACQUIRED') && Date.now() < lockDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(lockHolderStdout.includes('LOCK_ACQUIRED'), 'Lock holder must acquire ACCESS EXCLUSIVE lock before timing out snapshot flow');

      let negLiveTimeout;
      try {
        negLiveTimeout = runSnapshotFlowCase(snapPort, {
          LARI_TEST_SNAPSHOT_SESSION_TIMEOUT_SECONDS: '2',
        });
      } finally {
        dockerCmd([
          'exec', '--user', 'postgres', snapContainerId,
          'psql', '-X', '-qAt', '-h', '/var/run/postgresql', '-U', 'supabase_admin', '-d', 'postgres',
          '-c', "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND application_name = 'lari_qa_lock_holder';",
        ]);
        try {
          lockHolder.kill('SIGKILL');
        } catch {
          // already exited
        }
      }

      assert.notEqual(negLiveTimeout.res.status, 0, 'Timed-out live snapshot session must exit non-zero');
      assert.ok(
        (negLiveTimeout.res.stderr || '').includes('exceeded overall 2s timeout') &&
        (negLiveTimeout.res.stderr || '').includes('SNAPSHOT_IMPORT_FAILED'),
        `Live client timeout must emit exceeded overall 2s timeout and SNAPSHOT_IMPORT_FAILED, got: ${negLiveTimeout.res.stderr}`
      );
      assert.ok(negLiveTimeout.elapsedMs < 15000, `Live client timeout took too long (${negLiveTimeout.elapsedMs}ms)`);
      assertPreservedBackupDir(negLiveTimeout, 'Test 7e live client timeout');

      let remainingSessions = -1;
      for (let checkIdx = 0; checkIdx < 20; checkIdx += 1) {
        const activityRes = dockerCmd([
          'exec', '--user', 'postgres', snapContainerId,
          'psql', '-X', '-qAt', '-h', '/var/run/postgresql', '-U', 'supabase_admin', '-d', 'postgres',
          '-c', "SELECT count(*) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND usename = 'supabase_admin' AND datname = 'postgres' AND application_name IN ('psql', 'pg_dump', 'lari_qa_lock_holder');",
        ]);
        if (activityRes.status === 0) {
          remainingSessions = Number.parseInt(activityRes.stdout.trim(), 10);
          if (remainingSessions === 0) {
            break;
          }
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
      }
      assert.equal(remainingSessions, 0, `All timed-out psql/pg_dump source DB sessions must be closed, remaining=${remainingSessions}`);

      const psRes = spawnSync('ps', ['-eo', 'comm,args'], { encoding: 'utf8' });
      if (psRes.status === 0) {
        const orphanedClients = (psRes.stdout || '')
          .split(/\r?\n/)
          .filter((line) => /pg_dump\s.*--snapshot=/.test(line));
        assert.equal(orphanedClients.length, 0, `No orphaned pg_dump client may remain running: ${orphanedClients.join('; ')}`);
      }

      console.log('Test 7 PASS: Real Linux PG 17.6 FIFO snapshot flow (positive + export/import/FIFO-timeout/live-client-timeout + closed DB sessions + preserved workspace) verified\n');
    } finally {
      fs.rmSync(snapRoot, { recursive: true, force: true });
      if (snapContainerId && /^[a-f0-9]{64}$/.test(snapContainerId)) {
        const inspectSnap = dockerCmd(['inspect', '--format', '{{json .Config.Labels}}', snapContainerId]);
        if (inspectSnap.status === 0 && inspectSnap.stdout.trim()) {
          const snapLabels = JSON.parse(inspectSnap.stdout.trim() || '{}');
          if (snapLabels['lari.qa.nonce'] === snapNonce) {
            dockerCmd(['rm', '-f', snapContainerId]);
          }
        }
      }
    }
  }

  console.log('\n[QUALIFICATION REPORT]');
  console.log('STATUS: PASS');
  console.log(`QUALIFIED IMAGE: ${qualifiedImage}`);
  console.log(`SUPABASE_VAULT VERSION: ${vaultVersion}`);
  console.log('EVALUATION LEVEL: SYNTHETIC FIXTURE EQUIVALENCE (16 roles, 22 memberships) + REAL EXTENSION QUALIFICATION');
  console.log('NOTE: Full source-to-restored catalog matching against live Supabase remains a later live acceptance requirement.');
  console.log('All 6 tests PASS on official Supabase PG 17.6 container\n');

  console.log('='.repeat(72));
  console.log('ALL MANDATORY SUPABASE POSTGRESQL 17.6 QUALIFICATION TESTS PASSED');
  console.log('='.repeat(72));
} catch (err) {
  console.error(`ERROR during container qualification: ${err.message}`);
  try {
    if (verifiedContainerId) {
      const dumpLogs = dockerCmd(['logs', '--tail', '50', verifiedContainerId]);
      console.error('--- Container Logs (last 50 lines) ---');
      console.error(dumpLogs.stdout || dumpLogs.stderr || '(no logs)');
      console.error('--------------------------------------');
    }
  } catch (e) {
    // ignore
  }
  throw err;
} finally {
  console.log('--- Teardown: Container Cleanup ---');
  if (verifiedContainerId && /^[a-f0-9]{64}$/.test(verifiedContainerId)) {
    try {
      // 1. Before deletion, docker inspect <captured-id> must succeed and its nonce label must match the current run. Inspection failure is an error, not proof the container was removed.
      const inspectRes = dockerCmd([
        'inspect',
        '--format', '{{json .Config.Labels}}',
        verifiedContainerId,
      ]);
      if (inspectRes.error || inspectRes.status !== 0 || !inspectRes.stdout.trim()) {
        console.error(`FATAL: Cannot inspect container ${verifiedContainerId} before removal: ${inspectRes.error?.message || inspectRes.stderr || 'empty output'}`);
        process.exit(1);
      }

      const labels = JSON.parse(inspectRes.stdout.trim() || '{}');
      const candidateNonce = process.env.LARI_TEST_SIMULATE_CLEANUP_MISMATCH ? 'mismatched-nonce' : labels['lari.qa.nonce'];
      if (candidateNonce !== uniqueId) {
        console.error(`SECURITY REFUSAL: Container ${verifiedContainerId} nonce does not match current run! Refusing to delete foreign container.`);
        process.exit(1);
      }

      // 2. Execute docker rm -f <captured-id> and require exit code 0.
      const rmRes = dockerCmd(['rm', '-f', verifiedContainerId]);
      if (rmRes.error || rmRes.status !== 0) {
        console.error(`FATAL: docker rm -f failed with status ${rmRes.status}: ${rmRes.error?.message || rmRes.stderr}`);
        process.exit(1);
      }

      // 3. Execute docker info against the same pinned endpoint and require exit code 0.
      const infoRes = dockerCmd(['info', '--format', '{{.OperatingSystem}}']);
      if (infoRes.error || infoRes.status !== 0) {
        console.error(`FATAL: docker info probe failed during cleanup verification: ${infoRes.error?.message || infoRes.stderr}`);
        process.exit(1);
      }

      // 4. Execute docker ps -aq --no-trunc --filter id=<captured-id> against that endpoint, require exit code 0 and empty output.
      const psRes = dockerCmd(['ps', '-aq', '--no-trunc', '--filter', `id=${verifiedContainerId}`]);
      if (psRes.error || psRes.status !== 0) {
        console.error(`FATAL: docker ps check failed with status ${psRes.status}: ${psRes.error?.message || psRes.stderr}`);
        process.exit(1);
      }
      if (psRes.stdout.trim() !== '') {
        console.error(`FATAL: Container ${verifiedContainerId} still visible in docker ps: "${psRes.stdout.trim()}"`);
        process.exit(1);
      }

      // 5. Only then emit CLEANUP_VERIFIED.
      console.log('CLEANUP_VERIFIED');
      console.log(`Container ${verifiedContainerId.slice(0, 12)} successfully removed and verified absent.`);
    } catch (cleanupErr) {
      console.error(`FATAL: Cleanup verification failed: ${cleanupErr.message}`);
      process.exit(1);
    }
  }
}
