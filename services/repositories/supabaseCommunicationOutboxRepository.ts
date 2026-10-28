import { CommunicationOutboxRepository } from './types';
import { fetchSupabase } from './supabaseClient';

export class SupabaseCommunicationOutboxRepository implements CommunicationOutboxRepository {
  async listEvents(tenantId: string): Promise<any[]> {
    try {
      const res = await fetchSupabase(`/rest/v1/communication_outbox?tenant_id=eq.${tenantId}&select=*`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((e: any) => {
        let status = e.status;
        if (e.metadata?.terminalStatus === 'skipped' || e.metadata?.skipped) {
          status = 'skipped';
        }
        return {
          id: e.id,
          tenantId: e.tenant_id,
          recipient: e.recipient,
          channel: e.channel,
          body: e.message,
          status,
          metadata: e.metadata,
          createdAt: e.created_at,
          updatedAt: e.updated_at
        };
      });
    } catch {
      return [];
    }
  }

  async enqueueEvent(tenantId: string, event: any): Promise<any> {
    // Defect E-2: Validate channel strictly instead of unsafe fallback to 'sms'
    const allowedChannels = ['sms', 'whatsapp', 'email'];
    if (!allowedChannels.includes(event.channel)) {
      throw new Error(`Unsupported communication channel for Supabase outbox: '${event.channel}'. Supported channels are: ${allowedChannels.join(', ')}`);
    }

    // Defect E-3: If event is skipped (e.g. consent denied), do NOT map to 'queued'.
    // Storing it as 'queued' would allow background dispatch workers to send it!
    // Instead, store with terminal status 'failed' and metadata.skipped = true so workers ignore it.
    let dbStatus: 'queued' | 'sent' | 'failed' = 'queued';
    let isSkipped = false;

    if (event.status === 'skipped') {
      dbStatus = 'failed';
      isSkipped = true;
    } else if (event.status === 'sent') {
      throw new Error("Cannot enqueue event directly as 'sent' without verified provider delivery receipt");
    } else if (event.status === 'failed') {
      dbStatus = 'failed';
    } else {
      dbStatus = 'queued';
    }

    const payloadMetadata = {
      ...(event.metadata || {}),
      ...(isSkipped ? { skipped: true, terminalStatus: 'skipped', failureReason: event.failureReason || 'SKIPPED_CONSENT_DENIED' } : {})
    };

    const res = await fetchSupabase('/rest/v1/communication_outbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        id: event.id,
        tenant_id: tenantId,
        recipient: event.recipient || event.customerId || 'unknown_recipient',
        channel: event.channel,
        message: event.body || event.message || '',
        status: dbStatus,
        metadata: payloadMetadata,
        created_at: event.createdAt || new Date().toISOString(),
        updated_at: event.updatedAt || new Date().toISOString()
      })
    });

    if (!res.ok) {
      throw new Error(`Failed to insert into communication_outbox: ${res.statusText}`);
    }

    const data = await res.json();
    const e = data[0];
    return {
      id: e.id,
      tenantId: e.tenant_id,
      recipient: e.recipient,
      channel: e.channel,
      body: e.message,
      status: isSkipped ? 'skipped' : e.status,
      metadata: e.metadata,
      createdAt: e.created_at,
      updatedAt: e.updated_at
    };
  }

  async updateDeliveryStatus(
    tenantId: string,
    eventId: string,
    status: string,
    notes?: string,
    options?: { verifiedProviderReceipt?: boolean }
  ): Promise<void> {
    // Defect E-4: Browser cannot fabricate sent or delivered status
    if (status === 'sent' || status === 'delivered') {
      throw new Error(`Browser client cannot assert delivery status '${status}' without verified provider receipt`);
    }

    let dbStatus = status;
    if (dbStatus !== 'queued' && dbStatus !== 'sent' && dbStatus !== 'failed') {
      dbStatus = 'queued';
    }

    // Defect E-5: Scope query by both id and tenant_id, and do not swallow errors
    const res = await fetchSupabase(`/rest/v1/communication_outbox?id=eq.${eventId}&tenant_id=eq.${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: dbStatus,
        metadata: notes ? { failureReason: notes } : {},
        updated_at: new Date().toISOString()
      })
    });

    if (!res.ok) {
      throw new Error(`Failed to update communication_outbox for tenant ${tenantId}, event ${eventId}: ${res.statusText}`);
    }
  }
}
