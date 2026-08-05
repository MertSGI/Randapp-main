import fs from 'fs';
import path from 'path';

export const CANONICAL_TENANT_ID = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
export const DEDICATED_H1D_TENANT_ID = 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd';
export const NONEXISTENT_TENANT_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

export function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

export function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

export function redactSecrets(obj) {
  if (!obj) return obj;
  if (typeof obj === 'object') {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
      if (typeof value === 'string') {
        if (/password|token|secret|apikey|authorization|cookie/i.test(key)) return '[REDACTED]';
        return value.replace(/bearer\s+[a-zA-Z0-9\._\-]+/gi, 'Bearer [REDACTED]')
                    .replace(/eyJ[a-zA-Z0-9\._\-]+/g, '[JWT_REDACTED]')
                    .replace(/sbp_[a-zA-Z0-9]+/g, '[KEY_REDACTED]');
      }
      return value;
    }));
  }
  if (typeof obj === 'string') {
    return obj.replace(/bearer\s+[a-zA-Z0-9\._\-]+/gi, 'Bearer [REDACTED]')
              .replace(/eyJ[a-zA-Z0-9\._\-]+/g, '[JWT_REDACTED]')
              .replace(/sbp_[a-zA-Z0-9]+/g, '[KEY_REDACTED]');
  }
  return obj;
}

export class NetworkObserver {
  constructor(allowedOrigin = null) {
    this.allowedOrigin = allowedOrigin;
    this.requests = [];
    this.mutationAttemptsDetected = 0;
    this.forbiddenRequestsDetected = 0;
  }

  isAllowedPath(urlStr, method) {
    let url;
    try {
      url = new URL(urlStr);
    } catch (e) {
      return false;
    }

    if (this.allowedOrigin && url.origin !== this.allowedOrigin) {
      return false;
    }

    const pathname = url.pathname;

    if (pathname.includes('/auth/v1/token') || pathname.includes('/auth/v1/logout')) {
      return true;
    }

    if (pathname === '/rest/v1/rpc/super_admin_get_tenant_pilot_eligibility_snapshot' && method.toUpperCase() === 'POST') {
      return true;
    }

    return false;
  }

  observe(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const urlStr = url.toString();
    const allowed = this.isAllowedPath(urlStr, method);

    const record = {
      url: urlStr.split('?')[0],
      method,
      allowed,
      timestamp: new Date().toISOString()
    };
    this.requests.push(record);

    if (!allowed) {
      this.forbiddenRequestsDetected++;
      if (method !== 'GET' && method !== 'HEAD') {
        this.mutationAttemptsDetected++;
      }
    }

    return allowed;
  }
}

export function createMonitoredFetch(observer, customFetch = fetch) {
  return async (url, options = {}) => {
    const isAllowed = observer.observe(url, options);
    if (!isAllowed) {
      throw new Error(`[FORBIDDEN_NETWORK_OPERATION] Path or method forbidden: ${options.method || 'GET'} ${url}`);
    }
    return customFetch(url, options);
  };
}

export async function authenticateUser(supabaseUrl, supabaseAnonKey, email, password, expectedRole = null, monitoredFetch = fetch) {
  if (!email || !password) {
    return { ok: false, token: null, user: null, status: 0, failure_category: 'missing_credentials' };
  }
  try {
    const res = await monitoredFetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    const status = res.status;
    if (!res.ok) {
      const category = status === 400 || status === 401 ? 'invalid_credentials' : 'unexpected_status';
      return { ok: false, token: null, user: null, status, failure_category: category };
    }
    const text = await res.text();
    const data = safeJsonParse(text);
    if (!data || !data.access_token || !data.user) {
      return { ok: false, token: null, user: null, status, failure_category: 'malformed_auth_response' };
    }

    if (email && data.user.email && data.user.email.toLowerCase() !== email.toLowerCase()) {
      return { ok: false, token: null, user: null, status, failure_category: 'email_mismatch' };
    }

    return { ok: true, token: data.access_token, user: data.user, status, failure_category: null };
  } catch (err) {
    return { ok: false, token: null, user: null, status: 500, failure_category: 'network_failure' };
  }
}

export async function callRpcEndpoint(supabaseUrl, supabaseAnonKey, rpcName, params = {}, bearerToken = null, monitoredFetch = fetch) {
  const headers = {
    'apikey': supabaseAnonKey,
    'Content-Type': 'application/json'
  };
  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  }
  try {
    const res = await monitoredFetch(`${supabaseUrl}/rest/v1/rpc/${rpcName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params)
    });
    const status = res.status;
    const text = await res.text();
    const data = safeJsonParse(text);
    return { status, data, ok: res.ok, rawText: text };
  } catch (err) {
    return { status: 500, data: null, ok: false, error: err.message };
  }
}
