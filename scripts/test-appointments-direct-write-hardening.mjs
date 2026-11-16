#!/usr/bin/env node
/**
 * Stage D2B & ADIM-024 — Isolated Direct-Write Hardening & RLS Role-Qualification Suite
 *
 * Verifies in an isolated local PostgreSQL instance (zero remote network egress / NO_REMOTE_DB_WRITE):
 *   §1 Static migration & governance contracts:
 *      - 20260804_appointments_direct_update_hardening.sql
 *      - 20260901..20260904 candidate migrations preserved untouched with CANDIDATE ONLY guards
 *      - 20261011_proposed_appointment_access_tokens_and_consent_rls_hardening.sql
 *      - Issue #10 remains OPEN as a production blocker (PRODUCTION = NO_GO)
 *   §2 Direct table mutation & enumeration denial matrix (anon, authenticated tenant_owner, authenticated staff):
 *      - Direct UPDATE on public.appointments denied (42501) across all roles, multi-column atomic updates,
 *        and all 7 status vocabulary values (completed, no_show, cancelled, cancelled_by_customer,
 *        cancelled_by_salon, cancelled_by_system, invalid_bogus_status)
 *      - Direct SELECT/INSERT/UPDATE/DELETE on public.appointment_access_tokens denied for anon (42501),
 *        direct INSERT/UPDATE/DELETE denied for authenticated, cross-tenant SELECT returns 0 rows
 *      - Direct INSERT/UPDATE/DELETE on public.consent_ledger & public.policy_acceptances denied for
 *        anon & authenticated, and SELECT is strictly tenant-scoped
 *      - Direct writes/reads on public.communication_outbox, public.self_service_token_rate_limits,
 *        public.public_booking_otp_challenges, and public.payment_webhook_idempotency denied for anon
 *   §3 Canonical SECURITY DEFINER RPC regression matrix:
 *      - create_public_booking
 *      - get_public_appointment_by_manage_token
 *      - request_public_appointment_reschedule_by_manage_token
 *      - get_public_pending_reschedule_request_by_manage_token
 *      - admin_update_appointment_status (positive, idempotent repeat, invalid_transition, anon denial, cross-tenant denial)
 *      - cancel_public_appointment_by_manage_token (positive, already_cancelled, invalid_token)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { queryP0CatalogPostconditions } from './verify-lari-recovery-hard-gate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// =============================================================================
// 0. STRICT ZERO-REMOTE-EGRESS GUARD (NO_REMOTE_DB_WRITE)
// =============================================================================

let remoteEgressAttempts = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input?.url || '';
  if (/supabase\.co|pooler\.supabase\.com/i.test(urlStr)) {
    remoteEgressAttempts++;
    throw new Error(`NO_REMOTE_DB_WRITE_VIOLATION: Blocked remote network call to ${urlStr}`);
  }
  const parsed = new URL(urlStr, 'http://127.0.0.1');
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname)) {
    remoteEgressAttempts++;
    throw new Error(`NO_REMOTE_DB_WRITE_VIOLATION: Blocked non-loopback network call to ${parsed.hostname}`);
  }
  return originalFetch(input, init);
};

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
    process.exitCode = 1;
  }
}

// Canonical UUIDs
const TENANT_A_ID = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
const TENANT_A_SLUG = 'melis-guzellik';
const OWNER_A_UID = '11111111-1111-4111-8111-111111111111';
const STAFF_A_UID = '22222222-2222-4222-8222-222222222222';

const TENANT_B_ID = 'bbbb2222-b2b2-b2b2-b2b2-bbbbbbbbbbbb';
const TENANT_B_SLUG = 'baska-salon-izole';
const OWNER_B_UID = '33333333-3333-4333-8333-333333333333';

/**
 * Executes a SQL block inside a transaction as a specific PostgreSQL role (`anon` or `authenticated`)
 * with `request.jwt.claim.sub` and `request.jwt.claim.role` configured.
 */
async function execAsRole(db, { role, uid = '', sql, params = [] }) {
  await db.exec('BEGIN;');
  try {
    await db.exec(`SET LOCAL ROLE ${role};`);
    await db.query(`SELECT set_config('request.jwt.claim.role', $1, true);`, [role]);
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [uid || '']);
    await db.query(
      `SELECT set_config('request.jwt.claims', $1, true);`,
      [JSON.stringify({ role, sub: uid || null })]
    );
    const res = await db.query(sql, params);
    await db.exec('COMMIT;');
    return { ok: true, rows: res.rows, affectedRows: res.affectedRows ?? res.rows?.length ?? 0 };
  } catch (err) {
    try {
      await db.exec('ROLLBACK;');
    } catch {}
    return {
      ok: false,
      code: err.code || 'ERROR',
      message: err.message || String(err),
    };
  }
}

async function runTests() {
  console.log('\n====================================================================');
  console.log('STAGE D2B & ADIM-024: ISOLATED DIRECT-WRITE & RLS HARDENING SUITE');
  console.log('Target: Isolated Local PostgreSQL (PGlite) | NO_REMOTE_DB_WRITE = TRUE');
  console.log('====================================================================\n');

  // ---------------------------------------------------------------------------
  // §1. Static Migration & Governance Contracts
  // ---------------------------------------------------------------------------
  console.log('--- §1. Static Migration & Governance Contract Verification ---');

  const d2bPath = path.join(ROOT, 'supabase', 'migrations', '20260804_appointments_direct_update_hardening.sql');
  assert(fs.existsSync(d2bPath), 'Migration file 20260804_appointments_direct_update_hardening.sql exists');
  const d2bSql = fs.readFileSync(d2bPath, 'utf8');
  assert(/REVOKE\s+UPDATE\s+ON\s+public\.appointments\s+FROM\s+PUBLIC/i.test(d2bSql), 'Revokes UPDATE from PUBLIC');
  assert(/REVOKE\s+UPDATE\s+ON\s+public\.appointments\s+FROM\s+anon/i.test(d2bSql), 'Revokes UPDATE from anon');
  assert(/REVOKE\s+UPDATE\s+ON\s+public\.appointments\s+FROM\s+authenticated/i.test(d2bSql), 'Revokes UPDATE from authenticated');
  assert(/REVOKE\s+UPDATE\s*\([\s\S]*status[\s\S]*\)\s*ON\s+public\.appointments/i.test(d2bSql), 'Revokes column-level UPDATE on status');
  assert(/ALTER\s+TABLE\s+public\.appointments\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(d2bSql), 'Preserves RLS ENABLED on public.appointments');

  const candidateMigrations = [
    '20260901_payment_webhook_idempotency_and_replay_security.sql',
    '20260902_subscription_sync_transaction.sql',
    '20260903_public_booking_ratelimit_spam_and_otp_contract.sql',
    '20260904_self_service_token_security_and_ratelimit.sql',
  ];
  for (const mig of candidateMigrations) {
    const migPath = path.join(ROOT, 'supabase', 'migrations', mig);
    const exists = fs.existsSync(migPath);
    const content = exists ? fs.readFileSync(migPath, 'utf8') : '';
    assert(exists && content.includes('CANDIDATE ONLY'), `Candidate migration ${mig} preserved with CANDIDATE ONLY guard`);
  }

  const proposalPath = path.join(
    ROOT,
    'supabase',
    'tests',
    '20261011_proposed_appointment_access_tokens_and_consent_rls_hardening.sql'
  );
  assert(fs.existsSync(proposalPath), 'Proposal 20261011_proposed_appointment_access_tokens_and_consent_rls_hardening.sql exists');
  const proposalSql = fs.readFileSync(proposalPath, 'utf8');
  assert(
    proposalSql.includes('DROP POLICY IF EXISTS "Allow public select by token hash" ON public.appointment_access_tokens;'),
    'Proposal drops pre-hardening open policy on appointment_access_tokens'
  );
  assert(
    proposalSql.includes('REVOKE ALL ON TABLE public.appointment_access_tokens FROM anon;'),
    'Proposal revokes direct anon privileges on appointment_access_tokens'
  );

  // ---------------------------------------------------------------------------
  // Boot Isolated PostgreSQL & Apply Full Migration Chain + Seed + Proposal
  // ---------------------------------------------------------------------------
  console.log('\n--- Booting Isolated Local PostgreSQL & Applying 60 Migrations + P0 Proposal ---');
  const db = new PGlite({ extensions: { uuid_ossp, pgcrypto } });
  await db.waitReady;

  try {
    await db.exec('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS extensions;
      CREATE SCHEMA IF NOT EXISTS storage;
      CREATE SCHEMA IF NOT EXISTS graphql_public;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN SUPERUSER; END IF;
      END $$;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text,
        raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
        created_at timestamptz DEFAULT now()
      );
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user);
      $$;
      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
      $$;
      GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.role() TO PUBLIC, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.jwt() TO PUBLIC, anon, authenticated, service_role;

      INSERT INTO auth.users (id, email) VALUES
        ('${OWNER_A_UID}', 'owner-a@melis.local'),
        ('${STAFF_A_UID}', 'staff-a@melis.local'),
        ('${OWNER_B_UID}', 'owner-b@baska.local')
      ON CONFLICT (id) DO NOTHING;
    `);

    const migrationsDir = path.join(ROOT, 'supabase', 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    assert(migrationFiles.length === 60, `All 60 migrations found in supabase/migrations (got ${migrationFiles.length})`);

    for (const file of migrationFiles) {
      if (file === '20260804_appointments_direct_update_hardening.sql') {
        // Simulate pre-20260804 baseline grants so chronological 20260804 hardening
        // genuinely executes REVOKE UPDATE and later migrations 20260805..20260904
        // are tested without re-applying 20260804 out of order.
        await db.exec(`
          GRANT SELECT, INSERT, UPDATE ON public.appointments TO anon, authenticated;
          GRANT SELECT ON public.tenants, public.branches, public.services, public.staff, public.staff_services, public.availability_rules TO anon, authenticated;
          GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
        `);
      }
      if (file === '20260813_h1c_commercial_eligibility_and_quota_enforcement.sql') {
        await db.exec(`
          INSERT INTO public.tenants (id, slug, name, status, onboarding_status, public_site_status)
          VALUES ('${TENANT_A_ID}', '${TENANT_A_SLUG}', 'Melis Güzellik & Nail Art', 'active', 'completed', 'published')
          ON CONFLICT (id) DO NOTHING;
        `);
      }
      if (file === '20260901_payment_webhook_idempotency_and_replay_security.sql') {
        await db.exec(`
          ALTER TABLE public.subscriptions
          ADD COLUMN IF NOT EXISTS provider_token TEXT,
          ADD COLUMN IF NOT EXISTS provider_session_id TEXT;
        `);
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await db.exec(sql);
    }

    const seedSql = fs.readFileSync(path.join(ROOT, 'supabase', 'seed', 'paymentless_staging_seed.sql'), 'utf8');
    await db.exec("SET session_replication_role = 'replica';");
    try {
      await db.exec(seedSql);
    } finally {
      await db.exec("SET session_replication_role = 'origin';");
    }

    // Ensure canonical tenant subscription has valid H1C plan_version_id and tenant is published/approved for pilot
    await db.exec(`
      UPDATE public.tenants
      SET status = 'active', onboarding_status = 'completed', public_site_status = 'published'
      WHERE id = '${TENANT_A_ID}';

      UPDATE public.subscriptions
      SET plan_id = 'baslangic',
          plan_version_id = (
            SELECT pv.id FROM public.plan_versions pv
            JOIN public.plans p ON p.id = pv.plan_id
            WHERE p.code = 'baslangic' AND pv.version_number = 1 AND pv.lifecycle_status = 'published'
            LIMIT 1
          ),
          status = 'active',
          billing_mode = 'manual',
          current_period_start = now() - interval '1 day',
          current_period_end = now() + interval '1 year'
      WHERE tenant_id = '${TENANT_A_ID}';
    `);

    // Align clean-room schema compatibility for reschedule RPC (audit_events nullable actor_id & time=text comparison),
    // then apply ONLY the isolated 20261011 proposal after the canonical chronological migration chain.
    // NOTE: 20260804_appointments_direct_update_hardening.sql is NOT re-applied out of order so the true
    // chronological final ACL state of public.appointments (after 20260805..20260904) is verified.
    await db.exec(`
      ALTER TABLE public.audit_events ALTER COLUMN actor_id DROP NOT NULL;

      CREATE OR REPLACE FUNCTION public.lari_time_eq_text(p_time time, p_text text)
      RETURNS boolean
      LANGUAGE sql
      IMMUTABLE
      AS $$
        SELECT p_time = (trim(p_text))::time;
      $$;

      DROP OPERATOR IF EXISTS public.= (time, text);
      CREATE OPERATOR public.= (
        LEFTARG = time,
        RIGHTARG = text,
        PROCEDURE = public.lari_time_eq_text
      );
    `);
    await db.exec(proposalSql);

    // Assert true chronological final privilege state on public.appointments + negative GRANT regression guard
    async function verifyFinalAppointmentsDirectUpdateRevoked(targetDb) {
      const privRes = await targetDb.query(`
        SELECT
          has_table_privilege('public', 'public.appointments', 'UPDATE') AS pub_tbl,
          has_table_privilege('anon', 'public.appointments', 'UPDATE') AS anon_tbl,
          has_table_privilege('authenticated', 'public.appointments', 'UPDATE') AS auth_tbl,
          has_column_privilege('anon', 'public.appointments', 'status', 'UPDATE') AS anon_col_status,
          has_column_privilege('authenticated', 'public.appointments', 'status', 'UPDATE') AS auth_col_status
      `);
      const p = privRes.rows[0];
      if (p.pub_tbl || p.anon_tbl || p.auth_tbl || p.anon_col_status || p.auth_col_status) {
        throw new Error(`DIRECT_UPDATE_PRIVILEGE_REGRESSION: ${JSON.stringify(p)}`);
      }
      return p;
    }

    const finalAppointmentsPrivs = await verifyFinalAppointmentsDirectUpdateRevoked(db);
    assert(
      !finalAppointmentsPrivs.pub_tbl &&
        !finalAppointmentsPrivs.anon_tbl &&
        !finalAppointmentsPrivs.auth_tbl &&
        !finalAppointmentsPrivs.anon_col_status &&
        !finalAppointmentsPrivs.auth_col_status,
      'Chronological final state after 001..20260904 + 20261011 keeps appointments direct UPDATE revoked for PUBLIC/anon/authenticated'
    );

    let grantUpdateRegressionCaught = false;
    await db.exec('BEGIN;');
    try {
      await db.exec('GRANT UPDATE ON public.appointments TO authenticated;');
      try {
        await verifyFinalAppointmentsDirectUpdateRevoked(db);
      } catch (err) {
        grantUpdateRegressionCaught = err.message.includes('DIRECT_UPDATE_PRIVILEGE_REGRESSION');
      }
    } finally {
      await db.exec('ROLLBACK;');
    }
    assert(
      grantUpdateRegressionCaught,
      'Negative simulation: temporary post-chain GRANT UPDATE on public.appointments fails final-state privilege check'
    );

    // Seed Tenant B, ensure Tenant A is onboarding_status='completed' with published plan_version_id,
    // and seed user profiles for role-switched testing
    await db.exec(`
      UPDATE public.tenants
      SET status = 'active', onboarding_status = 'completed', public_site_status = 'published'
      WHERE id = '${TENANT_A_ID}';

      UPDATE public.subscriptions s
      SET plan_id = 'baslangic',
          plan_version_id = (
            SELECT pv.id
            FROM public.plan_versions pv
            JOIN public.plans p ON p.id = pv.plan_id
            WHERE p.code = 'baslangic' AND pv.version_number = 1 AND pv.lifecycle_status = 'published'
            LIMIT 1
          ),
          status = 'active',
          billing_mode = 'manual',
          current_period_start = now() - interval '1 day',
          current_period_end = now() + interval '1 year'
      WHERE s.tenant_id = '${TENANT_A_ID}';

      INSERT INTO public.tenants (id, name, slug, status, onboarding_status, public_site_status)
      VALUES ('${TENANT_B_ID}', 'Başka Salon İzole', '${TENANT_B_SLUG}', 'active', 'completed', 'published')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.users_profile (id, tenant_id, name, role, active)
      VALUES
        ('${OWNER_A_UID}', '${TENANT_A_ID}', 'Melis Owner', 'tenant_owner', true),
        ('${STAFF_A_UID}', '${TENANT_A_ID}', 'Melis Staff', 'staff', true),
        ('${OWNER_B_UID}', '${TENANT_B_ID}', 'Başka Owner', 'tenant_owner', true)
      ON CONFLICT (id) DO UPDATE
      SET tenant_id = EXCLUDED.tenant_id, role = EXCLUDED.role, active = true;
    `);

    // Verify P0 Cutover Postconditions on the isolated DB
    const p0Check = await queryP0CatalogPostconditions(db);
    assert(
      p0Check.all_passed && p0Check.verdict === 'P0_CUTOVER_POSTCONDITIONS_VERIFIED',
      'Isolated Postgres catalog passes all P0 cutover postconditions (queryP0CatalogPostconditions)'
    );

    // Resolve active service & staff mapped to active branch for Melis Güzellik
    const svcRes = await db.query(
      `SELECT s.id AS service_id, ss.staff_id, b.id AS branch_id
       FROM public.services s
       JOIN public.staff_services ss ON ss.service_id = s.id
       JOIN public.staff st ON st.id = ss.staff_id AND st.active = true
       JOIN public.branches b ON b.tenant_id = s.tenant_id AND b.is_active = true
       JOIN public.service_branches sb ON sb.service_id = s.id AND sb.branch_id = b.id
       JOIN public.staff_branches stb ON stb.staff_id = st.id AND stb.branch_id = b.id
       WHERE s.tenant_id = $1 AND s.active = true
       LIMIT 1`,
      [TENANT_A_ID]
    );
    const { service_id: SERVICE_ID, staff_id: STAFF_ID, branch_id: BRANCH_ID } = svcRes.rows[0];
    assert(Boolean(SERVICE_ID && STAFF_ID && BRANCH_ID), 'Resolved canonical active service, staff, and branch for Melis Güzellik');

    // Helper to create a fresh booking via canonical SECURITY DEFINER RPC on a guaranteed non-Sunday future date
    let bookingSeq = 0;
    async function createFreshBooking(appointmentDateStr, timeStr = '10:00:00') {
      bookingSeq++;
      const res = await execAsRole(db, {
        role: 'anon',
        sql: `SELECT public.create_public_booking(
          p_slug := $1,
          p_branch_id := $2::uuid,
          p_service_id := $3::uuid,
          p_staff_id := $4::uuid,
          p_appointment_date := $5::date,
          p_appointment_time := $6::time,
          p_customer_name := $7,
          p_customer_email := $8,
          p_customer_phone := $9,
          p_required_consent := true,
          p_idempotency_key := $10
        ) AS payload`,
        params: [
          TENANT_A_SLUG,
          BRANCH_ID,
          SERVICE_ID,
          STAFF_ID,
          appointmentDateStr,
          timeStr,
          `D2B Isolation User ${bookingSeq}`,
          `d2b-user-${bookingSeq}@randapp-test.invalid`,
          `+90555111223${bookingSeq}`,
          `d2b-idem-${bookingSeq}-${Date.now()}`,
        ],
      });
      if (!res.ok) return null;
      return res.rows[0]?.payload || null;
    }

    // -------------------------------------------------------------------------
    // §2. Direct Table Write & Read Denial Matrix
    // -------------------------------------------------------------------------
    console.log('\n--- §2. Direct Table Write & Read Denial Matrix (Isolated Postgres) ---');

    const booking1 = await createFreshBooking('2026-12-01', '10:00:00');
    assert(booking1 && booking1.success === true, 'Setup: Created test appointment via canonical create_public_booking RPC');
    const aptId1 = booking1.appointment_id;
    const manageToken1 = booking1.manage_token;

    async function readAppointmentRow(id) {
      const r = await db.query(`SELECT status, notes FROM public.appointments WHERE id = $1`, [id]);
      return r.rows[0] || null;
    }

    // 2.1 Direct UPDATE by anon -> DENIED (42501)
    console.log('\n[2.1] Direct UPDATE on public.appointments by anon -> DENIED');
    const anonUpdate = await execAsRole(db, {
      role: 'anon',
      sql: `UPDATE public.appointments SET status = 'completed' WHERE id = $1`,
      params: [aptId1],
    });
    assert(!anonUpdate.ok && anonUpdate.code === '42501', `anon direct UPDATE rejected with 42501 (got code=${anonUpdate.code})`);
    assert((await readAppointmentRow(aptId1))?.status === 'confirmed', 'DB status remains confirmed after anon direct UPDATE attempt');

    // 2.2 Direct UPDATE by authenticated tenant_owner -> DENIED (42501)
    console.log('\n[2.2] Direct UPDATE on public.appointments by authenticated tenant_owner -> DENIED');
    const ownerUpdate = await execAsRole(db, {
      role: 'authenticated',
      uid: OWNER_A_UID,
      sql: `UPDATE public.appointments SET status = 'completed' WHERE id = $1`,
      params: [aptId1],
    });
    assert(!ownerUpdate.ok && ownerUpdate.code === '42501', `authenticated tenant_owner direct UPDATE rejected with 42501 (got code=${ownerUpdate.code})`);
    assert((await readAppointmentRow(aptId1))?.status === 'confirmed', 'DB status remains confirmed after tenant_owner direct UPDATE attempt');

    // 2.3 Direct UPDATE by authenticated staff -> DENIED (42501)
    console.log('\n[2.3] Direct UPDATE on public.appointments by authenticated staff -> DENIED');
    const staffUpdate = await execAsRole(db, {
      role: 'authenticated',
      uid: STAFF_A_UID,
      sql: `UPDATE public.appointments SET status = 'no_show' WHERE id = $1`,
      params: [aptId1],
    });
    assert(!staffUpdate.ok && staffUpdate.code === '42501', `authenticated staff direct UPDATE rejected with 42501 (got code=${staffUpdate.code})`);
    assert((await readAppointmentRow(aptId1))?.status === 'confirmed', 'DB status remains confirmed after staff direct UPDATE attempt');

    // 2.4 Multi-column atomic direct UPDATE ({ status, notes }) -> DENIED
    console.log('\n[2.4] Multi-column atomic direct UPDATE ({ status, notes }) -> DENIED');
    const beforeMulti = await readAppointmentRow(aptId1);
    const anonMulti = await execAsRole(db, {
      role: 'anon',
      sql: `UPDATE public.appointments SET status = 'completed', notes = 'hacked_by_anon' WHERE id = $1`,
      params: [aptId1],
    });
    const authMulti = await execAsRole(db, {
      role: 'authenticated',
      uid: OWNER_A_UID,
      sql: `UPDATE public.appointments SET status = 'completed', notes = 'hacked_by_owner' WHERE id = $1`,
      params: [aptId1],
    });
    const afterMulti = await readAppointmentRow(aptId1);
    assert(!anonMulti.ok && anonMulti.code === '42501', 'anon multi-column direct UPDATE rejected');
    assert(!authMulti.ok && authMulti.code === '42501', 'authenticated multi-column direct UPDATE rejected');
    assert(
      afterMulti.status === 'confirmed' && afterMulti.notes === beforeMulti.notes,
      'Neither status nor notes mutated in DB after multi-column direct UPDATE attempts'
    );

    // 2.5 All 7 status vocabulary values denied via direct UPDATE
    console.log('\n[2.5] All 7 status vocabulary values denied via direct UPDATE');
    const targetStatuses = [
      'completed',
      'no_show',
      'cancelled',
      'cancelled_by_customer',
      'cancelled_by_salon',
      'cancelled_by_system',
      'invalid_bogus_status',
    ];
    for (const st of targetStatuses) {
      const rAnon = await execAsRole(db, {
        role: 'anon',
        sql: `UPDATE public.appointments SET status = $1 WHERE id = $2`,
        params: [st, aptId1],
      });
      const rAuth = await execAsRole(db, {
        role: 'authenticated',
        uid: OWNER_A_UID,
        sql: `UPDATE public.appointments SET status = $1 WHERE id = $2`,
        params: [st, aptId1],
      });
      const rowNow = await readAppointmentRow(aptId1);
      assert(
        !rAnon.ok && !rAuth.ok && rowNow.status === 'confirmed',
        `Direct UPDATE to status='${st}' blocked for both anon and authenticated`
      );
    }

    async function assertRolePrivilegesRevoked(targetDb, roleName, tableName, ops) {
      for (const op of ops) {
        const res = await targetDb.query(
          `SELECT has_table_privilege($1, $2, $3) AS granted`,
          [roleName, tableName, op]
        );
        if (res.rows[0]?.granted) {
          throw new Error(`ACL_PRIVILEGE_REGRESSION: ${roleName} still holds ${op} on ${tableName}`);
        }
      }
    }

    async function assertGrantTriggersAclCheck(targetDb, grantSql, roleName, tableName, op) {
      let caught = false;
      await targetDb.exec('BEGIN;');
      try {
        await targetDb.exec(grantSql);
        try {
          await assertRolePrivilegesRevoked(targetDb, roleName, tableName, [op]);
        } catch (err) {
          caught = err.message.includes('ACL_PRIVILEGE_REGRESSION');
        }
      } finally {
        await targetDb.exec('ROLLBACK;');
      }
      return caught;
    }

    async function simulatePolicyChangeWithRole(targetDb, { setupSql, role, uid = '', querySql, params = [] }) {
      await targetDb.exec('BEGIN;');
      try {
        await targetDb.exec(setupSql);
        await targetDb.exec(`SET LOCAL ROLE ${role};`);
        await targetDb.query(`SELECT set_config('request.jwt.claim.role', $1, true);`, [role]);
        await targetDb.query(`SELECT set_config('request.jwt.claim.sub', $1, true);`, [uid || '']);
        await targetDb.query(
          `SELECT set_config('request.jwt.claims', $1, true);`,
          [JSON.stringify({ role, sub: uid || null })]
        );
        const res = await targetDb.query(querySql, params);
        return { ok: true, rows: res.rows };
      } catch (err) {
        return { ok: false, code: err.code || 'ERROR', message: err.message || String(err) };
      } finally {
        await targetDb.exec('ROLLBACK;');
      }
    }

    // 2.6 Direct table access on public.appointment_access_tokens -> DENIED for anon & direct writes for authenticated
    console.log('\n[2.6] Direct table access on public.appointment_access_tokens -> DENIED');
    await assertRolePrivilegesRevoked(db, 'anon', 'public.appointment_access_tokens', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
    await assertRolePrivilegesRevoked(db, 'authenticated', 'public.appointment_access_tokens', ['INSERT', 'UPDATE', 'DELETE']);
    assert(true, 'has_table_privilege=false for anon (SELECT/INSERT/UPDATE/DELETE) and authenticated (INSERT/UPDATE/DELETE) on appointment_access_tokens');

    for (const op of [
      { label: 'SELECT', sql: `SELECT * FROM public.appointment_access_tokens`, params: [] },
      {
        label: 'INSERT',
        sql: `INSERT INTO public.appointment_access_tokens (tenant_id, appointment_id, token_hash, expires_at) VALUES ($1, $2, 'fake-hash-anon', now() + interval '1 day')`,
        params: [TENANT_A_ID, aptId1],
      },
      { label: 'UPDATE', sql: `UPDATE public.appointment_access_tokens SET used_at = now()`, params: [] },
      { label: 'DELETE', sql: `DELETE FROM public.appointment_access_tokens`, params: [] },
    ]) {
      const res = await execAsRole(db, { role: 'anon', sql: op.sql, params: op.params });
      assert(!res.ok && res.code === '42501', `anon direct ${op.label} on appointment_access_tokens rejected with 42501`);
    }

    for (const op of [
      {
        label: 'INSERT',
        sql: `INSERT INTO public.appointment_access_tokens (tenant_id, appointment_id, token_hash, expires_at) VALUES ($1, $2, 'fake-hash-auth', now() + interval '1 day')`,
        params: [TENANT_A_ID, aptId1],
      },
      { label: 'UPDATE', sql: `UPDATE public.appointment_access_tokens SET used_at = now() WHERE tenant_id = $1`, params: [TENANT_A_ID] },
      { label: 'DELETE', sql: `DELETE FROM public.appointment_access_tokens WHERE tenant_id = $1`, params: [TENANT_A_ID] },
    ]) {
      const res = await execAsRole(db, { role: 'authenticated', uid: OWNER_A_UID, sql: op.sql, params: op.params });
      assert(!res.ok && res.code === '42501', `authenticated direct ${op.label} on appointment_access_tokens rejected with 42501`);
    }

    for (const anonOp of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      assert(
        await assertGrantTriggersAclCheck(
          db,
          `GRANT ${anonOp} ON TABLE public.appointment_access_tokens TO anon;`,
          'anon',
          'public.appointment_access_tokens',
          anonOp
        ),
        `Negative simulation: temporary GRANT ${anonOp} TO anon on appointment_access_tokens is caught`
      );
    }
    for (const authOp of ['INSERT', 'UPDATE', 'DELETE']) {
      assert(
        await assertGrantTriggersAclCheck(
          db,
          `GRANT ${authOp} ON TABLE public.appointment_access_tokens TO authenticated;`,
          'authenticated',
          'public.appointment_access_tokens',
          authOp
        ),
        `Negative simulation: temporary GRANT ${authOp} TO authenticated on appointment_access_tokens is caught`
      );
    }

    const tokenCntRes = await db.query(`SELECT COUNT(*)::int AS c FROM public.appointment_access_tokens WHERE tenant_id = $1`, [TENANT_A_ID]);
    assert(tokenCntRes.rows[0].c >= 1, 'Sentinel row present in public.appointment_access_tokens for Tenant A');

    const tenantATokenRead = await execAsRole(db, {
      role: 'authenticated',
      uid: OWNER_A_UID,
      sql: `SELECT id FROM public.appointment_access_tokens WHERE tenant_id = $1`,
      params: [TENANT_A_ID],
    });
    assert(
      tenantATokenRead.ok && tenantATokenRead.rows.length >= 1,
      'Tenant A authenticated owner can read own tenant appointment_access_tokens rows'
    );

    const tokenUsingFalseSim = await simulatePolicyChangeWithRole(db, {
      setupSql: `ALTER POLICY "Tenant Staff - Read own tokens" ON public.appointment_access_tokens USING (false);`,
      role: 'authenticated',
      uid: OWNER_A_UID,
      querySql: `SELECT id FROM public.appointment_access_tokens WHERE tenant_id = $1`,
      params: [TENANT_A_ID],
    });
    assert(
      tokenUsingFalseSim.ok && tokenUsingFalseSim.rows.length === 0,
      'Negative simulation: setting appointment_access_tokens SELECT policy to USING(false) breaks own-tenant positive read check'
    );

    const tenantBTokenRead = await execAsRole(db, {
      role: 'authenticated',
      uid: OWNER_B_UID,
      sql: `SELECT id FROM public.appointment_access_tokens WHERE tenant_id = $1`,
      params: [TENANT_A_ID],
    });
    assert(
      tenantBTokenRead.ok && tenantBTokenRead.rows.length === 0,
      'Cross-tenant authenticated owner (Tenant B) reads 0 token rows from Tenant A'
    );

    const tokenPermissiveTrueSim = await simulatePolicyChangeWithRole(db, {
      setupSql: `CREATE POLICY "neg_sim_permissive_tokens" ON public.appointment_access_tokens FOR SELECT TO authenticated USING (true);`,
      role: 'authenticated',
      uid: OWNER_B_UID,
      querySql: `SELECT id FROM public.appointment_access_tokens WHERE tenant_id = $1`,
      params: [TENANT_A_ID],
    });
    assert(
      tokenPermissiveTrueSim.ok && tokenPermissiveTrueSim.rows.length >= 1,
      'Negative simulation: permissive USING(true) policy on appointment_access_tokens is caught by cross-tenant SELECT check'
    );

    // 2.7 Direct access on public.consent_ledger & public.policy_acceptances -> Tenant-scoped SELECT only, direct writes DENIED
    console.log('\n[2.7] Direct access on public.consent_ledger & public.policy_acceptances -> Hardened');

    await db.query(
      `INSERT INTO public.policy_acceptances (tenant_id, user_id, policy_type, version, ip_address, user_agent)
       VALUES ($1, $2, 'kvkk_consent', 'v1-sentinel', '127.0.0.1', 'adim024-sentinel')`,
      [TENANT_A_ID, OWNER_A_UID]
    );

    const consentPolicyTables = [
      {
        name: 'consent_ledger',
        minOwnRows: 3,
        insertAnonSql: `INSERT INTO public.consent_ledger (tenant_id, customer_id, consent_type, is_granted, ip_address) VALUES ($1, 'fake-cust-anon', 'kvkk', true, '0.0.0.0')`,
        insertAuthSql: `INSERT INTO public.consent_ledger (tenant_id, customer_id, consent_type, is_granted, ip_address) VALUES ($1, 'fake-cust-auth', 'kvkk', true, '0.0.0.0')`,
        updateSql: `UPDATE public.consent_ledger SET is_granted = false WHERE tenant_id = $1`,
        deleteSql: `DELETE FROM public.consent_ledger WHERE tenant_id = $1`,
      },
      {
        name: 'policy_acceptances',
        minOwnRows: 1,
        insertAnonSql: `INSERT INTO public.policy_acceptances (tenant_id, policy_type, version, ip_address) VALUES ($1, 'kvkk_consent', 'evil-anon', '0.0.0.0')`,
        insertAuthSql: `INSERT INTO public.policy_acceptances (tenant_id, policy_type, version, ip_address) VALUES ($1, 'kvkk_consent', 'evil-auth', '0.0.0.0')`,
        updateSql: `UPDATE public.policy_acceptances SET version = 'tampered' WHERE tenant_id = $1`,
        deleteSql: `DELETE FROM public.policy_acceptances WHERE tenant_id = $1`,
      },
    ];

    for (const spec of consentPolicyTables) {
      const cnt = await db.query(`SELECT COUNT(*)::int AS c FROM public.${spec.name} WHERE tenant_id = $1`, [TENANT_A_ID]);
      assert(cnt.rows[0].c >= spec.minOwnRows, `Sentinel rows (${cnt.rows[0].c} >= ${spec.minOwnRows}) present in public.${spec.name} for Tenant A`);

      await assertRolePrivilegesRevoked(db, 'anon', `public.${spec.name}`, ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
      await assertRolePrivilegesRevoked(db, 'authenticated', `public.${spec.name}`, ['INSERT', 'UPDATE', 'DELETE']);
      assert(true, `has_table_privilege=false for anon (ALL) and authenticated (INSERT/UPDATE/DELETE) on public.${spec.name}`);

      for (const op of [
        { label: 'SELECT', sql: `SELECT id FROM public.${spec.name}`, params: [] },
        { label: 'INSERT', sql: spec.insertAnonSql, params: [TENANT_A_ID] },
        { label: 'UPDATE', sql: spec.updateSql, params: [TENANT_A_ID] },
        { label: 'DELETE', sql: spec.deleteSql, params: [TENANT_A_ID] },
      ]) {
        const res = await execAsRole(db, { role: 'anon', sql: op.sql, params: op.params });
        assert(!res.ok && res.code === '42501', `anon direct ${op.label} on ${spec.name} rejected with 42501`);
      }

      for (const op of [
        { label: 'INSERT', sql: spec.insertAuthSql, params: [TENANT_A_ID] },
        { label: 'UPDATE', sql: spec.updateSql, params: [TENANT_A_ID] },
        { label: 'DELETE', sql: spec.deleteSql, params: [TENANT_A_ID] },
      ]) {
        const res = await execAsRole(db, { role: 'authenticated', uid: OWNER_A_UID, sql: op.sql, params: op.params });
        assert(!res.ok && res.code === '42501', `authenticated direct ${op.label} on ${spec.name} rejected with 42501`);
      }

      for (const anonOp of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        assert(
          await assertGrantTriggersAclCheck(
            db,
            `GRANT ${anonOp} ON TABLE public.${spec.name} TO anon;`,
            'anon',
            `public.${spec.name}`,
            anonOp
          ),
          `Negative simulation: temporary GRANT ${anonOp} TO anon on ${spec.name} is caught`
        );
      }
      for (const authOp of ['INSERT', 'UPDATE', 'DELETE']) {
        assert(
          await assertGrantTriggersAclCheck(
            db,
            `GRANT ${authOp} ON TABLE public.${spec.name} TO authenticated;`,
            'authenticated',
            `public.${spec.name}`,
            authOp
          ),
          `Negative simulation: temporary GRANT ${authOp} TO authenticated on ${spec.name} is caught`
        );
      }

      const ownerASelect = await execAsRole(db, {
        role: 'authenticated',
        uid: OWNER_A_UID,
        sql: `SELECT id FROM public.${spec.name} WHERE tenant_id = $1`,
        params: [TENANT_A_ID],
      });
      assert(
        ownerASelect.ok && ownerASelect.rows.length >= spec.minOwnRows,
        `Tenant A owner can read own tenant ${spec.name} rows`
      );

      const usingFalseSim = await simulatePolicyChangeWithRole(db, {
        setupSql: `ALTER POLICY "${spec.name}_tenant_select" ON public.${spec.name} USING (false);`,
        role: 'authenticated',
        uid: OWNER_A_UID,
        querySql: `SELECT id FROM public.${spec.name} WHERE tenant_id = $1`,
        params: [TENANT_A_ID],
      });
      assert(
        usingFalseSim.ok && usingFalseSim.rows.length === 0,
        `Negative simulation: setting ${spec.name}_tenant_select policy to USING(false) breaks own-tenant positive read check`
      );

      const ownerBSelect = await execAsRole(db, {
        role: 'authenticated',
        uid: OWNER_B_UID,
        sql: `SELECT id FROM public.${spec.name} WHERE tenant_id = $1`,
        params: [TENANT_A_ID],
      });
      assert(
        ownerBSelect.ok && ownerBSelect.rows.length === 0,
        `Tenant B owner reads 0 ${spec.name} rows belonging to Tenant A`
      );

      const permissiveTrueSim = await simulatePolicyChangeWithRole(db, {
        setupSql: `CREATE POLICY "neg_sim_permissive_${spec.name}" ON public.${spec.name} FOR SELECT TO authenticated USING (true);`,
        role: 'authenticated',
        uid: OWNER_B_UID,
        querySql: `SELECT id FROM public.${spec.name} WHERE tenant_id = $1`,
        params: [TENANT_A_ID],
      });
      assert(
        permissiveTrueSim.ok && permissiveTrueSim.rows.length >= spec.minOwnRows,
        `Negative simulation: permissive USING(true) policy on ${spec.name} is caught by cross-tenant SELECT check`
      );
    }

    // 2.8 Internal security tables (rate limits, OTP challenges, webhook idempotency, communication_outbox)
    console.log('\n[2.8] Internal security & outbox tables direct access -> DENIED (with sentinel rows & ACL checks)');

    // Seed 1 sentinel row per table as postgres so direct SELECT/UPDATE/DELETE cannot pass merely by being empty
    await db.query(
      `INSERT INTO public.self_service_token_rate_limits (client_identifier, identifier_type, failure_count)
       VALUES ('sentinel-ip-adim024', 'ip', 1)
       ON CONFLICT DO NOTHING`
    );
    await db.query(
      `INSERT INTO public.public_booking_otp_challenges (tenant_id, customer_phone, otp_code_hash, status, expires_at)
       VALUES ($1, '+905551110000', repeat('a', 64), 'pending', now() + interval '10 minutes')`,
      [TENANT_A_ID]
    );
    await db.query(
      `INSERT INTO public.payment_webhook_idempotency (provider, provider_event_id, event_type, tenant_id, status)
       VALUES ('iyzico', 'evt-sentinel-adim024', 'subscription.renewed', $1, 'processed')
       ON CONFLICT DO NOTHING`,
      [TENANT_A_ID]
    );
    await db.query(
      `INSERT INTO public.communication_outbox (tenant_id, recipient, channel, message, status)
       VALUES ($1, '+905551110000', 'whatsapp', 'Sentinel ADIM-024 outbox row', 'queued')`,
      [TENANT_A_ID]
    );

    const internalSecurityTables = [
      {
        name: 'self_service_token_rate_limits',
        insertSql: `INSERT INTO public.self_service_token_rate_limits (client_identifier, identifier_type) VALUES ('evil-ip', 'ip')`,
        insertParams: [],
        updateSql: `UPDATE public.self_service_token_rate_limits SET failure_count = 99`,
        deleteSql: `DELETE FROM public.self_service_token_rate_limits`,
      },
      {
        name: 'public_booking_otp_challenges',
        insertSql: `INSERT INTO public.public_booking_otp_challenges (tenant_id, customer_phone, otp_code_hash, expires_at) VALUES ($1, '+905559998877', repeat('b', 64), now() + interval '5 minutes')`,
        insertParams: [TENANT_A_ID],
        updateSql: `UPDATE public.public_booking_otp_challenges SET status = 'verified'`,
        deleteSql: `DELETE FROM public.public_booking_otp_challenges`,
      },
      {
        name: 'payment_webhook_idempotency',
        insertSql: `INSERT INTO public.payment_webhook_idempotency (provider, provider_event_id, event_type, tenant_id, status) VALUES ('iyzico', 'evt-evil-adim024', 'subscription.renewed', $1, 'processed')`,
        insertParams: [TENANT_A_ID],
        updateSql: `UPDATE public.payment_webhook_idempotency SET status = 'failed'`,
        deleteSql: `DELETE FROM public.payment_webhook_idempotency`,
      },
    ];

    for (const spec of internalSecurityTables) {
      const cnt = await db.query(`SELECT COUNT(*)::int AS c FROM public.${spec.name}`);
      assert(cnt.rows[0].c >= 1, `Sentinel row present in public.${spec.name} before ACL/RLS denial checks`);

      await assertRolePrivilegesRevoked(db, 'anon', `public.${spec.name}`, ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
      await assertRolePrivilegesRevoked(db, 'authenticated', `public.${spec.name}`, ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
      assert(true, `has_table_privilege=false for anon & authenticated across all DML on public.${spec.name}`);

      for (const roleSpec of [
        { role: 'anon', uid: '' },
        { role: 'authenticated', uid: OWNER_A_UID },
      ]) {
        const rSel = await execAsRole(db, { ...roleSpec, sql: `SELECT * FROM public.${spec.name}` });
        const rIns = await execAsRole(db, { ...roleSpec, sql: spec.insertSql, params: spec.insertParams });
        const rUpd = await execAsRole(db, { ...roleSpec, sql: spec.updateSql });
        const rDel = await execAsRole(db, { ...roleSpec, sql: spec.deleteSql });
        assert(
          !rSel.ok && rSel.code === '42501' &&
            !rIns.ok && rIns.code === '42501' &&
            !rUpd.ok && rUpd.code === '42501' &&
            !rDel.ok && rDel.code === '42501',
          `${roleSpec.role} direct SELECT/INSERT/UPDATE/DELETE on public.${spec.name} strictly rejected with 42501`
        );
      }

      assert(
        await assertGrantTriggersAclCheck(
          db,
          `GRANT SELECT ON TABLE public.${spec.name} TO anon;`,
          'anon',
          `public.${spec.name}`,
          'SELECT'
        ),
        `Negative simulation: temporary GRANT SELECT TO anon on public.${spec.name} is caught`
      );
      assert(
        await assertGrantTriggersAclCheck(
          db,
          `GRANT INSERT ON TABLE public.${spec.name} TO authenticated;`,
          'authenticated',
          `public.${spec.name}`,
          'INSERT'
        ),
        `Negative simulation: temporary GRANT INSERT TO authenticated on public.${spec.name} is caught`
      );
    }

    // communication_outbox: strictly deny anon (all ops + has_table_privilege), deny non-super-admin authenticated writes, isolate cross-tenant SELECT
    const outboxCnt = await db.query(`SELECT COUNT(*)::int AS c FROM public.communication_outbox WHERE tenant_id = $1`, [TENANT_A_ID]);
    assert(outboxCnt.rows[0].c >= 1, 'Sentinel row present in public.communication_outbox for Tenant A');
    await assertRolePrivilegesRevoked(db, 'anon', 'public.communication_outbox', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
    assert(true, 'has_table_privilege=false for anon across SELECT/INSERT/UPDATE/DELETE on public.communication_outbox');

    for (const op of [
      { label: 'SELECT', sql: `SELECT * FROM public.communication_outbox`, params: [] },
      {
        label: 'INSERT',
        sql: `INSERT INTO public.communication_outbox (tenant_id, recipient, channel, message, status) VALUES ($1, '+905559990000', 'sms', 'anon spoofing', 'queued')`,
        params: [TENANT_A_ID],
      },
      { label: 'UPDATE', sql: `UPDATE public.communication_outbox SET status = 'sent'`, params: [] },
      { label: 'DELETE', sql: `DELETE FROM public.communication_outbox`, params: [] },
    ]) {
      const rAnon = await execAsRole(db, { role: 'anon', sql: op.sql, params: op.params });
      assert(!rAnon.ok && rAnon.code === '42501', `anon direct ${op.label} on communication_outbox rejected with 42501`);
    }

    for (const op of [
      {
        label: 'INSERT',
        sql: `INSERT INTO public.communication_outbox (tenant_id, recipient, channel, message, status) VALUES ($1, '+905559990000', 'sms', 'auth spoofing', 'queued')`,
        params: [TENANT_A_ID],
      },
      { label: 'UPDATE', sql: `UPDATE public.communication_outbox SET status = 'sent' WHERE tenant_id = $1`, params: [TENANT_A_ID] },
      { label: 'DELETE', sql: `DELETE FROM public.communication_outbox WHERE tenant_id = $1`, params: [TENANT_A_ID] },
    ]) {
      const rAuth = await execAsRole(db, { role: 'authenticated', uid: OWNER_A_UID, sql: op.sql, params: op.params });
      assert(!rAuth.ok && rAuth.code === '42501', `authenticated direct ${op.label} on communication_outbox rejected with 42501`);
    }

    const tenantBOutboxRead = await execAsRole(db, {
      role: 'authenticated',
      uid: OWNER_B_UID,
      sql: `SELECT id FROM public.communication_outbox WHERE tenant_id = $1`,
      params: [TENANT_A_ID],
    });
    assert(
      !tenantBOutboxRead.ok || tenantBOutboxRead.rows.length === 0,
      'Cross-tenant authenticated owner (Tenant B) reads 0 communication_outbox rows from Tenant A'
    );

    assert(
      await assertGrantTriggersAclCheck(
        db,
        `GRANT SELECT ON TABLE public.communication_outbox TO anon;`,
        'anon',
        'public.communication_outbox',
        'SELECT'
      ),
      'Negative simulation: temporary GRANT SELECT TO anon on public.communication_outbox is caught'
    );

    // -------------------------------------------------------------------------
    // §3. Canonical SECURITY DEFINER RPC Regression Matrix
    // -------------------------------------------------------------------------
    console.log('\n--- §3. Canonical SECURITY DEFINER RPC Regression Matrix ---');

    // 3.1 get_public_appointment_by_manage_token
    console.log('\n[3.1] get_public_appointment_by_manage_token RPC');
    const readRpcValid = await execAsRole(db, {
      role: 'anon',
      sql: `SELECT public.get_public_appointment_by_manage_token($1) AS payload`,
      params: [manageToken1],
    });
    assert(
      readRpcValid.ok &&
        readRpcValid.rows[0]?.payload?.success === true &&
        readRpcValid.rows[0]?.payload?.appointment?.id === aptId1,
      'get_public_appointment_by_manage_token succeeds for valid token as anon'
    );

    const readRpcInvalid = await execAsRole(db, {
      role: 'anon',
      sql: `SELECT public.get_public_appointment_by_manage_token('0000000000000000000000000000000000000000000000000000000000000000') AS payload`,
    });
    assert(
      readRpcInvalid.ok &&
        readRpcInvalid.rows[0]?.payload?.success === false &&
        readRpcInvalid.rows[0]?.payload?.reason_code === 'invalid_token',
      'get_public_appointment_by_manage_token returns invalid_token for unknown token'
    );

    // 3.2 request_public_appointment_reschedule_by_manage_token & get_public_pending_reschedule_request_by_manage_token
    console.log('\n[3.2] Reschedule self-service token RPCs');
    const reschedReq = await execAsRole(db, {
      role: 'anon',
      sql: `SELECT public.request_public_appointment_reschedule_by_manage_token(
        p_token := $1,
        p_requested_date := '2026-12-02'::date,
        p_requested_time := '11:00',
        p_reason := 'Saat degisikligi rica ediyorum'
      ) AS payload`,
      params: [manageToken1],
    });
    assert(
      reschedReq.ok && reschedReq.rows[0]?.payload?.success === true,
      'request_public_appointment_reschedule_by_manage_token succeeds for valid token'
    );

    const pendingResched = await execAsRole(db, {
      role: 'anon',
      sql: `SELECT public.get_public_pending_reschedule_request_by_manage_token($1) AS payload`,
      params: [manageToken1],
    });
    assert(
      pendingResched.ok &&
        pendingResched.rows[0]?.payload?.success === true &&
        pendingResched.rows[0]?.payload?.has_pending_request === true,
      'get_public_pending_reschedule_request_by_manage_token returns pending request'
    );

    // 3.3 admin_update_appointment_status (positive, idempotent repeat, invalid_transition, anon denial, cross-tenant denial)
    console.log('\n[3.3] admin_update_appointment_status RPC');
    const adminComplete = await execAsRole(db, {
      role: 'authenticated',
      uid: OWNER_A_UID,
      sql: `SELECT public.admin_update_appointment_status($1::uuid, 'completed') AS payload`,
      params: [aptId1],
    });
    assert(
      adminComplete.ok &&
        adminComplete.rows[0]?.payload?.success === true &&
        adminComplete.rows[0]?.payload?.status === 'completed' &&
        adminComplete.rows[0]?.payload?.changed === true,
      'admin_update_appointment_status transitions confirmed -> completed for authorized tenant_owner'
    );
    assert((await readAppointmentRow(aptId1))?.status === 'completed', 'DB status is completed after admin RPC');

    const adminIdempotent = await execAsRole(db, {
      role: 'authenticated',
      uid: OWNER_A_UID,
      sql: `SELECT public.admin_update_appointment_status($1::uuid, 'completed') AS payload`,
      params: [aptId1],
    });
    assert(
      adminIdempotent.ok &&
        adminIdempotent.rows[0]?.payload?.success === true &&
        adminIdempotent.rows[0]?.payload?.reason_code === 'no_change' &&
        adminIdempotent.rows[0]?.payload?.changed === false,
      'admin_update_appointment_status idempotent repeat returns reason_code=no_change and changed=false'
    );

    const adminInvalidTrans = await execAsRole(db, {
      role: 'authenticated',
      uid: OWNER_A_UID,
      sql: `SELECT public.admin_update_appointment_status($1::uuid, 'no_show') AS payload`,
      params: [aptId1],
    });
    assert(
      adminInvalidTrans.ok &&
        adminInvalidTrans.rows[0]?.payload?.success === false &&
        adminInvalidTrans.rows[0]?.payload?.reason_code === 'invalid_transition',
      'admin_update_appointment_status rejects completed -> no_show with invalid_transition'
    );

    const adminByAnon = await execAsRole(db, {
      role: 'anon',
      sql: `SELECT public.admin_update_appointment_status($1::uuid, 'no_show') AS payload`,
      params: [aptId1],
    });
    assert(!adminByAnon.ok && adminByAnon.code === '42501', 'anon cannot execute admin_update_appointment_status (42501)');

    const booking2 = await createFreshBooking('2026-12-03', '14:00:00');
    assert(booking2 && booking2.success === true, 'Created second booking for cross-tenant & cancel RPC tests');
    const aptId2 = booking2.appointment_id;
    const manageToken2 = booking2.manage_token;

    const adminCrossTenant = await execAsRole(db, {
      role: 'authenticated',
      uid: OWNER_B_UID,
      sql: `SELECT public.admin_update_appointment_status($1::uuid, 'completed') AS payload`,
      params: [aptId2],
    });
    assert(
      adminCrossTenant.ok &&
        adminCrossTenant.rows[0]?.payload?.success === false &&
        adminCrossTenant.rows[0]?.payload?.reason_code === 'appointment_unavailable',
      'Cross-tenant tenant_owner (Tenant B) cannot mutate Tenant A appointment via admin_update_appointment_status'
    );

    // 3.4 cancel_public_appointment_by_manage_token (positive, idempotent repeat, invalid_token)
    console.log('\n[3.4] cancel_public_appointment_by_manage_token RPC');
    const cancelValid = await execAsRole(db, {
      role: 'anon',
      sql: `SELECT public.cancel_public_appointment_by_manage_token($1, 'Planlarim degisti') AS payload`,
      params: [manageToken2],
    });
    assert(
      cancelValid.ok &&
        cancelValid.rows[0]?.payload?.success === true &&
        cancelValid.rows[0]?.payload?.status === 'cancelled_by_customer',
      'cancel_public_appointment_by_manage_token transitions confirmed -> cancelled_by_customer'
    );
    assert((await readAppointmentRow(aptId2))?.status === 'cancelled_by_customer', 'DB status is cancelled_by_customer');

    const cancelRepeat = await execAsRole(db, {
      role: 'anon',
      sql: `SELECT public.cancel_public_appointment_by_manage_token($1, 'Tekrar iptal') AS payload`,
      params: [manageToken2],
    });
    assert(
      cancelRepeat.ok &&
        cancelRepeat.rows[0]?.payload?.success === true &&
        cancelRepeat.rows[0]?.payload?.reason_code === 'no_change' &&
        cancelRepeat.rows[0]?.payload?.changed === false,
      'cancel_public_appointment_by_manage_token repeat returns idempotent no_change (changed=false)'
    );

    const cancelInvalidToken = await execAsRole(db, {
      role: 'anon',
      sql: `SELECT public.cancel_public_appointment_by_manage_token('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'Test') AS payload`,
    });
    assert(
      cancelInvalidToken.ok &&
        cancelInvalidToken.rows[0]?.payload?.success === false &&
        cancelInvalidToken.rows[0]?.payload?.reason_code === 'invalid_token',
      'cancel_public_appointment_by_manage_token returns invalid_token for unknown token'
    );

    assert(remoteEgressAttempts === 0, 'Zero remote network egress attempts occurred (NO_REMOTE_DB_WRITE = TRUE)');
  } finally {
    await db.close();
  }

  console.log('\n====================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed (NO_REMOTE_DB_WRITE = TRUE)`);
  console.log('====================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('[FATAL] test-appointments-direct-write-hardening failed:', err);
  process.exit(1);
});
