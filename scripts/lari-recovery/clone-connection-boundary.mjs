import { URL } from 'node:url';
import pg from 'pg';

const { Client } = pg;

export const ALLOWED_LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Safely sanitizes error messages by redacting raw and decoded credentials using
 * string splitting/joining, without compiling credentials into regular expressions.
 * Handles empty credentials as a no-op and never leaks percent-encoded values.
 */
export function sanitizeErrorMessage(message, rawPassword, decodedPassword, rawUsername, decodedUsername) {
  if (!message || typeof message !== 'string') {
    return 'Database connection failed';
  }

  let sanitized = message;

  // Collect non-empty secrets to redact
  const secretsToRedact = new Set();
  if (rawPassword && typeof rawPassword === 'string' && rawPassword.trim().length > 0) {
    secretsToRedact.add(rawPassword);
  }
  if (decodedPassword && typeof decodedPassword === 'string' && decodedPassword.trim().length > 0) {
    secretsToRedact.add(decodedPassword);
  }
  if (rawUsername && typeof rawUsername === 'string' && rawUsername.trim().length > 0 && rawUsername !== 'postgres') {
    secretsToRedact.add(rawUsername);
  }
  if (decodedUsername && typeof decodedUsername === 'string' && decodedUsername.trim().length > 0 && decodedUsername !== 'postgres') {
    secretsToRedact.add(decodedUsername);
  }

  // Pure string-based replacement (no RegExp compilation)
  for (const secret of secretsToRedact) {
    sanitized = sanitized.split(secret).join('***');
  }

  // Also strip any accidentally leaked connection URI strings
  sanitized = sanitized.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, 'postgresql://***:***@.../...');

  return sanitized;
}

/**
 * Validates that a database URL points strictly to an authorized local restored clone.
 * Rejects any remote endpoints, live Supabase, default database names, or unconfirmed executions.
 * Decodes percent-encoded credentials safely with malformed-encoding rejection.
 */
export function validateAndParseCloneDatabaseUrl(rawUrl, cloneConfirmed) {
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    const err = new Error('RESTORED_CLONE_REQUIRED: LARI_RESTORE_DATABASE_URL is not set or empty');
    err.code = 'MISSING_DATABASE_URL';
    throw err;
  }

  const trimmed = rawUrl.trim();

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    const err = new Error('MALFORMED_DATABASE_URL: Invalid URL format for clone database');
    err.code = 'MALFORMED_DATABASE_URL';
    throw err;
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    const err = new Error(`INVALID_PROTOCOL: Expected postgres: or postgresql:, got "${parsed.protocol}"`);
    err.code = 'INVALID_PROTOCOL';
    throw err;
  }

  // Canonicalize host (strip brackets if IPv6)
  let hostname = parsed.hostname.toLowerCase();
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }

  // Reject octal/hex/decimal IP tricks or zone identifiers
  if (
    hostname.includes('%') ||
    /^0[0-9]+/.test(hostname) ||
    /^0x[0-9a-f]+/i.test(hostname) ||
    /^\d+$/.test(hostname)
  ) {
    const err = new Error(`REJECTED_HOST: Ambiguous or encoded host representation "${hostname}" is prohibited`);
    err.code = 'NON_LOOPBACK_HOST';
    throw err;
  }

  if (!ALLOWED_LOOPBACK_HOSTS.has(hostname)) {
    const err = new Error(
      `SECURITY_REFUSAL_NON_LOOPBACK_HOST: Database host "${hostname}" is not an authorized loopback address (localhost, 127.0.0.1, ::1)`
    );
    err.code = 'NON_LOOPBACK_HOST';
    throw err;
  }

  // Reject live Supabase hostnames explicitly even if embedded in query or userinfo
  if (trimmed.toLowerCase().includes('supabase.co') || trimmed.toLowerCase().includes('pooler.supabase.com')) {
    const err = new Error('SECURITY_REFUSAL_SUPABASE_HOST: Live Supabase hostnames are strictly prohibited');
    err.code = 'LIVE_SUPABASE_PROHIBITED';
    throw err;
  }

  // Database name must strictly begin with lari_restore_ and contain only alphanumeric and underscores
  const dbName = parsed.pathname.replace(/^\//, '');
  if (!dbName || !dbName.startsWith('lari_restore_') || dbName === 'lari_restore_') {
    const err = new Error(
      `INVALID_CLONE_DATABASE_NAME: Database name must begin with "lari_restore_" (got "${dbName}"). Default databases like postgres are prohibited.`
    );
    err.code = 'INVALID_CLONE_DATABASE_NAME';
    throw err;
  }

  if (!/^lari_restore_[a-zA-Z0-9_]+$/.test(dbName) || dbName.includes('--')) {
    const err = new Error(`INVALID_CLONE_DATABASE_NAME: Malformed or prohibited characters in database name "${dbName}"`);
    err.code = 'INVALID_CLONE_DATABASE_NAME';
    throw err;
  }

  // Clone confirmation check
  const isConfirmed = cloneConfirmed === true || cloneConfirmed === '1' || process.env.LARI_RESTORE_CLONE_CONFIRMED === '1';
  if (!isConfirmed) {
    const err = new Error(
      'CLONE_CONFIRMATION_REQUIRED: Execution must be explicitly confirmed with LARI_RESTORE_CLONE_CONFIRMED=1'
    );
    err.code = 'CLONE_CONFIRMATION_REQUIRED';
    throw err;
  }

  const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
  if (isNaN(port) || port < 1 || port > 65535) {
    const err = new Error(`INVALID_PORT: Port "${parsed.port}" is out of valid range (1-65535)`);
    err.code = 'INVALID_PORT';
    throw err;
  }

  // Safely decode percent-encoded username and password exactly once with guarded error handling
  const rawUsername = parsed.username || '';
  const rawPassword = parsed.password || '';
  let decodedUsername = 'postgres';
  let decodedPassword = '';

  if (rawUsername) {
    try {
      decodedUsername = decodeURIComponent(rawUsername);
    } catch {
      const err = new Error('MALFORMED_CREDENTIALS: Malformed percent-encoding in database username');
      err.code = 'MALFORMED_CREDENTIALS';
      throw err;
    }
  }

  if (rawPassword) {
    try {
      decodedPassword = decodeURIComponent(rawPassword);
    } catch {
      const err = new Error('MALFORMED_CREDENTIALS: Malformed percent-encoding in database password');
      err.code = 'MALFORMED_CREDENTIALS';
      throw err;
    }
  }

  return {
    redactedUrl: redactDatabaseUrl(trimmed),
    hostname,
    port,
    dbName,
    username: decodedUsername,
    password: decodedPassword,
    _rawUsername: rawUsername,
    _rawPassword: rawPassword,
  };
}

/**
 * Redacts username/password credentials from a connection URL string.
 */
export function redactDatabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const parsed = new URL(rawUrl);
    let authPart = '';
    if (parsed.username) {
      let safeUser = '***';
      try {
        safeUser = decodeURIComponent(parsed.username);
      } catch {
        safeUser = '***';
      }
      authPart = `${safeUser}:***@`;
    }
    return `${parsed.protocol}//${authPart}${parsed.host}${parsed.pathname}`;
  } catch {
    return 'postgresql://***:***@invalid-url';
  }
}

/**
 * Connects to the local restored clone using the repository's pg client in read-only transaction mode.
 * Enforces statement timeout and rolls back upon completion.
 */
export async function withReadOnlyCloneClient(rawUrl, cloneConfirmed, queryFn) {
  const parsedConfig = validateAndParseCloneDatabaseUrl(rawUrl, cloneConfirmed);

  const client = new Client({
    host: parsedConfig.hostname,
    port: parsedConfig.port,
    database: parsedConfig.dbName,
    user: parsedConfig.username,
    password: parsedConfig.password,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });

  try {
    await client.connect();
  } catch (connectErr) {
    const sanitizedMsg = sanitizeErrorMessage(
      connectErr.message,
      parsedConfig._rawPassword,
      parsedConfig.password,
      parsedConfig._rawUsername,
      parsedConfig.username
    );
    const err = new Error(`CLONE_CONNECTION_FAILED: ${sanitizedMsg}`);
    err.code = 'RESTORED_CLONE_REQUIRED';
    throw err;
  }

  let inTx = false;
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;');
    inTx = true;
    await client.query('SET LOCAL statement_timeout = 10000;');

    const result = await queryFn(client, parsedConfig);
    return result;
  } finally {
    if (inTx) {
      try {
        await client.query('ROLLBACK;');
      } catch {
        // Ignore rollback errors during client teardown
      }
    }
    try {
      await client.end();
    } catch {
      // Ignore disconnect errors
    }
  }
}
