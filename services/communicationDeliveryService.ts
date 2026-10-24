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
  private retryPolicy: CommunicationRetryPolicy;

  constructor(retryPolicy?: CommunicationRetryPolicy) {
    this.retryPolicy = retryPolicy || new CommunicationRetryPolicy(DEFAULT_RETRY_POLICY);
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
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
      failureReason,
      metadata: input.metadata || {}
    };

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

    if (intent.status !== 'rendered') {
      throw new Error(`Cannot queue intent in status '${intent.status}'. Expected 'rendered'`);
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

    if (intent.status !== 'queued') {
      throw new Error(`Illegal state transition: cannot accept intent in '${intent.status}'. Expected 'queued'`);
    }

    if (!receipt.signatureVerified) {
      throw new Error(`Security violation: acceptance receipt signature verification failed for intent ${receipt.intentId}`);
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

    // Check duplicate delivery callback (idempotent ignore)
    const existingReceipt = this.deliveryReceipts.get(receipt.intentId);
    if (existingReceipt) {
      return intent; // Idempotent return
    }

    if (!receipt.signatureVerified) {
      throw new Error(`Security violation: delivery receipt signature verification failed for intent ${receipt.intentId}`);
    }

    // Out-of-order handling: if delivery arrives before acceptance, record acceptance synthetic receipt
    if (intent.status === 'queued') {
      this.acceptanceReceipts.set(receipt.intentId, {
        receiptId: `synth_acc_${receipt.receiptId}`,
        intentId: receipt.intentId,
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
