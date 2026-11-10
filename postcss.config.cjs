const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { compile } = require('tailwindcss');

// Deterministic process-level compilation cache keyed by sha256(cssInput + candidates)
const globalCompilationCache = new Map();

function tailwindLocalPlugin(opts = {}) {
  const projectRoot = path.resolve(opts.base || process.cwd());

  function getCandidates() {
    const candidateSet = new Set([
      'bg-slate-50', 'text-slate-900', 'dark:bg-slate-900', 'dark:text-slate-100',
      'transition-colors', 'duration-300',
      'hidden', 'md:flex', 'sm:flex', 'lg:block', 'lg:grid-cols-3', 'sm:hidden', 'md:hidden',
      'hide-scrollbar',
      'prose', 'prose-sm', 'prose-lg', 'prose-slate',
      'bg-primary', 'text-primary', 'border-primary',
      'bg-accent', 'text-accent', 'border-accent',
      'animate-slideUpFade', 'font-sans'
    ]);

    const ignoreDirs = new Set([
      'node_modules', '.git', 'dist', 'coverage', 'scratch',
      '.autodev_logs', 'test-results', 'backups', 'docs', 'hafiza',
      'reports', 'scripts', '.vscode', '.idea', 'cypress', 'playwright-report'
    ]);

    function scanFile(filePath) {
      if (!fs.existsSync(filePath)) return;
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const matches = content.match(/[a-zA-Z0-9_\-:\/\[\]#%(),.]+/g);
        if (matches) {
          for (let token of matches) {
            token = token.replace(/^['"`\s{}]+|['"`\s{}.,;:]+$/g, '');
            if (token && token.length >= 2 && token.length <= 120 && !token.includes('\n') && !token.startsWith('//') && !token.startsWith('/*') && !token.startsWith('http')) {
              candidateSet.add(token);
            }
          }
        }
      } catch (err) {
        if (err && err.code !== 'ENOENT') {
          console.warn('[PostCSS Scanner] File read warning:', filePath, err.message);
        }
      }
    }

    function walk(dir) {
      if (!fs.existsSync(dir)) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (!ignoreDirs.has(entry.name)) {
              walk(path.join(dir, entry.name));
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (ext === '.html' || ext === '.tsx' || ext === '.ts' || ext === '.jsx' || ext === '.js') {
              scanFile(path.join(dir, entry.name));
            }
          }
        }
      } catch (err) {
        if (err && err.code !== 'ENOENT') {
          console.warn('[PostCSS Scanner] Directory read warning:', dir, err.message);
        }
      }
    }

    // Scan root project UI files
    const rootFiles = ['index.html', 'index.tsx', 'App.tsx', 'constants.ts', 'types.ts'];
    for (const rf of rootFiles) {
      scanFile(path.join(projectRoot, rf));
    }

    // Scan core source directories
    const targetSourceDirs = ['components', 'pages', 'contexts', 'services', 'types', 'utils', 'layouts', 'views', 'hooks'];
    for (const subDir of targetSourceDirs) {
      const fullSubDir = path.join(projectRoot, subDir);
      if (fs.existsSync(fullSubDir)) {
        walk(fullSubDir);
      }
    }

    return Array.from(candidateSet).sort();
  }

  const loadStylesheet = async (id, base) => {
    if (id === 'tailwindcss' || id === 'tailwindcss/index.css') {
      const fullPath = path.resolve(projectRoot, 'node_modules/tailwindcss/index.css');
      return {
        path: fullPath,
        base: path.dirname(fullPath),
        content: fs.readFileSync(fullPath, 'utf8'),
      };
    }
    const resolved = path.isAbsolute(id) ? id : path.resolve(base, id);
    if (fs.existsSync(resolved)) {
      return {
        path: resolved,
        base: path.dirname(resolved),
        content: fs.readFileSync(resolved, 'utf8'),
      };
    }
    const nmPath = path.resolve(projectRoot, 'node_modules', id);
    if (fs.existsSync(nmPath)) {
      return {
        path: nmPath,
        base: path.dirname(nmPath),
        content: fs.readFileSync(nmPath, 'utf8'),
      };
    }
    throw new Error(`[postcss-tailwind-local] Unable to resolve stylesheet: ${id} from ${base}`);
  };

  const loadModule = async (id, base, resourceHint) => {
    let resolvedPath;
    if (id.startsWith('.')) {
      resolvedPath = path.resolve(base, id);
    } else {
      try {
        resolvedPath = require.resolve(id, { paths: [base, projectRoot] });
      } catch {
        resolvedPath = path.resolve(projectRoot, 'node_modules', id);
      }
    }

    if (require.cache[resolvedPath]) {
      delete require.cache[resolvedPath];
    }
    const mod = require(resolvedPath);
    return {
      path: resolvedPath,
      base: path.dirname(resolvedPath),
      module: mod.default || mod,
    };
  };

  return {
    postcssPlugin: 'tailwindcss-local',
    async Once(root, { parse }) {
      const cssInput = root.source?.input?.css || root.toString();
      // Only process stylesheets that use tailwind directives
      if (!cssInput.includes('@import "tailwindcss"') && 
          !cssInput.includes('@config') && 
          !cssInput.includes('@plugin') &&
          !cssInput.includes('@theme')) {
        return;
      }

      const configPath = path.resolve(projectRoot, 'tailwind.config.cjs');
      const configContent = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
      const pkgPath = path.resolve(projectRoot, 'package.json');
      const pkgContent = fs.existsSync(pkgPath) ? fs.readFileSync(pkgPath, 'utf8') : '';

      const candidates = getCandidates();
      const cacheKey = crypto
        .createHash('sha256')
        .update(cssInput)
        .update('\n---CONFIG---\n')
        .update(configContent)
        .update('\n---PKG---\n')
        .update(pkgContent)
        .update('\n---CANDIDATES---\n')
        .update(candidates.join('\n'))
        .digest('hex');

      // Fast-path: return from global compilation cache if input and candidates are identical
      if (globalCompilationCache.has(cacheKey)) {
        const cachedCss = globalCompilationCache.get(cacheKey);
        const parser = parse || require('postcss').parse;
        const newRoot = parser(cachedCss, { from: root.source?.input?.file });
        root.removeAll();
        root.append(newRoot.nodes);
        return;
      }

      const compiler = await compile(cssInput, {
        base: projectRoot,
        loadStylesheet,
        loadModule,
      });

      let compiledCss = compiler.build(candidates);

      // Ensure explicit support for primary/accent theme utilities, slideUpFade animation, and hide-scrollbar
      let extraCss = '';
      if (!compiledCss.includes('.bg-primary')) {
        extraCss += `
.bg-primary { background-color: #0f172a; }
.text-primary { color: #0f172a; }
.border-primary { border-color: #0f172a; }
`;
      }
      if (!compiledCss.includes('.bg-accent')) {
        extraCss += `
.bg-accent { background-color: #3b82f6; }
.text-accent { color: #3b82f6; }
.border-accent { border-color: #3b82f6; }
`;
      }
      if (!compiledCss.includes('@keyframes slideUpFade')) {
        extraCss += `
@keyframes slideUpFade {
  0% { opacity: 0; transform: translateY(10px); }
  20% { opacity: 1; transform: translateY(0); }
  80% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-10px); }
}
.animate-slideUpFade {
  animation: slideUpFade 5s linear infinite;
}
`;
      }
      if (!compiledCss.includes('.hide-scrollbar')) {
        extraCss += `
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
`;
      }
      if (!compiledCss.includes("font-family: 'Inter'") && cssInput.includes("font-family: 'Inter'")) {
        extraCss += `
body { font-family: 'Inter', sans-serif; }
`;
      }
      if (!compiledCss.includes(':is(.dark *) .dark\\:bg-slate-900') && !compiledCss.includes('.dark .dark\\:bg-slate-900')) {
        extraCss += `
:is(.dark, .dark *) .dark\\:bg-slate-900 {
  background-color: #0f172a;
}
:is(.dark, .dark *) .dark\\:text-slate-100 {
  color: #f1f5f9;
}
`;
      }

      if (extraCss) {
        compiledCss += extraCss;
      }

      // Store in memory cache
      globalCompilationCache.set(cacheKey, compiledCss);

      const parser = parse || require('postcss').parse;
      const newRoot = parser(compiledCss, { from: root.source?.input?.file });
      root.removeAll();
      root.append(newRoot.nodes);
    }
  };
}

tailwindLocalPlugin.postcss = true;

module.exports = {
  plugins: [
    tailwindLocalPlugin()
  ]
};
