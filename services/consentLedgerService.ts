import { LegalDocumentType } from '../types';
import { auditLogService } from './auditLogService';
import { legalDocumentService } from './legalDocumentService';

const LEDGER_STORAGE_KEY = 'lari_consent_ledger_v1';
const CONSENT_STATUS_VALUES: ConsentStatusType[] = ['granted', 'denied', 'withdrawn', 'expired'];

export type ConsentStatusType = 'granted' | 'denied' | 'withdrawn' | 'expired';

export interface ConsentLedgerRecord {
  id: string;
  tenantId?: string;
  actorType: 'customer' | 'tenant_owner' | 'staff' | 'super_admin';
  actorId?: string;
  contact?: string; // Redacted or phone/email identifier
  consentType: string; // 'booking_transactional' | 'communication' | 'marketing' | 'referral_campaign' | 'media_staff_photo' | 'cookie_analytics' | 'data_export' | 'data_deletion' | 'consent_withdrawal'
  status: ConsentStatusType;
  source: string; // e.g. 'booking_page', 'registration_page', 'self_service_link', 'admin_dashboard'
  capturedAt: string;
  withdrawnAt?: string;
  legalDocumentType?: LegalDocumentType;
  legalDocumentVersion?: string;
  consentTextSnapshot?: string;
  metadata?: any;
}

export const consentLedgerService = {
  /**
   * Records a consent transaction to the ledger.
   */
  recordConsent(input: {
    tenantId?: string;
    actorType: 'customer' | 'tenant_owner' | 'staff' | 'super_admin';
    actorId?: string;
    contact?: string;
    consentType: string;
    status: ConsentStatusType;
    source: string;
    legalDocumentType?: LegalDocumentType;
    metadata?: any;
  }): ConsentLedgerRecord {
    const isBlank = (value?: string) => !value || value.trim().length === 0;
    const normalizedConsentType = input.consentType?.trim();
    const normalizedSource = input.source?.trim();
    const normalizedTenantId = input.tenantId?.trim();
    const normalizedActorId = input.actorId?.trim();

    if (!CONSENT_STATUS_VALUES.includes(input.status)) {
      throw new Error(`Invalid consent status: ${String(input.status)}`);
    }

    if (input.actorType === 'customer') {
      if (isBlank(normalizedTenantId) || isBlank(normalizedActorId) || isBlank(normalizedConsentType) || isBlank(normalizedSource)) {
        throw new Error('Customer consent requires tenantId, actorId, consentType, and source.');
      }
    }

    const ledger = this._getLedgerFromStore();
    const id = `cld_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Fetch matching legal document metadata if specified
    let version: string | undefined;
    let snapshot: string | undefined;
    if (input.legalDocumentType) {
      const doc = legalDocumentService.getActiveLegalDocument(input.legalDocumentType);
      if (doc) {
        version = doc.version;
        snapshot = `Title: ${doc.title}\nContent Summary: ${doc.summary}`;
      }
    }

    // Redact contact
    const safeContact = input.contact ? auditLogService.redactAuditPayload(input.contact) : undefined;

    const record: ConsentLedgerRecord = {
      id,
      tenantId: normalizedTenantId,
      actorType: input.actorType,
      actorId: normalizedActorId || 'anonymous',
      contact: safeContact,
      consentType: normalizedConsentType || input.consentType,
      status: input.status,
      source: normalizedSource || input.source,
      capturedAt: new Date().toISOString(),
      legalDocumentType: input.legalDocumentType,
      legalDocumentVersion: version,
      consentTextSnapshot: snapshot,
      metadata: input.metadata || {}
    };

    ledger.unshift(record); // newest first
    this._saveLedgerToStore(ledger);

    // Audit trail record
    auditLogService.logAuditEvent({
      tenantId: input.tenantId,
      actorType: input.actorType === 'tenant_owner' ? 'tenant_owner' : (input.actorType === 'super_admin' ? 'super_admin' : 'customer'),
      actorId: input.actorId,
      category: 'security',
      severity: 'info',
      action: 'consent_ledger_recorded',
      summary: `Rıza defteri kaydı oluşturuldu: ${input.consentType} -> ${input.status}`,
      safeDetails: {
        recordId: id,
        consentType: input.consentType,
        status: input.status,
        actorType: input.actorType,
        source: input.source,
        legalDocumentType: input.legalDocumentType,
        legalDocumentVersion: version
      }
    });

    return record;
  },

  /**
   * Queries records in the ledger with filters.
   */
  listConsentLedger(filters?: {
    tenantId?: string;
    actorId?: string;
    consentType?: string;
    status?: ConsentStatusType;
  }): ConsentLedgerRecord[] {
    const list = this._getLedgerFromStore();
    let filtered = [...list];

    if (filters) {
      if (filters.tenantId) {
        filtered = filtered.filter(r => r.tenantId === filters.tenantId);
      }
      if (filters.actorId) {
        filtered = filtered.filter(r => r.actorId === filters.actorId);
      }
      if (filters.consentType) {
        filtered = filtered.filter(r => r.consentType === filters.consentType);
      }
      if (filters.status) {
        filtered = filtered.filter(r => r.status === filters.status);
      }
    }

    return filtered;
  },

  /**
   * Withdraws (revokes) a consent by updating its status and logging the withdrawal timestamp.
   */
  withdrawConsent(actorId: string, consentType: string, reason: string = 'Kullanıcı talebi'): boolean {
    if (!actorId?.trim() || !consentType?.trim()) return false;
    const ledger = this._getLedgerFromStore();
    const normalizedActorId = actorId.trim();
    const normalizedConsentType = consentType.trim();
    const recordsForActorType = ledger.filter(r => r.actorId === normalizedActorId && r.consentType === normalizedConsentType);
    const tenantIds = new Set(
      recordsForActorType
        .map(r => r.tenantId?.trim())
        .filter((tenantId): tenantId is string => Boolean(tenantId))
    );

    if (tenantIds.size > 1) {
      console.warn('Consent withdrawal is ambiguous across multiple tenants for the same actorId and consentType.', {
        actorId: normalizedActorId,
        consentType: normalizedConsentType
      });
      return false;
    }

    const latestRecord = recordsForActorType[0];
    if (!latestRecord) return false;
    if (latestRecord.status === 'withdrawn') return false;

    if (latestRecord.status === 'granted') {
      const timestamp = new Date().toISOString();
      const withdrawalRecord: ConsentLedgerRecord = {
        id: `cld_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        tenantId: latestRecord.tenantId,
        actorType: latestRecord.actorType,
        actorId: latestRecord.actorId,
        contact: latestRecord.contact,
        consentType: latestRecord.consentType,
        status: 'withdrawn',
        source: latestRecord.source,
        capturedAt: timestamp,
        withdrawnAt: timestamp,
        legalDocumentType: latestRecord.legalDocumentType,
        legalDocumentVersion: latestRecord.legalDocumentVersion,
        consentTextSnapshot: latestRecord.consentTextSnapshot,
        metadata: {
          ...(latestRecord.metadata || {}),
          withdrawalReason: reason,
          supersedesRecordId: latestRecord.id
        }
      };

      ledger.unshift(withdrawalRecord);
      this._saveLedgerToStore(ledger);

      // Audit trail record
      auditLogService.logAuditEvent({
        tenantId: latestRecord.tenantId,
        actorType: latestRecord.actorType === 'tenant_owner' ? 'tenant_owner' : 'customer',
        actorId: latestRecord.actorId,
        category: 'security',
        severity: 'warning',
        action: 'consent_withdrawn',
        summary: `Rıza geri çekildi: ${normalizedConsentType}`,
        safeDetails: {
          recordId: withdrawalRecord.id,
          supersedesRecordId: latestRecord.id,
          consentType: normalizedConsentType,
          reason
        }
      });

      return true;
    }
    return false;
  },

  /**
   * Checks if a user has currently granted a specific consent.
   */
  hasConsent(actorId: string, consentType: string): boolean {
    const ledger = this._getLedgerFromStore();
    // Find latest record for actor and consent type
    const match = ledger.find(r => r.actorId === actorId && r.consentType === consentType);
    return match ? match.status === 'granted' : false;
  },

  /**
   * Alias method for checking active consent state (for QA contract compliance).
   */
  getConsentState(actorId: string, consentType: string): ConsentStatusType | null {
    const ledger = this._getLedgerFromStore();
    const match = ledger.find(r => r.actorId === actorId && r.consentType === consentType);
    return match ? match.status : null;
  },

  /**
   * Alias method for listing consent history (for QA contract compliance).
   */
  getConsentHistory(filters?: any): ConsentLedgerRecord[] {
    return this.listConsentLedger(filters);
  },

  /**
   * Returns a ledger count summary.
   */
  getConsentLedgerSummary() {
    const list = this._getLedgerFromStore();
    return {
      totalRecords: list.length,
      grantedCount: list.filter(r => r.status === 'granted').length,
      deniedCount: list.filter(r => r.status === 'denied').length,
      withdrawnCount: list.filter(r => r.status === 'withdrawn').length,
      byType: {
        booking_transactional: list.filter(r => r.consentType === 'booking_transactional').length,
        communication: list.filter(r => r.consentType === 'communication').length,
        marketing: list.filter(r => r.consentType === 'marketing').length,
        referral_campaign: list.filter(r => r.consentType === 'referral_campaign').length,
        media_staff_photo: list.filter(r => r.consentType === 'media_staff_photo').length,
        cookie_analytics: list.filter(r => r.consentType === 'cookie_analytics').length
      },
      immutableStorageMocked: true,
      futureIysSyncNeeded: true
    };
  },

  // Storage helpers
  _getLedgerFromStore(): ConsentLedgerRecord[] {
    try {
      if (typeof window === 'undefined') return [];
      const data = localStorage.getItem(LEDGER_STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  _saveLedgerToStore(list: ConsentLedgerRecord[]): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(list));
      }
    } catch (e) {
      console.error('Failed to write consent ledger to storage', e);
      throw new Error('Failed to persist consent ledger.');
    }
  }
};
