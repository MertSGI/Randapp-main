import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

process.env.LC_ALL = 'C';
process.env.LANG = 'C';

function ensureWindowsVcRuntimeOnPath() {
  if (process.platform !== 'win32') return;
  const sysRoot = process.env.SystemRoot || 'C:\\Windows';
  const sys32 = path.join(sysRoot, 'System32');
  const requiredDlls = ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll'];
  const hasAll = (dir) => Boolean(dir) && requiredDlls.every((dll) => fs.existsSync(path.join(dir, dll)));
  if (hasAll(sys32)) return;
  const currentEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  if (currentEntries.some((entry) => hasAll(entry))) return;
  const candidates = [
    path.join(sys32, 'Microsoft-Edge-WebView'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'EdgeWebView', 'Application'),
  ];
  const foundDir = candidates.find((dir) => hasAll(dir));
  if (foundDir) {
    process.env.PATH = `${foundDir}${path.delimiter}${process.env.PATH || ''}`;
  }
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function runPgTests() {
  ensureWindowsVcRuntimeOnPath();
  const rootDir = process.cwd();
  const migrationsDir = path.join(rootDir, 'supabase', 'migrations');
  const testsDir = path.join(rootDir, 'supabase', 'tests');

  const tmpDir = path.join(os.tmpdir(), `lari-d1-pg-replay-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
  const pgDataDir = path.join(tmpDir, 'pgdata');
  fs.mkdirSync(pgDataDir, { recursive: true });

  let pgInstance = null;
  let client = null;
  try {
    const port = await getAvailablePort();
    pgInstance = new EmbeddedPostgres({
      databaseDir: pgDataDir,
      user: 'postgres',
      password: 'password',
      port,
      initdbFlags: ['--locale=C', '--encoding=UTF8', '--no-sync'],
      postgresFlags: ['-F'],
      persistent: false,
    });
    await pgInstance.initialise();
    await pgInstance.start();

    client = pgInstance.getPgClient('postgres', '127.0.0.1');
    await client.connect();
    await client.query(`ALTER DATABASE postgres SET synchronous_commit = 'off'; SET synchronous_commit = 'off';`);
    await client.query(`CREATE SCHEMA IF NOT EXISTS extensions;`);
    const bootstrapSql = fs.readFileSync(path.join(testsDir, 'fixtures', 'p2a_managed_runtime_bootstrap.sql'), 'utf8');
    await client.query(bootstrapSql);

    const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    assert.equal(migrationFiles.length, 98, `Expected 98 total migrations, got ${migrationFiles.length}`);

    const bridgeSql = fs.readFileSync(
      path.join(testsDir, 'fixtures', 'p2a_historical_replay_bridge_before_migration_38.sql'),
      'utf8'
    );
    for (const file of migrationFiles) {
      if (file === '20260813_h1c_commercial_eligibility_and_quota_enforcement.sql') {
        await client.query(bridgeSql);
      }
      if (file === '20260901_payment_webhook_idempotency_and_replay_security.sql') {
        await client.query(`
          ALTER TABLE public.subscriptions
          ADD COLUMN IF NOT EXISTS provider_token TEXT,
          ADD COLUMN IF NOT EXISTS provider_session_id TEXT;
        `);
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      try {
        await client.query(sql);
      } catch (err) {
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
    console.log(`[PASS] Replayed all ${migrationFiles.length} migrations on disposable PG 17`);

    // 1. Single 15-arg create_public_booking overload check (Pilot 4 invariant)
    const procRes = await client.query(`
      SELECT p.oid, pg_get_function_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'create_public_booking';
    `);
    assert.equal(procRes.rows.length, 1, 'pg_proc must contain exactly ONE create_public_booking overload');

    // 2. Setup fixture tenant, owner, staff, service, branch, availability
    const tenantId = 'bbbb2222-b2b2-b2b2-b2b2-bbbbbbbbbbbb';
    const tenantBId = 'cccc3333-c3c3-c3c3-c3c3-cccccccccccc';
    const ownerUid = '11111111-aaaa-1111-aaaa-111111111111';
    const staffUid = '22222222-bbbb-2222-bbbb-222222222222';
    const branchId = '33333333-cccc-3333-cccc-333333333333';
    const serviceId = '44444444-dddd-4444-dddd-444444444444';
    const staffId = '55555555-eeee-5555-eeee-555555555555';

    // Determine a future Monday date within 90 days (ISO weekday 1)
    const d = new Date();
    d.setDate(d.getDate() + 7);
    while (d.getUTCDay() !== 1) {
      d.setDate(d.getDate() + 1);
    }
    const futureDate = d.toISOString().slice(0, 10);

    await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'owner-d1@example.test'), ($2, 'staff-d1@example.test') ON CONFLICT DO NOTHING;`, [ownerUid, staffUid]);
    await client.query(`
      INSERT INTO public.tenants (id, slug, name, status, onboarding_status, public_site_status)
      VALUES
        ($1, 'd1-salon', 'D1 Salon', 'active', 'completed', 'published'),
        ($2, 'd1-salon-b', 'D1 Salon B', 'active', 'completed', 'published');
    `, [tenantId, tenantBId]);
    await client.query(`
      INSERT INTO public.users_profile (id, tenant_id, name, role, active)
      VALUES
        ($1, $3, 'D1 Owner', 'tenant_owner', true),
        ($2, $3, 'D1 Staff', 'staff', true);
    `, [ownerUid, staffUid, tenantId]);
    await client.query(`
      INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode, current_period_start, current_period_end)
      SELECT $1, p.code, pv.id, 'active', 'manual', now(), now() + interval '1 year'
      FROM public.plan_versions pv
      JOIN public.plans p ON p.id = pv.plan_id
      WHERE p.code = 'kurumsal' AND pv.lifecycle_status = 'published'
      LIMIT 1;
    `, [tenantId]);
    await client.query(`
      INSERT INTO public.branches (id, tenant_id, name, slug, is_active, is_primary, timezone)
      VALUES ($1, $2, 'Main Branch', 'main-branch', true, true, 'Europe/Istanbul');
    `, [branchId, tenantId]);
    await client.query(`
      INSERT INTO public.services (id, tenant_id, name, name_tr, duration, price, active)
      VALUES ($1, $2, 'Laser Care', 'Lazer Bakım', 60, 1200, true);
    `, [serviceId, tenantId]);
    await client.query(`
      INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active)
      VALUES ($1, $2, $3, 'D1 Specialist', true);
    `, [staffId, tenantId, staffUid]);
    await client.query(`INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id) VALUES ($1, $2, $3);`, [tenantId, staffId, branchId]);
    await client.query(`INSERT INTO public.service_branches (tenant_id, service_id, branch_id) VALUES ($1, $2, $3);`, [tenantId, serviceId, branchId]);
    await client.query(`INSERT INTO public.staff_services (staff_id, service_id) VALUES ($1, $2);`, [staffId, serviceId]);
    await client.query(`
      INSERT INTO public.availability_rules (tenant_id, staff_id, weekday, start_time, end_time, is_active)
      VALUES ($1, $2, 1, '09:00', '18:00', true);
    `, [tenantId, staffId]);

    // 3. Test 20260909 (Scheduling Constraints: Break + Buffer) & 20260915 (Asymmetric Buffer Parity)
    await client.query(`
      INSERT INTO public.staff_breaks (tenant_id, staff_id, weekday, start_time, end_time, label, is_active)
      VALUES ($1, $2, 1, '12:30', '13:30', 'Lunch', true);
    `, [tenantId, staffId]);
    await client.query(`
      INSERT INTO public.booking_buffer_rules (tenant_id, service_id, buffer_before, buffer_after, is_active)
      VALUES ($1, $2, 0, 15, true);
    `, [tenantId, serviceId]);

    const breakCheck = (await client.query(`
      SELECT public.evaluate_booking_slot($1, $2, $3, $4, $5::date, '12:30'::time) AS res;
    `, [tenantId, branchId, serviceId, staffId, futureDate])).rows[0].res;
    assert.equal(breakCheck.allowed, false);
    assert.equal(breakCheck.reason_code, 'staff_break');

    // 4. Test 20260912 (Resource Capacity & Atomic Allocation via create_public_booking)
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [ownerUid]);
    const resCreate = (await client.query(`
      SELECT public.admin_create_resource($1, $2, 'Room A', 'room', 1) AS res;
    `, [tenantId, branchId])).rows[0].res;
    assert.equal(resCreate.success, true);
    const resourceId = resCreate.resource_id;

    const reqCreate = (await client.query(`
      SELECT public.admin_set_service_resource_requirement($1, $2, $3, 'room', 1, true) AS res;
    `, [tenantId, serviceId, resourceId])).rows[0].res;
    assert.equal(reqCreate.success, true);

    // Book at 10:00 via canonical 15-arg create_public_booking as anon
    await client.query(`SELECT set_config('request.jwt.claim.sub', '', false); SET ROLE anon;`);
    const bookRes = (await client.query(`
      SELECT public.create_public_booking(
        'd1-salon', $1, $2, $3::date, '10:00'::time,
        'Ali Veli', 'ali@example.test', '+905551112233',
        true, false, false, 'idemp-d1-1', $4, NULL, 'fp-d1'
      ) AS res;
    `, [serviceId, staffId, futureDate, branchId])).rows[0].res;
    await client.query(`RESET ROLE;`);
    assert.equal(bookRes.success, true, `Expected booking success, got ${JSON.stringify(bookRes)}`);
    assert.equal(bookRes.allocation_plan.length, 1);
    assert.equal(bookRes.allocation_plan[0].resource_id, resourceId);

    // Verify 20260915 asymmetric buffer parity: 11:00 is inside 10:00-11:00 + 15min buffer_after -> slot_conflict!
    const bufferConflict = (await client.query(`
      SELECT public.evaluate_booking_slot($1, $2, $3, $4, $5::date, '11:00'::time) AS res;
    `, [tenantId, branchId, serviceId, staffId, futureDate])).rows[0].res;
    assert.equal(bufferConflict.allowed, false);
    assert.equal(bufferConflict.reason_code, 'slot_conflict');

    // 11:15 is outside 15min buffer_after -> allowed!
    const afterBufferOk = (await client.query(`
      SELECT public.evaluate_booking_slot($1, $2, $3, $4, $5::date, '11:15'::time) AS res;
    `, [tenantId, branchId, serviceId, staffId, futureDate])).rows[0].res;
    assert.equal(afterBufferOk.allowed, true);
    console.log('[PASS] Scheduling, resource allocation & asymmetric buffer parity verified');

    // 5. Test 20260910 (Waitlist Lifecycle + Rate-Limit + Sanitized Projection + Token Claim)
    await client.query(`SET ROLE anon;`);
    const joinRes = (await client.query(`
      SELECT public.join_booking_waitlist(
        $1, $2, $3::date, 'Ayşe Kaya', '+905559998877', 'ayse@example.test', $4, $5
      ) AS res;
    `, [tenantId, serviceId, futureDate, staffId, branchId])).rows[0].res;
    await client.query(`RESET ROLE;`);
    assert.equal(joinRes.success, true, `Waitlist join failed: ${JSON.stringify(joinRes)}`);

    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [ownerUid]);
    await client.query(`SET ROLE authenticated;`);
    const offerRes = (await client.query(`
      SELECT public.offer_waitlist_slot($1, $2::date, '14:00'::time, $3, $4, 60) AS res;
    `, [joinRes.waitlist_id, futureDate, staffId, branchId])).rows[0].res;
    assert.equal(offerRes.success, true);
    assert.ok(offerRes.claim_token && offerRes.claim_token.length === 64);

    const listed = (await client.query(`SELECT * FROM public.get_sanitized_waitlist_entries($1);`, [tenantId])).rows;
    assert.equal(listed.length, 1);
    assert.equal('claim_token_hash' in listed[0], false, 'claim_token_hash must never be exposed');
    await client.query(`RESET ROLE;`);

    await client.query(`SELECT set_config('request.jwt.claim.sub', '', false); SET ROLE anon;`);
    const claimRes = (await client.query(`
      SELECT public.claim_waitlist_slot($1) AS res;
    `, [offerRes.claim_token])).rows[0].res;
    await client.query(`RESET ROLE;`);
    assert.equal(claimRes.success, true, `Waitlist claim failed: ${JSON.stringify(claimRes)}`);
    assert.equal(claimRes.status, 'claimed');

    // ADIM033-RES-001: Verify waitlist claim persisted exact appointment_resources row
    const waitlistResRows = (await client.query(`
      SELECT resource_id, quantity FROM public.appointment_resources WHERE appointment_id = $1;
    `, [claimRes.appointment_id])).rows;
    assert.equal(waitlistResRows.length, 1, 'Waitlist claim must persist appointment_resources row');
    assert.equal(waitlistResRows[0].resource_id, resourceId);
    assert.equal(waitlistResRows[0].quantity, 1);

    // ADIM033-RES-001 negative: two offers for different staff at same time sharing capacity-1 Room A -> only first claim succeeds
    const staff2Uid = '66666666-ffff-6666-ffff-666666666666';
    const staff2Id = '77777777-1111-7777-1111-777777777777';
    await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'staff2-d1@example.test') ON CONFLICT DO NOTHING;`, [staff2Uid]);
    await client.query(`INSERT INTO public.users_profile (id, tenant_id, name, role, active) VALUES ($1, $2, 'D1 Staff 2', 'staff', true);`, [staff2Uid, tenantId]);
    await client.query(`INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active) VALUES ($1, $2, $3, 'D1 Specialist 2', true);`, [staff2Id, tenantId, staff2Uid]);
    await client.query(`INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id) VALUES ($1, $2, $3);`, [tenantId, staff2Id, branchId]);
    await client.query(`INSERT INTO public.staff_services (staff_id, service_id) VALUES ($1, $2);`, [staff2Id, serviceId]);
    await client.query(`INSERT INTO public.availability_rules (tenant_id, staff_id, weekday, start_time, end_time, is_active) VALUES ($1, $2, 1, '09:00', '18:00', true);`, [tenantId, staff2Id]);

    await client.query(`SET ROLE anon;`);
    const joinA = (await client.query(`SELECT public.join_booking_waitlist($1, $2, $3::date, 'Müşteri A', '+905559990001', 'a@example.test', $4, $5) AS res;`, [tenantId, serviceId, futureDate, staffId, branchId])).rows[0].res;
    const joinB = (await client.query(`SELECT public.join_booking_waitlist($1, $2, $3::date, 'Müşteri B', '+905559990002', 'b@example.test', $4, $5) AS res;`, [tenantId, serviceId, futureDate, staff2Id, branchId])).rows[0].res;
    await client.query(`RESET ROLE;`);
    assert.equal(joinA.success, true);
    assert.equal(joinB.success, true);

    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [ownerUid]);
    await client.query(`SET ROLE authenticated;`);
    const offerA = (await client.query(`SELECT public.offer_waitlist_slot($1, $2::date, '15:30'::time, $3, $4, 60) AS res;`, [joinA.waitlist_id, futureDate, staffId, branchId])).rows[0].res;
    const offerB = (await client.query(`SELECT public.offer_waitlist_slot($1, $2::date, '15:30'::time, $3, $4, 60) AS res;`, [joinB.waitlist_id, futureDate, staff2Id, branchId])).rows[0].res;
    await client.query(`RESET ROLE;`);
    assert.equal(offerA.success, true);
    assert.equal(offerB.success, true);

    await client.query(`SELECT set_config('request.jwt.claim.sub', '', false); SET ROLE anon;`);
    const claimA = (await client.query(`SELECT public.claim_waitlist_slot($1) AS res;`, [offerA.claim_token])).rows[0].res;
    const claimB = (await client.query(`SELECT public.claim_waitlist_slot($1) AS res;`, [offerB.claim_token])).rows[0].res;
    await client.query(`RESET ROLE;`);
    assert.equal(claimA.success, true, `First waitlist claim should succeed: ${JSON.stringify(claimA)}`);
    const claimAResRows = (await client.query(`SELECT resource_id, quantity FROM public.appointment_resources WHERE appointment_id = $1;`, [claimA.appointment_id])).rows;
    assert.equal(claimAResRows.length, 1);
    assert.equal(claimAResRows[0].resource_id, resourceId);
    assert.equal(claimAResRows[0].quantity, 1);
    assert.equal(claimB.success, false, 'Second waitlist claim sharing capacity-1 room must be rejected');
    assert.equal(claimB.reason_code, 'resource_unavailable');
    console.log('[PASS] Waitlist lifecycle & cross-staff resource lock invariant (ADIM033-RES-001) verified');

    // ADIM033-RES-002: Overlapping requirements within single allocation_plan must account for planned quantities & merge per resource_id
    const serviceOverlapId = '88888888-2222-8888-2222-888888888888';
    const serviceMergedId = '99999999-3333-9999-3333-999999999999';
    await client.query(`
      INSERT INTO public.services (id, tenant_id, name, name_tr, duration, price, active)
      VALUES
        ($1, $3, 'Overlap Room Service', 'Çakışan Oda', 45, 900, true),
        ($2, $3, 'Merged Chair Service', 'Birleşik Koltuk', 45, 700, true);
    `, [serviceOverlapId, serviceMergedId, tenantId]);
    await client.query(`INSERT INTO public.service_branches (tenant_id, service_id, branch_id) VALUES ($1, $2, $4), ($1, $3, $4);`, [tenantId, serviceOverlapId, serviceMergedId, branchId]);
    await client.query(`INSERT INTO public.staff_services (staff_id, service_id) VALUES ($1, $2), ($1, $3);`, [staffId, serviceOverlapId, serviceMergedId]);

    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [ownerUid]);
    await client.query(`SELECT public.admin_set_service_resource_requirement($1, $2, $3, 'room', 1, true);`, [tenantId, serviceOverlapId, resourceId]);
    await client.query(`SELECT public.admin_set_service_resource_requirement($1, $2, NULL, 'room', 1, true);`, [tenantId, serviceOverlapId]);

    const overlapPlan = (await client.query(`
      SELECT public.evaluate_and_lock_resource_plan($1, $2, $3, $4::date, '16:45'::time, 45, NULL, FALSE) AS res;
    `, [tenantId, branchId, serviceOverlapId, futureDate])).rows[0].res;
    assert.equal(overlapPlan.allowed, false, 'Overlapping requirements on capacity-1 room must fail with resource_unavailable');
    assert.equal(overlapPlan.reason_code, 'resource_unavailable');

    await client.query(`SELECT set_config('request.jwt.claim.sub', '', false); SET ROLE anon;`);
    const overlapBook = (await client.query(`
      SELECT public.create_public_booking(
        'd1-salon', $1, $2, $3::date, '16:45'::time,
        'Veli Can', 'veli@example.test', '+905551112299',
        true, false, false, 'idemp-overlap-1', $4, NULL, 'fp-overlap'
      ) AS res;
    `, [serviceOverlapId, staffId, futureDate, branchId])).rows[0].res;
    await client.query(`RESET ROLE;`);
    assert.equal(overlapBook.success, false);
    assert.equal(overlapBook.reason_code, 'resource_unavailable');

    // Capacity-2 resource satisfying two quantity=1 requirements merges into single appointment_resources row (quantity=2)
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [ownerUid]);
    const chairRes = (await client.query(`SELECT public.admin_create_resource($1, $2, 'Double Chair', 'chair', 2) AS res;`, [tenantId, branchId])).rows[0].res;
    assert.equal(chairRes.success, true);
    await client.query(`SELECT public.admin_set_service_resource_requirement($1, $2, $3, 'chair', 1, true);`, [tenantId, serviceMergedId, chairRes.resource_id]);
    await client.query(`SELECT public.admin_set_service_resource_requirement($1, $2, NULL, 'chair', 1, true);`, [tenantId, serviceMergedId]);

    await client.query(`SELECT set_config('request.jwt.claim.sub', '', false); SET ROLE anon;`);
    const mergedBook = (await client.query(`
      SELECT public.create_public_booking(
        'd1-salon', $1, $2, $3::date, '16:45'::time,
        'Deniz Ak', 'deniz@example.test', '+905551112288',
        true, false, false, 'idemp-merged-1', $4, NULL, 'fp-merged'
      ) AS res;
    `, [serviceMergedId, staffId, futureDate, branchId])).rows[0].res;
    await client.query(`RESET ROLE;`);
    assert.equal(mergedBook.success, true, `Expected merged chair booking success, got ${JSON.stringify(mergedBook)}`);
    assert.equal(mergedBook.allocation_plan.length, 1, 'Plan must merge overlapping allocations per resource_id');
    assert.equal(mergedBook.allocation_plan[0].quantity, 2);
    const mergedArRows = (await client.query(`SELECT resource_id, quantity FROM public.appointment_resources WHERE appointment_id = $1;`, [mergedBook.appointment_id])).rows;
    assert.equal(mergedArRows.length, 1);
    assert.equal(mergedArRows[0].quantity, 2);
    console.log('[PASS] Intra-plan resource capacity & merge invariant (ADIM033-RES-002) verified');

    // 6. Test 20260911 (Calendar Sync Queue & Background Job Worker Lifecycle + ADIM033-JOB-004 Fencing)
    const jobLegacyProcs = (await client.query(`
      SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_arguments(p.oid) AS full_args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('complete_background_job', 'fail_background_job')
      ORDER BY p.proname;
    `)).rows;
    assert.equal(jobLegacyProcs.length, 2, 'Only hardened complete_background_job and fail_background_job signatures may exist');
    assert.ok(jobLegacyProcs.every((r) => r.args.includes('p_worker_id text')), 'Finalize RPCs must require p_worker_id');
    assert.ok(
      jobLegacyProcs.every((r) => r.full_args.includes('p_lease_token uuid') && !r.full_args.includes('p_lease_token uuid DEFAULT')),
      'Finalize RPCs must require p_lease_token without DEFAULT'
    );

    const calCrossTenant = (await client.query(`
      SELECT public.enqueue_calendar_sync($1, $2, 'deterministic_test') AS res;
    `, [tenantBId, bookRes.appointment_id])).rows[0].res;
    assert.equal(calCrossTenant.success, false);
    assert.equal(calCrossTenant.error, 'APPOINTMENT_TENANT_MISMATCH');

    const calOk = (await client.query(`
      SELECT public.enqueue_calendar_sync($1, $2, 'deterministic_test') AS res;
    `, [tenantId, bookRes.appointment_id])).rows[0].res;
    assert.equal(calOk.success, true);

    const jobEnq = (await client.query(`
      SELECT public.enqueue_background_job('booking_availability_refresh', $1, '{}'::jsonb, 'job-d1-1', 2) AS res;
    `, [tenantId])).rows[0].res;
    assert.equal(jobEnq.success, true);

    // Negative ADIM033-JOB-004: Unclaimed job cannot be completed or failed (and tokenless calls are rejected)
    const dummyToken = crypto.randomUUID();
    const unclaimedComplete = (await client.query(`
      SELECT public.complete_background_job($1, 'worker-1', $2, '{"ok":true}'::jsonb) AS res;
    `, [jobEnq.job_id, dummyToken])).rows[0].res;
    assert.equal(unclaimedComplete.success, false);
    assert.equal(unclaimedComplete.error, 'JOB_LEASE_INVALID_OR_NOT_PROCESSING');

    const unclaimedFail = (await client.query(`
      SELECT public.fail_background_job($1, 'worker-1', $2, 'ERR', 'unclaimed') AS res;
    `, [jobEnq.job_id, dummyToken])).rows[0].res;
    assert.equal(unclaimedFail.success, false);
    assert.equal(unclaimedFail.error, 'JOB_LEASE_INVALID_OR_NOT_PROCESSING');

    await assert.rejects(
      async () => client.query(`SELECT public.complete_background_job($1, 'worker-1', '{"ok":true}'::jsonb) AS res;`, [jobEnq.job_id]),
      (err) => err && err.code === '42883',
      'Tokenless complete_background_job call must be rejected by signature'
    );
    await assert.rejects(
      async () => client.query(`SELECT public.fail_background_job($1, 'worker-1', 'ERR', 'no token', 10) AS res;`, [jobEnq.job_id]),
      (err) => err && err.code === '42883',
      'Tokenless fail_background_job call must be rejected by signature'
    );

    // Claim as worker-1 -> non-owner worker-2 rejected -> expire lease & reclaim as worker-2 -> stale worker-1 rejected -> worker-2 succeeds
    const claimed1 = (await client.query(`SELECT public.claim_background_job_batch('worker-1', 5, 60) AS res;`)).rows[0].res;
    assert.equal(claimed1.claimed_count, 1);
    const token1 = claimed1.claimed_jobs[0].lease_token;
    assert.ok(token1);

    const wrongWorkerComplete = (await client.query(`
      SELECT public.complete_background_job($1, 'worker-2', $2, '{"ok":true}'::jsonb) AS res;
    `, [jobEnq.job_id, token1])).rows[0].res;
    assert.equal(wrongWorkerComplete.success, false);

    const nullTokenComplete = (await client.query(`
      SELECT public.complete_background_job($1, 'worker-1', NULL::uuid, '{"ok":true}'::jsonb) AS res;
    `, [jobEnq.job_id])).rows[0].res;
    assert.equal(nullTokenComplete.success, false);
    assert.equal(nullTokenComplete.error, 'JOB_LEASE_INVALID_OR_NOT_PROCESSING');

    await client.query(`UPDATE public.background_job_runs SET lease_until = NOW() - interval '5 seconds' WHERE id = $1;`, [jobEnq.job_id]);
    const claimed2 = (await client.query(`SELECT public.claim_background_job_batch('worker-2', 5, 60) AS res;`)).rows[0].res;
    assert.equal(claimed2.claimed_count, 1);
    const token2 = claimed2.claimed_jobs[0].lease_token;
    assert.notEqual(token2, token1);

    const staleWorkerComplete = (await client.query(`
      SELECT public.complete_background_job($1, 'worker-1', $2, '{"stale":true}'::jsonb) AS res;
    `, [jobEnq.job_id, token1])).rows[0].res;
    assert.equal(staleWorkerComplete.success, false);

    const staleWorkerFail = (await client.query(`
      SELECT public.fail_background_job($1, 'worker-1', $2, 'STALE', 'stale fail', 10) AS res;
    `, [jobEnq.job_id, token1])).rows[0].res;
    assert.equal(staleWorkerFail.success, false);

    const completed = (await client.query(`
      SELECT public.complete_background_job($1, 'worker-2', $2, '{"ok":true}'::jsonb) AS res;
    `, [jobEnq.job_id, token2])).rows[0].res;
    assert.equal(completed.success, true);
    assert.equal(completed.status, 'completed');

    // Negative ADIM033-JOB-004 (same worker_id fencing): expire lease and reclaim with SAME worker_id -> old token & missing/NULL token rejected, only new token succeeds
    const jobSameWorker = (await client.query(`
      SELECT public.enqueue_background_job('booking_availability_refresh', $1, '{}'::jsonb, 'job-d1-same-worker', 3) AS res;
    `, [tenantId])).rows[0].res;
    assert.equal(jobSameWorker.success, true);

    const sameClaim1 = (await client.query(`SELECT public.claim_background_job_batch('worker-same', 5, 60) AS res;`)).rows[0].res;
    assert.equal(sameClaim1.claimed_count, 1);
    const sameToken1 = sameClaim1.claimed_jobs[0].lease_token;
    assert.ok(sameToken1);

    await client.query(`UPDATE public.background_job_runs SET lease_until = NOW() - interval '5 seconds' WHERE id = $1;`, [jobSameWorker.job_id]);
    const sameClaim2 = (await client.query(`SELECT public.claim_background_job_batch('worker-same', 5, 60) AS res;`)).rows[0].res;
    assert.equal(sameClaim2.claimed_count, 1);
    const sameToken2 = sameClaim2.claimed_jobs[0].lease_token;
    assert.notEqual(sameToken2, sameToken1);

    const sameOldTokenComplete = (await client.query(`
      SELECT public.complete_background_job($1, 'worker-same', $2, '{"stale":true}'::jsonb) AS res;
    `, [jobSameWorker.job_id, sameToken1])).rows[0].res;
    assert.equal(sameOldTokenComplete.success, false);
    assert.equal(sameOldTokenComplete.error, 'JOB_LEASE_INVALID_OR_NOT_PROCESSING');

    const sameOldTokenFail = (await client.query(`
      SELECT public.fail_background_job($1, 'worker-same', $2, 'STALE', 'old token', 10) AS res;
    `, [jobSameWorker.job_id, sameToken1])).rows[0].res;
    assert.equal(sameOldTokenFail.success, false);
    assert.equal(sameOldTokenFail.error, 'JOB_LEASE_INVALID_OR_NOT_PROCESSING');

    const sameNullTokenComplete = (await client.query(`
      SELECT public.complete_background_job($1, 'worker-same', NULL::uuid, '{"nullToken":true}'::jsonb) AS res;
    `, [jobSameWorker.job_id])).rows[0].res;
    assert.equal(sameNullTokenComplete.success, false);
    assert.equal(sameNullTokenComplete.error, 'JOB_LEASE_INVALID_OR_NOT_PROCESSING');

    const sameNullTokenFail = (await client.query(`
      SELECT public.fail_background_job($1, 'worker-same', NULL::uuid, 'NULL_TOK', 'null token', 10) AS res;
    `, [jobSameWorker.job_id])).rows[0].res;
    assert.equal(sameNullTokenFail.success, false);
    assert.equal(sameNullTokenFail.error, 'JOB_LEASE_INVALID_OR_NOT_PROCESSING');

    const sameNewTokenComplete = (await client.query(`
      SELECT public.complete_background_job($1, 'worker-same', $2, '{"fresh":true}'::jsonb) AS res;
    `, [jobSameWorker.job_id, sameToken2])).rows[0].res;
    assert.equal(sameNewTokenComplete.success, true);
    assert.equal(sameNewTokenComplete.status, 'completed');

    // Also test fail_background_job retryable -> dead_letter lifecycle (including same-worker reclaim fencing before valid fail)
    const jobEnq2 = (await client.query(`
      SELECT public.enqueue_background_job('data_export_reminder', $1, '{}'::jsonb, 'job-d1-2', 3) AS res;
    `, [tenantId])).rows[0].res;
    const claimF1 = (await client.query(`SELECT public.claim_background_job_batch('worker-f', 5, 60) AS res;`)).rows[0].res;
    const fToken1 = claimF1.claimed_jobs[0].lease_token;
    await client.query(`UPDATE public.background_job_runs SET lease_until = NOW() - interval '5 seconds' WHERE id = $1;`, [jobEnq2.job_id]);
    const claimF2 = (await client.query(`SELECT public.claim_background_job_batch('worker-f', 5, 60) AS res;`)).rows[0].res;
    const fToken2 = claimF2.claimed_jobs[0].lease_token;
    assert.notEqual(fToken2, fToken1);

    const staleSameWorkerFail = (await client.query(`
      SELECT public.fail_background_job($1, 'worker-f', $2, 'STALE_ERR', 'stale token', 1) AS res;
    `, [jobEnq2.job_id, fToken1])).rows[0].res;
    assert.equal(staleSameWorkerFail.success, false);

    const fail1 = (await client.query(`
      SELECT public.fail_background_job($1, 'worker-f', $2, 'TMP_ERR', 'retryable', 1) AS res;
    `, [jobEnq2.job_id, fToken2])).rows[0].res;
    assert.equal(fail1.success, true);
    assert.equal(fail1.status, 'failed_retryable');
    await client.query(`UPDATE public.background_job_runs SET next_attempt_at = NOW() - interval '1 second' WHERE id = $1;`, [jobEnq2.job_id]);
    const claimF3 = (await client.query(`SELECT public.claim_background_job_batch('worker-f', 5, 60) AS res;`)).rows[0].res;
    const fail2 = (await client.query(`
      SELECT public.fail_background_job($1, 'worker-f', $2, 'FATAL_ERR', 'dead letter', 1) AS res;
    `, [jobEnq2.job_id, claimF3.claimed_jobs[0].lease_token])).rows[0].res;
    assert.equal(fail2.success, true);
    assert.equal(fail2.status, 'dead_letter');
    console.log('[PASS] Calendar sync queue & fenced background job worker lifecycle (ADIM033-JOB-004) verified');

    // 7. Test 20260913 (Reporting & Analytics RPCs + ADIM033-ANA-003 Role Allowlist & Staff Branch Scoping)
    const branch2Id = 'aaaaaaaa-4444-aaaa-4444-aaaaaaaaaaaa';
    const serviceB2Id = 'bbbbbbbb-5555-bbbb-5555-bbbbbbbbbbbb';
    const staffB2Id = 'cccccccc-6666-cccc-6666-cccccccccccc';
    const customerUid = 'dddddddd-7777-dddd-7777-dddddddddddd';
    const customerB2Id = 'eeeeeeee-8888-eeee-8888-eeeeeeeeeeee';
    await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'customer-d1@example.test') ON CONFLICT DO NOTHING;`, [customerUid]);
    await client.query(`INSERT INTO public.users_profile (id, tenant_id, name, role, active) VALUES ($1, $2, 'D1 Customer', 'customer', true);`, [customerUid, tenantId]);
    await client.query(`INSERT INTO public.branches (id, tenant_id, name, slug, is_active, is_primary, timezone) VALUES ($1, $2, 'Unassigned Branch', 'unassigned-branch', true, false, 'Europe/Istanbul');`, [branch2Id, tenantId]);
    await client.query(`INSERT INTO public.services (id, tenant_id, name, name_tr, duration, price, active) VALUES ($1, $2, 'Branch 2 Only Service', 'Şube 2 Özel', 30, 800, true);`, [serviceB2Id, tenantId]);
    await client.query(`INSERT INTO public.staff (id, tenant_id, name, active) VALUES ($1, $2, 'Branch 2 Staff', true);`, [staffB2Id, tenantId]);
    await client.query(`INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id) VALUES ($1, $2, $3);`, [tenantId, staffB2Id, branch2Id]);
    await client.query(`INSERT INTO public.service_branches (tenant_id, service_id, branch_id) VALUES ($1, $2, $3);`, [tenantId, serviceB2Id, branch2Id]);
    await client.query(`INSERT INTO public.staff_services (staff_id, service_id) VALUES ($1, $2);`, [staffB2Id, serviceB2Id]);
    await client.query(`INSERT INTO public.customers (id, tenant_id, name, phone) VALUES ($1, $2, 'Branch2 Cust', '+905558887766');`, [customerB2Id, tenantId]);
    await client.query(`
      INSERT INTO public.appointments (tenant_id, branch_id, customer_id, user_name, phone, service_id, staff_id, appointment_date, appointment_time, duration_minutes, status)
      VALUES ($1, $2, $3, 'Branch2 Cust', '+905558887766', $4, $5, $6::date, '11:00'::time, 30, 'confirmed');
    `, [tenantId, branch2Id, customerB2Id, serviceB2Id, staffB2Id, futureDate]);

    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [ownerUid]);
    await client.query(`SET ROLE authenticated;`);
    const bookingAnalytics = (await client.query(`
      SELECT public.get_tenant_booking_analytics($1, NULL, $2::date, $2::date) AS res;
    `, [tenantId, futureDate])).rows[0].res;
    assert.equal(bookingAnalytics.metrics.total_bookings, 5);
    assert.equal(bookingAnalytics.metrics.financial_metric_classification, 'ESTIMATED_REVENUE');
    assert.equal(bookingAnalytics.attribution.acquisition_source_status, 'NOT_AVAILABLE_IN_CURRENT_SOURCE_TRUTH');

    const branchComp = (await client.query(`
      SELECT public.get_tenant_branch_comparison_analytics($1, $2::date, $2::date) AS res;
    `, [tenantId, futureDate])).rows[0].res;
    assert.equal(branchComp.branch_comparison.length, 2);
    await client.query(`RESET ROLE;`);

    // Negative ADIM033-ANA-003: customer role in same tenant must receive SQLSTATE 42501 on ALL 5 analytics RPCs
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [customerUid]);
    await client.query(`SET ROLE authenticated;`);
    const customerRpcCalls = [
      [`SELECT public.get_tenant_booking_analytics($1, $2, $3::date, $3::date);`, [tenantId, branchId, futureDate]],
      [`SELECT public.get_tenant_staff_performance_analytics($1, $2, $3::date, $3::date);`, [tenantId, branchId, futureDate]],
      [`SELECT public.get_tenant_service_performance_analytics($1, $2, $3::date, $3::date);`, [tenantId, branchId, futureDate]],
      [`SELECT public.get_tenant_branch_comparison_analytics($1, $2::date, $2::date);`, [tenantId, futureDate]],
      [`SELECT public.get_tenant_customer_retention_analytics($1, $2::date, $2::date);`, [tenantId, futureDate]],
    ];
    for (const [sqlText, params] of customerRpcCalls) {
      await assert.rejects(
        async () => client.query(sqlText, params),
        (err) => err && err.code === '42501',
        `Customer must receive 42501 for ${sqlText}`
      );
    }
    await client.query(`RESET ROLE;`);

    // Staff branch scoping: staffUid (only assigned to branchId) denied on branch2Id, scoped to branchId when branch=NULL
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [staffUid]);
    await client.query(`SET ROLE authenticated;`);
    await assert.rejects(
      async () => client.query(`SELECT public.get_tenant_booking_analytics($1, $2, $3::date, $3::date);`, [tenantId, branch2Id, futureDate]),
      (err) => err && err.code === '42501'
    );
    await assert.rejects(
      async () => client.query(`SELECT public.get_tenant_service_performance_analytics($1, $2, $3::date, $3::date);`, [tenantId, branch2Id, futureDate]),
      (err) => err && err.code === '42501'
    );
    const staffAssignedBooking = (await client.query(`
      SELECT public.get_tenant_booking_analytics($1, $2, $3::date, $3::date) AS res;
    `, [tenantId, branchId, futureDate])).rows[0].res;
    assert.equal(staffAssignedBooking.metrics.total_bookings, 4);

    const staffBranchComp = (await client.query(`
      SELECT public.get_tenant_branch_comparison_analytics($1, $2::date, $2::date) AS res;
    `, [tenantId, futureDate])).rows[0].res;
    assert.equal(staffBranchComp.branch_comparison.length, 1);
    assert.equal(staffBranchComp.branch_comparison[0].branch_id, branchId);

    const staffServices = (await client.query(`
      SELECT public.get_tenant_service_performance_analytics($1, NULL, $2::date, $2::date) AS res;
    `, [tenantId, futureDate])).rows[0].res;
    assert.equal(
      staffServices.service_performance.some((s) => s.service_id === serviceB2Id),
      false,
      'Staff must not see unassigned branch-exclusive service analytics'
    );

    const ownerRetention = await (async () => {
      await client.query(`RESET ROLE;`);
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [ownerUid]);
    await client.query(`SET ROLE authenticated;`);
      return (await client.query(`SELECT public.get_tenant_customer_retention_analytics($1, $2::date, $2::date) AS res;`, [tenantId, futureDate])).rows[0].res;
    })();
    await client.query(`RESET ROLE;`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [staffUid]);
    await client.query(`SET ROLE authenticated;`);
    const staffRetention = (await client.query(`
      SELECT public.get_tenant_customer_retention_analytics($1, $2::date, $2::date) AS res;
    `, [tenantId, futureDate])).rows[0].res;
    assert.equal(
      staffRetention.retention_metrics.total_active_customers,
      ownerRetention.retention_metrics.total_active_customers - 1,
      'Staff retention metrics must exclude customers from unassigned branches'
    );
    await client.query(`RESET ROLE;`);
    console.log('[PASS] Reporting & analytics RPCs + role/branch scoping (ADIM033-ANA-003) verified');

    // 8. Test 20260914 (Custom Domain Verification & EXTERNAL_HOLD Non-Live Resolution)
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [ownerUid]);
    await client.query(`SET ROLE authenticated;`);
    const domReq = (await client.query(`
      SELECT public.request_custom_domain($1, 'https://booking.d1salon.com:443/') AS res;
    `, [tenantId])).rows[0].res;
    assert.equal(domReq.success, true);
    assert.equal(domReq.normalized_hostname, 'booking.d1salon.com');
    assert.equal(domReq.provider_status, 'DOMAIN_PROVIDER_READY_NOT_CONNECTED');

    const domList = (await client.query(`SELECT public.get_tenant_custom_domains($1) AS res;`, [tenantId])).rows[0].res;
    assert.equal(domList.domains.length, 1);
    await client.query(`RESET ROLE;`);

    // Simulate verification -> TEST_PROVIDER_SIMULATED_VERIFIED must NOT resolve live
    const simVerify = (await client.query(`
      SELECT public.simulate_verify_custom_domain_for_testing($1, $2, $3) AS res;
    `, [tenantId, domReq.domain_id, domReq.verification_expected_value])).rows[0].res;
    assert.equal(simVerify.provider_status, 'TEST_PROVIDER_SIMULATED_VERIFIED');

    const liveResolve = (await client.query(`
      SELECT public.resolve_tenant_by_custom_domain('booking.d1salon.com') AS res;
    `)).rows[0].res;
    assert.equal(liveResolve.resolved, false, 'Simulated domain must NOT resolve as live tenant');
    console.log('[PASS] Custom domain EXTERNAL_HOLD invariant verified');

    // 9. Test ADIM-034 Phase 6 (20260916..20260919): POS, Product Inventory, Suppliers/PO & Staff Commissions/Tips
    const posOverloads = (await client.query(`
      SELECT p.proname, count(*)::int AS cnt
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('pos_add_cart_item', 'pos_checkout_order')
      GROUP BY p.proname;
    `)).rows;
    assert.equal(posOverloads.length, 2);
    assert.ok(posOverloads.every((r) => r.cnt === 1), 'pos_add_cart_item and pos_checkout_order must each have 1 overload');

    // Setup owner staff record + second staff + tenant B staff for Phase 6 tests
    const ownerStaffId = '11111111-2222-3333-4444-555555555551';
    const tenantBStaffUid = 'bbbbbbbb-9999-bbbb-9999-bbbbbbbbbbbb';
    const tenantBStaffId = 'bbbbbbbb-9999-bbbb-9999-bbbbbbbbbbb2';
    const superAdminUid = '99999999-9999-9999-9999-999999999991';
    const inactiveStaffUid = '88888888-8888-8888-8888-888888888881';
    const inactiveStaffId = '88888888-8888-8888-8888-888888888882';

    await client.query(`
      INSERT INTO auth.users (id, email)
      VALUES ($1, 'staff-b@example.test'), ($2, 'super@example.test'), ($3, 'inactive-up@example.test')
      ON CONFLICT DO NOTHING;
    `, [tenantBStaffUid, superAdminUid, inactiveStaffUid]);
    await client.query(`
      INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode, current_period_start, current_period_end)
      SELECT $1, p.code, pv.id, 'active', 'manual', now(), now() + interval '1 year'
      FROM public.plan_versions pv
      JOIN public.plans p ON p.id = pv.plan_id
      WHERE p.code = 'kurumsal' AND pv.lifecycle_status = 'published'
      LIMIT 1;
    `, [tenantBId]);
    await client.query(`
      INSERT INTO public.users_profile (id, tenant_id, name, role, active)
      VALUES
        ($1, $4, 'Tenant B Staff', 'staff', true),
        ($2, NULL, 'Super Admin', 'super_admin', true),
        ($3, $5, 'Deactivated Profile Staff', 'staff', false);
    `, [tenantBStaffUid, superAdminUid, inactiveStaffUid, tenantBId, tenantId]);
    await client.query(`
      INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active, is_owner)
      VALUES
        ($1, $4, $5, 'Owner Staff', true, true),
        ($2, $6, $7, 'Tenant B Staff', true, false),
        ($3, $4, $8, 'Inactive Profile Staff', true, false);
    `, [ownerStaffId, tenantBStaffId, inactiveStaffId, tenantId, ownerUid, tenantBId, tenantBStaffUid, inactiveStaffUid]);

    const setAuthUid = async (uid) => {
      await client.query(`RESET ROLE;`);
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [uid || '']);
      if (uid) {
        await client.query(`SET ROLE authenticated;`);
      }
    };

    // 9a. Direct DML must be blocked on Phase 6 tables
    await setAuthUid(staffUid);
    await assert.rejects(
      async () => client.query(`INSERT INTO public.products (tenant_id, name, sku, price_minor_units, currency) VALUES ($1, 'Hack', 'HACK', 100, 'TRY');`, [tenantId]),
      (err) => err && err.code === '42501'
    );
    await assert.rejects(
      async () => client.query(`INSERT INTO public.pos_orders (tenant_id, branch_id, order_number, staff_id, currency) VALUES ($1, $2, 'ORD-HACK', $3, 'TRY');`, [tenantId, branchId, staffId]),
      (err) => err && err.code === '42501'
    );
    await assert.rejects(
      async () => client.query(`INSERT INTO public.staff_commission_rules (tenant_id, staff_id, item_type, commission_basis_points, created_by_user_id) VALUES ($1, $2, 'product', 1000, $3);`, [tenantId, staffId, staffUid]),
      (err) => err && err.code === '42501'
    );

    // 9b. Deactivated users_profile (even with staff.active = true) & customer role blocked from pos_* RPCs
    await setAuthUid(inactiveStaffUid);
    await assert.rejects(
      async () => client.query(`SELECT public.pos_create_product('Blocked', 'BLK-1', 1000, 'TRY');`),
      (err) => err && err.message.includes('FORBIDDEN')
    );

    await setAuthUid(customerUid);
    await assert.rejects(
      async () => client.query(`SELECT public.pos_create_product('Cust Blocked', 'BLK-2', 1000, 'TRY');`),
      (err) => err && err.message.includes('FORBIDDEN')
    );

    // 9c. Node 1: Product catalog, stock receipt, idempotency + conflict, adjustment & return
    await setAuthUid(staffUid);
    const prodRes = (await client.query(`
      SELECT public.pos_create_product('Botanical Serum', 'SKU-D2-01', 25000, 'TRY', 'haircare', NULL, NULL, NULL, 'bottle', 10000, 2000) AS res;
    `)).rows[0].res;
    assert.equal(prodRes.success, true);
    const productId = prodRes.product_id;

    const rec1 = (await client.query(`
      SELECT public.pos_record_stock_receipt($1, $2, 5, 10000, 'INIT-1', 'd2-rec-1') AS res;
    `, [branchId, productId])).rows[0].res;
    assert.equal(rec1.success, true);
    assert.equal(rec1.new_balance, 5);

    const recReplay = (await client.query(`
      SELECT public.pos_record_stock_receipt($1, $2, 5, 10000, 'INIT-1', 'd2-rec-1') AS res;
    `, [branchId, productId])).rows[0].res;
    assert.equal(recReplay.idempotent_replay, true);
    assert.equal(recReplay.new_balance, 5);

    await assert.rejects(
      async () => client.query(`SELECT public.pos_record_stock_receipt($1, $2, 99, 10000, 'INIT-2', 'd2-rec-1') AS res;`, [branchId, productId]),
      (err) => err && err.message.includes('IDEMPOTENCY_CONFLICT')
    );

    // ADIM034-INV-006: Cost & reference & reason idempotency conflict across all 4 inventory ledger RPCs
    await assert.rejects(
      async () => client.query(`SELECT public.pos_record_stock_receipt($1, $2, 5, 1, 'INIT-1', 'd2-rec-1') AS res;`, [branchId, productId]),
      (err) => err && err.message.includes('IDEMPOTENCY_CONFLICT')
    );
    await assert.rejects(
      async () => client.query(`SELECT public.pos_record_stock_receipt($1, $2, 5, 10000, 'INIT-OTHER', 'd2-rec-1') AS res;`, [branchId, productId]),
      (err) => err && err.message.includes('IDEMPOTENCY_CONFLICT')
    );

    const saleDec = (await client.query(`
      SELECT public.pos_decrement_stock_for_sale($1, $2, 1, 'SALE-REF-1', 'd2-sale-1') AS res;
    `, [branchId, productId])).rows[0].res;
    assert.equal(saleDec.new_balance, 4);
    const saleDecReplay = (await client.query(`
      SELECT public.pos_decrement_stock_for_sale($1, $2, 1, ' SALE-REF-1 ', 'd2-sale-1') AS res;
    `, [branchId, productId])).rows[0].res;
    assert.equal(saleDecReplay.idempotent_replay, true);
    await assert.rejects(
      async () => client.query(`SELECT public.pos_decrement_stock_for_sale($1, $2, 1, 'SALE-REF-2', 'd2-sale-1') AS res;`, [branchId, productId]),
      (err) => err && err.message.includes('IDEMPOTENCY_CONFLICT')
    );

    const adjDec = (await client.query(`
      SELECT public.pos_adjust_stock($1, $2, -1, 'Damaged bottle', 'd2-adj-1') AS res;
    `, [branchId, productId])).rows[0].res;
    assert.equal(adjDec.new_balance, 3);
    const adjReplay = (await client.query(`
      SELECT public.pos_adjust_stock($1, $2, -1, ' Damaged bottle ', 'd2-adj-1') AS res;
    `, [branchId, productId])).rows[0].res;
    assert.equal(adjReplay.idempotent_replay, true);
    await assert.rejects(
      async () => client.query(`SELECT public.pos_adjust_stock($1, $2, -1, 'Lost in transit', 'd2-adj-1') AS res;`, [branchId, productId]),
      (err) => err && err.message.includes('IDEMPOTENCY_CONFLICT')
    );

    const retInc = (await client.query(`
      SELECT public.pos_return_restock($1, $2, 2, 'Customer return', 'SALE-REF-1', 'd2-ret-1') AS res;
    `, [branchId, productId])).rows[0].res;
    assert.equal(retInc.new_balance, 5);
    const retReplay = (await client.query(`
      SELECT public.pos_return_restock($1, $2, 2, 'Customer return', 'SALE-REF-1', 'd2-ret-1') AS res;
    `, [branchId, productId])).rows[0].res;
    assert.equal(retReplay.idempotent_replay, true);
    await assert.rejects(
      async () => client.query(`SELECT public.pos_return_restock($1, $2, 2, 'Different reason', 'SALE-REF-1', 'd2-ret-1') AS res;`, [branchId, productId]),
      (err) => err && err.message.includes('IDEMPOTENCY_CONFLICT')
    );
    await assert.rejects(
      async () => client.query(`SELECT public.pos_return_restock($1, $2, 2, 'Customer return', 'SALE-REF-OTHER', 'd2-ret-1') AS res;`, [branchId, productId]),
      (err) => err && err.message.includes('IDEMPOTENCY_CONFLICT')
    );

    // 9d. Node 2: Suppliers, PO lifecycle, partial + full receiving, over-receipt rejection
    const suppRes = (await client.query(`
      SELECT public.pos_create_supplier('Derma Supply Co', 'Ayşe', 'sup@example.test', '+905550001122') AS res;
    `)).rows[0].res;
    assert.equal(suppRes.success, true);

    const poRes = (await client.query(`
      SELECT public.pos_create_purchase_order($1, $2, 'TRY', $3::jsonb, 'Restock') AS res;
    `, [suppRes.supplier_id, branchId, JSON.stringify([{ product_id: productId, quantity: 10, unit_cost_minor_units: 10000 }])])).rows[0].res;
    assert.equal(poRes.status, 'draft');
    assert.equal(poRes.total_amount_minor_units, 100000);

    const poDetails = (await client.query(`SELECT public.pos_get_purchase_order($1) AS res;`, [poRes.purchase_order_id])).rows[0].res;
    const poItemId = poDetails.items[0].item_id;

    // Draft receiving blocked
    await assert.rejects(
      async () => client.query(`SELECT public.pos_receive_purchase_order_items($1, $2::jsonb, 'po-rec-draft');`, [poRes.purchase_order_id, JSON.stringify([{ po_item_id: poItemId, quantity_received: 5 }])]),
      (err) => err && err.message.includes('INVALID_STATE')
    );

    await client.query(`SELECT public.pos_approve_purchase_order($1);`, [poRes.purchase_order_id]);
    const recvPart = (await client.query(`
      SELECT public.pos_receive_purchase_order_items($1, $2::jsonb, 'po-rec-1') AS res;
    `, [poRes.purchase_order_id, JSON.stringify([{ po_item_id: poItemId, quantity_received: 5 }])])).rows[0].res;
    assert.equal(recvPart.status, 'partially_received');

    // Over-receipt blocked
    await assert.rejects(
      async () => client.query(`SELECT public.pos_receive_purchase_order_items($1, $2::jsonb, 'po-rec-over');`, [poRes.purchase_order_id, JSON.stringify([{ po_item_id: poItemId, quantity_received: 6 }])]),
      (err) => err && err.message.includes('OVER_RECEIPT')
    );

    const invAfterRecv = (await client.query(`SELECT public.pos_get_branch_inventory($1) AS res;`, [branchId])).rows[0].res;
    assert.equal(invAfterRecv.items[0].on_hand_quantity, 10); // 5 initial + 5 received

    // 9e. Node 3 + Node 4: Commission rules (owner-only), mixed cart (product + service price*100 + custom), tips, checkout & earnings ACL
    // Ordinary staff cannot set commission rule
    await assert.rejects(
      async () => client.query(`SELECT public.pos_set_staff_commission_rule($1, 'product', 1000, true);`, [staffId]),
      (err) => err && err.message.includes('FORBIDDEN')
    );

    await setAuthUid(ownerUid);
    const ruleProd = (await client.query(`SELECT public.pos_set_staff_commission_rule($1, 'product', 1000, true) AS res;`, [staffId])).rows[0].res;
    assert.equal(ruleProd.success, true);
    const ruleSvc = (await client.query(`SELECT public.pos_set_staff_commission_rule($1, 'service', 2000, true) AS res;`, [staffId])).rows[0].res;
    assert.equal(ruleSvc.success, true);

    await setAuthUid(staffUid);
    const ord = (await client.query(`SELECT public.pos_create_order($1, 'TRY', NULL, 'Mixed cart') AS res;`, [branchId])).rows[0].res;
    assert.equal(ord.success, true);

    // Unknown/foreign package cleanly fails with CROSS_TENANT_VIOLATION after Faz D3 provisioned service_package_definitions
    await assert.rejects(
      async () => client.query(`SELECT public.pos_add_cart_item($1, 'package', 1, NULL, NULL, $2);`, [ord.order_id, crypto.randomUUID()]),
      (err) => err && err.message.includes('CROSS_TENANT_VIOLATION')
    );

    // Foreign performing_staff_id rejected
    await assert.rejects(
      async () => client.query(`SELECT public.pos_add_cart_item($1, 'custom', 1, NULL, NULL, NULL, NULL, $2, 'Cross', 5000);`, [ord.order_id, tenantBStaffId]),
      (err) => err && err.message.includes('CROSS_TENANT_VIOLATION')
    );

    // Add 2x product (2 * 25000 = 50000, tax 20% = 10000 -> line 60000) + 1x service (price 1200 -> 120000 minor units!)
    const addProd = (await client.query(`
      SELECT public.pos_add_cart_item($1, 'product', 2, $2, NULL, NULL, NULL, $3) AS res;
    `, [ord.order_id, productId, staffId])).rows[0].res;
    assert.equal(addProd.line_total_minor_units, 60000);

    const addSvc = (await client.query(`
      SELECT public.pos_add_cart_item($1, 'service', 1, NULL, $2, NULL, NULL, $3) AS res;
    `, [ord.order_id, serviceId, staffId])).rows[0].res;
    assert.equal(addSvc.line_total_minor_units, 120000);

    // Allocate tip 5000 minor units
    const tipRes = (await client.query(`
      SELECT public.pos_set_tip_allocation($1, $2, 5000) AS res;
    `, [ord.order_id, staffId])).rows[0].res;
    assert.equal(tipRes.tip_minor_units, 5000);
    assert.equal(tipRes.total_minor_units, 185000);

    // Underpayment fails closed
    await assert.rejects(
      async () => client.query(`SELECT public.pos_checkout_order($1, 'cash', 1000, NULL, 'chk-fail-1');`, [ord.order_id]),
      (err) => err && err.message.includes('INSUFFICIENT_PAYMENT')
    );

    // Atomic checkout succeeds
    const chkOk = (await client.query(`
      SELECT public.pos_checkout_order($1, 'cash', 185000, 'CASH-001', 'chk-ok-1') AS res;
    `, [ord.order_id])).rows[0].res;
    assert.equal(chkOk.status, 'completed');
    assert.equal(chkOk.products_decremented, 1);

    // Idempotent replay produces zero extra stock burn & zero extra earnings
    const chkReplay = (await client.query(`
      SELECT public.pos_checkout_order($1, 'cash', 185000, 'CASH-001', 'chk-ok-1') AS res;
    `, [ord.order_id])).rows[0].res;
    assert.equal(chkReplay.idempotent_replay, true);

    // ADIM034-POS-005: Checkout idempotency rejects altered method, amount, or reference; accepts whitespace-normalized identical reference
    const chkReplayTrimRef = (await client.query(`
      SELECT public.pos_checkout_order($1, 'cash', 185000, ' CASH-001 ', 'chk-ok-1') AS res;
    `, [ord.order_id])).rows[0].res;
    assert.equal(chkReplayTrimRef.idempotent_replay, true);
    await assert.rejects(
      async () => client.query(`SELECT public.pos_checkout_order($1, 'external', 185000, 'CASH-001', 'chk-ok-1');`, [ord.order_id]),
      (err) => err && err.message.includes('IDEMPOTENCY_CONFLICT')
    );
    await assert.rejects(
      async () => client.query(`SELECT public.pos_checkout_order($1, 'cash', 999999, 'CASH-001', 'chk-ok-1');`, [ord.order_id]),
      (err) => err && err.message.includes('IDEMPOTENCY_CONFLICT')
    );
    await assert.rejects(
      async () => client.query(`SELECT public.pos_checkout_order($1, 'cash', 185000, 'CASH-999', 'chk-ok-1');`, [ord.order_id]),
      (err) => err && err.message.includes('IDEMPOTENCY_CONFLICT')
    );
    await assert.rejects(
      async () => client.query(`SELECT public.pos_checkout_order($1, 'cash', 185000, NULL, 'chk-ok-1');`, [ord.order_id]),
      (err) => err && err.message.includes('IDEMPOTENCY_CONFLICT')
    );

    // Cross-order idempotency key reuse rejected
    const ord2 = (await client.query(`SELECT public.pos_create_order($1, 'TRY') AS res;`, [branchId])).rows[0].res;
    await client.query(`SELECT public.pos_add_cart_item($1, 'custom', 1, NULL, NULL, NULL, NULL, NULL, 'Item', 1000);`, [ord2.order_id]);
    await assert.rejects(
      async () => client.query(`SELECT public.pos_checkout_order($1, 'cash', 1000, NULL, 'chk-ok-1');`, [ord2.order_id]),
      (err) => err && err.message.includes('IDEMPOTENCY_CONFLICT')
    );

    // Verify stock is now 8 (10 - 2)
    const invAfterSale = (await client.query(`SELECT public.pos_get_branch_inventory($1) AS res;`, [branchId])).rows[0].res;
    assert.equal(invAfterSale.items[0].on_hand_quantity, 8);

    // Verify staff earnings: product commission 10% of 50000 (tax excluded) = 5000; service commission 20% of 120000 = 24000; tip = 5000 -> total 34000
    const ownEarnings = (await client.query(`SELECT public.pos_get_staff_earnings($1) AS res;`, [staffId])).rows[0].res;
    assert.equal(ownEarnings.commission_minor_units, 29000);
    assert.equal(ownEarnings.tip_minor_units, 5000);
    assert.equal(ownEarnings.total_earnings_minor_units, 34000);

    // Another staff in same tenant & super_admin cannot read staffId's earnings
    await setAuthUid(staff2Uid);
    await assert.rejects(
      async () => client.query(`SELECT public.pos_get_staff_earnings($1);`, [staffId]),
      (err) => err && err.message.includes('FORBIDDEN')
    );

    await setAuthUid(superAdminUid);
    await assert.rejects(
      async () => client.query(`SELECT public.pos_get_staff_earnings($1);`, [staffId]),
      (err) => err && err.message.includes('FORBIDDEN')
    );

    // Same-tenant owner CAN read staffId's earnings
    await setAuthUid(ownerUid);
    const ownerReadEarnings = (await client.query(`SELECT public.pos_get_staff_earnings($1) AS res;`, [staffId])).rows[0].res;
    assert.equal(ownerReadEarnings.total_earnings_minor_units, 34000);

    // 9f. ADIM034-PO-004: Canonical PO receiving idempotency (reordered equivalent passes, different qty or item conflicts)
    await setAuthUid(staffUid);
    const prod2Res = (await client.query(`
      SELECT public.pos_create_product('Keratin Mask', 'SKU-D2-02', 15000, 'TRY', 'haircare', NULL, NULL, NULL, 'jar', 5000, 2000) AS res;
    `)).rows[0].res;
    assert.equal(prod2Res.success, true);
    const product2Id = prod2Res.product_id;

    const poCanonRes = (await client.query(`
      SELECT public.pos_create_purchase_order($1, $2, 'TRY', $3::jsonb, 'Canonical PO test') AS res;
    `, [
      suppRes.supplier_id,
      branchId,
      JSON.stringify([
        { product_id: productId, quantity: 10, unit_cost_minor_units: 10000 },
        { product_id: product2Id, quantity: 10, unit_cost_minor_units: 5000 },
      ]),
    ])).rows[0].res;
    await client.query(`SELECT public.pos_approve_purchase_order($1);`, [poCanonRes.purchase_order_id]);
    const poCanonDetails = (await client.query(`SELECT public.pos_get_purchase_order($1) AS res;`, [poCanonRes.purchase_order_id])).rows[0].res;
    const itemA = poCanonDetails.items.find((i) => i.product_id === productId).item_id;
    const itemB = poCanonDetails.items.find((i) => i.product_id === product2Id).item_id;

    const canonRecv1 = (await client.query(`
      SELECT public.pos_receive_purchase_order_items($1, $2::jsonb, 'po-canon-1') AS res;
    `, [poCanonRes.purchase_order_id, JSON.stringify([{ po_item_id: itemA, quantity_received: 3 }, { po_item_id: itemB, quantity_received: 4 }])])).rows[0].res;
    assert.equal(canonRecv1.idempotent_replay, false);

    // Reordered equivalent payload replays cleanly
    const canonRecvReordered = (await client.query(`
      SELECT public.pos_receive_purchase_order_items($1, $2::jsonb, 'po-canon-1') AS res;
    `, [poCanonRes.purchase_order_id, JSON.stringify([{ po_item_id: itemB, quantity_received: 4 }, { po_item_id: itemA, quantity_received: 3 }])])).rows[0].res;
    assert.equal(canonRecvReordered.idempotent_replay, true);

    // Altered quantity or altered item subset conflicts
    await assert.rejects(
      async () => client.query(`SELECT public.pos_receive_purchase_order_items($1, $2::jsonb, 'po-canon-1');`, [poCanonRes.purchase_order_id, JSON.stringify([{ po_item_id: itemA, quantity_received: 2 }, { po_item_id: itemB, quantity_received: 4 }])]),
      (err) => err && err.message.includes('IDEMPOTENCY_CONFLICT')
    );
    await assert.rejects(
      async () => client.query(`SELECT public.pos_receive_purchase_order_items($1, $2::jsonb, 'po-canon-1');`, [poCanonRes.purchase_order_id, JSON.stringify([{ po_item_id: itemA, quantity_received: 3 }])]),
      (err) => err && err.message.includes('IDEMPOTENCY_CONFLICT')
    );

    // 9g. ADIM034-POS-003: Currency mismatch rejection (TRY product cannot be added to USD order)
    const ordUsd = (await client.query(`SELECT public.pos_create_order($1, 'USD') AS res;`, [branchId])).rows[0].res;
    await assert.rejects(
      async () => client.query(`SELECT public.pos_add_cart_item($1, 'product', 1, $2);`, [ordUsd.order_id, productId]),
      (err) => err && err.message.includes('CURRENCY_MISMATCH')
    );
    await setAuthUid(null);
    const usdItemCount = (await client.query(`SELECT count(*)::int AS cnt FROM public.pos_order_items WHERE order_id = $1;`, [ordUsd.order_id])).rows[0].cnt;
    const usdOrderTotal = (await client.query(`SELECT total_minor_units FROM public.pos_orders WHERE id = $1;`, [ordUsd.order_id])).rows[0].total_minor_units;
    assert.equal(usdItemCount, 0);
    assert.equal(usdOrderTotal, 0);

    // 9h. ADIM034-POS-002: Direct DB RPC rejection of EXTERNAL_HOLD payment methods with zero mutation
    await setAuthUid(staffUid);
    const ordHold = (await client.query(`SELECT public.pos_create_order($1, 'TRY') AS res;`, [branchId])).rows[0].res;
    await client.query(`SELECT public.pos_add_cart_item($1, 'product', 1, $2, NULL, NULL, NULL, $3);`, [ordHold.order_id, productId, staffId]);
    await setAuthUid(null);
    const stockBeforeHold = (await client.query(`SELECT on_hand_quantity FROM public.inventory_balances WHERE branch_id = $1 AND product_id = $2;`, [branchId, productId])).rows[0].on_hand_quantity;

    await setAuthUid(staffUid);
    await assert.rejects(
      async () => client.query(`SELECT public.pos_checkout_order($1, 'card_terminal_adapter', 30000, 'TERM-1', 'hold-term-1');`, [ordHold.order_id]),
      (err) => err && err.message.includes('LIVE_POS_TERMINAL_CREDENTIALS_REQUIRED')
    );
    await assert.rejects(
      async () => client.query(`SELECT public.pos_checkout_order($1, 'customer_wallet', 30000, 'WAL-1', 'hold-wal-1');`, [ordHold.order_id]),
      (err) => err && err.message.includes('WALLET_LEDGER_DEFERRED_TO_FAZ_D3')
    );

    await setAuthUid(null);
    const holdOrderRow = (await client.query(`SELECT status, idempotency_key FROM public.pos_orders WHERE id = $1;`, [ordHold.order_id])).rows[0];
    const stockAfterHold = (await client.query(`SELECT on_hand_quantity FROM public.inventory_balances WHERE branch_id = $1 AND product_id = $2;`, [branchId, productId])).rows[0].on_hand_quantity;
    const holdPayCount = (await client.query(`SELECT count(*)::int AS cnt FROM public.pos_order_payments WHERE order_id = $1;`, [ordHold.order_id])).rows[0].cnt;
    const holdEarnCount = (await client.query(`SELECT count(*)::int AS cnt FROM public.staff_earnings_ledger WHERE order_id = $1;`, [ordHold.order_id])).rows[0].cnt;
    assert.equal(holdOrderRow.status, 'open');
    assert.equal(holdOrderRow.idempotency_key, null);
    assert.equal(stockAfterHold, stockBeforeHold);
    assert.equal(holdPayCount, 0);
    assert.equal(holdEarnCount, 0);

    // 9i. ADIM034-POS-001: Concurrent pos_add_cart_item from two independent PG connections serializes atomically
    await setAuthUid(staffUid);
    const ordConc = (await client.query(`SELECT public.pos_create_order($1, 'TRY') AS res;`, [branchId])).rows[0].res;
    await setAuthUid(null);

    const c1 = pgInstance.getPgClient('postgres', '127.0.0.1');
    const c2 = pgInstance.getPgClient('postgres', '127.0.0.1');
    try {
      await c1.connect();
      await c2.connect();

      await c1.query(`BEGIN;`);
      await c1.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [staffUid]);
      await c1.query(`SET LOCAL ROLE authenticated;`);
      await c1.query(`SELECT public.pos_add_cart_item($1, 'custom', 1, NULL, NULL, NULL, NULL, NULL, 'Conc A', 10000);`, [ordConc.order_id]);

      await c2.query(`BEGIN;`);
      await c2.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [staffUid]);
      await c2.query(`SET LOCAL ROLE authenticated;`);
      const c2AddPromise = c2.query(
        `SELECT public.pos_add_cart_item($1, 'custom', 1, NULL, NULL, NULL, NULL, NULL, 'Conc B', 10000) AS res;`,
        [ordConc.order_id]
      );

      // Give c2 a moment to block on the pos_order advisory lock held by c1
      await new Promise((r) => setTimeout(r, 80));
      await c1.query(`COMMIT;`);
      const c2AddRes = await c2AddPromise;
      await c2.query(`COMMIT;`);
      assert.equal(c2AddRes.rows[0].res.order_total_minor_units, 20000);
    } finally {
      try { await c1.end(); } catch {}
      try { await c2.end(); } catch {}
    }

    const concSums = (await client.query(`
      SELECT o.total_minor_units, COALESCE(SUM(i.line_total_minor_units), 0)::int AS items_sum
      FROM public.pos_orders o
      JOIN public.pos_order_items i ON i.order_id = o.id
      WHERE o.id = $1
      GROUP BY o.id, o.total_minor_units;
    `, [ordConc.order_id])).rows[0];
    assert.equal(concSums.items_sum, 20000);
    assert.equal(concSums.total_minor_units, 20000);

    await setAuthUid(staffUid);
    await assert.rejects(
      async () => client.query(`SELECT public.pos_checkout_order($1, 'cash', 10000, NULL, 'conc-underpay');`, [ordConc.order_id]),
      (err) => err && err.message.includes('INSUFFICIENT_PAYMENT')
    );
    const concChk = (await client.query(`
      SELECT public.pos_checkout_order($1, 'cash', 20000, 'CASH-CONC', 'conc-ok') AS res;
    `, [ordConc.order_id])).rows[0].res;
    assert.equal(concChk.status, 'completed');
    await setAuthUid(null);
    console.log('[PASS] Phase 6 POS, Inventory, Suppliers/PO & Staff Commissions-Tips verified on PG17');

    // 10. Test ADIM-035 / Faz D3: 20260920..20260926 (Comms Outbox, Payment Intents, Customer 360, Deposit/No-Show, Loyalty, Packages, Wallet/Gift Cards)
    const setServiceRole = async () => {
      await client.query(`RESET ROLE;`);
      await client.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);
      await client.query(`SELECT set_config('request.jwt.claim.role', 'service_role', false);`);
      await client.query(`SET ROLE service_role;`);
    };
    const setAuthenticatedRole = async (uid) => {
      await client.query(`RESET ROLE;`);
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [uid || '']);
      await client.query(`SELECT set_config('request.jwt.claim.role', $1, false);`, [uid ? 'authenticated' : '']);
      if (uid) {
        await client.query(`SET ROLE authenticated;`);
      }
    };
    const setAuthenticatedNullRoleClaim = async (uid) => {
      await client.query(`RESET ROLE;`);
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [uid || '']);
      await client.query(`SELECT set_config('request.jwt.claim.role', '', false);`);
      if (uid) {
        await client.query(`SET ROLE authenticated;`);
      }
    };

    // Seed dedicated Faz D3 customer + completed appointment (>65 days ago for 60d reactivation cohort)
    await setAuthUid(null);
    const d3CustConsentedId = 'd3000001-0000-4000-8000-000000000001';
    const d3CustNoConsentId = 'd3000002-0000-4000-8000-000000000002';
    const d3ApptDoneId = 'd3000003-0000-4000-8000-000000000003';
    const d3ApptPendingId = 'd3000004-0000-4000-8000-000000000004';
    const d3ApptNoConsentId = 'd3000005-0000-4000-8000-000000000005';
    await client.query(`
      INSERT INTO public.customers (id, tenant_id, name, email, phone)
      VALUES
        ($1, $3, 'D3 VIP Customer', 'd3vip@example.test', '+905559990001'),
        ($2, $3, 'D3 Silent Customer', 'd3silent@example.test', '+905559990002');
    `, [d3CustConsentedId, d3CustNoConsentId, tenantId]);
    await client.query(`
      INSERT INTO public.consent_ledger (tenant_id, customer_id, consent_type, is_granted, created_at)
      VALUES ($1, $2, 'marketing', true, now() - interval '70 days');
    `, [tenantId.toString(), d3CustConsentedId.toString()]);
    await client.query(`
      INSERT INTO public.appointments (id, tenant_id, branch_id, customer_id, user_name, phone, service_id, staff_id, appointment_date, appointment_time, duration_minutes, status)
      VALUES
        ($1, $4, $5, $6, 'D3 VIP Customer', '+905559990001', $8, $9, (CURRENT_DATE - 68), '11:00', 60, 'completed'),
        ($2, $4, $5, $6, 'D3 VIP Customer', '+905559990001', $8, $9, (CURRENT_DATE + 5), '14:00', 60, 'confirmed'),
        ($3, $4, $5, $7, 'D3 Silent Customer', '+905559990002', $8, $9, (CURRENT_DATE - 75), '12:00', 60, 'completed');
    `, [d3ApptDoneId, d3ApptPendingId, d3ApptNoConsentId, tenantId, branchId, d3CustConsentedId, d3CustNoConsentId, serviceId, staffId]);

    // 10a. 20260920: Communications outbox RPCs
    await setAuthUid(staffUid);
    await assert.rejects(
      async () => client.query(`SELECT public.enqueue_communication_outbox($1, 'email', 'd3vip@example.test', 'tpl_1', '{"body":"hi"}'::jsonb, 'outbox-auth-deny');`, [tenantId]),
      (err) => err && err.code === '42501'
    );
    await setServiceRole();
    const obx1 = (await client.query(`SELECT public.enqueue_communication_outbox($1, 'email', 'd3vip@example.test', 'tpl_1', '{"body":"hello"}'::jsonb, 'outbox-key-1') AS res;`, [tenantId])).rows[0].res;
    assert.equal(obx1.success, true);
    assert.equal(obx1.status, 'queued');
    const obxReplay = (await client.query(`SELECT public.enqueue_communication_outbox($1, 'email', 'd3vip@example.test', 'tpl_1', '{"body":"hello"}'::jsonb, 'outbox-key-1') AS res;`, [tenantId])).rows[0].res;
    assert.equal(obxReplay.idempotent_duplicate, true);
    const obxConflict = (await client.query(`SELECT public.enqueue_communication_outbox($1, 'email', 'd3vip@example.test', 'tpl_1', '{"body":"tampered"}'::jsonb, 'outbox-key-1') AS res;`, [tenantId])).rows[0].res;
    assert.equal(obxConflict.success, false);
    assert.equal(obxConflict.error, 'IDEMPOTENCY_CONFLICT');
    const cbUnmatched = (await client.query(`SELECT public.record_delivery_callback('mock_sms', 'msg-unmatched-1', 'delivered', now(), 'cb-replay-1', '{"ok":true}') AS res;`)).rows[0].res;
    assert.equal(cbUnmatched.success, false);
    assert.equal(cbUnmatched.classification, 'UNMATCHED_PROVIDER_REFERENCE');
    const cbDup = (await client.query(`SELECT public.record_delivery_callback('mock_sms', 'msg-unmatched-1', 'delivered', now(), 'cb-replay-1', '{"ok":true}') AS res;`)).rows[0].res;
    assert.equal(cbDup.success, true);
    assert.equal(cbDup.duplicate, true);
    assert.equal(cbDup.classification, 'DUPLICATE_EXACT');

    // 10b. 20260921: Payment intents + verified event binding
    const pi1 = (await client.query(`SELECT public.create_payment_intent($1, 'appointment_deposit', 25000, 'TRY', 'pi-d3-key-001', $2::text, '{}'::jsonb) AS res;`, [tenantId, d3ApptPendingId])).rows[0].res;
    assert.equal(pi1.success, true);
    const piConflict = (await client.query(`SELECT public.create_payment_intent($1, 'appointment_deposit', 99999, 'TRY', 'pi-d3-key-001', $2::text, '{}'::jsonb) AS res;`, [tenantId, d3ApptPendingId])).rows[0].res;
    assert.equal(piConflict.success, false);
    assert.equal(piConflict.error, 'IDEMPOTENCY_CONFLICT');
    const bindPi = (await client.query(`SELECT public.bind_payment_intent_provider($1, 'mock_psp', 'MOCK-REF-1') AS res;`, [pi1.intent_id])).rows[0].res;
    assert.equal(bindPi.success, true);
    const pve = (await client.query(`SELECT public.process_verified_payment_event('mock_psp', 'evt-d3-1', 'payment.succeeded', now(), 'hash-abc', $1, 'MOCK-REF-1', 'succeeded') AS res;`, [pi1.intent_id])).rows[0].res;
    assert.equal(pve.success, true);
    const pveNoIntent = (await client.query(`SELECT public.process_verified_payment_event('mock_psp', 'evt-d3-null-intent', 'payment.succeeded', now(), 'hash-null', NULL, 'MOCK-REF-NONE', 'succeeded') AS res;`)).rows[0].res;
    assert.equal(pveNoIntent.success, true);
    const pveNoIntentDup = (await client.query(`SELECT public.process_verified_payment_event('mock_psp', 'evt-d3-null-intent', 'payment.succeeded', now(), 'hash-null', NULL, 'MOCK-REF-NONE', 'succeeded') AS res;`)).rows[0].res;
    assert.equal(pveNoIntentDup.success, true);
    assert.equal(pveNoIntentDup.duplicate, true);
    assert.equal(pveNoIntentDup.classification, 'IDEMPOTENT_SUCCESS');

    // 10c. 20260922: Customer 360 + Segmentation ACL + NULL role bypass defense
    await setAuthUid(null);
    const segId = 'd3000006-0000-4000-8000-000000000006';
    await client.query(`INSERT INTO public.customer_segments (id, tenant_id, name, segment_type) VALUES ($1, $2, 'VIP Lazer', 'manual');`, [segId, tenantId]);

    // Deactivated users_profile and non-staff customer with NULL claim role must all fail
    await setAuthenticatedNullRoleClaim(inactiveStaffUid);
    await assert.rejects(
      async () => client.query(`SELECT public.get_customer_360_view($1, $2);`, [tenantId, d3CustConsentedId]),
      (err) => err && err.code === '42501'
    );
    await setAuthenticatedNullRoleClaim(customerUid);
    await assert.rejects(
      async () => client.query(`SELECT public.assign_customer_to_segment($1, $2, $3, 'cust');`, [tenantId, segId, d3CustConsentedId]),
      (err) => err && err.code === '42501'
    );
    await setAuthenticatedNullRoleClaim(staffUid);
    const assignedSeg = (await client.query(`SELECT public.assign_customer_to_segment($1, $2, $3, 'staff-d3') AS ok;`, [tenantId, segId, d3CustConsentedId])).rows[0].ok;
    assert.equal(assignedSeg, true);
    const c360 = (await client.query(`SELECT public.get_customer_360_view($1, $2) AS res;`, [tenantId, d3CustConsentedId])).rows[0].res;
    assert.equal(c360.name, 'D3 VIP Customer');
    assert.equal(c360.segments.length, 1);
    const c360Missing = (await client.query(`SELECT public.get_customer_360_view($1, 'd3000099-0000-4000-8000-000000000099') AS res;`, [tenantId])).rows[0].res;
    assert.equal(c360Missing, null);
    const listedSegs = (await client.query(`SELECT * FROM public.list_tenant_customer_segments($1);`, [tenantId])).rows;
    assert.equal(listedSegs.length, 1);
    assert.equal(listedSegs[0].name, 'VIP Lazer');
    assert.equal(Number(listedSegs[0].member_count), 1);
    const dynSeg = (await client.query(`SELECT public.evaluate_dynamic_customer_segments($1, $2) AS res;`, [tenantId, segId])).rows[0].res;
    assert.equal(dynSeg.status, 'DYNAMIC_RULE_EVALUATION_NOT_IMPLEMENTED');

    // Cross-tenant staff isolation on Customer 360
    await setAuthenticatedRole(tenantBStaffUid);
    await assert.rejects(
      async () => client.query(`SELECT public.get_customer_360_view($1, $2);`, [tenantId, d3CustConsentedId]),
      (err) => err && err.code === '42501'
    );

    // 10d. 20260923: Deposit & No-Show Policies (default empty policy + percentage fail-closed + fixed_amount)
    await setAuthenticatedRole(staffUid);
    const evalEmptyDep = (await client.query(`SELECT public.evaluate_booking_confirmation_deposit_policy($1, $2) AS res;`, [tenantId, serviceId])).rows[0].res;
    assert.equal(evalEmptyDep.success, true);
    assert.equal(evalEmptyDep.deposit_required, false);
    assert.equal(evalEmptyDep.deposit_amount_minor_units, 0);
    await assert.rejects(
      async () => client.query(`SELECT public.admin_set_deposit_policy($1, $2, 'fixed_amount', 30000, 'TRY', true);`, [tenantId, serviceId]),
      (err) => err && err.code === '42501'
    );
    await setAuthenticatedRole(ownerUid);
    const depSetFixed = (await client.query(`SELECT public.admin_set_deposit_policy($1, $2, 'fixed_amount', 30000, 'TRY', true) AS res;`, [tenantId, serviceId])).rows[0].res;
    assert.equal(depSetFixed.success, true);
    const nsSet = (await client.query(`SELECT public.admin_set_no_show_policy($1, 12, 'forfeit_deposit', 15000, 24, true) AS res;`, [tenantId])).rows[0].res;
    assert.equal(nsSet.success, true);

    const evalFixed = (await client.query(`SELECT public.evaluate_booking_confirmation_deposit_policy($1, $2) AS res;`, [tenantId, serviceId])).rows[0].res;
    assert.equal(evalFixed.success, true);
    assert.equal(evalFixed.deposit_required, true);
    assert.equal(evalFixed.deposit_amount_minor_units, 30000);
    assert.equal(evalFixed.price_units_source_truth, 'CATALOG_PRICE_UNIT_UNRESOLVED');

    // Percentage deposit policy fails closed explicitly
    await client.query(`SELECT public.admin_set_deposit_policy($1, $2, 'percentage', 20, 'TRY', true);`, [tenantId, serviceId]);
    const evalPct = (await client.query(`SELECT public.evaluate_booking_confirmation_deposit_policy($1, $2) AS res;`, [tenantId, serviceId])).rows[0].res;
    assert.equal(evalPct.success, false);
    assert.equal(evalPct.reason_code, 'PERCENTAGE_DEPOSIT_CALCULATION_UNAVAILABLE');

    // 10e. 20260924: Loyalty & Reactivation (service_role earn, concurrent redeem race, ledger immutability, reactivation consent/60d)
    await setAuthenticatedRole(ownerUid);
    const unconfiguredLoyProf = (await client.query(`SELECT public.get_customer_loyalty_profile($1, $2) AS res;`, [tenantId, d3CustNoConsentId])).rows[0].res;
    assert.equal(unconfiguredLoyProf.is_active, false);
    assert.equal(unconfiguredLoyProf.current_balance, 0);

    await setAuthenticatedRole(null);
    await client.query(`
      INSERT INTO public.tenant_loyalty_configs (tenant_id, is_active, points_per_completed_appointment, minimum_points_redemption)
      VALUES ($1, true, 120, 50);
    `, [tenantId]);

    await setAuthenticatedRole(ownerUid);
    const emptyLoyProf = (await client.query(`SELECT public.get_customer_loyalty_profile($1, $2) AS res;`, [tenantId, d3CustNoConsentId])).rows[0].res;
    assert.equal(emptyLoyProf.is_active, true);
    assert.equal(emptyLoyProf.current_balance, 0);
    await assert.rejects(
      async () => client.query(`SELECT public.earn_loyalty_points_for_appointment($1, $2, $3, NULL, 'earn-owner-deny');`, [tenantId, d3CustConsentedId, d3ApptDoneId]),
      (err) => err && err.code === '42501'
    );

    await setServiceRole();
    const earnPending = (await client.query(`SELECT public.earn_loyalty_points_for_appointment($1, $2, $3, NULL, 'earn-pending') AS res;`, [tenantId, d3CustConsentedId, d3ApptPendingId])).rows[0].res;
    assert.equal(earnPending.success, false);
    assert.equal(earnPending.reason, 'APPOINTMENT_NOT_COMPLETED');

    const earnOk = (await client.query(`SELECT public.earn_loyalty_points_for_appointment($1, $2, $3, NULL, 'earn-done-1') AS res;`, [tenantId, d3CustConsentedId, d3ApptDoneId])).rows[0].res;
    assert.equal(earnOk.success, true);
    assert.equal(earnOk.points_awarded, 120);
    assert.equal(earnOk.current_balance, 120);

    const earnConflict = (await client.query(`SELECT public.earn_loyalty_points_for_appointment($1, $2, $3, NULL, 'earn-done-1') AS res;`, [tenantId, d3CustConsentedId, d3ApptPendingId])).rows[0].res;
    assert.equal(earnConflict.success, false);
    assert.equal(earnConflict.reason, 'APPOINTMENT_NOT_COMPLETED');

    // Concurrent two-connection loyalty redeem race (balance 120, both try 80 -> one succeeds, one fails INSUFFICIENT_LOYALTY_BALANCE)
    const loyC1 = pgInstance.getPgClient('postgres', '127.0.0.1');
    const loyC2 = pgInstance.getPgClient('postgres', '127.0.0.1');
    try {
      await loyC1.connect();
      await loyC2.connect();
      await loyC1.query(`BEGIN; SELECT set_config('request.jwt.claim.role', 'service_role', true); SET LOCAL ROLE service_role;`);
      const l1Res = (await loyC1.query(`SELECT public.redeem_loyalty_points_for_appointment($1, $2, $3, 80, 'loy-race-1') AS res;`, [tenantId, d3CustConsentedId, d3ApptPendingId])).rows[0].res;
      assert.equal(l1Res.success, true);

      await loyC2.query(`BEGIN; SELECT set_config('request.jwt.claim.role', 'service_role', true); SET LOCAL ROLE service_role;`);
      const l2Promise = loyC2.query(`SELECT public.redeem_loyalty_points_for_appointment($1, $2, $3, 80, 'loy-race-2') AS res;`, [tenantId, d3CustConsentedId, d3ApptPendingId]);
      await new Promise((r) => setTimeout(r, 80));
      await loyC1.query(`COMMIT;`);
      const l2Res = (await l2Promise).rows[0].res;
      await loyC2.query(`COMMIT;`);
      assert.equal(l2Res.success, false);
      assert.equal(l2Res.reason, 'INSUFFICIENT_LOYALTY_BALANCE');
    } finally {
      try { await loyC1.end(); } catch {}
      try { await loyC2.end(); } catch {}
    }

    await setAuthUid(null);
    await assert.rejects(
      async () => client.query(`DELETE FROM public.customer_loyalty_ledger WHERE tenant_id = $1;`, [tenantId]),
      (err) => err && err.message.includes('LOYALTY_LEDGER_IMMUTABLE')
    );

    // Reactivation scan: rejects invalid 45d boundary; queues consented 60d & suppresses unconsented; idempotent second run
    await setAuthenticatedRole(staffUid);
    const badCohort = (await client.query(`SELECT public.scan_customer_reactivation_cohorts($1, 45) AS res;`, [tenantId])).rows[0].res;
    assert.equal(badCohort.success, false);
    assert.equal(badCohort.error, 'INVALID_COHORT_INACTIVITY_BOUNDARY');
    const scan1 = (await client.query(`SELECT public.scan_customer_reactivation_cohorts($1, 60) AS res;`, [tenantId])).rows[0].res;
    assert.equal(scan1.success, true);
    assert.equal(scan1.queued_outbox_count, 1);
    assert.equal(scan1.suppressed_count, 1);
    const scan2 = (await client.query(`SELECT public.scan_customer_reactivation_cohorts($1, 60) AS res;`, [tenantId])).rows[0].res;
    assert.equal(scan2.detected_customers, 0);

    // 10f. 20260925: Service packages + POS package cart integration + concurrent credit race
    await setAuthUid(null);
    const pkgDefId = 'd3000007-0000-4000-8000-000000000007';
    await client.query(`
      INSERT INTO public.service_package_definitions (id, tenant_id, name, price_minor_units, currency, total_credits, validity_days, is_active)
      VALUES ($1, $2, 'Lazer 2 Seans Paketi', 200000, 'TRY', 2, 90, true);
    `, [pkgDefId, tenantId]);
    await client.query(`
      INSERT INTO public.service_package_eligibility (tenant_id, package_definition_id, service_id)
      VALUES ($1, $2, $3);
    `, [tenantId, pkgDefId, serviceId]);

    // POS integration: valid package now adds to open TRY order
    await setAuthenticatedRole(staffUid);
    const ordPkg = (await client.query(`SELECT public.pos_create_order($1, 'TRY') AS res;`, [branchId])).rows[0].res;
    const addPkgItem = (await client.query(`SELECT public.pos_add_cart_item($1, 'package', 1, NULL, NULL, $2) AS res;`, [ordPkg.order_id, pkgDefId])).rows[0].res;
    assert.equal(addPkgItem.order_total_minor_units, 200000);

    await setAuthenticatedRole(ownerUid);
    const badGrant = (await client.query(`SELECT public.admin_grant_customer_package($1, $2, $3, 0) AS res;`, [tenantId, d3CustConsentedId, pkgDefId])).rows[0].res;
    assert.equal(badGrant.success, false);
    assert.equal(badGrant.reason_code, 'invalid_validity_days');
    const pkgGrant = (await client.query(`SELECT public.admin_grant_customer_package($1, $2, $3, 30) AS res;`, [tenantId, d3CustConsentedId, pkgDefId])).rows[0].res;
    assert.equal(pkgGrant.success, true);

    const beginAsAuthenticated = async (conn, uid) => {
      await conn.query('BEGIN');
      await conn.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      await conn.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
      await conn.query('SET LOCAL ROLE authenticated');
    };

    const pkgC1 = pgInstance.getPgClient('postgres', '127.0.0.1');
    const pkgC2 = pgInstance.getPgClient('postgres', '127.0.0.1');
    try {
      await pkgC1.connect();
      await pkgC2.connect();
      await beginAsAuthenticated(pkgC1, staffUid);
      const p1Res = (await pkgC1.query(`SELECT public.redeem_customer_package_credits($1, $2, $3, 2, $4, 'pkg-race-1') AS res;`, [tenantId, pkgGrant.customer_package_id, serviceId, d3ApptPendingId])).rows[0].res;
      assert.equal(p1Res.success, true);
      assert.equal(p1Res.remaining_credits, 0);
      assert.equal(p1Res.package_status, 'exhausted');

      await beginAsAuthenticated(pkgC2, staffUid);
      const p2Promise = pkgC2.query(`SELECT public.redeem_customer_package_credits($1, $2, $3, 1, $4, 'pkg-race-2') AS res;`, [tenantId, pkgGrant.customer_package_id, serviceId, d3ApptPendingId]);
      await new Promise((r) => setTimeout(r, 80));
      await pkgC1.query(`COMMIT;`);
      const p2Res = (await p2Promise).rows[0].res;
      await pkgC2.query(`COMMIT;`);
      assert.equal(p2Res.success, false);
    } finally {
      try { await pkgC1.end(); } catch {}
      try { await pkgC2.end(); } catch {}
    }

    await setAuthUid(null);
    await assert.rejects(
      async () => client.query(`DELETE FROM public.customer_package_redemption_ledger WHERE tenant_id = $1;`, [tenantId]),
      (err) => err && err.message.includes('REDEMPTION_LEDGER_IMMUTABLE')
    );

    // 10g. 20260926: Client Wallet & Gift Cards (owner-only stored value, concurrent debit race, SHA-256 gift card, immutable ledgers)
    await setAuthenticatedRole(staffUid);
    await assert.rejects(
      async () => client.query(`SELECT public.transact_wallet_balance($1, $2, 5000, 'credit', 'TRY', NULL, 'wal-staff-deny');`, [tenantId, d3CustConsentedId]),
      (err) => err && err.code === '42501'
    );

    await setAuthenticatedRole(ownerUid);
    const walCredit = (await client.query(`SELECT public.transact_wallet_balance($1, $2, 10000, 'credit', 'TRY', NULL, 'wal-credit-1', 'Initial credit') AS res;`, [tenantId, d3CustConsentedId])).rows[0].res;
    assert.equal(walCredit.success, true);
    assert.equal(walCredit.balance_after_minor_units, 10000);

    const walC1 = pgInstance.getPgClient('postgres', '127.0.0.1');
    const walC2 = pgInstance.getPgClient('postgres', '127.0.0.1');
    try {
      await walC1.connect();
      await walC2.connect();
      await beginAsAuthenticated(walC1, ownerUid);
      const w1Res = (await walC1.query(`SELECT public.transact_wallet_balance($1, $2, 6000, 'debit', 'TRY', $3, 'wal-debit-race-1') AS res;`, [tenantId, d3CustConsentedId, d3ApptPendingId])).rows[0].res;
      assert.equal(w1Res.success, true);
      assert.equal(w1Res.balance_after_minor_units, 4000);

      await beginAsAuthenticated(walC2, ownerUid);
      const w2Promise = walC2.query(`SELECT public.transact_wallet_balance($1, $2, 6000, 'debit', 'TRY', $3, 'wal-debit-race-2') AS res;`, [tenantId, d3CustConsentedId, d3ApptPendingId]);
      await new Promise((r) => setTimeout(r, 80));
      await walC1.query(`COMMIT;`);
      const w2Res = (await w2Promise).rows[0].res;
      await walC2.query(`COMMIT;`);
      assert.equal(w2Res.success, false);
      assert.equal(w2Res.reason_code, 'insufficient_funds');
    } finally {
      try { await walC1.end(); } catch {}
      try { await walC2.end(); } catch {}
    }

    const walReplay = (await client.query(`SELECT public.transact_wallet_balance($1, $2, 6000, 'debit', 'TRY', $3, 'wal-debit-race-1') AS res;`, [tenantId, d3CustConsentedId, d3ApptPendingId])).rows[0].res;
    assert.equal(walReplay.is_idempotent_replay, true);
    const walConflict = (await client.query(`SELECT public.transact_wallet_balance($1, $2, 7000, 'debit', 'TRY', $3, 'wal-debit-race-1') AS res;`, [tenantId, d3CustConsentedId, d3ApptPendingId])).rows[0].res;
    assert.equal(walConflict.success, false);
    assert.equal(walConflict.reason_code, 'IDEMPOTENCY_CONFLICT');

    await setAuthUid(null);
    const gcHash = crypto.createHash('sha256').update('LARI-GIFT-2026').digest('hex');
    await client.query(`
      INSERT INTO public.gift_cards (tenant_id, code_hash, code_last_four, initial_balance_minor_units, current_balance_minor_units, currency, expires_at, status)
      VALUES ($1, $2, '2026', 15000, 15000, 'TRY', now() + interval '30 days', 'active');
    `, [tenantId, gcHash]);

    await setAuthUid(staffUid);
    const gcMissing = (await client.query(`SELECT public.redeem_gift_card($1, 'deadbeef', 1000, $2, NULL, 'gc-missing-1') AS res;`, [tenantId, d3CustConsentedId])).rows[0].res;
    assert.equal(gcMissing.success, false);
    assert.equal(gcMissing.reason_code, 'gift_card_not_found');

    const gcOk = (await client.query(`SELECT public.redeem_gift_card($1, $2, 5000, $3, $4, 'gc-ok-1') AS res;`, [tenantId, gcHash, d3CustConsentedId, d3ApptPendingId])).rows[0].res;
    assert.equal(gcOk.success, true);
    assert.equal(gcOk.remaining_balance_minor_units, 10000);
    const gcConflict = (await client.query(`SELECT public.redeem_gift_card($1, $2, 6000, $3, $4, 'gc-ok-1') AS res;`, [tenantId, gcHash, d3CustConsentedId, d3ApptPendingId])).rows[0].res;
    assert.equal(gcConflict.success, false);
    assert.equal(gcConflict.reason_code, 'IDEMPOTENCY_CONFLICT');

    await setAuthUid(null);
    await assert.rejects(
      async () => client.query(`UPDATE public.client_wallet_ledger SET amount_minor_units = 1 WHERE tenant_id = $1;`, [tenantId]),
      (err) => err && err.message.includes('WALLET_LEDGER_IMMUTABLE')
    );
    await assert.rejects(
      async () => client.query(`UPDATE public.gift_card_redemptions SET redeemed_minor_units = 1 WHERE tenant_id = $1;`, [tenantId]),
      (err) => err && err.message.includes('GIFT_CARD_REDEMPTIONS_IMMUTABLE')
    );
    console.log('[PASS] Phase 3/4 Customer 360, Comms, Payments, Deposit/No-Show, Loyalty, Packages & Wallet/Gift Cards verified on PG17');

    // 11. Test ADIM-036 Faz E1 (20260927..20261007): Vertical Commercial Core, Clinic Domain & Health Tourism (Synth Fixtures Only)
    // 11a. Negative: direct DML & SELECT blocked on clinic_* and ht_* tables for authenticated/anon roles
    await setAuthUid(staffUid);
    await assert.rejects(
      async () => client.query(`SELECT * FROM public.clinic_patient_profiles WHERE tenant_id = $1;`, [tenantId]),
      (err) => err && err.code === '42501'
    );
    await assert.rejects(
      async () => client.query(`INSERT INTO public.clinic_patient_profiles (tenant_id, customer_id, blood_type) VALUES ($1, $2, 'A+');`, [tenantId, d3CustConsentedId]),
      (err) => err && err.code === '42501'
    );
    await assert.rejects(
      async () => client.query(`SELECT * FROM public.clinic_encounters WHERE tenant_id = $1;`, [tenantId]),
      (err) => err && err.code === '42501'
    );
    await assert.rejects(
      async () => client.query(`SELECT * FROM public.ht_leads WHERE tenant_id = $1;`, [tenantId]),
      (err) => err && err.code === '42501'
    );
    await assert.rejects(
      async () => client.query(`SELECT * FROM public.ht_treatment_journeys WHERE tenant_id = $1;`, [tenantId]),
      (err) => err && err.code === '42501'
    );

    // 11b. Vertical context hardening: cross-tenant caller rejected, anon execute denied, unentitled clinic denied
    await setAuthUid(tenantBStaffUid);
    const vtCross = (await client.query(`SELECT public.resolve_tenant_vertical_context($1) AS res;`, [tenantId])).rows[0].res;
    assert.equal(vtCross.success, false);
    assert.equal(vtCross.reason_code, 'FORBIDDEN_CROSS_TENANT');

    await setAuthUid(null);
    await client.query(`SET ROLE anon;`);
    await assert.rejects(
      async () => client.query(`SELECT public.resolve_tenant_vertical_context($1) AS res;`, [tenantId]),
      (err) => err && err.code === '42501'
    );
    await client.query(`RESET ROLE;`);

    await setAuthUid(ownerUid);
    const vtUnentitled = (await client.query(`SELECT public.resolve_tenant_vertical_context($1) AS res;`, [tenantId])).rows[0].res;
    assert.equal(vtUnentitled.success, true);
    assert.equal(vtUnentitled.verticals.clinic_enabled, false);
    assert.equal(vtUnentitled.verticals.health_tourism_enabled, false);
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_set_staff_profile($1, 'doctor', 'Dermatology', 'SYNTH-LIC-001', true, true, true);`, [ownerStaffId]),
      (err) => err && err.message.includes('Clinic workspace vertical is not enabled')
    );

    // ADIM036-COMM-001: Negative & boundary lifecycle checks for trialing (trial_end) and past_due (grace_until)
    await setAuthUid(null);
    const commCases = [
      { status: 'trialing', trialEndSql: 'NULL', graceUntilSql: 'NULL', expectedEligible: false, expectedReason: 'commercial_trial_expired', label: 'trialing + NULL trial_end' },
      { status: 'trialing', trialEndSql: "now() - interval '1 hour'", graceUntilSql: 'NULL', expectedEligible: false, expectedReason: 'commercial_trial_expired', label: 'trialing + expired trial_end' },
      { status: 'past_due', trialEndSql: 'NULL', graceUntilSql: 'NULL', expectedEligible: false, expectedReason: 'commercial_grace_expired', label: 'past_due + NULL grace_until' },
      { status: 'past_due', trialEndSql: 'NULL', graceUntilSql: "now() - interval '1 hour'", expectedEligible: false, expectedReason: 'commercial_grace_expired', label: 'past_due + expired grace_until' },
      { status: 'trialing', trialEndSql: "now() + interval '7 days'", graceUntilSql: 'NULL', expectedEligible: true, expectedReason: 'commercial_allowed', label: 'trialing + future trial_end' },
      { status: 'past_due', trialEndSql: 'NULL', graceUntilSql: "now() + interval '3 days'", expectedEligible: true, expectedReason: 'commercial_allowed', label: 'past_due + future grace_until' },
    ];
    for (const c of commCases) {
      await setAuthUid(null);
      await client.query(`
        UPDATE public.subscriptions s
        SET plan_id = 'clinic_starter',
            plan_version_id = pv.id,
            status = $2,
            trial_end = ${c.trialEndSql},
            grace_until = ${c.graceUntilSql}
        FROM public.plan_versions pv
        JOIN public.plans p ON p.id = pv.plan_id
        WHERE s.tenant_id = $1
          AND p.code = 'clinic_starter'
          AND pv.lifecycle_status = 'published';
      `, [tenantId, c.status]);

      const elig = (await client.query(`SELECT public.resolve_tenant_commercial_eligibility($1) AS res;`, [tenantId])).rows[0].res;
      assert.equal(elig.eligible, c.expectedEligible, `${c.label}: eligibility mismatch`);
      assert.equal(elig.reason_code, c.expectedReason, `${c.label}: reason_code mismatch`);

      const clinicEnt = (await client.query(`
        SELECT boolean_value, source FROM public.resolve_effective_tenant_entitlements($1)
        WHERE feature_key = 'clinic_workspace';
      `, [tenantId])).rows[0];
      assert.equal(clinicEnt.boolean_value, c.expectedEligible, `${c.label}: clinic_workspace boolean_value mismatch`);
      assert.equal(clinicEnt.source, c.expectedEligible ? 'plan_version' : 'default_deny', `${c.label}: entitlement source mismatch`);

      await setAuthUid(ownerUid);
      const vertCheck = (await client.query(`SELECT public.resolve_tenant_vertical_context($1) AS res;`, [tenantId])).rows[0].res;
      assert.equal(vertCheck.eligible, c.expectedEligible, `${c.label}: vertical context eligible mismatch`);
    }

    // Activate clinic_starter with manual_active lifecycle status (20260927) + HT feature overrides (single-journey/2-coordinator caps)
    await setAuthUid(null);
    await client.query(`
      UPDATE public.subscriptions s
      SET plan_id = 'clinic_starter',
          plan_version_id = pv.id,
          status = 'manual_active',
          trial_end = NULL,
          grace_until = NULL
      FROM public.plan_versions pv
      JOIN public.plans p ON p.id = pv.plan_id
      WHERE s.tenant_id = $1
        AND p.code = 'clinic_starter'
        AND pv.lifecycle_status = 'published';
    `, [tenantId]);
    await client.query(`
      INSERT INTO public.tenant_entitlement_overrides (tenant_id, feature_key, value_type, boolean_value, integer_value, reason, created_by)
      VALUES
        ($1, 'ht_lead_ops', 'boolean', true, NULL, 'ADIM-036 synth test', $2),
        ($1, 'ht_multilingual_funnel', 'boolean', true, NULL, 'ADIM-036 synth test', $2),
        ($1, 'ht_agency_network', 'boolean', true, NULL, 'ADIM-036 synth test', $2),
        ($1, 'ht_ai_chat', 'boolean', true, NULL, 'ADIM-036 synth test', $2),
        ($1, 'ht_journey_quote', 'boolean', true, NULL, 'ADIM-036 synth test', $2),
        ($1, 'max_active_journeys', 'integer', NULL, 1, 'ADIM-036 synth test', $2),
        ($1, 'max_coordinators', 'integer', NULL, 2, 'ADIM-036 synth test', $2),
        ($1, 'max_staff', 'integer', NULL, 10, 'ADIM-036 synth test', $2)
      ON CONFLICT DO NOTHING;
    `, [tenantId, superAdminUid]);

    await setAuthUid(ownerUid);
    const vtReady = (await client.query(`SELECT public.resolve_tenant_vertical_context($1) AS res;`, [tenantId])).rows[0].res;
    assert.equal(vtReady.success, true);
    assert.equal(vtReady.eligible, true);
    assert.equal(vtReady.subscription_status, 'manual_active');
    assert.equal(vtReady.verticals.clinic_enabled, true);
    assert.equal(vtReady.verticals.health_tourism_enabled, true);

    // Non-owner cannot manage clinic staff profiles
    await setAuthUid(staffUid);
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_set_staff_profile($1, 'doctor', 'Laser', 'SYNTH-LIC-002', true, true, true);`, [staffId]),
      (err) => err && err.message.includes('FORBIDDEN')
    );

    // Owner configures unprivileged triage staff2 (all clinic perms false -> quota 0 used) + 2 active practitioners (ownerStaffId, staffId) -> 3rd active practitioner hits max_practitioners=2 cap
    await setAuthUid(null);
    const clinicPract3Uid = 'e1000003-0000-4000-8000-000000000003';
    const clinicPract3Id = 'e1000004-0000-4000-8000-000000000004';
    await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'pract3-synth@example.test') ON CONFLICT DO NOTHING;`, [clinicPract3Uid]);
    await client.query(`INSERT INTO public.users_profile (id, tenant_id, name, role, active) VALUES ($1, $2, 'Synth Pract 3', 'staff', true) ON CONFLICT DO NOTHING;`, [clinicPract3Uid, tenantId]);
    await client.query(`INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active) VALUES ($1, $2, $3, 'Synth Pract 3', true) ON CONFLICT DO NOTHING;`, [clinicPract3Id, tenantId, clinicPract3Uid]);

    await setAuthUid(ownerUid);
    const csStaff2 = (await client.query(`SELECT public.clinic_set_staff_profile($1, 'nurse', 'Triage', 'SYNTH-LIC-100', false, false, false) AS res;`, [staff2Id])).rows[0].res;
    assert.equal(csStaff2.success, true);
    const csOwner = (await client.query(`SELECT public.clinic_set_staff_profile($1, 'doctor', 'Aesthetics', 'SYNTH-LIC-101', true, true, true) AS res;`, [ownerStaffId])).rows[0].res;
    assert.equal(csOwner.success, true);
    const csPract2 = (await client.query(`SELECT public.clinic_set_staff_profile($1, 'therapist', 'Skin', 'SYNTH-LIC-102', false, true, true) AS res;`, [staffId])).rows[0].res;
    assert.equal(csPract2.success, true);
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_set_staff_profile($1, 'doctor', 'Laser', 'SYNTH-LIC-103', true, true, false);`, [clinicPract3Id]),
      (err) => err && err.message.includes('PRACTITIONER_QUOTA_EXCEEDED')
    );

    // Ensure ownerStaffId has branch/service/availability links for acceptance slots
    await setAuthUid(null);
    await client.query(`INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;`, [tenantId, ownerStaffId, branchId]);
    await client.query(`INSERT INTO public.staff_services (staff_id, service_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`, [ownerStaffId, serviceId]);
    await client.query(`INSERT INTO public.availability_rules (tenant_id, staff_id, weekday, start_time, end_time, is_active) VALUES ($1, $2, 1, '09:00', '18:00', true) ON CONFLICT DO NOTHING;`, [tenantId, ownerStaffId]);

    // 11c. Negative clinic authorization & cross-tenant isolation
    // clinicPract3 (unconfigured staff profile) & nurse staff2 (all permissions=false) denied patient write & history read
    await setAuthUid(clinicPract3Uid);
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_upsert_patient_profile($1, '1990-01-15'::date, 'female', 'Synth Contact', '+905550009999', 'spouse', 'O+', 'None', 'None');`, [d3CustConsentedId]),
      (err) => err && err.message.includes('FORBIDDEN')
    );
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_get_patient_history($1);`, [d3CustConsentedId]),
      (err) => err && err.message.includes('FORBIDDEN')
    );

    // Nurse staff2 (can_manage_patient_profiles=false, can_view_clinical_records=false, can_write_clinical_notes=false) denied patient profile write & history read
    await setAuthUid(staff2Uid);
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_upsert_patient_profile($1, '1990-01-15'::date, 'female');`, [d3CustConsentedId]),
      (err) => err && err.message.includes('FORBIDDEN')
    );
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_get_patient_history($1);`, [d3CustConsentedId]),
      (err) => err && err.message.includes('FORBIDDEN')
    );

    // 11d. Clinic operational & clinical flow (synthetic patient + confirmed appointment + SOAP note immutability + trigger guard)
    await setAuthUid(ownerUid);
    const cpRes = (await client.query(`
      SELECT public.clinic_upsert_patient_profile($1, '1991-05-20'::date, 'female', 'Synth Kin', '+905551112233', 'sibling', 'A+', 'Synth Pollen', 'None') AS res;
    `, [d3CustConsentedId])).rows[0].res;
    assert.equal(cpRes.success, true);

    // Create confirmed clinic appointment assigned to ownerStaffId
    await setAuthUid(null);
    const clinicApptId = 'e1000001-0000-4000-8000-000000000001';
    const clinicPendingApptId = 'e1000002-0000-4000-8000-000000000002';
    await client.query(`
      INSERT INTO public.appointments (id, tenant_id, branch_id, customer_id, user_name, phone, service_id, staff_id, appointment_date, appointment_time, duration_minutes, status)
      VALUES
        ($1, $3, $4, $7, 'Synth Clinic Patient', '+905550001100', $5, $6, $8::date, '11:00'::time, 60, 'confirmed'),
        ($2, $3, $4, $7, 'Synth Pending Patient', '+905550001101', $5, $6, $8::date, '12:30'::time, 60, 'pending');
    `, [clinicApptId, clinicPendingApptId, tenantId, branchId, serviceId, ownerStaffId, d3CustConsentedId, futureDate]);

    await setAuthUid(ownerUid);
    // Starting encounter on pending appointment must fail closed
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_start_encounter($1, 'Pre-check');`, [clinicPendingApptId]),
      (err) => err && err.message.includes('APPOINTMENT_NOT_CONFIRMED')
    );

    const encStart = (await client.query(`SELECT public.clinic_start_encounter($1, 'Synthetic checkup') AS res;`, [clinicApptId])).rows[0].res;
    assert.equal(encStart.success, true);
    const encId = encStart.encounter_id;

    // Staff without write permission cannot write note on the encounter
    await setAuthUid(staff2Uid);
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_save_encounter_note($1, 'S', 'O', 'A', 'P', 'draft');`, [encId]),
      (err) => err && err.message.includes('FORBIDDEN')
    );

    await setAuthUid(ownerUid);
    const noteSave = (await client.query(`SELECT public.clinic_save_encounter_note($1, 'Synth S', 'Synth O', 'Synth A', 'Synth P', 'final') AS res;`, [encId])).rows[0].res;
    assert.equal(noteSave.success, true);
    assert.equal(noteSave.version, 1);

    // Direct status mutation on appointment while encounter is open must be blocked by trigger, and encounter_notes is append-only
    await setAuthUid(null);
    await assert.rejects(
      async () => client.query(`UPDATE public.appointments SET status = 'completed' WHERE id = $1;`, [clinicApptId]),
      (err) => err && err.message.includes('INVARIANT_VIOLATION')
    );
    await assert.rejects(
      async () => client.query(`UPDATE public.clinic_encounter_notes SET subjective = 'Tampered' WHERE encounter_id = $1;`, [encId]),
      (err) => err && err.message.includes('CLINIC_ENCOUNTER_NOTES_IMMUTABLE')
    );

    // Atomic encounter + appointment completion writes simulated no_real_send outbox
    await setAuthUid(ownerUid);
    const encDone = (await client.query(`SELECT public.clinic_complete_encounter_and_appointment($1) AS res;`, [encId])).rows[0].res;
    assert.equal(encDone.success, true);
    assert.equal(encDone.appointment_status, 'completed');

    await setAuthUid(null);
    const clinicOutboxRows = (await client.query(`
      SELECT (metadata->>'no_real_send')::boolean AS no_real_send, metadata->>'event_type' AS ev_type
      FROM public.communication_outbox
      WHERE tenant_id = $1::text AND (metadata->>'appointment_id') = $2::text
      ORDER BY created_at DESC LIMIT 1;
    `, [tenantId, clinicApptId])).rows;
    assert.equal(clinicOutboxRows.length, 1);
    assert.equal(clinicOutboxRows[0].no_real_send, true);
    assert.equal(clinicOutboxRows[0].ev_type, 'appointment_completed');

    // ADIM036-TENANT-002: Clinic operational day must be strictly scoped to caller's staff_branches (explicit branch AND NULL branch)
    await setAuthUid(staffUid);
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_get_operational_day($1::date, $2);`, [futureDate, branch2Id]),
      (err) => err && err.message.includes('FORBIDDEN'),
      'Staff assigned only to Branch A must be denied Branch B operational day'
    );
    const staffOpDayNull = (await client.query(`SELECT public.clinic_get_operational_day($1::date, NULL) AS res;`, [futureDate])).rows[0].res;
    assert.equal(staffOpDayNull.success, true);
    assert.ok(staffOpDayNull.appointments.length > 0, 'Staff Branch A operational day should include Branch A appointments');
    assert.ok(
      staffOpDayNull.appointments.every((a) => a.branch_id === branchId),
      'NULL branch operational day call must exclude unassigned Branch B appointments'
    );
    assert.ok(
      staffOpDayNull.appointments.some((a) => a.appointment_id === clinicApptId),
      'Staff Branch A operational day should include clinicApptId'
    );
    const staffOpDayBranchA = (await client.query(`SELECT public.clinic_get_operational_day($1::date, $2) AS res;`, [futureDate, branchId])).rows[0].res;
    assert.equal(staffOpDayBranchA.success, true);
    assert.ok(staffOpDayBranchA.appointments.some((a) => a.appointment_id === clinicApptId));

    // ADIM036-PHI-006: Branch-A-only staff must be denied Branch-B-only patient profile/history reads & profile writes (0 PHI mutation),
    // and mixed-branch history must exclude Branch-B encounters
    await setAuthUid(null);
    const branchBOnlyEncId = 'e1000005-0000-4000-8000-000000000005';
    const branchBOnlyApptRow = (await client.query(`
      SELECT id FROM public.appointments
      WHERE tenant_id = $1 AND branch_id = $2 AND customer_id = $3
      LIMIT 1;
    `, [tenantId, branch2Id, customerB2Id])).rows[0];
    assert.ok(branchBOnlyApptRow?.id, 'Expected existing Branch-B appointment for customerB2Id');

    await client.query(`
      INSERT INTO public.clinic_patient_profiles (tenant_id, customer_id, blood_type, allergies, chronic_conditions)
      VALUES ($1, $2, 'B-', 'Synth Latex', 'None')
      ON CONFLICT (tenant_id, customer_id) DO NOTHING;
    `, [tenantId, customerB2Id]);
    await client.query(`
      INSERT INTO public.clinic_encounters (id, tenant_id, appointment_id, customer_id, practitioner_staff_id, branch_id, status, reason_for_visit, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, 'completed', 'Branch-B Only Synth Visit', $7)
      ON CONFLICT DO NOTHING;
    `, [branchBOnlyEncId, tenantId, branchBOnlyApptRow.id, customerB2Id, staffB2Id, branch2Id, ownerUid]);

    // Branch-A-only staff (ownerUid with full clinic perms, and staffUid with view/write perms) denied Branch-B-only customer PHI read/write
    await setAuthUid(ownerUid);
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_get_patient_profile($1);`, [customerB2Id]),
      (err) => err && err.message.includes('FORBIDDEN'),
      'Branch-A-only staff must be denied Branch-B-only patient profile read'
    );
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_get_patient_history($1);`, [customerB2Id]),
      (err) => err && err.message.includes('FORBIDDEN'),
      'Branch-A-only staff must be denied Branch-B-only patient history read'
    );
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_upsert_patient_profile($1, '1988-02-02'::date, 'male', 'Tamper', '+905550000099', 'other', 'AB-', 'Tampered', 'Tampered');`, [customerB2Id]),
      (err) => err && err.message.includes('FORBIDDEN'),
      'Branch-A-only staff must be denied Branch-B-only patient profile write'
    );

    await setAuthUid(staffUid);
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_get_patient_profile($1);`, [customerB2Id]),
      (err) => err && err.message.includes('FORBIDDEN')
    );
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_get_patient_history($1);`, [customerB2Id]),
      (err) => err && err.message.includes('FORBIDDEN')
    );

    // Zero PHI mutation check on Branch-B-only patient profile
    await setAuthUid(null);
    const branchBProfileAfter = (await client.query(`
      SELECT date_of_birth, blood_type, allergies, chronic_conditions
      FROM public.clinic_patient_profiles
      WHERE tenant_id = $1 AND customer_id = $2;
    `, [tenantId, customerB2Id])).rows[0];
    assert.equal(branchBProfileAfter.date_of_birth, null);
    assert.equal(branchBProfileAfter.blood_type, 'B-');
    assert.equal(branchBProfileAfter.allergies, 'Synth Latex');
    assert.equal(branchBProfileAfter.chronic_conditions, 'None');

    // Mixed-branch patient (d3CustConsentedId has Branch-A encounter encId + new Branch-B encounter): Branch-B encounter must not leak
    const mixedBranchBApptId = 'e1000006-0000-4000-8000-000000000006';
    const mixedBranchBEncId = 'e1000007-0000-4000-8000-000000000007';
    await client.query(`
      INSERT INTO public.appointments (id, tenant_id, branch_id, customer_id, user_name, phone, service_id, staff_id, appointment_date, appointment_time, duration_minutes, status)
      VALUES ($1, $2, $3, $4, 'Synth Clinic Patient', '+905550001100', $5, $6, $7::date, '13:00'::time, 30, 'completed');
    `, [mixedBranchBApptId, tenantId, branch2Id, d3CustConsentedId, serviceB2Id, staffB2Id, futureDate]);
    await client.query(`
      INSERT INTO public.clinic_encounters (id, tenant_id, appointment_id, customer_id, practitioner_staff_id, branch_id, status, reason_for_visit, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, 'completed', 'Branch-B Mixed Confidential', $7);
    `, [mixedBranchBEncId, tenantId, mixedBranchBApptId, d3CustConsentedId, staffB2Id, branch2Id, ownerUid]);
    await client.query(`
      INSERT INTO public.clinic_encounter_notes (tenant_id, encounter_id, author_staff_id, version, subjective, note_status)
      VALUES ($1, $2, $3, 1, 'Branch-B Secret Note', 'final');
    `, [tenantId, mixedBranchBEncId, staffB2Id]);

    for (const readerUid of [ownerUid, staffUid]) {
      await setAuthUid(readerUid);
      const profOk = (await client.query(`SELECT public.clinic_get_patient_profile($1) AS res;`, [d3CustConsentedId])).rows[0].res;
      assert.equal(profOk.success, true);
      assert.equal(profOk.patient_profile.blood_type, 'A+');

      const mixedHist = (await client.query(`SELECT public.clinic_get_patient_history($1) AS res;`, [d3CustConsentedId])).rows[0].res;
      assert.equal(mixedHist.success, true);
      assert.ok(mixedHist.encounters.some((e) => e.id === encId), 'Branch-A encounter must be returned');
      assert.ok(mixedHist.encounters.every((e) => e.branch_id === branchId), 'Mixed history must exclude Branch-B encounters');
      assert.ok(!mixedHist.encounters.some((e) => e.id === mixedBranchBEncId), 'Branch-B encounter ID must not leak');
    }

    // Cross-tenant clinic read denied (even for an equally entitled, fully privileged clinic practitioner in Tenant B)
    await setAuthUid(null);
    await client.query(`
      UPDATE public.subscriptions s
      SET plan_id = 'clinic_starter',
          plan_version_id = pv.id,
          status = 'manual_active'
      FROM public.plan_versions pv
      JOIN public.plans p ON p.id = pv.plan_id
      WHERE s.tenant_id = $1
        AND p.code = 'clinic_starter'
        AND pv.lifecycle_status = 'published';
    `, [tenantBId]);

    // ADIM036-VERTICAL-003: Negative anon HT public intake must be denied (0 rows written) when tenant lacks Health Tourism entitlement
    await setAuthUid(null);
    await client.query(`SET ROLE anon;`);
    await assert.rejects(
      async () => client.query(`
        SELECT public.ht_create_public_lead('d1-salon-b', 'Blocked HT Patient', 'blocked.ht@example.test', '+447700900000', 'en', 'GB', 'SYNTH-BLOCKED-PASS');
      `),
      (err) => err && err.message.includes('FORBIDDEN'),
      'Anon HT lead intake must be rejected when health_tourism_enabled is false'
    );
    await client.query(`RESET ROLE;`);
    const blockedHtLeadCount = (await client.query(`SELECT count(*)::int AS cnt FROM public.ht_leads WHERE tenant_id = $1;`, [tenantBId])).rows[0].cnt;
    assert.equal(blockedHtLeadCount, 0, 'Rejected anon HT intake must write 0 rows to ht_leads');
    await client.query(`
      INSERT INTO public.tenant_entitlement_overrides (tenant_id, feature_key, value_type, boolean_value, integer_value, reason, created_by)
      VALUES
        ($1, 'ht_lead_ops', 'boolean', true, NULL, 'ADIM-036 cross-tenant test', $2),
        ($1, 'max_coordinators', 'integer', NULL, 2, 'ADIM-036 cross-tenant test', $2)
      ON CONFLICT DO NOTHING;
    `, [tenantBId, superAdminUid]);
    await client.query(`
      INSERT INTO public.clinic_staff_profiles (tenant_id, staff_id, practitioner_type, specialty, can_manage_patient_profiles, can_view_clinical_records, can_write_clinical_notes)
      VALUES ($1, $2, 'doctor', 'Dermatology', true, true, true)
      ON CONFLICT (staff_id) DO NOTHING;
    `, [tenantBId, tenantBStaffId]);
    await client.query(`
      INSERT INTO public.ht_staff_profiles (tenant_id, staff_id, can_view_ht_leads, can_manage_ht_leads)
      VALUES ($1, $2, true, true)
      ON CONFLICT (staff_id) DO NOTHING;
    `, [tenantBId, tenantBStaffId]);
    await setAuthUid(tenantBStaffUid);
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_get_patient_profile($1);`, [d3CustConsentedId]),
      (err) => err && err.message.includes('NOT_FOUND')
    );
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_get_patient_history($1);`, [d3CustConsentedId]),
      (err) => err && err.message.includes('NOT_FOUND')
    );

    // 11e. Health Tourism: lead creation, passport redaction, coordinator/staff authority, quota & status transition matrix, WH handoff outbox, journey/quote/itinerary, and clinic acceptance
    await setAuthUid(ownerUid);
    const htCtxOwner = (await client.query(`SELECT public.ht_set_staff_profile($1, true, true) AS res;`, [ownerStaffId])).rows[0].res;
    assert.equal(htCtxOwner.success, true);
    const htCtxStaff1 = (await client.query(`SELECT public.ht_set_staff_profile($1, false, true) AS res;`, [staffId])).rows[0].res;
    assert.equal(htCtxStaff1.success, true);
    await assert.rejects(
      async () => client.query(`SELECT public.ht_set_staff_profile($1, false, true);`, [staff2Id]),
      (err) => err && err.message.includes('COORDINATOR_QUOTA_EXCEEDED')
    );

    const agRes = (await client.query(`SELECT public.ht_create_referring_agency('Synth Health Partners', 'SYNTH-AG', 'agency@synth.test', '+49123456') AS res;`)).rows[0].res;
    assert.equal(agRes.success, true);
    const agencyId = agRes.agency_id;

    // Anon creates synthetic HT lead with passport (passport must be stored in DB only, never returned via ht_get_lead / ht_list_leads)
    await setAuthUid(null);
    await client.query(`SET ROLE anon;`);
    const pubLeadRes = (await client.query(`
      SELECT public.ht_create_public_lead('d1-salon', 'Synth Int Patient', 'ht.synth@example.test', '+447700900111', 'en', 'GB', 'SYNTH-PASS-9999', 'agency_referral', $1) AS res;
    `, [agencyId])).rows[0].res;
    await client.query(`RESET ROLE;`);
    assert.equal(pubLeadRes.success, true);
    const htLeadId = pubLeadRes.lead_id;

    await setAuthUid(ownerUid);
    const assignRes = (await client.query(`SELECT public.ht_assign_coordinator($1, $2) AS res;`, [htLeadId, ownerStaffId])).rows[0].res;
    assert.equal(assignRes.success, true);
    const getLeadRes = (await client.query(`SELECT public.ht_get_lead($1) AS res;`, [htLeadId])).rows[0].res;
    assert.equal(getLeadRes.success, true);
    assert.equal(getLeadRes.lead.coordinator_name, 'D1 Owner');
    assert.equal('passport_number' in getLeadRes.lead, false, 'passport_number must NEVER be returned by ht_get_lead');
    assert.equal('passport_last_four' in getLeadRes.lead, false, 'passport_last_four must NEVER be returned by ht_get_lead');

    const listLeadsRes = (await client.query(`SELECT public.ht_list_leads('new', 10, 0, NULL, 'agency_referral') AS res;`)).rows[0].res;
    assert.equal(listLeadsRes.success, true);
    assert.equal(listLeadsRes.total, 1);
    assert.equal('passport_number' in listLeadsRes.leads[0], false);

    // View-only HT staff (staffId) denied mutating status, cross-tenant staff denied reading lead
    await setAuthUid(staffUid);
    await assert.rejects(
      async () => client.query(`SELECT public.ht_update_lead_status($1, 'contacted', 'Denied manage');`, [htLeadId]),
      (err) => err && err.message.includes('FORBIDDEN')
    );
    await setAuthUid(tenantBStaffUid);
    await assert.rejects(
      async () => client.query(`SELECT public.ht_get_lead($1);`, [htLeadId]),
      (err) => err && err.message.includes('NOT_FOUND')
    );

    // Invalid transition new -> handoff_pending fails; valid sequence new -> contacted -> qualified -> handoff_pending succeeds
    await setAuthUid(ownerUid);
    await assert.rejects(
      async () => client.query(`SELECT public.ht_update_lead_status($1, 'handoff_pending', 'Skip fail');`, [htLeadId]),
      (err) => err && err.message.includes('INVALID_TRANSITION')
    );
    assert.equal((await client.query(`SELECT public.ht_update_lead_status($1, 'contacted', 'Synth step 1') AS res;`, [htLeadId])).rows[0].res.status, 'contacted');
    assert.equal((await client.query(`SELECT public.ht_update_lead_status($1, 'qualified', 'Synth step 2') AS res;`, [htLeadId])).rows[0].res.status, 'qualified');
    assert.equal((await client.query(`SELECT public.ht_update_lead_status($1, 'handoff_pending', 'Ready for handoff') AS res;`, [htLeadId])).rows[0].res.status, 'handoff_pending');

    const waHandoff = (await client.query(`SELECT public.ht_enqueue_whatsapp_handoff($1, NULL, 'synth_coord_handoff') AS res;`, [htLeadId])).rows[0].res;
    assert.equal(waHandoff.success, true);
    assert.equal(waHandoff.channel, 'whatsapp');
    await setAuthUid(null);
    const waOutbox = (await client.query(`SELECT (metadata->>'no_real_send')::boolean AS no_real_send FROM public.communication_outbox WHERE id = $1;`, [waHandoff.outbox_id])).rows[0];
    assert.equal(waOutbox.no_real_send, true);

    // Request handoff on linked AI conversation so handoff_state='requested' for clinic acceptance
    await setServiceRole();
    const htConvRes = (await client.query(`SELECT public.ht_create_ai_conversation($1, 'en', $2) AS res;`, [tenantId, htLeadId])).rows[0].res;
    assert.equal(htConvRes.success, true);
    await setAuthUid(ownerUid);
    const handoffReq = (await client.query(`SELECT public.ht_request_handoff($1, 'synth_clinic_ready') AS res;`, [htConvRes.conversation_id])).rows[0].res;
    assert.equal(handoffReq.handoff_state, 'requested');

    // Treatment journey, quote validation (rejects non-array items & sum mismatch, enforces max_active_journeys=1), itinerary event
    const j1Res = (await client.query(`SELECT public.ht_create_treatment_journey('Synth Dental Trip', $1, NULL, $2, 'dental', $3::date, $4::date) AS res;`, [htLeadId, ownerStaffId, futureDate, futureDate])).rows[0].res;
    assert.equal(j1Res.success, true);
    const journeyId = j1Res.journey_id;
    await assert.rejects(
      async () => client.query(`SELECT public.ht_create_treatment_journey('Second Journey Exceeds Cap', $1);`, [htLeadId]),
      (err) => err && err.message.includes('QUOTA_EXCEEDED')
    );
    await assert.rejects(
      async () => client.query(`SELECT public.ht_create_or_update_journey_quote($1, 'EUR', 100000, '{"bad":"object"}'::jsonb);`, [journeyId]),
      (err) => err && err.message.includes('INVALID_INPUT')
    );
    await assert.rejects(
      async () => client.query(`SELECT public.ht_create_or_update_journey_quote($1, 'EUR', 99999, '[{"description":"Package","category":"clinical","amount_minor_units":50000}]'::jsonb);`, [journeyId]),
      (err) => err && err.message.includes('INVALID_INPUT')
    );
    const quoteOk = (await client.query(`SELECT public.ht_create_or_update_journey_quote($1, 'EUR', 150000, '[{"description":"Consult + Transfer","category":"clinical","amount_minor_units":150000}]'::jsonb) AS res;`, [journeyId])).rows[0].res;
    assert.equal(quoteOk.success, true);
    const itinOk = (await client.query(`SELECT public.ht_add_journey_itinerary_event($1, 'airport_pickup', 'Synth Arrival', now() + interval '5 days') AS res;`, [journeyId])).rows[0].res;
    assert.equal(itinOk.success, true);

    // Clinic acceptance: query available slots via ht_get_clinic_acceptance_slots then convert qualified handoff_pending HT lead into customer + clinic_patient_profile + pending appointment
    const acceptOpts = (await client.query(`SELECT public.ht_get_clinic_acceptance_options($1, $2, $3) AS res;`, [htLeadId, branchId, serviceId])).rows[0].res;
    assert.equal(acceptOpts.lead_id, htLeadId);
    assert.ok(acceptOpts.branches.some((b) => b.id === branchId));

    const acceptSlots = (await client.query(`SELECT public.ht_get_clinic_acceptance_slots($1, $2, $3, $4, $5::date) AS res;`, [htLeadId, branchId, serviceId, ownerStaffId, futureDate])).rows[0].res;
    assert.ok(Array.isArray(acceptSlots.available_slots) && acceptSlots.available_slots.length > 0, 'ht_get_clinic_acceptance_slots must return at least one open slot');
    const chosenSlotTime = acceptSlots.available_slots[0].time || acceptSlots.available_slots[0];

    // ADIM036-RESOURCE-005: Pre-check that second practitioner (staff2Id) has no staff conflict at chosenSlotTime before HT acceptance consumes capacity-1 resourceId
    const staff2PreSlot = (await client.query(`
      SELECT public.evaluate_booking_slot($1, $2, $3, $4, $5::date, $6::time) AS res;
    `, [tenantId, branchId, serviceId, staff2Id, futureDate, chosenSlotTime])).rows[0].res;
    assert.equal(staff2PreSlot.allowed, true, 'Second practitioner must be free at chosenSlotTime before shared resource is consumed');

    const acceptRes = (await client.query(`SELECT public.ht_accept_lead_into_clinic($1, $2, $3, $4, $5::date, $6::time) AS res;`, [htLeadId, branchId, serviceId, ownerStaffId, futureDate, chosenSlotTime])).rows[0].res;
    assert.equal(acceptRes.already_converted, false);
    assert.ok(acceptRes.customer_id);
    assert.ok(acceptRes.patient_profile_id);
    assert.ok(acceptRes.appointment_id);
    await setAuthUid(null);
    const convLeadRow = (await client.query(`SELECT status FROM public.ht_leads WHERE id = $1;`, [htLeadId])).rows[0];
    const convApptRow = (await client.query(`SELECT status FROM public.appointments WHERE id = $1;`, [acceptRes.appointment_id])).rows[0];
    const convArRows = (await client.query(`SELECT resource_id, quantity FROM public.appointment_resources WHERE appointment_id = $1;`, [acceptRes.appointment_id])).rows;
    assert.equal(convLeadRow.status, 'converted');
    assert.equal(convApptRow.status, 'pending');
    assert.equal(convArRows.length, 1, 'ht_accept_lead_into_clinic must persist appointment_resources row atomically');
    assert.equal(convArRows[0].resource_id, resourceId);
    assert.equal(convArRows[0].quantity, 1);

    // ADIM036-RESOURCE-005 negative: second HT acceptance & public booking for second practitioner sharing capacity-1 resource must fail with resource_unavailable and 0 extra mutations
    await client.query(`SET ROLE anon;`);
    const pubLead2Res = (await client.query(`
      SELECT public.ht_create_public_lead('d1-salon', 'Synth Int Patient 2', 'ht.synth2@example.test', '+447700900222', 'en', 'GB', 'SYNTH-PASS-8888', 'direct', NULL) AS res;
    `)).rows[0].res;
    await client.query(`RESET ROLE;`);
    assert.equal(pubLead2Res.success, true);
    const htLead2Id = pubLead2Res.lead_id;

    await setAuthUid(ownerUid);
    await client.query(`SELECT public.ht_update_lead_status($1, 'contacted', 'Step 1');`, [htLead2Id]);
    await client.query(`SELECT public.ht_update_lead_status($1, 'qualified', 'Step 2');`, [htLead2Id]);
    await client.query(`SELECT public.ht_update_lead_status($1, 'handoff_pending', 'Step 3');`, [htLead2Id]);
    await setServiceRole();
    const htConv2Res = (await client.query(`SELECT public.ht_create_ai_conversation($1, 'en', $2) AS res;`, [tenantId, htLead2Id])).rows[0].res;
    await setAuthUid(ownerUid);
    await client.query(`SELECT public.ht_request_handoff($1, 'synth_clinic_ready_2');`, [htConv2Res.conversation_id]);

    await setAuthUid(null);
    const countsBeforeOverlap = (await client.query(`
      SELECT
        (SELECT count(*)::int FROM public.appointments WHERE tenant_id = $1) AS appts,
        (SELECT count(*)::int FROM public.customers WHERE tenant_id = $1) AS custs,
        (SELECT count(*)::int FROM public.clinic_patient_profiles WHERE tenant_id = $1) AS profiles,
        (SELECT count(*)::int FROM public.appointment_resources WHERE tenant_id = $1) AS resources;
    `, [tenantId])).rows[0];

    await setAuthUid(ownerUid);
    await assert.rejects(
      async () => client.query(`SELECT public.ht_accept_lead_into_clinic($1, $2, $3, $4, $5::date, $6::time);`, [htLead2Id, branchId, serviceId, staff2Id, futureDate, chosenSlotTime]),
      (err) => err && err.message.includes('INVALID_APPOINTMENT_SLOT:resource_unavailable'),
      'Second HT acceptance on shared capacity-1 resource must be rejected with resource_unavailable'
    );

    await setAuthUid(null);
    await client.query(`SET ROLE anon;`);
    const pubOverlapRes = (await client.query(`
      SELECT public.create_public_booking(
        'd1-salon', $1, $2, $3::date, $4::time,
        'Synth Public Overlap', 'pub.overlap@example.test', '+905550007788',
        true, false, false, 'idemp-ht-res-overlap', $5, NULL, 'fp-ht-res-overlap'
      ) AS res;
    `, [serviceId, staff2Id, futureDate, chosenSlotTime, branchId])).rows[0].res;
    await client.query(`RESET ROLE;`);
    assert.equal(pubOverlapRes.success, false, 'Public booking on shared capacity-1 resource consumed by HT acceptance must fail');
    assert.equal(pubOverlapRes.reason_code, 'resource_unavailable');

    const countsAfterOverlap = (await client.query(`
      SELECT
        (SELECT count(*)::int FROM public.appointments WHERE tenant_id = $1) AS appts,
        (SELECT count(*)::int FROM public.customers WHERE tenant_id = $1) AS custs,
        (SELECT count(*)::int FROM public.clinic_patient_profiles WHERE tenant_id = $1) AS profiles,
        (SELECT count(*)::int FROM public.appointment_resources WHERE tenant_id = $1) AS resources;
    `, [tenantId])).rows[0];
    assert.deepEqual(countsAfterOverlap, countsBeforeOverlap, 'Rejected HT/public overlapping bookings must cause zero extra DB mutations');

    const lead2StatusAfter = (await client.query(`SELECT status FROM public.ht_leads WHERE id = $1;`, [htLead2Id])).rows[0].status;
    assert.equal(lead2StatusAfter, 'handoff_pending', 'Rejected second HT lead must remain in handoff_pending status');

    // ADIM036-ACCEPT-007: Branch-A-only staff calling ht_accept_lead_into_clinic with Branch-B must be rejected with FORBIDDEN and 0 mutations
    await setAuthUid(ownerUid);
    await assert.rejects(
      async () => client.query(`SELECT public.ht_accept_lead_into_clinic($1, $2, $3, $4, $5::date, '14:00'::time);`, [htLead2Id, branch2Id, serviceB2Id, staffB2Id, futureDate]),
      (err) => err && err.message.includes('FORBIDDEN'),
      'Branch-A-only staff must be denied HT clinic acceptance on Branch B'
    );
    await setAuthUid(null);
    const countsAfterBranchDeny = (await client.query(`
      SELECT
        (SELECT count(*)::int FROM public.appointments WHERE tenant_id = $1) AS appts,
        (SELECT count(*)::int FROM public.customers WHERE tenant_id = $1) AS custs,
        (SELECT count(*)::int FROM public.clinic_patient_profiles WHERE tenant_id = $1) AS profiles,
        (SELECT count(*)::int FROM public.appointment_resources WHERE tenant_id = $1) AS resources;
    `, [tenantId])).rows[0];
    assert.deepEqual(countsAfterBranchDeny, countsBeforeOverlap, 'Branch-denied HT acceptance must cause zero mutations');
    assert.equal((await client.query(`SELECT status FROM public.ht_leads WHERE id = $1;`, [htLead2Id])).rows[0].status, 'handoff_pending');

    // ADIM036-PHI-008: Encounter start, SOAP note write, and completion must enforce current staff_branches membership
    const phi8ApptStartId = 'e1000008-0000-4000-8000-000000000008';
    const phi8ApptOpenId = 'e1000009-0000-4000-8000-000000000009';
    await client.query(`
      INSERT INTO public.appointments (id, tenant_id, branch_id, customer_id, user_name, phone, service_id, staff_id, appointment_date, appointment_time, duration_minutes, status)
      VALUES
        ($1, $3, $4, $5, 'Synth Clinic Patient', '+905550001100', $6, $7, $8::date, '14:30'::time, 30, 'confirmed'),
        ($2, $3, $4, $5, 'Synth Clinic Patient', '+905550001100', $6, $7, $8::date, '15:30'::time, 30, 'confirmed');
    `, [phi8ApptStartId, phi8ApptOpenId, tenantId, branchId, d3CustConsentedId, serviceId, staffId, futureDate]);

    await setAuthUid(staffUid);
    const phi8StartOk = (await client.query(`SELECT public.clinic_start_encounter($1, 'Pre-branch-removal') AS res;`, [phi8ApptOpenId])).rows[0].res;
    assert.equal(phi8StartOk.success, true);
    const phi8EncId = phi8StartOk.encounter_id;

    // Revoke staffId's branch assignment after encounter creation
    await setAuthUid(null);
    await client.query(`DELETE FROM public.staff_branches WHERE tenant_id = $1 AND staff_id = $2 AND branch_id = $3;`, [tenantId, staffId, branchId]);

    const phi8CountsBefore = (await client.query(`
      SELECT
        (SELECT count(*)::int FROM public.clinic_encounters WHERE tenant_id = $1) AS encounters,
        (SELECT count(*)::int FROM public.clinic_encounter_notes WHERE tenant_id = $1) AS notes,
        (SELECT count(*)::int FROM public.appointments WHERE tenant_id = $1) AS appts,
        (SELECT count(*)::int FROM public.audit_events WHERE tenant_id = $1::text) AS audits,
        (SELECT count(*)::int FROM public.communication_outbox WHERE tenant_id = $1::text) AS outbox;
    `, [tenantId])).rows[0];

    await setAuthUid(staffUid);
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_start_encounter($1, 'Revoked branch start');`, [phi8ApptStartId]),
      (err) => err && err.message.includes('FORBIDDEN'),
      'clinic_start_encounter must fail with FORBIDDEN after branch membership removal'
    );
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_save_encounter_note($1, 'S', 'O', 'A', 'P', 'final');`, [phi8EncId]),
      (err) => err && err.message.includes('FORBIDDEN'),
      'clinic_save_encounter_note must fail with FORBIDDEN after branch membership removal'
    );
    await assert.rejects(
      async () => client.query(`SELECT public.clinic_complete_encounter_and_appointment($1);`, [phi8EncId]),
      (err) => err && err.message.includes('FORBIDDEN'),
      'clinic_complete_encounter_and_appointment must fail with FORBIDDEN after branch membership removal'
    );

    await setAuthUid(null);
    const phi8CountsAfter = (await client.query(`
      SELECT
        (SELECT count(*)::int FROM public.clinic_encounters WHERE tenant_id = $1) AS encounters,
        (SELECT count(*)::int FROM public.clinic_encounter_notes WHERE tenant_id = $1) AS notes,
        (SELECT count(*)::int FROM public.appointments WHERE tenant_id = $1) AS appts,
        (SELECT count(*)::int FROM public.audit_events WHERE tenant_id = $1::text) AS audits,
        (SELECT count(*)::int FROM public.communication_outbox WHERE tenant_id = $1::text) AS outbox;
    `, [tenantId])).rows[0];
    assert.deepEqual(phi8CountsAfter, phi8CountsBefore, 'Revoked-branch encounter calls must produce zero mutations across encounter/note/appt/audit/outbox');

    // Restore staffId branch assignment for ADIM036-COMM-009 commercial expiry test
    await client.query(`INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;`, [tenantId, staffId, branchId]);

    // ADIM036-COMM-009: Expired or NULL trial_end / grace_until must block ALL clinic & HT mutation RPCs with zero mutations
    const comm9CountsBefore = (await client.query(`
      SELECT
        (SELECT count(*)::int FROM public.clinic_patient_profiles WHERE tenant_id = $1) AS profiles,
        (SELECT count(*)::int FROM public.clinic_encounters WHERE tenant_id = $1) AS encounters,
        (SELECT count(*)::int FROM public.clinic_encounter_notes WHERE tenant_id = $1) AS notes,
        (SELECT count(*)::int FROM public.appointments WHERE tenant_id = $1) AS appts,
        (SELECT count(*)::int FROM public.appointment_resources WHERE tenant_id = $1) AS resources,
        (SELECT count(*)::int FROM public.ht_leads WHERE tenant_id = $1 AND status = 'converted') AS converted_leads,
        (SELECT count(*)::int FROM public.audit_events WHERE tenant_id = $1::text) AS audits,
        (SELECT count(*)::int FROM public.communication_outbox WHERE tenant_id = $1::text) AS outbox;
    `, [tenantId])).rows[0];
    const comm9ProfileBefore = (await client.query(`
      SELECT blood_type, allergies FROM public.clinic_patient_profiles WHERE tenant_id = $1 AND customer_id = $2;
    `, [tenantId, d3CustConsentedId])).rows[0];

    // ADIM036-COMM-001 (override regression): verify active boolean & integer overrides are granted while eligible,
    // and strictly suppressed to default_deny when trialing/past_due has NULL or expired trial_end/grace_until.
    const activeOverridesCheck = (await client.query(`
      SELECT feature_key, boolean_value, integer_value, is_unlimited, source
      FROM public.resolve_effective_tenant_entitlements($1)
      WHERE feature_key IN ('ht_lead_ops', 'max_coordinators');
    `, [tenantId])).rows;
    const activeOvrMap = Object.fromEntries(activeOverridesCheck.map((r) => [r.feature_key, r]));
    assert.equal(activeOvrMap.ht_lead_ops.boolean_value, true);
    assert.equal(activeOvrMap.ht_lead_ops.source, 'tenant_override');
    assert.equal(Number(activeOvrMap.max_coordinators.integer_value), 2);
    assert.equal(activeOvrMap.max_coordinators.is_unlimited, false);
    assert.equal(activeOvrMap.max_coordinators.source, 'tenant_override');

    const expiredSubStates = [
      { status: 'trialing', trialEndSql: 'NULL', graceUntilSql: 'NULL' },
      { status: 'trialing', trialEndSql: "now() - interval '1 hour'", graceUntilSql: 'NULL' },
      { status: 'past_due', trialEndSql: 'NULL', graceUntilSql: 'NULL' },
      { status: 'past_due', trialEndSql: 'NULL', graceUntilSql: "now() - interval '1 hour'" },
    ];
    for (const st of expiredSubStates) {
      await setAuthenticatedRole(null);
      await client.query(`
        UPDATE public.subscriptions
        SET status = $2,
            trial_end = ${st.trialEndSql},
            grace_until = ${st.graceUntilSql}
        WHERE tenant_id = $1;
      `, [tenantId, st.status]);

      const deniedEntRows = (await client.query(`
        SELECT feature_key, boolean_value, integer_value, is_unlimited, source
        FROM public.resolve_effective_tenant_entitlements($1)
        WHERE feature_key IN ('ht_lead_ops', 'max_coordinators');
      `, [tenantId])).rows;
      const deniedByKey = Object.fromEntries(deniedEntRows.map((r) => [r.feature_key, r]));
      assert.equal(deniedByKey.ht_lead_ops.boolean_value, false, `COMM-001 (${st.status}): active ht_lead_ops override must be denied`);
      assert.equal(deniedByKey.ht_lead_ops.source, 'default_deny', `COMM-001 (${st.status}): ht_lead_ops source must be default_deny`);
      assert.equal(Number(deniedByKey.max_coordinators.integer_value), 0, `COMM-001 (${st.status}): active max_coordinators override must be 0`);
      assert.equal(deniedByKey.max_coordinators.is_unlimited, false, `COMM-001 (${st.status}): max_coordinators is_unlimited must be false`);
      assert.equal(deniedByKey.max_coordinators.source, 'default_deny', `COMM-001 (${st.status}): max_coordinators source must be default_deny`);

      await setAuthenticatedRole(ownerUid);
      await assert.rejects(
        async () => client.query(`SELECT public.clinic_upsert_patient_profile($1, '1991-05-20'::date, 'female', 'Tamper', '+905551112233', 'sibling', 'O-', 'Tampered', 'Tampered');`, [d3CustConsentedId]),
        (err) => err && err.message.includes('FORBIDDEN'),
        `clinic_upsert_patient_profile must fail when subscription is ${st.status}`
      );
      await assert.rejects(
        async () => client.query(`SELECT public.ht_accept_lead_into_clinic($1, $2, $3, $4, $5::date, '16:00'::time);`, [htLead2Id, branchId, serviceId, ownerStaffId, futureDate]),
        (err) => err && err.message.includes('FORBIDDEN'),
        `ht_accept_lead_into_clinic must fail when subscription is ${st.status}`
      );

      await setAuthUid(staffUid);
      await assert.rejects(
        async () => client.query(`SELECT public.clinic_start_encounter($1, 'Expired sub start');`, [phi8ApptStartId]),
        (err) => err && err.message.includes('FORBIDDEN'),
        `clinic_start_encounter must fail when subscription is ${st.status}`
      );
      await assert.rejects(
        async () => client.query(`SELECT public.clinic_save_encounter_note($1, 'S', 'O', 'A', 'P', 'final');`, [phi8EncId]),
        (err) => err && err.message.includes('FORBIDDEN'),
        `clinic_save_encounter_note must fail when subscription is ${st.status}`
      );
      await assert.rejects(
        async () => client.query(`SELECT public.clinic_complete_encounter_and_appointment($1);`, [phi8EncId]),
        (err) => err && err.message.includes('FORBIDDEN'),
        `clinic_complete_encounter_and_appointment must fail when subscription is ${st.status}`
      );
    }

    await setAuthUid(null);
    const comm9CountsAfter = (await client.query(`
      SELECT
        (SELECT count(*)::int FROM public.clinic_patient_profiles WHERE tenant_id = $1) AS profiles,
        (SELECT count(*)::int FROM public.clinic_encounters WHERE tenant_id = $1) AS encounters,
        (SELECT count(*)::int FROM public.clinic_encounter_notes WHERE tenant_id = $1) AS notes,
        (SELECT count(*)::int FROM public.appointments WHERE tenant_id = $1) AS appts,
        (SELECT count(*)::int FROM public.appointment_resources WHERE tenant_id = $1) AS resources,
        (SELECT count(*)::int FROM public.ht_leads WHERE tenant_id = $1 AND status = 'converted') AS converted_leads,
        (SELECT count(*)::int FROM public.audit_events WHERE tenant_id = $1::text) AS audits,
        (SELECT count(*)::int FROM public.communication_outbox WHERE tenant_id = $1::text) AS outbox;
    `, [tenantId])).rows[0];
    assert.deepEqual(comm9CountsAfter, comm9CountsBefore, 'Ineligible subscription mutation attempts must produce zero DB mutations');
    const comm9ProfileAfter = (await client.query(`
      SELECT blood_type, allergies FROM public.clinic_patient_profiles WHERE tenant_id = $1 AND customer_id = $2;
    `, [tenantId, d3CustConsentedId])).rows[0];
    assert.deepEqual(comm9ProfileAfter, comm9ProfileBefore, 'Ineligible subscription must not mutate patient PHI');

    // ADIM036-COMM-010 / COMM-011 / COMM-012: Restore active subscription for test setup, then verify expired or NULL trial_end / grace_until blocks ALL HT mutation RPCs (including ht_create_ai_conversation & ht_set_staff_profile) with FORBIDDEN and zero mutations
    await setAuthenticatedRole(null);
    await client.query(`
      UPDATE public.subscriptions
      SET status = 'manual_active',
          trial_end = NULL,
          grace_until = NULL
      WHERE tenant_id = $1;
    `, [tenantId]);

    await setServiceRole();
    const htConv3Res = (await client.query(`SELECT public.ht_create_ai_conversation($1, 'en', $2) AS res;`, [tenantId, htLead2Id])).rows[0].res;
    assert.equal(htConv3Res.success, true);

    await setAuthenticatedRole(null);
    const comm10CountsBefore = (await client.query(`
      SELECT
        (SELECT count(*)::int FROM public.ht_referring_agencies WHERE tenant_id = $1) AS agencies,
        (SELECT count(*)::int FROM public.ht_leads WHERE tenant_id = $1) AS leads,
        (SELECT count(*)::int FROM public.ht_ai_conversations WHERE tenant_id = $1) AS convs,
        (SELECT count(*)::int FROM public.ht_ai_messages m JOIN public.ht_ai_conversations c ON c.id = m.conversation_id WHERE c.tenant_id = $1) AS msgs,
        (SELECT count(*)::int FROM public.ht_staff_profiles WHERE tenant_id = $1) AS staff_profiles,
        (SELECT count(*)::int FROM public.ht_journey_quotes WHERE tenant_id = $1) AS quotes,
        (SELECT count(*)::int FROM public.ht_journey_itinerary_events WHERE tenant_id = $1) AS itineraries,
        (SELECT count(*)::int FROM public.audit_events WHERE tenant_id = $1::text) AS audits,
        (SELECT count(*)::int FROM public.communication_outbox WHERE tenant_id = $1::text) AS outbox;
    `, [tenantId])).rows[0];
    const comm10LeadBefore = (await client.query(`
      SELECT status, referring_agency_id, assigned_coordinator_staff_id, lead_score, ai_summary, handoff_state, updated_at
      FROM public.ht_leads WHERE id = $1;
    `, [htLead2Id])).rows[0];
    const comm10ConvBefore = (await client.query(`
      SELECT handoff_state, updated_at FROM public.ht_ai_conversations WHERE id = $1;
    `, [htConv3Res.conversation_id])).rows[0];
    const comm10JourneyBefore = (await client.query(`
      SELECT status, updated_at FROM public.ht_treatment_journeys WHERE id = $1;
    `, [journeyId])).rows[0];
    const comm10StaffProfileBefore = (await client.query(`
      SELECT staff_id, tenant_id, can_manage_ht_leads, can_view_ht_leads, created_at, updated_at
      FROM public.ht_staff_profiles WHERE staff_id = $1;
    `, [ownerStaffId])).rows[0];

    for (const st of expiredSubStates) {
      await setAuthenticatedRole(null);
      await client.query(`
        UPDATE public.subscriptions
        SET status = $2,
            trial_end = ${st.trialEndSql},
            grace_until = ${st.graceUntilSql}
        WHERE tenant_id = $1;
      `, [tenantId, st.status]);

      await setAuthenticatedRole(ownerUid);
      await assert.rejects(
        async () => client.query(`SELECT public.ht_set_staff_profile($1, true, true);`, [ownerStaffId]),
        (err) => err && err.message.includes('FORBIDDEN'),
        `ht_set_staff_profile (enable) must fail with FORBIDDEN when subscription is ${st.status}`
      );
      await assert.rejects(
        async () => client.query(`SELECT public.ht_set_staff_profile($1, false, false);`, [ownerStaffId]),
        (err) => err && err.message.includes('FORBIDDEN'),
        `ht_set_staff_profile (disable) must fail with FORBIDDEN when subscription is ${st.status}`
      );
      await assert.rejects(
        async () => client.query(`SELECT public.ht_create_referring_agency('Expired Sub Agency', 'EXP-AG', 'exp@synth.test', '+49111222');`),
        (err) => err && err.message.includes('FORBIDDEN'),
        `ht_create_referring_agency must fail with FORBIDDEN when subscription is ${st.status}`
      );
      await assert.rejects(
        async () => client.query(`SELECT public.ht_update_lead_agency_attribution($1, $2);`, [htLead2Id, agencyId]),
        (err) => err && err.message.includes('FORBIDDEN'),
        `ht_update_lead_agency_attribution must fail with FORBIDDEN when subscription is ${st.status}`
      );
      await assert.rejects(
        async () => client.query(`SELECT public.ht_update_lead_status($1, 'qualified', 'Expired sub status');`, [htLead2Id]),
        (err) => err && err.message.includes('FORBIDDEN'),
        `ht_update_lead_status must fail with FORBIDDEN when subscription is ${st.status}`
      );
      await assert.rejects(
        async () => client.query(`SELECT public.ht_assign_coordinator($1, $2);`, [htLead2Id, ownerStaffId]),
        (err) => err && err.message.includes('FORBIDDEN'),
        `ht_assign_coordinator must fail with FORBIDDEN when subscription is ${st.status}`
      );
      await assert.rejects(
        async () => client.query(`SELECT public.ht_score_lead($1, 5::smallint);`, [htLead2Id]),
        (err) => err && err.message.includes('FORBIDDEN'),
        `ht_score_lead must fail with FORBIDDEN when subscription is ${st.status}`
      );
      await assert.rejects(
        async () => client.query(`SELECT public.ht_update_ai_summary($1, 'Expired sub AI summary');`, [htLead2Id]),
        (err) => err && err.message.includes('FORBIDDEN'),
        `ht_update_ai_summary must fail with FORBIDDEN when subscription is ${st.status}`
      );
      await assert.rejects(
        async () => client.query(`SELECT public.ht_request_handoff($1, 'expired_sub_staff');`, [htConv3Res.conversation_id]),
        (err) => err && err.message.includes('FORBIDDEN'),
        `ht_request_handoff (staff) must fail with FORBIDDEN when subscription is ${st.status}`
      );
      await assert.rejects(
        async () => client.query(`SELECT public.ht_acknowledge_handoff($1);`, [htLead2Id]),
        (err) => err && err.message.includes('FORBIDDEN'),
        `ht_acknowledge_handoff must fail with FORBIDDEN when subscription is ${st.status}`
      );
      await assert.rejects(
        async () => client.query(`SELECT public.ht_enqueue_whatsapp_handoff($1, $2, 'expired_sub_wa');`, [htLead2Id, htConv3Res.conversation_id]),
        (err) => err && err.message.includes('FORBIDDEN'),
        `ht_enqueue_whatsapp_handoff must fail with FORBIDDEN when subscription is ${st.status}`
      );
      await assert.rejects(
        async () => client.query(`SELECT public.ht_create_or_update_journey_quote($1, 'EUR', 120000, '[{"description":"Expired","category":"clinical","amount_minor_units":120000}]'::jsonb);`, [journeyId]),
        (err) => err && err.message.includes('FORBIDDEN'),
        `ht_create_or_update_journey_quote must fail with FORBIDDEN when subscription is ${st.status}`
      );
      await assert.rejects(
        async () => client.query(`SELECT public.ht_add_journey_itinerary_event($1, 'custom', 'Expired Event', now() + interval '6 days');`, [journeyId]),
        (err) => err && err.message.includes('FORBIDDEN'),
        `ht_add_journey_itinerary_event must fail with FORBIDDEN when subscription is ${st.status}`
      );

      await setAuthUid(null);
      await setServiceRole();
      await assert.rejects(
        async () => client.query(`SELECT public.ht_create_ai_conversation($1, 'en', $2);`, [tenantId, htLead2Id]),
        (err) => err && err.message.includes('FORBIDDEN'),
        `ht_create_ai_conversation must fail with FORBIDDEN when subscription is ${st.status}`
      );
      await assert.rejects(
        async () => client.query(`SELECT public.ht_request_handoff($1, 'expired_sub_service');`, [htConv3Res.conversation_id]),
        (err) => err && err.message.includes('FORBIDDEN'),
        `ht_request_handoff (service_role) must fail with FORBIDDEN when subscription is ${st.status}`
      );
    }

    await setAuthenticatedRole(null);
    const comm10CountsAfter = (await client.query(`
      SELECT
        (SELECT count(*)::int FROM public.ht_referring_agencies WHERE tenant_id = $1) AS agencies,
        (SELECT count(*)::int FROM public.ht_leads WHERE tenant_id = $1) AS leads,
        (SELECT count(*)::int FROM public.ht_ai_conversations WHERE tenant_id = $1) AS convs,
        (SELECT count(*)::int FROM public.ht_ai_messages m JOIN public.ht_ai_conversations c ON c.id = m.conversation_id WHERE c.tenant_id = $1) AS msgs,
        (SELECT count(*)::int FROM public.ht_staff_profiles WHERE tenant_id = $1) AS staff_profiles,
        (SELECT count(*)::int FROM public.ht_journey_quotes WHERE tenant_id = $1) AS quotes,
        (SELECT count(*)::int FROM public.ht_journey_itinerary_events WHERE tenant_id = $1) AS itineraries,
        (SELECT count(*)::int FROM public.audit_events WHERE tenant_id = $1::text) AS audits,
        (SELECT count(*)::int FROM public.communication_outbox WHERE tenant_id = $1::text) AS outbox;
    `, [tenantId])).rows[0];
    assert.deepEqual(comm10CountsAfter, comm10CountsBefore, 'Ineligible subscription HT mutation attempts must produce zero DB mutations');

    const comm10LeadAfter = (await client.query(`
      SELECT status, referring_agency_id, assigned_coordinator_staff_id, lead_score, ai_summary, handoff_state, updated_at
      FROM public.ht_leads WHERE id = $1;
    `, [htLead2Id])).rows[0];
    assert.deepEqual(comm10LeadAfter, comm10LeadBefore, 'Ineligible subscription must not mutate ht_leads');

    const comm10ConvAfter = (await client.query(`
      SELECT handoff_state, updated_at FROM public.ht_ai_conversations WHERE id = $1;
    `, [htConv3Res.conversation_id])).rows[0];
    assert.deepEqual(comm10ConvAfter, comm10ConvBefore, 'Ineligible subscription must not mutate ht_ai_conversations');

    const comm10JourneyAfter = (await client.query(`
      SELECT status, updated_at FROM public.ht_treatment_journeys WHERE id = $1;
    `, [journeyId])).rows[0];
    assert.deepEqual(comm10JourneyAfter, comm10JourneyBefore, 'Ineligible subscription must not mutate ht_treatment_journeys');

    const comm10StaffProfileAfter = (await client.query(`
      SELECT staff_id, tenant_id, can_manage_ht_leads, can_view_ht_leads, created_at, updated_at
      FROM public.ht_staff_profiles WHERE staff_id = $1;
    `, [ownerStaffId])).rows[0];
    assert.deepEqual(comm10StaffProfileAfter, comm10StaffProfileBefore, 'Ineligible subscription must not mutate ht_staff_profiles');

    // ADIM036-COMM-013: Explicit NULL p_at must resolve v_effective_at := COALESCE(p_at, now()) across restriction, override & subscription predicates
    await setAuthenticatedRole(null);
    await client.query(`
      UPDATE public.subscriptions
      SET status = 'manual_active',
          trial_end = NULL,
          grace_until = NULL
      WHERE tenant_id = $1;
    `, [tenantId]);

    const comm13RestId = (await client.query(`
      INSERT INTO public.platform_system_restrictions (tenant_id, feature_key, is_restricted, reason, starts_at, expires_at)
      VALUES ($1, 'clinic_workspace', true, 'ADIM036-COMM-013 explicit NULL p_at test', now() - interval '5 minutes', now() + interval '1 hour')
      RETURNING id;
    `, [tenantId])).rows[0].id;

    try {
      const comm13EntRows = (await client.query(`
        SELECT feature_key, boolean_value, source
        FROM public.resolve_effective_tenant_entitlements($1, NULL)
        WHERE feature_key IN ('clinic_workspace', 'ht_lead_ops');
      `, [tenantId])).rows;
      const comm13ByKey = Object.fromEntries(comm13EntRows.map((r) => [r.feature_key, r]));
      assert.equal(comm13ByKey.clinic_workspace.boolean_value, false, 'COMM-013: clinic_workspace under active restriction with explicit NULL p_at must be false');
      assert.equal(comm13ByKey.clinic_workspace.source, 'platform_restriction', 'COMM-013: clinic_workspace source with explicit NULL p_at must be platform_restriction');
      assert.equal(comm13ByKey.ht_lead_ops.boolean_value, true, 'COMM-013: unrestricted active override with explicit NULL p_at must remain true');
      assert.equal(comm13ByKey.ht_lead_ops.source, 'tenant_override', 'COMM-013: unrestricted active override source with explicit NULL p_at must be tenant_override');

      await setAuthenticatedRole(ownerUid);
      const comm13VertCtx = (await client.query(`SELECT public.resolve_tenant_vertical_context($1, NULL) AS res;`, [tenantId])).rows[0].res;
      assert.equal(comm13VertCtx.success, true);
      assert.equal(comm13VertCtx.eligible, true);
      assert.equal(comm13VertCtx.verticals.clinic_enabled, false, 'COMM-013: resolve_tenant_vertical_context with explicit NULL p_at must return clinic_enabled=false under restriction');
    } finally {
      await setAuthenticatedRole(null);
      await client.query(`DELETE FROM public.platform_system_restrictions WHERE id = $1;`, [comm13RestId]);
    }

    // ADIM036-HT-READ-015: Acceptance read RPCs must require eligible=true, clinic_enabled=true, and health_tourism_enabled=true
    try {
      await setAuthenticatedRole(ownerUid);
      const htReadBaselineList = (await client.query(`SELECT * FROM public.ht_list_pending_clinic_acceptance();`)).rows;
      const htReadLeadRow = htReadBaselineList.find((r) => r.lead_id === htLead2Id);
      assert.ok(htReadLeadRow, 'Baseline eligible dual-vertical tenant must list pending HT lead');
      assert.equal(htReadLeadRow.full_name, 'Synth Int Patient 2');
      assert.equal(htReadLeadRow.email, 'ht.synth2@example.test');
      assert.equal(htReadLeadRow.phone, '+447700900222');

      const htReadBaselineOpts = (await client.query(
        `SELECT public.ht_get_clinic_acceptance_options($1, $2, $3) AS res;`,
        [htLead2Id, branchId, serviceId]
      )).rows[0].res;
      assert.ok(Array.isArray(htReadBaselineOpts.branches) && htReadBaselineOpts.branches.length > 0);
      assert.ok(Array.isArray(htReadBaselineOpts.services) && htReadBaselineOpts.services.length > 0);
      assert.ok(Array.isArray(htReadBaselineOpts.practitioners) && htReadBaselineOpts.practitioners.length > 0);

      const htReadBaselineSlots = (await client.query(
        `SELECT public.ht_get_clinic_acceptance_slots($1, $2, $3, $4, $5::date) AS res;`,
        [htLead2Id, branchId, serviceId, ownerStaffId, futureDate]
      )).rows[0].res;
      assert.ok(Array.isArray(htReadBaselineSlots.available_slots) && htReadBaselineSlots.available_slots.length > 0);

      // 1) Ineligible trialing/past_due (NULL or expired trial_end / grace_until) -> all 3 read RPCs fail with FORBIDDEN
      for (const st of expiredSubStates) {
        await setAuthenticatedRole(null);
        await client.query(`
          UPDATE public.subscriptions
          SET status = $2,
              trial_end = ${st.trialEndSql},
              grace_until = ${st.graceUntilSql}
          WHERE tenant_id = $1;
        `, [tenantId, st.status]);

        await setAuthenticatedRole(ownerUid);
        await assert.rejects(
          async () => client.query(`SELECT * FROM public.ht_list_pending_clinic_acceptance();`),
          (err) => err && err.message.includes('FORBIDDEN'),
          `HT-READ-015: ht_list_pending_clinic_acceptance must fail with FORBIDDEN when subscription is ${st.status} (trial_end=${st.trialEndSql}, grace_until=${st.graceUntilSql})`
        );
        await assert.rejects(
          async () => client.query(`SELECT public.ht_get_clinic_acceptance_options($1, $2, $3);`, [htLead2Id, branchId, serviceId]),
          (err) => err && err.message.includes('FORBIDDEN'),
          `HT-READ-015: ht_get_clinic_acceptance_options must fail with FORBIDDEN when subscription is ${st.status} (trial_end=${st.trialEndSql}, grace_until=${st.graceUntilSql})`
        );
        await assert.rejects(
          async () => client.query(`SELECT public.ht_get_clinic_acceptance_slots($1, $2, $3, $4, $5::date);`, [htLead2Id, branchId, serviceId, ownerStaffId, futureDate]),
          (err) => err && err.message.includes('FORBIDDEN'),
          `HT-READ-015: ht_get_clinic_acceptance_slots must fail with FORBIDDEN when subscription is ${st.status} (trial_end=${st.trialEndSql}, grace_until=${st.graceUntilSql})`
        );
      }

      // 2) Eligible subscription with ht_lead_ops removed -> health_tourism_enabled=false -> all 3 read RPCs return no lead PII, options, or slots (FORBIDDEN)
      await setAuthenticatedRole(null);
      await client.query(`
        UPDATE public.subscriptions
        SET status = 'manual_active',
            trial_end = NULL,
            grace_until = NULL
        WHERE tenant_id = $1;
      `, [tenantId]);
      await client.query(`
        DELETE FROM public.tenant_entitlement_overrides
        WHERE tenant_id = $1 AND feature_key = 'ht_lead_ops';
      `, [tenantId]);

      await setAuthenticatedRole(ownerUid);
      const noHtVertCtx = (await client.query(`SELECT public.resolve_tenant_vertical_context($1) AS res;`, [tenantId])).rows[0].res;
      assert.equal(noHtVertCtx.eligible, true);
      assert.equal(noHtVertCtx.verticals.clinic_enabled, true);
      assert.equal(noHtVertCtx.verticals.health_tourism_enabled, false);

      await assert.rejects(
        async () => client.query(`SELECT * FROM public.ht_list_pending_clinic_acceptance();`),
        (err) => err && err.message.includes('FORBIDDEN'),
        'HT-READ-015: ht_list_pending_clinic_acceptance must fail with FORBIDDEN and return no lead PII when ht_lead_ops is removed'
      );
      await assert.rejects(
        async () => client.query(`SELECT public.ht_get_clinic_acceptance_options($1, $2, $3);`, [htLead2Id, branchId, serviceId]),
        (err) => err && err.message.includes('FORBIDDEN'),
        'HT-READ-015: ht_get_clinic_acceptance_options must fail with FORBIDDEN and return no options when ht_lead_ops is removed'
      );
      await assert.rejects(
        async () => client.query(`SELECT public.ht_get_clinic_acceptance_slots($1, $2, $3, $4, $5::date);`, [htLead2Id, branchId, serviceId, ownerStaffId, futureDate]),
        (err) => err && err.message.includes('FORBIDDEN'),
        'HT-READ-015: ht_get_clinic_acceptance_slots must fail with FORBIDDEN and return no slots when ht_lead_ops is removed'
      );

      // 3) Eligible subscription with ht_lead_ops active but clinic_workspace restricted -> clinic_enabled=false -> all 3 read RPCs fail with FORBIDDEN
      await setAuthenticatedRole(null);
      await client.query(`
        INSERT INTO public.tenant_entitlement_overrides (tenant_id, feature_key, value_type, boolean_value, integer_value, reason, created_by)
        VALUES ($1, 'ht_lead_ops', 'boolean', true, NULL, 'ADIM-036 synth test', $2)
        ON CONFLICT DO NOTHING;
      `, [tenantId, superAdminUid]);
      const htReadClinicRestId = (await client.query(`
        INSERT INTO public.platform_system_restrictions (tenant_id, feature_key, is_restricted, reason, starts_at, expires_at)
        VALUES ($1, 'clinic_workspace', true, 'ADIM036-HT-READ-015 clinic_workspace restriction test', now() - interval '5 minutes', now() + interval '1 hour')
        RETURNING id;
      `, [tenantId])).rows[0].id;
      try {
        await setAuthenticatedRole(ownerUid);
        await assert.rejects(
          async () => client.query(`SELECT * FROM public.ht_list_pending_clinic_acceptance();`),
          (err) => err && err.message.includes('FORBIDDEN'),
          'HT-READ-015: ht_list_pending_clinic_acceptance must fail with FORBIDDEN when clinic_workspace is restricted'
        );
        await assert.rejects(
          async () => client.query(`SELECT public.ht_get_clinic_acceptance_options($1, $2, $3);`, [htLead2Id, branchId, serviceId]),
          (err) => err && err.message.includes('FORBIDDEN'),
          'HT-READ-015: ht_get_clinic_acceptance_options must fail with FORBIDDEN when clinic_workspace is restricted'
        );
        await assert.rejects(
          async () => client.query(`SELECT public.ht_get_clinic_acceptance_slots($1, $2, $3, $4, $5::date);`, [htLead2Id, branchId, serviceId, ownerStaffId, futureDate]),
          (err) => err && err.message.includes('FORBIDDEN'),
          'HT-READ-015: ht_get_clinic_acceptance_slots must fail with FORBIDDEN when clinic_workspace is restricted'
        );
      } finally {
        await setAuthenticatedRole(null);
        await client.query(`DELETE FROM public.platform_system_restrictions WHERE id = $1;`, [htReadClinicRestId]);
      }
    } finally {
      await setAuthenticatedRole(null);
      await client.query(`
        UPDATE public.subscriptions
        SET status = 'manual_active',
            trial_end = NULL,
            grace_until = NULL
        WHERE tenant_id = $1;
      `, [tenantId]);
      await client.query(`
        INSERT INTO public.tenant_entitlement_overrides (tenant_id, feature_key, value_type, boolean_value, integer_value, reason, created_by)
        VALUES ($1, 'ht_lead_ops', 'boolean', true, NULL, 'ADIM-036 synth test', $2)
        ON CONFLICT DO NOTHING;
      `, [tenantId, superAdminUid]);
    }

    console.log('[PASS] Phase 5 Vertical Commercial Core, Clinic Domain & Health Tourism (ADIM-036 Faz E1) verified on PG17');

    // ADIM036-ONBOARDING-014: Fresh pending_onboarding tenant can create branches up to assigned max_branches quota,
    // excess branch fails with commercial_quota_exceeded, public booking & general commercial eligibility remain closed,
    // and package_branch_server_authority_tests.sql passes on the full 93-migration chain.
    await setAuthenticatedRole(null);
    const onb014OwnerUid = '99999999-aaaa-4aaa-8aaa-999999999014';
    await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'onb014@example.test') ON CONFLICT DO NOTHING;`, [onb014OwnerUid]);
    await setAuthenticatedRole(onb014OwnerUid);
    const onb014Prov = (await client.query(`
      SELECT public.provision_tenant_for_authenticated_owner(
        'Onboarding 014 Salon',
        'Onboarding 014',
        'Hair Salon',
        'Istanbul',
        '+905551110014',
        'baslangic',
        'idemp-adim036-onb-014'
      ) AS res;
    `)).rows[0].res;
    assert.equal(onb014Prov.success, true);
    assert.equal(onb014Prov.subscription_status, 'pending_onboarding');
    const onb014TenantId = onb014Prov.tenant_id;
    const onb014Slug = onb014Prov.slug;

    await setAuthenticatedRole(null);
    const onb014Elig = (await client.query(`SELECT public.resolve_tenant_commercial_eligibility($1) AS res;`, [onb014TenantId])).rows[0].res;
    assert.equal(onb014Elig.eligible, false, 'pending_onboarding commercial eligibility must remain false');
    assert.equal(onb014Elig.reason_code, 'commercial_status_not_eligible');

    const onb014EntCount = (await client.query(`
      SELECT count(*)::int AS cnt
      FROM public.resolve_effective_tenant_entitlements($1, now())
      WHERE source = 'plan_version'
         OR boolean_value = true
         OR (integer_value IS NOT NULL AND integer_value > 0 AND is_unlimited = false AND source != 'default_deny');
    `, [onb014TenantId])).rows[0].cnt;
    assert.equal(onb014EntCount, 0, 'pending_onboarding effective plan entitlements must remain zero');

    await client.query(`SET ROLE anon;`);
    const onb014PubCheck = (await client.query(`SELECT public.can_accept_public_booking($1) AS res;`, [onb014Slug])).rows[0].res;
    assert.equal(onb014PubCheck.allowed, false, 'pending_onboarding public booking eligibility must remain closed');
    await client.query(`RESET ROLE;`);

    await setAuthenticatedRole(onb014OwnerUid);
    const onb014VertCtx = (await client.query(`SELECT public.resolve_tenant_vertical_context($1) AS res;`, [onb014TenantId])).rows[0].res;
    assert.equal(onb014VertCtx.eligible, false, 'pending_onboarding vertical commercial context must remain closed');

    const onb014Branch1 = (await client.query(`
      SELECT public.create_tenant_branch($1, 'İlk Şube', 'ilk-sube') AS res;
    `, [onb014TenantId])).rows[0].res;
    assert.equal(onb014Branch1.success, true, 'pending_onboarding tenant must be allowed to create first branch within baslangic max_branches=1');
    assert.equal(onb014Branch1.branch.is_primary, true);

    await assert.rejects(
      async () => client.query(`SELECT public.create_tenant_branch($1, 'İkinci Şube', 'ikinci-sube');`, [onb014TenantId]),
      (err) => err && err.message.includes('commercial_quota_exceeded'),
      'pending_onboarding tenant creating a branch above baslangic max_branches=1 must fail with commercial_quota_exceeded'
    );

    await setAuthenticatedRole(null);
    const onb014BranchCount = (await client.query(`SELECT count(*)::int AS cnt FROM public.branches WHERE tenant_id = $1;`, [onb014TenantId])).rows[0].cnt;
    assert.equal(onb014BranchCount, 1);

    const packageBranchSql = fs.readFileSync(path.join(testsDir, 'package_branch_server_authority_tests.sql'), 'utf8');
    await client.query(packageBranchSql);
    await client.query(`RESET ROLE;`);
    console.log('[PASS] ADIM036-ONBOARDING-014 pending_onboarding branch quota + package_branch_server_authority_tests.sql verified on PG17');

    // =========================================================================
    // ADIM-037 Faz F1: Discovery Marketplace, Verified Reviews & Favorites / Fast-Rebooking
    // =========================================================================
    console.log('\n── ADIM-037 Faz F1 PG17 Behavioral & Negative RLS Matrix ──');
    await setAuthenticatedRole(null);
    await client.query(`UPDATE public.platform_global_release_control SET release_phase = 'full_production' WHERE id = 1;`);

    const f1TenantA = 'f1000001-0000-4000-8000-000000000001';
    const f1TenantB = 'f1000001-0000-4000-8000-000000000002';
    const f1TenantDraft = 'f1000001-0000-4000-8000-000000000003';
    const f1TenantDisabledProf = 'f1000001-0000-4000-8000-000000000004';
    const f1BranchA = 'f1000002-0000-4000-8000-000000000001';
    const f1BranchB = 'f1000002-0000-4000-8000-000000000002';
    const f1ServiceA = 'f1000003-0000-4000-8000-000000000001';
    const f1ServiceB = 'f1000003-0000-4000-8000-000000000002';
    const f1StaffA = 'f1000004-0000-4000-8000-000000000001';
    const f1StaffB = 'f1000004-0000-4000-8000-000000000002';
    const f1OwnerAUid = 'f1000005-0000-4000-8000-000000000001';
    const f1CustAUid = 'f1000005-0000-4000-8000-000000000002';
    const f1CustBUid = 'f1000005-0000-4000-8000-000000000003';
    const f1CustAId = 'f1000006-0000-4000-8000-000000000001';
    const f1CustBId = 'f1000006-0000-4000-8000-000000000002';
    const f1ApptCompletedA = 'f1000007-0000-4000-8000-000000000001';
    const f1ApptConfirmedA = 'f1000007-0000-4000-8000-000000000002';
    const f1ApptTokenCompletedA = 'f1000007-0000-4000-8000-000000000003';
    const f1ApptCompletedB = 'f1000007-0000-4000-8000-000000000004';

    await client.query(`
      INSERT INTO auth.users (id, email)
      VALUES
        ($1, 'f1-owner-a@example.test'),
        ($2, 'f1-cust-a@example.test'),
        ($3, 'f1-cust-b@example.test')
      ON CONFLICT DO NOTHING;
    `, [f1OwnerAUid, f1CustAUid, f1CustBUid]);

    await client.query(`
      INSERT INTO public.tenants (id, slug, name, status, onboarding_status, public_site_status)
      VALUES
        ($1, 'f1-salon-alpha', 'F1 Salon Alpha', 'active', 'completed', 'published'),
        ($2, 'f1-salon-beta', 'F1 Salon Beta', 'active', 'completed', 'published'),
        ($3, 'f1-salon-draft', 'F1 Salon Draft', 'active', 'completed', 'draft'),
        ($4, 'f1-salon-hidden', 'F1 Salon Hidden', 'active', 'completed', 'published');
    `, [f1TenantA, f1TenantB, f1TenantDraft, f1TenantDisabledProf]);

    await client.query(`
      INSERT INTO public.tenant_business_profiles (tenant_id, business_category, city, district, short_description, is_public_profile_enabled)
      VALUES
        ($1, 'Kuaför', 'İstanbul', 'Şişli', 'Nişantaşı stüdyosu', true),
        ($2, 'Spa', 'Ankara', 'Çankaya', 'Spa merkezi', true),
        ($3, 'Kuaför', 'İzmir', 'Konak', 'Taslak salon', true),
        ($4, 'Kuaför', 'İstanbul', 'Kadıköy', 'Gizli profil', false);
    `, [f1TenantA, f1TenantB, f1TenantDraft, f1TenantDisabledProf]);

    await client.query(`
      INSERT INTO public.users_profile (id, tenant_id, name, role, active)
      VALUES
        ($1, $4, 'F1 Owner A', 'tenant_owner', true),
        ($2, $4, 'F1 Cust A', 'customer', true),
        ($3, $5, 'F1 Cust B', 'customer', true);
    `, [f1OwnerAUid, f1CustAUid, f1CustBUid, f1TenantA, f1TenantB]);

    await client.query(`
      INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode, current_period_start, current_period_end)
      SELECT tid, sub.code, sub.id, 'active', 'manual', now(), now() + interval '1 year'
      FROM unnest(ARRAY[$1::uuid, $2::uuid, $3::uuid, $4::uuid]) AS tid
      CROSS JOIN LATERAL (
        SELECT pv.id, p.code
        FROM public.plan_versions pv
        JOIN public.plans p ON p.id = pv.plan_id
        WHERE p.code = 'kurumsal' AND pv.lifecycle_status = 'published'
        LIMIT 1
      ) sub;
    `, [f1TenantA, f1TenantB, f1TenantDraft, f1TenantDisabledProf]);

    await client.query(`
      INSERT INTO public.branches (id, tenant_id, name, slug, is_active, is_primary, timezone)
      VALUES
        ($1, $3, 'Alpha Merkez', 'alpha-merkez', true, true, 'Europe/Istanbul'),
        ($2, $4, 'Beta Merkez', 'beta-merkez', true, true, 'Europe/Istanbul');
    `, [f1BranchA, f1BranchB, f1TenantA, f1TenantB]);

    await client.query(`
      INSERT INTO public.services (id, tenant_id, name, name_tr, duration, price, active)
      VALUES
        ($1, $3, 'F1 Haircut', 'F1 Saç Kesimi', 45, 750, true),
        ($2, $4, 'F1 Massage', 'F1 Masaj', 60, 1200, true);
    `, [f1ServiceA, f1ServiceB, f1TenantA, f1TenantB]);

    await client.query(`
      INSERT INTO public.staff (id, tenant_id, name, active)
      VALUES
        ($1, $3, 'F1 Stylist A', true),
        ($2, $4, 'F1 Therapist B', true);
    `, [f1StaffA, f1StaffB, f1TenantA, f1TenantB]);

    await client.query(`INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id) VALUES ($1, $2, $3), ($4, $5, $6);`, [f1TenantA, f1StaffA, f1BranchA, f1TenantB, f1StaffB, f1BranchB]);
    await client.query(`INSERT INTO public.service_branches (tenant_id, service_id, branch_id) VALUES ($1, $2, $3), ($4, $5, $6);`, [f1TenantA, f1ServiceA, f1BranchA, f1TenantB, f1ServiceB, f1BranchB]);
    await client.query(`INSERT INTO public.staff_services (staff_id, service_id) VALUES ($1, $2), ($3, $4);`, [f1StaffA, f1ServiceA, f1StaffB, f1ServiceB]);

    await client.query(`
      INSERT INTO public.customers (id, tenant_id, user_profile_id, name, email, phone)
      VALUES
        ($1, $3, $5, 'F1 Müşteri A', 'f1-cust-a@example.test', '+905551110001'),
        ($2, $4, $6, 'F1 Müşteri B', 'f1-cust-b@example.test', '+905551110002');
    `, [f1CustAId, f1CustBId, f1TenantA, f1TenantB, f1CustAUid, f1CustBUid]);

    await client.query(`
      INSERT INTO public.appointments (id, tenant_id, branch_id, customer_id, service_id, staff_id, user_name, user_email, phone, appointment_date, appointment_time, duration_minutes, status)
      VALUES
        ($1, $5, $7, $9, $11, $13, 'F1 Müşteri A', 'f1-cust-a@example.test', '+905551110001', CURRENT_DATE - 3, '10:00', 45, 'completed'),
        ($2, $5, $7, $9, $11, $13, 'F1 Müşteri A', 'f1-cust-a@example.test', '+905551110001', CURRENT_DATE + 3, '11:00', 45, 'confirmed'),
        ($3, $5, $7, $9, $11, $13, 'F1 Müşteri A', 'f1-cust-a@example.test', '+905551110001', CURRENT_DATE - 1, '12:00', 45, 'completed'),
        ($4, $6, $8, $10, $12, $14, 'F1 Müşteri B', 'f1-cust-b@example.test', '+905551110002', CURRENT_DATE - 2, '14:00', 60, 'completed');
    `, [
      f1ApptCompletedA, f1ApptConfirmedA, f1ApptTokenCompletedA, f1ApptCompletedB,
      f1TenantA, f1TenantB, f1BranchA, f1BranchB, f1CustAId, f1CustBId, f1ServiceA, f1ServiceB, f1StaffA, f1StaffB
    ]);

    const rawTokenCompleted = 'f1_valid_completed_token_' + 'a'.repeat(40);
    const rawTokenConfirmed = 'f1_valid_confirmed_token_' + 'b'.repeat(40);
    const rawTokenExpired = 'f1_expired_token_' + 'c'.repeat(48);
    const rawTokenUsed = 'f1_used_token_' + 'd'.repeat(51);

    await client.query(`
      INSERT INTO public.appointment_access_tokens (tenant_id, appointment_id, token_hash, expires_at, used_at)
      VALUES
        ($1, $2, encode(sha256($3::bytea), 'hex'), now() + interval '7 days', NULL),
        ($1, $4, encode(sha256($5::bytea), 'hex'), now() + interval '7 days', NULL),
        ($1, $2, encode(sha256($6::bytea), 'hex'), now() - interval '1 hour', NULL),
        ($1, $2, encode(sha256($7::bytea), 'hex'), now() + interval '7 days', now());
    `, [f1TenantA.toString(), f1ApptTokenCompletedA, rawTokenCompleted, f1ApptConfirmedA, rawTokenConfirmed, rawTokenExpired, rawTokenUsed]);

    // 1. Direct table access must be denied for anon and authenticated across Phase 7 tables
    await client.query(`SELECT set_config('request.jwt.claim.sub', '', false); SET ROLE anon;`);
    for (const tbl of ['reviews', 'review_idempotency_keys', 'customer_favorites']) {
      await assert.rejects(
        async () => client.query(`SELECT * FROM public.${tbl};`),
        (err) => err && err.message.includes('permission denied'),
        `anon direct SELECT on ${tbl} must be denied`
      );
    }
    await assert.rejects(
      async () => client.query(`SELECT public.create_verified_review($1, 5, 'Anon', 'Fail', 'anon-k1');`, [f1ApptCompletedA]),
      (err) => err && (err.message.includes('permission denied') || err.message.includes('UNAUTHENTICATED')),
      'anon cannot execute create_verified_review'
    );
    await assert.rejects(
      async () => client.query(`SELECT public.set_customer_favorite($1, true) AS res;`, [f1TenantA]),
      (err) => err && (err.message.includes('permission denied') || err.message.includes('UNAUTHENTICATED')),
      'anon cannot execute set_customer_favorite'
    );
    await assert.rejects(
      async () => client.query(`SELECT public.get_customer_favorites() AS res;`),
      (err) => err && (err.message.includes('permission denied') || err.message.includes('UNAUTHENTICATED')),
      'anon cannot execute get_customer_favorites'
    );
    await client.query(`RESET ROLE;`);

    await setAuthenticatedRole(null);
    await client.query(`SELECT set_config('request.jwt.claim.sub', '', false); SET ROLE authenticated;`);
    const unauthFav = (await client.query(`SELECT public.set_customer_favorite($1, true) AS res;`, [f1TenantA])).rows[0].res;
    assert.equal(unauthFav.success, false);
    assert.equal(unauthFav.reason_code, 'UNAUTHENTICATED');
    const unauthFavList = (await client.query(`SELECT public.get_customer_favorites() AS res;`)).rows[0].res;
    assert.equal(unauthFavList.success, false);
    assert.equal(unauthFavList.reason_code, 'UNAUTHENTICATED');
    await client.query(`RESET ROLE;`);

    await setAuthenticatedRole(f1CustAUid);
    for (const tbl of ['reviews', 'review_idempotency_keys', 'customer_favorites']) {
      await assert.rejects(
        async () => client.query(`SELECT * FROM public.${tbl};`),
        (err) => err && err.message.includes('permission denied'),
        `authenticated direct SELECT on ${tbl} must be denied`
      );
    }

    // 2. Authenticated verified review: rejects confirmed appointment & cross-tenant appointment, succeeds for completed
    const revNonComp = (await client.query(`SELECT public.create_verified_review($1, 5, 'Early', 'Not done', 'f1-k-uncomp') AS res;`, [f1ApptConfirmedA])).rows[0].res;
    assert.equal(revNonComp.success, false);
    assert.equal(revNonComp.reason_code, 'appointment_not_completed');

    await assert.rejects(
      async () => client.query(`SELECT public.create_verified_review($1, 5, 'Cross', 'Steal', 'f1-k-cross');`, [f1ApptCompletedB]),
      (err) => err && (err.message.includes('FORBIDDEN') || err.message.includes('CROSS_TENANT_VIOLATION')),
      'Customer A must be forbidden from reviewing Tenant B appointment'
    );

    const revOk = (await client.query(`SELECT public.create_verified_review($1, 5, 'Harika Hizmet', 'Çok profesyonel', 'f1-k-ok-1') AS res;`, [f1ApptCompletedA])).rows[0].res;
    assert.equal(revOk.success, true);
    assert.equal(revOk.idempotent_replay, false);

    const revReplay = (await client.query(`SELECT public.create_verified_review($1, 5, 'Harika Hizmet', 'Çok profesyonel', 'f1-k-ok-1') AS res;`, [f1ApptCompletedA])).rows[0].res;
    assert.equal(revReplay.success, true);
    assert.equal(revReplay.idempotent_replay, true);
    assert.equal(revReplay.review_id, revOk.review_id);

    await assert.rejects(
      async () => client.query(`SELECT public.create_verified_review($1, 3, 'Harika Hizmet', 'Çok profesyonel', 'f1-k-ok-1');`, [f1ApptCompletedA]),
      (err) => err && err.message.includes('IDEMPOTENCY_CONFLICT')
    );

    const revDup = (await client.query(`SELECT public.create_verified_review($1, 4, 'Dup', 'Second try', 'f1-k-ok-2') AS res;`, [f1ApptCompletedA])).rows[0].res;
    assert.equal(revDup.success, false);
    assert.equal(revDup.reason_code, 'duplicate_review');

    // 3. Manage-token verified review: bogus/expired/used/cross-tenant/confirmed rejected; completed succeeds; 5-failure lockout works
    await setAuthenticatedRole(null);
    await client.query(`SET ROLE anon;`);
    const tokBad = (await client.query(`SELECT public.create_verified_review_by_manage_token('forged-short-token', 5, 'T', 'C', 'tk-1', NULL, 'fp-rev-bad', '10.20.30.40') AS res;`)).rows[0].res;
    assert.equal(tokBad.success, false);
    assert.equal(tokBad.reason_code, 'invalid_token');

    const tokExp = (await client.query(`SELECT public.create_verified_review_by_manage_token($1, 5, 'T', 'C', 'tk-2', NULL, 'fp-rev-exp', '10.20.30.41') AS res;`, [rawTokenExpired])).rows[0].res;
    assert.equal(tokExp.success, false);
    assert.equal(tokExp.reason_code, 'TOKEN_EXPIRED');

    const tokUsed = (await client.query(`SELECT public.create_verified_review_by_manage_token($1, 5, 'T', 'C', 'tk-3', NULL, 'fp-rev-used', '10.20.30.42') AS res;`, [rawTokenUsed])).rows[0].res;
    assert.equal(tokUsed.success, false);
    assert.equal(tokUsed.reason_code, 'TOKEN_EXPIRED');

    // Brute-force 5 failures lockout check
    for (let attempt = 0; attempt < 5; attempt++) {
      await client.query(`SELECT public.create_verified_review_by_manage_token($1, 5, 'T', 'C', 'tk-bf', NULL, 'fp-rev-bf', '10.20.30.99');`, ['z'.repeat(64)]);
    }
    const tokLocked = (await client.query(`SELECT public.create_verified_review_by_manage_token($1, 5, 'T', 'C', 'tk-bf-6', NULL, 'fp-rev-bf', '10.20.30.99') AS res;`, [rawTokenCompleted])).rows[0].res;
    assert.equal(tokLocked.success, false);
    assert.equal(tokLocked.reason_code, 'TOKEN_LOOKUP_RATE_LIMITED');

    // Cross-tenant expected slug mismatch must fail closed
    await assert.rejects(
      async () => client.query(`SELECT public.create_verified_review_by_manage_token($1, 5, 'T', 'C', 'tk-cross', 'f1-salon-beta', 'fp-rev-ok', '10.20.30.50');`, [rawTokenCompleted]),
      (err) => err && err.message.includes('CROSS_TENANT_VIOLATION')
    );

    // Non-completed appointment token rejected
    const tokConf = (await client.query(`SELECT public.create_verified_review_by_manage_token($1, 5, 'T', 'C', 'tk-conf', 'f1-salon-alpha', 'fp-rev-ok', '10.20.30.50') AS res;`, [rawTokenConfirmed])).rows[0].res;
    assert.equal(tokConf.success, false);
    assert.equal(tokConf.reason_code, 'appointment_not_completed');

    // Valid completed appointment token succeeds (initially unpublished)
    const tokOk = (await client.query(`SELECT public.create_verified_review_by_manage_token($1, 4, 'Token Yorumu', 'Gayet iyi', 'tk-ok-1', 'f1-salon-alpha', 'fp-rev-ok', '10.20.30.50') AS res;`, [rawTokenCompleted])).rows[0].res;
    assert.equal(tokOk.success, true);
    assert.equal(tokOk.idempotent_replay, false);

    // Before moderation publish, public reviews and discovery listing must report 0 reviews; draft tenant returns tenant_not_found
    const pubBeforeMod = (await client.query(`SELECT public.get_public_reviews('f1-salon-alpha') AS res;`)).rows[0].res;
    assert.equal(pubBeforeMod.aggregate.total_count, 0);
    const pubDraft = (await client.query(`SELECT public.get_public_reviews('f1-salon-draft') AS res;`)).rows[0].res;
    assert.equal(pubDraft.success, false);
    assert.equal(pubDraft.reason_code, 'tenant_not_found');
    await client.query(`RESET ROLE;`);

    // 4. Moderation: customer & cross-tenant owner cannot moderate; owner publishes revOk (5★); unpublished tokOk stays hidden
    await setAuthenticatedRole(f1CustAUid);
    await assert.rejects(
      async () => client.query(`SELECT public.moderate_review($1, 'publish');`, [revOk.review_id]),
      (err) => err && err.message.includes('FORBIDDEN')
    );

    await setAuthenticatedRole(f1CustBUid);
    await assert.rejects(
      async () => client.query(`SELECT public.moderate_review($1, 'publish');`, [revOk.review_id]),
      (err) => err && (err.message.includes('FORBIDDEN') || err.message.includes('CROSS_TENANT_VIOLATION'))
    );

    await setAuthenticatedRole(f1OwnerAUid);
    const modPub = (await client.query(`SELECT public.moderate_review($1, 'publish') AS res;`, [revOk.review_id])).rows[0].res;
    assert.equal(modPub.success, true);

    // 5. Discovery Marketplace: eligible tenants visible, draft & disabled profile omitted, published review aggregate accurate, zero PII leaked
    await setAuthenticatedRole(null);
    await client.query(`SET ROLE anon;`);
    const listF1 = (await client.query(`SELECT public.get_discovery_marketplace_listings('F1 Salon') AS res;`)).rows[0].res;
    assert.equal(listF1.total_count, 2, 'Only published & profile-enabled F1 salons should appear');
    const alphaListing = listF1.listings.find((l) => l.slug === 'f1-salon-alpha');
    const betaListing = listF1.listings.find((l) => l.slug === 'f1-salon-beta');
    assert.ok(alphaListing);
    assert.ok(betaListing);
    assert.equal(alphaListing.review_count, 1, 'Unpublished token review must not inflate aggregate');
    assert.equal(Number(alphaListing.average_rating), 5);
    assert.equal(betaListing.review_count, 0);
    assert.equal(Number(betaListing.average_rating), 0);
    assert.equal(JSON.stringify(listF1).includes('f1-cust-a@example.test'), false, 'Customer PII must never leak in discovery');

    const draftDetail = (await client.query(`SELECT public.get_discovery_marketplace_detail('f1-salon-draft') AS res;`)).rows[0].res;
    assert.equal(draftDetail.success, false);
    assert.equal(draftDetail.reason_code, 'NOT_ELIGIBLE');

    const hiddenDetail = (await client.query(`SELECT public.get_discovery_marketplace_detail('f1-salon-hidden') AS res;`)).rows[0].res;
    assert.equal(hiddenDetail.success, false);
    assert.equal(hiddenDetail.reason_code, 'NOT_ELIGIBLE');
    await client.query(`RESET ROLE;`);

    // 6. Favorites & Fast-Rebooking Seed
    await setAuthenticatedRole(f1CustAUid);
    const favBad = (await client.query(`SELECT public.set_customer_favorite($1, true) AS res;`, [f1TenantDraft])).rows[0].res;
    assert.equal(favBad.success, false);
    assert.equal(favBad.reason_code, 'TARGET_NOT_ELIGIBLE');

    const favAdd = (await client.query(`SELECT public.set_customer_favorite($1, true) AS res;`, [f1TenantA])).rows[0].res;
    assert.equal(favAdd.success, true);
    assert.equal(favAdd.action, 'ADDED');

    const favListA = (await client.query(`SELECT public.get_customer_favorites() AS res;`)).rows[0].res;
    assert.equal(favListA.total, 1);
    assert.equal(favListA.favorites[0].tenant_slug, 'f1-salon-alpha');

    await setAuthenticatedRole(f1CustBUid);
    const favListB = (await client.query(`SELECT public.get_customer_favorites() AS res;`)).rows[0].res;
    assert.equal(favListB.total, 0, 'Customer B must not see Customer A favorites');

    await setAuthenticatedRole(null);
    await client.query(`SET ROLE anon;`);
    const seedInvalid = (await client.query(`SELECT public.get_fast_rebooking_seed_by_manage_token('bad') AS res;`)).rows[0].res;
    assert.equal(seedInvalid.success, false);
    assert.equal(seedInvalid.reason_code, 'INVALID_TOKEN');

    const seedUsed = (await client.query(`SELECT public.get_fast_rebooking_seed_by_manage_token($1) AS res;`, [rawTokenUsed])).rows[0].res;
    assert.equal(seedUsed.success, false);
    assert.equal(seedUsed.reason_code, 'INVALID_TOKEN');

    const seedNotComp = (await client.query(`SELECT public.get_fast_rebooking_seed_by_manage_token($1) AS res;`, [rawTokenConfirmed])).rows[0].res;
    assert.equal(seedNotComp.success, false);
    assert.equal(seedNotComp.reason_code, 'APPOINTMENT_NOT_REBOOKABLE');

    const seedOk = (await client.query(`SELECT public.get_fast_rebooking_seed_by_manage_token($1) AS res;`, [rawTokenCompleted])).rows[0].res;
    assert.equal(seedOk.success, true);
    assert.equal(seedOk.seed.tenant_slug, 'f1-salon-alpha');
    assert.equal(seedOk.seed.canonical_booking_required, true);
    assert.equal(seedOk.seed.availability_authority, 'evaluate_booking_slot');
    assert.equal(seedOk.seed.booking_authority, 'create_public_booking');
    assert.equal(JSON.stringify(seedOk).includes('f1-cust-a@example.test'), false, 'Fast-rebooking seed must not leak customer PII');
    await client.query(`RESET ROLE;`);

    console.log('[PASS] ADIM-037 Faz F1 Discovery Marketplace, Verified Reviews & Favorites / Fast-Rebooking verified on PG17');

    // =========================================================================
    // ADIM-039 Faz H1: Program V2 Security Surface & Token Table Hardening
    // =========================================================================
    console.log('\n── ADIM-039 Faz H1 PG17 Security Surface & Token Hardening Matrix ──');
    await setAuthenticatedRole(null);

    // 1. ht_rate_limit_buckets RLS + privilege revocation
    const rlTableMeta = (await client.query(`
      SELECT c.relrowsecurity AS rls_enabled,
             has_table_privilege('anon', 'public.ht_rate_limit_buckets', 'SELECT') AS anon_sel,
             has_table_privilege('authenticated', 'public.ht_rate_limit_buckets', 'SELECT') AS auth_sel,
             has_table_privilege('authenticated', 'public.ht_rate_limit_buckets', 'INSERT') AS auth_ins
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'ht_rate_limit_buckets';
    `)).rows[0];
    assert.equal(rlTableMeta.rls_enabled, true);
    assert.equal(rlTableMeta.anon_sel, false);
    assert.equal(rlTableMeta.auth_sel, false);
    assert.equal(rlTableMeta.auth_ins, false);

    // 2. Identity & trigger helpers pinned to search_path = pg_catalog, public and EXECUTE revoked from PUBLIC/anon
    const hardenedFuncs = (await client.query(`
      SELECT p.proname,
             p.prosecdef,
             p.proconfig,
             has_function_privilege('public', p.oid, 'EXECUTE') AS pub_exec,
             has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'get_user_role',
          'get_user_tenant_id',
          'is_super_admin',
          'update_updated_at_column',
          'update_tenant_business_profiles_updated_at_column'
        )
      ORDER BY p.proname;
    `)).rows;
    assert.equal(hardenedFuncs.length, 5, 'All 5 Program V2 hardened helper/trigger functions must exist');
    for (const fn of hardenedFuncs) {
      const hasPinnedSearchPath = Array.isArray(fn.proconfig) && fn.proconfig.some((c) => c === 'search_path=pg_catalog, public');
      assert.equal(hasPinnedSearchPath, true, `${fn.proname} must pin search_path=pg_catalog, public`);
      if (['get_user_role', 'get_user_tenant_id', 'is_super_admin'].includes(fn.proname)) {
        assert.equal(fn.prosecdef, true, `${fn.proname} must be SECURITY DEFINER`);
        assert.equal(fn.pub_exec, false, `${fn.proname} must not grant EXECUTE to PUBLIC`);
        assert.equal(fn.anon_exec, false, `${fn.proname} must not grant EXECUTE to anon`);
        assert.equal(fn.auth_exec, true, `${fn.proname} must grant EXECUTE to authenticated`);
      }
    }

    // Negative: anon cannot execute get_user_role / get_user_tenant_id / is_super_admin
    await client.query(`SET ROLE anon;`);
    for (const fnCall of [
      `SELECT public.get_user_role($1);`,
      `SELECT public.get_user_tenant_id($1);`,
      `SELECT public.is_super_admin($1);`,
    ]) {
      await assert.rejects(
        async () => client.query(fnCall, [f1OwnerAUid]),
        (err) => err && err.code === '42501',
        `anon must receive 42501 for ${fnCall}`
      );
    }
    await client.query(`RESET ROLE;`);

    // Negative: inactive super_admin must return false from is_super_admin
    const inactiveSuperUid = '99999999-ffff-4fff-8fff-999999999039';
    await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'inactive-super@example.test') ON CONFLICT DO NOTHING;`, [inactiveSuperUid]);
    await client.query(`INSERT INTO public.users_profile (id, tenant_id, name, role, active) VALUES ($1, NULL, 'Inactive Super', 'super_admin', false) ON CONFLICT (id) DO UPDATE SET active = false;`, [inactiveSuperUid]);
    const inactiveSuperCheck = (await client.query(`SELECT public.is_super_admin($1) AS res;`, [inactiveSuperUid])).rows[0].res;
    assert.equal(inactiveSuperCheck, false, 'Inactive super_admin must return false from is_super_admin');

    // 3. appointment_access_tokens direct browser access revoked (20261012) while SECURITY DEFINER RPCs work
    const openTokenPolicyCnt = (await client.query(`
      SELECT count(*)::int AS cnt
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'appointment_access_tokens'
        AND policyname = 'Allow public select by token hash';
    `)).rows[0].cnt;
    assert.equal(openTokenPolicyCnt, 0, 'Permissive Allow public select by token hash policy must be absent');

    for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const hasAnonPriv = (await client.query(
        `SELECT has_table_privilege('anon', 'public.appointment_access_tokens', $1) AS granted;`,
        [priv]
      )).rows[0].granted;
      assert.equal(hasAnonPriv, false, `anon must not have ${priv} on public.appointment_access_tokens`);
    }

    await client.query(`SET ROLE anon;`);
    await assert.rejects(
      async () => client.query(`SELECT * FROM public.appointment_access_tokens;`),
      (err) => err && err.code === '42501',
      'anon direct SELECT on appointment_access_tokens must fail with 42501'
    );
    const tokReadViaRpc = (await client.query(`SELECT public.get_public_appointment_by_manage_token($1) AS res;`, [rawTokenCompleted])).rows[0].res;
    assert.equal(tokReadViaRpc.success, true, 'SECURITY DEFINER token read RPC must continue working for anon');
    await client.query(`RESET ROLE;`);

    console.log('[PASS] ADIM-039 Faz H1 Program V2 Security Surface & Token Table Hardening verified on PG17');
    console.log('\nALL ADIM-033 + ADIM-034 + ADIM-035 + ADIM-036 + ADIM-037 + ADIM-039 DISPOSABLE PG17 TESTS PASSED.');
  } finally {
    if (client) {
      try { await client.end(); } catch {}
    }
    if (pgInstance) {
      try { await pgInstance.stop(); } catch {}
    }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

await runPgTests();

function runAdim036BehavioralSuites() {
  const rootDir = process.cwd();
  const tsxCli = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const suites = [
    'services/verticalCommercialService.test.ts',
    'services/clinicService.test.ts',
    'services/clinicUiPolicy.test.ts',
    'utils/healthTourismService.test.ts',
    'pages/clinic/ClinicWorkspacePage.test.tsx',
    'pages/health-tourism/HtCoordinatorWorkspacePage.test.tsx',
  ];

  console.log('\n── Running ADIM-036 Behavioral Service, Policy & Workspace Tests ──');
  for (const relPath of suites) {
    const absPath = path.join(rootDir, relPath);
    const result = spawnSync(process.execPath, [tsxCli, absPath], {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env,
    });
    if (result.error) {
      throw result.error;
    }
    assert.equal(result.status, 0, `${relPath} must exit with code 0 (got ${result.status})`);
  }
  console.log(`[PASS] All ${suites.length} ADIM-036 behavioral suites passed.`);
}

runAdim036BehavioralSuites();

function runAdim037BehavioralSuites() {
  const rootDir = process.cwd();
  const tsxCli = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const suites = [
    'services/discoveryMarketplaceService.test.ts',
    'services/publicLinkService.test.ts',
    'components/DiscoveryPortfolio.test.tsx',
  ];

  console.log('\n── Running ADIM-037 Behavioral Discovery, Verified Reviews, Public Link & Portfolio Tests ──');
  for (const relPath of suites) {
    const absPath = path.join(rootDir, relPath);
    const result = spawnSync(process.execPath, [tsxCli, absPath], {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env,
    });
    if (result.error) {
      throw result.error;
    }
    assert.equal(result.status, 0, `${relPath} must exit with code 0 (got ${result.status})`);
  }
  console.log(`[PASS] All ${suites.length} ADIM-037 behavioral suites passed.`);
}

runAdim037BehavioralSuites();
