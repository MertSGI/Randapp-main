import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const FORBIDDEN_VITE_SECRET_KEYS = [
  'VITE_IYZICO_SECRET_KEY',
  'VITE_IYZICO_API_KEY',
  'VITE_IYZICO_WEBHOOK_SECRET',
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
  'VITE_RESEND_API_KEY',
  'VITE_SMS_PROVIDER_API_KEY',
  'VITE_SMS_PROVIDER_PASSWORD',
  'VITE_WHATSAPP_ACCESS_TOKEN',
  'VITE_WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'VITE_GEMINI_API_KEY'
];

const SERVER_ONLY_SECRET_KEYS = [
  'IYZICO_API_KEY',
  'IYZICO_SECRET_KEY',
  'IYZICO_WEBHOOK_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'SMTP_PASSWORD',
  'SMS_PROVIDER_API_KEY',
  'SMS_PROVIDER_PASSWORD',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'GEMINI_API_KEY'
];

const PLACEHOLDER_PATTERN = /^(?:replace_with_.*|your[_-].*|<.*>|changeme|change_me|dummy.*|mock.*|test_placeholder.*)$/i;

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function isPlaceholderOrEmpty(rawValue) {
  if (rawValue === undefined || rawValue === null) return true;
  const val = unquote(String(rawValue));
  if (val === '') return true;
  return PLACEHOLDER_PATTERN.test(val);
}

export function parseEnvEntries(content) {
  const entries = [];
  const lines = String(content || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    const rawValue = line.slice(eqIndex + 1);
    entries.push({ key, value: unquote(rawValue), lineNumber: i + 1 });
  }
  return entries;
}

export function auditPaymentEnvContent(filename, content) {
  const errors = [];
  const warnings = [];
  const entries = parseEnvEntries(content);
  const map = new Map();
  for (const entry of entries) {
    map.set(entry.key, entry.value);
  }

  for (const { key, value, lineNumber } of entries) {
    if (FORBIDDEN_VITE_SECRET_KEYS.includes(key)) {
      if (!isPlaceholderOrEmpty(value) || filename === '.env.example') {
        errors.push(`${filename}:${lineNumber} exposes forbidden frontend secret key '${key}'`);
      }
    }

    if (SERVER_ONLY_SECRET_KEYS.includes(key) && !isPlaceholderOrEmpty(value)) {
      errors.push(`${filename}:${lineNumber} assigns non-placeholder server secret '${key}' inside workspace env file`);
    }

    if (key === 'IYZICO_BASE_URL' && /api\.iyzipay\.com/i.test(value) && !/sandbox-api\.iyzipay\.com/i.test(value)) {
      errors.push(`${filename}:${lineNumber} targets live production iyzico endpoint (${value}) while EXTERNAL_HOLD/NO_GO is active`);
    }

    if (key === 'VITE_PAYMENT_RUN_MODE' && value === 'production_live') {
      errors.push(`${filename}:${lineNumber} sets VITE_PAYMENT_RUN_MODE=production_live while PRODUCTION=NO_GO`);
    }

    if (key === 'VITE_PAYMENT_MODE' && value === 'iyzico_live') {
      errors.push(`${filename}:${lineNumber} sets VITE_PAYMENT_MODE=iyzico_live while PRODUCTION=NO_GO`);
    }
  }

  if (filename === '.env.example') {
    const requiredSafeDefaults = [
      ['VITE_PAYMENT_RUN_MODE', 'local_dry_run'],
      ['VITE_PAYMENT_MODE', 'disabled'],
      ['VITE_PAYMENT_PROVIDER', 'disabled'],
      ['VITE_COMMUNICATION_MODE', 'local_outbox_only']
    ];
    for (const [k, expected] of requiredSafeDefaults) {
      const actual = map.get(k);
      if (actual !== expected) {
        errors.push(`.env.example must keep ${k}=${expected} (found '${actual ?? 'missing'}')`);
      }
    }
  }

  const provider = map.get('VITE_PAYMENT_PROVIDER');
  const runMode = map.get('VITE_PAYMENT_RUN_MODE');
  if (provider && provider !== 'disabled' && !runMode) {
    warnings.push(`${filename} sets VITE_PAYMENT_PROVIDER=${provider} without explicit VITE_PAYMENT_RUN_MODE`);
  }

  return { ok: errors.length === 0, errors, warnings, parsedCount: entries.length };
}

export function auditRuntimeEnv(envObj = process.env) {
  const errors = [];
  for (const key of FORBIDDEN_VITE_SECRET_KEYS) {
    const val = envObj?.[key];
    if (!isPlaceholderOrEmpty(val)) {
      errors.push(`Runtime environment exposes forbidden frontend secret key '${key}'`);
    }
  }
  const baseUrl = envObj?.IYZICO_BASE_URL;
  if (typeof baseUrl === 'string' && /api\.iyzipay\.com/i.test(baseUrl) && !/sandbox-api\.iyzipay\.com/i.test(baseUrl)) {
    errors.push(`Runtime environment sets live IYZICO_BASE_URL (${baseUrl}) while EXTERNAL_HOLD is active`);
  }
  return { ok: errors.length === 0, errors };
}

export function runPaymentEnvCheck(rootDir = process.cwd(), envObj = process.env) {
  console.log('Running Payment Environment Variables Scan...');

  const filesToCheck = fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => {
      if (entry.name !== '.env' && !entry.name.startsWith('.env.')) {
        return false;
      }
      if (entry.isFile()) return true;
      if (entry.isSymbolicLink()) {
        try {
          return fs.statSync(path.join(rootDir, entry.name)).isFile();
        } catch {
          return false;
        }
      }
      return false;
    })
    .map((entry) => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const allErrors = [];
  const allWarnings = [];
  let foundLocalEnv = false;

  for (const relName of filesToCheck) {
    const fullPath = path.join(rootDir, relName);

    if (relName !== '.env.example') {
      foundLocalEnv = true;
    }
    console.log(`Checking ${relName}...`);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const res = auditPaymentEnvContent(relName, content);
    allErrors.push(...res.errors);
    allWarnings.push(...res.warnings);
  }

  if (!foundLocalEnv) {
    console.log('No local .env override files found. This is normal if relying on runtime environment variables.');
  }

  const runtimeRes = auditRuntimeEnv(envObj);
  allErrors.push(...runtimeRes.errors);

  for (const w of allWarnings) {
    console.warn(`[WARNING] ${w}`);
  }

  if (allErrors.length > 0) {
    for (const err of allErrors) {
      console.error(`[ERROR] ${err}`);
    }
    console.error(`Payment Environment Scan FAILED (${allErrors.length} violation(s)).`);
    return 1;
  }

  console.log('[OK] Zero live payment/provider secret leaks and EXTERNAL_HOLD env boundaries verified.');
  console.log('Payment Environment Scan Complete.\n');
  return 0;
}

const isEntrypoint =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  process.exit(runPaymentEnvCheck());
}
