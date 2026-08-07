import fs from 'fs';
import path from 'path';

export const CANONICAL_TENANT_ID = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
export const DEDICATED_H1D_TENANT_ID = 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd';
export const DEDICATED_H1D_TENANT_SLUG = 'h1d-contract-test';
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

    const allowedRpcs = [
      '/rest/v1/rpc/super_admin_get_tenant_pilot_eligibility_snapshot',
      '/rest/v1/rpc/super_admin_get_tenant_pilot_authorization',
      '/rest/v1/rpc/super_admin_approve_tenant_pilot',
      '/rest/v1/rpc/super_admin_revoke_tenant_pilot',
      '/rest/v1/rpc/super_admin_get_tenant_pilot_mutation_evidence'
    ];

    if (allowedRpcs.includes(pathname) && method.toUpperCase() === 'POST') {
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
  getForbiddenRequestsDetected() {
    return this.forbiddenRequestsDetected;
  }

  getForbiddenMutationAttemptsDetected() {
    return this.mutationAttemptsDetected;
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

    let errorObj = null;
    if (!res.ok) {
      errorObj = redactSecrets({
        code: (data && data.code) || 'HTTP_' + status,
        message: (data && data.message) || 'HTTP Request failed with status ' + status,
        details: (data && data.details) || null,
        hint: (data && data.hint) || null
      });
    }

    return { status, data, ok: res.ok, error: errorObj };
  } catch (err) {
    return {
      status: 500,
      data: null,
      ok: false,
      error: redactSecrets({
        code: 'NETWORK_EXCEPTION',
        message: err.message || String(err),
        details: null,
        hint: null
      })
    };
  }
}

export function assertAnonAclDenied(res) {
  if (res.ok) throw new Error('Anon call returned HTTP success when function EXECUTE is revoked!');
  if (res.status !== 401 && res.status !== 403) {
    throw new Error('Expected HTTP status 401 or 403 for anon ACL denial, got ' + res.status);
  }
  if (!res.data || typeof res.data !== 'object') {
    throw new Error('Anon ACL denial response body must parse as valid JSON');
  }
  if (res.data.code !== '42501') {
    throw new Error('Expected PostgreSQL error code 42501 (insufficient privilege), got ' + (res.data.code || 'none'));
  }
  if (res.data.readiness_facts || res.data.global_release_control || res.data.pilot_authorization) {
    throw new Error('Anon ACL denial response leaked tenant snapshot data!');
  }
  return true;
}

export function assertAuthenticatedUnauthorized(res, roleLabel) {
  if (!res.ok) throw new Error('Transport or HTTP error during ' + roleLabel + ' call (HTTP ' + res.status + ')');
  if (!res.data || typeof res.data !== 'object') {
    throw new Error(roleLabel + ' call returned invalid JSON response');
  }
  if (res.data.success !== false) {
    throw new Error('Expected success=false for ' + roleLabel + ', got ' + res.data.success);
  }
  const reason = (res.data.reason_code || '').toUpperCase();
  if (reason !== 'UNAUTHORIZED') {
    throw new Error('Expected reason_code=UNAUTHORIZED for ' + roleLabel + ', got ' + res.data.reason_code);
  }
  if (res.data.readiness_facts || res.data.global_release_control || res.data.pilot_authorization) {
    throw new Error(roleLabel + ' call leaked tenant snapshot data!');
  }
  return true;
}

export function assertSuperAdminEligibilityEnvelope(res) {
  if (!res.ok) {
    const errObj = res.error || {};
    const safeMsg = redactSecrets(errObj.message || 'HTTP status ' + res.status);
    const safeCode = redactSecrets(errObj.code || 'HTTP_' + res.status);
    const safeDetails = redactSecrets(errObj.details || 'none');
    const safeHint = redactSecrets(errObj.hint || 'none');
    throw new Error(`Super Admin eligibility call failed (HTTP ${res.status}, Code: ${safeCode}, Msg: "${safeMsg}", Details: "${safeDetails}", Hint: "${safeHint}")`);
  }
  if (!res.data || typeof res.data !== 'object') throw new Error('Super Admin call returned invalid JSON');
  const snap = res.data;
  if (snap.success !== true) throw new Error('Expected success=true for Super Admin');
  if (!snap.readiness_facts || typeof snap.readiness_facts !== 'object') throw new Error('Missing readiness_facts subsection');
  if (!snap.global_release_control || typeof snap.global_release_control !== 'object') throw new Error('Missing global_release_control subsection');
  if (!snap.pilot_authorization || typeof snap.pilot_authorization !== 'object') throw new Error('Missing pilot_authorization subsection');
  return snap;
}
