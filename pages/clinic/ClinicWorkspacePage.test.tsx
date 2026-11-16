import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import type { ClinicStaffContext } from '../../types/clinic.ts';

const SYNTH_CLINIC_CTX: ClinicStaffContext = {
  tenant_id: 'aaaa1111-a1a1-41a1-81a1-aaaaaaaaaaaa',
  staff_id: 'bbbb2222-b2b2-42b2-82b2-bbbbbbbbbbbb',
  staff_name: 'Dr. Sentetik Klinik',
  practitioner_type: 'physician',
  specialty: 'Dermatoloji',
  can_manage_patient_profiles: true,
  can_view_clinical_records: true,
  can_write_clinical_notes: true,
  permitted_branch_ids: ['cccc3333-c3c3-43c3-83c3-cccccccccccc'],
};

export async function runClinicWorkspacePageTests(): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), 'node_modules', '.lari-clinic-page-test-'));
  const entryTsxPath = path.join(tempDir, 'entry.tsx');
  const outMjsPath = path.join(tempDir, 'bundle.mjs');

  fs.writeFileSync(
    entryTsxPath,
    `export { ClinicWorkspacePage } from ${JSON.stringify(path.join(process.cwd(), 'pages', 'clinic', 'ClinicWorkspacePage.tsx'))};`,
    'utf8'
  );

  try {
    await esbuild.build({
      entryPoints: [entryTsxPath],
      bundle: true,
      packages: 'external',
      format: 'esm',
      outfile: outMjsPath,
      define: {
        'import.meta.env': 'globalThis.__LARI_TEST_ENV__',
      },
      plugins: [
        {
          name: 'mock-auth-context',
          setup(build) {
            build.onResolve({ filter: /contexts\/AuthContext/ }, () => ({
              path: 'virtual-auth-context',
              namespace: 'virtual-auth-ns',
            }));
            build.onLoad({ filter: /.*/, namespace: 'virtual-auth-ns' }, () => ({
              resolveDir: process.cwd(),
              contents: `
                export const useAuth = () => ({
                  currentUser: globalThis.__LARI_TEST_USER__ ?? null,
                });
              `,
              loader: 'js',
            }));
          },
        },
      ],
    });

    (globalThis as any).__LARI_TEST_ENV__ = {
      VITE_DATA_MODE: 'supabase_staging',
      VITE_SUPABASE_URL: 'https://example-project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-placeholder-for-unit-test',
    };

    const { ClinicWorkspacePage } = await import(pathToFileURL(outMjsPath).href);

    // 1. Negative: super_admin must be blocked from accessing clinical PHI workspace
    (globalThis as any).__LARI_TEST_USER__ = { id: 'sa-1', role: 'super_admin', name: 'Super Admin' };
    const superAdminHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ClinicWorkspacePage, {
        initialContextResult: { success: true, data: SYNTH_CLINIC_CTX },
      })
    );
    assert.ok(superAdminHtml.includes('Yetkisiz Erişim'));
    assert.ok(!superAdminHtml.includes('data-testid="clinic-regulatory-hold-banner"'));

    // 2. Negative: UNAVAILABLE (local/mock mode) fails closed
    (globalThis as any).__LARI_TEST_USER__ = { id: 'st-1', role: 'staff', name: 'Dr. Sentetik' };
    const unavailableHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ClinicWorkspacePage, {
        initialContextResult: { success: false, error: { code: 'UNAVAILABLE', message: 'Local mode blocked' } },
      })
    );
    assert.ok(unavailableHtml.includes('Klinik Servisi Kullanılamıyor'));

    // 3. Negative: unconfigured regular staff sees not_configured (never setup_only)
    const notConfiguredHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ClinicWorkspacePage, {
        initialContextResult: {
          success: false,
          reason_code: 'no_clinic_profile',
          error: { code: 'FORBIDDEN', message: 'No profile' },
        },
      })
    );
    assert.ok(notConfiguredHtml.includes('Klinik Erişimi Tanımlanmadı'));

    // 4. Positive: authorized practitioner renders EXTERNAL_HOLD regulatory banner & NO_GO classification
    const readyHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ClinicWorkspacePage, {
        initialContextResult: { success: true, data: SYNTH_CLINIC_CTX },
      })
    );
    assert.ok(readyHtml.includes('data-testid="clinic-regulatory-hold-banner"'));
    assert.ok(readyHtml.includes('EXTERNAL_HOLD'));
    assert.ok(readyHtml.includes('NO_GO'));
    assert.ok(readyHtml.includes('Klinik Operasyonlar'));

    console.log('[PASS] ClinicWorkspacePage tests verified');
  } finally {
    delete (globalThis as any).__LARI_TEST_ENV__;
    delete (globalThis as any).__LARI_TEST_USER__;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

await runClinicWorkspacePageTests();
