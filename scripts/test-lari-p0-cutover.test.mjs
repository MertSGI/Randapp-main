import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import {
  verifyP0Cutover,
  queryP0CatalogPostconditions,
  REQUIRED_TOKEN_RPCS,
  REQUIRED_COLUMNS,
} from './lari-recovery/verify-p0-cutover.mjs';

test('1. Security Boundary: Rejects non-loopback hostnames and live Supabase URLs', async () => {
  const forbiddenUrls = [
    'postgresql://postgres:secret@db.rwedeejhjazwjthdjzrt.supabase.co:5432/lari_restore_p0',
    'postgresql://postgres:secret@192.168.1.1:5432/lari_restore_p0',
    'postgresql://postgres:secret@remote-host:5432/lari_restore_p0',
  ];

  for (const url of forbiddenUrls) {
    const res = await verifyP0Cutover({ dbUrl: url, cloneConfirmed: true });
    assert.equal(res.status, 'RESTORED_CLONE_REQUIRED');
    assert.equal(res.live_p0_accepted, false);
  }
});

test('2. Missing Clone Safety: Returns RESTORED_CLONE_REQUIRED without fabricated PASS when DB URL is omitted', async () => {
  const res = await verifyP0Cutover({ dbUrl: undefined, cloneConfirmed: false });
  assert.equal(res.status, 'RESTORED_CLONE_REQUIRED');
  assert.equal(res.live_p0_accepted, false);
  assert.notEqual(res.status, 'P0_CLONE_POSTCONDITION_PASS');
  assert.notEqual(res.status, 'LIVE_P0_ACCEPTED');
});

test('3. Negative Catalog Evaluation: Missing public.appointment_access_tokens returns P0_NOT_APPLIED', async () => {
  const mockClient = {
    async query(sql) {
      if (sql.includes('appointment_access_tokens')) {
        return { rows: [] }; // Table not found
      }
      return { rows: [] };
    },
  };

  const res = await queryP0CatalogPostconditions(mockClient);
  assert.equal(res.status, 'P0_NOT_APPLIED');
  assert.equal(res.reason, 'TABLE_MISSING');
});

test('4. Negative Catalog Evaluation: Pre-hardening open policy returns P0_NOT_APPLIED', async () => {
  const mockClient = {
    async query(sql, params) {
      if (sql.includes('FROM pg_catalog.pg_class c')) {
        return {
          rows: [
            { oid: 12345, relkind: 'r', owner: 'postgres', rls_enabled: true, force_rls: false },
          ],
        };
      }
      if (sql.includes('FROM pg_catalog.pg_attribute')) {
        return {
          rows: REQUIRED_COLUMNS.map((c) => ({ attname: c.attname, type_name: c.type_name })),
        };
      }
      if (sql.includes('policyname = \'Allow public select by token hash\'')) {
        return {
          rows: [
            { policyname: 'Allow public select by token hash', cmd: 'SELECT', roles: ['public'], qual: 'true' },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const res = await queryP0CatalogPostconditions(mockClient);
  assert.equal(res.status, 'P0_NOT_APPLIED');
  assert.equal(res.reason, 'PRE_HARDENING_OPEN_POLICY_PRESENT');
});

test('5. Negative Catalog Evaluation: RLS disabled returns P0_POSTCONDITION_FAILED', async () => {
  const mockClient = {
    async query(sql) {
      if (sql.includes('FROM pg_catalog.pg_class c')) {
        return {
          rows: [
            { oid: 12345, relkind: 'r', owner: 'postgres', rls_enabled: false, force_rls: false },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const res = await queryP0CatalogPostconditions(mockClient);
  assert.equal(res.status, 'P0_POSTCONDITION_FAILED');
  assert.equal(res.reason, 'RLS_NOT_ENABLED');
});

test('6. Negative Catalog Evaluation: Non-postgres table owner returns P0_POSTCONDITION_FAILED', async () => {
  const mockClient = {
    async query(sql) {
      if (sql.includes('FROM pg_catalog.pg_class c')) {
        return {
          rows: [
            { oid: 12345, relkind: 'r', owner: 'anon_user', rls_enabled: true, force_rls: false },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const res = await queryP0CatalogPostconditions(mockClient);
  assert.equal(res.status, 'P0_POSTCONDITION_FAILED');
  assert.equal(res.reason, 'UNEXPECTED_OWNER');
});

test('7. Negative Catalog Evaluation: Column schema mismatch returns P0_POSTCONDITION_FAILED', async () => {
  const mockClient = {
    async query(sql) {
      if (sql.includes('FROM pg_catalog.pg_class c')) {
        return {
          rows: [
            { oid: 12345, relkind: 'r', owner: 'postgres', rls_enabled: true, force_rls: false },
          ],
        };
      }
      if (sql.includes('FROM pg_catalog.pg_attribute')) {
        // Missing token_hash column
        return {
          rows: REQUIRED_COLUMNS.filter((c) => c.attname !== 'token_hash').map((c) => ({
            attname: c.attname,
            type_name: c.type_name,
          })),
        };
      }
      return { rows: [] };
    },
  };

  const res = await queryP0CatalogPostconditions(mockClient);
  assert.equal(res.status, 'P0_POSTCONDITION_FAILED');
  assert.equal(res.reason, 'COLUMN_SCHEMA_MISMATCH');
  assert.ok(res.details.some((d) => d.column === 'token_hash' && d.actual === 'MISSING'));
});

test('8. Negative Catalog Evaluation: Direct anon table privileges retained returns P0_POSTCONDITION_FAILED', async () => {
  const mockClient = {
    async query(sql) {
      if (sql.includes('FROM pg_catalog.pg_class c')) {
        return {
          rows: [
            { oid: 12345, relkind: 'r', owner: 'postgres', rls_enabled: true, force_rls: false },
          ],
        };
      }
      if (sql.includes('FROM pg_catalog.pg_attribute')) {
        return {
          rows: REQUIRED_COLUMNS.map((c) => ({ attname: c.attname, type_name: c.type_name })),
        };
      }
      if (sql.includes('policyname = \'Allow public select by token hash\'')) {
        return { rows: [] }; // open policy is dropped
      }
      if (sql.includes('qual IN (\'true\', \'(true)\')')) {
        return { rows: [] }; // no permissive policies
      }
      if (sql.includes('has_table_privilege(\'anon\'')) {
        return {
          rows: [
            { anon_select: true, anon_insert: false, anon_update: false, anon_delete: false },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const res = await queryP0CatalogPostconditions(mockClient);
  assert.equal(res.status, 'P0_POSTCONDITION_FAILED');
  assert.equal(res.reason, 'ANON_PRIVILEGES_RETAINED');
  assert.deepEqual(res.retained_privileges, ['SELECT']);
});

test('9. Negative Catalog Evaluation: Missing or non-SECURITY DEFINER token RPC returns P0_POSTCONDITION_FAILED', async () => {
  const mockClient = {
    async query(sql) {
      if (sql.includes('FROM pg_catalog.pg_class c')) {
        return {
          rows: [
            { oid: 12345, relkind: 'r', owner: 'postgres', rls_enabled: true, force_rls: false },
          ],
        };
      }
      if (sql.includes('FROM pg_catalog.pg_attribute')) {
        return {
          rows: REQUIRED_COLUMNS.map((c) => ({ attname: c.attname, type_name: c.type_name })),
        };
      }
      if (sql.includes('policyname = \'Allow public select by token hash\'')) {
        return { rows: [] };
      }
      if (sql.includes('qual IN (\'true\', \'(true)\')')) {
        return { rows: [] };
      }
      if (sql.includes('has_table_privilege(\'anon\'')) {
        return {
          rows: [
            { anon_select: false, anon_insert: false, anon_update: false, anon_delete: false },
          ],
        };
      }
      if (sql.includes('FROM pg_catalog.pg_proc p')) {
        // Return RPCs but make one not SECURITY DEFINER
        return {
          rows: REQUIRED_TOKEN_RPCS.map((name) => ({
            proname: name,
            is_security_definer: name !== 'get_public_appointment_by_manage_token',
            anon_has_execute: true,
          })),
        };
      }
      return { rows: [] };
    },
  };

  const res = await queryP0CatalogPostconditions(mockClient);
  assert.equal(res.status, 'P0_POSTCONDITION_FAILED');
  assert.equal(res.reason, 'TOKEN_RPC_POSTCONDITION_FAILED');
  assert.ok(
    res.details.some(
      (d) => d.rpc === 'get_public_appointment_by_manage_token' && d.error === 'NOT_SECURITY_DEFINER'
    )
  );
});

test('10. Positive Catalog Evaluation: Hardened clone passes with P0_CLONE_POSTCONDITION_PASS and live_p0_accepted=false', async () => {
  const mockClient = {
    async query(sql) {
      if (sql.includes('FROM pg_catalog.pg_class c')) {
        return {
          rows: [
            { oid: 12345, relkind: 'r', owner: 'postgres', rls_enabled: true, force_rls: false },
          ],
        };
      }
      if (sql.includes('FROM pg_catalog.pg_attribute')) {
        return {
          rows: REQUIRED_COLUMNS.map((c) => ({ attname: c.attname, type_name: c.type_name })),
        };
      }
      if (sql.includes('policyname = \'Allow public select by token hash\'')) {
        return { rows: [] };
      }
      if (sql.includes('qual IN (\'true\', \'(true)\')')) {
        return { rows: [] };
      }
      if (sql.includes('has_table_privilege(\'anon\'')) {
        return {
          rows: [
            { anon_select: false, anon_insert: false, anon_update: false, anon_delete: false },
          ],
        };
      }
      if (sql.includes('FROM pg_catalog.pg_proc p')) {
        return {
          rows: REQUIRED_TOKEN_RPCS.map((name) => ({
            proname: name,
            is_security_definer: true,
            anon_has_execute: true,
          })),
        };
      }
      return { rows: [] };
    },
  };

  const res = await queryP0CatalogPostconditions(mockClient);
  assert.equal(res.status, 'P0_CLONE_POSTCONDITION_PASS');
  assert.equal(res.live_status, 'LIVE_P0_NOT_APPLIED');
  assert.equal(res.live_p0_accepted, false);
  assert.equal(res.table_checks.columns_verified, 7);
  assert.equal(res.rpc_checks.rpcs_verified_count, 5);
});

test('11. Receipt Target Classification: Distinguishes DISPOSABLE_FIXTURE from RESTORED_CLONE, and strictly enforces live_p0_accepted=false', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lari-p0-receipt-'));
  const receiptPath = path.join(tempDir, 'p0-receipt.json');

  try {
    // When called with DISPOSABLE_FIXTURE target classification without live clone
    const res = await verifyP0Cutover({
      dbUrl: undefined,
      cloneConfirmed: false,
      evaluationTarget: 'DISPOSABLE_FIXTURE',
      receiptOutputPath: receiptPath,
    });

    assert.equal(res.status, 'RESTORED_CLONE_REQUIRED');
    assert.equal(res.evaluation_target, 'DISPOSABLE_FIXTURE');
    assert.equal(res.live_p0_accepted, false);
    assert.equal(res.live_status, 'LIVE_P0_NOT_APPLIED');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('12. Safety Policy: Prohibits live staging attestation in clone verifier', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lari-p0-live-'));
  const receiptPath = path.join(tempDir, 'p0-live-receipt.json');

  try {
    // Attempting to evaluate with LIVE_STAGING must never result in live_p0_accepted: true
    const res = await verifyP0Cutover({
      dbUrl: undefined,
      cloneConfirmed: false,
      evaluationTarget: 'LIVE_STAGING',
      receiptOutputPath: receiptPath,
    });

    assert.equal(res.status, 'RESTORED_CLONE_REQUIRED');
    assert.equal(res.live_p0_accepted, false);
    assert.equal(res.live_status, 'LIVE_P0_NOT_APPLIED');
    assert.notEqual(res.status, 'LIVE_P0_ACCEPTED');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
