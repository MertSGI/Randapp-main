/**
 * Public Booking OTP Service (V1-WQ-07)
 * Implements secure OTP challenge request, verification, cooldown rate-limiting,
 * brute-force lockout, single-use token consumption, and synthetic test harness.
 * 
 * STRICT SECURITY INVARIANT:
 * LIVE SMS DISPATCH IS FORBIDDEN (LIVE_SMS_DISPATCH_FORBIDDEN = true).
 * All SMS deliveries are synthetic outbox records only (delivery_mode: 'synthetic_outbox_only').
 */

import { fetchSupabase } from './repositories/supabaseClient';

function isSupabaseConfigured(): boolean {
  try {
    const env: any = (import.meta as any).env || (globalThis as any).import?.meta?.env || (typeof process !== 'undefined' ? process.env : {}) || {};
    return !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY && env.VITE_SUPABASE_URL !== 'https://mock.supabase.co');
  } catch {
    return false;
  }
}

export const LIVE_SMS_DISPATCH_FORBIDDEN = true;
export const LIVE_WHATSAPP_DISPATCH_FORBIDDEN = true;
export const LIVE_DISPATCH_FORBIDDEN = true;

export interface OtpChallengeRequest {
  slug: string;
  phone: string;
  clientFingerprint?: string;
  syntheticOtp?: string;
  channel?: 'whatsapp' | 'sms';
}

export interface OtpChallengeResponse {
  success: boolean;
  challengeId?: string;
  expiresInSeconds?: number;
  cooldownRemainingSeconds?: number;
  reasonCode:
    | 'ok'
    | 'otp_rate_limited'
    | 'invalid_tenant'
    | 'invalid_phone'
    | 'booking_unavailable'
    | 'invalid_parameters'
    | 'temporary_failure';
  message?: string;
}

export interface OtpVerifyRequest {
  slug: string;
  challengeId: string;
  otpCode: string;
  phone: string;
}

export interface OtpVerifyResponse {
  success: boolean;
  verificationToken?: string;
  attemptsRemaining?: number;
  reasonCode:
    | 'ok'
    | 'otp_invalid'
    | 'otp_brute_force_locked'
    | 'otp_expired'
    | 'tenant_mismatch'
    | 'phone_mismatch'
    | 'invalid_challenge'
    | 'otp_already_consumed'
    | 'invalid_parameters'
    | 'temporary_failure';
  message?: string;
}

export interface SyntheticOutboxEntry {
  id: string;
  slug: string;
  phone: string;
  otpCode: string;
  challengeId: string;
  channel: 'whatsapp' | 'sms';
  deliveryMode: 'synthetic_outbox_only';
  createdAt: string;
}

interface LocalOtpChallenge {
  id: string;
  slug: string;
  phone: string;
  clientFingerprint?: string;
  otpCodeHash: string;
  status: 'pending' | 'verified' | 'consumed' | 'locked' | 'expired';
  attemptsCount: number;
  maxAttempts: number;
  verificationToken?: string;
  verificationTokenHash?: string;
  expiresAt: number;
  createdAt: number;
  verifiedAt?: number;
  consumedAt?: number;
}

// In-memory mock store for local/synthetic execution & test harness
const localChallenges: Map<string, LocalOtpChallenge> = new Map();
const reservedChallengeIds: Set<string> = new Set();
const syntheticOutbox: SyntheticOutboxEntry[] = [];

// Robust cryptographic SHA-256 helper (WebCrypto subtle in browsers, node:crypto in Node.js)
// Invariant (FINDING-ADIM010-008): Reversible fallback (sim_hash) is removed; fails closed if no crypto available.
async function computeSha256(input: string): Promise<string> {
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.subtle?.digest === 'function') {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const nodeCrypto = await import('node:crypto');
      return nodeCrypto.createHash('sha256').update(input, 'utf8').digest('hex');
    } catch {}
  }

  throw new Error('SEC_CRYPTO_UNAVAILABLE: Cryptographic SHA-256 implementation is required.');
}

function cleanPhoneNumber(phone?: string): string {
  return (phone || '').replace(/\s+/g, '');
}

export const publicBookingOtpService = {
  /**
   * Request an OTP challenge for public booking.
   * Enforces 60-second resend cooldown and hourly rate limit.
   * Records SMS strictly into synthetic outbox without live provider dispatch.
   */
  async requestOtp(request: OtpChallengeRequest): Promise<OtpChallengeResponse> {
    if (!request.slug || !request.slug.trim()) {
      return { success: false, reasonCode: 'invalid_parameters', message: 'Salon kimliği zorunludur.' };
    }
    const cleanPhone = cleanPhoneNumber(request.phone);
    if (!cleanPhone || cleanPhone.length < 7) {
      return { success: false, reasonCode: 'invalid_phone', message: 'Geçersiz telefon numarası.' };
    }

    if (isSupabaseConfigured()) {
      try {
        const syntheticOtpHash = request.syntheticOtp ? await computeSha256(request.syntheticOtp) : null;
        const res = await fetchSupabase('/rest/v1/rpc/request_public_booking_otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_slug: request.slug,
            p_customer_phone: cleanPhone,
            p_client_fingerprint: request.clientFingerprint || null,
            p_synthetic_otp_hash: syntheticOtpHash,
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          console.error('[publicBookingOtpService] request_public_booking_otp failed:', res.status, errText);
          return { success: false, reasonCode: 'temporary_failure' };
        }

        const raw = await res.json();
        const data = Array.isArray(raw) ? raw[0] : raw;
        return {
          success: data?.success === true,
          challengeId: data?.challenge_id,
          expiresInSeconds: data?.expires_in_seconds || 300,
          cooldownRemainingSeconds: data?.cooldown_remaining_seconds,
          reasonCode: data?.reason_code || (data?.success ? 'ok' : 'temporary_failure'),
        };
      } catch (err) {
        console.error('[publicBookingOtpService] requestOtp RPC exception:', err);
        return { success: false, reasonCode: 'temporary_failure' };
      }
    }

    // --- Local / Mock / Synthetic Harness Path ---
    const now = Date.now();

    // 1. Cooldown check (60 seconds)
    const existingChallenges = Array.from(localChallenges.values())
      .filter(c => c.slug === request.slug && c.phone === cleanPhone)
      .sort((a, b) => b.createdAt - a.createdAt);

    if (existingChallenges.length > 0) {
      const elapsedSeconds = Math.floor((now - existingChallenges[0].createdAt) / 1000);
      if (elapsedSeconds < 60) {
        const remaining = 60 - elapsedSeconds;
        return {
          success: false,
          reasonCode: 'otp_rate_limited',
          cooldownRemainingSeconds: remaining,
          message: `Lütfen yeni bir kod istemeden önce ${remaining} saniye bekleyin.`,
        };
      }
    }

    // 2. Hourly rate limit check (max 5 requests per hour)
    const oneHourAgo = now - 60 * 60 * 1000;
    const hourlyRequests = Array.from(localChallenges.values())
      .filter(c => c.slug === request.slug && c.phone === cleanPhone && c.createdAt > oneHourAgo);
    if (hourlyRequests.length >= 5) {
      return {
        success: false,
        reasonCode: 'otp_rate_limited',
        cooldownRemainingSeconds: 3600,
        message: 'Saatlik maksimum kod isteme sınırına ulaşıldı.',
      };
    }

    // 3. Generate 6-digit synthetic code and compute cryptographic SHA-256 (fail-closed if unavailable)
    const rawOtp = request.syntheticOtp || String(Math.floor(100000 + Math.random() * 900000));
    let otpHash: string;
    try {
      otpHash = await computeSha256(rawOtp);
    } catch (err) {
      console.error('[publicBookingOtpService] requestOtp crypto hash unavailable:', err);
      return {
        success: false,
        reasonCode: 'temporary_failure',
        message: 'Güvenlik doğrulama servisi geçici olarak kullanılamıyor.',
      };
    }
    const challengeId = `otp_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const newChallenge: LocalOtpChallenge = {
      id: challengeId,
      slug: request.slug,
      phone: cleanPhone,
      clientFingerprint: request.clientFingerprint,
      otpCodeHash: otpHash,
      status: 'pending',
      attemptsCount: 0,
      maxAttempts: 3,
      expiresAt: now + 5 * 60 * 1000,
      createdAt: now,
    };
    localChallenges.set(challengeId, newChallenge);

    // 4. Record to synthetic outbox only (LIVE SMS IS FORBIDDEN)
    const outboxEntry: SyntheticOutboxEntry = {
      id: `outbox_${now}_${Math.random().toString(36).substring(2, 7)}`,
      slug: request.slug,
      phone: cleanPhone,
      otpCode: rawOtp,
      challengeId,
      channel: request.channel || 'whatsapp',
      deliveryMode: 'synthetic_outbox_only',
      createdAt: new Date().toISOString(),
    };
    syntheticOutbox.push(outboxEntry);

    return {
      success: true,
      challengeId,
      expiresInSeconds: 300,
      reasonCode: 'ok',
    };
  },

  /**
   * Verify an OTP challenge.
   * Enforces brute-force lockout on max attempts and issues a single-use verification token.
   */
  async verifyOtp(request: OtpVerifyRequest): Promise<OtpVerifyResponse> {
    if (!request.slug || !request.challengeId || !request.otpCode || !request.phone) {
      return { success: false, reasonCode: 'invalid_parameters', message: 'Eksik doğrulama bilgileri.' };
    }
    const cleanPhone = cleanPhoneNumber(request.phone);

    if (isSupabaseConfigured()) {
      try {
        const res = await fetchSupabase('/rest/v1/rpc/verify_public_booking_otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_slug: request.slug,
            p_challenge_id: request.challengeId,
            p_otp_code: request.otpCode,
            p_customer_phone: cleanPhone,
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          console.error('[publicBookingOtpService] verify_public_booking_otp failed:', res.status, errText);
          return { success: false, reasonCode: 'temporary_failure' };
        }

        const raw = await res.json();
        const data = Array.isArray(raw) ? raw[0] : raw;
        return {
          success: data?.success === true,
          verificationToken: data?.verification_token,
          attemptsRemaining: data?.attempts_remaining,
          reasonCode: data?.reason_code || (data?.success ? 'ok' : 'temporary_failure'),
        };
      } catch (err) {
        console.error('[publicBookingOtpService] verifyOtp RPC exception:', err);
        return { success: false, reasonCode: 'temporary_failure' };
      }
    }

    // --- Local / Synthetic Harness Path ---
    const challenge = localChallenges.get(request.challengeId);
    if (!challenge) {
      return { success: false, reasonCode: 'invalid_challenge', message: 'Doğrulama oturumu bulunamadı.' };
    }

    if (challenge.slug !== request.slug) {
      return { success: false, reasonCode: 'tenant_mismatch', message: 'Oturum salon ile eşleşmiyor.' };
    }

    if (challenge.phone !== cleanPhone) {
      return { success: false, reasonCode: 'phone_mismatch', message: 'Telefon numarası eşleşmiyor.' };
    }

    if (challenge.status === 'locked' || challenge.attemptsCount >= challenge.maxAttempts) {
      return {
        success: false,
        reasonCode: 'otp_brute_force_locked',
        attemptsRemaining: 0,
        message: 'Çok fazla hatalı deneme nedeniyle bu doğrulama kilitlenmiştir.',
      };
    }

    const now = Date.now();
    if (challenge.expiresAt <= now || challenge.status === 'expired') {
      challenge.status = 'expired';
      return { success: false, reasonCode: 'otp_expired', message: 'Doğrulama kodunun süresi dolmuş.' };
    }

    if (challenge.status === 'consumed') {
      return { success: false, reasonCode: 'otp_already_consumed', message: 'Bu kod daha önce kullanılmış.' };
    }

    let inputHash: string;
    try {
      inputHash = await computeSha256(request.otpCode.trim());
    } catch (err) {
      console.error('[publicBookingOtpService] verifyOtp crypto hash unavailable:', err);
      return {
        success: false,
        reasonCode: 'temporary_failure',
        message: 'Güvenlik doğrulama servisi geçici olarak kullanılamıyor.',
      };
    }
    if (inputHash !== challenge.otpCodeHash) {
      challenge.attemptsCount++;
      if (challenge.attemptsCount >= challenge.maxAttempts) {
        challenge.status = 'locked';
        return {
          success: false,
          reasonCode: 'otp_brute_force_locked',
          attemptsRemaining: 0,
          message: 'Çok fazla hatalı kod girildi. Oturum kilitlendi.',
        };
      }
      return {
        success: false,
        reasonCode: 'otp_invalid',
        attemptsRemaining: challenge.maxAttempts - challenge.attemptsCount,
        message: `Hatalı doğrulama kodu. Kalan hakkınız: ${challenge.maxAttempts - challenge.attemptsCount}`,
      };
    }

    // Verification successful: hash token before committing verified status (fail-closed)
    const token = `vtok_${now}_${Math.random().toString(36).substring(2, 12)}`;
    let tokenHash: string;
    try {
      tokenHash = await computeSha256(token);
    } catch (err) {
      console.error('[publicBookingOtpService] verifyOtp token hash unavailable:', err);
      return {
        success: false,
        reasonCode: 'temporary_failure',
        message: 'Güvenlik doğrulama servisi geçici olarak kullanılamıyor.',
      };
    }
    challenge.status = 'verified';
    challenge.verifiedAt = now;
    challenge.verificationToken = token;
    challenge.verificationTokenHash = tokenHash;

    return {
      success: true,
      verificationToken: token,
      reasonCode: 'ok',
    };
  },

  /**
   * Synthetic test harness: retrieve synthetic outbox entries.
   */
  getSyntheticOutbox(phone?: string): SyntheticOutboxEntry[] {
    if (phone) {
      const cleanPhone = cleanPhoneNumber(phone);
      return syntheticOutbox.filter(e => e.phone === cleanPhone);
    }
    return [...syntheticOutbox];
  },

  /**
   * Synthetic test harness: retrieve last synthetic OTP code for phone.
   */
  getLastSyntheticOtp(phone: string): string | null {
    const list = this.getSyntheticOutbox(phone);
    if (list.length === 0) return null;
    return list[list.length - 1].otpCode;
  },

  /**
   * Reset the in-memory synthetic harness state.
   */
  clearSyntheticHarness(): void {
    localChallenges.clear();
    reservedChallengeIds.clear();
    syntheticOutbox.length = 0;
  },

  /**
   * Read-only metadata snapshot of a local synthetic OTP challenge (never exposes verificationToken).
   */
  getSyntheticChallengeAudit(
    challengeId: string
  ): Omit<LocalOtpChallenge, 'verificationToken' | 'verificationTokenHash'> | null {
    const ch = localChallenges.get(challengeId);
    if (!ch) return null;
    return {
      id: ch.id,
      slug: ch.slug,
      phone: ch.phone,
      clientFingerprint: ch.clientFingerprint,
      otpCodeHash: ch.otpCodeHash,
      status: ch.status,
      attemptsCount: ch.attemptsCount,
      maxAttempts: ch.maxAttempts,
      expiresAt: ch.expiresAt,
      createdAt: ch.createdAt,
      verifiedAt: ch.verifiedAt,
      consumedAt: ch.consumedAt,
    };
  },

  /**
   * Synchronously reserves a verified local OTP token before appointment creation.
   * Prevents concurrent duplicate submissions while deferring consumed state until booking succeeds.
   */
  reserveVerificationTokenLocal(
    token: string,
    slug: string,
    phone: string
  ):
    | { ok: true; challengeId: string }
    | { ok: false; reasonCode: 'otp_token_invalid_or_consumed' | 'tenant_mismatch' | 'phone_mismatch' } {
    const cleanPhone = cleanPhoneNumber(phone);
    const now = Date.now();
    for (const challenge of localChallenges.values()) {
      if (challenge.verificationToken !== token) {
        continue;
      }
      if (challenge.slug !== slug) {
        return { ok: false, reasonCode: 'tenant_mismatch' };
      }
      if (challenge.status !== 'verified' || challenge.expiresAt <= now) {
        return { ok: false, reasonCode: 'otp_token_invalid_or_consumed' };
      }
      if (cleanPhoneNumber(challenge.phone) !== cleanPhone) {
        return { ok: false, reasonCode: 'phone_mismatch' };
      }
      if (reservedChallengeIds.has(challenge.id)) {
        return { ok: false, reasonCode: 'otp_token_invalid_or_consumed' };
      }
      reservedChallengeIds.add(challenge.id);
      return { ok: true, challengeId: challenge.id };
    }
    return { ok: false, reasonCode: 'otp_token_invalid_or_consumed' };
  },

  /**
   * Commits local OTP token consumption strictly after appointment creation succeeds.
   */
  commitVerificationTokenConsumptionLocal(challengeId: string, token: string): boolean {
    const hasLock = reservedChallengeIds.has(challengeId);
    reservedChallengeIds.delete(challengeId);
    const challenge = localChallenges.get(challengeId);
    if (
      !hasLock ||
      !challenge ||
      challenge.verificationToken !== token ||
      challenge.status !== 'verified' ||
      challenge.expiresAt <= Date.now()
    ) {
      return false;
    }
    challenge.status = 'consumed';
    challenge.consumedAt = Date.now();
    return true;
  },

  /**
   * Releases an in-flight local OTP token reservation on booking failure (preserves verified status for retry).
   */
  releaseVerificationTokenReservationLocal(challengeId: string): void {
    reservedChallengeIds.delete(challengeId);
  },

  /**
   * Local verification token consumption helper for direct local calls.
   * Marks token as consumed atomically; subsequent calls fail closed.
   */
  consumeVerificationTokenLocal(token: string, slug: string, phone: string): boolean {
    const res = this.reserveVerificationTokenLocal(token, slug, phone);
    if (!res.ok) return false;
    return this.commitVerificationTokenConsumptionLocal(res.challengeId, token);
  },
};
