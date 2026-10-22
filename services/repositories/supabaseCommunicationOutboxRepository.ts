import { CommunicationOutboxRepository } from './types';
import { fetchSupabase } from './supabaseClient';

export class SupabaseCommunicationOutboxRepository implements CommunicationOutboxRepository {
  async listEvents(tenantId: string): Promise<any[]> {
    try {
      // Use sanitized tenant-scoped projection RPC (EV057-R3: raw outbox direct SELECT revoked)
      const res = await fetchSupabase(`/rest/v1/rpc/get_tenant_communication_outbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_tenant_id: tenantId, p_limit: 100, p_offset: 0 })
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((e: any) => ({
        id: e.id,
        tenantId: e.tenant_id,
        recipient: e.recipient,
        channel: e.channel,
        body: e.message,
        status: e.status,
        metadata: e.metadata,
        createdAt: e.created_at,
        updatedAt: e.updated_at
      }));
    } catch {
      return [];
    }
  }

  async enqueueEvent(tenantId: string, event: any): Promise<any> {
    // Fail closed: in_app channel cannot be silently converted to sms
    if (event?.channel === 'in_app') {
      throw {
        errorCode: 'UNSUPPORTED_COMMUNICATION_CHANNEL',
        message: 'The in_app channel is not supported for outbox queueing and cannot be converted to sms.'
      };
    }

    if (!event?.recipient || event.recipient === 'unknown_recipient') {
      throw {
        errorCode: 'INVALID_COMMUNICATION_RECIPIENT',
        message: 'Communication event recipient must be explicitly specified and cannot be unknown_recipient.'
      };
    }

    // Fail closed: Direct client POST to communication_outbox is REVOKED by database security model (20260918_phase3).
    // Outbox queueing requires server-side authority or server trigger.
    throw {
      errorCode: 'COMMUNICATION_SERVER_ENQUEUE_REQUIRED',
      message: 'Direct client insertion into communication_outbox is revoked. Server-side outbox enqueueing is required.'
    };
  }

  async updateDeliveryStatus(tenantId: string, eventId: string, status: string, notes?: string): Promise<void> {
    // Fail closed: Direct client PATCH to communication_outbox is REVOKED by database security model.
    // Delivery status updates require verified provider callback or webhook.
    throw {
      errorCode: 'COMMUNICATION_PROVIDER_CALLBACK_REQUIRED',
      message: 'Direct client modification of communication_outbox is revoked. Provider webhook callback is required.'
    };
  }
}
