import { AuditEventRepository } from './types';
import { fetchSupabase } from './supabaseClient';

export class SupabaseAuditEventRepository implements AuditEventRepository {
  async listEvents(tenantId?: string): Promise<any[]> {
    try {
      let url = '/rest/v1/audit_events?select=*';
      if (tenantId) {
        url += `&tenant_id=eq.${tenantId}`;
      }
      const res = await fetchSupabase(url);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((e: any) => ({
        id: e.id,
        tenantId: e.tenant_id,
        actorId: e.actor_id,
        actorType: e.actor_role,
        action: e.action,
        entityType: e.resource_type,
        entityId: e.resource_id,
        createdAt: e.created_at,
        category: e.payload?.category,
        severity: e.payload?.severity,
        summary: e.payload?.summary,
        safeDetails: e.payload?.safeDetails,
        metadata: e.payload?.metadata,
        correlationId: e.payload?.correlationId,
        requestId: e.payload?.requestId,
        status: e.payload?.status || 'recorded'
      }));
    } catch {
      return [];
    }
  }

  async createEvent(event: any): Promise<any> {
    try {
      const res = await fetchSupabase('/rest/v1/audit_events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({
          id: event.id,
          tenant_id: event.tenantId,
          actor_id: event.actorId || 'system',
          actor_role: event.actorType || 'system',
          action: event.action,
          resource_type: event.entityType || 'Generic',
          resource_id: event.entityId,
          payload: {
            category: event.category,
            severity: event.severity,
            summary: event.summary,
            safeDetails: event.safeDetails,
            metadata: event.metadata,
            correlationId: event.correlationId,
            requestId: event.requestId,
            status: event.status || 'recorded',
            redactionApplied: event.redactionApplied || false
          },
          created_at: event.createdAt || new Date().toISOString()
        })
      });

      if (!res.ok) throw new Error('Failed to create audit event in Supabase');
      const data = await res.json();
      const e = data[0];
      return {
        id: e.id,
        tenantId: e.tenant_id,
        actorId: e.actor_id,
        actorType: e.actor_role,
        action: e.action,
        entityType: e.resource_type,
        entityId: e.resource_id,
        createdAt: e.created_at,
        category: e.payload?.category,
        severity: e.payload?.severity,
        summary: e.payload?.summary,
        safeDetails: e.payload?.safeDetails,
        metadata: e.payload?.metadata,
        correlationId: e.payload?.correlationId,
        requestId: e.payload?.requestId,
        status: e.payload?.status
      };
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
}
