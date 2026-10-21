import { PolicyAndConsentRepository } from './types';
import { fetchSupabase } from './supabaseClient';

export class SupabasePolicyAndConsentRepository implements PolicyAndConsentRepository {
  async listAcceptances(tenantId?: string): Promise<any[]> {
    let url = '/rest/v1/policy_acceptances?select=*';
    if (tenantId) {
      url += `&tenant_id=eq.${tenantId}`;
    }
    const res = await fetchSupabase(url);
    if (!res.ok) {
      throw new Error(`LEGAL_READ_FAILED: Failed to list policy acceptances from Supabase (HTTP ${res.status})`);
    }
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
      actorType: 'customer'
    }));
  }

  async createAcceptance(acceptance: any): Promise<any> {
    // Fail-closed: Direct browser/client table POST into policy_acceptances is revoked.
    // Untrusted clients cannot manufacture actorId, tenantId, ip_address or signature.
    throw new Error(
      'LEGAL_SERVER_WRITE_NOT_CONFIGURED: Direct client insert into policy_acceptances is revoked. Trusted server capability required.'
    );
  }

  async listConsentRecords(tenantId?: string): Promise<any[]> {
    let url = '/rest/v1/consent_ledger?select=*';
    if (tenantId) {
      url += `&tenant_id=eq.${tenantId}`;
    }
    const res = await fetchSupabase(url);
    if (!res.ok) {
      throw new Error(`LEGAL_READ_FAILED: Failed to list consent records from Supabase (HTTP ${res.status})`);
    }
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
  }

  async createConsentRecord(consent: any): Promise<any> {
    // Fail-closed: Direct browser/client table POST into consent_ledger is revoked.
    // Untrusted clients cannot manufacture actorId, tenantId, ip_address or signature.
    throw new Error(
      'LEGAL_SERVER_WRITE_NOT_CONFIGURED: Direct client insert into consent_ledger is revoked. Trusted server capability required.'
    );
  }

  async updateConsentRecord(consentId: string, patch: any): Promise<void> {
    // Fail-closed: Direct browser/client PATCH into consent_ledger is prohibited.
    // Consent ledger is an immutable append-only ledger; client-side status mutation is forbidden.
    throw new Error(
      'LEGAL_MUTATION_PROHIBITED: Direct client update on consent_ledger is prohibited. Append-only server ledger contract required.'
    );
  }
}
