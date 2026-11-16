import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import type { HtLead } from '../../types/healthTourism.ts';

const SYNTH_LEAD: HtLead = {
  id: '11111111-1111-4111-8111-111111111111',
  tenant_id: 'aaaa1111-a1a1-41a1-81a1-aaaaaaaaaaaa',
  status: 'handoff_pending',
  source_channel: 'web',
  referring_agency_id: null,
  preferred_language: 'en',
  country_code: 'GB',
  full_name: 'Sentetik Lead Adayı',
  email: 'synth.lead@example.test',
  phone: '+447700900111',
  handoff_state: 'requested',
  lead_score: 75,
  lead_score_band: 'hot',
  last_activity_at: '2026-11-16T10:00:00Z',
  created_at: '2026-11-16T10:00:00Z',
  updated_at: '2026-11-16T10:00:00Z',
};

export async function runHtCoordinatorWorkspacePageTests(): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), 'node_modules', '.lari-ht-page-test-'));
  const entryTsxPath = path.join(tempDir, 'entry.tsx');
  const outMjsPath = path.join(tempDir, 'bundle.mjs');

  fs.writeFileSync(
    entryTsxPath,
    `export { HtCoordinatorWorkspacePage } from ${JSON.stringify(path.join(process.cwd(), 'pages', 'health-tourism', 'HtCoordinatorWorkspacePage.tsx'))};`,
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

    const { HtCoordinatorWorkspacePage } = await import(pathToFileURL(outMjsPath).href);

    // 1. Negative: local mode fails closed and never renders lead list
    (globalThis as any).__LARI_TEST_USER__ = { id: 'ht-coord-1', role: 'staff', name: 'HT Coord' };
    const localHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(HtCoordinatorWorkspacePage, {
        modeOverride: 'local',
        initialAuthState: { authorized: true, canManage: true, leads: [SYNTH_LEAD], totalLeads: 1 },
      })
    );
    assert.ok(localHtml.includes('Sunucu Modu Gerekli'));
    assert.ok(!localHtml.includes('Sentetik Lead Adayı'));

    // 2. Negative: unauthenticated caller blocked
    (globalThis as any).__LARI_TEST_USER__ = null;
    const unauthHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(HtCoordinatorWorkspacePage, {
        modeOverride: 'supabase',
        initialAuthState: { authorized: false, canManage: false },
      })
    );
    assert.ok(unauthHtml.includes('Oturum Gerekli'));

    // 3. Negative: unauthorized staff blocked
    (globalThis as any).__LARI_TEST_USER__ = { id: 'ht-staff-denied', role: 'staff', name: 'Denied Staff' };
    const deniedHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(HtCoordinatorWorkspacePage, {
        modeOverride: 'supabase',
        initialAuthState: { authorized: false, canManage: false, errorMsg: 'Yetkisiz HT erişimi' },
      })
    );
    assert.ok(deniedHtml.includes('Erişim Hatası'));
    assert.ok(deniedHtml.includes('Yetkisiz HT erişimi'));

    // 4. Positive: authorized coordinator renders EXTERNAL_HOLD regulatory banner + NO_GO + synthetic lead without passport fields
    (globalThis as any).__LARI_TEST_USER__ = { id: 'ht-coord-1', role: 'staff', name: 'HT Coord' };
    const okHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(HtCoordinatorWorkspacePage, {
        modeOverride: 'supabase',
        initialAuthState: { authorized: true, canManage: true, leads: [SYNTH_LEAD], totalLeads: 1 },
      })
    );
    assert.ok(okHtml.includes('data-testid="ht-regulatory-hold-banner"'));
    assert.ok(okHtml.includes('EXTERNAL_HOLD'));
    assert.ok(okHtml.includes('NO_GO'));
    assert.ok(okHtml.includes('Sentetik Lead Adayı'));
    assert.ok(!okHtml.includes('passport_number'));

    console.log('[PASS] HtCoordinatorWorkspacePage tests verified');
  } finally {
    delete (globalThis as any).__LARI_TEST_ENV__;
    delete (globalThis as any).__LARI_TEST_USER__;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

await runHtCoordinatorWorkspacePageTests();
