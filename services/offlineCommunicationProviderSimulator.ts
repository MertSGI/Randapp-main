import crypto from 'crypto';
import {
  OutboxIntent,
  DispatchAttempt,
  ProviderAcceptanceReceipt,
  ProviderDeliveryReceipt,
  CommunicationRetryPolicy,
  DEFAULT_RETRY_POLICY
} from '../types/communicationContracts';
import { CommunicationDeliveryService, CreateIntentInput } from './communicationDeliveryService';

export interface WebhookPayload {
  intentId: string;
  providerMessageId: string;
  tenantId: string;
  status: 'accepted' | 'delivered' | 'failed';
  timestamp: string;
  nonce: string;
  carrierMetadata?: Record<string, any>;
  errorCode?: string;
  errorMessage?: string;
}

export interface WebhookVerificationResult {
  valid: boolean;
  statusCode: number;
  error?: string;
  payload?: WebhookPayload;
}

export interface SimulatorConfig {
  webhookSecret: string;
  isSimulation: boolean;
  enabledChannels?: {
    sms?: boolean;
    whatsapp?: boolean;
    email?: boolean;
    in_app?: boolean;
  };
  replayWindowSeconds?: number;
}

export class OfflineCommunicationProviderSimulator {
  private deliveryService: CommunicationDeliveryService;
  private config: SimulatorConfig;
  private seenNonces: Set<string> = new Set();
  private networkCallCount: number = 0;

  constructor(
    deliveryService: CommunicationDeliveryService,
    config: Partial<SimulatorConfig> = {}
  ) {
    this.deliveryService = deliveryService;
    this.config = {
      webhookSecret: config.webhookSecret || 'sim_wh_secret_20261024_offline_only',
      isSimulation: config.isSimulation !== undefined ? config.isSimulation : true,
      enabledChannels: config.enabledChannels || {
        sms: true,
        whatsapp: true,
        email: true,
        in_app: true
      },
      replayWindowSeconds: config.replayWindowSeconds || 300 // 5 minutes
    };
  }

  getNetworkCallCount(): number {
    return this.networkCallCount;
  }

  // Create an HMAC SHA256 signature for a webhook payload
  signPayload(payloadString: string): string {
    return crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(payloadString, 'utf8')
      .digest('hex');
  }

  // Verify webhook signature, replay protection, and tenant context
  verifyAndProcessWebhook(
    rawBody: string,
    signatureHeader: string,
    expectedTenantId: string
  ): WebhookVerificationResult {
    // 1. Simulation mode check
    if (!this.config.isSimulation) {
      return { valid: false, statusCode: 403, error: 'SIMULATION_REQUIRED: Offline simulator requires simulation mode' };
    }

    // 2. Signature verification
    const expectedSignature = this.signPayload(rawBody);
    const signatureBuffer = Buffer.from(signatureHeader || '', 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return { valid: false, statusCode: 401, error: 'INVALID_SIGNATURE: Webhook signature does not match' };
    }

    // 3. Parse payload
    let payload: WebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { valid: false, statusCode: 400, error: 'POISON_PAYLOAD: Failed to parse webhook JSON' };
    }

    // 4. Replay attack verification (nonce and timestamp)
    if (this.seenNonces.has(payload.nonce)) {
      return { valid: false, statusCode: 409, error: 'REPLAY_REJECTED: Webhook nonce has already been processed' };
    }

    const payloadTime = new Date(payload.timestamp).getTime();
    const now = Date.now();
    const diffSeconds = Math.abs(now - payloadTime) / 1000;
    if (diffSeconds > (this.config.replayWindowSeconds || 300)) {
      return { valid: false, statusCode: 400, error: 'REPLAY_REJECTED: Webhook timestamp expired outside replay window' };
    }

    // 5. Tenant context mismatch verification
    if (payload.tenantId !== expectedTenantId) {
      return { valid: false, statusCode: 403, error: `TENANT_MISMATCH: Payload tenant ${payload.tenantId} does not match expected tenant ${expectedTenantId}` };
    }

    // 6. Record nonce
    this.seenNonces.add(payload.nonce);

    // 7. Process delivery transition
    if (payload.status === 'accepted') {
      const receipt: ProviderAcceptanceReceipt = {
        receiptId: `acc_${payload.nonce}`,
        intentId: payload.intentId,
        providerMessageId: payload.providerMessageId,
        providerName: 'offline_simulator',
        acceptedAt: payload.timestamp,
        signatureVerified: true
      };
      this.deliveryService.recordProviderAcceptance(receipt);
    } else if (payload.status === 'delivered') {
      const receipt: ProviderDeliveryReceipt = {
        receiptId: `del_${payload.nonce}`,
        intentId: payload.intentId,
        providerMessageId: payload.providerMessageId,
        providerName: 'offline_simulator',
        deliveredAt: payload.timestamp,
        signatureVerified: true,
        carrierMetadata: payload.carrierMetadata
      };
      this.deliveryService.recordProviderDelivery(receipt);
    } else if (payload.status === 'failed') {
      this.deliveryService.recordFailure({
        intentId: payload.intentId,
        failureType: 'PERMANENT',
        reason: payload.errorMessage || 'Provider delivery failure reported via webhook',
        code: payload.errorCode || 'PROVIDER_DELIVERY_FAILED',
        attemptCount: 1,
        terminal: true
      });
    }

    return { valid: true, statusCode: 200, payload };
  }

  // Simulated provider dispatch execution with scenario injectors
  async simulateDispatch(
    intentId: string,
    scenario?: {
      forceRateLimit?: boolean;
      retryAfterMs?: number;
      forceServerError?: boolean;
      forceInvalidRecipient?: boolean;
      forcePoisonPayload?: boolean;
      consecutiveFailuresBeforeSuccess?: number;
    }
  ): Promise<{
    success: boolean;
    attempts: DispatchAttempt[];
    intent: OutboxIntent;
    error?: string;
  }> {
    const intent = this.deliveryService.getIntent(intentId);
    if (!intent) {
      throw new Error(`Intent ${intentId} not found`);
    }

    // Zero Network I/O check: no fetch calls are made
    // Check channel configuration
    const isChannelEnabled = this.config.enabledChannels?.[intent.channel] ?? true;
    if (!isChannelEnabled) {
      this.deliveryService.recordFailure({
        intentId,
        failureType: 'CHANNEL_DISABLED',
        reason: `Channel '${intent.channel}' is currently disabled in simulator configuration`,
        code: 'CHANNEL_DISABLED',
        attemptCount: 1,
        terminal: true
      });
      return {
        success: false,
        attempts: this.deliveryService.getAttemptsForIntent(intentId),
        intent: this.deliveryService.getIntent(intentId)!,
        error: 'CHANNEL_DISABLED'
      };
    }

    // Consent check
    if (intent.status === 'skipped') {
      return {
        success: false,
        attempts: [],
        intent,
        error: 'CONSENT_DENIED: Message was skipped due to customer consent denial'
      };
    }

    // Scenario 4: Poison message / payload serialization check
    if (scenario?.forcePoisonPayload) {
      this.deliveryService.recordFailure({
        intentId,
        failureType: 'POISON_MESSAGE',
        reason: 'Payload serialization failed: illegal unescaped binary sequence',
        code: 'POISON_PAYLOAD',
        attemptCount: 1,
        terminal: true
      });
      return {
        success: false,
        attempts: this.deliveryService.getAttemptsForIntent(intentId),
        intent: this.deliveryService.getIntent(intentId)!,
        error: 'POISON_PAYLOAD'
      };
    }

    // Scenario 3: Permanent 4xx error (e.g. invalid phone number)
    if (scenario?.forceInvalidRecipient || !intent.recipient || intent.recipient === 'invalid_phone') {
      const attempt = this.deliveryService.recordDispatchAttempt({
        intentId,
        tenantId: intent.tenantId,
        providerName: 'offline_simulator',
        attemptNumber: 1,
        status: 'rejected',
        httpStatusCode: 400,
        errorCode: 'INVALID_RECIPIENT_NUMBER',
        errorMessage: 'The destination phone number is invalid or cannot receive messages'
      });

      this.deliveryService.recordFailure({
        intentId,
        failureType: 'PERMANENT',
        reason: 'Invalid recipient address format',
        code: 'INVALID_RECIPIENT_NUMBER',
        attemptCount: 1,
        terminal: true
      });

      return {
        success: false,
        attempts: [attempt],
        intent: this.deliveryService.getIntent(intentId)!,
        error: 'INVALID_RECIPIENT_NUMBER'
      };
    }

    // Multi-attempt loop with retry policy
    const retryPolicy = new CommunicationRetryPolicy(DEFAULT_RETRY_POLICY);
    let attemptsCount = 0;
    const maxAttempts = retryPolicy.maxAttempts;
    let consecutiveFailuresNeeded = scenario?.consecutiveFailuresBeforeSuccess || 0;

    while (attemptsCount < maxAttempts) {
      attemptsCount++;

      // Scenario 1: Rate limit 429
      if (scenario?.forceRateLimit && attemptsCount === 1) {
        const retryAfter = scenario.retryAfterMs || 5000;
        this.deliveryService.recordDispatchAttempt({
          intentId,
          tenantId: intent.tenantId,
          providerName: 'offline_simulator',
          attemptNumber: attemptsCount,
          status: 'failed',
          httpStatusCode: 429,
          errorCode: 'RATE_LIMIT_EXCEEDED',
          errorMessage: 'Too many requests; backoff requested',
          retryAfterMs: retryAfter
        });
        // On attempt 2, rate limit is cleared
        continue;
      }

      // Scenario 2 & 10: Server 5xx error
      if (scenario?.forceServerError || consecutiveFailuresNeeded > 0) {
        if (consecutiveFailuresNeeded > 0) consecutiveFailuresNeeded--;
        this.deliveryService.recordDispatchAttempt({
          intentId,
          tenantId: intent.tenantId,
          providerName: 'offline_simulator',
          attemptNumber: attemptsCount,
          status: 'failed',
          httpStatusCode: 503,
          errorCode: 'SERVICE_UNAVAILABLE',
          errorMessage: 'Transient upstream provider outage'
        });

        if (attemptsCount >= maxAttempts) {
          // Scenario 10: Retry exhaustion
          this.deliveryService.recordFailure({
            intentId,
            failureType: 'RETRY_EXHAUSTED',
            reason: `Dispatch retry exhausted after ${attemptsCount} attempts`,
            code: 'RETRY_EXHAUSTED',
            attemptCount: attemptsCount,
            terminal: true
          });
          return {
            success: false,
            attempts: this.deliveryService.getAttemptsForIntent(intentId),
            intent: this.deliveryService.getIntent(intentId)!,
            error: 'RETRY_EXHAUSTED'
          };
        }
        continue;
      }

      // Successful acceptance dispatch
      const providerMsgId = `prov_msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      this.deliveryService.recordDispatchAttempt({
        intentId,
        tenantId: intent.tenantId,
        providerName: 'offline_simulator',
        attemptNumber: attemptsCount,
        status: 'accepted',
        httpStatusCode: 200
      });

      this.deliveryService.recordProviderAcceptance({
        receiptId: `rcpt_acc_${providerMsgId}`,
        intentId,
        providerMessageId: providerMsgId,
        providerName: 'offline_simulator',
        acceptedAt: new Date().toISOString(),
        signatureVerified: true
      });

      return {
        success: true,
        attempts: this.deliveryService.getAttemptsForIntent(intentId),
        intent: this.deliveryService.getIntent(intentId)!
      };
    }

    return {
      success: false,
      attempts: this.deliveryService.getAttemptsForIntent(intentId),
      intent: this.deliveryService.getIntent(intentId)!,
      error: 'DISPATCH_LOOP_ENDED'
    };
  }
}
