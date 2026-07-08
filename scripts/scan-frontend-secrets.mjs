import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const FORBIDDEN_TOKENS = [
    'IYZICO_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    // Not blocking GEMINI_API_KEY globally as some users may test via process.env server-side, 
    // but looking for VITE_ prefixed versions which are extremely bad.
    'VITE_IYZICO_SECRET_KEY',
    'VITE_SUPABASE_SERVICE_ROLE_KEY',
    'VITE_GEMINI_API_KEY'
];

const IGNORED_PATHS = [
    'node_modules',
    'dist',
    '.git',
    'supabase/functions',
    'docs',
    'scripts' // ignore this script itself
];

let violations = 0;

function scanDir(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        const relativePath = path.relative(rootDir, fullPath);
        
        // Skip ignored directories/files
        if (IGNORED_PATHS.some(ignored => relativePath.startsWith(ignored) || relativePath === ignored)) {
            continue;
        }
        
        if (stat.isDirectory()) {
            scanDir(fullPath);
        } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            FORBIDDEN_TOKENS.forEach(token => {
                if (content.includes(token)) {
                    // It's allowed if it's checking for absence, e.g. !(import.meta.env.VITE_IYZICO_SECRET_KEY)
                    const isSafeCheck = content.includes(`!(import.meta as any).env.${token}`);
                    if (!isSafeCheck) {
                        console.error(`[DANGER] Forbidden secret key reference '${token}' found in frontend-accessible file: ${relativePath}`);
                        violations++;
                    }
                }
            });
        }
    }
}

console.log('Scanning frontend codebase for accidental secret exposure...');
scanDir(rootDir);

if (violations === 0) {
    console.log('[OK] No frontend secret exposure found.');
} else {
    console.error(`[FAILED] Found ${violations} potential secret exposures. Please review and remove.`);
    process.exit(1); // Fail script if secrets found
}
