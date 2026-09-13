export interface OutboxMessage {
  id: string;
  tenantId: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'otp';
  recipientAddress: string;
  templateId: string;
  payload: Record<string, any>;
  idempotencyKey: string;
  status: 'queued' | 'processing' | 'sent_to_provider' | 'delivered' | 'failed_retryable' | 'failed_terminal' | 'dead_letter' | 'cancelled';
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastAttemptAt?: string;
  providerId?: string;
  providerMsgRef?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface ProviderSendResult {
  success: boolean;
  providerId: string;
  providerMsgRef?: string;
  isRetryable: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface DeliveryCallbackPayload {
  providerId: string;
  providerMsgRef: string;
  eventType: 'delivered' | 'rejected' | 'failed' | 'bounced' | 'complaint';
  eventTimestamp: string;
  replayToken: string;
  rawPayload?: string;
}

export type SimulatedOutcome = 'success' | 'retryable_failure' | 'terminal_failure' | 'timeout';

export interface DeterministicTestProviderOptions {
  fixedNow?: () => number;
  idGenerator?: (prefix: string) => string;
}

/**
 * Deterministic Local Test Communication Provider (EV057-R1 Hardened)
 * Injects deterministic clock, ID generator, and sequence.
 * Performs strictly NO_NETWORK_SEND.
 * Simulates provider states, deliveries, callbacks, replay protection, and out-of-order handling.
 */
export class DeterministicTestCommunicationProvider {
  private sentMessages: Map<string, { message: OutboxMessage; sentAt: string }> = new Map();
  private processedCallbacks: Map<string, string> = new Map(); // replayToken -> payloadHash
  private simulationMode: SimulatedOutcome = 'success';
  private sequenceCounter: number = 0;
  private readonly fixedNow: () => number;
  private readonly idGenerator: (prefix: string) => string;

  constructor(options?: DeterministicTestProviderOptions) {
    this.fixedNow = options?.fixedNow ?? (() => 1788988800000 + (this.sequenceCounter * 1000));
    this.idGenerator = options?.idGenerator ?? ((prefix: string) => `${prefix}_${++this.sequenceCounter}`);
  }

  public setSimulationMode(mode: SimulatedOutcome): void {
    this.simulationMode = mode;
  }

  public async sendMessage(message: OutboxMessage): Promise<ProviderSendResult> {
    const providerId = 'deterministic_test_provider';
    if (this.simulationMode === 'success') {
      const providerMsgRef = this.idGenerator(`test_msg_${message.id}`);
      const timestampIso = new Date(this.fixedNow()).toISOString();
      this.sentMessages.set(`${providerId}:${providerMsgRef}`, { message, sentAt: timestampIso });
      return {
        success: true,
        providerId,
        providerMsgRef,
        isRetryable: false
      };
    }

    if (this.simulationMode === 'retryable_failure') {
      return {
        success: false,
        providerId,
        isRetryable: true,
        errorCode: 'SIMULATED_TRANSIENT_503',
        errorMessage: 'Temporary rate limit or upstream timeout'
      };
    }

    if (this.simulationMode === 'terminal_failure') {
      return {
        success: false,
        providerId,
        isRetryable: false,
        errorCode: 'SIMULATED_REJECTED_400',
        errorMessage: 'Invalid destination phone or blacklisted recipient'
      };
    }

    // timeout
    return {
      success: false,
      providerId,
      isRetryable: true,
      errorCode: 'SIMULATED_TIMEOUT',
      errorMessage: 'Socket timeout waiting for simulated ACK'
    };
  }

  public simulateDeliveryCallback(
    providerMsgRef: string,
    eventType: DeliveryCallbackPayload['eventType'] = 'delivered',
    customTimestamp?: string,
    customPayload?: string
  ): DeliveryCallbackPayload {
    const providerId = 'deterministic_test_provider';
    const replayToken = this.idGenerator(`replay_${providerMsgRef}_${eventType}`);
    const eventTimestamp = customTimestamp ?? new Date(this.fixedNow()).toISOString();
    const rawPayload = customPayload ?? JSON.stringify({ providerId, providerMsgRef, eventType, timestamp: eventTimestamp });

    return {
      providerId,
      providerMsgRef,
      eventType,
      eventTimestamp,
      replayToken,
      rawPayload
    };
  }

  /**
   * Evaluates callback replay status:
   * Returns:
   * - 'NEW': first arrival
   * - 'DUPLICATE_EXACT': identical replay token + same payload
   * - 'EVENT_ID_PAYLOAD_MISMATCH': identical replay token + different payload digest
   */
  public evaluateCallbackReplay(replayToken: string, payloadHash: string): 'NEW' | 'DUPLICATE_EXACT' | 'EVENT_ID_PAYLOAD_MISMATCH' {
    if (!this.processedCallbacks.has(replayToken)) {
      this.processedCallbacks.set(replayToken, payloadHash);
      return 'NEW';
    }

    const existingHash = this.processedCallbacks.get(replayToken);
    if (existingHash === payloadHash) {
      return 'DUPLICATE_EXACT';
    }

    return 'EVENT_ID_PAYLOAD_MISMATCH';
  }

  public getSentMessageCount(): number {
    return this.sentMessages.size;
  }
}
