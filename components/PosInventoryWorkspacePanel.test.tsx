import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { PosInventoryWorkspacePanel } from './PosInventoryWorkspacePanel.tsx';

function installMinimalDomShims() {
  const storage = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null),
    setItem: (k: string, v: string) => {
      storage.set(k, String(v));
    },
    removeItem: (k: string) => {
      storage.delete(k);
    },
    clear: () => storage.clear(),
  };
  if (typeof (globalThis as any).localStorage === 'undefined') {
    (globalThis as any).localStorage = mockLocalStorage;
  }
  if (typeof (globalThis as any).window === 'undefined') {
    (globalThis as any).window = {
      location: { search: '', hostname: 'localhost', pathname: '/admin/pos', hash: '' },
      localStorage: mockLocalStorage,
      addEventListener: () => {},
      removeEventListener: () => {},
      open: () => null,
    };
  }
  if (typeof (globalThis as any).document === 'undefined') {
    (globalThis as any).document = { documentElement: { lang: 'tr' } };
  }
}

export async function runPosInventoryWorkspacePanelTests(): Promise<void> {
  installMinimalDomShims();

  // 1. Direct PosInventoryWorkspacePanel render in supabase mode
  const supabasePanelHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(PosInventoryWorkspacePanel, {
      modeOverride: 'supabase',
      branchName: 'Nişantaşı Şube',
    })
  );
  assert.ok(
    supabasePanelHtml.includes('POS, Ürün Envanteri, Tedarik &amp; Personel Prim-Bahşiş'),
    'Supabase panel must render canonical title'
  );
  assert.ok(
    supabasePanelHtml.includes('DB Yetkili (Supabase RPC)'),
    'Supabase mode must render DB_AUTHORITATIVE badge'
  );
  assert.ok(
    supabasePanelHtml.includes('EXTERNAL_HOLD (Canlı Kapalı)'),
    'Supabase mode must explicitly label EXTERNAL_HOLD capabilities'
  );
  assert.ok(supabasePanelHtml.includes('Nişantaşı Şube'), 'Branch name must be rendered');

  // 2. Direct PosInventoryWorkspacePanel render in local simulation mode
  const localPanelHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(PosInventoryWorkspacePanel, {
      modeOverride: 'local',
      branchName: 'Merkez Şube',
    })
  );
  assert.ok(
    localPanelHtml.includes('POS, Ürün Envanteri, Tedarik &amp; Personel Prim-Bahşiş'),
    'Local panel must render canonical title'
  );
  assert.ok(
    localPanelHtml.includes('Yerel Simülasyon / Demo'),
    'Local mode must render LOCAL_SIMULATION badge'
  );
  assert.ok(
    localPanelHtml.includes('EXTERNAL_HOLD (Canlı Kapalı)'),
    'Local mode must explicitly label EXTERNAL_HOLD capabilities'
  );

  // 3. Real AdminPage route render (/admin/pos and /admin) via esbuild with dynamic import.meta.env
  const rootDir = process.cwd();
  const tempBundleDir = fs.mkdtempSync(path.join(rootDir, 'node_modules', '.lari-pos-ui-test-'));
  const entryTsxPath = path.join(tempBundleDir, 'entry.tsx');
  const outMjsPath = path.join(tempBundleDir, 'bundle.mjs');

  fs.writeFileSync(
    entryTsxPath,
    `
    export { default as AdminPage } from ${JSON.stringify(path.join(rootDir, 'pages', 'AdminPage.tsx'))};
    export { LanguageProvider } from ${JSON.stringify(path.join(rootDir, 'contexts', 'LanguageContext.tsx'))};
    export { DialogProvider } from ${JSON.stringify(path.join(rootDir, 'contexts', 'DialogContext.tsx'))};
    export { TenantProvider } from ${JSON.stringify(path.join(rootDir, 'contexts', 'TenantContext.tsx'))};
    export { AuthProvider } from ${JSON.stringify(path.join(rootDir, 'contexts', 'AuthContext.tsx'))};
    `
  );

  try {
    (globalThis as any).__LARI_TEST_ENV__ = { VITE_DATA_MODE: 'local' };

    esbuild.buildSync({
      entryPoints: [entryTsxPath],
      bundle: true,
      packages: 'external',
      format: 'esm',
      outfile: outMjsPath,
      define: {
        'import.meta.env': 'globalThis.__LARI_TEST_ENV__',
      },
    });

    const { AdminPage, LanguageProvider, DialogProvider, TenantProvider, AuthProvider } = await import(
      pathToFileURL(outMjsPath).href
    );

    const renderAdminRoute = (initialPath: string) =>
      ReactDOMServer.renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { initialEntries: [initialPath] },
          React.createElement(
            LanguageProvider,
            null,
            React.createElement(
              DialogProvider,
              null,
              React.createElement(
                TenantProvider,
                null,
                React.createElement(AuthProvider, null, React.createElement(AdminPage))
              )
            )
          )
        )
      );

    // 3a. Local mode on /admin/pos
    (globalThis as any).__LARI_TEST_ENV__ = { VITE_DATA_MODE: 'local' };
    const adminPosLocalHtml = renderAdminRoute('/admin/pos');
    assert.ok(
      adminPosLocalHtml.includes('POS &amp; Envanter'),
      'AdminPage navigation must expose POS & Envanter tab'
    );
    assert.ok(
      adminPosLocalHtml.includes('POS, Ürün Envanteri, Tedarik &amp; Personel Prim-Bahşiş'),
      '/admin/pos route must render PosInventoryWorkspacePanel heading'
    );
    assert.ok(
      adminPosLocalHtml.includes('Yerel Simülasyon / Demo'),
      '/admin/pos in local mode must render local authority badge'
    );

    // 3b. Supabase mode on /admin/pos
    (globalThis as any).__LARI_TEST_ENV__ = {
      VITE_DATA_MODE: 'supabase_staging',
      VITE_SUPABASE_URL: 'https://example-project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-placeholder-for-unit-test',
    };
    const adminPosSupabaseHtml = renderAdminRoute('/admin/pos');
    assert.ok(
      adminPosSupabaseHtml.includes('POS, Ürün Envanteri, Tedarik &amp; Personel Prim-Bahşiş'),
      '/admin/pos route in supabase mode must render PosInventoryWorkspacePanel heading'
    );
    assert.ok(
      adminPosSupabaseHtml.includes('DB Yetkili (Supabase RPC)'),
      '/admin/pos in supabase mode must render DB_AUTHORITATIVE authority badge'
    );
    assert.ok(
      adminPosSupabaseHtml.includes('EXTERNAL_HOLD (Canlı Kapalı)'),
      '/admin/pos in supabase mode must render EXTERNAL_HOLD boundary badge'
    );

    // 3c. Default /admin route renders dashboard and keeps POS panel scoped to its tab
    const adminDashboardHtml = renderAdminRoute('/admin');
    assert.ok(
      adminDashboardHtml.includes('POS &amp; Envanter'),
      '/admin dashboard must show POS & Envanter navigation tab'
    );
    assert.ok(
      !adminDashboardHtml.includes('Yetki &amp; Gerçek/Demo Sınırı Matrisi'),
      '/admin dashboard should not mount POS workspace panel outside pos tab'
    );
  } finally {
    delete (globalThis as any).__LARI_TEST_ENV__;
    try {
      fs.rmSync(tempBundleDir, { recursive: true, force: true });
    } catch {}
  }
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('PosInventoryWorkspacePanel.test.tsx');

if (isDirectExecution) {
  await runPosInventoryWorkspacePanelTests();
  console.log('[PASS] PosInventoryWorkspacePanel.test.tsx');
  process.exit(0);
}
