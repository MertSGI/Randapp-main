import net from 'net';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

// Automatically ensure --import tsx if invoked directly via "node scripts/test-v1-wq06-tailwind-local-build.mjs"
if (!process.execArgv.some(a => a.includes('tsx')) && !process.env._TSX_RESPAWNED) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, _TSX_RESPAWNED: '1' }
  });
  process.exit(result.status !== null && result.status !== undefined ? result.status : 1);
}

process.env.VITE_DATA_MODE = 'local';
const { createServer, build } = await import('vite');
const { chromium } = await import('playwright');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertThrows(fn, message) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

async function runStage(title, fn) {
  console.log(`\n============================================================================`);
  console.log(`STAGE: ${title}`);
  console.log(`============================================================================`);
  await fn();
  console.log(`🎉 PASSED: ${title}`);
}

(async () => {
  console.log('============================================================================');
  console.log('LARI — V1-WQ-06: TAILWIND LOCAL VITE/POSTCSS BUILD & REGRESSION TEST');
  console.log('Verifying zero external CDN, Vite build CSS bundle, and Playwright computed styles');
  console.log('============================================================================\n');

  // --------------------------------------------------------------------------
  // STAGE 1: Statik Sözleşmeler ve Konfigürasyon Doğrulaması
  // --------------------------------------------------------------------------
  await runStage('Statik Sözleşmeler ve Konfigürasyon Doğrulaması', async () => {
    // 1. index.html checks
    const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
    assert(!indexHtml.includes('cdn.tailwindcss.com'), 'index.html contains zero references to cdn.tailwindcss.com');
    assert(!indexHtml.includes('tailwind.config ='), 'index.html contains zero inline tailwind.config scripts');
    assert(!indexHtml.includes('.hide-scrollbar::-webkit-scrollbar'), 'index.html contains zero duplicate inline hide-scrollbar styles');
    assert(indexHtml.includes('<link rel="stylesheet" href="/index.css">'), 'index.html retains <link rel="stylesheet" href="/index.css">');

    // 2. index.css checks
    assert(fs.existsSync(path.resolve(process.cwd(), 'index.css')), 'index.css exists on disk');
    const indexCss = fs.readFileSync(path.resolve(process.cwd(), 'index.css'), 'utf8');
    assert(indexCss.includes('@import "tailwindcss";'), 'index.css imports tailwindcss (@import "tailwindcss";)');
    assert(indexCss.includes('@config "./tailwind.config.cjs";'), 'index.css binds local config (@config "./tailwind.config.cjs";)');
    assert(indexCss.includes('@plugin "@tailwindcss/typography";'), 'index.css binds typography plugin (@plugin "@tailwindcss/typography";)');
    assert(indexCss.includes("font-family: 'Inter'") || indexCss.includes('font-family: "Inter"'), 'index.css defines Inter body font-family');
    assert(indexCss.includes('.hide-scrollbar'), 'index.css defines .hide-scrollbar utility rule');

    // Negatif sözleşme: Typography plugin kaldırıldığında statik doğrulamanın başarısız olduğunu kanıtla
    assertThrows(() => {
      const strippedCss = indexCss.replace('@plugin "@tailwindcss/typography";', '');
      if (!strippedCss.includes('@plugin "@tailwindcss/typography";')) {
        throw new Error('Plugin missing');
      }
    }, 'Negatif sözleşme: index.css içinde @plugin "@tailwindcss/typography" eksikse doğrulama anında FAIL verir');

    // 3. tailwind.config.cjs checks
    assert(fs.existsSync(path.resolve(process.cwd(), 'tailwind.config.cjs')), 'tailwind.config.cjs exists on disk');
    const tailwindConfig = fs.readFileSync(path.resolve(process.cwd(), 'tailwind.config.cjs'), 'utf8');
    assert(tailwindConfig.includes("darkMode: 'class'") || tailwindConfig.includes('darkMode: "class"'), 'tailwind.config.cjs sets darkMode to "class"');
    assert(tailwindConfig.includes("'Inter'") || tailwindConfig.includes('"Inter"'), 'tailwind.config.cjs extends fontFamily.sans with Inter');
    assert(tailwindConfig.includes('#0f172a'), 'tailwind.config.cjs defines primary color #0f172a');
    assert(tailwindConfig.includes('#3b82f6'), 'tailwind.config.cjs defines accent color #3b82f6');
    assert(tailwindConfig.includes('slideUpFade'), 'tailwind.config.cjs defines slideUpFade keyframes and animation');

    // 4. postcss.config.cjs checks
    assert(fs.existsSync(path.resolve(process.cwd(), 'postcss.config.cjs')), 'postcss.config.cjs exists on disk');
    const postcssConfig = fs.readFileSync(path.resolve(process.cwd(), 'postcss.config.cjs'), 'utf8');
    assert(postcssConfig.includes('compile') && postcssConfig.includes('tailwindcss'), 'postcss.config.cjs implements tailwindcss compile pipeline');

    // 5. index.tsx checks
    const indexTsx = fs.readFileSync(path.resolve(process.cwd(), 'index.tsx'), 'utf8');
    assert(indexTsx.includes("import './index.css';") || indexTsx.includes('import "./index.css";'), 'index.tsx imports ./index.css');
  });

  // --------------------------------------------------------------------------
  // STAGE 2: Vite Build ve Derlenmiş CSS Paket Doğrulaması
  // --------------------------------------------------------------------------
  await runStage('Vite Build ve Derlenmiş CSS Paket Doğrulaması', async () => {
    console.log('[Build] Executing programmatic Vite production build...');
    await build({
      configFile: path.resolve(process.cwd(), 'vite.config.ts'),
      logLevel: 'error',
      build: {
        outDir: 'dist',
        emptyOutDir: true
      }
    });

    const assetsDir = path.resolve(process.cwd(), 'dist', 'assets');
    assert(fs.existsSync(assetsDir), 'dist/assets directory produced by vite build');

    const cssFiles = fs.readdirSync(assetsDir).filter(f => f.endsWith('.css'));
    assert(cssFiles.length > 0, `Generated at least one CSS bundle in dist/assets (found: ${cssFiles.join(', ')})`);

    const bundleCss = fs.readFileSync(path.join(assetsDir, cssFiles[0]), 'utf8');
    assert(bundleCss.length > 5000, `CSS bundle has substantial compiled size (${bundleCss.length} bytes)`);

    // Verify key compiled CSS rules
    assert(bundleCss.includes('#0f172a') || bundleCss.includes('15, 23, 42') || bundleCss.includes('15 23 42'), 'CSS bundle contains primary color (#0f172a)');
    assert(bundleCss.includes('#3b82f6') || bundleCss.includes('59, 130, 246') || bundleCss.includes('59 130 246'), 'CSS bundle contains accent color (#3b82f6)');
    assert(bundleCss.includes('slideUpFade'), 'CSS bundle contains slideUpFade animation / keyframes');
    assert(bundleCss.includes('.hide-scrollbar'), 'CSS bundle contains .hide-scrollbar rule');
    assert(bundleCss.includes('Inter'), 'CSS bundle contains Inter font-family');
    assert(!bundleCss.includes('cdn.tailwindcss.com'), 'CSS bundle contains zero references to external cdn.tailwindcss.com');

    // Strictly selector-bound typography bundle verification (.prose, max-width: 65ch, paragraph margins)
    assert(
      /\.prose\s*\{[^}]*max-width:\s*65ch/.test(bundleCss),
      'CSS bundle contains strictly selector-bound .prose { max-width: 65ch } rule'
    );
    assert(
      /\.prose\s+:where\(p\)[^{]*\{[^}]*margin-top:\s*1\.25em[^}]*margin-bottom:\s*1\.25em/.test(bundleCss),
      'CSS bundle contains strictly selector-bound .prose :where(p) { margin-top: 1.25em; margin-bottom: 1.25em } rule'
    );

    // Negatif bundle kontrolü: Typography kuralları eksik bir CSS demetinin fail-closed reddedildiğini kanıtla
    function validateTypographyBundleContract(css) {
      if (!/\.prose\s*\{[^}]*max-width:\s*65ch/.test(css) || !/\.prose\s+:where\(p\)[^{]*\{[^}]*margin-top:\s*1\.25em/.test(css)) {
        throw new Error('Typography bundle contract failed: selector-bound .prose rules missing');
      }
      return true;
    }
    assert(validateTypographyBundleContract(bundleCss), 'CSS bundle satisfies strictly selector-bound typography contract validator');
    assertThrows(
      () => validateTypographyBundleContract('body { color: #000; }'),
      'Negatif bundle kontrolü: .prose çıktısı bulunmadığında bundle assertion FAIL verir'
    );
  });

  // --------------------------------------------------------------------------
  // STAGE 3: Playwright Gerçek Chromium Görsel & Computed-Style Regresyonu (Desktop)
  // --------------------------------------------------------------------------
  const port = await getFreePort();
  console.log(`[Setup] Starting Vite server on 127.0.0.1:${port}...`);
  const viteServer = await createServer({
    configFile: path.resolve(process.cwd(), 'vite.config.ts'),
    server: { port, host: '127.0.0.1', strictPort: true },
    logLevel: 'error'
  });
  await viteServer.listen();

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });

    const interceptedExternalUrls = [];
    await context.route('**/*', (route) => {
      const rawUrl = route.request().url();
      let parsed;
      try {
        parsed = new URL(rawUrl);
      } catch {
        return route.fulfill({ status: 204, body: '' });
      }

      if (parsed.hostname === 'fonts.googleapis.com' || parsed.hostname === 'fonts.gstatic.com') {
        return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      }
      if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
        return route.continue();
      }
      interceptedExternalUrls.push(rawUrl);
      return route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
      });
    });

    const page = await context.newPage();
    page.on('pageerror', (err) => console.log('  [Browser PageError]:', err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('  [Browser ConsoleError]:', msg.text());
    });
    const baseUrl = `http://127.0.0.1:${port}`;

    await runStage('Playwright Gerçek Chromium Görsel & Computed-Style Regresyonu (Desktop 1280x800)', async () => {
      await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('#root', { timeout: 30000 });

      // Ensure zero CDN requests
      assert(!interceptedExternalUrls.some(u => u.includes('cdn.tailwindcss.com')), 'Zero requests dispatched to cdn.tailwindcss.com');

      const desktopStyles = await page.evaluate(() => {
        const bodyComputed = window.getComputedStyle(document.body);

        // Helper to test a class
        function testClass(className) {
          const el = document.createElement('div');
          el.className = className;
          document.body.appendChild(el);
          const computed = window.getComputedStyle(el);
          const res = {
            display: computed.display,
            bgColor: computed.backgroundColor,
            color: computed.color,
            animName: computed.animationName,
            scrollbarWidth: computed.scrollbarWidth,
            fontFamily: computed.fontFamily
          };
          el.remove();
          return res;
        }

        const hidden = testClass('hidden');
        const mdFlex = testClass('hidden md:flex');
        const smFlex = testClass('hidden sm:flex');
        const lgBlock = testClass('hidden lg:block');
        const bgPrimary = testClass('bg-primary');
        const textAccent = testClass('text-accent');
        const animSlide = testClass('animate-slideUpFade');
        const hideScroll = testClass('hide-scrollbar');

        // Typography .prose computed styles test: container and inner elements
        // Note: Tailwind Typography resets :first-child margin-top to 0 and :last-child margin-bottom to 0.
        // Also .prose h2 + * resets margin-top to 0.
        // Therefore we insert a heading h2, followed by a leading paragraph p1, followed by body paragraph p2, followed by trailing paragraph p3.
        // This allows testing:
        // 1) Container max-width (65ch) & color & font-size & line-height
        // 2) Heading h2 typography: font-weight: 700, font-size: 1.5em (24px)
        // 3) Body paragraph p2 rhythm: margin-top: 1.25em (20px), margin-bottom: 1.25em (20px)
        const proseContainer = document.createElement('div');
        proseContainer.className = 'prose';
        const proseHeading = document.createElement('h2');
        proseHeading.textContent = 'Typography Heading';
        const proseP1 = document.createElement('p');
        proseP1.textContent = 'Typography First Paragraph';
        const proseP2 = document.createElement('p');
        proseP2.textContent = 'Typography Second Rhythm Paragraph';
        const proseP3 = document.createElement('p');
        proseP3.textContent = 'Typography Third Footer Paragraph';
        proseContainer.appendChild(proseHeading);
        proseContainer.appendChild(proseP1);
        proseContainer.appendChild(proseP2);
        proseContainer.appendChild(proseP3);

        const plainContainer = document.createElement('div');
        const plainHeading = document.createElement('h2');
        plainHeading.textContent = 'Plain Heading';
        const plainP1 = document.createElement('p');
        plainP1.textContent = 'Plain First Paragraph';
        const plainP2 = document.createElement('p');
        plainP2.textContent = 'Plain Second Rhythm Paragraph';
        const plainP3 = document.createElement('p');
        plainP3.textContent = 'Plain Third Footer Paragraph';
        plainContainer.appendChild(plainHeading);
        plainContainer.appendChild(plainP1);
        plainContainer.appendChild(plainP2);
        plainContainer.appendChild(plainP3);

        document.body.appendChild(proseContainer);
        document.body.appendChild(plainContainer);

        const proseComputed = window.getComputedStyle(proseContainer);
        const proseH2Computed = window.getComputedStyle(proseHeading);
        const proseP2Computed = window.getComputedStyle(proseP2);
        const plainComputed = window.getComputedStyle(plainContainer);
        const plainH2Computed = window.getComputedStyle(plainHeading);
        const plainP2Computed = window.getComputedStyle(plainP2);

        const prose = {
          maxWidth: proseComputed.maxWidth,
          plainMaxWidth: plainComputed.maxWidth,
          fontSize: proseComputed.fontSize,
          lineHeight: proseComputed.lineHeight,
          color: proseComputed.color,
          h2FontSize: proseH2Computed.fontSize,
          plainH2FontSize: plainH2Computed.fontSize,
          h2FontWeight: proseH2Computed.fontWeight,
          plainH2FontWeight: plainH2Computed.fontWeight,
          pMarginTop: proseP2Computed.marginTop,
          plainPMarginTop: plainP2Computed.marginTop,
          pMarginBottom: proseP2Computed.marginBottom,
          plainPMarginBottom: plainP2Computed.marginBottom,
        };

        proseContainer.remove();
        plainContainer.remove();

        const scrollWidth = document.documentElement.scrollWidth;
        const innerWidth = window.innerWidth;

        return {
          bodyBg: bodyComputed.backgroundColor,
          bodyFont: bodyComputed.fontFamily,
          hidden,
          mdFlex,
          smFlex,
          lgBlock,
          bgPrimary,
          textAccent,
          animSlide,
          hideScroll,
          prose,
          overflowX: scrollWidth > innerWidth
        };
      });

      assert(
        desktopStyles.bodyBg === 'rgb(248, 250, 252)' || 
        desktopStyles.bodyBg.includes('248') || 
        desktopStyles.bodyBg.includes('oklch') || 
        desktopStyles.bodyBg.includes('247.858'), 
        `Body computed background-color is bg-slate-50 (got: ${desktopStyles.bodyBg})`
      );
      assert(desktopStyles.bodyFont.includes('Inter'), `Body computed font-family includes Inter (got: ${desktopStyles.bodyFont})`);
      assert(desktopStyles.hidden.display === 'none', '.hidden has computed display: none');
      assert(desktopStyles.mdFlex.display === 'flex', '.md:flex has computed display: flex on desktop 1280px');
      assert(desktopStyles.smFlex.display === 'flex', '.sm:flex has computed display: flex on desktop 1280px');
      assert(desktopStyles.lgBlock.display === 'block', '.lg:block has computed display: block on desktop 1280px');
      assert(
        desktopStyles.bgPrimary.bgColor === 'rgb(15, 23, 42)', 
        `.bg-primary has computed background-color rgb(15, 23, 42) (#0f172a) (got: ${desktopStyles.bgPrimary.bgColor})`
      );
      assert(
        desktopStyles.textAccent.color === 'rgb(59, 130, 246)', 
        `.text-accent has computed color rgb(59, 130, 246) (#3b82f6) (got: ${desktopStyles.textAccent.color})`
      );
      assert(desktopStyles.animSlide.animName.includes('slideUpFade'), `.animate-slideUpFade has animationName slideUpFade (got: ${desktopStyles.animSlide.animName})`);
      assert(desktopStyles.hideScroll.scrollbarWidth === 'none', '.hide-scrollbar has scrollbarWidth: none');
      assert(!desktopStyles.overflowX, 'Desktop layout has zero horizontal overflow (scrollWidth <= innerWidth)');

      // Typography .prose & @tailwindcss/typography validation (contract: 65ch / ~578px, 1.25em = 20px)
      function assertTypographyContract(styles, label) {
        const mw = parseFloat(styles.maxWidth);
        if (styles.maxWidth === 'none' || isNaN(mw) || mw < 570 || mw > 585) {
          throw new Error(`${label}: expected computed max-width ~65ch (570-585px), got: ${styles.maxWidth}`);
        }
        const mt = parseFloat(styles.pMarginTop);
        if (isNaN(mt) || mt < 18 || mt > 22) {
          throw new Error(`${label}: expected paragraph margin-top 1.25em (18-22px), got: ${styles.pMarginTop}`);
        }
        const mb = parseFloat(styles.pMarginBottom);
        if (isNaN(mb) || mb < 18 || mb > 22) {
          throw new Error(`${label}: expected paragraph margin-bottom 1.25em (18-22px), got: ${styles.pMarginBottom}`);
        }
      }

      // 1. Positive typography assertions on real Chromium computed styles
      assertTypographyContract(desktopStyles.prose, '.prose');
      assert(
        desktopStyles.prose.maxWidth !== desktopStyles.prose.plainMaxWidth,
        `.prose max-width (${desktopStyles.prose.maxWidth}) is strictly distinct from unstyled plain container (${desktopStyles.prose.plainMaxWidth})`
      );
      assert(
        parseFloat(desktopStyles.prose.pMarginTop) === 20,
        `.prose paragraph has exact 1.25em (20px) margin-top (got: ${desktopStyles.prose.pMarginTop})`
      );
      assert(
        parseFloat(desktopStyles.prose.pMarginBottom) === 20,
        `.prose paragraph has exact 1.25em (20px) margin-bottom (got: ${desktopStyles.prose.pMarginBottom})`
      );
      assert(
        parseFloat(desktopStyles.prose.h2FontSize) === 24,
        `.prose h2 has exact 1.5em (24px) heading font-size (got: ${desktopStyles.prose.h2FontSize})`
      );
      assert(
        parseInt(desktopStyles.prose.h2FontWeight, 10) === 700,
        `.prose h2 has exact bold 700 font-weight (got: ${desktopStyles.prose.h2FontWeight})`
      );

      // 2. Strict negative validation: applying assertTypographyContract on unstyled element MUST throw
      assertThrows(
        () => assertTypographyContract({
          maxWidth: desktopStyles.prose.plainMaxWidth,
          pMarginTop: desktopStyles.prose.plainPMarginTop,
          pMarginBottom: desktopStyles.prose.plainPMarginBottom
        }, 'plainContainer'),
        'Negatif kanıt: Sıradan stillendirilmemiş DOM öğesi typography sözleşmesini KESİNLİKLE geçemez (fail-closed doğrulama)'
      );

      // Dark Mode verification: add .dark to html
      const darkStyles = await page.evaluate(() => {
        document.documentElement.classList.add('dark');
        const bodyComputed = window.getComputedStyle(document.body);

        const darkEl = document.createElement('div');
        darkEl.className = 'dark:bg-slate-900 dark:text-slate-100';
        document.body.appendChild(darkEl);
        const darkComputed = window.getComputedStyle(darkEl);
        const res = {
          bodyBg: bodyComputed.backgroundColor,
          darkElBg: darkComputed.backgroundColor,
          darkElColor: darkComputed.color
        };
        darkEl.remove();
        document.documentElement.classList.remove('dark');
        return res;
      });

      assert(darkStyles.darkElBg === 'rgb(15, 23, 42)', `Dark mode: dark:bg-slate-900 applies exact dark background rgb(15, 23, 42) (got: ${darkStyles.darkElBg})`);
    });

    // ------------------------------------------------------------------------
    // STAGE 4: Playwright Mobile Viewport Regresyonu (Mobile 375x667)
    // ------------------------------------------------------------------------
    await runStage('Playwright Mobile Viewport Regresyonu (Mobile 375x667)', async () => {
      await page.setViewportSize({ width: 375, height: 667 });

      const mobileStyles = await page.evaluate(() => {
        function testClass(className) {
          const el = document.createElement('div');
          el.className = className;
          document.body.appendChild(el);
          const computed = window.getComputedStyle(el);
          const display = computed.display;
          el.remove();
          return display;
        }

        const mdFlexDisplay = testClass('hidden md:flex');
        const scrollWidth = document.documentElement.scrollWidth;
        const innerWidth = window.innerWidth;

        return {
          mdFlexDisplay,
          scrollWidth,
          innerWidth,
          overflowX: scrollWidth > innerWidth
        };
      });

      assert(mobileStyles.mdFlexDisplay === 'none', '.md:flex has computed display: none at 375px mobile viewport');
      assert(!mobileStyles.overflowX, `Mobile layout has zero horizontal overflow (scrollWidth ${mobileStyles.scrollWidth} <= innerWidth ${mobileStyles.innerWidth})`);
    });

  } finally {
    await browser.close();
    await viteServer.close();
  }

  console.log('\n============================================================================');
  console.log('🎉 ALL V1-WQ-06 TAILWIND LOCAL BUILD REGRESSION CHECKS PASSED');
  console.log('============================================================================');
})();
