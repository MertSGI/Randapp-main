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
  providerMsgRef?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface ProviderSendResult {
  success: boolean;
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

/**
 * Deterministic Local Test Communication Provider
 * Performs strictly NO_NETWORK_SEND.
 * Simulates provider states, deliveries, callbacks, and out-of-order deliveries.
 */
export class DeterministicTestCommunicationProvider {
  private sentMessages: Map<string, { message: OutboxMessage; sentAt: string }> = new Map();
  private processedCallbacks: Set<string> = new Set();
  private simulationMode: SimulatedOutcome = 'success';

  public setSimulationMode(mode: SimulatedOutcome): void {
    this.simulationMode = mode;
  }

  public async sendMessage(message: OutboxMessage): Promise<ProviderSendResult> {
    if (this.simulationMode === 'success') {
      const providerMsgRef = `test_msg_${message.id}_${Date.now()}`;
      this.sentMessages.set(providerMsgRef, { message, sentAt: new Date().toISOString() });
      return {
        success: true,
        providerMsgRef,
        isRetryable: false
      };
    }

    if (this.simulationMode === 'retryable_failure') {
      return {
        success: false,
        isRetryable: true,
        errorCode: 'SIMULATED_TRANSIENT_503',
        errorMessage: 'Temporary rate limit or upstream timeout'
      };
    }

    if (this.simulationMode === 'terminal_failure') {
      return {
        success: false,
        isRetryable: false,
        errorCode: 'SIMULATED_REJECTED_400',
        errorMessage: 'Invalid destination phone or blacklisted recipient'
      };
    }

    // timeout
    return {
      success: false,
      isRetryable: true,
      errorCode: 'SIMULATED_TIMEOUT',
      errorMessage: 'Socket timeout waiting for simulated ACK'
    };
  }

  public simulateDeliveryCallback(providerMsgRef: string, eventType: DeliveryCallbackPayload['eventType'] = 'delivered'): DeliveryCallbackPayload {
    const replayToken = `replay_${providerMsgRef}_${eventType}_${Date.now()}`;
    return {
      providerId: 'deterministic_test_provider',
      providerMsgRef,
      eventType,
      eventTimestamp: new Date().toISOString(),
      replayToken,
      rawPayload: JSON.stringify({ providerMsgRef, eventType, timestamp: Date.now() })
    };
  }

  public isCallbackReplay(replayToken: string): boolean {
    if (this.processedCallbacks.has(replayToken)) {
      return true;
    }
    this.processedCallbacks.add(replayToken);
    return false;
  }

  public getSentMessageCount(): number {
    return this.sentMessages.size;
  }
}
