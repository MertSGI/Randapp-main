import { CommunicationOutboxRepository } from './types';
import { fetchSupabase } from './supabaseClient';

export class SupabaseCommunicationOutboxRepository implements CommunicationOutboxRepository {
  async listEvents(tenantId: string): Promise<any[]> {
    try {
      const res = await fetchSupabase(`/rest/v1/communication_outbox?tenant_id=eq.${tenantId}&select=*`);
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
    try {
      // Map 'in_app' or other channels to valid database channels if needed
      let dbChannel = event.channel;
      if (dbChannel !== 'sms' && dbChannel !== 'whatsapp' && dbChannel !== 'email') {
        dbChannel = 'sms'; // Default fallback
      }

      // Map queued/rendered etc to database statuses ('queued', 'sent', 'failed')
      let dbStatus = event.status;
      if (dbStatus === 'rendered' || dbStatus === 'queued' || dbStatus === 'skipped') {
        dbStatus = 'queued';
      } else if (dbStatus === 'sent') {
        dbStatus = 'sent';
      } else if (dbStatus === 'failed') {
        dbStatus = 'failed';
      } else {
        dbStatus = 'queued';
      }

      const res = await fetchSupabase('/rest/v1/communication_outbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({
          id: event.id,
          tenant_id: tenantId,
          recipient: event.recipient || event.customerId || 'unknown_recipient',
          channel: dbChannel,
          message: event.body || event.message || '',
          status: dbStatus,
          metadata: event.metadata || {},
          created_at: event.createdAt || new Date().toISOString(),
          updated_at: event.updatedAt || new Date().toISOString()
        })
      });

      if (!res.ok) {
        throw new Error('Failed to insert into communication_outbox');
      }

      const data = await res.json();
      const e = data[0];
      return {
        id: e.id,
        tenantId: e.tenant_id,
        recipient: e.recipient,
        channel: e.channel,
        body: e.message,
        status: e.status,
        metadata: e.metadata,
        createdAt: e.created_at,
        updatedAt: e.updated_at
      };
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async updateDeliveryStatus(tenantId: string, eventId: string, status: string, notes?: string): Promise<void> {
    try {
      let dbStatus = status;
      if (dbStatus !== 'queued' && dbStatus !== 'sent' && dbStatus !== 'failed') {
        dbStatus = 'queued';
      }

      const res = await fetchSupabase(`/rest/v1/communication_outbox?id=eq.${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: dbStatus,
          metadata: notes ? { failureReason: notes } : {},
          updated_at: new Date().toISOString()
        })
      });
      if (!res.ok) throw new Error('Failed to update communication_outbox');
    } catch (err) {
      console.error(err);
    }
  }
}
