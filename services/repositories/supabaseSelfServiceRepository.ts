import { SelfServiceRepository } from './types';
import { fetchSupabase } from './supabaseClient';

export class SupabaseSelfServiceRepository implements SelfServiceRepository {
  async listTokens(tenantId: string): Promise<any[]> {
    try {
      const res = await fetchSupabase(`/rest/v1/appointment_access_tokens?tenant_id=eq.${tenantId}&select=*`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((t: any) => ({
        id: t.id,
        tenantId: t.tenant_id,
        appointmentId: t.appointment_id,
        tokenHash: t.token_hash,
        expiresAt: t.expires_at,
        createdAt: t.created_at,
        usedAt: t.used_at
      }));
    } catch {
      return [];
    }
  }

  async getTokenByHash(tokenHash: string): Promise<any | null> {
    try {
      const res = await fetchSupabase(`/rest/v1/appointment_access_tokens?token_hash=eq.${tokenHash}&select=*`);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data[0]) return null;
      const t = data[0];
      return {
        id: t.id,
        tenantId: t.tenant_id,
        appointmentId: t.appointment_id,
        tokenHash: t.token_hash,
        expiresAt: t.expires_at,
        createdAt: t.created_at,
        usedAt: t.used_at
      };
    } catch {
      return null;
    }
  }

  async createToken(tenantId: string, input: any): Promise<any> {
    try {
      const res = await fetchSupabase('/rest/v1/appointment_access_tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({
          id: input.id,
          tenant_id: tenantId,
          appointment_id: input.appointmentId,
          token_hash: input.tokenHash,
          expires_at: input.expiresAt,
          created_at: input.createdAt || new Date().toISOString(),
          used_at: input.usedAt
        })
      });
      if (!res.ok) throw new Error('Failed to create token in Supabase');
      const data = await res.json();
      const t = data[0];
      return {
        id: t.id,
        tenantId: t.tenant_id,
        appointmentId: t.appointment_id,
        tokenHash: t.token_hash,
        expiresAt: t.expires_at,
        createdAt: t.created_at,
        usedAt: t.used_at
      };
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async updateToken(tokenId: string, patch: any): Promise<void> {
    try {
      const body: any = {};
      if (patch.usedAt !== undefined) body.used_at = patch.usedAt;
      if (patch.expiresAt !== undefined) body.expires_at = patch.expiresAt;

      const res = await fetchSupabase(`/rest/v1/appointment_access_tokens?id=eq.${tokenId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('Failed to update token in Supabase');
    } catch (err) {
      console.error(err);
    }
  }

  async listChangeRequests(tenantId: string): Promise<any[]> {
    try {
      const res = await fetchSupabase(`/rest/v1/appointment_change_requests?tenant_id=eq.${tenantId}&select=*`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        appointmentId: r.appointment_id,
        requestType: r.request_type,
        requestedBy: r.requested_by,
        proposedDate: r.proposed_date,
        proposedTime: r.proposed_time,
        reason: r.reason,
        status: r.status,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
        resolvedBy: r.resolved_by
      }));
    } catch {
      return [];
    }
  }

  async createChangeRequest(tenantId: string, input: any): Promise<any> {
    try {
      const res = await fetchSupabase('/rest/v1/appointment_change_requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({
          id: input.id,
          tenant_id: tenantId,
          appointment_id: input.appointmentId,
          request_type: input.requestType,
          requested_by: input.requestedBy,
          proposed_date: input.proposedDate,
          proposed_time: input.proposedTime,
          reason: input.reason,
          status: input.status || 'pending',
          created_at: input.createdAt || new Date().toISOString()
        })
      });
      if (!res.ok) throw new Error('Failed to create change request in Supabase');
      const data = await res.json();
      const r = data[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        appointmentId: r.appointment_id,
        requestType: r.request_type,
        requestedBy: r.requested_by,
        proposedDate: r.proposed_date,
        proposedTime: r.proposed_time,
        reason: r.reason,
        status: r.status,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
        resolvedBy: r.resolved_by
      };
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async updateChangeRequest(requestId: string, patch: any): Promise<void> {
    try {
      const body: any = {};
      if (patch.status !== undefined) body.status = patch.status;
      if (patch.resolvedAt !== undefined) body.resolved_at = patch.resolvedAt;
      if (patch.resolvedBy !== undefined) body.resolved_by = patch.resolvedBy;

      const res = await fetchSupabase(`/rest/v1/appointment_change_requests?id=eq.${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('Failed to update change request in Supabase');
    } catch (err) {
      console.error(err);
    }
  }
}
