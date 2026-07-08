import { PolicyAndConsentRepository } from './types';

export class LocalPolicyAndConsentRepository implements PolicyAndConsentRepository {
  private getStoredAcceptances(): any[] {
    const raw = localStorage.getItem('lari_policy_acceptances_v1');
    return raw ? JSON.parse(raw) : [];
  }

  private saveStoredAcceptances(list: any[]) {
    localStorage.setItem('lari_policy_acceptances_v1', JSON.stringify(list));
  }

  private getStoredConsents(): any[] {
    const raw = localStorage.getItem('lari_consent_ledger_v1');
    return raw ? JSON.parse(raw) : [];
  }

  private saveStoredConsents(list: any[]) {
    localStorage.setItem('lari_consent_ledger_v1', JSON.stringify(list));
  }

  async listAcceptances(tenantId?: string): Promise<any[]> {
    const list = this.getStoredAcceptances();
    if (tenantId) return list.filter(r => r.tenantId === tenantId);
    return list;
  }

  async createAcceptance(acceptance: any): Promise<any> {
    const list = this.getStoredAcceptances();
    const newRecord = {
      id: acceptance.id || `acpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId: acceptance.tenantId,
      actorType: acceptance.actorType,
      actorId: acceptance.actorId || 'anonymous_guest',
      actorDisplayName: acceptance.actorDisplayName,
      actorContact: acceptance.actorContact,
      documentType: acceptance.documentType,
      documentVersion: acceptance.documentVersion,
      acceptedAt: new Date().toISOString(),
      acceptanceSource: acceptance.acceptanceSource,
      ipAddress: acceptance.ipAddress,
      userAgent: acceptance.userAgent,
      locale: acceptance.locale,
      consentSnapshot: acceptance.consentSnapshot,
      metadata: acceptance.metadata || {},
      ...acceptance
    };
    list.push(newRecord);
    this.saveStoredAcceptances(list);
    return newRecord;
  }

  async listConsentRecords(tenantId?: string): Promise<any[]> {
    const list = this.getStoredConsents();
    if (tenantId) return list.filter(r => r.tenantId === tenantId);
    return list;
  }

  async createConsentRecord(consent: any): Promise<any> {
    const list = this.getStoredConsents();
    const newRecord = {
      id: consent.id || `cld_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId: consent.tenantId,
      actorType: consent.actorType,
      actorId: consent.actorId || 'anonymous',
      contact: consent.contact,
      consentType: consent.consentType,
      status: consent.status,
      source: consent.source,
      capturedAt: new Date().toISOString(),
      legalDocumentType: consent.legalDocumentType,
      legalDocumentVersion: consent.legalDocumentVersion,
      consentTextSnapshot: consent.consentTextSnapshot,
      metadata: consent.metadata || {},
      ...consent
    };
    list.unshift(newRecord);
    this.saveStoredConsents(list);
    return newRecord;
  }

  async updateConsentRecord(consentId: string, patch: any): Promise<void> {
    const list = this.getStoredConsents();
    const idx = list.findIndex(r => r.id === consentId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...patch };
      this.saveStoredConsents(list);
    }
  }
}
