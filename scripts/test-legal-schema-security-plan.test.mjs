import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ROOT_DIR = process.cwd();
const PROPOSAL_SQL_PATH = path.resolve(ROOT_DIR, 'docs', 'lari-program', 'security-proposals', 'PUBLIC_CONSENT_RLS_FORWARD_PROPOSAL.sql');
const CONTRACT_DOC_PATH = path.resolve(ROOT_DIR, 'docs', 'lari-program', 'security-proposals', 'CONSENT_TRUSTED_WRITE_CONTRACT.md');
const SUPABASE_MIGRATIONS_DIR = path.resolve(ROOT_DIR, 'supabase', 'migrations');
const CORE_TABLES_MIGRATION_PATH = path.resolve(SUPABASE_MIGRATIONS_DIR, '20260620_paymentless_production_core_tables.sql');
const RLS_ALIGNMENT_MIGRATION_PATH = path.resolve(SUPABASE_MIGRATIONS_DIR, '20260622_paymentless_production_rls_identity_alignment.sql');

function extractTableColumnsFromMigration(sqlText, tableName) {
  const regex = new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+(?:public\\.)?${tableName}\\s*\\(([\\s\\S]*?)\\);`, 'i');
  const match = sqlText.match(regex);
  assert.ok(match, `Could not locate CREATE TABLE for ${tableName}`);
  const body = match[1];
  const cols = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/--.*$/, '').trim();
    if (!line) continue;
    if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(line)) continue;
    const colMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+/);
    if (colMatch) {
      cols.push(colMatch[1].toLowerCase());
    }
  }
  return cols;
}

test('1. Proposal file is placed under security-proposals and NEVER in supabase/migrations', () => {
  assert.ok(fs.existsSync(PROPOSAL_SQL_PATH), 'Proposal SQL file must exist in docs/lari-program/security-proposals/');

  if (fs.existsSync(SUPABASE_MIGRATIONS_DIR)) {
    const migrationFiles = fs.readdirSync(SUPABASE_MIGRATIONS_DIR);
    for (const file of migrationFiles) {
      assert.ok(
        !file.toLowerCase().includes('consent_rls') && !file.toLowerCase().includes('public_consent'),
        `Proposal SQL must NOT be placed into active supabase/migrations/ directory: found ${file}`
      );
    }
  }
});

test('2. Proposal SQL is strictly transactional and idempotent', () => {
  const sql = fs.readFileSync(PROPOSAL_SQL_PATH, 'utf8');
  assert.ok(/^\s*BEGIN\s*;/m.test(sql), 'SQL must start with transactional BEGIN;');
  assert.ok(/COMMIT\s*;\s*$/m.test(sql), 'SQL must conclude with COMMIT;');
  assert.ok(sql.includes('IF EXISTS'), 'Policy drops must use IF EXISTS for idempotency');
});

test('3. Row Level Security is enabled and NO FORCE is used to protect SECURITY DEFINER create_public_booking', () => {
  const sql = fs.readFileSync(PROPOSAL_SQL_PATH, 'utf8');
  assert.ok(
    /ALTER\s+TABLE\s+public\.consent_ledger\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql),
    'Must enable RLS on consent_ledger'
  );
  assert.ok(
    /ALTER\s+TABLE\s+public\.consent_ledger\s+NO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql),
    'Must explicitly set NO FORCE ROW LEVEL SECURITY on consent_ledger to protect SECURITY DEFINER create_public_booking'
  );
  assert.ok(
    !/^\s*ALTER\s+TABLE\s+public\.consent_ledger\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/im.test(sql),
    'Must NOT blindly enable FORCE ROW LEVEL SECURITY on consent_ledger without owner policy proof'
  );
  assert.ok(
    /ALTER\s+TABLE\s+public\.policy_acceptances\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql),
    'Must enable RLS on policy_acceptances'
  );
  assert.ok(
    /ALTER\s+TABLE\s+public\.policy_acceptances\s+NO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql),
    'Must explicitly set NO FORCE ROW LEVEL SECURITY on policy_acceptances'
  );
});

test('4. Direct write privileges are revoked from untrusted roles and FOR ALL client policies are replaced with FOR SELECT', () => {
  const sql = fs.readFileSync(PROPOSAL_SQL_PATH, 'utf8');
  assert.ok(
    /REVOKE\s+INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+TABLE\s+public\.consent_ledger\s+FROM\s+public\s*,\s*anon\s*,\s*authenticated/i.test(sql),
    'Must revoke INSERT, UPDATE, DELETE on consent_ledger from public, anon, authenticated'
  );
  assert.ok(
    /REVOKE\s+INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+TABLE\s+public\.policy_acceptances\s+FROM\s+public\s*,\s*anon\s*,\s*authenticated/i.test(sql),
    'Must revoke INSERT, UPDATE, DELETE on policy_acceptances from public, anon, authenticated'
  );
  assert.ok(
    sql.includes('DROP POLICY IF EXISTS "Owner/Admin manage consent ledger" ON public.consent_ledger'),
    'Must drop over-broad FOR ALL policy "Owner/Admin manage consent ledger" on consent_ledger'
  );
});

test('5. Explicitly drops the confirmed unsafe public INSERT policies', () => {
  const sql = fs.readFileSync(PROPOSAL_SQL_PATH, 'utf8');
  assert.ok(
    sql.includes('DROP POLICY IF EXISTS "Allow public insertion during checkout" ON public.consent_ledger'),
    'Must drop unsafe public insert policy on consent_ledger'
  );
  assert.ok(
    sql.includes('DROP POLICY IF EXISTS "Allow public insert acceptances" ON public.policy_acceptances'),
    'Must drop unsafe public insert policy on policy_acceptances'
  );
});

test('6. Real Schema Column Parity: Proposal SQL does NOT reference non-existent actor_id and grounds policies in verified schema', () => {
  const coreSql = fs.readFileSync(CORE_TABLES_MIGRATION_PATH, 'utf8');
  const rlsSql = fs.readFileSync(RLS_ALIGNMENT_MIGRATION_PATH, 'utf8');
  const proposalSql = fs.readFileSync(PROPOSAL_SQL_PATH, 'utf8');

  const policyAcceptanceCols = extractTableColumnsFromMigration(coreSql, 'policy_acceptances');
  const consentLedgerCols = extractTableColumnsFromMigration(coreSql, 'consent_ledger');

  assert.ok(policyAcceptanceCols.includes('user_id'), 'Verified schema for policy_acceptances must have user_id');
  assert.ok(!policyAcceptanceCols.includes('actor_id'), 'Verified schema for policy_acceptances does NOT have actor_id');
  assert.ok(consentLedgerCols.includes('customer_id'), 'Verified schema for consent_ledger must have customer_id');
  assert.ok(!consentLedgerCols.includes('actor_id'), 'Verified schema for consent_ledger does NOT have actor_id');

  // Strip comments before checking executable SQL statements
  const executableSql = proposalSql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

  assert.ok(
    !/\bactor_id\b/i.test(executableSql),
    'Executable SQL in PUBLIC_CONSENT_RLS_FORWARD_PROPOSAL.sql must NOT reference non-existent column actor_id'
  );
  assert.ok(
    !/app_metadata.*tenant_id/i.test(executableSql),
    'Executable SQL must NOT rely on unverified app_metadata.tenant_id; must use canonical public.users_profile lookup'
  );
  assert.ok(
    executableSql.includes('public.users_profile'),
    'Executable SQL policies must ground tenant authorization in canonical public.users_profile'
  );
  assert.ok(
    executableSql.includes('policy_acceptances.user_id') || /\buser_id\s*=\s*auth\.uid\(\)::text/i.test(executableSql),
    'policy_acceptances read policy must reference verified column user_id'
  );
  assert.ok(
    proposalSql.includes('UNRESOLVED_IDENTITY_BOUNDARY'),
    'Proposal must explicitly document UNRESOLVED_IDENTITY_BOUNDARY for unverified customer_id / booking capability mappings'
  );
  assert.ok(rlsSql.includes('users_profile'), 'Canonical RLS alignment migration uses users_profile');
});

test('7. Preserves SELECT read policy semantics and bounds data_rights_requests scope', () => {
  const sql = fs.readFileSync(PROPOSAL_SQL_PATH, 'utf8');
  assert.ok(
    /GRANT\s+SELECT\s+ON\s+TABLE\s+public\.consent_ledger\s+TO\s+anon\s*,\s*authenticated/i.test(sql),
    'Must preserve SELECT grant on consent_ledger for authorized reads'
  );
  assert.ok(
    /GRANT\s+SELECT\s+ON\s+TABLE\s+public\.policy_acceptances\s+TO\s+anon\s*,\s*authenticated/i.test(sql),
    'Must preserve SELECT grant on policy_acceptances for authorized reads'
  );
  assert.ok(
    sql.includes('tenant_scoped_policy_acceptances_read'),
    'Must include tenant-scoped policy acceptance read policy'
  );
  assert.ok(
    sql.includes('tenant_scoped_consent_ledger_read'),
    'Must include tenant-scoped consent ledger read policy'
  );
  assert.ok(
    sql.includes('data_rights_requests'),
    'Must explicitly state scope boundary for data_rights_requests'
  );
});

test('8. Data safety: No destructive unbounded DDL operations', () => {
  const sql = fs.readFileSync(PROPOSAL_SQL_PATH, 'utf8');
  const upper = sql.toUpperCase();
  assert.ok(!upper.includes('DROP TABLE'), 'Proposal must not contain DROP TABLE');
  assert.ok(!upper.includes('TRUNCATE'), 'Proposal must not contain TRUNCATE');
  assert.ok(!upper.includes('DROP SCHEMA'), 'Proposal must not contain DROP SCHEMA');
  assert.ok(!upper.includes('DROP DATABASE'), 'Proposal must not contain DROP DATABASE');
});

test('9. Historical P0 security cutover (appointment_access_tokens) remains strictly separate', () => {
  const sql = fs.readFileSync(PROPOSAL_SQL_PATH, 'utf8');
  assert.ok(
    !sql.toLowerCase().includes('appointment_access_tokens'),
    'Legal consent proposal must not touch or alter appointment_access_tokens; P0 remains independent'
  );
});

test('10. Trusted Server Write Contract doc verifies all architecture invariants and schema boundaries', () => {
  assert.ok(fs.existsSync(CONTRACT_DOC_PATH), 'Contract markdown must exist');
  const doc = fs.readFileSync(CONTRACT_DOC_PATH, 'utf8');

  assert.ok(doc.includes('service_role'), 'Must address service_role prohibition in client');
  assert.ok(doc.includes('JWT'), 'Must require JWT validation for authenticated actors');
  assert.ok(doc.includes('booking capability token') || doc.includes('bookingCapabilityToken'), 'Must require booking capability for checkout');
  assert.ok(doc.includes('nonce'), 'Must specify replay prevention via nonce');
  assert.ok(doc.includes('public.legal_documents'), 'Must require DB resolution of document versions');
  assert.ok(doc.includes('clock_timestamp()'), 'Must require server timestamp');
  assert.ok(doc.includes('IP') && (doc.includes('masked') || doc.includes('redact') || doc.includes('De-Identification')), 'Must require IP de-identification');
  assert.ok(doc.includes('append-only') || doc.includes('Append-Only'), 'Must mandate append-only revocation model');
  assert.ok(doc.includes('UNRESOLVED_IDENTITY_BOUNDARY'), 'Contract must document UNRESOLVED_IDENTITY_BOUNDARY');
  assert.ok(doc.includes('policy_acceptances.user_id'), 'Contract must reference verified column policy_acceptances.user_id');
  assert.ok(doc.includes('consent_ledger.customer_id'), 'Contract must reference verified column consent_ledger.customer_id');
  assert.ok(doc.includes('create_public_booking'), 'Contract must address compatibility with SECURITY DEFINER create_public_booking');
});

test('11. Proposal status is marked SOURCE_PROPOSED_ONLY and RLS_PROPOSAL_NOT_ACCEPTED', () => {
  const sql = fs.readFileSync(PROPOSAL_SQL_PATH, 'utf8');
  assert.ok(
    sql.includes('SOURCE_PROPOSED_ONLY') && sql.includes('RLS_PROPOSAL_NOT_ACCEPTED'),
    'Proposal header must state status is SOURCE_PROPOSED_ONLY and RLS_PROPOSAL_NOT_ACCEPTED'
  );
});

test('12. Disposable PostgreSQL 17.6 Schema & Behavioral Qualification (create_public_booking + RLS Isolation)', () => {
  const endpoint = process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock';
  const dockerEnv = { ...process.env };
  delete dockerEnv.DOCKER_HOST;
  delete dockerEnv.DOCKER_CONTEXT;
  delete dockerEnv.DOCKER_TLS_VERIFY;
  delete dockerEnv.DOCKER_CERT_PATH;

  const dockerCmd = (args, options = {}) =>
    spawnSync('docker', ['-H', endpoint, ...args], {
      encoding: 'utf8',
      ...options,
      env: dockerEnv
    });

  const probe = dockerCmd(['info', '--format', '{{.OperatingSystem}}'], { timeout: 8000 });
  const dockerAvailable = !probe.error && probe.status === 0;

  if (!dockerAvailable) {
    console.log('[SECURITY_PLAN_QA] Disposable PostgreSQL 17 Docker engine not available in local environment.');
    console.log('[SECURITY_PLAN_QA] SQL_CLONE_TEST_STATUS: SQL_CLONE_TEST_NOT_RUN');
    console.log('[SECURITY_PLAN_QA] RLS_PROPOSAL_VERDICT: RLS_PROPOSAL_NOT_ACCEPTED');
    if (process.env.LARI_REQUIRE_PG17_DOCKER === '1') {
      assert.fail('LARI_REQUIRE_PG17_DOCKER=1 was set, but Docker daemon is unavailable');
    }
    return;
  }

  console.log('[SECURITY_PLAN_QA] Disposable PostgreSQL 17 Docker engine detected; launching isolated container...');
  const uniqueId = randomBytes(12).toString('hex');
  const containerName = `lari-pg17-legal-rls-qa-${uniqueId}`;
  const nonceLabel = `lari.legal.rls.nonce=${uniqueId}`;
  const disposablePassword = randomBytes(20).toString('hex');

  const runRes = dockerCmd([
    'run',
    '--detach',
    '--rm',
    '--network', 'none',
    '--name', containerName,
    '--label', nonceLabel,
    '-e', 'POSTGRES_USER=supabase_admin',
    '-e', 'POSTGRES_DB=postgres',
    '-e', `POSTGRES_PASSWORD=${disposablePassword}`,
    'postgres:17.6-alpine'
  ]);
  assert.equal(runRes.status, 0, `Failed to start postgres:17.6-alpine container: ${runRes.stderr}`);
  const containerId = runRes.stdout.trim().split(/\r?\n/)[0];
  assert.match(containerId, /^[a-f0-9]{64}$/, 'Must return 64-char container ID');

  const execPsqlRaw = (sql, { user = 'supabase_admin' } = {}) =>
    dockerCmd(
      [
        'exec',
        '-i',
        '--user', 'postgres',
        containerId,
        'psql',
        '-X',
        '-v', 'ON_ERROR_STOP=1',
        '-h', '/var/run/postgresql',
        '-U', user,
        '-d', 'postgres',
        '-f', '-'
      ],
      { input: sql, timeout: 30000 }
    );

  const execPsql = (sql, opts = {}) => {
    const res = execPsqlRaw(sql, opts);
    assert.equal(res.status, 0, `psql execution failed: ${res.stderr}\nSQL:\n${sql}`);
    return res;
  };

  const execPsqlExpectFailure = (sql, expectedPattern, opts = {}) => {
    const res = execPsqlRaw(sql, opts);
    assert.notEqual(res.status, 0, `Expected psql failure containing "${expectedPattern}", but query succeeded: ${res.stdout}`);
    const combined = `${res.stderr}\n${res.stdout}`;
    assert.ok(
      combined.includes(expectedPattern),
      `Expected error to contain "${expectedPattern}", got:\n${combined}`
    );
    return res;
  };

  try {
    // Wait for final PostgreSQL server readiness (TCP 127.0.0.1:5432 is only open after docker_temp_server_start stops)
    let ready = false;
    const start = Date.now();
    while (Date.now() - start < 45000) {
      const logsProbe = dockerCmd(['logs', containerId]);
      const initDone = `${logsProbe.stdout || ''}\n${logsProbe.stderr || ''}`.includes(
        'PostgreSQL init process complete'
      );
      if (initDone) {
        const r = dockerCmd([
          'exec',
          '-i',
          '--user',
          'postgres',
          containerId,
          'pg_isready',
          '-h',
          '127.0.0.1',
          '-p',
          '5432',
          '-U',
          'supabase_admin',
          '-d',
          'postgres'
        ]);
        if (r.status === 0) {
          const ping = execPsqlRaw('SELECT 1;');
          if (ping.status === 0) {
            ready = true;
            break;
          }
        }
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
    assert.ok(ready, 'PostgreSQL 17.6 container did not become ready in time');

    // Bootstrap Supabase-compatible roles, auth schema, real tables, and create_public_booking owned by NOBYPASSRLS owner role
    const bootstrapSql = `
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE ROLE anon NOLOGIN NOINHERIT NOBYPASSRLS;
      CREATE ROLE authenticated NOLOGIN NOINHERIT NOBYPASSRLS;
      CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
      CREATE ROLE booking_definer_owner NOLOGIN NOINHERIT NOBYPASSRLS;

      GRANT anon, authenticated, service_role, booking_definer_owner TO supabase_admin;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, booking_definer_owner;

      CREATE SCHEMA IF NOT EXISTS auth;
      GRANT USAGE ON SCHEMA auth TO public, anon, authenticated, service_role, booking_definer_owner;

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;

      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
      $$;

      CREATE TABLE public.tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug text UNIQUE NOT NULL,
        status text NOT NULL DEFAULT 'active',
        onboarding_status text NOT NULL DEFAULT 'completed',
        public_site_status text NOT NULL DEFAULT 'published'
      );

      CREATE TABLE public.users_profile (
        id uuid PRIMARY KEY,
        tenant_id uuid REFERENCES public.tenants(id),
        role text NOT NULL,
        active boolean NOT NULL DEFAULT true
      );

      CREATE OR REPLACE FUNCTION public.is_super_admin(p_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.users_profile up
          WHERE up.id = p_uid AND up.active = true AND up.role = 'super_admin'
        );
      $$;

      CREATE TABLE public.customers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES public.tenants(id),
        name text NOT NULL,
        email text,
        phone text
      );

      CREATE TABLE public.appointments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES public.tenants(id),
        customer_id uuid NOT NULL REFERENCES public.customers(id),
        user_name text,
        user_email text,
        phone text,
        appointment_date date NOT NULL,
        appointment_time time NOT NULL,
        status text NOT NULL DEFAULT 'confirmed'
      );

      CREATE TABLE public.appointment_access_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        appointment_id uuid NOT NULL,
        token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz DEFAULT now() NOT NULL,
        used_at timestamptz
      );

      CREATE TABLE public.policy_acceptances (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text,
        user_id text,
        policy_type text NOT NULL CHECK (policy_type IN ('terms', 'privacy_policy', 'kvkk_consent', 'cookie_policy')),
        version text NOT NULL,
        ip_address text,
        user_agent text,
        accepted_at timestamptz DEFAULT now() NOT NULL
      );

      CREATE TABLE public.consent_ledger (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        customer_id text NOT NULL,
        consent_type text NOT NULL,
        is_granted boolean NOT NULL,
        ip_address text,
        digital_signature text,
        created_at timestamptz DEFAULT now() NOT NULL
      );

      ALTER TABLE public.policy_acceptances OWNER TO booking_definer_owner;
      ALTER TABLE public.consent_ledger OWNER TO booking_definer_owner;
      ALTER TABLE public.customers OWNER TO booking_definer_owner;
      ALTER TABLE public.appointments OWNER TO booking_definer_owner;
      ALTER TABLE public.appointment_access_tokens OWNER TO booking_definer_owner;

      GRANT SELECT, INSERT, UPDATE, DELETE ON public.policy_acceptances TO anon, authenticated, booking_definer_owner;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.consent_ledger TO anon, authenticated, booking_definer_owner;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO booking_definer_owner;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO booking_definer_owner;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_access_tokens TO booking_definer_owner;
      GRANT SELECT ON public.tenants TO anon, authenticated, booking_definer_owner;
      GRANT SELECT ON public.users_profile TO anon, authenticated, booking_definer_owner;

      -- Existing baseline policies from 20260620 & 20260622
      ALTER TABLE public.policy_acceptances ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Allow public insert acceptances" ON public.policy_acceptances FOR INSERT WITH CHECK (true);
      CREATE POLICY "Owner/Admin view policy acceptances" ON public.policy_acceptances
        FOR SELECT USING (
          EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (up.role = 'tenant_owner' AND up.tenant_id = policy_acceptances.tenant_id::uuid)
              )
          )
          OR user_id = auth.uid()::text
        );

      ALTER TABLE public.consent_ledger ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Allow public insertion during checkout" ON public.consent_ledger FOR INSERT WITH CHECK (true);
      CREATE POLICY "Owner/Admin manage consent ledger" ON public.consent_ledger
        USING (
          EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (up.role = 'tenant_owner' AND up.tenant_id = consent_ledger.tenant_id::uuid)
              )
          )
        );

      -- Seed Tenant A and Tenant B
      INSERT INTO public.tenants (id, slug) VALUES
        ('11111111-1111-4111-8111-111111111111', 'salon-alpha'),
        ('22222222-2222-4222-8222-222222222222', 'salon-beta');

      INSERT INTO public.users_profile (id, tenant_id, role, active) VALUES
        ('aaaa1111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'tenant_owner', true),
        ('bbbb2222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'tenant_owner', true);

      INSERT INTO public.policy_acceptances (tenant_id, user_id, policy_type, version) VALUES
        ('11111111-1111-4111-8111-111111111111', 'aaaa1111-1111-4111-8111-111111111111', 'terms', '1.0'),
        ('22222222-2222-4222-8222-222222222222', 'bbbb2222-2222-4222-8222-222222222222', 'terms', '1.0');

      -- Representative SECURITY DEFINER create_public_booking function matching 20260720/20260914 consent write path
      CREATE OR REPLACE FUNCTION public.create_public_booking(
        p_slug text,
        p_customer_name text,
        p_customer_phone text,
        p_required_consent boolean,
        p_marketing_consent boolean DEFAULT false,
        p_reminder_consent boolean DEFAULT false
      ) RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $fn$
      DECLARE
        v_tenant_id uuid;
        v_customer_id uuid;
        v_appointment_id uuid;
        v_token text;
        v_token_hash text;
      BEGIN
        IF p_required_consent IS NOT TRUE THEN
          RETURN jsonb_build_object('success', false, 'reason_code', 'consent_required');
        END IF;

        SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = p_slug AND status = 'active';
        IF NOT FOUND THEN
          RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_tenant');
        END IF;

        INSERT INTO public.customers (tenant_id, name, phone)
        VALUES (v_tenant_id, p_customer_name, p_customer_phone)
        RETURNING id INTO v_customer_id;

        INSERT INTO public.consent_ledger (tenant_id, customer_id, consent_type, is_granted, ip_address)
        VALUES
          (v_tenant_id::text, v_customer_id::text, 'booking_terms', true, 'rpc_public_booking'),
          (v_tenant_id::text, v_customer_id::text, 'marketing', COALESCE(p_marketing_consent, false), 'rpc_public_booking'),
          (v_tenant_id::text, v_customer_id::text, 'reminders', COALESCE(p_reminder_consent, false), 'rpc_public_booking');

        INSERT INTO public.appointments (tenant_id, customer_id, user_name, phone, appointment_date, appointment_time, status)
        VALUES (v_tenant_id, v_customer_id, p_customer_name, p_customer_phone, current_date + 1, '10:00'::time, 'confirmed')
        RETURNING id INTO v_appointment_id;

        v_token := encode(gen_random_bytes(16), 'hex');
        v_token_hash := encode(sha256(v_token::bytea), 'hex');
        INSERT INTO public.appointment_access_tokens (tenant_id, appointment_id, token_hash, expires_at)
        VALUES (v_tenant_id::text, v_appointment_id, v_token_hash, now() + interval '30 days');

        RETURN jsonb_build_object('success', true, 'appointment_id', v_appointment_id, 'manage_token', v_token, 'reason_code', 'ok');
      END;
      $fn$;

      ALTER FUNCTION public.create_public_booking(text, text, text, boolean, boolean, boolean) OWNER TO booking_definer_owner;
      REVOKE EXECUTE ON FUNCTION public.create_public_booking(text, text, text, boolean, boolean, boolean) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.create_public_booking(text, text, text, boolean, boolean, boolean) TO anon, authenticated;
    `;
    execPsql(bootstrapSql);

    // Proof 12a: Verify that the old Batch 03/04 actor_id policy expression fails on real PostgreSQL 17.6
    execPsqlExpectFailure(
      `CREATE POLICY broken_actor_id_policy ON public.consent_ledger FOR SELECT TO authenticated USING (actor_id = 'test');`,
      'column "actor_id" does not exist'
    );

    // Proof 12b: Verify that FORCE ROW LEVEL SECURITY without an anon/owner insert policy breaks create_public_booking when owner is NOBYPASSRLS
    execPsqlExpectFailure(
      `
      BEGIN;
      DROP POLICY IF EXISTS "Allow public insertion during checkout" ON public.consent_ledger;
      ALTER TABLE public.consent_ledger FORCE ROW LEVEL SECURITY;
      SET LOCAL ROLE anon;
      SELECT public.create_public_booking('salon-alpha', 'Test Customer', '05550000000', true, false, true);
      COMMIT;
      `,
      'row-level security policy for table "consent_ledger"'
    );

    // Proof 12c: Apply the actual corrected PUBLIC_CONSENT_RLS_FORWARD_PROPOSAL.sql
    const proposalSql = fs.readFileSync(PROPOSAL_SQL_PATH, 'utf8');
    execPsql(proposalSql);

    // Proof 12d: Positive authorized public booking via SECURITY DEFINER RPC as anon succeeds and captures 3 consent rows
    const bookingRes = execPsql(
      [
        '\\set QUIET 1',
        '\\pset tuples_only on',
        '\\pset format unaligned',
        'BEGIN;',
        'SET LOCAL ROLE anon;',
        "SELECT (public.create_public_booking('salon-alpha', 'Deniz Kaya', '05559998877', true, true, false))->>'reason_code';",
        'COMMIT;'
      ].join('\n')
    );
    assert.ok(bookingRes.stdout.includes('ok'), `Expected public booking RPC to return reason_code=ok, got: ${bookingRes.stdout}`);

    // Proof 12e: Negative anonymous direct writes to consent_ledger and policy_acceptances fail closed
    execPsqlExpectFailure(
      `
      BEGIN;
      SET LOCAL ROLE anon;
      INSERT INTO public.consent_ledger (tenant_id, customer_id, consent_type, is_granted)
      VALUES ('11111111-1111-4111-8111-111111111111', 'forged-cust', 'marketing', true);
      COMMIT;
      `,
      'permission denied for table consent_ledger'
    );

    execPsqlExpectFailure(
      `
      BEGIN;
      SET LOCAL ROLE anon;
      INSERT INTO public.policy_acceptances (tenant_id, user_id, policy_type, version)
      VALUES ('11111111-1111-4111-8111-111111111111', 'forged-user', 'terms', '1.0');
      COMMIT;
      `,
      'permission denied for table policy_acceptances'
    );

    // Proof 12f: Negative anonymous cross-tenant SELECT returns 0 rows
    const anonSelectRes = execPsql(
      [
        '\\set QUIET 1',
        '\\pset tuples_only on',
        '\\pset format unaligned',
        'BEGIN;',
        'SET LOCAL ROLE anon;',
        'SELECT count(*) FROM public.consent_ledger;',
        'SELECT count(*) FROM public.policy_acceptances;',
        'COMMIT;'
      ].join('\n')
    );
    const anonCounts = anonSelectRes.stdout.trim().split(/\r?\n/).filter((l) => /^\d+$/.test(l.trim()));
    assert.deepEqual(anonCounts, ['0', '0'], `Anonymous SELECT on consent_ledger and policy_acceptances must return 0 rows, got: ${anonCounts}`);

    // Proof 12g: Authenticated Tenant A owner sees Tenant A's 3 consent rows and 1 policy row, and 0 rows from Tenant B
    const tenantARes = execPsql(
      [
        '\\set QUIET 1',
        '\\pset tuples_only on',
        '\\pset format unaligned',
        'BEGIN;',
        'SET LOCAL ROLE authenticated;',
        "SET LOCAL \"request.jwt.claim.sub\" = 'aaaa1111-1111-4111-8111-111111111111';",
        'SELECT count(*) FROM public.consent_ledger;',
        "SELECT count(*) FROM public.consent_ledger WHERE tenant_id = '22222222-2222-4222-8222-222222222222';",
        'SELECT count(*) FROM public.policy_acceptances;',
        "SELECT count(*) FROM public.policy_acceptances WHERE tenant_id = '22222222-2222-4222-8222-222222222222';",
        'COMMIT;'
      ].join('\n')
    );
    const tenantACounts = tenantARes.stdout.trim().split(/\r?\n/).filter((l) => /^\d+$/.test(l.trim()));
    assert.deepEqual(
      tenantACounts,
      ['3', '0', '1', '0'],
      `Tenant A owner must see 3 own consent rows, 0 Tenant B consent rows, 1 own policy acceptance, 0 Tenant B policy acceptances; got: ${tenantACounts}`
    );

    // Proof 12h: Authenticated Tenant B owner sees 0 consent rows (since booking was on Tenant A) and 1 own policy row
    const tenantBRes = execPsql(
      [
        '\\set QUIET 1',
        '\\pset tuples_only on',
        '\\pset format unaligned',
        'BEGIN;',
        'SET LOCAL ROLE authenticated;',
        "SET LOCAL \"request.jwt.claim.sub\" = 'bbbb2222-2222-4222-8222-222222222222';",
        'SELECT count(*) FROM public.consent_ledger;',
        'SELECT count(*) FROM public.policy_acceptances;',
        'COMMIT;'
      ].join('\n')
    );
    const tenantBCounts = tenantBRes.stdout.trim().split(/\r?\n/).filter((l) => /^\d+$/.test(l.trim()));
    assert.deepEqual(
      tenantBCounts,
      ['0', '1'],
      `Tenant B owner must see 0 Tenant A consent rows and 1 own policy acceptance; got: ${tenantBCounts}`
    );

    // Proof 12i: Authenticated Tenant A owner cannot directly INSERT/UPDATE/DELETE consent_ledger
    execPsqlExpectFailure(
      `
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = 'aaaa1111-1111-4111-8111-111111111111';
      DELETE FROM public.consent_ledger;
      COMMIT;
      `,
      'permission denied for table consent_ledger'
    );

    console.log('[SECURITY_PLAN_QA] SQL_CLONE_TEST_STATUS: DISPOSABLE_PG17_FIXTURE_VERIFIED');
    console.log('[SECURITY_PLAN_QA] RLS_PROPOSAL_VERDICT: RLS_PROPOSAL_NOT_ACCEPTED (Awaiting live staging clone & trusted server write endpoint)');
  } finally {
    dockerCmd(['rm', '-f', containerId]);
  }
});
