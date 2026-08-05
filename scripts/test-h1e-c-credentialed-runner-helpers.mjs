import { redactSecrets } from './test-h1e-a-credentialed-runner-helpers.mjs';

export const H1EC_REASON_PRECEDENCE = [
  'RELEASE_CONTROL_UNAVAILABLE',
  'GLOBAL_RELEASE_PHASE_BLOCKED',
  'TENANT_NOT_FOUND',
  'TENANT_INACTIVE',
  'CORE_BOOKING_RESTRICTED',
  'PUBLIC_SITE_STATUS_BLOCKED',
  'PILOT_AUTHORIZATION_REQUIRED',
  'PILOT_AUTHORIZATION_REVOKED',
  'SUBSCRIPTION_BLOCKED',
  'REQUIRED_ENTITLEMENT_BLOCKED',
  'OPERATIONAL_READINESS_FAILED',
  'BOOKING_ALLOWED'
];

export function validateH1ECReasonEnvelope(response) {
  if (!response || typeof response !== 'object') {
    return { ok: false, error: 'Response is not an object' };
  }

  const blockingReasons = response.blocking_reason_codes;
  if (!Array.isArray(blockingReasons)) {
    return { ok: false, error: 'blocking_reason_codes is not an array' };
  }

  const seen = new Set();
  let lastIndex = -1;

  for (const code of blockingReasons) {
    if (seen.has(code)) {
      return { ok: false, error: `Duplicate reason code: ${code}` };
    }
    seen.add(code);

    const idx = H1EC_REASON_PRECEDENCE.indexOf(code);
    if (idx === -1) {
      return { ok: false, error: `Unknown reason code: ${code}` };
    }

    if (idx <= lastIndex) {
      return { ok: false, error: `Reason code ${code} violates canonical precedence order` };
    }
    lastIndex = idx;
  }

  if (blockingReasons.includes('BOOKING_ALLOWED') && blockingReasons.length > 1) {
    return { ok: false, error: 'BOOKING_ALLOWED coexists with blockers' };
  }

  const primary = response.primary_reason_code || (response.reason_code ? response.reason_code.toUpperCase() : null);
  if (blockingReasons.length === 0) {
    if (primary !== 'BOOKING_ALLOWED') {
      return { ok: false, error: 'Empty blocking_reason_codes requires primary_reason_code BOOKING_ALLOWED' };
    }
  } else {
    if (primary !== blockingReasons[0]) {
      return { ok: false, error: `Primary reason code ${primary} does not match first blocking reason ${blockingReasons[0]}` };
    }
  }

  return { ok: true, error: null };
}

export function validatePaymentFlagsFalse(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;

  const rel = snapshot.global_release_control || snapshot;
  if (rel.is_payment_collection_enabled === true) return false;
  if (rel.is_checkout_enabled === true) return false;
  if (rel.is_iyzico_enabled === true) return false;

  return true;
}

export function validatePrePilotPublicResponse(response, expectedFound) {
  if (!response || typeof response !== 'object') {
    return { ok: false, error: 'Response is not an object' };
  }

  if (response.found !== expectedFound) {
    return { ok: false, error: `Expected found=${expectedFound}, got ${response.found}` };
  }

  if (response.allowed !== false || response.bookable !== false) {
    return { ok: false, error: 'Expected allowed=false and bookable=false under pre_pilot' };
  }

  if (response.primary_reason_code !== 'GLOBAL_RELEASE_PHASE_BLOCKED') {
    return { ok: false, error: `Expected primary_reason_code GLOBAL_RELEASE_PHASE_BLOCKED, got ${response.primary_reason_code}` };
  }

  const reasons = response.blocking_reason_codes;
  if (!Array.isArray(reasons)) {
    return { ok: false, error: 'blocking_reason_codes is not an array' };
  }

  if (reasons[0] !== 'GLOBAL_RELEASE_PHASE_BLOCKED') {
    return { ok: false, error: `First blocking reason must be GLOBAL_RELEASE_PHASE_BLOCKED, got ${reasons[0]}` };
  }

  if (expectedFound) {
    if (reasons.includes('TENANT_NOT_FOUND')) {
      return { ok: false, error: 'Known tenant response should not include TENANT_NOT_FOUND' };
    }
  } else {
    if (reasons.length < 2 || reasons[1] !== 'TENANT_NOT_FOUND') {
      return { ok: false, error: 'Nonexistent slug response must have TENANT_NOT_FOUND as second blocking reason' };
    }
  }

  return validateH1ECReasonEnvelope(response);
}

export function validateSnapshotEnvelope(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { ok: false, error: 'Snapshot is not an object' };
  }

  if (snapshot.success !== true) {
    return { ok: false, error: 'Snapshot success is not true' };
  }

  if (!snapshot.tenant_id || !snapshot.tenant_slug) {
    return { ok: false, error: 'Snapshot missing tenant_id or tenant_slug' };
  }

  if (!validatePaymentFlagsFalse(snapshot)) {
    return { ok: false, error: 'Payment capability flags must be false' };
  }

  return validateH1ECReasonEnvelope(snapshot);
}

export function validateCompleteAccounting(accounting) {
  if (!accounting || typeof accounting !== 'object') return false;

  if (typeof accounting.defined !== 'number' || accounting.defined <= 0) return false;
  if (accounting.executed !== accounting.defined) return false;
  if (accounting.passed !== accounting.defined) return false;
  if (accounting.failed !== 0 || accounting.blocked !== 0) return false;

  if (accounting.authAttempted !== 5 || accounting.authPassed !== 5 || accounting.authFailed !== 0) return false;
  if (typeof accounting.authorizationAttempted !== 'number' || accounting.authorizationAttempted <= 0) return false;
  if (accounting.authorizationPassed !== accounting.authorizationAttempted || accounting.authorizationFailed !== 0) return false;

  if (typeof accounting.behavioralAttempted !== 'number' || accounting.behavioralAttempted <= 0) return false;
  if (accounting.behavioralPassed !== accounting.behavioralAttempted || accounting.behavioralFailed !== 0) return false;

  if (accounting.approvedMutations !== 0) return false;
  if (accounting.forbiddenMutationAttempts !== 0) return false;
  if (accounting.forbiddenRequestsDetected !== 0) return false;

  if (accounting.cleanupRequired !== false) return false;
  if (accounting.initialReleasePhase !== 'pre_pilot') return false;
  if (accounting.finalReleasePhase !== 'pre_pilot') return false;
  if (accounting.finalActiveAuthCount !== 0) return false;

  if (accounting.firstSafeFailure !== null) return false;
  if (accounting.exitCode !== 0) return false;

  return true;
}

export function redactH1ECSecrets(value) {
  return redactSecrets(value);
}

export class H1ECNetworkObserver {
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
    const upperMethod = method.toUpperCase();

    if (pathname.includes('/auth/v1/token') && upperMethod === 'POST') {
      return true;
    }

    const allowedRpcs = [
      '/rest/v1/rpc/can_accept_public_booking',
      '/rest/v1/rpc/super_admin_get_tenant_pilot_eligibility_snapshot',
      '/rest/v1/rpc/super_admin_transition_release_phase',
      '/rest/v1/rpc/super_admin_approve_tenant_pilot',
      '/rest/v1/rpc/super_admin_revoke_tenant_pilot',
      '/rest/v1/rpc/super_admin_get_tenant_pilot_mutation_evidence',
      '/rest/v1/rpc/super_admin_get_release_transition_evidence'
    ];

    if (allowedRpcs.includes(pathname) && upperMethod === 'POST') {
      return true;
    }

    return false;
  }

  observe(urlStr, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const allowed = this.isAllowedPath(urlStr, method);

    this.requests.push({
      url: urlStr,
      method,
      allowed,
      timestamp: Date.now()
    });

    if (!allowed) {
      this.forbiddenRequestsDetected++;
      if (method !== 'GET') {
        this.mutationAttemptsDetected++;
      }
    }

    return allowed;
  }

  getForbiddenMutationAttemptsDetected() {
    return this.mutationAttemptsDetected;
  }

  getForbiddenRequestsDetected() {
    return this.forbiddenRequestsDetected;
  }
}

export function createH1ECMonitoredFetch(observer, fetchImpl = globalThis.fetch) {
  return async function monitoredFetch(url, options = {}) {
    if (observer) {
      const allowed = observer.observe(url, options);
      if (!allowed) {
        throw new Error(`[FORBIDDEN_NETWORK_OPERATION] Path or method forbidden: ${options.method || 'GET'} ${url}`);
      }
    }
    return fetchImpl(url, options);
  };
}
