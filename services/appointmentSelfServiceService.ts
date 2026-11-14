import { 
  Appointment, 
  AppointmentAccessToken, 
  AppointmentChangeRequest, 
  BookingPolicy 
 } from '../types';
import { getBookingRepository, getSelfServiceRepository } from './repositories';
import { communicationEventService } from './communicationEventService';
import { tenantService } from './tenantService';
import { auditLogService } from './auditLogService';
import { STORAGE_KEYS, DYNAMIC_STORAGE_KEYS, registerMemoryResetHook } from './storageKeys';

const POLICY_STORAGE_KEY = STORAGE_KEYS.TENANT_BOOKING_POLICIES;
const memoryPolicies = new Map<string, BookingPolicy>();

// ============================================================================
// CSPRNG & Cryptographic Security Helpers (ADIM-012 / V1A-SEC-01)
// Invariant: Zero insecure pseudo-randomness. Minimum 128-bit (256-bit default) entropy.
// WebCrypto in browser/Deno, node:crypto in Node.js.
// ============================================================================

export interface ClientSecurityContext {
  clientIp?: string;
  clientFingerprint?: string;
  userAgent?: string;
}

export interface TokenLookupFailureRecord {
  key: string;
  failedCount: number;
  lockedUntil: number | null; // epoch ms
  lastFailedAt: number; // epoch ms
}

const TOKEN_LOOKUP_FAILURES_KEY = STORAGE_KEYS.SELF_SERVICE_TOKEN_FAILURES;
const MAX_CONSECUTIVE_FAILED_LOOKUPS = 5;
const LOOKUP_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes fail-closed lockout

let memoryTokenLookupFailures = new Map<string, TokenLookupFailureRecord>();
const selfServiceTenantLocks = new Map<string, Promise<void>>();

export async function withSelfServiceTenantLock<T>(tenantId: string, work: () => Promise<T>): Promise<T> {
  const prev = selfServiceTenantLocks.get(tenantId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>(resolve => {
    release = resolve;
  });
  const queued = prev.then(() => next, () => next);
  selfServiceTenantLocks.set(tenantId, queued);
  await prev;
  try {
    return await work();
  } finally {
    release();
    if (selfServiceTenantLocks.get(tenantId) === queued) {
      selfServiceTenantLocks.delete(tenantId);
    }
  }
}

// Register in-memory reset hook for centralized purge / reset (V1A-TECH-01)
registerMemoryResetHook(() => {
  memoryPolicies.clear();
  memoryTokenLookupFailures.clear();
  selfServiceTenantLocks.clear();
});

export function getSecureRandomBytes(byteCount: number): Uint8Array {
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(byteCount);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const nodeCrypto = typeof require !== 'undefined' ? require('crypto') : null;
      if (nodeCrypto && typeof nodeCrypto.randomBytes === 'function') {
        return new Uint8Array(nodeCrypto.randomBytes(byteCount));
      }
    } catch {}
  }
  throw new Error('SEC_CSPRNG_UNAVAILABLE: Cryptographically secure random number generator is required.');
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateSecureToken(prefix = 'apt_tok_', bytes = 32): string {
  // 32 bytes = 256 bits of CSPRNG entropy
  const randomHex = bytesToHex(getSecureRandomBytes(bytes));
  return `${prefix}${randomHex}`;
}

export function generateSecureId(prefix = 'tok_', bytes = 16): string {
  const randomHex = bytesToHex(getSecureRandomBytes(bytes));
  return `${prefix}${Date.now()}_${randomHex}`;
}

export async function computeSha256(input: string): Promise<string> {
  const trimmed = input.trim();
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.subtle?.digest === 'function') {
    const encoder = new TextEncoder();
    const data = encoder.encode(trimmed);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const nodeCrypto = await import('node:crypto');
      return nodeCrypto.createHash('sha256').update(trimmed, 'utf8').digest('hex');
    } catch {}
  }

  throw new Error('SEC_CRYPTO_UNAVAILABLE: Cryptographically secure SHA-256 implementation is required.');
}

// Default booking policy per Part 5
export const DEFAULT_BOOKING_POLICY: BookingPolicy = {
  cancellationWindowHours: 24,
  allowCustomerCancellation: true,
  allowCustomerRescheduleRequest: true,
  requireOwnerApprovalForReschedule: true,
  maxAdvanceBookingDays: 30,
  minNoticeHours: 2,
  spamProtectionEnabled: true,
  maxBookingsPerPhonePerDay: 3,
  maxBookingsPerIpPerDay: 5,
  blockRepeatedNoShowPhone: true,
  noShowThreshold: 2,
  requireContactConsent: true,
  requireOtpForBooking: false
};

export type SelfServiceAppointmentResult = 
  | { kind: 'success'; appointment: Appointment; tokenObj: AppointmentAccessToken; rawData: any }
  | { kind: 'invalid_token'; reasonCode: 'invalid_token' | 'TOKEN_EXPIRED' | 'TOKEN_LOOKUP_RATE_LIMITED' | string }
  | { kind: 'service_error'; message: string; reasonCode?: string };

export class RescheduleSlotConflictError extends Error {
  readonly code = 'SLOT_ALREADY_BOOKED';
  readonly statusCode = 409;
  constructor(message = 'Talep edilen saat dilimi başka bir randevu tarafından rezerve edilmiştir (SLOT_ALREADY_BOOKED).') {
    super(message);
    this.name = 'RescheduleSlotConflictError';
  }
}

export interface SafeRescheduleResult {
  success: boolean;
  statusCode: 201 | 200 | 409 | 400 | 500;
  code: 'RESCHEDULE_REQUESTED' | 'SLOT_ALREADY_BOOKED' | 'REQUEST_ALREADY_PENDING' | 'INVALID_INPUT' | 'INTERNAL_ERROR';
  changeRequest?: AppointmentChangeRequest;
  message?: string;
  reasonCode?: string;
}

export const appointmentSelfServiceService = {
  // Asynchronous replacement for loaded tokens
  async getAllTokensAsync(tenantId: string): Promise<AppointmentAccessToken[]> {
    const repo = getSelfServiceRepository();
    const list = await repo.listTokens(tenantId);
    return list.map(t => ({
      id: t.id,
      tenantId: t.tenantId,
      appointmentId: t.appointmentId,
      tokenHash: t.tokenHash,
      purpose: 'view', // mapped
      status: t.usedAt ? 'used' : 'active',
      expiresAt: t.expiresAt,
      createdAt: t.createdAt
    }));
  },

  // Asynchronous replacement for loaded change requests
  async getAllChangeRequestsAsync(tenantId: string): Promise<AppointmentChangeRequest[]> {
    const repo = getSelfServiceRepository();
    const list = await repo.listChangeRequests(tenantId);
    return list.map(r => ({
      id: r.id,
      tenantId: r.tenantId,
      appointmentId: r.appointmentId,
      customerId: r.customerId || '',
      type: r.requestType === 'cancellation' ? 'cancellation' : 'reschedule',
      status: r.status === 'applied' ? 'applied' : r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'requested',
      reason: r.reason,
      requestedDateTime: r.proposedDate && r.proposedTime ? `${r.proposedDate} ${r.proposedTime}` : r.requestedDateTime,
      customerNote: r.reason,
      createdAt: r.createdAt,
      updatedAt: r.createdAt
    }));
  },

  // Helper to load booking policy for a tenant
  getBookingPolicy(tenantId: string): BookingPolicy {
    if (typeof window === 'undefined') {
      return memoryPolicies.get(tenantId) || DEFAULT_BOOKING_POLICY;
    }
    try {
      const stored = localStorage.getItem(DYNAMIC_STORAGE_KEYS.tenantBookingPolicy(tenantId));
      if (stored) {
        return { ...DEFAULT_BOOKING_POLICY, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error('Failed to parse booking policy for tenant ' + tenantId, e);
    }
    return memoryPolicies.get(tenantId) || DEFAULT_BOOKING_POLICY;
  },

  // Helper to save booking policy for a tenant
  saveBookingPolicy(tenantId: string, policy: Partial<BookingPolicy>): BookingPolicy {
    const current = this.getBookingPolicy(tenantId);
    const updated = { ...current, ...policy };
    memoryPolicies.set(tenantId, updated);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(DYNAMIC_STORAGE_KEYS.tenantBookingPolicy(tenantId), JSON.stringify(updated));
      } catch {}
    }
    return updated;
  },

  // Helper to load failure records
  getStoredTokenFailures(): Map<string, TokenLookupFailureRecord> {
    if (typeof window === 'undefined') return memoryTokenLookupFailures;
    try {
      const raw = localStorage.getItem(TOKEN_LOOKUP_FAILURES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const map = new Map<string, TokenLookupFailureRecord>();
        for (const [k, v] of Object.entries(parsed)) {
          map.set(k, v as TokenLookupFailureRecord);
        }
        return map;
      }
    } catch {}
    return memoryTokenLookupFailures;
  },

  saveStoredTokenFailures(failures: Map<string, TokenLookupFailureRecord>): void {
    memoryTokenLookupFailures = failures;
    if (typeof window !== 'undefined') {
      try {
        const obj: Record<string, TokenLookupFailureRecord> = {};
        for (const [k, v] of failures.entries()) {
          obj[k] = v;
        }
        localStorage.setItem(TOKEN_LOOKUP_FAILURES_KEY, JSON.stringify(obj));
      } catch {}
    }
  },

  resolveClientKeys(context?: ClientSecurityContext): string[] {
    const keys: string[] = [];
    const cleanIp = context?.clientIp ? context.clientIp.trim().toLowerCase() : '';
    const cleanFp = context?.clientFingerprint ? context.clientFingerprint.trim().toLowerCase() : '';
    
    if (cleanIp) keys.push(`ip:${cleanIp}`);
    if (cleanFp) keys.push(`fp:${cleanFp}`);
    if (cleanIp && cleanFp) keys.push(`combo:${cleanIp}:${cleanFp}`);

    if (keys.length === 0) {
      if (typeof window !== 'undefined') {
        try {
          let deviceFp = localStorage.getItem(STORAGE_KEYS.CLIENT_DEVICE_FINGERPRINT);
          if (!deviceFp) {
            deviceFp = `dev_${bytesToHex(getSecureRandomBytes(16))}`;
            localStorage.setItem(STORAGE_KEYS.CLIENT_DEVICE_FINGERPRINT, deviceFp);
          }
          keys.push(`fp:${deviceFp}`);
        } catch {
          keys.push('ctx:browser_anonymous');
        }
      } else {
        keys.push('ctx:anonymous_default');
      }
    }
    return keys;
  },

  checkRateLimit(context?: ClientSecurityContext): { allowed: boolean; reasonCode?: string; retryAfterSeconds?: number } {
    const keys = this.resolveClientKeys(context);
    const failures = this.getStoredTokenFailures();
    const now = Date.now();

    for (const key of keys) {
      const record = failures.get(key);
      if (!record) continue;

      if (record.lockedUntil && now < record.lockedUntil) {
        const remainingSec = Math.ceil((record.lockedUntil - now) / 1000);
        return {
          allowed: false,
          reasonCode: 'TOKEN_LOOKUP_RATE_LIMITED',
          retryAfterSeconds: remainingSec
        };
      }

      // If failedCount reached 5 within the 15-minute window, lock it!
      if (record.failedCount >= MAX_CONSECUTIVE_FAILED_LOOKUPS && (now - record.lastFailedAt) < LOOKUP_LOCKOUT_DURATION_MS) {
        record.lockedUntil = now + LOOKUP_LOCKOUT_DURATION_MS;
        failures.set(key, record);
        this.saveStoredTokenFailures(failures);
        return {
          allowed: false,
          reasonCode: 'TOKEN_LOOKUP_RATE_LIMITED',
          retryAfterSeconds: Math.ceil(LOOKUP_LOCKOUT_DURATION_MS / 1000)
        };
      }
    }

    return { allowed: true, reasonCode: 'ok' };
  },

  recordLookupFailure(context?: ClientSecurityContext): { locked: boolean; failedCount: number } {
    const keys = this.resolveClientKeys(context);
    const failures = this.getStoredTokenFailures();
    const now = Date.now();
    let isNowLocked = false;
    let maxCount = 0;

    for (const key of keys) {
      let record = failures.get(key);
      if (!record) {
        record = {
          key,
          failedCount: 1,
          lockedUntil: null,
          lastFailedAt: now
        };
      } else {
        if (record.lockedUntil && now < record.lockedUntil) {
          // Already locked, extend or maintain lock
          record.failedCount += 1;
          record.lastFailedAt = now;
        } else if (record.lockedUntil && now >= record.lockedUntil) {
          // Lock expired, reset to 1
          record.failedCount = 1;
          record.lockedUntil = null;
          record.lastFailedAt = now;
        } else if ((now - record.lastFailedAt) > LOOKUP_LOCKOUT_DURATION_MS) {
          // Window expired without reaching limit, reset to 1
          record.failedCount = 1;
          record.lastFailedAt = now;
        } else {
          record.failedCount += 1;
          record.lastFailedAt = now;
          if (record.failedCount >= MAX_CONSECUTIVE_FAILED_LOOKUPS) {
            record.lockedUntil = now + LOOKUP_LOCKOUT_DURATION_MS;
            isNowLocked = true;
          }
        }
      }

      if (record.lockedUntil && now < record.lockedUntil) {
        isNowLocked = true;
      }
      if (record.failedCount > maxCount) {
        maxCount = record.failedCount;
      }

      failures.set(key, record);
    }

    this.saveStoredTokenFailures(failures);
    return { locked: isNowLocked, failedCount: maxCount };
  },

  recordLookupSuccess(context?: ClientSecurityContext): void {
    const keys = this.resolveClientKeys(context);
    const failures = this.getStoredTokenFailures();
    const now = Date.now();

    for (const key of keys) {
      const record = failures.get(key);
      if (record && (!record.lockedUntil || now >= record.lockedUntil)) {
        // Reset failures on verified lookup only if not actively locked
        record.failedCount = 0;
        record.lockedUntil = null;
        failures.set(key, record);
      }
    }

    this.saveStoredTokenFailures(failures);
  },

  resetRateLimitRegistry(): void {
    memoryTokenLookupFailures.clear();
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(TOKEN_LOOKUP_FAILURES_KEY);
      } catch {}
    }
  },

  // Part 3: createAppointmentAccessToken
  async createAppointmentAccessToken(
    tenantId: string, 
    appointmentId: string, 
    purpose: AppointmentAccessToken['purpose'] = 'view'
  ): Promise<string> {
    const repo = getSelfServiceRepository();
    
    // Generate secure 256-bit CSPRNG plain token and ID
    const token = generateSecureToken();
    const id = generateSecureId('tok_');
    
    // Compute cryptographic SHA-256 digest
    const tokenHash = await computeSha256(token);
    
    // 7 days expiration default
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    
    await repo.createToken(tenantId, {
      id,
      appointmentId,
      tokenHash,
      expiresAt,
      purpose,
      createdAt: new Date().toISOString()
    });

    try {
      auditLogService.logAuditEvent({
        tenantId,
        actorType: 'system',
        category: 'customer_self_service',
        severity: 'info',
        action: 'self_service_token_created',
        entityType: 'AppointmentAccessToken',
        entityId: id,
        summary: `Hizmet erişim bağlantı belirteci oluşturuldu: [Amaç: ${purpose}]`,
        safeDetails: {
          tokenId: id,
          appointmentId,
          purpose,
          expiresAt
        }
      });
    } catch (e) {
      console.error('Audit logging for token creation failed:', e);
    }

    return token;
  },

  // Part 3: validateAppointmentAccessToken
  async validateAppointmentAccessToken(token: string, clientContext?: ClientSecurityContext): Promise<boolean> {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      this.recordLookupFailure(clientContext);
      return false;
    }

    const rateCheck = this.checkRateLimit(clientContext);
    if (!rateCheck.allowed) {
      return false;
    }

    const trimmed = token.trim();
    const tokenHash = await computeSha256(trimmed);
    const repo = getSelfServiceRepository();
    let tokenObj = await repo.getTokenByHash(tokenHash);
    if (!tokenObj) {
      // Legacy compatibility
      tokenObj = await repo.getTokenByHash(trimmed);
    }
    
    if (!tokenObj) {
      this.recordLookupFailure(clientContext);
      return false;
    }
    if (tokenObj.usedAt) {
      this.recordLookupFailure(clientContext);
      return false;
    }
    
    const expired = new Date(tokenObj.expiresAt).getTime() < Date.now();
    if (expired) {
      this.recordLookupFailure(clientContext);
      return false;
    }
    
    this.recordLookupSuccess(clientContext);
    return true;
  },

  async getAppointmentByManageToken(
    token: string, 
    clientContext?: ClientSecurityContext
  ): Promise<SelfServiceAppointmentResult> {
    // 1. Client-side / In-memory Rate Limiting Check
    const rateCheck = this.checkRateLimit(clientContext);
    if (!rateCheck.allowed) {
      return { kind: 'invalid_token', reasonCode: 'TOKEN_LOOKUP_RATE_LIMITED' };
    }

    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      this.recordLookupFailure(clientContext);
      return { kind: 'invalid_token', reasonCode: 'invalid_token' };
    }

    const trimmedToken = token.trim();

    try {
      const { getDataSourceMode } = await import('./dataSourceConfig');
      if (getDataSourceMode() === 'supabase') {
        const { fetchSupabase } = await import('./repositories/supabaseClient');
        const payload: Record<string, any> = { p_token: trimmedToken };
        if (clientContext?.clientFingerprint) {
          payload.p_client_fingerprint = clientContext.clientFingerprint.trim().toLowerCase();
        }
        if (clientContext?.clientIp) {
          payload.p_client_ip = clientContext.clientIp.trim().toLowerCase();
        }

        const res = await fetchSupabase('/rest/v1/rpc/get_public_appointment_by_manage_token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          console.error(`[SelfService] RPC HTTP Error ${res.status}: ${res.statusText}`);
          return { kind: 'service_error', message: `HTTP ${res.status}` };
        }

        const data = await res.json();
        if (!data || typeof data !== 'object') {
          return { kind: 'service_error', message: 'Malformed server response' };
        }

        if (!data.success) {
          const failRes = this.recordLookupFailure(clientContext);
          if (failRes.failedCount > MAX_CONSECUTIVE_FAILED_LOOKUPS || data.reason_code === 'TOKEN_LOOKUP_RATE_LIMITED') {
            return { kind: 'invalid_token', reasonCode: 'TOKEN_LOOKUP_RATE_LIMITED' };
          }
          const reasonCode = data.reason_code || 'invalid_token';
          return { kind: 'invalid_token', reasonCode };
        }

        const apt = data.appointment;
        if (!apt || !apt.id) {
          const failRes = this.recordLookupFailure(clientContext);
          if (failRes.failedCount > MAX_CONSECUTIVE_FAILED_LOOKUPS) {
            return { kind: 'invalid_token', reasonCode: 'TOKEN_LOOKUP_RATE_LIMITED' };
          }
          return { kind: 'invalid_token', reasonCode: 'invalid_token' };
        }

        this.recordLookupSuccess(clientContext);

        const appointment: Appointment = {
          id: apt.id,
          tenantId: apt.tenant_id || '',
          branchId: apt.branch?.id || '',
          serviceId: apt.service?.id || '',
          staffId: apt.staff?.id || '',
          customerId: apt.customer_id || '',
          userId: apt.customer_id || '',
          date: apt.appointment_date,
          time: apt.appointment_time,
          durationMinutes: apt.duration_minutes || 30,
          status: apt.status || 'confirmed',
          notes: apt.notes || '',
          user_name: apt.customer_name || '',
          user_email: apt.customer_email || '',
          phone: apt.customer_phone || '',
          createdAt: new Date().toISOString(),
          syncedToGoogle: false
        };

        const tokenObj: AppointmentAccessToken = {
          id: apt.id,
          tenantId: apt.tenant_id || '',
          appointmentId: apt.id,
          tokenHash: '',
          purpose: 'view',
          status: 'active',
          expiresAt: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
          createdAt: new Date().toISOString()
        };

        return { kind: 'success', appointment, tokenObj, rawData: apt };
      }
    } catch (err: any) {
      console.error('[SelfService] Transport exception:', err);
      return { kind: 'service_error', message: err?.message || 'Network exception' };
    }

    // Local / Mock fallback mode only
    const repo = getSelfServiceRepository();
    const tokenHash = await computeSha256(trimmedToken);
    let tokenObj = await repo.getTokenByHash(tokenHash);
    if (!tokenObj) {
      tokenObj = await repo.getTokenByHash(trimmedToken);
    }

    if (!tokenObj) {
      const failRes = this.recordLookupFailure(clientContext);
      if (failRes.failedCount > MAX_CONSECUTIVE_FAILED_LOOKUPS) {
        return { kind: 'invalid_token', reasonCode: 'TOKEN_LOOKUP_RATE_LIMITED' };
      }
      return { kind: 'invalid_token', reasonCode: 'invalid_token' };
    }
    
    const isExpired = new Date(tokenObj.expiresAt).getTime() < Date.now();
    if (isExpired || tokenObj.usedAt) {
      const failRes = this.recordLookupFailure(clientContext);
      if (failRes.failedCount > MAX_CONSECUTIVE_FAILED_LOOKUPS) {
        return { kind: 'invalid_token', reasonCode: 'TOKEN_LOOKUP_RATE_LIMITED' };
      }
      // Zero PII leakage on expired or used tokens!
      return { kind: 'invalid_token', reasonCode: 'TOKEN_EXPIRED' };
    }

    try {
      const appointment = await getBookingRepository().getAppointmentById(tokenObj.appointmentId);
      if (!appointment || appointment.tenantId !== tokenObj.tenantId) {
        // Cross-tenant mismatch protection
        const failRes = this.recordLookupFailure(clientContext);
        if (failRes.failedCount > MAX_CONSECUTIVE_FAILED_LOOKUPS) {
          return { kind: 'invalid_token', reasonCode: 'TOKEN_LOOKUP_RATE_LIMITED' };
        }
        return { kind: 'invalid_token', reasonCode: 'invalid_token' };
      }
      
      this.recordLookupSuccess(clientContext);

      const mappedTokenObj: AppointmentAccessToken = {
        id: tokenObj.id,
        tenantId: tokenObj.tenantId,
        appointmentId: tokenObj.appointmentId,
        tokenHash: tokenObj.tokenHash,
        purpose: 'view',
        status: 'active',
        expiresAt: tokenObj.expiresAt,
        createdAt: tokenObj.createdAt || new Date().toISOString()
      };

      return { kind: 'success', appointment, tokenObj: mappedTokenObj, rawData: null };
    } catch (e) {
      return { kind: 'service_error', message: 'Local lookup failed' };
    }
  },

  // Part 3: getAppointmentByAccessToken
  async getAppointmentByAccessToken(
    token: string, 
    clientContext?: ClientSecurityContext
  ): Promise<{ appointment: Appointment; tokenObj: AppointmentAccessToken } | null> {
    const result = await this.getAppointmentByManageToken(token, clientContext);
    if (result.kind === 'success') {
      return { appointment: result.appointment, tokenObj: result.tokenObj };
    }
    return null;
  },

  // Part 3: revokeAppointmentAccessToken
  async revokeAppointmentAccessToken(tokenId: string): Promise<boolean> {
    const repo = getSelfServiceRepository();
    await repo.updateToken(tokenId, { usedAt: new Date().toISOString() });
    return true;
  },

  // Part 3: expireAppointmentAccessTokens (legacy sync bypass)
  expireAppointmentAccessTokens(): void {
    // Left as no-op to prevent sync compile errors since Supabase db handles expiration or we check dynamically in validateAppointmentAccessToken
  },

  // Helpers to calculate timing
  getAppointmentDateDetails(aptDate: string, aptTime: string): Date {
    // aptDate comes as YYYY-MM-DD, aptTime as HH:mm
    return new Date(`${aptDate}T${aptTime}:00`);
  },

  isCancellationLate(appointment: Appointment, policy: BookingPolicy): boolean {
    const aptTime = this.getAppointmentDateDetails(appointment.date, appointment.time).getTime();
    const cancelDeadline = aptTime - (policy.cancellationWindowHours * 60 * 60 * 1000);
    return Date.now() > cancelDeadline;
  },

  // Part 3: requestAppointmentCancellation
  async requestAppointmentCancellation(token: string, reason: string): Promise<{ changeRequest?: AppointmentChangeRequest; success: boolean; autoApplied: boolean; message: string }> {
    const validation = await this.getAppointmentByAccessToken(token);
    if (!validation) {
      return { success: false, autoApplied: false, message: 'Geçersiz veya süresi dolmuş bağlantı.' };
    }

    const { appointment, tokenObj } = validation;
    const policy = this.getBookingPolicy(tokenObj.tenantId);

    if (!policy.allowCustomerCancellation) {
      return { success: false, autoApplied: false, message: 'Bu işletme için müşteri iptali devre dışı bırakılmıştır.' };
    }

    const isLate = this.isCancellationLate(appointment, policy);
    const repo = getSelfServiceRepository();
    const id = generateSecureId('req_');

    const newRequest: AppointmentChangeRequest = {
      id,
      tenantId: tokenObj.tenantId,
      appointmentId: appointment.id,
      customerId: appointment.customerId,
      type: 'cancellation',
      status: 'requested',
      reason,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    let autoApplied = false;
    let finalMessage = 'İptal talebiniz onay için işletmeye iletilmiştir.';

    // In Supabase mode, execute via SECURITY DEFINER token cancellation RPC
    const { getDataSourceMode } = await import('./dataSourceConfig');
    if (getDataSourceMode() === 'supabase') {
      try {
        const { fetchSupabase } = await import('./repositories/supabaseClient');
        const rpcRes = await fetchSupabase('/rest/v1/rpc/cancel_public_appointment_by_manage_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_token: token.trim(),
            p_reason: reason?.trim() || null
          })
        });

        if (!rpcRes.ok) {
          console.error(`[SelfService] cancel RPC HTTP ${rpcRes.status}`);
          return { success: false, autoApplied: false, message: 'İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin.' };
        }

        const rpcData = await rpcRes.json();
        if (!rpcData?.success) {
          if (rpcData?.reason_code === 'invalid_transition') {
            return { success: false, autoApplied: false, message: 'Bu randevu mevcut durumundan iptal edilemez.' };
          }
          return { success: false, autoApplied: false, message: 'Geçersiz veya süresi dolmuş bağlantı.' };
        }

        return { success: true, autoApplied: true, message: 'Randevunuz iptal edilmiştir.' };
      } catch (err: any) {
        console.error('[SelfService] cancel RPC exception:', err);
        return { success: false, autoApplied: false, message: 'İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin.' };
      }
    }

    // If cancellation is within the free window (not late), we can auto-apply if the tenant settings allow 
    // or auto-apply by default for non-late cancellations.
    if (!isLate) {
      autoApplied = true;
      newRequest.status = 'applied';
      newRequest.reviewedAt = new Date().toISOString();
      newRequest.reviewedBy = 'system';
      
      // Update appointment status in repository
      await getBookingRepository().cancelAppointment(appointment.id, reason, 'customer');
      await getBookingRepository().updateAppointment(appointment.id, { 
        status: 'cancelled_by_customer',
        cancelReason: reason,
        cancelledAt: new Date().toISOString(),
        cancelledBy: 'customer'
      });
      
      // Mark token as used
      await repo.updateToken(tokenObj.id, { usedAt: new Date().toISOString() });
      
      finalMessage = 'Randevunuz iptal edilmiştir.';
    } else {
      // Late cancellation is requested for owner review
      finalMessage = 'Randevunuza 24 saatten az süre kaldığı için iptal talebiniz salon onayına gönderilmiştir.';
    }

    await repo.createChangeRequest(tokenObj.tenantId, {
      id,
      appointmentId: appointment.id,
      requestType: 'cancellation',
      requestedBy: 'customer',
      proposedDate: null,
      proposedTime: null,
      reason,
      status: newRequest.status,
      createdAt: newRequest.createdAt
    });

    try {
      auditLogService.logAuditEvent({
        tenantId: tokenObj.tenantId,
        actorType: 'customer',
        category: 'customer_self_service',
        severity: autoApplied ? 'warning' : 'notice',
        action: autoApplied ? 'appointment_cancelled' : 'appointment_cancellation_requested',
        entityType: 'AppointmentChangeRequest',
        entityId: id,
        summary: autoApplied 
          ? `Müşteri randevuyu kendi iptal etti (${appointment.user_name || 'Müşteri'})`
          : `Müşteri randevu iptal talebi oluşturdu (${appointment.user_name || 'Müşteri'})`,
        safeDetails: {
          requestId: id,
          appointmentId: appointment.id,
          reason,
          autoApplied
        }
      });
    } catch (e) {
      console.error('Audit logging for cancellation request failed:', e);
    }

    // Queue communications outbox events
    try {
      const tenant = await tenantService.getTenantById(tokenObj.tenantId);
      const bizName = tenant?.branding?.businessName || tenant?.name || 'Güzellik Salonu';
      
      communicationEventService.queueCommunicationEvent({
        tenantId: tokenObj.tenantId,
        customerId: appointment.id, // fallback mapping
        appointmentId: appointment.id,
        audience: 'customer',
        channel: 'whatsapp',
        type: autoApplied ? 'booking_cancelled' : 'cancellation_request_created' as any,
        contextArgs: {
          customerName: appointment.user_name || 'Müşteri',
          businessName: bizName,
          serviceName: 'Hizmet',
          date: appointment.date,
          time: appointment.time,
          reason: reason
        }
      });
    } catch (e) {
      console.error('Failed to queue cancellation comms', e);
    }

    return { 
      changeRequest: newRequest, 
      success: true, 
      autoApplied, 
      message: finalMessage 
    };
  },

  // Part 3: requestAppointmentReschedule
  async requestAppointmentReschedule(token: string, requestedDateTime: string, note: string): Promise<{ changeRequest?: AppointmentChangeRequest; success: boolean; message: string; reasonCode?: string }> {
    const validation = await this.getAppointmentByAccessToken(token);
    if (!validation) {
      return { success: false, message: 'Geçersiz veya süresi dolmuş bağlantı.', reasonCode: 'invalid_token' };
    }

    const { appointment, tokenObj } = validation;
    const policy = this.getBookingPolicy(tokenObj.tenantId);

    if (!policy.allowCustomerRescheduleRequest) {
      return { success: false, message: 'Bu işletme için randevu erteleme/değişiklik talebi devre dışı bırakılmıştır.', reasonCode: 'reschedule_disabled' };
    }

    return withSelfServiceTenantLock(tokenObj.tenantId, async () => {
      const [proposedDate, proposedTime] = requestedDateTime.split(' ');

      // Check duplicate pending request
      const existingRequests = await this.getAllChangeRequestsAsync(tokenObj.tenantId);
      const hasPending = existingRequests.some(r => 
        r.appointmentId === appointment.id && 
        r.type === 'reschedule' && 
        (r.status === 'requested' || r.status === 'pending')
      );
      if (hasPending) {
        return {
          success: false,
          message: 'Bu randevu için halihazırda bekleyen bir erteleme talebi bulunmaktadır.',
          reasonCode: 'request_already_pending'
        };
      }

      // Check slot conflict against active appointments for this staff
      const bookingRepo = getBookingRepository();
      const allAppointments = await bookingRepo.listAppointments(tokenObj.tenantId);
      const targetStaffId = appointment.staffId || (appointment as any).staff_id;
      const isSlotOccupied = allAppointments.some(a => {
        if (a.id === appointment.id) return false;
        if (a.status !== 'confirmed' && a.status !== 'completed') return false;
        const sId = a.staffId || (a as any).staff_id;
        if (targetStaffId && sId && sId !== targetStaffId) return false;
        const aDate = a.date || (a as any).appointment_date;
        const aTime = a.time || (a as any).appointment_time;
        return aDate === proposedDate && aTime === proposedTime;
      });

      const isSlotClaimedByPendingReschedule = existingRequests.some(r => {
        if (r.appointmentId === appointment.id) return false;
        if (r.type !== 'reschedule') return false;
        if (r.status !== 'requested' && r.status !== 'pending') return false;

        if (targetStaffId) {
          const reqAppt = allAppointments.find(a => a.id === r.appointmentId);
          const reqStaffId = reqAppt ? (reqAppt.staffId || (reqAppt as any).staff_id) : null;
          if (reqStaffId && reqStaffId !== targetStaffId) {
            return false;
          }
        }

        const dateMatch = ((r as any).proposedDate === proposedDate) ||
          (r.requestedDateTime && r.requestedDateTime.startsWith(proposedDate));
        const timeMatch = ((r as any).proposedTime === proposedTime) ||
          (r.requestedDateTime && r.requestedDateTime.endsWith(proposedTime));

        return Boolean(dateMatch && timeMatch);
      });

      if (isSlotOccupied || isSlotClaimedByPendingReschedule) {
        return {
          success: false,
          message: 'Seçilen saat dilimi doludur (SLOT_ALREADY_BOOKED).',
          reasonCode: 'SLOT_ALREADY_BOOKED'
        };
      }

      const repo = getSelfServiceRepository();
      const id = generateSecureId('req_');

      const newRequest: AppointmentChangeRequest = {
        id,
        tenantId: tokenObj.tenantId,
        appointmentId: appointment.id,
        customerId: appointment.customerId,
        type: 'reschedule',
        status: 'requested',
        requestedDateTime, // Should be "YYYY-MM-DD HH:mm"
        customerNote: note,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await repo.createChangeRequest(tokenObj.tenantId, {
        id,
        appointmentId: appointment.id,
        requestType: 'reschedule',
        requestedBy: 'customer',
        proposedDate: proposedDate || null,
        proposedTime: proposedTime || null,
        reason: note,
        status: 'requested',
        createdAt: newRequest.createdAt
      });

      try {
        auditLogService.logAuditEvent({
          tenantId: tokenObj.tenantId,
          actorType: 'customer',
          category: 'customer_self_service',
          severity: 'notice',
          action: 'appointment_reschedule_requested',
          entityType: 'AppointmentChangeRequest',
          entityId: id,
          summary: `Müşteri randevu erteleme talebi oluşturdu (${appointment.user_name || 'Müşteri'})`,
          safeDetails: {
            requestId: id,
            appointmentId: appointment.id,
            requestedDateTime,
            note
          }
        });
      } catch (e) {
        console.error('Audit logging for reschedule request failed:', e);
      }

      // Queue communications outbox
      try {
        const tenant = await tenantService.getTenantById(tokenObj.tenantId);
        const bizName = tenant?.branding?.businessName || tenant?.name || 'Güzellik Salonu';
        
        communicationEventService.queueCommunicationEvent({
          tenantId: tokenObj.tenantId,
          customerId: appointment.id,
          appointmentId: appointment.id,
          audience: 'customer',
          channel: 'whatsapp',
          type: 'reschedule_request_created' as any,
          contextArgs: {
            customerName: appointment.user_name || 'Müşteri',
            businessName: bizName,
            date: appointment.date,
            time: appointment.time,
            newDate: proposedDate || '',
            newTime: proposedTime || '',
            notes: note
          }
        });
      } catch (e) {
        console.error('Failed to queue reschedule request comms', e);
      }

      return {
        changeRequest: newRequest,
        success: true,
        message: 'Değişiklik talebiniz işletmeye iletildi.',
        reasonCode: 'ok'
      };
    });
  },

  /**
   * Stage F1 — Secure RPC wrapper for public.request_public_appointment_reschedule_by_manage_token.
   * Unauthenticated/authenticated RPC call for requesting appointment rescheduling via manage token.
   */
  async requestRescheduleByManageToken(params: {
    token: string;
    requestedDate: string;
    requestedTime: string;
    reason?: string;
    idempotencyKey?: string;
  }): Promise<{
    success: boolean;
    reasonCode: string;
    changed?: boolean;
    appointmentId?: string;
    changeRequestId?: string;
    proposedDate?: string;
    proposedTime?: string;
    message?: string;
  }> {
    if (!params.token || !params.requestedDate || !params.requestedTime) {
      return { success: false, reasonCode: 'invalid_parameters', message: 'Eksik veya geçersiz parametre.' };
    }

    const { supabase } = await import('./supabaseClient');

    const idempotencyKey = params.idempotencyKey || generateSecureId('resched_');

    const { data, error } = await supabase.rpc('request_public_appointment_reschedule_by_manage_token', {
      p_token: params.token.trim(),
      p_requested_date: params.requestedDate,
      p_requested_time: params.requestedTime,
      p_reason: params.reason ? params.reason.trim() : null,
      p_idempotency_key: idempotencyKey
    });

    if (error) {
      console.error('[appointmentSelfServiceService] Reschedule RPC error:', error);
      return { success: false, reasonCode: 'service_error', message: 'Değişiklik talebi işlenirken hata oluştu.' };
    }

    const result = data as {
      success: boolean;
      reason_code: string;
      changed?: boolean;
      appointment_id?: string;
      change_request_id?: string;
      proposed_date?: string;
      proposed_time?: string;
    };

    return {
      success: result?.success || false,
      reasonCode: result?.reason_code || 'unknown_error',
      changed: result?.changed,
      appointmentId: result?.appointment_id,
      changeRequestId: result?.change_request_id,
      proposedDate: result?.proposed_date,
      proposedTime: result?.proposed_time
    };
  },

  /**
   * Stage F2 — Secure RPC wrapper for public.get_public_pending_reschedule_request_by_manage_token.
   */
  async getPendingRescheduleRequestByManageToken(token: string): Promise<{
    success: boolean;
    reasonCode: string;
    hasPendingRequest: boolean;
    changeRequestId?: string;
    proposedDate?: string;
    proposedTime?: string;
    status?: string;
    createdAt?: string;
  }> {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return { success: false, reasonCode: 'invalid_token', hasPendingRequest: false };
    }

    try {
      const { getDataSourceMode } = await import('./dataSourceConfig');
      if (getDataSourceMode() === 'supabase') {
        const { supabase } = await import('./supabaseClient');
        const { data, error } = await supabase.rpc('get_public_pending_reschedule_request_by_manage_token', {
          p_token: token.trim()
        });

        if (error) {
          console.error('[appointmentSelfServiceService] getPendingRescheduleRequest RPC error:', error);
          return { success: false, reasonCode: 'service_error', hasPendingRequest: false };
        }

        const res = data as any;
        return {
          success: res?.success || false,
          reasonCode: res?.reason_code || 'unknown_error',
          hasPendingRequest: !!res?.has_pending_request,
          changeRequestId: res?.change_request_id,
          proposedDate: res?.proposed_date,
          proposedTime: res?.proposed_time,
          status: res?.status,
          createdAt: res?.created_at
        };
      }
    } catch (e: any) {
      console.error('[appointmentSelfServiceService] getPendingRescheduleRequest exception:', e);
    }

    return { success: true, reasonCode: 'ok', hasPendingRequest: false };
  },

  /**
   * Stage F3 — Secure RPC wrapper for public.admin_list_pending_reschedule_requests.
   * Authenticated tenant_owner/super_admin RPC call for listing pending reschedule requests.
   */
  async adminListPendingRescheduleRequests(params?: {
    limit?: number;
    cursorCreatedAt?: string;
    cursorId?: string;
  }): Promise<{
    success: boolean;
    reasonCode: string;
    requests?: any[];
  }> {
    try {
      const { getDataSourceMode } = await import('./dataSourceConfig');
      if (getDataSourceMode() === 'supabase') {
        const { supabase } = await import('./supabaseClient');
        const { data, error } = await supabase.rpc('admin_list_pending_reschedule_requests', {
          p_limit: params?.limit || 50,
          p_cursor_created_at: params?.cursorCreatedAt || null,
          p_cursor_id: params?.cursorId || null
        });

        if (error) {
          console.error('[appointmentSelfServiceService] adminListPendingRescheduleRequests RPC error:', error);
          return { success: false, reasonCode: 'service_error' };
        }

        const res = data as any;
        return {
          success: res?.success || false,
          reasonCode: res?.reason_code || 'unknown_error',
          requests: res?.requests || []
        };
      } else {
        const repo = getSelfServiceRepository() as any;
        if (repo && typeof repo.listPendingRescheduleRequests === 'function') {
          const tenantId = (params as any)?.tenantId;
          const reqs = await repo.listPendingRescheduleRequests(tenantId);
          return { success: true, reasonCode: 'ok', requests: reqs };
        }
        return { success: true, reasonCode: 'ok', requests: [] };
      }
    } catch (e: any) {
      console.error('[appointmentSelfServiceService] adminListPendingRescheduleRequests exception:', e);
    }

    return { success: false, reasonCode: 'service_error' };
  },

  /**
   * Stage F3 — Secure RPC wrapper for public.admin_decide_reschedule_request.
   * Authenticated tenant_owner/super_admin RPC call for approving or rejecting a customer reschedule request.
   */
  async adminDecideRescheduleRequest(params: {
    changeRequestId: string;
    decision: 'approved' | 'rejected';
    reason?: string;
    idempotencyKey?: string;
  }): Promise<{
    success: boolean;
    reasonCode: string;
    changed?: boolean;
    decision?: string;
    changeRequestId?: string;
    appointmentId?: string;
    previousDate?: string;
    previousTime?: string;
    appointmentDate?: string;
    appointmentTime?: string;
    requestStatus?: string;
    appointmentStatus?: string;
  }> {
    if (!params.changeRequestId || !params.decision) {
      return { success: false, reasonCode: 'invalid_parameters' };
    }

    try {
      const { getDataSourceMode } = await import('./dataSourceConfig');
      if (getDataSourceMode() === 'supabase') {
        const { supabase } = await import('./supabaseClient');
        const idempotencyKey = params.idempotencyKey || generateSecureId('admin_dec_');
        const { data, error } = await supabase.rpc('admin_decide_reschedule_request', {
          p_change_request_id: params.changeRequestId,
          p_decision: params.decision,
          p_reason: params.reason ? params.reason.trim() : null,
          p_idempotency_key: idempotencyKey
        });

        if (error) {
          console.error('[appointmentSelfServiceService] adminDecideRescheduleRequest RPC error:', error);
          return { success: false, reasonCode: 'service_error' };
        }

        const res = data as any;
        return {
          success: res?.success || false,
          reasonCode: res?.reason_code || 'unknown_error',
          changed: res?.changed,
          decision: res?.decision,
          changeRequestId: res?.change_request_id,
          appointmentId: res?.appointment_id,
          previousDate: res?.previous_date,
          previousTime: res?.previous_time,
          appointmentDate: res?.appointment_date,
          appointmentTime: res?.appointment_time,
          requestStatus: res?.request_status,
          appointmentStatus: res?.appointment_status
        };
      } else {
        const repo = getSelfServiceRepository() as any;
        if (repo && typeof repo.decideRescheduleRequest === 'function') {
          return await repo.decideRescheduleRequest(params);
        }
      }
    } catch (e: any) {
      console.error('[appointmentSelfServiceService] adminDecideRescheduleRequest exception:', e);
    }

    return { success: false, reasonCode: 'service_error' };
  },

  // Part 3: confirmAppointmentByToken
  async confirmAppointmentByToken(token: string): Promise<boolean> {
    const validation = await this.getAppointmentByAccessToken(token);
    if (!validation) return false;

    const { appointment, tokenObj } = validation;
    const repo = getSelfServiceRepository();

    try {
      // Confirm the appointment status
      await getBookingRepository().updateAppointment(appointment.id, { 
        status: 'confirmed' 
      });

      // Mark token as used
      await repo.updateToken(tokenObj.id, { usedAt: new Date().toISOString() });

      try {
        auditLogService.logAuditEvent({
          tenantId: tokenObj.tenantId,
          actorType: 'customer',
          category: 'customer_self_service',
          severity: 'info',
          action: 'appointment_confirmed_by_customer',
          entityType: 'Appointment',
          entityId: appointment.id,
          summary: `Randevu müşteri tarafından bağlantı uyarısıyla onaylandı: (${appointment.user_name || 'Müşteri'})`,
          safeDetails: {
            appointmentId: appointment.id,
            tokenId: tokenObj.id
          }
        });
      } catch (ae) {
        console.error('Audit logging for customer confirm failed:', ae);
      }

      const tenant = await tenantService.getTenantById(tokenObj.tenantId);
      const bizName = tenant?.branding?.businessName || tenant?.name || 'Güzellik Salonu';

      // Queue outbox event
      communicationEventService.queueCommunicationEvent({
        tenantId: tokenObj.tenantId,
        customerId: appointment.id,
        appointmentId: appointment.id,
        audience: 'customer',
        channel: 'whatsapp',
        type: 'appointment_confirmed_by_customer' as any,
        contextArgs: {
          customerName: appointment.user_name || 'Müşteri',
          businessName: bizName,
          date: appointment.date,
          time: appointment.time
        }
      });

      return true;
    } catch (e) {
      console.error('Error confirming appointment by token', e);
      return false;
    }
  },

  // Part 3: getSelfServiceReadinessSummary
  async getSelfServiceReadinessSummary(tenantId: string) {
    const repo = getSelfServiceRepository();
    const tokens = await repo.listTokens(tenantId);
    const requests = await repo.listChangeRequests(tenantId);

    return {
      totalTokensGenerated: tokens.length,
      activeTokensCount: tokens.filter(t => !t.usedAt).length,
      totalRequestsCount: requests.length,
      pendingCancellations: requests.filter(r => r.requestType === 'cancellation' && r.status === 'requested').length,
      pendingReschedules: requests.filter(r => r.requestType === 'reschedule' && r.status === 'requested').length
    };
  },

  // Admin Actions to review change requests
  async reviewChangeRequest(
    tenantId: string, 
    requestId: string, 
    status: 'approved' | 'rejected', 
    ownerNote?: string
  ): Promise<boolean> {
    const repo = getSelfServiceRepository();
    const requests = await repo.listChangeRequests(tenantId);
    const req = requests.find(r => r.id === requestId);
    if (!req) return false;
    if (req.status !== 'requested') return false;

    try {
      const appointment = await getBookingRepository().getAppointmentById(req.appointmentId);
      if (!appointment) return false;

      const updatedStatus = status === 'approved' ? 'approved' : 'rejected';
      const resolvedAt = new Date().toISOString();

      const tenant = await tenantService.getTenantById(tenantId);
      const bizName = tenant?.branding?.businessName || tenant?.name || 'Güzellik Salonu';

      if (status === 'approved') {
        if (req.requestType === 'cancellation') {
          // Cancel appointment
          await getBookingRepository().cancelAppointment(appointment.id, req.reason || 'Müşteri iptal talebi', 'customer');
          await getBookingRepository().updateAppointment(appointment.id, {
            status: 'cancelled_by_customer',
            cancelReason: req.reason || 'Müşteri iptal talebi',
            cancelledAt: new Date().toISOString(),
            cancelledBy: 'customer'
          });
          
          await repo.updateChangeRequest(requestId, {
            status: 'applied',
            resolvedAt,
            resolvedBy: 'tenant_owner'
          });

          // Queue outbox approval event
          communicationEventService.queueCommunicationEvent({
            tenantId,
            customerId: appointment.id,
            appointmentId: appointment.id,
            audience: 'customer',
            channel: 'whatsapp',
            type: 'cancellation_request_approved' as any,
            contextArgs: {
              customerName: appointment.user_name || 'Müşteri',
              businessName: bizName,
              date: appointment.date,
              time: appointment.time,
              notes: ownerNote || ''
            }
          });
        } else if (req.requestType === 'reschedule' && req.proposedDate && req.proposedTime) {
          // Apply reschedule
          await getBookingRepository().updateAppointment(appointment.id, {
            date: req.proposedDate,
            time: req.proposedTime
          });
          
          await repo.updateChangeRequest(requestId, {
            status: 'applied',
            resolvedAt,
            resolvedBy: 'tenant_owner'
          });

          // Queue outbox approval event
          communicationEventService.queueCommunicationEvent({
            tenantId,
            customerId: appointment.id,
            appointmentId: appointment.id,
            audience: 'customer',
            channel: 'whatsapp',
            type: 'reschedule_request_approved' as any,
            contextArgs: {
              customerName: appointment.user_name || 'Müşteri',
              businessName: bizName,
              oldDate: appointment.date,
              oldTime: appointment.time,
              date: req.proposedDate,
              time: req.proposedTime,
              notes: ownerNote || ''
            }
          });
        }
      } else {
        // Rejected
        await repo.updateChangeRequest(requestId, {
          status: 'rejected',
          resolvedAt,
          resolvedBy: 'tenant_owner'
        });

        communicationEventService.queueCommunicationEvent({
          tenantId,
          customerId: appointment.id,
          appointmentId: appointment.id,
          audience: 'customer',
          channel: 'whatsapp',
          type: req.requestType === 'cancellation' ? 'cancellation_request_rejected' as any : 'reschedule_request_rejected' as any,
          contextArgs: {
            customerName: appointment.user_name || 'Müşteri',
            businessName: bizName,
            date: appointment.date,
            time: appointment.time,
            notes: ownerNote || ''
          }
        });
      }

      return true;
    } catch (e) {
      console.error('Error reviewing change request', e);
      return false;
    }
  }
};

export const requestRescheduleSafely = async (
  token: string,
  requestedDateTime: string,
  note: string
): Promise<SafeRescheduleResult> => {
  try {
    const res = await appointmentSelfServiceService.requestAppointmentReschedule(token, requestedDateTime, note);
    if (res.success) {
      return {
        success: true,
        statusCode: 201,
        code: 'RESCHEDULE_REQUESTED',
        changeRequest: res.changeRequest,
        message: res.message,
        reasonCode: 'ok'
      };
    }
    const rCode = res.reasonCode || '';
    if (rCode === 'SLOT_ALREADY_BOOKED' || rCode === 'slot_unavailable' || rCode === 'slot_conflict') {
      return {
        success: false,
        statusCode: 409,
        code: 'SLOT_ALREADY_BOOKED',
        message: res.message,
        reasonCode: 'SLOT_ALREADY_BOOKED'
      };
    }
    if (rCode === 'request_already_pending') {
      return {
        success: false,
        statusCode: 409,
        code: 'REQUEST_ALREADY_PENDING',
        message: res.message,
        reasonCode: 'request_already_pending'
      };
    }
    return {
      success: false,
      statusCode: 400,
      code: 'INVALID_INPUT',
      message: res.message,
      reasonCode: rCode || 'invalid_request'
    };
  } catch (err: any) {
    if (err instanceof RescheduleSlotConflictError || err?.code === 'SLOT_ALREADY_BOOKED' || err?.message?.includes('SLOT_ALREADY_BOOKED')) {
      return {
        success: false,
        statusCode: 409,
        code: 'SLOT_ALREADY_BOOKED',
        message: err.message,
        reasonCode: 'SLOT_ALREADY_BOOKED'
      };
    }
    return {
      success: false,
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: err?.message || 'Unknown error',
      reasonCode: 'internal_error'
    };
  }
};
