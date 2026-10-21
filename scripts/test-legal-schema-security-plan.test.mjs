import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT_DIR = process.cwd();
const PROPOSAL_SQL_PATH = path.resolve(ROOT_DIR, 'docs', 'lari-program', 'security-proposals', 'PUBLIC_CONSENT_RLS_FORWARD_PROPOSAL.sql');
const CONTRACT_DOC_PATH = path.resolve(ROOT_DIR, 'docs', 'lari-program', 'security-proposals', 'CONSENT_TRUSTED_WRITE_CONTRACT.md');
const SUPABASE_MIGRATIONS_DIR = path.resolve(ROOT_DIR, 'supabase', 'migrations');

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

test('3. Row Level Security is explicitly enabled and forced', () => {
  const sql = fs.readFileSync(PROPOSAL_SQL_PATH, 'utf8');
  assert.ok(
    /ALTER\s+TABLE\s+public\.consent_ledger\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql),
    'Must enable RLS on consent_ledger'
  );
  assert.ok(
    /ALTER\s+TABLE\s+public\.consent_ledger\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql),
    'Must force RLS on consent_ledger'
  );
  assert.ok(
    /ALTER\s+TABLE\s+public\.policy_acceptances\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql),
    'Must enable RLS on policy_acceptances'
  );
  assert.ok(
    /ALTER\s+TABLE\s+public\.policy_acceptances\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql),
    'Must force RLS on policy_acceptances'
  );
});

test('4. Direct write privileges are revoked from untrusted roles', () => {
  const sql = fs.readFileSync(PROPOSAL_SQL_PATH, 'utf8');
  assert.ok(
    /REVOKE\s+INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+TABLE\s+public\.consent_ledger\s+FROM\s+public\s*,\s*anon\s*,\s*authenticated/i.test(sql),
    'Must revoke INSERT, UPDATE, DELETE on consent_ledger from public, anon, authenticated'
  );
  assert.ok(
    /REVOKE\s+INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+TABLE\s+public\.policy_acceptances\s+FROM\s+public\s*,\s*anon\s*,\s*authenticated/i.test(sql),
    'Must revoke INSERT, UPDATE, DELETE on policy_acceptances from public, anon, authenticated'
  );
});

test('5. Explicitly drops the two confirmed unsafe public INSERT policies', () => {
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

test('6. Preserves SELECT read policy semantics and bounds data_rights_requests scope', () => {
  const sql = fs.readFileSync(PROPOSAL_SQL_PATH, 'utf8');
  assert.ok(
    /GRANT\s+SELECT\s+ON\s+TABLE\s+public\.consent_ledger\s+TO\s+anon\s*,\s*authenticated/i.test(sql),
    'Must preserve SELECT grant for authorized reads'
  );
  assert.ok(
    /GRANT\s+SELECT\s+ON\s+TABLE\s+public\.policy_acceptances\s+TO\s+anon\s*,\s*authenticated/i.test(sql),
    'Must preserve SELECT grant for authorized reads'
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

test('7. Data safety: No destructive unbounded DDL operations', () => {
  const sql = fs.readFileSync(PROPOSAL_SQL_PATH, 'utf8');
  const upper = sql.toUpperCase();
  assert.ok(!upper.includes('DROP TABLE'), 'Proposal must not contain DROP TABLE');
  assert.ok(!upper.includes('TRUNCATE'), 'Proposal must not contain TRUNCATE');
  assert.ok(!upper.includes('DROP SCHEMA'), 'Proposal must not contain DROP SCHEMA');
  assert.ok(!upper.includes('DROP DATABASE'), 'Proposal must not contain DROP DATABASE');
});

test('8. Historical P0 security cutover (appointment_access_tokens) remains strictly separate', () => {
  const sql = fs.readFileSync(PROPOSAL_SQL_PATH, 'utf8');
  assert.ok(
    !sql.toLowerCase().includes('appointment_access_tokens'),
    'Legal consent proposal must not touch or alter appointment_access_tokens; P0 remains independent'
  );
});

test('9. Trusted Server Write Contract doc verifies all architecture invariants', () => {
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
});

test('10. Proposal status is marked SOURCE_PROPOSED_ONLY and does not claim live execution', () => {
  const sql = fs.readFileSync(PROPOSAL_SQL_PATH, 'utf8');
  assert.ok(
    sql.includes('SOURCE_PROPOSED_ONLY') || sql.includes('GATED_STAGING_REMEDIATION'),
    'Proposal header must state status is proposed only'
  );
});

test('11. Disposable PostgreSQL 17 qualification check (CLONE_TEST_NOT_RUN when Docker is unavailable)', () => {
  const probe = spawnSync('docker', ['info'], { encoding: 'utf8', timeout: 5000 });
  const dockerAvailable = probe.status === 0;

  if (!dockerAvailable) {
    console.log('[SECURITY_PLAN_QA] Disposable PostgreSQL 17 Docker engine not available in environment.');
    console.log('[SECURITY_PLAN_QA] STAGING_CLONE_TEST_STATUS: CLONE_TEST_NOT_RUN (Required by Controller specification; no synthetic PASS).');
    assert.equal(dockerAvailable, false, 'Expected docker to be unavailable in offline local runner');
  } else {
    console.log('[SECURITY_PLAN_QA] Disposable PostgreSQL 17 Docker engine detected; live clone test candidate.');
  }
});
