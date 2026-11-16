import {
  OutboxIntent,
  DispatchAttempt,
  ProviderAcceptanceReceipt,
  ProviderDeliveryReceipt,
  DeliveryFailure,
  DeliveryState,
  CommunicationRetryPolicy,
  DEFAULT_RETRY_POLICY
} from '../types/communicationContracts';

export interface CreateIntentInput {
  intentId?: string;
  tenantId: string;
  branchId?: string;
  channel: 'sms' | 'whatsapp' | 'email' | 'in_app';
  recipient: string;
  templateId: string;
  templateArgs: Record<string, string | number>;
  subject?: string;
  body: string;
  consentGranted: boolean;
  consentDenialReason?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

export class CommunicationDeliveryService {
  private intents: Map<string, OutboxIntent> = new Map();
  private attempts: DispatchAttempt[] = [];
  private acceptanceReceipts: Map<string, ProviderAcceptanceReceipt> = new Map(); // keyed by intentId
  private deliveryReceipts: Map<string, ProviderDeliveryReceipt> = new Map(); // keyed by intentId
  private failures: DeliveryFailure[] = [];
  private consentDenialReasons: Map<string, string | undefined> = new Map();
  private rawIdempotencyKeys: Map<string, string | undefined> = new Map();
  private retryPolicy: CommunicationRetryPolicy;

  constructor(retryPolicy?: CommunicationRetryPolicy) {
    this.retryPolicy = retryPolicy || new CommunicationRetryPolicy(DEFAULT_RETRY_POLICY);
  }

  static isRetryableError(statusCode?: number, errorCode?: string): boolean {
    if (statusCode === 429) return true;
    if (statusCode && statusCode >= 500 && statusCode < 600) return true;
    const retryableCodes = new Set([
      'NETWORK_TIMEOUT',
      'CONNECTION_RESET',
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'GATEWAY_TIMEOUT',
      'SOCKET_TIMEOUT'
    ]);
    if (errorCode && retryableCodes.has(errorCode)) return true;
    return false;
  }

  // Canonical deep equality helper for deterministic payload comparison
  static canonicalEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a === null || a === undefined || b === null || b === undefined) {
      return a === b;
    }
    if (typeof a !== typeof b) {
      return false;
    }

    if (typeof a === 'number') {
      return Number.isNaN(a) && Number.isNaN(b) ? true : a === b;
    }

    if (typeof a !== 'object') {
      return a === b;
    }

    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b)) return false;
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.canonicalEqual(a[i], b[i])) return false;
      }
      return true;
    }

    if (a instanceof Date || b instanceof Date) {
      if (!(a instanceof Date) || !(b instanceof Date)) return false;
      return a.getTime() === b.getTime();
    }

    const keysA = Object.keys(a).filter(k => a[k] !== undefined).sort();
    const keysB = Object.keys(b).filter(k => b[k] !== undefined).sort();

    if (keysA.length !== keysB.length) return false;
    for (let i = 0; i < keysA.length; i++) {
      const key = keysA[i];
      if (key !== keysB[i]) return false;
      if (!this.canonicalEqual(a[key], b[key])) return false;
    }

    return true;
  }

  // PII scrubbing helper for logging and diagnostics
  static scrubPII(text: string): string {
    if (!text) return '';
    // Redact phone numbers (e.g., +905551234567 -> +90555***4567)
    let scrubbed = text.replace(/(\+?\d{2,3})?(\d{3})\d{4}(\d{2,4})/g, '$1$2****$3');
    // Redact email addresses (e.g., john.doe@example.com -> j***e@example.com)
    scrubbed = scrubbed.replace(/([a-zA-Z0-9_\-\.])[a-zA-Z0-9_\-\.]+([a-zA-Z0-9_\-\.])@([a-zA-Z0-9\-]+\.[a-zA-Z0-9\-.]+)/g, '$1***$2@$3');
    return scrubbed;
  }

  createIntent(input: CreateIntentInput): OutboxIntent {
    const intentId = input.intentId || `intent_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const idempotencyKey = input.idempotencyKey || `idem_${intentId}`;

    // Check if intent with this ID already exists
    const existing = this.intents.get(intentId);
    if (existing) {
      if (existing.tenantId !== input.tenantId) {
        throw new Error('Security violation: Intent ID collision across tenant boundaries (tenant mismatch).');
      }

      const existingConsentDenialReason = this.consentDenialReasons.has(intentId)
        ? this.consentDenialReasons.get(intentId)
        : existing.consentDenialReason;

      const existingRawIdempotencyKey = this.rawIdempotencyKeys.has(intentId)
        ? this.rawIdempotencyKeys.get(intentId)
        : existing.rawIdempotencyKey;

      const hasConflict =
        existing.channel !== input.channel ||
        existing.recipient !== input.recipient ||
        existing.templateId !== input.templateId ||
        existing.body !== input.body ||
        existing.consentVerified !== Boolean(input.consentGranted) ||
        (existing.branchId ?? undefined) !== (input.branchId ?? undefined) ||
        (existing.subject ?? undefined) !== (input.subject ?? undefined) ||
        (existingConsentDenialReason ?? undefined) !== (input.consentDenialReason ?? undefined) ||
        (existingRawIdempotencyKey ?? undefined) !== (input.idempotencyKey ?? undefined) ||
        existing.idempotencyKey !== idempotencyKey ||
        !CommunicationDeliveryService.canonicalEqual(existing.templateArgs, input.templateArgs) ||
        !CommunicationDeliveryService.canonicalEqual(existing.metadata || {}, input.metadata || {});

      if (hasConflict) {
        throw new Error(`Conflict error: Conflicting intent payload for existing intent ${intentId}.`);
      }

      return existing;
    }

    const now = new Date().toISOString();

    // Check consent: If consent is denied, intent transitions directly to 'skipped'
    let status: DeliveryState = 'rendered';
    let failureReason: string | undefined = undefined;

    if (!input.consentGranted) {
      status = 'skipped';
      failureReason = input.consentDenialReason || 'Customer consent not granted';
    }

    const intent: OutboxIntent = {
      intentId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      channel: input.channel,
      recipient: input.recipient,
      templateId: input.templateId,
      templateArgs: input.templateArgs,
      subject: input.subject,
      body: input.body,
      status,
      consentVerified: input.consentGranted,
      consentDenialReason: input.consentDenialReason,
      rawIdempotencyKey: input.idempotencyKey,
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
      failureReason,
      metadata: input.metadata || {}
    };

    this.consentDenialReasons.set(intentId, input.consentDenialReason);
    this.rawIdempotencyKeys.set(intentId, input.idempotencyKey);
    this.intents.set(intentId, intent);

    if (!input.consentGranted) {
      this.failures.push({
        intentId,
        failureType: 'CONSENT_DENIED',
        reason: failureReason!,
        code: 'CONSENT_DENIED',
        attemptCount: 0,
        terminal: true,
        timestamp: now
      });
    }

    return intent;
  }

  queueIntent(intentId: string): OutboxIntent {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new Error(`Intent ${intentId} not found`);
    }

    if (intent.status === 'skipped') {
      throw new Error(`Cannot queue skipped intent ${intentId}: consent was denied`);
    }

    if ((intent.status as string) === 'dead_letter') {
      throw new Error(`Cannot queue dead_letter intent ${intentId} without explicit administrative revival`);
    }

    if (intent.status !== 'rendered' && (intent.status as string) !== 'retry_scheduled') {
      throw new Error(`Cannot queue intent in status '${intent.status}'. Expected 'rendered' or 'retry_scheduled'`);
    }

    intent.status = 'queued';
    intent.updatedAt = new Date().toISOString();
    return intent;
  }

  recordDispatchAttempt(attempt: Omit<DispatchAttempt, 'attemptId' | 'timestamp'>): DispatchAttempt {
    const intent = this.intents.get(attempt.intentId);
    if (!intent) {
      throw new Error(`Intent ${attempt.intentId} not found`);
    }

    if (intent.tenantId !== attempt.tenantId) {
      throw new Error(`Tenant mismatch: intent belongs to ${intent.tenantId}, attempt specifies ${attempt.tenantId}`);
    }

    const newAttempt: DispatchAttempt = {
      ...attempt,
      attemptId: `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date().toISOString()
    };

    this.attempts.push(newAttempt);
    return newAttempt;
  }

  recordProviderAcceptance(receipt: ProviderAcceptanceReceipt): OutboxIntent {
    const intent = this.intents.get(receipt.intentId);
    if (!intent) {
      throw new Error(`Intent ${receipt.intentId} not found`);
    }

    if (!receipt.signatureVerified) {
      throw new Error(`Security violation: acceptance receipt signature verification failed for intent ${receipt.intentId}`);
    }

    // Tenant isolation: tenantId is strictly mandatory and must match intent.tenantId
    const receiptTenant = (receipt.tenantId || '').trim();
    if (!receiptTenant || receiptTenant !== intent.tenantId) {
      throw new Error(
        `Security violation: Tenant mismatch or missing tenant on acceptance receipt for intent ${receipt.intentId}. ` +
        `Expected tenant '${intent.tenantId}', received '${receipt.tenantId || ''}'`
      );
    }

    if (intent.status !== 'queued') {
      throw new Error(`Illegal state transition: cannot accept intent in '${intent.status}'. Expected 'queued'`);
    }

    this.acceptanceReceipts.set(receipt.intentId, receipt);
    intent.status = 'accepted_by_provider';
    intent.updatedAt = new Date().toISOString();
    return intent;
  }

  recordProviderDelivery(receipt: ProviderDeliveryReceipt): OutboxIntent {
    const intent = this.intents.get(receipt.intentId);
    if (!intent) {
      throw new Error(`Intent ${receipt.intentId} not found`);
    }

    // 1. Security Check: Verify provider callback signature BEFORE duplicate checking!
    // Prevents signature bypass on replayed or forged delivery callbacks.
    if (!receipt.signatureVerified) {
      throw new Error(`Security violation: delivery receipt signature verification failed for intent ${receipt.intentId}`);
    }

    // 1b. Tenant isolation: tenantId is strictly mandatory and must match intent.tenantId
    const receiptTenant = (receipt.tenantId || '').trim();
    if (!receiptTenant || receiptTenant !== intent.tenantId) {
      throw new Error(
        `Security violation: Tenant mismatch or missing tenant on delivery receipt for intent ${receipt.intentId}. ` +
        `Expected tenant '${intent.tenantId}', received '${receipt.tenantId || ''}'`
      );
    }

    // 2. Check duplicate delivery callback (idempotent ignore only for verified, non-conflicting replays)
    const existingReceipt = this.deliveryReceipts.get(receipt.intentId);
    if (existingReceipt) {
      const provMsgId = (receipt.providerMessageId || '').trim();
      const provName = (receipt.providerName || '').trim();
      const existMsgId = (existingReceipt.providerMessageId || '').trim();
      const existName = (existingReceipt.providerName || '').trim();

      if (!provMsgId || !provName || provMsgId !== existMsgId || provName !== existName) {
        throw new Error(
          `Conflict error: Conflicting delivery callback for intent ${receipt.intentId}. ` +
          `Expected provider '${existName}' / messageId '${existMsgId}', ` +
          `received '${provName}' / '${provMsgId}'.`
        );
      }
      return intent; // Idempotent return for verified legitimate duplicate
    }

    // 3. Out-of-order handling: if delivery arrives before acceptance, record acceptance synthetic receipt
    if (intent.status === 'queued') {
      this.acceptanceReceipts.set(receipt.intentId, {
        receiptId: `synth_acc_${receipt.receiptId}`,
        intentId: receipt.intentId,
        tenantId: intent.tenantId,
        providerMessageId: receipt.providerMessageId,
        providerName: receipt.providerName,
        acceptedAt: receipt.deliveredAt,
        signatureVerified: true,
        rawProviderStatus: 'synthesized_on_out_of_order_delivery'
      });
    } else if (intent.status !== 'accepted_by_provider') {
      throw new Error(`Illegal state transition: cannot deliver intent in status '${intent.status}'`);
    }

    this.deliveryReceipts.set(receipt.intentId, receipt);
    intent.status = 'delivered';
    intent.updatedAt = new Date().toISOString();
    return intent;
  }

  recordFailure(failure: Omit<DeliveryFailure, 'timestamp'>): OutboxIntent {
    const intent = this.intents.get(failure.intentId);
    if (!intent) {
      throw new Error(`Intent ${failure.intentId} not found`);
    }

    const fullFailure: DeliveryFailure = {
      ...failure,
      timestamp: new Date().toISOString()
    };
    this.failures.push(fullFailure);

    if (failure.terminal) {
      intent.status = 'failed';
      intent.failureReason = failure.reason;
      intent.updatedAt = new Date().toISOString();
    }

    return intent;
  }

  scheduleRetry(
    intentId: string,
    options?: {
      nextRetryAt?: string;
      delayMs?: number;
      reason?: string;
      retryCount?: number;
    }
  ): OutboxIntent {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new Error(`Intent ${intentId} not found`);
    }

    if (intent.status === 'delivered') {
      throw new Error(`Cannot schedule retry for intent ${intentId}: already delivered`);
    }

    if (intent.status === 'skipped') {
      throw new Error(`Cannot schedule retry for skipped intent ${intentId}: consent was denied`);
    }

    if ((intent.status as string) === 'dead_letter') {
      throw new Error(`Cannot schedule retry for dead_letter intent ${intentId}: terminal dead_letter state`);
    }

    const currentRetryCount = options?.retryCount !== undefined
      ? options.retryCount
      : (((intent as any).retryCount || (intent.metadata?.retryCount as number) || 0) + 1);

    let nextRetryAt = options?.nextRetryAt;
    if (!nextRetryAt) {
      const delay = options?.delayMs !== undefined
        ? options.delayMs
        : this.retryPolicy.calculateBackoff(currentRetryCount);
      nextRetryAt = new Date(Date.now() + delay).toISOString();
    }

    intent.status = 'retry_scheduled' as any;
    (intent as any).retryCount = currentRetryCount;
    (intent as any).nextRetryAt = nextRetryAt;
    intent.metadata = {
      ...(intent.metadata || {}),
      retryCount: currentRetryCount,
      nextRetryAt
    };
    if (options?.reason) {
      intent.failureReason = options.reason;
    }
    intent.updatedAt = new Date().toISOString();

    return intent;
  }

  moveToDeadLetter(
    intentId: string,
    reason: string,
    errorCode: string = 'DEAD_LETTER'
  ): OutboxIntent {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new Error(`Intent ${intentId} not found`);
    }

    if (intent.status === 'delivered') {
      throw new Error(`Cannot move intent ${intentId} to dead_letter: already delivered`);
    }

    if (intent.status === 'skipped') {
      throw new Error(`Cannot move skipped intent ${intentId} to dead_letter: consent was denied`);
    }

    const now = new Date().toISOString();
    intent.status = 'dead_letter' as any;
    intent.failureReason = reason;
    intent.metadata = {
      ...(intent.metadata || {}),
      deadLetterAt: now,
      deadLetterReason: reason
    };
    intent.updatedAt = now;

    this.failures.push({
      intentId,
      failureType: errorCode === 'POISON_MESSAGE' ? 'POISON_MESSAGE' : 'RETRY_EXHAUSTED',
      reason,
      code: errorCode,
      attemptCount: (intent as any).retryCount || this.attempts.filter(a => a.intentId === intentId).length,
      terminal: true,
      timestamp: now
    });

    return intent;
  }

  reviveDeadLetter(intentId: string, authorizedActorId: string): OutboxIntent {
    if (!authorizedActorId || !authorizedActorId.trim()) {
      throw new Error('Authorized actor ID is required to revive dead letter intent');
    }
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new Error(`Intent ${intentId} not found`);
    }
    if ((intent.status as string) !== 'dead_letter') {
      throw new Error(`Cannot revive intent ${intentId}: status is '${intent.status}', expected 'dead_letter'`);
    }

    if (!intent.consentVerified) {
      throw new Error(`Cannot revive dead_letter intent ${intentId}: customer consent was not verified (consentVerified=false)`);
    }

    intent.status = 'rendered';
    intent.failureReason = undefined;
    intent.metadata = {
      ...(intent.metadata || {}),
      revivedBy: authorizedActorId,
      revivedAt: new Date().toISOString()
    };
    intent.updatedAt = new Date().toISOString();
    return intent;
  }

  handleTransientFailure(
    intentId: string,
    error: {
      statusCode?: number;
      errorCode?: string;
      errorMessage?: string;
      retryAfterMs?: number;
      providerName?: string;
    }
  ): {
    intent: OutboxIntent;
    status: 'retry_scheduled' | 'dead_letter';
    nextRetryAt?: string;
    retryCount: number;
    backoffMs: number;
    terminal: boolean;
  } {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new Error(`Intent ${intentId} not found`);
    }

    const priorAttempts = this.getAttemptsForIntent(intentId);
    const attemptNumber = priorAttempts.length + 1;

    // Record the dispatch attempt
    this.recordDispatchAttempt({
      intentId,
      tenantId: intent.tenantId,
      providerName: error.providerName || 'external_provider',
      attemptNumber,
      status: 'failed',
      httpStatusCode: error.statusCode,
      errorCode: error.errorCode,
      errorMessage: error.errorMessage,
      retryAfterMs: error.retryAfterMs
    });

    const isRetryable = CommunicationDeliveryService.isRetryableError(error.statusCode, error.errorCode) ||
      this.retryPolicy.isRetryable(error.statusCode, error.errorCode);
    const maxAttempts = this.retryPolicy.maxAttempts;

    const reasonParts: string[] = [];
    if (error.errorCode) reasonParts.push(`[${error.errorCode}]`);
    if (error.statusCode) reasonParts.push(`HTTP ${error.statusCode}`);
    if (error.errorMessage) reasonParts.push(error.errorMessage);
    const detailedReason = reasonParts.join(' ') || (isRetryable ? 'Transient failure' : 'Permanent failure');

    if (isRetryable && attemptNumber < maxAttempts) {
      const backoffMs = this.retryPolicy.calculateBackoff(attemptNumber, error.retryAfterMs);
      const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
      const updatedIntent = this.scheduleRetry(intentId, {
        nextRetryAt,
        delayMs: backoffMs,
        reason: detailedReason,
        retryCount: attemptNumber
      });

      this.failures.push({
        intentId,
        failureType: error.statusCode === 429 ? 'RATE_LIMITED' : 'RETRYABLE',
        reason: detailedReason,
        code: error.errorCode || String(error.statusCode || 'TRANSIENT_ERROR'),
        attemptCount: attemptNumber,
        terminal: false,
        timestamp: new Date().toISOString()
      });

      return {
        intent: updatedIntent,
        status: 'retry_scheduled',
        nextRetryAt,
        retryCount: attemptNumber,
        backoffMs,
        terminal: false
      };
    } else {
      // Retry exhausted or non-retryable failure -> Move to dead_letter
      const reason = attemptNumber >= maxAttempts
        ? `Dispatch retry exhausted after ${attemptNumber} attempts: ${detailedReason}`
        : `Terminal delivery failure: ${detailedReason}`;
      const code = attemptNumber >= maxAttempts ? 'RETRY_EXHAUSTED' : (error.errorCode || 'PERMANENT_ERROR');
      const updatedIntent = this.moveToDeadLetter(intentId, reason, code);

      return {
        intent: updatedIntent,
        status: 'dead_letter',
        retryCount: attemptNumber,
        backoffMs: 0,
        terminal: true
      };
    }
  }

  getIntent(intentId: string): OutboxIntent | undefined {
    return this.intents.get(intentId);
  }

  listIntentsForTenant(tenantId: string): OutboxIntent[] {
    return Array.from(this.intents.values()).filter(i => i.tenantId === tenantId);
  }

  getAttemptsForIntent(intentId: string): DispatchAttempt[] {
    return this.attempts.filter(a => a.intentId === intentId);
  }

  getAcceptanceReceipt(intentId: string): ProviderAcceptanceReceipt | undefined {
    return this.acceptanceReceipts.get(intentId);
  }

  getDeliveryReceipt(intentId: string): ProviderDeliveryReceipt | undefined {
    return this.deliveryReceipts.get(intentId);
  }

  getFailuresForIntent(intentId: string): DeliveryFailure[] {
    return this.failures.filter(f => f.intentId === intentId);
  }
}
