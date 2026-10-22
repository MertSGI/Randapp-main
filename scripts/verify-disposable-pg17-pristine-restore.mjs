import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// LARI — Batch 11: Official Supabase PG 17.6 Pristine template0 Restore Suite
// ---------------------------------------------------------------------------

console.log('='.repeat(76));
console.log('LARI — SUPABASE PG 17.6 PRISTINE TEMPLATE0 RESTORE & NEGATIVE QA SUITE');
console.log('='.repeat(76));

const failWithSourceHold = (reason, details = '') => {
  console.error(`SOURCE_HOLD: ${reason}`);
  if (details) {
    console.error(details);
  }
  process.exit(1);
};

// 1. Generate unique run ID and container identifiers
const uniqueId = randomBytes(16).toString('hex');
const containerName = `lari-pg17-pristine-qa-${uniqueId}`;
const nonceLabel = `lari.qa.pristine.nonce=${uniqueId}`;
const disposablePassword = 'disposable-only';

console.log(`Run Unique ID:    ${uniqueId}`);
console.log(`Container Name:   ${containerName}`);
console.log(`Nonce Label:      ${nonceLabel}`);
console.log('-'.repeat(76));

// 2. Verify and pin Docker daemon endpoint
const dockerBin = process.env.LARI_TEST_SIMULATE_DOCKER_BIN || process.env.LARI_DOCKER_BIN || 'docker';
const endpoint = process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock';

if (process.env.DOCKER_HOST && process.env.DOCKER_HOST !== endpoint) {
  failWithSourceHold('UNAPPROVED_DOCKER_ENDPOINT', `DOCKER_HOST=${process.env.DOCKER_HOST}`);
}
if (process.env.DOCKER_CONTEXT && process.env.DOCKER_CONTEXT !== 'default') {
  failWithSourceHold('UNAPPROVED_DOCKER_CONTEXT', `DOCKER_CONTEXT=${process.env.DOCKER_CONTEXT}`);
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
  failWithSourceHold(
    'Docker daemon is unavailable or cannot be verified on this host.',
    `status=${probeDaemon.status} stderr=${probeDaemon.stderr || probeDaemon.error?.message || 'unknown'}`
  );
}

if (process.platform === 'linux') {
  if (!fs.existsSync('/var/run/docker.sock') || !fs.statSync('/var/run/docker.sock').isSocket()) {
    failWithSourceHold('/var/run/docker.sock does not exist or is not a Unix domain socket.');
  }
}

const findBash = () => {
  const candidates = process.platform === 'win32'
    ? [
        process.env.LARI_TEST_BASH,
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
        'C:\\Program Files\\Git\\bin\\bash.exe',
      ]
    : [process.env.LARI_TEST_BASH, '/bin/bash', '/usr/bin/bash', 'bash'];
  return candidates.find((candidate) => candidate && (candidate === 'bash' || fs.existsSync(candidate)));
};

const bashExecutable = findBash();
if (!bashExecutable) {
  failWithSourceHold('Bash executable is unavailable.');
}

const toBashPath = (filePath) => {
  if (process.platform !== 'win32') return filePath;
  const resolved = path.resolve(filePath).replace(/\\/g, '/');
  return resolved.replace(/^([A-Za-z]):\//, (_, drive) => `/${drive.toLowerCase()}/`);
};

// Configure PATH to prefer PostgreSQL 17 client binaries on Linux runners
const hostEnv = { ...process.env };
if (fs.existsSync('/usr/lib/postgresql/17/bin')) {
  hostEnv.PATH = `/usr/lib/postgresql/17/bin:${hostEnv.PATH || ''}`;
}

for (const requiredTool of ['pg_dump', 'pg_restore', 'psql', 'pg_dumpall', 'age', 'age-keygen', 'jq', 'sha256sum', 'tar', 'python3']) {
  const check = spawnSync(bashExecutable, ['-c', `command -v ${requiredTool}`], {
    env: hostEnv,
    encoding: 'utf8',
  });
  if (check.status !== 0) {
    failWithSourceHold(`Required host tool "${requiredTool}" is not installed in PATH.`);
  }
}

// 3. Pull and verify pinned official Supabase PostgreSQL 17 image digest
const expectedDigest = 'sha256:ba10e934f0a59990379f78ab9ed93926f1c291dd61a12fe4026f4202f1b89770';
const qualifiedImage = `supabase/postgres:17.6.1.141@${expectedDigest}`;

console.log(`Pulling qualified Supabase PostgreSQL 17 image [${qualifiedImage}]...`);
const pullRes = dockerCmd(['pull', qualifiedImage], { timeout: 300000 });
if (pullRes.status !== 0) {
  failWithSourceHold('Failed to pull qualified Supabase PostgreSQL 17 image.', pullRes.stderr);
}

const inspectImageRes = dockerCmd(['image', 'inspect', '--format', '{{json .RepoDigests}}', qualifiedImage]);
if (inspectImageRes.status !== 0 || !inspectImageRes.stdout.includes(expectedDigest)) {
  failWithSourceHold(
    `Docker image digest mismatch: expected ${expectedDigest}`,
    inspectImageRes.stdout || inspectImageRes.stderr
  );
}
console.log(`Verified Image Digest: ${expectedDigest}`);

// 4. Launch isolated container bound ONLY to loopback 127.0.0.1:5432 with POSTGRES_DB=restore_verification
console.log(`Launching disposable container [${containerName}] with POSTGRES_DB=restore_verification...`);
const runArgs = [
  'run',
  '--detach',
  '--rm',
  '-p', '127.0.0.1:5432:5432',
  '--name', containerName,
  '--label', nonceLabel,
  '-e', 'POSTGRES_USER=supabase_admin',
  '-e', 'POSTGRES_DB=restore_verification',
  '-e', `POSTGRES_PASSWORD=${disposablePassword}`,
  qualifiedImage,
];

const runRes = dockerCmd(runArgs);
if (runRes.status !== 0 || !runRes.stdout.trim()) {
  failWithSourceHold('Failed to launch disposable container on 127.0.0.1:5432.', runRes.stderr);
}

const verifiedContainerId = runRes.stdout.trim().split(/\r?\n/)[0];
assert.match(
  verifiedContainerId,
  /^[a-f0-9]{64}$/,
  `Docker run must return full 64-character container ID, got: "${verifiedContainerId}"`
);
console.log(`Verified Container ID: ${verifiedContainerId}\n`);

const execContainerPsql = (sql, { db = 'restore_verification', user = 'supabase_admin', stopOnError = true, description = 'SQL' } = {}) => {
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
  args.push('-h', '/var/run/postgresql', '-U', user, '-d', db, '-f', '-');
  const res = dockerCmd(args, { input: sql, timeout: 30000 });
  if (stopOnError && res.status !== 0) {
    throw new Error(`Container SQL failed [${description}]: status=${res.status}, stderr=${res.stderr}`);
  }
  return res;
};

const suiteTempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `lari-pristine-suite-${process.pid}-`));

try {
  // 5. Wait for full Supabase entrypoint initialization and PostgreSQL readiness
  console.log('--- Pre-Flight Validation & Bootstrap Inspection ---');
  const inspectLabelsRes = dockerCmd(['inspect', '--format', '{{json .Config.Labels}}', verifiedContainerId]);
  assert.equal(inspectLabelsRes.status, 0, 'Container label inspection must succeed');
  const labels = JSON.parse(inspectLabelsRes.stdout.trim() || '{}');
  assert.equal(labels['lari.qa.pristine.nonce'], uniqueId, 'Container nonce label must match');

  console.log('Waiting for Supabase entrypoint initialization in restore_verification (up to 120s)...');
  let isReady = false;
  const startWait = Date.now();
  while (Date.now() - startWait < 120000) {
    const logsRes = dockerCmd(['logs', verifiedContainerId]);
    const logs = (logsRes.stdout || '') + (logsRes.stderr || '');
    const initComplete =
      logs.includes('PostgreSQL init process complete; ready for start up.') ||
      logs.includes('PostgreSQL Database directory appears to contain a database; Skipping initialization');

    if (initComplete) {
      const readyProbe = dockerCmd([
        'exec',
        '-i',
        '--user', 'postgres',
        verifiedContainerId,
        'pg_isready',
        '-h', '127.0.0.1',
        '-p', '5432',
        '-U', 'supabase_admin',
        '-d', 'restore_verification',
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
          '-d', 'restore_verification',
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
  assert.ok(isReady, 'Supabase PostgreSQL 17.6 container failed to complete entrypoint initialization within 120s');
  console.log(`Container ready (${Math.round((Date.now() - startWait) / 1000)}s).`);

  // Ensure local socket and loopback 127.0.0.1 allow connections and supabase_admin password matches disposablePassword
  const hbaRes = execContainerPsql('\\set QUIET 1\n\\pset tuples_only on\n\\pset format unaligned\nSHOW hba_file;\n', {
    description: 'Query hba_file',
  });
  const hbaFile = hbaRes.stdout.trim().split(/\r?\n/)[0].trim();
  if (hbaFile) {
    const patchHba = dockerCmd([
      'exec',
      '-i',
      '--user', 'postgres',
      verifiedContainerId,
      'sh',
      '-c',
      `printf 'local all all trust\\nhost all all 127.0.0.1/32 trust\\nhost all all ::1/128 trust\\n' | cat - "${hbaFile}" > "${hbaFile}.tmp" && mv "${hbaFile}.tmp" "${hbaFile}"`,
    ]);
    assert.equal(patchHba.status, 0, `Failed to configure pg_hba.conf: ${patchHba.stderr}`);
    execContainerPsql(`ALTER ROLE supabase_admin WITH PASSWORD '${disposablePassword}'; SELECT pg_reload_conf();`, {
      description: 'Ensure supabase_admin password and reload pg_hba',
    });
  }

  // Verify bootstrap control DB `restore_verification` has pre-seeded Supabase schemas (`auth`, `extensions`, etc.)
  const bootstrapSchemasRes = execContainerPsql(
    "\\set QUIET 1\n\\pset tuples_only on\n\\pset format unaligned\nSELECT string_agg(nspname, ',' ORDER BY nspname) FROM pg_namespace WHERE nspname <> 'information_schema' AND nspname !~ '^pg_';",
    { db: 'restore_verification', description: 'Inspect seeded schemas in restore_verification' }
  );
  const bootstrapSchemas = bootstrapSchemasRes.stdout.trim();
  console.log(`Bootstrap DB (restore_verification) seeded schemas: ${bootstrapSchemas}`);
  assert.ok(
    bootstrapSchemas.split(',').includes('auth'),
    `Expected official Supabase image to seed "auth" schema in restore_verification, found: ${bootstrapSchemas}`
  );

  // ===========================================================================
  // Step 1: Build Synthetic Fixture from Separate Isolated DB (lari_synthetic_source_db)
  // ===========================================================================
  console.log('\n--- Step 1: Build Synthetic Source Fixture from Isolated DB (lari_synthetic_source_db) ---');

  // Normalize non-system role memberships to the 4 canonical Supabase memberships
  execContainerPsql(
    `DO $lari_setup_roles$
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

      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN CREATE ROLE authenticator NOINHERIT LOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard_user') THEN CREATE ROLE dashboard_user CREATEDB CREATEROLE REPLICATION NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN CREATE ROLE postgres SUPERUSER CREATEDB CREATEROLE LOGIN REPLICATION BYPASSRLS; END IF;

      GRANT anon TO authenticator GRANTED BY supabase_admin;
      GRANT authenticated TO authenticator GRANTED BY supabase_admin;
      GRANT service_role TO authenticator GRANTED BY supabase_admin;
      GRANT supabase_admin TO postgres WITH ADMIN OPTION GRANTED BY supabase_admin;
    END $lari_setup_roles$;`,
    { db: 'restore_verification', description: 'Configure canonical synthetic roles and memberships' }
  );

  execContainerPsql(
    'CREATE DATABASE "lari_synthetic_source_db" WITH TEMPLATE template0 OWNER "supabase_admin";',
    { db: 'restore_verification', description: 'Create isolated lari_synthetic_source_db from template0' }
  );

  execContainerPsql(
    `-- 1. Schema auth with synthetic table + rows + ACLs
    CREATE SCHEMA auth AUTHORIZATION supabase_admin;
    GRANT USAGE ON SCHEMA auth TO authenticated, service_role;

    CREATE TABLE auth.users_synthetic (
      id uuid PRIMARY KEY,
      email text NOT NULL,
      role_label text NOT NULL
    );
    ALTER TABLE auth.users_synthetic OWNER TO supabase_admin;
    GRANT SELECT ON TABLE auth.users_synthetic TO authenticated, service_role;

    INSERT INTO auth.users_synthetic (id, email, role_label) VALUES
      ('00000000-0000-0000-0000-000000000001', 'synthetic-alpha@example.invalid', 'authenticated'),
      ('00000000-0000-0000-0000-000000000002', 'synthetic-beta@example.invalid', 'authenticated');

    -- 2. Schema vault with real supabase_vault 0.3.1 extension (no Vault root keys)
    CREATE SCHEMA vault AUTHORIZATION supabase_admin;
    CREATE EXTENSION supabase_vault WITH SCHEMA vault;

    -- 3. Application schema lari_app with table, rows, RLS, policy, SECURITY DEFINER function, owners & ACLs
    CREATE SCHEMA lari_app AUTHORIZATION postgres;
    GRANT USAGE ON SCHEMA lari_app TO anon, authenticated, service_role;

    CREATE TABLE lari_app.tenant_bookings_synthetic (
      id uuid PRIMARY KEY,
      tenant_slug text NOT NULL,
      customer_ref text NOT NULL,
      status text NOT NULL
    );
    ALTER TABLE lari_app.tenant_bookings_synthetic OWNER TO postgres;
    ALTER TABLE lari_app.tenant_bookings_synthetic ENABLE ROW LEVEL SECURITY;
    ALTER TABLE lari_app.tenant_bookings_synthetic FORCE ROW LEVEL SECURITY;

    CREATE POLICY tenant_bookings_authenticated_read
      ON lari_app.tenant_bookings_synthetic
      AS PERMISSIVE
      FOR SELECT
      TO authenticated
      USING (status = 'confirmed');

    GRANT SELECT ON TABLE lari_app.tenant_bookings_synthetic TO authenticated;
    GRANT ALL ON TABLE lari_app.tenant_bookings_synthetic TO service_role;

    INSERT INTO lari_app.tenant_bookings_synthetic (id, tenant_slug, customer_ref, status) VALUES
      ('10000000-0000-0000-0000-000000000001', 'pilot-salon-alpha', 'cust-syn-01', 'confirmed'),
      ('10000000-0000-0000-0000-000000000002', 'pilot-salon-alpha', 'cust-syn-02', 'cancelled');

    CREATE FUNCTION lari_app.count_confirmed_synthetic_bookings()
    RETURNS bigint
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = lari_app, pg_temp
    AS $$
      SELECT count(*) FROM lari_app.tenant_bookings_synthetic WHERE status = 'confirmed';
    $$;
    ALTER FUNCTION lari_app.count_confirmed_synthetic_bookings() OWNER TO postgres;
    REVOKE ALL ON FUNCTION lari_app.count_confirmed_synthetic_bookings() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION lari_app.count_confirmed_synthetic_bookings() TO authenticated, service_role;`,
    { db: 'lari_synthetic_source_db', description: 'Populate synthetic source fixture database' }
  );

  // Export roles.sql, database.dump (custom format), source-catalog-fingerprint.json, source-dependencies.json via host PG17 tools
  const fixtureDir = path.join(suiteTempRoot, 'fixture-clean');
  fs.mkdirSync(fixtureDir, { recursive: true, mode: 0o700 });
  const pgpassFile = path.join(suiteTempRoot, 'fixture.pgpass');
  fs.writeFileSync(pgpassFile, `127.0.0.1:5432:*:supabase_admin:${disposablePassword}\n`, { mode: 0o600 });

  const runHostPgTool = (tool, args, { db = 'lari_synthetic_source_db', outputFile = null } = {}) => {
    const env = {
      HOME: suiteTempRoot,
      PATH: hostEnv.PATH,
      LC_ALL: 'C.UTF-8',
      PGHOST: '127.0.0.1',
      PGPORT: '5432',
      PGDATABASE: db,
      PGUSER: 'supabase_admin',
      PGSSLMODE: 'disable',
      PGPASSFILE: pgpassFile,
    };
    const res = spawnSync(tool, args, {
      cwd: process.cwd(),
      env,
      encoding: outputFile ? 'utf8' : 'buffer',
      timeout: 60000,
    });
    if (res.status !== 0) {
      throw new Error(`Host ${tool} failed: status=${res.status}, stderr=${res.stderr?.toString()}`);
    }
    if (outputFile) {
      fs.writeFileSync(outputFile, res.stdout);
    }
    return res;
  };

  runHostPgTool('pg_dumpall', ['--roles-only', '--no-role-passwords'], {
    db: 'restore_verification',
    outputFile: path.join(fixtureDir, 'roles.sql'),
  });
  runHostPgTool('pg_dump', ['--format=custom', '--compress=9', '--lock-wait-timeout=30000', `--file=${path.join(fixtureDir, 'database.dump')}`], {
    db: 'lari_synthetic_source_db',
  });
  runHostPgTool('psql', ['-X', '-qAt', '--set=ON_ERROR_STOP=1', '--file=scripts/backup/catalog-fingerprint.sql'], {
    db: 'lari_synthetic_source_db',
    outputFile: path.join(fixtureDir, 'source-catalog-fingerprint.json'),
  });
  runHostPgTool('psql', ['-X', '-qAt', '--set=ON_ERROR_STOP=1', '--file=scripts/backup/dependency-inventory.sql'], {
    db: 'lari_synthetic_source_db',
    outputFile: path.join(fixtureDir, 'source-dependencies.json'),
  });

  // Drop lari_synthetic_source_db so only the exported dump/artifacts remain
  execContainerPsql('DROP DATABASE "lari_synthetic_source_db";', {
    db: 'restore_verification',
    description: 'Drop lari_synthetic_source_db after dump export',
  });

  const sourceFpJson = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'source-catalog-fingerprint.json'), 'utf8'));
  const sourceDepsJson = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'source-dependencies.json'), 'utf8'));
  console.log('Synthetic Source Catalog Fingerprint Summary:', JSON.stringify(sourceFpJson));
  assert.ok(
    sourceDepsJson.extensions.some((e) => e.name === 'supabase_vault' && e.version === '0.3.1' && e.schema === 'vault'),
    'Source dependency inventory must record supabase_vault 0.3.1 in schema vault'
  );
  console.log('Step 1 PASS: Synthetic source fixture built from isolated DB and exported cleanly.\n');

  // ===========================================================================
  // Step 2: Reproduce Original Before-Fix Failure (CREATE SCHEMA auth collision)
  // ===========================================================================
  console.log('--- Step 2: Reproduce Original Before-Fix Collision in restore_verification ---');
  const collisionRestoreRes = spawnSync(
    'pg_restore',
    [
      '--exit-on-error',
      '--single-transaction',
      '--dbname=restore_verification',
      path.join(fixtureDir, 'database.dump'),
    ],
    {
      cwd: process.cwd(),
      env: {
        HOME: suiteTempRoot,
        PATH: hostEnv.PATH,
        LC_ALL: 'C.UTF-8',
        PGHOST: '127.0.0.1',
        PGPORT: '5432',
        PGDATABASE: 'restore_verification',
        PGUSER: 'supabase_admin',
        PGSSLMODE: 'disable',
        PGPASSFILE: pgpassFile,
      },
      encoding: 'utf8',
    }
  );
  assert.notEqual(
    collisionRestoreRes.status,
    0,
    'Restoring custom dump into pre-initialized restore_verification must fail closed'
  );
  assert.ok(
    collisionRestoreRes.stderr.includes('schema "auth" already exists'),
    `Expected "schema \\"auth\\" already exists" in stderr, got:\n${collisionRestoreRes.stderr}`
  );
  assert.ok(
    collisionRestoreRes.stderr.includes('CREATE SCHEMA auth'),
    `Expected "CREATE SCHEMA auth" statement in stderr, got:\n${collisionRestoreRes.stderr}`
  );
  console.log('Observed deterministic collision on restore_verification:');
  console.log(
    collisionRestoreRes.stderr
      .split(/\r?\n/)
      .filter((line) => line.includes('schema "auth" already exists') || line.includes('CREATE SCHEMA auth'))
      .map((line) => `  ${line}`)
      .join('\n')
  );

  // Prove that reading catalog-fingerprint.sql from bootstrap `restore_verification` does NOT match source fixture
  const bootstrapFpFile = path.join(suiteTempRoot, 'bootstrap-catalog-fingerprint.json');
  runHostPgTool('psql', ['-X', '-qAt', '--set=ON_ERROR_STOP=1', '--file=scripts/backup/catalog-fingerprint.sql'], {
    db: 'restore_verification',
    outputFile: bootstrapFpFile,
  });
  const bootstrapFpRaw = fs.readFileSync(bootstrapFpFile, 'utf8').trim();
  const sourceFpRaw = fs.readFileSync(path.join(fixtureDir, 'source-catalog-fingerprint.json'), 'utf8').trim();
  assert.notEqual(
    bootstrapFpRaw,
    sourceFpRaw,
    'Bootstrap restore_verification catalog fingerprint must never match the source fixture'
  );
  console.log('Step 2 PASS: Original CREATE SCHEMA auth collision reproduced and bootstrap catalog mismatch proven.\n');

  // Helper to invoke `scripts/run-zero-cost-logical-backup.sh --test-disposable-pristine-restore`
  const ageKeyFile = path.join(suiteTempRoot, 'test-operator.agekey');
  const keygenRes = spawnSync('age-keygen', ['-o', ageKeyFile], {
    env: hostEnv,
    encoding: 'utf8',
  });
  assert.equal(keygenRes.status, 0, `age-keygen failed: ${keygenRes.stderr}`);
  const pubKeyRes = spawnSync('age-keygen', ['-y', ageKeyFile], {
    env: hostEnv,
    encoding: 'utf8',
  });
  assert.equal(pubKeyRes.status, 0, `age-keygen -y failed: ${pubKeyRes.stderr}`);
  const testAgeRecipient = pubKeyRes.stdout.trim();
  assert.match(testAgeRecipient, /^age1[a-z0-9]+$/, 'Generated age recipient must start with age1');

  let runCaseCounter = 0;
  const runPristineRestoreRunner = (customFixtureDir, envOverrides = {}) => {
    runCaseCounter += 1;
    const caseRoot = fs.mkdtempSync(path.join(suiteTempRoot, `case-${runCaseCounter}-`));
    const runnerTemp = path.join(caseRoot, 'runner-temp');
    const workspace = path.join(caseRoot, 'workspace');
    fs.mkdirSync(runnerTemp, { mode: 0o700 });
    fs.mkdirSync(workspace, { mode: 0o700 });

    const env = {
      ...hostEnv,
      RUNNER_TEMP: toBashPath(runnerTemp),
      GITHUB_WORKSPACE: toBashPath(workspace),
      GITHUB_RUN_ID: `9900${runCaseCounter}`,
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_SHA: '6d3c52402d1472a69705b6e41594258f5829e90c',
      SOURCE_PROJECT_REF: 'rwedeejhjazwjthdjzrt',
      BACKUP_AGE_RECIPIENT: testAgeRecipient,
      LARI_DISPOSABLE_DB: '1',
      LARI_OFFLINE_TEST_MODE: '1',
      ...envOverrides,
    };

    const result = spawnSync(
      bashExecutable,
      ['scripts/run-zero-cost-logical-backup.sh', '--test-disposable-pristine-restore', toBashPath(customFixtureDir)],
      {
        cwd: process.cwd(),
        env,
        encoding: 'utf8',
        timeout: 120000,
      }
    );

    const artifactDir = path.join(workspace, 'backup-artifacts');
    const artifactFiles = fs.existsSync(artifactDir) ? fs.readdirSync(artifactDir) : [];
    const runnerTempRemaining = fs.existsSync(runnerTemp) ? fs.readdirSync(runnerTemp) : [];
    return {
      result,
      caseRoot,
      workspace,
      artifactDir,
      artifactFiles,
      runnerTempRemaining,
    };
  };

  // ===========================================================================
  // Step 3: Mandatory Negative Cases (HOLD & FAIL, Zero Artifacts on Failure)
  // ===========================================================================
  console.log('--- Step 3: Mandatory Negative Cases (HOLD & FAIL) ---');

  // 3.1 Wrong target selected (restore_verification / postgres / template0) => HOLD
  for (const forbiddenTarget of ['restore_verification', 'postgres', 'template0']) {
    const wrongTargetRun = runPristineRestoreRunner(fixtureDir, {
      LARI_RESTORE_TARGET_DB: forbiddenTarget,
    });
    assert.notEqual(wrongTargetRun.result.status, 0, `Wrong target "${forbiddenTarget}" must fail closed`);
    assert.ok(
      wrongTargetRun.result.stderr.includes(`HOLD: Wrong restore target selected (${forbiddenTarget})`),
      `Expected HOLD for wrong target "${forbiddenTarget}", got:\n${wrongTargetRun.result.stderr}`
    );
    assert.equal(wrongTargetRun.artifactFiles.length, 0, `Zero encrypted artifacts allowed on wrong target "${forbiddenTarget}"`);
    assert.equal(wrongTargetRun.runnerTempRemaining.length, 0, 'Private temp dir must be cleaned');
  }
  console.log('  [PASS] Negative 3.1: Wrong target selected (restore_verification, postgres, template0) => HOLD + 0 artifacts');

  // 3.2 Non-disposable endpoint (remote host, non-5432 port, missing LARI_DISPOSABLE_DB) => HOLD
  const remoteHostRun = runPristineRestoreRunner(fixtureDir, {
    LARI_TEST_RESTORE_HOST: 'aws-0-eu-central-1.pooler.supabase.com',
  });
  assert.notEqual(remoteHostRun.result.status, 0, 'Remote host must fail closed');
  assert.ok(remoteHostRun.result.stderr.includes('HOLD: Non-disposable restore endpoint rejected'));
  assert.equal(remoteHostRun.artifactFiles.length, 0, 'Zero artifacts allowed on remote host rejection');

  const wrongPortRun = runPristineRestoreRunner(fixtureDir, {
    LARI_TEST_RESTORE_PORT: '6543',
  });
  assert.notEqual(wrongPortRun.result.status, 0, 'Non-5432 restore port must fail closed');
  assert.ok(wrongPortRun.result.stderr.includes('HOLD: Non-disposable restore port rejected'));
  assert.equal(wrongPortRun.artifactFiles.length, 0, 'Zero artifacts allowed on wrong port rejection');

  const missingDisposableGuardRun = runPristineRestoreRunner(fixtureDir, {
    LARI_DISPOSABLE_DB: '0',
  });
  assert.notEqual(missingDisposableGuardRun.result.status, 0, 'Disabled LARI_DISPOSABLE_DB must fail closed');
  assert.equal(missingDisposableGuardRun.artifactFiles.length, 0, 'Zero artifacts allowed when LARI_DISPOSABLE_DB!=1');
  console.log('  [PASS] Negative 3.2: Non-disposable endpoint / port / missing LARI_DISPOSABLE_DB => HOLD + 0 artifacts');

  // 3.3 Wrong DB / server owner => HOLD
  const wrongServerOwnerRun = runPristineRestoreRunner(fixtureDir, {
    LARI_EXPECTED_RESTORE_OWNER: 'postgres',
    LARI_RESTORE_TARGET_DB: 'lari_restore_srv_owner_test',
  });
  assert.notEqual(wrongServerOwnerRun.result.status, 0, 'Wrong server bootstrap owner must fail closed');
  assert.ok(
    wrongServerOwnerRun.result.stderr.includes('HOLD: Wrong disposable server bootstrap superuser (OID 10)'),
    `Expected HOLD for wrong server owner, got:\n${wrongServerOwnerRun.result.stderr}`
  );
  assert.equal(wrongServerOwnerRun.artifactFiles.length, 0, 'Zero artifacts allowed on wrong server owner');

  const wrongDbOwnerRun = runPristineRestoreRunner(fixtureDir, {
    LARI_TEST_TARGET_DB_OWNER: 'postgres',
    LARI_RESTORE_TARGET_DB: 'lari_restore_db_owner_test',
  });
  assert.notEqual(wrongDbOwnerRun.result.status, 0, 'Wrong target DB owner must fail closed');
  assert.ok(
    wrongDbOwnerRun.result.stderr.includes('HOLD: Wrong target database owner: expected supabase_admin, got postgres'),
    `Expected HOLD for wrong target DB owner, got:\n${wrongDbOwnerRun.result.stderr}`
  );
  assert.equal(wrongDbOwnerRun.artifactFiles.length, 0, 'Zero artifacts allowed on wrong target DB owner');
  execContainerPsql('DROP DATABASE IF EXISTS "lari_restore_db_owner_test";', {
    db: 'restore_verification',
    description: 'Clean up lari_restore_db_owner_test',
  });
  console.log('  [PASS] Negative 3.3: Wrong server bootstrap owner & wrong target DB owner => HOLD + 0 artifacts');

  // 3.4 Target database already exists => HOLD (without blind DROP)
  execContainerPsql(
    'CREATE DATABASE "lari_restore_existing_test" WITH TEMPLATE template0 OWNER "supabase_admin";',
    { db: 'restore_verification', description: 'Pre-create existing target DB' }
  );
  execContainerPsql(
    'CREATE SCHEMA sentinel_do_not_drop;',
    { db: 'lari_restore_existing_test', description: 'Create sentinel schema in pre-existing target DB' }
  );
  const targetExistsRun = runPristineRestoreRunner(fixtureDir, {
    LARI_RESTORE_TARGET_DB: 'lari_restore_existing_test',
  });
  assert.notEqual(targetExistsRun.result.status, 0, 'Pre-existing target DB must fail closed');
  assert.ok(
    targetExistsRun.result.stderr.includes('HOLD: Pristine restore target database "lari_restore_existing_test" already exists'),
    `Expected HOLD for pre-existing target DB, got:\n${targetExistsRun.result.stderr}`
  );
  assert.equal(targetExistsRun.artifactFiles.length, 0, 'Zero artifacts allowed when target DB already exists');

  // Verify sentinel schema was NOT dropped
  const sentinelCheck = execContainerPsql(
    "\\set QUIET 1\n\\pset tuples_only on\n\\pset format unaligned\nSELECT count(*) FROM pg_namespace WHERE nspname = 'sentinel_do_not_drop';",
    { db: 'lari_restore_existing_test', description: 'Verify pre-existing target DB was not dropped or modified' }
  );
  assert.equal(sentinelCheck.stdout.trim(), '1', 'Pre-existing target database must not be dropped or wiped');
  execContainerPsql('DROP DATABASE "lari_restore_existing_test";', {
    db: 'restore_verification',
    description: 'Clean up lari_restore_existing_test',
  });
  console.log('  [PASS] Negative 3.4: Target database already exists => HOLD + sentinel preserved + 0 artifacts');

  // 3.5 Missing extension => FAIL
  const missingExtFixtureDir = path.join(suiteTempRoot, 'fixture-missing-ext');
  fs.cpSync(fixtureDir, missingExtFixtureDir, { recursive: true });
  const rawDumpBuf = fs.readFileSync(path.join(missingExtFixtureDir, 'database.dump'));
  const needleBuf = Buffer.from('supabase_vault', 'ascii');
  const replacementBuf = Buffer.from('unavail_vault_', 'ascii'); // exact same length (14 bytes)
  assert.equal(needleBuf.length, replacementBuf.length);
  let replacedCount = 0;
  let searchIdx = 0;
  while ((searchIdx = rawDumpBuf.indexOf(needleBuf, searchIdx)) !== -1) {
    replacementBuf.copy(rawDumpBuf, searchIdx);
    searchIdx += needleBuf.length;
    replacedCount += 1;
  }
  assert.ok(replacedCount > 0, 'Custom dump TOC must contain supabase_vault string');
  fs.writeFileSync(path.join(missingExtFixtureDir, 'database.dump'), rawDumpBuf);
  const tamperedDeps = fs.readFileSync(path.join(missingExtFixtureDir, 'source-dependencies.json'), 'utf8')
    .replaceAll('supabase_vault', 'unavail_vault_');
  fs.writeFileSync(path.join(missingExtFixtureDir, 'source-dependencies.json'), tamperedDeps);

  const missingExtRun = runPristineRestoreRunner(missingExtFixtureDir, {
    LARI_RESTORE_TARGET_DB: 'lari_restore_missing_ext_test',
  });
  assert.notEqual(missingExtRun.result.status, 0, 'Missing extension in dump must fail closed');
  assert.ok(
    missingExtRun.result.stderr.includes('Logical restore verification failed; no backup artifact is eligible for upload.'),
    `Expected fail-closed restore message on missing extension, got:\n${missingExtRun.result.stderr}`
  );
  assert.equal(missingExtRun.artifactFiles.length, 0, 'Zero artifacts allowed on missing extension failure');
  execContainerPsql('DROP DATABASE IF EXISTS "lari_restore_missing_ext_test";', {
    db: 'restore_verification',
    description: 'Clean up lari_restore_missing_ext_test',
  });
  console.log('  [PASS] Negative 3.5: Missing extension in dump/inventory => FAIL + 0 artifacts');

  // 3.6 Schema collision or bad SQL => FAIL
  const badSqlFixtureDir = path.join(suiteTempRoot, 'fixture-bad-sql');
  fs.cpSync(fixtureDir, badSqlFixtureDir, { recursive: true });
  fs.appendFileSync(
    path.join(badSqlFixtureDir, 'roles.sql'),
    '\nSELECT * FROM nonexistent_broken_relation_failclosed;\n',
    'utf8'
  );
  const badSqlRun = runPristineRestoreRunner(badSqlFixtureDir, {
    LARI_RESTORE_TARGET_DB: 'lari_restore_bad_sql_test',
  });
  assert.notEqual(badSqlRun.result.status, 0, 'Bad SQL during restore must fail closed');
  assert.equal(badSqlRun.artifactFiles.length, 0, 'Zero artifacts allowed on bad SQL failure');
  execContainerPsql('DROP DATABASE IF EXISTS "lari_restore_bad_sql_test";', {
    db: 'restore_verification',
    description: 'Clean up lari_restore_bad_sql_test',
  });
  console.log('  [PASS] Negative 3.6: Bad SQL during restore => FAIL + 0 artifacts');

  // 3.7 Mismatching rows / catalog fingerprint => FAIL
  const mismatchCatalogFixtureDir = path.join(suiteTempRoot, 'fixture-catalog-mismatch');
  fs.cpSync(fixtureDir, mismatchCatalogFixtureDir, { recursive: true });
  const tamperedCatalogFp = JSON.parse(fs.readFileSync(path.join(mismatchCatalogFixtureDir, 'source-catalog-fingerprint.json'), 'utf8'));
  tamperedCatalogFp.tables.fingerprint = '00000000000000000000000000000000';
  fs.writeFileSync(path.join(mismatchCatalogFixtureDir, 'source-catalog-fingerprint.json'), JSON.stringify(tamperedCatalogFp) + '\n');

  const mismatchCatalogRun = runPristineRestoreRunner(mismatchCatalogFixtureDir, {
    LARI_RESTORE_TARGET_DB: 'lari_restore_mismatch_cat_test',
  });
  assert.notEqual(mismatchCatalogRun.result.status, 0, 'Catalog fingerprint mismatch must fail closed');
  assert.equal(mismatchCatalogRun.artifactFiles.length, 0, 'Zero artifacts allowed on catalog fingerprint mismatch');
  execContainerPsql('DROP DATABASE IF EXISTS "lari_restore_mismatch_cat_test";', {
    db: 'restore_verification',
    description: 'Clean up lari_restore_mismatch_cat_test',
  });
  console.log('  [PASS] Negative 3.7: Mismatching catalog fingerprint => FAIL + 0 artifacts\n');

  // ===========================================================================
  // Step 4: Positive End-to-End Pristine Restore (lari_restore_verification)
  // ===========================================================================
  console.log('--- Step 4: Positive End-to-End Pristine Restore (lari_restore_verification) ---');

  // Reset non-system role memberships before positive run so role restoration is genuinely exercised
  execContainerPsql(
    `DO $lari_reset_memberships$
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
    END $lari_reset_memberships$;`,
    { db: 'restore_verification', description: 'Reset role memberships before positive end-to-end restore' }
  );

  const positiveRun = runPristineRestoreRunner(fixtureDir);
  assert.equal(
    positiveRun.result.status,
    0,
    `Positive pristine restore must succeed (exit 0), stderr:\n${positiveRun.result.stderr}\nstdout:\n${positiveRun.result.stdout}`
  );
  assert.ok(
    positiveRun.result.stdout.includes('Encrypted logical backup prepared; restore verdict: VERIFIED_LOGICAL_RESTORE.'),
    `Expected VERIFIED_LOGICAL_RESTORE in stdout, got:\n${positiveRun.result.stdout}`
  );
  assert.equal(positiveRun.runnerTempRemaining.length, 0, 'Private temp dir must be cleaned after positive restore');

  // Verify restored objects directly inside `lari_restore_verification`
  const verifyTargetSql = `
  \\set QUIET 1
  \\pset tuples_only on
  \\pset format unaligned
  SELECT current_database() || '|' || pg_get_userbyid(d.datdba) || '|' || CASE WHEN d.datistemplate THEN 't' ELSE 'f' END
    FROM pg_database d WHERE d.datname = current_database();
  SELECT count(*) || '|' || string_agg(email, ',' ORDER BY email) FROM auth.users_synthetic;
  SELECT extname || '|' || extversion || '|' || n.nspname
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'supabase_vault';
  SELECT CASE WHEN c.relrowsecurity THEN 't' ELSE 'f' END || '|' || CASE WHEN c.relforcerowsecurity THEN 't' ELSE 'f' END || '|' || pg_get_userbyid(c.relowner)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'lari_app' AND c.relname = 'tenant_bookings_synthetic';
  SELECT count(*) FROM lari_app.tenant_bookings_synthetic;
  SELECT lari_app.count_confirmed_synthetic_bookings();
  `;
  const targetVerifyRes = execContainerPsql(verifyTargetSql, {
    db: 'lari_restore_verification',
    description: 'Verify restored data, extension, RLS, and function inside lari_restore_verification',
  });
  const verifyLines = targetVerifyRes.stdout.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  console.log('Restored lari_restore_verification inspection lines:', verifyLines);
  assert.equal(verifyLines[0], 'lari_restore_verification|supabase_admin|f', 'Target DB identity, owner, and datistemplate=false must match');
  assert.equal(verifyLines[1], '2|synthetic-alpha@example.invalid,synthetic-beta@example.invalid', 'Restored auth.users_synthetic rows must match');
  assert.equal(verifyLines[2], 'supabase_vault|0.3.1|vault', 'Restored supabase_vault 0.3.1 extension in schema vault must match');
  assert.equal(verifyLines[3], 't|t|postgres', 'Restored lari_app.tenant_bookings_synthetic RLS and owner must match');
  assert.equal(verifyLines[4], '2', 'Restored lari_app.tenant_bookings_synthetic total row count must be 2');
  assert.equal(verifyLines[5], '1', 'Restored SECURITY DEFINER function count_confirmed_synthetic_bookings() must return 1');

  // Verify encrypted artifact & manifest.json
  assert.equal(positiveRun.artifactFiles.length, 2, 'Exactly 2 files (manifest.json + .tar.gz.age) must exist in backup-artifacts');
  const manifestPath = path.join(positiveRun.artifactDir, 'manifest.json');
  const encryptedFile = positiveRun.artifactFiles.find((f) => f.endsWith('.tar.gz.age'));
  assert.ok(encryptedFile, 'Encrypted .tar.gz.age artifact must exist');
  const encryptedPath = path.join(positiveRun.artifactDir, encryptedFile);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const actualCiphertextSha256 = createHash('sha256').update(fs.readFileSync(encryptedPath)).digest('hex');
  assert.equal(manifest.encrypted_backup.sha256, actualCiphertextSha256, 'Manifest SHA-256 must match encrypted artifact');
  assert.equal(manifest.restore_test.verdict, 'VERIFIED_LOGICAL_RESTORE');
  assert.equal(manifest.restore_test.bootstrap_control_database, 'restore_verification');
  assert.equal(manifest.restore_test.target_database_name, 'lari_restore_verification');
  assert.equal(manifest.restore_test.template_source, 'template0');
  assert.equal(manifest.restore_test.pristine_target_exit_code, 0);
  assert.equal(manifest.restore_test.roles_restore_exit_code, 0);
  assert.equal(manifest.restore_test.database_restore_exit_code, 0);
  assert.equal(manifest.restore_test.catalog_fingerprint_match, true);

  // Decrypt bundle with ephemeral test age identity and verify pristine-target-receipt.json & catalog equality
  const decryptedTarGz = path.join(suiteTempRoot, 'decrypted-bundle.tar.gz');
  const extractDir = path.join(suiteTempRoot, 'extracted-bundle');
  fs.mkdirSync(extractDir, { mode: 0o700 });

  const decryptRes = spawnSync('age', ['--decrypt', '--identity', ageKeyFile, '--output', decryptedTarGz, encryptedPath], {
    env: hostEnv,
    encoding: 'utf8',
  });
  assert.equal(decryptRes.status, 0, `age --decrypt failed: ${decryptRes.stderr}`);

  const untarRes = spawnSync('tar', ['-C', extractDir, '-xzf', decryptedTarGz], {
    env: hostEnv,
    encoding: 'utf8',
  });
  assert.equal(untarRes.status, 0, `tar extract failed: ${untarRes.stderr}`);

  const pristineReceipt = JSON.parse(fs.readFileSync(path.join(extractDir, 'pristine-target-receipt.json'), 'utf8'));
  const restoreReport = JSON.parse(fs.readFileSync(path.join(extractDir, 'restore-report.json'), 'utf8'));
  const bundledSourceFp = fs.readFileSync(path.join(extractDir, 'source-catalog-fingerprint.json'), 'utf8').trim();
  const bundledRestoreFp = fs.readFileSync(path.join(extractDir, 'restore-catalog-fingerprint.json'), 'utf8').trim();

  console.log('Pristine Target Receipt:', JSON.stringify(pristineReceipt));
  assert.equal(pristineReceipt.bootstrap_control_database, 'restore_verification');
  assert.equal(pristineReceipt.target_database_name, 'lari_restore_verification');
  assert.equal(typeof pristineReceipt.target_database_oid, 'number');
  assert.equal(pristineReceipt.template_source, 'template0');
  assert.equal(typeof pristineReceipt.template0_oid, 'number');
  assert.equal(pristineReceipt.datistemplate, false);
  assert.equal(pristineReceipt.database_owner, 'supabase_admin');
  assert.equal(pristineReceipt.bootstrap_superuser_oid10, 'supabase_admin');
  assert.equal(pristineReceipt.server_version_num, '170006');
  assert.deepEqual(pristineReceipt.pre_restore_application_schemas, []);
  assert.equal(pristineReceipt.pre_restore_user_tables_count, 0);
  assert.equal(pristineReceipt.pristine_verified, true);

  assert.equal(restoreReport.verdict, 'VERIFIED_LOGICAL_RESTORE');
  assert.equal(restoreReport.catalog_fingerprint_match, true);
  assert.equal(bundledRestoreFp, bundledSourceFp, 'Bundled source and restored catalog fingerprints must be identical');

  console.log('Step 4 PASS: Full custom dump restored into pristine template0 target with 100% catalog equality.\n');

  console.log('[PRISTINE RESTORE QUALIFICATION SUMMARY]');
  console.log('STATUS: PASS');
  console.log(`QUALIFIED IMAGE: ${qualifiedImage}`);
  console.log('BEFORE-FIX COLLISION REPRODUCED: YES (CREATE SCHEMA auth on restore_verification)');
  console.log('PRISTINE TARGET CREATED FROM TEMPLATE0: YES (lari_restore_verification)');
  console.log('SYNTHETIC ROLE + AUTH + VAULT (0.3.1) + APP RLS/POLICY/FUNCTION RESTORE: PASS');
  console.log('NEGATIVE CASES (HOLD / FAIL / ZERO ARTIFACTS): 7/7 PASS');
  console.log('NOTE: Synthetic fixture verification only; does not claim live staging restore equivalence.\n');
  console.log('='.repeat(76));
  console.log('ALL PRISTINE TEMPLATE0 RESTORE & NEGATIVE QA CHECKS PASSED');
  console.log('='.repeat(76));
} finally {
  fs.rmSync(suiteTempRoot, { recursive: true, force: true });
  console.log('--- Teardown: Container Cleanup ---');
  if (verifiedContainerId && /^[a-f0-9]{64}$/.test(verifiedContainerId)) {
    const inspectRes = dockerCmd(['inspect', '--format', '{{json .Config.Labels}}', verifiedContainerId]);
    if (inspectRes.error || inspectRes.status !== 0 || !inspectRes.stdout.trim()) {
      console.error(`FATAL: Cannot inspect container ${verifiedContainerId} before removal.`);
      process.exit(1);
    }
    const labels = JSON.parse(inspectRes.stdout.trim() || '{}');
    if (labels['lari.qa.pristine.nonce'] !== uniqueId) {
      console.error('SECURITY REFUSAL: Container nonce mismatch during cleanup.');
      process.exit(1);
    }
    const rmRes = dockerCmd(['rm', '-f', verifiedContainerId]);
    if (rmRes.error || rmRes.status !== 0) {
      console.error(`FATAL: docker rm -f failed: ${rmRes.stderr}`);
      process.exit(1);
    }
    const psRes = dockerCmd(['ps', '-aq', '--no-trunc', '--filter', `id=${verifiedContainerId}`]);
    if (psRes.error || psRes.status !== 0 || psRes.stdout.trim() !== '') {
      console.error('FATAL: Container still visible after removal.');
      process.exit(1);
    }
    console.log('CLEANUP_VERIFIED');
  }
}
