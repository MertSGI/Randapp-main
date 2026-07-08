import { SupportTicketRepository } from './types';
import { fetchSupabase } from './supabaseClient';

export class SupabaseSupportTicketRepository implements SupportTicketRepository {
  async listTickets(tenantId?: string): Promise<any[]> {
    try {
      let url = '/rest/v1/support_tickets?select=*';
      if (tenantId) {
        url += `&tenant_id=eq.${tenantId}`;
      }
      const res = await fetchSupabase(url);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((t: any) => ({
        id: t.id,
        tenantId: t.tenant_id,
        title: t.subject,
        description: t.description,
        status: t.status,
        priority: t.priority,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        source: t.metadata?.source || 'system',
        category: t.metadata?.category || 'general'
      }));
    } catch {
      return [];
    }
  }

  async createTicket(ticket: any): Promise<any> {
    try {
      const res = await fetchSupabase('/rest/v1/support_tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({
          id: ticket.id,
          tenant_id: ticket.tenantId || 'system',
          subject: ticket.title || ticket.subject || 'Support Ticket',
          description: ticket.description || '',
          status: ticket.status || 'open',
          priority: ticket.priority || 'normal',
          created_at: ticket.createdAt || new Date().toISOString(),
          updated_at: ticket.updatedAt || new Date().toISOString()
        })
      });

      if (!res.ok) throw new Error('Failed to create support bilet in Supabase');
      const data = await res.json();
      const t = data[0];
      return {
        id: t.id,
        tenantId: t.tenant_id,
        title: t.subject,
        description: t.description,
        status: t.status,
        priority: t.priority,
        createdAt: t.created_at,
        updatedAt: t.updated_at
      };
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async updateTicket(ticketId: string, patch: any): Promise<any> {
    try {
      const body: any = {};
      if (patch.status !== undefined) body.status = patch.status;
      if (patch.priority !== undefined) body.priority = patch.priority;
      if (patch.title !== undefined) body.subject = patch.title;
      if (patch.description !== undefined) body.description = patch.description;
      body.updated_at = new Date().toISOString();

      const res = await fetchSupabase(`/rest/v1/support_tickets?id=eq.${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('Failed to update support bilet in Supabase');
      const data = await res.json();
      const t = data[0];
      return {
        id: t.id,
        tenantId: t.tenant_id,
        title: t.subject,
        description: t.description,
        status: t.status,
        priority: t.priority,
        createdAt: t.created_at,
        updatedAt: t.updated_at
      };
    } catch (err) {
      console.error(err);
      return null;
    }
  }
}
