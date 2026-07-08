import { PolicyAndConsentRepository } from './types';
import { fetchSupabase } from './supabaseClient';

export class SupabasePolicyAndConsentRepository implements PolicyAndConsentRepository {
  async listAcceptances(tenantId?: string): Promise<any[]> {
    try {
      let url = '/rest/v1/policy_acceptances?select=*';
      if (tenantId) {
        url += `&tenant_id=eq.${tenantId}`;
      }
      const res = await fetchSupabase(url);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        actorId: r.user_id,
        documentType: r.policy_type,
        documentVersion: r.version,
        ipAddress: r.ip_address,
        userAgent: r.user_agent,
        acceptedAt: r.accepted_at,
        actorType: 'customer' // Simplified
      }));
    } catch {
      return [];
    }
  }

  async createAcceptance(acceptance: any): Promise<any> {
    try {
      // Map document types to allowed DB types: 'terms', 'privacy_policy', 'kvkk_consent', 'cookie_policy'
      let dbPolicyType = acceptance.documentType;
      if (dbPolicyType === 'terms_of_service' || dbPolicyType === 'terms') {
        dbPolicyType = 'terms';
      } else if (dbPolicyType === 'privacy_policy') {
        dbPolicyType = 'privacy_policy';
      } else if (dbPolicyType === 'kvkk_consent' || dbPolicyType === 'kvkk') {
        dbPolicyType = 'kvkk_consent';
      } else {
        dbPolicyType = 'cookie_policy';
      }

      const res = await fetchSupabase('/rest/v1/policy_acceptances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({
          id: acceptance.id,
          tenant_id: acceptance.tenantId || 'system',
          user_id: acceptance.actorId || 'anonymous_guest',
          policy_type: dbPolicyType,
          version: acceptance.documentVersion || '1.0',
          ip_address: acceptance.ipAddress || '127.0.0.1',
          user_agent: acceptance.userAgent || 'Unknown Agent',
          accepted_at: acceptance.acceptedAt || new Date().toISOString()
        })
      });

      if (!res.ok) throw new Error('Failed to create policy acceptance in Supabase');
      const data = await res.json();
      const r = data[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        actorId: r.user_id,
        documentType: r.policy_type,
        documentVersion: r.version,
        ipAddress: r.ip_address,
        userAgent: r.user_agent,
        acceptedAt: r.accepted_at
      };
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async listConsentRecords(tenantId?: string): Promise<any[]> {
    try {
      let url = '/rest/v1/consent_ledger?select=*';
      if (tenantId) {
        url += `&tenant_id=eq.${tenantId}`;
      }
      const res = await fetchSupabase(url);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        actorId: r.customer_id,
        consentType: r.consent_type,
        status: r.is_granted ? 'granted' : 'denied',
        ipAddress: r.ip_address,
        digitalSignature: r.digital_signature,
        capturedAt: r.created_at,
        actorType: 'customer'
      }));
    } catch {
      return [];
    }
  }

  async createConsentRecord(consent: any): Promise<any> {
    try {
      const res = await fetchSupabase('/rest/v1/consent_ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({
          id: consent.id,
          tenant_id: consent.tenantId || 'system',
          customer_id: consent.actorId || 'anonymous',
          consent_type: consent.consentType,
          is_granted: consent.status === 'granted',
          ip_address: consent.ipAddress || '127.0.0.1',
          digital_signature: consent.digitalSignature || 'digital_signature',
          created_at: consent.capturedAt || new Date().toISOString()
        })
      });

      if (!res.ok) throw new Error('Failed to create consent ledger record in Supabase');
      const data = await res.json();
      const r = data[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        actorId: r.customer_id,
        consentType: r.consent_type,
        status: r.is_granted ? 'granted' : 'denied',
        ipAddress: r.ip_address,
        digitalSignature: r.digital_signature,
        capturedAt: r.created_at
      };
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async updateConsentRecord(consentId: string, patch: any): Promise<void> {
    try {
      const body: any = {};
      if (patch.status !== undefined) {
        body.is_granted = patch.status === 'granted';
      }
      if (patch.withdrawnAt !== undefined) {
        body.digital_signature = `withdrawn_at_${patch.withdrawnAt}`;
      }

      const res = await fetchSupabase(`/rest/v1/consent_ledger?id=eq.${consentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('Failed to update consent ledger in Supabase');
    } catch (err) {
      console.error(err);
    }
  }
}
