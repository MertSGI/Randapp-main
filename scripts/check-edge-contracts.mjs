import fs from 'fs';
import path from 'path';

console.log('Running Edge Function Contracts Verification...');

const functionsDir = path.join(process.cwd(), 'supabase', 'functions');

if (!fs.existsSync(functionsDir)) {
    console.log('No supabase/functions directory found.');
    process.exit(0);
}

const requiredFunctions = [
    'create-checkout-session',
    'payment-webhook',
    'subscription-sync'
];

let allPresent = true;

requiredFunctions.forEach(fn => {
    const fnPath = path.join(functionsDir, fn, 'index.ts');
    if (!fs.existsSync(fnPath)) {
        console.error(`[ERROR] Missing expected edge function contract: ${fn}`);
        allPresent = false;
    } else {
        const content = fs.readFileSync(fnPath, 'utf-8');
        if (!content.includes('diagnostic')) {
             console.warn(`[WARN] Edge function ${fn} does not appear to implement the safe diagnostic mode handler.`);
        }
    }
});

if (allPresent) {
    console.log('[OK] All required payment Edge Function scaffolds are present.');
}

console.log('Edge Contracts Scan Complete.\n');
