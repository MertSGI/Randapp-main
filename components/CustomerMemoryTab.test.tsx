import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

function installMinimalDomShims(): void {
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
      location: { search: '', hostname: 'localhost', pathname: '/admin/customers', hash: '' },
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

export async function runCustomerMemoryTabTests(): Promise<void> {
  installMinimalDomShims();

  const tempDir = fs.mkdtempSync(path.join(process.cwd(), 'node_modules', '.lari-customer-memory-test-'));
  const entryTsxPath = path.join(tempDir, 'entry.tsx');
  const outMjsPath = path.join(tempDir, 'bundle.mjs');

  fs.writeFileSync(
    entryTsxPath,
    `
    export { default as CustomerMemoryTab } from ${JSON.stringify(path.join(process.cwd(), 'components', 'CustomerMemoryTab.tsx'))};
    export { LanguageProvider } from ${JSON.stringify(path.join(process.cwd(), 'contexts', 'LanguageContext.tsx'))};
    export { DialogProvider } from ${JSON.stringify(path.join(process.cwd(), 'contexts', 'DialogContext.tsx'))};
    `,
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
          name: 'mock-tenant-context',
          setup(build) {
            build.onResolve({ filter: /contexts\/TenantContext/ }, () => ({
              path: 'virtual-tenant-context',
              namespace: 'virtual-tenant-ns',
            }));
            build.onLoad({ filter: /.*/, namespace: 'virtual-tenant-ns' }, () => ({
              resolveDir: process.cwd(),
              contents: `
                import React from 'react';
                export const TenantProvider = ({ children }) => React.createElement(React.Fragment, null, children);
                export const useTenant = () => ({
                  tenant: globalThis.__LARI_TEST_TENANT__ ?? null,
                  branding: null,
                  isLoadingTenant: false,
                  tenantStatus: 'active',
                  refreshTenant: async () => {},
                });
              `,
              loader: 'js',
            }));
          },
        },
      ],
    });

    const { CustomerMemoryTab, LanguageProvider, DialogProvider } = await import(
      pathToFileURL(outMjsPath).href
    );

    const renderTab = (modeOverride: 'supabase' | 'local') =>
      ReactDOMServer.renderToStaticMarkup(
        React.createElement(
          LanguageProvider,
          null,
          React.createElement(
            DialogProvider,
            null,
            React.createElement(CustomerMemoryTab, {
              appointments: [],
              staffList: [],
              servicesList: [],
              modeOverride,
            })
          )
        )
      );

    // 1. Starter (baslangic) plan in local mode fails closed with upgrade prompt
    (globalThis as any).__LARI_TEST_ENV__ = { VITE_DATA_MODE: 'local' };
    (globalThis as any).__LARI_TEST_TENANT__ = {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'baslangic-salon',
      name: 'Baslangic Salon',
      planId: 'baslangic',
      status: 'active',
    };
    const starterHtml = renderTab('local');
    assert.ok(
      starterHtml.includes('Bu özellik mevcut paketinizde yer almıyor'),
      'baslangic plan must fail closed on CustomerMemoryTab'
    );

    // 2. Professional plan in local mode renders authority badge as Yerel Simülasyon / Demo + EXTERNAL_HOLD banner
    (globalThis as any).__LARI_TEST_TENANT__ = {
      id: '22222222-2222-4222-8222-222222222222',
      slug: 'pro-salon',
      name: 'Pro Salon',
      planId: 'professional',
      status: 'active',
    };
    const proLocalHtml = renderTab('local');
    assert.ok(
      proLocalHtml.includes('data-testid="customer360-authority-badge"'),
      'professional plan in local mode must render customer360 authority badge'
    );
    assert.ok(
      proLocalHtml.includes('Yerel Simülasyon / Demo'),
      'local mode must display Yerel Simülasyon / Demo authority badge'
    );
    assert.ok(
      proLocalHtml.includes('EXTERNAL_HOLD (Canlı Tahsilat &amp; Gönderim Kapalı)'),
      'CustomerMemoryTab must display explicit EXTERNAL_HOLD notice for live charge and dispatch'
    );

    // 3. In supabase mode initial SSR render (before async canTenantUseFeature completes) must fail closed
    (globalThis as any).__LARI_TEST_ENV__ = {
      VITE_DATA_MODE: 'supabase_staging',
      VITE_SUPABASE_URL: 'https://example-project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-placeholder-for-unit-test',
    };
    const supaFailClosedBeforeAsyncHtml = renderTab('supabase');
    assert.ok(
      supaFailClosedBeforeAsyncHtml.includes('Bu özellik mevcut paketinizde yer almıyor'),
      'supabase mode must fail closed until async server entitlement check resolves'
    );

    console.log('[PASS] CustomerMemoryTab tests verified');
  } finally {
    delete (globalThis as any).__LARI_TEST_ENV__;
    delete (globalThis as any).__LARI_TEST_TENANT__;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

await runCustomerMemoryTabTests();
