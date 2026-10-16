import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const dbUrl = process.env.DB_URL;
const disposableMarker = process.env.LARI_DISPOSABLE_DB;

if (!dbUrl || disposableMarker !== '1') {
  throw new Error('Refusing to run without DB_URL and LARI_DISPOSABLE_DB=1');
}

const parsedUrl = new URL(dbUrl);
if (!['127.0.0.1', 'localhost', '::1'].includes(parsedUrl.hostname)) {
  throw new Error('Refusing to run token-table security tests against a non-loopback database');
}

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const fixturePath = path.join(projectRoot, 'supabase', 'tests', 'fixtures', 'appointment_access_tokens_security_fixture.sql');
const rollbackPath = path.join(projectRoot, 'supabase', 'tests', 'fixtures', 'appointment_access_tokens_security_rollback.sql');
const migrationPath = path.join(projectRoot, 'supabase', 'migrations', '20261011155623_appointment_access_tokens_table_access_hardening.sql');
const fixtureSql = fs.readFileSync(fixturePath, 'utf8');
const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');
const migrationSql = fs.readFileSync(migrationPath, 'utf8');
const admin = new Client({ connectionString: dbUrl });
const expectedPostgresMajor = process.env.EXPECTED_POSTGRES_MAJOR;

const baselineTablePrivileges = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'REFERENCES',
  'TRIGGER',
];

async function tablePrivilegeMatrix(privileges) {
  const result = await admin.query(
    `SELECT requested.privilege,
            has_table_privilege('anon', 'public.appointment_access_tokens', requested.privilege) AS granted
       FROM unnest($1::text[]) AS requested(privilege)
      ORDER BY array_position($1::text[], requested.privilege)`,
    [privileges],
  );
  return result.rows.map((row) => ({ privilege: row.privilege, granted: row.granted }));
}

async function queryAs(role, sql, params = [], subject = null) {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    if (subject) {
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [subject]);
    }
    const result = await client.query(sql, params);
    await client.query('ROLLBACK');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

async function assertPermissionDenied(label, sql, params = []) {
  await assert.rejects(
    queryAs('anon', sql, params),
    (error) => error?.code === '42501',
    `${label} must fail with insufficient_privilege`,
  );
}

await admin.connect();
try {
  const versionResult = await admin.query(
    "SELECT current_setting('server_version') AS version, current_setting('server_version_num')::integer AS version_num",
  );
  const postgresVersion = versionResult.rows[0].version;
  const postgresVersionNum = versionResult.rows[0].version_num;
  const postgresMajor = Math.floor(postgresVersionNum / 10000);

  if (expectedPostgresMajor) {
    assert.equal(
      postgresMajor,
      Number(expectedPostgresMajor),
      `expected PostgreSQL major ${expectedPostgresMajor}, received ${postgresVersion}`,
    );
  }

  const supportedTablePrivileges = postgresMajor >= 17
    ? [...baselineTablePrivileges, 'MAINTAIN']
    : baselineTablePrivileges;

  const existing = await admin.query("SELECT to_regclass('public.appointment_access_tokens') AS table_identity");
  assert.equal(existing.rows[0].table_identity, null, 'fixture database must be fresh and disposable');

  await admin.query(fixtureSql);
  const anonPrivilegesBefore = await tablePrivilegeMatrix(supportedTablePrivileges);
  assert.deepEqual(
    anonPrivilegesBefore,
    supportedTablePrivileges.map((privilege) => ({ privilege, granted: true })),
    'fixture must grant every table privilege supported by this PostgreSQL version to anon',
  );

  const unrelatedAclBefore = await admin.query(
    "SELECT relacl::text AS acl FROM pg_class WHERE oid = 'public.unrelated_permission_fixture'::regclass",
  );

  await admin.query(migrationSql);
  await admin.query(migrationSql);

  const anonPrivilegesAfter = await tablePrivilegeMatrix(supportedTablePrivileges);
  assert.deepEqual(
    anonPrivilegesAfter,
    supportedTablePrivileges.map((privilege) => ({ privilege, granted: false })),
    'migration must revoke every table privilege supported by this PostgreSQL version from anon',
  );

  await assertPermissionDenied('anon SELECT', 'SELECT id FROM public.appointment_access_tokens LIMIT 1');
  await assertPermissionDenied(
    'anon INSERT',
    `INSERT INTO public.appointment_access_tokens
       (tenant_id, appointment_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + interval '1 day')`,
    [
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000003',
      'fixture-denied-insert-not-a-secret',
    ],
  );
  await assertPermissionDenied('anon UPDATE', 'UPDATE public.appointment_access_tokens SET used_at = now()');
  await assertPermissionDenied('anon DELETE', 'DELETE FROM public.appointment_access_tokens');

  const validRpc = await queryAs(
    'anon',
    'SELECT public.get_public_appointment_by_manage_token($1) AS result',
    ['fixture-manage-token-a-not-a-secret'],
  );
  assert.equal(validRpc.rows[0].result.success, true);
  assert.equal(validRpc.rows[0].result.appointment_id, '30000000-0000-0000-0000-000000000001');

  const invalidRpc = await queryAs(
    'anon',
    'SELECT public.get_public_appointment_by_manage_token($1) AS result',
    ['fixture-invalid-token-not-a-secret'],
  );
  assert.deepEqual(invalidRpc.rows[0].result, { success: false, reason_code: 'invalid_token' });

  const cancellationRpc = await queryAs(
    'anon',
    'SELECT public.cancel_public_appointment_by_manage_token($1, $2) AS result',
    ['fixture-manage-token-a-not-a-secret', 'fixture cancellation'],
  );
  assert.equal(cancellationRpc.rows[0].result.success, true);
  assert.equal(cancellationRpc.rows[0].result.reason_code, 'ok');

  const cancellationState = await admin.query(
    `SELECT appointment.status, token.used_at IS NOT NULL AS token_used
       FROM public.appointments appointment
       JOIN public.appointment_access_tokens token ON token.appointment_id = appointment.id
      WHERE appointment.id = '30000000-0000-0000-0000-000000000001'`,
  );
  assert.deepEqual(cancellationState.rows, [{ status: 'cancelled_by_customer', token_used: true }]);

  const rescheduleRpc = await queryAs(
    'anon',
    `SELECT public.request_public_appointment_reschedule_by_manage_token(
       $1, current_date + 14, '14:30'::time, $2, $3
     ) AS result`,
    ['fixture-manage-token-b-not-a-secret', 'fixture reschedule', 'fixture-idempotency-key'],
  );
  assert.equal(rescheduleRpc.rows[0].result.success, true);
  assert.equal(rescheduleRpc.rows[0].result.reason_code, 'ok');
  assert.equal(rescheduleRpc.rows[0].result.idempotency_key_present, true);

  const rescheduleState = await admin.query(
    `SELECT tenant_id, appointment_id, request_type, proposed_time::text, status
       FROM public.appointment_change_requests
      WHERE appointment_id = '30000000-0000-0000-0000-000000000002'`,
  );
  assert.deepEqual(rescheduleState.rows, [{
    tenant_id: '20000000-0000-0000-0000-000000000002',
    appointment_id: '30000000-0000-0000-0000-000000000002',
    request_type: 'reschedule',
    proposed_time: '14:30:00',
    status: 'pending',
  }]);

  const ownerA = await queryAs(
    'authenticated',
    'SELECT tenant_id FROM public.appointment_access_tokens ORDER BY tenant_id',
    [],
    '10000000-0000-0000-0000-000000000001',
  );
  assert.deepEqual(ownerA.rows, [{ tenant_id: '20000000-0000-0000-0000-000000000001' }]);

  const crossTenantUpdate = await queryAs(
    'authenticated',
    `UPDATE public.appointment_access_tokens
        SET used_at = now()
      WHERE tenant_id = '20000000-0000-0000-0000-000000000002'`,
    [],
    '10000000-0000-0000-0000-000000000001',
  );
  assert.equal(crossTenantUpdate.rowCount, 0);

  const superAdmin = await queryAs(
    'authenticated',
    'SELECT count(*)::integer AS count FROM public.appointment_access_tokens',
    [],
    '10000000-0000-0000-0000-000000000003',
  );
  assert.equal(superAdmin.rows[0].count, 2);

  const serviceRole = await queryAs(
    'service_role',
    'SELECT count(*)::integer AS count FROM public.appointment_access_tokens',
  );
  assert.equal(serviceRole.rows[0].count, 2);

  const unrelatedAclAfter = await admin.query(
    "SELECT relacl::text AS acl FROM pg_class WHERE oid = 'public.unrelated_permission_fixture'::regclass",
  );
  assert.equal(unrelatedAclAfter.rows[0].acl, unrelatedAclBefore.rows[0].acl);

  const policyCheck = await admin.query(
    `SELECT policyname
       FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'appointment_access_tokens'
      ORDER BY policyname`,
  );
  assert.deepEqual(policyCheck.rows.map((row) => row.policyname), ['Owner/Admin manage appointment tokens']);

  const permissivePolicy = await admin.query(
    `SELECT 1
       FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'appointment_access_tokens'
        AND policyname = 'Allow public select by token hash'`,
  );
  assert.equal(permissivePolicy.rowCount, 0, 'permissive public SELECT policy must be absent');

  await admin.query(rollbackSql);
  const rollbackPrivileges = await tablePrivilegeMatrix(supportedTablePrivileges);
  assert.deepEqual(
    rollbackPrivileges,
    supportedTablePrivileges.map((privilege) => ({ privilege, granted: true })),
    'disposable rollback must restore the preceding anon privilege matrix',
  );
  const rollbackPolicy = await admin.query(
    `SELECT 1
       FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'appointment_access_tokens'
        AND policyname = 'Allow public select by token hash'`,
  );
  assert.equal(rollbackPolicy.rowCount, 1, 'disposable rollback must restore the preceding policy');

  await admin.query(migrationSql);
  const reapplyPrivileges = await tablePrivilegeMatrix(supportedTablePrivileges);
  assert.deepEqual(
    reapplyPrivileges,
    supportedTablePrivileges.map((privilege) => ({ privilege, granted: false })),
    'hardening must reapply cleanly after a tested rollback',
  );
  const reapplyPolicy = await admin.query(
    `SELECT 1
       FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'appointment_access_tokens'
        AND policyname = 'Allow public select by token hash'`,
  );
  assert.equal(reapplyPolicy.rowCount, 0, 'hardening reapply must remove the permissive policy again');

  console.log(`PostgreSQL version: ${postgresVersion}`);
  console.log(`anon table privileges verified revoked: ${supportedTablePrivileges.join(', ')}`);
  console.log('manage-token read, cancellation, reschedule, rollback and reapply verified');
  console.log('appointment_access_tokens disposable security matrix: PASS');
} finally {
  await admin.end();
}
