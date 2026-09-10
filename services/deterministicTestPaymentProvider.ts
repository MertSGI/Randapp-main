import type {
  PaymentProviderAdapter,
  VerifiedNormalizedPaymentEvent,
  PaymentIntentStatus
} from './paymentProviderContract.ts';

export type SimulatedPaymentOutcome =
  | 'success'
  | 'requires_action'
  | 'decline'
  | 'retryable_provider_failure'
  | 'terminal_provider_failure'
  | 'timeout';

export interface DeterministicPaymentProviderOptions {
  fixedNow?: () => number;
  idGenerator?: (prefix: string) => string;
}

/**
 * Deterministic Test Payment Provider
 * Performs strictly NO_NETWORK_SEND.
 * Simulates provider operations, webhook signatures, idempotency, event replays,
 * and out-of-order monotonic events using an injected clock and sequence generator.
 */
export class DeterministicTestPaymentProvider implements PaymentProviderAdapter {
  public readonly providerId: string = 'deterministic_test_payment_provider';

  private simulationMode: SimulatedPaymentOutcome = 'success';
  private sequenceCounter: number = 0;
  private readonly fixedNow: () => number;
  private readonly idGenerator: (prefix: string) => string;

  // Processed event tracking for duplicate & mismatch detection
  private processedEvents: Map<string, string> = new Map(); // providerEventId -> payloadHash

  constructor(options?: DeterministicPaymentProviderOptions) {
    this.fixedNow = options?.fixedNow ?? (() => 1788988800000 + (this.sequenceCounter * 1000));
    this.idGenerator = options?.idGenerator ?? ((prefix: string) => `${prefix}_${++this.sequenceCounter}`);
  }

  public setSimulationMode(mode: SimulatedPaymentOutcome): void {
    this.simulationMode = mode;
  }

  /**
   * Deterministic local signature verification.
   * Compares expected signature header with local test fixture.
   */
  public async verifyWebhook(headers: Record<string, string>, rawPayload: string): Promise<boolean> {
    const signature = headers['x-test-provider-signature'] || headers['X-Test-Provider-Signature'];
    if (!signature) {
      return false;
    }
    // Deterministic valid signature fixture: 'valid_test_signature'
    return signature === 'valid_test_signature';
  }

  /**
   * Normalizes raw verified payload into canonical provider-neutral structure.
   */
  public normalizeEvent(rawPayload: string): VerifiedNormalizedPaymentEvent {
    const parsed = JSON.parse(rawPayload);
    return {
      provider: this.providerId,
      providerEventId: parsed.providerEventId,
      eventType: parsed.eventType,
      eventTimestamp: parsed.eventTimestamp || new Date(this.fixedNow()).toISOString(),
      rawPayloadHash: parsed.rawPayloadHash || 'dummy_hash',
      intentId: parsed.intentId,
      providerReference: parsed.providerReference,
      status: parsed.status as PaymentIntentStatus,
      errorCode: parsed.errorCode,
      errorMessage: parsed.errorMessage
    };
  }

  /**
   * Simulates generation of an incoming webhook event.
   */
  public simulateWebhookEvent(
    intentId: string,
    outcome: SimulatedPaymentOutcome = this.simulationMode,
    customEventId?: string,
    customTimestamp?: string
  ): { headers: Record<string, string>; rawPayload: string } {
    const providerEventId = customEventId ?? this.idGenerator('evt_pay');
    const providerReference = this.idGenerator('ref_pay');
    const eventTimestamp = customTimestamp ?? new Date(this.fixedNow()).toISOString();

    let status: PaymentIntentStatus = 'succeeded';
    let errorCode: string | undefined;
    let errorMessage: string | undefined;

    if (outcome === 'requires_action') {
      status = 'requires_action';
    } else if (outcome === 'decline' || outcome === 'terminal_provider_failure') {
      status = 'failed';
      errorCode = 'CARD_DECLINED';
      errorMessage = 'The card was declined by the simulated issuer.';
    } else if (outcome === 'retryable_provider_failure') {
      status = 'failed';
      errorCode = 'TRANSIENT_NETWORK_TIMEOUT';
      errorMessage = 'Simulated transient connection failure.';
    }

    const payloadObj = {
      providerEventId,
      eventType: `payment.${status}`,
      eventTimestamp,
      intentId,
      providerReference,
      status,
      errorCode,
      errorMessage
    };

    const rawPayload = JSON.stringify(payloadObj);
    return {
      headers: {
        'x-test-provider-signature': 'valid_test_signature',
        'content-type': 'application/json'
      },
      rawPayload
    };
  }

  /**
   * Evaluates event replay status:
   * Returns:
   * - 'NEW': first arrival
   * - 'IDEMPOTENT_SUCCESS': identical providerEventId + matching payloadHash
   * - 'INTEGRITY_CONFLICT': identical providerEventId + different payloadHash
   */
  public evaluateEventReplay(providerEventId: string, payloadHash: string): 'NEW' | 'IDEMPOTENT_SUCCESS' | 'INTEGRITY_CONFLICT' {
    if (!this.processedEvents.has(providerEventId)) {
      this.processedEvents.set(providerEventId, payloadHash);
      return 'NEW';
    }

    const existingHash = this.processedEvents.get(providerEventId);
    if (existingHash === payloadHash) {
      return 'IDEMPOTENT_SUCCESS';
    }

    return 'INTEGRITY_CONFLICT';
  }
}
