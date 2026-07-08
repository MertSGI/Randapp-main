import fs from 'fs';
import path from 'path';

console.log('Running Payment Environment Variables Scan...');

const filesToCheck = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env.development'),
];

let foundFile = false;

filesToCheck.forEach(file => {
    if (fs.existsSync(file)) {
        foundFile = true;
        const content = fs.readFileSync(file, 'utf-8');
        console.log(`Checking ${path.basename(file)}...`);

        if (content.includes('IYZICO_SECRET_KEY=') && !content.includes('replace_with_')) {
            console.warn(`[WARNING] IYZICO_SECRET_KEY assignment found in ${path.basename(file)}! NEVER commit this file or expose to frontend.`);
        }
        if (content.includes('SUPABASE_SERVICE_ROLE_KEY=') && !content.includes('replace_with_')) {
             console.warn(`[WARNING] SUPABASE_SERVICE_ROLE_KEY assignment found in ${path.basename(file)}! NEVER commit this file or expose to frontend.`);
        }
        
        const providerMatch = content.match(/VITE_PAYMENT_PROVIDER=(.*)/);
        console.log(`- VITE_PAYMENT_PROVIDER: ${providerMatch ? providerMatch[1] : 'Not explicitly set (defaults to mock)'}`);
    }
});

if (!foundFile) {
    console.log('No local .env files found. This is normal if relying on runtime environment variables.');
}

console.log('Payment Environment Scan Complete.\n');
